/* Only what the game can actually release is ever offered for release.

   Two in-game rules:
     - a HOME-origin Pokemon is never released from the Champions box. Park is
       its exit, and a second copy of it is a real Pokemon with value, not a
       duplicate to get rid of;
     - the game refuses a release that would leave fewer than six to battle
       with, so the last six Champions-origin Pokemon hold their slots.

   The cases: Sinistcha, one of exactly six Champions-origin Pokemon, with a
   second copy in HOME - the "Already in HOME" panel must not tell him to
   release it, because the game will not. The same for a HOME-origin Garchomp
   sent in while another Garchomp stays in HOME. */
const { describe } = require("node:test");
const { check, open, idle, row, build, click, one, all, byId } = require("./harness.js");

const ROWS = [
  /* exactly six Champions origin: the floor */
  ...["Sinistcha", "Maushold", "Sceptile", "Incineroar", "Kingambit",
      "Gholdengo"].map(n => row(n.toLowerCase(), n)),
  row("garchomp", "Garchomp", {origin:"home"}),        // sent in from HOME
  row("garchomp-h", "Garchomp", {location:"home", origin:"home"}),  // ...and a copy left there
  row("sinistcha-h", "Sinistcha", {location:"home", origin:"home"}),
];

/* The Garchomp in the box carries a build. Its id is NOT the box row's, so
   the Park toast must look it up by box_id (buildsOn), never by the row's id. */
const BUILDS = [build("b-chomp", "Garchomp", {box_id:"garchomp", nature:"Jolly",
  stat_points:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}, moves:["Protect"]})];

const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;
/** @param {string} name */
const boxRow = name => [...all(d, "#listChampOrigin .row, #listHomeOrigin .row")]
  .find(r => ((r.querySelector(".rname") || r).textContent.trim()
              .indexOf(name) === 0));
const buttons = () => [...all(d, ".sheet button")]
  .map(b => b.textContent);

(async () => {
  await idle();
  w.go("box");
  describe("the 'Already in HOME' panel", () => {
    check("it does not show: nothing duplicated can be released",
       byId(d, "dupeBlock").hidden, true);
    check("and the box does not call it trade material",
       /trade material|can be released/.test(byId(d, "boxWarn")
         .textContent), false);
  });

  await describe("the sheet", async () => {
    click(boxRow("Sinistcha"));
    await idle();
    check("Sinistcha (Champions origin, at the floor of 6): no Release",
       buttons().indexOf("Release"), -1);
    check("...and it says the slot is for good",
       /This slot is permanent/.test(one(d, ".sheet").textContent), true);
    click(boxRow("Garchomp"));
    await idle();
    const b = buttons();
    check("Garchomp (HOME origin, in the box): no Release", b.indexOf("Release"), -1);
    check("...but Park back to HOME, yes", b.indexOf("Park back to HOME") >= 0, true);
    click([...all(d, ".sheet button")]
      .find(x => x.textContent === "Park back to HOME"));
    await idle();
    check("the Park toast names its build (found by box_id)",
       /Its build is kept/.test(byId(d, "toast").textContent), true);
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
