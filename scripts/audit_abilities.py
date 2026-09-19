#!/usr/bin/env python3
"""A second opinion on every form's ability list.

    python scripts/audit_abilities.py          # report; non-zero on a NEW gap

WHY. The movepools got a second opinion in audit_learnsets.py and the ability
lists never had one - and one was missing for months without anything noticing:

    "ciertos pokemones como lycanroc midnight le hace falta 1 habilidad, no
     tiene no guard, pero smogon y el juego si dicen que tiene no guard"
     (player, 2026-09-19)

He was right, and the cause was worth finding rather than patching. Form rows
come from the ATTACKDEX, because that is the only place each form gets a row of
its own - and Serebii's attackdex row for Lycanroc-Midnight lists Keen Eye and
Vital Spirit and stops, while its POKEDEX page lists all three and links
/abilitydex/noguard.shtml. The two halves of one site disagree. build_db.py
completes the short row from the page now; this is what would have said so.

WHAT IT COMPARES. PokeAPI's pokemon_abilities.csv at the pinned commit - the
same tables fetch_home_dex.py reads for the species Champions lacks, and the
same argument for using them: an ability is a fact about a Pokemon, not a
Champions balance number, so upstream disagreeing is worth a look. It never
rewrites anything. Serebii decides; this only says where to look.

KNOWN AND SETTLED, so only a NEW disagreement speaks up:
  * Compoundeyes - Serebii spells it as one word and our whole database does
    too, consistently, including the ability's own row and its description.
    PokeAPI writes "Compound Eyes". Nothing is missing; the two sites spell it
    differently, and ours is the spelling the rest of the app looks up by.
"""
import collections
import csv
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q                                             # noqa: E402
from fetch_home_dex import key as hkey                        # noqa: E402

RAW = os.path.join(ROOT, "data", "raw", "pokeapi_csv")
ENGLISH = "9"
# name -> why it is not a finding. Each one checked by hand, once.
KNOWN = {
    "Compound Eyes": "Serebii writes Compoundeyes, and so does all of ours",
}


def table(name):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        return None
    return list(csv.DictReader(io.open(path, encoding="utf-8")))


def main():
    pokemon = table("pokemon.csv")
    if pokemon is None:
        print("no PokeAPI tables cached - run scripts/fetch_home_dex.py first")
        return 0                       # not a failure: CI has no raw cache
    pk = {}
    for r in pokemon:
        pk.setdefault(r["identifier"], r["id"])
    aname = {r["ability_id"]: r["name"] for r in table("ability_names.csv")
             if r["local_language_id"] == ENGLISH}
    by_pid = collections.defaultdict(list)
    for r in table("pokemon_abilities.csv"):
        by_pid[r["pokemon_id"]].append((int(r["slot"]),
                                        aname.get(r["ability_id"])))

    checked, gaps, known = 0, [], 0
    for p in Q.db("pokemon"):
        if p.get("is_mega"):
            continue                   # a Mega's ability is the stone's doing
        pid = pk.get(hkey(p["name"]))
        if not pid or pid not in by_pid:
            continue
        checked += 1
        ours = p.get("abilities") or []
        for _, n in sorted(by_pid[pid]):
            if not n or n in ours:
                continue
            if n in KNOWN:
                known += 1
                continue
            gaps.append((p["name"], n, ", ".join(ours) or "none"))

    print("%d forms crossed against PokeAPI at the pin" % checked)
    print("  %d known spelling differences, skipped" % known)
    if not gaps:
        print("  no form is missing an ability upstream lists")
        return 0
    print("\n  %d FORM(S) MISSING AN ABILITY UPSTREAM LISTS:" % len(gaps))
    for name, miss, ours in gaps:
        print("    %-22s missing %-18s (we have: %s)" % (name, miss, ours))
    print("\n  Check Serebii's page for each before changing anything - its\n"
          "  Pokedex page and its attackdex row can disagree, which is exactly\n"
          "  how Lycanroc-Midnight lost No Guard. If Serebii really does not\n"
          "  list it, add it to KNOWN with the reason instead.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
