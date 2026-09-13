#!/usr/bin/env python3
"""Keep the README's numbers honest by generating them.

    python scripts/build_readme.py           # rewrite the generated blocks
    python scripts/build_readme.py --check   # fail if they are out of date

Every count in the README had drifted by 2026-09-13 - 308 forms against a real
345, 200 abilities against 215, a regulation two versions old, and instructions
telling the reader to hand-edit a file the app replaced. None of it was wrong
when it was written, which is the point: a number typed into prose is a promise
to come back and retype it, and nobody ever does.

So the counts live between markers and are written from the data itself, and
`--check` is wired into daily.py's gate. The README cannot drift without the
build refusing to publish - the same rule the rest of this repo already
follows: derive what can be derived, and check what cannot.

The PROSE is still written by hand. Only facts that have a single source of
truth belong in here.
"""
import argparse, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
README = os.path.join(ROOT, "README.md")


def load(rel, key=None):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    d = json.load(io.open(p, encoding="utf-8"))
    return d[key] if key else d


def _payload(rel):
    """How many THINGS a meta file holds, not how many keys wrap them."""
    d = load(rel)
    if not isinstance(d, dict):
        return len(d or [])
    for k in ("rows", "pokemon", "analyses", "numbers", "weights", "prices"):
        if isinstance(d.get(k), (list, dict)):
            return len(d[k])
    if isinstance(d.get("count"), int):
        return d["count"]
    return len([k for k in d if not k.startswith("_")])


def counts():
    """The table of what the database holds, row by row."""
    mons = load("data/db/pokemon.json") or []
    moves = load("data/db/moves.json") or []
    rows = [
        ("`data/db/pokemon.json`", len(mons),
         "Every playable form: types, base stats, abilities, and the %d Megas"
         % sum(1 for p in mons if p.get("is_mega"))),
        ("`data/db/moves.json`",
         "%d (%d useable)" % (len(moves), sum(1 for m in moves if m.get("useable"))),
         "Champions move data, 15 flags, and who learns it"),
        ("`data/db/abilities.json`", len(load("data/db/abilities.json") or []),
         "Champions ability text and every carrier"),
        ("`data/db/items.json`", len(load("data/db/items.json") or []),
         "Items and Mega Stones with their VP price"),
        ("`data/db/learnsets.json`", len(load("data/db/learnsets.json") or {}),
         "Reverse index: Pokemon to movepool"),
        ("`data/db/ability_moves.json`",
         len((load("data/db/ability_moves.json") or {}).get("abilities") or {}),
         "Which ability changes which move, derived from the move text"),
        ("`data/db/typechart.json`", 18, "The type chart, cross-checked on 3402 matchups"),
        ("`data/meta/usage_pokemon.json`",
         _payload("data/meta/usage_pokemon.json"),
         "Ladder usage per Pokemon"),
        ("`data/meta/usage_moves.json`",
         _payload("data/meta/usage_moves.json"),
         "Ladder usage per move"),
        # These two wrap their payload in metadata, so a bare len() counts
        # "source", "fetched", "count"... - 5 speed tiers and 7 analyses, both
        # nonsense. A generated number that is WRONG is worse than a typed one,
        # because nobody thinks to doubt it. Read the documented count, or the
        # rows, and never the envelope.
        ("`data/meta/speed_tiers.json`", _payload("data/meta/speed_tiers.json"),
         "Base Speed to real Speed at every investment"),
        ("`data/meta/smogon_analyses.json`",
         _payload("data/meta/smogon_analyses.json"),
         "Smogon's written VGC analyses"),
    ]
    out = ["| File | Rows | What it holds |", "|---|---|---|"]
    for name, n, what in rows:
        out.append("| %s | %s | %s |" % (name, n, what))
    return "\n".join(out)


def vintage():
    """What regulation the data describes, and when it was fetched."""
    u = load("data/meta/usage_pokemon.json") or {}
    reg = "unknown"
    raw = os.path.join(ROOT, "data", "raw", "pokebase", "pokemon.html")
    if os.path.exists(raw):
        s = io.open(raw, encoding="utf-8", errors="replace").read()
        m = re.search(r'defaultLatestRegulationSetSlug\\?":\\?"([a-z\-]+)', s)
        if m:
            reg = m.group(1).upper()
    return ("Regulation **%s**. Ladder usage fetched %s, from %d Pokemon.\n"
            "Tournament data is Worlds 2026, played under M-B - that is history, "
            "not stale." % (reg, u.get("fetched", "?"),
                            len(u.get("rows") or [])))


BLOCKS = {"COUNTS": counts, "VINTAGE": vintage}


def render(text):
    for name, fn in BLOCKS.items():
        pat = re.compile(r"(<!-- %s:START -->\n).*?(\n<!-- %s:END -->)"
                         % (name, name), re.S)
        if not pat.search(text):
            sys.exit("README has no %s block - add the markers back" % name)
        text = pat.sub(lambda m: m.group(1) + fn() + m.group(2), text)
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="exit non-zero if the README is out of date")
    a = ap.parse_args()

    cur = io.open(README, encoding="utf-8").read()
    new = render(cur)
    if cur == new:
        print("README is current")
        return 0
    if a.check:
        print("README is OUT OF DATE - run: python scripts/build_readme.py")
        return 1
    io.open(README, "w", encoding="utf-8").write(new)
    print("README updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
