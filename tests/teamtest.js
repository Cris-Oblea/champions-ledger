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
const BUILDS = [B("garchomp","Garchomp","garchomp",{moves:["Earthquake","Protect"], ability:"Rough Skin"}),
                B("farigiraf","Farigiraf","farigiraf",{role:"Trick Room"}),
                B("farigiraf-2","Farigiraf","farigiraf",{role:"Armor Tail"}),
                B("sableye","Sableye","sableye"),
                B("kingambit-idea","Kingambit",null),
                /* Ampharos Electric -> Electric/Dragon: la piedra cambia el
                   tipo, asi que su equipo tiene DOS perfiles. */
                B("ampharos","Ampharos",null,{mega:"Mega Ampharos"}),
                /* Camerupt Fire/Ground -> Fire/Ground: la piedra NO cambia
                   nada, asi que no gana pestaña. */
                B("camerupt","Camerupt",null,{mega:"Mega Camerupt"})];
const TEAMS = [{user_id:UID, id:"t1", name:"Prueba", slots:[
  {build_id:"garchomp",      item:"Life Orb",     why:"power"},
  {build_id:"farigiraf",     item:"Sitrus Berry", why:"bulk"},
  {build_id:"farigiraf-2",   item:"Focus Sash",   why:"second Farigiraf, on purpose"},
  {build_id:"sableye",       item:"Life Orb",     why:"repeated item, on purpose"},
  {build_id:"kingambit-idea",item:"Leftovers",    why:"not owned yet"}
], notes:{}, updated_at:"2026-09-13"},
  {user_id:UID, id:"t2", name:"Piedras", slots:[
    {build_id:"ampharos", item:"", why:""},
    {build_id:"camerupt", item:"", why:""},
    {build_id:"garchomp", item:"", why:""}
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

setTimeout(async () => {
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
  /* DOS equipos en la lista desde que existe el de las piedras, y "Piedras"
     va antes que "Prueba" alfabeticamente - buscar la fila por su nombre en
     vez de por su posicion. */
  const row = [...d.querySelectorAll("#listTeams .row")]
    .find(x => /Prueba/.test(x.textContent));
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
  ok("y estan las siete builds", rows().length, 7);
  ok("dice cuantas hay", /7 builds/.test(sb.textContent), true);

  inp.value = "armor"; inp.oninput();
  ok("busca por el ROL de la build", rows().length, 1);
  ok("y es la que lleva ese rol",
     /Farigiraf/.test(rows()[0].textContent), true);
  inp.value = "earthquake"; inp.oninput();
  ok("busca por un MOVIMIENTO", rows().length, 1);
  ok("y da con su Pokemon", /Garchomp/.test(rows()[0].textContent), true);
  inp.value = "dragon"; inp.oninput();
  /* Garchomp, y la build de Ampharos porque su piedra la hace Electric/Dragon
     - el filtro lee la forma que JUEGA, que es justo lo que tiene que hacer */
  ok("busca por TIPO", rows().length, 2);
  ok("y encuentra el tipo que da la piedra",
     /Ampharos/.test(sb.textContent), true);
  ok("lo dice el contador", /2 of 7 builds/.test(sb.textContent), true);

  /* la X: sin ella un filtro se vacia a base de borrar */
  sb.querySelector(".search .clr").click();
  ok("la X vacia el campo", inp.value, "");
  ok("y vuelven todas", rows().length, 7);

  /* La Clausula de Especie se aplica AQUI, igual que la de Objeto en el
     selector de item: una especie que ya lleva otro hueco sale apagada y con
     el motivo escrito, en vez de aceptarse y declararse ilegal despues. */
  const dis = rows().filter(r => r.disabled);
  ok("las especies que ya estan en el equipo salen apagadas", dis.length, 4);
  ok("con el motivo escrito",
     /no team may run two of the same species/.test(sb.textContent), true);
  /* las apagadas van al final, asi que la primera fila siempre es elegible */
  ok("y una elegible va primero", rows()[0].disabled, false);
  ok("con las apagadas al final",
     rows()[rows().length - 1].disabled, true);

  /* DONDE ESTA UNA COPIA ES COSA DE LAS CAJAS. Un equipo puede ser teorico,
     asi que ese filtro no pinta nada aqui (jugador, 2026-09-21). */
  const chip = t => [...sb.querySelectorAll(".tog")]
    .find(b => b.textContent.trim().indexOf(t) === 0);
  ok("ya no filtra por donde esta", !!chip("Ready today"), false);
  ok("ni por si la tienes", !!chip("Not owned"), false);
  ok("ni ordena por eso", !!chip("Ready first"), false);

  /* Solo A-Z y Dex a la vista; las stats, completas, plegadas. */
  ok("ordena por A–Z", !!chip("A–Z"), true);
  ok("y por Dex", !!chip("Dex no."), true);
  const fold = t => [...sb.querySelectorAll(".btn.fold")]
    .find(b => b.textContent.indexOf(t) >= 0);
  ok("las stats van detras de un pliegue", !!fold("By a stat"), true);
  const statRow = fold("By a stat").nextSibling;
  ok("cerrado de entrada", statRow.hidden, true);
  fold("By a stat").click();
  ok("y se abre", statRow.hidden, false);
  /* si estan BST y Speed, estan las seis: media lista es arbitraria */
  ["BST", "HP", "Atk", "Def", "SpA", "SpD", "Spe"].forEach(function(k){
    ok("  ordena por " + k, !!chip(k), true);
  });
  chip("Spe").click();
  ok("el mas rapido primero", /Garchomp/.test(rows()[0].textContent), true);

  /* El rol ocupaba demasiado, asi que va plegado y siempre. */
  ok("el rol va plegado", !!fold("Role"), true);
  const roleRow = fold("Role").nextSibling;
  ok("cerrado de entrada", roleRow.hidden, true);
  fold("Role").click();
  ok("y se abre", roleRow.hidden, false);
  ok("con los roles que existen", !!chip("Trick Room"), true);
  chip("Trick Room").click();
  ok("filtra por rol", rows().length, 1);
  chip("Trick Room").click();
  ok("al soltarlo vuelven todas", rows().length, 7);

  /* El selector de item ya tenia buscador; ahora tambien filtros. */
  w.teamSheet("t1", w.S.teams.t1);
  const it = [...d.querySelectorAll("#teamEditBody button")]
    .filter(b => /^(\+ Item|Item)$/.test(b.textContent.trim()));
  it[0].click();
  const ib = d.getElementById("sheetBody");
  ok("el de items tambien busca", !!ib.querySelector(".search input"), true);
  const icat = t => [...ib.querySelectorAll(".tog")]
    .some(b => b.textContent.indexOf(t) === 0);
  ok("filtra por categoria", icat("Berries"), true);
  ok("y por lo que tienes",
     [...ib.querySelectorAll(".tog")]
       .some(b => /Only ones you own/.test(b.textContent)), true);

  /* SOLO LO QUE SE PUEDE LLEVAR. Las 81 piedras nunca estuvieron en la lista
     - build_tracker_data las salta al construir C.ITEMS - y un tercio de lo
     que si estaba, Miscellaneous, no se puede equipar (jugador, 2026-09-21).  */
  ok("las Mega Piedras se pueden equipar", icat("Mega Stones"), true);
  ok("y Miscellaneous ya no se ofrece", icat("Miscellaneous"), false);
  const irow = n => [...ib.querySelectorAll(".list .row")]
    .find(r => r.textContent.indexOf(n) === 0);
  ok("una piedra concreta esta", !!irow("Garchompite"), true);
  ok("y se puede pulsar", irow("Garchompite").disabled, false);
  ok("marcada como piedra",
     /Mega Stone/.test(irow("Garchompite").textContent), true);
  const misc = [...ib.querySelectorAll(".list .row")]
    .some(r => /Rare Candy|Exp\. Share|Ability Capsule/.test(r.textContent));
  ok("nada de lo no equipable en la lista", misc, false);

  /* Y el orden de velocidad con el numero REAL de cada build. */
  w.teamSheet("t1", w.S.teams.t1);
  const sp = w.teamReport(w.S.teams.t1).speeds;
  /* Garchomp: base 102, +32 SP, Adamant no toca Speed -> 102+32+20 = 154 */
  ok("velocidad real, no la base", sp[0].spe, 154);
  ok("y dice de donde sale", sp[0].base, 102);
  ok("con la SP invertida", sp[0].sp, 32);
  ok("el mas rapido primero", sp[0].name, "Garchomp");
  ok("y el mas lento al final", sp[sp.length - 1].spe <= sp[0].spe, true);
  ok("la pantalla lo escribe",
     /154/.test(d.getElementById("teamEditBody").textContent), true);

  /* Las debilidades dicen QUIEN y POR CUANTO. */
  const weak = d.getElementById("teamEditBody").textContent;
  ok("nombra quien es debil", /weak: [A-Z]/.test(weak), true);
  ok("con su multiplicador", /weak: [^\n]*×[0-9]/.test(weak), true);
  ok("y quien resiste", /resists: |nothing on the team resists it/.test(weak),
     true);
  const tt = w.teamTypes(w.teamReport(w.S.teams.t1));
  const one = tt.find(x => x.weak);
  ok("y el dato lleva los nombres", one.weakOf.length, one.weak);
  ok("con el multiplicador de cada uno", typeof one.weakOf[0].m, "number");

  /* Y los buscadores que viven en el markup: la misma X, puesta por
     wireClears en el arranque, y el filtro que la Champions Box no tenia. */
  /* LA CARD DE UN HUECO LLEVA EL SET ENTERO. Decia un nombre, una naturaleza
     y "4 moves", asi que revisar lo que hace el equipo eran seis builds
     abiertas de una en una (jugador, 2026-09-21). */
  console.log("\n  la card del hueco, y el atajo a la build");
  w.teamSheet("t1", w.S.teams.t1);
  const eb = d.getElementById("teamEditBody");
  const slot0 = eb.querySelectorAll(".list .row")[0];
  ok("la card nombra la habilidad elegida",
     /Rough Skin/.test(slot0.textContent), true);
  ok("y la etiqueta dice que es LA suya",
     /Ability/.test(slot0.textContent), true);
  ok("lleva la naturaleza", /Adamant/.test(slot0.textContent), true);
  ok("lleva los SP", /0\/32\/0\/0\/2\/32/.test(slot0.textContent), true);
  ok("y los NOMBRES de los moves, no el numero",
     /Earthquake/.test(slot0.textContent) && /Protect/.test(slot0.textContent),
     true);
  ok("el item sigue en su celda", /Life Orb/.test(slot0.textContent), true);

  const edBtn = [...eb.querySelectorAll("button")]
    .filter(b => b.textContent.trim() === "Edit set");
  ok("cada hueco lleno tiene atajo a su build", edBtn.length, 5);
  edBtn[0].click();
  /* EL ATAJO ESCRIBE EL EQUIPO ANTES DE IRSE, y eso es una promesa: los dos
     editores son vistas, asi que saltar sin guardar se llevaria el borrador
     por delante. El test tiene que esperar ese write igual que lo espera la
     pantalla. */
  await new Promise(r => setTimeout(r, 60));
  /* El atajo guarda el equipo ANTES de irse: los dos editores son vistas, y
     saltar sin escribir se llevaria el borrador por delante. */
  ok("y abre el editor de la build",
     d.getElementById("v-buildedit").hidden, false);
  ok("el del equipo se cierra", d.getElementById("v-teamedit").hidden, true);
  ok("y es la build correcta",
     /Garchomp/.test(d.getElementById("buildEditTitle").textContent), true);

  /* UN SELECTOR, DOS SECCIONES. Solo una puede Mega Evolucionar por combate,
     y un Pokemon solo toma las stats de su Mega al evolucionar - asi que
     "nadie evoluciona" y "evoluciona esta" son equipos distintos, y el orden
     de velocidad y las debilidades tienen que contar la MISMA historia
     (jugador, 2026-09-21: "el pokemon solo cambia de stat al mega evolucionar
     y si no mega evoluciona la tabla de speed no cambia"). */
  console.log("\n  un mundo a la vez: velocidad y tipos bajo el mismo selector");
  const r2 = w.teamReport(w.S.teams.t2);
  const caso = n => r2.megaCases.find(x => new RegExp(n).test(x.mega));

  /* Ampharos retipa Y cambia velocidad; Camerupt NO retipa pero SI cambia
     velocidad, y filtrar por retipado solo lo habria perdido. */
  ok("dos piedras cambian algo", r2.megaCases.length, 2);
  ok("Ampharos retipa", caso("Ampharos").retype, true);
  ok("de Electric", caso("Ampharos").from.join("/"), "Electric");
  ok("a Electric/Dragon", caso("Ampharos").to.join("/"), "Electric/Dragon");
  ok("Camerupt NO retipa", caso("Camerupt").retype, false);
  ok("pero si cambia velocidad", caso("Camerupt").respeed, true);
  ok("de 40", caso("Camerupt").speFrom, 40);
  ok("a 20", caso("Camerupt").speTo, 20);

  /* LA VELOCIDAD SIGUE AL SELECTOR. Sin evolucionar, la piedra no hace nada. */
  const spBase = w.teamSpeeds(r2, null);
  const spCam  = w.teamSpeeds(r2, caso("Camerupt").i);
  const find = (rows, n) => rows.find(x => new RegExp(n).test(x.form));
  ok("sin evolucionar, Camerupt corre a su base", find(spBase, "Camerupt").base, 40);
  ok("y no se llama Mega", /^Camerupt$/.test(find(spBase, "Camerupt").form), true);
  ok("al evolucionarla, cae a la base de la Mega",
     find(spCam, "Mega Camerupt").base, 20);
  ok("y el resto del equipo no se mueve",
     find(spCam, "Ampharos").base, find(spBase, "Ampharos").base);
  ok("solo una evoluciona a la vez",
     spCam.filter(x => x.mega).length, 1);
  ok("y en el mundo base, ninguna", spBase.filter(x => x.mega).length, 0);

  /* LOS TIPOS SIGUEN EL MISMO SELECTOR. */
  const base = w.teamTypes(r2, null);
  const mega = w.teamTypes(r2, caso("Ampharos").i);
  const byType = (t, rows) => rows.find(x => x.type === t);
  ok("antes de evolucionar no es debil a Hielo",
     byType("Ice", base).weakOf.some(x => /Ampharos/.test(x.name)), false);
  ok("despues si lo es",
     byType("Ice", mega).weakOf.some(x => /Mega Ampharos/.test(x.name)), true);
  ok("y la tabla lo nombra por su forma Mega",
     byType("Ice", mega).weakOf.find(x => /Ampharos/.test(x.name)).name,
     "Mega Ampharos");
  ok("Hada pasa a pegarle",
     byType("Fairy", mega).weakOf.some(x => /Mega Ampharos/.test(x.name)), true);
  ok("que antes no",
     byType("Fairy", base).weakOf.some(x => /Ampharos/.test(x.name)), false);

  /* Y en pantalla: UN selector, y las dos secciones debajo. */
  w.teamSheet("t2", w.S.teams.t2);
  const eb2 = d.getElementById("teamEditBody");
  const seg = [...eb2.querySelectorAll(".seg")].pop();
  const tabs = seg ? [...seg.children].map(b => b.textContent.trim()) : [];
  ok("tres mundos", tabs.length, 3);
  ok("y el de nadie va primero", tabs[0], "Nobody evolves");
  ok("empieza ahi", seg.children[0].getAttribute("aria-pressed"), "true");
  ok("dice que mandan los dos de abajo",
     /Speed order and the weaknesses below both follow this choice/
       .test(eb2.textContent), true);
  ok("el selector esta ENCIMA del orden de velocidad",
     eb2.textContent.indexOf("Which one Mega Evolves")
       < eb2.textContent.indexOf("Speed order"), true);

  /* SOLO EL BLOQUE DE VELOCIDAD. El nombre de una Mega tambien vive en la
     pestaña del selector y en la card del hueco, asi que buscarlo en todo el
     editor no dice nada sobre que forma se esta usando. */
  const speedTxt = () => {
    const h = [...eb2.querySelectorAll("h2")].find(x => /Speed order/.test(x.textContent));
    return h.nextSibling.textContent.replace(/\s+/g, " ");
  };
  const camTab = tabs.findIndex(t => /Camerupt/.test(t));
  seg.children[camTab].click();
  ok("al elegir Camerupt lo dice con su velocidad",
     /Speed 40 → 20/.test(eb2.textContent), true);
  ok("y el orden ya la nombra Mega", /Mega Camerupt/.test(speedTxt()), true);
  ok("sin evolucionar la otra", /Mega Ampharos/.test(speedTxt()), false);

  const ampTab = tabs.findIndex(t => /Ampharos/.test(t));
  seg.children[ampTab].click();
  ok("al cambiar explica el intercambio de tipo",
     /Electric → Electric\/Dragon/.test(eb2.textContent), true);
  ok("y ahora la que evoluciona es la otra",
     /Mega Ampharos/.test(speedTxt()), true);
  ok("con Camerupt de vuelta en su forma base",
     /Mega Camerupt/.test(speedTxt()), false);
  ok("y su velocidad vuelve a la de base",
     /40 base/.test(speedTxt()), true);

  /* Un equipo sin piedra que cambie nada no gana controles. */
  w.teamSheet("t1", w.S.teams.t1);
  const eb1 = d.getElementById("teamEditBody");
  ok("sin cambios no hay selector",
     /Which one Mega Evolves/.test(eb1.textContent), false);
  ok("pero la tabla sigue estando", /weak: /.test(eb1.textContent), true);
  ok("y el orden de velocidad tambien",
     /Speed order/.test(eb1.textContent), true);

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
