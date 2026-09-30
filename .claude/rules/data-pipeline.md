---
paths:
  - "scripts/fetch_*.py"
  - "scripts/audit_*.py"
  - "scripts/query.py"
  - "scripts/test_norm.py"
  - "scripts/refresh.py"
  - "scripts/check_regulation.py"
  - "scripts/diff_db.py"
  - "scripts/serebii_text.py"
  - "scripts/net.py"
  - "scripts/smogon_engine.js"
  - "scripts/build_{db,typechart,splits_data,text_facts,statuses,effects,item_facts,item_links,outside_dex}.py"
  - "data/raw/**"
---

# The data pipeline: fetchers, the database build, name matching

**A move is read from its CHAMPIONS page, never another game's (player,
2026-09-27: "al leer un move, siempre la fuente debe ser champions dex o saber
que viene de champions y no de una gen").** Serebii and Smogon both keep one
page per move per game, and they differ: Freeze-Dry freezes in Scarlet/Violet
and does not in Champions. `fetch_smogon.py` asks `gen: "champions"` only; a
move Champions' dex does not describe gets Serebii's attackdex-champions line,
never an older game's text.

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
- **pokebase's GLOBAL tables render only 100 rows per page** and the usage %
  exists only in that rendered HTML — walk `?page=N`.
- **A pokebase PER-POKEMON page paginates the other way, and `?page=N` does not
  exist there** (found 2026-09-15, player: "TIENE PAGES!"). Those sections are
  client components: the server sends every row as props and the buttons slice
  them in the browser, so the rendered HTML holds page 1 for ever and there is
  no URL for page 2. Everything is in the Next.js flight payload — the
  `self.__next_f.push([1,"..."])` chunks, concatenated and unescaped into one
  JSON string. `fetch_pokebase_splits.py:flight()` does that. Rillaboom: 19
  moves over four pages, 26 spreads over six, 19 items over four. Reading the
  markup saw five of each.
- **That page carries TWO datasets with the same headings and they are NOT the
  same numbers.** `Tournament Stats` is teamlists for one regulation, stamped
  with it on the page, and exists for every Pokemon. `Season Stats` is the
  ladder, per season, split doubles/singles, and **is missing entirely for some
  Pokemon** — Rillaboom has none. Kingambit is Defiant 98.6% in one and 94% in
  the other. Anything that finds a heading and keeps the longest run of
  percentages will mix them, which is exactly what happened: the stored file
  had Kingambit's moves summing to 370 and Rillaboom's to 94.
- **And within the tournament block the MOVE column is divided by move SLOTS,
  not by sets.** It sums to ~100 across the whole movepool, so nothing in it
  can pass ~25 and Fake Out at 24.6% means nearly every Rillaboom runs it.
  Items, abilities, natures and spreads are per SET and read directly;
  teammates are per TEAM and sum to ~400, more when a Mega-capable teammate is
  listed twice (base and Mega). Never colour or threshold a move percentage
  against the others. `python scripts/build_splits_data.py --check` asserts all
  four shapes over all 283 Pokemon and runs inside the gate.
- **Do not pipe a fetch script into `head`**; SIGPIPE kills it before it writes.
- **Every download is `net.get()`** (`scripts/net.py`): the browser User-Agent
  and three tries. A caller that can go on without the page catches `net.ERRORS`.
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
  cosmetic — the transformation is real every time. **The app draws all five**
  (player, 2026-09-27: "algunas formas determinan algunas habilidades o
  ataques"): which forms exist and their pictures come from
  `data/db/form_line.json` (`fetch_home_dex.py`, off PokeAPI's form table),
  the numbers from our own rows, and a form that moves a number upstream while
  ours has no row for it stops `build_tracker_data.py`. The same file gives
  every species Champions LACKS its Megas and battle forms.
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
  nothing about the Mega.** Pikalytics (dropped 2026-09-27) filed Megas as their own entries
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

**A third gap, new with M-C, now closed:** Serebii had left the PP and accuracy
of **Double Shock** and **Revival Blessing** (both Pawmot) empty. It has since
filled the PP in (8 and 1); Double Shock's accuracy is still blank there and is
100 by ruling, from pokebase and the main series. **Octazooka** is the mirror
case: flagged useable with no learner at all.

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

## Refresh

```bash
python scripts/fetch_serebii.py all && python scripts/build_db.py
python scripts/fetch_pokebase.py
python scripts/fetch_smogon.py
python scripts/fetch_tournament.py                    # Masters, newest round
python scripts/fetch_tournament.py --division seniors
python scripts/fetch_tournament.py --division juniors
python scripts/fetch_smogon_calc.py                   # Smogon's Champions engine
python scripts/audit_forms.py && python scripts/test_norm.py
python scripts/damage.py --selftest                   # the engine vs Smogon's prose
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

**The app is regenerated from `data/db/`, so a source refresh must reach it.**
`python scripts/refresh.py` walks Serebii → build_db → pokebase →
Smogon → the calculator → pokedata → the audits → `tracker/data.js` →
`tracker/dist/`, and `--regulation` clears the Serebii page cache first
(the trap documented above). The phone gets the new dex when the change is
merged, because the merge is what deploys.
