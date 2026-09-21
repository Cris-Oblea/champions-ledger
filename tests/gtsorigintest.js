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
  R("g5", "Sharpedo",  "home",      "home",      "permanent"),
  /* un DUPLICADO y un pokemon que Champions no tiene: las dos unicas cosas
     que su propia regla deja ofrecer, y las dos que habia que encontrar a
     ojo bajando la lista entera (2026-09-18) */
  R("g6", "Sharpedo",  "home",      "home",      "permanent"),
  R("g7", "Bulbasaur", "home",      "home",      "permanent"),
  /* Y EL CASO QUE ROMPIA EL FILTRO: un Metagross de verdad en HOME y un
     Metagross RENTAL en la caja de Champions. Contarlos juntos daba 2 y el
     filtro ofrecia el de HOME como material de cambio, que es perder la
     especie (player, 2026-09-21: "ESO NO ES DUPLICADO!... aqui tengo un
     metagross real y un metagross rental que nunca se podra mover"). */
  R("g8", "Metagross", "home",      "home",      "permanent"),
  R("g9", "Metagross", "champions", "champions", "rental")];

const body = require("./harness.js").page(ROOT);
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
  ok("y nada mas", offered.length, 5);

  console.log("\n  lo que no puede salir del juego");
  ok("Garchomp (origen Champions) fuera",
     offered.indexOf("Garchomp") >= 0, false);
  ok("Sneasler (rental) fuera", offered.indexOf("Sneasler") >= 0, false);
  ok("Mawile (origen sin registrar) fuera",
     offered.indexOf("Mawile") >= 0, false);

  console.log("\n  y se dice, no se esconde");
  const notes = [...sheet.querySelectorAll("p.sub")].map(p => p.textContent);
  ok("cuenta los que quedan fuera",
     notes.some(t => /4 more in the Champions box/.test(t)), true);
  ok("y explica por que",
     notes.some(t => /never leave the game/.test(t)), true);

  /* ------------------------------------------- la card, y como se ordena */
  /* Era una fila pelada con un BST y una Speed, que no alcanza para decidir
     que regalas (2026-09-18: "solo muestra bst y speed, pero falta todo lo
     demas"). Ahora es la misma card que el resto de la app. */
  console.log("\n  la misma card que en todas partes");
  const cards = () => [...sheet.querySelectorAll(".list .row")];
  const nameOf = b => b.querySelector(".rname").firstChild.textContent.trim();
  ok("cada fila es una card",
     cards().every(b => / card\b/.test(b.className)), true);
  ok("con sus seis stats",
     cards().every(b => !!b.querySelector(".statline")), true);
  ok("y con su BST", cards().every(b => /BST/.test(b.textContent)), true);
  /* el que Champions no tiene TAMBIEN, que es justo el que sirve de moneda */
  const bulba = cards().find(b => nameOf(b) === "Bulbasaur");
  ok("hasta el que no esta en Champions trae numeros",
     !!bulba && /318/.test(bulba.textContent), true);

  const tog = t => [...sheet.querySelectorAll(".tog")]
    .find(b => b.textContent.trim() === t);
  const press = t => tog(t)
    .dispatchEvent(new w.MouseEvent("click", {bubbles:true}));

  console.log("\n  los dos filtros que esta pantalla existe para responder");
  ok("hay orden por numero de dex", !!tog("Dex no."), true);
  press("Duplicates only");
  /* UN RENTAL NO HACE DUPLICADO. Los dos Sharpedo si lo son; el Metagross de
     HOME esta solo, porque el rental de la caja nunca podra salir del juego y
     por tanto nunca podra ser la copia que se queda. */
  ok("duplicados: solo los dos Sharpedo",
     cards().map(nameOf).join(","), "Sharpedo,Sharpedo");
  ok("Metagross no cuenta como duplicado",
     cards().map(nameOf).indexOf("Metagross") >= 0, false);
  press("Duplicates only");
  press("Not in Champions only");
  ok("fuera del dex: solo Bulbasaur", cards().map(nameOf).join(","), "Bulbasaur");
  press("Not in Champions only");
  ok("y al soltarlos vuelven los cinco", cards().length, 5);
  /* Y LA RED DE SEGURIDAD LEIA EL MISMO NUMERO EQUIVOCADO. El aviso de
     "ultima copia" es lo que atrapa el error que el filtro dejaba pasar, y
     con el rental contado como copia no salia. */
  const badgesOf = n => {
    const c = cards().find(b => nameOf(b) === n);
    return c ? [...c.querySelectorAll(".rname .tag")].map(t => t.textContent) : [];
  };
  ok("el Metagross de HOME avisa de que es la ultima copia",
     badgesOf("Metagross").some(t => /your only one/i.test(t)), true);
  ok("y un Sharpedo no", badgesOf("Sharpedo").some(t => /your only one/i.test(t)),
     false);

  console.log("\n  el que no esta en Champions tiene precio, y por tanto consejo");
  /* chipValue() leia byName, que para una especie que Champions no conoce es
     undefined - sin precio no hay banda en la que buscar, asi que meter uno en
     una caja GTS no daba NINGUNA recomendacion (2026-09-18). */
  w.closeSheet();
  w.gtsPickWanted(function(){}, "Bulbasaur", false);
  const wanted = d.getElementById("sheetBody");
  ok("dice cuanto vale", /is worth about 318/.test(wanted.textContent), true);
  ok("y propone algo que pedir",
     wanted.querySelectorAll(".list .row").length > 0, true);


  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
}, 1500);
