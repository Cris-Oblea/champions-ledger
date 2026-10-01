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
const { describe } = require("node:test");
const { check, open, idle, row, click } = require("./harness.js");

const R = (id, name, location, origin, status) =>
  row(id, name, {location, origin, status});
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

const { dom, errs } = open({ box: ROWS });
const w = dom.window, d = w.document;

const nameOf = b => b.querySelector(".rname").firstChild.textContent.trim();

(async () => {
  await idle();
  w.gtsPickMine(function(){}, null);
  const sheet = d.getElementById("sheetBody");
  const cards = () => [...sheet.querySelectorAll(".list .row")];
  const tog = t => [...sheet.querySelectorAll(".tog")]
    .find(b => b.textContent.trim() === t);
  const press = t => click(tog(t));
  const offered = cards().map(nameOf);

  describe("lo que se puede depositar", () => {
    check("Sharpedo, que esta en HOME", offered.indexOf("Sharpedo") >= 0, true);
    check("Sableye, HOME origin dentro de la caja",
       offered.indexOf("Sableye") >= 0, true);
    check("y nada mas", offered.length, 5);
  });

  describe("lo que no puede salir del juego", () => {
    check("Garchomp (origen Champions) fuera",
       offered.indexOf("Garchomp") >= 0, false);
    check("Sneasler (rental) fuera", offered.indexOf("Sneasler") >= 0, false);
    check("Mawile (origen sin registrar) fuera",
       offered.indexOf("Mawile") >= 0, false);
  });

  describe("y se dice, no se esconde", () => {
    const notes = [...sheet.querySelectorAll("p.sub")].map(p => p.textContent);
    check("cuenta los que quedan fuera",
       notes.some(t => /4 more in the Champions box/.test(t)), true);
    check("y explica por que",
       notes.some(t => /never leave the game/.test(t)), true);
  });

  /* Era una fila pelada con un BST y una Speed, que no alcanza para decidir
     que regalas (2026-09-18: "solo muestra bst y speed, pero falta todo lo
     demas"). Ahora es la misma card que el resto de la app. */
  describe("la misma card que en todas partes", () => {
    check("cada fila es una card",
       cards().every(b => / card\b/.test(b.className)), true);
    check("con sus seis stats",
       cards().every(b => !!b.querySelector(".statline")), true);
    check("y con su BST", cards().every(b => /BST/.test(b.textContent)), true);
    /* el que Champions no tiene TAMBIEN, que es justo el que sirve de moneda */
    const bulba = cards().find(b => nameOf(b) === "Bulbasaur");
    check("hasta el que no esta en Champions trae numeros",
       !!bulba && /318/.test(bulba.textContent), true);
  });

  describe("los dos filtros que esta pantalla existe para responder", () => {
    check("hay orden por numero de dex", !!tog("Dex no."), true);
    press("Duplicates only");
    /* UN RENTAL NO HACE DUPLICADO. Los dos Sharpedo si lo son; el Metagross de
       HOME esta solo, porque el rental de la caja nunca podra salir del juego y
       por tanto nunca podra ser la copia que se queda. */
    check("duplicados: solo los dos Sharpedo",
       cards().map(nameOf).join(","), "Sharpedo,Sharpedo");
    check("Metagross no cuenta como duplicado",
       cards().map(nameOf).indexOf("Metagross") >= 0, false);
    press("Duplicates only");
    press("Not in Champions only");
    check("fuera del dex: solo Bulbasaur", cards().map(nameOf).join(","), "Bulbasaur");
    press("Not in Champions only");
    check("y al soltarlos vuelven los cinco", cards().length, 5);
    /* Y LA RED DE SEGURIDAD LEIA EL MISMO NUMERO EQUIVOCADO. El aviso de
       "ultima copia" es lo que atrapa el error que el filtro dejaba pasar, y
       con el rental contado como copia no salia. */
    const badgesOf = n => {
      const c = cards().find(b => nameOf(b) === n);
      return c ? [...c.querySelectorAll(".rname .tag")].map(t => t.textContent) : [];
    };
    check("el Metagross de HOME avisa de que es la ultima copia",
       badgesOf("Metagross").some(t => /your only one/i.test(t)), true);
    check("y un Sharpedo no", badgesOf("Sharpedo").some(t => /your only one/i.test(t)),
       false);
  });

  describe("el que no esta en Champions tiene precio, y por tanto consejo", () => {
    /* chipValue() leia byName, que para una especie que Champions no conoce es
       undefined - sin precio no hay banda en la que buscar, asi que meter uno en
       una caja GTS no daba NINGUNA recomendacion (2026-09-18). */
    w.closeSheet();
    w.gtsPickWanted(function(){}, "Bulbasaur", false);
    const wanted = d.getElementById("sheetBody");
    check("dice cuanto vale", /is worth about 318/.test(wanted.textContent), true);
    check("y propone algo que pedir",
       wanted.querySelectorAll(".list .row").length > 0, true);
  });


  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
