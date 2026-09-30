# The damage calculator

## Damage and stats ARE computable — use the calculator

`scripts/damage.py` implements the real formula. Two things it settles that were
previously guessed at:

```
stat = floor((base + clamp(SP,0,32) + (75 if HP else 20)) * nature)
base damage = floor(floor(floor(2*L/5+2) * power * A / D) / 50) + 2   at LEVEL 50
```

The stat line reproduces all **504** numbers in `data/meta/speed_tiers.json`, and
`python scripts/damage.py --selftest` checks the damage line against the survival
benchmarks Smogon states in prose — two of which it hits by a single HP. Run the
selftest after touching it; if those stop passing the formula is wrong.

Source: pokebase.app publishes a damage calculator at
`pokebase.app/pokemon-champions/damage-calc` that bundles `@smogon/calc` driven
with Champions data. The formula was read out of that bundle, cached under
`data/raw/pokebase_calc/`.

**Champions is doubles, so a move with more than one target takes the x0.75
spread modifier.** Forgetting it overstates every spread move by a third.

Never assert that something survives or dies without running this. A type
multiplier alone is not an answer: Explosion OHKOes bulky neutral targets
through x1 but leaves Kingambit at 60% of its HP through x0.5.

**Smogon publishes its own Champions engine, and it is vendored here.** Champions
is generation 0 in `@smogon/calc`, with its own mechanics file, roster, move
table and 406 sets. It confirms our stat and damage formulas character for
character, and it is the fifth source. Full write-up in
`analysis/smogon_calc.md`; bundle in `data/raw/smogon_calc/`.

```bash
python scripts/damage.py --selftest        # Smogon's prose benchmarks + one guard per rule
python scripts/damage.py Basculegion "Wave Crash" Kingambit --atk-ability Adaptability
python scripts/fetch_smogon_calc.py --check        # has upstream moved?
```

**`damage.py` is that engine, and nothing else** (player, 2026-09-30: "deja
solo smogon"). It used to carry a Python port of the formula too, checked
against the engine case by case, and the port was the default. It modelled no
abilities, and it calculated every move whose power is not a number as a 1 BP
hit - Serebii writes "1" for all of them - so Seismic Toss read "1-2 damage, no
OHKO" with no warning (it is 50). The app and the terminal now run the same
code, so they cannot disagree.

**A move that needs a fact beyond the two Pokemon is never guessed** (player,
2026-09-30: "para calcular cada uno de ellos debería haber datos adicionales").
`NEEDS` in `damage.py` refuses these until the flag is given:

| Move | Needs | Why |
|---|---|---|
| Fling | `--atk-item` | its power is the held item's Fling power |
| Acrobatics | `--atk-item` (or `none`) | doubles only with no item, and the Item Clause means everyone holds one |
| Poltergeist | `--def-item` (or `none`) | fails if the target holds nothing |
| Steel Roller | `--terrain` | fails without terrain |
| Gyro Ball, Electro Ball | `--atk-spe-sp`, `--def-spe-sp` | power from the two Speed stats |
| Payback | `--atk-spe-sp`, `--def-spe-sp` | doubles when moving last, read off Speed - Trick Room, Tailwind and priority are invisible to the engine |

`NOT_A_CALC` refuses outright, with a sentence saying what the move does:
**Super Fang** (half the target's CURRENT HP, whatever the stats), **Beat Up**
(one hit per healthy party member - the engine has no party), **Counter,
Mirror Coat, Metal Burst, Comeuppance** (return damage taken), **Endeavor**,
**Spit Up** and the four **OHKO** moves. Seismic Toss and Night Shade are the
user's level (50), and the engine answers them. Reversal, Flail, Eruption and
Hard Press read current HP: `--atk-hp` / `--target-hp`, full HP if not given.

Three things that used to be silently wrong and are now handled, worth knowing
because they change KO counts rather than percentages:

- **Multi-hit moves.** A 2-5 move is quoted at **three hits** (Skill Link forces
  five, and that line is printed too); Population Bomb is a flat **10**, because
  Serebii's "1 to 10 times … ends if the user misses" makes the 1 a miss, not a
  hit count. Mega Aerodactyl's Dual Wingbeat went from "no OHKO" to a 31% OHKO.
- **Aegislash attacks as Blade Forme** - 140 Attack, not the Shield spread's 50.
  `damage.py` switches it automatically; `battle_forms` also carries
  `Palafin-Hero` and the three `Gourgeist` sizes, reachable by name.
- **Psyshock is Special but hits the physical Defense**, the only move in
  Champions that splits the two.
- **Raging Bull and Aura Wheel take their type from the user's FORM**, and the
  move row says Normal — the same trap as Weather Ball, but with no battle state
  involved, so the attacker's name settles it. Raging Bull is Fighting on
  Tauros-Paldea Combat, **Fire** on Blaze, Water on Aqua; Aura Wheel is Electric
  on Morpeko and Dark on Morpeko-Hangry. Read as Normal, Blaze's Raging Bull on
  Kingambit calculates as 20-24; it is really **120-144**. Resolved automatically
  now, but never quote the type column for these two.
- **Meteor Beam and Electro Shot always land with +1 Sp. Atk** (x1.5) because
  they raise it on the charging turn. Not a condition — it is part of the move.

**Champions has no Terastallization.** Zero Tera items in the 148-item pool, and
both Tera Blast and Tera Starstorm are `useable: False` with no learner. Never
reason about a Tera type, and ignore any Tera advice carried over from VGC
material written for Scarlet/Violet.

**A set may hold fewer than four moves, and sometimes must (player, 2026-09-04).**
Last Resort "fails unless the user has already used all the other moves it
knows", so every extra slot delays it. Kangaskhan with just **Fake Out + Last
Resort** has it live on turn 2 at 140 BP — and Kangaskhan is the only Pokemon in
Champions that learns both. The player runs it **base with Scrappy, not Mega**:
Scrappy is what lets a Normal move touch Ghosts, turning Sinistcha, Basculegion
and Froslass into 2HKOs. Steel still walls it — Kingambit and Gholdengo are
4HKOs. So never pad a moveset to four for the sake of it, and never call a
two-move set unfinished. `query.py build` does not assume four either.

**Between-turn chip is modelled, but only once you supply it.** Pass
`--def-item Leftovers --def-status brn` and the KO count comes back as
"guaranteed 2HKO after Leftovers recovery and burn damage". Weather chip, Leech
Seed, poison and its toxic counter and Grassy Terrain all feed the same line. A
bare "2HKO" assumed none of it.

**Focus Sash and Sturdy are deliberately NOT modelled** (player,
2026-09-04): they change no damage number, only whether the target ends at 1 HP,
so they have no place in a damage figure — unlike a resist Berry, which really
does halve it.
