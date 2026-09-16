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
/* the code smells below are about the SOURCE, so they read the source */
const code = require("./harness.js").source(ROOT);
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
  while ((m = re.exec(code))) (decl[m[1]] = decl[m[1]] || []).push(1);
  while ((m = fre.exec(code))) (fdecl[m[1]] = fdecl[m[1]] || []).push(1);
  ok("ningun var declarado dos veces",
     list(Object.keys(decl).filter(k => decl[k].length > 1)), "0");
  ok("ninguna funcion declarada dos veces",
     list(Object.keys(fdecl).filter(k => fdecl[k].length > 1)), "0");
  /* the drawItems bug: a guard that skips the redraw when focus is inside the
     container it is about to rebuild. Legitimate for a form of text inputs
     (the Trainer tab), wrong for a list of buttons. */
  /* Counted by SHAPE rather than by counting every line that says
     activeElement. The old rule was "expect 2 lines" and it broke the day a
     DIALOG read activeElement to decide what Enter should do - which is not a
     redraw guard at all. What makes this a smell is the early `return`, so
     that is what is matched. */
  const guards = code.split("\n").filter(function(l){
    return /activeElement/.test(l) && /\breturn\b/.test(l) &&
           !/^\s*\/?\*/.test(l);
  });
  ok("solo queda un guard de redibujado", guards.length, 1);
  ok("y es el de la pestaña Trainer",
     guards.join(" ").indexOf("#v-trainer") >= 0, true);

  /* A CARD MUST SAY WHERE ITS CONTENTS START.

     A card is a <button>, and a button centres its own contents when its box
     is taller than they are - which is every card in a grid row except the
     tallest, because grid items stretch. That put 43px of nothing above the
     name and 38 below, and it had been latent for as long as the cards
     existed: it only showed when a neighbour grew taller - the HOME rows that
     now carry their own extra line are what made it visible.

     `display:block` does NOT stop it, because the centring happens inside the
     button own box - so this asserts the explicit answer, not the absence of
     the symptom. Geometry cannot be tested here at all: jsdom lays nothing
     out and reports every rectangle as zero, so the shape of the rule is the
     only thing this file can hold on to. */
  console.log(String.fromCharCode(10) + "  la tarjeta");
  const css = (src.match(/<style>([^]*?)<\/style>/g) || []).join(" ");
  const cardRule = (css.match(/\.row\.card\{[^}]*\}/) || [""])[0];
  ok("existe la regla .row.card", !!cardRule, true);
  ok("dice hacia donde apila", /flex-direction:\s*column/.test(cardRule), true);
  ok("y donde empieza el contenido",
     /justify-content:\s*flex-start/.test(cardRule), true);

  /* THE INTROS FOLD, AND NOTHING IS LOST WHEN THEY DO.

     Measured at 758px before this: Builds spent 220px and 58 words before
     the first build and HOME 199px, on paragraphs stating rules the player
     knows by heart. The first sentence stays and the rest goes behind a
     button that says how many words are in it.

     IT FAILED SILENTLY TWICE while being written, which is why it is tested
     at all: once because the boundary rule wanted a capital after the full
     stop and Builds continues "...it waits. 66 Stat Points", and once
     because the markup indents these across several lines and a regex dot
     does not cross a newline. Both times the result was no fold and no
     complaint - the exact shape of bug this file exists for. */
  console.log(String.fromCharCode(10) + "  los textos de entrada");
  const d = w.document;
  const ledes = [...d.querySelectorAll(".view .lede, .view > .sub")];
  const folded = ledes.filter(p => p.dataset.folded);
  ok("hay textos plegados", folded.length >= 3, true);
  ok("y el de Builds es uno de ellos",
     !!d.querySelector("#v-builds .lede .whybtn"), true);
  const bl = d.querySelector("#v-builds .lede");
  ok("la primera frase sigue visible",
     /A set is its own thing/.test(bl.firstChild.textContent), true);
  /* NOT DELETED - one tap away, and in the page for anyone reading source */
  ok("el resto sigue en el DOM",
     /66 Stat Points/.test(bl.querySelector(".more").textContent), true);
  ok("pero oculto de entrada", bl.querySelector(".more").hidden, true);
  ok("el boton dice cuantas palabras esconde",
     /^why \(\d+ words\)$/.test(bl.querySelector(".whybtn").textContent), true);
  bl.querySelector(".whybtn").dispatchEvent(
    new w.MouseEvent("click", {bubbles:true}));
  ok("y al pulsarlo se abre", bl.querySelector(".more").hidden, false);
  ok("...diciendo como cerrarlo", bl.querySelector(".whybtn").textContent,
     "less");
  /* ---- every key the page will ask for, in every table ---------------- */
  console.log("\n  las tablas, barridas");
  const DEX = C.DEX, names = {}, species = {};
  DEX.forEach(r => { names[r[0]] = r; species[r[1]] = 1; });

  ok("cada forma tiene movepool",
     list(DEX.map(r => r[0]).filter(n => !(w.learnset(n) || []).length)), "0");
  ok("cada forma tiene tipos con color",
     list(DEX.filter(r => r[2].some(t => !(w.TYPE_COLOR||{})[t])).map(r => r[0])), "0");
  /* THE COLOURS ARE FETCHED, NOT TYPED, and this is what stops them being
     typed again. All eighteen used to be hand-written and darkened so white
     text would sit on them, which made every one of them wrong - Fire read
     #C8501E against the real #FD7D24 (player, 2026-09-16: "son esos los
     originales o solo un aproximado?").

     Three facts per type, all three from pokemon.com's own rule: the colour,
     the second tone, and the ink that type's name is written in. */
  const TC = C.TYPE_COLORS || {};
  ok("la tabla de colores viaja en el payload", Object.keys(TC).length >= 18, true);
  ok("y cada color del app sale de ella",
     list(Object.keys(w.TYPE_COLOR || {})
       .filter(t => !TC[t] || TC[t].top !== w.TYPE_COLOR[t])), "0");
  ok("Fire es el oficial, no el oscurecido",
     (w.TYPE_COLOR || {}).Fire, "#FD7D24");
  /* the three the player spotted before the script did */
  ok("Dragon, Flying y Ground son de dos tonos",
     Object.keys(TC).filter(t => TC[t].two_tone).sort().join(","),
     "Dragon,Flying,Ground");
  ok("y los demas repiten su color",
     list(Object.keys(TC).filter(t => !TC[t].two_tone &&
       w.TYPE_COLOR2[t] !== w.TYPE_COLOR[t])), "0");
  /* the ink is a decision pokemon.com already made, and reading it is what
     lets the app keep the true colour instead of darkening it */
  ok("ocho tipos se escriben en negro",
     Object.keys(TC).filter(t => TC[t].ink !== "#FFFFFF").sort().join(","),
     "Electric,Fairy,Flying,Grass,Ground,Ice,Normal,Steel");
  ok("y cada tipo tiene tinta", list(Object.keys(TC)
     .filter(t => !/^#[0-9A-F]{6}$/.test(w.TYPE_INK[t] || ""))), "0");
  /* NADA INVENTADO. A Stellar row was added here first, because the type is in
     the chart and a missing colour paints something grey. The player settled
     it: "stellar no existe, eso es una invencion de smogon" - it reaches
     typechart.json only because that file is built from Smogon's dump-basics,
     which inherits from Scarlet/Violet. Champions has no Terastallization and
     no Pokemon carries the type. So the palette is exactly the eighteen
     pokemon.com publishes, and this asserts nobody adds a nineteenth. */
  ok("los 18 y nada mas", Object.keys(TC).length, 18);
  ok("ninguno inventado", list(Object.keys(TC).filter(t => !TC[t].official)), "0");
  ok("Stellar no tiene color, porque no existe aqui",
     !!(w.TYPE_COLOR || {}).Stellar, false);
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
