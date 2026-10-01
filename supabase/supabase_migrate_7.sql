-- 7. The GTS becomes rows, and a trade becomes ONE row for its whole life.
--
-- meta/gts was a document with two arrays in it: open_offers and history. Three
-- faults came out of that shape, and the third is the one with a deadline.
--
-- 1. Every write rewrote both arrays. The code knows it - there is a comment at
--    the "Withdrew it" button reading "history is a sibling key on the same
--    document - a put() that omits it would erase every closed trade on
--    record". A landmine that has to be remembered is a landmine.
--
-- 2. Two devices. Logging an offer on the phone rewrote the document from the
--    phone's copy, so anything the laptop had written while the phone was
--    asleep was dropped, silently. Same reason as migration 6.
--
-- 3. THE HISTORY IS TRUNCATED. One call site writes `history.slice(0, 60)`, so
--    the 61st closed trade deletes the oldest one. There are 34. The player's
--    own pricing rule - that a chip fetches its MEGA's BST rather than its
--    base - was derived from remembering five closed trades, and the summary
--    line on the History fold is computed over all of them. Losing the oldest
--    is losing the evidence the rule rests on, and it would happen quietly.
--
-- A trade is one row from the moment it is deposited to the moment it closes.
-- Open and closed are not two lists, they are `closed_at is null` or not - so
-- closing a trade is an UPDATE of the row that already exists rather than a
-- delete from one array and a differently-shaped push onto another. That the
-- two shapes even had different field names (offered/requested against
-- gave/got) is a symptom of the same thing, and they are one name here.
--
-- The old document is LEFT IN PLACE. Rolling back is dropping one table.
--
-- Safe to re-run.

create table if not exists public.gts (
  user_id      uuid        not null default auth.uid()
                           references auth.users(id) on delete cascade,
  id           text        not null,
  offered      text        not null,
  requested    text        not null,
  -- WHICH copy was deposited. A box with three Chesnaught has to lose the
  -- right one when the trade closes, so the offer remembers the box row.
  offered_id   text,
  -- the date the player can edit, and the machine stamp beside it: BST does
  -- not explain why Indeedee went in hours while a Beedrill sat for days, and
  -- a date alone cannot measure that - two trades on one day look identical.
  deposited    text,
  deposited_at timestamptz,
  -- null while the offer is open. This is the only thing that separates an
  -- open offer from a closed trade.
  closed       text,
  closed_at    timestamptz,
  note         text        not null default '',
  -- what the trade MEASURED: gaveBst, gaveValue, gotBst, gaveShiny, days,
  -- tookMs, rankAtDeposit. Facts about one closed trade, never queried across
  -- rows, and they are what make the history pricing data rather than a diary.
  data         jsonb       not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.gts enable row level security;
drop policy if exists gts_own on public.gts;
create policy gts_own on public.gts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Carry both arrays across as rows. The ids are readable and numbered exactly
-- the way putNew() numbers a build - garchomp, garchomp-2 - so a row created
-- by the app tomorrow is indistinguishable from one migrated today.
insert into public.gts (user_id, id, offered, requested, offered_id,
                        deposited, deposited_at, closed, closed_at, note, data)
select user_id,
       case when n = 1 then slug else slug || '-' || n end,
       offered, requested, offered_id, deposited, deposited_at,
       closed, closed_at, note, data
  from (
    select *, row_number() over (partition by user_id, slug
                                 order by sort_key, offered, requested) as n
      from (
        -- the open offers
        select m.user_id,
               v ->> 'offered'                        as offered,
               coalesce(v ->> 'requested', '')        as requested,
               v ->> 'offeredId'                      as offered_id,
               v ->> 'deposited'                      as deposited,
               nullif(v ->> 'depositedAt', '')::timestamptz as deposited_at,
               null::text                             as closed,
               null::timestamptz                      as closed_at,
               coalesce(v ->> 'note', '')             as note,
               (v - 'offered' - 'requested' - 'offeredId' - 'deposited'
                  - 'depositedAt' - 'note')           as data,
               nullif(trim(both '-' from lower(regexp_replace(
                 coalesce(v ->> 'offered', ''), '[^A-Za-z0-9]+', '-', 'g'))), '')
                                                      as slug,
               coalesce(v ->> 'depositedAt', v ->> 'deposited', '') as sort_key
          from public.meta m,
               lateral jsonb_array_elements(
                 coalesce(m.data -> 'open_offers', '[]'::jsonb)) v
         where m.id = 'gts'
        union all
        -- the closed trades. gave/got become offered/requested: one trade, one
        -- pair of names, whichever end of its life it is at.
        select m.user_id,
               v ->> 'gave',
               coalesce(v ->> 'got', ''),
               null,
               v ->> 'deposited',
               nullif(v ->> 'depositedAt', '')::timestamptz,
               v ->> 'closed',
               nullif(v ->> 'closedAt', '')::timestamptz,
               '',
               (v - 'gave' - 'got' - 'deposited' - 'depositedAt' - 'closed'
                  - 'closedAt'),
               nullif(trim(both '-' from lower(regexp_replace(
                 coalesce(v ->> 'gave', ''), '[^A-Za-z0-9]+', '-', 'g'))), ''),
               coalesce(v ->> 'closedAt', v ->> 'closed', '')
          from public.meta m,
               lateral jsonb_array_elements(
                 coalesce(m.data -> 'history', '[]'::jsonb)) v
         where m.id = 'gts'
      ) rows
     where slug is not null
  ) numbered
on conflict (user_id, id) do nothing;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'gts') then
    alter publication supabase_realtime add table public.gts;
  end if;
end $$;
