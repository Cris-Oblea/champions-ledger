/* The SP slider could not be dragged. oninput called redraw(), which rebuilds
   the whole sheet, so the element under the finger was replaced on the first
   step and the drag ended there - a click still worked because a click is one
   discrete event. This test drives a drag as a browser does: several `input`
   events on the SAME node, checking it survives every one of them. It also
   covers the two new ways in, the arrows and the typed box. */
const fs = require("fs");
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";
const { JSDOM, VirtualConsole } = require("jsdom");
const UID = "u1";
const ROWS = [{user_id:UID,id:"primarina",name:"Primarina",location:"champions",
               status:"permanent",origin:"home",note:"",ord:0,
               updated_at:"2026-09-10",shiny:false,trained:false}];
/* `builds` is a flat table, not {id, data} like `meta` - getting that wrong is
   what made the first run of this test read every stat as 0. */
const BUILDS = [{user_id:UID,id:"primarina",pokemon:"Primarina",mega:null,
  ability:"Torrent",mega_ability:null,nature:"Modest",
  stat_points:{hp:4,atk:0,def:0,spa:32,spd:8,spe:22},
  moves:["Hyper Voice"],role:"",rationale:"",extra:{},updated_at:"2026-09-10"}];
const body = fs.readFileSync(ROOT + "tracker/dist/index.html","utf8")
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/,"");
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:[]),error:null});},
   upsert:function(){return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){return Promise.resolve({error:null});}};}
 };},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};
<\/script>`;
const errs=[]; const vc=new VirtualConsole().on("jsdomError",e=>{if(!/scrollTo/.test(e.message))errs.push(e.message);});
const dom = new JSDOM(body.replace("<head>","<head>"+stub),
  {runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc});
const w = dom.window, d = w.document;
const fire = (n,t)=>n.dispatchEvent(new w.Event(t,{bubbles:true}));
const click = n=>n.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(42) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

setTimeout(()=>{
  w.go("builds");
  click(d.querySelectorAll("#listBuilds .row")[0]);
  setTimeout(()=>{
    const rows = [...d.querySelectorAll(".sp.spedit")];
    console.log("  filas SP:", rows.length);
    const spa = rows[3];                       // hp atk def spa spd spe
    const range = spa.querySelector("input[type=range]");
    const num   = spa.querySelector(".spnum");
    const steps = spa.querySelectorAll(".step");
    const dec = steps[0], inc = steps[1];
    const budget = () => d.querySelector(".budget").firstChild.textContent;

    ok("valor inicial de SpA", num.value, "32");
    ok("presupuesto inicial", budget(), "66 of 66 spent");

    /* THE REGRESSION: a drag is many input events on one node. If the node is
       detached after the first, the drag is dead - which is what shipped. */
    let detached = 0;
    for (const v of [30, 28, 26, 24, 22]) {
      range.value = String(v);
      fire(range, "input");
      if (!d.contains(range)) detached++;
    }
    ok("el slider sobrevive al arrastre", detached, 0);
    ok("valor tras arrastrar a 22", num.value, "22");
    ok("presupuesto se actualizo", budget(), "56 of 66 spent");
    ok("el motor de dibujo no reconstruyo", d.querySelectorAll(".sp.spedit").length, 6);

    click(inc); click(inc);
    ok("dos flechas + suben 2", num.value, "24");
    click(dec);
    ok("una flecha - baja 1", num.value, "23");
    ok("el slider siguio al boton", range.value, "23");

    num.value = "1x2";           // letters typed into the box
    fire(num, "input");
    ok("las letras se filtran", num.value, "12");
    ok("el slider siguio al texto", range.value, "12");

    num.value = "4x0";           // filtered to 40, which is over the cap
    fire(num, "input");
    ok("40 se recorta a 32 en pantalla", num.value, "32");
    ok("el slider siguio al recorte", range.value, "32");

    num.value = "0"; fire(num, "input");
    ok("bajar a 0 desactiva la flecha -", dec.disabled, "true");
    num.value = "32"; fire(num, "input");
    ok("subir a 32 desactiva la flecha +", inc.disabled, "true");
    click(inc);
    ok("el tope de 32 aguanta", num.value, "32");

    console.log("");
    console.log("  ERRORES JS:", errs.length ? errs.join(" | ") : "ninguno");
    if (bad || errs.length) process.exit(1);
  }, 260);
}, 420);
