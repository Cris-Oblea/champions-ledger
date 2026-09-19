/* The app, booted on a ledger that HAS rows, with every tab drawn.
 *
 * The other tests stub Supabase empty, so the login gate stays up and every
 * branch that draws something only when there is something to draw never runs.
 * That is how three missing imports reached the live page on 2026-09-14:
 * `note is not defined`, thrown by the GTS panel and the duplicate report the
 * moment real data arrived, with all sixteen tests green.
 *
 * So this one signs in, loads tests/fixture.js, walks every tab, and asserts
 * that the page produced no error of any kind. Then it asserts that the awkward
 * branches ACTUALLY RAN - a fixture that has quietly stopped covering the thing
 * it was written for is worse than no fixture, because it still passes.
 */
const ROOT = require("path").join(__dirname, "..") + "/";
const { boot } = require("./fixture.js");

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(54) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const { window: w, errors, tick } = boot(ROOT);

/* Every tab in the bar, plus the two editor views the tabs open into. Drawing
   is what runs the code; a tab nobody visits is a tab nobody tests. */
const TABS = ["box", "home", "builds", "calc", "find", "gear", "trainer"];

(async function () {
  await tick(700);

  console.log("\n  el ledger carga");
  const d = w.document;
  ok("la puerta de acceso se cerro (hay sesion)", d.getElementById("gate").hidden, true);
  /* the box is drawn in three lists by origin, which is the app's own answer
     to "what can leave the game" - so the count is across all three */
  const boxRows = ["listHomeOrigin", "listChampOrigin", "listRent"]
    .reduce((n, id) => n + (d.getElementById(id) || { children: [] }).children.length, 0);
  ok("las tres listas del box tienen filas", boxRows, 5);
  ok("y HOME tambien", d.getElementById("listHome").children.length > 0, true);
  ok("sin errores al cargar", errors.length ? errors[0] : "ninguno", "ninguno");

  console.log("\n  cada pestana se dibuja");
  for (const t of TABS) {
    const before = errors.length;
    w.go(t);
    await tick(150);
    const view = d.getElementById("v-" + t);
    ok(t + ": visible y sin errores",
       (view && !view.hidden ? "" : "no se mostro ") +
       (errors.length === before ? "" : errors[errors.length - 1]) || "ok", "ok");
  }

  /* ---- the branches this fixture exists for -------------------------------
     Each of these only runs because the ledger is awkward. If one stops
     drawing, the fixture has stopped protecting the code that threw. */
  console.log("\n  las ramas que solo existen con datos");
  w.go("box");
  await tick(200);

  const gts = d.getElementById("listGts");
  ok("el panel GTS se dibujo", !!gts && gts.children.length > 0, true);
  ok("con las tres ofertas abiertas, y la cerrada fuera",
     d.getElementById("nGts").textContent, "3/3");
  ok("el cierre esta en el historial",
     d.getElementById("nGtsHist").textContent, "1");
  ok("y avisa que los 3 slots estan ocupados",
     /All 3 GTS slots are in use/.test(gts.innerHTML), true);
  ok("el boton de anadir queda deshabilitado",
     d.getElementById("gtsAdd").disabled, true);

  const dupe = d.getElementById("dupeBlock");
  ok("el informe de duplicados se dibujo", !!dupe && !dupe.hidden, true);
  const dnote = d.getElementById("dupeNote");
  ok("con las tres notas de origen (HOME, rental, Champions)",
     dnote ? dnote.children.length : 0, 3);
  ok("y nombra el build que moriria con el Pokemon",
     /Kingambit/.test(dnote ? dnote.innerHTML : ""), true);

  /* stones and items are rows now (migration 6), and the Items tab is where
     that is visible - a stone owned for a species that is not in the box is
     the "dead weight until it arrives" line. */
  console.log("\n  lo que se posee, fila por fila");
  w.go("gear");
  await tick(200);
  ok("las piedras se cuentan desde su tabla",
     /3 of \d+/.test(d.getElementById("stoneNote").textContent), true);
  ok("y avisa de la que no tiene especie en la caja",
     /dead weight until it arrives/.test(d.getElementById("stoneNote").textContent),
     true);
  ok("los items marcados vienen de la suya",
     w.S && Object.keys(w.S.items).length, 4);
  w.go("box");
  await tick(150);

  /* the four build states: active, parked, orphan, unbound */
  console.log("\n  los cuatro estados de un build");
  const link = id => w.buildLink(id).state;
  ok("kingambit -> active", link("kingambit"), "active");
  ok("iron-hands -> unbound (una idea, no un fallo)", link("iron-hands"), "unbound");
  ok("camerupt -> orphan (la fila ya no existe)", link("camerupt"), "orphan");

  /* a sheet is where most of the app's drawing actually happens */
  console.log("\n  las hojas se abren sobre datos reales");
  let before = errors.length;
  w.pokeSheet({ _id: "kingambit", name: "Kingambit", location: "champions",
                status: "permanent", origin: "champions" });
  await tick(150);
  ok("la hoja de un Pokemon", errors.length === before ? "ok" : errors[errors.length - 1], "ok");
  w.closeSheet();

  /* THE ONE CHAMPIONS HAS NEVER HEARD OF. Its card already carried the types,
     the BST, the stats and the abilities - and the sheet read them off the
     Champions row instead, which for this Pokemon does not exist, so it threw
     before drawing anything. The tag is what says it cannot come into the
     game; the facts are what a keep-or-send decision is made on, so both have
     to be there. */
  before = errors.length;
  w.pokeSheet({ _id: "bulbasaur-home", name: "Bulbasaur", location: "home",
                status: "permanent", origin: "home" });
  await tick(150);
  ok("la hoja de uno que no esta en Champions",
     errors.length === before ? "ok" : errors[errors.length - 1], "ok");
  const osheet = d.getElementById("sheetBody").textContent.replace(/\s+/g, " ");
  ok("...dice que no esta en el dex", /Not in the Champions dex/.test(osheet), true);
  ok("...y aun asi lista sus tipos", /Grass/.test(osheet) && /Poison/.test(osheet), true);
  ok("...su BST", /318/.test(osheet), true);
  ok("...su habilidad", /Chlorophyll/.test(osheet), true);
  ok("...y lo que le hace dano, que es del tipo y no del juego",
     /Takes damage/.test(osheet) && /Fire/.test(osheet), true);
  w.closeSheet();

  /* LAS TRES PUERTAS DAN LA MISMA FICHA. Find tenia las habilidades, los sets
     de Worlds y el movepool entero; la caja tenia la linea Mega, el "takes
     damage" y lo que escribio Smogon. Ninguna tenia la mitad de la otra, asi
     que la puerta por la que entrabas decidia que te dejaban saber del mismo
     Pokemon. Lo unico que puede diferenciarlas es lo que se POSEE: origen,
     shiny, entrenado y la nota. */
  console.log("\n  la misma ficha por las tres puertas");
  const heads = () => [...d.getElementById("sheetBody").querySelectorAll("h2")]
    .map(h => h.textContent.trim());
  const folds = () => [...d.getElementById("sheetBody").querySelectorAll(".fold")]
    .map(b => b.textContent.trim());

  w.findDetail(w.byName["Garchomp"]);
  await tick(150);
  const findHeads = heads(), findFolds = folds();
  w.closeSheet();

  w.pokeSheet({ _id: "garchomp", name: "Garchomp", location: "champions",
                status: "permanent", origin: "home" });
  await tick(150);
  const boxHeads = heads();
  w.closeSheet();

  w.pokeSheet({ _id: "garchomp-home", name: "Garchomp", location: "home",
                status: "permanent", origin: "home" });
  await tick(150);
  const homeHeads = heads(), homeFolds = folds();
  w.closeSheet();

  const REF = ["Mega line", "Takes damage", "Abilities", "Movepool"];
  REF.forEach(h => {
    ok("Find trae " + h, findHeads.indexOf(h) >= 0, true);
    ok("...la caja Champions tambien", boxHeads.indexOf(h) >= 0, true);
    ok("...y HOME tambien", homeHeads.indexOf(h) >= 0, true);
  });
  /* y la caja NO puede anadir nada que no sea propiedad: origen, esta copia
     (shiny / entrenado) y la nota. Cualquier otra cosa que aparezca aqui es
     una ficha volviendo a separarse en dos. */
  ok("la caja solo anade lo que se POSEE",
     boxHeads.filter(h => findHeads.indexOf(h) < 0).join(", "),
     "Where did it come from?, This copy, Note");
  ok("y HOME solo anade esta copia y la nota",
     homeHeads.filter(h => findHeads.indexOf(h) < 0).join(", "),
     "This copy, Note");
  ok("lo que Smogon escribio esta en las tres",
     findFolds.concat(homeFolds).filter(t => /What Smogon says/.test(t)).length, 2);
  /* lo unico que puede cambiar entre puertas */
  ok("solo la caja pregunta por el origen",
     boxHeads.indexOf("Where did it come from?") >= 0 &&
     findHeads.indexOf("Where did it come from?") < 0, true);
  ok("y solo la caja guarda una nota",
     homeHeads.indexOf("Note") >= 0 && findHeads.indexOf("Note") < 0, true);


  /* ----------------------------------------- el selector de especie -------- */
  /* Era un <select> con las 264 formas en una sola tirada alfabetica y ninguna
     forma de buscar dentro:

       "necesito buscar rapidamente entre los pokemones disponibles del juego,
        y no buscar manualmente en una lista" (2026-09-18)

     Ahora es un campo que se toca, con la misma hoja de busqueda que usan el
     GTS y la calculadora. */
  console.log("\n  el selector de especie se busca, no se recorre");
  w.buildSheet(null, {});
  await tick(150);
  const field = [...d.querySelectorAll("#v-buildedit .field")]
    .find(f => /^Pokemon$/.test((f.querySelector("label") || {}).textContent || ""));
  ok("ya no hay un desplegable de 264 opciones",
     !!field && !field.querySelector("select"), true);
  ok("sino una card que se toca", !!field.querySelector("button.row"), true);
  field.querySelector("button.row")
    .dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
  await tick(150);

  const sheet = d.getElementById("sheetBody");
  const inp = sheet.querySelector(".search input");
  ok("la hoja trae un buscador", !!inp, true);
  const names = () => [...sheet.querySelectorAll(".list .row")]
    .map(b => b.querySelector(".rname").firstChild.textContent.trim());
  /* Venusaur, no Bulbasaur: el dex de Champions empieza ahi - por eso
     Bulbasaur sirve de fixture para "no esta en Champions" */
  ok("y arranca en orden de dex", names()[0], "Venusaur");
  ok("con la card completa, seis stats incluidas",
     !!sheet.querySelector(".list .row .statline"), true);

  const type = t => { inp.value = t; inp.dispatchEvent(new w.Event("input")); };
  type("garchomp");
  ok("busca por nombre", names().join(","), "Garchomp");
  type("zzzz");
  ok("lo que no existe no devuelve nada", names().length, 0);
  type("445");
  ok("busca por numero de dex", names().indexOf("Garchomp") >= 0, true);
  type("dragon");
  ok("y por tipo", names().length > 5 && names().indexOf("Garchomp") >= 0, true);
  type("");
  ok("al vaciarlo vuelven todas", names().length > 100, true);

  /* la caja es un FILTRO, nunca un limite: una build para algo que todavia no
     tiene es una idea que vale la pena guardar (2026-09-13) */
  const mine = [...sheet.querySelectorAll(".tog")]
    .find(b => /In your boxes/.test(b.textContent));
  mine.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
  ok("y el filtro de la caja deja solo lo que tiene",
     names().sort().join(","), "Charizard,Farigiraf,Garchomp,Kingambit,Sneasler,Whimsicott");
  mine.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));

  type("sneasler");
  [...sheet.querySelectorAll(".list .row")][0]
    .dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
  await tick(150);
  ok("al elegir uno queda puesto en la build",
     /Sneasler/.test(d.getElementById("v-buildedit").textContent), true);
  w.leaveEditor();
  await tick(100);


  /* ------------------------------------- Worlds: todos tienen ficha ------- */
  /* 53 de los nombres de las cuatro finales no estan en el dex de Champions -
     el campo de 2025 iba lleno de Calyrex y Koraidon - y cada uno se dibujaba
     como un nombre pelado: sin tipos, sin stats, sin BST y sin ficha detras.

       "en Find, en el apartado Worlds, floette no tiene ficha, si deberia
        tenerla... igualmente en los otros anos habian otros pokemones
        disponibles y existe el mismo problema" (2026-09-18)

     Floette era ademas otro caso: SI esta en Champions, pero como
     Floette-Eternal, que es la unica que el juego tiene. */
  console.log("\n  toda fila de Worlds tiene una ficha detras");
  const dexNames = new Set(w.DEX.map(p => p.name));
  const home = w.CHAMP.HOME_DEX || {};
  const alias = w.CHAMP.LEARN_ALIAS || {};
  let rows = 0;
  const orphan = [];
  (w.CHAMP.WORLDS || []).forEach(y => {
    Object.keys(y.d || {}).forEach(div => {
      (y.d[div].top || []).forEach(r => {
        rows++;
        const n = r[0], a = alias[n];
        if (dexNames.has(n) || home[n] || (a && (dexNames.has(a) || home[a])))
          return;
        orphan.push(y.y + "/" + div + " " + n);
      });
    });
  });
  ok("hay filas que comprobar", rows > 400, true);
  ok("ninguna se queda sin fila", orphan.slice(0, 3).join(", "), "");
  /* y el resolvedor de la app las encuentra, que es lo que dibuja la card */
  ok("Floette resuelve a la unica que el juego tiene",
     (w.anyRow("Floette") || {}).name, "Floette-Eternal");
  ["Calyrex", "Koraidon", "Landorus", "Ogerpon", "Urshifu", "Tatsugiri"]
    .forEach(n => {
      const r = w.anyRow(n);
      ok(n + " trae tipos y stats",
         !!(r && r.types.length && r.b.length === 6), true);
    });

  /* ------------------------------ y lo que sabe el que no esta en el juego */
  /* 425 KB, mas que el motor, para una lista que se lee al abrir una de estas
     fichas y nunca en otro momento - asi que es su propio asset y se pide solo
     entonces. Aqui se simula ya cargado: lo que se comprueba es que la seccion
     se dibuje y diga de donde salen los movimientos. */
  console.log("\n  el que no esta en Champions tambien lista sus movimientos");
  /* La dex entera va en su propio asset y se pide solo al abrir una de estas
     fichas, asi que aqui se simula ya cargada. Lleva las tres cosas que le
     faltaban a la app: el movepool, las FILAS de los moves que la app no
     manda al telefono, y el texto de las abilities que Champions no tiene. */
  w.CHAMP_OUTSIDE = {
    m: {Bulbasaur: ["Tackle", "Growl", "Vine Whip", "Sleep Powder",
                    "Giga Drain", "Mega Drain"]},
    mv: {"Mega Drain": ["Grass", "S", 40, 100, 15]},
    ab: {Chlorophyll: "Doubles Speed in harsh sunlight."}};
  w.findDetail(w.anyRow("Bulbasaur"));
  await tick(200);
  const sheet2 = d.getElementById("sheetBody").textContent.replace(/\s+/g, " ");
  ok("hay seccion de movepool", /Movepool/.test(sheet2), true);
  ok("...y dice de donde sale la lista",
     /Which moves it learns is main-series/.test(sheet2), true);
  ok("...y los movimientos estan ahi",
     /Giga Drain/.test(sheet2) && /Sleep Powder/.test(sheet2), true);
  /* NADA SE TIRA YA. Antes se descartaban los moves que la app no manda -
     Flutter Mane perdia seis, uno de ellos Tera Blast - con el argumento de
     que un nombre sin BP es una palabra y no informacion. El argumento era
     bueno y la conclusion no: moves.json YA los tiene, con su fila completa
     de Champions; solo no se envian al telefono, para que ningun picker deje
     construir con ellos. Aqui se muestran, marcados. */
  ok("...incluido el que Champions no habilita", /Mega Drain/.test(sheet2), true);
  ok("...y va marcado como tal", /not in Champions/.test(sheet2), true);
  ok("...y lo dice en la cabecera",
     /1 of them are moves Champions has in its database/.test(sheet2), true);
  w.closeSheet();

  /* ------------------------------------- el boton atras del telefono ----- */
  /* En Android, Atras minimizaba la app: la pagina carga una vez y todo lo
     demas es una <section> que se muestra o se esconde, asi que la unica
     entrada del historial ERA la pagina (2026-09-19). Ahora cada capa que se
     abre gasta una entrada y Atras las deshace de arriba abajo. */
  console.log("\n  atras deshace capas, no cierra la app");
  w.go("find"); w.go("calc");
  w.findDetail(w.byName["Garchomp"]);
  await tick(150);
  ok("con la hoja abierta", !d.getElementById("scrim").hidden, true);
  /* jsdom implementa history.back() pero NO despacha popstate por el, asi que
     aqui se lanza el evento igual que lo lanza el navegador. La integracion de
     verdad - pulsar Atras y que se cierre la hoja - se comprobo en Edge sobre
     la pagina servida, que es donde el boton existe. */
  const back = async () => {
    w.dispatchEvent(new w.PopStateEvent("popstate", {state: null}));
    await tick(120);
  };
  await back();
  ok("el primer atras cierra la hoja", d.getElementById("scrim").hidden, true);
  ok("...y no se mueve de pestana", w.S.tab, "calc");
  await back();
  ok("el segundo atras vuelve a la pestana anterior", w.S.tab, "find");
  /* y sigue retrocediendo por donde se paso, no a una pestana fija: este test
     ya ha recorrido todas antes de llegar aqui */
  const before3 = w.S.tab;
  await back();
  ok("el tercero sigue retrocediendo", w.S.tab !== before3, true);
  ok("...y nunca sale de la app", !!d.getElementById("v-" + w.S.tab), true);

  before = errors.length;
  w.buildSheet("charizard");
  await tick(150);
  ok("la hoja de un build con Mega",
     errors.length === before ? "ok" : errors[errors.length - 1], "ok");
  w.closeSheet();

  before = errors.length;
  w.teamSheet("rain-ish", null);
  await tick(150);
  ok("la hoja de un equipo de seis slots",
     errors.length === before ? "ok" : errors[errors.length - 1], "ok");
  w.closeSheet();

  before = errors.length;
  w.gtsPickMine(function () {});
  await tick(150);
  ok("el selector del GTS", errors.length === before ? "ok" : errors[errors.length - 1], "ok");
  w.closeSheet();

  console.log("\n  ERRORES JS: " + (errors.length ? errors.join(" | ") : "ninguno"));
  ok("cero errores en toda la sesion", errors.length, 0);

  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad ? 1 : 0);
})();
