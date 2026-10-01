-- 2026-09-11 — the HOME invariant, enforced by the database.
--
-- On 2026-09-11 eleven Pokemon sent from GO into HOME were written with
-- status='rental'. The cause was in the app: #sheetBody is a single reused
-- node, innerHTML="" clears its children but not the expandos hung on it, so
-- the Champions sheet's {v:"rental"} choice survived into the next HOME add
-- and kept applying until the page was reloaded. The sheet for a HOME record
-- offered no way to undo it either.
--
-- The app is fixed in three places, but the rule belongs here too: HOME is not
-- a place where rental or Champions origin can mean anything. A Pokemon in
-- HOME is trainable, its slot is elastic, and it got there from HOME.
-- Rejecting it at the database means no client can reintroduce it.

-- Dropped first so this file can be re-run: Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS, and scripts/migrate.py needs every migration
-- to be safe to apply twice - it records what has run, and the only way to
-- give it a truthful starting point was to re-apply the four that predate it.
alter table box drop constraint if exists box_home_is_permanent;
alter table box
  add constraint box_home_is_permanent
  check (location <> 'home' or (status = 'permanent' and origin = 'home'));
