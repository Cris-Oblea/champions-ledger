# Champions Ledger

A **box, build and team manager** for Pokemon Champions - and nothing else.
Two halves that share one database:

- **A phone app** — the box, the builds, the Mega Stones, a damage calculator
  that runs Smogon's own engine, and a searchable dex of every legal form.
- **A cross-source database** — Champions data pulled from five sources,
  joined, cross-checked, and queryable from the command line.

Champions is its own game. A restricted roster, a reduced item pool, rebalanced
moves, **Stat Points instead of EVs**, and training that costs money. Numbers
from Scarlet/Violet are wrong here often enough to matter, so nothing from
another entry is mixed in anywhere. Format is **VGC**: doubles, bring 6 / pick 4.

---

## What the data describes right now

<!-- VINTAGE:START -->
Regulation **M-C**. Ladder usage fetched 2026-10-05, from 334 Pokemon.
Tournament data is Worlds 2026, played under M-B - that is history, not stale.
<!-- VINTAGE:END -->

---

## The app

Built from this repo and deployed to Cloudflare. It is single-user and behind a
login; the data lives in Supabase under Row Level Security, so an anonymous
request returns nothing.

| Tab | What it answers |
|---|---|
| **Champs** | What is in the Champions box, where each one came from, and what may leave |
| **HOME** | Three panes: what is parked in HOME, what is out on the **GTS** (and what each spare copy could fetch), and the **dex checklist** - what is still missing, easiest first |
| **Builds** | Every set written, and the **Teams** made of them - six slots, the item each holds, and both clauses checked. Every move, ability, nature and spread carries what this Pokemon's own players run |
| **Damage Calc.** | Real damage rolls, running Smogon's Champions engine in the page, with the status effects folded underneath |
| **Find** | "Who learns Imprison *and* Wide Guard *and* Protect, and do I own one" - filters that stack, and a stat sort that turns the list into that stat's tier order. Plus **Worlds**: what the field brought to each championship, per division, and a medal on anything that finished top 8, with the set it played |
| **Items** | Every Mega Stone and item, what it does, what it costs, and which move or ability it serves |
| **Settings** | Box capacity, everything else derived so it cannot go stale, and the diagnostics |

On a phone it is one column and a bottom tab bar. On a desktop the controls
sit beside the answer in a sticky sidebar, results come back as a grid of
cards, and the column grows to 1560px. Every question the app asks - deleting
a build, releasing a Pokemon, closing a trade - is its own dialog, and the
phone's **Back** button walks back through what is open (dialog, sheet,
editor, tab) before it leaves the app. `tracker/README.md` is the long
write-up; this is what the app is.

### One card, everywhere

A Pokemon looks the same wherever it appears - box, build, team slot, trade,
search result, Worlds ranking, and every picker that opens inside a sheet.
There is one implementation, `pokeCard()`, and each screen passes in its own
extras (a usage chip, an item cell, the reason a suggestion is in range). A
card is a band of its type across the top, then every fact in a cell of its
own with the label under the value - BST, the ability, the six base stats - so
two cards can be read against each other down a column. Nothing is trimmed to
fit, and nothing wraps out of its cell from a 320px phone to a desktop.

- **The type colours are Pokemon's own**, read out of pokemon.com's stylesheet
  by `scripts/build_type_colors.py`: the colour, the second colour where a type
  is officially two-toned, and the ink its name is written in, so the true
  colour never has to be darkened for white text.
- **A Mega lives on its base Pokemon's row.** A Mega only exists mid-battle,
  while a stone is held, so it is a fact *about* a Pokemon you store, not a
  row of its own. The card carries the whole line at native size, a stat cell
  gains a second number where the stone moves it, and the types appear again
  only when the stone swaps them. Each Mega has its own ink - X blue, Y red,
  Z green, a plain Mega the app's purple - and is named `Mega`, `Mega X`,
  `Mega Y` or `Mega Z`, never an invented letter.
- **A stone is not the only thing a Pokemon turns into.** Five Champions
  Pokemon change form mid-battle off an ability - Aegislash, Palafin, Castform,
  Morpeko, Mimikyu - and are drawn the way a Mega is, in an amber of their
  own. A test pins the count, so a regulation adding a sixth fails the gate
  instead of shipping a card that leaves it out.
- **A build card shows only the build**: the form it plays as and the one
  ability it runs.
- **A shiny is a different picture**, wherever a specific copy is in hand.
- **Sprites** come from a CDN at a pinned commit and are never copied into the
  repo - they are Nintendo's images and the repo is public. Every name a card
  can carry has its picture, and a test says so. They are drawn at native size
  and smoothed, never `pixelated`, which turns a 1.25 device-pixel ratio into
  hard square edges.

**One Pokemon sheet, whichever door it is opened from.** Tapping a card in the
box, in HOME or in a search gives the same sheet: **identity** first (picture,
types, stats, what it becomes mid-battle), then only what that door owns
(origin, shiny, trained, the note), then **reference** - the Mega line and
what the stone costs, what damages it, its abilities and how much of its
movepool each touches, the top-8 sets it won with, its movepool under the
build editor's filters, and Smogon's write-up. Each form is the same box, the
base one too, and a Mega or a battle form whose typing changes gets its own
damage table.

**Every move, ability and item says what it does, once, from Champions.** The
description is Smogon's full text from its **Champions** dex, never an older
game's - Freeze-Dry freezes in Scarlet/Violet and not here. Its numbers are
drawn in colour inside the sentence rather than repeated as chips beside it;
a chip survives only if the sentence does not state its number in any unit,
and today none does. Where our data carries a number Smogon's text does not,
the build reports it as a dispute instead of pasting either one.

### Builds and teams

A build is one set - species, Mega, ability, nature, Stat Points, moves - with
its own id, so one species can have several. It never records an item: the
Item Clause makes the item a team decision, so it lives on the team slot.
Which Pokemon carries a build is a separate link, so a build is **active** (on
a Champions box Pokemon), **parked** (on one in HOME), **orphaned** (its
Pokemon is gone, flagged) or **unbound** (an idea for a Pokemon not owned
yet). Releasing a Pokemon unbinds its builds; it never deletes them.

- **Choosing the species is a search**, over the whole dex - a set for a
  Pokemon that has not arrived yet is worth keeping - with "in your boxes" as a
  filter, never a limit.
- **"Installed on" is a dropdown** whose closed face is the copy the build sits
  on, with that copy's card under it. Copies are named by what they are (where
  they live, shiny, trained, origin, what they carry), and the **trained** tag
  follows the build on and off a copy.
- **A species with one ability never chose it.** Aegislash is Stance Change and
  every Mega is a single line, so the build carries that ability whether or not
  the control was touched. Where there really are two or three, the choice stays
  open and the editor says so.
- **The editor checks the rules as you type**: 66 Stat Points and 32 per stat,
  moves the form actually learns, priority on the weaker side, a move that
  hits your own ally, Intimidate on your own side, Weather Ball read as Normal,
  a rental that cannot be trained. It says what an edit costs in VP before it
  is saved.
- **The move picker's filters stack**: a sort (usage, BP x accuracy, A-Z, PP,
  type), and category, trait and type chips. A chip has three states - include,
  **exclude**, off - so "Trick Room, but nothing Psychic" is one query; the
  Find tab uses the same chips.

A **team** is six slots, each a build and the item it holds. Both clauses are
enforced where the choice is made: a species or an item another slot already
holds is greyed out, sorted last and carries the reason. A team may be
incomplete - four of six is worth writing down - and its sheet says what is
owned, where it is, and what is still to get, with the team's Speed order and
shared weaknesses.

**A tag on a move row says which side it plays on.** Heat Rock on Sunny Day is
a reason to run the move; Aspear Berry on Ice Beam is a reason it will not
work, and is drawn in red. The abilities that turn a move off entirely are on
the row too, read from the side that uses it: Zap Cannon shows Bulletproof,
Lightning Rod, Motor Drive and Volt Absorb in red, because on a foe each one
stops it; Boomburst shows Telepathy in green, because on your partner it is
the reason to run a spread move. `build_item_links.py` and
`build_ability_moves.py` derive all of it - nothing is a hand-written list.

### HOME and the GTS

The rules here are the game's, and the app only ever offers what the game
allows:

- **Origin is what matters.** A HOME-origin Pokemon can be parked back to HOME
  and recalled with its training, so its slot is elastic; one bought from an
  Encounter can never leave the Champions box.
- **Release is offered only where the game allows it.** Never a HOME-origin
  Pokemon from the Champions box - parking is its exit - and never one of the
  last six Champions-origin Pokemon, which the game will not release.
- **A duplicate is an origin question.** A copy counts only if it could be the
  one kept; a rental or an Encounter buy of the same species is welded into the
  game and does not make the HOME copy expendable.
- **The GTS shortlist** is filtered by the two rules that decide what may go
  into a box - a duplicate, or a species Champions cannot use - and sorted in
  dex order, the order HOME itself lists in.
- **The suggester reads the HOME box.** Each spare is asked what it could
  fetch, using the same price bands the deposit screen uses. What you **ask**
  for is always playable; what you **offer** is best something you could never
  field. Asks that would free a Champions slot rank first. Nothing claims a
  species is easy to get: the evidence shown is the closed trades - how many
  cleared, how long they took, how much BST came back.
- **It never recommends a chip the GTS refuses.** `data/meta/gts_blocked.json`
  lists what HOME's GTS will not hold, with who confirmed each entry and when.
  The other Mythicals are ranked last and tagged, never dropped, because one
  refusal is not yet a rule.

**The dex checklist is an order of attack, not a list of holes.** Champions'
own route in is a gacha, so the dex is finished through Pokemon GO into HOME
and through the GTS. It lists what is in **neither** box, one copy per species,
easiest first. A species already in HOME is done even when a copy is also in
the Champions box, and Megas are not on it - a Mega is a stone, not a catch.

### The calculator

Smogon's own Champions engine runs in the page, so its number is the number
calc.pokemonshowdown.com gives, and `scripts/damage.py` runs the same engine in
the terminal. Either side loads from a saved build or is set by hand. The field
panel exposes what Smogon's own calculator exposes and nothing it does not.
Its layout gives each control a caption beside it rather than above, and keeps
a height a thumb can hit. The status-effects fold underneath gives what each
status does here - Champions rebalanced paralysis, freeze and sleep - with the
source of every number.

### Find, and the dex beyond Champions

**Find** is one table: by name or dex number first, then filters that AND
together (moves, types, ability, in the Champions box, in HOME), and a stat
sort that is the tier list - highest first for a speed tier, lowest first for
Trick Room. A filter matches a Pokemon or any of its Megas and the card says
which; the sort reads the value the line can reach in that direction. Types
ask which question you mean: "Rock AND Steel" is a dual type, "Rock OR Steel
OR Ground" is a group.

**The dex is complete; Champions is the part of it that is switched on.** The
game rebalances a Pokemon when it adds it, so until then knowing what it would
bring is how you judge whether you want it. Every species, move and ability is
in the app, and the *not in Champions* tag says what cannot be played yet. A
species Champions lacks gets its card, its forms (Mewtwo's Megas, Kyogre's
Primal), its movepool and its ability text from PokeAPI's tables at a pinned
commit, labelled as main-series numbers. Nothing from PokeAPI is ever used for
a species Champions does have, where the rebalance makes it wrong. That is
also why every name in a Worlds ranking has a card behind it, including the
legendaries earlier fields were built on. This half of the dex is a separate
asset, fetched only when one of those sheets is opened.

### The data behind it is crossed, not trusted

Every number in the app is checked against a second source somewhere in the
gate:

- the damage formula against Smogon's engine;
- the type chart against Serebii's weakness tables;
- every movepool against PokeAPI's own Champions version group
  (`audit_learnsets.py`), where Serebii decides and each known disagreement
  records the page that settled it;
- every form's abilities against Serebii's Pokedex page, PokeAPI and the
  form's variants (`audit_abilities.py`).

Those audits are how No Guard was found missing from Lycanroc-Midnight and
Battle Bond from Greninja.

`python scripts/preview.py` puts the phone, laptop and desktop widths side by
side in one browser, each in its own iframe so the media queries are real,
with the app's own overlap check on a button.

The source is ES modules under `tracker/src/` in three layers - `core/` (the
data, the rules, the store), `ui/` (what the tabs share) and `tabs/` (one per
screen) - each importing only from its own layer or a lower one. The build
links them into the single script the browser is handed, plus a sourcemap so a
stack trace still names the file a person edits. **Edit a part, never
`tracker/dist/`** - it is generated. How the pieces fit is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## What is in the database

<!-- COUNTS:START -->
| File | Rows | What it holds |
|---|---|---|
| `data/db/pokemon.json` | 345 | Every playable form: types, base stats, abilities, and the 81 Megas |
| `data/db/moves.json` | 901 (512 useable) | Champions move data, 15 flags, and who learns it |
| `data/db/abilities.json` | 216 | Champions ability text and every carrier |
| `data/db/items.json` | 199 | Items and Mega Stones with their VP price |
| `data/db/learnsets.json` | 264 | Reverse index: Pokemon to movepool |
| `data/db/ability_moves.json` | 140 | Which ability changes which move, derived from the move text |
| `data/db/effects.json` | 390 | What an item or ability multiplies, exactly, read out of the engine |
| `data/db/typechart.json` | 18 | The type chart, cross-checked on 3402 matchups |
| `data/meta/usage_pokemon.json` | 334 | Ladder usage per Pokemon |
| `data/meta/usage_moves.json` | 470 | Ladder usage per move |
| `data/meta/speed_tiers.json` | 89 | Base Speed to real Speed at every investment |
| `data/meta/smogon_analyses.json` | 358 | Smogon's written VGC analyses |
<!-- COUNTS:END -->

That table is **generated** by `scripts/build_docs.py` and checked on every
build. See [Keeping this file honest](#keeping-this-file-honest).

---

## Asking it things

```bash
python scripts/query.py brief Ceruledge        # a dossier, every source at once
python scripts/query.py pokemon Garchomp       # the card, plus Smogon's write-up
python scripts/query.py moves --flag sound     # every sound move
python scripts/query.py counter-priority       # what shuts priority down
python scripts/query.py resist ice fairy --owned   # who covers a shared hole
python scripts/query.py usage --top 30         # the ladder
python scripts/query.py worlds --usage --division all   # Masters / Seniors / Juniors
python scripts/query.py owned                  # your box against the meta

python scripts/damage.py "Mega Glalie" Explosion Kingambit --atk-sp 32
python scripts/damage.py --selftest            # the formula, against Smogon's engine
```

Every command takes `-h`.

---

## The five sources, and what each is for

| Source | Good for | Not for |
|---|---|---|
| **Serebii** | Rules and mechanics. What exists, what it does, exact Champions numbers | Anything about what people play |
| **pokedata.ovh** | Official tournament teamlists — what actually wins, all three age divisions | Current usage: a finished event keeps the format it was played in |
| **pokebase.app** | Live ladder usage, and the per-Pokemon splits: every move, item, ability, nature, SP spread and teammate the people running that Pokemon actually brought | Rules text |
| **PokeAPI** | Main-series data for the species Champions does not have, so a HOME row still gets a card; and main-series PP as a vote on a PP dispute | Any Champions number: it is the main series |
| **Smogon's calculator** | Damage arithmetic and ability behaviour. The only *executable* source | Per-Pokemon data: it inherits from Scarlet/Violet and the leaks show |

Ladder usage and tournament usage disagree, and that is signal rather than
error. Anything quoted here says which one it came from.

**A percentage always says what it is a share OF.** pokebase's per-Pokemon
pages publish two different datasets under the same headings — tournament
teamlists for the current regulation, and the ladder season — and they do not
measure the same thing. Worse, within one of them the move column is divided by
move SLOTS while every other column is divided by SETS, so no move can ever
reach 50% and "24.6% Fake Out" means nearly every Rillaboom runs it. The app
carries one dataset, labels it, and scales its emphasis against that Pokemon's
own top row rather than against a fixed threshold; `build_splits_data.py
--check` asserts the shape of every column on every Pokemon, and the gate runs
it. A source that quietly changes a denominator is the failure this catches.

---

## How it stays current, without anyone remembering

```
05:07  GitHub Actions refreshes every source, rebuilds, runs the gate, and
       opens a pull request with whatever moved. The pull request is gated
       again on its own, merges itself when green - and the merge is what
       deploys. A refresh that fails the gate leaves the pull request open
       and deploys nothing.

       05:07 is when it is ASKED, not when it runs. GitHub delays scheduled
       workflows on shared runners when the queue is busy - measured here at
       four to seven hours late, three days running - so the job asks three
       times (05:07, 08:07, 11:07 local) and the first attempt GitHub honours
       does the work. The others see the day's refresh already succeeded and
       stop in seconds. Nothing on GitHub's side can make it punctual; this
       makes it reliably once a day.

       A REGULATION is the one event that can quietly wreck the database, and
       it is detected rather than remembered. pokebase publishes which
       regulation is current as a value in its own page data; the refresh asks
       for it before fetching anything, compares it with
       data/db/regulation.json - what the database was BUILT for - and if they
       differ it runs the regulation recipe instead of a plain refresh:
       every Serebii page is re-fetched ON TOP of the cache and the run ends
       with the list of pages that came back different - the patch note for
       that regulation. It asks Serebii too, and waits if Serebii has not
       published it yet. The pull request that night says
       REGULATION in its title.
```

<!-- GATE:START -->
**The gate** is 49 checks, and nothing reaches the phone without
passing all of them:

- a **shrink guard** — if a rebuild comes back with fewer forms, moves or
  learnsets than the last good one, a source broke and the run stops
- **eleven Python audits** — the damage formula against Smogon's engine, name
  matching across all five sources, every derived index resolving, every form
  still accounted for, the README's own numbers, that no SQL migration is
  still waiting to be applied, ruff's lint over
  every script, and vulture's search for code that nothing calls any more
- **nine source checks** — ESLint, with SonarSource's own rules,
  over every file (a name one of the twenty-five ES modules uses without
  importing it links fine and throws on the phone), TypeScript's checker
  over the app, stylelint over the CSS, html-validate over the markup,
  knip for an export or file nothing reaches, jscpd for copy-paste, and
  the app read against its own markup, engine and stylesheet
- **twenty-eight browser tests** — run against the built page, because no Python
  check can see a template regression
<!-- GATE:END -->

### The ledger is backed up

Supabase holds the whole ledger and the free plan takes no backups of its own,
so the repo does it. `scripts/backup_ledger.py` snapshots every table to a
timestamped JSON **outside the working tree** - this repo is public and a
snapshot is the ledger in plaintext.

```bash
python scripts/backup_ledger.py                 # take one
python scripts/backup_ledger.py --list          # what exists
python scripts/backup_ledger.py --verify        # file intact? DB moved since?
python scripts/backup_ledger.py --restore FILE  # dry run: what would change
```

It runs on its own in two places: **every local gate run** takes one before it
does anything else, and a nightly GitHub Action pushes one to a **separate
private repo**. Nothing in that chain expires - it pushes with a deploy key
instead of a token, and reads the database with a connection string instead of
an access token - because a job that runs unattended at four in the morning
fails by stopping quietly, months before anyone looks.

Restore is a dry run unless given `--confirm`, and both halves of it - putting
a deleted row back, and removing one the snapshot does not have - are tested
end to end rather than assumed. Two gate checks watch it: one fails if the
newest snapshot is more than three days old, and one fails if the dry run can
no longer tell a changed row from an unchanged one, because a backup system
that has quietly stopped looks exactly like one that is working.

`main` is protected: pull requests only, gate must be green, and that is
enforced for admins too. A local `pre-push` hook runs the same checks before a
push leaves the machine.

```bash
python scripts/migrate.py                 # apply any pending SQL migration
python scripts/daily.py --install-hooks   # once per clone
python scripts/daily.py --no-refresh      # gate what is built, then publish
python scripts/refresh.py                 # the full source refresh
python scripts/refresh.py --regulation    # ...when a new regulation drops
```

---

## Champions rules worth knowing

- **Stat Points replace EVs**: 66 total, at most 32 in one stat. Verified
  against every published spread.
- **Training costs VP**: 5 per Stat Point, 250 a move, 500 a nature, 500 an
  ability. A Mega Stone is 2000; keeping a rental is 2500.
- **Item Clause** — no two Pokemon on a team may hold the same item. Measured:
  0 of 636 Worlds teams repeat one. So an item is a **team-level** decision,
  not part of an individual build.
- **Species Clause** — no two Pokemon on a team may be the same species, and
  not even the same *form*. Measured across 642 Worlds teams.
- **Mega Evolution** — a team may carry several stones, and most Worlds teams
  did, but **only one Pokemon may Mega Evolve per battle**. The second stone is
  matchup flexibility at team preview.
- **A Mega can change stats, typing and ability**, in any combination, so a
  species is judged on its Mega line rather than its base row.
- **No Terastallization**, and no Legendaries or Mythicals.

---

## Layout

```
scripts/     fetchers, the database build, the query CLI, the damage calculator
data/db/     the built database - the thing everything else reads
data/meta/   usage, tournaments, speed tiers, written analyses
tracker/     the app: a shell, its ES modules under src/, and a generated data blob
supabase/    the ledger's schema and migrations
cron/        the Cloudflare Worker that starts the nightly refresh on time
docs/        ARCHITECTURE.md: how the code fits together, for a person learning it
<!-- TESTS:START -->
tests/       twenty-eight browser tests, run against the BUILT page
<!-- TESTS:END -->
analysis/    write-ups: the Smogon engine, regulation M-C, GTS pricing, the roadmap
CLAUDE.md    the rules every Claude Code session needs, kept small on purpose
.claude/     the rest of those rules, loaded only when needed: rules/ per part of
             the code, skills/champions-rules/ for the game itself
```

---

## Keeping this file honest

Every number above is **generated** from the data and verified on every build:
`scripts/build_docs.py --check` runs inside the gate, so a README that has
drifted blocks the deploy exactly like a failing test.

This exists because by 2026-09-13 the README claimed 308 forms against a real
345, named a regulation two versions old, and told the reader to hand-edit a
file the app had replaced. None of that was wrong when it was written. **A
number typed into prose is a promise to come back and retype it**, and the only
promises this repo keeps are the ones a machine checks.

So: when a change lands, the counts follow on their own. The prose is hand-
written, and anything that changes what the app *is* belongs here in the same
pull request that changes it.

---

## If you found this

It is one person's tool, kept in the open rather than published as a product.
There is no support, no roadmap you can file against, and it assumes a box,
a ledger and a Cloudflare account that are not yours. Read it, borrow from it,
but do not expect it to run for you out of the box.

**Licence.** The CODE is MIT — see [LICENSE](LICENSE), and [NOTICE](NOTICE)
for what it does not reach. The contents of `data/`
are not covered and cannot be: they are derived from public community sources
(Serebii, pokebase.app, Smogon, pokedata.ovh, PokeAPI) and describe a game
owned by someone else. They are here to make one player's own box searchable,
not to be redistributed as a dataset.

Pokemon and all respective names are trademarks of Nintendo, Creatures Inc. and
GAME FREAK Inc. This is an unaffiliated fan project; nothing in it is sold or
advertised.
