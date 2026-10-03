/* The PAGE (with the engine bundled in) against the engine run under Node.
   They should be identical, because they are the same code. */
const fs = require("fs");
const { check, open } = require("./harness.js");
const CASES = JSON.parse(fs.readFileSync(__dirname + "/enginecases.json", "utf8"));

const { w, errs } = open();

check("the engine is loaded in the page", !!(w.SMOGON && w.SMOGON.calculate), true);
CASES.forEach(c => {
  // drive the page's own state, exactly as the UI does
  w.CALC.atk = {name:c.atk, buildId:null, sp:{hp:0,atk:32,def:0,spa:32,spd:0,spe:0},
                boost:{atk:0,def:0,spa:0,spd:0,spe:0}, nature:null,
                ability:c.atkAbility||null, item:c.atkItem||null,
                status:c.atkStatus||null, curHP:null};
  w.CALC.def = {name:c.def, buildId:null, sp:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},
                boost:{atk:0,def:0,spa:0,spd:0,spe:0}, nature:null,
                ability:c.defAbility||null, item:c.defItem||null,
                status:null, curHP:null};
  w.CALC.move = w.MOVE_BY[c.move];
  w.CALC.gameType = c.gameType || "Doubles";
  w.CALC.weather = c.weather||null; w.CALC.terrain = c.terrain||null;
  w.CALC.screen = c.screen||null; w.CALC.crit = false;
  w.CALC.helpingHand = !!c.helpingHand; w.CALC.friendGuard = !!c.friendGuard;
  w.CALC.charge = !!c.charge;
  w.CALC.gravity = !!c.gravity; w.CALC.wonderRoom = !!c.wonderRoom;
  w.CALC.magicRoom = !!c.magicRoom; w.CALC.protected = false;
  w.CALC.stealthRock = false; w.CALC.spikes = 0; w.CALC.leechSeed = false;
  w.CALC.saltCure = false; w.CALC.nightmare = false; w.CALC.switching = false;
  w.CALC.tailwindAtk = false; w.CALC.powerTrickAtk = false;
  let got;
  try { const r = w.engineCalc(); got = `${r.lo}-${r.hi}`; }
  catch (e) { got = "ERROR: " + e.message; }
  check(c.label, got, c.want);
});
check("the page reports no script error", errs.join(" | ") || "none", "none");
