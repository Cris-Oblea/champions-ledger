# Megas, and what the database is for

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
the build's `mega_note` field (the `builds` table in the ledger).

**What the database is FOR (player, 2026-08-29).** It is for scouting what the
opponent will bring and countering it with what the player owns — not for
copying tournament teams and not for scoring their builds against Smogon. A
niche strategy that wins is the goal, so "this matches the Worlds set exactly"
is not praise and "0 of 395 Worlds teams ran this" is not a warning. Report
usage numbers as intelligence about the opposition, then reason from what is in
the box.
