/* The card tints must never be an EXACTLY vertical gradient.

   Firefox's renderer (WebRender, so Waterfox too) cuts an axis-aligned
   gradient into one piece per colour stop and paints each separately; where
   two pieces meet on a fractional pixel that row is painted twice, and a
   14%-alpha tint painted twice is a visible bright line across the card.
   It showed on every card whose Pokemon retypes - Aggron, Gyarados, Ampharos,
   Altaria, Feraligatr - coming and going with the Mega cross-fade, and never in
   Edge, which is why it can survive a first look.

   Measured in Waterfox, seven frames over one 9s cycle per species:
   exactly vertical, the line on 5 of 6 species; at 179.9deg, on none, with
   every other pixel of the tint unchanged. Moving the stop or dropping to two
   stops did not help, so the angle is the fix and this pins it.

   What it checks, in the stylesheet as written:
     - every gradient painting a tint (--tsoft*; the Mega layers set the same
       properties on themselves) takes its direction from var(--tint-dir),
       not a literal;
     - --tint-dir is defined, and is not an axis-aligned direction. */
const { check, styles } = require("./harness.js");
const css = styles();

/* every linear-gradient( ... ) whose first colour is a tint variable */
const grads = [...css.matchAll(/linear-gradient\(([^,]+),\s*var\(--tsoft/g)];
/* the two halves of --tint, written once in card.css */
check("there are tints to check", grads.length >= 2, true);
const literal = grads.filter(m => m[1].trim() !== "var(--tint-dir)");
check("all take their direction from --tint-dir",
   literal.map(m => m[1].trim()).join(", ") || "all", "all");

const def = css.match(/--tint-dir\s*:\s*([^;}\s]+)/);
check("--tint-dir is defined", !!def, true);
const dir = def ? def[1].trim().toLowerCase() : "";
const AXIS = ["0deg", "90deg", "180deg", "270deg", "360deg",
              "to bottom", "to top", "to left", "to right"];
check("and is not an exact axis (" + dir + ")", AXIS.indexOf(dir) < 0, true);
/* and close enough to vertical that the drift stays invisible: under a
   quarter of a degree either side of 180 */
const deg = parseFloat(dir);
check("and is still nearly vertical", Math.abs(deg - 180) > 0 &&
   Math.abs(deg - 180) < 0.25, true);
