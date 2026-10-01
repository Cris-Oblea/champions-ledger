/* The SP slider could not be dragged. oninput called redraw(), which rebuilds
   the whole sheet, so the element under the finger was replaced on the first
   step and the drag ended there - a click still worked because a click is one
   discrete event. This test drives a drag as a browser does: several `input`
   events on the SAME node, checking it survives every one of them. It also
   covers the two new ways in, the arrows and the typed box. */
const { check, open, idle } = require("./harness.js");
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
const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;
const fire = (n,t)=>n.dispatchEvent(new w.Event(t,{bubbles:true}));
const click = n=>n.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
(async () => {
  await idle();
  w.go("builds");
  click(d.querySelectorAll("#listBuilds .row")[0]);
  await idle();
  const rows = [...d.querySelectorAll(".sp.spedit")];
  check("una fila de SP por stat", rows.length, 6);
  const spa = rows[3];                       // hp atk def spa spd spe
  const range = spa.querySelector("input[type=range]");
  const num   = spa.querySelector(".spnum");
  const steps = spa.querySelectorAll(".step");
  const dec = steps[0], inc = steps[1];
  const budget = () => d.querySelector(".budget").firstChild.textContent;

  check("valor inicial de SpA", num.value, "32");
  check("presupuesto inicial", budget(), "66 of 66 spent");

  /* THE REGRESSION: a drag is many input events on one node. If the node is
     detached after the first, the drag is dead - which is what shipped. */
  let detached = 0;
  for (const v of [30, 28, 26, 24, 22]) {
    range.value = String(v);
    fire(range, "input");
    if (!d.contains(range)) detached++;
  }
  check("el slider sobrevive al arrastre", detached, 0);
  check("valor tras arrastrar a 22", num.value, "22");
  check("presupuesto se actualizo", budget(), "56 of 66 spent");
  check("el motor de dibujo no reconstruyo", d.querySelectorAll(".sp.spedit").length, 6);

  click(inc); click(inc);
  check("dos flechas + suben 2", num.value, "24");
  click(dec);
  check("una flecha - baja 1", num.value, "23");
  check("el slider siguio al boton", range.value, "23");

  num.value = "1x2";           // letters typed into the box
  fire(num, "input");
  check("las letras se filtran", num.value, "12");
  check("el slider siguio al texto", range.value, "12");

  num.value = "4x0";           // filtered to 40, which is over the cap
  fire(num, "input");
  check("40 se recorta a 32 en pantalla", num.value, "32");
  check("el slider siguio al recorte", range.value, "32");

  num.value = "0"; fire(num, "input");
  check("bajar a 0 desactiva la flecha -", dec.disabled, "true");
  num.value = "32"; fire(num, "input");
  check("subir a 32 desactiva la flecha +", inc.disabled, "true");
  click(inc);
  check("el tope de 32 aguanta", num.value, "32");
  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
