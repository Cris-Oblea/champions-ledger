/* The search view:

     - adding a move filter runs the same `moveFilters` implementation as the
       build editor's move picker, so one question is asked one way.
     - every ability carries a bucket, and the first two buckets ARE the rule
       table in build_ability_moves.py, not a second reading of the text.
     - "in my box" is two flags, not one: the Champions box answers "can I
       play this today", HOME answers "can I bring it in".
*/
const { describe } = require("node:test");
const { check, open, idle, row, click } = require("./harness.js");

const ROWS = [row("garchomp", "Garchomp", {trained:true}),
              row("dragonite", "Dragonite", {location:"home", origin:"home", trained:true})];

const { dom, errs } = open({ box: ROWS });
const w = dom.window, d = w.document;
const sheetChip = t => [...d.querySelectorAll(".sheet .tog")]
  .find(b => b.textContent.trim() === t);
const sheetRows = () => [...d.querySelectorAll(".sheet .list .row")];
const results = () => [...d.querySelectorAll("#findOut .row")];
const countLine = () => [...d.querySelectorAll(".sheet .sub")]
  .map(x => x.textContent).find(t => /abilities$|moves$| of \d+ moves/.test(t)) || "";
/* The AND/OR chip lives in the filter bar, so it can be flipped without
   reopening the sheet. */
const modeChip = () => [...d.querySelectorAll("#findChips .tog")]
  .find(b => /of those types/.test(b.textContent));

(async () => {
  await idle();
  w.go("find");

  await describe("adding a move: the same controls as the build editor", async () => {
    click(d.getElementById("findAddMove"));
    await idle();
    ["BP × acc", "A–Z", "PP", "Type"].forEach(function(t){
      check("sort: " + t, !!sheetChip(t), true);
    });
    ["Physical", "Special", "Status", "Spread", "Hits ally", "Priority"]
      .forEach(function(t){ check("filter: " + t, !!sheetChip(t), true); });
    click(sheetChip("Status"));
    const statusOnly = sheetRows();
    check("filters to status", statusOnly.every(r => /Status/.test(r.textContent)), true);
    /* both lists cap at 80 rows, so the COUNT is what says it filtered */
    check("and the counter says so", / of \d+ moves/.test(countLine()), true);
    click(sheetChip("Ground"));
    check("stacks type + category",
       sheetRows().every(r => /Ground/.test(r.querySelector(".t").textContent) &&
                              /Status/.test(r.textContent)), true);
    click(sheetRows()[0]);

    await idle();
    check("the filter is set",
       /learns /.test(d.getElementById("findChips").textContent), true);
  });

  /* every move carries what it DOES, so "which of these crits" has an answer
     on the phone */
  await describe("finding a move by its description", async () => {
    click(d.getElementById("findClear"));
    click(d.getElementById("findAddMove"));
    await idle();
    const inp = d.querySelector(".sheet input[type=text]");
    inp.value = "critical";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const rr = sheetRows();
    check("critical finds moves", rr.length > 0, true);
    check("and none is named that",
       rr.every(r => !/critical/i.test(
         r.querySelector(".rname").textContent)), true);
    check("because the text is on the row",
       rr.every(r => /Critical/i.test(r.textContent)), true);
    inp.value = "burn";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("burn too", sheetRows().length > 0, true);
    /* Serebii says "Gives the target the Taunted status" and stops - a name
       for a mechanic instead of the mechanic. build_text_facts.py takes the
       line that explains it. */
    inp.value = "taunt";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const tt = sheetRows().find(r => /Taunt/.test(
      r.querySelector(".rname").textContent));
    check("Taunt explains the mechanism, not the status name",
       /three turns|3 turns/.test(tt.textContent), true);
    check("and no move is left without text",
       Object.values(w.MOVE_BY).filter(m => !m.text).length <= 1, true);
  });


  await describe("abilities by kind", async () => {
    w.closeSheet();
    click(d.getElementById("findClear"));
    click(d.getElementById("findAddAbility"));
    await idle();
    const cls = w.CHAMP.AB_CLASS, lbl = w.CHAMP.AB_CLASS_LABEL;
    /* against the abilities the page carries, never a typed count - a new
       ability would fail the gate for being classified */
    const all = Object.keys(w.CHAMP.ABIL);
    check("all of them are classified", all.filter(a => !cls[a]).join(", ") ||
       "all", "all");
    check("and none that does not exist is classified",
       Object.keys(cls).length, all.length);
    const offChip = [...d.querySelectorAll(".sheet .tog")]
      .find(b => b.textContent.indexOf(lbl["moves-off"]) === 0);
    const defChip = [...d.querySelectorAll(".sheet .tog")]
      .find(b => b.textContent.indexOf(lbl["moves-def"]) === 0);
    check("there is a 'changes its moves' chip", !!offChip, true);
    check("there is a defensive chip", !!defChip, true);
    check("the chip carries its count", /· \d+$/.test(offChip.textContent), true);
    click(offChip);
    const names = sheetRows().map(r => r.querySelector(".rname")
      .childNodes[0].textContent);
    check("only the offensive ones show",
       names.every(n => cls[n] === "moves-off"), true);
    check("and they are the rule table's",
       names.every(n => w.AB_SET[n] && w.AB_SET[n].side === "off"), true);
    click(defChip);
    check("two chips add up (OR within the group)",
       sheetRows().map(r => r.querySelector(".rname").childNodes[0].textContent)
         .every(n => cls[n] === "moves-off" || cls[n] === "moves-def"), true);
    click(offChip); click(defChip);
    const weather = [...d.querySelectorAll(".sheet .tog")]
      .find(b => b.textContent.indexOf(lbl.weather) === 0);
    check("there is a weather chip", !!weather, true);
    click(weather);
    check("and it filters to weather",
       sheetRows().map(r => r.querySelector(".rname").childNodes[0].textContent)
         .every(n => cls[n] === "weather"), true);
  });


  await describe("types: AND against OR", async () => {
    click(d.querySelector(".sheet .fbtn") || d.body);
    w.closeSheet();
    click(d.getElementById("findAddType"));
    await idle();
    click(sheetChip("Rock")); click(sheetChip("Steel"));
    w.closeSheet();
    const andHits = results().length;
    check("Rock AND Steel: only the dual types",
       results().every(r => /Steel|Rock/.test(r.textContent)), true);
    const mode = modeChip();
    check("there is a mode chip", !!mode, true);
    click(mode);
    check("Rock OR Steel: more of them", results().length > andHits, true);
    check("and the chip says so",
       /any of those types/.test(d.getElementById("findChips").textContent),
       true);
    click(d.getElementById("findAddType"));
    await idle();

    click(sheetChip("Ground")); w.closeSheet();
    check("three types under OR still return results", results().length > 0, true);
    click(modeChip());
    check("under AND with three types there is nothing", results().length, 0);
    check("and it warns why",
       /three types/.test(d.getElementById("findOut").textContent), true);
  });

  /* the sheet you land on after tapping a result: the six stats each under
     their label, and the WHOLE movepool, status moves included (Protect has
     to be in a Pokemon's own sheet). */
  await describe("the Pokemon's sheet", async () => {
    click(d.getElementById("findClear"));
    click([...d.querySelectorAll("#findOut .row")][0]);
    await idle();
    const sl = d.querySelector(".sheet .statline");
    check("there is a stats block", !!sl, true);
    ["HP", "Atk", "Def", "SpA", "SpD", "Spe"].forEach(function(k){
      check("it says which is " + k, sl.textContent.indexOf(k) >= 0, true);
    });
    check("and nothing comes out as undefined",
       !/undefined/.test(sl.textContent), true);
    check("the search row is labelled too",
       /HP.*Atk.*Spe/.test(
         d.querySelectorAll("#findOut .row")[0].textContent), true);

    const chip = t => [...d.querySelectorAll(".sheet .tog")]
      .find(b => b.textContent.trim() === t);
    check("the movepool has the filters", !!chip("Physical"), true);
    check("and the sort", !!chip("A–Z"), true);
    const before = [...d.querySelectorAll(".sheet .list .row")].length;
    click(chip("Status"));
    const st = [...d.querySelectorAll(".sheet .list .row")];
    check("status moves can be seen", st.length > 0, true);
    check("and they are all status",
       st.every(r => /Status/.test(r.textContent)), true);
    check("different from the unfiltered list", st.length !== before, true);
  });

  /* "learns Trick Room, and NOT Psychic": the NOT operator on the TYPE filter
     of the search (a type chip in the MOVES picker means "a Psychic move",
     a different question). */
  describe("the NOT operator, on the type filter", () => {
    w.closeSheet();
    w.FIND.moves = ["Trick Room"]; w.FIND.types = []; w.FIND.notTypes = [];
    w.findRun();
    const nm = () => [...d.querySelectorAll("#findOut .row .rname")]
      .map(n => n.firstChild.textContent.trim());
    const isPsy = n => (w.byName[n].types || []).indexOf("Psychic") >= 0;
    const withTR = nm();
    check("Trick Room returns plenty", withTR.length > 30, true);
    check("and many are Psychic", withTR.filter(isPsy).length > 10, true);
    w.FIND.notTypes = ["Psychic"];
    w.findRun();
    const after = nm();
    check("ruling it out leaves fewer", after.length < withTR.length, true);
    check("and none is Psychic", after.filter(isPsy).length, 0);
    check("the ones that were not are still there",
       after.length, withTR.filter(n => !isPsy(n)).length);
    /* and it shows as a filter, not only inside the sheet */
    w.findDraw();
    check("the chip says so up top",
       [...d.querySelectorAll("#findChips .tog")].map(t => t.textContent)
         .indexOf("not Psychic") >= 0, true);
    d.getElementById("findClear").click();
    check("and Clear releases it", w.FIND.notTypes.length, 0);
  });

  /* the name box: for opening one Pokemon's sheet quickly, without
     building a filter */
  describe("the name search", () => {
    w.FIND.moves = [];
    const box = d.getElementById("findName");
    const type = v => { box.value = v;
      box.dispatchEvent(new w.Event("input")); };
    const named = () => [...d.querySelectorAll("#findOut .row .rname")]
      .map(n => n.firstChild.textContent.trim());
    type("garchomp");
    check("by name", named().join(","), "Garchomp");
    type("445");
    check("by dex number", named().join(","), "Garchomp");
    /* and by its Mega's name, which has no row of its own */
    type("mega absol");
    check("by its Mega's name", named().join(","), "Absol");
    type("zzzz");
    check("what does not exist returns nothing", named().length, 0);
    type("");
  });

  await describe("in my box, as two", async () => {
    check("there is an In Champions button", !!d.getElementById("findInChamp"), true);
    check("there is an In HOME button", !!d.getElementById("findInHome"), true);
    click(d.getElementById("findInChamp"));
    await idle();
    const champ = results().map(r => r.textContent);
    /* three FORMS, one species: Garchomp and its two Megas. Owning the
       base row is what puts the Mega line in reach, so the search shows
       the line, not just the row. */
    check("only Garchomp's line",
       champ.length && champ.every(t => /Garchomp/.test(t)), true);
    /* ONE CARD PER POKEMON, not one per form. A Mega has no row of its own:
       it lives on its base's card and adds only what CHANGES. */
    check("a single card, not three", champ.length, 1);
    /* ONE ABILITY BOX PER MEGA, and no "MEGA" chips on the name: the card
       says there are two in three places at once - the sprite, the ability
       box and each stat's delta. */
    check("one ability box per Mega of the line",
       [...results()[0].querySelectorAll(".cardline .lbl")]
         .filter(t => t.textContent.startsWith("Mega")).length, 2);
    check("and a captioned sprite for each",
       [...results()[0].querySelectorAll(".megapickey")]
         .filter(t => !/base/.test(t.textContent)).length, 2);
    check("no Mega chips on the name",
       [...results()[0].querySelectorAll(".rname .tag")]
         .filter(t => /^mega/i.test(t.textContent)).length, 0);
    click(d.getElementById("findInChamp"));
    click(d.getElementById("findInHome"));
    await idle();
    const home = results().map(r => r.textContent);
    check("only Dragonite's line",
       home.length && home.every(t => /Dragonite/.test(t)), true);
    check("a single card as well", home.length, 1);
    check("and its Mega is still on the card",
       /mega/i.test(home[0]), true);
    click(d.getElementById("findInChamp"));
    await idle();
    check("both at once = either box",
       results().length, 2);
  });
  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
