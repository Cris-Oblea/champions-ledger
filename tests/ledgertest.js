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
