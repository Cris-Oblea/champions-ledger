/* The move picker in a build: filters that stack.

   The sort is one choice and the filters stack: every group ANDs with the
   others, and the chips inside a group OR together - so "which special
   Electric move do I actually have" is a question, not a scroll.

   Garchomp is the fixture because its pool covers all three categories, both
   spread kinds (Earthquake hits the ally, Rock Slide does not) and priority. */
const { describe } = require("node:test");
const { check, open, idle, row, build, click } = require("./harness.js");

const ROWS = [row("garchomp", "Garchomp", {trained:true})];
const BUILDS = [build("garchomp", "Garchomp", {ability:"Rough Skin",
  nature:"Jolly", stat_points:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32},
  moves:["Earthquake",null,null,null]})];

const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;
/* A CHIP HAS THREE STATES and writes a minus into its own label when it
   excludes, so finding it by exact text stops working the moment it is
   used. It is found by its text without the sign. */
const chip = t => [...d.querySelectorAll(".sheet .tog")]
  .find(b => b.textContent.replace(/^−\s*/, "").trim() === t);
const state = t => {
  const b = chip(t);
  if (b.classList.contains("no")) return "no";
  return b.getAttribute("aria-pressed") === "true" ? "on" : "off";
};
/* off -> include -> exclude -> off, so "turning off" can take more than
   one tap */
const off = t => { while (state(t) !== "off") click(chip(t)); };
const rows = () => [...d.querySelectorAll(".sheet .list .row")];
const names = () => rows().map(r => r.querySelector(".rname").textContent
  .replace(/priority \+\d| ?spread| ?hits ally|Rough Skin/g, "").trim());
const meta = () => rows().map(r => r.querySelector(".rmeta .mono").textContent);
const countLine = () => [...d.querySelectorAll(".sheet .sub")]
  .map(x => x.textContent).find(t => / moves$| of \d+ moves/.test(t)) || "";

(async () => {
  await idle();
  w.go("builds");
  click(d.querySelectorAll("#listBuilds .row")[0]);
  await idle();
  const slot = [...d.querySelectorAll(".slot")].find(s => /Earthquake/.test(s.textContent));
  click(slot);
  await idle();
  const all = rows().length;               // the movepool, unfiltered

  describe("the controls are there", () => {
    ["BP × acc", "A–Z", "PP", "Type"].forEach(function(t){
      check("sort: " + t, !!chip(t), true);
    });
    ["Physical", "Special", "Status", "Spread", "Hits ally", "Priority"]
      .forEach(function(t){ check("filter: " + t, !!chip(t), true); });
    check("there are type chips (Ground)", !!chip("Ground"), true);
    check("it starts unfiltered", /^\d+ moves$/.test(countLine().split(" ·")[0]), true);
  });

  describe("one filter", () => {
    click(chip("Physical"));
    check("physical only", meta().every(t => t.startsWith("Physical")), true);
    check("and fewer than all", rows().length < all, true);
  });

  describe("two filters at once (they stack)", () => {
    click(chip("Ground"));
    check("only physical Ground", meta().every(t => t.startsWith("Physical")), true);
    check("all of them Ground",
       rows().every(r => /Ground/.test(r.querySelector(".t").textContent)), true);
    check("the counter says N of M", / of \d+ moves/.test(countLine()), true);
  });

  describe("the sort combines with the filters", () => {
    const twoFilters = rows().length;
    click(chip("A–Z"));
    const az = names();
    check("still filtered", rows().length, twoFilters);
    check("and now A-Z",
       az.join("|") === az.slice().sort((a,b)=>a.localeCompare(b)).join("|"), true);
  });

  describe("removing a chip brings them back", () => {
    off("Ground"); off("Physical");
    check("all return", rows().length, all);
  });

  describe("the other filters", () => {
    click(chip("Priority"));
    check("all with priority",
       rows().every(r => /priority \+/.test(r.querySelector(".rname").textContent)), true);
    off("Priority");
    click(chip("Hits ally"));
    check("all hit the ally",
       rows().length > 0 &&
       rows().every(r => /hits ally/.test(r.querySelector(".rname").textContent)), true);
    off("Hits ally");
    click(chip("Status"));
    check("status only", meta().every(t => t.startsWith("Status")), true);
  });

  /* Two chips in "Must have" mean BOTH, not either. A move cannot be spread
     and priority at once in Champions, and 0 results is the honest answer
     to that. */
  describe("two traits at once ask for BOTH", () => {
    off("Status");
    off("Status"); click(chip("Spread")); click(chip("Hits ally"));
    const bothTraits = rows();
    check("spread + hits ally: both hold",
       bothTraits.length > 0 && bothTraits.every(r => {
         const t = r.querySelector(".rname").textContent;
         return /spread/.test(t) && /hits ally/.test(t); }), true);
    off("Hits ally"); click(chip("Priority"));
    check("spread + priority: none exists", rows().length, 0);
    check("and the counter says so", /^0 of \d+ moves/.test(countLine()), true);
    off("Spread"); off("Priority");
    check("removing them brings all back", rows().length, all);
  });

  /* A chip's third state: one tap includes, the next excludes, the third
     turns it off. */
  describe("a chip's third state: exclude", () => {
    off("Spread"); off("Priority"); off("Status");
    click(chip("Water"));
    check("one tap includes", state("Water"), "on");
    click(chip("Water"));
    check("two taps exclude", state("Water"), "no");
    check("and it says so with a minus", chip("Water").textContent.charAt(0), "−");
    check("no Water move left", meta().some(t => /Water/.test(t)), false);
    check("but moves remain", rows().length > 0, true);
    click(chip("Water"));
    check("the third tap turns it off", state("Water"), "off");
    check("and all return", rows().length, all);
  });

  /* A move has exactly one category, so choosing one releases the other. */
  describe("a category is chosen one at a time", () => {
    click(chip("Physical"));
    click(chip("Special"));
    check("choosing Special releases Physical", state("Physical"), "off");
    check("and Special stays on", state("Special"), "on");
    check("only specials show", meta().every(t => t.startsWith("Special")), true);
    /* excluding DOES stack: it is how "neither status nor physical" is asked */
    off("Special");
    click(chip("Status")); click(chip("Status"));
    click(chip("Physical")); click(chip("Physical"));
    check("two exclusions live together",
       state("Status") + "/" + state("Physical"), "no/no");
    check("and only specials remain", meta().every(t => t.startsWith("Special")), true);
    off("Status"); off("Physical");
    check("releasing them brings all back", rows().length, all);
  });


  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
