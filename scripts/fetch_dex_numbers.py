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
import argparse, json, os, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "pokeapi_species.json")
OUT = os.path.join(ROOT, "data", "db", "dex_numbers.json")
URL = "https://pokeapi.co/api/v2/pokemon-species?limit=2000"


def fetch(force=False):
    if os.path.exists(RAW) and not force:
        return json.load(open(RAW, encoding="utf-8"))
    req = urllib.request.Request(URL, headers={"User-Agent": "champions-ledger"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    os.makedirs(os.path.dirname(RAW), exist_ok=True)
    json.dump(data, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    data = fetch(a.force)
    nums = {}
    for row in data.get("results", []):
        num = int(row["url"].rstrip("/").rsplit("/", 1)[-1])
        nums[row["name"]] = num

    # our spelling is Serebii's; PokeAPI's is lowercase and hyphenated, and it
    # keys on the BASE species, so a regional form resolves to its base number
    def key(name):
        s = name.lower()
        for a_, b_ in (("é", "e"), ("'", ""), (".", ""), (" ", "-"),
                       ("_", "-"), (":", "")):
            s = s.replace(a_, b_)
        return s

    lookup = {key(k): v for k, v in nums.items()}
    # a few the two spell differently
    ALIAS = {"mr-mime": "mr-mime", "mime-jr": "mime-jr", "type-null": "type-null",
             "nidoran-f": "nidoran-f", "nidoran-m": "nidoran-m",
             "farfetchd": "farfetchd", "sirfetchd": "sirfetchd",
             "ho-oh": "ho-oh", "porygon-z": "porygon-z",
             "jangmo-o": "jangmo-o", "hakamo-o": "hakamo-o", "kommo-o": "kommo-o",
             "tapu-koko": "tapu-koko", "tapu-lele": "tapu-lele",
             "tapu-bulu": "tapu-bulu", "tapu-fini": "tapu-fini",
             "great-tusk": "great-tusk", "iron-treads": "iron-treads",
             "wo-chien": "wo-chien", "chien-pao": "chien-pao",
             "ting-lu": "ting-lu", "chi-yu": "chi-yu"}
    for k, v in ALIAS.items():
        if v in lookup:
            lookup.setdefault(k, lookup[v])

    def strip_form(name):
        """Alolan Ninetales is #38, the same as Ninetales.

        The Mega suffixes are a space, not a hyphen - "Mega Charizard X" -
        so splitting on the hyphen alone left the seven X/Y/Z Megas unresolved.
        """
        base = name.split("-")[0].strip()
        parts = base.split(" ")
        if len(parts) > 1 and parts[-1] in ("X", "Y", "Z"):
            base = " ".join(parts[:-1])
        return base

    resolved, missing = {}, []
    mons = json.load(open(os.path.join(ROOT, "data", "db", "pokemon.json"),
                          encoding="utf-8"))
    wt = json.load(open(os.path.join(ROOT, "data", "db", "weights.json"),
                        encoding="utf-8"))["weights"]
    every = sorted({p["name"] for p in mons} |
                   {p.get("species") for p in mons if p.get("species")} |
                   set(wt))
    for n in every:
        clean = n.replace("Mega ", "")
        for probe in (key(clean), key(strip_form(clean))):
            if probe in lookup:
                resolved[n] = lookup[probe]
                break
        else:
            missing.append(n)

    json.dump({"_comment":
               "National Dex numbers, the order Pokemon HOME lists in. Source: "
               "PokeAPI, used for this one fact only - see the module docstring "
               "in scripts/fetch_dex_numbers.py. Regional forms share their "
               "base species number, which is how HOME shows them.",
               "numbers": dict(sorted(resolved.items()))},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print("%d species from PokeAPI" % len(nums))
    print("wrote %s  -  %d names resolved, %d without a number"
          % (OUT, len(resolved), len(missing)))
    if missing:
        real = [m for m in missing if m in {p["name"] for p in mons}]
        if real:
            print("  IN THE CHAMPIONS DEX and unresolved: %s" % ", ".join(real))
        print("  (the rest are Smogon's fan-made CAP entries and cosmetic "
              "forms: %s ...)" % ", ".join(missing[:6]))


if __name__ == "__main__":
    main()
