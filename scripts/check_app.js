/* Checks the tracker's own script against the two things it must agree with,
 * which no linter can see: its engine and its markup.
 *
 *   node scripts/check_app.js
 *
 * 1. A CALC.* switch the screen sets that the engine never reads. That shipped:
 *    a Life Orb toggle and a "Burned" toggle stayed on screen after the
 *    hand-written engine was replaced by Smogon's, looking like controls and
 *    doing nothing at all.
 *
 * 2. An element id the script reaches for that the markup does not contain.
 *
 * 3. A class or id the stylesheet styles that no script or markup uses -
 *    stylelint reads the CSS alone, so a rule whose element was deleted
 *    stays valid CSS forever.
 *
 * It used to make two more checks - a `var` declared twice in one scope, and a
 * part using a name it never imported - by hand-rolled scope analysis. ESLint
 * makes both now (`no-redeclare`, `no-undef`) and makes the second one
 * properly: the hand-rolled version only reported a name some other part
 * EXPORTED, so a private function called across files, and a name that no
 * longer existed anywhere, could both reach production.
 */
const path = require("path");

/* The app's parts, read as one text, and the markup beside them - which is
   where the element ids live. */
const ROOT = path.dirname(__dirname);
const harness = require(path.join(ROOT, "tests", "harness.js"));
const src = harness.markup(ROOT);
const app = harness.source(ROOT);

let problems = 0;
function fail(msg) { problems++; console.log("  " + msg); }

console.log("CALC switches the engine ignores");
{
  const before = problems;
  const eng = app.slice(app.indexOf("function engineCalc()"),
                        app.indexOf("function calcSideCtl("));
  const set = new Set();
  for (const m2 of app.matchAll(/CALC\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) set.add(m2[1]);
  const structural = new Set(["atk", "def", "move", "gameType"]);
  for (const k of [...set].sort()) {
    if (structural.has(k)) continue;
    if (!eng.includes("CALC." + k)) {
      fail("CALC." + k + " is set by the screen but never reaches the engine");
    }
  }
  if (problems === before) console.log("  none");
}

console.log("element ids used but not in the markup");
{
  const before = problems;
  const ids = new Set([...src.matchAll(/id="([^"]+)"/g)].map(m3 => m3[1]));
  const dynamic = new Set(["pkNote", "whoBtn", "atkBudget", "defBudget"]);
  for (const m4 of app.matchAll(/\$\("([^"]+)"\)/g)) {
    if (!ids.has(m4[1]) && !dynamic.has(m4[1])) {
      fail('$("' + m4[1] + '") has no matching id in the markup');
    }
  }
  if (problems === before) console.log("  none");
}

console.log("CSS classes and ids nothing uses");
{
  const before = problems;
  /* Selectors only: comments and declaration blocks out first, so a url(),
     a hex colour or a number with a dot is never read as a class. */
  const selectors = harness.styles().replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\{[^{}]*\}/g, "{}");
  const words = new Set((app + src).match(/[\w-]+/g));
  /* Built by concatenation, so no source spells them whole: the retype layers
     ("i" + n) and their count ("n" + n) in ui/card.js, and the Mega marks
     ("mk-" + letter) beside them. */
  const dynamic = /^(i\d|n\d|mk-\w+)$/;
  const used = new Set([...selectors.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].map(m5 => m5[0]));
  for (const sel of [...used].sort()) {
    const name = sel.slice(1);
    if (!words.has(name) && !dynamic.test(name)) {
      fail(sel + " is styled but no script or markup uses it");
    }
  }
  if (problems === before) console.log("  none");
}

console.log("");
if (problems) {
  console.log(problems + " problem(s)");
  process.exit(1);
}
console.log("clean");
