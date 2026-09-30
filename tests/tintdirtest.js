/* The card tints must never be an EXACTLY vertical gradient.

   Firefox's renderer (WebRender, so Waterfox too) cuts an axis-aligned
   gradient into one piece per colour stop and paints each separately; where
   two pieces meet on a fractional pixel that row is painted twice, and a
   14%-alpha tint painted twice is a visible bright line across the card.
   It showed on every card whose Pokemon retypes - Aggron, Gyarados, Ampharos,
   Altaria, Feraligatr - coming and going with the Mega cross-fade, and never in
   Edge, which is why it survived a first look (player, 2026-09-27).

   Measured in his Waterfox, seven frames over one 9s cycle per species:
   exactly vertical, the line on 5 of 6 species; at 179.9deg, on none, with
   every other pixel of the tint unchanged. Moving the stop or dropping to two
   stops did not help, so the angle is the fix and this pins it.

   What it checks, in the stylesheet as written:
     - every gradient painting a tint (--tsoft*, --msoft*) takes its direction
       from var(--tint-dir), not a literal;
     - --tint-dir is defined, and is not an axis-aligned direction. */
const path = require("path");
const css = require("./harness.js").styles(path.join(__dirname, ".."));

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(56) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

/* every linear-gradient( ... ) whose first colour is a tint variable */
const grads = [...css.matchAll(/linear-gradient\(([^,]+),\s*var\(--[tm]soft/g)];
ok("hay tintes que revisar", grads.length >= 4, true);
const literal = grads.filter(m => m[1].trim() !== "var(--tint-dir)");
ok("todos toman la direccion de --tint-dir",
   literal.map(m => m[1].trim()).join(", ") || "todos", "todos");

const def = css.match(/--tint-dir\s*:\s*([^;}\s]+)/);
ok("--tint-dir esta definido", !!def, true);
const dir = def ? def[1].trim().toLowerCase() : "";
const AXIS = ["0deg", "90deg", "180deg", "270deg", "360deg",
              "to bottom", "to top", "to left", "to right"];
ok("y no es un eje exacto (" + dir + ")", AXIS.indexOf(dir) < 0, true);
/* and close enough to vertical that the drift stays invisible: under a
   quarter of a degree either side of 180 */
const deg = parseFloat(dir);
ok("y sigue siendo casi vertical", Math.abs(deg - 180) > 0 &&
   Math.abs(deg - 180) < 0.25, true);

console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
process.exit(bad ? 1 : 0);
