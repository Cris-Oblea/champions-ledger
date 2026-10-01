"""Audit form coverage: every regional form, gender form and Mega accounted for.

Several sources spell the same creature differently and some pages merge forms
into one block, so it is easy to silently lose a variant. This compares the
built dex against Serebii's master list and against the names the other sources
use, and reports anything that appears in one place but not the other.

Usage:
    python scripts/audit_forms.py
"""
import html
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

from dex import DIVISIONS, meta, norm, species_norm, tournament
from paths import DB, RAW
from serebii_text import read


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
        for raw in re.findall(r"/pokedex-bw/type/(\w+)\.gif", m.group(5)):
            t = raw.capitalize()
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
    "morpeko": ("neither", ("Hunger Switch retypes Aura Wheel Electric -> Dark; "
                            "the Pokemon's own numbers do not move")),
    "mimikyu": ("neither", ("Disguise eats one hit and costs 1/8 max HP when it "
                            "breaks; the Pokemon's own numbers do not move")),
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


def _split_heads(s):
    """The per-form ability headers and stat blocks a page splits into,
    leaving out the plain "Abilities" and the regional forms."""
    heads = [re.sub(r"<[^>]+>", "", m.group(1)).strip()
             for m in re.finditer(r"<b>([^<]*?Abilities[^<]*?)</b>\s*:", s)]
    heads = [h for h in heads if h.lower() != "abilities"
             and not _REGIONAL.search(h)]
    stat_blocks = re.findall(r"<h2>Stats - ([^<]+)</h2>", s)
    stat_blocks = [b for b in stat_blocks if not _REGIONAL.search(b)]
    return heads, stat_blocks


def _split_pages(dex):
    have = defaultdict(set)
    for p in dex:
        have[norm(p.get("species") or p["name"])].add(p["name"])
    pdir = os.path.join(RAW, "pokedex")
    problems = 0
    for fn in sorted(os.listdir(pdir)):
        slug = fn[:-5]
        heads, stat_blocks = _split_heads(read(os.path.join(pdir, fn)))
        if not heads and not stat_blocks:
            continue
        known = (slug in COSMETIC_OK or slug in BATTLE_FORM_OK
                 or slug in ROWS_ALREADY)
        if len(have.get(norm(slug), set())) > 1 or known:
            continue
        problems += 1
        print("  PROBLEM %-14s splits %s but the dex holds one row"
              % (slug, heads or stat_blocks))
    if not problems:
        print("  none: every page that splits a form has the rows to match,")
        print("  or a recorded reason (%d cosmetic, %d in-battle, %d already rows)"
              % (len(COSMETIC_OK), len(BATTLE_FORM_OK), len(ROWS_ALREADY)))
    return problems


def _battle_form_gaps(dex):
    """An in-battle form that moves a stat or a type must actually carry it."""
    bad = []
    for slug, (what, _why) in sorted(BATTLE_FORM_OK.items()):
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
    return len(bad)


def alternate_form_watch(dex):
    """Flag a Serebii page that splits a form's abilities with no dex row for it.

    This is the check that would have caught Squawkabilly. Serebii writes the
    per-form abilities as "<b>Green & Blue Plumage Abilities</b>:" headers and
    lists the forms in an "Alternate Forms" table; when a page does that and the
    dex has a single row for the species, an ability is being thrown away.
    """
    print("\n--- 7. Serebii pages that split a form, checked against the dex ---")
    return _split_pages(dex) + _battle_form_gaps(dex)


def _collisions(dex):
    print("\n--- 1. Name collisions inside the dex ---")
    dupes = defaultdict(list)
    for p in dex:
        dupes[norm(p["name"])].append(p["name"])
    collisions = {k: v for k, v in dupes.items() if len(v) > 1}
    if not collisions:
        print("  none: every form has a unique key")
    for k, v in collisions.items():
        print("  %-28s <- %s" % (k, v))
    return len(collisions)


def _match_by_type(r, dex):
    """The dex form a master-list row is, when its name does not resolve:
    same number, same typing, and a Mega only for a Mega."""
    return next((c for c in dex if c["dex"] == r["dex"]
                 and c["types"] == r["types"]
                 and c["is_mega"] == r["name"].lower().startswith("mega")),
                None)


def _missing_rows(master, dex, by_norm):
    print("\n--- 2. Master-list rows missing from the dex ---")
    missing = []
    for r in master:
        # a suffixed sprite means a distinct form; the dex names it Species-Form
        if norm(r["name"]) in by_norm:
            continue
        if _match_by_type(r, dex) is None:
            missing.append(r)
    for r in missing:
        print("  MISSING  #%04d %-22s sprite=%-10s types=%s"
              % (r["dex"], r["name"], r["sprite"], "/".join(r["types"])))
    if not missing:
        print("  none: every master-list row resolves to a dex form")
    return len(missing)


def _extra_forms(master, dex):
    print("\n--- 3. Forms in the dex that the master list does not spell out ---")
    master_dex = defaultdict(list)
    for r in master:
        master_dex[r["dex"]].append(r)
    extra = [p for p in dex if norm(p["name"]) not in
             {norm(r["name"]) for r in master_dex.get(p["dex"], [])}]
    for p in sorted(extra, key=lambda x: x["dex"]):
        print("  #%04d %-26s %-16s (%s)"
              % (p["dex"], p["name"], "/".join(p["types"]),
                 "declared in FIXED_FORMS" if p.get("species") in FIXED_SPECIES
                 else "from attackdex form tables"))
    if not extra:
        print("  none")


def _multi_form(dex):
    print("\n--- 4. Multi-form species: what we hold per species ---")
    groups = defaultdict(list)
    for p in dex:
        groups[species_norm(p["name"]) or norm(p["name"])].append(p)
    multi = {k: v for k, v in groups.items() if len(v) > 1}
    for k in sorted(multi):
        forms = sorted(multi[k], key=lambda p: (p["is_mega"], p["name"]))
        print("  %-16s %s" % (k, " | ".join(
            "%s [%s]" % (p["name"], "/".join(p["types"])) for p in forms)))


def _gender_split(dex):
    print("\n--- 5. Gender-split species present in Champions ---")
    gender = ["Basculegion", "Meowstic", "Indeedee", "Oinkologne", "Unfezant",
              "Frillish", "Jellicent", "Pyroar", "Hippowdon"]
    learn = json.loads(Path(DB, "learnsets.json").read_text(encoding="utf-8"))
    for g in gender:
        forms = [p["name"] for p in dex if species_norm(p["name"]) == norm(g)]
        keys = [k for k in learn if species_norm(k) == norm(g)]
        if forms or keys:
            print("  %-14s dex=%-34s learnsets=%s"
                  % (g, ", ".join(forms) or "-", ", ".join(keys) or "-"))


# pokebase publishes its whole Pokedex, including species that are not legal
# in Champions. Those used to sit at exactly 0.00%, so any non-zero figure
# meant a real gap - but on 2026-09-13 the table deepened from 199 rows to
# 278 and grew a long tail: 63 rows under 0.2%, and the bottom of it is
# ordinary Champions Pokemon - Rampardos, Dragalge, Mega Meowstic, Salazzle
# - all reading 0.1%. At that depth the figure says nothing about legality,
# so "non-zero" turned into a daily false alarm: Hitmontop, at 0.1%, which
# Serebii's 326-row list does not contain.
#
# Serebii is ground truth for what is LEGAL, pokebase for what is PLAYED,
# so the line sits above the measured tail. Below it the name is reported
# and watched with its number; above it the format has moved without us and
# the daily job should stop. The watchlist idea is unchanged - only where
# the threshold sits, and now it is set from the distribution rather than
# from "any figure at all".
TAIL = 0.5


def _meta_names():
    """Every Pokemon name each meta source uses, per source."""
    src = {
        "pokebase usage": [r["name"] for r in
                           (meta("usage_pokemon") or {}).get("rows", [])],
    }
    # All three age divisions share the roster, so a name only one of them uses
    # still has to resolve. Each is listed separately: which division dropped a
    # row is the first thing you want to know.
    for _div in DIVISIONS:
        _t = tournament(_div)
        if _t:
            src["worlds " + _div] = [s.get("pokemon") for p in _t.get("players", [])
                                     for s in p.get("team", [])]
    return src


def _print_watchlist(watch, usage_of):
    """These sit at 0.00% because pokebase publishes its whole Pokedex while
    Champions only allows part of it. If a regulation adds one of them it
    starts scoring usage and moves into the PROBLEM list above - that is the
    signal to re-run fetch_serebii.py + build_db.py so the dex picks it up."""
    # the ones that DO have a figure, just below the tail threshold: worth
    # naming with their number, because a climb is the actual early warning
    seen_low = sorted({n for n in watch if usage_of.get(n, 0) > 0},
                      key=lambda n: -usage_of.get(n, 0))
    if seen_low:
        print("\n  Below the %.1f%% tail, so watched rather than blocking:" % TAIL)
        for n in seen_low[:10]:
            print("    %-22s %.1f%% on the ladder, and not in Serebii's list"
                  % (n, usage_of[n]))
    if watch:
        print("\n  Watchlist - not in Serebii's list, under the %.1f%% tail (%d):"
              % (TAIL, len(watch)))
        for i in range(0, len(watch), 6):
            print("    " + ", ".join(watch[i:i + 6]))
        print("  If any of these starts showing usage, a new regulation added it:")
        print("    python scripts/fetch_serebii.py list && python scripts/build_db.py")


def _unresolved_meta_names(by_norm):
    print("\n--- 6. Names used by the meta sources that do not resolve ---")
    usage_of = {r["name"]: (r.get("usage_percent") or 0)
                for r in (meta("usage_pokemon") or {}).get("rows", [])}
    zero_usage = {n for n, v in usage_of.items() if v < TAIL}
    unresolved = defaultdict(set)
    for label, names in _meta_names().items():
        for n in names:
            if n and norm(n) not in by_norm:
                unresolved[label].add(n)
    real = {label: sorted(n for n in names if n not in zero_usage)
            for label, names in unresolved.items()}
    noise = {label: sorted(n for n in names if n in zero_usage)
             for label, names in unresolved.items()}
    problems = 0
    for label in sorted(real):
        if real[label]:
            problems += len(real[label])
            print("  PROBLEM %-24s %s" % (label, ", ".join(real[label])))
    if not problems:
        print("  none with any usage: every name that matters maps onto a dex form")
    _print_watchlist(sorted({n for names in noise.values() for n in names}),
                     usage_of)
    return problems


def main():
    """Returns the number of REAL problems, so daily.py can gate on it.

    "Real" is deliberately narrow. Section 3 (forms the master list does not
    spell out) is expected - that is where every regional form lives - and the
    watchlist is a list of things that are correctly absent. What counts is a
    name collision, a master-list row the dex cannot resolve, a meta source
    naming something with usage that we do not have, and a page that splits a
    form the dex has not split. Those four are how a form goes missing.
    """
    dex = json.loads(Path(DB, "pokemon.json").read_text(encoding="utf-8"))
    master = master_list()

    print("Serebii master list : %d rows" % len(master))
    print("data/db/pokemon.json: %d forms (%d mega)"
          % (len(dex), sum(1 for p in dex if p["is_mega"])))

    by_norm = {norm(p["name"]): p for p in dex}
    problems = _collisions(dex)
    problems += _missing_rows(master, dex, by_norm)
    _extra_forms(master, dex)
    _multi_form(dex)
    _gender_split(dex)
    problems += _unresolved_meta_names(by_norm)
    problems += alternate_form_watch(dex)

    print("\n%s" % ("no problems" if not problems else
                    "%d PROBLEM%s - see above"
                    % (problems, "" if problems == 1 else "S")))
    return problems


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
