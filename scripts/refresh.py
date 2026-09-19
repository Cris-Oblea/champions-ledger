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
attackdex is where forms and learnsets come from.  This flag re-fetches every
Serebii page ON TOP of the cache and reports which ones came back different,
which is the patch note for that regulation.  It is not usually typed: the
run asks the sources which regulation is live and turns it on by itself.
"""
import argparse, os, subprocess, sys, time

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
    # A REGULATION IS A PATCH, NOT A REBUILD. This used to DELETE the three
    # Serebii caches and download all 1,148 pages into the hole. Two things
    # were wrong with that: a failure halfway through left the database with no
    # movepools and nothing to fall back on (proved by accident on 2026-09-14,
    # testing the detector), and throwing the old bytes away threw away the
    # only way to say WHAT the regulation changed.
    #
    # --force re-fetches every page ON TOP of the cache instead, compares each
    # one with what was there, and prints the list that came back different.
    # The request count is the same - Serebii sends no Last-Modified and no
    # ETag, tested, so a conditional request gets the whole body anyway and
    # there is no lighter way to ask - but nothing is destroyed and the run
    # ends with a patch note.
    #
    # It is also cheaper than it looks: the attackdex is indexed by MOVE, not
    # by species, so "Slash was added to 29 Pokemon" is one page that changed,
    # not 29.
    serebii = ["scripts/fetch_serebii.py", "all"] + (["--force"] if reg else [])
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
        # WHAT EACH POKEMON'S OWN PLAYERS RUN, from the live ladder: the moves,
        # item, ability, nature and SP spread of the people using it, with
        # percentages. Weekly, not nightly - 321 pages at 1.3 MB each is six
        # minutes and 427 MB of someone else's bandwidth for numbers that
        # drift slowly, so it rides with --deep like the Smogon analyses.
        Stage("splits", "pokebase - what each Pokemon runs",
              ["scripts/fetch_pokebase_splits.py"]
              + (["--force"] if (reg or deep) else []), False),
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
        # The type colours, re-read from pokemon.com's own stylesheet. Not a
        # game source and it changes about never - but the whole point of it is
        # that nobody types these in, so it is re-derived rather than trusted
        # to stay right. It runs BEFORE the tracker, which ships the table.
        Stage("type_colors", "the type colours, from Pokemon's own stylesheet",
              ["scripts/build_type_colors.py"], False),
        # The species Champions does NOT have, so a HOME row for one is a card
        # rather than a name and a tag. Read from PokeAPI's tables at a pinned
        # commit - main-series numbers for main-series Pokemon, which is all
        # that exists for them, and the card says so.
        Stage("home_dex", "types and stats for the species outside Champions",
              ["scripts/fetch_home_dex.py"], False),
        # THE ONLY SECOND OPINION THE MOVEPOOLS HAVE. PokeAPI carries Champions
        # as its own version group, so "who learns what" can finally be crossed
        # against something - the one number in this project that never was.
        # It never rewrites anything: when the two disagree, Serebii decides,
        # and the seven disagreements there are today were each checked that
        # way. Not in the gate, because it needs a 10 MB table that data/raw
        # does not commit.
        Stage("learnset_audit", "cross the movepools against PokeAPI",
              ["scripts/audit_learnsets.py"], False),
        Stage("text_facts", "pick the better description per move and ability",
              ["scripts/build_text_facts.py"]),
        Stage("statuses", "status conditions, with Champions' own rebalance",
              ["scripts/build_statuses.py"]),
        Stage("ability_moves", "re-derive which ability touches which move",
              ["scripts/build_ability_moves.py"]),
        # Every item and ability as an exact number, read out of Smogon's
        # engine rather than out of Serebii's prose - which is qualitative for
        # 197 of the 199 items. Three seconds, and it has to re-run whenever
        # the engine or the tables move, because that is exactly when a
        # multiplier would change without anyone noticing.
        Stage("effects", "exact multipliers, from the engine itself",
              ["scripts/build_effects.py"]),
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
        # Smogon's written analyses, as the app's on-demand asset. Cheap, and
        # it has to follow fetch_smogon or the panel serves yesterday's prose.
        Stage("analysis", "Smogon's analyses, for the app",
              ["scripts/build_analysis_data.py"]),
        Stage("splitsdata", "per-Pokemon ladder splits, for the app",
              ["scripts/build_splits_data.py"], False),
        # ...and what those species KNOW, as a second on-demand asset. It
        # has to follow home_dex: it is keyed by exactly the names that file
        # resolved, so a species added there without running this afterwards
        # gets a sheet with an empty section rather than a movepool.
        Stage("homemoves", "movepools for the species outside Champions",
              ["scripts/build_home_moves.py"], False),
        Stage("tracker", "regenerate tracker/data.js",
              ["scripts/build_tracker_data.py"]),
        Stage("dexnos", "National Dex numbers (the order HOME lists in)",
              ["scripts/fetch_dex_numbers.py"], False),
        Stage("engine", "bundle Smogon's engine for the browser",
              ["scripts/build_engine_bundle.py"]),
        Stage("readme", "regenerate the README's counts",
              ["scripts/build_readme.py"]),
        Stage("page", "rebuild tracker/index.html",
              ["scripts/build_tracker_page.py"]),
    ]


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
    ap.add_argument("--no-regulation-check", action="store_true",
                    help="do not ask the sources which regulation is live")
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

    # ASK WHETHER THE REGULATION MOVED, before anything is fetched.
    #
    # This is the one event that can quietly wreck the database, because
    # fetch_serebii skips any page already cached and the attackdex is where
    # learnsets come from - so a plain run picks up the new Pokedex pages and
    # keeps every stale attackdex one, leaving the new species with no
    # movepool. The recipe that avoids it is --regulation, and until now a
    # person had to know to type it, which made "the database is always
    # current" true on every day except the one that mattered.
    #
    # It is asked FIRST because the answer decides how the Serebii stage runs,
    # and it costs two requests. It fails open: if the sources cannot be
    # reached, the refresh goes ahead as an ordinary one.
    record_after = False
    if not a.regulation and not a.no_regulation_check:
        sys.path.insert(0, os.path.join(ROOT, "scripts"))
        try:
            import check_regulation
            status, live, ours, why = check_regulation.look()
        except Exception as e:                       # never block a refresh
            status, live, ours, why = "unknown", None, None, str(e)
        if status == "ready":
            print("=" * 60)
            print("NEW REGULATION: %s is live, the database is built for %s."
                  % (live.upper(), (ours or "nothing").upper()), flush=True)
            print("%s - running the regulation recipe rather than a plain "
                  "refresh." % why)
            print("=" * 60)
            a.regulation = True
            record_after = True
        elif status == "waiting":
            # pokebase has flipped and Serebii has not published yet. Clearing
            # its cache now would re-download several hundred pages to get the
            # same data back, so this says so and refreshes normally; tomorrow
            # it asks again.
            print("NOTE: %s is live but Serebii has not published it yet (%s)."
                  % ((live or "?").upper(), why), flush=True)
            print("      refreshing normally; the recipe waits for Serebii.")
        elif status == "unknown":
            print("NOTE: could not tell which regulation is live (%s)." % why)

    if a.regulation:
        print("=== new regulation: re-fetching every Serebii page in place",
              flush=True)

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
    # Only once the rebuild actually worked. Recording the new regulation on a
    # run that failed would tell tomorrow's run there is nothing to do, which
    # is the one way this could make things worse rather than better.
    if record_after and not hard and not failed:
        import check_regulation
        got = check_regulation.look()
        if got[1]:
            check_regulation.record(got[1], got[3])
            print("\nrecorded: the database is now built for %s"
                  % got[1].upper())
    if not hard:
        print("\ntracker/data.js is current. Ask Claude to republish the tracker")
        print("so the phone picks up the new dex, moves and stones.")
    sys.exit(1 if hard else 0)

if __name__ == "__main__":
    main()
