/* Burn halves a PHYSICAL hit and leaves a special one alone, through the
   page's own engine. This printed four numbers and "(no debe cambiar)" for
   a person to compare, and passed whatever they said. */
const { check, open } = require("./harness.js");
const { w, errs } = open();

const blank = () => ({sp:{hp:0,atk:32,def:0,spa:32,spd:0,spe:0},
                      boost:{atk:0,def:0,spa:0,spd:0,spe:0},nature:null,
                      ability:null,item:null,status:null,curHP:null,buildId:null});
function range(status, move){
  Object.assign(w.CALC, {
    atk: Object.assign(blank(), {name:"Garchomp", status}),
    def: Object.assign(blank(), {name:"Kingambit"}),
    move: w.MOVE_BY[move], gameType:"Singles",
    weather:null,terrain:null,screen:null,crit:false,
    helpingHand:false,friendGuard:false,charge:false,fairyAura:false,
    gravity:false,wonderRoom:false,magicRoom:false,protected:false,
    stealthRock:false,spikes:0,leechSeed:false,saltCure:false,
    nightmare:false,switching:false,tailwindAtk:false,powerTrickAtk:false});
  const r = w.engineCalc();
  return r.lo + "-" + r.hi;
}

const [lo, hi] = range(null, "Earthquake").split("-").map(Number);
check("quemado, un golpe fisico hace la mitad", range("brn", "Earthquake"),
      Math.floor(lo / 2) + "-" + Math.floor(hi / 2));
check("y uno especial no cambia", range("brn", "Fire Blast"), range(null, "Fire Blast"));
check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
