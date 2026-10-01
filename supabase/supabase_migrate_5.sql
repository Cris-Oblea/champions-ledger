-- 5. Teams.
--
-- The app could answer "what is this Pokemon running" and nothing could answer
-- "what am I bringing", which is the question the game asks. Five teams existed
-- as hand-written prose in inventory/teams.json and the app had never seen one.
--
-- A slot points at a BUILD, not at a box row, so a Pokemon can sit in any
-- number of teams and editing its set updates all of them at once - the player
-- asked for exactly that. A build may itself be unbound (an idea), which is
-- what lets a team be four-sixths real and still worth writing down.
--
-- THE ITEM LIVES ON THE SLOT. That is not a layout choice: the Item Clause
-- means a team of six fields exactly one Sitrus Berry, so an item stored per
-- build is a preference that cannot survive contact with a team. Settled in
-- CLAUDE.md long before this table existed.
--
-- Safe to re-run.

create table if not exists public.teams (
  user_id    uuid        not null default auth.uid()
                         references auth.users(id) on delete cascade,
  id         text        not null,
  name       text        not null,
  -- [{build_id, item, why}] - up to six, order is the team order. A slot with
  -- no build_id is an empty slot the player has not filled yet.
  slots      jsonb       not null default '[]'::jsonb,
  -- the reasoning: the idea, what is still open, what was rejected. The prose
  -- in inventory/teams.json is the most valuable thing in that file and none
  -- of it is derivable, so it round-trips here rather than being dropped.
  notes      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.teams enable row level security;
drop policy if exists teams_own on public.teams;
create policy teams_own on public.teams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
