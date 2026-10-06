#!/usr/bin/env python3
"""The daily job: refresh every source, rebuild the app, deploy if it moved.

    python scripts/daily.py              # the real thing
    python scripts/daily.py --skip-deploy  # refresh and gate, never deploy
    python scripts/daily.py --no-refresh   # gate what is built, then deploy

PUBLISH A HAND EDIT WITH --no-refresh, never with a bare `wrangler deploy`.
Everything below has to pass a shrink guard, the Python audits, the source
check and every browser test; a hand deploy passed none of them, which left the
automation safer than the person - on the path taken far more often. The count
is deliberately not written here: GATE_CHECKS, SOURCE_CHECKS and BROWSER_TESTS
are the only things that decide it, and the README's sentence is generated from
exactly those three lists.

Why this exists rather than a bare `refresh.py` on a timer:

  * It says WHAT CHANGED. A refresh that prints 200 lines and exits 0 tells you
    nothing; this diffs the files that carry meaning - the ladder, the Smogon
    engine, the move and species counts - and writes one line per change.
  * It only deploys when something actually moved, so an unattended run does
    not push an identical build to Cloudflare every night.
  * It never lets a half-finished refresh reach the phone: the damage selftest
    and the name-matching test must pass, or it stops before deploying and
    says so. A wrong number on the phone is worse than a stale one.
  * It keeps a log, because nobody watches a 3am job.

The sources move on different clocks. pokebase's ladder is the one that
changes daily (so its pages are re-fetched every run, never served from the
cache). Serebii is rules and only moves on a regulation. Smogon's engine
moves when Smogon ships. All three are checked every run anyway; checking is
cheap and missing a regulation is not.
"""
import argparse
import contextlib
import datetime
import hashlib
import io
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from paths import META, RAW, ROOT, SMOGON_CALC

# Windows consoles default to cp1252, and the summary quotes what the sources
# printed - a U+FFFD in one of them killed the run at its very last line,
# after the deploy. Replace what cp1252 cannot show instead of dying.
for _s in (sys.stdout, sys.stderr):
    if isinstance(_s, io.TextIOWrapper):     # not when a test swapped it out
        with contextlib.suppress(ValueError):
            _s.reconfigure(errors="replace")

PY = sys.executable
LOGDIR = os.path.join(RAW, "daily_logs")
STATE = os.path.join(RAW, "daily_state.json")

# what is worth reporting a change in, and how to describe it
WATCH = [
    ("ladder",  "data/meta/usage_pokemon.json",      "pokebase ladder usage"),
    ("engine",  "data/raw/smogon_calc/calc/data/moves.js", "Smogon engine moves"),
    ("sets",    "data/raw/smogon_calc/js/data/sets/champions.js", "Smogon sets"),
    ("species", "data/db/pokemon.json",              "species and forms"),
    ("moves",   "data/db/moves.json",                "move table"),
    ("items",   "data/db/items.json",                "item table"),
    ("gtsdiff", "data/meta/gts_difficulty.json",     "GTS difficulty"),
    ("analyses", "data/meta/smogon_analyses.json",   "Smogon written analyses"),
    ("worlds",  "data/meta/tournament_0000191_masters.json", "Worlds Masters"),
    ("archive", "data/meta/worlds_archive.json",      "the Worlds archive"),
    ("abil",    "data/db/abilities.json",             "ability text"),
    ("bundle",  "tracker/engine.bundle.js",           "the engine the app runs"),
]

# The Python side of the gate. It lives up here rather than inside main()
# because the README's "the gate is N checks" paragraph is generated from these
# three lists - the sentence used to be prose, and said sixteen in one place
# and fifteen in another on the same day.
GATE_CHECKS = [
    (["scripts/damage.py", "--selftest"], "damage selftest"),
    (["scripts/test_norm.py"], "name matching"),
    (["scripts/audit_lookups.py"], "every lookup resolves"),
    (["scripts/audit_forms.py"], "no form went missing"),
    # The README is the front door of a public repo, and a typed number in it
    # drifts. The counts (README and STATUS) are generated, so this only has
    # to check they were regenerated.
    (["scripts/build_docs.py", "--check"],
     "the README and STATUS are current"),
    # Schema and client drifting apart is a runtime failure, not a build one:
    # the app asks for a column the database has never heard of. Migrations
    # were pasted by hand and nothing recorded it, so this is the first thing
    # that can tell.
    (["scripts/migrate.py", "--check"], "the schema is migrated"),
    # A backup system fails silently by definition: the job stops running, the
    # token expires, the folder moves, and nothing looks wrong until the day it
    # is needed. This is the alarm.
    (["scripts/backup_ledger.py", "--check"], "the ledger has a recent backup"),
    # And the alarm is only half of it: a snapshot is worth what its restore is
    # worth, and the dry run is what makes a restore safe to run at all. It was
    # reading every row as changed when nothing had, because the nightly job
    # and the laptop read the database through different doors and the two
    # spell a timestamp differently. Needs no database, so it runs anywhere.
    (["scripts/backup_ledger.py", "--selftest"], "a restore can still tell what changed"),
    # The README's numbers are generated so they cannot drift; its PROSE can,
    # and so can every other document - a reversed rule still stated as
    # current in STATUS.md, the file a new session reads first. This notices.
    (["scripts/check_docs.py"],
     "no document contradicts a decision, names a missing file or outgrows its budget"),
    # The Python half of the lint gate, and the twin of ESLint below: ruff.toml
    # holds the rules, the same file VS Code's Ruff extension reads. It found
    # two regexes whose \b had been typed as a literal backspace, so one of
    # check_docs' watched decisions had never matched anything.
    (["-m", "ruff", "check", "--quiet", "--output-format", "concise"],
     "no Python lint finding comes back once it is fixed"),
    # What ruff cannot see: ruff judges one file at a time, so a function whose
    # last caller lived in ANOTHER script reads as used forever. vulture reads
    # every script together. At zero; its default confidence (60%) is the
    # one that reports nothing false.
    (["-m", "vulture", "scripts"], "no Python function or name is left unreachable"),
]

# Read the SOURCE, which is the one thing the browser tests cannot: they
# exercise the paths they know about, and a bug on a path nobody clicked is
# legal JavaScript that simply does the wrong thing there. Two shipped that
# way: a sort preference saved under a name that no longer existed, and a CSV
# export calling a function another file kept private - both ReferenceErrors,
# both silent until the button was pressed.
#
# ESLint runs the same rules SonarQube for IDE shows in VS Code, over every
# file, with `--max-warnings 0`: the repo is at zero, so a warning fails the
# gate like an error. check_app.js keeps the two
# checks no linter can make: they read the app against its own markup and its
# own engine.
SOURCE_CHECKS = [
    (["node_modules/eslint/bin/eslint.js", "--max-warnings", "0"],
     "no lint finding comes back once it is fixed"),
    # What ESLint cannot know: what a value IS. TypeScript's checker reads the
    # app's JavaScript as it is (tsconfig.json: checkJs, nothing compiled), so
    # a property read off the wrong kind of element, a call short of an
    # argument or a value that may be null fails here instead of on the phone.
    # Strict: every parameter has a type.
    (["node_modules/typescript/bin/tsc", "--pretty", "false"],
     "the app type-checks"),
    # And everything else written in JavaScript, each with the platform it
    # runs on: the browser tests against the app's real exports (the build
    # writes tracker/src/_public.d.ts first), the Node scripts and the lint
    # configs, and the cron Worker.
    (["node_modules/typescript/bin/tsc", "-p", "tests", "--pretty", "false"],
     "the tests type-check against the app"),
    (["node_modules/typescript/bin/tsc", "-p", "scripts", "--pretty", "false"],
     "the Node scripts type-check"),
    (["node_modules/typescript/bin/tsc", "-p", "cron", "--pretty", "false"],
     "the cron Worker type-checks"),
    (["scripts/check_app.js"], "the app's source agrees with its markup and its engine"),
    # And the Python's types: pyright (pyrightconfig.json), the checker inside
    # VS Code's Pylance. "basic" everywhere, "strict" file by file as the list
    # in that file grows.
    (["node_modules/pyright/index.js"], "the Python type-checks"),
    # The same treatment for the other two languages of the page, so nothing
    # in tracker/src/ is linted only by an editor. stylelint.config.mjs and
    # .htmlvalidate.mjs say what each switches off and why; both linters
    # expand their own globs, so no shell is involved.
    (["node_modules/stylelint/bin/stylelint.mjs", "tracker/src/styles/*.css"],
     "no CSS lint finding comes back once it is fixed"),
    (["node_modules/html-validate/bin/html-validate.mjs", "tracker/src/markup/**/*.html"],
     "no HTML lint finding comes back once it is fixed"),
    # Copy-paste, across every language the repo is written in. The repo is at
    # zero - a shared factory, a helper, one CSS property where four
    # gradients stood - so a new copy is a choice to make
    # out loud: share it, or mark it `jscpd:ignore-start` with the reason (the
    # dark tokens, which CSS cannot write once). .jscpd.json holds the rest.
    # The cross-file half of ESLint: an export nothing imports, a file nothing
    # reaches, a package nothing uses. A grep for the same thing missed an
    # export named `fill`, a word every other module also contains; knip reads
    # the imports themselves. knip.jsonc names the entry points.
    (["node_modules/knip/bin/knip.js", "--no-progress"],
     "no export, file or package is left unreachable"),
    (["node_modules/jscpd/run-jscpd.js", "--no-colors", "tracker/src", "scripts", "tests", "cron"],
     "no copy-pasted block comes back once it is shared",
     lambda o: [line for line in o.splitlines()
                if line.startswith(("Clone found", "ERROR"))
                or re.search(r"\[\d+:\d+ - \d+:\d+\]", line)][:13]),
]

# The browser tests, run against the BUILT page: they test what the phone
# actually loads, and no Python check can see a template regression. (Tests
# nothing runs drift: four once did, for weeks.)
BROWSER_TESTS = [
    ("pagetest.js",       "the page's engine matches Node's"),
    ("sweeptest.js",      "every form calculates, attacking and defending"),
    ("abilitytest.js",    "which ability badges which move"),
    ("consistencytest.js", "every table resolves what the page asks it"),
    ("learnsettest.js",   "every form finds its movepool"),
    ("spreadtest.js",     "spread moves, the ally, and priority"),
    ("itemstest.js",      "every item, priced and attributed"),
    ("profiletest.js",    "Profile, and what changes mid-battle"),
    ("gtsorigintest.js",  "only what can leave the game is offered"),
    ("teamtest.js",       "six slots, and the clauses checked"),
    ("createtest.js",     "creating a record never overwrites one"),
    ("gtstest.js",        "a trade removes what you gave away"),
    ("buildlinktest.js",  "a build follows its Pokemon"),
    ("releasetest.js",    "only what the game can release"),
    ("homelisttest.js",   "HOME shows twelve, then the rest"),
    ("installtest.js",    "which copy a build goes on, and its trained tag"),
    # Waterfox/Firefox cut an exactly vertical gradient into pieces and paint
    # the seam twice: a bright line across every retyping card, never seen in
    # Edge. The tints run at 179.9deg; this fails if one goes back to 180.
    ("tintdirtest.js",    "no card tint is an exact vertical"),
    ("tokenstest.js",     "both dark-theme blocks define the same tokens"),
    # A <select> of one option never fires its own onchange, so every
    # single-ability species - Aegislash, Clawitzer, and all 81 Megas - showed
    # the right ability and saved null. Pins both halves of the rule: one
    # ability is a fact and gets written, two or three are a choice and stay
    # unmade.
    ("buildabilitytest.js", "the ability a build runs, and the one it saves"),
    ("pickertest.js",     "the move picker's filters stack"),
    ("findtest.js",       "the search view"),
    # Five species turn into something else mid-battle and the card has to
    # say so the way it says a Mega. It also pins the COUNT at five, so a
    # regulation adding a Wishiwashi or an Eiscue - both one species away on
    # the watchlist - fails here instead of shipping a card that omits it.
    # And every name a card can carry has its picture.
    ("formtest.js",       "what a Pokemon turns into, stone or not"),
    # The dex checklist, and the rule that is easy to get backwards: a species
    # already in HOME is done even when a copy is also welded into the
    # Champions box, because the HOME copy is the one that frees the slot.
    ("dextest.js",        "what is still missing, and in what order"),
    # Guards the measurement, not just the pixels: if pokebase ever switches
    # the move column back to a share of SETS it sums to ~400 instead of ~100
    # and every percentage in the builder silently means something else.
    ("usagetest.js",      "what this Pokemon's players run, and what of"),
    # The ALGORITHM half. jsdom lays nothing out, so the real screens are
    # swept on the device by the diagnostics button - this proves the sweep
    # itself finds what it should and, just as importantly, stays linear.
    ("overlaptest.js",    "nothing painted on top of anything else"),
    ("sptest.js",         "the SP slider"),
    ("burntest.js",       "burn halves physical only"),
    # The only test that signs in and loads a ledger WITH ROWS. Every
    # other one stubs Supabase empty, so the login gate stays up and any
    # branch that draws something only when there is something to draw
    # never runs - which is how three missing imports once reached the live
    # page with every other test green.
    ("ledgertest.js",     "the app draws a ledger that has rows in it"),
]

# How much a table is allowed to shrink before the refresh is treated as
# damage rather than news. Nothing here ever shrinks in normal operation: a
# regulation adds species and moves, and the Worlds archive only grows. A few
# percent of slack absorbs the real exceptions - a move losing its last learner
# and going un-useable, a species dropping off the ladder - while a parser that
# stopped matching, or a source that answered with an error page, lands far
# outside it. Checked against what is COMMITTED, which is by definition the
# last state that passed all of this.
# (file, what it counts, floor, how to count)
#
# "rows" is how many entries the file has. "inside" is how many things are
# inside those entries, and learnsets needs it: the file has one entry per
# Pokemon, so counting rows says 264 whether every Pokemon knows thirty moves
# or none. A regulation that quietly stripped movepools - exactly the kind of
# change a patch is allowed to make - would not have moved that number by one.
#
# The floors are deliberately not 100%. Real removals happen: M-C took Metal
# Burst and Mirror Coat off Archaludon, two entries out of some thirty
# thousand, and a guard that blocked on that would be a guard nobody could
# leave switched on. 2% of the whole is far more than any legitimate patch has
# ever removed and far less than a broken fetch.
SHRINK = [
    ("data/db/pokemon.json",      "forms",     0.98, "rows"),
    ("data/db/moves.json",        "moves",     0.98, "rows"),
    ("data/db/items.json",        "items",     0.95, "rows"),
    ("data/db/abilities.json",    "abilities", 0.98, "rows"),
    ("data/db/learnsets.json",    "learnsets", 0.98, "rows"),
    ("data/db/learnsets.json",    "moves across every learnset", 0.98, "inside"),
    ("data/meta/usage_pokemon.json", "ladder rows", 0.80, "rows"),
    # Weekly rather than nightly, so on six nights in seven this compares the
    # file against itself and costs nothing. On the seventh it is the only
    # thing standing between a broken parse and an app full of blank
    # percentages. 0.80 on the roster because a Pokemon really can drop off
    # the ladder; 0.85 on the move rows because those only move when the
    # PARSE moves - a Pokemon losing a move it was never brought with does
    # not shift 2884 by much.
    ("data/meta/usage_splits.json", "Pokemon with splits", 0.80, "rows"),
    ("data/meta/usage_splits.json", "move rows priced", 0.85, "priced"),
]


def _count(blob, how="rows"):
    """How big a data file is, in the unit SHRINK watches it by: "rows",
    "inside" (entries summed across a dict of lists) or "priced"."""
    # THE PER-POKEMON SPLITS ARE THE ONE FILE WHOSE SHAPE CHANGED UNDER US.
    # pokebase paginates those sections client-side; reading the rendered HTML
    # saw five rows of nineteen, and the same page carries two datasets whose
    # percentages do not mean the same thing. Both were found by a person
    # noticing, not by a check. "priced" counts the move rows across every
    # Pokemon - the number that collapses if the payload parse ever breaks
    # again - and it is the reason this file is in SHRINK at all.
    if how == "priced":
        mons = (blob.get("pokemon") or {}) if isinstance(blob, dict) else {}
        return sum(len((v.get("tournament") or {}).get("moves") or [])
                   for v in mons.values() if isinstance(v, dict))
    if how == "inside":
        rows = blob.get("learnsets", blob) if isinstance(blob, dict) else blob
        if isinstance(rows, dict):
            return sum(len(v) for v in rows.values()
                       if isinstance(v, (list, dict)))
        if isinstance(rows, list):
            return sum(len(v) for v in rows if isinstance(v, (list, dict)))
        return 0
    if isinstance(blob, list):
        return len(blob)
    if isinstance(blob, dict):
        for k in ("rows", "numbers", "weights", "prices", "pokemon"):
            if isinstance(blob.get(k), (list, dict)):
                return len(blob[k])
        return len([k for k in blob if not k.startswith("_")])
    return 0


def shrink_check():
    """Report any table that came back smaller than the committed one."""
    bad = []
    for rel, label, floor, how in SHRINK:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            bad.append("BLOCKED: %s is missing entirely" % rel)
            continue
        try:
            now = _count(json.loads(Path(path).read_text(encoding="utf-8")), how)
        except (OSError, ValueError, AttributeError, TypeError) as e:
            bad.append("BLOCKED: %s will not parse (%s)" % (rel, e))
            continue
        r, prev = sh(["git", "show", "HEAD:" + rel])
        if r != 0 or not prev.strip():
            continue                      # not committed yet: nothing to compare
        try:
            was = _count(json.loads(prev), how)
        except (ValueError, AttributeError, TypeError):
            continue
        if not was:
            continue
        if now < was * floor:
            bad.append("BLOCKED: %s fell from %d to %d %s (floor %d%%)"
                       % (rel, was, now, label, int(floor * 100)))
    return bad


def digest(rel):
    """sha256 of a repo file, or None if it is missing."""
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def snapshot():
    """A digest of every watched file, so the run can say what it changed."""
    return {k: digest(rel) for k, rel, _ in WATCH}


def ladder_summary():
    """The one source whose *content* is worth summarising, not just hashing."""
    p = os.path.join(META, "usage_pokemon.json")
    try:
        d = json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    rows = d.get("rows") or []
    top = [(r.get("name"), r.get("usage_percent")) for r in rows[:5]]
    return {"fetched": d.get("fetched"), "rows": len(rows), "top": top}


def log(lines):
    """Append to today's log in data/raw/daily_logs/, keeping a month."""
    os.makedirs(LOGDIR, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y-%m-%d")
    with open(os.path.join(LOGDIR, stamp + ".log"), "a", encoding="utf-8") as f:
        f.writelines(ln + "\n" for ln in lines)
    # keep a month, no more
    keep = sorted(os.listdir(LOGDIR))[-31:]
    for old in os.listdir(LOGDIR):
        if old not in keep:
            with contextlib.suppress(OSError):
                os.remove(os.path.join(LOGDIR, old))


# ------------------------------------------------- the stale-cache guard --
# Two of the app's files are GENERATED and COMMITTED, and both are built in
# part from `data/raw/`, which is 195 MB of fetched pages and is deliberately
# not in git. The nightly job fetches those sources minutes before building
# them; this laptop's copy is whatever was last fetched HERE, which has been
# months behind. So a local rebuild produces an OLDER file that looks exactly
# like a change:
#
#   tracker/engine.bundle.js  built only from data/raw/smogon_calc. The
#       committed one carried `y?.megaStone` - an optional-chaining guard the
#       nightly had picked up from upstream - and a local rebuild replaced it
#       with `y.megaStone` - and was once committed inside an unrelated
#       change, and once actually DEPLOYED by a local --no-refresh run.
#   tracker/data.js           built from data/db and data/meta, which ARE
#       committed, plus two files in data/raw.
#
# --no-refresh fetched nothing, so in that mode a difference in either can only
# mean the local cache is older than the commit - EXCEPT when the repo-side
# inputs were edited on purpose, which is how a data fix ships between
# refreshes ("apply it through the same function against the committed rows").
# So the test is not the artefact, it is its INPUTS: if nothing under data/db
# or data/meta differs from HEAD, the only input that could have moved is the
# cache, and the committed artefact - by definition the one the nightly has
# already gated - wins.
#
# It RESTORES rather than blocks. Blocking would stop every local publish from
# a machine whose cache is stale, which on this one is every publish, and the
# whole point of --no-refresh is to be the safe way to ship a hand edit.
PINNED = [
    # (the artefact, the repo-side inputs it is built from)
    ("tracker/engine.bundle.js", []),
    ("tracker/data.js", ["data/db", "data/meta"]),
]


def pin_generated():
    """Put back any generated artefact this run rebuilt from a stale cache.

    Returns the lines to report, and says which way it decided rather than
    doing it quietly. Silent when there is nothing to do - and when there is no
    git to ask, which is also the case that cannot arise: CI has no data/raw,
    so it never rebuilds either file in the first place.
    """
    said = []
    for rel, inputs in PINNED:
        rc, diff = sh(["git", "diff", "--name-only", "HEAD", "--", rel])
        if rc != 0 or not diff.strip():
            continue                      # unchanged, or no git to ask
        if inputs:
            rc2, edited = sh(["git", "diff", "--name-only", "HEAD", "--"] + inputs)
            if rc2 == 0 and edited.strip():
                said.append("kept the rebuilt %s: %d file(s) under %s differ "
                            "from the commit, so the rebuild is the point"
                            % (rel, len(edited.split()), " and ".join(inputs)))
                continue
        rc3, _ = sh(["git", "checkout", "HEAD", "--", rel])
        said.append(("restored the committed %s: nothing was fetched this run, "
                     "so the rebuild could only be older" % rel) if rc3 == 0 else
                    ("WARNING: %s was rebuilt from a stale cache and could not "
                     "be restored" % rel))
    return said


def sh(argv, cwd=ROOT):
    """Run a command; (exit code, stdout + stderr). Never raises."""
    # npx is npx.cmd on Windows and subprocess will not find it without the
    # extension; the failure would be a bare WinError 2 naming no command.
    if os.name == "nt" and argv and argv[0] in ("npx", "npm", "node"):
        argv = [argv[0] + ".cmd" if argv[0] != "node" else argv[0]] + argv[1:]
    try:
        # ENCODING NAMED, because text=True decodes with the locale codec and
        # on Windows that is cp1252: wrangler prints a box-drawing character
        # and the reader thread would die with a UnicodeDecodeError. The
        # output is read, never parsed, so replacing a byte costs nothing.
        r = subprocess.run(argv, cwd=cwd, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", check=False)
    except OSError as e:
        return 127, "could not run %s: %s" % (" ".join(argv), e)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def _parser():
    """The gate's command line."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--install-hooks", action="store_true",
                    help="point core.hooksPath at scripts/hooks, so the "
                         "pre-push gate runs on this clone too")
    ap.add_argument("--skip-deploy", action="store_true",
                    help="refresh and gate, never deploy (CI's pull requests "
                         "and the pre-push hook)")
    ap.add_argument("--no-refresh", action="store_true",
                    help="skip the fetchers: gate what is already built, then "
                         "deploy. The safe way to publish a hand edit.")
    ap.add_argument("--deep", action="store_true",
                    help="force the slow-moving sources today, whatever day it is")
    return ap


def _setup(a):
    """--install-hooks: the exit code, or None when it was not asked for."""
    if a.install_hooks:
        # The hook lives in scripts/hooks rather than .git/hooks so that it is
        # versioned, reviewable, and arrives with a fresh clone. core.hooksPath
        # is per-clone config, which is the one step that cannot be committed.
        rc, o = sh(["git", "config", "core.hooksPath", "scripts/hooks"])
        print(o.strip() or ("hooks installed: scripts/hooks"
                            if rc == 0 else "could not set core.hooksPath"))
        return rc
    return None


def _build(steps, out):
    """Run each (argv, what); False, with the reason in `out`, at the first
    that fails."""
    for argv, what in steps:
        rc, bout = sh(argv)
        if rc != 0:
            out.append("BLOCKED: could not rebuild %s" % what)
            out += ["  " + line for line in bout.splitlines()[-6:]]
            return False
    return True


def _rebuild_from_repo(out):
    """--no-refresh: rebuild from the repo, never from the network. False when
    a step failed.

    REBUILD, do not trust what is lying around. The browser tests read
    tracker/dist/index.html, which is generated and never committed: on a
    fresh checkout there is none, and on a laptop there is whatever the
    last build left. Gating a page that is not the page about to be
    published is the exact failure this whole gate exists to prevent, and
    it passed locally only because a build happened to be minutes old.
    None of this touches the network. What it CAN rebuild depends on
    where it runs, and the difference is stated rather than hidden:
    data.js and the engine bundle are built from data/raw/smogon_calc,
    which is the 195 MB source cache and deliberately not in git. On a
    laptop it is there, so they are rebuilt and a stale data/db is caught
    - and then pin_generated() puts back any of the two the stale cache
    made OLDER than the commit, which is the trap that cost two hours.
    On a fresh CI checkout it is not - but both artifacts are COMMITTED,
    and committed is by definition what the nightly job already gated.
    The page is rebuilt either way, because the page is what gets
    published and must never be a leftover.
    """
    out.append("mode: no refresh - rebuild from the repo, then gate")
    vendored = os.path.exists(os.path.join(SMOGON_CALC, "raw_species.json"))
    steps = []
    if vendored:
        steps = [([PY, "scripts/build_tracker_data.py"], "data.js"),
                 ([PY, "scripts/build_analysis_data.py"], "the analyses"),
                 ([PY, "scripts/build_splits_data.py", "--check"],
                  "what the splits percentages are a share of"),
                 ([PY, "scripts/build_splits_data.py"], "the ladder splits"),
                 ([PY, "scripts/build_outside_dex.py"],
                  "the rest of the dex"),
                 ([PY, "scripts/build_engine_bundle.py"], "engine bundle")]
    else:
        out.append("no source cache here: using the committed data.js, "
                   "analyses, the outside dex and engine bundle, "
                   "rebuilding the page from them")
    if not _build(steps, out):
        return False
    # THE GUARD SITS BETWEEN THE TWO, because the page embeds whichever
    # copy of these it finds, and what is embedded is what gets gated and
    # published.
    if vendored:
        out += pin_generated()
    if not _build([([PY, "scripts/build_tracker_page.py"], "the page")], out):
        return False
    out.append("rebuilt %s" % ("data.js, the bundle and the page"
                               if vendored else "the page"))
    return True


def _refresh(a, out):
    """Run refresh.py - deep on Mondays or with --deep - and log its tail."""
    deep = a.deep or datetime.date.today().weekday() == 0
    argv = [PY, "scripts/refresh.py"] + (["--deep"] if deep else [])
    out.append("mode: " + ("deep (Smogon analyses + pokebase splits forced)"
                           if deep else "daily (ladder + engine)"))
    rc, refresh_out = sh(argv)
    tail = [line for line in refresh_out.splitlines() if line.strip()][-4:]
    out.append("refresh.py exit %d" % rc)
    out += ["  " + line for line in tail]


def _report_changes(before, before_ladder, out):
    """What moved since `before`, into `out`; returns the WATCH labels that
    changed."""
    after = snapshot()
    after_ladder = ladder_summary()
    changed = [label for key, rel, label in WATCH
               if before.get(key) != after.get(key)]
    out.append("CHANGED: " + ", ".join(changed) if changed else "nothing moved")

    # WHICH FIELDS MOVED, not just which files. "CHANGED: move table" says a
    # file's hash differs; it does not say that Rock Slide went from 75 to 70
    # power and from a 30% flinch to 20%, which is the only part that changes
    # how a battle goes. Every number is already in the database - effect_rate
    # is 30.0, not a sentence - they simply were not being compared.
    #
    # A REPORT, never a gate: a regulation is meant to change things. What
    # blocks is the shrink guard, which is about damage rather than change.
    d, dout = sh([PY, "scripts/diff_db.py", "--limit", "30"])
    if d == 0 and dout.strip() and "no field changed" not in dout:
        out.append("WHAT CHANGED, field by field:")
        out += ["  " + line for line in dout.splitlines()[:60]]

    if before_ladder and after_ladder and before_ladder != after_ladder:
        out.append("  ladder %s (%d rows) -> %s (%d rows)"
                   % (before_ladder["fetched"], before_ladder["rows"],
                      after_ladder["fetched"], after_ladder["rows"]))
        out.append("  top now: " + ", ".join(
            "%s %s%%" % (n, p) for n, p in (after_ladder["top"] or [])))
    return changed


def _check_backup_and_shrink(out):
    """Back the ledger up, then refuse a refresh that LOST data (SHRINK).
    False blocks the deploy."""
    ok = True
    # ---- back the ledger up BEFORE anything else --------------------------
    # Supabase holds the whole ledger now and the free plan takes no backups of
    # its own, so every run that can reach the database leaves a snapshot. It
    # costs one query per table and it is the cheapest insurance in the repo.
    # Deliberately ahead of the gate: a run that is about to fail is exactly
    # when a snapshot of the last good state is worth having. Where there is no
    # database - CI - it says so and moves on.
    b, bout = sh([PY, "scripts/backup_ledger.py", "--skip-if-offline"])
    out += [line for line in bout.splitlines() if line.strip()][:3]
    if b != 0:
        ok = False
        out.append("BLOCKED: the ledger could not be backed up")

    # ---- does this refresh LOSE anything? -------------------------------
    # The formula tests pass on a dex of ten Pokemon; they check arithmetic and
    # name matching, not volume. So a source that answers with half a page - or
    # a parser that stops matching after an upstream redesign - sails straight
    # through them and quietly deletes most of the database. Everything already
    # committed is known good, so the honest test is "did the rebuild come back
    # with less than we already had". A regulation only ever ADDS.
    for line in shrink_check():
        ok = False
        out.append(line)
    if ok:
        out.append("ok: nothing shrank against the committed data")
    return ok


def _browser_failure(gout):
    """A failed check is a line node:test starts with a cross; a test that
    CRASHES prints none, and reporting only the former made fifteen failures
    read as fifteen blank lines - the cause (a hardcoded Windows path
    in every test file) was invisible in the CI log. Fall back to the
    tail of whatever it did say."""
    detail = list(dict.fromkeys(
        line.strip() for line in gout.splitlines()
        if line.startswith("✖") and "failing tests" not in line))
    if not detail:
        detail = [line for line in gout.splitlines() if line.strip()][-5:]
    return detail[:6]


def _run_checks(checks, out):
    """checks: (argv, what, the lines of a failure worth showing). False if
    any failed; every result goes into `out`."""
    ok = True
    for argv, what, why in checks:
        g, gout = sh(argv)
        if g != 0:
            ok = False
            out.append("BLOCKED: %s failed" % what)
            out += ["  " + line for line in why(gout)]
        else:
            out.append("ok: %s" % what)
    return ok


def _gate(out):
    """Correctness gate. A stale app beats a wrong one, so a failing check stops
    the deploy rather than shipping numbers nobody looked at - and because
    daily.py returns non-zero, the workflow's commit step is skipped too, so
    a bad refresh cannot reach main either."""
    ok = _check_backup_and_shrink(out)
    # ---- and the page itself -------------------------------------------
    # The browser tests run against tracker/dist/index.html, so they catch
    # what the Python checks cannot: a template edit that breaks the sheet, a
    # blob field the page reads under another name, a startup error that
    # empties every list. A test nothing runs drifts unnoticed.
    checks = ([([PY] + argv, what, lambda o: o.splitlines()[-6:])
               for argv, what in GATE_CHECKS]
              + [(["node"] + argv, what, pick[0] if pick else _last_lines)
                 for argv, what, *pick in SOURCE_CHECKS]
              + [(["node", os.path.join("tests", t)], what, _browser_failure)
                 for t, what in BROWSER_TESTS])
    return _run_checks(checks, out) and ok


def _last_lines(o):
    """What a failed source check shows: its last six non-blank lines."""
    return [line for line in o.splitlines() if line.strip()][-6:]


def _deploy(a, gate_ok, changed, out):
    """True when a deploy was attempted and landed."""
    if a.skip_deploy:
        out.append("deploy skipped (flag)")
        return False
    if not gate_ok:
        out.append("deploy skipped: a check failed")
        return False
    if not changed and not a.no_refresh:
        out.append("deploy skipped: identical build")
        return False
    d, dout = sh(["npx", "wrangler", "deploy"],
                 cwd=os.path.join(ROOT, "tracker"))
    ver = [line.strip() for line in dout.splitlines() if "Version ID" in line]
    out.append("deploy exit %d  %s" % (d, ver[0] if ver else ""))
    if d != 0:
        # A failed deploy has to fail the JOB. Logging it and
        # exiting 0 leaves an unattended run green while the
        # phone quietly keeps yesterday's build - exactly what
        # a bad CLOUDFLARE_API_TOKEN looks like, and nobody
        # would ever notice.
        out.append("FAILED: built fine, but was not published")
        out += ["  " + x for x in dout.splitlines()[-8:] if x.strip()]
    return d == 0


def main():
    """One run: refresh the sources (or rebuild from what is committed with
    --no-refresh), report what changed, run the gate, and deploy when the
    gate passed and something moved. Exit 0 only when the gate passed and
    any wanted deploy landed.
    """
    a = _parser().parse_args()
    rc = _setup(a)
    if rc is not None:
        return rc

    started = datetime.datetime.now()
    out = ["", "=" * 62,
           "daily run  %s" % started.strftime("%Y-%m-%d %H:%M:%S")]

    before = snapshot()
    before_ladder = ladder_summary()

    # Three tiers, because the sources move on different clocks and two of
    # them skip anything already cached:
    #   daily - pokebase's ladder, and Smogon's calculator (which re-downloads
    #           all 23 files every run and compares hashes, so the engine and
    #           its move table are genuinely current).
    #   deep  - Smogon's 324 written analyses and pokebase's per-Pokemon
    #           splits. Both serve from
    #           cache for ever otherwise, so without this they freeze. Neither
    #           changes daily, and 324 requests a night for nothing is rude.
    #           Mondays, or --deep.
    # A regulation needs nothing from here: refresh.py asks check_regulation
    # first and, when a new one is live, re-fetches every Serebii page itself.
    # --no-refresh exists because the AUTOMATION had become safer than the
    # human. Every hand deploy went straight out with `npx wrangler deploy`,
    # past the shrink guard, the audits and all fifteen browser tests that the
    # nightly job has to pass. That is backwards, and it is the path taken most
    # often. `python scripts/daily.py --no-refresh` gates what is already built
    # and then publishes it - same checks, same refusal to deploy.
    if not a.no_refresh:
        _refresh(a, out)
    elif not _rebuild_from_repo(out):
        log(out)
        print("\n".join(out))
        return 1

    changed = _report_changes(before, before_ladder, out)
    gate_ok = _gate(out)
    deployed = _deploy(a, gate_ok, changed, out)

    out.append("took %ds" % int((datetime.datetime.now() - started).total_seconds()))
    # data/raw is not in git, so on a fresh CI checkout it does not exist yet
    # and this was the first line to touch it
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    Path(STATE).write_text(json.dumps({"last_run": started.isoformat(),
                                       "changed": changed, "deployed": deployed}),
                           encoding="utf-8")
    log(out)
    print("\n".join(out))
    # green means "the app on Cloudflare matches this data". A
    # failed check, or a deploy attempted and not landed, is red.
    wanted = ((bool(changed) or a.no_refresh) and gate_ok
              and not a.skip_deploy)
    return 0 if (gate_ok and (deployed or not wanted)) else 1


if __name__ == "__main__":
    sys.exit(main())
