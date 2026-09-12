-- Champions Ledger - Supabase schema
--
-- Paste the whole file into the Supabase SQL Editor and press Run.
-- Safe to run more than once.
--
-- The shape mirrors the artifact database exactly, so the same app code and
-- the same sync script work against either one:
--
--   box     one row per Pokemon, in the Champions box or in HOME
--   builds  one row per trained set
--   meta    trainer / stones / items / gts, one row each, body in jsonb
--
-- Every table is protected by Row Level Security keyed on the signed-in user.
-- That is what makes the page safe to host anywhere: the HTML carries no data,
-- and the anon key it does carry cannot read a row that is not yours.

-- ---------------------------------------------------------------- tables ---

create table if not exists public.box (
  user_id    uuid        not null default auth.uid()
                         references auth.users(id) on delete cascade,
  id         text        not null,
  name       text        not null,
  -- champions = in the game's box; home = parked in Pokemon HOME
  location   text        not null default 'champions'
                         check (location in ('champions','home')),
  -- a rental is a timed Encounter loan and can never be trained
  status     text        not null default 'permanent'
                         check (status in ('permanent','rental')),
  -- ORIGIN decides whether the slot is elastic. home = caught in GO or traded
  -- in, can be parked back and recalled with the training intact. champions =
  -- came out of an Encounter and can never leave the box. unknown = NOT ASKED
  -- YET, which is not the same as champions.
  origin     text        not null default 'unknown'
                         check (origin in ('home','champions','unknown')),
  note       text        not null default '',
  ord        integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.builds (
  user_id      uuid        not null default auth.uid()
                           references auth.users(id) on delete cascade,
  id           text        not null,
  pokemon      text        not null,
  mega         text,
  ability      text,
  mega_ability text,
  nature       text,
  -- {hp,atk,def,spa,spd,spe} - 66 points total, 32 max in one stat
  stat_points  jsonb       not null default '{}'::jsonb,
  moves        text[]      not null default '{}',
  role         text        not null default '',
  rationale    text        not null default '',
  -- every one-off key from inventory/builds.json round-trips in here so no
  -- note is ever lost: mega_note, build_constraint, threats, meta_note...
  extra        jsonb       not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.meta (
  user_id    uuid        not null default auth.uid()
                         references auth.users(id) on delete cascade,
  id         text        not null,          -- trainer | stones | items | gts
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ------------------------------------------------------------- updated_at --

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists box_touch    on public.box;
drop trigger if exists builds_touch on public.builds;
drop trigger if exists meta_touch   on public.meta;

create trigger box_touch    before update on public.box
  for each row execute function public.touch_updated_at();
create trigger builds_touch before update on public.builds
  for each row execute function public.touch_updated_at();
create trigger meta_touch   before update on public.meta
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------- security --
-- Without these policies the tables are readable by nobody, which is the
-- correct default. Each policy grants a signed-in user access to their own
-- rows and to nothing else. `with check` stops a client writing a row it
-- would not then be allowed to read.

alter table public.box    enable row level security;
alter table public.builds enable row level security;
alter table public.meta   enable row level security;

drop policy if exists box_own    on public.box;
drop policy if exists builds_own on public.builds;
drop policy if exists meta_own   on public.meta;

create policy box_own on public.box
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy builds_own on public.builds
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy meta_own on public.meta
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- realtime -
-- So a change made on the phone shows up on the PC without a refresh.

do $$
begin
  begin
    alter publication supabase_realtime add table public.box;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.builds;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.meta;
  exception when duplicate_object then null;
  end;
end $$;

-- ------------------------------------------------------------------ check --
-- Should return three tables, each with rowsecurity = true.

select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('box','builds','meta')
order by tablename;
