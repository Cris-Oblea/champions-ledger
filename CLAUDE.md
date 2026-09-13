# Working notes for Claude

## The one rule that matters

This project is about **Pokemon Champions and nothing else**. Champions is a
standalone battle game with its own regulation: a restricted roster, a reduced
item pool, and **rebalanced moves** — base power, PP and secondary effects
differ from Scarlet/Violet and every other entry.

So: never answer from general Pokemon knowledge. Numbers from the console games
are wrong here often enough to matter (e.g. in Champions, Body Slam is 16 PP,
Aerial Ace is 60 BP with 101 accuracy). Always read `data/db/` or `data/meta/`.

**PP is rescaled globally, so never read a PP difference as a rebalance.**
Of the **514** useable moves, **511** carry one of only **four** PP values — 8,
12, 16 or 20 (verified 2026-09-09: 90 / 189 / 102 / 130). The three exceptions
are Struggle (1) and two M-C arrivals whose PP Serebii has not filled in yet,
Double Shock and Revival Blessing, stored as `null`. The player's reading, and it
fits: it is as if every move had been fully PP-Upped, then capped. A move at 8 PP
here can be 5 in the console games without anything having been changed about it.
Base power, accuracy and effects ARE rebalanced; compare those instead.
If something is not in the database, say so and fetch it — do not fill the gap
from memory.

Format is **VGC**: doubles, bring 6 / pick 4. VGC is doubles by definition, so
there is no "VGC singles". Singles ladders (OU, Battle Stadium Singles) never
reach official tournaments and are filtered out of the Smogon data on purpose —
do not reintroduce them.

**Species Clause — no two Pokemon on a team may be the same species**
(verified empirically 2026-09-09, the same way the Item Clause was: **0 of the
642 Worlds teams with a full list repeat a species**, and none repeats even a
*form* — 394 Masters, 137 Seniors, 111 Juniors). Serebii's rules pages never
spell the clause out, so this is our own measurement, not scraped text. The
practical consequence: **a second copy of a species can never share a team with
the first**, which is what makes a duplicate pure GTS trade material rather than
a spare.

**Item Clause — no two Pokemon on a team may hold the same item.** Verified
across all three Worlds divisions: 0 of the 636 teams with a full item list
repeat one (388 Masters, 137 Seniors, 111 Juniors). This changes how
builds combine. Smogon recommends per Pokemon, in isolation — it hands Sitrus
Berry to a dozen different Pokemon — but a team of 6 can field exactly one
Sitrus Berry. So **an item is a team-level decision, not part of a build**.

**Player's rule (2026-08-29): do not record items in `inventory/builds.json` at
all, not even as a ranked list.** Items are argued once, when the six Pokemon of
a team are fixed. With ~30 trained Pokemon, weighing an item pool per build is
work that gets thrown away, and the Item Clause means most of those preferences
cannot coexist anyway. The one exception is a **Mega Stone**, which lives in the
build's `mega` field because the stone is what creates the form. When an item
interacts with a build's own mechanics — a Choice item on a set that is three
quarters status moves, an HP-draining item on a recoil attacker — record that as
a `build_constraint`, which is a fact about the build, not an item preference.

**Items live in `inventory/teams.json`**, one entry per team, alongside the
reason each Pokemon got the item it got. That file is also where a team's
shared type holes and open questions are kept.

The most contested items are Focus Sash (339 Worlds teams), Sitrus Berry (309)
and Life Orb (273).

**Stat Points:** Champions replaces EVs with SP. The budget is **66 points
total, capped at 32 in any one stat** — verified across all 84 Smogon VGC
spreads and every pokebase team spread, which sum to exactly 66 without
exception. Retuning costs 5 VP per SP change. Never propose a spread that
breaks either limit; `python scripts/query.py build` checks the player's own builds
against both.

**How the player judges an SP investment (2026-09-01): only a change in the KO
count counts.** Points in a defensive stat are worth spending if and only if
they move a real attack from a 1HKO to a 2HKO or 3HKO. If the Pokemon still dies
in one hit, the investment bought nothing no matter how large the percentage
drop looks - and if it already survived one hit without the points, it also
bought nothing. So never argue for a spread with "it takes 22% less damage";
run `scripts/damage.py` against the actual threats and report **which ones
change category**. Everything else is decoration. The same test settles nature
choices: the winner is the one that flips the most common threat, not the one
with the better average.

**Mega Evolution rule (confirmed by the player):** a team of 6 may hold several
Mega Stones — 292 of the 395 Worlds teams carried two, the winner included —
but **only one Pokemon can actually Mega Evolve during a battle.** So a second
stone buys matchup flexibility at team preview (you pick 4 of 6 and choose which
Mega to bring), never two active Megas at once. Never advise "run both Megas
together"; frame it as picking one per game.

**One species can now have TWO different Megas, and each needs its own stone.**
Charizard X/Y and Raichu X/Y were always like this; Regulation M-C added a third
suffix, **Z**, marking a *second* Mega on a species that already had one —
**Mega Garchomp Z**, **Mega Absol Z**, **Mega Lucario Z**. They are not upgrades
but different Pokemon: Mega Garchomp is Dragon/Ground 170 Atk / 92 Spe with Sand
Force, Mega Garchomp Z is pure Dragon 141 SpA / **151 Spe** with Levitate. All
three Z forms sit at exactly Speed 151.
**Owning the base stone does NOT unlock the Z line** — Garchompite and
Garchompite Z are separate items, 2000 VP each. `query.py owned` prints both
Mega lines side by side with the stone status of each, and `stone_for()` maps
each of the 81 Megas to exactly one of the 81 stones. Say which stone is
missing, never just "owned".

**Judge a Pokemon on its Mega line, and compare Mega against Mega (player,
2026-08-29).** Mega Evolution can change the **stats**, the **typing** and the
**ability** - any of the three, in any combination - so the base row is the
wrong answer on all three counts, and a Mega's number must never be set against
another Pokemon's base number.

- **Typing:** Ampharos Electric to Electric/Dragon, Staraptor Normal/Flying to
  Fighting/Flying, Meganium Grass to Grass/Fairy, Sceptile Grass to
  Grass/Dragon. The base defensive profile is simply not the Mega's.
- **Ability:** the Mega's ability **replaces** the base one, it is not added.
  Often the ability *is* the reason to Mega Evolve - Mawile gains Huge Power,
  Sableye Magic Bounce, Meganium Mega Sol, Ampharos Mold Breaker, Staraptor
  Contrary. Just as often it costs something: Froslass trades Cursed Body for
  Snow Warning, Aggron trades Sturdy for Filter. Always name what is gained
  AND what is given up.
- **A teamlist ability is the base ability, and that is correct - it is the one
  the Pokemon actually has until it Mega Evolves.** The registration is not
  wrong and must never be described as mislabelled. Both abilities are real, at
  different points in the same battle: a Charizard holding Charizardite Y truly
  has Blaze while it is Charizard, and becomes Drought the moment it evolves.
  So WHEN to evolve is a real decision, because the base ability is doing
  something until then - Aerodactyl keeps blocking Berries with Unnerve,
  Froslass keeps Cursed Body, Staraptor is still applying Intimidate.
  `query.py worlds` prints `base -> what it becomes`, so both halves are visible.
- **Two stones are a team-preview choice (player, 2026-08-29).** You pick 4 of
  6, so the second stone exists to let you bring whichever Mega suits the
  matchup. Both stone-holders DO get brought sometimes; one just plays in base
  form, and for several that is a complete Pokemon on its own - an un-evolved
  Aerodactyl still has Unnerve, Speed 130, Tailwind and Rock Slide. What
  settles it is the final team composition, every game, so never state a fixed
  rule about which one evolves.
- **The real structure is a four-slot shell plus two interchangeable Megas**,
  and the shell has to support either one. Round-15 data: 75% of teams carry two
  stones, Kingambit sits in all seven two-stone shells in the top 8 and
  Basculegion in five, and the field's most common shell is Basculegion +
  Garchomp + Kingambit + Whimsicott (53 teams). So when helping build a team,
  settle the shell first and treat the Megas as the two matchup options it
  carries. Do not frame it as picking one best Mega.
- A build's `mega_note` should record both halves: what the stone adds, and how
  much of the set survives without it.

`python scripts/query.py owned` prints the Mega's types, BST/SpA/Spe and ability
next to the base ones for exactly this reason. Also say whether the stone is
owned or costs 2000 VP, because that decides whether the Mega line is reachable
at all.

**But do not turn that into a conflict (player, 2026-08-29).** Owning five
Mega-capable builds is not a problem to resolve, and a team may perfectly well
carry two stones. Never rank the Megas against each other outside a specific
team against a specific opponent, and never narrow the box down to "the" Mega.
Per build, record only what the stone adds and how much survives without it —
the `mega_note` field in `builds.json`.

**What the database is FOR (player, 2026-08-29).** It is for scouting what the
opponent will bring and countering it with what the player owns — not for
copying tournament teams and not for scoring their builds against Smogon. A
niche strategy that wins is the goal, so "this matches the Worlds set exactly"
is not praise and "0 of 395 Worlds teams ran this" is not a warning. Report
usage numbers as intelligence about the opposition, then reason from what is in
the box.

**Rules confirmed in game by the player — these override every scraped source.**

- **The x0.75 spread modifier is decided WHEN THE MOVE GOES OFF, not by the move
  (player, confirmed in game 2026-09-04).** Both opposing Pokemon alive when
  Earthquake goes off: 75% each. Only one left: **back to 100%**. So a spread
  move is not permanently a three-quarter move — in a 1-vs-1 endgame it is the
  full number, and Garchomp's Earthquake on Kingambit goes from 102-120 to
  **134-162**. Neither `damage.py` nor Smogon's engine can see the field, so both
  apply the x0.75 off the move's target type and the caller has to say otherwise:
  `--single-target`. Every spread calculation now prints that reminder.
  **Still open, and worth watching for:** the case where both were alive when you
  picked the move but your partner KOes one before yours resolves. Serebii and
  champsdex do not cover it; the main-series wording ("more than one target when
  the move is executed") implies it goes back to full power, but that is not
  confirmed here yet.

- **Mega Glalie Explosion does not work in practice (player, tested 2026-08-31).**
  Tried repeatedly and dismissed as "un chiste". The theory was strong on paper -
  450 effective BP, the best Explosion in the game, verified with
  `scripts/damage.py` - but it lost in real games. Do not re-propose it, and do
  not re-derive the case for it from the damage numbers: the numbers were right
  and the plan still failed. What the calculator cannot see is the cost of
  spending two turns setting up a one-shot nuke that the ~33% of teams with Wide
  Guard, Detect or Damp simply turn off.
- **Farigiraf is the keeper from that team (player, 2026-08-31).** Armor Tail +
  Imprison + Trick Room + Psychic tested well and is described as "impecable" and
  "bien molesta". Dragonite also performs. The team's real flaw is structural:
  Farigiraf sets Trick Room but every other attacker is fast (Dragonite 152,
  Sneasler 189), so nothing exploits it. **A Trick Room setter needs slow
  sweepers and slow Megas, and that is the direction to build.**

- **Contrary inverts everything.** Any stat change from any source, moves and
  abilities alike. So on Mega Staraptor: Close Combat's self-inflicted
  −1 Def / −1 SpD becomes +1 / +1, an ally's Charm becomes +2 Attack, and an
  **opposing Intimidate raises its Attack**. Serebii's text says "*moves* used
  on the Pokemon", which is narrower than the real behaviour — do not reason
  from that wording.
- **Defiant and Competitive are the same mechanic on different stats**, and
  neither is Contrary. One stat drop = +2 Attack (Defiant) or +2 Sp. Atk
  (Competitive). Contrary is a different ability entirely: it *inverts* every
  change, drops into boosts and boosts into drops. Do not reason about one from
  the other. **The player has never confirmed any restriction on Defiant** - the
  "doesn't work on self inflicted stat drops or drops from allies" clause is
  Serebii's wording carried into `data/db/abilities.json`, so it is scraped
  text, not an in-game observation, and it does not belong in this list.
  Competitive's text carries no such clause at all. Quote the ability text as
  the source it is, and never present the clause as player-confirmed.
- **Mega Evolution resolves AFTER switch-ins, in the same turn (player, tested
  in game 2026-08-31).** The player Mega Evolved Glalie and used Explosion on
  turn 2; the opponent switched Incineroar in that same turn. The Intimidate
  fired while Glalie was **still in base form**, so **Inner Focus blocked it**.
  This is the opposite of what the damage model assumed. The practical
  consequence: **a base ability that answers a switch-in - Inner Focus against
  Intimidate, Unnerve against Berries - still applies on the turn you Mega
  Evolve**, because the switch happens first. Never tell the player that Mega
  Evolving "loses" the base ability against something that arrives that turn.
- **Intimidate re-triggers on Mega Evolution.** The ability text ("upon entering
  battle **or receiving the ability**") is right: a Pokemon with Intimidate that
  Mega Evolves into Intimidate applies it twice. Mega Scrafty is the case in the
  box — −2 Attack on both opponents from one slot.
- **Weather multiplies damage, and the move texts do not say so (player, 2026-08-30).**
  Rain boosts Water moves and weakens Fire ones; sun does the reverse. None of
  that is written in `data/db/moves.json` - only the eight moves with an
  explicit sun clause carry it - so never conclude a weather has no damage
  effect just because the move text is silent. The consequence for
  **Mega Sol** is the whole point of the ability: Meganium's moves are treated
  as being in sun, so its Fire-type Weather Ball gets the sun boost and does
  NOT get the rain penalty, even while the team's own rain is up. Weather Ball
  is 100 BP Fire under Mega Sol (base 50, doubled by weather) and the sun
  multiplier applies on top of that, which is a different number from the base
  power alone - worth confirming in game before it is quoted as final.
- **Light Clay extends Aurora Veil**, not only Light Screen and Reflect, despite
  the item text naming only those two.
- **Item prices come from Serebii, and where pokebase disagrees Serebii wins**
  (player, 2026-09-13: "los precios son los que dice serebii"). Serebii's item
  page IS the shop listing, priced row by row; pokebase buckets what it is
  unsure of into `shop-2000-vp`, which is why all **12** disagreements run the
  same way - Serebii 700 or 1000 against pokebase's flat 2000 (Air Balloon,
  Binding Band, Eject Button, the four Seeds, Leek, Normal Gem, Red Card,
  Rocky Helmet, Terrain Extender). pokebase is still the fallback for the eight
  Mega Stones Serebii prints as "??? VP". Settled, not open: do not re-raise it.
- **Weather Ball is NEVER Normal in practice (player, 2026-09-01).** The `type`
  field in `data/db/moves.json` says Normal and the BP says 50; both are the
  no-weather case, which does not happen. Nobody runs Weather Ball outside a sun,
  rain, snow or sand team - it is 100 BP of the weather's type, always. Reading
  the type column and calling it a neutral 50 BP chip move is simply wrong.
  Resolved against the Worlds lists: of the 385 Weather Ball sets, **349 are on
  sun or snow teams** (Charizard 239 + 41, Torkoal 23) - a 100 BP Fire or Ice
  attack. Only 36 are rain. So **always resolve Weather Ball to the team's own
  weather** (read it off Drought / Drizzle / Snow Warning / Sand Stream, and off
  the Mega stones - Charizardite X and Y both bring Drought, Abomasite and
  Froslassite Snow Warning, Tyranitarite Sand Stream) before quoting any
  effectiveness.
- **Skill Link rolls accuracy ONCE for the whole move, then always lands 5 hits
  (player, 2026-09-01).** There is no per-hit accuracy check and no 2-5 variance,
  so a Skill Link multi-hit move is all-or-nothing: Rock Blast at 90 accuracy is
  a 10% chance of dealing zero, never a partial connect. Two consequences.
  Ranking these moves by **BP x accuracy is exactly right** here - 5 x 25 = 125
  BP at face accuracy, with no smoothing from partial hits - which is how
  Pin Missile (125 BP, 95 acc, 20 PP) ends up beating Megahorn (120 BP, 85 acc,
  12 PP) on all three numbers at once. And the damage is **deterministic apart
  from the 85-100% roll**, so a "90-107% on Garchomp" line is a real roll-
  dependent OHKO chance, not the lottery a 2-5 move is without the ability.
  Only Triple Axel and Population Bomb carry "the attack ends if the user
  misses" in `data/db/moves.json`; the 2-5 group does not, and now that is
  confirmed rather than inferred.

**How Pokemon are actually obtained (player, 2026-08-29; model corrected
2026-08-31) — this bounds every suggestion.** The plannable pool is exactly what
is in `inventory.json`: the permanent box plus the rental list.

**The Encounter is the game's one source of new Pokemon** — a gacha offering 10
random species. **Rental and permanent are not two paths; they are the two ways
to take a Pokemon out of that same Encounter**: rent it for 0 VP, or buy it
outright for 2500 VP. A rental already taken can still be converted later for
the same 2500 VP or with a permanence ticket. Rentals expire and **cannot be
trained**, which is why the player deliberately takes Encounter Pokemon as
rentals — it keeps VP free to keep rolling — and buys them later. Getting a
specific species out of the gacha is luck, not a plan, so never propose a
Pokemon the player does not own, and always say whether it is already permanent
or a rental that costs 2500 VP.

**Pokemon HOME is the exception, and it is not new.** HOME has always been a
route into Champions; nothing about the game changed. What changed is that the
player can use it — they have **no Switch**, and only recently found that
Pokemon caught in **Pokemon GO** can be sent to HOME and on into Champions. A
Pokemon arriving this way is **permanent**: trainable at once, no VP, no ticket,
and it never touches the rental list (Sableye, 2026-08-31). This is the **only
route that delivers a chosen species on purpose**, so "they don't own it" is not
the same as "unobtainable" — ask rather than ruling it out. Mega Stones for
species not in the box stay dead weight until that species actually arrives.

**A rental cannot be trained (player, 2026-08-29).** Moves, nature, ability and
SP can only be changed on a Pokemon you own permanently, so a rental is locked
to whatever default set it ships with. This is why `builds.json` holds no
rental: it is a rule, not a choice. It also reframes what making one permanent
buys - it unlocks *building* that Pokemon, so the reason to spend on one is
wanting to give it a set, not its raw usage number. Never propose a trained
spread, a bespoke moveset or a nature for a Pokemon that is still a rental.

**A rental CAN hold a Mega Stone and Mega Evolve (player, 2026-08-29).** Being a
rental only blocks *training*, never the stone. In practice the player still
rates a rental Mega as not worth fielding, because it is stuck with the default
moveset it ships with - the stone raises the stats, not the set.

**Why the box is full of rentals (player, 2026-08-29).** It is deliberate, not
indecision: taking an Encounter Pokemon as a rental costs 0 VP, which keeps VP
free to keep rolling the gacha. They are bought later, when VP allows. So do not
read a long rental list as clutter, and do not push to convert one before the
player raises the subject - the holding pattern is the plan.

The player plays in **English** and wants all files, data and docs in English.

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
`data/raw/pokebase_calc/`. Pikalytics has one too.

**Champions is doubles, so a move with more than one target takes the x0.75
spread modifier.** Forgetting it overstates every spread move by a third.

Never assert that something survives or dies without running this. A type
multiplier alone is not an answer: Explosion OHKOes bulky neutral targets
through x1 but leaves Kingambit at 60% of its HP through x0.5.

**Smogon publishes its own Champions engine, and it is vendored here.** Champions
is generation 0 in `@smogon/calc`, with its own mechanics file, roster, move
table and 406 sets. It confirms our stat and damage formulas character for
character, and it is the sixth source. Full write-up in
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

## Answer with the tool, not from the file dumps

`scripts/query.py` already joins the sources. Prefer it over reading JSON:

```bash
python scripts/query.py brief Ceruledge           # dossier: every source at once
python scripts/query.py moves --flag sound
python scripts/query.py moves --priority + --used
python scripts/query.py counter-priority
python scripts/query.py moves --flag bullet --learners
python scripts/query.py pokemon Garchomp          # includes Smogon's writeup
python scripts/query.py ability Bulletproof
python scripts/query.py usage --top 30
python scripts/query.py speed --min 100
python scripts/query.py worlds --usage --top 64
python scripts/query.py worlds --usage --division all   # the three divisions
python scripts/query.py owned
python scripts/query.py types Garchomp        # defensive profile
python scripts/query.py types "grass dragon"  # or a bare type combo
python scripts/query.py resist ice fairy --owned   # who covers a shared hole
python scripts/query.py nature Brave          # what a nature raises/lowers
python scripts/query.py move Taunt            # Serebii's text AND Smogon's
python scripts/damage.py --selftest
python scripts/damage.py "Mega Glalie" Explosion Kingambit --atk-sp 32 --nature adamant
```

**`query.py move` exists because reading one rules source is not enough.**
Serebii names a status without defining it ("gains the Sealing Off status") and
`data/db/smogon_basics.json` — a second local source, easy to forget — gives the
mechanic ("No foe can use any move known by the user") and durations Serebii
omits (Taunt: 3 turns). Missing that produced two wrong answers. The command
prints both.

`resist` takes any number of attacking types and lists what takes them all at
x0.5 or better, flagging what is owned and what already has a build. It is the
tool for "my core dies to X and Y, what covers it".

The type chart and the 25 natures live in `data/db/typechart.json` and
`data/db/natures.json`, built by `scripts/build_typechart.py` from Smogon's
`dump-basics` and **cross-checked against Serebii's per-Pokemon Weakness tables
- 3402 matchups over 189 Pokemon, no disagreement**. Champions uses the
standard chart; that is now verified, not assumed.

The typical question is a chain — "what does ability X block → who learns those
moves → which of them are actually used → do I own any". `--learners` and the
`You` column are built for exactly that.

## A note on the numbers quoted in this file

Metagame figures cited below (usage percentages, Worlds team counts, how many
Pokemon Smogon covers) are a **snapshot taken 2026-08-29, Regulation M-B /
Season M-5, Worlds 2026 complete through the Final in all three divisions**.
**The ladder is on M-C now, and the three usage sources are NOT in the same
format as each other (player, 2026-09-12 — he corrected the opposite claim,
which had been written on the day M-C opened and was true only then):**

- **pokebase ladder usage is M-C and current.** The page ships
  `defaultLatestRegulationSetSlug: "m-c"` and `fetch_pokebase.py` asks for no
  regulation, so it gets that. Proved by the numbers themselves: species that
  are ONLY legal in M-C carry real usage — Indeedee-F **17.1%** and in the top
  ten, Sinistcha 9.1%, Archaludon 7.6%, Pawmot 3.1%. Under M-B they could not
  have appeared at all. **A regulation does not run backwards: once it
  advances, that is the format.**
- **The Worlds teamlists are M-B, and that is correct, not stale.** They were
  played under M-B. Say which format a tournament number came from; never
  "update" it.
- **Pikalytics still lags** — stamped `2026-05`, ladder code still season 3.
  Use it for spreads, win rates and cores, not for what is popular.
Unless a figure says otherwise it is the Masters field, which is the division
the player enters. They are here to explain *why* a rule of thumb
exists, not to be quoted back as current. Always re-read `data/meta/` for a live
number. Anything that must stay exact lives in a JSON file, never in prose here.

## Source hierarchy

1. **Serebii** — rules and mechanics. Ground truth for what a move/ability does.
2. **pokedata.ovh** — official tournament teamlists. Ground truth for what wins.
   Worlds runs **three age divisions** off the same roster and the same
   regulation, and all three are captured: Masters, Seniors, Juniors. They are
   three separate metagames, so never pool them into one percentage — say which
   division a number came from. Masters is the default everywhere because it is
   the division the player enters; the other two are a second, independent read
   on the same format (Incineroar is 41% of Masters teams but 26% of the kids',
   Whimsicott and Garchomp run the other way). `--division all` puts the three
   side by side.
3. **pokebase.app** — live ladder usage and per-Pokemon splits. What is common now.
4. **Pikalytics** — win rates, top SP spreads, 2-/3-Pokemon cores. Stamped
   `2026-05` and its ladder code still says season 3, so its usage numbers lag
   pokebase. Use it for spreads, win rates and cores, not for "what is popular".
5. **Smogon** — the only source with written reasoning. Covers 53 of 308 forms
   (25 in M-B, 28 more only in M-A).
6. **Smogon's Champions calculator** — the only *executable* source. Ground truth
   for damage arithmetic, ability behaviour and conditional base powers, and it
   ships 406 more sets. It is **not** ground truth for rules text or per-Pokemon
   data: it inherits from Scarlet/Violet and the leaks show. Serebii still wins
   on Mega Hawlucha's No Guard, Mega Skarmory's Stalwart and Growth's Grass
   typing, all three of which the calculator has wrong. See
   `analysis/smogon_calc.md`.

Ladder usage (pokebase) and tournament usage (pokedata) disagree, and that is
useful signal, not an error. Say which one a number came from.

**When Smogon has no analysis** (most Pokemon), do not invent one and do not
reach for another site — none exists. Victory Road, ChampTeams, MetaVGC,
Stratagem, VGC Team Report and Pokemon Zone all publish team lists, tier lists
or general guides, never per-Pokemon prose.

**One exception, for MECHANICS only:** `champsdex.com` publishes Champions
guides that do describe mechanics, and it settled the Trick Room switch
question that Serebii and Smogon both leave undocumented. Use it for "how does
this interaction work", never for numbers or per-Pokemon sets — those still
come from the five sources above. Bulbapedia is fine as main-series canon for a
mechanic, but only after checking that Champions did not rebalance the move:
compare the numbers we do have first. vgcguide.com is general VGC theory
and its in-game section is still on Sword/Shield. Instead run
`query.py brief <pokemon>` and reason from the real distributions it prints.

## Playstyle — weigh recommendations against this

**Special attackers are a PREFERENCE, never a filter (clarified by the player
2026-09-02).** "Era una preferencia, pero nunca es definitivo... yo siempre estoy
abierto a todo, a la creatividad de estrategias." Their original reasoning still
holds - Intimidate only touches Attack, so a special attacker never gets chipped
by stacked Intimidates - but it is one factor among many, not a gate. Judge every
option on whichever attacking stat is actually higher and rank on the numbers.
Never present a physical Pokemon as a compromise, and never exclude one from a
search.

**They also consider a MIX of damage types a positive in itself:** "siempre es
bueno tener diferentes tipos de atacantes en un team." An all-special team is a
shared weakness to one wall, not a virtue.

**What they DO now avoid is carrying Intimidate on their own team (2026-09-02).**
Not opposing Intimidate - their own. The reason is that the format is full of
abilities that turn an incoming Intimidate into a boost: **Defiant** (+2 Atk),
**Competitive** (+2 SpA) and **Contrary** (inverts it to +1 Atk). Regulation M-C
added two more: **Guard Dog** (Mabosstiff - raises Attack when intimidated, and
also blocks forced switching) and **Rattled** (Persian-Alola - raises Speed).
Rattled is easy to miss because its Intimidate clause sits at the END of a text
that is mostly about Bug/Ghost/Dark moves - read the whole line.
Bringing Intimidate hands all five a free boost.

Keep these separate from the abilities that merely **block** Intimidate and give
nothing back - Inner Focus, Own Tempo, Oblivious, Scrappy - all of which predate
M-C. Blocking costs the Intimidate user a turn of value; the five above actively
punish it. So flag it as a cost when
recommending an Intimidate holder - Incineroar, Staraptor, Arcanine, Scrafty,
Mawile, and now Salamence, Squawkabilly and Mabosstiff itself - and prefer the
alternative ability or a different Pokemon where the rest of the set survives it.

**A priority move only counts if its category matches the Pokemon's main damage
stat.** Sucker Punch on a special attacker buys nothing. Almost every priority
attack in Champions is physical - the only special ones are Vacuum Wave (40 BP)
and Water Shuriken (15 BP) - so verify the pairing before recommending one.

They reached Master Rank 3 with a Trick Room team built on Mega Eelektross,
which nobody prepared for. Treat that as evidence they will pilot an off-meta
call when the numbers back it — **not** as a standing preference for Trick Room.
They have said explicitly that Trick Room was one example, not their style. Do
not assume any fixed archetype, and do not treat the special-attacker preference
above as a constraint to build outward from: start from the team's actual holes
and the numbers.

That team ran **Farigiraf for Armor Tail, not for Trick Room**: it blanks
Prankster-boosted status so the opening turns against Whimsicott (Prankster
Encore / Tailwind, on ~24% of Worlds teams) are safe. Worth knowing how this
player thinks — they pick a Pokemon for a specific ability answering a specific
threat, not for its archetype label. Read `query.py counter-priority` before
discussing speed control with them.

## Player context

**Rank, box occupancy, what they own and every VP cost live in
`inventory/inventory.json`.** Read it; do not restate those numbers here, or
the two copies drift apart. `python scripts/query.py owned` prints the box and
warns when `box_used` no longer matches the lists.

What the file cannot record:

- **Do not volunteer what to release.** They manage the box themselves, and
  releasing only matters once it is actually full. Report that space is tight
  if it is; do not turn it into a recommendation.
- Rentals go before permanents when they do free a slot, unless a permanent has
  stopped earning its place.
- Training costs VP, so **the VP price is part of any build recommendation**.
  Observed in-game 2026-08-29: **SP change 5 VP, move 250 VP, nature 500 VP,
  ability 500 VP**.
  Serebii's training page still shows the launch prices (2 / 100 / 200 / 400)
  and is **wrong**; `inventory.json` is the source of truth for costs. Retuning
  a full set is expensive: four moves alone is 1000 VP, over three ranked wins.

## Gotchas already solved — do not re-break these

- **Form names differ per source**: Serebii `Ninetales-Alola`, pokebase
  `Alolan Ninetales`, pokedata `Basculegion [Male]`. `query.py:norm()` reduces a
  name to a sorted token set so all spellings meet. Use it for any new join.
- **Serebii pages are cp1252**, not UTF-8.
- **The Pokedex page merges regional forms** into one block (Samurott's types come
  out as Water + Water/Dark). Form-level data is taken from the Attackdex learner
  tables instead; only Megas come from the Pokedex.
- **The Attackdex flag table alternates header/value rows.** Start the parse at
  the `<tr>` that opens the "Physical Contact" row or every flag shifts by one.
- **pokebase renders only 100 rows per page** and the usage % exists only in that
  rendered HTML — walk `?page=N`.
- **Do not pipe a fetch script into `head`**; SIGPIPE kills it before it writes.
- **A Pokemon page labels both Mega blocks the same** ("Mega Charizard" twice).
  The X/Y suffix exists only in the master list, and Raichu's two Megas are both
  pure Electric, so they can only be paired by order of appearance.
- **Gender forms have no header block.** Basculegion-Female exists only as an
  `<h2>Stats - Female</h2>` table and is a real form (120/92/65/100/75/78 vs the
  male's physical split). Its movepool is inherited from the base species.
- **A form can share the base form's SPRITE and still be a different Pokemon**
  (player, 2026-09-12). The attackdex learner tables only emit a row when the
  sprite differs, so anything that looks identical was silently collapsed. Two
  families were, and both mattered:
  **Squawkabilly** has four plumages, fixed when you catch it, one spread and
  one movepool, and the third ability splits them — Green and Blue get **Guts**,
  Yellow and White get **Sheer Force**. Collapsing them did not just lose three
  rows, it **lost Sheer Force from the database entirely**: no Champions Pokemon
  carried it at all under that name.
  **Gourgeist** has four sizes, also fixed at capture, differing by 30 HP,
  15 Attack and **45 Speed** (Small 55/85/99 → Jumbo 85/100/54). They were
  stored as `battle_forms`, i.e. as an in-battle stance, which they are not.
  Both are declared in `build_db.FIXED_FORMS`, and `audit_forms.py` section 7
  now fires on any Serebii page that splits abilities or stats per form while
  the dex holds one row. That check catches both of these on the old data.
- **`norm()` treats a colour or a size as decoration — except where it is not.**
  A colour is nothing on a Florges and a different Pokemon on a Squawkabilly; a
  size is nothing anywhere else and 45 Speed on a Gourgeist. `_SIGNIFICANT` in
  `query.py` takes those tokens back for those two species only, so every other
  cosmetic set keeps collapsing. The base row's own word is deliberately NOT
  listed: our `Squawkabilly` row IS the Green Plumage and `Gourgeist` IS the
  Medium Variety, so "Green"/"Medium" must keep collapsing onto them.
- **Five forms are flipped by an ABILITY during the battle, and what they move
  differs** — they are one registration each, never a dex row:
  Stance Change flips **Aegislash** on stats (140 Atk / 140 Def), Zero to Hero
  flips **Palafin** on stats (Atk 70 → 160), Forecast retypes **Castform**
  (Fire in sun, Water in rain, Ice in snow). The other two move nothing on the
  Pokemon itself: Hunger Switch only retypes **Morpeko**'s Aura Wheel
  (Electric → Dark) and Disguise only eats one hit and 1/8 max HP on
  **Mimikyu**. The first three carry a `battle_forms` entry with the spread or
  the typing; the last two correctly carry none. Do not file any of the five as
  cosmetic — the transformation is real every time.
- **Serebii writes `#0`, not `#0876`, on Indeedee's female row.** A dex-number
  pattern of `\d{4}` dropped that row from the form table AND from all 45
  movepools it appears in, so Indeedee-Female came out with the male's merged
  ability list and **zero moves**. It is a real form: Own Tempo instead of Inner
  Focus, 70/55/65/95/105/85, and its own movepool — it is the only Champions
  Pokemon that learns **Follow Me** besides Clefable and Maushold.
- **Plain Floette is not in Champions — only the Eternal Flower form is.** The
  master list has 670-e and nothing else, no learner table ever says "Floette",
  and the Pokedex page's single block carries the Eternal 551 spread. A bare
  "Floette" from any usage source therefore means that form, and `_ALIASES`
  maps it there. The phantom second row this used to create had no movepool.
- **A usage row whose item is not the Mega Stone is the BASE form, and says
  nothing about the Mega.** Pikalytics files Megas as their own entries
  (`Aerodactyl Mega`, `Staraptor Mega`, `Mawile Mega`...), so a plain
  `Heracross` row holding a Quick Claw with Moxie is a Heracross that never Mega
  Evolved - quoting its moves or win rate as evidence about Mega Heracross is
  wrong. Check two things before citing a row as Mega data: the item is the
  stone, and the ability is the Mega's. Caught by the player 2026-09-01.
- **`norm()` is for Pokemon only.** Moves, items and abilities go through
  `key()`. `norm()`'s form vocabulary eats real words — it turns "Sitrus Berry"
  into "sitrus" and "Behemoth Blade" into "behemoth" — and it sorts tokens,
  which lets unrelated names collide. Never swap one for the other.
- **Serebii abbreviates a form where other sources spell it out.** Toxtricity's
  Low Key form is `Toxtricity-L` on Serebii and "Toxtricity (Low Key)" on
  pokebase, which `norm()` cannot reconcile on its own — "low"/"key" must NOT go
  into `_NOISE`, because that would collapse Low Key into Amped, a different
  form with a different ability (Minus vs Plus). It is handled by an entry in
  `_ALIASES`, the same mechanism Floette needed. Check any new one-letter form
  suffix the same way.
- **A Mega's stone is not findable by name prefix alone.** "Dragon Fang" beats
  "Dragoninite" for Dragonite and "Sharp Beak" beats "Sharpedonite" for
  Sharpedo. `stone_for()` filters on the `is_mega_stone` flag first; the mapping
  is 1:1 over all 81 Megas and 81 stones, and that invariant is worth re-checking
  after a regulation adds more.
- Run `python scripts/audit_forms.py` after any parser change, and
  `python scripts/test_norm.py` after touching `norm()`. The test locks in 44
  name groups that must collapse and 21 pairs that must stay apart.

## The watchlist

`audit_forms.py` ends with **12** names pokebase reports at 0.00% usage
(Eiscue, Girafarig, Glimmet, Gothitelle, Hisuian Sneasel, Hitmontop, Kingdra,
Lilligant, Octillery, Sinistea, Sneasel, Tropius). They are not a bug: pokebase
publishes its entire Pokedex while Champions only allows part of it, so there is
nothing in our dex to map them onto.

They are worth watching because **regulations add Pokemon** — M-B brought 22
species and 16 Megas, **M-C brought 23 species (+3 alternate forms) and 6
Megas**. The moment one of these starts scoring usage, it has been added to the
format, and the audit promotes it from the watchlist to a PROBLEM line. The fix
then is just `fetch_serebii.py list && build_db.py` — **plus a forced re-fetch of
the pokedex and attackdex pages**, because `fetch_serebii.py` skips anything
already cached and the attackdex is where forms and learnsets come from. Miss
that and the new species silently have no movepool. See
`analysis/regulation_m_c.md` for the exact commands.

The name-matching side is already prepared: `_NOISE` and `_BASE_MARKERS` carry
tokens for cosmetic and in-battle forms of species not in Champions yet (Hero,
Busted, Hangry, Noice Face, Low Key, Rapid Strike, plumage colours…), and
`test_norm.py` asserts those spellings collapse correctly. So a newly added
Pokemon joins across all five sources on day one instead of dropping rows.

**There is a second watchlist, on the move side (player, 2026-09-04).** Twelve
moves in Smogon's Champions calculator carried a base power and nothing else —
no type, no category — because **no Champions Pokemon learned any of them**, and
our own `useable` flag said False for all twelve independently.

**This watchlist has now fired once, exactly as predicted.** Regulation M-C
brought Inteleon, which learns **Snipe Shot**, and the move went useable (85 BP,
100 acc, 16 PP). **Eleven remain:** Anchor Shot, Astral Barrage, Blood Moon,
Bolt Beak, Dragon Hammer, Fishious Rend, Gear Grind, Hyper Drill, Metal Claw,
Revelation Dance, Triple Dive. When a regulation gives one of them a learner,
Smogon fills the entry in — `python scripts/fetch_smogon_calc.py --check` is how
that gets noticed.

**A third gap, new with M-C:** two moves are useable and have a learner but
Serebii has left their PP and accuracy cells **empty** — **Double Shock** and
**Revival Blessing** (both Pawmot), stored as `null`. That is upstream, not our
parser. **Octazooka** is the mirror case: flagged useable with no learner at all.

## Smogon format labels: already checked, do not re-open

Some Champions analyses filed under **Battle Stadium Singles** or **OU** open
with "Welcome to the first format of Pokemon Champions, Regulation M-A!", which
looks like a mislabelled VGC analysis. It is not. Champions runs both a singles
mode and VGC doubles, and Regulation M-A is the shared *roster*, so that
sentence appears in both. Counting doubles-only vocabulary (ally, partner,
spread move, Fake Out, Follow Me, Rage Powder, Wide Guard, Tailwind) against
singles vocabulary across every cached analysis settles it:

| Format | Pokemon | doubles terms | singles terms |
|---|---|---|---|
| VGC26 Regulation M-A | 38 | 183 | 7 |
| VGC26 Regulation M-B | 25 | 86 | 2 |
| Battle Stadium Singles | 44 | 11 | 44 |
| OU | 47 | 9 | 36 |

The `VGC*` filter in `fetch_smogon.py` is correct. Keep singles out.

## The README is the front door, and it is checked

**Every change that alters what the app IS goes into `README.md` in the same
commit (player, 2026-09-13).** The repo is public now, so that file is what
anyone sees first - and by the time it was read it claimed 308 forms against a
real 345, named a regulation two versions old, and told the reader to hand-edit
a file the app had replaced.

The counts are therefore **generated**, never typed: `scripts/build_readme.py`
writes them between `<!-- COUNTS:START -->` markers, `--check` is one of the
gate's checks in `daily.py`, and `refresh.py` regenerates them every night. A
drifted README blocks the deploy exactly like a failing test.

The PROSE is still yours to write. What belongs there is what the project IS -
the app's tabs, the sources, how it stays current, the rules of the format -
not a changelog. When a feature lands, describe it there in the same pull
request.

## Refresh

```bash
python scripts/fetch_serebii.py all && python scripts/build_db.py
python scripts/fetch_pokebase.py
python scripts/fetch_pikalytics.py
python scripts/fetch_smogon.py
python scripts/fetch_tournament.py                    # Masters, newest round
python scripts/fetch_tournament.py --division seniors
python scripts/fetch_tournament.py --division juniors
python scripts/fetch_smogon_calc.py                   # Smogon's Champions engine
python scripts/audit_forms.py && python scripts/test_norm.py
python scripts/damage.py --selftest                   # incl. parity vs the engine
```

Raw responses cache under `data/raw/`, so re-runs are cheap. During a live event
re-run `fetch_tournament.py` to pull later rounds.

**That cache is a trap on a new regulation, and the commands above are NOT
enough for one.** `fetch_serebii.py` skips any page already on disk, and
`fetch_pokebase.py` re-parses the cached HTML unless you pass `--force`. So the
plain run picks up new *Pokedex* pages but silently keeps every stale
*attackdex* page — and the attackdex is where form rows and **learnsets** come
from, so all the new species end up with no movepool and no ability to be found
by `--learner`. What a regulation drop actually needs (done for M-C on
2026-09-09, full recipe in `analysis/regulation_m_c.md`):

```bash
python scripts/fetch_serebii.py list          # forced already
rm data/raw/pages/*.html                      # then re-run `pages`
# re-fetch pokedex AND attackdex with force=True, not just the new slugs
python scripts/build_db.py
python scripts/fetch_pokebase.py --force      # else it only re-parses old HTML
python scripts/fetch_smogon.py --force
python scripts/fetch_smogon_calc.py
```

**A round number is not a swiss round.** pokedata numbers the top cut straight on
from the last swiss round: Worlds Masters ran 11 swiss rounds and then 12=TopCut,
13=T8, 14=T4, **15=Final**. So a finished event looks like an unfinished one if
you read the number alone — Worlds 2026 sat at "round 15" precisely because it
was over. The tournament files carry `round_label` and `complete`, and
`query.py worlds` prints them ("round 15 (Final) COMPLETE"). Use those.

## The player maintains the ledger himself now (2026-09-09)

`tracker/README.md` is the full write-up. The short version:

**The box, HOME, the stones, the items, VP and the editable half of every build
live in a web app the player opens on his phone.** He updates them there, as
they happen, without asking. So **never ask him to restate the box, the VP
balance or who is a rental**.

The data is in **Supabase** (project `champions-ledger`, tables `box`, `builds`,
`meta`), behind Row Level Security. An **anonymous** request with the
publishable key returns zero rows — that part is by design and still true.
**But Claude CAN read the ledger** (corrected by the player 2026-09-10): the
Supabase CLI on this machine is logged into his account and linked to the
project, so it reads the tables directly, no Docker and no password:

```bash
supabase db query "select location, status, count(*) from box group by 1,2" --linked
supabase db query "select id, pokemon, nature, moves from builds" --linked -o json
```

So **never say the data is unreachable, and never ask him to restate what a
query would answer.** Two caveats. `supabase db dump` needs Docker Desktop
running and will fail without it — `db query` does not. And fetching the
project's API keys is a credential action the permission layer blocks; there is
no need for it, because `db query` already reads everything.

The **Everything JSON** export from the app's Trainer tab is still the right
input for a full sync, because `sync_tracker.py` takes that shape:

```bash
python scripts/sync_tracker.py import --json FILE      # app export -> repo
python scripts/sync_tracker.py import --json FILE --dry-run
python scripts/sync_tracker.py export --out DIR        # repo -> docs
```

The import is **field-surgical**: it replaces only the lists the app owns and
leaves every `_comment`, `_changelog`, `mega_note`, `build_constraint` and
one-off key untouched. If the ledger and `inventory/*.json` disagree, **the
ledger is right** — it is where he actually records things.

**Origin is recorded at registration now (player, 2026-09-10), so "unknown" is
no longer a state the box can be in.** Every route in settles it, and there are
only three: adding to the Champions Box is always an Encounter (bought or
rental, both Champions origin); arriving from HOME is a MOVE, made from the
HOME row's "Send to Champions", which sets HOME origin and carries the record
across rather than writing a second one. Adding a HOME-origin Pokemon straight
into the Champions Box was possible and was removed - it left the HOME copy in
place, the same duplicate the GTS trade used to leave. `_origin_rule`'s "ASK rather than guessing"
is now enforced by the app instead of being a note. A leftover `unknown` from
before that is counted as Champions origin and flagged on screen, never hidden.

**"Permanent" is the wrong word and the app no longer uses it (player,
2026-09-09).** What matters is ORIGIN, exactly as `_origin_rule` in
inventory.json says: HOME origin can be parked back to HOME and recalled with
the training intact, so the slot is elastic; Champions origin came out of an
Encounter and can never leave the box. The app records this per Pokemon into
`_origin_of`, and `unknown` means **not asked yet** — never read it as
Champions origin when advising.

**Never put a `service_role` / `sb_secret_` key in `tracker/config.local.json`
or anywhere near the page** — it bypasses RLS entirely. `build_tracker_page.py`
refuses to build if it finds one. The publishable key in the page is fine and
is meant to be there.

**The app is regenerated from `data/db/`, so a source refresh must reach it.**
`python scripts/refresh.py` walks Serebii → build_db → pokebase → Pikalytics →
Smogon → the calculator → pokedata → the audits → `tracker/data.js` →
`tracker/index.html`, and `--regulation` clears the Serebii page cache first
(the trap documented above). After it runs, republish `tracker/index.html` to
the same artifact URL or the phone keeps the old dex.

Edit `tracker/index.template.html`, never `tracker/index.html` — the latter is
generated by inlining `data.js` into the former.

**The tracker's damage tab runs Smogon's engine itself** (bundled by
`scripts/build_engine_bundle.py`), so it is exact rather than close. Do not
hand-port the modifier chain again: it runs in four buckets with a rounding
step between each, and a one-point drift can flip a KO count. After
`fetch_smogon_calc.py` reports upstream moved, `refresh.py` rebuilds the bundle
and the page inherits the same fix Smogon shipped.

**Which ability touches which move is derived, not written** -
`scripts/build_ability_moves.py --audit` classifies all 215 abilities and
prints the ones it has no rule for. Sheer Force comes from Smogon's
`secondaries` field, not from Serebii's text: Serebii records a guaranteed
on-hit effect (Icy Wind, Rock Tomb, Snarl) with no rate at all.

**Combat multipliers are measured, never recited** -
`scripts/measure_modifiers.py` runs each one through the engine with and
without it. Anything that measures x1.00 gets checked against the format before
being called unmodelled; most such cases turned out not to exist in Champions.

**Test by sweeping, not by sampling.** `tests/sweeptest.js` puts all 340 forms
through the engine as attacker and defender. A 16-case sample shipped a Mega
naming bug because no sampled case used a Mega.

