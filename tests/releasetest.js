/* Only what the game can actually release is ever offered for release.

   Two in-game rules (player, 2026-09-27):
     - a HOME-origin Pokemon is never released from the Champions box. Park is
       its exit, and a second copy of it is a real Pokemon with value, not a
       duplicate to get rid of;
     - the game refuses a release that would leave fewer than six to battle
       with, so the last six Champions-origin Pokemon hold their slots.

   The case that surfaced it: Sinistcha, one of exactly six Champions-origin
   Pokemon, with a second copy in HOME. The "Already in HOME" panel told him to
   release it, and the game would not. Same for a HOME-origin Garchomp sent in
   while another Garchomp stayed in HOME. */
const ROOT = require("path").join(__dirname, "..") + "/";
const UID = "u1";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(52) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const row = (id, name, location, origin) => ({user_id:UID, id, name, location,
  status:"permanent", origin, note:"", ord:0, updated_at:"2026-09-27",
  shiny:false, trained:false});
const ROWS = [
  /* exactly six Champions origin: the floor */
  ...["Sinistcha", "Maushold", "Sceptile", "Incineroar", "Kingambit",
      "Gholdengo"].map(n => row(n.toLowerCase(), n, "champions", "champions")),
  row("garchomp", "Garchomp", "champions", "home"),   // sent in from HOME
  row("garchomp-h", "Garchomp", "home", "home"),      // ...and a copy left there
  row("sinistcha-h", "Sinistcha", "home", "home"),
];

const { dom, errs } = require("./harness.js").open(ROOT, { box: ROWS });
const w = dom.window, d = w.document;
const click = n => n.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
const boxRow = name => [...d.querySelectorAll(
    "#listChampOrigin .row, #listHomeOrigin .row")]
  .find(r => ((r.querySelector(".rname") || r).textContent.trim()
              .indexOf(name) === 0));
const buttons = () => [...d.querySelectorAll(".sheet button")]
  .map(b => b.textContent);

setTimeout(() => {
  w.go("box");
  console.log("\n  el panel 'Already in HOME'");
  ok("no aparece: nada de lo duplicado se puede liberar",
     d.getElementById("dupeBlock").hidden, true);
  ok("y la caja no lo llama material de intercambio",
     /trade material|can be released/.test(d.getElementById("boxWarn")
       .textContent), false);

  console.log("\n  la ficha");
  click(boxRow("Sinistcha"));
  setTimeout(() => {
    ok("Sinistcha (Champions origin, en el suelo de 6): sin Release",
       buttons().indexOf("Release"), -1);
    ok("...y dice que el hueco es para siempre",
       /This slot is permanent/.test(d.querySelector(".sheet").textContent), true);
    click(boxRow("Garchomp"));
    setTimeout(() => {
      const b = buttons();
      ok("Garchomp (HOME origin, en la caja): sin Release", b.indexOf("Release"), -1);
      ok("...pero si Park back to HOME", b.indexOf("Park back to HOME") >= 0, true);

      console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
      console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
      process.exit(bad || errs.length ? 1 : 0);
    }, 400);
  }, 400);
}, 1200);
