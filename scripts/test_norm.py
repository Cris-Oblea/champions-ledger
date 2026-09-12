"""Check that the same creature spelled five different ways lands on one key.

Each source names forms its own way: Serebii suffixes ("Ninetales-Alola"),
pokebase prefixes or parenthesises ("Alolan Ninetales", "Lycanroc (Dusk)"),
pokedata brackets ("Basculegion [Male]"), Pikalytics hyphenates
("Charizard-Mega-Y"). query.norm() has to collapse all of them.

Half the cases below are for species that are NOT in Champions yet. Regulations
add Pokemon (M-B brought 22 species and 16 Megas), and when one with cosmetic or
in-battle forms arrives, the joins should work immediately rather than dropping
rows quietly. These cases lock that in.

    python scripts/test_norm.py
    python scripts/test_norm.py -v
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from query import norm, species_norm  # noqa: E402

# Every group must collapse to one key. First entry is the dex spelling.
SAME = [
    # --- live in Champions today ---
    ["Ninetales-Alola", "Alolan Ninetales", "Ninetales [Alolan Form]"],
    ["Raichu-Alola", "Alolan Raichu", "Raichu [Alolan Form]"],
    ["Samurott-Hisui", "Hisuian Samurott", "Samurott [Hisuian Form]"],
    ["Arcanine-Hisui", "Hisuian Arcanine", "Arcanine [Hisuian Form]"],
    ["Slowking-Galar", "Galarian Slowking", "Slowking [Galarian Form]"],
    ["Rotom-Wash", "Wash Rotom", "Rotom [Wash Form]"],
    ["Rotom-Heat", "Heat Rotom", "Rotom [Heat Form]"],
    ["Lycanroc-Dusk", "Lycanroc (Dusk)", "Lycanroc [Dusk Form]"],
    ["Floette-Eternal", "Floette (Eternal)", "Floette [Eternal Flower]"],
    ["Tauros-Paldea Aqua", "Tauros - Paldea Aqua Breed",
     "Paldean Tauros - Aqua Breed"],
    ["Basculegion", "Basculegion [Male]", "Basculegion (Male)"],
    ["Basculegion-Female", "Basculegion (Female)", "Basculegion [Female]"],
    ["Meowstic-Female", "Meowstic (Female)", "Female Meowstic"],
    ["Mega Charizard Y", "Charizard-Mega-Y", "Mega Charizard Y"],
    ["Mega Charizard X", "Charizard-Mega-X", "Mega Charizard X"],
    ["Mega Raichu X", "Raichu-Mega-X", "Mega Raichu X"],
    ["Mega Floette", "Floette-Eternal-Mega", "Mega Floette"],
    ["Sinistcha", "Sinistcha [Unremarkable Form]", "Sinistcha [Masterpiece Form]"],
    ["Maushold", "Maushold [Family of Four]", "Maushold [Family of Three]"],
    ["Aegislash", "Aegislash (Blade)", "Aegislash [Shield Forme]"],
    ["Kommo-o", "Kommo-o", "Kommo-O"],
    # --- arrived with Regulation M-C (2026-09-09) ---
    ["Toxtricity", "Toxtricity (Amped)", "Amped Toxtricity"],
    ["Toxtricity-L", "Toxtricity (Low Key)", "Low Key Toxtricity"],
    ["Indeedee", "Indeedee (Male)", "Indeedee [Male]"],
    ["Indeedee-Female", "Indeedee (Female)", "Female Indeedee"],
    ["Persian-Alola", "Alolan Persian", "Persian [Alolan Form]"],
    ["Squawkabilly", "Squawkabilly (Blue Plumage)",
     "Squawkabilly [Green Plumage]"],
    ["Mega Garchomp Z", "Garchomp-Mega-Z", "Mega Garchomp Z"],
    ["Mega Absol Z", "Absol-Mega-Z", "Mega Absol Z"],
    ["Mega Lucario Z", "Lucario-Mega-Z", "Mega Lucario Z"],

    # --- not in Champions yet: must still collapse if they arrive ---
    ["Sneasel-Hisui", "Hisuian Sneasel", "Sneasel [Hisuian Form]"],
    ["Lilligant-Hisui", "Hisuian Lilligant", "Lilligant [Hisuian Form]"],
    ["Eiscue", "Eiscue (Noice Face)", "Eiscue [Ice Face]"],
    ["Sinistea", "Sinistea (Antique)", "Sinistea [Phony Form]"],
    ["Palafin", "Palafin (Hero)", "Palafin [Hero Form]"],
    ["Mimikyu", "Mimikyu (Busted)", "Mimikyu [Disguised Form]"],
    ["Morpeko", "Morpeko (Hangry)", "Morpeko [Full Belly Mode]"],
    ["Urshifu-Rapid Strike", "Rapid Strike Urshifu", "Urshifu [Rapid Strike]"],
    ["Gastrodon", "Gastrodon (East Sea)", "Gastrodon [West Sea]"],
    ["Darmanitan-Galar", "Galarian Darmanitan", "Darmanitan [Galarian Form]"],
    ["Dudunsparce", "Dudunsparce (Three-Segment)", "Dudunsparce [Two-Segment]"],
    ["Wishiwashi", "Wishiwashi (School)", "Wishiwashi [Solo Form]"],
    ["Minior", "Minior (Core)", "Minior [Meteor Form]"],
    ["Oinkologne-Female", "Oinkologne (Female)", "Female Oinkologne"],
]

# These must NOT collapse together - collapsing them would merge real forms.
DIFFERENT = [
    ("Mega Charizard X", "Mega Charizard Y"),
    ("Mega Raichu X", "Mega Raichu Y"),
    ("Charizard", "Mega Charizard X"),
    ("Ninetales", "Ninetales-Alola"),
    ("Basculegion", "Basculegion-Female"),
    ("Meowstic", "Meowstic-Female"),
    ("Rotom-Wash", "Rotom-Heat"),
    ("Tauros-Paldea Aqua", "Tauros-Paldea Blaze"),
    ("Floette", "Floette-Eternal"),
    ("Floette-Eternal", "Mega Floette"),
    ("Toxtricity", "Toxtricity-L"),
    ("Mega Garchomp", "Mega Garchomp Z"),
    ("Mega Absol", "Mega Absol Z"),
    ("Mega Lucario", "Mega Lucario Z"),
    ("Garchomp", "Mega Garchomp Z"),
    ("Persian", "Persian-Alola"),
    ("Indeedee", "Indeedee-Female"),
    ("Farfetch'd", "Sirfetch'd"),
    ("Slowbro", "Slowbro-Galar"),
    ("Lycanroc-Dusk", "Lycanroc-Midnight"),
    ("Sneasel", "Sneasel-Hisui"),
]


def main():
    verbose = "-v" in sys.argv
    failed = 0

    print("--- groups that must share one key ---")
    for group in SAME:
        keys = {norm(n) for n in group}
        ok = len(keys) == 1
        if not ok:
            failed += 1
            print("  FAIL  %s" % group[0])
            for n in group:
                print("          %-34s -> %s" % (n, norm(n)))
        elif verbose:
            print("  ok    %-24s -> %s" % (group[0], keys.pop()))
    if not verbose:
        print("  %d/%d groups collapse correctly" % (len(SAME) - failed, len(SAME)))

    print("\n--- pairs that must stay distinct ---")
    bad = 0
    for a, b in DIFFERENT:
        if norm(a) == norm(b):
            bad += 1
            print("  FAIL  %s and %s both -> %s" % (a, b, norm(a)))
        elif verbose:
            print("  ok    %-22s != %-22s" % (norm(a), norm(b)))
    if not verbose:
        print("  %d/%d pairs stay distinct" % (len(DIFFERENT) - bad, len(DIFFERENT)))

    print("\n--- species_norm strips form qualifiers ---")
    sp = 0
    for name, want in [("Ninetales-Alola", "ninetales"),
                       ("Mega Charizard Y", "charizard"),
                       ("Basculegion-Female", "basculegion"),
                       ("Rotom-Wash", "rotom"),
                       ("Tauros-Paldea Blaze", "tauros"),
                       ("Mega Raichu X", "raichu"),
                       # M-C's second-Mega suffix. "z" was missing from the
                       # form list beside x and y, so these three kept it,
                       # matched no base species, and came back with no
                       # movepool at all in query.py.
                       ("Mega Garchomp Z", "garchomp"),
                       ("Mega Absol Z", "absol"),
                       ("Mega Lucario Z", "lucario")]:
        got = species_norm(name)
        if got != want:
            sp += 1
            print("  FAIL  %-22s -> %-14s (want %s)" % (name, got, want))
        elif verbose:
            print("  ok    %-22s -> %s" % (name, got))
    if not sp and not verbose:
        print("  all 9 resolve to their base species")

    total = failed + bad + sp
    print("\n%s" % ("ALL PASS" if not total else "%d FAILURES" % total))
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
