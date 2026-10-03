/* Every form in the dex, attacking and defending, through the page's engine.
   A sweep, not a sample: a sample misses a bug that only some forms have
   (a Mega naming bug once hid that way). */
const { check, open } = require("./harness.js");
const { w, errs } = open();

const blank = () => ({sp:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},
                      boost:{atk:0,def:0,spa:0,spd:0,spe:0},
                      nature:null, ability:null, item:null, status:null,
                      curHP:null, buildId:null});

/* The engine's error for one pairing, or null when it calculates. */
function failure(atkName, defName) {
  /* only the two sides and the move: every field switch stays at the
     page's own default, off */
  Object.assign(w.CALC, {
    atk: Object.assign(blank(), {name: atkName}),
    def: Object.assign(blank(), {name: defName}),
    move: w.MOVE_BY.Earthquake, gameType: "Singles"});
  try { w.engineCalc(); return null; }
  catch (e) { return atkName + " vs " + defName + ": " + e.message.slice(0, 70); }
}

/* Earthquake, because everything can be handed it: as the attacker against
   Kingambit, and as the target of Garchomp's. */
const attacking = w.DEX.map(p => failure(p.name, "Kingambit")).filter(Boolean);
const defending = w.DEX.map(p => failure("Garchomp", p.name)).filter(Boolean);
check("there are forms to try", w.DEX.length > 300, true);
check("every form calculates attacking", attacking.slice(0, 5).join(" | ") || "all", "all");
check("and defending", defending.slice(0, 5).join(" | ") || "all", "all");
check("the page reports no script error", errs.join(" | ") || "none", "none");
