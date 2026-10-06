/* Every form in the dex, attacking and defending, through the page's engine.
   A sweep, not a sample: a sample misses a bug that only some forms have
   (a Mega naming bug once hid that way). */
const { check, open, calcSide } = require("./harness.js");
const { w, errs } = open();

/** The engine's error for one pairing, or null when it calculates.
   @param {string} atkName
   @param {string} defName */
function failure(atkName, defName) {
  /* only the two sides and the move: every field switch stays at the
     page's own default, off */
  Object.assign(w.CALC, {
    atk: calcSide(atkName),
    def: calcSide(defName),
    move: w.MOVE_BY.Earthquake, gameType: "Singles"});
  try { w.engineCalc(); return null; }
  catch (e) { return atkName + " vs " + defName + ": " + /** @type {Error} */ (e).message.slice(0, 70); }
}

/* Earthquake, because everything can be handed it: as the attacker against
   Kingambit, and as the target of Garchomp's. */
const attacking = w.DEX.map(p => failure(p.name, "Kingambit")).filter(Boolean);
const defending = w.DEX.map(p => failure("Garchomp", p.name)).filter(Boolean);
check("there are forms to try", w.DEX.length > 300, true);
check("every form calculates attacking", attacking.slice(0, 5).join(" | ") || "all", "all");
check("and defending", defending.slice(0, 5).join(" | ") || "all", "all");
check("the page reports no script error", errs.join(" | ") || "none", "none");
