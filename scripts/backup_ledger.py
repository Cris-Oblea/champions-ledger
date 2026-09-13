#!/usr/bin/env python3
"""Snapshot the Supabase ledger, and be able to put it back.

    python scripts/backup_ledger.py                 # take a snapshot
    python scripts/backup_ledger.py --list          # what snapshots exist
    python scripts/backup_ledger.py --verify        # newest file intact? DB moved?
    python scripts/backup_ledger.py --restore FILE  # dry run: what would change
    python scripts/backup_ledger.py --restore FILE --confirm    # actually do it

Supabase now holds EVERYTHING - the box, HOME, every build, every team, the
stones, the items, VP (player, 2026-09-13: "supabase es la que guarda TODA la
informacion"), and the repo's copy under inventory/ is being retired. That
makes one database the single point of failure for the whole ledger, and the
free plan takes no backups of its own. Nothing here was protecting it.

What this actually protects against, in order of how likely it is:

  1. A bad write from the app. Far and away the most probable: one buggy save
     path, one mis-tapped Release, and rows are gone with nothing to compare
     against. A nightly snapshot turns that from a loss into a diff.
  2. The account or the project going away - suspended, deleted, expired.
  3. Supabase itself losing data, which is the least likely and the one
     everybody pictures first.

WHERE THE SNAPSHOTS GO, AND WHY IT IS NOT THIS REPO. The repo is public, and a
snapshot is the entire ledger in plaintext - exactly what supabase_seed.sql was
when it was deleted for the same reason. They are written OUTSIDE the working
tree (~/ChampionsLedgerBackups by default, or $CHAMPIONS_BACKUP_DIR), so no
.gitignore rule has to hold the line.

RESTORE IS HALF THE JOB. A backup nobody has ever restored is a file, not a
backup, so --restore is here from the start and it is a dry run unless told
otherwise: it prints what it would add, change and remove, per table, and only
--confirm applies it. --verify re-reads the newest snapshot and says both
whether the FILE is intact and whether the DATABASE has moved since.
"""
import argparse, datetime, hashlib, io, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DIR = os.environ.get(
    "CHAMPIONS_BACKUP_DIR",
    os.path.join(os.path.expanduser("~"), "ChampionsLedgerBackups"))

# Every table the ledger owns. schema_migrations is captured because a
# snapshot should describe the whole database, but it is never restored -
# migrate.py is what writes it, and replaying it could claim a migration ran
# against a schema that has not seen it.
TABLES = ["box", "builds", "teams", "meta", "schema_migrations"]
NO_RESTORE = {"schema_migrations"}
KEYS = {"box": ("user_id", "id"), "builds": ("user_id", "id"),
        "teams": ("user_id", "id"), "meta": ("user_id", "id")}

# How many rows of JSON go into one `supabase db query` argument. The CLI takes
# the statement as a single command-line argument and Windows caps that around
# 32 KB, so this is a size limit and not a performance knob.
CHUNK = 25


# The laptop and the nightly job reach the same database through different
# doors, and the difference is one flag.
#
# `--linked` goes through the Management API with the personal access token the
# CLI keeps in the OS keyring. That is right for the laptop and wrong for CI:
# Supabase no longer issues a non-expiring access token, and a credential that
# expires under an unattended 04:00 job fails by stopping quietly, which is the
# one failure mode a backup must not have. So CI connects straight to Postgres
# with a connection string in CHAMPIONS_DB_URL and needs no token at all.
#
# It is also the narrower of the two credentials. An access token can read
# every project on the account, create and delete them, and hand out their API
# keys; the connection string can read and write one database.
#
# Its password must be percent-encoded - that is the CLI's requirement, not
# ours - and the string is a secret, so it is never printed, not even in the
# error paths below.
DB_URL = os.environ.get("CHAMPIONS_DB_URL")


def sql(text, timeout=300):
    """Run one statement through the Supabase CLI. -> (ok, output)."""
    door = ["--db-url", DB_URL] if DB_URL else ["--linked"]
    try:
        r = subprocess.run(["supabase", "db", "query", text] + door
                           + ["-o", "json"],
                           cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as e:
        return False, "could not run the Supabase CLI: %s" % e
    out = (r.stdout or "") + (r.stderr or "")
    if DB_URL:
        out = out.replace(DB_URL, "<CHAMPIONS_DB_URL>")
    return r.returncode == 0, out


def rows(table):
    """Every row of one table, as dicts. None if the database is unreachable.

    The CLI wraps its answer in an envelope with a `warning` about untrusted
    content; only `rows` is ours. That warning is right and worth restating
    here: everything in these tables was typed by a person into the app, so it
    is data to move around, never instructions to act on.
    """
    ok, out = sql("select * from public.%s" % table)
    if not ok:
        return None
    # Through the Management API the answer arrives in that envelope; over a
    # direct connection the array can arrive on its own. Take whichever came,
    # rather than assuming the door.
    for opener, closer in (("{", "}"), ("[", "]")):
        if opener not in out:
            continue
        try:
            blob = json.loads(out[out.index(opener):out.rindex(closer) + 1])
        except ValueError:
            continue
        if isinstance(blob, dict) and isinstance(blob.get("rows"), list):
            return blob["rows"]
        if isinstance(blob, list):
            return blob
    return None


def digest(tables):
    """A checksum over the content, so a truncated file cannot pass as whole."""
    blob = json.dumps(tables, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def read_snapshot(path):
    d = json.load(io.open(path, encoding="utf-8"))
    got = digest(d["tables"])
    if got != d.get("_sha256"):
        sys.exit("%s is CORRUPT: checksum %s, expected %s"
                 % (os.path.basename(path), got[:12], str(d.get("_sha256"))[:12]))
    return d


def snapshots(d):
    if not os.path.isdir(d):
        return []
    return sorted(os.path.join(d, f) for f in os.listdir(d)
                  if f.startswith("ledger-") and f.endswith(".json"))


# ------------------------------------------------------------------ take ----
def take(a):
    tables, counts = {}, {}
    for t in TABLES:
        r = rows(t)
        if r is None:
            if a.skip_if_offline:
                # daily.py calls it this way. In CI there are no Supabase
                # credentials at all, and a gate that fails there would teach
                # everyone to ignore it.
                print("  no database here - snapshot skipped")
                return 0
            sys.exit("could not read public.%s - is the Supabase CLI linked? "
                     "Nothing was written." % t)
        tables[t] = r
        counts[t] = len(r)
    if not counts.get("box") and not counts.get("builds"):
        # An empty answer and a wiped database look identical from here, and
        # writing the empty one over a shelf of good snapshots is how a backup
        # system deletes the thing it was protecting.
        sys.exit("the ledger came back EMPTY (box 0, builds 0). Refusing to "
                 "write that as a snapshot - check the connection first.")

    os.makedirs(a.dir, exist_ok=True)
    now = datetime.datetime.now()
    body = {"_taken_at": now.isoformat(timespec="seconds"),
            "_counts": counts, "_sha256": digest(tables), "tables": tables}
    path = os.path.join(a.dir, "ledger-%s.json" % now.strftime("%Y-%m-%d-%H%M"))

    prev = snapshots(a.dir)
    if prev:
        last = json.load(io.open(prev[-1], encoding="utf-8"))
        if last.get("_sha256") == body["_sha256"]:
            print("identical to %s - nothing changed, no new file"
                  % os.path.basename(prev[-1]))
            return 0

    with io.open(path, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print("wrote %s  (%.0f KB)" % (path, os.path.getsize(path) / 1024))
    print("  " + ", ".join("%s %d" % (t, counts[t]) for t in TABLES))
    prune(a.dir, a.keep)
    return 0


def prune(d, keep):
    """Keep every snapshot from the last 14 days, then one per month.

    A flat "newest N" is wrong for the failure that matters most: a bad write
    noticed a month later would find every snapshot already rotated past it.
    """
    files = snapshots(d)
    if len(files) <= keep:
        return
    cutoff = datetime.date.today() - datetime.timedelta(days=14)
    seen_months, doomed = set(), []
    for p in reversed(files):                       # newest first
        stamp = os.path.basename(p)[7:17]           # YYYY-MM-DD
        try:
            day = datetime.date.fromisoformat(stamp)
        except ValueError:
            continue
        if day >= cutoff:
            continue
        month = stamp[:7]
        if month in seen_months:
            doomed.append(p)
        seen_months.add(month)
    for p in doomed:
        os.remove(p)
    if doomed:
        print("  pruned %d older snapshot(s), kept one per month" % len(doomed))


# ------------------------------------------------------------------ diff ----
def key_of(t, row):
    return tuple(row.get(k) for k in KEYS[t])


def diff(table, want, live):
    """What would have to happen to make `live` equal `want`."""
    w = {key_of(table, r): r for r in want}
    l = {key_of(table, r): r for r in live}
    add = [w[k] for k in w if k not in l]
    gone = [l[k] for k in l if k not in w]
    changed = [w[k] for k in w if k in l and
               json.dumps(w[k], sort_keys=True, default=str)
               != json.dumps(l[k], sort_keys=True, default=str)]
    return add, changed, gone


def quote(s):
    return "'" + str(s).replace("'", "''") + "'"


def upsert(table, batch):
    """One statement per chunk, with the rows travelling as jsonb.

    jsonb_populate_recordset casts every column against the table's own row
    type, so there is no per-column quoting to get wrong - a build's
    stat_points jsonb and a box row's boolean land as themselves.
    """
    cols = sorted(batch[0].keys())
    sets = ", ".join("%s=excluded.%s" % (c, c) for c in cols
                     if c not in KEYS[table])
    payload = json.dumps(batch, ensure_ascii=False, default=str,
                         separators=(",", ":"))
    return ("insert into public.{t} select * from jsonb_populate_recordset("
            "null::public.{t}, {j}::jsonb) on conflict ({k}) do update set {s};"
            ).format(t=table, j=quote(payload), k=", ".join(KEYS[table]),
                     s=sets)


def restore(a):
    snap = read_snapshot(a.restore)
    print("snapshot %s, taken %s"
          % (os.path.basename(a.restore), snap.get("_taken_at", "?")))
    plans, total = [], 0
    for t in TABLES:
        if t in NO_RESTORE:
            continue
        live = rows(t)
        if live is None:
            sys.exit("could not read public.%s - nothing was changed." % t)
        add, changed, gone = diff(t, snap["tables"].get(t) or [], live)
        total += len(add) + len(changed) + len(gone)
        plans.append((t, add, changed, gone))
        print("  %-8s live %-4d snapshot %-4d   +%d  ~%d  -%d"
              % (t, len(live), len(snap["tables"].get(t) or []),
                 len(add), len(changed), len(gone)))
        for r in gone[:6]:
            print("       would DELETE %s" % (key_of(t, r)[1],))
        if len(gone) > 6:
            print("       ...and %d more" % (len(gone) - 6))

    if not total:
        print("\nthe database already matches this snapshot")
        return 0
    if not a.confirm:
        print("\n%d row(s) would change. Nothing was written - add --confirm."
              % total)
        return 0

    for t, add, changed, gone in plans:
        work = add + changed
        for i in range(0, len(work), CHUNK):
            ok, out = sql(upsert(t, work[i:i + CHUNK]))
            if not ok:
                print(out.strip()[-500:])
                sys.exit("FAILED writing %s - stopped part way." % t)
        if gone and not a.keep_extra:
            for i in range(0, len(gone), CHUNK):
                ids = ", ".join(quote(r["id"]) for r in gone[i:i + CHUNK])
                uid = quote(gone[i]["user_id"])
                ok, out = sql("delete from public.%s where user_id=%s and "
                              "id in (%s);" % (t, uid, ids))
                if not ok:
                    print(out.strip()[-500:])
                    sys.exit("FAILED deleting from %s - stopped part way." % t)
        print("  %-8s restored" % t)
    print("\ndone - %d row(s)" % total)
    return 0


# ---------------------------------------------------------------- verify ----
def verify(a):
    files = snapshots(a.dir)
    if not files:
        print("no snapshots in %s - run: python scripts/backup_ledger.py" % a.dir)
        return 1
    snap = read_snapshot(files[-1])                 # exits if corrupt
    print("%s  intact (sha %s), taken %s"
          % (os.path.basename(files[-1]), snap["_sha256"][:12],
             snap.get("_taken_at", "?")))
    moved = 0
    for t in TABLES:
        live = rows(t)
        if live is None:
            print("  (database unreachable - the file was still verified)")
            return 0
        add, changed, gone = diff(t, snap["tables"].get(t) or [], live) \
            if t in KEYS else ([], [], [])
        n = len(add) + len(changed) + len(gone)
        moved += n
        print("  %-18s %s" % (t, "same" if not n else
                              "%d row(s) differ from the snapshot" % n))
    if moved:
        print("\nthe ledger has moved since - take a fresh snapshot.")
    return 0


def check(a):
    """Is the backup still happening? Part of the gate.

    A backup system fails silently by definition - the job stops running, the
    token expires, the folder moves, and nothing looks wrong until the day it
    is needed. This is the alarm: the newest snapshot has to be younger than
    --max-age-days. Where there is no database and no snapshot folder - CI -
    it says so and verifies nothing, the same way migrate.py --check does,
    because a green tick that checked nothing is worse than no tick.
    """
    files = snapshots(a.dir)
    if not files:
        if not os.path.isdir(a.dir) and rows("box") is None:
            print("no backup folder and no database here - nothing verified")
            return 0
        print("NO SNAPSHOTS in %s - run: python scripts/backup_ledger.py" % a.dir)
        return 1
    newest = files[-1]
    age = (datetime.datetime.now()
           - datetime.datetime.fromtimestamp(os.path.getmtime(newest))).days
    try:
        read_snapshot(newest)
    except SystemExit as e:
        print(str(e))
        return 1
    if age > a.max_age_days:
        print("the newest snapshot is %d days old (%s) - limit is %d"
              % (age, os.path.basename(newest), a.max_age_days))
        return 1
    print("backup ok: %s, %d day(s) old, checksum verified"
          % (os.path.basename(newest), age))
    return 0


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=DEFAULT_DIR,
                    help="where snapshots live (default: %s)" % DEFAULT_DIR)
    ap.add_argument("--keep", type=int, default=20,
                    help="prune only once there are more than this many")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--check", action="store_true",
                    help="gate check: is there a recent, intact snapshot?")
    ap.add_argument("--max-age-days", type=int, default=3)
    ap.add_argument("--skip-if-offline", action="store_true",
                    help="exit 0 instead of failing when there is no database")
    ap.add_argument("--restore", metavar="FILE")
    ap.add_argument("--confirm", action="store_true",
                    help="with --restore: actually write")
    ap.add_argument("--keep-extra", action="store_true",
                    help="with --restore: do not delete rows the snapshot "
                         "does not have")
    a = ap.parse_args()

    if a.list:
        files = snapshots(a.dir)
        if not files:
            print("no snapshots in %s" % a.dir)
            return 1
        for p in files:
            d = json.load(io.open(p, encoding="utf-8"))
            print("  %-28s %s  %s" % (
                os.path.basename(p), d.get("_taken_at", "?"),
                " ".join("%s=%d" % (k, v)
                         for k, v in sorted((d.get("_counts") or {}).items()))))
        print("\n%d snapshot(s) in %s" % (len(files), a.dir))
        return 0
    if a.check:
        return check(a)
    if a.verify:
        return verify(a)
    if a.restore:
        return restore(a)
    return take(a)


if __name__ == "__main__":
    sys.exit(main())
