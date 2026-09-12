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
        print("  #%04d %-26s %-16s (from attackdex form tables)"
              % (p["dex"], p["name"], "/".join(p["types"])))
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


if __name__ == "__main__":
    main()
