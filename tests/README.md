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
the list, with one line saying what each protects. A test file that is not in
that list never runs in the gate.

## How a test is written

**A check is one line, and Node's own runner judges it** (`node:test`):

```js
const { describe } = require("node:test");
const { check, idle, open, row, build, click } = require("./harness.js");
const { dom, errs } = open({
  box: [row("garchomp", "Garchomp", { trained: true })],
  builds: [build("garchomp", "Garchomp", { box_id: "garchomp" })] });

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
test, so a failure fails the file - no test keeps its own counter or exit code,
because a test that prints its findings and exits 0 lets the gate say "ok" over
them. Sections are `describe()` blocks, so a failure is reported under the
section it broke.

Everything a test needs comes from `harness.js`:

| Name | What it is |
|---|---|
| `open(tables)` | boots the built page on a stubbed ledger. The tables passed are what the ledger holds, and passing any signs the page in. Returns `{dom, errs}` |
| `row(id, name, fields)` | a box row with every column at its plain default, so a test writes only what its case is about |
| `build(id, pokemon, fields)` | the same for a build |
| `click(node)` | a bubbling click |
| `idle()` | one turn of the event loop |
| `until(cond)` | waits for a delay the app chose itself; never throws |
| `ROOT` | the repo, found from the harness file, ending in `/` |
| `page()` | the built page's HTML, for a test that reads it rather than boots it |
| `source()` | every hand-written `tracker/src/` part, joined, for code smells |
| `styles()` / `markup()` | the stylesheets in cascade order, and the markup with its includes expanded - what a person wrote, not what the build made |

What the app writes back lands in `window.__WROTE` (`{op, table, row}`) and
`window.__DELETED` (`{table, col, id}`).

**Nothing waits a guessed number of milliseconds.** `await idle()` finishes
everything the page started: the stubbed ledger answers with promises already
resolved, and the app's own deferred work sits on zero-delay timers. A delay
the app chose itself (the confirm dialog focuses its button after a moment) is
waited out with `await until(cond)`, and the check after it says whether it
held.

`fixture.js` is the deliberately awkward ledger `ledgertest.js` walks: a row
of every shape the app has a branch for. `enginecases.json` holds the damage
cases `pagetest.js` replays, with the ranges `scripts/damage.py` produced.

## The rule these encode

Most of these were written *after* a bug reached the player. A sample of
hand-picked cases keeps missing the thing nobody thought of, so where a full
sweep is cheap - every form through the engine takes seconds - sweep instead
of sampling. And each file opens with a comment saying which bug or rule it
pins; that comment is the long version of the paragraph below.

## What each one is for

### The engine and the data the page reads

**`pagetest.js`** - the damage engine bundled in the page against the same
engine run under Node, over the cases in `enginecases.json` (an item, an
ability on each side, weather, terrain, a screen, a status, a room, a
multi-hit, a resist berry). It is the same code, so they never disagree; when
they do, the bundle is stale - re-run `scripts/build_engine_bundle.py`.

**`sweeptest.js`** - every form in the dex, as attacker and as defender,
through the page's engine. A sample once shipped a Mega naming mismatch
("Mega Glalie" vs "Glalie-Mega") because no sampled case used a Mega. Run it
after a regulation adds forms.

**`burntest.js`** - burn halves a physical hit and leaves a special one alone,
through the page's own engine.

**`consistencytest.js`** - bugs of one shape: a lookup that silently returns
the wrong thing instead of failing. It sweeps the built code for the smells
(a name declared twice, a focus guard outside the one form view) and every
table the page reads for every key it will be asked for - movepools, type
colours, ability text and buckets, stones, dex numbers, engine names, and
every derived index pointing at something real. It is also where a Mega is
checked against the form it belongs to (Mega Floette belongs to
Floette-Eternal, and Raichu-Alola gets no Mega Raichu). Its Python twin is
`scripts/audit_lookups.py`.

**`learnsettest.js`** - a regional form has its own movepool: `learnset()`
looks up the form before the species, so Samurott-Hisui learns Ceaseless Edge.
The species fallback stays, because a Mega has no pool of its own. It sweeps
every form with its own key.

**`spreadtest.js`** - a spread move's x0.75, the moves that also hit your own
partner, and priority. The shipped data is checked against Smogon's engine
target column (Serebii spells one target several ways and gets some wrong),
and the badges against the three places a move row is drawn.

**`abilitytest.js`** - which ability badges which move, through the page's own
`abilityTag`. Every case reached the player: Liquid Voice on Hyper Voice,
Adaptability not on Rain Dance, Contrary not on Protect but on Draco Meteor,
Overheat and Leaf Storm. No defensive rule badges its own movepool.

**`usagetest.js`** - what this Pokemon's players run: the asset carries every
page pokebase paginates in the browser, every move in the picker carries a
percentage, the dropdowns are ordered by usage, and the move column is read
as a share of move slots (it sums to ~100, so a fixed "popular" threshold
would be wrong). It also covers the Worlds medals and history panes.

**`itemstest.js`** - the items pane of the Gear tab: every item in the game's
own groups, with its effect text and its price or its source, ownership as a
row per item, and search over the descriptions.

**`formtest.js`** - what a Pokemon turns into, by stone or by ability. A battle
form gets the same card treatment as a Mega, the test pins the number of
battle forms in Champions so a regulation adding one fails here, and every
name a card can carry has its picture.

### Builds

**`buildlinktest.js`** - a build is its own thing, and `box_id` says which
Pokemon carries it: active in the Champions box, parked in HOME, orphaned when
its row is gone, unbound when it is an idea. A release unbinds rather than
deletes.

**`buildabilitytest.js`** - the ability a build runs and the one it saves. A
`<select>` of one option never fires its own `onchange`, so a single-ability
species (every Mega among them) is resolved and written as a fact, while two
or three abilities stay a choice until he makes it.

**`installtest.js`** - which copy a build is installed on: the dropdown's
closed face is that copy and its card sits under it, the "trained" tag follows
the build on and off a copy, and a team slot with a base build draws the base
form alone.

**`createtest.js`** - creating a record never overwrites one. Build and team
ids are readable (`farigiraf`, `farigiraf-2`), and the database decides
whether one is free: insert, and treat Postgres' 23505 as "taken, try the
next". The fixture runs the race two devices would.

**`pickertest.js`** - the move picker: groups AND together, chips inside a
group OR, a chip's third state excludes, the sort combines with the filters,
and the count line tracks.

**`sptest.js`** - the SP slider survives a drag: several `input` events on the
same node, which a `redraw()` from `oninput` would destroy on the first one.
The arrows and the typed box too.

### Teams

**`teamtest.js`** - six slots and the clauses checked rather than remembered.
A slot points at a build, the item lives on the slot, a team may be
incomplete, and the fixture breaks both clauses on purpose. Also the slot
picker's search and filters, the Speed and types views, and the list.

### The box, HOME and the GTS

**`gtstest.js`** - a completed GTS trade is an exchange: what you gave leaves,
what you got arrives, and closing an offer updates its row.

**`gtsorigintest.js`** - only a Pokemon that can leave the game is offered for
deposit. Champions origin, a rental, and a missing origin are all locked.

**`releasetest.js`** - only what the game can release is offered: never a
HOME-origin Pokemon from the Champions box, and never one of the last six
Champions-origin Pokemon.

**`homelisttest.js`** - the HOME box opens on twelve rows, a button offers the
rest and folds them again. The shared fixture is too small to ever show that
button.

**`dextest.js`** - the dex checklist: what is still missing, one copy per
species, easiest first. A species already in HOME is done even when a copy is
also in the Champions box.

### The whole page

**`ledgertest.js`** - the only test that boots a ledger with rows in every
table (`fixture.js`) and walks every tab. It asserts no error of any kind, and
that the awkward branches actually ran - a fixture that quietly stopped
covering its case would still pass.

**`profiletest.js`** - the Settings tab: one editable field, VP stored
nowhere, every derived line present, what changes mid-battle, and the
diagnostics.

**`findtest.js`** - the search view: "+ Move" runs the same filters as the
build editor, every ability carries a bucket that agrees with the rule table,
and "in my box" is two independent flags over the two boxes.

**`overlaptest.js`** - the algorithm behind "nothing painted on top of
anything else". jsdom lays nothing out, so the real screens are swept on the
device by the diagnostics button; this feeds the sweep rectangles it controls
and checks it finds a planted collision, ignores the look-alikes, and stays
linear.

### The stylesheet

**`tokenstest.js`** - the dark theme is written twice in `styles/tokens.css`
(once for the system setting, once for the button, because CSS cannot OR a
media query with a selector). This fails when one block changes and the other
does not.

**`tintdirtest.js`** - no card tint is an exactly vertical gradient. Firefox's
renderer (Waterfox too) paints the seam of one twice, a bright line Edge never
shows; the tints run at 179.9deg and this pins it.
