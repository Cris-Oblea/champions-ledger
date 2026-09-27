#!/usr/bin/env python3
"""A second opinion on every form's ability list.

    python scripts/audit_abilities.py          # report; non-zero on a NEW gap

WHY. The movepools got a second opinion in audit_learnsets.py and the ability
lists never had one - and one was missing for months without anything noticing:

    "ciertos pokemones como lycanroc midnight le hace falta 1 habilidad, no
     tiene no guard, pero smogon y el juego si dicen que tiene no guard"
     (player, 2026-09-19)

He was right, and the cause was worth finding rather than patching. Form rows
come from the ATTACKDEX, because that is the only place each form gets a row of
its own - and Serebii's attackdex row for Lycanroc-Midnight lists Keen Eye and
Vital Spirit and stops, while its POKEDEX page lists all three and links
/abilitydex/noguard.shtml. The two halves of one site disagree. build_db.py
completes the short row from the page now; this is what would have said so.

AND THEN IT DID NOT SAY SO, eight days later:

    "greninja tiene 3 habilidades y no 2... por alguna razon algunas
     habilidades se estan perdiendo" (player, 2026-09-27)

Greninja's page names Battle Bond, but links it as /abilitydex/.shtml - an
empty slug - and every ability pattern in build_db.py demanded [a-z0-9]+. So
the name was skipped, and this audit passed it twice over:

  * PokeAPI files Battle Bond on a Pokemon of its own, greninja-battle-bond,
    so from upstream's side plain Greninja HAS two abilities and we matched.
  * Nothing read Serebii's page back without going through the same link
    pattern that had just dropped the name.

So there are three checks now, and only the first is the old one:

  1. PokeAPI, per form, at the pinned commit.
  2. PokeAPI's ABILITY VARIANTS: an entry of the same species with the same
     types and the same six stats as one of our rows is that Pokemon with a
     different ability, and what it carries is expected on our row too.
     greninja-battle-bond is exactly that; greninja-ash is not (its stats
     differ), and neither are the Galarian forms Champions does not have.
     Only a row ALONE in its shape takes them: Meowstic's genders and
     Squawkabilly's plumages share one shape and are separate rows precisely
     because the ability differs, so each is crossed against itself only.
  3. SEREBII AGAINST ITSELF: every name in bold in a Pokedex page's Abilities
     cell - read by the <b>, never by the link - must be on some row of that
     species. This is the one that would have caught Battle Bond on day one,
     and it needs nothing outside Serebii.

It never rewrites anything. Serebii decides; this only says where to look.

KNOWN AND SETTLED, so only a NEW disagreement speaks up:
  * Compoundeyes - Serebii spells it as one word and our whole database does
    too, consistently, including the ability's own row and its description.
    PokeAPI writes "Compound Eyes". Nothing is missing; the two sites spell it
    differently, and ours is the spelling the rest of the app looks up by.
"""
import collections
import csv
import glob
import html
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q                                             # noqa: E402
from fetch_home_dex import key as hkey                        # noqa: E402

RAW = os.path.join(ROOT, "data", "raw", "pokeapi_csv")
PAGES = os.path.join(ROOT, "data", "raw", "pokedex")
ENGLISH = "9"
# name -> why it is not a finding. Each one checked by hand, once.
KNOWN = {
    "Compound Eyes": "Serebii writes Compoundeyes, and so does all of ours",
}


def table(name):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        return None
    return list(csv.DictReader(io.open(path, encoding="utf-8")))


def upstream(forms):
    """Checks 1 and 2: what PokeAPI lists that a form of ours does not."""
    pokemon = table("pokemon.csv")
    if pokemon is None:
        print("no PokeAPI tables cached - run scripts/fetch_home_dex.py first")
        return None
    pk = {}
    for r in pokemon:
        pk.setdefault(r["identifier"], r)
    aname = {r["ability_id"]: r["name"] for r in table("ability_names.csv")
             if r["local_language_id"] == ENGLISH}
    by_pid = collections.defaultdict(list)
    for r in table("pokemon_abilities.csv"):
        by_pid[r["pokemon_id"]].append((int(r["slot"]),
                                        aname.get(r["ability_id"])))
    stats = collections.defaultdict(dict)
    for r in table("pokemon_stats.csv"):
        stats[r["pokemon_id"]][r["stat_id"]] = r["base_stat"]
    types = collections.defaultdict(dict)
    for r in table("pokemon_types.csv"):
        types[r["pokemon_id"]][r["slot"]] = r["type_id"]

    def shape(pid):
        return (tuple(sorted(stats[pid].items())),
                tuple(sorted(types[pid].items())))

    by_species = collections.defaultdict(list)
    for r in pokemon:
        by_species[r["species_id"]].append(r)

    # A Mega's ability is the stone's doing, so Megas are not crossed at all.
    mine = [(p, pk.get(hkey(p["name"]))) for p in forms if not p.get("is_mega")]
    mine = [(p, me) for p, me in mine if me and me["id"] in by_pid]
    mapped = {me["id"] for _, me in mine}
    # How many of OUR rows share one shape. Meowstic's two genders, Toxtricity's
    # two forms and Squawkabilly's four plumages all do, and they are split
    # into rows on purpose because the ability is what tells them apart - so a
    # same-shaped sibling is only a variant of a row that is ALONE in its shape.
    alike = collections.Counter((me["species_id"], shape(me["id"]))
                                for _, me in mine)

    checked, variants, gaps, known = 0, 0, [], 0
    for p, me in mine:
        checked += 1
        # the entry itself, then every same-shaped sibling of it
        sources = [(me["identifier"], me["id"])]
        if alike[(me["species_id"], shape(me["id"]))] == 1:
            for r in by_species[me["species_id"]]:
                if (r["id"] not in mapped
                        and shape(r["id"]) == shape(me["id"])):
                    sources.append((r["identifier"], r["id"]))
                    variants += 1
        ours = p.get("abilities") or []
        for ident, pid in sources:
            for _, n in sorted(by_pid[pid]):
                if not n or n in ours:
                    continue
                if n in KNOWN:
                    known += 1
                    continue
                gaps.append((p["name"], n, ident, ", ".join(ours) or "none"))
    print("%d forms crossed against PokeAPI at the pin" % checked)
    print("  %d same-shaped ability variants crossed with them" % variants)
    print("  %d known spelling differences, skipped" % known)
    return gaps


def serebii(forms):
    """Check 3: every ability a Pokedex page names is on a row of it.

    Read by the bold name alone, so a broken or missing link cannot hide one
    from this the way it hid Battle Bond from build_db.py.
    """
    if not os.path.isdir(PAGES):
        print("no Serebii Pokedex pages cached - run scripts/fetch_serebii.py")
        return None
    rows = collections.defaultdict(set)
    for p in forms:
        rows[Q.norm(p.get("species") or p["name"])].update(
            p.get("abilities") or [])
    pages, gaps = 0, []
    for path in sorted(glob.glob(os.path.join(PAGES, "*.html"))):
        slug = os.path.splitext(os.path.basename(path))[0]
        have = rows.get(Q.norm(slug))
        if have is None:
            continue
        s = io.open(path, encoding="cp1252", errors="replace").read()
        pages += 1
        for cell in re.findall(r"<b>Abilities</b>\s*:(.*?)</td>", s, re.S):
            for n in re.findall(r"<b>([^<]+)</b>", cell):
                n = re.sub(r"\s+", " ", html.unescape(n)).strip()
                if n and n not in have and n not in KNOWN:
                    gaps.append((slug, n, ", ".join(sorted(have))))
    print("%d Serebii Pokedex pages read back by ability name" % pages)
    return gaps


def main():
    forms = Q.db("pokemon")
    up = upstream(forms)
    own = serebii(forms)
    bad = False
    if up:
        bad = True
        print("\n  %d FORM(S) MISSING AN ABILITY UPSTREAM LISTS:" % len(up))
        for name, miss, ident, ours in up:
            print("    %-22s missing %-18s from %-22s (we have: %s)"
                  % (name, miss, ident, ours))
        print("\n  Check Serebii's page for each before changing anything - its\n"
              "  Pokedex page and its attackdex row can disagree, which is exactly\n"
              "  how Lycanroc-Midnight lost No Guard. If Serebii really does not\n"
              "  list it, add it to KNOWN with the reason instead.")
    if own:
        bad = True
        print("\n  %d ABILITY(IES) SEREBII NAMES THAT NO ROW CARRIES:" % len(own))
        for slug, miss, ours in own:
            print("    %-22s %-18s (the species has: %s)" % (slug, miss, ours))
        print("\n  The page names it and build_db.py did not keep it. Look at\n"
              "  the page's markup first: Battle Bond was lost to a link with\n"
              "  an empty slug, Lycanroc-Midnight's No Guard to an attackdex\n"
              "  row that stopped short.")
    if not bad:
        print("  no form is missing an ability either source lists")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
