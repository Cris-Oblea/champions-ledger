/* You cannot deposit what cannot leave the game.

   A Champions-ORIGIN Pokemon came out of an Encounter and can never leave the
   box, so it can never reach a GTS box in HOME. The picker's own section note
   said exactly that while the filter listed the whole Champions box anyway -
   all 40 rows of it, every one impossible (player, 2026-09-12).

   Three ways to be locked, and all three must be filtered:
     origin "champions"  - bought from an Encounter
     status "rental"     - Champions origin by definition, whatever origin says
     origin missing      - counted as Champions origin everywhere else, and the
                           safe way round: offering something you cannot move is
                           a dead end, hiding something you could is one question

   And the ones that CAN go: anything in HOME, plus a HOME-origin Pokemon
   sitting in the Champions box, which can be parked back and deposited. */
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(50) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const UID = "u1";
const R = (id, name, loc, origin, status) => ({user_id:UID, id, name,
  location:loc, status, origin, note:"", ord:0,
  updated_at:"2026-09-12", shiny:false, trained:false});
const ROWS = [
  R("g1", "Garchomp",  "champions", "champions", "permanent"),
  R("g2", "Sneasler",  "champions", "home",      "rental"),   // rental beats origin
  R("g3", "Mawile",    "champions", null,        "permanent"),
  R("g4", "Sableye",   "champions", "home",      "permanent"),
  R("g5", "Sharpedo",  "home",      "home",      "permanent")];

const body = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, "");
const stub = `<script>window.__ROWS=${JSON.stringify(ROWS)};
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:[],error:null});},
   upsert:function(){return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){return Promise.resolve({error:null});}};}};},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};<\/script>`;
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message.split("\n")[0]); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window, d = w.document;

setTimeout(() => {
  w.gtsPickMine(function(){}, null);
  const sheet = d.getElementById("sheetBody");
  const offered = [...sheet.querySelectorAll(".list .row")]
    .map(b => b.querySelector(".rname").firstChild.textContent.trim());

  console.log("\n  lo que se puede depositar");
  ok("Sharpedo, que esta en HOME", offered.indexOf("Sharpedo") >= 0, true);
  ok("Sableye, HOME origin dentro de la caja",
     offered.indexOf("Sableye") >= 0, true);
  ok("y nada mas", offered.length, 2);

  console.log("\n  lo que no puede salir del juego");
  ok("Garchomp (origen Champions) fuera",
     offered.indexOf("Garchomp") >= 0, false);
  ok("Sneasler (rental) fuera", offered.indexOf("Sneasler") >= 0, false);
  ok("Mawile (origen sin registrar) fuera",
     offered.indexOf("Mawile") >= 0, false);

  console.log("\n  y se dice, no se esconde");
  const notes = [...sheet.querySelectorAll("p.sub")].map(p => p.textContent);
  ok("cuenta los que quedan fuera",
     notes.some(t => /3 more in the Champions box/.test(t)), true);
  ok("y explica por que",
     notes.some(t => /never leave the game/.test(t)), true);

  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
}, 1500);
