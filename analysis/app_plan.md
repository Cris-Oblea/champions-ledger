# Where the app goes next

Written 2026-09-13, after the player asked three things at once: the team
builder is missing, the hand-deploy path was a hole I had just patched with
discipline rather than structure, and "what is a personal app today could one
day be a free one anybody uses".

Ordered so that each phase removes the reason the next one would be painful.
Nothing here is started; this is the argument for the order.

---

## Phase 0 — make the pipeline the ONLY way out

**The problem, stated honestly.** The nightly job now passes a shrink guard,
four audits and fifteen browser tests before it may deploy or commit. A person
at a keyboard passed none of them until `daily.py --no-refresh` existed, and
still passes none of them if they forget to use it. The automation is safer
than the human, on the path taken far more often. Patching that with a habit
is not a fix; it is a promise.

**The structural answer: nobody deploys from a laptop.**

1. **A second workflow, on push to `main`**, running the same gate. Not the
   05:30 cron - every push. Then a broken change is caught in minutes whether
   or not anyone remembered anything.
2. **Move the deploy into CI.** The laptop pushes; CI gates and publishes. The
   Cloudflare token stops living on the laptop at all, which is a security win
   on its own. `--no-refresh` stays for a local dry run, but loses the deploy.
3. **A branch rule on `main`** so the gate must be green to merge. With one
   person this feels like ceremony; it is what makes step 2 enforceable rather
   than conventional.

**Cost:** a publish becomes push-and-wait-two-minutes instead of instant.
**Buys:** the hole cannot be re-opened by forgetting, and the deploy key leaves
the laptop. Do this first, because every later phase is more code moving
faster.

---

## Phase 1 — the team builder, which is the missing half of the app

**What exists.** `builds` holds one set per box row: nature, ability, SP,
moves. `analysis/team_plans.json` holds five rich team write-ups - `slots`,
`shared_holes`, `item_resolution`, `open_questions` - as hand-written prose,
**in the repo only**. The app has never seen them.

So the app can answer "what is this Pokemon running" and cannot answer "what am
I bringing", which is the question the game actually asks.

**The design follows a rule already settled in CLAUDE.md.** Items are a
team-level decision, not part of a build: the Item Clause means a team of six
fields exactly one Sitrus Berry, so an item preference stored per build is
work that gets thrown away. That rule is the whole reason the team builder is
the right home for items, and why this is not a cosmetic feature.

**Shape:**

- A team is a name plus up to **six slots**. A slot points at a *build*, and a
  build points at a box row - so a Pokemon can sit in any number of teams, as
  the player asked, and editing its build updates every team at once.
- **The item lives on the slot**, with the one-line reason it holds it. That
  is exactly `teams.json`'s existing shape, moved somewhere it can be checked.
- **The clauses are enforced, not remembered.** No repeated item. No repeated
  species - and not even a repeated *form*, which is why a second Squawkabilly
  is trade material rather than a spare. Both are measured facts in this repo,
  not folklore.
- **The Mega rule is a warning, never a block**: several stones are legal and
  75% of Worlds teams carried two; only one Pokemon may actually Mega Evolve in
  a battle. The app should say which slots hold stones and that the choice is
  made at team preview.
- **Derived, never typed:** the team's shared type holes (the type chart is
  already in the blob), its speed order, which members are rentals and
  therefore cannot be trained, and which builds are unfinished.

**Migration:** `analysis/team_plans.json` is the seed. Import the five, keep the
prose in a `notes` field rather than discarding it - the reasoning in those
files is the most valuable thing in the repo and none of it is derivable.

---

## Phase 2 — make the shape ready before it has to change under load

Small, boring, and far cheaper now than later.

- **A real `teams` table** rather than another key in `meta`'s jsonb. `meta` is
  a scratchpad; a thing with rows, ordering and per-row fields wants columns.
- **Numbered SQL migrations that run themselves.** There are already three
  hand-pasted `supabase_migrate_*.sql` files. A fourth pasted by hand is how a
  schema and a client drift apart.
- ~~**One id scheme.** UUIDs, with the slug kept as a display name.~~
  **Not done, and the reason this said otherwise was wrong.** The premise was
  that slugs "collide the moment two people own one"; the primary key is
  `(user_id, id)`, so they never collide between accounts. And the readable id
  is load-bearing - the build picker shows it to tell `farigiraf` from
  `farigiraf-2`. The real defect was narrower and is fixed: creation used
  `upsert` with the next number this DEVICE could see free, so two devices
  creating at once both picked it and the second overwrote the first. It
  inserts now and lets Postgres' 23505 say what is taken (`putNew`).
- ~~**Split the page.**~~ **Done 2026-09-13.** `tracker/src/`, thirteen parts
  plus the stylesheet and the markup, concatenated by the build. Verified by
  diffing the assembled source against the file it replaced: identical but for
  the thirteen header comments. `scripts/check_app.js` now reads the parts back
  as one program and runs inside the gate, because a name two parts both
  declare is exactly what the split makes easy.

---

## Phase 3 — only if it should be public

The architecture is closer than it looks: every table already carries
`user_id`, RLS already returns zero rows to an anonymous caller, and that was
verified rather than assumed. What is missing is not the data model.

- **Sign-up.** There is a login, but no way to become a user, and
  `config.local.json` carries one email as a convenience.
- **An empty state that teaches.** A new user lands on a box with nothing in
  it. Today the app assumes 141 Pokemon and five years of context.
- **Seeding a box.** The player's own route was a JSON import through a repo
  script. A stranger needs the screenshot reader, or a paste box, in the app.
- **Cost.** Cloudflare Workers and Supabase free tiers are generous, but the
  page is ~1 MB with the dex and engine inlined. Fine for one user, and the
  first thing to split if there are thousands.
- **The licence question.** The dex is derived from Serebii, pokebase, Smogon
  and pokedata. Publishing it to a handful of friends is one thing; a public
  product redistributing four sources' data is a different conversation, and it
  should happen before launch rather than after.

---

## What NOT to do

- Do not start Phase 3 work inside Phase 1. "Someday public" is a reason to
  keep the shape clean, not a reason to build sign-up flows for one user.
- Do not put items back on builds to save a join. That rule was learned the
  expensive way.
- Do not add a check that nothing runs. Four browser tests sat broken for weeks
  because nothing ran them; every new check joins the gate in `daily.py` or it
  does not exist.
