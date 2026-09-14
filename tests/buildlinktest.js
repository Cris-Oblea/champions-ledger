/* A build is its own thing, and box_id says which Pokemon is carrying it.

   It used to BE the Pokemon - same id, one build per box row, and no build
   without one (player, 2026-09-10). He replaced that on 2026-09-13: several
   builds per species, and builds for Pokemon he does not own yet, so an idea
   is not lost for want of a row to hang it on.

     linked, in the Champions box -> active
     linked, parked in HOME       -> kept, inactive (nothing trains in HOME)
     linked to a row that is gone -> orphan, and still worth flagging
     not linked at all            -> unbound: an idea, which is fine

   Released now UNBINDS rather than deletes. The fixtures below cover all four
   states, including two builds on one Pokemon - the case the old model could
   not represent. */
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
/* box_id is the LINK now, and it is not the id. Until 2026-09-13 a build WAS
   the box row it sat on - same id, one build per Pokemon, and no build without
   one. The player replaced that with two rules: several builds for a species
   (three different Farigiraf), and a build for a Pokemon he does not own yet,
   so the idea survives until he does.
   No fallback from a missing box_id to the id, deliberately: an idea build for
   Farigiraf gets the id "farigiraf", and a fallback would silently marry it to
   a box row of the same name. */
const build = (id, pokemon, box_id) => ({user_id:UID, id, pokemon,
  box_id: box_id === undefined ? id : box_id, mega:null,
  ability:null, mega_ability:null, nature:"Jolly",
  stat_points:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}, moves:["Protect"],
  role:"", rationale:"", extra:{}, updated_at:"2026-09-10"});
const BUILDS = [build("garchomp","Garchomp"), build("dragonite","Dragonite"),
                build("sylveon","Sylveon"), build("camerupt","Camerupt"),
                /* the two new shapes */
                build("garchomp-2","Garchomp", "garchomp"),
                build("kingambit-idea","Kingambit", null)];

const body = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script id="vendor-supabase">[\s\S]*?<\/script>/, "");
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.__DELETED=[]; window.__WROTE=[]; window.confirm=function(m){ window.__ASKED=m; return true; };
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:[]),error:null});},
   upsert:function(r){ window.__WROTE.push({table:t, row:r}); return Promise.resolve({error:null});},
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
  /* unbound is not a fault, and the two cases read differently: a set waiting
     for one of your copies, against a set for a species you do not have */
  ok("Kingambit dice que es una idea sin Pokemon",
     tags(by("Kingambit")).indexOf("an idea — you have none yet") >= 0, true);
  ok("y la segunda Garchomp sigue activa (dos builds, un Pokemon)",
     w.buildLink("garchomp-2").state, "active");

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
      /* A release used to DELETE the builds, so the ledger would not fill with
         sets for Pokemon that no longer exist. That reason died with the model
         change: a build with no Pokemon is a first-class state now, and the
         player's reason for unbinding builds at all was that an idea should
         not be lost for want of a row to hang it on. So a release unbinds and
         keeps them - and garchomp carries TWO, which is the case the old
         one-build-per-row model could not produce. */
      ok("avisa de que las builds se conservan",
         /will be KEPT as ideas/.test(w.__ASKED || ""), true);
      ok("...y dice cuantas", /2 builds/.test(w.__ASKED || ""), true);
      ok("borra la fila de la caja",
         w.__DELETED.indexOf("box/garchomp") >= 0, true);
      ok("NO borra ninguna build",
         w.__DELETED.filter(x => x.indexOf("builds/") === 0).length, 0);
      const wroteBuilds = w.__WROTE.filter(x => x.table === "builds");
      const unbound = wroteBuilds.filter(x => x.row.box_id === null)
        .map(x => x.row.id).sort();
      ok("desata las dos de ese Pokemon", unbound.join(","), "garchomp,garchomp-2");
      ok("y no toca la de otro",
         wroteBuilds.some(x => x.row.id === "dragonite"), false);

      console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
      console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
      process.exit(bad || errs.length ? 1 : 0);
    }, 500);
  }, 400);
}, 1200);
