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
python scripts/damage.py --selftest        # 3 prose benchmarks + 16 vs the engine
python scripts/damage.py Basculegion "Wave Crash" Kingambit \
    --engine smogon --atk-ability Adaptability     # the real engine, via Node
python scripts/fetch_smogon_calc.py --check        # has upstream moved?
```

**`damage.py` never disagrees with that engine silently.** Over 909 cases the two
agree on 895 (98.5%); the other 14 are just **four** moves that need a fact
nobody supplied — **Acrobatics** (does the user hold an item?), **Poltergeist**
(does the target?), **Steel Roller** (is there terrain?) and **Payback** (who
moves first?) — and each prints a `CONDITIONAL:` line naming the condition. Note
that Smogon's web calculator **doubles Acrobatics and zeroes Poltergeist by
default**, because an empty item box means "holds nothing" to it; under the Item
Clause every Pokemon holds something, so fill the item in before trusting either. It does NOT model
abilities - the engine has 46 attacker-side and 65 defender-side - so when one is
in play it prints `ABILITY not modelled:` and points at `--engine smogon`. **If
you see either line, the number in front of you is not the final answer.** The
ones that bite hardest in this box: Basculegion's **Adaptability** (STAB 2.0, not
1.5), Mega Aerodactyl's **Tough Claws**, Dragonite's **Multiscale**, Maushold's
**Technician**, Mega Aggron's **Filter**.

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

**`damage.py` never accepts a flag it cannot honour.** Ask for weather, terrain,
an ability, an item, a status, a stat boost, a crit, allies fainted or the
target's current HP, and it routes the question to Smogon's engine and says so on
the line above the answer. `--engine local` refuses instead of silently dropping
it.

**Between-turn chip is modelled, but only once you supply it.** Pass
`--def-item Leftovers --def-status brn` and the KO count comes back as
"guaranteed 2HKO after Leftovers recovery and burn damage". Weather chip, Leech
Seed, poison and its toxic counter and Grassy Terrain all feed the same line. A
bare "2HKO" assumed none of it.

**Payback and Acrobatics are never guessed.** Payback doubles only with
`--moves-last`, because Tailwind, Trick Room, a Choice Scarf and any Speed change
all decide turn order — it is not a species fact. Acrobatics and Poltergeist
depend on items, which by the player's own rule live in `teams.json` and not in a
build, so the calculator states which way it read them instead of picking
silently. **Focus Sash and Sturdy are deliberately NOT modelled** (player,
2026-09-04): they change no damage number, only whether the target ends at 1 HP,
so they have no place in a damage figure — unlike a resist Berry, which really
does halve it.
