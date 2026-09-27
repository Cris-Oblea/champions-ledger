/* Installing a build on a Pokemon: which copy, what it looks like, and the
   "trained" tag that follows it (player, 2026-09-27).

     - The copy picker shows every copy as the box card - shiny, trained,
       origin, where it lives, what it already carries - not "copy 2 of 3".
     - The "trained" tag follows the build both ways: installing one sets it,
       moving the build away or deleting it clears it from the copy it left,
       unless another build still sits there.
     - A team slot holding a BASE build with no stone draws the base form
       alone. The flag read `megas: !build.mega`, which switched the Mega line
       ON for exactly the builds that have no Mega. */
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = require("path").join(__dirname, "..") + "/";
const UID = "u1";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(56) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const R = (id, name, loc, origin, extra) => Object.assign({user_id:UID, id,
  name, location:loc, status:"permanent", origin, note:"", ord:0,
  updated_at:"2026-09-27", shiny:false, trained:false}, extra || {});
const B = (id, pokemon, box_id, extra) => Object.assign({user_id:UID, id,
  pokemon, box_id, mega:null, ability:null, mega_ability:null,
  nature:"Modest", stat_points:{hp:2,atk:0,def:0,spa:32,spd:0,spe:32},
  moves:["Protect"], role:"", rationale:"", extra:{},
  updated_at:"2026-09-27"}, extra || {});

const ROWS = [
  R("charizard", "Charizard", "champions", "home", {shiny:true, trained:true}),
  R("charizard-2", "Charizard", "home", "home", {note:"the one from GO"}),
  R("charizard-3", "Charizard", "champions", "champions"),
];
const BUILDS = [
  /* on charizard, base form, no stone */
  B("charizard", "Charizard", "charizard"),
  /* a second one on charizard-3, so moving it off leaves a build behind */
  B("charizard-b", "Charizard", "charizard-3"),
  B("charizard-c", "Charizard", "charizard-3"),
];
const TEAMS = [{user_id:UID, id:"t1", name:"Base", slots:[
  {build_id:"charizard", item:"", why:""}], notes:{}, updated_at:"2026-09-27"}];

const body = require("./harness.js").page(ROOT);
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.__TEAMS=${JSON.stringify(TEAMS)}; window.__WROTE=[];
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:(t==="teams"?window.__TEAMS:[])),error:null});},
   upsert:function(r){ window.__WROTE.push({table:t, row:r}); return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){ return {eq:function(){ return Promise.resolve({error:null}); },
     then:function(f){ return Promise.resolve({error:null}).then(f); }}; }};}
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
const tick = ms => new Promise(r => setTimeout(r, ms));
const boxWrites = () => w.__WROTE.filter(x => x.table === "box")
  .map(x => x.row.id + "=" + x.row.trained).sort().join(",");
const foot = label => [...d.querySelectorAll("#buildEditFoot button")]
  .find(b => b.textContent === label);

(async function () {
  await tick(1200);

  console.log("\n  el slot de un team");
  w.teamSheet("t1", w.S.teams.t1);
  await tick(200);
  const slot = d.querySelector("#teamEditBody .row.card");
  /* the strip is always there; what matters is how many forms it holds */
  ok("una build base sin piedra dibuja UN sprite, no base + Megas",
     slot ? slot.querySelectorAll(".megapics .megapic").length : -1, 1);

  console.log("\n  sobre que copia se instala");
  w.buildSheet("charizard", w.S.builds.charizard);
  await tick(200);
  const field = [...d.querySelectorAll("#buildEditBody .field")]
    .find(f => /Installed on/.test(f.textContent));
  const cards = [...field.querySelectorAll(".row")];
  ok("sin <select>: una fila por copia, mas 'solo una idea'",
     !field.querySelector("select") && cards.length, 4);
  ok("ninguna dice 'copy N'", /copy \d/.test(field.textContent), false);
  const tagsOf = n => [...n.querySelectorAll(".tag")].map(t => t.textContent);
  ok("la shiny lo dice", tagsOf(cards[1]).indexOf("shiny") >= 0, true);
  ok("dice donde vive", tagsOf(cards[1]).indexOf("Champions box") >= 0, true);
  /* the Champions box first, then HOME - the order the box itself uses */
  ok("y la de HOME tambien", tagsOf(cards[3]).indexOf("in HOME") >= 0, true);
  ok("con su nota", /the one from GO/.test(cards[3].textContent), true);
  ok("dice que builds ya lleva",
     /already carries charizard-b, charizard-c/.test(cards[2].textContent), true);
  ok("la actual esta marcada", cards[1].classList.contains("picked"), true);

  console.log("\n  el tag trained sigue a la build");
  cards[3].click();                     /* moverla a la de HOME */
  ok("marcar otra copia no redibuja: la marca se mueve",
     cards[3].classList.contains("picked") && !cards[1].classList.contains("picked"),
     true);
  foot("Save").click();
  await tick(300);
  ok("la copia nueva gana trained, la que deja lo pierde", boxWrites(),
     "charizard-2=true,charizard=false");

  w.__WROTE.length = 0;
  w.buildSheet("charizard-b", w.S.builds["charizard-b"]);
  await tick(200);
  [...d.querySelectorAll("#buildEditBody .field")]
    .find(f => /Installed on/.test(f.textContent)).querySelector(".row").click();
  foot("Save").click();
  await tick(300);
  ok("desinstalar con otra build aun encima no le quita el tag",
     boxWrites(), "");

  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
})();
