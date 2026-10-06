"""Fetch official tournament standings + full teamlists from pokedata.ovh.

This is the highest-signal data available: what actually got played, by whom,
and how it placed. Every entry carries ability, held item, nature and all four
moves, so it doubles as a set database for building counterplay.

The page itself is JavaScript-driven, but it loads plain endpoints:
    <tid>/<division>/<tid>_<Division>.json the whole event, one request
    <tid>/<division>/R<N>.php              standings table for round N
    <tid>/<division>/Masters_<player>.json one teamlist

**Use the event export, not the per-round scrape.** It is the file behind the
page's own "Download JSON" button and it is strictly better: one request instead
of 400, the final `placing` rather than a running rank, the round each player
dropped, and a nature on every slot. The per-round scrape is kept as a fallback
for events that do not publish the export - it cannot see the teamlists of
players whose name falls outside Latin-1, because those are stored per player
name and the file simply does not exist server-side.

**Round numbers are not swiss rounds.** The index page labels them, and the top
cut continues the same numbering: Masters ran 11 swiss rounds and then
12=TopCut, 13=T8, 14=T4, 15=Final. So "round 15" is the final, not an unfinished
swiss. `round_label` and `complete` in the output record which it is - read
those instead of comparing round numbers.

Outputs data/meta/tournament_<tid>_<division>.json

Usage:
    python scripts/fetch_tournament.py                       # Worlds 2026 Masters
    python scripts/fetch_tournament.py --division seniors
    python scripts/fetch_tournament.py --division juniors
    python scripts/fetch_tournament.py --tid 0000191 --division masters
"""
import contextlib
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.parse
from typing import Any

import dex
import net
from paths import META, ROOT, TOURNAMENTS

BASE = "https://www.pokedata.ovh/standingsVGC"
TEAM_PHP = "https://www.pokedata.ovh/misc/team.php?team="

DEFAULT_DIVISION = "masters"


def get(url: str, timeout: float = 60) -> str | None:
    """A page's text, or None when it fails."""
    try:
        return net.text(url, timeout=timeout)
    except net.ERRORS:
        return None


def round_info(tid: str, division: str) -> dict[str, Any]:
    """What the index page says about where the event stands.

    The round buttons are labelled, and the labels are the only thing that
    distinguishes a swiss round from the bracket: Masters numbers the top cut
    12=TopCut, 13=T8, 14=T4, 15=Final straight on from 11 swiss rounds. The
    header also carries how many tables are still playing, which is what
    actually says whether the event has finished.
    """
    body = get("%s/%s/%s/" % (BASE, tid, division), timeout=60)
    if not body:
        return {}
    labels = {int(n): html.unescape(t).strip()
              for n, t in re.findall(
                  r'onclick="showRound\((\d+)\)">([^<]+)</button>', body)}
    info: dict[str, Any] = {"round_labels": labels or None}
    mh = re.search(r"<h2>(\d+) players - Round (\d+)/(\d+)"
                   r"[^<]*?Tables Still Playing\s*:\s*(\d+)", body)
    if mh:
        info["players_reported"] = int(mh.group(1))
        info["round"] = int(mh.group(2))
        info["swiss_rounds"] = int(mh.group(3))
        info["still_playing"] = int(mh.group(4))
    else:                       # header shape changed; the buttons still work
        mo = re.search(r'onload="showRound\((\d+)\)"', body)
        if mo:
            info["round"] = int(mo.group(1))
    rnd = info.get("round")
    info["round_label"] = labels.get(rnd) if rnd else None
    info["complete"] = (info.get("still_playing") == 0
                        and str(info.get("round_label", "")).lower() == "final")
    return info


def event_json(tid: str, division: str,
               rnd: int | None = None) -> list[dict[str, Any]] | None:
    """The site's own "Download JSON" export: the entire event in one request.

    Cached per round so a live event still picks up the newer file.
    """
    stem = "event_%s_%s_R%s.json" % (tid, division, rnd or "x")
    url = "%s/%s/%s/%s_%s.json" % (BASE, tid, division, tid, division.capitalize())
    body = cached(stem, url, timeout=120)
    if not body:
        return None
    try:
        rows = json.loads(body)
    except ValueError:
        return None
    return rows if dex.is_arr(rows) and rows else None


def players_from_event(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reshape the export into the same records the rest of the project reads.

    The export writes the country into the name ("Takuma Yamazaki [JP]"), so it
    is split back out here - otherwise every listing prints the tag twice.
    `drop` is the round the player dropped in, or -1 for those who played to the
    end, which is more useful than the scrape's bare "dropped" flag.
    """
    players: list[dict[str, Any]] = []
    for r in rows:
        name = (r.get("name") or "").strip()
        country = None
        mc = re.match(r"^(.*?)\s*\[([A-Za-z]{2})\]$", name)
        if mc:
            name, country = mc.group(1).strip(), mc.group(2).upper()
        rec: dict[str, Any] = r.get("record") or {}
        record = None
        if rec:
            record = "%s-%s-%s" % (rec.get("wins", 0), rec.get("losses", 0),
                                   rec.get("ties", 0))
        drop = r.get("drop", -1)
        players.append({
            "rank": r.get("placing"),
            "player": name,
            "country": country,
            "record": record,
            "dropped": drop not in (-1, None),
            "dropped_round": drop if drop not in (-1, None) else None,
            "trainer_name": r.get("Trainer name") or None,
            "team": [{
                "pokemon": s.get("name"),
                "ability": s.get("ability"),
                "item": s.get("item"),
                "nature": s.get("stat_alignment"),
                "moves": s.get("badges") or [],
            } for s in (r.get("decklist") or ())],
        })
    players.sort(key=lambda p: (p["rank"] is None, p["rank"]))
    return players


def latest_round(tid: str, division: str) -> tuple[int, str] | tuple[None, None]:
    """Rounds appear as they are played; walk down from 20 to the newest one
    present."""
    for n in range(20, 0, -1):
        body = get("%s/%s/%s/R%d.php" % (BASE, tid, division, n), timeout=90)
        if body and 'id="standings"' in body and "trow" in body:
            return n, body
    return None, None


def _row_record(row: str) -> tuple[str | None, bool]:
    """(record, dropped) from a standings row.

    The record cell has three shapes: "12-2-0", "12-2-0*" (still alive)
    and "5-3-0&nbsp;&nbsp;<i>dropped</i>". Drop the match-history and
    team cells first, or an opponent's record matches instead.
    """
    stripped = re.sub(r'<div id="d\d+" class="run".*?</div>', "", row, flags=re.S)
    stripped = re.sub(r'<div class="dl".*?</div></td>', "", stripped, flags=re.S)
    for cell in re.findall(r"<td>(.*?)</td>", stripped, flags=re.S):
        mrec = re.search(r"\d+-\d+-\d+", cell)
        if mrec:
            return mrec.group(0), "dropped" in cell.lower()
    return None, False


def _row_teamfile(row: str) -> str | None:
    """showTeam() escapes a quote inside the name: a player called
    Cary D'Ortona arrives as Masters_Cary D\\'Ortona.json, so stop the
    match at ".json'" rather than at the first quote, then unescape."""
    mf = re.search(r"showTeam\('(.+?\.json)'\)", row)
    return mf.group(1).replace(chr(92) + "'", "'") if mf else None


def _tooltip_slot(t: str) -> dict[str, Any] | None:
    """One sprite tooltip: the Pokemon, then its ability, item and moves."""
    parts = [p.strip() for p in html.unescape(t).replace("&#10", "\n").split("\n")]
    parts = [p for p in parts if p]
    if not parts:
        return None
    entry: dict[str, Any] = {"pokemon": parts[0], "ability": None, "item": None,
                             "moves": []}
    for p in parts[1:]:
        if p.startswith("["):
            with contextlib.suppress(Exception):
                entry["moves"] = [m.strip(" '\"") for m in
                                  p.strip("[]").split(",") if m.strip(" '\"")]
        elif entry["ability"] is None:
            entry["ability"] = p
        elif entry["item"] is None:
            entry["item"] = p
    return entry


def parse_standings(body: str) -> list[dict[str, Any]]:
    """One row per player: placement, record, and the team from the sprite tooltips."""
    players: list[dict[str, Any]] = []
    for row in re.split(r'<tr class="trow"', body)[1:]:
        mc = re.search(r'id="([a-z]{2})"', row)
        mrank = re.search(r"<td><div id=\"\d+\">(\d+)</div></td>", row)
        mname = re.search(r'<button class="nb"[^>]*>([^<]+)</button>', row)
        if not (mrank and mname):
            continue
        record, dropped = _row_record(row)
        team = [e for e in map(_tooltip_slot, re.findall(r'<img[^>]*title="([^"]*)"', row))
                if e]
        players.append({"rank": int(mrank.group(1)),
                        "player": html.unescape(mname.group(1)).strip(),
                        "country": mc.group(1).upper() if mc else None,
                        "record": record, "dropped": dropped,
                        "team": team, "_teamfile": _row_teamfile(row)})
    players.sort(key=lambda p: p["rank"])
    return players


def cache_stem(path: str) -> str:
    """A filesystem-safe cache name that cannot collide.

    Sanitising alone is lossy: five Japanese Seniors all reduce to
    Seniors_____.__JP_.json, so the first one fetched would be served back as
    every other one's teamlist. The digest of the original path keeps them
    apart while the readable part stays readable.
    """
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", path)
    return "%s.%s" % (safe, hashlib.sha1(path.encode("utf-8")).hexdigest()[:8])


def cached(stem: str, url: str, timeout: float = 45) -> str | None:
    """Fetch once, then serve from data/raw/tournaments on every later run."""
    path = os.path.join(TOURNAMENTS, stem)
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    body = get(url, timeout=timeout)
    if body:
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
    time.sleep(0.1)
    return body


def parse_team_html(body: str) -> list[dict[str, Any]]:
    """team.php renders one card per Pokemon: sprite, name, ability, item,
    nature, then the moves. Checked field-for-field against the JSON endpoint
    on players reachable both ways - it agrees on all six slots."""
    out: list[dict[str, Any]] = []
    for card in re.split(r'src="[^"]*sprites/pokemon/', body)[1:]:
        texts = [html.unescape(t).strip() for t in
                 re.findall(r'text-align: left;[^"]*">\s*([^<]*?)\s*</div>', card)]
        texts = [t for t in texts if t]
        if not texts:
            continue
        # The nature sits in the one cell with that padding pair; the item is
        # only present when an item sprite precedes it.
        mnat = re.search(r'padding-top:15px; padding-left:5px;">\s*([^<]*?)\s*</div>', card)
        has_item = re.search(r'src="[^"]*items/', card) is not None
        out.append({
            "pokemon": texts[0],
            "ability": texts[1] if len(texts) > 1 else None,
            "item": texts[2] if has_item and len(texts) > 2 else None,
            "nature": html.unescape(mnat.group(1)).strip() if mnat else None,
            "moves": [html.unescape(m).strip() for m in
                      re.findall(r'padding-left:35px;">([^<]*)</div>', card)][:4],
        })
    return out


def _team_from_json(body: str) -> list[dict[str, Any]]:
    """One player's team from pokedata's teamlist JSON."""
    try:
        rows: list[dex.Row] = json.loads(body)
    except ValueError:
        rows = []
    return [{
        "pokemon": r.get("name"),
        "ability": r.get("ability"),
        "item": r.get("item"),
        "nature": r.get("stat_alignment"),
        "moves": r.get("badges") or [],
    } for r in rows]


def _player_team(path: str) -> tuple[list[dict[str, Any]], bool]:
    """(the teamlist, whether it came from team.php) for one player's file."""
    stem = cache_stem(path)
    body = cached(stem, "https://www.pokedata.ovh/" + urllib.parse.quote(path, safe="/"))
    merged = _team_from_json(body) if body else []
    if merged:
        return merged, False
    hbody = cached(stem + ".html", TEAM_PHP + urllib.parse.quote(path, safe=""))
    merged = parse_team_html(hbody) if hbody else []
    return merged, bool(merged)


def enrich_with_teamlists(players: list[dict[str, Any]]) -> int:
    """The per-player teamlist adds the nature, which the tooltip does not carry.

    The plain .json endpoint 404s for every player whose name is not ASCII, so
    those fall back to misc/team.php - the renderer the site's own showTeam()
    calls, which serves all of them.
    """
    todo = [p for p in players if p.get("_teamfile")]
    os.makedirs(TOURNAMENTS, exist_ok=True)
    done = fell_back = 0
    for p in todo:
        merged, via_php = _player_team(p["_teamfile"])
        fell_back += via_php
        if merged:
            p["team"] = merged
            done += 1
            if done % 50 == 0:
                print("  teamlists %d/%d" % (done, len(todo)), flush=True)
    if fell_back:
        print("  %d of them via team.php (non-ASCII player name)" % fell_back)
    return done


def _scrape(tid: str, division: str,
            rnd: int | None) -> tuple[list[dict[str, Any]], int | None]:
    """(players, the round) from the per-round standings pages - the route for
    the older events that publish no JSON export."""
    if rnd:
        body = get("%s/%s/%s/R%d.php" % (BASE, tid, division, rnd), timeout=90)
    else:
        rnd, body = latest_round(tid, division)
    if not body:
        sys.exit("No standings found for tid=%s division=%s" % (tid, division))
    players = parse_standings(body)
    print("  %d players parsed" % len(players))
    n = enrich_with_teamlists(players)
    print("  %d teamlists merged (adds nature)" % n)
    for p in players:
        p.pop("_teamfile", None)
    return players, rnd


def _print_summary(tid: str, division: str, rnd: int | None, info: dict[str, Any],
                   origin: str, players: list[dict[str, Any]]) -> None:
    """The event, round (with its label), swiss rounds, players and teamlist
    count.
    """
    label = info.get("round_label")
    print("Tournament %s / %s - round %s%s  [%s]"
          % (tid, division, rnd, " (%s)" % label if label else "", origin))
    if info.get("swiss_rounds"):
        labels: dict[int, str] = info.get("round_labels") or {}
        print("  %d swiss rounds, then the cut: %s"
              % (info["swiss_rounds"],
                 ", ".join("%d=%s" % (n, name) for n, name in
                           sorted(labels.items())
                           if n > info["swiss_rounds"]) or "none yet"))
    print("  %s - %d players, %d teamlists, %d complete natures"
          % ("EVENT COMPLETE" if info.get("complete") else "still running",
             len(players), sum(1 for p in players if p["team"]),
             sum(1 for p in players if p["team"]
                 and all(s.get("nature") for s in p["team"]))))


def main() -> None:
    """Fetch one division of one event (--tid, --division), with every player's
    teamlist, and write it to data/meta.
    """
    args = sys.argv[1:]

    def opt(flag: str, default: str) -> str:
        """The value after a flag, or the default."""
        return args[args.index(flag) + 1] if flag in args else default

    tid = opt("--tid", dex.WORLDS_TID)
    division = opt("--division", DEFAULT_DIVISION)

    os.makedirs(TOURNAMENTS, exist_ok=True)
    info = round_info(tid, division)
    rnd = info.get("round")

    rows = event_json(tid, division, rnd)
    players = players_from_event(rows) if rows else []
    origin = "event JSON export"
    if not players:                      # older events publish no export
        players, rnd = _scrape(tid, division, rnd)
        origin = "per-round standings scrape"

    _print_summary(tid, division, rnd, info, origin, players)

    out = {
        "source": "pokedata.ovh/standingsVGC",
        "origin": origin,
        "game": "Pokemon Champions",
        "tournament_id": tid,
        "division": division,
        "round": rnd,
        # The top cut keeps counting up from the last swiss round, so the number
        # alone cannot say whether the event is over. These two can.
        "round_label": info.get("round_label"),
        "swiss_rounds": info.get("swiss_rounds"),
        "round_labels": info.get("round_labels"),
        "complete": info.get("complete"),
        "fetched": time.strftime("%Y-%m-%d %H:%M"),
        "note": "Unofficial standings computed outside the tournament software.",
        "count": len(players),
        "players": players,
    }
    os.makedirs(META, exist_ok=True)
    dest = os.path.join(META, "tournament_%s_%s.json" % (tid, division))
    out["fetched"] = dex.kept_stamp(dest, out)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("  wrote %s" % os.path.relpath(dest, ROOT))


if __name__ == "__main__":
    main()
