/* Installing a build on a Pokemon: which copy, what it looks like, and the
   "trained" tag that follows it (player, 2026-09-27, 2026-09-28).

     - "Installed on" is a dropdown whose closed face is the copy the build
       is on, and the card of THAT copy sits under it - shiny, trained,
       origin, where it lives, what it already carries, its note. A list of
       cards replaced the dropdown for a day and every build read "Not
       installed - just an idea", because the list's first row looked like
       its value, and nothing said how to take a build off a copy. His two
       sentences are cases below: "sigue diciendo not installed!" and
       "no se puede sacar al ampharos!".
     - The "trained" tag follows the build both ways: installing one sets it,
       moving the build away or deleting it clears it from the copy it left,
       unless another build still sits there.
     - A team slot holding a BASE build with no stone draws the base form
       alone. The flag read `megas: !build.mega`, which switched the Mega line
       ON for exactly the builds that have no Mega. */
const { check, tick, open } = require("./harness.js");
const UID = "u1";

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
  /* the one copy of its species, as his Ampharos is */
  R("ampharos", "Ampharos", "champions", "home", {shiny:true, trained:true}),
  /* two copies the same in everything recorded, as his two Heracross are */
  R("heracross", "Heracross", "home", "home"),
  R("heracross-2", "Heracross", "home", "home"),
];
const BUILDS = [
  /* on charizard, base form, no stone */
  B("charizard", "Charizard", "charizard"),
  /* a second one on charizard-3, so moving it off leaves a build behind */
  B("charizard-b", "Charizard", "charizard-3"),
  B("charizard-c", "Charizard", "charizard-3"),
  B("ampharos", "Ampharos", "ampharos"),
  B("heracross", "Heracross", null),
];
const TEAMS = [{user_id:UID, id:"t1", name:"Base", slots:[
  {build_id:"charizard", item:"", why:""}], notes:{}, updated_at:"2026-09-27"}];

const { dom, errs } = open({ box: ROWS, builds: BUILDS, teams: TEAMS });
const w = dom.window, d = w.document;
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
  check("una build base sin piedra dibuja UN sprite, no base + Megas",
     slot ? slot.querySelectorAll(".megapics .megapic").length : -1, 1);

  console.log("\n  sobre que copia se instala");
  const installed = () => [...d.querySelectorAll("#buildEditBody .field")]
    .find(f => /Installed on/.test(f.textContent));
  const tagsOf = n => [...n.querySelectorAll(".tag")].map(t => t.textContent);
  const choose = (sel, v) => {
    sel.value = v; sel.dispatchEvent(new w.Event("change")); };
  const buildWrites = () => w.__WROTE.filter(x => x.table === "builds")
    .map(x => x.row.id + "=" + x.row.box_id).join(",");

  w.buildSheet("charizard", w.S.builds.charizard);
  await tick(200);
  const sel = installed().querySelector("select");
  const face = s => s.options[s.selectedIndex].text;
  check("un desplegable: 'solo una idea' mas una opcion por copia",
     sel ? sel.options.length : 0, 4);
  /* "sigue diciendo not installed!" - the closed face IS the answer */
  check("cerrado dice en cual esta, no 'not installed'",
     /^Charizard · Champions box · shiny · trained/.test(face(sel)) &&
     !/not installed/i.test(face(sel)), true);
  check("ninguna opcion dice 'copy N'", /copy \d/.test(sel.textContent), false);
  check("la opcion dice que builds ya lleva",
     /already carries charizard-b, charizard-c/.test(sel.options[2].text), true);
  /* the Champions box first, then HOME - the order the box itself uses */
  check("y la de HOME, donde vive y su nota",
     /in HOME.*the one from GO/.test(sel.options[3].text), true);
  let card = installed().querySelectorAll(".row");
  check("debajo, UNA tarjeta: la de la copia elegida", card.length, 1);
  check("la tarjeta dice shiny", tagsOf(card[0]).indexOf("shiny") >= 0, true);
  check("y donde vive", tagsOf(card[0]).indexOf("Champions box") >= 0, true);
  check("y no es un boton: se elige arriba", card[0].tagName, "DIV");

  console.log("\n  el tag trained sigue a la build");
  choose(sel, "charizard-2");           /* moverla a la de HOME */
  card = installed().querySelectorAll(".row");
  check("cambiar de copia no redibuja: el mismo desplegable",
     d.contains(sel) && /^Charizard · in HOME/.test(face(sel)), true);
  check("la tarjeta pasa a ser la de HOME, con su nota",
     card.length === 1 && tagsOf(card[0]).indexOf("in HOME") >= 0 &&
     /the one from GO/.test(card[0].textContent), true);
  foot("Save").click();
  await tick(300);
  check("la copia nueva gana trained, la que deja lo pierde", boxWrites(),
     "charizard-2=true,charizard=false");

  console.log("\n  una idea, y dos copias iguales");
  w.buildSheet("heracross", w.S.builds.heracross);
  await tick(200);
  const hsel = installed().querySelector("select");
  check("sin instalar SI dice 'not installed', y sin tarjeta",
     /not installed/.test(face(hsel)) &&
     installed().querySelectorAll(".row").length === 0, true);
  check("dos copias identicas lo dicen, en vez de repetir la linea",
     [1, 2].every(i => / · one of 2 identical$/.test(hsel.options[i].text)), true);
  w.closeSheet();

  /* "no se puede sacar al ampharos!" - its only copy, and it comes off */
  console.log("\n  sacarla de su unica copia");
  w.__WROTE.length = 0;
  w.buildSheet("ampharos", w.S.builds.ampharos);
  await tick(200);
  const asel = installed().querySelector("select");
  check("cerrado dice Ampharos", /^Ampharos · Champions box/.test(face(asel)), true);
  choose(asel, "");
  check("elegir 'not installed' quita la tarjeta",
     installed().querySelectorAll(".row").length, 0);
  foot("Save").click();
  await tick(300);
  check("se guarda sin copia", buildWrites(), "ampharos=null");
  check("y la copia que deja pierde trained", boxWrites(), "ampharos=false");

  w.__WROTE.length = 0;
  w.buildSheet("charizard-b", w.S.builds["charizard-b"]);
  await tick(200);
  choose(installed().querySelector("select"), "");
  foot("Save").click();
  await tick(300);
  check("desinstalar con otra build aun encima no le quita el tag",
     boxWrites(), "");

  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
