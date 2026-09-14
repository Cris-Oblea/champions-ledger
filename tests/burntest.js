const fs = require("fs");
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";
const { JSDOM, VirtualConsole } = require("jsdom");
const body = fs.readFileSync(
  ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script id="vendor-supabase">[\s\S]*?<\/script>/, "");
const stub = `<script>window.supabase={createClient:function(){return{
  auth:{getSession:function(){return Promise.resolve({data:{session:null}});},
        onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
  from:function(){return{select:function(){return Promise.resolve({data:[],error:null});}};},
  channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};<\/script>`;
const errs=[]; const vc=new VirtualConsole().on("jsdomError",e=>{if(!/scrollTo/.test(e.message))errs.push(e.message);});
const w = new JSDOM(body.replace("<head>","<head>"+stub),
  {runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc}).window;
setTimeout(()=>{
  const blank=()=>({sp:{hp:0,atk:32,def:0,spa:32,spd:0,spe:0},
                    boost:{atk:0,def:0,spa:0,spd:0,spe:0},nature:null,
                    ability:null,item:null,status:null,curHP:null,buildId:null});
  function go(status, move){
    Object.assign(w.CALC,{
      atk:Object.assign(blank(),{name:"Garchomp",status:status}),
      def:Object.assign(blank(),{name:"Kingambit"}),
      move:w.MOVE_BY[move], gameType:"Singles",
      weather:null,terrain:null,screen:null,crit:false,
      helpingHand:false,friendGuard:false,charge:false,fairyAura:false,
      gravity:false,wonderRoom:false,magicRoom:false,protected:false,
      stealthRock:false,spikes:0,leechSeed:false,saltCure:false,
      nightmare:false,switching:false,tailwindAtk:false,powerTrickAtk:false});
    try{const r=w.engineCalc();return r.lo+"-"+r.hi;}catch(e){return "ERROR "+e.message;}
  }
  console.log("  fisico  sano   :", go(null,"Earthquake"));
  console.log("  fisico  quemado:", go("brn","Earthquake"));
  console.log("  especial sano  :", go(null,"Fire Blast"));
  console.log("  especial quemado:", go("brn","Fire Blast"), "(no debe cambiar)");
  console.log("  ERRORES:", errs.length?errs.slice(0,2):"ninguno");
},1500);
