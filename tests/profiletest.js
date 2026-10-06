/* The Settings tab: one editable number, and everything else derived.

   Hand-typed fields that nothing reads drift (a stored regulation that names
   the previous one). The rule: keep only what the app really uses and what
   only he can know, and derive the rest so it cannot go stale.

   So this asserts the SHAPE, not the values: one input, no VP anywhere, and
   every derived line present and non-empty. */
const { describe } = require("node:test");
const { check, open, source, idle, row, build, one, all, byId } = require("./harness.js");

/* The dates are part of the case: the newest one, the rental's, is what the
   diagnostics have to report as the last ledger write. */
const ROWS = [
  row("garchomp", "Garchomp", {trained:true, updated_at:"2026-09-11"}),
  row("sneasler", "Sneasler", {status:"rental", ord:1, updated_at:"2026-09-12"}),
  row("sableye", "Sableye", {location:"home", origin:"home", ord:2, trained:true})];
const BUILDS = [build("garchomp", "Garchomp", {ability:"Rough Skin",
  nature:"Jolly", stat_points:{hp:0,atk:32,def:0,spa:0,spd:2,spe:32},
  moves:["Earthquake","Rock Slide","Dragon Claw","Protect"],
  updated_at:"2026-09-11"})];

const code = source();
const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;

/** profCounts/profData ARE the <dl>; diagOut is a <div> wrapping one, plus a
   "Copy this" button - so look through to the list either way.
   @param {string} id
   @returns {Record<string, string>} */
const pairs = id => {
  let n = d.getElementById(id);
  if (!n) return {};
  if (n.tagName !== "DL") n = n.querySelector("dl") || n;
  /** @type {Record<string, string>} */
  const out = {};
  /** @type {string | null} */
  let k = null;
  [...n.children].forEach(c => {
    if (c.tagName === "DT") k = c.textContent.trim();
    else if (k) { out[k] = c.textContent.trim(); k = null; }
  });
  return out;
};

/* The open sheet's "In battle" block, as one line of text: the sheet draws
   these forms the way it draws a Mega - sprite, typing, six stats, its own
   damage table - and this reads the whole block. */
const bnote = () => {
  const b = byId(d, "sheetBody");
  const hs = [...all(b, "h2")]
    .filter(x => x.textContent.startsWith("In battle"));
  if (!hs.length) return "";
  let t = hs[0].textContent;
  for (let n = hs[0].nextElementSibling; n && n.tagName !== "H2";
       n = n.nextElementSibling) t += " " + n.textContent;
  return t.replace(/\s+/g, " ");
};

(async () => {
  await idle();
  describe("the header", () => {
    check("is called Settings", one(d, "#v-trainer h1").textContent, "Settings");
    check("and so is the tab",
       [...all(d, "#tabs button, #tabs a")]
         .some(b => b.textContent.trim() === "Settings"), true);
  });

  describe("a single editable field", () => {
    const inputs = [...all(d, "#v-trainer input")]
      .filter(i => i.type !== "file").map(i => i.id);
    check("only box capacity remains", inputs.join(", "), "tCap");
  });

  describe("VP is stored nowhere", () => {
    check("no balance field", !!d.getElementById("tVp"), false);
    check("no VP chip in the header", !!d.getElementById("vpCount"), false);
    check("and the code does not write it", /vp_balance/.test(code), false);
    /* the cost table stays, as pure reference */
    const costs = pairs("costs");
    check("the cost table remains", Object.keys(costs).length >= 8, true);
    check("and a known cost is right", costs["Move"], "250 VP");
  });

  describe("what is derived, and cannot go stale", () => {
    check("box usage beside the capacity",
       /2 of 50 used . 48 free/.test(byId(d, "capUse").textContent), true);
    const hold = pairs("profCounts");
    check("counts the box, bought apart from rentals",
       hold["In the Champions box"], "2 (1 bought, 1 rental)");
    check("counts HOME", hold["In HOME"], "1");
    check("counts builds", hold["Builds written"], "1");
    check("counts stones against the total", hold["Mega Stones owned"].endsWith("of 81"), true);

    const data = pairs("profData");
    /* the regulation is READ from pokebase, never typed - a typed one goes
       stale the day it changes */
    check("the regulation comes from the data", /^M-[A-Z] . since \d{4}-\d\d-\d\d/.test(data["Regulation"]), true);
    check("it says when the ladder usage was fetched",
       /fetched \d{4}-\d\d-\d\d/.test(data["Ladder usage"]), true);
    check("and that it is that regulation's ladder",
       data["Ladder usage"].indexOf(data["Regulation"].split(" ")[0]) > 0, true);
    check("it marks the tournament data as history",
       /M-B/.test(data["Tournament data"]), true);
    check("it counts the dex's forms", /^\d{3} forms/.test(data["Dex"]), true);
  });

  /* The stat line is the form it STARTS in, and Aegislash never attacks in
     that one: Stance Change gives it 140 Attack the moment it uses a damaging
     move, while its stat line says 50. Asserted on BOTH sheets (Find's and
     the box's), because the number would be equally wrong on each. */
  describe("what changes in battle", () => {
    w.findDetail(w.byName["Aegislash"]);
    check("Aegislash flags Blade Forme", /Blade/.test(bnote()), true);
    check("...and that Attack goes from 50 to 140", /Atk 50 . 140/.test(bnote()), true);
    check("...naming the ability", /Stance Change/.test(bnote()), true);
    w.findDetail(w.byName["Palafin"]);
    check("Palafin flags Hero Form", /Atk 70 . 160/.test(bnote()), true);
    w.findDetail(w.byName["Castform"]);
    check("Castform flags the TYPE change",
       /Fire/.test(bnote()) && /Water/.test(bnote()) && /Ice/.test(bnote()), true);
    w.findDetail(w.byName["Garchomp"]);
    check("and a Pokemon that does not change has no block", bnote(), "");
    w.pokeSheet(/** @type {ListedBox} */ ({name:"Aegislash", location:"champions", status:"permanent",
                 origin:"champions", _id:"x"}));
    check("and the box's sheet says the same", /Atk 50 . 140/.test(bnote()), true);
  });

  describe("diagnostics", () => {
    const diag = pairs("diagOut");
    ["Latest deployed", "Regulation", "Ladder usage fetched", "Blob integrity",
     "Last ledger write"].forEach(k => {
      check("reports " + k, !!(diag[k] && diag[k].length), true);
    });
    check("integrity reports nothing empty", /MISSING/.test(diag["Blob integrity"]), false);
    check("the last write comes from the ledger", diag["Last ledger write"], "2026-09-12");
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
