#!/usr/bin/env python3
"""National Dex numbers for every species, which is the order Pokemon HOME uses.

    python scripts/fetch_dex_numbers.py          # cached; re-uses data/raw/
    python scripts/fetch_dex_numbers.py --force

The HOME box holds Pokemon Champions has never heard of, so its numbers cannot
come from data/db/pokemon.json - that only covers the 340 Champions forms, and
Melmetal and Oricorio are already in the box without one. None of the project's
five sources carries a National Dex number for the rest: Serebii's Champions
pages are Champions-only, Smogon's species table has no `num` field at all, and
pokebase's weight table is names without numbers.

PokeAPI is the canonical free index of exactly this one fact. It is used for
nothing else - no stats, no movepools, no usage - because the source hierarchy
in CLAUDE.md still governs everything that matters. This is a lookup table of
numbers, fetched once and cached like every other raw source.

Regional forms share their base species number, which is right: Alolan
Ninetales is #38 in HOME, same as Ninetales.
"""
import argparse
import json
import os
from pathlib import Path

import net
from paths import DB, RAW

SPECIES_CACHE = os.path.join(RAW, "pokeapi_species.json")
OUT = os.path.join(DB, "dex_numbers.json")
URL = "https://pokeapi.co/api/v2/pokemon-species?limit=2000"


def fetch(force=False):
    """PokeAPI's species list, from the cache unless forced."""
    if os.path.exists(SPECIES_CACHE) and not force:
        return json.loads(Path(SPECIES_CACHE).read_text(encoding="utf-8"))
    data = json.loads(net.get(URL))
    os.makedirs(os.path.dirname(SPECIES_CACHE), exist_ok=True)
    Path(SPECIES_CACHE).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def _key(name):
    """Our spelling is Serebii's; PokeAPI's is lowercase and hyphenated, and it
    keys on the BASE species, so a regional form resolves to its base number."""
    s = name.lower()
    for a_, b_ in (("é", "e"), ("'", ""), (".", ""), (" ", "-"),
                   ("_", "-"), (":", "")):
        s = s.replace(a_, b_)
    return s


def _strip_form(name):
    """Alolan Ninetales is #38, the same as Ninetales.

    The Mega suffixes are a space, not a hyphen - "Mega Charizard X" -
    so splitting on the hyphen alone left the seven X/Y/Z Megas unresolved.
    """
    base = name.split("-")[0].strip()
    parts = base.split(" ")
    if len(parts) > 1 and parts[-1] in ("X", "Y", "Z"):
        base = " ".join(parts[:-1])
    return base


def _number_of(name, lookup):
    """A form's National Dex number: its own name first, then with the form
    stripped.
    """
    clean = name.replace("Mega ", "")
    return next((lookup[p] for p in (_key(clean), _key(_strip_form(clean)))
                 if p in lookup), None)


def _report(nums, resolved, missing, mons):
    """How many names got a number, and the Champions forms that did not."""
    print("%d species from PokeAPI" % len(nums))
    print("wrote %s  -  %d names resolved, %d without a number"
          % (OUT, len(resolved), len(missing)))
    if missing:
        real = [m for m in missing if m in {p["name"] for p in mons}]
        if real:
            print("  IN THE CHAMPIONS DEX and unresolved: %s" % ", ".join(real))
        print("  (the rest are Smogon's fan-made CAP entries and cosmetic "
              "forms: %s ...)" % ", ".join(missing[:6]))


def main():
    """Give every form in the dex its National Dex number and write it out."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    nums = {row["name"]: int(row["url"].rstrip("/").rsplit("/", 1)[-1])
            for row in fetch(a.force).get("results", [])}
    lookup = {_key(k): v for k, v in nums.items()}

    db = Path(DB)
    mons = json.loads((db / "pokemon.json").read_text(encoding="utf-8"))
    wt = json.loads((db / "weights.json").read_text(encoding="utf-8"))["weights"]
    every = sorted({p["name"] for p in mons} |
                   {p.get("species") for p in mons if p.get("species")} |
                   set(wt))
    resolved, missing = {}, []
    for n in every:
        num = _number_of(n, lookup)
        if num is None:
            missing.append(n)
        else:
            resolved[n] = num

    Path(OUT).write_text(json.dumps({"_comment":
               "National Dex numbers, the order Pokemon HOME lists in. Source: "
               "PokeAPI, used for this one fact only - see the module docstring "
               "in scripts/fetch_dex_numbers.py. Regional forms share their "
               "base species number, which is how HOME shows them.",
               "numbers": dict(sorted(resolved.items()))}, ensure_ascii=False, indent=1), encoding="utf-8")
    _report(nums, resolved, missing, mons)


if __name__ == "__main__":
    main()
