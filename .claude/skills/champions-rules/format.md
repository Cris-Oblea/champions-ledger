# Format, clauses, items and Stat Points

## The one rule that matters

This project is about **Pokemon Champions and nothing else**. Champions is a
standalone battle game with its own regulation: a restricted roster, a reduced
item pool, and **rebalanced moves** — base power, PP and secondary effects
differ from Scarlet/Violet and every other entry.

So: never answer from general Pokemon knowledge. Numbers from the console games
are wrong here often enough to matter (e.g. in Champions, Body Slam is 16 PP,
Aerial Ace is 60 BP with 101 accuracy). Always read `data/db/` or `data/meta/`.

**PP is rescaled globally, so never read a PP difference as a rebalance.**
Of the **512** useable moves, **510** carry one of only **four** PP values — 8,
12, 16 or 20 (verified 2026-09-27: 90 / 188 / 102 / 130). The two exceptions
are Struggle and Revival Blessing, both **1**, which is also their main-series
value. The rescale is regular enough to vote with: main-series 5 -> 8, 10 -> 12,
15 -> 16, 20 and up -> 20, and `audit_sources.py` uses it as the fourth voice
on a PP dispute. Where the sources disagree on a number, the decided value and
its reason live in `build_db.MOVE_RULINGS` - Night Slash is 16 there, not
Serebii's 20 (the only 15-PP move Serebii had at 20). The player's reading, and it
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

**Player's rule (2026-08-29): do not record items in a BUILD at all, not even
as a ranked list.** Items are argued once, when the six Pokemon of
a team are fixed. With ~30 trained Pokemon, weighing an item pool per build is
work that gets thrown away, and the Item Clause means most of those preferences
cannot coexist anyway. The one exception is a **Mega Stone**, which lives in the
build's `mega` field because the stone is what creates the form. When an item
interacts with a build's own mechanics — a Choice item on a set that is three
quarters status moves, an HP-draining item on a recoil attacker — record that as
a `build_constraint`, which is a fact about the build, not an item preference.

**An item lives on a TEAM SLOT**, in the app, with the one-line reason it got
that item. The picker greys out anything another slot holds, so the Item Clause
is enforced where the choice is made.

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
