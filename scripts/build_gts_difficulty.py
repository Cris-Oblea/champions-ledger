#!/usr/bin/env python3
"""Derive how hard each Champions species is to get on the GTS.

A GTS offer sits unclaimed for one of two reasons, and they are different
questions that the app used to collapse into one BST number:

  DEMAND  - the other side wants to keep it. Measured, from pokebase ladder
            usage. Sneasler is 23.1% of the ladder; nobody hands one over.
  SUPPLY  - nobody has a spare, because it is hard to obtain in the source
            game. NOT measurable from any Champions source, so it is declared
            in data/meta/go_sourcing.json and clearly marked an estimate.

The output is a 1-5 score per species plus the reason, so the tracker can say
"rank 23 on the ladder AND a 999-coin grind" instead of "+20 BST".

It also answers the question that outranks the trade entirely: if the player
can just evolve it himself in GO, he should not be spending a chip on it.

    python scripts/build_gts_difficulty.py            # write the json
    python scripts/build_gts_difficulty.py --show     # print the table
"""
import json
import os
import sys
from pathlib import Path

import dex
from paths import META

OUT = os.path.join(META, "gts_difficulty.json")
SRC = os.path.join(META, "go_sourcing.json")

# Ladder usage -> demand 1-5. The cuts are where the ladder actually steps:
# a top-25 Pokemon is a different negotiation from a rank-150 one.
def demand_of(pct: float) -> int:
    for floor, level in ((15, 5), (7, 4), (3, 3), (1, 2)):
        if pct >= floor:
            return level
    return 1

DEMAND_WHY = {
    5: "top of the ladder - the other side is running it, not trading it",
    4: "heavily played, so spares are rare",
    3: "common enough that some trainers hold spares",
    2: "lightly played",
    1: "almost nobody runs it, so a spare costs them nothing",
}


def main() -> None:
    """Score how hard each species is to get by trade - the harder of demand
    (ladder usage) and supply (researched sourcing) - and write
    gts_difficulty.json (--show prints the table).
    """
    show = "--show" in sys.argv
    src = json.loads(Path(SRC).read_text(encoding="utf-8"))
    seeded = src.get("species") or {}
    default_supply = 2

    rows = (dex.meta("usage_pokemon") or {}).get("rows", [])
    # pokebase spells forms its own way - "Indeedee (Female)" for our
    # "Indeedee-Female", "Alolan Persian" for "Persian-Alola". Matching on the
    # raw string silently dropped every one of them, which is the gotcha
    # CLAUDE.md already documents: join Pokemon names through norm().
    usage = {}
    for r in rows:
        usage[dex.norm(r["name"])] = (r.get("usage_percent") or 0.0,
                                    r.get("rank"))
    ladder_size = len(rows)

    out = {}
    for p in dex.db("pokemon") or []:
        if p.get("is_mega"):
            continue
        name = p["name"]
        # ABSENT IS NOT ZERO. A species the ladder has no row for - one a new
        # regulation just added, say - scored 0.0% said "almost nobody runs
        # it, a spare costs them nothing", which is a claim the data does not
        # support: it is unknown, not unwanted.
        key = dex.norm(name)
        known = key in usage
        pct, rank = usage.get(key, (None, None))
        dem = demand_of(pct) if known else None
        ent = seeded.get(name) or seeded.get(p.get("species") or name)
        sup = (ent or {}).get("cost", default_supply)
        # The harder half dominates: a species that is easy to catch but
        # universally played is still unobtainable by trade, and so is a rare
        # one nobody plays. Averaging would hide both.
        if dem is None:
            score = sup          # supply is all we actually know
        else:
            score = max(dem, sup)
            # ...but when BOTH are hard it is worse than either alone.
            if dem >= 4 and sup >= 4:
                score = 5
        out[name] = {
            "score": score,
            "demand": dem,
            "supply": sup,
            "usage": pct,
            "rank": rank,
            "why_demand": (DEMAND_WHY[dem] if dem is not None else
                           "not on the ladder, so there is no usage "
                           "number for it yet"),
            "how": (ent or {}).get("how"),
            "seeded": bool(ent),
        }

    blob = {"_what": "Derived by scripts/build_gts_difficulty.py. demand is "
                     "measured from pokebase ladder usage; supply is declared "
                     "in data/meta/go_sourcing.json and is an ESTIMATE.",
            "_scale": src.get("_scale"),
            # Once, not on every row: it moves most nights, and on every row
            # it rewrote all 264 of them when one number changed.
            "ladder_size": ladder_size,
            "count": len(out), "species": out}
    Path(OUT).write_text(json.dumps(blob, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote %s (%d species, %d with researched sourcing)"
          % (OUT, len(out), sum(1 for v in out.values() if v["seeded"])))

    if show:
        rows = sorted(out.items(), key=lambda kv: (-kv[1]["score"],
                                                   -(kv[1]["usage"] or 0)))
        print("\n%-20s %-6s %-7s %-7s %s" % ("species", "score", "demand",
                                             "supply", "usage"))
        for n, v in rows[:30]:
            print("%-20s %-6d %-7s %-7d %s"
                  % (n, v["score"],
                     "?" if v["demand"] is None else v["demand"],
                     v["supply"],
                     "no ladder row" if v["usage"] is None
                     else "%.2f%%" % v["usage"]))


if __name__ == "__main__":
    main()
