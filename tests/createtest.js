/* Creating a record may never overwrite one.

   The id of a new build is READABLE and derived from the species - farigiraf,
   farigiraf-2, farigiraf-3 - because the build picker shows it to tell one
   Farigiraf set from another. That readability is worth keeping; what was
   wrong was HOW the number got picked. Every write went through
   `upsert(row, {onConflict:"user_id,id"})`, and the next free number was read
   off `S.builds`, i.e. off what THIS device had loaded. So: the phone creates
   farigiraf-2, the laptop - which has not seen it - also computes farigiraf-2,
   and the upsert silently replaces the phone's build with the laptop's.

   The fix is not UUIDs. The primary key is already (user_id, id), so ids never
   collide between accounts, and a UUID would cost the whole ledger its
   readability to solve a problem it does not have. The fix is to let the
   DATABASE decide whether an id is free: insert, and treat Postgres' 23505 as
   "taken, try the next one".

   The fixture makes the race real. The device has loaded `farigiraf` only,
   while the table also holds a `farigiraf-2` that another device wrote a
   second ago. A correct create walks past both. */
const ROOT = require("path").join(__dirname, "..") + "/";
const UID = "u1";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(52) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const ROWS = [{user_id:UID, id:"farigiraf", name:"Farigiraf",
  location:"champions", status:"permanent", origin:"champions", note:"",
  ord:0, updated_at:"2026-09-13", shiny:false, trained:true}];
const BUILDS = [{user_id:UID, id:"farigiraf", pokemon:"Farigiraf",
  box_id:"farigiraf", mega:null, ability:null, mega_ability:null,
  nature:"Quiet", stat_points:{hp:32,atk:0,def:2,spa:32,spd:0,spe:0},
  moves:["Trick Room"], role:"", rationale:"", extra:{},
  updated_at:"2026-09-13"}];
const TEAMS = [{user_id:UID, id:"t1", name:"Otro", slots:[], notes:{},
  updated_at:"2026-09-13"}];

/* TAKEN is what the TABLE holds, which is not what the device has loaded:
   builds/farigiraf-2 and teams/prueba were written elsewhere. */
const TAKEN = { builds: ["farigiraf", "farigiraf-2"], teams: ["otro", "prueba"] };
const { dom, errs } = require("./harness.js").open(ROOT,
  { box: ROWS, builds: BUILDS, teams: TEAMS }, { taken: TAKEN });
/* what the app sent, as "table/id", one list per kind of write */
const sent = op => dom.window.__WROTE.filter(x => x.op === op).map(x => x.table + "/" + x.row.id);
const w = dom.window, d = w.document;
const click = n => n.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
const save = which => click([...d.querySelectorAll("#" + which + "Foot button")]
  .find(b => b.textContent === "Save"));

setTimeout(() => {
  console.log("\n  una build nueva, con la carrera en marcha");
  ok("el aparato solo ha cargado una build",
     Object.keys(w.S.builds).length, 1);
  w.buildSheet(null, {pokemon:"Farigiraf"});
  save("buildEdit");
  setTimeout(() => {
    ok("prueba farigiraf, luego -2, luego -3",
       sent("insert").join(","), "builds/farigiraf,builds/farigiraf-2,builds/farigiraf-3");
    /* the whole point: the id it could not see was NOT overwritten */
    ok("no sobrescribe nada por el camino", sent("upsert").length, 0);
    ok("y el id sigue siendo legible",
       /^builds\/farigiraf-3$/.test(sent("insert")[2]), true);

    console.log("\n  editar una build existente no crea otra");
    w.__WROTE.length = 0;
    w.buildSheet("farigiraf", w.S.builds.farigiraf);
    save("buildEdit");
    setTimeout(() => {
      ok("escribe sobre su propio id", sent("upsert").join(","), "builds/farigiraf");
      ok("y no intenta crear nada", sent("insert").length, 0);

      console.log("\n  lo mismo para los equipos");
      w.__WROTE.length = 0;
      w.teamSheet(null, {name:"Prueba", slots:[], notes:{}});
      save("teamEdit");
      setTimeout(() => {
        ok("prueba y prueba-2", sent("insert").join(","), "teams/prueba,teams/prueba-2");
        ok("sin sobrescribir el equipo del otro aparato", sent("upsert").length, 0);

        console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
        console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
        process.exit(bad || errs.length ? 1 : 0);
      }, 400);
    }, 400);
  }, 600);
}, 1500);
