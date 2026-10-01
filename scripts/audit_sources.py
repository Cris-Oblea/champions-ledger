#!/usr/bin/env python3
"""Do the sources agree on the NUMBERS? Every move, every item, side by side.

    python scripts/audit_sources.py      # the disagreements, and how many agree

Prose can be argued about; numbers cannot. This checks the quantitative fields
of every move and item against each source that states them, and prints every
disagreement instead of picking a winner behind the scenes.

    moves  base power, accuracy, PP, category   Serebii | pokebase | Smogon calc
           PP, a fourth voice                   PokeAPI, rescaled (see below)
    items  VP price                             Serebii | pokebase

What it is NOT: a vote. Serebii is this project's ground truth for rules and
the Smogon calculator is ground truth for damage arithmetic, so a disagreement
is a thing to resolve in game, not to average. The output names both numbers
and leaves the choice visible.

Bulbapedia and WikiDex are deliberately absent. They are main-series canon, and
Champions rebalances - Body Slam is 16 PP here, Aerial Ace 60 BP at 101
accuracy. Reading a number off either one would import a value from a different
game; CLAUDE.md allows them for a MECHANIC only, after checking Champions did
not change it.
"""
import json
import os
import re
from pathlib import Path

import dex
from fetch_pokebase import rows_with
from paths import POKEAPI_CSV, SMOGON_CALC

SMOG = os.path.join(SMOGON_CALC, "raw_moves.json")
API = os.path.join(POKEAPI_CSV, "moves.csv")

CAT = {"physical": "Physical", "special": "Special", "status": "Status"}


def pokebase_moves():
    out = {}
    for r in rows_with("moves", "name", "damageClass", "power", "accuracy", "pp"):
        out.setdefault(r["name"], {"cat": CAT.get(r["damageClass"]), "bp": r["power"],
                                   "acc": r["accuracy"], "pp": r["pp"]})
    return out


def rescaled_pp(ours):
    """What PP a move SHOULD have here, going by the rest of the table.

    Champions rescales PP globally, so the main-series number is not the answer
    - but how every other move with that main-series number was rescaled is a
    strong one. Measured on 2026-09-27: 5 -> 8 (81 of 81), 10 -> 12 (188 of
    196), 15 -> 16 (101 of 103), 20 and up -> 20. So the majority bucket for a
    move's main-series PP is a fourth, independent vote on a PP dispute - and
    the one that settled Night Slash, the only 15-PP move Serebii put at 20.

    Returns {move name: (main-series PP, majority Champions PP, share)}.
    """
    if not os.path.exists(API):
        return {}
    import csv
    from collections import Counter, defaultdict
    with open(API, encoding="utf-8") as f:
        main = {r["identifier"]: r["pp"] for r in csv.DictReader(f)}
    def ident(n):
        return re.sub(r"[^a-z0-9-]", "", n.lower().replace(" ", "-"))
    buckets = defaultdict(Counter)
    for m in ours:
        k = main.get(ident(m["name"]))
        if k and m.get("pp") is not None:
            buckets[k][m["pp"]] += 1
    out = {}
    for m in ours:
        k = main.get(ident(m["name"]))
        if k and buckets[k]:
            pp, n = buckets[k].most_common(1)[0]
            out[m["name"]] = (int(k), pp, "%d/%d" % (n, sum(buckets[k].values())))
    return out


def _move_pairs(m, p, s):
    """(field, ours, theirs, whose) for every number the sources both state."""
    pairs = [("BP", m.get("power") or 0, p["bp"] or 0, "pokebase"),
             ("PP", m.get("pp"), p["pp"], "pokebase"),
             ("category", m.get("category"), p["cat"], "pokebase")]
    # accuracy: 101 is this database's "never misses"; pokebase writes 0
    if not (m.get("accuracy") == 101 and (p["acc"] or 0) == 0):
        pairs.append(("accuracy", m.get("accuracy"), p["acc"], "pokebase"))
    if s and s.get("bp") is not None:
        pairs.append(("BP", m.get("power") or 0, s["bp"], "smogon calc"))
    # power 1 is this project's marker for "derived from weight or damage
    # taken", not a real base power, so it is not a disagreement
    derived = (m.get("power") or 0) == 1
    return [(f, mine, theirs, who) for f, mine, theirs, who in pairs
            if mine is not None and theirs is not None
            and not (f == "BP" and derived)]


def _print_move_report(ours, rows, gaps, agree):
    print("MOVES - %d checked" % len(ours))
    print("  %d numbers agree across the sources" % agree)
    print("  %d disagree:" % len(rows))
    for n, f, a, b, who in sorted(rows):
        print("     %-16s %-9s serebii %-6s vs %s %s" % (n, f, a, who, b))
    vote = rescaled_pp(ours)
    for n, f, *_ in sorted(rows):
        if f == "PP" and n in vote:
            k, pp, share = vote[n]
            print("     %-16s %-9s rescale vote %s (main series %s -> %s in %s)"
                  % ("", "", pp, k, pp, share))
    print("  %d cells Serebii left empty that another source has:" % len(gaps))
    for n, f, v in sorted(gaps):
        print("     %-16s %-9s pokebase says %s" % (n, f, v))
    # THE RULINGS, so a settled dispute stays visible as settled rather than
    # vanishing from the table the day build_db applied it
    ruled = [(m["name"], f, m.get(f.lower() if f != "PP" else "pp"), why)
             for m in ours for f, why in (m.get("rulings") or {}).items()]
    print("  %d settled by a ruling in build_db.MOVE_RULINGS:" % len(ruled))
    for n, f, v, why in sorted(ruled):
        print("     %-16s %-9s %-4s %s" % (n, f, v, why))


def check_moves():
    ours = [m for m in dex.db("moves") if m.get("useable")]
    pb = pokebase_moves()
    sm = json.loads(Path(SMOG).read_text(encoding="utf-8")) if os.path.exists(SMOG) else {}
    rows, gaps, agree = [], [], 0
    for m in ours:
        n = m["name"]
        p, s = pb.get(n), sm.get(n)
        # Serebii left the cell empty - a documented gap, and another source
        # may simply have it
        for field, mine, theirs in (("accuracy", m.get("accuracy"),
                                     p and p["acc"]),
                                    ("PP", m.get("pp"), p and p["pp"])):
            if mine is None and theirs is not None:
                gaps.append((n, field, theirs))
        if not p:
            continue
        for field, mine, theirs, who in _move_pairs(m, p, s if isinstance(s, dict) else None):
            if mine != theirs:
                rows.append((n, field, mine, theirs, who))
            else:
                agree += 1
    _print_move_report(ours, rows, gaps, agree)
    return rows, gaps


def check_items():
    facts = (dex.db("item_facts") or {}).get("prices") or {}
    both = [(n, r) for n, r in facts.items() if r.get("vp")]
    src = {}
    for _n, r in both:
        src[r["source"]] = src.get(r["source"], 0) + 1
    print("\nITEMS - %d priced" % len(both))
    for k, v in sorted(src.items()):
        print("  %-10s %d" % (k, v))
    print("  disagreements are printed by build_item_facts.py, which is where "
          "the merge happens (none today, over the 123 both sources price)")


def main():
    check_moves()
    check_items()
    print("\nAbilities carry no numbers to cross-check - what they carry is "
          "prose, and scripts/build_text_facts.py picks the more concrete of "
          "the two texts per ability.")


if __name__ == "__main__":
    main()
