#!/usr/bin/env python3
"""A second pair of eyes on every movepool.

    python scripts/audit_learnsets.py            # cached; re-uses data/raw/
    python scripts/audit_learnsets.py --force    # re-download the table
    python scripts/audit_learnsets.py --list     # print every disagreement

WHY THIS EXISTS.

The learnsets have one source. Every other number in this project is crossed
against something - the damage formula against Smogon's engine, the type chart
against Serebii's own weakness tables, the item prices against pokebase - but a
movepool came from one parse of one Serebii page and nothing has ever checked
it. When that parse went wrong it went wrong silently: 25 regional forms were
handed their base form's moves and four resolved to nothing at all, and the
only reason anyone found out was the player opening a sheet.

PokeAPI tracks Pokemon Champions as its own version group (32), with 319
species and 19,810 learnset rows - it even carries a `mastery` column, which is
not a main-series concept. That is a real, independent read of the same fact,
and it is the only one that exists.

WHAT IT IS NOT. PokeAPI is NOT ground truth here and this never rewrites
anything. Its move TABLE is main-series throughout - 414 of 512 PP values
disagree with Champions, and 16 base powers - so it is wrong about what a move
does. This asks it only "who learns it", and when the two disagree, Serebii
decides.

THE FIRST RUN, 2026-09-16: 235 species paired, ~14,600 move-species pairs,
SEVEN disagreements - and Serebii backed this project on all seven.

  we have, upstream does not
    Slash on 30 species   upstream has 1407 Slash rows and ZERO in the
                          Champions group - it simply has not filled that in
    Bulldoze   Houndstone   Serebii lists it
    Charm, Draining Kiss, Misty Terrain  Mawile   Serebii lists all three
  upstream has, we do not
    Metal Burst, Mirror Coat   Archaludon   Serebii lists NEITHER
    Pound                      Politoed     Serebii does not list it

So the known set below is not a list of excuses - each line was checked against
the Serebii page for that move, and each one is upstream being wrong or
incomplete. Anything NEW is what this is for.
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q                                             # noqa: E402

RAW = os.path.join(ROOT, "data", "raw", "pokeapi_csv")
PIN = "4b82c204ddd19ecb8eda2ea044ccb59e222b721c"
BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/%s/data/v2/csv/" % PIN
CHAMPIONS_VG = "32"

# Checked one by one against the Serebii page for that move on 2026-09-16.
# Every one of them is upstream being incomplete or carrying a main-series row.
# A disagreement NOT in here is the point of the audit.
KNOWN_OURS = {                       # we list it, upstream does not
    "slash": "upstream has 1407 Slash rows and none at all in the Champions "
             "group; Serebii lists its learners",
    "bulldoze": "Serebii lists Houndstone",
    "charm": "Serebii lists Mawile",
    "draining-kiss": "Serebii lists Mawile",
    "misty-terrain": "Serebii lists Mawile",
}
KNOWN_UPSTREAM = {                   # upstream lists it, we do not
    "metal-burst": "Serebii does not list Archaludon",
    "mirror-coat": "Serebii does not list Archaludon",
    "pound": "Serebii does not list Politoed",
}


def table(name, force=False):
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, name)
    if not os.path.exists(path) or force:
        req = urllib.request.Request(BASE + name,
                                     headers={"User-Agent": "champions-ledger"})
        with urllib.request.urlopen(req, timeout=180) as r:
            open(path, "wb").write(r.read())
    return path


def mkey(n):
    """A move name reduced so both spellings meet."""
    return re.sub("[^a-z0-9]+", "-", n.lower().replace("'", "")).strip("-")


def upstream(force=False):
    by_id, mv = {}, {}
    for r in csv.DictReader(io.open(table("pokemon.csv", force), encoding="utf-8")):
        by_id[r["id"]] = r["identifier"]
    for r in csv.DictReader(io.open(table("moves.csv", force), encoding="utf-8")):
        mv[r["id"]] = r["identifier"]
    out = {}
    with io.open(table("pokemon_moves.csv", force), encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["version_group_id"] != CHAMPIONS_VG:
                continue
            out.setdefault(by_id.get(r["pokemon_id"]), set()).add(
                mv.get(r["move_id"]))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--list", action="store_true",
                    help="print every disagreement, known ones included")
    args = ap.parse_args()

    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "fhd", os.path.join(ROOT, "scripts", "fetch_home_dex.py"))
    fhd = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fhd)

    up = upstream(args.force)
    ours = Q.db("learnsets")
    paired = 0
    new_ours, new_up, known = [], [], 0
    for name in sorted(ours):
        u = up.get(fhd.key(name))
        if not u:
            continue
        paired += 1
        mine = set(mkey(m) for m in ours[name])
        for m in sorted(u - mine):
            if m in KNOWN_UPSTREAM:
                known += 1
                if args.list:
                    print("  known  %-16s upstream-only %-18s (%s)"
                          % (name, m, KNOWN_UPSTREAM[m]))
            else:
                new_up.append((name, m))
        for m in sorted(mine - u):
            if m in KNOWN_OURS:
                known += 1
                if args.list:
                    print("  known  %-16s ours-only     %-18s (%s)"
                          % (name, m, KNOWN_OURS[m]))
            else:
                new_ours.append((name, m))

    print("paired %d of our %d movepools against PokeAPI's Champions group "
          "(%d species there)" % (paired, len(ours), len(up)))
    print("  %d known disagreements, each checked against Serebii" % known)
    if not new_ours and not new_up:
        print("  nothing new")
        return
    print()
    print("  NEW - check the Serebii page for each move before believing "
          "either side")
    for name, m in new_up:
        print("    upstream lists %-18s for %s, we do not" % (m, name))
    for name, m in new_ours:
        print("    we list        %-18s for %s, upstream does not" % (m, name))
    sys.exit(1)


if __name__ == "__main__":
    main()
