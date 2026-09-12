# Regulation M-C — LIVE and loaded into the database (2026-09-09)

**Status: LIVE.** M-C opened **September 9, 2026** and runs to **December 2,
2026**. The database was refreshed the same day and every number below now comes
from our own `data/db/`, not from the web.

Everything legal in M-A and M-B stays legal. **No rule changes at all** —
doubles, bring 6 / pick 4, Species Clause, Item Clause, one Mega Evolution per
battle, 66 SP / 32 cap. Champions still has no Terastallization (Tera Blast and
Tera Starstorm remain `useable: False`, zero Tera items in the pool).

## What the refresh actually changed

| | before (M-B) | after (M-C) | delta |
|---|---|---|---|
| Pokemon forms | 308 | **340** | +32 |
| — of them Mega | 75 | **81** | +6 |
| Moves useable in Champions | 499 | **514** | +15 |
| Items | 181 | **199** | +18 |
| Abilities | 200 | **215** | +15 |
| Learnsets | 231 | **256** | +25 |

The +32 forms are **23 new base species**, **3 extra forms** of them
(Indeedee-Female, Persian-Alola, Toxtricity-L) and the **6 new Megas**. The
official announcement said "24 new Pokemon"; Serebii's dex yields 23 base
species, and the 24th is presumably one of those three alternate forms counted
separately. Not worth resolving — the dex is what the game enforces.

**No existing move was rebalanced.** A line-by-line diff of Serebii's Champions
move list before and after the drop shows only additions; every base power,
accuracy and PP already in the database is unchanged. Movepools did move,
though — see the Slash section below.

## The 23 new species

| Species | Type | HP | Atk | Def | SpA | SpD | Spe | BST | Abilities |
|---|---|---|---|---|---|---|---|---|---|
| Arboliva | Grass/Normal | 78 | 69 | 90 | 125 | 109 | **39** | 510 | Seed Sower, Harvest |
| Baxcalibur | Dragon/Ice | 115 | 145 | 92 | 75 | 86 | 87 | 600 | Thermal Exchange, Ice Body |
| Cinderace | Fire | 80 | 116 | 75 | 65 | 75 | 119 | 530 | Blaze, Libero |
| Farfetch'd | Normal/Flying | 52 | 90 | 55 | 58 | 62 | 60 | 377 | Keen Eye, Inner Focus, Defiant |
| Gogoat | Grass | 123 | 100 | 62 | 97 | 81 | 68 | 531 | Sap Sipper, Grass Pelt |
| **Golisopod** | Bug/Water | 75 | 125 | 140 | 60 | 90 | **40** | 530 | Emergency Exit |
| Grapploct | Fighting | 80 | 118 | 90 | 70 | 80 | **42** | 480 | Limber, Technician |
| Indeedee | Psychic/Normal | 60 | 65 | 55 | 105 | 95 | 95 | 475 | Inner Focus, Synchronize, Psychic Surge |
| Indeedee-Female | Psychic/Normal | 70 | 55 | 65 | 95 | 105 | 85 | 475 | Inner Focus, Synchronize, Psychic Surge, Own Tempo |
| Inteleon | Water | 70 | 85 | 65 | 125 | 65 | 120 | 530 | Torrent, Sniper |
| Mabosstiff | Dark | 80 | 120 | 90 | 60 | 70 | 85 | 505 | Intimidate, **Guard Dog**, Stakeout |
| Mr. Mime | Psychic/Fairy | 40 | 45 | 65 | 100 | 120 | 90 | 460 | Soundproof, Filter, Technician |
| Pawmot | Electric/Fighting | 70 | 115 | 70 | 70 | 60 | 105 | 490 | Volt Absorb, Natural Cure, Iron Fist |
| Perrserker | Steel | 70 | 110 | 100 | 50 | 60 | **50** | 440 | Battle Armor, Tough Claws, Steely Spirit |
| Persian | Normal | 65 | 70 | 60 | 65 | 65 | 115 | 440 | Limber, Technician, Unnerve |
| Persian-Alola | Dark | 65 | 60 | 60 | 75 | 65 | 115 | 440 | Fur Coat, Technician, Rattled |
| **Pincurchin** | Electric | 48 | 101 | 95 | 91 | 85 | **15** | 435 | Lightning Rod, **Electric Surge** |
| Rillaboom | Grass | 100 | 125 | 90 | 60 | 70 | 85 | 530 | Overgrow, **Grassy Surge** |
| Salamence | Dragon/Flying | 95 | 135 | 80 | 110 | 80 | 100 | 600 | Intimidate, Moxie |
| Sirfetch'd | Fighting | 62 | 135 | 95 | 68 | 82 | 65 | 507 | Steadfast, Scrappy |
| Squawkabilly | Normal/Flying | 82 | 96 | 51 | 45 | 51 | 92 | 417 | Intimidate, Hustle, Guts |
| Swalot | Poison | 100 | 73 | 83 | 73 | 83 | 55 | 467 | Liquid Ooze, Sticky Hold, Gluttony |
| Thievul | Dark | 70 | 58 | 58 | 87 | 92 | 90 | 455 | Run Away, Unburden, Stakeout |
| Toxtricity | Electric/Poison | 75 | 98 | 70 | 114 | 70 | 75 | 502 | Punk Rock, Plus, Technician |
| Toxtricity-L | Electric/Poison | 75 | 98 | 70 | 114 | 70 | 75 | 502 | Punk Rock, **Minus**, Technician |
| Wigglytuff | Normal/Fairy | 140 | 70 | 45 | 85 | 50 | 45 | 435 | Cute Charm, Competitive, Frisk |

Toxtricity's two forms differ **only in the ability** (Plus vs Minus); stats and
typing are identical.

## The six new Megas — three are SECOND Megas

Absol, Lucario and Garchomp already had a Mega. The `Z` suffix marks a *second*
Mega on the same species, the Charizard X/Y pattern, each needing its own stone.
**All predictions from the pre-launch bundle were confirmed exactly** — stats,
typings and, where Serebii had published them, abilities.

| Mega | Type | HP | Atk | Def | SpA | SpD | Spe | BST | Ability | Stone |
|---|---|---|---|---|---|---|---|---|---|---|
| **Mega Garchomp Z** | **Dragon** | 108 | 130 | 85 | **141** | 85 | **151** | 700 | **Levitate** | Garchompite Z |
| **Mega Absol Z** | **Dark/Ghost** | 65 | 154 | 60 | 75 | 60 | **151** | 565 | **Sharpness** | Absolite Z |
| **Mega Lucario Z** | Fighting/Steel | 70 | 100 | 70 | **164** | 70 | **151** | 625 | **Aura Guard** | Lucarionite Z |
| Mega Salamence | Dragon/Flying | 95 | 145 | 130 | 120 | 90 | 120 | 700 | **Aerilate** | Salamencite |
| Mega Golisopod | **Bug/Steel** | 75 | 150 | **175** | 70 | 120 | **40** | 630 | **Tough Claws** | Golisopite |
| Mega Baxcalibur | Dragon/Ice | 115 | 175 | 117 | 105 | 101 | 87 | 700 | **Thermal Exchange** | Baxcalibrite |

All three Z Megas sit at exactly **Speed 151** — the signature of the line: it
trades raw Attack for extreme Speed and a Special bias.

**The ability conflict is settled, and Serebii won.** The vendored `@smogon/calc`
bundle listed the Z Megas with their *old* abilities (Magic Bounce, Sand Force,
Adaptability). Serebii gives Sharpness, Levitate and Aura Guard, and the live
Champions dex agrees. The three abilities that were unpublished before launch are
now known: **Aerilate**, **Tough Claws**, **Thermal Exchange**.

### The Z Megas against the Megas those species already had

| | Old Mega | New Z Mega |
|---|---|---|
| **Garchomp** | Dragon/**Ground**, 170 Atk / 120 SpA / **92 Spe**, Sand Force | **Dragon**, 130 Atk / **141 SpA** / **151 Spe**, Levitate |
| **Absol** | **Dark**, 150 Atk / 115 SpA / 115 Spe, Magic Bounce | **Dark/Ghost**, 154 Atk / 75 SpA / **151 Spe**, Sharpness |
| **Lucario** | Fighting/Steel, 145 Atk / 140 SpA / 112 Spe, Adaptability | 100 Atk / **164 SpA** / **151 Spe**, Aura Guard |

Mega Garchomp Z is not an upgrade, it is a **different Pokemon**: a fast special
attacker where the old one was a slow physical one, and pure Dragon drops the Ice
weakness from x4 to x2 while Levitate adds a Ground immunity. It gives up the
Electric immunity that came with Ground.

**Aura Guard is a genuinely new ability**: "Reduces the amount of damage received
by moves that make physical contact by 50%."

## Terrain arrives as a real mechanic

Terrain was **not** absent before M-C: the four terrain moves were already
useable, and **Mega Raichu X** already had Electric Surge. What M-C does is turn
a one-Pokemon curiosity into a mechanic with a support cast — the ability setters
go from one to four, and the terrain items did not exist at all until now.

- **New setters:** **Grassy Surge** (Rillaboom), **Psychic Surge** (Indeedee,
  both forms), **Electric Surge** (Pincurchin — the second holder, after Mega
  Raichu X), plus **Seed Sower** (Arboliva, sets Grassy Terrain when hit).
  There is still **no Misty Surge** in Champions.
- **New items, all six of them M-C:** **Terrain Extender**, and the four terrain
  **Seeds** — Grassy, Electric, Misty, Psychic — each a one-shot stat boost that
  fires when its terrain is up. Misty Seed is in the pool even though nothing
  sets Misty Terrain by ability; the *move* Misty Terrain is useable.
- **Grass Pelt** (Gogoat) — +50% Defense while Grassy Terrain is up.

Note for damage work: `damage.py` cannot model terrain locally and routes any
`--terrain` question to Smogon's engine. **Psychic Terrain blocks priority
moves** against grounded targets, which interacts directly with
`query.py counter-priority`.

## The 18 new items

**Six Mega Stones**, all 2000 VP from the Shop: Absolite Z, Baxcalibrite,
Garchompite Z, Golisopite, Lucarionite Z, Salamencite.

**Twelve held items**, and several are format-relevant rather than filler:

| Item | Effect |
|---|---|
| **Rocky Helmet** | Damages any attacker making direct contact |
| **Air Balloon** | Holder floats — Ground immunity until it is hit |
| **Eject Button** | Holder switches out when damaged |
| **Red Card** | Forces the *attacker* out when the holder is damaged |
| **Terrain Extender** | Extends terrain the holder sets |
| **Grassy / Electric / Misty / Psychic Seed** | One-shot boost when that terrain is up |
| **Normal Gem** | One-shot boost to a Normal move |
| **Binding Band** | Boosts binding-move damage |
| **Leek** | Farfetch'd / Sirfetch'd only — crit-rate boost |

Under the **Item Clause** these are team-level decisions, not build fields — the
usual rule applies, and they belong in `inventory/teams.json`.

## 15 newly useable moves

M-C rebalanced no move's numbers. What it did was give 15 already-known moves
their first Champions learner, which flips `useable` to true.

| Move | Type | BP | Acc | PP | Learner |
|---|---|---|---|---|---|
| Pyro Ball | Fire | 120 | 90 | 8 | Cinderace |
| Court Change | Normal | — | 100 | 12 | Cinderace |
| Meteor Assault | Fighting | 150 | 100 | 8 | Sirfetch'd |
| Glaive Rush | Dragon | 120 | 100 | 8 | Baxcalibur |
| Double Shock | Electric | 120 | — | — | Pawmot |
| Revival Blessing | Normal | — | — | — | Pawmot |
| Drum Beating | Grass | 80 | 100 | 12 | Rillaboom |
| Snipe Shot | Water | 85 | 100 | 16 | Inteleon |
| Jaw Lock | Dark | 80 | 100 | 12 | Mabosstiff |
| Zing Zap | Electric | 80 | 100 | 12 | Pincurchin |
| Octolock | Fighting | — | 100 | 16 | Grapploct |
| Shift Gear | Steel | — | 101 | 12 | Toxtricity |
| Milk Drink | Normal | — | 101 | 8 | Gogoat |
| Slash | Normal | 80 | 100 | 20 | 36 Pokemon, incl. Absol, Aegislash, Archaludon |
| Octazooka | Water | 65 | 85 | 12 | **none** |

## M-C also changed the movepools of Pokemon already in the format

Fourteen of the fifteen moves above are new species arriving with their own
moves. **Slash is different**: it was added to **29 Pokemon that were already
legal**, and that is the only such change in the whole regulation. A full diff of
all 231 pre-existing learnsets found exactly two edits:

- **+ Slash on 29 existing Pokemon** — Absol, Aegislash, Archaludon, Banette,
  Barbaracle, Beartic, Blaziken, Charizard, Excadrill, Feraligatr, Gallade,
  Garchomp, Gliscor, Kingambit, Kleavor, Liepard, Malamar, Meowscarada, Mimikyu,
  Pangoro, Pinsir, Samurott, Samurott-Hisui, Sceptile, Scizor, Sharpedo,
  Skarmory, Sneasler, Weavile. In Champions Slash is **80 BP / 100 acc / 20 PP
  with a +1 crit-ratio stage** — not the 70 BP of the console games.
  **The player owns 7 of them:** Archaludon, Garchomp, Kingambit, Meowscarada,
  Samurott-Hisui, Sceptile, Sneasler.
- **− Archaludon lost Metal Burst and Mirror Coat.** The only removal in M-C, and
  it lands on a Pokemon the player owns. Both were its counter-attack options.

**Snipe Shot is the move watchlist firing exactly as designed.** It was one of
the twelve stubs in Smogon's calculator that carried a base power and nothing
else because no Champions Pokemon learned it. Inteleon arrived and it filled in.
Eleven stubs remain: Anchor Shot, Astral Barrage, Blood Moon, Bolt Beak, Dragon
Hammer, Fishious Rend, Gear Grind, Hyper Drill, Metal Claw, Revelation Dance,
Triple Dive.

**Two upstream gaps, worth re-checking later.** Serebii's own attackdex pages for
**Double Shock** and **Revival Blessing** have the PP and accuracy cells empty —
only base power is filled — so the database correctly stores `null` there. They
are also missing from Serebii's summary move list. **Octazooka** is flagged
useable but no Champions Pokemon learns it (Octillery is still not legal).

## Source state on launch day — they did not move together

The player called this correctly before the data did.

| Source | State |
|---|---|
| **Serebii** | **Fully updated.** Every species, Mega, item, ability and move above came from here. |
| **pokebase** | **Dex fully updated** — carries the M-C roster with an explicit `regulationSets: M-C` tag per entry, plus stone unlock costs. **Usage is empty**, because the ladder only opened today. |
| **Smogon (calc)** | **Partially updated.** The bundle moved and now carries the three Z Megas in its Champions roster, but **not the four new species or their Megas**. |
| **Smogon (dump-basics)** | **Not updated** — still 323 Pokemon / 500 moves / 151 items / 201 abilities. |
| **Pikalytics** | **Not updated** — still stamped 2026-05. |

Consequence for damage work: `--engine smogon` works for the Z Megas but
**fails on Baxcalibur, Salamence, Golisopod, Rillaboom and the rest**
("Smogon's Champions roster has no ..."). Our own `damage.py` handles them from
our database, which is why the local engine matters. Re-run
`python scripts/fetch_smogon_calc.py --check` in a few days.

**Cross-validation done:** all **340** of our dex forms match a pokebase entry,
and every Pokemon pokebase tags as Champions-legal is present in our dex. Zero
unmatched in either direction.

## Why this matters to this player specifically

- **They own Garchomp and Garchompite already.** Mega Garchomp Z is a second,
  differently-typed line on a Pokemon in the box — but it needs **Garchompite
  Z**, a *different* stone at 2000 VP, not owned. `query.py owned` now prints
  both Mega lines and the stone status of each, separately.
- **Baxcalibur answers the Mega Chesnaught team's Garchomp hole.** Confirmed with
  the calculator, not from type theory: `Baxcalibur Icicle Crash -> Garchomp` is
  **336-396 of 183 HP, a guaranteed OHKO** (Ice x4 on Dragon/Ground).
  **But its Speed is 87**, which is fast, not slow — it does **not** fit a Trick
  Room team. Golisopod (**40**), Grapploct (42), Arboliva (39) and Pincurchin
  (**15**) are the Trick Room-shaped arrivals.
- **Two more Intimidate punishers exist now.** **Guard Dog** (Mabosstiff) raises
  Attack when intimidated, and **Rattled** (Persian-Alola) raises Speed. That
  strengthens the player's standing rule against carrying their own Intimidate —
  the list of abilities that turn it into a gift is now Defiant, Competitive,
  Contrary, Guard Dog and Rattled.
- **None of the 23 new species is in the box.** They are Encounter-gacha luck or
  a Pokemon GO → HOME transfer; the six new stones are dead weight until the
  matching species actually arrives. The one exception is Garchompite Z, which is
  live immediately.

## How this was refreshed

`fetch_serebii.py` skips anything already cached, so a regulation drop needs the
static pages, the Pokedex pages and the **attackdex pages** forced — the
attackdex is where form data and learnsets come from, so stale move pages would
have silently omitted every new Pokemon from the learnsets.

```bash
python scripts/fetch_serebii.py list        # forced already
rm data/raw/pages/*.html                    # then re-run `pages`
# pokedex + attackdex re-fetched with force=True (231 and 901 pages)
python scripts/build_db.py
python scripts/fetch_pokebase.py --force
python scripts/fetch_smogon_calc.py
python scripts/audit_forms.py && python scripts/test_norm.py
python scripts/damage.py --selftest
```
