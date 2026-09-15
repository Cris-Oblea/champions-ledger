# Status — 2026-09-09

Where the project stands, and what comes next.

---

## How the whole thing works

Five sources are scraped into local JSON, then joined by one query tool.

```
  Serebii ─────────┐
  pokebase.app ────┤
  pokedata.ovh ────┼──► data/raw/  (cached HTML+JSON, 164 MB, 2300 files)
  Pikalytics ──────┤          │
  Smogon ──────────┤          ▼
  Smogon calc ─────┘   (the executable one: engine + 406 sets)
                       build_db.py / fetch_*.py
                              │
                    data/db/    (rules: what exists, what it does)
                    data/meta/  (metagame: what people actually run)
                              │
                              ▼
                        scripts/query.py  ◄── inventory/*.json (what YOU own)
```

Nothing is answered from general Pokemon knowledge. Champions rebalances moves,
so console-game numbers are wrong here; every figure comes from a
Champions-specific source. `CLAUDE.md` holds the rules, gotchas and playstyle
notes — read it first.

### The scripts

| Script | Does |
|---|---|
| `fetch_serebii.py` | Dex, movedex, rules pages (the ground truth) |
| `build_db.py` | Turns that HTML into `data/db/*.json` |
| `fetch_pokebase.py` | Ladder usage + speed tiers |
| `fetch_pikalytics.py` | Win rates, top SP spreads, 2-/3-Pokemon cores |
| `fetch_smogon.py` | Written VGC analyses (VGC formats only) |
| `fetch_smogon_calc.py` | Smogon's Champions damage engine (`--check` for drift) |
| `smogon_engine.js` | Runs that engine locally; `damage.py --engine smogon` |
| `fetch_tournament.py` | Worlds standings + full teamlists |
| `query.py` | Every lookup — the only thing you normally run |
| `build_typechart.py` | Type chart + natures, cross-checked against Serebii |
| `audit_forms.py` | Checks no form/gender/Mega went missing |
| `test_norm.py` | Checks names match across the five sources |

### Everyday commands

```bash
python scripts/query.py brief <pokemon>     # dossier: all sources at once
python scripts/query.py build [pokemon]     # your builds, rule-checked
python scripts/query.py megas               # what you can actually field
python scripts/query.py owned               # your box vs the meta
python scripts/query.py usage --top 30
python scripts/query.py worlds --usage --top 64
python scripts/query.py worlds --usage --division all   # Masters/Seniors/Juniors
python scripts/query.py moves --flag sound
python scripts/query.py moves --effect "protects itself" --learners
python scripts/query.py counter-priority
python scripts/query.py speed --min 100
```

---

## What is loaded

**Regulation M-C is live (2026-09-09) and loaded.** Rules data is current, and
so is the **ladder usage: it is M-C**, fetched 2026-09-12 — pokebase defaults to
the latest regulation and species that are only legal in M-C now carry real
numbers (Indeedee-F 17.1% and top ten, Sinistcha 9.1%, Archaludon 7.6%). This
page said "usage is still M-B" until the player corrected it on 2026-09-12; that
was written on the day M-C opened and stopped being true the next. The **Worlds
teamlists stay M-B** because that is when they were played, and **Pikalytics
still lags** at `2026-05`. Full write-up in `analysis/regulation_m_c.md`.

| Data | Count | M-C change |
|---|---|---|
| Pokemon forms (**81 Mega**) | **345** | +32 (23 species, 3 forms, 6 Megas) |
| Moves (**514 useable** in Champions) | 901 | +15 useable |
| Abilities | **215** | +15 |
| Items | **199** | +18 (6 stones, 12 held) |
| Learnsets | **264** | +25 |
| Ladder usage — Pokemon / moves / abilities / items | 321 / 501 / 192 / 139 |
| Speed tiers | 84 |
| Smogon Pokemon (**53 with written VGC analysis**) | 323 |
| Pikalytics — tournaments / ladder | 243 / 231 |
| **Worlds 2026 Masters** — final, players / teamlists | **395 / 394** |
| **Worlds 2026 Seniors** — final, players / teamlists | **139 / 137** |
| **Worlds 2026 Juniors** — final, players / teamlists | **111 / 111** |

Health after the M-C refresh: `audit_forms.py` clean (no collisions, nothing
missing), `test_norm.py` all pass (**53** name groups collapse, **25** pairs stay
distinct), `damage.py --selftest` all benchmarks pass (20/20 vs Smogon's engine).
Cross-validated against pokebase: all **345** of our forms match a pokebase
entry, and every Pokemon pokebase tags Champions-legal is in our dex — zero
unmatched either way.

---

## Pikalytics is on notice until 2026-10-15 (player, 2026-09-15)

**"Voy a darle 1 mes de tiempo a pikalytics, si no se actualiza prefiero
sacarlo de fuente, smogon y pokebase han demostrado ser fuentes mucho más
confiables para todo, serebii ha servido para verificar lo mismo."**

It is still stamped `2026-05` with its ladder code on season 3, two regulations
behind. Nothing new should be built on it, and its numbers must never be quoted
as current - which was already the rule, now with a date on it. If it has not
moved by **15 October 2026**, `fetch_pikalytics.py` and
`data/meta/pikalytics_*.json` come out and the source list drops to four.

What replaced it in the meantime is better anyway: pokebase's per-Pokemon pages
carry the same shape of data - which moves, item, ability, nature and SP spread
each Pokemon's own players run, with percentages - off the LIVE M-C ladder.
`scripts/fetch_pokebase_splits.py`.

### Those pages paginate, and it took two goes to read them (2026-09-15)

The player caught it: "pokebase si publica todo... TIENE PAGES!". The sections
paginate **client-side**, out of props the server already sent, so `?page=N`
does not exist on a per-Pokemon page and the rendered HTML holds page 1 for
ever. The fetcher knew five of Rillaboom's nineteen moves. It reads the Next.js
flight payload now and gets every page of every section: **2884 moves priced
across 290 Pokemon**, against about 1400 before.

Looking for the pages found the worse bug. That page carries **two datasets
under the same headings** - tournament teamlists for one regulation, and the
ladder season - and they do not measure the same thing. Keeping whichever run
of percentages was longer mixed them, so the stored file had Kingambit's moves
summing to 370 (a share of SETS) and Rillaboom's to 94 (a share of move SLOTS).
Rillaboom has no season block at all, which is how it stayed invisible.

Both are captured now, separately and whole. The app ships the tournament
block - present for every Pokemon, stamped with the regulation, one measurement
throughout - and `build_splits_data.py --check` asserts what every column is a
share of, on every Pokemon, inside the gate. A source that quietly changes a
denominator is caught rather than silently redefining every number on screen.

### A tier list is Find, sorted (2026-09-15)

Speed tiers were built as their own block with a tab per stat, and the player
replaced the idea with a better one the same afternoon: "en vez de ser varias
tablas de tier por stat, que sea una sola tabla, pero con filtros por stats...
find ya cuenta con filtros de tipo, abilities y move, habria que quitar el
cuadro de speed y colocar filtros per stat y cumpliria de mejor manera."

He is right, and it is the argument Find was built on. A tier list IS the
result list sorted by one column; keeping it separate meant a speed tier could
never also be "and it learns Fake Out and I own one", which is the question
worth asking.

The shape settled over three more corrections from him, each of which made it
smaller:

- **A direction, not a pair of bounds.** Min and max boxes per stat were the
  first idea; he cut them ("es mejor un orden ascendente y descendente"). It
  also subsumes what the old "Speed at most" box was for - that was labelled
  the Trick Room filter, and sorting Speed ASCENDING answers it without having
  to guess a threshold first. Tapping the stat you are already on flips it.
- **All six stats stay.** Ranking by one briefly hid the other five as noise;
  he cut that too ("si filtro por atk... tambien quiero ver la speed, no
  puedes quitarme esa informacion"). An Attack ranking is read WITH the Speed
  beside it. Nothing is hidden - the ranked one is marked instead.
- **Base values only.** "Los SPs y naturaleza son parte del builder." The
  level-50 floor and ceiling belong where one Pokemon is being decided about,
  not on 120 rows of a list.

A third scope toggle narrowed the dex to the field. It was called "Brought to
M-C", he could not tell what it meant - which on a phone is fatal, there being
no hover to explain a label - it was renamed "Played in M-C", and then he cut
it outright: "no me sirve en find, lo encuentro malo". The two box filters
stay. Worth recording as a shape, not a defeat: a filter that has to be
explained is usually one nobody wanted.

### Medals, and the set that won (2026-09-15)

Everything else in the app is a RATE - how often a thing is brought. This is a
RESULT. Anything that finished **top 8** at a World Championship wears a medal
in the search, and its sheet folds open to the exact sets: item, ability,
nature and four moves, with the player and their record, per year and per
division.

**It is filed under the form that was REGISTERED, which is always the base
one.** Measured rather than assumed: of the 16,875 team slots pokedata
publishes, exactly zero are written as "Mega something". Takuma Yamazaki won
2026 with "Floette [Eternal Flower] @ Floettite", so Floette is the entrant.

This went in the other way round first - the medal on Mega Floette - and the
player corrected it: "la base tener la medalla y por consiguiente por el item
se sabe que es mega". He is right twice. Filing it under the Mega invents an
entrant that was never on the sheet, and it makes a search for Floette come
back empty about the team that won with one.

Nothing is lost, because the stone is in the set and the stone settles it:
`stone_for()` is 1:1 over all 81 Megas, so the Mega and the single ability it
gains are both derived - "Mega Evolves into Mega Floette — ability becomes
Fairy Aura" - rather than left as an exercise. His words for that half: "esa
se sabe por descarte". And the recorded ability is the BASE one, which is
correct and must never be called mislabelled: it is what the Pokemon has until
it evolves, and when to evolve is a real decision because that ability is
doing something until then.

41 forms have a podium entry over 2023-2026, three divisions each. 2022 has
standings only, and 2023 splits its divisions across two pokedata events - the
one with more players wins, or Seniors and Juniors get two podiums each.

### No list may cut itself in silence (2026-09-15)

Found because a movepool was short on his phone: "la lista de moves en el find
cuando se abre la ficha de un pokemon no se alcanza a ver toda en el movil, se
corta". The sheet drew 60 and the filter's own counter only warned past 80, so
they disagreed - and **131 of the 264 learnsets in Champions are longer than
60**, so half the dex was losing moves off the end with nothing on screen
saying so.

He then asked for all of them checked, and every picker in the app was doing
it: the damage calculator drew 50 of 345 forms, the team's item picker 60 of
118, the GTS 40, the abilities list 80 of 215 while its counter said "215".
The cap now lives with the count that reports it, `capNote()` says it in the
same words everywhere, and a single Pokemon's movepool is not capped at all -
the longest in Champions is Gallade at 106.

## Items and abilities are numbers now, not adjectives (2026-09-14)

**Measured first, because the complaint deserved a measurement: of the 199
items in Champions, exactly TWO carry a number anywhere in their description.**
Serebii writes "slightly boosts the power" and "casts a tricky glare". Abilities
are better - 92 of 215 have a number in the text - and moves already carried
theirs as fields (`power`, `accuracy`, `pp`, `priority`, `effect_rate: 30.0` on
Rock Slide, `hits`, `crit_rate`). A set cannot be argued against another set out
of sentences.

**A multiplier cannot be recovered from a damage ratio, so do not try.** The
formula ends in `+ 2` and every stage floors: a x1.5 ability measures 1.453 at
the low roll and 1.477 at the high one, and no averaging makes either of them
the number. `measure_modifiers.py` recorded Guts as x1.477 for exactly this
reason.

**The engine does not hide it.** It builds each stage as a list of multipliers
in 4096ths - 4915 is x1.2, 5324 is x1.3, 6144 is x1.5 - and `champions.js`
EXPORTS the four functions that build those lists. `scripts/probe_modifiers.js`
calls them directly and reads the values out, against a baseline identical but
for the one thing being probed. Exact, attributable, and with none of our
arithmetic in between. Guts is 6144/4096. Life Orb is 5324/4096.

`scripts/build_effects.py` sweeps every item and every ability that way - 1,760
generated cases in three seconds - and writes `data/db/effects.json`. The cases
are GENERATED, not hand-written: the 37 hand-written ones are why only 10 items
and 27 abilities ever had a number.

**Three ways the probe lied before it was made to stop**, all worth knowing
because each produced a confident wrong answer:

- The vehicle move must be in the CATEGORY being probed. The first sweep picked
  the highest-powered move of each type regardless, so the "special" probe ran
  on Poltergeist - a physical move - and Muscle Band came out boosting special
  attacks, which it does not.
- It must be honest about its power. Acrobatics reports 110 with no item and 55
  with one; anything probed through it measures the item instead.
- It must deal damage at all. Poltergeist reports a perfectly good 110 and
  deals ZERO against a target holding no item, because the engine zeroes it a
  stage later. Every probe through it said "no effect", which is how Wise
  Glasses came out unmodelled when it is plainly x1.1.

Each vehicle is now verified against the engine on all three before it is used.

**The engine only models DAMAGE, and the rest came from a source already on
disk.** It does not model healing, accuracy or speed, and its item records
carry nothing but identity - `Sitrus Berry` is `{isBerry, naturalGift}`. This
page briefly said those numbers existed nowhere, which was wrong: the player
pointed at Smogon's own dex, and `data/db/smogon_basics.json` had them all
along.

    Sitrus Berry  "Restores 1/4 max HP when at 1/2 max HP or less."
    Wide Lens     "The accuracy of attacks by the holder is 1.1x."
    Leftovers     "At the end of every turn, holder restores 1/16 of its max HP."

51 of 169 items, 89 of 215 abilities and 267 of 515 moves carry a number there,
against 2 of 199 items in Serebii's text. Each one extracted keeps the sentence
it came from, so it can be checked against the words that produced it. Words
that mean numbers count as numbers - "Fire power against it is halved" is x0.5
- because otherwise the cross-check reports a disagreement that is not one.

**The two sources are compared, and agreeing is the point.** Guts reads x1.5
from the engine's own modifier stage and 1.5x from Smogon's text. Where they
differed, both times the fault was in the comparison rather than the data:
Fluffy's "takes 1/2 damage" is a multiplier written as a fraction, and Water
Bubble's is written as a word.

**That comparison also caught a corruption nobody had noticed.**
`fetch_smogon.py` decoded with `errors="replace"`, and Smogon has served cp1252
at least once - where the multiplication sign is a bare 0xD7 - so every "1.3x"
in the item and ability text had been stored as "1.3�". The numbers
survived, the operator did not. It tries utf-8, then cp1252, and only then
gives up a character; re-fetched, there are zero replacement characters left.

## Regulations are detected now, not remembered (2026-09-14)

`fetch_serebii.py` skips any page already cached and the attackdex is where
LEARNSETS come from, so a plain nightly run on the day a regulation drops picks
up the new Pokedex pages and silently keeps every stale attackdex one - the new
species arrive with no movepool. The recipe that avoids it,
`refresh.py --regulation`, existed; knowing to type it was a human's job, which
made "the database is always current" true on every day except the one that
mattered.

`scripts/check_regulation.py` asks two sources instead. pokebase ships
`defaultLatestRegulationSetSlug` as a value in its page data - the same field
M-C was confirmed with - and Serebii's Ranked Battle page lists the regulations
it knows about. `data/db/regulation.json` records what the database was built
for, beside the data it describes, committed by the same run.

- both agree and match ours -> an ordinary refresh
- a new one, and Serebii has published it -> the recipe runs by itself, and
  the record is written only AFTER the rebuild passes. The recipe re-fetches
  every page in place rather than deleting the cache first, so a failure
  halfway leaves yesterday's pages standing and the run can say WHICH pages
  changed. Serebii sends no Last-Modified and no ETag - tested - so there is
  no lighter way to ask; what makes it cheap is that the attackdex is indexed
  by MOVE, so "Slash added to 29 Pokemon" is one page, not 29.
- a new one, Serebii has not caught up -> it says so and waits. If Serebii
  names no regulation this recognises at all, it acts anyway: that is not
  evidence of absence, and a silent no-op is the failure being prevented.
  Nothing assumes the "M-x" shape - the next series may be N-A, or a number.

The night it fires, the pull request is titled `REGULATION M-x - daily refresh`.
The gate is what makes this safe to automate at all: a bad rebuild fails the
shrink guard or the audits, the PR stays open, and nothing reaches the phone.

## Regulation M-C — what landed (2026-09-09)

The three sources did **not** update together, and that shaped the whole job:

| Source | State on launch day |
|---|---|
| **Serebii** | Fully updated — every new species, Mega, item, ability and move came from here |
| **pokebase** | **Dex** updated (carries an explicit `regulationSets: M-C` tag); **usage** still empty |
| **Smogon calc** | Partial — has the three Z Megas, **not** the four new species |
| **Smogon dump-basics** | Not updated (still 323 / 500 / 151 / 201) |
| **Pikalytics** | Not updated (still stamped 2026-05) |

Highlights, all verified locally rather than taken from the announcement:

- **23 new species, 6 new Megas.** Three Megas are **second** Megas on species
  that already had one — the new **Z** suffix: Mega Garchomp Z (pure Dragon,
  Levitate), Mega Absol Z (Dark/Ghost, Sharpness), Mega Lucario Z (Aura Guard,
  a brand-new ability). All three sit at exactly **Speed 151**.
- **No move was rebalanced.** But **Slash was added to 29 already-legal
  Pokemon** (7 of them in the player's box), and **Archaludon lost Metal Burst
  and Mirror Coat** — the only removal in the regulation, and it hits a Pokemon
  the player owns.
- **Terrain grew a support cast.** It was not new (Mega Raichu X had Electric
  Surge, the four terrain moves were useable), but M-C adds Grassy Surge,
  Psychic Surge, a second Electric Surge and Seed Sower, plus the four Seeds and
  Terrain Extender — six items that did not exist before.
- **The move watchlist fired.** Snipe Shot got its first learner (Inteleon) and
  went useable, exactly the mechanism `analysis/smogon_calc.md` predicted.
  Eleven stubs remain.

### Four bugs this refresh exposed and fixed

They are listed because each one silently produced wrong output, and three
predate M-C:

1. **`build_db.py` did not understand the `Z` Mega suffix.** Mega Garchomp Z
   parsed as its own species ("Garchomp Z") instead of a second Mega of
   Garchomp, so `query.py owned` never offered it on a Pokemon the player owns.
   The regex knew `X` and `Y` only.
2. **`stone_for()` matched stones by name prefix**, so "Dragon Fang" answered
   for Dragonite and "Sharp Beak" for Sharpedo. Now filtered on `is_mega_stone`;
   the mapping is a verified **1:1 over 81 Megas and 81 stones**.
3. **Stone ownership was reported per species, not per Mega.** With two Megas on
   one species that is wrong: the player owns Garchompite but not Garchompite Z.
   The box view now prints each Mega line with its own stone status.
4. **Ability text swallowed the next section header** ("Female Abilities:",
   "Hisuian Form Abilities:") — 4 abilities affected, 3 of them pre-existing.

Plus one join fix: Serebii spells Toxtricity's Low Key form `Toxtricity-L` while
pokebase spells it out, and `norm()` could not bridge that without collapsing
Low Key into Amped. Handled with an `_ALIASES` entry and locked into
`test_norm.py`.

## What the toolchain gained on 2026-09-04

**`scripts/damage.py` — a real damage calculator.** The formula was not in any of
the five sources; it came out of the JS bundle behind pokebase.app's own
`damage-calc`, which ships `@smogon/calc` driven with Champions data.

```
stat        = floor((base + clamp(SP,0,32) + (75 if HP else 20)) * nature)
base damage = floor(floor(floor(2*L/5+2) * power * A / D) / 50) + 2     at LEVEL 50
```

`python scripts/damage.py --selftest` validates it against three survival
benchmarks Smogon states in prose — **two of which it hits by a single HP**. Run
it after any change. It also knows the doubles **x0.75 spread modifier**, Sheer
Force / Sharpness / Life Orb (each at the right stage), Body Press attacking off
Defense, Foul Play off the target's Attack, and defensive boosts that only apply
to the stat they raise.

**`data/db/weights.json` — 1446 species weights.** Heavy Slam, Heat Crash, Low
Kick and Grass Knot are stored at power 1 in `moves.json` because their real
power is derived from weight; without this they calculated as nothing.

**`query.py move <name>`** prints Serebii's text *and* Smogon's side by side.
It exists because reading one rules source produced two wrong answers in a row:
Serebii names a status without defining it ("Sealing Off"), and only
`smogon_basics.json` gives the mechanic and durations. **`query.py moves
--owned`** adds a column naming the box Pokemon that learn each move.

**`fetch_tournament.py` uses the event JSON export**, one request per division
instead of 400, with final placings and complete natures.

---

## The sixth source: Smogon's own Champions engine

Smogon publishes a Champions-specific damage calculator, and Champions is wired
into it as its own generation (gen 0) with a dedicated mechanics file, roster,
move table and 406 sets. It is the only **executable** source we have, and it
independently confirms both formulas this project rests on, character for
character.

It is vendored under `data/raw/smogon_calc/` and runs locally under Node with no
install. Full write-up in `analysis/smogon_calc.md`.

```bash
python scripts/damage.py --selftest              # 3 benchmarks + 16 vs the engine
python scripts/damage.py <a> <move> <d> --engine smogon
python scripts/fetch_smogon_calc.py --check      # has upstream moved?
```

**What it changed here.** A 909-case diff between the two engines found seven
real errors in `damage.py`, all now fixed — parity went from 872/909 (96.0%) to
**895/909 (98.5%)**, and every one of the 14 remaining differences prints a
`CONDITIONAL:` warning naming why. Only four moves ever diverge, and each needs
a fact nobody supplied: Acrobatics and Poltergeist (who holds an item), Steel
Roller (terrain) and Payback (turn order). The errors that mattered:

- **Multi-hit moves counted as one hit.** Mega Aerodactyl's Dual Wingbeat read
  62-74 and "no OHKO"; it is really 160-192 and a 31% OHKO. Hit counts are now
  parsed out of Serebii's own effect text, so a future move is picked up free.
- **Aegislash attacked with 50 Attack instead of 140.** Stance Change flips it
  to Blade Forme the moment it attacks. Added as `battle_forms` on the base row
  (so no join breaks), alongside Palafin-Hero and the three Gourgeist sizes.
- **Psyshock hit the wrong defence** — it is Special but attacks Defense.
- **Four spread moves were not detected as spread** and came out a third high,
  because Serebii spells the target field four ways and gets Misty Explosion
  wrong outright.
- **Foul Play assumed a max-Attack Adamant target**, which is wrong about
  exactly the bulky targets it is aimed at.
- **Raging Bull was calculated as Normal.** Its type comes from the Tauros form
  using it, so on Kingambit it is 120-144, not 20-24 — a factor of six. Aura
  Wheel is the same shape.
- Always-crit moves missed their x1.5; screens were not modelled at all;
  Meteor Beam's charging +1 Sp. Atk was not applied.

**What it deliberately does NOT do:** implement abilities. The engine models 46
attacker-side and 65 defender-side; copying those into Python would drift the
moment Smogon updates. `damage.py` names any ability in play instead and points
at `--engine smogon`. Biggest one in the box: Basculegion's **Adaptability**
makes Wave Crash on Kingambit 108-128, not 81-96.

---

## Traps this project has already fallen into

Recorded so they are not repeated. Every one produced a wrong answer that had to
be retracted.

- **A round number is not a swiss round.** Worlds sat at "R15" because it was
  the Final. Read `round_label` and `complete`.
- **`effect_rate` is not a secondary-effect flag.** It reads 4.17 (the crit
  rate) for moves whose secondary is *guaranteed*, so filtering on it silently
  drops Lunge, Skitter Smack and Rock Tomb — and wrongly includes Stone Edge,
  whose crit-ratio boost Sheer Force does **not** count. Use the rules, not the
  field.
- **Type volume must be counted after conversions.** Pixilate, Refrigerate and
  the like retype Normal moves, and Weather Ball becomes the team's weather. Raw
  counting says Normal is the most-thrown type (1379); corrected, Fairy leads at
  1070 and Normal's real *damage* share is about 105 slots — the rest is Fake
  Out and dead Weather Balls.
- **A defender holding a Mega Stone is the MEGA when you calculate.** 291 of 292
  Worlds Charizard hold Charizardite Y; calculating against base Charizard
  overstates the damage.
- **An immunity is 0, not 1.** The minimum-1 floor only applies to a move that
  connects.
- **Never assert a matchup without running the calculator.** Type multipliers
  alone said Explosion would not clean the top shell; the real numbers said it
  OHKOes every neutral target through full bulk investment. Both halves of that
  mattered.
- **A form with the same sprite is still a different Pokemon** (caught by the
  player, 2026-09-12). Form rows come from the attackdex tables, which only
  emit one when the sprite differs — so Squawkabilly's four plumages and
  Gourgeist's four sizes collapsed into one row each. That is how **Sheer Force
  ended up with no carrier in the whole database**: it is the third ability of
  the Yellow and White birds only. Never read "one row" as "one Pokemon"
  without checking the page's Alternate Forms table; `audit_forms.py` section 7
  does it now.

---

## Worlds, all three divisions

Masters, Seniors and Juniors run the same roster and the same regulation, so the
kids' divisions are a second, independent read on the format — 250 more teams
that nobody copied from the Masters stream. They are **not** pooled into one
percentage: `--division all` prints them side by side.

**Round numbers are not swiss rounds.** The top cut keeps counting up from the
last swiss round — Masters ran 11 swiss and then 12=TopCut, 13=T8, 14=T4,
15=Final — so "round 15" is the trophy match, not an unfinished swiss. The data
files now carry `round_label` and `complete`; read those, never the bare number.

```bash
python scripts/query.py worlds --usage --division all
python scripts/query.py worlds --usage --division seniors --limit 40
python scripts/query.py worlds --division juniors --top 8
```

What the split says (share of teams in each division):

| Pokemon | Masters | Seniors | Juniors |
|---|---|---|---|
| Kingambit | 52.7% | 52.5% | 51.4% |
| Charizard | 45.1% | 47.5% | 43.2% |
| Garchomp | 39.5% | 48.2% | 45.9% |
| Basculegion [Male] | 33.9% | 36.7% | 43.2% |
| **Incineroar** | **41.3%** | **29.5%** | **22.5%** |
| Whimsicott | 24.1% | 32.4% | 33.3% |

The shell is the same everywhere — Kingambit, Charizard, Garchomp, Basculegion
lead all three. What moves is the support slot: Masters answers the format with
**Incineroar** (41%, nearly double the Juniors figure), the kids answer it with
**Whimsicott** speed control. Venusaur, Sinistcha and Hisuian Arcanine are also
Masters-skewed; Aerodactyl, Froslass, Glimmora and Torkoal skew young.

Winners: **Masters** Takuma Yamazaki [JP] 13-2-0 (Floette, Basculegion,
Kingambit, Dragonite, Garchomp, Sneasler) — **Seniors** Vikram T. [UK] 12-2-0 —
**Juniors** kazuki k. [JP] 11-2-0.

Every Champions rule the database rests on holds in all three divisions, which is
worth more than the Masters check alone:

- **Item Clause**: 0 repeats in 636 teams with a full item list.
- **Two Mega Stones is the norm, not one**: 292/395 Masters, 114/137 Seniors and
  94/111 Juniors carry two — three Masters teams carry three.

---

## Champions rules established so far

- **VGC = doubles**, bring 6 / pick 4.
- **Stat Points: 66 total, max 32 per stat.** Replaces EVs.
- **Item Clause**: no two Pokemon on a team share an item. Verified across all
  three Worlds divisions — 0 of 636 teams repeat one (388 Masters, 137 Seniors,
  111 Juniors). So items are decided at team level, not per build.
- **One Mega Evolution per battle**, though a team may carry several stones
  (292 of 395 Worlds teams carried two). The second stone is matchup choice.
- **Contrary inverts every stat change, from moves and abilities alike**
  (confirmed in game 2026-08-29). Mega Staraptor therefore *gains* +1 Attack
  from an opposing Intimidate, and its own Close Combat is +1 Def / +1 SpD.
  Defiant and Competitive are a different mechanic, not the inverse of Contrary:
  one stat drop gives +2 Attack or +2 Sp. Atk. Any restriction on them comes
  from the scraped ability text, not from the player.
- **Intimidate re-triggers on Mega Evolution**, so Mega Scrafty applies it
  twice: −2 Attack on both opponents from one slot.
- **Light Clay extends Aurora Veil**, not just Light Screen and Reflect.
- **Training costs (observed in-game, Serebii is stale)**: SP change 5 VP,
  move 250 VP, nature 500 VP, ability 500 VP.

---

## Player state

Master Ball Tier Rank 3. The box, the stones and the items live
in the ledger (they used to be in `inventory/inventory.json`, deleted
2026-09-13) and are printed by `python scripts/query.py owned`
— they are deliberately not copied here, because the two would drift (this
paragraph did: it still claimed 48/50 and 34 permanent slots).

Reached Master Rank 3 with an off-meta Trick Room team built on Mega
Eelektross. Prefers **special main attackers** — Intimidate is on 57.5% of
Worlds teams and only touches Attack.

### Builds recorded (20) — registration complete

Every Pokemon the player has actually trained is in the ledger's `builds`
table. (This said `inventory/builds.json`, which no longer exists.)
Print them with `python scripts/query.py build [pokemon]`, which rule-checks each
spread as it goes. Do not restate them here — the two copies would drift.

19 species, 20 builds (Incineroar ×2, same set, one tuned to Defense and one to
Sp. Def): Aerodactyl, Basculegion, Ceruledge, Eelektross, Farigiraf, Froslass,
Garchomp, Gholdengo, Incineroar, Jolteon, Kingambit, Maushold, Ninetales-Alola,
Rotom-Wash, Samurott-Hisui, Sceptile, Scrafty, Staraptor, Sylveon.

Items are deliberately absent: the player decides them once the six of a team are
fixed. Mega Stones live in each build's `mega` field.

**Untrained permanents (14)** — raw material, nothing planned for them yet. The
percentage is how much the OPPOSITION runs them on the ladder, which is the
reason to know they are sitting in the box: Sneasler 22.6%, Archaludon 14.9%,
Raichu 10.5%, Tyranitar 7.6%, Dragonite 5.1%, Vivillon 2.3%, Meowscarada 1.3%,
Chandelure 1.0%, Aggron 0.4%, Empoleon 0.3%, Arcanine 0.3%, Quaquaval 0.2%,
Pikachu 0.1%, Machamp 0.1%.

---

## Next session

1. **Assemble teams from the 20 builds.** Items get argued at that point and
   only then — six slots, no repeats. Megas are not a constraint to minimise:
   a team may carry two stones and choose in-game which one evolves.
2. **Build outward from the interactions the box already has**, not from
   tournament lists:
   - **The Charm install.** Ten owned Pokemon learn Charm, and on Contrary
     Mega Staraptor it is +2 Attack instead of -2. Maushold is the best carrier:
     Charm, Friend Guard (-25% damage to the ally) and Follow Me in one slot.
   - **Mega Staraptor as an Intimidate trap.** Contrary turns every opposing
     Intimidate into +1 Attack, and 57.5% of Worlds teams carry one.
   - **Mega Scrafty's double Intimidate**, -2 Attack on both opponents from one
     slot, and Swords Dance out-scaling anything Intimidate does back.
   - **Spread moves that hit the ally**: Earthquake (Garchomp) and Discharge
     (Rotom-Wash, Jolteon) target All Adjacent Pokemon. Garchomp is immune to
     Electric and Mega Sceptile's Lightning Rod converts it into +1 Sp. Atk, so
     the pairing is a choice, not an accident.
3. Decide whether any of the 14 untrained permanents earns the VP.

### Open questions

- Farigiraf **Modest → Quiet** costs 500 VP. Under Trick Room, Quiet would
  outspeed neutral base-60s (Sylveon 25%, Incineroar 41% of Worlds teams).

### Worth refreshing

**Come back to the metagame sources in a few days.** M-C's rules are loaded, but
three sources had not caught up on launch day and each one is worth a re-pull
once the ladder has run:

```bash
python scripts/fetch_smogon_calc.py --check   # has it added the 4 new species?
python scripts/fetch_pokebase.py --force      # first real M-C usage + speed tiers
python scripts/fetch_smogon.py --force        # dump-basics still 323/500/151/201
python scripts/fetch_pikalytics.py --force    # still stamped 2026-05
```

Until then: **`--engine smogon` fails on Baxcalibur, Salamence, Golisopod and
Rillaboom** ("Smogon's Champions roster has no ..."), because its roster only
gained the three Z Megas. Our own `damage.py` handles them from our database, so
use the local engine for the new species and say which one produced the number.

**Worlds 2026 is over and all three divisions are captured through the Final.**
Nothing is left to pull for that event; the commands below are for the next one.

```bash
python scripts/fetch_tournament.py                     # Masters
python scripts/fetch_tournament.py --division seniors
python scripts/fetch_tournament.py --division juniors
```

Only **3 players of 645** have no teamlist published at all (1 Masters,
2 Seniors). Everything else is complete, nature included.

## The sources, cross-checked on the numbers (2026-09-10)

`python scripts/audit_sources.py` puts every quantitative field of every move
and item beside each source that states it. **1473 numbers agree; four do not,
and two cells Serebii leaves empty another source fills:**

| Move | Field | Serebii | other |
|---|---|---|---|
| Slash | BP | 80 | **70** (pokebase) |
| Snipe Shot | BP | 85 | **80** (pokebase) |
| Night Slash | PP | 20 | **16** (pokebase) |
| Meteor Assault | BP | 150 | **170** (Smogon calc) |
| Double Shock | PP / accuracy | *empty* | **8 / 100** (pokebase) |

These are for the player to settle in game - his observation outranks every
scraped source - and Slash matters most, because M-C handed it to 29 already
legal Pokemon, seven of them in his box.

**Bulbapedia and WikiDex are deliberately not in that audit.** They are
main-series canon and Champions rebalances: Body Slam is 16 PP here, Aerial Ace
60 BP at 101 accuracy. Taking a number off either would import a value from a
different game. CLAUDE.md already allows them for a MECHANIC, after checking
Champions did not change it - which is exactly how the status table below is
built.

**Statuses were the missing fourth text area** - moves, abilities, items and
then nothing about the conditions that decide turns. Serebii has a Champions
page for it and it is a REBALANCE table, listing only what changed:

- **Paralysis: 12.5% to lose the turn, not 25%** - halved. Speed still 50%.
- **Freeze: 25% thaw, and only on a turn it tries to move** (was 20%).
- **Sleep: 33.3% to wake on turn 2, 100% on turn 3** - the 2-4 turn roll is gone.

`data/db/statuses.json` carries those with `source: serebii`, burn's x0.5 on
physical attacks with `source: measured` (it comes from the engine, not from
memory), and the five that no Champions source states - burn chip, poison,
toxic, confusion, flinch - as `champions_confirmed: false` with the
main-series number, waiting to be checked in game.

### The status column, and what it unblocked

`data/db/statuses.json` now also carries **which move inflicts which status** -
the column this project went without twice. It is derived from both
descriptions at once, which is what makes it possible; the traps are all real
and all handled:

- **Electric Terrain PREVENTS sleep** and would land in the sleep list on any
  naive match; **Snore, Rest and Sleep Talk REQUIRE it**.
- **Venoshock** says "poisonous liquid" (flavour) and "doubled if the target is
  poisoned" (a condition, not a cause).
- **Ice Shard** "flash-freezes chunks of ice" - the status word has to sit
  beside the TARGET, not beside the user's flavour.

88 moves classify: 20 flinch, 18 burn, 15 paralyse, 11 poison, 10 confuse,
6 sleep, 6 freeze, 2 badly poison. Two things that were blocked on it are now
done:

- **The ability table went 129 -> 142 rules.** Insomnia, Vital Spirit, Sweet
  Veil, Limber, Immunity, Magma Armor, Own Tempo, Leaf Guard, Flower Veil,
  Synchronize and Corrosion all have real move lists; the deliberate-exclusion
  bucket dropped from 21 to 10.
- **The status berries link.** Cheri Berry points at the 15 moves that
  paralyse, Lum Berry at all 81 that status anything. Item links: 75 of 85, and
  the 10 left are about HP, PP or switching - nothing to do with a move.

**Smogon's calculator has not moved upstream** (`fetch_smogon_calc.py --check`:
23 files unchanged since 2026-09-09), so its roster still lacks the four M-C
species and `--engine smogon` still fails on Baxcalibur, Salamence, Golisopod
and Rillaboom.

### One class of bug, hunted across the project (2026-09-10)

Three landed in a day and none was visible by reading the screen. They are one
fault: **a lookup that silently returns the wrong thing instead of failing.**

- `STAT_LABEL` was declared **twice** in the page; the second declaration, an
  array, won at runtime, so every caller asking by name got `undefined` - six
  unlabelled numbers on a Pokemon's sheet, and blank captions on the SP rows.
- `learnset()` resolved the **species before the form**: 25 regional forms were
  handed their base form's movepool (Samurott-Hisui lost Ceaseless Edge and
  Sucker Punch, Rotom-Wash lost Hydro Pump) and four forms resolved to nothing.
- `megasFor()` had the same fault one table over, offering **Raichu-Alola** the
  two Mega Raichu and **Slowbro-Galar** the Mega Slowbro. Smogon's roster states
  which form each Mega belongs to, and it is not always the base one: Mega
  Floette belongs to Floette-**Eternal**.

Two sweeps now hunt the shape rather than the symptom, and both are in
`refresh.py`:

```bash
node tests/consistencytest.js     # the page: 24 checks
python scripts/audit_lookups.py   # the scripts: 33 checks
```

They check the code for the smells (no name declared twice, no focus guard
outside the one form view) and then every table for holes - every form resolves
a movepool, a type colour, ability text and bucket, a stone, a dex number, an
engine name; every derived index points at something that exists.

**The Python sweep found two more on the day it was written:**

- `species_norm` stripped the Mega suffixes `x` and `y` but **not `z`**, so
  M-C's three Z Megas matched no base species and `query.py pokemon "Mega
  Garchomp Z"` listed no moves at all. Locked into `test_norm.py`.
- Two **phantom ability rules** ("Thermal Exchange 2", "Purifying Salt 2") left
  behind in `RULES`. The audit already printed a warning about rules for
  abilities that do not exist - it just printed it, and it was missed in a
  scroll. `--audit` exits non-zero now.

## Where we stopped, 2026-09-10/11

**Deployed and verified live**, version `2fa6b395` at
champions-ledger.cristobal-ruiz-perez-a.workers.dev - the served page is byte
for byte the local build. Everything below is in `refresh.py`, so a regulation
drop re-runs all of it.

### What the app gained

- **Ability badges finished**: 129 -> **140 rules**, the audit's "mentions
  moves, no rule" bucket at 0, and the rest listed with reasons.
- **Spread moves labelled**, and the 16 that hit your own ally flagged
  separately - in the build sheet, the move picker and the calculator.
- **Filters that stack** in every move list (build editor, search, a Pokemon's
  own movepool): sort by BP x acc / A-Z / PP / Type, chips for category,
  traits (AND) and type, with a count line.
- **Abilities bucketed ten ways** in the search, the two move-related buckets
  being the rule table itself.
- **"In my box" split in two**: In Champions / In HOME.
- **Types ask two questions**: ALL of these (a dual type, max two) or ANY of
  them (a group), switchable from the filter bar.
- **Every move and ability now carries text**, picked per entry between
  Serebii and pokebase by which one states more - and the search reads it, so
  "critical" finds the 21 crit-boosters and "burn" the ones that burn.
- **Items tab**: all 118 in the game's own four groups, with effect text, VP
  price and owned state, plus **what each item serves** (Heat Rock -> Sunny Day
  AND Drought) and a **Statuses** pane carrying Champions' own rebalance.
- **A build belongs to a Pokemon**: it follows its box row, is kept-but-inactive
  when parked in HOME, and dies with a release. No more orphans.
  **REVERSED two days later, 2026-09-13 - see the last section of this file.**
  A build owns its own id now and `box_id` may be null. Do not act on the
  sentence above.

### Bugs found and fixed (all by the player, then swept for)

`STAT_LABEL` declared twice; `learnset()` and `megasFor()` resolving the
species before the form; the Z Megas with no movepool in Python; two phantom
ability rules; `Indeedee-F` vs `Indeedee-Female` and Squawkabilly's plumages
listed as separate Pokemon. Two permanent sweeps now hunt the shape:
`node tests/consistencytest.js` and `python scripts/audit_lookups.py`.

### The ledger, as of 2026-09-11

Box **48/50** (stale - the ledger answers this now), 31 permanents and 17
rentals. HOME holds **84 / 78 species**. GTS: Chesnaught -> Gholdengo and
Pidgeot -> Crabominable pending, **one slot free**.

**Next, in the order that costs least** (answered 2026-09-11, on request):

1. **Release rentals first** - they cannot be trained and expire anyway. The
   Toxapex rental is redundant now that HOME has one; Garganacl 0.1%,
   Machamp 0.1%, Hatterene 0.7%, Dragapult 0.7%, Chandelure 0.9% and
   Meganium 0.9% are the least-played of the rest.
2. **Then the eight replacements already half-done** - Eelektross, Farigiraf,
   Froslass, Glalie, Jolteon, Ninetales-Alola, Scrafty, Staraptor all have a
   HOME copy. Order matters: **import, re-enter the build while the old one is
   still on screen, then release the stuck twin** - releasing deletes the
   build. ~2300 VP each, so three fit in 8000. Eelektross first.
3. **Do not release Tyranitar 600 or Archaludon 600.** With Melmetal blocked
   there is no 600-tier chip in HOME, so neither can be traded back.
   Vivillon 411 is the only cheap permanent to let go.

**The icon was invisible, not missing** (player, 2026-09-11). It was being
served fine - the design was a dark frame on the app's near-black ground, so
86% of its pixels sat within a few points of black, average luminance 38/255:
a black square on a phone home screen. Rewritten full-bleed in the teal accent
with the mark in dark ink (luminance now **147/255**), kept inside the
**maskable safe zone** - the old frame sat exactly on the line Android crops -
and the manifest declares `any` and `maskable` separately instead of both on
one file. Added `apple-touch-icon.png` at 180x180 with no alpha, which is what
iOS asks for. Deployed as `388a099a`.

**Still open:** a service worker for instant repeat opens, the same filter/cap
treatment for the Champions Box list that the HOME list got, and the four
numbers the sources disagree on (Slash, Snipe Shot, Night Slash, Meteor
Assault) which only the game can settle.

---

## Where we stopped, 2026-09-12/13

Everything below is on `main` and deployed. The app is at **25 gate checks**,
and nothing reaches the phone without passing all of them.

### The repo became a project

- **Public**, renamed `Cris-Oblea/champions-ledger` - "pokemon-champions" read
  as if it were about the game, and the app is a manager for builds, teams and
  boxes. MIT `LICENSE` plus a `NOTICE` carving out the scraped data.
- **`main` is protected**: pull requests only, the gate must be green, and it
  is enforced for admins too - verified by a rejected push, not assumed.
  `.github/workflows/push.yml` gates every PR; the nightly job opens its own PR
  and auto-merges it. `scripts/hooks/pre-push` runs the same gate locally.
- **The README is generated and checked.** Counts, vintage, the gate paragraph
  and the test count all live between markers; `build_readme.py --check` is in
  the gate, so a drifted README blocks the deploy.
- **`scripts/migrate.py`** and a `schema_migrations` table. The four
  `supabase_migrate_*.sql` had been pasted into the SQL editor by hand with
  nothing recording it. All four are applied.

### The automation, proved by running it (2026-09-13)

None of this came out of reading the workflows. All of it came out of firing
them, and four of the five faults below were invisible in a green run.

- **The off-site backup is on.** Nightly at 06:23 UTC - 03:23 in Chile, an hour
  and a half ahead of the refresh - into a separate PRIVATE repo, because a
  snapshot is the whole ledger in plaintext. **Nothing in the chain expires**: a
  deploy key to push, a connection string to read (`--db-url`), since Supabase
  no longer issues a non-expiring access token. A missing secret now FAILS the
  job; the old warning-and-skip turned a revoked secret into a green tick.
- **The restore's dry run was lying.** It called all 161 rows changed when
  nothing had, because the nightly job and the laptop read the database through
  different doors and the two spell a timestamp differently. The dry run is what
  makes a restore safe to run, so `canonical()` fixes the comparison and
  `--selftest` guards it in the gate. Verified by dry-running the snapshot the
  cloud pushed, downloaded back from the private repo.
- **The nightly could not open its pull request**, and never had been able to:
  "GitHub Actions is not permitted to create or approve pull requests" is a
  repository setting, now on and named at the step that needs it. Two refreshes
  were stranded on orphan `daily/*` branches while the runs in between passed,
  because a run where no source moved exits before that step. It also did not
  commit the README, whose counts are generated from `data/db`, so a refresh that
  moved one blocked the next person's push for a drift they had not caused.
- **Every action is on its Node 24 major** - checkout v7, setup-python v7,
  setup-node v7, cache v6, upload-artifact v7, setup-cli v3. `upload-artifact@v5`
  would have cleared the warning while still running Node 20. v3 of setup-cli
  installs from npm, which removes a rate-limited GitHub API lookup that had
  already failed a run.
- **The nightly is now gated for real, by a GitHub App.** The red run after every
  refresh was GitHub creating a workflow run for a PR opened with GITHUB_TOKEN and
  then refusing to execute it - zero jobs, `failure`, same second. Two attempts to
  fix it from inside push.yml were reverted: nothing there is ever evaluated,
  because no job is ever created. An App installation token is not GITHUB_TOKEN,
  so the run executes. `champions-ledger-bot` opens the pull request, push.yml
  gates it, and it merges itself when green - **and stays open when it is not**,
  which is what should happen to data that did not pass. The hand-posted `gate`
  status is gone with it: two writers for one context meant a real failure could
  be masked by a green this job wrote itself. Nothing in the chain expires; the
  App's key has no expiry, the token is minted next to the step that uses it (one
  hour, against a 70-minute job), and it holds Contents and Pull requests and
  deliberately not Workflows: write.
- **Two ordering traps.** `GITHUB_ENV` does not reach the step that writes it, so
  the backup cloned its store with no key, silently started a fresh history and
  could never see the previous snapshot; and `gh pr merge --auto` is REFUSED when
  the pull request is already mergeable, which is a race against GitHub's own
  status propagation that one run won and the next lost.

### The app

- **A build is its own thing** (player, 2026-09-13). Own id, nullable
  `box_id`, four states - active / parked / orphan / **unbound, which is an
  idea and not a fault**. Several builds per species, and a build for a Pokemon
  he does not own yet. A release now UNBINDS instead of deleting.
- **Teams**: six slots, each pointing at a build, **the item on the slot** (the
  Item Clause makes an item a team decision). Species and Item Clause checked
  rather than remembered, speed order and shared weaknesses derived, and a
  four-of-six team is legal to save - it says what he has, where it is, and
  what is still to get. Teams lives **inside the Builds tab**: an eighth tab
  wrapped the phone's nav onto two rows.
- **The editors are views, not pop-ups.** Back out of the item picker and the
  team editor is still there with its draft. This was the single worst thing
  about the builder.
- **Trainer became Profile** - one editable field (box capacity), everything
  else derived - and Damage became **Damage Calc**, since it is not tied to any
  one game.
- **Ability tags are scoped.** Guts was badging every move on Conkeldurr; it
  raises the Attack STAT and touches no move, so it badges nothing now. Rules
  that cover a whole category say so once instead of tagging 40 rows, and all
  of a Pokemon's abilities are consulted, not just the first.
- **Priority shows its number**, negative ones included.
- **Creating a record can no longer overwrite one.** It inserts and lets
  Postgres' 23505 say which id is taken (`putNew`). UUIDs were considered and
  rejected: the primary key is already `(user_id, id)`, so slugs never collide
  between accounts, and the readable id is what the build picker shows.
- **The page is thirteen ES modules**, and as of 2026-09-14 all thirteen
  really are: each says what it exports and imports what it needs, esbuild
  links them, and a part that declares neither is a build error.
  `tracker/src/`, linked into a 23-line shell. **Edit the part, never
  `index.template.html`.** `node scripts/check_app.js` reads them back as one
  program, inside the gate - and it catches a module using a name it never
  imported, which esbuild links without complaint and which throws on the
  phone. The build asserts one ordering: everything runs before `13-boot`,
  which starts the app.

### Forms, finished

345 forms, 0 mismatches against Smogon's engine. Squawkabilly's four plumages
and Gourgeist's four sizes are real rows (`FIXED_FORMS`) - collapsing the
plumages had lost **Sheer Force from the database entirely**. Indeedee-Female
came back from a `#0` dex number, and plain Floette is the Eternal form.
`audit_forms.py` section 7 fires on any Serebii page that splits abilities or
stats while our dex holds one row.

### The ledger

**Do not write its numbers here.** Every count typed into prose is a promise to
come back and retype it, and this file has three dead ones above it already.
One query answers it, and the CLI on this machine is already linked:

```bash
supabase db query "select location, count(*) from box group by 1" --linked
python scripts/backup_ledger.py --list      # and what each snapshot held
```

### Open

- ~~`inventory/*.json` and the ledger disagree~~ **SETTLED 2026-09-13: the repo
  no longer holds any copy of the ledger.** `inventory/` and
  `sync_tracker.py` are deleted; `scripts/ledger.py` reads the database, and
  `query.py owned` stopped printing a two-day-old box. The ten builds that
  existed only in the repo were dropped on the player's word - he had deleted
  them in the app when the Pokemon left Champions. The five team write-ups were
  NOT data and moved to `analysis/team_plans.json`.
- ~~VP and the ticket counts have no editor~~ **SETTLED 2026-09-13: VP is not
  tracked at all.** Profile keeps one editable field, box capacity, and
  nothing reads a balance any more. The COSTS stay - they are rules, and what a
  build costs is still part of every recommendation. `meta/trainer` was
  stripped to `box_capacity` alone in the database the same day, so the frozen
  `vp_balance`, `rank`, `regulation` ("M-B", two versions old), `season` and
  the ticket counts are gone rather than sitting there readable as current.
- Still open from before: a service worker for instant repeat opens, the same
  filter/cap treatment for the Champions Box list that HOME got, and the four
  numbers only the game can settle (Slash, Snipe Shot, Night Slash, Meteor
  Assault).
