"""Audit form coverage: every regional form, gender form and Mega accounted for.

Several sources spell the same creature differently and some pages merge forms
into one block, so it is easy to silently lose a variant. This compares the
built dex against Serebii's master list and against the names the other sources
use, and reports anything that appears in one place but not the other.

Usage:
    python scripts/audit_forms.py
    python scripts/audit_forms.py --verbose
"""
import os, re, sys, json, html
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from query import norm, species_norm, meta  # noqa: E402

from serebii_text import read

RAW = os.path.join(ROOT, "data", "raw")
DB = os.path.join(ROOT, "data", "db")


def master_list():
    """Every row of Serebii's available-Pokemon table, with its sprite suffix."""
    p = os.path.join(RAW, "pages", "pokemon.html")
    s = read(p)
    s = s[s.find("List of Available"):]
    pat = re.compile(
        r'#(\d{4}).*?<img src="/pokemonhome/pokemon/small/([^"]+)".*?'
        r'<a href="/pokedex-champions/([^"]+)/">([^<]+)<br(.*?)</tr>', re.S)
    rows = []
    for m in pat.finditer(s):
        name = re.sub(r"\s+", " ", html.unescape(m.group(4))).strip()
        sprite = m.group(2).rsplit(".", 1)[0]
        suffix = sprite.split("-", 1)[1] if "-" in sprite else ""
        types = []
        for t in re.findall(r"/pokedex-bw/type/(\w+)\.gif", m.group(5)):
            t = t.capitalize()
            if t not in types:
                types.append(t)
        rows.append({"dex": int(m.group(1)), "slug": m.group(3), "name": name,
                     "sprite": sprite, "suffix": suffix, "types": types})
    return rows


# Species whose extra rows are declared in build_db.FIXED_FORMS rather than read
# off an attackdex table, because the forms share the base form's sprite.
FIXED_SPECIES = {"Squawkabilly", "Gourgeist"}

# Alternate forms that really are decoration in Champions, with the reason. A
# page listing forms is not a problem by itself - Alcremie has dozens and every
# one of them battles identically. What must never happen again is the opposite:
# a page that splits ABILITIES or STATS per form while the dex carries one row.
# Squawkabilly did exactly that and Sheer Force was missing from the database
# for as long as it went unnoticed.
COSMETIC_OK = {
    "alcremie": "creams and sweets: appearance only",
    "floette": "flower colour is decoration; only the Eternal form is in Champions",
    "florges": "flower colour is decoration",
    "furfrou": "trims are decoration and revert after five days",
    "maushold": "Family of Three and Four share every number",
    "pikachu": "the caps are distribution-only and battle identically",
    "polteageist": "Phony and Antique differ by an authenticity stamp",
    "sinistcha": "Unremarkable and Masterpiece differ by an authenticity stamp",
    "vivillon": "Champions locks Vivillon to the Fancy pattern",
}

# Forms an ABILITY flips during the battle. These are NOT cosmetic - the
# transformation is a real mechanic every time - but they are one registration,
# so they never become a dex row. What separates them is what the change
# actually moves, which is the only part a calculator has to know:
#   stats  -> stored as `battle_forms` on the base row, with the spread
#   type   -> stored as `battle_forms` too, carrying `types`
#   neither-> nothing to store on the Pokemon; the effect lives in the ability
#             text (Disguise) or in a move's own type (Aura Wheel)
BATTLE_FORM_OK = {
    "aegislash": ("stats", "Stance Change: Blade 140 Atk / Shield 140 Def"),
    "palafin": ("stats", "Zero to Hero on switch-out: Attack 70 -> 160"),
    "castform": ("type", "Forecast: Fire in sun, Water in rain, Ice in snow"),
    "morpeko": ("neither", "Hunger Switch retypes Aura Wheel Electric -> Dark; "
                           "the Pokemon's own numbers do not move"),
    "mimikyu": ("neither", "Disguise eats one hit and costs 1/8 max HP when it "
                           "breaks; the Pokemon's own numbers do not move"),
}

# Species whose forms are already separate dex rows, so a split page is expected.
ROWS_ALREADY = {
    "rotom": "each appliance is its own dex row",
    "lycanroc": "Midday, Midnight and Dusk are all dex rows",
    "toxtricity": "Amped and Low Key are both dex rows",
    "tauros": "the three Paldean breeds are all dex rows",
    "squawkabilly": "all four plumages are dex rows",
    "gourgeist": "all four sizes are dex rows",
}
# Regional forms announce themselves as "<Region> Form Abilities" and every one
# of them already has its own dex row, so they are not the interesting case.
_REGIONAL = re.compile(r"(Alola|Hisui|Galar|Paldea|Kanto|Johto|Unova|Kalos)",
                       re.I)


def alternate_form_watch(dex):
    """Flag a Serebii page that splits a form's abilities with no dex row for it.

    This is the check that would have caught Squawkabilly. Serebii writes the
    per-form abilities as "<b>Green & Blue Plumage Abilities</b>:" headers and
    lists the forms in an "Alternate Forms" table; when a page does that and the
    dex has a single row for the species, an ability is being thrown away.
    """
    print("\n--- 7. Serebii pages that split a form, checked against the dex ---")
    have = defaultdict(set)
    for p in dex:
        have[norm(p.get("species") or p["name"])].add(p["name"])
    pdir = os.path.join(RAW, "pokedex")
    problems = 0
    for fn in sorted(os.listdir(pdir)):
        slug = fn[:-5]
        s = read(os.path.join(pdir, fn))
        heads = [re.sub(r"<[^>]+>", "", m.group(1)).strip()
                 for m in re.finditer(r"<b>([^<]*?Abilities[^<]*?)</b>\s*:", s)]
        heads = [h for h in heads if h.lower() != "abilities"
                 and not _REGIONAL.search(h)]
        stat_blocks = re.findall(r"<h2>Stats - ([^<]+)</h2>", s)
        stat_blocks = [b for b in stat_blocks if not _REGIONAL.search(b)]
        if not heads and not stat_blocks:
            continue
        rows = have.get(norm(slug), set())
        known = (slug in COSMETIC_OK or slug in BATTLE_FORM_OK
                 or slug in ROWS_ALREADY)
        if len(rows) > 1 or known:
            continue
        problems += 1
        print("  PROBLEM %-14s splits %s but the dex holds one row"
              % (slug, heads or stat_blocks))
    if not problems:
        print("  none: every page that splits a form has the rows to match,")
        print("  or a recorded reason (%d cosmetic, %d in-battle, %d already rows)"
              % (len(COSMETIC_OK), len(BATTLE_FORM_OK), len(ROWS_ALREADY)))

    # An in-battle form that moves a stat or a type must actually carry it.
    bad = []
    for slug, (what, why) in sorted(BATTLE_FORM_OK.items()):
        row = next((p for p in dex if norm(p["name"]) == norm(slug)), None)
        if not row:
            continue
        bf = row.get("battle_forms") or {}
        if what == "stats" and not any("hp" in v for v in bf.values()):
            bad.append("%s should carry a spread per form" % slug)
        if what == "type" and not any(v.get("types") for v in bf.values()):
            bad.append("%s should carry a typing per form" % slug)
        if what == "neither" and bf:
            bad.append("%s carries battle_forms but nothing about it changes"
                       % slug)
    for b in bad:
        print("  PROBLEM %s" % b)
    if not bad:
        print("  in-battle forms: each carries exactly what it changes")


def main():
    verbose = "--verbose" in sys.argv
    dex = json.load(open(os.path.join(DB, "pokemon.json"), encoding="utf-8"))
    master = master_list()

    print("Serebii master list : %d rows" % len(master))
    print("data/db/pokemon.json: %d forms (%d mega)"
          % (len(dex), sum(1 for p in dex if p["is_mega"])))

    by_norm = {norm(p["name"]): p for p in dex}
    dupes = defaultdict(list)
    for p in dex:
        dupes[norm(p["name"])].append(p["name"])
    collisions = {k: v for k, v in dupes.items() if len(v) > 1}

    print("\n--- 1. Name collisions inside the dex ---")
    if collisions:
        for k, v in collisions.items():
            print("  %-28s <- %s" % (k, v))
    else:
        print("  none: every form has a unique key")

    print("\n--- 2. Master-list rows missing from the dex ---")
    missing = []
    for r in master:
        # a suffixed sprite means a distinct form; the dex names it Species-Form
        if norm(r["name"]) in by_norm:
            continue
        cands = [p for p in dex if p["dex"] == r["dex"]]
        hit = None
        for c in cands:
            if c["types"] == r["types"] and c["is_mega"] == r["name"].lower().startswith("mega"):
                hit = c
                break
        if hit is None:
            missing.append(r)
        elif verbose:
            print("  matched by type: %s (list) == %s (dex)" % (r["name"], hit["name"]))
    if missing:
        for r in missing:
            print("  MISSING  #%04d %-22s sprite=%-10s types=%s"
                  % (r["dex"], r["name"], r["sprite"], "/".join(r["types"])))
    else:
        print("  none: every master-list row resolves to a dex form")

    print("\n--- 3. Forms in the dex that the master list does not spell out ---")
    master_dex = defaultdict(list)
    for r in master:
        master_dex[r["dex"]].append(r)
    extra = []
    for p in dex:
        if norm(p["name"]) in {norm(r["name"]) for r in master_dex.get(p["dex"], [])}:
            continue
        extra.append(p)
    for p in sorted(extra, key=lambda x: x["dex"]):
        print("  #%04d %-26s %-16s (%s)"
              % (p["dex"], p["name"], "/".join(p["types"]),
                 "declared in FIXED_FORMS" if p.get("species") in FIXED_SPECIES
                 else "from attackdex form tables"))
    if not extra:
        print("  none")

    print("\n--- 4. Multi-form species: what we hold per species ---")
    groups = defaultdict(list)
    for p in dex:
        groups[species_norm(p["name"]) or norm(p["name"])].append(p)
    multi = {k: v for k, v in groups.items() if len(v) > 1}
    for k in sorted(multi):
        forms = sorted(multi[k], key=lambda p: (p["is_mega"], p["name"]))
        print("  %-16s %s" % (k, " | ".join(
            "%s [%s]" % (p["name"], "/".join(p["types"])) for p in forms)))

    print("\n--- 5. Gender-split species present in Champions ---")
    gender = ["Basculegion", "Meowstic", "Indeedee", "Oinkologne", "Unfezant",
              "Frillish", "Jellicent", "Pyroar", "Hippowdon"]
    learn = json.load(open(os.path.join(DB, "learnsets.json"), encoding="utf-8"))
    for g in gender:
        forms = [p["name"] for p in dex if species_norm(p["name"]) == norm(g)]
        keys = [k for k in learn if species_norm(k) == norm(g)]
        if forms or keys:
            print("  %-14s dex=%-34s learnsets=%s"
                  % (g, ", ".join(forms) or "-", ", ".join(keys) or "-"))

    print("\n--- 6. Names used by the meta sources that do not resolve ---")
    # pokebase publishes its whole Pokedex, including species that are not legal
    # in Champions; those sit at 0.00% usage. Only a non-zero one is a real gap.
    zero_usage = {r["name"] for r in (meta("usage_pokemon") or {}).get("rows", [])
                  if not r.get("usage_percent")}
    unresolved = defaultdict(set)
    src = {
        "pokebase usage": [r["name"] for r in
                           (meta("usage_pokemon") or {}).get("rows", [])],
    }
    # All three age divisions share the roster, so a name only one of them uses
    # still has to resolve. Each is listed separately: which division dropped a
    # row is the first thing you want to know.
    for _div in ("masters", "seniors", "juniors"):
        _t = meta("tournament_0000191_" + _div)
        if _t:
            src["worlds " + _div] = [s.get("pokemon") for p in _t.get("players", [])
                                     for s in p.get("team", [])]
    for fmt in ("championstournaments", "battledataregmbs3"):
        pk = meta("pikalytics_" + fmt)
        if pk:
            src["pikalytics " + fmt] = [r["name"] for r in pk.get("pokemon", [])]
    for label, names in src.items():
        for n in names:
            if not n:
                continue
            if norm(n) not in by_norm:
                unresolved[label].add(n)
    real, noise = {}, {}
    for label, names in unresolved.items():
        real[label] = sorted(n for n in names if n not in zero_usage)
        noise[label] = sorted(n for n in names if n in zero_usage)
    problems = False
    for label in sorted(real):
        if real[label]:
            problems = True
            print("  PROBLEM %-24s %s" % (label, ", ".join(real[label])))
    if not problems:
        print("  none with any usage: every name that matters maps onto a dex form")

    # These sit at 0.00% because pokebase publishes its whole Pokedex while
    # Champions only allows part of it. If a regulation adds one of them it
    # starts scoring usage and moves into the PROBLEM list above - that is the
    # signal to re-run fetch_serebii.py + build_db.py so the dex picks it up.
    watch = sorted({n for names in noise.values() for n in names})
    if watch:
        print("\n  Watchlist - not Champions-legal today, 0.00%% usage (%d):" % len(watch))
        for i in range(0, len(watch), 6):
            print("    " + ", ".join(watch[i:i + 6]))
        print("  If any of these starts showing usage, a new regulation added it:")
        print("    python scripts/fetch_serebii.py list && python scripts/build_db.py")

    alternate_form_watch(dex)


if __name__ == "__main__":
    main()
