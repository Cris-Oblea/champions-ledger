#!/usr/bin/env python3
"""Every VGC World Championship pokedata publishes, as a permanent record.

Why this is separate from fetch_tournament.py, which pulls the CURRENT event:

    A Worlds is run once, under one regulation, and then it is frozen. Worlds
    2026 was played under Regulation M-B; the ladder has since moved to M-C and
    will keep moving. So the 2026 teamlists stop being "what the field plays"
    and become "what the field played in August 2026" - still worth having, but
    as history, never as today's usage. (player, 2026-09-11)

    Read that way a whole archive is more useful than one event: it shows what
    each regulation actually rewarded, and which Pokemon keep showing up across
    formats rather than spiking in one.

Only World Championships. pokedata lists 186 tournaments - Regionals,
Internationals, Special Events - and the player wants none of them. All three
age divisions of each Worlds count: they are three separate metagames run off
the same roster, which is why they are never pooled into one percentage.

    python scripts/fetch_worlds_archive.py            # fetch anything missing
    python scripts/fetch_worlds_archive.py --force    # re-fetch every event
    python scripts/fetch_worlds_archive.py --rollup   # rebuild the summary only

Writes data/meta/tournament_<tid>_<division>.json per event (the same shape
fetch_tournament.py produces) plus data/meta/worlds_archive.json, which is the
per-year, per-division species table - the thing actually worth reading.
"""
import argparse, collections, io, json, os, re, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "data", "meta")
RAW = os.path.join(ROOT, "data", "raw", "tournaments")
OUT = os.path.join(META, "worlds_archive.json")
INDEX = "https://www.pokedata.ovh/standingsVGC/"
DIVISIONS = ("masters", "seniors", "juniors")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def discover():
    """The index is JS-driven but the ids sit in plain onclick handlers.

    Always fetched fresh: this is precisely the call that has to notice a
    Worlds that did not exist last time it ran.
    """
    req = urllib.request.Request(INDEX, headers={"User-Agent": UA})
    body = urllib.request.urlopen(req, timeout=45).read().decode("cp1252",
                                                                "replace")
    rows = re.findall(r"location\.href='(\d+)/'[^>]*>([^<]+)", body)
    out = []
    for tid, label in rows:
        label = " ".join(label.split())
        if not re.search(r"world championship", label, re.I):
            continue
        y = re.search(r"(20\d\d)", label)
        out.append({"tid": tid, "label": label,
                    "year": int(y.group(1)) if y else None,
                    # 2022 and 2023 each publish TWO entries for the same year.
                    # Only 2022's is labelled "Day 1"; 2023's two are
                    # indistinguishable by text and are told apart by round
                    # number further down. They are COMPLEMENTARY, not
                    # duplicates - 2023 Masters teamlists live on the Day 1
                    # event and 2023 Seniors/Juniors on the Day 2 one, so
                    # taking either alone loses a division.
                    "labelled_day1": bool(re.search(r"day\s*1", label, re.I))})
    out.sort(key=lambda r: (-(r["year"] or 0), r["tid"]))
    return out


def event_path(tid, div):
    return os.path.join(META, "tournament_%s_%s.json" % (tid, div))


def fetch_event(tid, div, force):
    p = event_path(tid, div)
    if os.path.exists(p) and not force:
        return "cached"
    argv = [sys.executable, "scripts/fetch_tournament.py",
            "--tid", tid, "--division", div]
    r = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(p):
        return "FAILED"
    return "fetched"


def species_table(path):
    """Team counts per species for one event, plus how many teams there were.

    Counted per TEAM, not per appearance, because the Species Clause means a
    team holds a species at most once - so a count IS a team count.
    """
    try:
        d = json.load(io.open(path, encoding="utf-8"))
    except Exception:
        return None
    players = d.get("players") or []
    with_team = [p for p in players if p.get("team")]
    c = collections.Counter()
    for p in with_team:
        seen = set()
        for slot in p["team"]:
            n = (slot or {}).get("pokemon")
            if not n:
                continue
            # pokedata writes forms as "Ogerpon [Hearthflame Mask]"
            base = n.split(" [")[0].strip()
            seen.add(base)
        c.update(seen)
    n = len(with_team)
    # Some older events publish STANDINGS ONLY - 2022 (both entries) and one
    # of the two 2023 entries have players and records but every `team` is
    # empty. That is upstream, not a parse failure, and it has to say so:
    # an event with no teamlists must never read as an event where nobody
    # played anything.
    return {"teams": n, "players": len(players),
            "teamlists": n > 0,
            "note": None if n else
                    "standings only - pokedata publishes no teamlists for "
                    "this event, so it says who placed, never what they ran",
            "round_label": d.get("round_label"), "complete": d.get("complete"),
            "top": [{"name": k, "teams": v,
                     "pct": round(100.0 * v / n, 1) if n else 0.0}
                    for k, v in c.most_common(40)]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--rollup", action="store_true",
                    help="rebuild worlds_archive.json from what is on disk")
    a = ap.parse_args()

    events = discover()
    print("World Championships on pokedata: %d" % len(events))

    archive = {"_what": "Every VGC World Championship pokedata publishes. A "
                        "Worlds is played once under one regulation and then "
                        "frozen, so these are HISTORY - what the field played "
                        "that August - never current usage.",
               "_divisions": "Masters, Seniors and Juniors are three separate "
                             "metagames off the same roster. Never pool them.",
               "_counted": "Per TEAM, not per appearance: the Species Clause "
                           "means a team holds a species at most once.",
               "source": INDEX, "events": []}

    for ev in events:
        rec = dict(ev)
        rec["divisions"] = {}
        for div in DIVISIONS:
            if not a.rollup:
                state = fetch_event(ev["tid"], div, a.force)
                print("  %s %-8s %-8s %s" % (ev["tid"], div, state,
                                             ev["label"][:44]))
            tbl = species_table(event_path(ev["tid"], div))
            if tbl:
                rec["divisions"][div] = tbl
        archive["events"].append(rec)

    # ---- the view actually worth reading: one row per YEAR ----------------
    # A year can be published as two events (a Day 1 and a Day 2) and the
    # teamlists are split across them unevenly. Per division, take whichever
    # event actually has teams; if both do, the one with more of them.
    by_year = {}
    for ev in archive["events"]:
        y = ev["year"]
        if y is None:
            continue
        slot = by_year.setdefault(y, {"year": y, "divisions": {},
                                      "from": {}, "events": []})
        slot["events"].append(ev["tid"])
        for div, tbl in ev["divisions"].items():
            cur = slot["divisions"].get(div)
            if not tbl["teamlists"]:
                # remember it exists, but never let it displace real teams
                if cur is None:
                    slot["divisions"][div] = tbl
                    slot["from"][div] = ev["tid"]
                continue
            if cur is None or not cur["teamlists"] or tbl["teams"] > cur["teams"]:
                slot["divisions"][div] = tbl
                slot["from"][div] = ev["tid"]
    archive["years"] = [by_year[y] for y in sorted(by_year, reverse=True)]
    archive["_years_note"] = (
        "One entry per year, merged across that year's events. 2023 is the "
        "case that forces this: its Masters teamlists are on the Day 1 event "
        "(tid 0000089) and its Seniors and Juniors on the Day 2 one (tid "
        "0000083), so either alone loses a division. `from` records which "
        "event each division was taken from. 2022 has no teamlists on any "
        "day or division - standings only, upstream.")

    io.open(OUT, "w", encoding="utf-8").write(
        json.dumps(archive, ensure_ascii=False, indent=1))
    tot = sum(d["teams"] for e in archive["events"]
              for d in e["divisions"].values())
    print("\nwrote %s" % OUT)
    print("  %d events, %d division files, %d teams in total"
          % (len(archive["events"]),
             sum(len(e["divisions"]) for e in archive["events"]), tot))
    return 0


if __name__ == "__main__":
    sys.exit(main())
