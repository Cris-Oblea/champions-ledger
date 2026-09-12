"""Build the Champions type chart and nature table, then cross-check the chart.

Both tables already arrive inside Smogon's `dump-basics` response, which
`fetch_smogon.py` caches as `data/db/smogon_basics.json` - they were simply
never unpacked into anything queryable. This script does that, and then
verifies the chart against a completely independent source: the per-Pokemon
"Weakness" table on every cached Serebii Pokedex page.

Writes:
    data/db/typechart.json   attacking type -> defending type -> multiplier
    data/db/natures.json     nature -> per-stat multiplier + summary

Run after fetch_smogon.py and fetch_serebii.py:
    python scripts/build_typechart.py
"""
import os, re, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from serebii_text import read  # noqa: E402

DB = os.path.join(ROOT, "data", "db")
RAW = os.path.join(ROOT, "data", "raw")

# The order of the columns in Serebii's Weakness table, which is fixed.
SEREBII_ORDER = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice",
                 "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug",
                 "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"]


def load_basics():
    p = os.path.join(DB, "smogon_basics.json")
    if not os.path.exists(p):
        sys.exit("missing %s - run scripts/fetch_smogon.py first" % p)
    return json.load(open(p, encoding="utf-8"))


def build_chart(basics):
    """attacking -> {defending: multiplier}, Champions-legal types only."""
    chart = {}
    for t in basics.get("types") or []:
        if "Champions" not in (t.get("genfamily") or []):
            continue
        chart[t["name"]] = {d: m for d, m in t.get("atk_effectives") or []}
    return chart


def build_natures(basics):
    out = {}
    for n in basics.get("natures") or []:
        if "Champions" not in (n.get("genfamily") or []):
            continue
        mult = {k: n[k] for k in ("hp", "atk", "def", "spa", "spd", "spe")}
        raised = [k for k, v in mult.items() if v > 1]
        lowered = [k for k, v in mult.items() if v < 1]
        out[n["name"]] = {
            "multipliers": mult,
            "raises": raised[0] if raised else None,
            "lowers": lowered[0] if lowered else None,
            # Smogon leaves `summary` empty for the five neutral natures.
            "summary": n.get("summary") or "neutral - no stat change",
        }
    return out


def serebii_weaknesses():
    """Every cached Pokedex page's Weakness row: slug -> {type: multiplier}.

    Pages that merge several forms carry several Weakness tables and cannot be
    attributed safely (see the note in CLAUDE.md), so those are skipped rather
    than guessed at.
    """
    d = os.path.join(RAW, "pokedex")
    if not os.path.isdir(d):
        return {}
    out = {}
    row = re.compile(r'<td class="footype">\s*\*([\d.]+)\s*</td>')
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".html"):
            continue
        s = read(os.path.join(d, fn))
        blocks = []
        for m in re.finditer(r">Weakness<", s):
            vals = row.findall(s[m.end():m.end() + 6000])
            if len(vals) >= 18:
                blocks.append([float(v) for v in vals[:18]])
        if len(blocks) == 1:
            out[fn[:-5]] = dict(zip(SEREBII_ORDER, blocks[0]))
    return out


def verify(chart, weak):
    """Check Smogon's chart reproduces Serebii's per-Pokemon weakness rows."""
    mons = json.load(open(os.path.join(DB, "pokemon.json"), encoding="utf-8"))
    mons = mons["rows"] if isinstance(mons, dict) and "rows" in mons else mons
    # pokemon.json only carries a slug on Mega entries, so index by species
    # reduced to the same shape as a Serebii page filename.
    def pagekey(x):
        return re.sub(r"[^a-z0-9]", "", (x or "").lower())

    by_slug = {}
    for p in mons:
        by_slug.setdefault(pagekey(p["species"]), []).append(p)

    checked = agree = 0
    problems = []
    for slug, row in weak.items():
        forms = by_slug.get(slug) or []
        # Only single-form species: a page with one Weakness table but several
        # forms in the dex is ambiguous about which form it describes.
        forms = [f for f in forms if not f.get("is_mega")]
        if len(forms) != 1:
            continue
        types = forms[0]["types"]
        for atk, serebii_mult in row.items():
            expected = 1.0
            for d in types:
                expected *= chart.get(atk, {}).get(d, 1)
            checked += 1
            if abs(expected - serebii_mult) < 1e-9:
                agree += 1
            else:
                problems.append((forms[0]["name"], atk, serebii_mult, expected))
    return checked, agree, problems


def main():
    basics = load_basics()
    chart = build_chart(basics)
    natures = build_natures(basics)

    json.dump(chart, open(os.path.join(DB, "typechart.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, sort_keys=True)
    json.dump(natures, open(os.path.join(DB, "natures.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, sort_keys=True)
    print("Type chart: %d attacking types (source: Smogon dump-basics)" % len(chart))
    print("Natures:    %d (%d that change a stat)"
          % (len(natures), sum(1 for v in natures.values() if v["raises"])))

    weak = serebii_weaknesses()
    print("\nCross-check against Serebii Pokedex Weakness tables")
    print("  %d pages with an unambiguous single Weakness table" % len(weak))
    checked, agree, problems = verify(chart, weak)
    print("  %d matchups checked, %d agree" % (checked, agree))
    if problems:
        print("  DISAGREEMENTS (Champions may differ from the standard chart):")
        for name, atk, got, exp in problems[:40]:
            print("    %-22s vs %-9s Serebii *%s, chart says *%s"
                  % (name, atk, got, exp))
    else:
        print("  No disagreement: Smogon's Champions chart and Serebii's "
              "per-Pokemon tables are consistent.")


if __name__ == "__main__":
    main()
