/* The Items tab.

   It reads like the Mega Stone list: every item in the game, in the four
   groups Champions itself uses - Hold Items, Berries, Miscellaneous, and
   stones in their own pane - each row carrying what the item does, what it
   costs in VP, and whether it is owned. A list of item NAMES with no way to
   learn what one does is what this replaced. */
const { describe } = require("node:test");
const { check, open, idle, click, one, all, byId, found } = require("./harness.js");
const UID = "u1";

/* A ROW PER OWNED THING since migration 6, not a list inside one document. */
/** @type {Record<string, unknown>[]} */
const META = [];
const ITEMS = [{user_id:UID, id:"Life Orb", updated_at:"2026-09-10"},
               {user_id:UID, id:"Sitrus Berry", updated_at:"2026-09-10"}];
const STONES = [{user_id:UID, id:"Garchompite", updated_at:"2026-09-10"}];

const { dom, errs } = open({ meta: META, items: ITEMS, stones: STONES });
const w = dom.window, d = w.document;
const rows = () => [...all(d, "#itemCats .row")];
/** An item's row in the list, found by its name.
    @param {string} n */
const item = n => found(rows().find(r => r.textContent.indexOf(n) === 0), "the row " + n);
const heads = () => [...all(d, "#itemCats h2")]
  .map(h => h.textContent.trim());

(async () => {
  await idle();
  w.go("gear");
  describe("the tab", () => {
    check("is called Items",
       /Items/.test(one(d, "#v-gear h1").textContent), true);
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
    const items = rows();
    check("every item is there", items.length, found(w.CHAMP.ITEMS, "w.CHAMP.ITEMS").length);
    check("no Mega Stone here",
       items.every(r => !/ite$|ite Z$/.test(
         one(r, ".rname").textContent.trim())), true);
    check("every row carries a description",
       items.filter(r => all(r, ".st").length).length, items.length);
    check("and a price or where it comes from, never blank",
       items.every(r => (one(r, ".rside").textContent || "").trim()
         .length > 1), true);
    const lo = item("Life Orb");
    check("Life Orb shows as owned",
       /owned/.test(one(lo, ".rside").textContent), true);
    /* Life Orb is a shop item with a price; Leftovers is not sold at all - you
       start with it - so its slot says that instead of a made-up VP. */
    const leftovers = item("Leftovers");
    check("Leftovers says where it comes from",
       /start with it/.test(one(leftovers, ".rside").textContent), true);
    /* A VP NUMBER MUST NEVER BE ANONYMOUS. The two price sources can disagree
       (build_item_facts.py prints every case, and the player's ruling settles
       them), which is exactly why every figure on screen says who said it. */
    check("every price names its source",
       items.filter(r => /\d VP/.test(one(r, ".rside").textContent))
          .every(r => /serebii|pokebase/i
            .test(one(r, ".rside span").title || "")), true);
    check("no item is left at 'price ?'",
       items.every(r => !/price \?/.test(one(r, ".rside").textContent)),
       true);
    const scarf = item("Muscle Band");
    check("Muscle Band carries its VP price",
       /\d VP/.test(one(scarf, ".rside").textContent), true);
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
       /owned/.test(one(item("Leftovers"), ".rside").textContent), true);
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
    const inp = byId(d, "itemSearch");
    inp.value = "burn";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const byText = rows();
    check("searches inside the description", byText.length > 0, true);
    check("and not only the name",
       byText.some(r => !/burn/i.test(
         one(r, ".rname").textContent)), true);
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
    check("and starts folded", byId(d, "statusBody").hidden, true);
    click(d.getElementById("statusFold"));
    check("it opens when tapped", byId(d, "statusBody").hidden, false);
    const st = [...all(d, "#statusList .row")];
    check("the eight statuses", st.length, 8);
    const par = found(st.find(r => r.textContent.indexOf("Paralysis") === 0), "par");
    check("paralysis says 12.5%", /12\.5%/.test(par.textContent), true);
    check("and that it used to be 25%", /was 25%/.test(par.textContent), true);
    check("marked as rebalanced by Champions",
       /rebalanced in Champions/.test(par.textContent), true);
    check("Speed stays at 50%", /Speed 50%/.test(par.textContent), true);
    const burn = found(st.find(r => r.textContent.indexOf("Burn") === 0), "burn");
    check("burn warns its chip is a main-series number",
       /main-series number/.test(burn.textContent), true);
    check("but its x0.5 on physical hits is measured",
       /physical damage taken 50%/.test(burn.textContent), true);
    check("every number says where it comes from",
       [...all(par, ".tag")].some(t => /rebalance page/.test(t.title || "")),
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
    const col = byId(d, "calcAtk");
    const loose = [...all(col, ".field")]
      .filter(f => !f.closest(".grid2"));
    check("no loose full-width select", loose.length, 0);
    const grid = col.querySelector(".grid2.tight");
    check("all four in one block",
       grid ? all(grid, ".field").length : 0, 4);
    check("and they are the four set before reading the number",
       [...all(grid, "label.f")].map(l => l.textContent).join(","),
       "Ability,Item,Nature,Status");
    check("the six stats are still there, with their header",
       all(col, ".sp").length, 7);
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
    const col = byId(d, "calcAtk");
    const frows = [...all(d, "#calcField .fieldrow")];
    check("each group is a row", frows.length, 8);
    check("with its label inside, not above",
       frows.every(r => found(r.firstElementChild, "r.firstElementChild").className === "fieldgroup"), true);
    check("and its buttons on the same row",
       frows.every(r => all(r, ".tog").length > 0), true);
    check("no label loose outside a row",
       [...all(d, "#calcField > .fieldgroup")].length, 0);
    check("the field's 32 buttons are all there",
       all(d, "#calcField .tog").length, 32);
    /* AND A SIDE'S TWO HALVES STAY STACKED, on purpose: side by side, each
       half of a three-column layout is too narrow and the SP box comes out a
       couple of dozen pixels wide - no screen width fixes that. */
    check("a side is not split in two", !!col.querySelector(".calcsplit"), false);
    /* and it wears its Pokemon on top, like every other list in the app */
    check("the side carries the card with its type",
       one(col, ".row").className.split(" ").indexOf("card") >= 0,
       true);
    check("and its sprite", !!col.querySelector(".row img"), true);
    check("at native size, not rescaled",
       one(col, ".row img").getAttribute("width"), "96");
    /* and a stat row keeps its four parts: label, box, stage and the
       computed value */
    /* [2], not [1]: 0 is the header and 1 is HP, which has no stage */
    const sprow = [...all(col, ".sp")][2];
    check("a stat row has its four parts", sprow.children.length, 4);
    check("with its editable box", !!sprow.querySelector("input"), true);
    check("and its stage select", !!sprow.querySelector("select"), true);
  });


  await describe("the stones stay in their pane", async () => {
    click(d.getElementById("gearStones"));
    await idle();
    check("every stone listed",
       all(d, "#listStonesOwned .row, #listStonesNot .row").length,
       w.CHAMP.STONES.length);
  });
  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
