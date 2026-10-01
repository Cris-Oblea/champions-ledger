/* The HOME box shows twelve rows, then the rest on request, and back.

   A HOME box grows past a screen quickly, so the list opens on twelve and a
   button offers the others. Nothing else covered that button - the shared
   fixture holds five HOME rows, so it never appears there - and it is the one
   control whose redraw moved when the box drawing left boot.js. */
const { check, open, idle } = require("./harness.js");
const UID = "u1";

const NAMES = ["Pikachu", "Charizard", "Venusaur", "Blastoise", "Gengar",
  "Dragonite", "Tyranitar", "Garchomp", "Lucario", "Gardevoir", "Snorlax",
  "Gyarados", "Alakazam", "Machamp", "Arcanine"];
const ROWS = NAMES.map((n, i) => ({user_id:UID, id:n.toLowerCase(), name:n,
  location:"home", status:"permanent", origin:"home", note:"", ord:i,
  updated_at:"2026-09-29", shiny:false, trained:false}));

const { dom, errs } = open({ box: ROWS });
const w = dom.window, d = w.document;
const shown = () => d.querySelectorAll("#listHome > *").length;
const more = () => d.querySelector("#homeMore button");

(async () => {
  await idle();
  check("HOME opens on twelve", shown(), 12);
  check("and offers the rest", more()?.textContent, "Show the other 3");
  more().click();
  check("the button shows all fifteen", shown(), 15);
  check("and offers to fold them again", more()?.textContent, "Show fewer");
  more().click();
  check("folding goes back to twelve", shown(), 12);
  check("no script errors", errs.length, 0);
})();
