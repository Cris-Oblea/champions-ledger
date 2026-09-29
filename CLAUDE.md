# Working notes for Claude

This file is loaded into every request, so it holds only what is true in every
session. Everything else loads when it is needed - see "Where the rest lives".

## The one rule that matters

This project is about **Pokemon Champions and nothing else**: a standalone
battle game with a restricted roster, a reduced item pool and **rebalanced
moves** (base power, accuracy and effects differ from every other entry).

- **Never answer from general Pokemon knowledge.** Read `data/db/`, `data/meta/`
  or `scripts/query.py`. If something is not in the database, say so and fetch
  it; never fill the gap from memory.
- Read every source from its **Champions** page, never another game's
  (Freeze-Dry freezes in Scarlet/Violet and does not here).
- **PP is rescaled globally**, so a PP difference is never a rebalance. Compare
  BP, accuracy and effects instead.
- **Rules the player confirmed in game outrank every scraped source.** They are
  in the `champions-rules` skill.
- Format is **VGC**: doubles, bring 6 / pick 4. No singles data, no
  Terastallization.

## Where the rest lives

| When | Load | What is in it |
|---|---|---|
| **Any game question**: battles, teams, builds, moves, spreads, items, Megas, damage, the meta, what to train or bring | the **`champions-rules`** skill | clauses, SP, Megas, in-game rulings, damage conventions, sources, playstyle, how Pokemon are obtained |
| Fetchers, `build_db.py`, `query.py`, name matching, refresh | `.claude/rules/data-pipeline.md` | every parsing/name gotcha already solved, the watchlists, the regulation-drop recipe |
| `tracker/`, `tests/`, the app's build scripts | `.claude/rules/tracker-app.md` | the builds model, descriptions and tags, the page's structure, the engine |
| Supabase, backups, migrations, workflows | `.claude/rules/ledger.md` | what Claude may read and how, origin, keys, the backup |
| Any documentation file | `.claude/rules/docs.md` | what goes where, README rules, the doc gate |

The rule files load by themselves when a matching file is opened with the
**Read** tool. When working through Bash instead, Read the rule file first.
Invoke the skill before the first game answer of a session, even a quick one.

`STATUS.md` is where the project stands, `analysis/history.md` what happened
session by session, and `analysis/*.md` the individual investigations. Read
them when a question needs them, not by default.

## Rules that apply to every answer

- **Species Clause and Item Clause**: no two Pokemon on a team share a species
  or an item. So an item is a team decision, and **builds never record items**
  (a Mega Stone in `mega` is the one exception).
- **Stat Points**: 66 total, max 32 in a stat. An SP investment is judged
  **only** by whether it changes a real threat's KO count, and `damage.py` is
  what says so.
- **One Mega Evolution per battle**, however many stones the team carries.
  Judge a species on its Mega line (stats, typing and ability can all change).
- **Never propose a Pokemon he does not own**, and say whether it is permanent
  or a rental. A rental cannot be trained. Pokemon GO to HOME is the one route
  to a chosen species, so ask rather than rule one out.
- **Never assert that something survives or dies without running
  `damage.py`.**
- A build's VP cost is part of every recommendation. The costs are rules, in
  `scripts/ledger.py`: SP 5, move 250, nature 500, ability 500, Mega Stone 2000,
  keeping a rental 2500. What he HAS in VP is not tracked - ask.

## His state lives in the app, and Claude can read it

The box, HOME, stones, items, builds and teams are in the Supabase ledger he
edits from his phone. **Never ask him to restate it, never restate or audit it,
and never say it is unreachable** - query it:

```bash
python scripts/ledger.py                     # box, HOME, stones, items, builds, teams
supabase db query "select ..." --linked      # anything else (CLI already logged in)
```

Do not volunteer what to release. The repo holds no copy of the ledger.

## Tools

```bash
python scripts/query.py brief <pokemon>      # every source at once
python scripts/query.py move <move>          # Serebii + Smogon text, side by side
python scripts/query.py owned                # the box, with both Mega lines
python scripts/query.py types <pokemon|types> / resist <types> --owned
python scripts/damage.py <atk> "<move>" <def> [--engine smogon] [--single-target]
python scripts/damage.py --selftest          # after touching the calculator
```

A `CONDITIONAL:` or `ABILITY not modelled:` line means the number is not final:
rerun with `--engine smogon`. Spread moves take x0.75 unless `--single-target`.

**Source hierarchy**: Serebii (rules), then pokedata.ovh (tournaments, three
divisions never pooled, Masters by default), then pokebase (live ladder), then
Smogon (the only prose), then Smogon's calc (arithmetic). Say which source, and
which regulation, a number came from.

## Working on the repo

- The player plays in **English** and chats in Spanish. Files, data and docs
  are English.
- `main` is protected: branch, open a PR, and the gate must pass
  (`python scripts/daily.py`). A merge deploys the app.
- A change to what the app IS goes into `README.md` in the same PR. Its counts
  are generated (`scripts/build_docs.py`), never typed.
- When a decision reverses, add it to `DECISIONS` in `scripts/check_docs.py` in
  the same commit, so no document can go on stating the old one.
- Edit the parts in `tracker/src/`, never `tracker/dist/` (generated) or
  `index.template.html` (a shell of markers).
- Never commit a ledger snapshot, and never put a `service_role` /
  `sb_secret_` key near the page. The repo is public.
- **This file has a size budget** that the gate enforces. A new rule goes to
  the narrowest file in the table above, not here.
