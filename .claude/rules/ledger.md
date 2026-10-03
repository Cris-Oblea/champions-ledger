---
paths:
  - "scripts/{ledger,backup_ledger,migrate}.py"
  - "supabase/**"
  - ".github/workflows/**"
  - "cron/**"
---

# The ledger: Supabase, what Claude may read, and the backup

## The player maintains the ledger himself now (2026-09-09)

`tracker/README.md` is the full write-up. The short version:

**The box, HOME, the stones, the items, VP and the editable half of every build
live in a web app the player opens on his phone.** He updates them there, as
they happen, without asking. So **never ask him to restate the box or who is a
rental** - query it.

The data is in **Supabase** (project `champions-ledger`, tables `box`, `builds`,
`meta`), behind Row Level Security. An **anonymous** request with the
publishable key returns zero rows — that part is by design and still true.
**But Claude CAN read the ledger** (corrected by the player 2026-09-10): the
Supabase CLI on this machine is logged into his account and linked to the
project, so it reads the tables directly, no Docker and no password:

```bash
supabase db query "select location, status, count(*) from box group by 1,2" --linked
supabase db query "select id, pokemon, nature, moves from builds" --linked -o json
```

So **never say the data is unreachable, and never ask him to restate what a
query would answer.**

**A fresh clone has no link, so run `supabase link --project-ref <ref>` once.**
The CLI keeps its link in `supabase/.temp/`, which is gitignored (it carries
the organisation id and the pooler host, and this repo is public). Untracking
it on 2026-09-13 removed it from the working tree on the next checkout and
every `db query --linked` failed with "Cannot find project ref" until it was
put back - the files themselves are harmless, they just must not be committed.
 Two caveats. `supabase db dump` needs Docker Desktop
running and will fail without it — `db query` does not. And fetching the
project's API keys is a credential action the permission layer blocks; there is
no need for it, because `db query` already reads everything.

**THERE IS NO COPY IN THE REPO ANY MORE, and nothing to sync** (player,
2026-09-13: "ya nada deberia guardar datos en el repo, la DB es la que manda en
ese sentido"). `inventory/` and `sync_tracker.py` are deleted. They had drifted
in both directions at once - the box said 47 against a real 38, HOME 39 against
101, while `builds.json` held ten sets the app had never seen - and
`query.py owned` was printing the stale number.

`scripts/ledger.py` is what reads it now, and `query.py` goes through it:

```bash
python scripts/ledger.py              # box, HOME, stones, items, VP, builds
python scripts/ledger.py --refresh    # ignore the 15-minute cache
```

It answers from a short-lived cache, then the live database, then the newest
backup snapshot - and it says which. With none of the three it returns empty
structures rather than raising, so `query.py` still answers what it can
where there is no database at all. Only `query.py` imports it: the build
scripts read through `dex.py`, which never touches the ledger.

**VP IS NO LONGER TRACKED, AND THAT IS DELIBERATE** (player, 2026-09-13: "en
la app ya hablamos sobre eso y no es necesario... solo dejamos la casilla box
para modificarla"). Profile has one editable field, box capacity. A balance
nobody can edit goes stale and then gets quoted as current - `vp_balance` sat
at 8000 from 2026-09-12 - so nothing reads it any more.

**The COSTS stay, because they are rules, not state**: SP 5, move 250, nature
500, ability 500, a Mega Stone 2000, keeping a rental 2500. They live in
`scripts/ledger.py`. So keep saying what a build COSTS - that is still part of
every recommendation - and never state what he HAS. If a decision turns on the
balance, ask him.

**Origin is recorded at registration now (player, 2026-09-10), so "unknown" is
no longer a state the box can be in.** Every route in settles it, and there are
only three: adding to the Champions Box is always an Encounter (bought or
rental, both Champions origin); arriving from HOME is a MOVE, made from the
HOME row's "Send to Champions", which sets HOME origin and carries the record
across rather than writing a second one. Adding a HOME-origin Pokemon straight
into the Champions Box was possible and was removed - it left the HOME copy in
place, the same duplicate the GTS trade used to leave. "Ask rather than guess the origin"
is now enforced by the app instead of being a note. A leftover `unknown` from
before that is counted as Champions origin and flagged on screen, never hidden.

**"Permanent" is the wrong word and the app no longer uses it (player,
2026-09-09).** What matters is ORIGIN: HOME origin can be parked back to
HOME and recalled with the training intact, so the slot is elastic; Champions
origin came out of an Encounter and can never leave the box. The app records
it per Pokemon in the box table's `origin` column, and `unknown` means **not
asked yet** — never read it as
Champions origin when advising.

**Never put a `service_role` / `sb_secret_` key in `tracker/config.local.json`
or anywhere near the page** — it bypasses RLS entirely. `build_tracker_page.py`
refuses to build if it finds one. The publishable key in the page is fine and
is meant to be there.

**The ledger is backed up, and the backup is tested** (player, 2026-09-13:
"no tenemos un sistema de backup cuando supabase sea atacado... supabase es la
que guarda TODA la informacion"). `scripts/backup_ledger.py` snapshots every
table to `~/ChampionsLedgerBackups` - **outside the repo, because the repo is
public and a snapshot is the whole ledger in plaintext**, the same reason
`supabase_seed.sql` was deleted. It runs automatically: `daily.py` takes one
before the gate on every local run, and `.github/workflows/backup.yml` pushes a
nightly one to a separate PRIVATE repo. `--restore FILE` is a dry run until
`--confirm`, and both directions were tested against the live database on a
throwaway row - it puts a deleted row back AND removes one the snapshot does
not have. A gate check fails when the newest snapshot is over three days old.
**Never write a snapshot into the repo, and never commit one.**
