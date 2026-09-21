/* THE CHECKLIST: what is still missing, and in what order to go after it.

   Champions' own route in is a gacha, so the dex is finished through Pokemon
   GO into HOME and the GTS for the rest. A list of everything he does not own
   would be 134 cards in dex order and answer nothing; what this pane is for
   is the ORDER (player, 2026-09-20: "la idea es ir priorizando pokemones que
   no tengo por al menos 1 copia por especie", and the first bucket is his
   own: "los mas priorizados deberian ser los que estan haciendo espacio en
   pokemon champions en estos momentos").

   The rule this pins down is the one that is easy to get backwards: a species
   already in HOME is DONE even when a copy is also welded into the Champions
   box, because the HOME copy is the one that makes the slot elastic. */
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

const row = (id, name, location, status, origin) => ({user_id:UID, id, name,
  location, status, origin, note:"", ord:0, updated_at:"2026-09-21",
  shiny:false, trained:true});
/* Aggron is bought and welded, Meganium is a rental, Dragonite only exists in
   HOME, and Garchomp is in BOTH - which is the case that must NOT be listed. */
const ROWS = [
  row("aggron",    "Aggron",    "champions", "permanent", "champions"),
  row("meganium",  "Meganium",  "champions", "rental",    "champions"),
  row("dragonite", "Dragonite", "home",      "permanent", "home"),
  row("garchomp",  "Garchomp",  "champions", "permanent", "champions"),
  row("garchomp2", "Garchomp",  "home",      "permanent", "home"),
];

const body = require("./harness.js").page(ROOT);
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)};
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:[],error:null});},
   upsert:function(){return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){return Promise.resolve({error:null});}};}
 };},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};
<\/script>`;
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) console.log("  jsdom: " + e.message); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window, d = w.document;
const pane = k => [...d.querySelectorAll(".homeseg button")]
  .find(b => b.dataset.home === k);
const names = id => [...d.querySelectorAll("#" + id + " .row.card .rname")]
  .map(x => x.textContent.split(/[A-Z]{2,}|doable|easy|hard/)[0].trim());

setTimeout(() => {
  w.go("home");

  console.log("\n  tres paneles, un selector");
  ok("empieza en la caja", d.getElementById("homePaneBox").hidden, false);
  pane("gts").click();
  ok("GTS se abre", d.getElementById("homePaneGts").hidden, false);
  ok("...y la caja se cierra", d.getElementById("homePaneBox").hidden, true);
  pane("dex").click();
  ok("Dex se abre", d.getElementById("homePaneDex").hidden, false);
  ok("...y GTS se cierra", d.getElementById("homePaneGts").hidden, true);

  console.log("\n  que falta, y en que orden");
  /* 264 = el dex sin las megas. Una mega no se obtiene, se crea con su piedra,
     asi que no puede estar en una lista de capturas. */
  ok("el objetivo es el dex sin megas",
     w.CHAMP.DEX.filter(p => !p[4]).length, 264);
  ok("cuatro especies son suyas", /4 of 264/.test(
     d.getElementById("dexDone").textContent), true);
  ok("dos liberan slot", d.getElementById("nDexFree").textContent, 2);
  ok("y faltan 260", d.getElementById("nDexMissing").textContent, 260);

  const free = names("listDexFree");
  ok("Aggron libera slot", free.indexOf("Aggron") >= 0, true);
  ok("Meganium tambien", free.indexOf("Meganium") >= 0, true);
  /* EL CASO QUE IMPORTA: Garchomp esta en la caja Y en HOME, asi que ya esta
     resuelto - la copia de HOME es la que hace el slot elastico. */
  ok("Garchomp NO, porque ya esta en HOME", free.indexOf("Garchomp") >= 0, false);
  ok("y no aparece entre los que faltan",
     names("listDexMissing").indexOf("Garchomp") >= 0, false);
  ok("Dragonite tampoco, solo vive en HOME",
     names("listDexMissing").indexOf("Dragonite") >= 0, false);

  console.log("\n  el filtro");
  const inp = d.getElementById("dexFilter");
  inp.value = "aggron";
  inp.dispatchEvent(new w.Event("input", {bubbles:true}));
  ok("filtra la primera lista", names("listDexFree").join(","), "Aggron");
  ok("y vacia la segunda",
     !!d.querySelector("#listDexMissing .empty"), true);
  inp.value = "";
  inp.dispatchEvent(new w.Event("input", {bubbles:true}));
  ok("y se deshace", d.getElementById("nDexFree").textContent, 2);

  console.log(bad ? "\n  " + bad + " FALLAN\n" : "\n  todo bien\n");
  process.exit(bad ? 1 : 0);
}, 1200);
