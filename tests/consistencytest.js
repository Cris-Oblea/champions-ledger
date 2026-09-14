/* Bugs of the SHAPE the player kept finding, hunted mechanically.

   Two landed on 2026-09-10 and neither was visible by reading the screen:

     STAT_LABEL was declared twice - the second declaration, an array, won at
     runtime, so every caller asking STAT_LABEL["hp"] got undefined and a
     Pokemon's sheet printed six numbers with no captions.

     learnset() resolved the SPECIES before the FORM, so 25 regional forms were
     handed their base form's movepool, and four forms resolved to nothing at
     all.

   Both are the same kind of fault: a lookup that silently returns the wrong
   thing instead of failing. So this sweeps every table the page reads, asserts
   every key it will be asked for is there, and re-checks the two code smells
   in the built file. It is a sweep, not a sample, because a sample missed 24
   of those 25 forms. */
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
const list = (a, n) => a.length ? a.slice(0, n || 6).join(", ") +
  (a.length > (n || 6) ? " (+" + (a.length - (n || 6)) + ")" : "") : "0";

const src = require("./harness.js").page(ROOT);
const body = src;
const stub = `<script>window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:null}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(){return{select:function(){return Promise.resolve({data:[],error:null});}};},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};<\/script>`;
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window;

setTimeout(() => {
  const C = w.CHAMP;

  /* ---- the two code smells, so neither can come back ------------------ */
  console.log("\n  el codigo");
  const decl = {}, fdecl = {};
  let m, re = /^var ([A-Za-z_$][\w$]*)\s*=/gm, fre = /^function ([A-Za-z_$][\w$]*)\s*\(/gm;
  while ((m = re.exec(src))) (decl[m[1]] = decl[m[1]] || []).push(1);
  while ((m = fre.exec(src))) (fdecl[m[1]] = fdecl[m[1]] || []).push(1);
  ok("ningun var declarado dos veces",
     list(Object.keys(decl).filter(k => decl[k].length > 1)), "0");
  ok("ninguna funcion declarada dos veces",
     list(Object.keys(fdecl).filter(k => fdecl[k].length > 1)), "0");
  /* the drawItems bug: a guard that skips the redraw when focus is inside the
     container it is about to rebuild. Legitimate for a form of text inputs
     (the Trainer tab), wrong for a list of buttons. */
  const guards = src.split("\n").filter(function(l){
    return /activeElement/.test(l) && !/^\s*\/?\*/.test(l);
  });
  ok("solo queda un guard de foco", guards.length, 2);   // una sentencia if, dos lineas
  ok("y es el de la pestaña Trainer",
     guards.join(" ").indexOf("#v-trainer") >= 0, true);

  /* ---- every key the page will ask for, in every table ---------------- */
  console.log("\n  las tablas, barridas");
  const DEX = C.DEX, names = {}, species = {};
  DEX.forEach(r => { names[r[0]] = r; species[r[1]] = 1; });

  ok("cada forma tiene movepool",
     list(DEX.map(r => r[0]).filter(n => !(w.learnset(n) || []).length)), "0");
  ok("cada forma tiene tipos con color",
     list(DEX.filter(r => r[2].some(t => !(w.TYPE_COLOR||{})[t])).map(r => r[0])), "0");
  ok("cada habilidad del dex tiene texto",
     list([...new Set([].concat.apply([], DEX.map(r => r[5] || [])))]
       .filter(a => !C.ABIL[a])), "0");
  ok("cada habilidad del dex esta clasificada",
     list([...new Set([].concat.apply([], DEX.map(r => r[5] || [])))]
       .filter(a => !(C.AB_CLASS || {})[a])), "0");
  ok("cada Mega tiene piedra",
     list(C.STONES.filter(r => !r[0]).map(r => r[1])), "0");
  ok("cada piedra apunta a un Mega que existe",
     list(C.STONES.filter(r => !names[r[1]]).map(r => r[1])), "0");
  ok("cada forma tiene numero de dex",
     list(DEX.filter(r => !r[6] && !(C.DEXNO || {})[r[1]]).map(r => r[0])), "0");
  ok("cada forma resuelve un nombre en el motor de Smogon",
     list(DEX.map(r => r[0]).filter(n => !(C.SMOGON_NAME || {})[n] &&
                                         !(C.AEGIS || {})[n] &&
                                         !/Aegislash/.test(n))), "0");

  /* the same fault as learnset(), one table over: megasFor() read the SPECIES,
     so Raichu-Alola was offered the two Mega Raichu and Slowbro-Galar was
     offered Mega Slowbro. Smogon's roster states which form each Mega comes
     from, and it is not always the base one - Mega Floette belongs to
     Floette-ETERNAL. */
  console.log("\n  cada Mega, en la forma que sostiene la piedra");
  const megaNames = DEX.filter(r => r[4]).map(r => r[0]);
  ok("ninguna Mega se queda sin dueño",
     list(megaNames.filter(m => !Object.keys(C.MEGA_OWNER || {})
       .some(k => C.MEGA_OWNER[k].indexOf(m) >= 0))), "0");
  ok("ninguna forma alternativa hereda Megas de su base",
     list(DEX.filter(r => r[0] !== r[1] && !r[4]).filter(function(r){
       const offered = (w.megasFor(r[0]) || []).map(x => x.name);
       const own = (C.MEGA_OWNER || {})[r[0]] || [];
       return offered.some(m => own.indexOf(m) < 0);
     }).map(r => r[0])), "0");
  ok("Raichu-Alola no puede Mega Evolucionar",
     (w.megasFor("Raichu-Alola") || []).length, 0);
  ok("Slowbro-Galar tampoco", (w.megasFor("Slowbro-Galar") || []).length, 0);
  ok("Raichu si, con sus dos", (w.megasFor("Raichu") || []).length, 2);
  ok("Mega Floette es de Floette-Eternal",
     ((C.MEGA_OWNER || {})["Floette-Eternal"] || []).join(","), "Mega Floette");
  ok("ninguna clave repite una Mega",
     list(Object.keys(C.MEGA_OWNER || {}).filter(k =>
       new Set(C.MEGA_OWNER[k]).size !== C.MEGA_OWNER[k].length)), "0");

  /* the player met the same Pokemon twice under two spellings: Indeedee-F and
     Indeedee-Female, one of them labelled "not in the Champions dex", and
     Squawkabilly's three extra plumages listed as if they were something
     else. HOME_ONLY is matched with norm() now, never by exact spelling. */
  console.log("\n  un Pokemon, un nombre");
  const spellings = (C.HOME_ONLY || []).filter(function(n){
    return Object.keys(C.COSMETIC || {}).some(function(k){
      return (C.COSMETIC[k] || []).indexOf(n) >= 0;
    });
  });
  ok("ninguna grafia alternativa se ofrece como HOME-only", list(spellings), "0");
  ok("Indeedee-F no esta en HOME_ONLY",
     (C.HOME_ONLY || []).indexOf("Indeedee-F") >= 0, false);
  ok("los colores de Squawkabilly tampoco",
     (C.HOME_ONLY || []).filter(n => n.indexOf("Squawkabilly-") === 0).length, 0);
  /* They used to be listed here as three cosmetic spellings of one entry. They
     are not: the plumage is fixed when you catch the bird and it decides the
     third ability - Green and Blue get Guts, Yellow and White Sheer Force, and
     collapsing them had left Sheer Force with no carrier in the database at
     all (player, 2026-09-12). Each is its own dex row now, so none of them may
     be filed as a spelling of another. */
  ok("las plumas NO son grafias cosmeticas",
     ((C.COSMETIC || {})["Squawkabilly"] || []).length, 0);
  ok("cada pluma es su propia fila del dex",
     ["Squawkabilly", "Squawkabilly-Blue", "Squawkabilly-Yellow",
      "Squawkabilly-White"].filter(n =>
        C.DEX.some(r => r[0] === n)).length, 4);
  ok("y los cuatro tamanos de Gourgeist tambien",
     ["Gourgeist", "Gourgeist-Small", "Gourgeist-Large",
      "Gourgeist-Jumbo"].filter(n =>
        C.DEX.some(r => r[0] === n)).length, 4);
  ok("ninguna Mega se cuela como grafia cosmetica",
     list(Object.keys(C.COSMETIC || {}).filter(k =>
       (C.COSMETIC[k] || []).some(n => /-Mega/.test(n)))), "0");

  console.log("\n  las tablas derivadas");
  const moveNames = {};
  C.MOVES.forEach(r => { moveNames[r[0]] = 1; });
  const badMove = [];
  Object.keys(C.AB_MOVES || {}).forEach(a => {
    (C.AB_MOVES[a].m || []).forEach(i => {
      if (!C.MOVES[i]) badMove.push(a + "[" + i + "]");
    });
  });
  ok("cada indice de la tabla de habilidades apunta a un movimiento",
     list(badMove), "0");
  ok("cada movimiento que un item sirve existe",
     list(Object.keys(C.ITEM_FOR_MOVE || {}).filter(n => !moveNames[n])), "0");
  ok("cada habilidad que un item sirve existe",
     list(Object.keys(C.ITEM_FOR_ABILITY || {}).filter(a => !C.ABIL[a])), "0");
  ok("cada movimiento que causa estado existe",
     list([].concat.apply([], Object.keys(C.STATUSES || {})
       .map(s => C.STATUSES[s].moves || [])).filter(n => !moveNames[n])), "0");
  ok("cada learnset apunta a movimientos reales",
     list(Object.keys(C.LEARN).filter(k =>
       C.LEARN[k].some(i => !C.MOVES[i]))), "0");
  ok("cada alias de learnset apunta a una clave real",
     list(Object.keys(C.LEARN_ALIAS || {})
       .filter(k => !C.LEARN[C.LEARN_ALIAS[k]])), "0");

  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
}, 1400);
