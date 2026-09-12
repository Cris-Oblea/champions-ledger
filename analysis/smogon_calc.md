# Smogon's Champions damage calculator — what is in it, and what it changes here

Sources: `https://calc.pokemonshowdown.com/champions.html` (deployed bundle) and
`https://github.com/smogon/damage-calc` (TypeScript source).
Analysed 2026-09-04. Full bundle cached under `data/raw/smogon_calc/`.

**The live site is current.** `calc/src/mechanics/champions.ts` at repo HEAD and
the deployed `champions.js` model exactly the same ability set, and the moves
patch is byte-identical. So everything below holds for both, and every bug in §4
is an upstream bug, not a stale deployment. Champions work in that repo is
tagged `Champions:` in the log — the most recent are Cloud Nine, Barb Barrage,
Battle Armor blocking crits, and the M-B roster update.

`?mode=champions` in the URL does nothing — nothing reads that parameter.
`champions.html` already ships with the Champions radio checked. Champions is a
**mode**, alongside One-vs-One and Random Battles, so clicking another mode
silently leaves Champions and puts you back on gen 9 data.

---

## 1. Why it matters: it is a first-party Champions engine

The calculator is not gen 9 with a skin. Champions is wired in as its own
generation, **gen 0**, with dedicated files:

| File | What it is |
|---|---|
| `calc/mechanics/champions.js` | the damage engine, 780 lines, Champions-only |
| `calc/stats.js` → `calcStatChampions` | the SP stat formula |
| `calc/data/species.js` → `CHAMPIONS_LIST` | the 324-form roster |
| `calc/data/moves.js` → `CHAMPIONS_LIST` + `CHAMPIONS_PATCH` | 513 moves, 31 rebalanced |
| `calc/data/items.js` → `CHAMPIONS` | the 148 held items |
| `js/data/sets/champions.js` | **406 curated sets over 160 Pokemon** |

That makes it a **sixth source**, and the only one that is executable rather
than prose or a table.

---

## 2. Our formula is confirmed, character for character

`calcStatChampions` in `calc/stats.js`:

```js
hp    : base + sp + 75                     // no nature
other : Math.floor(nature * (base + sp + 20))
```

`getBaseDamage` in `calc/mechanics/util.js`:

```js
Math.floor(Math.floor(Math.floor((2*level)/5 + 2) * basePower * attack / defense) / 50 + 2)
```

Both are exactly what `scripts/damage.py` implements, and `level` is hard-forced
to 50 for gen 0. This was reverse-engineered out of pokebase's bundle; it now has
an independent second confirmation.

**Parity test: 909 attacker/move/defender combinations, abilities neutralised on
both sides — 872 identical to the last HP (96%) before this exercise, 892
(98.1%) after the fixes in §5.** No difference was ever a formula error; every
one was a modifier we did not implement, and the 17 that remain are moves whose
power depends on battle context, each of which now prints a warning saying so.

Independent confirmations of rules already in `CLAUDE.md`:

- **SP budget 66, cap 32.** All **406** sets in the sets file sum to exactly 66,
  none exceeds 32. The UI hard-caps each input at `max="32"`. That is 406 more
  spreads on top of the 84 already checked.
- **x0.75 spread modifier in doubles**, `3072/4096`, only for `allAdjacent` and
  `allAdjacentFoes`.
- **Mega Sol works exactly as recorded.** `calculateBaseDamageChampions` reads
  `hasWeather('Sun') || isMegaSol` for the Fire boost, and the rain penalty is
  guarded `hasWeather('Rain') && !isMegaSol`. Fire moves are boosted **even while
  the team's own rain is up**, and Mega Sol suppresses the opposing weather's
  bonus. Verified live: Mega Meganium's Weather Ball hits Kingambit for 230-272
  in rain and 230-272 in no weather — the same number.
- **Weather Ball is 100 BP under Mega Sol, then multiplied again by the sun
  modifier.** Base power doubles first (`bp * (weather || Mega Sol ? 2 : 1)`),
  and the 1.5x lands afterwards in the base-damage step. Two separate steps, as
  suspected.
- **Armor Tail blocks priority moves outright** — Farigiraf returns 0 damage.

One extra Mega Sol effect not in `CLAUDE.md`: as the **attacker**, Mega Sol also
cancels the Sand SpD bonus for Rock types and the Snow Def bonus for Ice types on
the defender (`calculateDefenseChampions`).

---

## 3. It also carries the EV → SP conversion

`js/shared_controls.js` converts an imported mainline set:

```
4 EV -> 1 SP        otherwise  SP = ceil(EV / 8)        (252 EV -> 32 SP)
```

That is the missing bridge for reading any Scarlet/Violet VGC spread as a
Champions one.

---

## 4. Where the calculator is WRONG — do not trust these

### 4.1 Twelve moves are stubs — and that is a WATCHLIST, not a bug

`CHAMPIONS_PATCH` in `moves.js` overrides moves off the SV table, but for twelve
of them the patch **is** the whole record — no type, no category, no contact flag:

```js
'Anchor Shot': { bp: 90 },   'Metal Claw': { isSlicing: true },   ...
```

Affected: **Anchor Shot, Astral Barrage, Blood Moon, Bolt Beak, Dragon Hammer,
Fishious Rend, Gear Grind, Hyper Drill, Metal Claw, Revelation Dance, Snipe Shot,
Triple Dive.**

The player's read, checked and confirmed: **these are moves no Champions Pokemon
can currently learn**, so Smogon recorded the base power and stopped. The split
against our learnsets is exact:

| Group | Learners in Champions | Our `useable` flag |
|---|---|---|
| the 12 stubs | **0 of 12** have any | `False` for all 12 |
| the 12 fully-patched moves in the same list (Apple Acid, Beak Blast, Bone Rush, Fire Lash, First Impression, Grav Apple, Infernal Parade, Mountain Gale, Night Daze, Psyshield Bash, Spirit Shackle, Trop Kick) | **all 12** have one | `True` for all 12 |

Twelve for twelve on both sides. So the calculator is not wrong here, and neither
are we — our `useable` flag reached the same conclusion independently.

**Treat it like the `audit_forms.py` watchlist.** Regulations add Pokemon, and
M-B already added 22 species and 16 Megas. The day a new Pokemon learns one of
these twelve, Smogon fills the entry in and our `useable` flag flips to `True`.
Until then, do not quote the calculator on them, and re-check this list whenever
a regulation lands.

### 4.2 Two Mega abilities were never patched

| Form | Serebii (ours) | Smogon calc |
|---|---|---|
| Mega Hawlucha | **No Guard** | Limber *(the base ability)* |
| Mega Skarmory | **Stalwart** | Keen Eye *(the base ability)* |

Both calc values are the base form's slot-0 ability, i.e. simply not overridden.
Serebii wins per the source hierarchy.

### 4.3 It missed a Champions retype

**Growth is Grass-type in Champions** — Serebii's Champions attackdex links it to
`/attackdex-champions/grass.shtml`. The calc has it as Normal, inherited from SV.
Status move, so no damage consequence, but it shows where the SV inheritance
leaks.

### 4.4 It does not enforce the SP budget

The per-stat cap of 32 is in the HTML. **There is no 66-total guard anywhere.**
You can enter 32 in all six stats and it will happily calculate a 192-SP
Pokemon. Only `python scripts/query.py build` checks the budget.

---

## 5. What this exercise found wrong in OUR toolchain — and fixed

`scripts/damage.py` had the right formula and four modifiers. The engine has the
same formula and a great many more. Everything below was found by running 909
attacker/move/defender combinations through both and diffing, and all of it is
now fixed.

**Before: 872 of 909 identical (96.0%). After: 895 of 909 (98.5%), and all 14
remaining differences print a CONDITIONAL warning naming exactly why.** There is
no longer any case where `damage.py` disagrees with the engine silently.

`python scripts/damage.py --selftest` now checks 20 mechanics against the engine
directly, one per mechanic, on top of the three prose benchmarks it had.

### 5.1 Multi-hit moves were counted as ONE hit

The single biggest error.

```
Mega Aerodactyl Dual Wingbeat -> Sinistcha 32HP/14Def
   before        62-74      (34.8% - 41.6%)   "no OHKO"
   engine       160-192     (89.8% - 107.8%)  30.9% chance to OHKO
```

Off by 2.6x — two hits, and Tough Claws on top. Fixed by parsing the hit count
out of Serebii's own effect text in `build_db.py`, so a move added by a later
regulation is picked up automatically rather than needing a hardcoded list. All
14 multi-hit moves are found, with per-hit base powers identical to Smogon's:

| Move | Hits | BP/hit | Move | Hits | BP/hit |
|---|---|---|---|---|---|
| Bone Rush | 2-5 | **30** (patched up from 25) | Population Bomb | 10 | 20 |
| Bullet Seed | 2-5 | 25 | Rock Blast | 2-5 | 25 |
| Double Hit | 2 | 35 | Scale Shot | 2-5 | 25 |
| Dragon Darts | 2 | 50 | Tail Slap | 2-5 | 25 |
| Dual Wingbeat | 2 | 40 | Triple Axel | 3 | 20 / 40 / 60 |
| Icicle Spear | 2-5 | 25 | Twin Beam | 2 | 40 |
| Pin Missile | 2-5 | 25 | Water Shuriken | 2-5 | 15 |

Two conventions taken from the engine, because guessing differently would put
every 2-5 move out by up to 60%:

- **A 2-5 move is quoted at min+1 hits — three for the whole family.** The 2-hit
  and 5-hit tails are printed underneath, and the 5-hit line is labelled as the
  Skill Link number, since Skill Link forces the maximum.
- **Population Bomb is a flat 10.** Serebii writes "1 to 10 times … the attack
  ends if the user misses", so the 1 is the *miss* case, not a hit count — it
  lands ten times or it stops. Only Population Bomb and Triple Axel carry that
  clause, which is the confirmation the `CLAUDE.md` Skill Link note was missing.

This also confirms the Skill Link arithmetic already recorded: Rock Blast and
Pin Missile are 25 BP a hit, so 5 x 25 = 125.

### 5.2 Psyshock attacked the wrong defence

It is Special but hits the physical **Defense** — `overrideDefensiveStat: 'def'`,
and the **only** move in Champions that splits the two. It is also precisely the
move people point at special walls, so the error ran in the expensive direction.
Fixed, and the SP now goes into the stat the move actually attacks on both sides
of the comparison.

### 5.3 Three moves always crit — a flat x1.5

**Flower Trick** (70 BP), **Frost Breath** (60), **Storm Throw** (60). Detected
from Serebii's "Always a critical hit" text, so it stays current. Froslass Frost
Breath on Dragonite is 232-276, not the 155-184 it used to report.

### 5.4 Four spread moves were not recognised as spread

Serebii spells the target field four different ways for one thing and gets Misty
Explosion outright wrong. Each miss skipped the x0.75 and came out a third too
high. `is_spread()` now normalises the field and overrides the two Serebii
errors, with the engine's `target` as the truth column:

| Move | our `target` field | truth |
|---|---|---|
| Burning Jealousy | `"Opponent's Side"` | allAdjacentFoes |
| Matcha Gotcha | `"All opponents"` | allAdjacentFoes |
| Mortal Spin | `"All Adjacent Opponents"` | allAdjacentFoes |
| **Misty Explosion** | `"Selected Target"` | **allAdjacent** — it hits your own ally |
| Psyshield Bash | `"Ally"` | single-target — the one mislabel in the other direction |

### 5.5 Foul Play assumed the worst possible target

It computed off `stat(target.atk, sp=32, nature=1.1)` — i.e. it assumed every
target was a max-Attack, Adamant Pokemon. Foul Play is aimed at bulky uninvested
Pokemon, which is exactly what that assumption is wrong about; it overstated by
about a third. The target's investment is a parameter now
(`--target-atk-sp`, `--target-atk-nature`), defaulting to none, which is what
the engine does.

### 5.6 Aegislash was calculated with 50 Attack instead of 140

See §6. Stance Change puts it in Blade Forme the moment it uses a damaging move,
so every attacking calculation was wrong by ~2.8x. `find_mon()` now switches it
itself when it is the attacker, and says so in the output.

### 5.7 Screens are 0.667 in doubles, not 0.5

Reflect, Light Screen and Aurora Veil are `2732/4096` in doubles. There was no
screen support at all; `--screen` adds it.

### 5.8 Abilities: named, never guessed

The engine models **46 attacker-side and 65 defender-side** abilities.
Reimplementing those in Python would drift away from the engine the moment
Smogon updates it, so `damage.py` does not try. Instead `caveats()` names any
ability in play that changes a damage number, and points at the engine:

```
$ python scripts/damage.py "Mega Aerodactyl" "Dual Wingbeat" Sinistcha \
      --atk-sp 32 --nature jolly --def-hp-sp 32 --def-sp 14
   ABILITY not modelled: Mega Aerodactyl Tough Claws - x1.3 on contact moves
   ABILITY not modelled: Sinistcha Heatproof - halves Fire
     -> for an exact number run the same query with --engine smogon
   Dual Wingbeat: 2 hits of 62-74
   124-148 damage of 178 HP  =  69.7% - 83.1%   no OHKO

$ ... --engine smogon
   32 Atk Tough Claws Aerodactyl-Mega Dual Wingbeat (2 hits) vs. 32 HP / 14 Def
   Sinistcha: 160-192 (89.8 - 107.8%) -- 30.9% chance to OHKO
```

The abilities in the **player's own box** that this covers:

| Owned | Ability | What it does to the number |
|---|---|---|
| Basculegion | Adaptability | STAB 1.5 -> **2.0**, a flat x1.33 |
| Mega Aerodactyl | Tough Claws | x1.3 on every contact move |
| Sylveon | Pixilate | Normal -> Fairy, x1.2 |
| Maushold | Technician | x1.5 on anything <= 60 BP |
| Kingambit | Supreme Overlord | up to x1.5 as allies faint |
| Meowscarada | Protean | STAB on everything |
| Mega Garchomp | Sand Force | x1.3 Rock/Ground/Steel in sand |
| Staraptor | Reckless | x1.2 on recoil moves |
| Mega Staraptor | Contrary | inverts every stat stage |
| Machamp | Guts | x1.5 Attack when statused |
| Dragonite / Mega Dragonite | Multiscale | **halves** damage at full HP |
| Mega Aggron | Filter | x0.75 against super-effective |
| Sinistcha | Heatproof | halves Fire |
| Jolteon / Raichu / Mega Sceptile | Volt Absorb, Lightning Rod | Electric immunity |
| Eelektross / Mega Eelektross / Rotom-Wash | Levitate, **Eelevate** | Ground immunity |
| Arcanine, Ceruledge, Chandelure | Flash Fire | Fire immunity, then x1.5 Fire |
| Farigiraf | Sap Sipper | Grass immunity |
| Aggron, Archaludon | Sturdy | survives at 1 HP |
| Vivillon, Maushold | Friend Guard | x0.75 on the ally |

Concrete: **Adaptability Basculegion's Wave Crash on Kingambit is 108-128, not
81-96.**

Champions-only abilities worth knowing exist: **Mega Sol** (Meganium),
**Eelevate** (Mega Eelektross), **Dragonize** (Mega Feraligatr, Normal ->
Dragon, x1.2 — worth **x3.6** on Giga Impact), **Fire Mane** (Mega Pyroar,
x1.5 Fire), **Piercing Drill** (breaks Protect on contact).

### 5.9 The spread modifier when only ONE target is left

Neither engine models this, it is worth 33%, and the player has confirmed it.

`calculateBaseDamageChampions` decides the x0.75 from the MOVE's target type and
the game type — `field.gameType !== 'Singles' && ['allAdjacent',
'allAdjacentFoes'].includes(move.target)`. It has no idea how many Pokemon are
actually on the field. Bulbapedia states the real rule: the multiplier applies
"if the move has more than one target **when the move is executed** (provided
there is more than one such target when the move is executed, regardless of
whether the move actually hits or can hit all the targets)". One opponent left,
no x0.75.

```
Garchomp Earthquake -> Kingambit 20HP/12Def
   two targets      102-120   (52.3% - 61.5%)
   one target left  134-162   (68.7% - 83.1%)     --single-target
```

**Confirmed in game by the player, 2026-09-04**, which settles it: both
opponents alive when Earthquake goes off, 75% each; only one left, back to 100%.
Serebii and champsdex both describe the x0.75 without covering the one-target
case, so this is the player's observation standing on its own — and per the
source hierarchy it outranks them.

One sub-case is still open: both alive when you PICK the move, but your partner
KOes one before yours resolves. The main-series wording ("more than one target
when the move is executed") implies full power, but nothing confirms it here.

`--single-target` cannot be combined with `--screen` on the engine path, because
gameType is its only lever for the spread modifier and it would switch screens to
their singles value at the same time.

### 5.10 Conditional base powers are flagged, not silently ignored

A move whose power depends on battle context cannot be answered from a species
row alone. Rather than return a wrong number, `caveats()` names the condition:

```
CONDITIONAL: Acrobatics - x2 base power when the user holds no item
CONDITIONAL: Weather Ball - type AND base power depend on the weather - 100 BP
             of the weather's type, never the Normal 50 printed here
```

Covered: Acrobatics, Payback, Hex, Infernal Parade, Barb Barrage, Facade,
Venoshock, Lash Out, Smelling Salts, Knock Off, Poltergeist, Steel Roller,
Electro Ball, Gyro Ball, Eruption, Water Spout, Flail, Reversal, Hard Press,
Stored Power, Power Trip, Punishment, Weather Ball, Terrain Pulse, Raging Bull,
Brick Break, Psychic Fangs.

Across the whole 909-case sweep only **four** moves ever actually diverge, and
each needs a fact nobody supplied: **Acrobatics** (8 cases — does the user hold
an item?), **Poltergeist** (4 — does the target?), **Steel Roller** (1 — is
there terrain?) and **Payback** (1 — who moves first?).

Two traps in that list are worth stating on their own, because the two engines
default in opposite directions and both defaults are defensible:

- **Smogon's calculator doubles Acrobatics unless you fill in an item.** An
  empty item box means "holds nothing" to it. On a Champions team every Pokemon
  holds something (Item Clause), so the web calculator's default is the rarer
  case, not the common one.
- **It returns 0 for Poltergeist for the same reason.** In a real game the
  target essentially always holds an item, so 0 is the artifact and our number
  is the practical one.

### 5.11 Two moves take their type from the user's form

**Raging Bull** and **Aura Wheel** are filed as Normal in the move row, and
Serebii says why in the effect text — "This move's type depends on the user's
form" — without saying what the type becomes. Unlike Weather Ball this needs no
battle state at all: the attacker's name settles it, so it is now resolved
rather than warned about.

| User | Raging Bull | | User | Aura Wheel |
|---|---|---|---|---|
| Tauros-Paldea Combat | Fighting | | Morpeko | Electric |
| Tauros-Paldea Blaze | Fire | | Morpeko-Hangry | Dark |
| Tauros-Paldea Aqua | Water | | | |

Tauros-Paldea Blaze's Raging Bull on Kingambit is **120-144**, not the 20-24 a
Normal move would do into a Steel type — a factor of six, and the single largest
type error the sweep found.

**Meteor Beam and Electro Shot** are the other pair that used to be filed under
"conditional" and are not: they raise the user's Sp. Atk by one stage on the
charging turn, so by the time they land the x1.5 is always there. It is applied
now. Contrary is the one exception — it would invert the boost to −1 — and that
case prints a warning instead of guessing.

---

## 6. Forms the database was missing

Species data agrees almost perfectly: **318 shared forms compared, 0 stat, type
or ability disagreements** apart from §4.2. But three real in-battle stat lines
were absent, because `norm()` collapses their names into the base **on purpose** —
pokebase writes "Aegislash (Blade)" for what a teamlist just calls "Aegislash",
so separating them would break every usage join.

The fix keeps `norm()` untouched and records the spreads on the base row, in a
new `battle_forms` field parsed from the `<h2>Stats - …</h2>` blocks Serebii
already publishes:

| Form | Spread | Why it matters |
|---|---|---|
| **Aegislash-Blade** | 60/**140**/50/**140**/50/60 | Stance Change flips on attacking, so this is its real attacking stat line — 140, not 50 |
| **Palafin-Hero** | 100/**160**/97/106/87/100 | base is 100/70/72/53/62/100 |
| **Gourgeist** Small / Large / Jumbo | HP, Atk and Speed all move | three distinct spreads |

Reached by name — `damage.py "Palafin-Hero" …`, `"Gourgeist-Jumbo"` — and
Aegislash switches itself when it attacks. The parser filters on the spread
itself, so the regional forms Serebii repeats in the same block shape ("Stats -
Alolan Raichu") are not duplicated: 308 rows before, 308 after, no join changed.

**Castform is NOT a gap** — corrected by the player, 2026-09-04. It has no
separate forms to store: **Forecast retypes it live from the weather**, and the
engine does exactly that in `checkForecast` (Sun -> Fire, Rain -> Water,
Snow/Hail -> Ice, otherwise Normal). Nothing is missing on our side either; the
type is a function of the field, not a row in a table.

## 7. One name that will not join

Serebii spells it **`Compoundeyes`**, Smogon spells it **`Compound Eyes`**.
`key()` keeps spaces, so the two never meet. It is the only mismatch in 200
abilities, and there is none at all in 148 held items (our 181 items = these 148
plus 33 Encounter tickets and coupons, which are not held items).

---

## 8. The sets file is a genuine new source

`js/data/sets/champions.js` — **406 sets over 160 Pokemon**, format-tagged:
158 BSS, 141 OU, **107 VGC**. The VGC ones split into 75 curated and the rest
auto-generated "Showdown Usage" from ladder data.

We already hold written analyses for 53 Pokemon. What is genuinely new:

- **Milotic** — the only curated VGC set for a Pokemon with no analysis of ours.
  Competitive @ Leftovers, Modest, 32 HP / 13 Def / 9 SpA / 1 SpD / 11 Spe,
  Muddy Water / Coil / Hypnosis / Protect.
- **Mega Camerupt** — Sheer Force @ Cameruptite, **Quiet**, 32 HP / 32 SpA /
  2 SpD, Earth Power / Heat Wave / Ancient Power / Protect. Ladder-derived, and
  it matches the Trick Room spread principle exactly: Quiet, zero Speed SP.
- Ladder sets for owned Pokemon with no analysis: **Chandelure** (Flash Fire @
  Focus Sash, Quiet, Trick Room / Heat Wave / Shadow Ball / Protect),
  **Meowscarada**, **Samurott-Hisui**.
- Mega forms indexed under their own names (`Mawile-Mega`, `Staraptor-Mega`,
  `Floette-Mega`…), which suits the "judge a Pokemon on its Mega line" rule.

Nothing for **Heracross** or **Chesnaught** — no set at any format.

---

## 9. The item tables, resolved against the Champions pool

Two switch tables in `calc/src/items.ts`, intersected with the 148 held items
Champions actually has. Both come out **exactly one item per type, all 18 types**
— which matters under the Item Clause, because a team of 6 can field at most six
of these 36 in total.

**Type boosters — x1.2, applied to BASE POWER** (before the roll, not after; the
distinction is worth a point or two on a survival benchmark):

| Type | Item | | Type | Item | | Type | Item |
|---|---|---|---|---|---|---|---|
| Bug | Silver Powder | | Fighting | Black Belt | | Normal | Silk Scarf |
| Dark | Black Glasses | | Fire | Charcoal | | Poison | Poison Barb |
| Dragon | Dragon Fang | | Flying | Sharp Beak | | Psychic | Twisted Spoon |
| Electric | Magnet | | Ghost | Spell Tag | | Rock | Hard Stone |
| Fairy | Fairy Feather | | Grass | Miracle Seed | | Steel | Metal Coat |
| Ground | Soft Sand | | Ice | Never-Melt Ice | | Water | Mystic Water |

None of the Plates, Incenses or Bows are in Champions.

**Resist berries — halve one super-effective hit, consumed on use:**

| Type | Berry | | Type | Berry | | Type | Berry |
|---|---|---|---|---|---|---|---|
| Bug | Tanga | | Fighting | Chople | | Normal | **Chilan** |
| Dark | Colbur | | Fire | Occa | | Poison | Kebia |
| Dragon | Haban | | Flying | Coba | | Psychic | Payapa |
| Electric | Wacan | | Ghost | Kasib | | Rock | Charti |
| Fairy | Roseli | | Grass | Rindo | | Steel | Babiri |
| Ground | Shuca | | Ice | Yache | | Water | Passho |

Two mechanics attached to these, both in `calculateFinalModsChampions`:

- **Chilan Berry is the exception**: every other berry needs the hit to be
  super-effective; Chilan halves **any** Normal move, neutral included.
- **Unnerve turns every one of them off.** Aerodactyl and Tyranitar hold
  Unnerve, so their attacks ignore a resist berry entirely — and per the Mega
  Evolution timing rule, Aerodactyl still has Unnerve on the turn it Mega
  Evolves, because the switch-in resolves first.
- Ripen (not in the box) quarters instead of halving.

The only other damage-relevant items: **Life Orb** x1.3 on final damage,
**Expert Belt** x1.2 but only on super-effective, **Muscle Band** / **Wise
Glasses** x1.1 to base power on physical / special, **Light Ball** x2 Attack on
Pikachu only, **Metronome** ramping x1.2 per consecutive use to a x2 cap.

---

## 10. How to drive it locally

The bundle is CommonJS and runs under Node with no install:

```bash
cd data/raw/smogon_calc
node -e "
const {Generations}=require('./calc/data/index.js');
const {Pokemon}=require('./calc/pokemon.js');
const {Move}=require('./calc/move.js');
const {Field}=require('./calc/field.js');
const {calculateChampions}=require('./calc/mechanics/champions.js');
const gen=Generations.get(0);
const a=new Pokemon(gen,'Basculegion',{nature:'Adamant',evs:{atk:32},ability:'Adaptability'});
const d=new Pokemon(gen,'Kingambit',{evs:{hp:20,def:12}});
console.log(calculateChampions(gen,a,d,new Move(gen,'Wave Crash',{}),new Field({gameType:'Doubles'})).desc());
"
```

`evs` is the SP field. Level is forced to 50. `gameType:'Doubles'` is **not** the
default — leave it out and every spread move loses its x0.75.
