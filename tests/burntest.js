/* Burn halves a PHYSICAL hit and leaves a special one alone, through the
   page's own engine - asserted, never printed for a person to compare. */
const { check, open } = require("./harness.js");
const { w, errs } = open();

const blank = () => ({sp:{hp:0,atk:32,def:0,spa:32,spd:0,spe:0},
                      boost:{atk:0,def:0,spa:0,spd:0,spe:0},nature:null,
                      ability:null,item:null,status:null,curHP:null,buildId:null});
/* Garchomp's damage range on Kingambit with the attacker's status set, as "lo-
   hi". */
function range(status, move){
  /* only the two sides and the move: every field switch stays at the
     page's own default, off */
  Object.assign(w.CALC, {
    atk: Object.assign(blank(), {name:"Garchomp", status}),
    def: Object.assign(blank(), {name:"Kingambit"}),
    move: w.MOVE_BY[move], gameType:"Singles"});
  const r = w.engineCalc();
  return r.lo + "-" + r.hi;
}

const [lo, hi] = range(null, "Earthquake").split("-").map(Number);
check("burned, a physical hit does half", range("brn", "Earthquake"),
      Math.floor(lo / 2) + "-" + Math.floor(hi / 2));
check("and a special one is unchanged", range("brn", "Fire Blast"), range(null, "Fire Blast"));
check("the page reports no script error", errs.join(" | ") || "none", "none");
