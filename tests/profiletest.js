/* The Profile tab: one editable number, and everything else derived.

   It was called Trainer and held seven hand-typed fields. Nothing read five of
   them, and by the time the player looked they had drifted - the stored
   `regulation` still said M-B three days into M-C. His rule (2026-09-12): keep
   only what the app really uses and what only he can know, and derive the rest
   so it cannot go stale.

   So this asserts the SHAPE, not the values: one input, no VP anywhere, and
   every derived line present and non-empty. */
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
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(52) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const UID = "u1";
const ROWS = [
 {user_id:UID,id:"garchomp",name:"Garchomp",location:"champions",status:"permanent",
  origin:"champions",note:"",ord:0,updated_at:"2026-09-11",shiny:false,trained:true},
 {user_id:UID,id:"sneasler",name:"Sneasler",location:"champions",status:"rental",
  origin:"champions",note:"",ord:1,updated_at:"2026-09-12",shiny:false,trained:false},
 {user_id:UID,id:"sableye",name:"Sableye",location:"home",status:"permanent",
  origin:"home",note:"",ord:2,updated_at:"2026-09-10",shiny:false,trained:true}];
const BUILDS = [{user_id:UID,id:"garchomp",pokemon:"Garchomp",mega:null,
  ability:"Rough Skin",mega_ability:null,nature:"Jolly",
  stat_points:{hp:0,atk:32,def:0,spa:0,spd:2,spe:32},
  moves:["Earthquake","Rock Slide","Dragon Claw","Protect"],
  role:"",rationale:"",extra:{},updated_at:"2026-09-11"}];

const src = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8");
const body = src.replace(/<script id="vendor-supabase">[\s\S]*?<\/script>/, "");
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:[]),error:null});},
   upsert:function(){return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){return Promise.resolve({error:null});}};}
 };},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};
<\/script>`;
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message.split("\n")[0]); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window, d = w.document;

/* profCounts/profData ARE the <dl>; diagOut is a <div> wrapping one, plus a
   "Copy this" button - so look through to the list either way. */
const pairs = id => {
  let n = d.getElementById(id);
  if (!n) return {};
  if (n.tagName !== "DL") n = n.querySelector("dl") || n;
  const out = {}; let k = null;
  [...n.children].forEach(c => {
    if (c.tagName === "DT") k = c.textContent.trim();
    else if (k) { out[k] = c.textContent.trim(); k = null; }
  });
  return out;
};

setTimeout(() => {
  console.log("\n  el encabezado");
  ok("se llama Profile", d.querySelector("#v-trainer h1").textContent, "Profile");
  ok("y la pestaña tambien",
     [...d.querySelectorAll("#tabs button, #tabs a")]
       .some(b => b.textContent.trim() === "Profile"), true);

  console.log("\n  un solo campo editable");
  const inputs = [...d.querySelectorAll("#v-trainer input")]
    .filter(i => i.type !== "file").map(i => i.id);
  ok("solo queda box capacity", inputs.join(", "), "tCap");

  console.log("\n  el VP no se guarda en ningun sitio");
  ok("sin campo de balance", !!d.getElementById("tVp"), false);
  ok("sin chip de VP en la cabecera", !!d.getElementById("vpCount"), false);
  ok("y el codigo no lo escribe", /vp_balance/.test(src), false);
  /* the cost table stays, as pure reference */
  const costs = pairs("costs");
  ok("la tabla de costes sigue", Object.keys(costs).length >= 8, true);
  ok("y un coste conocido es correcto", costs["Move"], "250 VP");

  console.log("\n  lo derivado, que no puede quedarse obsoleto");
  ok("uso de la caja junto a la capacidad",
     /2 of 50 used . 48 free/.test(d.getElementById("capUse").textContent), true);
  const hold = pairs("profCounts");
  ok("cuenta la caja separando comprados de rentals",
     hold["In the Champions box"], "2 (1 bought, 1 rental)");
  ok("cuenta HOME", hold["In HOME"], "1");
  ok("cuenta builds", hold["Builds written"], "1");
  ok("cuenta piedras sobre el total", /of 81$/.test(hold["Mega Stones owned"]), true);

  const data = pairs("profData");
  /* the regulation is READ from pokebase, never typed - which is the whole
     point: the field it replaced said M-B three days into M-C */
  ok("la regulacion sale de los datos", /^M-[A-Z] . since \d{4}-\d\d-\d\d/.test(data["Regulation"]), true);
  ok("dice cuando se bajo el uso del ladder",
     /fetched \d{4}-\d\d-\d\d/.test(data["Ladder usage"]), true);
  ok("y que es del ladder de esa regulacion",
     data["Ladder usage"].indexOf(data["Regulation"].split(" ")[0]) > 0, true);
  ok("marca los datos de torneo como historia",
     /M-B/.test(data["Tournament data"]), true);
  ok("cuenta las formas del dex", /^\d{3} forms/.test(data["Dex"]), true);

  /* The stat line is the form it STARTS in, and Aegislash never attacks in
     that one: Stance Change gives it 140 Attack the moment it uses a damaging
     move, while the sheet printed 50. The database has carried `battle_forms`
     for a while and nothing shipped it to the app, so both sheets showed the
     misleading half (found 2026-09-12). Asserted on BOTH, because the number
     is equally wrong on each. */
  console.log("\n  lo que cambia en combate");
  const bnote = () => {
    const b = d.getElementById("sheetBody");
    const n = [...b.querySelectorAll(".note")]
      .find(x => /In battle it changes/.test(x.textContent));
    return n ? n.textContent.replace(/\s+/g, " ") : "";
  };
  w.findDetail(w.byName["Aegislash"]);
  ok("Aegislash avisa de Blade Forme", /Blade/.test(bnote()), true);
  ok("...y que el Ataque pasa de 50 a 140", /Atk 50 . 140/.test(bnote()), true);
  ok("...nombrando la habilidad", /Stance Change/.test(bnote()), true);
  w.findDetail(w.byName["Palafin"]);
  ok("Palafin avisa de Hero Form", /Atk 70 . 160/.test(bnote()), true);
  w.findDetail(w.byName["Castform"]);
  ok("Castform avisa del cambio de TIPO",
     /Fire/.test(bnote()) && /Water/.test(bnote()) && /Ice/.test(bnote()), true);
  w.findDetail(w.byName["Garchomp"]);
  ok("y un Pokemon que no cambia no lleva bloque", bnote(), "");
  w.pokeSheet({name:"Aegislash", location:"champions", status:"permanent",
               origin:"champions", _id:"x"});
  ok("y la ficha de la caja lo dice igual", /Atk 50 . 140/.test(bnote()), true);

  console.log("\n  diagnostics");
  const diag = pairs("diagOut");
  ["Latest deployed", "Regulation", "Ladder usage fetched", "Blob integrity",
   "Last ledger write"].forEach(k => {
    ok("informa " + k, !!(diag[k] && diag[k].length), true);
  });
  ok("la integridad no reporta nada vacio", /MISSING/.test(diag["Blob integrity"]), false);
  ok("la ultima escritura sale del ledger", diag["Last ledger write"], "2026-09-12");

  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
}, 1600);
