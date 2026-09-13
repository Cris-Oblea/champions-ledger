# Champions Ledger — the tracker you edit yourself

Open it on the phone, on Windows, on anything with a browser — same data, saved
the moment you tap. It exists so the box, HOME, the builds, the stones and the
VP stop being things you have to *tell somebody* about.

## Where the data lives

**Supabase** (project `champions-ledger`), in three tables: `box`, `builds`,
`meta`. Not in the page, not in this repo, not in Claude.

That split is what makes the page safe to host anywhere. The HTML is a shell —
the app, the dex, 514 moves, the learnsets — and carries no row of yours. The
publishable key travels inside it because the browser needs it to speak to
PostgREST at all; Supabase publishes that key for exactly this purpose. What
keeps the data private is **Row Level Security plus your password**, measured,
not assumed:

| Who is asking | Rows returned |
|---|---|
| Anonymous, holding the publishable key | **0** |
| Signed in as a different account | **0** |
| Signed in as you | **all of them** |

A `service_role` / `sb_secret_` key bypasses all of that and must never reach
`config.local.json` or the page — `build_tracker_page.py` refuses to build if
it finds one.

## What owns what

| | The tracker | This repo |
|---|---|---|
| Who is in the box, permanent or rental | **owns it** | mirror |
| Who is in HOME, GTS offers open | **owns it** | mirror |
| Stones and items owned, VP, rank, tickets | **owns it** | mirror |
| A build's nature, SP, moves, ability, Mega | **owns it** | mirror |
| Why a build is the way it is, the long notes, the changelogs | reads | **owns it** |
| Every scraped source, usage, damage maths | — | **owns it** |

An import never touches the prose. `_comment`, `_changelog`, `mega_note`,
`build_constraint`, `threats` and every other one-off key round-trip untouched
through the doc's `extra` bag.

## The two commands

```bash
# the sources moved (Serebii / pokebase / Smogon / pokedata / Pikalytics)
python scripts/refresh.py                 # normal
python scripts/refresh.py --regulation    # a new regulation dropped
python scripts/refresh.py --tracker-only  # just rebuild the page

# what the ledger holds (the repo keeps no copy of it)
python scripts/ledger.py                              # box, HOME, stones, VP
python scripts/backup_ledger.py                       # snapshot it
python scripts/backup_ledger.py --restore FILE        # dry run
```

RLS means nothing *anonymous* can read the data — the publishable key in the
page gets zero rows — but the Supabase CLI here is logged into the owner's
account and linked to the project, so reading it needs no export:

```bash
supabase db query "select * from box order by ord" --linked -o json
supabase db query "select count(*) from builds" --linked
```

`db query` talks to the remote database directly. `db dump` is the one that
needs Docker Desktop running.

`refresh.py` ends by regenerating `tracker/data.js` and `tracker/index.html`.
Ask Claude to republish that file and the phone has the new dex, moves, stones
and learnsets. The reference blob is 157 KB of derived data — 340 forms, 514
useable moves, 256 learnsets, 81 stones, 118 items, 215 abilities — so nothing
in the page is typed by hand and nothing goes stale on its own.

**The repo holds no copy of the ledger** as of 2026-09-13. It used to, under
`inventory/`, and the two had drifted in opposite directions - the box stale in
the repo, ten builds stale in the app. `scripts/ledger.py` reads the database
instead, and `scripts/backup_ledger.py` is what keeps a copy, outside the
working tree.

## What the page checks so you don't have to ask

- **Box count** is derived, never typed. `box_used` can no longer drift.
- **66 SP / 32 per stat**, live, with the level-50 stat beside every slider.
- **Species Clause** — a repeated species is flagged as trade material, not a spare.
- **Learnset** — the move picker only offers moves that Pokemon actually learns,
  ranked by BP × accuracy, showing this game's BP, accuracy and PP.
- **Priority pairing** — a physical priority move on a special attacker is called out.
- **Spread moves** — the ×0.75 is shown, with the reminder that it goes back to
  full power once one target is left; the 14 moves that also hit your own ally
  are flagged separately from the 21 that don't.
- **Intimidate on your own side** — named with the five abilities that punish it.
- **Weather Ball** — never quoted as a Normal 50 BP move.
- **Rental** — the build editor says outright that nothing on it can be applied
  until the Pokemon is permanent.

## Finding a move in the build editor

The picker offered one sort and nothing else, so "which special Electric move do
I actually have" meant reading a list ordered by something unrelated. It now
carries a sort and three filter groups, and **they stack**: the sort is one
choice, each group ANDs with the others, and the chips inside one group OR
together.

- **Sort:** BP x accuracy (the default, and the right one for picking an
  attack), A-Z, PP, or grouped by Type.
- **Show only:** Physical / Special / Status, and Spread / Hits ally / Priority.
- **Type:** one chip per type the Pokemon actually learns, in that type's colour.
- A count line reads "N of M moves", so a filter that hides everything is
  obvious rather than looking like an empty movepool.

Locked in by `tests/pickertest.js`. **The search view's "+ Move" runs the same
controls** - one `moveFilters` implementation for both, so the same question is
not asked two different ways. The calculator's own move sheet still has the
plain search.

## Items

The tab is called **Items**, because that is what the game calls it, and it
lists **every item in the game in the four groups Champions itself uses** -
Hold Items (57), Mega Stones (81, in their own pane), Berries (28) and
Miscellaneous (33). The grouping is not invented here: Serebii lays its item
page out as one table per group under a `<b>` heading, and `build_db.py` now
reads those headings instead of throwing them away.

Each row reads like a Mega Stone row - **what the item does**, what it costs,
and whether you own it - because the previous pane was two rows of toggle
buttons that showed 118 item names and no descriptions at all, and asked
`prompt()` for a made-up "shop category" before it would record anything.

On prices: 63 of the 118 have a VP price on Serebii. The rest are not shop
items (Beginning, Achievements, Battle Pass) or are ones Serebii itself prints
as "??? VP", and neither is turned into a number here - the row says where the
item comes from instead. Owned items are stored as plain names now; the old
`[name, [category]]` rows still read.

### What an item is for

Every item is linked to the moves and abilities it serves, and the link is not
item -> move. It is **item -> the field effect it names -> everything that
causes that effect**, which is the only way to catch both halves: Heat Rock
extends the sun, so it belongs to **Sunny Day and to Drought**. Matching item
text against move names found the move and missed the ability every time -
Electric Seed named Electric Terrain and never Electric Surge, which is what
actually turns the terrain on for most teams.

68 of the 85 hold items and berries link; the 17 that do not say why, and 7 of
those are the status berries, blocked by the same missing status column the
ability audit records. On a move row the item is shown as a tag, but only the
**specific** ones - Life Orb rides on all 334 attacks and would badge every row
with noise, so anything covering more than 8 moves stays out of that index.

### Two sources for the text, picked per entry

Serebii's descriptions are flavour where pokebase's are mechanics - and the
other way round often enough that neither can be taken wholesale:

| | Serebii | pokebase |
|---|---|---|
| Taunt | "Gives the target the Taunted status." | "...only attack moves for **three turns**" |
| Air Balloon | "makes the holder float in the air" | "**immune to Ground-type moves**, Spikes, Toxic Spikes, Sticky Web" |
| Stone Edge | "**1-stage** Critical-Hit Ratio Boost" | "a heightened chance of a critical hit" |
| Sheer Force | "increased in power by **30%**" | "increases the moves' power" |

So `build_text_facts.py` scores each text on what it actually states - digits,
percentages, fractions, stages, turns - penalises a bare "gives the X status",
and takes the winner; a tie goes to Serebii, this project's ground truth for
rules. Moves: Serebii keeps 434, pokebase takes 43 and fills 27 Serebii had
nothing at all for. Abilities: Serebii 204, pokebase 9. Both originals are kept
in `data/db/text_facts.json`, and the report prints every entry where the two
disagree.

### Statuses

Third pane of the same tab, because it is the fourth thing that decides a turn
and the app said nothing about it. **Champions rebalanced three of them**, and
the app was quietly leaving the console-game numbers to be assumed:

| | Champions | was |
|---|---|---|
| Paralysis | **12.5%** to lose the turn (Speed still 50%) | 25% |
| Freeze | **25%** thaw, only on a turn it tries to move | 20% |
| Sleep | **33.3%** to wake on turn 2, **100%** on turn 3 | a 2-4 turn roll |

Every number carries its source on the tag: `serebii` is Champions' own
rebalance page, `measured` was run through Smogon's engine (burn's x0.5 on
physical attacks), and `main_series` is the other games' value, kept only where
no Champions source states one and **labelled "main-series number"** rather than
shown as fact. Each status also lists the moves that inflict it - 88 moves
classify, and that same column is what finally gave Insomnia, Limber, Immunity
and the status berries their move lists.

Locked in by `tests/itemstest.js` and `tests/findtest.js`.

## The search view

- **Abilities are bucketed**, ten ways, and the chips carry a count. The two
  "changes moves" buckets are **not** a second reading of the text: they are
  the RULES table in `build_ability_moves.py` with the side each ability was
  given, so a classification already made cannot drift. The other eight
  (weather, terrain, speed and turn order, status, stat changes, items and
  berries, switching and copying, everything else) are read off the ability
  text by that same script, and `--audit` prints every bucket so a wrong one is
  visible. The search box also matches the ability's text now, not just its
  name.
- **"In my box" is two filters**, not one: *In Champions* answers "can I play
  this today" and *In HOME* answers "can I bring it in". Both on means either
  box. Owning the base row matches its Megas too, because owning it is what
  puts the Mega line in reach.

- **Types ask two different questions.** "Rock AND Steel" is a dual type and
  can only ever be two, because nothing has three; "Rock OR Steel OR Ground" is
  a whole group and has no limit. The type sheet asks which one you mean, stays
  open so several can be picked in one go, and the mode is switchable from the
  filter bar. Picking three in ALL mode says why nothing matched instead of
  showing an empty list.

## What a move actually does

The blob carried every number about a move and **not one word about its
effect**, so the app could tell you Nuzzle was 20 BP and never that it
paralyses. Serebii's effect line now ships with each move (falling back to the
long text; 28 moves have neither, and those are the plain-damage ones), and:

- it is printed under the move in the build editor's picker, in the search
  view's move sheet, and on a build's own move rows;
- **the search box reads it**, so "critical" finds the 21 moves with a crit
  boost and "burn" finds the ones that burn, none of which have that word in
  their name.

The ability sheet in the search view searches the ability text the same way.

Locked in by `tests/findtest.js`.

## A build belongs to a Pokemon, not to a species

Player's rule, 2026-09-10. A build is the set **this** Pokemon is carrying, so
it is stored under the same id as its box row and follows it:

| The Pokemon | Its build |
|---|---|
| in the Champions box | **active** — the set it is actually running |
| parked back in HOME | **kept, but inactive** — nothing trains in HOME, and it returns with the Pokemon |
| released | **deleted with it** |

A Champions-origin Pokemon can only leave the box by being released, so its
build always dies with it. A HOME-origin one has "Park back to HOME", which
keeps both — and the Release confirmation says so when there is a build to
lose, so the destructive door is never the one you take by accident.

The point is that cleaning out the box cannot leave **orphan builds**: sets for
Pokemon that no longer exist. There was one when this was written — the Camerupt
build outlived its Camerupt, traded away on the GTS — so an orphan is not
hidden: it is flagged in the list and its sheet offers to re-link it to another
copy of the same species or delete it. Creating a build now picks the box **row**
it belongs to, not just a species name, and refuses a second build on a Pokemon
that already has one.

Locked in by `tests/buildlinktest.js`.
- **Mega line** — base → Mega types, ability and speed, and whether the stone is
  owned or costs 2000 VP. Each Mega maps to its own stone, Z lines included.
- **Not in the dex** — Melmetal and Oricorio show as HOME-only, permanently.
- **Retune cost** — the VP an edit will cost, at the observed in-game prices.
- **Origin** — how many box slots are actually elastic, and a warning before
  buying a rental that it creates a Champions-origin clog rather than a real
  permanent.


## The Damage tab

A port of `scripts/damage.py`, checked against it: on the three reference cases
it agrees to the digit, and every correction the Python engine carries survives
the port - the spread x0.75 and the reminder that it goes back to full power
with one target left, Psyshock hitting the physical Defense, a 2-5 move quoted
at three hits, Population Bomb at ten, Triple Axel at 20/40/60 BP, always-crit
moves, Heavy Slam and Low Kick resolved from weight, and an immunity that
returns zero rather than one.

Either side loads from a saved build or is set by hand, because the question is
usually asymmetric: your own Pokemon is built, the opponent's is whatever the
ladder brings. What it cannot model - abilities, held items on Acrobatics and
Poltergeist, Payback's turn order - it says so under "Not modelled" instead of
quietly guessing.


## The Damage tab is Smogon's engine, not a port of it

`scripts/build_engine_bundle.py` compiles the vendored `data/raw/smogon_calc/`
with esbuild and `build_tracker_page.py` inlines it. The page carries the real
`calculateChampions`, so the number it gives is the number
calc.pokemonshowdown.com gives - by construction, not by agreement.

It started as a hand port. The port matched on plain cases and drifted by a
point or two once modifiers stacked, because the real chain runs in four
separate buckets, each chained in 4096-space with its own rounding:

```
basePower = pokeRound(bp * chainMods(bpMods, 41, 2097152) / 4096)
attack    = pokeRound(at * chainMods(atMods, 410, 131072) / 4096)
defense   = pokeRound(df * chainMods(dfMods, 410, 131072) / 4096)
finalMod  =            chainMods(finalMods, 41, 131072)
```

A point is not a rounding detail here: it can turn a 2HKO into a 3HKO, and the
KO count is the only thing that counts. Two things the port had wrong that no
amount of measuring ratios would have found: **burn is applied after type
effectiveness**, not in the base power, and **Protect is x0.25, not 0** - a
contact move from Unseen Fist or Piercing Drill goes through it.

Cost: 422 KB of bundle, 196 KB gzipped for the whole page.

**The field panel is whatever Smogon's own UI exposes**, read out of its DOM
rather than out of its API. The API carries `isFairyAura`; the interface does
not, because Fairy Aura is an ability and belongs on the Pokemon - so it comes
from the ability select here too. Reading the API and inventing a control the
real calculator does not have is exactly the mistake to avoid.

Anything measured at x1.00 was checked against the format before being dropped:
Choice Band, Choice Specs, Assault Vest, Eviolite, Transistor, Steelworker,
Ice Scales, Storm Drain, Battery, Power Spot, Dark Aura, Flower Gift, Aura
Break and the four Ruin abilities are **not in Champions at all**, which is why
they moved nothing.

Names are the one place the two vocabularies meet. Ours is Serebii's
("Mega Glalie"); the engine answers to its own ("Glalie-Mega"). The table is
precomputed by `build_tracker_data.py` through `query.norm()`, which has 44
locked test cases - porting that matcher to JS would be a second implementation
to keep in step. `tests/sweeptest.js` walks all 340 forms through the engine to
prove the mapping still holds.

## The Find tab

The chain that used to mean asking Claude: *learns Imprison AND Wide Guard AND
Protect* is one query. Filters AND together - moves, types, ability, BST floor,
a Speed floor and a Speed ceiling (that last one is the Trick Room filter), and
"in my box".

A Pokemon's sheet shows only the moves it actually learns, and every move the
chosen ability touches is badged with what the ability does to it: Sheer Force
marks the 96 moves with a secondary, Sharpness the 21 slicing moves, Iron Fist
the 15 punching ones, Strong Jaw the 8 biting ones, Technician everything at
60 BP or less. The tests run against the move's own flags, so a move added by a
regulation is covered the day `refresh.py` runs - nothing is a hand-written list.


## Which ability touches which move

`scripts/build_ability_moves.py` derives it and writes `data/db/ability_moves.json`;
nothing is a hand-written move list.

```bash
python scripts/build_ability_moves.py           # build the table + report
python scripts/build_ability_moves.py --audit   # all 215 abilities, classified
```

The audit is the point. It prints every ability in the format in one of three
buckets - has a rule here, mentions moves but has no rule (listed in full for
review), or never touches a move - so nothing is silently dropped.

Three rules that were wrong when the table was hand-written, all caught by the
player playing with it:

- **A power multiplier can never apply to a move that deals no damage.**
  Adaptability was badging Basculegion's Rain Dance: a Water move, but 0 BP and
  no STAB to double. Every multiplier rule now requires a damaging move.
- **"1-stage Critical-Hit Ratio Boost" is not a stat stage.** Fourteen moves say
  it, and reading it as one put Contrary on Protect and Roost - which move no
  stat at all. Contrary also carries the SIGN, because that is the whole
  ability: Close Combat's self-drop becomes a boost, Swords Dance's boost
  becomes a drop.
- **An ability that changes what comes IN is not one that changes what goes
  OUT.** Bulletproof, Filter and Thick Fat are classed `def` and never badge
  their own Pokemon's movepool.

**Sheer Force is taken from Smogon's engine, not from Serebii's text.** Checked
move by move, the two agree on 82 and differ on 52: Serebii records a guaranteed
on-hit effect (Icy Wind, Rock Tomb, Snarl) with no rate at all, and our own text
reading counted a binding move's Bound status, which is that move's primary
effect. `recoil`, `multihit` and `drain` come from the same place. The flag
families stay on Serebii, per the source hierarchy - and the two tables disagree
on exactly four moves out of 514, which the script prints rather than resolving
in silence: Dire Claw (slicing), Dragon Cheer (sound), Matcha Gotcha and Syrup
Bomb (bullet).

## The data model

```
box/{id}      {name, location: champions|home, status: permanent|rental,
               origin: home|champions|unknown, note, order, updated}

               ORIGIN is the fact that matters, not "permanent". home = caught
               in GO or traded in, can be parked back to HOME and recalled with
               the training intact, so the slot is elastic. champions = came out
               of an Encounter and can never leave the box. unknown = not asked
               yet, which is NOT the same as champions.
builds/{id}   {pokemon, mega, ability, mega_ability, nature, stat_points,
               moves, role, rationale, extra:{...}, updated}
meta/trainer  {box_capacity}   - the others are frozen leftovers, do not read
              {rank, regulation, season, vp_balance,
               training_tickets, permanence_tickets}
meta/stones   {owned:[...]}
meta/items    {categories:[...], owned:[[name,[categories]],...]}
meta/gts      {open_offers:[{offered, requested, deposited, status, note}]}
```

## Files

- `tracker/src/` — **the app. Edit these.** `01-data.js` .. `13-boot.js` are
  concatenated in that order, with `style.css` and `markup.html`.
- `tracker/index.template.html` — the shell they are poured into. Markers only.
- `tracker/data.js` — generated. Never edit.
- `tracker/index.html` — generated by inlining the two. This is what gets published.
- `scripts/build_tracker_data.py` — `data/db/` → `data.js`
- `scripts/build_tracker_page.py` — template + data → `index.html`
- `tracker/config.local.json` — Supabase URL + publishable key. Not a secret,
  but not generated either; without it the build falls back to the Claude db.
- `tracker/supabase_schema.sql` — tables, RLS policies, realtime. Idempotent.
- `tracker/supabase_seed.sql` — generated by `scripts/build_supabase_migration.py`,
  and NOT versioned: it is a frozen copy of the whole ledger, so it drifts from
  Supabase the moment anything changes. Regenerate it if a fresh project needs
  seeding
- `scripts/ledger.py` — reads the ledger; `scripts/backup_ledger.py` — snapshots and restores it
- `scripts/refresh.py` — the whole source chain, ending at the tracker

Both SQL files were run end to end against a throwaway PostgreSQL 18 before
they ever touched the live project, RLS behaviour included.

## About reading the games directly

There is no API. Champions, Pokemon HOME and Pokemon GO all speak private,
certificate-pinned protocols to their own servers; the only way in is
reverse-engineering a client and signing in with your own credentials, which
every one of those terms of service forbids and which Niantic in particular
bans accounts for. Not worth your account.

The closest honest thing is in the Trainer tab: photograph the box, and the page
asks Claude to read the names off the screenshot against the real dex list. You
confirm each name before it is added. It costs a request per scan and it is the
only automation here that can be wrong, which is why nothing is added without a
tap.
