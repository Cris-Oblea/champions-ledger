/* The move picker in a build: filters that stack (player, 2026-09-10).

   It sorted by BP x accuracy or A-Z and that was all, so "which special
   Electric move do I actually have" meant scrolling a list ordered by
   something else. Now the sort is one choice and the filters stack: every
   group ANDs with the others, and the chips inside a group OR together.

   Garchomp is the fixture because its pool covers all three categories, both
   spread kinds (Earthquake hits the ally, Rock Slide does not) and priority. */
const { describe } = require("node:test");
const { check, open, idle, row, build, click } = require("./harness.js");

const ROWS = [row("garchomp", "Garchomp", {trained:true})];
const BUILDS = [build("garchomp", "Garchomp", {ability:"Rough Skin",
  nature:"Jolly", stat_points:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32},
  moves:["Earthquake",null,null,null]})];

const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;
/* UN CHIP TIENE TRES ESTADOS y escribe un menos en su propia etiqueta
   cuando excluye, asi que buscarlo por texto exacto deja de encontrarlo
   en cuanto se usa. Se busca por el texto sin el signo. */
const chip = t => [...d.querySelectorAll(".sheet .tog")]
  .find(b => b.textContent.replace(/^−\s*/, "").trim() === t);
const state = t => {
  const b = chip(t);
  if (b.classList.contains("no")) return "no";
  return b.getAttribute("aria-pressed") === "true" ? "si" : "off";
};
/* off -> incluir -> excluir -> off, asi que "apagar" puede ser mas de
   un toque */
const off = t => { while (state(t) !== "off") click(chip(t)); };
const rows = () => [...d.querySelectorAll(".sheet .list .row")];
const names = () => rows().map(r => r.querySelector(".rname").textContent
  .replace(/priority \+\d| ?spread| ?hits ally|Rough Skin/g, "").trim());
const meta = () => rows().map(r => r.querySelector(".rmeta .mono").textContent);
const countLine = () => [...d.querySelectorAll(".sheet .sub")]
  .map(x => x.textContent).find(t => / moves$| of \d+ moves/.test(t)) || "";

(async () => {
  await idle();
  w.go("builds");
  click(d.querySelectorAll("#listBuilds .row")[0]);
  await idle();
  const slot = [...d.querySelectorAll(".slot")].find(s => /Earthquake/.test(s.textContent));
  click(slot);
  await idle();
  const all = rows().length;               // the movepool, unfiltered

  describe("los controles estan", () => {
    ["BP × acc", "A–Z", "PP", "Type"].forEach(function(t){
      check("orden: " + t, !!chip(t), true);
    });
    ["Physical", "Special", "Status", "Spread", "Hits ally", "Priority"]
      .forEach(function(t){ check("filtro: " + t, !!chip(t), true); });
    check("hay chips de tipo (Ground)", !!chip("Ground"), true);
    check("empieza sin filtrar", /^\d+ moves$/.test(countLine().split(" ·")[0]), true);
  });

  describe("un filtro", () => {
    click(chip("Physical"));
    check("solo fisicos", meta().every(t => /^Physical/.test(t)), true);
    check("y son menos que todos", rows().length < all, true);
  });

  describe("dos filtros a la vez (se acumulan)", () => {
    click(chip("Ground"));
    check("solo Ground fisicos", meta().every(t => /^Physical/.test(t)), true);
    check("todas son Ground",
       rows().every(r => /Ground/.test(r.querySelector(".t").textContent)), true);
    check("el contador dice N de M", / of \d+ moves/.test(countLine()), true);
  });

  describe("el orden se combina con los filtros", () => {
    const twoFilters = rows().length;
    click(chip("A–Z"));
    const az = names();
    check("sigue filtrado", rows().length, twoFilters);
    check("y ahora en A-Z",
       az.join("|") === az.slice().sort((a,b)=>a.localeCompare(b)).join("|"), true);
  });

  describe("quitar un chip lo devuelve", () => {
    off("Ground"); off("Physical");
    check("vuelven todos", rows().length, all);
  });

  describe("los otros filtros", () => {
    click(chip("Priority"));
    check("todas con prioridad",
       rows().every(r => /priority \+/.test(r.querySelector(".rname").textContent)), true);
    off("Priority");
    click(chip("Hits ally"));
    check("todas golpean al aliado",
       rows().length > 0 &&
       rows().every(r => /hits ally/.test(r.querySelector(".rname").textContent)), true);
    off("Hits ally");
    click(chip("Status"));
    check("solo status", meta().every(t => /^Status/.test(t)), true);
  });

  /* Two chips in "Must have" mean BOTH, not either - the player caught
     this returning the union. A move cannot be spread and priority at
     once in Champions, and 0 results is the honest answer to that. */
  describe("dos rasgos a la vez piden LOS DOS", () => {
    off("Status");
    off("Status"); click(chip("Spread")); click(chip("Hits ally"));
    const bothTraits = rows();
    check("spread + hits ally: cumplen ambos",
       bothTraits.length > 0 && bothTraits.every(r => {
         const t = r.querySelector(".rname").textContent;
         return /spread/.test(t) && /hits ally/.test(t); }), true);
    off("Hits ally"); click(chip("Priority"));
    check("spread + priority: no existe ninguno", rows().length, 0);
    check("y el contador lo dice", /^0 of \d+ moves/.test(countLine()), true);
    off("Spread"); off("Priority");
    check("al quitarlos vuelven todos", rows().length, all);
  });

  /* "en el filtro de tipo esta el operador logico and y or, pero falta
     algo que diga no" (2026-09-19). Un toque incluye, el siguiente
     excluye, el tercero lo apaga. */
  describe("el tercer estado de un chip: excluir", () => {
    off("Spread"); off("Priority"); off("Status");
    click(chip("Water"));
    check("un toque incluye", state("Water"), "si");
    click(chip("Water"));
    check("dos toques excluyen", state("Water"), "no");
    check("y lo dice con un menos", chip("Water").textContent.charAt(0), "−");
    check("no queda ningun Water", meta().some(t => /Water/.test(t)), false);
    check("pero si quedan moves", rows().length > 0, true);
    click(chip("Water"));
    check("el tercer toque lo apaga", state("Water"), "off");
    check("y vuelven todos", rows().length, all);
  });

  /* "un move solo puede tener 1 de las 3 categorias... seleccionar una
     desactiva la otra" */
  describe("la categoria se elige de una en una", () => {
    click(chip("Physical"));
    click(chip("Special"));
    check("elegir Special suelta Physical", state("Physical"), "off");
    check("y Special queda puesta", state("Special"), "si");
    check("solo salen specials", meta().every(t => /^Special/.test(t)), true);
    /* excluir SI se puede acumular: es como se pide "ni status ni fisico" */
    off("Special");
    click(chip("Status")); click(chip("Status"));
    click(chip("Physical")); click(chip("Physical"));
    check("dos exclusiones conviven",
       state("Status") + "/" + state("Physical"), "no/no");
    check("y solo quedan specials", meta().every(t => /^Special/.test(t)), true);
    off("Status"); off("Physical");
    check("al soltarlas vuelven todos", rows().length, all);
  });


  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
