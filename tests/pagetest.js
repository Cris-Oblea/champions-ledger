/* The PAGE (with the engine bundled in) against the engine run under Node.
   They should be identical, because they are the same code. */
const fs = require("fs");
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";
const { JSDOM, VirtualConsole } = require("jsdom");
const CASES = JSON.parse(fs.readFileSync(__dirname + "/enginecases.json", "utf8"));

const body = fs.readFileSync(
  ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script id="vendor-supabase">[\s\S]*?<\/script>/, "");
const stub = `<script>window.supabase={createClient:function(){return{
  auth:{getSession:function(){return Promise.resolve({data:{session:null}});},
        onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
  from:function(){return{select:function(){return Promise.resolve({data:[],error:null});}};},
  channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};<\/script>`;
const html = body.replace("<head>", "<head>" + stub);

const errs = [];
const vc = new VirtualConsole()
  .on("jsdomError", e => { if (!/scrollTo/.test(e.message)) errs.push(e.message); });
const w = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
                            virtualConsole: vc }).window;

setTimeout(() => {
  console.log("  motor cargado en la pagina:", !!(w.SMOGON && w.SMOGON.calculate));
  let bad = 0;
  console.log("  %s %s %s", "caso".padEnd(26), "pagina".padEnd(14), "Node");
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
    const ok = got === c.want;
    if (!ok) bad++;
    console.log("  %s %s %s  %s", c.label.padEnd(26), got.padEnd(14), c.want,
      ok ? "OK" : "<-- DIFIERE");
  });
  console.log("\n  ERRORES:", errs.length ? errs.slice(0,3) : "ninguno");
  console.log("  CASOS QUE DIFIEREN:", bad, "de", CASES.length);
}, 1500);
