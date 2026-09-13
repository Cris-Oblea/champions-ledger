/* The move picker in a build: filters that stack (player, 2026-09-10).

   It sorted by BP x accuracy or A-Z and that was all, so "which special
   Electric move do I actually have" meant scrolling a list ordered by
   something else. Now the sort is one choice and the filters stack: every
   group ANDs with the others, and the chips inside a group OR together.

   Garchomp is the fixture because its pool covers all three categories, both
   spread kinds (Earthquake hits the ally, Rock Slide does not) and priority. */
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
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(46) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const ROWS = [{user_id:UID, id:"garchomp", name:"Garchomp", location:"champions",
  status:"permanent", origin:"champions", note:"", ord:0,
  updated_at:"2026-09-10", shiny:false, trained:true}];
const BUILDS = [{user_id:UID, id:"garchomp", pokemon:"Garchomp", mega:null,
  ability:"Rough Skin", mega_ability:null, nature:"Jolly",
  stat_points:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32},
  moves:["Earthquake",null,null,null], role:"", rationale:"", extra:{},
  updated_at:"2026-09-10"}];

const body = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, "");
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
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window, d = w.document;
const click = n => n.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));

setTimeout(() => {
  w.go("builds");
  click(d.querySelectorAll("#listBuilds .row")[0]);
  setTimeout(() => {
    const slot = [...d.querySelectorAll(".slot")].find(s => /Earthquake/.test(s.textContent));
    click(slot);
    setTimeout(() => {
      const chip = t => [...d.querySelectorAll(".sheet .tog")]
        .find(b => b.textContent.trim() === t);
      const rows = () => [...d.querySelectorAll(".sheet .list .row")];
      const names = () => rows().map(r => r.querySelector(".rname").textContent
        .replace(/priority \+\d| ?spread| ?hits ally|Rough Skin/g, "").trim());
      const meta = () => rows().map(r => r.querySelector(".rmeta .mono").textContent);
      const countLine = () => [...d.querySelectorAll(".sheet .sub")]
        .map(x => x.textContent).find(t => / moves$| of \d+ moves/.test(t)) || "";

      console.log("\n  los controles estan");
      ["BP × acc", "A–Z", "PP", "Type"].forEach(function(t){
        ok("orden: " + t, !!chip(t), true);
      });
      ["Physical", "Special", "Status", "Spread", "Hits ally", "Priority"]
        .forEach(function(t){ ok("filtro: " + t, !!chip(t), true); });
      ok("hay chips de tipo (Ground)", !!chip("Ground"), true);
      const all = rows().length;
      ok("empieza sin filtrar", /^\d+ moves$/.test(countLine().split(" ·")[0]), true);

      console.log("\n  un filtro");
      click(chip("Physical"));
      ok("solo fisicos", meta().every(t => /^Physical/.test(t)), true);
      ok("y son menos que todos", rows().length < all, true);

      console.log("\n  dos filtros a la vez (se acumulan)");
      click(chip("Ground"));
      ok("solo Ground fisicos", meta().every(t => /^Physical/.test(t)), true);
      ok("todas son Ground",
         rows().every(r => /Ground/.test(r.querySelector(".t").textContent)), true);
      ok("el contador dice N de M", / of \d+ moves/.test(countLine()), true);
      const twoFilters = rows().length;

      console.log("\n  el orden se combina con los filtros");
      click(chip("A–Z"));
      const az = names();
      ok("sigue filtrado", rows().length, twoFilters);
      ok("y ahora en A-Z",
         az.join("|") === az.slice().sort((a,b)=>a.localeCompare(b)).join("|"), true);

      console.log("\n  quitar un chip lo devuelve");
      click(chip("Ground"));
      click(chip("Physical"));
      ok("vuelven todos", rows().length, all);

      console.log("\n  los otros filtros");
      click(chip("Priority"));
      ok("todas con prioridad",
         rows().every(r => /priority \+/.test(r.querySelector(".rname").textContent)), true);
      click(chip("Priority"));
      click(chip("Hits ally"));
      ok("todas golpean al aliado",
         rows().length > 0 &&
         rows().every(r => /hits ally/.test(r.querySelector(".rname").textContent)), true);
      click(chip("Hits ally"));
      click(chip("Status"));
      ok("solo status", meta().every(t => /^Status/.test(t)), true);
      click(chip("Status"));

      /* Two chips in "Must have" mean BOTH, not either - the player caught
         this returning the union. A move cannot be spread and priority at
         once in Champions, and 0 results is the honest answer to that. */
      console.log("\n  dos rasgos a la vez piden LOS DOS");
      click(chip("Spread")); click(chip("Hits ally"));
      const bothTraits = rows();
      ok("spread + hits ally: cumplen ambos",
         bothTraits.length > 0 && bothTraits.every(r => {
           const t = r.querySelector(".rname").textContent;
           return /spread/.test(t) && /hits ally/.test(t); }), true);
      click(chip("Hits ally")); click(chip("Priority"));
      ok("spread + priority: no existe ninguno", rows().length, 0);
      ok("y el contador lo dice", /^0 of \d+ moves/.test(countLine()), true);
      click(chip("Spread")); click(chip("Priority"));
      ok("al quitarlos vuelven todos", rows().length, all);

      console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
      console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
      process.exit(bad || errs.length ? 1 : 0);
    }, 500);
  }, 500);
}, 1200);
