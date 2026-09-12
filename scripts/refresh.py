#!/usr/bin/env python3
"""One command that walks the whole source chain and ends at the tracker.

    python scripts/refresh.py                # normal refresh
    python scripts/refresh.py --regulation   # a new regulation just dropped
    python scripts/refresh.py --tracker-only # only rebuild tracker/data.js
    python scripts/refresh.py --skip smogon_calc tournament

Order matters.  Serebii is fetched and the database rebuilt BEFORE the usage
sources, because pokebase and Pikalytics are joined onto the dex by name and a
species the dex has never heard of drops out of the join silently.  The run
finishes with audit_forms, test_norm and the damage selftest, then regenerates
tracker/data.js so the phone sees the same numbers as the CLI.

--regulation is not a nicety.  fetch_serebii skips any page already cached and
fetch_pokebase re-parses cached HTML unless forced, so a plain run picks up new
Pokedex pages while silently keeping every stale attackdex page - and the
attackdex is where forms and learnsets come from.  This flag clears those two
caches first, which is the documented recipe in analysis/regulation_m_c.md.
"""
import argparse, os, shutil, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
PY = sys.executable

class Stage:
    def __init__(self, key, label, argv, required=True):
        self.key, self.label, self.argv, self.required = key, label, argv, required

def stages(reg, deep=False):
    """`deep` re-downloads the slow-moving sources without clearing any cache.

    Three tiers, by how fast the source actually moves:

      every run  - pokebase's ladder (changes daily) and Smogon's calculator
                   (re-downloads all 23 files and compares hashes, so it
                   notices the day upstream ships).
      --deep     - Smogon's written analyses and Pikalytics. Both skip cached
                   files, so without this they are frozen for good. Neither
                   changes daily and Smogon is 324 files, so hammering it every
                   night would be rude and slow for nothing.
      --regulation - the destructive one: clears the Serebii page caches,
                   which is the only way new species get movepools.
    """
    serebii = ["scripts/fetch_serebii.py", "all"]
    # ALWAYS --force. fetch_pokebase skips any page already on disk over 5 KB,
    # so without it a daily run re-parses yesterday's HTML and the ladder never
    # moves. Caught 2026-09-11: the M-C ladder had been live for two days and a
    # plain refresh would not have seen a row of it. Serebii is the opposite -
    # its pages are rules, they change on a regulation, so its cache stays.
    pokebase = ["scripts/fetch_pokebase.py", "--force"]
    smogon = ["scripts/fetch_smogon.py"] + (["--force"] if (reg or deep) else [])
    pika = ["scripts/fetch_pikalytics.py"] + (["--force"] if (reg or deep) else [])
    return [
        Stage("serebii", "Serebii - rules, dex, attackdex", serebii),
        Stage("build_db", "build the local database", ["scripts/build_db.py"]),
        Stage("pokebase", "pokebase - ladder usage", pokebase, False),
        Stage("pikalytics", "Pikalytics - spreads, win rates, cores",
              pika, False),
        Stage("smogon", "Smogon - written analyses", smogon, False),
        Stage("smogon_calc", "Smogon - the Champions engine",
              ["scripts/fetch_smogon_calc.py"], False),
        Stage("tournament", "pokedata - Masters teamlists",
              ["scripts/fetch_tournament.py"], False),
        Stage("tour_sen", "pokedata - Seniors",
              ["scripts/fetch_tournament.py", "--division", "seniors"], False),
        Stage("tour_jun", "pokedata - Juniors",
              ["scripts/fetch_tournament.py", "--division", "juniors"], False),
        # Every Worlds ever published, all three divisions. Cheap - one
        # request per event/division and it skips what it already has - and
        # it re-reads the index each run, which is how next August's Worlds
        # turns up without anyone editing a list of ids.
        Stage("worlds", "pokedata - the Worlds archive, every year",
              ["scripts/fetch_worlds_archive.py"], False),
        Stage("audit", "audit_forms - do the five sources still join?",
              ["scripts/audit_forms.py"], False),
        Stage("test_norm", "test_norm - name matching",
              ["scripts/test_norm.py"], False),
        Stage("selftest", "damage.py selftest",
              ["scripts/damage.py", "--selftest"], False),
        # ability_moves comes BEFORE the tracker: build_tracker_data.py reads
        # data/db/ability_moves.json for the badge table AND for which moves
        # are spread or land on your own ally. Built the other way round, the
        # page shipped one refresh behind its own rules.
        # order matters: the merged text feeds the status table, the status
        # table feeds the ability rules, and the ability rules feed the item
        # links. Built the other way round, each one reads yesterday's file.
        Stage("text_facts", "pick the better description per move and ability",
              ["scripts/build_text_facts.py"]),
        Stage("statuses", "status conditions, with Champions' own rebalance",
              ["scripts/build_statuses.py"]),
        Stage("ability_moves", "re-derive which ability touches which move",
              ["scripts/build_ability_moves.py"]),
        # after pokebase, because that is where the 20 prices Serebii prints
        # as "??? VP" come from
        Stage("audit_sources", "do the sources agree on the numbers?",
              ["scripts/audit_sources.py"], False),
        # the lookup sweep: every form resolves, every derived table points at
        # something real. It found the Z-Mega movepool hole and two phantom
        # ability rules on the day it was written.
        Stage("audit_lookups", "every lookup resolves what it should",
              ["scripts/audit_lookups.py"], False),
        Stage("item_facts", "merge item prices and text across the two sources",
              ["scripts/build_item_facts.py"]),
        # after item_facts, because the links are read off the merged text -
        # pokebase says Air Balloon is immune to Ground, Serebii only says it
        # floats
        Stage("item_links", "link each item to the moves and abilities it serves",
              ["scripts/build_item_links.py"]),
        # reads the ladder for demand and data/meta/go_sourcing.json for
        # supply, and must run BEFORE the tracker blob that carries it
        Stage("gts", "GTS difficulty - demand from the ladder, supply declared",
              ["scripts/build_gts_difficulty.py"]),
        Stage("tracker", "regenerate tracker/data.js",
              ["scripts/build_tracker_data.py"]),
        Stage("dexnos", "National Dex numbers (the order HOME lists in)",
              ["scripts/fetch_dex_numbers.py"], False),
        Stage("engine", "bundle Smogon's engine for the browser",
              ["scripts/build_engine_bundle.py"]),
        Stage("page", "rebuild tracker/index.html",
              ["scripts/build_tracker_page.py"]),
    ]

def clear_regulation_caches():
    """Serebii's cache is a trap on a new regulation - see the module docstring."""
    for sub in ("pages", "pokedex", "attackdex"):
        p = os.path.join(RAW, sub)
        if os.path.isdir(p):
            n = len(os.listdir(p))
            shutil.rmtree(p)
            print("  cleared data/raw/%s (%d files)" % (sub, n))
    os.makedirs(os.path.join(RAW, "pages"), exist_ok=True)

def run(st):
    print("\n=== %s" % st.label)
    t0 = time.time()
    r = subprocess.run([PY] + st.argv, cwd=ROOT)
    dt = time.time() - t0
    ok = r.returncode == 0
    print("--- %s  (%.1f s)" % ("ok" if ok else "FAILED rc=%d" % r.returncode, dt))
    return ok

def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--regulation", action="store_true",
                    help="clear the Serebii cache and force every re-parse")
    ap.add_argument("--tracker-only", action="store_true",
                    help="skip the network, only rebuild tracker/data.js")
    ap.add_argument("--deep", action="store_true",
                    help="also re-download Smogon's analyses and Pikalytics, "
                         "which otherwise serve from cache for ever")
    ap.add_argument("--skip", nargs="*", default=[], metavar="STAGE")
    a = ap.parse_args()

    if a.tracker_only:
        ok = run(Stage("ability_moves", "which ability touches which move",
                       ["scripts/build_ability_moves.py"]))
        ok = run(Stage("tracker", "regenerate tracker/data.js",
                       ["scripts/build_tracker_data.py"])) and ok
        ok = run(Stage("engine", "bundle Smogon's engine",
                       ["scripts/build_engine_bundle.py"])) and ok
        ok = run(Stage("page", "rebuild tracker/index.html",
                       ["scripts/build_tracker_page.py"])) and ok
        sys.exit(0 if ok else 1)

    if a.regulation:
        print("=== new regulation: clearing the Serebii page cache")
        clear_regulation_caches()

    todo = [s for s in stages(a.regulation, a.deep) if s.key not in a.skip]
    failed, hard = [], False
    for st in todo:
        if not run(st):
            failed.append(st.key)
            if st.required:
                hard = True
                print("\n%s is required - stopping." % st.key)
                break

    print("\n" + "=" * 60)
    print("%d/%d stages ok" % (len(todo) - len(failed), len(todo)))
    if failed:
        print("failed: %s" % ", ".join(failed))
    if not hard:
        print("\ntracker/data.js is current. Ask Claude to republish the tracker")
        print("so the phone picks up the new dex, moves and stones.")
    sys.exit(1 if hard else 0)

if __name__ == "__main__":
    main()
