/* Every form in the dex, attacking and defending, through the page's engine.
   A sample would have missed the naming bug the player hit. */
const fs = require("fs");
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";
const { JSDOM, VirtualConsole } = require("jsdom");
const body = require("./harness.js").page(ROOT);
const stub = `<script>window.supabase={createClient:function(){return{
  auth:{getSession:function(){return Promise.resolve({data:{session:null}});},
        onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
  from:function(){return{select:function(){return Promise.resolve({data:[],error:null});}};},
  channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};<\/script>`;
const errs = [];
const vc = new VirtualConsole()
  .on("jsdomError", e => { if (!/scrollTo/.test(e.message)) errs.push(e.message); });
const w = new JSDOM(body.replace("<head>", "<head>" + stub),
  { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc }).window;

setTimeout(() => {
  const DEX = w.DEX, MOVE_BY = w.MOVE_BY;
  const blank = () => ({sp:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},
                        boost:{atk:0,def:0,spa:0,spd:0,spe:0},
                        nature:null, ability:null, item:null, status:null,
                        curHP:null, buildId:null});
  function tryOne(atkName, defName, moveName) {
    Object.assign(w.CALC, {
      atk: Object.assign(blank(), {name: atkName}),
      def: Object.assign(blank(), {name: defName}),
      move: MOVE_BY[moveName], gameType: "Singles",
      weather:null, terrain:null, screen:null, crit:false,
      helpingHand:false, friendGuard:false, charge:false, fairyAura:false,
      gravity:false, wonderRoom:false, magicRoom:false, protected:false,
      stealthRock:false, spikes:0, leechSeed:false, saltCure:false,
      nightmare:false, switching:false, tailwindAtk:false, powerTrickAtk:false
    });
    try { const r = w.engineCalc(); return {ok:true, v:r.lo + "-" + r.hi}; }
    catch (e) { return {ok:false, v:e.message}; }
  }
  const failAtk = [], failDef = [];
  DEX.forEach(p => {
    // as the attacker, with a move everything can be given
    let r = tryOne(p.name, "Kingambit", "Earthquake");
    if (!r.ok) failAtk.push([p.name, r.v]);
    // and as the target
    r = tryOne("Garchomp", p.name, "Earthquake");
    if (!r.ok) failDef.push([p.name, r.v]);
  });
  console.log("  formas probadas:", DEX.length, "atacando y defendiendo");
  console.log("  fallan atacando :", failAtk.length);
  failAtk.slice(0, 12).forEach(f => console.log("     ", f[0], "->", f[1].slice(0, 70)));
  console.log("  fallan de objetivo:", failDef.length);
  failDef.slice(0, 12).forEach(f => console.log("     ", f[0], "->", f[1].slice(0, 70)));
  console.log("  ERRORES:", errs.length ? errs.slice(0, 2) : "ninguno");
}, 2000);
