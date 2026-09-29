# Rules confirmed in game

**Rules confirmed in game by the player — these override every scraped source.**

- **The x0.75 spread modifier is decided WHEN THE MOVE IS CHOSEN, not by the
  move and not when it resolves (player, confirmed in game 2026-09-04 and
  2026-09-27).** A spread move hits at **100% only when the opponent has a
  single Pokemon on the field** as you pick it. Two opponents out when you
  choose Earthquake: it is 75% each, and it **stays 75% even if your partner
  KOes one of them before yours resolves** - the main-series wording ("more
  than one target when the move is executed") does not apply here. So in a
  1-vs-1 endgame it is the full number, and Garchomp's Earthquake on Kingambit
  goes from 102-120 to **134-162**. Neither `damage.py` nor Smogon's engine can
  see the field, so both apply the x0.75 off the move's target type and the
  caller has to say otherwise: `--single-target`. Every spread calculation
  prints that reminder.

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
  NOT get the rain penalty, even while the team's own rain is up. **Confirmed
  by the player (2026-09-27): under Mega Sol, Weather Ball is ALWAYS Fire and
  ALWAYS sun-boosted - with no weather at all, or with another weather up.**
  100 BP (base 50, doubled) with the sun x1.5 on top. Smogon's engine models
  exactly that (`mechanics/champions.js`: Fire type, doubled BP and the sun
  boost all key on `hasAbility('Mega Sol')` alongside real sun), so an engine
  number for it is final.
- **Releasing has two in-game limits (player, 2026-09-27).** The game will not
  release a Pokemon while six or fewer are left to battle with, and a
  HOME-origin Pokemon is never released from the Champions box (it parks back
  to HOME instead). So the last **six Champions-origin** Pokemon hold their
  slots permanently, and a HOME-origin copy is never "a duplicate to release" -
  every HOME-origin Pokemon may stay duplicated. `releaseBlock()` in
  `tracker/src/core/state.js` is the one place both rules live.
- **Light Clay extends Aurora Veil**, not only Light Screen and Reflect, despite
  the item text naming only those two.
- **Freeze-Dry does not freeze in Champions (player, 2026-09-27).** Serebii's
  Champions page leaves a stray "10 %" in its Effect Rate cell while its Battle
  Effect names no freeze, and Smogon's engine deletes the secondary on purpose.
  `build_db.MOVE_RULINGS` sets the rate to none. Every other move with a rate
  states it in its Battle Effect; one that does not is the same leftover.
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
