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
const BUILDS = [B("garchomp","Garchomp","garchomp",{moves:["Earthquake","Protect"]}),
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

const body = require("./harness.js").page(ROOT);
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

  /* ------------------------------------------------------------------ */
  /* El selector de build de un hueco. Era la lista entera del ledger en
     orden alfabetico y sin nada con que acotarla (jugador, 2026-09-21: "el
     selector de slot no tiene buscador! imaginate tener 100 builds
     diferentes y tener que deslizar, es mucho tiempo perdido"). */
  console.log("\n  el selector de un hueco: buscador y filtros");
  w.teamSheet("t1", w.S.teams.t1);
  const fill = [...d.querySelectorAll("#teamEditBody button")]
    .filter(b => /^(Change|Fill)$/.test(b.textContent.trim()));
  ok("cada hueco tiene su boton", fill.length >= 6, true);
  fill[0].click();                       /* el hueco 1, el de Garchomp */
  const sb = d.getElementById("sheetBody");
  const inp = sb.querySelector(".search input");
  const rows = () => [...sb.querySelectorAll(".list .row")];
  ok("el selector tiene buscador", !!inp, true);
  ok("y estan las cinco builds", rows().length, 5);
  ok("dice cuantas hay", /5 builds/.test(sb.textContent), true);

  inp.value = "armor"; inp.oninput();
  ok("busca por el ROL de la build", rows().length, 1);
  ok("y es la que lleva ese rol",
     /Farigiraf/.test(rows()[0].textContent), true);
  inp.value = "earthquake"; inp.oninput();
  ok("busca por un MOVIMIENTO", rows().length, 1);
  ok("y da con su Pokemon", /Garchomp/.test(rows()[0].textContent), true);
  inp.value = "dragon"; inp.oninput();
  ok("busca por TIPO", rows().length, 1);
  ok("lo dice el contador", /1 of 5 builds/.test(sb.textContent), true);

  /* la X: sin ella un filtro se vacia a base de borrar */
  sb.querySelector(".search .clr").click();
  ok("la X vacia el campo", inp.value, "");
  ok("y vuelven todas", rows().length, 5);

  /* La Clausula de Especie se aplica AQUI, igual que la de Objeto en el
     selector de item: una especie que ya lleva otro hueco sale apagada y con
     el motivo escrito, en vez de aceptarse y declararse ilegal despues. */
  const dis = rows().filter(r => r.disabled);
  ok("las especies que ya estan en el equipo salen apagadas", dis.length, 4);
  ok("con el motivo escrito",
     /no team may run two of the same species/.test(sb.textContent), true);
  ok("y la unica elegible va primero",
     /Garchomp/.test(rows()[0].textContent), true);
  ok("que no esta apagada", rows()[0].disabled, false);

  /* Los chips salen de las builds que EXISTEN, no de un vocabulario fijo. */
  const chip = t => [...sb.querySelectorAll(".tog")]
    .find(b => b.textContent.trim().indexOf(t) === 0);
  ok("hay un filtro por donde esta", !!chip("Ready today"), true);
  ok("y uno por rol", !!chip("Trick Room"), true);
  chip("Ready today").click();
  ok("solo las que se pueden llevar hoy", rows().length, 3);
  ok("y el contador lo dice", /3 of 5 builds/.test(sb.textContent), true);
  chip("Ready today").click();
  ok("al soltarlo vuelven todas", rows().length, 5);

  /* El selector de item ya tenia buscador; ahora tambien filtros. */
  w.teamSheet("t1", w.S.teams.t1);
  const it = [...d.querySelectorAll("#teamEditBody button")]
    .filter(b => /^(\+ Item|Item)$/.test(b.textContent.trim()));
  it[0].click();
  const ib = d.getElementById("sheetBody");
  ok("el de items tambien busca", !!ib.querySelector(".search input"), true);
  ok("y ahora filtra por categoria",
     [...ib.querySelectorAll(".tog")].some(b => /Berries/.test(b.textContent)),
     true);
  ok("y por lo que tienes",
     [...ib.querySelectorAll(".tog")]
       .some(b => /Only ones you own/.test(b.textContent)), true);

  /* Y los buscadores que viven en el markup: la misma X, puesta por
     wireClears en el arranque, y el filtro que la Champions Box no tenia. */
  console.log("\n  los filtros de las pestanas");
  ok("el filtro de builds tiene su X",
     !!d.querySelector("#buildSearch").parentNode.querySelector(".clr"), true);
  const bf = d.getElementById("boxFilter");
  ok("la Champions Box ya tiene filtro", !!bf, true);
  const champ = () => d.querySelectorAll("#listChampOrigin .row").length;
  ok("y estan los dos de Encounter", champ(), 2);
  bf.value = "farigiraf"; bf.oninput();
  ok("filtra por nombre", champ(), 1);
  ok("y el encabezado dice cuantos de cuantos",
     d.getElementById("nChampOrigin").textContent, "1 of 2");
  bf.parentNode.querySelector(".clr").click();
  ok("la X lo devuelve entero", champ(), 2);
  ok("y el encabezado vuelve al total",
     d.getElementById("nChampOrigin").textContent, "2");

  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
}, 1500);
