# Sources, formats and how current the numbers are

## A note on the numbers quoted in this file

Metagame figures cited below (usage percentages, Worlds team counts, how many
Pokemon Smogon covers) are a **snapshot taken 2026-08-29, Regulation M-B /
Season M-5, Worlds 2026 complete through the Final in all three divisions**.
**The ladder is on M-C now, and the usage sources are NOT in the same
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
- **Pikalytics is NOT a source any more (player, 2026-09-27).** It did move to
  M-C, under a new format code the fetcher never asked for, but its numbers do
  not say what they measure: its move percentages sum to ~180 per Pokemon
  (neither 400 per set nor 100 per slot - they read like "used in a battle"),
  and its abilities list Trace, Magic Bounce and Psychic Surge on Incineroar
  with no explanation. "Si no es claro con su data entonces no es confiable."
  `fetch_pikalytics.py` and its two data files are deleted. Do not bring it
  back as a source of numbers.
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
4. **Smogon** — the only source with written reasoning. Covers 53 of 308 forms
   (25 in M-B, 28 more only in M-A).
5. **Smogon's Champions calculator** — the only *executable* source. Ground truth
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
