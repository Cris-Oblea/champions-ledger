/* Every form in the dex, attacking and defending, through the page's engine.
   A sample would have missed the naming bug the player hit. */
const { check, open } = require("./harness.js");
const { w, errs } = open();

const blank = () => ({sp:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},
                      boost:{atk:0,def:0,spa:0,spd:0,spe:0},
                      nature:null, ability:null, item:null, status:null,
                      curHP:null, buildId:null});

/* The engine's error for one pairing, or null when it calculates. */
function failure(atkName, defName) {
  Object.assign(w.CALC, {
    atk: Object.assign(blank(), {name: atkName}),
    def: Object.assign(blank(), {name: defName}),
    move: w.MOVE_BY.Earthquake, gameType: "Singles",
    weather:null, terrain:null, screen:null, crit:false,
    helpingHand:false, friendGuard:false, charge:false, fairyAura:false,
    gravity:false, wonderRoom:false, magicRoom:false, protected:false,
    stealthRock:false, spikes:0, leechSeed:false, saltCure:false,
    nightmare:false, switching:false, tailwindAtk:false, powerTrickAtk:false
  });
  try { w.engineCalc(); return null; }
  catch (e) { return atkName + " vs " + defName + ": " + e.message.slice(0, 70); }
}

/* Earthquake, because everything can be handed it: as the attacker against
   Kingambit, and as the target of Garchomp's. */
const attacking = w.DEX.map(p => failure(p.name, "Kingambit")).filter(Boolean);
const defending = w.DEX.map(p => failure("Garchomp", p.name)).filter(Boolean);
check("hay formas que probar", w.DEX.length > 300, true);
check("toda forma calcula atacando", attacking.slice(0, 5).join(" | ") || "todas", "todas");
check("y defendiendo", defending.slice(0, 5).join(" | ") || "todas", "todas");
check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
