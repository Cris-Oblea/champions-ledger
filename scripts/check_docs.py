#!/usr/bin/env python3
"""Stop the documentation contradicting the decisions it records.

    python scripts/check_docs.py            # the gate's version
    python scripts/check_docs.py --list     # every decision being watched

The README's numbers are generated, so they cannot drift. The PROSE can, and it
did: on 2026-09-13 STATUS.md - the file a new session is told to read first -
still said "a build belongs to a Pokemon... dies with a release", a rule that
had been reversed two days earlier. Nothing was wrong with that sentence when
it was written. That is exactly the problem: a decision gets reversed in one
file and the four other files that stated the old one go on stating it, and the
next session reads whichever it opens first.

The player asked for this directly (2026-09-13): "STATUS.md tambien deberia ser
parte del gate como lo es README.md e incluso CLAUDE.md cuando no respeta las
decisiones mas actuales, asi ningun archivo o parte del proyecto se contradice."

So every reversed or settled decision is written down ONCE, here, with the
words the superseded version used. If those words turn up in a documentation
file, the gate stops - unless the sentence marks itself as history.

MARKING SOMETHING AS HISTORY IS THE POINT, NOT A LOOPHOLE. The old rules are
worth keeping: "a build dies with a release" is still why an orphan is worth
flagging, and deleting the sentence would delete the reasoning. Any of the
words in ACKNOWLEDGED within a few lines of the match is enough - REVERSED,
"no longer", "used to", "superseded", a strikethrough. Say it changed and the
sentence stays.

ADDING ONE. When a decision reverses, add an entry here in the same commit that
makes the change. It costs three lines and it is the only thing that stops the
next contradiction.
"""
import argparse
import contextlib
import glob
import io
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from paths import ROOT

# Files that state rules. Not analysis/ write-ups, which are dated accounts of
# one investigation and are allowed to describe what was believed at the time -
# except history.md, which is what STATUS.md used to carry and was watched then.
# CLAUDE.md was split on 2026-09-28 into a small core plus files Claude Code
# loads only when needed (.claude/rules/, the champions-rules skill), and every
# one of them states rules, so every one of them is watched.
DOCS = ["CLAUDE.md", "README.md", "STATUS.md", "tracker/README.md",
        "tests/README.md", "analysis/app_plan.md", "analysis/history.md",
        "docs/ARCHITECTURE.md"] + \
    sorted(os.path.relpath(p, ROOT).replace(os.sep, "/") for p in
           glob.glob(os.path.join(ROOT, ".claude", "**", "*.md"), recursive=True))

# CLAUDE.md is sent with EVERY request, whole: at 67 KB it cost ~17,000 tokens
# a message before anything was asked (player, 2026-09-28: "no a costa del
# rendimiento de claude code"). STATUS.md is what a new session reads first, and
# the skill's index loads with any game question. Over budget means something
# belongs in a narrower file - .claude/rules/docs.md has the map - not that the
# budget should grow.
BUDGETS = {"CLAUDE.md": 10000, "STATUS.md": 12000,
           ".claude/skills/champions-rules/SKILL.md": 10000}

# A file named in a document has to exist. The decisions below only catch the
# wording someone remembered to register; a paragraph about a file that was
# deleted or replaced goes stale with nothing to match it - STATUS.md listed
# fetch_pikalytics.py for a day after it was deleted, and CLAUDE.md sent readers
# to inventory.json for two weeks. Generated files (gitignored) and sentences
# that say the file is gone are fine.
NAMED_FILE = re.compile(
    r"`([A-Za-z0-9_./-]+\.(?:py|js|json|sql|md|yml|html|css|toml))`")
GONE = re.compile(r"dropped|removed|replaced", re.I)

# Any of these near a match means the sentence knows it is describing the past.
# Deliberately explicit: an earlier draft also accepted a bare "was" or "were",
# which appear in ordinary prose everywhere and quietly excused everything.
ACKNOWLEDGED = re.compile(
    r"REVERSED|SUPERSEDED|no longer|used to|until 20\d\d|~~|OLD RULE|"
    r"not any ?more|changed on|replaced by|superseded|"
    r"that rule (died|is gone)|do not act on|"
    # a sentence that says the thing is gone is acknowledging it, and the
    # first version of the "no ledger in the repo" rule fired on CLAUDE.md
    # stating exactly that
    r"deleted|are gone|is gone|no copy|stopped holding", re.I)

# How many lines either side of a match count as "near".
WINDOW = 4

# A negation right in FRONT of the match means the sentence states the rule
# instead of breaking it, and the first draft fired on two of those: CLAUDE.md's
# "do NOT record items in builds.json" and the README's "NO Terastallization".
# A lint that flags the correct statement of a rule is worse than no lint,
# because the fix everyone reaches for is to stop running it.
#
# It has to be the words immediately before, not anywhere on the line. Checking
# the whole line silenced a REAL contradiction on the very case this file was
# written for - "...and dies with a release. No more orphans." - where the "No"
# belongs to the next sentence entirely.
NEGATED = re.compile(r"(\bno\b|\bnot\b|\bnever\b|\bzero\b|without|"
                     r"\bdo not\b|don't|must not)[^.;:]*$", re.I)
LOOKBACK = 60

# (id, the words the OLD rule used, what is true now, where it may not appear)
DECISIONS = [
    # The one that prompted all of this. A build used to be owned by a box row
    # and deleted with it; it owns its own id now and box_id may be null.
    ("build-owns-its-id",
     r"dies with a release|one build per Pokemon|a build cannot exist without",
     "a build owns its own id; box_id is nullable and unbound is not a fault",
     DOCS),

    # The page was one 7,269-line file until 2026-09-13. Telling anyone to edit
    # it now sends them to a 23-line shell of markers, and their change would
    # be silently overwritten by the next build.
    ("edit-the-part-not-the-template",
     (r"Edit `?tracker/index\.template\.html`?,? never|"
      r"`tracker/index\.template\.html` [-—] the app"),
     "edit tracker/src/<part>; index.template.html is a shell of markers",
     DOCS),

    # check_app.js used to hunt undeclared and doubly declared names by hand,
    # and two ReferenceErrors got past it (2026-09-29). ESLint's no-undef and
    # no-redeclare make those checks now; check_app.js keeps only what no
    # linter can see.
    ("names-are-eslints-job",
     r"check_app\.js`?\*{0,2}:? (reads|reports|catches)[^.]{0,120}(import|declare)",
     ("ESLint (no-undef, no-redeclare) checks names; check_app.js checks ids "
      "and CALC switches"),
     DOCS),

    # The app was twelve numbered files, 01-data.js to 13-boot.js, with 25
    # import cycles, until 2026-09-29. It is three layers now (player: "carpetas
    # por capa"), and an import may only point down one.
    ("app-is-layered",
     (r"`?0\d-[a-z]+\.js`? (through|to|\.\.) `?1\d-[a-z]+\.js|"
      r"imports `13-boot\.js` FIRST|twelve ES modules"),
     ("tracker/src is core/, ui/, tabs/ and boot.js; an import only points down "
      "a layer, and no cycle is allowed"),
     DOCS),

    # Items are a team-level decision under the Item Clause, and the player
    # ruled them out of builds entirely on 2026-08-29.
    ("items-are-not-in-builds",
     (r"item.{0,30}(field|key) (of|in|on) (a |the )?build|"
      r"record (the )?items? in .{0,20}builds\.json"),
     "an item lives on a TEAM SLOT; only a Mega Stone is part of a build",
     DOCS),

    # Serebii's item page is the shop listing; pokebase buckets what it is
    # unsure of into a flat 2000 VP. Settled by the player 2026-09-13.
    ("serebii-wins-on-item-prices",
     r"pokebase.{0,40}(price|VP).{0,40}(wins|correct|right|authoritative)",
     "where they disagree on an item price, Serebii wins",
     DOCS),

    # The refresh runs in GitHub Actions precisely so it does not depend on one
    # laptop being awake.
    ("the-refresh-runs-in-the-cloud",
     r"(scheduled task|Task Scheduler|cron on (the|this) (laptop|machine|pc))",
     "the nightly refresh runs in GitHub Actions, never locally",
     DOCS),

    # The repo held inventory/inventory.json and inventory/builds.json until
    # 2026-09-13. They drifted in BOTH directions - the box stale in the repo,
    # ten builds stale in the app - and query.py answered from the stale half.
    ("the-repo-holds-no-ledger",
     r"inventory/(inventory|builds|teams)\.json|sync_tracker",
     "the ledger lives only in Supabase; scripts/ledger.py reads it",
     DOCS),

    # VP stopped being tracked on 2026-09-13. The costs are rules and stay;
    # a BALANCE nobody can edit goes stale and then gets quoted as current,
    # which vp_balance did for a day at 8000.
    ("vp-balance-is-not-tracked",
     r"you have \d+ VP|VP balance (is|of|:)|\bvp_balance\b (is|=) \d",
     "VP costs are rules and stay; the balance is not tracked - ask him",
     DOCS),

    # HIS STATE IS THE APP'S, NOT THE DOCUMENTATION'S (player, 2026-09-20:
    # "todo lo que tenga que ver con team, build, piedras y todo eso lo veo
    # yo... la app ya me maneja las cosas que tengo"). STATUS.md carried a box
    # count, a list of twenty builds, fourteen untrained permanents with their
    # ladder percentages and a plan for what to release next - and every one of
    # those numbers was stale, because the app is where they change. A count
    # typed into prose cannot be regenerated and nobody retypes it.
    ("the-app-owns-his-state",
     (r"^#+ *(player state|builds recorded|untrained permanents)|"
      r"\*\*Builds recorded|"
      r"[Bb]ox \*{0,2}\d+ ?/ ?\d+|"
      r"(he|you) (own|owns|holds?) \d+ (Pokemon|builds|stones|rentals)"),
     ("the box, the builds, the stones and the teams live in the app; "
      "query the ledger and never restate it"),
     DOCS),

    # A snapshot is the whole ledger in plaintext and this repo is public.
    ("no-ledger-data-in-the-repo",
     (r"commit (the )?(snapshot|seed|backup)|"
      r"supabase_seed\.sql (is|should be) (versioned|committed)"),
     "snapshots and seeds live outside the repo; the repo is public",
     DOCS),

    # The parts under tracker/src/ became ES modules on 2026-09-14, linked by
    # esbuild, and the order the imports give replaced the order of the file
    # numbers. CLAUDE.md went on saying "concatenates them" for two weeks,
    # because nobody registered the change here.
    ("the-app-is-es-modules",
     (r"concatenates them|pure concatenation|"
      r"in the order the number\s+prefixes give"),
     "tracker/src parts are ES modules linked by esbuild; imports set the order",
     DOCS),

    # Python was SonarQube for IDE's until 2026-09-30, when ruff took it over
    # for the same reason ESLint took JavaScript: Sonar has no check the gate
    # can run, so what the editor showed could never block a push.
    ("python-lint-is-ruff",
     r"SonarQube for IDE[^.]*\bPython\b|No `pip install` needed",
     "ruff lints the Python, in the gate and in VS Code",
     DOCS),

    # CSS and HTML were SonarQube for IDE's until 2026-09-30, and so could
    # drift without failing anything. stylelint and html-validate took them
    # into the gate, and Sonar was left with no language at all.
    ("css-html-lint-in-the-gate",
     r"Sonar(Qube for IDE)?\*{0,2} (for|keeps) CSS and HTML",
     "stylelint lints the CSS and html-validate the markup, both in the gate",
     DOCS),

    # ruff.toml switched rules on one pull request at a time, keeping the ones
    # with findings in an extend-ignore list, until that list emptied on
    # 2026-09-30. A document that still describes the list would tell a reader
    # some rules are optional.
    # Pins used to be bumped when someone chose to (a weekly Dependabot, the
    # Supabase CLI and the runtimes held by hand). Since 2026-10-03 every tool
    # runs its newest release: Dependabot daily and self-merging, the rest
    # floating (player: "siempre en su ultima version").
    ("tools-track-latest",
     r"\| Weekly \| Opens PRs|the pin stays for its other reason",
     "every tool runs its newest release: Dependabot daily + auto-merge, runtimes float",
     DOCS),

    ("ruff-ignores-nothing",
     r"`ruff\.toml` has a ratchet|rules that still have findings are listed",
     "ruff.toml ignores nothing past its three idiom rules; every rule blocks",
     DOCS),

    # damage.py carried a Python port of the formula as its default engine,
    # and Smogon's engine behind --engine smogon. The port read every move
    # whose power is not a number as 1 BP, Seismic Toss included, and said
    # nothing. Since 2026-09-30 damage.py is the engine alone (player: "deja
    # solo smogon"), so its flags and warning lines no longer exist.
    ("damage-py-is-smogon-only",
     r"--engine (smogon|local)|ABILITY not modelled|CONDITIONAL:|--moves-last",
     "damage.py runs only Smogon's engine and refuses a move it lacks a fact for",
     DOCS),

    # core/store.js wrapped Supabase in doc().set() / collection().onSnapshot(),
    # the storage shape of the Claude artifact the app began in. It talks to
    # Supabase directly now (2026-10-01), so no doc may send anyone to it.
    ("store-talks-to-supabase",
     r"Firestore-shaped|S\.db\.doc\(|doc\(\)\.set\(\)|collection\(\)\.onSnapshot",
     "core/store.js loads tables into S and writes rows; there is no doc() layer",
     DOCS),
]


def repo_files():
    """Every file path on disk, repo-relative, minus the two huge trees."""
    out = []
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in (".git", "node_modules")]
        rel = os.path.relpath(d, ROOT).replace(os.sep, "/")
        out += [f if rel == "." else rel + "/" + f for f in files]
    return out


def git_ignored(paths):
    """The subset of paths git ignores."""
    if not paths:
        return set()
    # bytes, not text=True: on Windows text mode writes \r\n, and git then
    # asks about "name\r", which nothing ignores
    try:
        r = subprocess.run(["git", "check-ignore", "--stdin"], cwd=ROOT,
                           input=("\n".join(paths) + "\n").encode(),
                           capture_output=True, check=False)
    except OSError:
        return set()
    return set(r.stdout.decode().split())


def ignored(names, dirs):
    """The subset of names git ignores - generated or per-machine files, which
    exist on one machine and not in CI. A bare name is tried in every
    directory, because .gitignore anchors most entries to one
    (`tracker/config.local.json`), and asking about `config.local.json` at the
    root answers no - which is how this first failed, in CI only. Only
    directories git keeps are tried: inside `data/raw/` EVERY name is ignored,
    and trying it there excused the deleted inventory.json."""
    gone = git_ignored([d + "/" for d in dirs])
    kept = [d for d in dirs if d + "/" not in gone]
    cand = {}   # one path can stand for several names: `a.json`, `x/a.json`
    for n in names:
        for c in [n] + ([d + "/" + n for d in kept] if "/" not in n else []):
            cand.setdefault(c, set()).add(n)
    return {n for c in git_ignored(list(cand)) for n in cand.get(c, ())}


def check_named_files():
    files = repo_files()
    base = {f.rsplit("/", 1)[-1] for f in files}
    found = []
    for rel in DOCS:
        lines = read(rel) or []
        for i, line in enumerate(lines):
            for m in NAMED_FILE.finditer(line):
                name = m.group(1)
                name = name[2:] if name.startswith("./") else name
                if "/" in name:
                    if any(f == name or f.endswith("/" + name) for f in files):
                        continue
                elif name in base:
                    continue
                near = "\n".join(lines[max(0, i - WINDOW):i + WINDOW + 1])
                if ACKNOWLEDGED.search(near) or GONE.search(near):
                    continue
                found.append((rel, i + 1, name))
    dirs = {f.rsplit("/", 1)[0] for f in files if "/" in f}
    gen = ignored({n for _, _, n in found}, dirs)
    problems = 0
    for rel, n, name in found:
        if name in gen:
            continue
        problems += 1
        print("%s:%d names %s, which does not exist" % (rel, n, name))
        print("      (fix the reference, or say it was deleted/replaced)")
    return problems


# docs/ARCHITECTURE.md is the map of the code, so what the code HAS must be on
# it (player, 2026-09-29: "todo lo que es escritura para entender, saber,
# siempre este actualizado"). A new module, workflow, pipeline script, table or
# package the map does not name fails the gate until it is written in.
ARCH = "docs/ARCHITECTURE.md"


def architecture_parts():
    import build_tracker_page  # the one definition of what a part is

    def names(pattern, strip=""):
        return sorted(os.path.basename(f)[:len(os.path.basename(f)) - len(strip)]
                      for f in glob.glob(os.path.join(ROOT, pattern)))
    tables = set()
    for f in glob.glob(os.path.join(ROOT, "tracker", "*.sql")):
        tables |= set(re.findall(r"create table if not exists public\.(\w+)",
                                 Path(f).read_text(encoding="utf-8"), re.I))
    with open(os.path.join(ROOT, "requirements.txt"), encoding="utf-8") as f:
        pips = [re.split(r"[=<>~!\[ ]", line.strip())[0] for line in f
                if line.strip() and not line.startswith("#")]
    pkg = json.loads(Path(ROOT, "package.json").read_text(encoding="utf-8"))
    return [
        # by path, because a bare name would be found in the wrong place:
        # "data.js" is also tracker/data.js, a different file entirely
        ("app module", build_tracker_page.parts()),
        ("workflow", names(".github/workflows/*.yml")),
        ("pipeline script", names("scripts/fetch_*.py", ".py")
         + names("scripts/build_*.py", ".py")
         + names("scripts/audit_*.py", ".py")),
        ("Supabase table", sorted(tables)),
        ("npm package", sorted(list(pkg.get("dependencies", {}))
                               + list(pkg.get("devDependencies", {})))),
        ("pip package", sorted(pips)),
    ]


def check_architecture():
    text = "\n".join(read(ARCH) or [])
    problems = 0
    for kind, found in architecture_parts():
        for name in found:
            if not re.search(r"(?<![\w-])%s(?![\w-])" % re.escape(name), text):
                problems += 1
                print("%s never names the %s %s - add it where it belongs"
                      % (ARCH, kind, name))
    return problems


def check_budgets():
    problems = 0
    for rel, limit in BUDGETS.items():
        size = os.path.getsize(os.path.join(ROOT, rel))
        if size > limit:
            problems += 1
            print("%s is %d bytes, over its budget of %d - move detail to the "
                  "narrowest file that still loads when it matters "
                  "(.claude/rules/docs.md)" % (rel, size, limit))
    return problems


def read(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    return Path(p).read_text(encoding="utf-8").split("\n")


# The memory index is outside the repo, so the gate never sees it; the hook
# does, because the hook is told which file was just written. Claude Code's own
# limit is 25 KB, but every byte of it is loaded into every session.
MEMORY_BUDGET = 8000


def check_memory(folder):
    """The auto-memory index: every link resolves, every memory is linked (an
    unlinked one is never found again), and the index stays small."""
    idx = os.path.join(folder, "MEMORY.md")
    if not os.path.exists(idx):
        return 0
    text = Path(idx).read_text(encoding="utf-8")
    linked = set(re.findall(r"\]\(([^)]+\.md)\)", text))
    files = {f for f in os.listdir(folder)
             if f.endswith(".md") and f != "MEMORY.md"}
    problems = ["MEMORY.md links %s, which does not exist" % f
                for f in sorted(linked - files)]
    problems += ["%s is not in MEMORY.md, so no session will find it" % f
                 for f in sorted(files - linked)]
    size = len(text.encode("utf-8"))
    if size > MEMORY_BUDGET:
        problems.append("MEMORY.md is %d bytes, over its budget of %d - one "
                        "short line per memory" % (size, MEMORY_BUDGET))
    for line in problems:
        print(line)
    return len(problems)


def hook():
    """PostToolUse hook for Edit|Write (.claude/settings.json). Silent, and so
    free in tokens, unless the markdown file just written broke something -
    then exit 2 hands the report to Claude while the edit is still fresh,
    instead of three minutes later in the pre-push gate."""
    try:
        path = json.load(sys.stdin).get("tool_input", {}).get("file_path", "")
    except ValueError:
        return 0
    path = path.replace("\\", "/")
    if not path.endswith(".md"):
        return 0
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        if "/memory/" in path:
            bad = check_memory(os.path.dirname(path))
        else:
            bad = check_repo()
    if bad:
        sys.stderr.write(out.getvalue())
        return 2
    return 0


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--hook", action="store_true",
                    help="read a PostToolUse event on stdin (see hook())")
    a = ap.parse_args()

    if a.hook:
        return hook()
    if a.list:
        for did, _stale, now, _files in DECISIONS:
            print("  %-32s %s" % (did, now))
        print("\n%d decision(s) watched across %d file(s)"
              % (len(DECISIONS), len(DOCS)))
        return 0
    return check_repo()


def check_repo():
    missing = [d for d in DOCS if read(d) is None]
    if missing:
        print("these documents are listed but do not exist: %s"
              % ", ".join(missing))
        return 1

    problems = 0
    for did, stale, now, files in DECISIONS:
        pat = re.compile(stale, re.I)
        for rel in files:
            lines = read(rel)
            if lines is None:
                continue
            for i, line in enumerate(lines):
                m = pat.search(line)
                if not m:
                    continue
                if NEGATED.search(line[max(0, m.start() - LOOKBACK):m.start()]):
                    continue
                lo, hi = max(0, i - WINDOW), min(len(lines), i + WINDOW + 1)
                if ACKNOWLEDGED.search("\n".join(lines[lo:hi])):
                    continue
                problems += 1
                print("%s:%d contradicts \"%s\"" % (rel, i + 1, did))
                print("      says : %s" % line.strip()[:96])
                print("      now  : %s" % now)
                print("      (say it changed - REVERSED, 'no longer', 'used "
                      "to' - and it passes)")

    problems += check_named_files() + check_budgets() + check_architecture()
    if problems:
        print("\n%d problem(s). Fix the sentence or mark it as history."
              % problems)
        return 1
    print("no document contradicts a settled decision (%d watched), names a "
          "missing file, or is over budget (%d files)"
          % (len(DECISIONS), len(DOCS)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
