# Traps this project has already fallen into


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
