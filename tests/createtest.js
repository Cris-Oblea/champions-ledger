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
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
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

const body = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script id="vendor-supabase">[\s\S]*?<\/script>/, "");
/* TAKEN is what the TABLE holds, which is not what the device has loaded:
   builds/farigiraf-2 and teams/prueba were written elsewhere. */
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.__TEAMS=${JSON.stringify(TEAMS)};
window.__TAKEN={"builds":["farigiraf","farigiraf-2"],"teams":["otro","prueba"]};
window.__INSERT=[]; window.__UPSERT=[];
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:(t==="teams"?window.__TEAMS:[])),error:null});},
   insert:function(r){
     window.__INSERT.push(t+"/"+r.id);
     var taken=(window.__TAKEN[t]||[]).indexOf(r.id)>=0;
     if(taken) return Promise.resolve({error:{code:"23505",
       message:'duplicate key value violates unique constraint "'+t+'_pkey"'}});
     (window.__TAKEN[t]=window.__TAKEN[t]||[]).push(r.id);
     return Promise.resolve({error:null});
   },
   upsert:function(r){ window.__UPSERT.push(t+"/"+r.id); return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){return Promise.resolve({error:null});}};}
 };},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};<\/script>`;
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message.split("\n")[0]); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
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
       w.__INSERT.join(","), "builds/farigiraf,builds/farigiraf-2,builds/farigiraf-3");
    /* the whole point: the id it could not see was NOT overwritten */
    ok("no sobrescribe nada por el camino", w.__UPSERT.length, 0);
    ok("y el id sigue siendo legible",
       /^builds\/farigiraf-3$/.test(w.__INSERT[2]), true);

    console.log("\n  editar una build existente no crea otra");
    w.__INSERT = []; w.__UPSERT = [];
    w.buildSheet("farigiraf", w.S.builds.farigiraf);
    save("buildEdit");
    setTimeout(() => {
      ok("escribe sobre su propio id", w.__UPSERT.join(","), "builds/farigiraf");
      ok("y no intenta crear nada", w.__INSERT.length, 0);

      console.log("\n  lo mismo para los equipos");
      w.__INSERT = []; w.__UPSERT = [];
      w.teamSheet(null, {name:"Prueba", slots:[], notes:{}});
      save("teamEdit");
      setTimeout(() => {
        ok("prueba y prueba-2", w.__INSERT.join(","), "teams/prueba,teams/prueba-2");
        ok("sin sobrescribir el equipo del otro aparato", w.__UPSERT.length, 0);

        console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
        console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
        process.exit(bad || errs.length ? 1 : 0);
      }, 400);
    }, 400);
  }, 600);
}, 1500);
