/* Installing a build on a Pokemon: which copy, what it looks like, and the
   "trained" tag that follows it.

     - "Installed on" is a dropdown whose closed face is the copy the build
       is on, and the card of THAT copy sits under it - shiny, trained,
       origin, where it lives, what it already carries, its note. A list of
       cards has no closed face (its first row reads as the value) and no
       obvious way to take a build off a copy; both cases are below.
     - The "trained" tag follows the build both ways: installing one sets it,
       moving the build away or deleting it clears it from the copy it left,
       unless another build still sits there.
     - A team slot holding a BASE build with no stone draws the base form
       alone (a `megas: !build.mega` flag would switch the Mega line ON for
       exactly the builds that have no Mega). */
const { describe } = require("node:test");
const { check, idle, open, row, build, one, all, found } = require("./harness.js");
const UID = "u1";

/** @param {string} id
   @param {string} name
   @param {string} location
   @param {string} origin
   @param {Record<string, unknown>} [extra] */
const R = (id, name, location, origin, extra) =>
  row(id, name, {location, origin, ...extra});
/** @param {string} id
   @param {string} pokemon
   @param {string | null} box_id */
const B = (id, pokemon, box_id) => build(id, pokemon, {box_id,
  nature:"Modest", stat_points:{hp:2,atk:0,def:0,spa:32,spd:0,spe:32},
  moves:["Protect"]});

const ROWS = [
  R("charizard", "Charizard", "champions", "home", {shiny:true, trained:true}),
  R("charizard-2", "Charizard", "home", "home", {note:"the one from GO"}),
  R("charizard-3", "Charizard", "champions", "champions"),
  /* the one copy of its species, as his Ampharos is */
  R("ampharos", "Ampharos", "champions", "home", {shiny:true, trained:true}),
  /* two copies the same in everything recorded, as his two Heracross are */
  R("heracross", "Heracross", "home", "home"),
  R("heracross-2", "Heracross", "home", "home"),
];
const BUILDS = [
  /* on charizard, base form, no stone */
  B("charizard", "Charizard", "charizard"),
  /* a second one on charizard-3, so moving it off leaves a build behind */
  B("charizard-b", "Charizard", "charizard-3"),
  B("charizard-c", "Charizard", "charizard-3"),
  B("ampharos", "Ampharos", "ampharos"),
  B("heracross", "Heracross", null),
];
const TEAMS = [{user_id:UID, id:"t1", name:"Base", slots:[
  {build_id:"charizard", item:"", why:""}], notes:{}, updated_at:"2026-09-27"}];

const { dom, errs } = open({ box: ROWS, builds: BUILDS, teams: TEAMS });
const w = dom.window, d = w.document;
const boxWrites = () => w.__WROTE.filter(x => x.table === "box")
  .map(x => x.row.id + "=" + x.row.trained).sort().join(",");
const buildWrites = () => w.__WROTE.filter(x => x.table === "builds")
  .map(x => x.row.id + "=" + x.row.box_id).join(",");
/** @param {string} label */
const foot = label => found([...all(d, "#buildEditFoot button")]
  .find(b => b.textContent === label), "the " + label + " button");
/* The build editor's "Installed on" field, and what its select says closed. */
const installed = () => found([...all(d, "#buildEditBody .field")]
  .find(f => /Installed on/.test(f.textContent)), "the Installed on field");
/** @param {import("./harness.js").Field} s */
const face = s => s.options[s.selectedIndex].text;
/** @param {import("./harness.js").Field} sel
   @param {string} v */
const choose = (sel, v) => {
  sel.value = v; sel.dispatchEvent(new w.Event("change")); };
/** @param {ParentNode} n */
const tagsOf = n => [...all(n, ".tag")].map(t => t.textContent);

(async function () {
  await idle();

  await describe("a team's slot", async () => {
    w.teamSheet("t1", w.S.teams.t1);
    await idle();
    const slot = d.querySelector("#teamEditBody .row.card");
    /* the strip is always there; what matters is how many forms it holds */
    check("a base build with no stone draws ONE sprite, not base + Megas",
       slot ? all(slot, ".megapics .megapic").length : -1, 1);
  });

  await describe("which copy it is installed on", async () => {
    w.buildSheet("charizard", w.S.builds.charizard);
    await idle();
    const sel = one(installed(), "select");
    check("a dropdown: 'just an idea' plus one option per copy",
       sel ? sel.options.length : 0, 4);
    /* the closed face IS the answer */
    check("closed, it says which copy, not 'not installed'",
       face(sel).startsWith("Charizard · Champions box · shiny · trained") &&
       !/not installed/i.test(face(sel)), true);
    check("no option says 'copy N'", /copy \d/.test(sel.textContent), false);
    check("the option says which builds it already carries",
       /already carries charizard-b, charizard-c/.test(sel.options[2].text), true);
    /* the Champions box first, then HOME - the order the box itself uses */
    check("and the HOME one, where it lives and its note",
       /in HOME.*the one from GO/.test(sel.options[3].text), true);
    const card = all(installed(), ".row");
    check("under it, ONE card: the chosen copy's", card.length, 1);
    check("the card says shiny", tagsOf(card[0]).indexOf("shiny") >= 0, true);
    check("and where it lives", tagsOf(card[0]).indexOf("Champions box") >= 0, true);
    check("and it is not a button: the choice is made above", card[0].tagName, "DIV");
  });

  /* the same sheet, still open */
  await describe("the trained tag follows the build", async () => {
    const sel = one(installed(), "select");
    choose(sel, "charizard-2");           /* move it to the HOME one */
    const card = all(installed(), ".row");
    check("changing copy does not redraw: the same dropdown",
       d.contains(sel) && face(sel).startsWith("Charizard · in HOME"), true);
    check("the card becomes the HOME one, with its note",
       card.length === 1 && tagsOf(card[0]).indexOf("in HOME") >= 0 &&
       /the one from GO/.test(card[0].textContent), true);
    foot("Save").click();
    await idle();
    check("the new copy gains trained, the one it left loses it", boxWrites(),
       "charizard-2=true,charizard=false");
  });

  await describe("an idea, and two identical copies", async () => {
    w.buildSheet("heracross", w.S.builds.heracross);
    await idle();
    const hsel = one(installed(), "select");
    check("uninstalled it DOES say 'not installed', with no card",
       /not installed/.test(face(hsel)) &&
       all(installed(), ".row").length === 0, true);
    check("two identical copies say so, instead of repeating the line",
       [1, 2].every(i => hsel.options[i].text.endsWith(" · one of 2 identical")), true);
  });

  /* its only copy, and the build still comes off it */
  await describe("taking it off its only copy", async () => {
    w.closeSheet();
    w.__WROTE.length = 0;
    w.buildSheet("ampharos", w.S.builds.ampharos);
    await idle();
    const asel = one(installed(), "select");
    check("closed, it says Ampharos", face(asel).startsWith("Ampharos · Champions box"), true);
    choose(asel, "");
    check("choosing 'not installed' removes the card",
       all(installed(), ".row").length, 0);
    foot("Save").click();
    await idle();
    check("it saves with no copy", buildWrites(), "ampharos=null");
    check("and the copy it left loses trained", boxWrites(), "ampharos=false");

    w.__WROTE.length = 0;
    w.buildSheet("charizard-b", w.S.builds["charizard-b"]);
    await idle();
    choose(one(installed(), "select"), "");
    foot("Save").click();
    await idle();
    check("uninstalling with another build still on it keeps the tag",
       boxWrites(), "");
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
