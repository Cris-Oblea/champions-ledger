/* The team builder: six slots, and the rules of the format checked rather than
   remembered.

   The app could say what one Pokemon was running and nothing could say what he
   was BRINGING, which is the question the game asks. Five teams existed as
   prose in analysis/team_plans.json and the app had never seen one.

   Three things decided the shape, and each is asserted here:

     A slot points at a BUILD, not a box row - so one Pokemon can sit in any
     number of teams, and three different Farigiraf are three different
     answers (player, 2026-09-13).

     THE ITEM LIVES ON THE SLOT. The Item Clause means six Pokemon field
     exactly one Sitrus Berry, so an item stored per build is a preference that
     cannot survive contact with a team. That is why builds carry none.

     A TEAM MAY BE INCOMPLETE. Four of six is worth writing down; the app says
     what he has, where it is, and what is still to get.

   The fixture breaks both clauses on purpose. */
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = require("path").join(__dirname, "..") + "/";
const UID = "u1";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(52) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const R = (id, name, loc, origin, status) => ({user_id:UID, id, name,
  location:loc, status, origin, note:"", ord:0, updated_at:"2026-09-13",
  shiny:false, trained:true});
const B = (id, pokemon, box_id, extra) => Object.assign({user_id:UID, id,
  pokemon, box_id, mega:null, ability:null, mega_ability:null,
  nature:"Adamant", stat_points:{hp:0,atk:32,def:0,spa:0,spd:2,spe:32},
  moves:["Protect"], role:"", rationale:"", extra:{},
  updated_at:"2026-09-13"}, extra || {});

const ROWS = [R("garchomp","Garchomp","champions","champions","permanent"),
              R("farigiraf","Farigiraf","champions","champions","permanent"),
              R("sableye","Sableye","home","home","permanent")];
const BUILDS = [B("garchomp","Garchomp","garchomp"),
                B("farigiraf","Farigiraf","farigiraf",{role:"Trick Room"}),
                B("farigiraf-2","Farigiraf","farigiraf",{role:"Armor Tail"}),
                B("sableye","Sableye","sableye"),
                B("kingambit-idea","Kingambit",null)];
const TEAMS = [{user_id:UID, id:"t1", name:"Prueba", slots:[
  {build_id:"garchomp",      item:"Life Orb",     why:"power"},
  {build_id:"farigiraf",     item:"Sitrus Berry", why:"bulk"},
  {build_id:"farigiraf-2",   item:"Focus Sash",   why:"second Farigiraf, on purpose"},
  {build_id:"sableye",       item:"Life Orb",     why:"repeated item, on purpose"},
  {build_id:"kingambit-idea",item:"Leftovers",    why:"not owned yet"}
], notes:{}, updated_at:"2026-09-13"}];

const body = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, "");
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.__TEAMS=${JSON.stringify(TEAMS)};
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:(t==="teams"?window.__TEAMS:[])),error:null});},
   upsert:function(){return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){return Promise.resolve({error:null});}};}
 };},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};<\/script>`;
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message.split("\n")[0]); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window, d = w.document;

setTimeout(() => {
  const r = w.teamReport(w.S.teams.t1);

  console.log("\n  lo que tiene, donde esta, y que falta");
  ok("cinco huecos llenos", r.filled, 5);
  ok("y siempre son seis", r.slots.length, 6);
  ok("tres se pueden llevar hoy", r.ready, 3);
  ok("dice cual falta por conseguir", r.missing.join(","), "Kingambit");
  ok("y avisa del que esta en HOME",
     r.warnings.some(x => /Sableye is parked in HOME/.test(x)), true);

  console.log("\n  las clausulas, comprobadas y no recordadas");
  ok("Species Clause: dos Farigiraf",
     r.problems.some(x => /two Farigiraf.*Species Clause/.test(x)), true);
  ok("Item Clause: dos Life Orb",
     r.problems.some(x => /two Life Orb.*Item Clause/.test(x)), true);
  ok("y nada mas se declara ilegal", r.problems.length, 2);

  console.log("\n  lo derivado");
  ok("orden de velocidad, el mas rapido primero",
     r.speeds[0].name, "Garchomp");
  /* Stellar is in the type chart and NOT in Champions - there is no Tera here,
     so counting it would invent a weakness nothing can exploit. */
  ok("Stellar no cuenta como debilidad",
     w.teamTypes(r).some(x => x.type === "Stellar"), false);
  ok("las debilidades compartidas salen ordenadas",
     w.teamTypes(r)[0].weak >= w.teamTypes(r)[5].weak, true);

  console.log("\n  la lista");
  /* Teams shares the Builds tab: an eighth tab wrapped the phone's bar onto
     two rows and cost more visibility than the tab was worth (2026-09-13). */
  w.go("builds");
  w.buildsPane("teams");
  ok("la pestana Teams ya no existe",
     [...d.querySelectorAll("#tabs button, #tabs a")]
       .some(b => b.textContent.trim() === "Teams"), false);
  ok("y el panel de equipos se ve",
     d.getElementById("teamsPane").hidden, false);
  ok("mientras el de builds se esconde",
     d.getElementById("buildsPane").hidden, true);
  const row = d.querySelector("#listTeams .row");
  ok("el equipo aparece", !!row, true);
  ok("con cuantos huecos lleva", /5\/6/.test(row.textContent), true);
  ok("cuantos son jugables hoy", /3 playable today/.test(row.textContent), true);
  ok("y que es ilegal", /2 illegal/.test(row.textContent), true);

  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
}, 1500);
