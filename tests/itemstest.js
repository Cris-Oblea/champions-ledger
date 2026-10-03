/* The Items tab.

   It reads like the Mega Stone list: every item in the game, in the four
   groups Champions itself uses - Hold Items, Berries, Miscellaneous, and
   stones in their own pane - each row carrying what the item does, what it
   costs in VP, and whether it is owned. A list of item NAMES with no way to
   learn what one does is what this replaced. */
const { describe } = require("node:test");
const { check, open, idle, click } = require("./harness.js");
const UID = "u1";

/* A ROW PER OWNED THING since migration 6, not a list inside one document. */
const META = [];
const ITEMS = [{user_id:UID, id:"Life Orb", updated_at:"2026-09-10"},
               {user_id:UID, id:"Sitrus Berry", updated_at:"2026-09-10"}];
const STONES = [{user_id:UID, id:"Garchompite", updated_at:"2026-09-10"}];

const { dom, errs } = open({ meta: META, items: ITEMS, stones: STONES });
const w = dom.window, d = w.document;
const rows = () => [...d.querySelectorAll("#itemCats .row")];
/* An item's row in the list, found by its name. */
const item = n => rows().find(r => r.textContent.indexOf(n) === 0);
const heads = () => [...d.querySelectorAll("#itemCats h2")]
  .map(h => h.textContent.trim());

(async () => {
  await idle();
  w.go("gear");
  describe("the tab", () => {
    check("is called Items",
       /Items/.test(d.querySelector("#v-gear h1").textContent), true);
  });
  await describe("the game's categories", async () => {
    click(d.getElementById("gearItems"));
    await idle();
    const hs = heads();
    ["Hold Items", "Berries", "Miscellaneous"].forEach(function(c, i){
      check(c, hs[i] && hs[i].indexOf(c) === 0, true);
    });
    check("each carries owned/total", /\d\/\d+$/.test(hs[0]), true);
  });

  describe("the list", () => {
    const all = rows();
    check("every item is there", all.length, w.CHAMP.ITEMS.length);
    check("no Mega Stone here",
       all.every(r => !/ite$|ite Z$/.test(
         r.querySelector(".rname").textContent.trim())), true);
    check("every row carries a description",
       all.filter(r => r.querySelectorAll(".st").length).length, all.length);
    check("and a price or where it comes from, never blank",
       all.every(r => (r.querySelector(".rside").textContent || "").trim()
         .length > 1), true);
    const lo = item("Life Orb");
    check("Life Orb shows as owned",
       /owned/.test(lo.querySelector(".rside").textContent), true);
    /* Life Orb is a shop item with a price; Leftovers is not sold at all - you
       start with it - so its slot says that instead of a made-up VP. */
    const leftovers = item("Leftovers");
    check("Leftovers says where it comes from",
       /start with it/.test(leftovers.querySelector(".rside").textContent), true);
    /* A VP NUMBER MUST NEVER BE ANONYMOUS. The two price sources can disagree
       (build_item_facts.py prints every case, and the player's ruling settles
       them), which is exactly why every figure on screen says who said it. */
    check("every price names its source",
       all.filter(r => /\d VP/.test(r.querySelector(".rside").textContent))
          .every(r => /serebii|pokebase/i
            .test(r.querySelector(".rside span").title || "")), true);
    check("no item is left at 'price ?'",
       all.every(r => !/price \?/.test(r.querySelector(".rside").textContent)),
       true);
    const scarf = item("Muscle Band");
    check("Muscle Band carries its VP price",
       /\d VP/.test(scarf.querySelector(".rside").textContent), true);
  });

  /* an item that extends a field effect serves the MOVE and the ABILITY that
     set it, and naming only the move misses the half that matters on most
     teams */
  describe("what each item is for", () => {
    const heat = item("Heat Rock");
    check("Heat Rock names the move", /Sunny Day/.test(heat.textContent), true);
    check("and the ability", /Drought/.test(heat.textContent), true);
    const seed = item("Electric Seed");
    check("Electric Seed reaches Electric Surge",
       /Electric Surge/.test(seed.textContent), true);
    const clay = item("Light Clay");
    check("Light Clay includes Aurora Veil (confirmed in game)",
       /Aurora Veil/.test(clay.textContent), true);
    const coal = item("Charcoal");
    check("Charcoal says it boosts Fire moves",
       /every Fire move/.test(coal.textContent), true);
    const balloon = item("Air Balloon");
    check("Air Balloon knows it is about Ground (pokebase's text)",
       /Ground/.test(balloon.textContent), true);
  });

  await describe("marking and unmarking", async () => {
    click(item("Leftovers"));
    await idle();
    const wrote = w.__WROTE[w.__WROTE.length - 1];
    check("it is saved", !!wrote, true);
    check("to the items table, not meta", wrote.table, "items");
    /* the row stays focused after the tap, and an activeElement guard here
       would swallow the redraw: the item would only change once you left the
       tab. */
    check("and the row updates at once",
       /owned/.test(item("Leftovers").querySelector(".rside").textContent), true);
    check("so does the section counter",
       /Hold Items \d+\//.test(heads()[0]), true);
    check("the row is the item itself", wrote.row.id, "Leftovers");
    /* THE POINT OF MIGRATION 6. Marking one item writes that item and nothing
       else, so a device that never saw Life Orb cannot drop it. */
    check("and touches no other row",
       JSON.stringify(wrote.row).indexOf("Life Orb") < 0, true);
    click(item("Life Orb"));
    await idle();
    const gone = w.__DELETED[w.__DELETED.length - 1];
    check("unmarking deletes its row", gone && gone.id, "Life Orb");
    check("from the items table", gone && gone.table, "items");
  });

  describe("search", () => {
    const inp = d.getElementById("itemSearch");
    inp.value = "burn";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const byText = rows();
    check("searches inside the description", byText.length > 0, true);
    check("and not only the name",
       byText.some(r => !/burn/i.test(
         r.querySelector(".rname").textContent)), true);
    inp.value = "sitrus";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("and by name too", rows().length, 1);
    inp.value = "";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
  });

  /* The status table lives next to the field toggles on the damage view,
     which is where it actually gets applied - FOLDED, and drawn when the fold
     is first opened: it is a dictionary you read once, and open it would push
     the number this screen exists for down the scroll. So this opens it,
     which doubles as the assertion that opening it works. */
  describe("the statuses", () => {
    /* Champions halved full paralysis, and the app must not imply the
       console games' 25%. */
    check("the table lives in the damage view",
       !!d.querySelector("#v-calc #statusList"), true);
    check("and starts folded", d.getElementById("statusBody").hidden, true);
    click(d.getElementById("statusFold"));
    check("it opens when tapped", d.getElementById("statusBody").hidden, false);
    const st = [...d.querySelectorAll("#statusList .row")];
    check("the eight statuses", st.length, 8);
    const par = st.find(r => r.textContent.indexOf("Paralysis") === 0);
    check("paralysis says 12.5%", /12\.5%/.test(par.textContent), true);
    check("and that it used to be 25%", /was 25%/.test(par.textContent), true);
    check("marked as rebalanced by Champions",
       /rebalanced in Champions/.test(par.textContent), true);
    check("Speed stays at 50%", /Speed 50%/.test(par.textContent), true);
    const burn = st.find(r => r.textContent.indexOf("Burn") === 0);
    check("burn warns its chip is a main-series number",
       /main-series number/.test(burn.textContent), true);
    check("but its x0.5 on physical hits is measured",
       /physical damage taken 50%/.test(burn.textContent), true);
    check("every number says where it comes from",
       [...par.querySelectorAll(".tag")].some(t => /rebalance page/.test(t.title || "")),
       true);
    check("and it lists the moves that cause it",
       /moves cause it/.test(par.textContent), true);
  });

  /* The calculator holds an attacker AND a defender, so every millimetre it
     spends, it spends twice. The four selects a side needs before the number
     is read sit in one compact block, not four full-width rows. Nothing is
     removed; they sit closer. */
  describe("the calculator, compact", () => {
    w.CALC.atk = {name:"Garchomp", buildId:null,
      sp:{hp:0,atk:32,def:0,spa:0,spd:0,spe:32},
      boost:{atk:0,def:0,spa:0,spd:0,spe:0}, nature:null, ability:null,
      item:null, status:null, curHP:null};
    w.calcDraw();
    const col = d.getElementById("calcAtk");
    const loose = [...col.querySelectorAll(".field")]
      .filter(f => !f.closest(".grid2"));
    check("no loose full-width select", loose.length, 0);
    const grid = col.querySelector(".grid2.tight");
    check("all four in one block",
       grid ? grid.querySelectorAll(".field").length : 0, 4);
    check("and they are the four set before reading the number",
       [...grid.querySelectorAll("label.f")].map(l => l.textContent).join(","),
       "Ability,Item,Nature,Status");
    check("the six stats are still there, with their header",
       col.querySelectorAll(".sp").length, 7);
  });

  /* MEASURED IN A BROWSER, NOT IN JSDOM. jsdom does no layout, so the real
     heights are taken with scripts/preview.py in iframes of 400 / 820 /
     1526px. What CAN be asserted here is the structure that produces them,
     which is what breaks without anyone noticing:

       - each field group's label sits INSIDE its row, not on a line of its
         own (eight lines of pure heading would stretch both sides)
       - and the stat controls step down from the global 42px floor, which is
         a touch target and stays everywhere else. */
  describe("the field panel, in rows rather than loose lines", () => {
    const col = d.getElementById("calcAtk");
    const frows = [...d.querySelectorAll("#calcField .fieldrow")];
    check("each group is a row", frows.length, 8);
    check("with its label inside, not above",
       frows.every(r => r.firstElementChild.className === "fieldgroup"), true);
    check("and its buttons on the same row",
       frows.every(r => r.querySelectorAll(".tog").length > 0), true);
    check("no label loose outside a row",
       [...d.querySelectorAll("#calcField > .fieldgroup")].length, 0);
    check("the field's 32 buttons are all there",
       d.querySelectorAll("#calcField .tog").length, 32);
    /* AND A SIDE'S TWO HALVES STAY STACKED, on purpose: side by side, each
       half of a three-column layout is too narrow and the SP box comes out a
       couple of dozen pixels wide - no screen width fixes that. */
    check("a side is not split in two", !!col.querySelector(".calcsplit"), false);
    /* and it wears its Pokemon on top, like every other list in the app */
    check("the side carries the card with its type",
       col.querySelector(".row").className.split(" ").indexOf("card") >= 0,
       true);
    check("and its sprite", !!col.querySelector(".row img"), true);
    check("at native size, not rescaled",
       col.querySelector(".row img").getAttribute("width"), "96");
    /* and a stat row keeps its four parts: label, box, stage and the
       computed value */
    /* [2], not [1]: 0 is the header and 1 is HP, which has no stage */
    const sprow = [...col.querySelectorAll(".sp")][2];
    check("a stat row has its four parts", sprow.children.length, 4);
    check("with its editable box", !!sprow.querySelector("input"), true);
    check("and its stage select", !!sprow.querySelector("select"), true);
  });


  await describe("the stones stay in their pane", async () => {
    click(d.getElementById("gearStones"));
    await idle();
    check("every stone listed",
       d.querySelectorAll("#listStonesOwned .row, #listStonesNot .row").length,
       w.CHAMP.STONES.length);
  });
  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
