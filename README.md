# Pokemon Champions — Cross-Source Battle Database

A local, offline-queryable database for **Pokemon Champions only**.

Champions is its own game with its own rules: a restricted roster, a reduced item
pool, rebalanced moves (different base power, PP and secondary effects than the
console games), a Stat Point system instead of EVs, and paid training. Data from
Scarlet/Violet or any other entry is **not** mixed in anywhere — every number
here was pulled from a Champions-specific source.

Format is **VGC**: doubles, bring 6 / pick 4.

---

## Quick start

```bash
python scripts/query.py brief Ceruledge             # full dossier, all sources
python scripts/query.py moves --flag sound          # every sound move
python scripts/query.py moves --priority +          # every priority move
python scripts/query.py counter-priority            # what shuts priority down
python scripts/query.py moves --flag bullet --learners
python scripts/query.py pokemon Garchomp            # card + Smogon analysis
python scripts/query.py ability Bulletproof         # effect + who carries it
python scripts/query.py item "Focus Sash"
python scripts/query.py usage --top 30              # ladder usage
python scripts/query.py usage --owned               # ...limited to your box
python scripts/query.py speed --min 100             # speed tiers
python scripts/query.py worlds --usage              # Worlds 2026 Masters aggregate
python scripts/query.py worlds --usage --division all   # Masters vs Seniors vs Juniors
python scripts/query.py worlds --top 8              # top teams, full sets
python scripts/query.py owned                       # your box vs the meta
```

Run `python scripts/query.py <command> -h` for all filters.

---

## What is in here

| File | Rows | What it holds |
|---|---|---|
| `data/db/pokemon.json` | 308 | Every legal form: types, base stats, abilities, Megas |
| `data/db/moves.json` | 901 | Champions move data + 15 flags + who learns it |
| `data/db/abilities.json` | 200 | Champions ability text + carriers |
| `data/db/items.json` | 181 | Items and Mega Stones with VP prices |
| `data/db/learnsets.json` | 231 | Reverse index: Pokemon → movepool |
| `data/db/smogon_basics.json` | — | Smogon's own move/item/ability/flag tables |
| `data/meta/usage_pokemon.json` | 321 | Ladder usage % per Pokemon |
| `data/meta/usage_moves.json` | 501 | Ladder usage % per move |
| `data/meta/usage_abilities.json` | 192 | Ladder usage % per ability |
| `data/meta/usage_items.json` | 139 | Ladder usage % per item |
| `data/meta/speed_tiers.json` | 84 | Base speed → real speed at each investment |
| `data/meta/smogon_analyses.json` | 323 | Written VGC analyses (53 Pokemon covered) |
| `data/meta/tournament_*.json` | 645 | Final standings + full teamlists, all three Worlds divisions |
| `data/meta/pikalytics_*.json` | 243 | Win rates, top SP spreads, 2-/3-Pokemon cores |
| `data/meta/teams.json` | 33 | Community teams (secondary; Worlds data is better) |
| `inventory/inventory.json` | — | Your box, stones, items and VP costs |

The 15 move flags are the reason cross-queries work:
`contact, sound, punch, biting, snatchable, slicing, bullet, wind, powder,
metronome, gravity, defrosts, magic_coat, protect_blocks, mirror_move`.

---

## Sources, and what each one is good for

| Source | Role |
|---|---|
| **Serebii** (`/pokemonchampions/`, `/pokedex-champions/`, `/attackdex-champions/`) | Ground truth for rules: what exists, what it does, exact Champions numbers |
| **pokebase.app** | Live ladder usage, per-Pokemon move/item/ability/nature/teammate splits, speed tiers |
| **pokedata.ovh** | Official tournament standings with complete teamlists (ability, item, nature, all 4 moves) |
| **Pikalytics** (`/ai/pokedex/...`) | Win rates, top SP spreads, and 2-/3-Pokemon cores — the cores exist nowhere else. Lags the live season |
| **Smogon** (`/dex/champions/`) | The only source with *reasoning* — why these stat points, why this move, what else works. Covers 53 Pokemon |

### pokebase vs Pikalytics

Both break down usage per Pokemon; they are not redundant.

- **pokebase** is current (Regulation M-B, live ladder) and is the better default
  for "what is being played right now". It gives ability / nature / item /
  teammate percentages and the speed-tier chart.
- **Pikalytics** adds three things pokebase does not: **win rate** per Pokemon,
  the **most common SP spread** with its share of builds, and **team cores**
  (which pairs and trios appear together, with counts). Its Champions datasets
  are stamped `2026-05` and the ladder format code still says season 3, so its
  raw usage numbers trail pokebase — use it for spreads, win rates and cores,
  not for "what is popular today".

### On Smogon-style written analysis

Smogon is the only site publishing per-Pokemon prose for Champions (why a
spread, what else the slot can run, checks and partners), and it covers 53 of
308 forms (25 in Regulation M-B, 28 more only in M-A). Everything else checked — Victory Road, ChampTeams, MetaVGC,
Stratagem, VGC Team Report, Pokemon Zone — publishes team lists, tier lists or
general teambuilding guides, not per-Pokemon analysis.

For anything Smogon has not covered, `query.py brief <pokemon>` assembles the
same raw material an analysis is written from: real Worlds sets with their item
/ ability / nature / move distributions, the partners it is actually played
next to, its speed tier and its neighbours there.

---

## Champions rules worth remembering

**Current regulation:** M-B (17 Jun 2026 – 9 Sep 2026). Season M-5 (5 Aug – 9 Sep 2026).
Regulation M-A ran 8 Apr – 17 Jun 2026.

**Ranks:** Poke Ball → Great Ball → Ultra Ball → Master Ball → Champion.
Each tier runs Rank 4 up to Rank 1. Master ranks 3–1 and Champion Tier open a
week after a season starts. 300 VP per win.

**Training costs (VP):**

| Change | Cost |
|---|---|
| SP change | 5 |
| Move | 250 |
| Nature | 500 |
| Ability | 500 |

Observed in-game 2026-08-29. Serebii's training page still lists the launch
prices (2 / 100 / 200 / 400) and is out of date — use `inventory.json`.

A Training Ticket makes one training free. IVs cannot be changed.

**Other costs:** Mega Stone 2000 VP · keep a rental Pokemon 2500 VP ·
most held items 700–1000 VP.

**Stat Points (replaces EVs):** **66 points total, max 32 in one stat.**
Verified against every Smogon and pokebase spread. 5 VP per SP change.

**Item Clause:** no two Pokemon on a team may hold the same item (0 of 388
Worlds teams repeat one). Items are therefore a team-level decision, settled
once all six slots exist — not a fixed part of an individual build.

**Mega Evolution:** a team of 6 can hold more than one Mega Stone (most Worlds
teams held two), but **only one Pokemon may Mega Evolve per battle**. The second
stone is matchup flexibility at team preview, not a second active Mega.

**Abilities are timed:** an ability that only arrives on Mega Evolution (Contrary
on Mega Staraptor) is absent on turn 1, when Intimidate has already fired. An
ability present from entry (Defiant on Kingambit) punishes it immediately.

**Not in the game:** no Legendary or Mythical Pokemon.

---

## Updating

```bash
python scripts/fetch_serebii.py all      # rules, dex, movedex (cached)
python scripts/build_db.py               # rebuild data/db/*
python scripts/fetch_pokebase.py         # usage + speed tiers
python scripts/fetch_pikalytics.py       # win rates, SP spreads, team cores
python scripts/fetch_smogon.py           # VGC analyses
python scripts/fetch_tournament.py       # latest Worlds Masters round + teamlists
python scripts/fetch_tournament.py --division seniors
python scripts/fetch_tournament.py --division juniors
python scripts/audit_forms.py            # check every form/gender/Mega is covered
python scripts/test_norm.py              # name matching across the five sources
```

Everything caches raw HTML/JSON under `data/raw/`, so re-runs only fetch what is
new. For a different event:

```bash
python scripts/fetch_tournament.py --tid 0000191 --division masters
```

Edit `inventory/inventory.json` by hand as your box changes, then re-run
`python scripts/query.py owned`.
