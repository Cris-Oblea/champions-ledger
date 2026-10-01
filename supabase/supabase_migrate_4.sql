-- 4. A build stops being the box row it sits on.
--
-- Until now the build id WAS the box row id: one Pokemon, one build, and no
-- build without a Pokemon to carry it. That rule came from the player on
-- 2026-09-10 and he replaced it on 2026-09-13 with two he wants instead:
--
--   * SEVERAL builds for one species. Three different Farigiraf, and the
--     choice of which to run is made in game, or per team.
--   * A build for a Pokemon he does NOT own, so an idea can be written down
--     the day he has it rather than lost for want of a row to hang it on. The
--     app warns that it cannot be used until the Pokemon exists.
--
-- So `id` becomes an independent key and the link moves into `box_id`, which
-- is nullable: null means "an idea, not installed on anything".
--
-- Safe to re-run.

alter table public.builds add column if not exists box_id text;

-- Backfill: every existing build IS installed on the row whose id it borrowed.
update public.builds set box_id = id where box_id is null;

-- A build points at a box row of the same owner, or at nothing. No foreign key
-- to box: deleting a Pokemon should ORPHAN its build, not delete it - losing a
-- set because the Pokemon was traded away is exactly what the player is fixing.
create index if not exists builds_box_id_idx on public.builds (user_id, box_id);
