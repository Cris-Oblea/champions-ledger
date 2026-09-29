# Where the app goes next

Written 2026-09-13, after the player asked three things at once: the team
builder is missing, the hand-deploy path was a hole I had just patched with
discipline rather than structure, and "what is a personal app today could one
day be a free one anybody uses".

Ordered so that each phase removes the reason the next one would be painful.
Phases 0 to 2 are done (the gate owns the deploy, teams are a table with
numbered migrations, the app is split into modules) and were cut from this
file on 2026-09-29; git history has them. What is left is Phase 3.

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
  script. A stranger needs a way in the app: a paste box, or an import.
- **Cost.** Cloudflare Workers and Supabase free tiers are generous, and the
  page is already split into hashed, cached assets. Supabase's row and
  bandwidth limits are what thousands of users would hit first.
- **The licence question.** The dex is derived from Serebii, pokebase, Smogon
  and pokedata. Publishing it to a handful of friends is one thing; a public
  product redistributing four sources' data is a different conversation, and it
  should happen before launch rather than after.

---

## What NOT to do

- Do not start Phase 3 work for one user. "Someday public" is a reason to
  keep the shape clean, not a reason to build sign-up flows for one user.
- Do not put items back on builds to save a join. That rule was learned the
  expensive way.
- Do not add a check that nothing runs. Four browser tests sat broken for weeks
  because nothing ran them; every new check joins the gate in `daily.py` or it
  does not exist.
