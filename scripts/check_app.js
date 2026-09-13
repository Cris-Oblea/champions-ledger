/* Checks the tracker's own script for the mistakes that keep reaching the
 * player. `node --check` catches none of these: they are all legal JavaScript
 * that simply does the wrong thing.
 *
 *   node scripts/check_app.js
 *
 * 1. A `var` declared twice in the same scope. Legal, and the second silently
 *    overwrites the first. It shipped: renderAll() had `var cap = capacity()`
 *    for the box limit and, ten lines later, `var cap = 12` for how many HOME
 *    rows to show - so the full-box warning read "48/12".
 *
 * 2. A CALC.* switch the screen sets that the engine never reads. That shipped
 *    too: a Life Orb toggle and a "Burned" toggle stayed on screen after the
 *    hand-written engine was replaced by Smogon's, looking like controls and
 *    doing nothing at all.
 *
 * 3. An element id the script reaches for that the markup does not contain.
 */
const fs = require("fs");
const path = require("path");

/* The app is thirteen files under tracker/src/ that the build concatenates
   into one script, so the thing to check is that CONCATENATION - a name that
   two parts each declare is invisible in either file on its own, and is the
   mistake the split makes easiest. Read them in the same order the build does,
   and the markup beside them, which is where the element ids live. */
const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, "tracker", "src");
const src = fs.readFileSync(path.join(SRC, "markup.html"), "utf8");
const app = fs.readdirSync(SRC).filter(f => f.endsWith(".js")).sort()
  .map(f => fs.readFileSync(path.join(SRC, f), "utf8")).join("");

let problems = 0;
function fail(msg) { problems++; console.log("  " + msg); }

/* Brace depth, counted character by character. Counting how many "function("
   appear before a point is a running total, not a depth - the first version of
   this check did exactly that and missed the very bug it was written for.
   Strings and comments are skipped so a brace inside one cannot shift it. */
function declarations(code) {
  const out = [];
  let depth = 0, i = 0, scopeSeq = 0, pending = 0;
  const stack = [0];
  const NL = String.fromCharCode(10);
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < code.length && code[i] !== q) {
        if (code[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== NL) i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "*") {
      const j = code.indexOf("*/", i);
      i = j < 0 ? code.length : j + 2;
      continue;
    }
    /* A new FUNCTION is a new scope, and two callbacks can sit at the same
       brace depth while being completely separate - which is why depth alone
       produced false positives on drawStones and gtsSheet. Each `function`
       keyword opens a scope id that its braces carry. */
    if (code.startsWith("function", i) && !/[\w$]/.test(code[i + 8] || "") &&
        (i === 0 || !/[\w$.]/.test(code[i - 1]))) {
      pending = ++scopeSeq;
      i += 8;
      continue;
    }
    if (c === "{") {
      depth++;
      stack.push(pending || stack[stack.length - 1] || 0);
      pending = 0;
      i++;
      continue;
    }
    if (c === "}") { depth--; stack.pop(); i++; continue; }
    if (code.startsWith("var ", i) && (i === 0 || !/[\w$.]/.test(code[i - 1]))) {
      const m = /^var\s+([A-Za-z_$][\w$]*)/.exec(code.slice(i));
      if (m) out.push({ name: m[1], scope: stack[stack.length - 1] });
    }
    i++;
  }
  return out;
}

console.log("duplicate var in the same scope");
{
  const fnRe = /\bfunction\s+(\w+)\s*\(/g;
  const bounds = [];
  let m;
  while ((m = fnRe.exec(app))) bounds.push([m.index, m[1]]);
  bounds.push([app.length, null]);
  for (let k = 0; k < bounds.length - 1; k++) {
    const name = bounds[k][1];
    const body = app.slice(bounds[k][0], bounds[k + 1][0]);
    const seen = new Set();
    for (const v of declarations(body)) {
      const key = v.name + "@" + v.scope;
      if (seen.has(key)) {
        fail(name + '(): "var ' + v.name + '" declared twice at the same ' +
             "scope - the second silently overwrites the first");
      }
      seen.add(key);
    }
  }
  if (!problems) console.log("  none");
}

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

console.log("");
if (problems) {
  console.log(problems + " problem(s)");
  process.exit(1);
}
console.log("clean");
