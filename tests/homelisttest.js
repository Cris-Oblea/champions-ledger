/* The HOME box shows twelve rows, then the rest on request, and back.

   A HOME box grows past a screen quickly, so the list opens on twelve and a
   button offers the others. Nothing else covered that button - the shared
   fixture holds five HOME rows, so it never appears there - and it is the one
   control whose redraw moved when the box drawing left boot.js. */
const { check, open, idle, row, all, click } = require("./harness.js");

const NAMES = ["Pikachu", "Charizard", "Venusaur", "Blastoise", "Gengar",
  "Dragonite", "Tyranitar", "Garchomp", "Lucario", "Gardevoir", "Snorlax",
  "Gyarados", "Alakazam", "Machamp", "Arcanine"];
const ROWS = NAMES.map((n, i) => row(n.toLowerCase(), n,
  {location:"home", origin:"home", ord:i}));

const { dom, errs } = open({ box: ROWS });
const w = dom.window, d = w.document;
const shown = () => all(d, "#listHome > *").length;
const more = () => d.querySelector("#homeMore button");

(async () => {
  await idle();
  check("HOME opens on twelve", shown(), 12);
  check("and offers the rest", more()?.textContent, "Show the other 3");
  click(more());
  check("the button shows all fifteen", shown(), 15);
  check("and offers to fold them again", more()?.textContent, "Show fewer");
  click(more());
  check("folding goes back to twelve", shown(), 12);
  check("no script errors", errs.length, 0);
})();
