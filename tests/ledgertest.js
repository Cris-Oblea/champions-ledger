/* The app, booted on a ledger that HAS rows, with every tab drawn.
 *
 * The other tests stub Supabase empty, so the login gate stays up and every
 * branch that draws something only when there is something to draw never runs.
 * That is how missing imports once reached the live page - `note is not
 * defined`, thrown by the GTS panel and the duplicate report the moment real
 * data arrived - with every other test green.
 *
 * So this one signs in, loads tests/fixture.js, walks every tab, and asserts
 * that the page produced no error of any kind. Then it asserts that the awkward
 * branches ACTUALLY RAN - a fixture that has quietly stopped covering the thing
 * it was written for is worse than no fixture, because it still passes.
 */
const { describe } = require("node:test");
const { check, idle, click } = require("./harness.js");
const { boot } = require("./fixture.js");

const { window: w, errors } = boot();

/* Every tab in the bar, plus the two editor views the tabs open into. Drawing
   is what runs the code; a tab nobody visits is a tab nobody tests. */
const TABS = ["box", "home", "builds", "calc", "find", "gear", "trainer"];

const d = w.document;
/* the page's last error since `before`, or "ok" if it threw nothing */
const newError = before => errors.length === before ? "ok" : errors[errors.length - 1];

async function loads() {
  describe("the ledger loads", () => {
    check("the sign-in gate closed (there is a session)", d.getElementById("gate").hidden, true);
    /* the box is drawn in three lists by origin, which is the app's own answer
       to "what can leave the game" - so the count is across all three */
    const boxRows = ["listHomeOrigin", "listChampOrigin", "listRent"]
      .reduce((n, id) => n + (d.getElementById(id) || { children: [] }).children.length, 0);
    check("the box's three lists have rows", boxRows, 10);
    check("and so does HOME", d.getElementById("listHome").children.length > 0, true);
    check("no error while loading", errors.length ? errors[0] : "none", "none");
  });
}

async function everyTab() {
  await describe("every tab draws", async () => {
    for (const t of TABS) {
      const before = errors.length;
      w.go(t);
      await idle();
      const view = d.getElementById("v-" + t);
      check(t + ": visible and error-free",
         (view && !view.hidden ? "" : "not shown ") +
         (errors.length === before ? "" : errors[errors.length - 1]) || "ok", "ok");
    }
  });
}

async function dataBranches() {
  /* ---- the branches this fixture exists for -------------------------------
     Each of these only runs because the ledger is awkward. If one stops
     drawing, the fixture has stopped protecting the code that threw. */
  await describe("the branches that only exist with data", async () => {
    w.go("box");
    await idle();

    const gts = d.getElementById("listGts");
    check("the GTS panel drew", !!gts && gts.children.length > 0, true);
    check("with the three open offers, and the closed one out of it",
       d.getElementById("nGts").textContent, "3/3");
    check("the closed one is in the history",
       d.getElementById("nGtsHist").textContent, "1");
    check("and it warns that all 3 slots are taken",
       /All 3 GTS slots are in use/.test(gts.innerHTML), true);
    check("the add button is disabled",
       d.getElementById("gtsAdd").disabled, true);

    const dupe = d.getElementById("dupeBlock");
    check("the duplicate report drew", !!dupe && !dupe.hidden, true);
    const dnote = d.getElementById("dupeNote");
    /* two, not three: a HOME-origin copy is never offered for release */
    check("with its two notes (rental, Champions origin)",
       dnote ? dnote.children.length : 0, 2);
    check("and the HOME-origin Garchomp is not in it",
       /Garchomp/.test(d.getElementById("listDupeHome").textContent), false);
    check("and it names the build kept as an idea",
       /Kingambit/.test(dnote ? dnote.innerHTML : ""), true);
  });
}

async function ownedRows() {
  /* stones and items are rows (migration 6), and the Items tab is where that
     is visible - a stone owned for a species that is not in the box is the
     "dead weight until it arrives" line. */
  await describe("what he owns, row by row", async () => {
    w.go("gear");
    await idle();
    check("the stones are counted from their table",
       /3 of \d+/.test(d.getElementById("stoneNote").textContent), true);
    check("and it flags the one with no species in the box",
       /dead weight until it arrives/.test(d.getElementById("stoneNote").textContent),
       true);
    check("the owned items come from theirs",
       w.S && Object.keys(w.S.items).length, 4);
    w.go("box");
    await idle();
  });
}

const link = id => w.buildLink(id).state;

async function buildStates() {
  /* the four build states: active, parked, orphan, unbound */
  describe("the four states of a build", () => {
    check("kingambit -> active", link("kingambit"), "active");
    check("iron-hands -> unbound (an idea, not a fault)", link("iron-hands"), "unbound");
    check("camerupt -> orphan (its row no longer exists)", link("camerupt"), "orphan");
  });
}

async function sheetsOnData() {
  /* a sheet is where most of the app's drawing actually happens */
  await describe("the sheets open on real data", async () => {
    let before = errors.length;
    w.pokeSheet({ _id: "kingambit", name: "Kingambit", location: "champions",
                  status: "permanent", origin: "champions" });
    await idle();
    check("a Pokemon's sheet", newError(before), "ok");
    w.closeSheet();

    /* ONE CHAMPIONS HAS NEVER HEARD OF. Its sheet must read the outside row
       (types, BST, stats, abilities), not the Champions row, which for this
       Pokemon does not exist. The tag says it cannot come into the game; the
       facts are what a keep-or-trade decision is made on, so both have to be
       there. */
    before = errors.length;
    w.pokeSheet({ _id: "bulbasaur-home", name: "Bulbasaur", location: "home",
                  status: "permanent", origin: "home" });
    await idle();
    check("the sheet of one not in Champions",
       newError(before), "ok");
    const osheet = d.getElementById("sheetBody").textContent.replace(/\s+/g, " ");
    check("...says it is not in the dex", /Not in the Champions dex/.test(osheet), true);
    check("...and still lists its types", /Grass/.test(osheet) && /Poison/.test(osheet), true);
    check("...its BST", /318/.test(osheet), true);
    check("...its ability", /Chlorophyll/.test(osheet), true);
    check("...and what damages it, which is the typing's, not the game's",
       /Takes damage/.test(osheet) && /Fire/.test(osheet), true);
    w.closeSheet();
  });
}

const heads = () => [...d.getElementById("sheetBody").querySelectorAll("h2")]
  .map(h => h.textContent.trim());
/* THE BASE FORM'S PANEL. The abilities and the damage table live inside the
   base form's panel, the way each Mega's live inside its own. They still have
   to be on all three doors - which is what this test measures - so they are
   looked for where they live. */
const base = () => {
  const pn = d.getElementById("sheetBody").querySelector(".panel");
  if (!pn) return {abilities: 0, damage: false, stats: false};
  return {abilities: pn.querySelectorAll(".note strong").length,
          damage: /Takes damage/.test(pn.textContent),
          stats: !!pn.querySelector(".statline")};
};
const folds = () => [...d.getElementById("sheetBody").querySelectorAll(".fold")]
  .map(b => b.textContent.trim());
const hasHead = (list, h) => list.some(x => x.indexOf(h) === 0);

async function threeDoors() {
  /* THE THREE DOORS OPEN THE SAME SHEET: Find, the Champions box and HOME.
     The only things that may differ are what is OWNED: origin, shiny,
     trained and the note. */
  await describe("the same sheet through all three doors", async () => {

    w.findDetail(w.byName["Garchomp"]);
    await idle();
    const findHeads = heads(), findFolds = folds(), findBase = base();
    w.closeSheet();

    w.pokeSheet({ _id: "garchomp", name: "Garchomp", location: "champions",
                  status: "permanent", origin: "home" });
    await idle();
    const boxHeads = heads(), boxBase = base();
    w.closeSheet();

    w.pokeSheet({ _id: "garchomp-home", name: "Garchomp", location: "home",
                  status: "permanent", origin: "home" });
    await idle();
    const homeHeads = heads(), homeFolds = folds(), homeBase = base();
    w.closeSheet();

    /* "Mega line" carries a count when there are two (Garchomp has two, and
       the heading says only one may evolve per battle), so headings are
       compared by prefix, not equality. */
    const REF = ["Mega line", "Movepool"];
    REF.forEach(h => {
      check("Find has " + h, hasHead(findHeads, h), true);
      check("...so does the Champions box", hasHead(boxHeads, h), true);
      check("...and HOME", hasHead(homeHeads, h), true);
    });
    /* and what lives in the base form's panel is on all three */
    [["Find", findBase], ["the box", boxBase], ["HOME", homeBase]].forEach(function(x){
      check(x[0] + " explains the abilities in the base panel", x[1].abilities > 0, true);
      check(x[0] + " carries its damage table there", x[1].damage, true);
      check(x[0] + " carries its stats there", x[1].stats, true);
    });

    /* and the box may add NOTHING but what is owned: origin, this copy (shiny /
       trained) and the note. Anything else here is a sheet splitting in two
       again. */
    check("the box only adds what is OWNED",
       boxHeads.filter(h => !hasHead(findHeads, h)).join(", "),
       "Where did it come from?, This copy, Note");
    check("and HOME only adds this copy and the note",
       homeHeads.filter(h => !hasHead(findHeads, h)).join(", "),
       "This copy, Note");
    check("what Smogon wrote is on all three",
       findFolds.concat(homeFolds).filter(t => /What Smogon says/.test(t)).length, 2);
    /* the only things that may differ between doors */
    check("only the box asks about origin",
       boxHeads.indexOf("Where did it come from?") >= 0 &&
       findHeads.indexOf("Where did it come from?") < 0, true);
    check("and only a box keeps a note",
       homeHeads.indexOf("Note") >= 0 && findHeads.indexOf("Note") < 0, true);
  });
}

async function speciesPicker() {
  /* ----------------------------------------- the species picker ----------- */
  /* A field you tap, opening the same searchable sheet the GTS and the
     calculator use - never a <select> of every form in one alphabetical run. */
  await describe("the species picker is searched, not scrolled", async () => {
    w.buildSheet(null, {});
    await idle();
    const field = [...d.querySelectorAll("#v-buildedit .field")]
      .find(f => /^Pokemon$/.test((f.querySelector("label") || {}).textContent || ""));
    check("no dropdown of every form",
       !!field && !field.querySelector("select"), true);
    check("but a card you tap", !!field.querySelector("button.row"), true);
    click(field.querySelector("button.row"));
    await idle();

    const sheet = d.getElementById("sheetBody");
    const inp = sheet.querySelector(".search input");
    check("the sheet has a search box", !!inp, true);
    const names = () => [...sheet.querySelectorAll(".list .row")]
      .map(b => b.querySelector(".rname").firstChild.textContent.trim());
    /* Venusaur, not Bulbasaur: Champions' dex starts there - which is why
       Bulbasaur serves the fixture as "not in Champions" */
    check("and starts in dex order", names()[0], "Venusaur");
    check("with the full card, six stats included",
       !!sheet.querySelector(".list .row .statline"), true);

    const type = t => { inp.value = t; inp.dispatchEvent(new w.Event("input")); };
    type("garchomp");
    check("searches by name", names().join(","), "Garchomp");
    type("zzzz");
    check("what does not exist returns nothing", names().length, 0);
    type("445");
    check("searches by dex number", names().indexOf("Garchomp") >= 0, true);
    type("dragon");
    check("and by type", names().length > 5 && names().indexOf("Garchomp") >= 0, true);
    type("");
    check("emptying it brings them all back", names().length > 100, true);

    /* the box is a FILTER, never a limit: a build for something he does not
       have yet is an idea worth keeping */
    const mine = [...sheet.querySelectorAll(".tog")]
      .find(b => /In your boxes/.test(b.textContent));
    click(mine);
    check("and the box filter leaves only what he has",
       names().sort().join(","), "Charizard,Farigiraf,Garchomp,Gholdengo,Incineroar,Kingambit," +
       "Maushold,Rillaboom,Sinistcha,Sneasler,Whimsicott");
    click(mine);

    type("sneasler");
    click([...sheet.querySelectorAll(".list .row")][0]);
    await idle();
    check("picking one sets it on the build",
       /Sneasler/.test(d.getElementById("v-buildedit").textContent), true);
    w.leaveEditor();
    await idle();
  });
}

async function worldsRows() {
  /* ------------------------------------- Worlds: every row has a sheet ---- */
  /* Many names across the championships are not in Champions' dex (the 2025
     field was full of Calyrex and Koraidon), and each still needs types,
     stats, a BST and a sheet behind it. Floette is the other case: it IS in
     Champions, as Floette-Eternal, the only one the game has. */
  describe("every Worlds row has a sheet behind it", () => {
    const dexNames = new Set(w.DEX.map(p => p.name));
    const home = w.CHAMP.HOME_DEX || {};
    const alias = w.CHAMP.LEARN_ALIAS || {};
    let rows = 0;
    const orphan = [];
    (w.CHAMP.WORLDS || []).forEach(y => {
      Object.keys(y.d || {}).forEach(div => {
        (y.d[div].top || []).forEach(r => {
          rows++;
          const n = r[0], a = alias[n];
          if (dexNames.has(n) || home[n] || (a && (dexNames.has(a) || home[a])))
            return;
          orphan.push(y.y + "/" + div + " " + n);
        });
      });
    });
    check("there are rows to check", rows > 400, true);
    check("none is left without a row", orphan.slice(0, 3).join(", "), "");
    /* and the app's resolver finds them, which is what draws the card */
    check("Floette resolves to the only one the game has",
       (w.anyRow("Floette") || {}).name, "Floette-Eternal");
    ["Calyrex", "Koraidon", "Landorus", "Ogerpon", "Urshifu", "Tatsugiri"]
      .forEach(n => {
        const r = w.anyRow(n);
        check(n + " has types and stats",
           !!(r && r.types.length && r.b.length === 6), true);
      });
  });
}

async function outsideMovepool() {
  /* ------------------------- what the app knows about one not in the game */
  /* The rest of the dex is its own asset, fetched only when one of these
     sheets opens, so here it is simulated as already loaded. It carries the
     movepools, the ROWS of the moves the app does not otherwise ship, and the
     ability text Champions has no entry for. What is checked is that the
     section draws and says where the moves come from. */
  await describe("one not in Champions still lists its moves", async () => {
    w.CHAMP_OUTSIDE = {
      m: {Bulbasaur: ["Tackle", "Growl", "Vine Whip", "Sleep Powder",
                      "Giga Drain", "Mega Drain"]},
      mv: {"Mega Drain": ["Grass", "S", 40, 100, 15]},
      ab: {Chlorophyll: "Doubles Speed in harsh sunlight."}};
    w.findDetail(w.anyRow("Bulbasaur"));
    await idle();
    const sheet2 = d.getElementById("sheetBody").textContent.replace(/\s+/g, " ");
    check("there is a movepool section", /Movepool/.test(sheet2), true);
    check("...and it says where the list comes from",
       /Which moves it learns is main-series/.test(sheet2), true);
    check("...and the moves are there",
       /Giga Drain/.test(sheet2) && /Sleep Powder/.test(sheet2), true);
    /* NOTHING IS DROPPED: a move Champions has in its database but has not
       enabled is shown, marked, rather than left out - moves.json has its
       full row; it is only kept off the pickers, so nothing builds with it. */
    check("...including the one Champions has not enabled", /Mega Drain/.test(sheet2), true);
    check("...and it is marked as such", /not in Champions/.test(sheet2), true);
    check("...and the header says so",
       /1 of them are moves Champions has in its database/.test(sheet2), true);
    w.closeSheet();
  });
}

async function backButton() {
  /* ------------------------------------- the phone's Back button --------- */
  /* The page loads once and everything after is a <section> shown or hidden,
     so without help the only history entry IS the page and Android's Back
     would leave the app. Each layer that opens spends an entry, and Back
     undoes them from the top down. */
  await describe("Back undoes layers, it does not close the app", async () => {
    w.go("find"); w.go("calc");
    w.findDetail(w.byName["Garchomp"]);
    await idle();
    check("with the sheet open", !d.getElementById("scrim").hidden, true);
    /* jsdom implements history.back() but does NOT dispatch popstate for it,
       so the event is fired here the way the browser fires it. The real
       integration - pressing Back closes the sheet - is checked in a real
       browser on the served page, where the button exists. */
    const back = async () => {
      w.dispatchEvent(new w.PopStateEvent("popstate", {state: null}));
      await idle();
    };
    await back();
    check("the first Back closes the sheet", d.getElementById("scrim").hidden, true);
    check("...and does not change tab", w.S.tab, "calc");
    await back();
    check("the second Back returns to the previous tab", w.S.tab, "find");
    /* and it keeps stepping back through where it has been, not to a fixed
       tab: this test has visited every tab before reaching here */
    const before3 = w.S.tab;
    await back();
    check("the third keeps stepping back", w.S.tab !== before3, true);
    check("...and never leaves the app", !!d.getElementById("v-" + w.S.tab), true);
  });
}

async function otherSheets() {
  let before = errors.length;
  w.buildSheet("charizard");
  await idle();
  check("a Mega build's sheet",
     newError(before), "ok");
  w.closeSheet();

  before = errors.length;
  w.teamSheet("rain-ish", null);
  await idle();
  check("a six-slot team's sheet",
     newError(before), "ok");
  w.closeSheet();

  before = errors.length;
  w.gtsPickMine(function () {});
  await idle();
  check("the GTS picker", newError(before), "ok");
  w.closeSheet();

}

(async function () {
  await idle();
  for (const section of [loads, everyTab, dataBranches, ownedRows, buildStates,
                         sheetsOnData, threeDoors, speciesPicker, worldsRows,
                         outsideMovepool, backButton, otherSheets])
    await section();

  check("zero errors in the whole session", errors.join(" | ") || "none", "none");

})();
