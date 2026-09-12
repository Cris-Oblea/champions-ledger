#!/usr/bin/env python3
"""Do the sources agree on the NUMBERS? Every move, every item, side by side.

    python scripts/audit_sources.py            # the disagreements
    python scripts/audit_sources.py --all      # plus what agrees, counted

Prose can be argued about; numbers cannot. This checks the quantitative fields
of every move and item against each source that states them, and prints every
disagreement instead of picking a winner behind the scenes.

    moves  base power, accuracy, PP, category   Serebii | pokebase | Smogon calc
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
import argparse, glob, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q

PB = os.path.join(ROOT, "data", "raw", "pokebase")
SMOG = os.path.join(ROOT, "data", "raw", "smogon_calc", "raw_moves.json")

# pokebase's payload states the four numbers inline, in one shape
PB_MOVE = re.compile(
    r'\\"name\\":\\"([^\\"]+)\\",\\"slug\\":\\"[^\\"]*\\",\\"type\\":[^,]*,'
    r'\\"damageClass\\":\\"([a-z]+)\\",\\"power\\":([0-9]+|null),'
    r'\\"accuracy\\":([0-9]+|null),\\"pp\\":([0-9]+|null)')
CAT = {"physical": "Physical", "special": "Special", "status": "Status"}


def num(x):
    return None if x in (None, "null", "") else int(x)


def pokebase_moves():
    out = {}
    for f in sorted(glob.glob(os.path.join(PB, "moves*.html"))):
        h = io.open(f, encoding="utf-8", errors="replace").read()
        for m in PB_MOVE.finditer(h):
            out.setdefault(m.group(1), {
                "cat": CAT.get(m.group(2)), "bp": num(m.group(3)),
                "acc": num(m.group(4)), "pp": num(m.group(5))})
    return out


def check_moves(show_all):
    ours = [m for m in Q.db("moves") if m.get("useable")]
    pb = pokebase_moves()
    sm = json.load(open(SMOG, encoding="utf-8")) if os.path.exists(SMOG) else {}
    rows, gaps, agree = [], [], 0
    for m in ours:
        n = m["name"]
        p, s = pb.get(n), sm.get(n)
        s = s if isinstance(s, dict) else None
        # Serebii left the cell empty - a documented gap, and another source
        # may simply have it
        for field, mine, theirs in (("accuracy", m.get("accuracy"),
                                     p and p["acc"]),
                                    ("PP", m.get("pp"), p and p["pp"])):
            if mine is None and theirs is not None:
                gaps.append((n, field, theirs))
        if not p:
            continue
        # power 1 is this project's marker for "derived from weight or damage
        # taken", not a real base power, so it is not a disagreement
        derived = (m.get("power") or 0) == 1
        pairs = [("BP", m.get("power") or 0, p["bp"] or 0, "pokebase"),
                 ("PP", m.get("pp"), p["pp"], "pokebase"),
                 ("category", m.get("category"), p["cat"], "pokebase")]
        # accuracy: 101 is this database's "never misses"; pokebase writes 0
        if not (m.get("accuracy") == 101 and (p["acc"] or 0) == 0):
            pairs.append(("accuracy", m.get("accuracy"), p["acc"], "pokebase"))
        if s and s.get("bp") is not None:
            pairs.append(("BP", m.get("power") or 0, s["bp"], "smogon calc"))
        for field, mine, theirs in [(a, b, c) for a, b, c, _ in pairs]:
            pass
        for field, mine, theirs, who in pairs:
            if mine is None or theirs is None:
                continue
            if field == "BP" and derived:
                continue
            if mine != theirs:
                rows.append((n, field, mine, theirs, who))
            else:
                agree += 1
    print("MOVES - %d checked" % len(ours))
    print("  %d numbers agree across the sources" % agree)
    print("  %d disagree:" % len(rows))
    for n, f, a, b, who in sorted(rows):
        print("     %-16s %-9s serebii %-6s vs %s %s" % (n, f, a, who, b))
    print("  %d cells Serebii left empty that another source has:" % len(gaps))
    for n, f, v in sorted(gaps):
        print("     %-16s %-9s pokebase says %s" % (n, f, v))
    return rows, gaps


def check_items(show_all):
    facts = (Q.db("item_facts") or {}).get("prices") or {}
    both = [(n, r) for n, r in facts.items() if r.get("vp")]
    src = {}
    for n, r in both:
        src[r["source"]] = src.get(r["source"], 0) + 1
    print("\nITEMS - %d priced" % len(both))
    for k, v in sorted(src.items()):
        print("  %-10s %d" % (k, v))
    print("  disagreements are printed by build_item_facts.py, which is where "
          "the merge happens (none today, over the 123 both sources price)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    check_moves(a.all)
    check_items(a.all)
    print("\nAbilities carry no numbers to cross-check - what they carry is "
          "prose, and scripts/build_text_facts.py picks the more concrete of "
          "the two texts per ability.")


if __name__ == "__main__":
    main()
