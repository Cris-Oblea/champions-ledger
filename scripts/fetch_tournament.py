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
    python scripts/fetch_tournament.py --round 11            # pin a round
    python scripts/fetch_tournament.py --scrape              # ignore the export
    python scripts/fetch_tournament.py --no-teamlists        # standings only
"""
import os, re, sys, json, time, html, hashlib, urllib.parse, urllib.request

BASE = "https://www.pokedata.ovh/standingsVGC"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "data", "meta")
RAW = os.path.join(ROOT, "data", "raw", "tournaments")
TEAM_PHP = "https://www.pokedata.ovh/misc/team.php?team="

DEFAULT_TID = "0000191"          # 2026 Pokemon World Championships
DEFAULT_DIVISION = "masters"


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if attempt == 2:
                return None
            time.sleep(1.5 * (attempt + 1))


def round_info(tid, division):
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
    info = {"round_labels": labels or None}
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


def event_json(tid, division, rnd=None):
    """The site's own "Download JSON" export: the entire event in one request.

    Cached per round so a live event still picks up the newer file.
    """
    stem = "event_%s_%s_R%s.json" % (tid, division, rnd if rnd else "x")
    url = "%s/%s/%s/%s_%s.json" % (BASE, tid, division, tid, division.capitalize())
    body = cached(stem, url, timeout=120)
    if not body:
        return None
    try:
        rows = json.loads(body)
    except ValueError:
        return None
    return rows if isinstance(rows, list) and rows else None


def players_from_event(rows):
    """Reshape the export into the same records the rest of the project reads.

    The export writes the country into the name ("Takuma Yamazaki [JP]"), so it
    is split back out here - otherwise every listing prints the tag twice.
    `drop` is the round the player dropped in, or -1 for those who played to the
    end, which is more useful than the scrape's bare "dropped" flag.
    """
    players = []
    for r in rows:
        name = (r.get("name") or "").strip()
        country = None
        mc = re.match(r"^(.*?)\s*\[([A-Za-z]{2})\]$", name)
        if mc:
            name, country = mc.group(1).strip(), mc.group(2).upper()
        rec = r.get("record") or {}
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
            } for s in (r.get("decklist") or [])],
        })
    players.sort(key=lambda p: (p["rank"] is None, p["rank"]))
    return players


def latest_round(tid, division, start=20):
    """Rounds appear as they are played; walk down to the newest one present."""
    for n in range(start, 0, -1):
        body = get("%s/%s/%s/R%d.php" % (BASE, tid, division, n), timeout=90)
        if body and 'id="standings"' in body and "trow" in body:
            return n, body
    return None, None


def parse_standings(body):
    """One row per player: placement, record, and the team from the sprite tooltips."""
    players = []
    for row in re.split(r'<tr class="trow"', body)[1:]:
        country = None
        mc = re.search(r'id="([a-z]{2})"', row)
        if mc:
            country = mc.group(1).upper()
        mrank = re.search(r"<td><div id=\"\d+\">(\d+)</div></td>", row)
        mname = re.search(r'<button class="nb"[^>]*>([^<]+)</button>', row)
        if not (mrank and mname):
            continue
        name = html.unescape(mname.group(1)).strip()

        # The record cell has three shapes: "12-2-0", "12-2-0*" (still alive)
        # and "5-3-0&nbsp;&nbsp;<i>dropped</i>". Drop the match-history and
        # team cells first, or an opponent's record matches instead.
        stripped = re.sub(r'<div id="d\d+" class="run".*?</div>', "", row, flags=re.S)
        stripped = re.sub(r'<div class="dl".*?</div></td>', "", stripped, flags=re.S)
        record, dropped = None, False
        for cell in re.findall(r"<td>(.*?)</td>", stripped, flags=re.S):
            mrec = re.search(r"\d+-\d+-\d+", cell)
            if mrec:
                record = mrec.group(0)
                dropped = "dropped" in cell.lower()
                break

        teamfile = None
        # showTeam() escapes a quote inside the name: a player called
        # Cary D'Ortona arrives as Masters_Cary D\'Ortona.json, so stop the
        # match at ".json'" rather than at the first quote, then unescape.
        mf = re.search(r"showTeam\('(.+?\.json)'\)", row)
        if mf:
            teamfile = mf.group(1).replace(chr(92) + "'", "'")

        team = []
        for t in re.findall(r'<img[^>]*title="([^"]*)"', row):
            parts = [p.strip() for p in html.unescape(t).replace("&#10", "\n").split("\n")]
            parts = [p for p in parts if p]
            if not parts:
                continue
            entry = {"pokemon": parts[0], "ability": None, "item": None, "moves": []}
            for p in parts[1:]:
                if p.startswith("["):
                    try:
                        entry["moves"] = [m.strip(" '\"") for m in
                                          p.strip("[]").split(",") if m.strip(" '\"")]
                    except Exception:
                        pass
                elif entry["ability"] is None:
                    entry["ability"] = p
                elif entry["item"] is None:
                    entry["item"] = p
            team.append(entry)

        players.append({"rank": int(mrank.group(1)), "player": name,
                        "country": country, "record": record,
                        "dropped": dropped,
                        "team": team, "_teamfile": teamfile})
    players.sort(key=lambda p: p["rank"])
    return players


def cache_stem(path):
    """A filesystem-safe cache name that cannot collide.

    Sanitising alone is lossy: five Japanese Seniors all reduce to
    Seniors_____.__JP_.json, so the first one fetched would be served back as
    every other one's teamlist. The digest of the original path keeps them
    apart while the readable part stays readable.
    """
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", path)
    return "%s.%s" % (safe, hashlib.sha1(path.encode("utf-8")).hexdigest()[:8])


def cached(stem, url, timeout=45):
    """Fetch once, then serve from data/raw/tournaments on every later run."""
    path = os.path.join(RAW, stem)
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    body = get(url, timeout=timeout)
    if body:
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
    time.sleep(0.1)
    return body


def parse_team_html(body):
    """team.php renders one card per Pokemon: sprite, name, ability, item,
    nature, then the moves. Checked field-for-field against the JSON endpoint
    on players reachable both ways - it agrees on all six slots."""
    out = []
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


def enrich_with_teamlists(players, limit=None):
    """The per-player teamlist adds the nature, which the tooltip does not carry.

    The plain .json endpoint 404s for every player whose name is not ASCII, so
    those fall back to misc/team.php - the renderer the site's own showTeam()
    calls, which serves all of them.
    """
    todo = [p for p in players if p.get("_teamfile")]
    if limit:
        todo = todo[:limit]
    os.makedirs(RAW, exist_ok=True)
    done = fell_back = 0
    for p in todo:
        path = p["_teamfile"]
        stem = cache_stem(path)
        merged = []

        body = cached(stem, "https://www.pokedata.ovh/" + urllib.parse.quote(path, safe="/"))
        if body:
            try:
                rows = json.loads(body)
            except ValueError:
                rows = []
            merged = [{
                "pokemon": r.get("name"),
                "ability": r.get("ability"),
                "item": r.get("item"),
                "nature": r.get("stat_alignment"),
                "moves": r.get("badges") or [],
            } for r in rows]

        if not merged:
            hbody = cached(stem + ".html", TEAM_PHP + urllib.parse.quote(path, safe=""))
            if hbody:
                merged = parse_team_html(hbody)
                if merged:
                    fell_back += 1

        if merged:
            p["team"] = merged
            done += 1
            if done % 50 == 0:
                print("  teamlists %d/%d" % (done, len(todo)), flush=True)
    if fell_back:
        print("  %d of them via team.php (non-ASCII player name)" % fell_back)
    return done


def main():
    args = sys.argv[1:]

    def opt(flag, default=None):
        return args[args.index(flag) + 1] if flag in args else default

    tid = opt("--tid", DEFAULT_TID)
    division = opt("--division", DEFAULT_DIVISION)
    pinned = opt("--round")

    os.makedirs(RAW, exist_ok=True)
    info = round_info(tid, division)
    rnd = int(pinned) if pinned else info.get("round")

    players, origin = [], None
    if not pinned and "--scrape" not in args:
        rows = event_json(tid, division, rnd)
        if rows:
            players = players_from_event(rows)
            origin = "event JSON export"

    if not players:                      # older events publish no export
        if pinned or not rnd:
            body = get("%s/%s/%s/R%s.php" % (BASE, tid, division, rnd or 1),
                       timeout=90) if rnd else None
            if not body:
                rnd, body = latest_round(tid, division)
        else:
            body = get("%s/%s/%s/R%d.php" % (BASE, tid, division, rnd), timeout=90)
        if not body:
            sys.exit("No standings found for tid=%s division=%s" % (tid, division))
        players = parse_standings(body)
        origin = "per-round standings scrape"
        print("  %d players parsed" % len(players))
        if "--no-teamlists" not in args:
            n = enrich_with_teamlists(players)
            print("  %d teamlists merged (adds nature)" % n)
        for p in players:
            p.pop("_teamfile", None)

    label = info.get("round_label")
    print("Tournament %s / %s - round %s%s  [%s]"
          % (tid, division, rnd, " (%s)" % label if label else "", origin))
    if info.get("swiss_rounds"):
        print("  %d swiss rounds, then the cut: %s"
              % (info["swiss_rounds"],
                 ", ".join("%d=%s" % (n, l) for n, l in
                           sorted((info.get("round_labels") or {}).items())
                           if n > info["swiss_rounds"]) or "none yet"))
    print("  %s - %d players, %d teamlists, %d complete natures"
          % ("EVENT COMPLETE" if info.get("complete") else "still running",
             len(players), sum(1 for p in players if p["team"]),
             sum(1 for p in players if p["team"]
                 and all(s.get("nature") for s in p["team"]))))

    if "--no-teamlists" in args:
        for p in players:
            p["team"] = []

    out = {
        "source": "pokedata.ovh/standingsVGC",
        "origin": origin,
        "game": "Pokemon Champions",
        "tournament_id": tid,
        "division": division,
        "round": rnd,
        # The top cut keeps counting up from the last swiss round, so the number
        # alone cannot say whether the event is over. These two can.
        "round_label": label,
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
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("  wrote %s" % os.path.relpath(dest, ROOT))


if __name__ == "__main__":
    main()
