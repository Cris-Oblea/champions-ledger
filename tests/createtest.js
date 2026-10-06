/* Creating a record may never overwrite one.

   The id of a new build is READABLE and derived from the species - farigiraf,
   farigiraf-2, farigiraf-3 - because the build picker shows it to tell one
   Farigiraf set from another. What must not happen is picking the number
   off what THIS device has loaded and upserting: the phone creates
   farigiraf-2, the laptop - which has not seen it - also computes farigiraf-2,
   and the upsert silently replaces the phone's build with the laptop's.

   The answer is not UUIDs. The primary key is already (user_id, id), so ids never
   collide between accounts, and a UUID would cost the whole ledger its
   readability to solve a problem it does not have. The DATABASE decides
   whether an id is free: insert, and treat Postgres' 23505 as "taken, try
   the next one" (store.putNew).

   The fixture makes the race real. The device has loaded `farigiraf` only,
   while the table also holds a `farigiraf-2` that another device wrote a
   second ago. A correct create walks past both. */
const { describe } = require("node:test");
const { check, open, idle, row, build, click, all } = require("./harness.js");
const UID = "u1";

const ROWS = [row("farigiraf", "Farigiraf", {trained:true})];
const BUILDS = [build("farigiraf", "Farigiraf", {box_id:"farigiraf",
  nature:"Quiet", stat_points:{hp:32,atk:0,def:2,spa:32,spd:0,spe:0},
  moves:["Trick Room"]})];
const TEAMS = [{user_id:UID, id:"t1", name:"Other", slots:[], notes:{},
  updated_at:"2026-09-13"}];

/* TAKEN is what the TABLE holds, which is not what the device has loaded:
   builds/farigiraf-2 and teams/trial were written elsewhere. */
const TAKEN = { builds: ["farigiraf", "farigiraf-2"], teams: ["other", "trial"] };
const { dom, errs } = open(
  { box: ROWS, builds: BUILDS, teams: TEAMS }, { taken: TAKEN });
/** what the app sent, as "table/id", one list per kind of write
   @param {string} op */
const sent = op => dom.window.__WROTE.filter(x => x.op === op).map(x => x.table + "/" + x.row.id);
const w = dom.window, d = w.document;
/** @param {string} which */
const save = which => click([...all(d, "#" + which + "Foot button")]
  .find(b => b.textContent === "Save"));

(async () => {
  await idle();
  await describe("a new build, with the race running", async () => {
    check("the device has loaded only one build",
       Object.keys(w.S.builds).length, 1);
    w.buildSheet(null, /** @type {Build} */ ({pokemon:"Farigiraf"}));
    save("buildEdit");
    await idle();
    check("it tries farigiraf, then -2, then -3",
       sent("insert").join(","), "builds/farigiraf,builds/farigiraf-2,builds/farigiraf-3");
    /* the whole point: the id it could not see was NOT overwritten */
    check("it overwrites nothing on the way", sent("upsert").length, 0);
    check("and the id stays readable",
       /^builds\/farigiraf-3$/.test(sent("insert")[2]), true);
  });

  await describe("editing an existing build creates none", async () => {
    w.__WROTE.length = 0;
    w.buildSheet("farigiraf", w.S.builds.farigiraf);
    save("buildEdit");
    await idle();
    check("it writes over its own id", sent("upsert").join(","), "builds/farigiraf");
    check("and tries to create nothing", sent("insert").length, 0);
  });

  await describe("the same for teams", async () => {
    w.__WROTE.length = 0;
    w.teamSheet(null, {name:"Trial", slots:[], notes:{}, updated:""});
    save("teamEdit");
    await idle();
    check("trial, then trial-2", sent("insert").join(","), "teams/trial,teams/trial-2");
    check("without overwriting the other device's team", sent("upsert").length, 0);
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
