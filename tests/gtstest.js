/* A GTS trade must be an EXCHANGE: what you gave leaves, what you got arrives. */
const fs = require("fs");
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";
const { JSDOM, VirtualConsole } = require("jsdom");
const UID = "u1";
const ROWS = [
  {user_id:UID,id:"chesnaught",name:"Chesnaught",location:"home",status:"permanent",origin:"home",note:"",ord:0,updated_at:"2026-09-09"},
  {user_id:UID,id:"sableye",name:"Sableye",location:"home",status:"permanent",origin:"home",note:"",ord:1,updated_at:"2026-09-09"}
];
const META = [{user_id:UID,id:"gts",data:{open_offers:[
  {offered:"Chesnaught",requested:"Golisopod",deposited:"2026-09-08",status:"PENDING",note:""}
]},updated_at:"2026-09-09"}];
const body = fs.readFileSync(ROOT + "tracker/dist/index.html","utf8")
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/,"");
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__META=${JSON.stringify(META)};
window.__WRITES=[]; window.__DELETES=[];
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="meta"?window.__META:[]),error:null});},
   upsert:function(row){window.__WRITES.push([t,row]);return Promise.resolve({error:null});},
   delete:function(){return {eq:function(k,v){window.__DELETES.push([t,v]);return Promise.resolve({error:null});}};}
 };},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};
window.confirm=function(){return true;};
<\/script>`;
const errs=[]; const vc=new VirtualConsole().on("jsdomError",e=>{if(!/scrollTo/.test(e.message))errs.push(e.message);});
const dom = new JSDOM(body.replace("<head>","<head>"+stub),
  {runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc});
const w = dom.window, d = w.document;
setTimeout(()=>{
  console.log("  en HOME antes:", Object.keys(w.S.box).join(", "));
  console.log("  ofertas GTS  :", (w.S.meta.gts.open_offers||[]).length);
  w.go("home");
  const row = d.querySelectorAll("#listGts .row")[0];
  row.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
  setTimeout(()=>{
    const btn = [...d.querySelectorAll("#sheetFoot .btn")]
      .find(b=>/Trade went through/.test(b.textContent));
    console.log("  boton encontrado:", !!btn);
    btn.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
    setTimeout(()=>{
      console.log("\n  ESCRITURAS:");
      w.__WRITES.forEach(x=>console.log("    ", x[0], JSON.stringify(x[1]).slice(0,110)));
      console.log("  BORRADOS:");
      w.__DELETES.forEach(x=>console.log("    ", x[0], x[1]));
      const added = w.__WRITES.some(x=>x[0]==="box" && x[1].name==="Golisopod");
      const removed = w.__DELETES.some(x=>x[0]==="box" && x[1]==="chesnaught");
      const offerCleared = w.__WRITES.some(x=>x[0]==="meta" && x[1].id==="gts" &&
        (x[1].data.open_offers||[]).length===0);
      console.log("\n  Golisopod agregado :", added ? "SI" : "NO");
      console.log("  Chesnaught borrado :", removed ? "SI" : "NO  <-- EL BUG");
      console.log("  oferta cerrada     :", offerCleared ? "SI" : "NO");
      console.log("  ERRORES:", errs.length?errs.slice(0,2):"ninguno");
    },400);
  },400);
},1500);
