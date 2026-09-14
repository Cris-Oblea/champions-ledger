-- 6. The stones and the items become rows.
--
-- Both were one jsonb document per user in `meta`: {owned:[...]}. That shape
-- is fine for something that IS one document, and wrong the moment two devices
-- write it, which is now the normal case - the player edits from the laptop
-- and from the phone (2026-09-14).
--
-- The failure is silent, which is what makes it worth a migration. Toggling a
-- stone rewrites the WHOLE list from whatever copy that device last loaded.
-- A phone that was asleep when the laptop marked a stone owned will, on its
-- next toggle, write a list that never had it - and nothing anywhere says a
-- write was lost. Realtime hides it most of the time and that is the problem:
-- it fails only when a device was out of touch, which is exactly when nobody
-- is watching.
--
-- A row per owned thing makes the two writes independent. Marking a stone on
-- the phone is an INSERT of that stone; marking another on the laptop is an
-- INSERT of that one. Neither can erase the other, whatever either device last
-- read. The primary key is the name, so owning something twice is not a state
-- the database can be in.
--
-- The categories that used to ride along in the items document are not carried
-- over on purpose: they are the game's own grouping and come from the dex now,
-- and setItem() already stored plain names. The old documents are LEFT IN
-- PLACE - this migration only adds - so rolling back is deleting two tables.
--
-- Safe to re-run.

create table if not exists public.stones (
  user_id    uuid        not null default auth.uid()
                         references auth.users(id) on delete cascade,
  -- the stone's own name, "Charizardite Y". Readable, and the thing the app
  -- already keys everything else on: stone_for() maps each of the 81 Megas to
  -- exactly one of the 81 stones by name.
  id         text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.stones enable row level security;
drop policy if exists stones_own on public.stones;
create policy stones_own on public.stones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.items (
  user_id    uuid        not null default auth.uid()
                         references auth.users(id) on delete cascade,
  id         text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.items enable row level security;
drop policy if exists items_own on public.items;
create policy items_own on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Carry what is already owned across. `on conflict do nothing` is what makes
-- the whole file re-runnable: a second run finds every row present and changes
-- nothing.
insert into public.stones (user_id, id)
select src.uid, src.name from (
  select m.user_id as uid, s.value #>> '{}' as name
    from public.meta m,
         lateral jsonb_array_elements(coalesce(m.data -> 'owned', '[]'::jsonb)) s
   where m.id = 'stones' and jsonb_typeof(s.value) = 'string'
) src
where src.name is not null and src.name <> ''
on conflict (user_id, id) do nothing;

-- Items were written two ways over time: a plain name, and the older
-- [name, [category]] pair. Both are read here, because a migration that
-- silently drops the older half of a list is the exact fault this is fixing.
insert into public.items (user_id, id)
select src.uid, src.name from (
  select m.user_id as uid,
         case when jsonb_typeof(i.value) = 'array' then i.value ->> 0
              else i.value #>> '{}' end as name
    from public.meta m,
         lateral jsonb_array_elements(coalesce(m.data -> 'owned', '[]'::jsonb)) i
   where m.id = 'items'
) src
where src.name is not null and src.name <> ''
on conflict (user_id, id) do nothing;

-- Realtime: the app subscribes to one channel for the lot, and a table that is
-- not published simply never announces a change - the other device would show
-- a stale list until a reload, which is half of what this migration is for.
-- `add table` errors if the table is already there, and every migration here
-- has to survive a re-run, so it is asked first.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'stones') then
    alter publication supabase_realtime add table public.stones;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'items') then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;
