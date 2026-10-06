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

THE FIRST RUN: 235 species paired, ~14,600 move-species pairs, SEVEN
disagreements - and Serebii backed this project on all seven.

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
import sys
from collections.abc import Iterable

import dex
import fetch_home_dex

CHAMPIONS_VG = "32"

# Checked one by one against the Serebii page for that move.
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


def upstream(force: bool = False) -> dict[str, set[str]]:
    """PokeAPI's Champions movepools: {species identifier: {move identifier}}.
    """
    with open(fetch_home_dex.csv_path("pokemon.csv", force), encoding="utf-8") as fh:
        by_id = {r["id"]: r["identifier"] for r in csv.DictReader(fh)}
    with open(fetch_home_dex.csv_path("moves.csv", force), encoding="utf-8") as fh:
        mv = {r["id"]: r["identifier"] for r in csv.DictReader(fh)}
    out: dict[str, set[str]] = {}
    with open(fetch_home_dex.csv_path("pokemon_moves.csv", force), encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["version_group_id"] != CHAMPIONS_VG:
                continue
            # a row naming an id the two tables lack would put None in the
            # set, and sorting it later would fail far from the cause
            name, move = by_id.get(r["pokemon_id"]), mv.get(r["move_id"])
            if name and move:
                out.setdefault(name, set()).add(move)
    return out


def _sort_out(name: str, moves: Iterable[str], known_map: dict[str, str], side: str,
              show: bool) -> tuple[list[tuple[str, str]], int]:
    """(the moves that are NEW disagreements, how many were known ones);
    `show` prints the known ones too."""
    new: list[tuple[str, str]] = []
    known = 0
    for m in sorted(moves):
        if m in known_map:
            known += 1
            if show:
                print("  known  %-16s %s %-18s (%s)" % (name, side, m, known_map[m]))
        else:
            new.append((name, m))
    return new, known


def main() -> None:
    """Pair every movepool with PokeAPI's and report each disagreement nobody
    has settled yet (--list shows the settled ones too). Exits 1 on a new
    one.
    """
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--list", action="store_true",
                    help="print every disagreement, known ones included")
    args = ap.parse_args()

    up = upstream(args.force)
    ours = dex.db("learnsets")
    paired = 0
    new_ours: list[tuple[str, str]] = []
    new_up: list[tuple[str, str]] = []
    known = 0
    for name in sorted(ours):
        u = up.get(fetch_home_dex.key(name))
        if not u:
            continue
        paired += 1
        mine = {dex.slug(m) for m in ours[name]}
        n, k = _sort_out(name, u - mine, KNOWN_UPSTREAM, "upstream-only", args.list)
        new_up += n
        known += k
        n, k = _sort_out(name, mine - u, KNOWN_OURS, "ours-only    ", args.list)
        new_ours += n
        known += k

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
