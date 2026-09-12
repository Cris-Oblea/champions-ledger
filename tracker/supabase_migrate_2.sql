-- Champions Ledger - shiny and trained flags
--
-- Paste into the Supabase SQL Editor and press Run. Safe to run more than once.
--
-- Two facts about a Pokemon in HOME that the box list could not hold:
--
--   shiny    - cosmetic, but it is the reason a particular copy is the one you
--              keep, so it belongs next to the name rather than in a note
--   trained  - a HOME-origin Pokemon trained inside Champions KEEPS that
--              training forever: HOME stores the Champions metadata, so it
--              comes back with its moves, nature, ability and SP intact, for
--              no VP. That makes "already trained" the difference between a
--              slot you can reuse freely and one that costs ~1830 VP to rebuild.

alter table public.box
  add column if not exists shiny   boolean not null default false,
  add column if not exists trained boolean not null default false;

-- what the rows look like now
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'box'
order by ordinal_position;
