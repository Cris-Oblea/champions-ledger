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
import argparse, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Files that state rules. Not analysis/ write-ups, which are dated accounts of
# one investigation and are allowed to describe what was believed at the time.
DOCS = ["CLAUDE.md", "README.md", "STATUS.md", "tracker/README.md",
        "tests/README.md", "analysis/app_plan.md"]

# Any of these near a match means the sentence knows it is describing the past.
# Deliberately explicit: an earlier draft also accepted a bare "was" or "were",
# which appear in ordinary prose everywhere and quietly excused everything.
ACKNOWLEDGED = re.compile(
    r"REVERSED|SUPERSEDED|no longer|used to|until 20\d\d|~~|OLD RULE|"
    r"not any ?more|changed on|replaced by|superseded|"
    r"that rule (died|is gone)|do not act on", re.I)

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
     r"Edit `?tracker/index\.template\.html`?,? never|"
     r"`tracker/index\.template\.html` [-—] the app",
     "edit tracker/src/<part>; index.template.html is a shell of markers",
     DOCS),

    # Items are a team-level decision under the Item Clause, and the player
    # ruled them out of builds entirely on 2026-08-29.
    ("items-are-not-in-builds",
     r"item.{0,30}(field|key) (of|in|on) (a |the )?build|"
     r"record (the )?items? in .{0,20}builds\.json",
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

    # A snapshot is the whole ledger in plaintext and this repo is public.
    ("no-ledger-data-in-the-repo",
     r"commit (the )?(snapshot|seed|backup)|"
     r"supabase_seed\.sql (is|should be) (versioned|committed)",
     "snapshots and seeds live outside the repo; the repo is public",
     DOCS),
]


def read(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    return io.open(p, encoding="utf-8").read().split("\n")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()

    if a.list:
        for did, stale, now, files in DECISIONS:
            print("  %-32s %s" % (did, now))
        print("\n%d decision(s) watched across %d file(s)"
              % (len(DECISIONS), len(DOCS)))
        return 0

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

    if problems:
        print("\n%d contradiction(s). Fix the sentence or mark it as history."
              % problems)
        return 1
    print("no document contradicts a settled decision (%d watched)"
          % len(DECISIONS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
