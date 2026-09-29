---
paths:
  - "README.md"
  - "STATUS.md"
  - "CLAUDE.md"
  - "analysis/history.md"
  - ".claude/**"
  - "scripts/{build_docs,check_docs}.py"
---

# The documentation: what goes where, and the gate that checks it

## Where a rule goes (player, 2026-09-28)

CLAUDE.md is loaded into EVERY request, whole. At 67 KB it cost ~17,000 tokens
per message before anything was asked, which is why it was split. Every other
file below costs nothing until it is needed:

| Kind of rule | Lives in | Loads |
|---|---|---|
| True in every session, whatever the task | `CLAUDE.md` | always |
| The game: format, Megas, in-game rulings, damage, sources, playstyle | `.claude/skills/champions-rules/` | when a game question comes up |
| Fetchers, database build, name matching, refresh | `.claude/rules/data-pipeline.md` | when those files are opened |
| The app, its builds model and its tests | `.claude/rules/tracker-app.md` | when `tracker/` or `tests/` is opened |
| Supabase, what Claude may read, the backup | `.claude/rules/ledger.md` | when those files are opened |
| Where docs go, and the doc gate | this file | when a doc is opened |
| Where the project stands | `STATUS.md` | when read |
| What happened, session by session | `analysis/history.md` | when read |

A new rule goes to the narrowest place that will still be loaded when it
matters. A new game rule gets its full text in the matching skill file AND one
line in `SKILL.md`'s index. Anything that only matters in one directory never
goes to CLAUDE.md.

**CLAUDE.md and STATUS.md have size budgets, and the gate enforces them**
(`check_docs.py`, `BUDGETS`). Going over one means something belongs elsewhere
(the table above), not that the budget should grow. STATUS.md is the current
state only: when a session's account stops being current, it moves to
`analysis/history.md`.

`check_docs.py` watches every file in the table, so a superseded decision is
caught wherever it moved to.

**It also runs the moment a doc is edited**, not only at push: a PostToolUse
hook in `.claude/settings.json` calls `check_docs.py --hook` after every Edit or
Write of a `.md` file. It prints nothing, and so costs no tokens, while
everything passes. A problem comes back as exit 2, which Claude Code shows to
Claude straight away. The same hook guards the auto-memory index, which the gate
never sees (it lives in the user's Claude folder, not the repo): every link
resolves, every memory is linked, and the index stays under `MEMORY_BUDGET`. Edits made through Bash skip the hook, and the pre-push
gate still catches those.

## The README is the front door, and it is checked

**Every change that alters what the app IS goes into `README.md` in the same
commit (player, 2026-09-13).** The repo is public now, so that file is what
anyone sees first - and by the time it was read it claimed 308 forms against a
real 345, named a regulation two versions old, and told the reader to hand-edit
a file the app had replaced.

The counts are therefore **generated**, never typed: `scripts/build_docs.py`
writes them between `<!-- COUNTS:START -->` markers, `--check` is one of the
gate's checks in `daily.py`, and `refresh.py` regenerates them every night. A
drifted README blocks the deploy exactly like a failing test.

The PROSE is still yours to write. What belongs there is what the project IS -
the app's tabs, the sources, how it stays current, the rules of the format -
not a changelog. When a feature lands, describe it there in the same pull
request.
