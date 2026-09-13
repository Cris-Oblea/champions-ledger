/* A build belongs to a POKEMON, not to a species (player, 2026-09-10).

   The ledger already had an orphan when this was written: the Camerupt build
   was still there after its Camerupt was traded away on the GTS, because
   releasing a box row never touched the build. The rule:

     in the Champions box -> active
     parked back in HOME  -> kept, but inactive (nothing trains in HOME)
     released             -> the build goes with it

   The three box rows below are one of each state, plus a build whose row does
   not exist at all. */
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";
const UID = "u1";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(48) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const row = (id, name, location, origin, extra) => Object.assign(
  {user_id:UID, id, name, location, status:"permanent", origin, note:"", ord:0,
   updated_at:"2026-09-10", shiny:false, trained:true}, extra || {});
const ROWS = [
  row("garchomp", "Garchomp", "champions", "champions"),
  row("dragonite", "Dragonite", "home", "home"),
  row("sylveon", "Sylveon", "champions", "home"),   // HOME origin, in the box
  row("camerupt-2", "Camerupt", "home", "home"),    // the relink candidate
];
const build = (id, pokemon) => ({user_id:UID, id, pokemon, mega:null,
  ability:null, mega_ability:null, nature:"Jolly",
  stat_points:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}, moves:["Protect"],
  role:"", rationale:"", extra:{}, updated_at:"2026-09-10"});
const BUILDS = [build("garchomp","Garchomp"), build("dragonite","Dragonite"),
                build("sylveon","Sylveon"), build("camerupt","Camerupt")];

const body = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, "");
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.__DELETED=[]; window.__WROTE=[]; window.confirm=function(m){ window.__ASKED=m; return true; };
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:[]),error:null});},
   upsert:function(r){ window.__WROTE.push(t+"/"+(r&&r.id)); return Promise.resolve({error:null});},
   delete:function(){return {eq:function(c,v){ if(c==="id") window.__DELETED.push(t+"/"+v);
     return {eq:function(){ return Promise.resolve({error:null}); },
             then:function(f){ return Promise.resolve({error:null}).then(f); }};}};}
 };},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};
<\/script>`;
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window, d = w.document;
const click = n => n.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
const tags = n => [...n.querySelectorAll(".tag")].map(t => t.textContent);

setTimeout(() => {
  console.log("\n  el estado de cada build");
  ok("garchomp (en la caja) = activa", w.buildLink("garchomp").state, "active");
  ok("dragonite (en HOME) = aparcada", w.buildLink("dragonite").state, "parked");
  ok("sylveon (HOME origin, en la caja) = activa",
     w.buildLink("sylveon").state, "active");
  ok("camerupt (sin Pokemon) = huerfana", w.buildLink("camerupt").state, "orphan");

  w.go("builds");
  const rows = [...d.querySelectorAll("#listBuilds .row")];
  const by = n => rows.find(r => r.textContent.indexOf(n) === 0);
  console.log("\n  como se ven en la lista");
  ok("Garchomp sin avisos",
     tags(by("Garchomp")).filter(t => /HOME|orphan/.test(t)).length, 0);
  ok("Dragonite dice que esta en HOME",
     tags(by("Dragonite")).indexOf("in HOME — inactive") >= 0, true);
  ok("Camerupt dice huerfana",
     tags(by("Camerupt")).indexOf("orphan — no Pokemon") >= 0, true);

  /* releasing the Pokemon must take the build with it */
  w.go("box");
  const boxRow = [...d.querySelectorAll("#listChampOrigin .row, #listHomeOrigin .row")]
    .find(r => r.textContent.indexOf("Garchomp") >= 0);
  click(boxRow);
  setTimeout(() => {
    const rel = [...d.querySelectorAll(".sheet button")]
      .find(b => b.textContent === "Release");
    ok("hay boton Release", !!rel, true);
    click(rel);
    setTimeout(() => {
      console.log("\n  al liberar");
      ok("avisa de que la build se va",
         /build belongs to the Pokemon/.test(w.__ASKED || ""), true);
      ok("borra la fila de la caja",
         w.__DELETED.indexOf("box/garchomp") >= 0, true);
      ok("borra tambien la build",
         w.__DELETED.indexOf("builds/garchomp") >= 0, true);
      ok("no toca ninguna otra build",
         w.__DELETED.filter(x => x.indexOf("builds/") === 0).length, 1);

      console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
      console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
      process.exit(bad || errs.length ? 1 : 0);
    }, 500);
  }, 400);
}, 1200);
