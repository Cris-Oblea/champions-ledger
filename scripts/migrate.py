#!/usr/bin/env python3
"""Apply the SQL migrations, and know which ones already ran.

    python scripts/migrate.py            # apply whatever is pending
    python scripts/migrate.py --check    # list them; fail if anything is pending

The migrations (`supabase/supabase_migrate_*.sql`) used to be pasted into the
Supabase SQL editor by hand, and nothing recorded that it had happened. That is
how a schema and the client that reads it drift apart: add a column, forget to
paste it, and the app breaks at runtime with a message about a column that
exists in the repo and not in the database. Migration 4 added `builds.box_id`;
migration 5 added the whole `teams` table. Neither left a trace anywhere but a
commit.

So a `schema_migrations` table records the file names, and `--check` joins the
gate. RLS is ON with no policy at all, which is the point: the CLI connects as
postgres and reads it, while PostgREST - the path the app and any anonymous
caller use - can see nothing.

Every migration is written to be safe to re-run, and this only adds a memory of
which have been. Where the database cannot be reached - CI has no credentials -
`--check` says so and does not pretend to have verified anything.
"""
import argparse
import glob
import os
import re
import sys
from pathlib import Path

import backup_ledger
from paths import ROOT

SQLDIR = os.path.join(ROOT, "supabase")

LEDGER = """
create table if not exists public.schema_migrations (
  name        text        primary key,
  applied_at  timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
"""


def sql(text):
    """Run SQL through backup_ledger's Supabase CLI door. Returns (ok, output).

    The CLI takes one string, and a `--` comment would swallow everything after
    it on the way through the shell, so comments are stripped and the whole
    file is sent as one line.
    """
    return backup_ledger.sql(" ".join(line for line in text.splitlines()
                                      if not line.strip().startswith("--")))


def files():
    """Every migration, in the order their numbers say."""
    found = glob.glob(os.path.join(SQLDIR, "supabase_migrate_*.sql"))
    def num(p):
        m = re.search(r"_(\d+)\.sql$", p)
        return int(m.group(1)) if m else 0
    return sorted(found, key=num)


def applied():
    """The names already recorded, or None if the database is unreachable."""
    ok, out = sql(LEDGER + " select name from public.schema_migrations;")
    if not ok:
        return None
    return set(re.findall(r'"name":\s*"([^"]+)"', out))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="exit non-zero if a migration has not been applied")
    a = ap.parse_args()

    all_files = [os.path.basename(p) for p in files()]
    if not all_files:
        print("no migrations found")
        return 0

    done = applied()
    if done is None:
        # CI has no Supabase credentials. Saying so beats a green tick that
        # verified nothing - the whole reason this file exists.
        print("cannot reach the database, so nothing was verified.")
        print("  %d migration files on disk: %s"
              % (len(all_files), ", ".join(all_files)))
        return 0

    pending = [f for f in all_files if f not in done]
    for f in all_files:
        print("  %-28s %s" % (f, "applied" if f in done else "PENDING"))

    if not pending:
        print("\nall %d applied" % len(all_files))
        return 0
    if a.check:
        print("\n%d PENDING - run: python scripts/migrate.py" % len(pending))
        return 1

    for f in pending:
        print("\napplying %s..." % f)
        text = Path(SQLDIR, f).read_text(encoding="utf-8")
        ok, out = sql(text)
        if not ok:
            print(out.strip()[-600:])
            print("FAILED on %s - nothing after it was attempted" % f)
            return 1
        ok, out = sql("insert into public.schema_migrations (name) values ('%s') "
                      "on conflict (name) do nothing;" % f.replace("'", "''"))
        if not ok:
            print(out.strip()[-400:])
            print("applied %s but could not record it" % f)
            return 1
        print("  ok")
    print("\napplied %d" % len(pending))
    return 0


if __name__ == "__main__":
    sys.exit(main())
