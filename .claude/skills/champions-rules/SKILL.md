---
name: champions-rules
description: Pokemon Champions game rules for this project - format and clauses, Stat Points, Megas, the in-game rulings the player confirmed (which override every scraped source), damage-calculator conventions, how Pokemon are obtained, source hierarchy and the player's playstyle. Load it BEFORE answering any question about battles, teams, builds, movesets, spreads, natures, items, Megas, damage or KO counts, the metagame, or what to train, buy or bring - even a quick one.
---

# Pokemon Champions - the rules

One line per rule. The file named in each heading holds the full text and the
reasoning: **read it before relying on a detail it covers**, and always before
contradicting one of these. Rules marked *player* were confirmed in game and
outrank Serebii, Smogon and everything else.

## format.md - format, clauses, items, Stat Points
- PP is rescaled globally (510 of 512 moves at 8/12/16/20): a PP difference is never a rebalance. Compare BP, accuracy and effects. Disputed values live in `build_db.MOVE_RULINGS`.
- VGC only: doubles, bring 6 / pick 4. Singles data is filtered out on purpose.
- Species Clause (measured, 0 of 642 Worlds teams): a second copy of a species can never share a team, so it is GTS trade material, not a spare.
- Item Clause (0 of 636): an item is a TEAM decision. Builds record NO items, not even ranked. The one exception is the Mega Stone in `mega`. Item-vs-mechanics facts go in `build_constraint`. An item lives on a team slot, in the app.
- Stat Points: 66 total, max 32 per stat, 5 VP per SP changed. `query.py build` checks both limits.
- *player*: an SP investment counts ONLY if it changes a real threat's KO count (1HKO to 2HKO). Run `damage.py`, report which threats change category, never "% less damage". Natures are settled the same way.

## megas.md - Megas, and what the database is for
- Several stones per team is normal, but only ONE Pokemon Mega Evolves per battle. The second stone is a team-preview choice. Never "run both Megas".
- Z Megas (Garchomp Z, Absol Z, Lucario Z, all Speed 151) are different Pokemon with their own stones, 2000 VP each. Say which stone is missing, never just "owned".
- Judge a species on its Mega line. A Mega can change stats, typing and ability, and the ability REPLACES the base one: name what is gained AND what is given up.
- The teamlist ability is the base ability, and that is correct (it is what the Pokemon has until it evolves). WHEN to evolve is a real decision.
- The structure is a four-slot shell plus two interchangeable Megas: settle the shell first. Never rank Megas outside a specific team against a specific opponent. `mega_note` records what the stone adds and what survives without it.
- The database is for scouting the opponent and countering with what he owns. Usage is intel. Matching a Worlds set is not praise, and "0 teams ran this" is not a warning.

## in-game-rules.md - confirmed in game (all *player*)
- Spread x0.75 is decided when the move is CHOSEN: 100% only if one opponent is on the field then. Use `--single-target` for the 1-vs-1 case.
- Mega Glalie Explosion failed in real games: never re-propose it. Farigiraf (Armor Tail, Imprison, TR) is the keeper, and a TR setter needs slow sweepers and slow Megas.
- Contrary inverts every stat change, from any source (an opposing Intimidate raises its Attack). Defiant and Competitive are +2 per drop and a different mechanic. Their "self-inflicted" clause is Serebii's text, not player-confirmed.
- Mega Evolution resolves AFTER switch-ins that turn, so a base ability that answers a switch-in (Inner Focus, Unnerve) still applies. Intimidate re-triggers on Mega Evolution.
- Weather multiplies damage even where the move text is silent. Under Mega Sol, Weather Ball is always Fire, 100 BP, sun-boosted.
- Weather Ball is never Normal in practice: resolve it to the team's own weather (stones included) before quoting effectiveness.
- Skill Link rolls accuracy once, then always hits 5 times: rank by BP x accuracy.
- Light Clay extends Aurora Veil. Freeze-Dry does not freeze. Item prices: Serebii wins over pokebase.
- Release limits: the last six Champions-origin Pokemon can never be released. A HOME-origin Pokemon is never released (it parks to HOME) and is never "a duplicate to release".

## obtaining.md - how Pokemon arrive, and the box
- The Encounter (a gacha of 10) is the only in-game source: rent it for 0 VP or buy it for 2500 VP. A rental can be converted later.
- A rental cannot be trained (moves, nature, ability, SP), so never propose a set for one. It CAN hold a Mega Stone. A box full of rentals is deliberate, so do not push conversions.
- Pokemon GO to HOME to Champions arrives permanent and trainable, and is the only route to a CHOSEN species. "Not owned" is not "unobtainable": ask.
- Never propose a Pokemon he does not own, and always say whether it is permanent or a 2500 VP rental. Query the ledger; never restate or audit it.
- Costs are rules (in `scripts/ledger.py`): SP 5, move 250, nature 500, ability 500, stone 2000, rental 2500 VP. What he HAS in VP is not tracked, so ask if a decision turns on it.

## damage.md - the calculator
- Never assert survives/dies without `damage.py`. A type multiplier alone is not an answer.
- `damage.py` IS Smogon's Champions engine (abilities, items, field). A move that needs a fact beyond the two Pokemon is refused until its flag is given; Super Fang, Beat Up, Counter and the OHKO moves are refused as not a damage calculation.
- 2-5 hit moves are quoted at 3 hits, Skill Link at 5, Population Bomb at 10. Aegislash attacks as Blade. Psyshock hits Defense. Raging Bull and Aura Wheel take the user's FORM type. Meteor Beam and Electro Shot land at +1.
- No Terastallization in Champions. Focus Sash and Sturdy are deliberately not modelled. Payback, Gyro Ball and Electro Ball need both Speed SPs; Fling, Acrobatics and Poltergeist need the items stated.
- A set may hold fewer than four moves (Kangaskhan Fake Out + Last Resort, base with Scrappy).

## traps.md - analysis mistakes already made once
- A defender holding its Mega Stone is the MEGA when you calculate. An immunity is 0, not the minimum 1.
- Count type volume AFTER conversions (Pixilate and friends, Weather Ball). `effect_rate` is not a secondary-effect flag.
- A round number is not a swiss round: read `round_label` and `complete`.

## tools.md - query.py
- Answer with `scripts/query.py` (brief, move, types, resist, owned, worlds, usage, speed, counter-priority), not by reading JSON dumps.
- `query.py move` prints Serebii, Smogon's basics and Smogon's full text: one source is not enough.

## sources.md - which number to trust
- Hierarchy: Serebii (rules), then pokedata (tournaments, three divisions never pooled, Masters by default), then pokebase (live ladder, M-C), then Smogon (prose, the only one), then Smogon's calc (arithmetic).
- Worlds 2026 is M-B and that is history, not stale. Pikalytics is dropped. Say which source and format a number came from.
- No per-Pokemon prose exists beyond Smogon: do not invent one. champsdex.com is for mechanics only.

## playstyle.md - how he plays
- Special attackers are a preference, never a filter. A mix of damage types is a positive.
- He avoids Intimidate on his OWN team (Defiant, Competitive, Contrary, Guard Dog and Rattled punish it): flag it as a cost.
- A priority move only counts if its category matches the main attacking stat.
- He picks a Pokemon for a specific ability answering a specific threat. No fixed archetype: Trick Room was one example.
