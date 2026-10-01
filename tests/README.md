# Tracker tests

Node + jsdom, run against the **built** page (`tracker/dist/index.html`), not
the template - so they test what actually ships. Build it first
(`python scripts/build_tracker_page.py`); `npm ci` at the repo root installs
jsdom.

```bash
node --test "tests/*test.js"   # all of them, in parallel
node tests/teamtest.js         # one
```

The gate runs each file on its own; `BROWSER_TESTS` in `scripts/daily.py` is
the list, with one line saying what each protects.

**A check is one line, and Node's own runner judges it** (`node:test`):

```js
const { describe } = require("node:test");
const { check, idle, open } = require("./harness.js");
const { dom, errs } = open({ box: ROWS, builds: BUILDS });

(async () => {
  await idle();
  await describe("saving a build", async () => {
    click(saveButton());
    await idle();
    check("the build keeps its ability", got(), "Intimidate");
  });
})();
```

`check(label, got, want)` compares the two as strings and is one `node:test`
test, so a failure fails the file - no test keeps its own counter or exit code
(three of them once had none, and the gate printed "ok" over whatever they
found). `open()` boots the page on a stubbed ledger and never needs a Supabase
stub of its own: the tables passed are what the ledger holds, and passing any
signs the page in. What the app sends back lands in `window.__WROTE`
(`{op, table, row}`) and `window.__DELETED` (`{table, col, id}`).

**Nothing waits a guessed number of milliseconds.** `await idle()` is one turn
of the event loop, and that finishes everything the page started: the stubbed
ledger answers with promises already resolved, and the app's own deferred work
sits on zero-delay timers. A delay the app chose itself (the confirm dialog
focuses its button after 30 ms) is waited out with `await until(cond)`, which
never throws - the check after it says whether it held. Sections are
`describe()` blocks, so a failure is reported under the section it broke.
`ROOT` is the repo, for reading a file. `fixture.js` is the deliberately awkward ledger `ledgertest.js` walks.

## What each one is for

**`pagetest.js`** — 16 cases covering an item, an ability on each side, weather,
terrain, gravity, a screen, a status, a room, a multi-hit and a resist berry.
The expected values in `enginecases.json` were produced by
`scripts/damage.py`, so this compares the engine bundled in the
page against the same engine run under Node. They should never disagree: it is
the same code. If they do, the bundle is stale — re-run
`scripts/build_engine_bundle.py`.

**`sweeptest.js`** — every form in the dex, as attacker and as defender, 680
engine calls. This exists because a 16-case sample missed a whole class of bug:
none of those cases used a Mega, so the Serebii→Smogon name mismatch
("Mega Glalie" vs "Glalie-Mega") shipped. The sweep caught that and a second
one nobody had noticed, Indeedee-Female, which Smogon files as `Indeedee-F`.
Run it after any regulation adds forms.

**`gtstest.js`** — a completed GTS trade must be an *exchange*. Adding the
Pokemon you received without removing the one you gave away left a Chesnaught
in the box that no longer existed.

**`sptest.js`** — the SP slider in a build could not be dragged, only clicked
one step at a time. `oninput` called `redraw()`, which rebuilds the whole sheet,
so the element under the finger was destroyed on the first step. The test drives
a drag the way a browser does — several `input` events on the SAME node — and
asserts the node survives all of them; one event would have passed against the
broken version. It also covers the two arrows and the typed 0-32 box.

**`abilitytest.js`** — the ability badges on a move row, called through the
page's own `abilityTag`. Every case is one that reached the player: Liquid
Voice badging nothing on Hyper Voice, Adaptability badging Rain Dance,
Contrary badging Protect — and Contrary badging **nothing** on Draco Meteor,
Overheat and Leaf Storm, because the sentence splitter cut "Sp. Atk" in half
and lost every special-stat move. It also asserts no defensive rule ever
badges its own movepool.

**`spreadtest.js`** — the x0.75 and the ally. Sweeps all 514 useable moves
against Smogon's engine target column (the truth: Serebii spells one target
four ways and gets Burning Jealousy, Misty Explosion and Corrosive Gas wrong),
then checks the badges actually render in the build sheet and in the move
picker, which showed nothing at all before.

**`buildlinktest.js`** — a build belongs to a Pokemon, not to a species: active
in the Champions box, kept-but-inactive when parked in HOME, deleted when the
Pokemon is released. Written because the ledger already had an orphan — the
Camerupt build survived its Camerupt being traded away, since releasing a box
row never touched the build.

**`pickertest.js`** — the move picker's sort and its three filter groups,
driven the way a thumb does it: one chip, then two at once, then a sort on top
of both, then chips off again. It asserts the groups AND together and that the
count line tracks, because a filter combination that silently returns nothing
looks exactly like an empty movepool.

**`findtest.js`** — the search view. That "+ Move" offers the same controls as
the build editor (they share one implementation), that every ability carries a
bucket and the two move-related buckets still agree with the rule table, and
that "in my box" is two independent filters over the two boxes.

**`itemstest.js`** — the Items tab: the game's four groups, every item listed
with its effect text and its price or its source, owned/not-owned toggling that
does not lose the rows already stored, and search over the descriptions. It
also checks the old `[name, [category]]` shape still reads, because that is
what is in the ledger today.

**`learnsettest.js`** — `learnset()` looked up the SPECIES first and the form
second, so every regional form was handed its base form's pool: the app told
the player Samurott-Hisui does not learn Ceaseless Edge or Sucker Punch, and
Rotom-Wash does not learn Hydro Pump. 25 forms were affected and the build
editor offers from the same list, so sets were being picked out of the wrong
pool. The test asserts both halves — the form wins, and the species fallback
still works, because a Mega has no pool of its own — then sweeps every form
that has its own key, since a sample would have missed 24 of the 25.

**`consistencytest.js`** — written after two bugs of the same shape landed on
one day: a lookup that silently returns the wrong thing instead of failing.
`STAT_LABEL` was declared twice and the second declaration won; `learnset()`
resolved the species before the form. So this sweeps the code for both smells
(no name declared twice, no focus guard outside the one form view) and then
every table the page reads, asserting every key it will be asked for is there —
movepools, type colours, ability text and buckets, stones, dex numbers, engine
names, and every derived index pointing at something real.

It also found a third: **`megasFor()` had the same fault**, offering
Raichu-Alola the two Mega Raichu and Slowbro-Galar the Mega Slowbro. Smogon's
roster states which form each Mega belongs to, and it is not always the base
one — Mega Floette belongs to Floette-**Eternal**.

**`burntest.js`** — burn halves a physical attack and leaves a special one
alone. It was reported as "doing nothing", and it was: a dead toggle left over
from the hand-written engine was setting state the real engine never read.

## The rule these encode

Every one of these was written *after* a bug reached the player. A sample of
hand-picked cases keeps missing the thing nobody thought of, so where a full
sweep is cheap — 680 calls take seconds — sweep instead of sampling.

**`homelisttest.js`** — the HOME box opens on twelve rows and a button offers
the rest, then folds them again. The shared fixture holds five HOME rows, so
nothing else ever showed that button; it is also the one control whose redraw
moved when the box drawing left `boot.js` for `tabs/box.js`.
