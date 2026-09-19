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
Regulation **M-C**. Ladder usage fetched 2026-09-18, from 304 Pokemon.
Tournament data is Worlds 2026, played under M-B - that is history, not stale.
<!-- VINTAGE:END -->

---

## The app

Built from this repo and deployed to Cloudflare. It is single-user and behind a
login; the data lives in Supabase under Row Level Security, so an anonymous
request returns nothing.

| Tab | What it answers |
|---|---|
| **Champs / HOME** | What is in each box, what came from where, and what can still leave the game |
| **Builds** | Every set written, and the **Teams** made of them — six slots, the item each holds, and the clauses checked. Every move, ability, nature and spread carries what this Pokemon's own players run |
| **Damage Calc.** | Real damage rolls, running Smogon's Champions engine in the page |
| **Find** | "Who learns Imprison *and* Wide Guard *and* Protect" — filters that stack, and sorting by any stat turns the same list into that stat's tier order, either way up. A **Worlds medal** on anything that finished top 8, with the exact set it played — filed under the form that was registered, and the stone says which Mega it became. Plus **Worlds**: what the field actually brought, per championship |
| **Items** | Every item, what it does, what it costs, and which move or ability it serves |
| **GTS** | Open trades, what a chip is worth, and what it can realistically fetch |
| **Profile** | Box capacity, and everything else derived so it cannot go stale |

On a phone it is one column and a bottom tab bar. On a desktop it spreads:
the controls sit beside the answer in a sticky sidebar instead of on top of
it, results come back as a grid of cards that wear their Pokemon's type, and
the column grows to 1560px rather than staying at the 820 it was drawn for.
Every question the app asks - deleting a build, releasing a Pokemon, closing a
trade - is asked in its own dialog rather than the browser's.

The type colours are **Pokemon's own**, not an approximation. All eighteen used
to be hand-written and darkened so white text would sit on them, which made
every one of them wrong - Fire read `#C8501E` against the real `#FD7D24`.
`scripts/build_type_colors.py` reads them out of pokemon.com's stylesheet, and
each type brings three facts rather than one: its colour, its **second** colour
where it has one (Dragon, Flying and Ground are officially two-toned), and the
ink its name is written in - eight of the eighteen are written in black, which
is what lets the app keep the true colour instead of darkening it. A card's
band and hover ring carry all of them: a Dragon/Flying wears four colours,
halved by type.

**A Pokemon looks the same wherever it appears** - in the box, in a build, in a
team slot, in a trade, in a search result or in a Worlds ranking. One card: a
band of its type across the top, two of them for a dual type, then every fact
in a cell of its own with the label under the value - BST, the ability, and the
six base stats - so two cards can be read against each other down the column
instead of as six numbers with six words between them. Nothing is trimmed to
fit: a long ability list wraps rather than ending in an ellipsis.

**One fact, one chip, and the chip says what its number governs.** An item, an
ability or a move carries its numbers as chips beside Smogon's sentence, and
they are worked out once — in `scripts/effect_chips.py`, never on the phone —
because deciding them needs things a screen does not have. The engine is probed
through a physical and a special vehicle, so the same multiplier comes back
twice; it works in 4096ths, so Life Orb's is 5324/4096 and not 1.3; and Smogon's
sentence usually states it as well. Black Glasses used to read `x1.2  x1.2
1.2x`. It reads **`x1.2 damage dealt`** now: measurements collapsed by the value
and the quantity they multiply, rounded to what the engine means, a text number
dropped where the engine already measured it, and the last one dropped entirely
when the sentence holds only that one number — Aerilate's `1.2x` beside "have
1.2× power" was the same three characters twice. What survives is labelled from
the words either side of it in the sentence, so Overgrow reads `x1.5 offensive
stat` and `at 1/3 max HP` rather than `1.5x` and `1/3`. `effect_chips.py
--audit` lists the two numbers whose subject it still cannot name, so the gaps
are counted rather than quietly wrong. The exact 4096ths stays in
`data/db/effects.json` and in each chip's tooltip.

**Choosing which Pokemon a build is for is a search, not a scroll.** It was a
`<select>` of 264 forms in one alphabetical run with no way to look inside it.
It is a field you tap now, opening the same kind of sheet the GTS and the
calculator use: a search box that matches the **name, either type, or the dex
number**, the app's usual sorts, and the same card as everywhere else. The
whole dex stays on offer — a set for a Pokemon that has not arrived yet is an
idea worth keeping — so "in your boxes" is a filter and never a limit.

**A tag on a move row is not neutral.** Heat Rock on Sunny Day is a reason to
run the move; **Aspear Berry on Ice Beam is the reason it will not work** — the
target thaws and the freeze was the whole point. Both read as the same grey
chip, so the row said "these items are related" and left which way to be worked
out. Each link now carries the side it plays on, decided in
`build_item_links.py` from the reason the link was made for, and the ones that
answer the move are drawn in red.

**And what turns a move off is on the row too.** A defensive ability badges
nothing as a rule — the alternative is all 67 of them, and Fire Lash would
carry 32 grey chips. But the narrow class that makes a move do **nothing** is
worth seeing: Zap Cannon comes back **Bulletproof, Lightning Rod, Motor Drive,
Volt Absorb**, and Boomburst **Soundproof, Telepathy**. Which abilities those
are is derived in `build_ability_moves.py`, in two groups — one that stops the
move whatever it was, and one that stops the thing the move *does*, which only
counts as a block on a status move. So Will-O-Wisp is blocked by Thermal
Exchange and Fire Lash is not, because Big Pecks only eats its Defence drop and
that is not the move being stopped.

**A GTS box is a shortlist, so it is filtered like one.** What may go into one
is settled by two rules rather than taste — only a **duplicate** (the Species
Clause means a second copy can never share a team with the first) or a species
**Champions cannot use** — and both were left to be found by eye down a hundred
rows. They are two toggles now, beside a sort that defaults to **dex order**,
which is the order HOME itself lists in and therefore how one screen gets
checked against the other. The rows carry the same card as every other list:
type band, the picture in the copy's own colours, BST, the ability and the six
stats, instead of a BST and a Speed. An offer shows both sides the same way.
And a chip Champions has never heard of now has a **price**, so it gets
recommendations — `chipValue` read the Champions dex, found nothing, and
returned no price at all, which meant the one kind of Pokemon the rules say to
trade was the one kind the app would not advise on.

**One Pokemon sheet, three doors.** Opening a Pokemon from the Champions box,
from HOME or from a search result used to give three different sheets: the
search view had the abilities, the Worlds sets and the whole movepool, the box
had the Mega line, the type chart and Smogon's write-up, and neither had the
other half — so which door you came through decided what you were allowed to
know about the same Pokemon. It is one sheet now, drawn in two halves with a
gap in the middle: **identity** (picture, types, BST, the six stats, the other
spellings of the name, what it becomes mid-battle), then whatever that door
owns, then **reference** (the Mega line and what the stone costs as well as
adds, what damages it, its abilities and how much of its own movepool each one
touches, the top-8 sets it won with, its movepool under the same filters the
build editor uses, and what Smogon wrote). Only ownership may sit in that gap —
origin, shiny, trained, and the note — and it sits there rather than at the
bottom because an edit belongs under the name it applies to, not below two
hundred rows of movepool. `ledgertest` holds all three to it: the box may add
those and nothing else.

**A shiny is a different picture.** Both sprite sets carry one, so a copy
recorded as shiny wears its own colours on its card and on its sheet. Only
where a specific copy is in hand — the search view draws the species, not his
copy of it.

**A HOME Pokemon Champions has never heard of is still a card.** HOME holds
species the game does not have, and those rows used to be a name and a "not in
the Champions dex" tag with nothing else - no types, no BST, no stats, no
ability - which is no help at all on the one screen where you decide what to
keep. `scripts/fetch_home_dex.py` fills them in for 920 species from PokeAPI's
own tables, read at a pinned commit. The tag stays, and the card says plainly
that these are main-series numbers: Champions publishes none for them, so there
is nothing of ours to contradict - and nothing of theirs is ever used for a
species Champions does have, where the move rebalance makes PokeAPI wrong (81%
of its PP values and 16 of its base powers disagree with Champions).

**The explanation does not stand in front of the answer.** Each screen opens
with the one sentence that says what it is; the rest of the intro sits behind a
link that states how many words are in it. Nothing is deleted and nothing is
guessed at - the text is one tap away and still in the page - but Builds now
reaches its first build in 181px instead of 220, and HOME in 161 instead of 199.

**The movepools finally have a second opinion.** Every other number here is
crossed against something - the damage formula against Smogon's engine, the type
chart against Serebii's own weakness tables, the item prices against pokebase -
but a movepool came from one parse of one page, and when that parse went wrong
it went wrong silently. PokeAPI tracks Champions as its own version group, so
`scripts/audit_learnsets.py` pairs 235 of them against an independent read:
~14,600 move-species pairs, **seven disagreements, and Serebii backed this
project on all seven**. It never rewrites anything - when the two disagree,
Serebii decides - and each known disagreement records which Serebii page
settled it, so only a NEW one speaks up.

**Every card carries its Pokemon's sprite**, fetched from a CDN at a pinned
commit and never copied into this repository - those are Nintendo and Game Freak
images, PokeAPI licenses its own sprites repo NOASSERTION for exactly that
reason, and this repo is public. Only the id ships. The pixel set rather than
the artwork, measured: 1.3 KB against 139 KB for the HOME render and 153 KB for
the official one, and a screen of 159 cards would be 22 MB of those. A sprite is
also the one thing PokeAPI has that is safe for the species Champions DOES have
- a picture is not rebalanced.

`python scripts/preview.py` puts three viewports side by side in a browser -
desktop, laptop and phone - each in its own iframe so the media queries are
real, with the cache cleared first and the app's own overlap check on a button.

Its source is thirteen ES modules under `tracker/src/`, each one a tab or the
thing the tabs share, saying what it exports and importing what it needs. The
build links them into the single script the browser is handed, plus a sourcemap
so a stack trace still names the file a person edits. **Edit a part, never
`tracker/index.html`** - that file is generated.

---

## What is in the database

<!-- COUNTS:START -->
| File | Rows | What it holds |
|---|---|---|
| `data/db/pokemon.json` | 345 | Every playable form: types, base stats, abilities, and the 81 Megas |
| `data/db/moves.json` | 901 (512 useable) | Champions move data, 15 flags, and who learns it |
| `data/db/abilities.json` | 215 | Champions ability text and every carrier |
| `data/db/items.json` | 199 | Items and Mega Stones with their VP price |
| `data/db/learnsets.json` | 264 | Reverse index: Pokemon to movepool |
| `data/db/ability_moves.json` | 140 | Which ability changes which move, derived from the move text |
| `data/db/effects.json` | 390 | What an item or ability multiplies, exactly, read out of the engine |
| `data/db/typechart.json` | 18 | The type chart, cross-checked on 3402 matchups |
| `data/meta/usage_pokemon.json` | 304 | Ladder usage per Pokemon |
| `data/meta/usage_moves.json` | 426 | Ladder usage per move |
| `data/meta/speed_tiers.json` | 89 | Base Speed to real Speed at every investment |
| `data/meta/smogon_analyses.json` | 358 | Smogon's written VGC analyses |
<!-- COUNTS:END -->

That table is **generated** by `scripts/build_readme.py` and checked on every
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
| **Pikalytics** | Win rates, top SP spreads, and 2-/3-Pokemon cores | What is popular — its data lags |
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
**The gate** is 31 checks, and nothing reaches the phone without
passing all of them:

- a **shrink guard** — if a rebuild comes back with fewer forms, moves or
  learnsets than the last good one, a source broke and the run stops
- **nine Python audits** — the damage formula against Smogon's engine, name
  matching across all five sources, every derived index resolving, every form
  still accounted for, the README's own numbers, and that no SQL migration is
  still waiting to be applied
- **one source check** — the app is linked from thirteen ES modules, so a name
  two of them both declare, or one of them uses without importing,
  is read for once rather than clicked
- **twenty browser tests** — run against the built page, because no Python
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
<!-- TESTS:START -->
tests/       twenty browser tests, run against the BUILT page
<!-- TESTS:END -->
analysis/    write-ups: the Smogon engine, regulation M-C, the roadmap
CLAUDE.md    the rules this project works by, including everything learned the hard way
```

---

## Keeping this file honest

Every number above is **generated** from the data and verified on every build:
`scripts/build_readme.py --check` runs inside the gate, so a README that has
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
(Serebii, pokebase.app, Pikalytics, Smogon, pokedata.ovh) and describe a game
owned by someone else. They are here to make one player's own box searchable,
not to be redistributed as a dataset.

Pokemon and all respective names are trademarks of Nintendo, Creatures Inc. and
GAME FREAK Inc. This is an unaffiliated fan project; nothing in it is sold or
advertised.
