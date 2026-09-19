#!/usr/bin/env python3
"""What a Pokemon Champions has never heard of knows -> tracker/homemoves.js

    python scripts/build_home_moves.py
    python scripts/build_home_moves.py --report    # counts only, write nothing

WHY THIS EXISTS.

Opening the sheet of a HOME Pokemon Champions does not have used to throw; then
it opened and showed its types, its BST, its stats and its abilities. The other
half of the same request was the movepool:

    "como igual se tienen el BST y los stats junto con su tipo y habilidades
     posibles, tambien deberia poder abrir la ficha y listar los movimientos
     que aprende ese pokemon"  (player, 2026-09-18)

WHERE THE MOVES COME FROM, and why that is allowed here.

PokeAPI tracks Champions as its own version group (32), which is what
audit_learnsets.py uses to give our Serebii-parsed movepools a second opinion.
A species Champions does not have has NO rows in that group - checked, not
assumed: Bulbasaur has 0 - so what is read instead is its newest main-series
group.

That is the same reasoning fetch_home_dex.py already makes for the stats, and
it holds for exactly the same reason: there is nothing of ours to contradict.
Serebii publishes no Champions page for these, Smogon's roster does not list
them, and the moment a regulation adds one, Serebii's row replaces this file's
entirely. It is never consulted for a species Champions DOES have, where the
move rebalance makes upstream wrong.

WHAT IS DROPPED, AND SAID OUT LOUD.

A move is kept only if Champions has a row for it, because a name with no base
power, no accuracy and no PP is not information - it is a word. About 16% of
these movepools are moves Champions has no row for at all, and rather than let
them vanish the count ships beside the list, so the sheet can say "and 9 more
Champions has no move for" instead of quietly being short.

WHY ITS OWN FILE, and not part of the dex blob.

132 KB, changing only when the PokeAPI pin moves - against a dex that is
rebuilt every night. Inside the dex asset every nightly refresh would
re-download it. Its own hashed asset is fetched once and then never again,
which is the same trade tracker/splits.js makes.
"""
import argparse
import collections
import csv
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q                                             # noqa: E402

RAW = os.path.join(ROOT, "data", "raw", "pokeapi_csv")
OUT = os.path.join(ROOT, "tracker", "homemoves.js")
# Champions' own version group upstream. Named here as well as in
# audit_learnsets.py would be two copies of one fact, so it is imported.
from audit_learnsets import CHAMPIONS_VG                      # noqa: E402


def key(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def table(name):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        sys.exit("%s is missing - run scripts/fetch_home_dex.py first" % path)
    return list(csv.DictReader(io.open(path, encoding="utf-8")))


def build():
    home = json.load(io.open(os.path.join(ROOT, "data", "db", "home_dex.json"),
                             encoding="utf-8"))
    # the same spellings fetch_home_dex resolved, so the two cannot disagree
    from fetch_home_dex import key as hkey
    pk = {}
    for r in table("pokemon.csv"):
        pk.setdefault(r["identifier"], r["id"])
    mv = {r["id"]: r["identifier"] for r in table("moves.csv")}

    champ = {}
    for m in Q.db("moves"):
        if m.get("useable"):
            champ[key(m["name"])] = m["name"]

    by_pid = collections.defaultdict(lambda: collections.defaultdict(set))
    for r in table("pokemon_moves.csv"):
        by_pid[r["pokemon_id"]][r["version_group_id"]].add(r["move_id"])

    out, missing, dropped = {}, [], 0
    for name in sorted(home):
        pid = pk.get(hkey(name))
        groups = by_pid.get(pid) if pid else None
        if not groups:
            missing.append(name)
            continue
        # Champions' own group where it exists at all - it will not for these,
        # and the check is cheap insurance against reading a main-series
        # movepool for a species the game really does have.
        g = (CHAMPIONS_VG if groups.get(CHAMPIONS_VG)
             else max(groups, key=lambda k: int(k)))
        names, skipped = [], 0
        for mid in groups[g]:
            n = champ.get(key(mv.get(mid, "")))
            if n:
                names.append(n)
            else:
                skipped += 1
        if not names:
            missing.append(name)
            continue
        dropped += skipped
        out[name] = {"m": sorted(names), "x": skipped}
    return out, missing, dropped


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    out, missing, dropped = build()
    total = sum(len(v["m"]) for v in out.values())
    print("%d species with a movepool, %d moves" % (len(out), total))
    print("  %d more they know that Champions has no row for" % dropped)
    print("  %d with nothing upstream at all (fan-made, or a spelling "
          "fetch_home_dex also could not place)" % len(missing))
    if a.report:
        return
    body = ("/* GENERATED by scripts/build_home_moves.py - do not edit.\n"
            "   What a species Champions does NOT have knows, from PokeAPI's\n"
            "   newest main-series version group at the pinned commit. Never\n"
            "   consulted for a species Champions does have. */\n"
            "window.CHAMP_HOME_MOVES = "
            + json.dumps(out, ensure_ascii=False, separators=(",", ":"))
            + ";\n")
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(body)
    print("wrote %s  (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
