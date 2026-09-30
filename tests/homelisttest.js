/* The HOME box shows twelve rows, then the rest on request, and back.

   A HOME box grows past a screen quickly, so the list opens on twelve and a
   button offers the others. Nothing else covered that button - the shared
   fixture holds five HOME rows, so it never appears there - and it is the one
   control whose redraw moved when the box drawing left boot.js. */
const ROOT = require("path").join(__dirname, "..") + "/";
const UID = "u1";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(52) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const NAMES = ["Pikachu", "Charizard", "Venusaur", "Blastoise", "Gengar",
  "Dragonite", "Tyranitar", "Garchomp", "Lucario", "Gardevoir", "Snorlax",
  "Gyarados", "Alakazam", "Machamp", "Arcanine"];
const ROWS = NAMES.map((n, i) => ({user_id:UID, id:n.toLowerCase(), name:n,
  location:"home", status:"permanent", origin:"home", note:"", ord:i,
  updated_at:"2026-09-29", shiny:false, trained:false}));

const { dom, errs } = require("./harness.js").open(ROOT, { box: ROWS });
const w = dom.window, d = w.document;
const shown = () => d.querySelectorAll("#listHome > *").length;
const more = () => d.querySelector("#homeMore button");

setTimeout(() => {
  ok("HOME opens on twelve", shown(), 12);
  ok("and offers the rest", more()?.textContent, "Show the other 3");
  more().click();
  ok("the button shows all fifteen", shown(), 15);
  ok("and offers to fold them again", more()?.textContent, "Show fewer");
  more().click();
  ok("folding goes back to twelve", shown(), 12);
  ok("no script errors", errs.length, 0);
  console.log(bad ? "\n" + bad + " FAIL" : "\n  todo bien");
  process.exit(bad ? 1 : 0);
}, 600);
