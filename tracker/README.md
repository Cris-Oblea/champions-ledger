# Champions Ledger — the tracker you edit yourself

Open it on the phone, on Windows, on anything with a browser — same data, saved
the moment you tap. It exists so the box, HOME, the builds, the teams and the
stones stop being things you have to *tell somebody* about.

This file is the app's write-up: what it checks, why it is shaped the way it
is, and what each part reads. `docs/ARCHITECTURE.md` is the map of the code
(§4.2 says what each module owns, §14 goes from a screen to its files).

## Where the data lives

**Supabase** (project `champions-ledger`), in seven tables: `box`, `builds`,
`teams`, `gts`, `items`, `stones` and `meta`. Not in the page, not in this
repo, not in Claude.

That split is what makes the page safe to host anywhere. The HTML is a shell —
the app, the dex, the moves, the learnsets — and carries no row of yours. The
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

| | The app | This repo |
|---|---|---|
| Who is in the box and in HOME, permanent or rental, and their origin | **owns it** | — |
| GTS offers, open and closed | **owns it** | — |
| Stones and items owned, the box capacity | **owns it** | — |
| Builds and teams | **owns it** | — |
| Every scraped source, usage, damage maths, the rules of the format | reads it, shipped in the page | **owns it** |

**The repo holds no copy of the ledger.** A copy in git drifts from the truth
in both directions and puts personal data in a public repo, so
`scripts/ledger.py` reads the database instead and `scripts/backup_ledger.py`
keeps snapshots outside the working tree. VP is not tracked anywhere: it
changes with every match, and a stored balance is wrong the moment it is
read.

## The commands

```bash
# the sources moved (Serebii / pokebase / Smogon / pokedata)
python scripts/refresh.py                 # normal; the cloud runs it nightly
python scripts/refresh.py --regulation    # forced by hand; normally automatic
python scripts/refresh.py --tracker-only  # just rebuild the page

# what the ledger holds
python scripts/ledger.py                        # box, HOME, stones, items, builds, teams
python scripts/backup_ledger.py                 # snapshot it
python scripts/backup_ledger.py --restore FILE  # dry run
supabase db query "select * from box order by ord" --linked -o json
```

RLS means nothing *anonymous* can read the data, but the Supabase CLI here is
logged into the owner's account and linked to the project, so reading it
needs no export. `db query` talks to the remote database directly; `db dump`
is the one that needs Docker running.

`refresh.py` ends by regenerating `tracker/data.js` and `tracker/dist/`. Once
that change is merged, the deploy gives the phone the new dex, moves, stones
and learnsets. Everything in that payload is derived from `data/db/`, so
nothing in the page is typed by hand and nothing goes stale on its own.

## A build is its own thing

A build is a set — species, Mega, ability, nature, Stat Points, moves — with
its own id (`farigiraf`, `farigiraf-2`, ...), so one species can have several,
and which one runs is decided per team. **A build never records an item**: the
Item Clause makes the item a team decision, so it lives on the team slot.

Which Pokemon carries a build is the nullable `box_id`, and that gives four
states, of which only one is a fault:

| `box_id` points at | State | Meaning |
|---|---|---|
| a row in the Champions box | **active** | the set it is actually running |
| a row parked in HOME | **parked** | kept, inactive — nothing trains in HOME |
| a row that no longer exists | **orphan** | flagged, and its sheet offers to re-link it |
| nothing | **unbound** | an idea, for a Pokemon not owned yet. Not a fault |

**Releasing a Pokemon unbinds its builds instead of deleting them**, so an
idea is never lost for want of a row to hang it on. And a missing `box_id`
never falls back to the build id: an idea for Farigiraf has the id
`farigiraf`, and a fallback would marry it to a box row of the same name.
`buildLink()` in `core/state.js` decides the state; `tests/buildlinktest.js`
pins all four.

"Installed on" in the editor is a dropdown whose closed face is the copy the
build sits on, with that copy's card under it. Installing a build sets the
copy's "trained" tag, and moving or deleting the build clears it unless
another build still sits there (`tests/installtest.js`).

**A new id is decided by the database, not by the device.** Two devices that
have each loaded only `farigiraf` would both compute `farigiraf-2`, and an
upsert would let the second silently replace the first. So a new record is a
plain insert, and Postgres' `23505` means "taken, try the next one"
(`putNew()` in `core/store.js`, `tests/createtest.js`).

## What the build editor checks so you don't have to ask

`checks()` in `core/build.js`:

- **66 SP, 32 per stat**, live, with the level-50 stat beside every slider.
- **Learnset** — every move is one this form actually learns. A regional form
  has its own pool; a Mega reads its base form's.
- **Priority on the weaker side** — a physical priority move on a special
  attacker is called out.
- **A move that hits your own ally** is flagged.
- **Intimidate on your own side** — named with the abilities that punish it.
- **Weather Ball** — never quoted as a Normal 50 BP move.
- **No ability chosen** — when the species has a choice to make. A species
  with one ability (every Mega among them) has it written in as a fact.
- **Not in the Champions Box** — the build cannot run today.
- **Rental** — nothing on it can be applied until the Pokemon is permanent.

And it says what an edit costs in VP before you save it (`retuneCost()`, at
the in-game prices in `scripts/ledger.py`).

## Teams

A team is six slots, and **a slot points at a build**, not a box row, so one
Pokemon can sit in any number of teams. **The item lives on the slot**, and
a team may be incomplete: four of six is worth writing down. The team sheet
reports both clauses — no two slots share a species or an item — and says
what you have, where it is, and what is still to get. The slot picker greys
out a species another slot already holds, sorts it last and gives the reason
on the row, the way the item picker does for items (`tests/teamtest.js`).

## Finding a move

The move picker in the build editor has a sort and three filter groups, and
**they stack**: each group ANDs with the others, and chips inside a group OR
together.

- **Sort:** usage % (when there is a Pokemon to be a share of), BP x accuracy,
  A-Z, PP, or grouped by type.
- **Category:** Physical / Special / Status. A move has exactly one, so
  including one drops another.
- **Traits:** Spread / Hits ally / Priority. Two traits at once ask for both.
- **Type:** one chip per type the Pokemon learns, in that type's colour.

A chip has three states — off, include, **exclude** — because "no Psychic"
is a real question; an excluded chip reads "− Psychic", struck through. A
count line reads "N of M moves", so a filter that hides everything is obvious
rather than looking like an empty movepool. The search box reads the move's
effect text as well as its name, so "burn" finds the moves that burn.

The Find tab's "+ Move" runs the same `moveFilters()` (`ui/moves.js`), so one
question is asked one way (`tests/pickertest.js`, `tests/findtest.js`).

## Every list is searchable

`searchField()` in `core/dom.js` is the one search box, and `wireClears()`
upgrades the boxes written straight into the markup, so both ways a field can
be born look the same. **Every box has a clear button** — a filter you cannot
empty in one tap is a filter you stop using — and it is ours rather than
`type=search`'s, which Safari drops the moment a field is restyled.

Where a text match is not enough, the list also has chips:

- **The team's slot picker** searches the build's own words as well as its
  Pokemon's — id, species, Mega, role, nature, ability, moves, type, dex
  number — and filters by where the build is (ready today, parked in HOME,
  not owned yet, orphan), by the roles that exist, and by the type the build
  plays as, which is the Mega's when a stone is on it. Chips are derived from
  the builds that exist, so a chip that would match one row is not drawn.
- **The item picker** adds the game's own categories and "only ones you own".
- **The Champions box** and **HOME** filter across every origin section at
  once, and each heading reads "3 of 18" while a filter is on.
- **Teams**, the **GTS shortlist** and the **closed trades** each have one;
  the trade history searches both sides of a trade.
- **The calculator's "from your builds"** list has the same box as the slot
  picker.

## The Find tab

The question that used to mean asking Claude — *learns Imprison AND Wide Guard
AND Protect, and I own one* — is one query. By name or dex number first, then
filters that AND together: moves, types, ability, and "in my box".

- **A Mega lives on its base row.** A filter matches the base form or any of
  its Megas, and the card says which matched; Mega Ampharos is Electric/Dragon,
  so a search for Dragon finds Ampharos.
- **The sort is the tier list.** Pick a stat and the list becomes that stat's
  order; tap again to flip it. Highest first is the speed tier, lowest first
  the Trick Room one, and the rank reads the value the line can reach in that
  direction.
- **Types ask two different questions.** "Rock AND Steel" is a dual type and
  can only ever be two; "Rock OR Steel OR Ground" is a group with no limit.
  The type sheet asks which you mean, and the mode can be flipped from the
  filter bar.
- **Abilities are bucketed.** The two "changes moves" buckets are the rule
  table in `build_ability_moves.py`, not a second reading of the text; the
  rest (weather, terrain, speed and turn order, status, stat changes, items,
  switching, everything else) are read off the ability text by the same
  script, whose `--audit` prints them all.
- **"In my box" is two filters.** *In Champions* answers "can I play this
  today", *In HOME* answers "can I bring it in". Owning the base row matches
  its Megas too.

The **Worlds** mode beside it is history, labelled as history: what the field
brought to each World Championship, per division, never pooled
(`tabs/worlds.js`, from `fetch_worlds_archive.py`).

A Pokemon's sheet shows only the moves it learns, and every move the chosen
ability touches carries a badge.

## Which ability touches which move

`scripts/build_ability_moves.py` derives it into `data/db/ability_moves.json`;
nothing is a hand-written move list, so a move a regulation adds is covered
the day `refresh.py` runs.

```bash
python scripts/build_ability_moves.py           # build the table + report
python scripts/build_ability_moves.py --audit   # every ability, classified
```

The audit prints every ability in the format in one of three buckets — has a
rule, mentions moves but has no rule (listed in full for review), or never
touches a move — so nothing is silently dropped.

**A badge is read from the move user's side.** Red is an ability that stops
the move when an opponent holds it (Levitate against Earthquake); green is one
that only ever helps you (Telepathy stops an ally's move and nobody else's).
`STOP_WHOSE` in the script decides each side.

Three rules the table depends on:

- **A power multiplier never applies to a move that deals no damage.**
  Adaptability does not badge Rain Dance: Water, but 0 BP and no STAB to
  double.
- **"1-stage Critical-Hit Ratio Boost" is not a stat stage**, so Contrary
  does not badge Protect. Contrary carries the sign: Close Combat's
  self-drop becomes a boost.
- **An ability that changes what comes IN is not one that changes what goes
  OUT.** Bulletproof, Filter and Thick Fat are defensive and never badge their
  own Pokemon's movepool.

**Sheer Force, recoil, multi-hit and drain come from Smogon's engine**, not
from Serebii's text: Serebii records a guaranteed on-hit effect (Icy Wind,
Rock Tomb, Snarl) with no rate at all. The contact/sound/bullet flag families
stay on Serebii, per the source hierarchy, and the script prints the moves
where the two tables disagree rather than resolving them in silence.

## The Damage tab is Smogon's engine, not a port of it

`scripts/build_engine_bundle.py` compiles the vendored `data/raw/smogon_calc/`
with esbuild and `build_tracker_page.py` inlines it. The page carries the real
`calculateChampions`, so the number it gives is the number
calc.pokemonshowdown.com gives - by construction, not by agreement. The
terminal's `scripts/damage.py` runs the same engine, and `tests/pagetest.js`
proves the two agree.

Either side loads from a saved build or is set by hand, because the question is
usually asymmetric: your own Pokemon is built, the opponent's is whatever the
ladder brings.

**Why not a port.** The real modifier chain runs in four separate buckets,
each chained in 4096-space with its own rounding:

```
basePower = pokeRound(bp * chainMods(bpMods, 41, 2097152) / 4096)
attack    = pokeRound(at * chainMods(atMods, 410, 131072) / 4096)
defense   = pokeRound(df * chainMods(dfMods, 410, 131072) / 4096)
finalMod  =            chainMods(finalMods, 41, 131072)
```

A hand port matches on plain cases and drifts by a point once modifiers stack,
and a point can turn a 2HKO into a 3HKO. Two things such a port gets wrong that
no amount of measuring ratios would find: **burn is applied after type
effectiveness**, not in the base power, and **Protect is x0.25, not 0** - a
contact move from Unseen Fist goes through it.

**The field panel is whatever Smogon's own UI exposes**, read out of its DOM
rather than out of its API. The API carries `isFairyAura`; the interface does
not, because Fairy Aura is an ability and belongs on the Pokemon. Inventing a
control the real calculator does not have is the mistake to avoid.

Anything that measures x1.00 was checked against the format before being
called unmodelled: Choice Band, Assault Vest, Eviolite, the Ruin abilities and
the rest are **not in Champions at all**, which is why they move nothing
(`scripts/measure_modifiers.py`).

**Names are where the two vocabularies meet.** Ours is Serebii's
("Mega Glalie"); the engine answers to its own ("Glalie-Mega"). The table is
precomputed by `build_tracker_data.py` through `dex.norm()`, whose spellings
`test_norm.py` locks in - a JavaScript port of that matcher would be a second
implementation to keep in step. `tests/sweeptest.js` walks every form through
the engine to prove the mapping holds.

The **status-effects fold** under the calculator says what each status does to
the numbers. Champions rebalanced three of them:

| | Champions | main series |
|---|---|---|
| Paralysis | **12.5%** to lose the turn (Speed still halved) | 25% |
| Freeze | **25%** thaw, only on a turn it tries to move | 20% |
| Sleep | **33.3%** to wake on turn 2, **100%** on turn 3 | a 2-4 turn roll |

Every number carries its source: `serebii` is Champions' own rebalance page,
`measured` was run through Smogon's engine (burn's x0.5 on physical attacks),
and `main_series` is the other games' value, kept only where no Champions
source states one and labelled as such rather than shown as fact
(`scripts/build_statuses.py`).

## Items

The Items tab lists **every item in the game in the groups Champions itself
uses** - Hold Items, Berries, Miscellaneous, and Mega Stones in their own pane.
The grouping is not invented here: Serebii lays its item page out as one table
per group under a heading, and `build_db.py` reads those headings.

Each row says **what the item does**, what it costs in VP or where it comes
from, and whether you own it. An item with no VP price on Serebii (a reward,
a Battle Pass item, or one Serebii prints as "??? VP") is never given a
number - the row says where it comes from instead. Ownership is a row per
item in the `items` table.

**What an item is for** is linked the long way round: **item -> the field
effect it names -> everything that causes that effect**. Heat Rock extends the
sun, so it belongs to **Sunny Day and to Drought**; matching item text against
move names finds the move and misses the ability every time. An item without a
link says why. On a move row an item shows as a tag only when it is specific:
Life Orb rides on every attack and would badge every row with noise, so a
broad item stays out of that index (`scripts/build_item_links.py`).

## What a move or an ability actually says

Serebii's descriptions are flavour where pokebase's are mechanics - and the
other way round often enough that neither can be taken wholesale:

| | Serebii | pokebase |
|---|---|---|
| Taunt | "Gives the target the Taunted status." | "...only attack moves for **three turns**" |
| Air Balloon | "makes the holder float in the air" | "**immune to Ground-type moves**, Spikes, Toxic Spikes, Sticky Web" |
| Stone Edge | "**1-stage** Critical-Hit Ratio Boost" | "a heightened chance of a critical hit" |
| Sheer Force | "increased in power by **30%**" | "increases the moves' power" |

So `scripts/build_text_facts.py` scores each text on what it actually states -
digits, percentages, fractions, stages, turns - penalises a bare "gives the X
status", and takes the winner; a tie goes to Serebii, this project's ground
truth for rules. Both originals are kept in `data/db/text_facts.json`, and the
report prints every entry where the two disagree.

The text is printed under the move in the picker, in the Find tab's move
sheet and on a build's own move rows, and **the numbers inside it are marked
in colour** (`numText()` in `ui/card.js`) rather than repeated as chips beside
it: no fact is shown twice.

## The data model

`supabase/supabase_schema.sql` plus the numbered `supabase_migrate_<N>.sql`
files, applied in order by `scripts/migrate.py`, are the truth. Every table
has `user_id` and `id`, the primary key is `(user_id, id)`, and every policy
is `auth.uid() = user_id`.

```
box       a Pokemon held: name, location (champions|home),
          status (permanent|rental), origin (home|champions|unknown),
          trained, shiny, note, ord
builds    a set: pokemon, mega, ability, nature, stat_points, moves, role,
          box_id (nullable: which Pokemon carries it), extra
teams     name, slots (up to six: build_id, item, why), notes
stones    a row per stone owned; the id IS the name ("Charizardite Y")
items     a row per item owned, same shape
gts       a row per trade, from the deposit to the close: offered,
          requested, offered_id, deposited, closed (null while open), note
meta      loose documents; today only `trainer` (the box capacity)
```

Why it is shaped this way:

- **ORIGIN is the fact that matters, not "permanent".** A HOME-origin Pokemon
  can be parked back in HOME and recalled with its training intact, so its
  slot is elastic. A Champions-origin one came out of an Encounter and can
  never leave the box. `unknown` means not asked yet, which is not the same as
  Champions - though everything that must be safe treats it as Champions.
- **A row per owned thing, never a list inside one document.** A list is
  rewritten whole from whatever copy a device last loaded, so a phone that
  slept while the laptop marked something drops it on its next toggle, and
  nothing says a write was lost. A row per stone or item makes two writes
  independent, and the primary key means owning a thing twice is not a state
  the database can be in.
- **A trade is one row, open or closed.** Closing it updates the row that
  exists, rather than moving a differently-shaped record from one array to
  another - which is how two devices used to drop each other's offers.
- **`meta/trainer` holds only what the app uses and only he can know.** A
  hand-typed field nothing reads (a regulation, a rank) freezes and is then
  read as if current; the Settings tab derives the rest (`tests/profiletest.js`).

There is **no seed file**: a seed is the whole ledger in plaintext, and the
repo is public. A fresh project gets its structure from the schema plus
`migrate.py`, and its data from a snapshot -
`python scripts/backup_ledger.py --restore FILE`, the path that has actually
been tested in both directions.

## The files

- `tracker/src/` - **the app. Edit these.** `core/` (the data, his state, the
  rules, the DOM helpers, the store), `ui/` (what several tabs share), `tabs/`
  (one file per screen) and `boot.js`, with `styles/` (the CSS, in the
  cascade order `styles/index.css` lists) and `markup/` (the skeleton plus one
  file per tab). `docs/ARCHITECTURE.md` §4 says what each file owns.
- `tracker/index.template.html` - the shell the parts are poured into. Markers
  only; never edit it.
- `tracker/data.js`, `splits.js`, `analysis.js`, `outsidedex.js`,
  `engine.bundle.js` - generated payloads; each names the script that writes
  it.
- `tracker/dist/` - generated: the page split into hashed assets. This is what
  gets published.
- `tracker/wrangler.toml` - Cloudflare serves `dist/` and nothing else.
- `tracker/icons/` - the home-screen icons, copied into `dist/` as they are.
- `tracker/config.local.json` - Supabase URL + publishable key, per machine
  and gitignored. The build reads `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`
  from the environment first (that is how CI builds it), then this file;
  with neither, it builds a page with no store.

**Why a bundler, when the browser can load modules itself:** jsdom cannot
execute `<script type="module">`, and the browser tests load the built page
under jsdom. Shipping module scripts would not have failed those tests, it
would have made them pass by finding nothing. So esbuild links the modules at
build time and the tests run on the exact bytes that deploy. esbuild is pinned
in `package-lock.json` and installed by `npm ci` - never `npx`, which fetches
whatever is newest at the moment it runs.

**The layers are an order, not a filing system.** A part imports from its own
layer or a lower one, and no chain of imports comes back to where it started:
ESLint says so on the offending line, and `check_graph()` in
`build_tracker_page.py` refuses to build. Where a lower layer must reach a
higher one, the higher one registers itself: `boot.js` hands the store its
redraw (`whenChanged(renderAll)`) and tells navigation which tabs redraw when
shown (`onShow("calc", calcDraw)`). So `core/errors.js` runs first, and catches
any script error after it, and `boot.js` runs last. A part that declares no
imports or exports is a build error. Only `_entry.js` is generated: it
imports the public names and is the app's one deliberate contact with
`window`.

**ESLint's `no-undef` is what keeps the imports honest.** A name a part uses
without declaring or importing it is, by the rules of the language, a global:
esbuild links it happily and the phone throws on it. The browser tests may
never press the button that reaches it, so the linter, not the tests, is the
check.

**Every rule has one home.** The Item Clause is `teamPickItem` in
`tabs/teams.js`, the only way an item can be set. What a GTS chip is worth is
`chipValue` in `core/trade.js`, which both GTS panes ask. What a build costs is
`retuneCost` in `core/build.js`, and every move that enters a build goes
through one `movePicker`. How a Pokemon is handed to Smogon's engine is
`engSide` in `tabs/damage.js`. None of those can be reimplemented slightly
differently somewhere else.

## About reading the games directly

There is no API. Champions, Pokemon HOME and Pokemon GO all speak private,
certificate-pinned protocols to their own servers; the only way in is
reverse-engineering a client and signing in with your own credentials, which
every one of those terms of service forbids and which Niantic in particular
bans accounts for. Not worth your account. The box is entered by hand.
