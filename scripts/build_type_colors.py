#!/usr/bin/env python3
"""The eighteen type colours, taken from Pokemon's own stylesheet.

    python scripts/build_type_colors.py           # fetch, parse, write
    python scripts/build_type_colors.py --check   # has upstream moved?

WHY THIS IS FETCHED AND NOT TYPED.

The app's palette was eighteen hand-written hexes with no source next to them -
Fire was #C8501E, a dark brick, where the official Fire is #FD7D24. They had
been darkened at some point so white text would sit on them, and a darkened
colour is no longer the colour. The player asked the obvious question
(2026-09-16): "son esos los originales o solo un aproximado?"

`pokemon.com` answers it exactly. Its Pokedex ships one rule per type, and the
rule carries three facts, not one:

    .background-color-fire{
      background: linear-gradient(180deg, #fd7d24 50%, #fd7d24 50%);
      background-color:#fd7d24;
      color:#fff }

  * the TOP half colour, which is the type's colour
  * the BOTTOM half colour, which for most types repeats the top - but for
    THREE it does not, and the player spotted that before this script did:
    Flying #3dc7ef over #bdb9b8, Ground #f7de3f over #ab9842, and Dragon
    #53a4cf over #f16e57. Those types are officially two-toned.
  * the TEXT colour, #fff or #212121, which is a decision they already made
    per type. Sixteen of the eighteen fail a 4.5:1 contrast check against
    white, so this is not decoration - reading it is what lets the app keep
    the real colour instead of darkening it to make white text work.

Reading all three means the app never has to invent any of them.

THIS IS A PRESENTATION SOURCE, NOT A GAME SOURCE. It says nothing about what a
type does in Champions - the type chart lives in data/db/typechart.json and is
Serebii's, cross-checked. This file only decides what colour a badge is.
"""
import argparse
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "db" / "type_colors.json"
CSS = "https://assets.pokemon.com/static2/_ui/css/main.css"

# The app writes type names capitalised, the stylesheet lowercases them.
RULE = re.compile(r"\.background-color-([a-z]+)\s*\{([^}]*)\}")
GRAD = re.compile(r"background\s*:\s*linear-gradient\(180deg,\s*"
                  r"(#[0-9a-fA-F]{6})\s*50%,\s*(#[0-9a-fA-F]{6})\s*50%\)")
FLAT = re.compile(r"background-color\s*:\s*(#[0-9a-fA-F]{6})")
INK = re.compile(r"(?<![-a-z])color\s*:\s*(#[0-9a-fA-F]{3,6})")

# Champions has no Terastallization, so no Pokemon is Stellar - but the type
# exists in the chart, and a missing colour would paint a card grey with no
# explanation. It is NOT on pokemon.com's Pokedex, so it is declared here as
# the one colour this file does not get to claim is official.
EXTRA = {"Stellar": {"top": "#3F7F7A", "bottom": "#3F7F7A", "ink": "#FFFFFF",
                     "official": False}}


def luminance(hexstr):
    def chan(c):
        c = int(hexstr[c:c + 2], 16) / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = chan(1), chan(3), chan(5)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def fetch():
    req = urllib.request.Request(CSS, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")


def parse(css):
    out = {}
    for m in RULE.finditer(css):
        name, body = m.group(1), m.group(2)
        g, f, i = GRAD.search(body), FLAT.search(body), INK.search(body)
        if not f:
            continue
        top = (g.group(1) if g else f.group(1)).upper()
        bottom = (g.group(2) if g else f.group(1)).upper()
        ink = (i.group(1) if i else "#FFFFFF").upper()
        if len(ink) == 4:                       # #fff -> #FFFFFF
            ink = "#" + "".join(c * 2 for c in ink[1:])
        out[name.capitalize()] = {"top": top, "bottom": bottom, "ink": ink,
                                  "official": True}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="fail if upstream no longer matches what is stored")
    args = ap.parse_args()

    got = parse(fetch())
    if len(got) < 18:
        sys.exit("only %d type rules found at %s - the page has been "
                 "restructured, do not overwrite the stored table" % (len(got), CSS))
    got.update(EXTRA)

    for name, row in sorted(got.items()):
        row["contrast"] = round(contrast(row["top"], row["ink"]), 2)
        row["two_tone"] = row["top"] != row["bottom"]

    if args.check:
        if not OUT.exists():
            sys.exit("no stored table yet - run without --check")
        old = json.loads(OUT.read_text(encoding="utf-8"))
        moved = [k for k in got
                 if old.get(k, {}).get("top") != got[k]["top"]
                 or old.get(k, {}).get("bottom") != got[k]["bottom"]
                 or old.get(k, {}).get("ink") != got[k]["ink"]]
        if moved:
            sys.exit("upstream moved for: " + ", ".join(sorted(moved)))
        print("type colours match upstream (%d types)" % len(got))
        return

    OUT.write_text(json.dumps(got, indent=1, sort_keys=True) + "\n",
                   encoding="utf-8")
    two = [k for k, v in got.items() if v["two_tone"]]
    dark = [k for k, v in got.items() if v["ink"] != "#FFFFFF"]
    low = [k for k, v in got.items() if v["contrast"] < 4.5]
    print("wrote %s  (%d types)" % (OUT.relative_to(ROOT), len(got)))
    print("  two-toned:      " + ", ".join(sorted(two)))
    print("  dark text:      " + ", ".join(sorted(dark)))
    if low:
        print("  BELOW 4.5:1 even with their own ink: " + ", ".join(sorted(low)))


if __name__ == "__main__":
    main()
