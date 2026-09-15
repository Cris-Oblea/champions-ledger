#!/usr/bin/env python3
"""What each Pokemon's own players run, shaped for the app.

    python scripts/build_splits_data.py     -> tracker/splits.js

data/meta/usage_splits.json holds both of the datasets pokebase publishes per
Pokemon. Only one of them reaches the phone, and which one is a decision worth
writing down:

  TOURNAMENT, the block stamped with the current regulation, is what ships.
  Every Pokemon has one, every section is complete, and all of it is the same
  measurement, so a number means the same thing whichever Pokemon is open.

  SEASON, the ladder, stays in data/meta/ for query.py. It is missing for a
  Pokemon that was not ranked that season - Rillaboom has no season block at
  all - and its percentages are a different measure from the tournament ones.
  Shipping both and picking whichever existed is exactly the bug that produced
  the old file, where Kingambit's moves summed to 370 and Rillaboom's to 94.

WHAT THE MOVE PERCENTAGE IS, measured rather than assumed: for every Pokemon,
the move column sums to ~100 while a set carries up to four moves, so it is a
share of MOVE SLOTS, not of sets. Items, abilities, natures and spreads sum to
~100 across one slot each, so those are shares of SETS and read directly.
Teammates sum to ~300-500, because a team has five other slots. `--check`
asserts all four shapes. The consequence for the app: no move can ever reach
50%, so emphasis is relative to that Pokemon's own top row and never to a
fixed threshold, and the label says which denominator it is.

EVERY MOVE IS CARRIED, including the ones at 0.0%. The player asked for all of
them marked, and "nobody brought this" is an answer. A move absent from the
table was in no M-C team at all, which the app renders as 0% rather than as
silence.

IT IS ITS OWN ASSET, AND THAT IS THE POINT. The dex is rebuilt every night
because ladder usage moves every night; these splits are fetched WEEKLY,
because 321 pages at 1.3 MB is six minutes of someone else's bandwidth.
Grouped by how often they change, they are fetched once a week and cached for
a year.
"""
import argparse, io, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "meta", "usage_splits.json")
OUT = os.path.join(ROOT, "tracker", "splits.js")

# Spreads are the one section long enough to matter for size - 26 rows of six
# numbers each, against 19 two-field rows for moves - and the tail of it is
# one team's private tuning rather than a pattern. Two pages' worth is what an
# indicator can show. Everything else is carried whole.
KEEP_SPREADS = 12
SP_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"]


def pairs(rows):
    """[name, percent], descending. Sorted here so the app can read the top
    row as the maximum without scanning."""
    out = [[r["name"], r["percent"]] for r in rows or [] if "percent" in r]
    out.sort(key=lambda x: -x[1])
    return out


def spreads(rows):
    """[hp, atk, def, spa, spd, spe, percent] - a flat row of numbers rather
    than an object, which is less than half the bytes for the same content."""
    out = []
    for r in rows or []:
        sp = r.get("sp") or {}
        out.append([sp.get(k, 0) for k in SP_ORDER] + [r["percent"]])
    out.sort(key=lambda x: -x[-1])
    return out[:KEEP_SPREADS]


# What each column has to sum to, and why that bound and not a tighter one.
# This is the check that catches pokebase changing a denominator under us,
# which is the failure that produced the file this replaces: a column that
# starts summing to 400 is a share of SETS again and every chip in the app
# would silently mean something new.
COLUMN_SUMS = [
    # one per set, so they read directly
    ("items", 90, 110, "one item per set"),
    ("natures", 90, 110, "one nature per set"),
    ("spreads", 90, 110, "one spread per set"),
    # up to four moves per set, and pokebase divides by SLOTS, so the whole
    # movepool still sums to 100 and no single move can pass ~25
    ("moves", 90, 110, "share of move slots, not of sets"),
    # one per set too, but pokebase leaves a row out where it could not
    # resolve the ability: Palafin publishes Zero to Hero at 66.7% and nothing
    # for the rest. That is upstream and faithful, so the floor allows it.
    ("abilities", 60, 110, "one ability per set, upstream sometimes short"),
    # five other slots - but a Mega-capable teammate is listed TWICE, once as
    # the base and once as the Mega ("Salamence 47.1%, Mega Salamence 47%"),
    # so a Pokemon seen on one team can reach 1000. Rampardos is on exactly
    # one and sums to 700.
    ("teammates", 150, 1100, "share of teams, base and Mega listed apart"),
]


def check(mons):
    """The shape of each column, asserted rather than believed."""
    bad = []
    for name, v in sorted(mons.items()):
        t = v.get("tournament") or {}
        for sec, lo, hi, why in COLUMN_SUMS:
            rows = t.get(sec) or []
            if not rows:
                continue
            s = sum(r["percent"] for r in rows if "percent" in r)
            if not (lo <= s <= hi):
                bad.append("%s %s sums to %.1f, want %d-%d (%s)"
                           % (name, sec, s, lo, hi, why))
    for line in bad[:20]:
        print("  " + line)
    if bad:
        print("%d of %d Pokemon have a column that does not sum as expected"
              % (len({b.split()[0] for b in bad}), len(mons)))
        return 1
    print("%d Pokemon: every column sums to what its denominator says it "
          "should" % len(mons))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true",
                    help="verify what each percentage is a share OF")
    a = ap.parse_args()

    if not os.path.exists(SRC):
        sys.exit("no splits yet - run scripts/fetch_pokebase_splits.py")
    blob = json.load(io.open(SRC, encoding="utf-8"))
    mons = blob.get("pokemon") or {}
    if a.check:
        return check(mons)

    out = {}
    for name, v in mons.items():
        t = v.get("tournament") or {}
        row = {
            "m": pairs(t.get("moves")),
            "i": pairs(t.get("items")),
            "a": pairs(t.get("abilities")),
            "n": pairs(t.get("natures")),
            "s": spreads(t.get("spreads")),
            "t": pairs(t.get("teammates")),
        }
        if any(row.values()):
            out[name] = row

    regs = blob.get("regulations") or []
    payload = {"r": regs[-1] if regs else None,
               "f": blob.get("fetched"),
               "p": out}
    body = ("/* GENERATED by scripts/build_splits_data.py - do not edit.\n"
            "   Of the people who brought THIS Pokemon to an M-C tournament,\n"
            "   what they brought: every move, item, ability, nature, spread\n"
            "   and teammate, with percentages, off pokebase's per-Pokemon\n"
            "   pages. Fetched weekly, so it is its own asset rather than\n"
            "   riding on the nightly dex.\n\n"
            "   `m` is a share of MOVE SLOTS and so tops out near 25; every\n"
            "   other section is a share of SETS and reads directly, except\n"
            "   `t`, where a team has five other slots. Rows are sorted\n"
            "   descending, so row 0 is that Pokemon's own maximum. */\n"
            "window.CHAMP_SPLITS = "
            + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            + ";\n")
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    moves = sum(len(r["m"]) for r in out.values())
    print("wrote %s  (%d KB, %d Pokemon, %d moves priced, %s, fetched %s)"
          % (OUT, len(body.encode("utf-8")) // 1024, len(out), moves,
             payload["r"] or "?", blob.get("fetched", "?")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
