/* A ledger with rows in it, and the app booted on top of one.
 *
 * WHY THIS EXISTS. Every other test stubs Supabase with an empty result, so the
 * app runs with no session and no data: the login gate is up, `renderAll` never
 * fires, and every branch that only draws something WHEN THERE IS SOMETHING TO
 * DRAW is never executed. Three missing imports reached production through that
 * hole on 2026-09-14 - `note is not defined` in the GTS panel and in the
 * duplicate report - and the gate went green on all sixteen tests while the
 * live page threw on load.
 *
 * So the rows below are not a sample of a ledger, they are a DELIBERATELY
 * AWKWARD one: the GTS is full, the box duplicates three HOME species across
 * all three origins, one of the duplicates carries a build, one build is bound
 * to a box row, one is an idea with no owner, one is an orphan pointing at a
 * row that no longer exists, and a team has six slots with six different items.
 * Each of those is a branch that an empty ledger skips.
 *
 * Keep it awkward. If a row here stops triggering the branch it was written
 * for, ledgertest.js asserts the branch ran and says so - a fixture that has
 * quietly stopped covering anything is worse than none.
 *
 * The tables are the real ones: box, builds, teams, stones, items, gts and
 * meta. stones and items became tables of their own in migration 6 and the GTS
 * in 7 - a row per owned thing, a row per trade - so meta is down to the one
 * document that really is a document.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const UID = "00000000-0000-4000-8000-00000000fixt";
const DAY = "2026-09-14";

/* Species are real ones from the dex, because the app looks every name up:
   a made-up name draws a row with no types and tests nothing. */
const box = [
  /* champions, HOME origin, and its species is in HOME too -> the "park these
     back" note in the duplicate report */
  row("garchomp", "Garchomp", "champions", "permanent", "home", { trained: 1 }),
  /* champions, rental, species also in HOME -> the "rental" note */
  row("sneasler", "Sneasler", "champions", "rental", "champions"),
  /* champions origin, species also in HOME, AND it carries a build -> the
     "releasing destroys it, and N of them carry a build" branch */
  row("kingambit", "Kingambit", "champions", "permanent", "champions",
      { trained: 1, note: "Sucker Punch tuned for the mirror" }),
  /* a shiny, and a Pokemon with two Mega lines */
  row("charizard", "Charizard", "champions", "permanent", "home", { shiny: 1 }),
  row("farigiraf", "Farigiraf", "champions", "permanent", "home", { trained: 1 }),
  /* the HOME side of the three duplicates above, plus one that is only in HOME */
  row("garchomp-home", "Garchomp", "home", "permanent", "home"),
  row("sneasler-home", "Sneasler", "home", "permanent", "home"),
  row("kingambit-home", "Kingambit", "home", "permanent", "home"),
  row("whimsicott-home", "Whimsicott", "home", "permanent", "home"),
  /* A SPECIES CHAMPIONS HAS NEVER HEARD OF, which HOME can hold for ever. Its
     card and its sheet are drawn off HOME_DEX rather than the Champions dex,
     and that is a whole branch nothing here used to enter: opening the sheet
     of one threw on its first line, in production, for two days (player,
     2026-09-18). Bulbasaur, because it is unmistakably not in the format. */
  row("bulbasaur-home", "Bulbasaur", "home", "permanent", "home"),
];

function row(id, name, location, status, origin, extra) {
  return Object.assign({
    user_id: UID, id, name, location, status, origin,
    note: "", shiny: 0, trained: 0, ord: 0, updated_at: DAY + "T00:00:00Z",
  }, extra || {});
}

const builds = [
  /* ACTIVE: bound to a box row that exists and is in the Champions box */
  build("kingambit", "Kingambit", "kingambit", {
    ability: "Supreme Overlord", nature: "Adamant",
    stat_points: { hp: 12, atk: 32, def: 10, spa: 0, spd: 12, spe: 0 },
    moves: ["Sucker Punch", "Kowtow Cleave", "Iron Head", "Protect"],
  }),
  /* ACTIVE with a Mega: the stone is what creates the form */
  build("charizard", "Charizard", "charizard", {
    mega: "Mega Charizard Y", ability: "Blaze", mega_ability: "Drought",
    nature: "Timid",
    stat_points: { hp: 4, atk: 0, def: 0, spa: 32, spd: 0, spe: 30 },
    moves: ["Heat Wave", "Weather Ball", "Solar Beam", "Protect"],
  }),
  /* UNBOUND: an idea, written down for a Pokemon he does not own. Not a fault */
  build("iron-hands", "Iron Hands", null, {
    ability: "Quark Drive", nature: "Adamant",
    stat_points: { hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 },
    moves: ["Fake Out", "Drain Punch", "Wild Charge", "Protect"],
  }),
  /* ORPHAN: points at a box row that no longer exists. This one IS a fault and
     the app is supposed to say so */
  build("camerupt", "Camerupt", "camerupt-gone", {
    mega: "Mega Camerupt", ability: "Solid Rock", nature: "Quiet",
    stat_points: { hp: 20, atk: 0, def: 6, spa: 32, spd: 8, spe: 0 },
    moves: ["Eruption", "Earth Power", "Protect"],
  }),
];

function build(id, pokemon, box_id, extra) {
  return Object.assign({
    user_id: UID, id, pokemon, box_id,
    mega: null, ability: null, mega_ability: null, nature: null,
    stat_points: {}, moves: [], role: "", rationale: "",
    extra: {}, updated_at: DAY + "T00:00:00Z",
  }, extra || {});
}

/* Six slots, six DIFFERENT items - the Item Clause holds, so the report has to
   draw the satisfied case as well as the broken one. Two Mega stones, which is
   what 292 of 395 Worlds teams carried. */
const teams = [{
  user_id: UID, id: "rain-ish", name: "Fixture team",
  slots: [
    { build: "kingambit", item: "Black Glasses" },
    { build: "charizard", item: "Charizardite Y" },
    { build: "iron-hands", item: "Assault Vest" },
    { build: null, item: null },
    { build: null, item: null },
    { build: null, item: null },
  ],
  notes: { plan: "Fixture only" },
  updated_at: DAY + "T00:00:00Z",
}];

/* A row per owned thing since migration 6. Two stones, because a team may
   carry two and 292 of 395 Worlds teams did. The third, Sablenite, unlocks a
   Mega for a species that is NOT in this box - that is the "dead weight until
   it arrives" branch, and without it nothing exercises it. */
const stones = ["Charizardite Y", "Garchompite", "Sablenite"].map(named);
const items = ["Focus Sash", "Sitrus Berry", "Black Glasses", "Assault Vest"]
  .map(named);

function named(id) {
  return { user_id: UID, id, updated_at: DAY + "T00:00:00Z" };
}

const meta = [
  { user_id: UID, id: "trainer", data: { box_capacity: 50 } },
];

/* A ROW PER TRADE since migration 7, open and closed alike - `closed` is the
   only thing that tells them apart. FULL on purpose: GTS_SLOTS is 3, and three
   open offers is what makes the panel draw its "all slots are in use" warning,
   the exact line that threw in production. The closed one carries the
   measurements, because the History fold computes its summary over them and an
   empty `data` would skip that too. */
const gts = [
  offer("garchomp", "Garchomp", "Incineroar", "2026-09-10"),
  offer("sneasler", "Sneasler", "Whimsicott", "2026-09-11", { note: "shiny wanted" }),
  offer("charizard", "Charizard", "Basculegion", "2026-09-12"),
  {
    user_id: UID, id: "eelektross", offered: "Eelektross",
    requested: "Dragonite", offered_id: null,
    deposited: "2026-08-30", deposited_at: "2026-08-30T10:00:00Z",
    closed: "2026-09-01", closed_at: "2026-09-01T12:00:00Z", note: "",
    data: { gaveBst: 515, gaveValue: 615, gotBst: 600, gaveShiny: false,
            days: 2, tookMs: 180000000, rankAtDeposit: 40 },
    updated_at: DAY + "T00:00:00Z",
  },
];

function offer(id, offered, requested, deposited, extra) {
  return Object.assign({
    user_id: UID, id, offered, requested, offered_id: null,
    deposited, deposited_at: deposited + "T09:00:00Z",
    closed: null, closed_at: null, note: "", data: {},
    updated_at: DAY + "T00:00:00Z",
  }, extra || {});
}

const ROWS = { box, builds, teams, stones, items, gts, meta };

/* The stub. It is the same shape supabase-js presents to 03-store.js and
   nothing more: a session, a select per table, and a channel that never
   fires. Written as a <script> because the app reads window.supabase at load. */
function stub() {
  return "<script>window.supabase={createClient:function(){return{" +
    "auth:{getSession:function(){return Promise.resolve({data:{session:{user:{" +
    "id:" + JSON.stringify(UID) + ",email:'fixture@example.com'}}}});}," +
    "onAuthStateChange:function(){},signInWithPassword:function(){}," +
    "signOut:function(){}}," +
    "from:function(t){return{select:function(){return Promise.resolve({" +
    "data:(window.__FIXTURE__[t]||[]).map(function(r){return r;}),error:null});}," +
    "insert:function(){return Promise.resolve({error:null});}," +
    "upsert:function(){return Promise.resolve({error:null});}," +
    "delete:function(){return{eq:function(){return Promise.resolve({error:null});}};}" +
    "};}," +
    "channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};" +
    "return c;}};}};<\/script>";
}

/* Boot the built page with the ledger above in place.
 *
 * Returns { window, errors, tick } - `errors` collects every uncaught
 * exception and console.error the page produces, which is the whole point:
 * a ReferenceError on a data-dependent path is invisible unless something
 * is watching for it. */
function boot(root) {
  const html = require("./harness.js").page(root);
  const errors = [];
  const vc = new VirtualConsole()
    .on("jsdomError", e => { if (!/scrollTo/.test(e.message)) errors.push(e.message); })
    .on("error", (...a) => errors.push(a.join(" ")));
  const seeded = "<script>window.__FIXTURE__=" + JSON.stringify(ROWS) + ";<\/script>";
  const dom = new JSDOM(
    html.replace("<head>", "<head>" + seeded + stub()),
    { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc });
  dom.window.addEventListener("error", e => {
    errors.push(e.error && e.error.stack ? e.error.stack.split("\n").slice(0, 3).join(" | ")
                                         : e.message);
  });
  /* the app writes its load failures here rather than throwing */
  const realError = dom.window.console.error;
  dom.window.console.error = function () {
    errors.push([...arguments].map(x => (x && x.stack) || String(x)).join(" "));
    if (realError) realError.apply(this, arguments);
  };
  const tick = ms => new Promise(r => setTimeout(r, ms || 400));
  return { window: dom.window, errors, tick, ROWS, UID };
}

module.exports = { boot, stub, ROWS, UID };
