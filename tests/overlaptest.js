/* NOTHING PAINTED ON TOP OF ANYTHING ELSE.
 *
 * The search icon sat on the text you were typing, in all eight search boxes,
 * for as long as those boxes had existed - and the only thing that ever found
 * it was the player looking at his phone (2026-09-16). He asked for the check
 * rather than for the one bug: "si es algo bueno entonces sería bueno
 * terminarlo... tal vez se nos ocurran más cosas y queden solapamientos."
 *
 * TWO HALVES, BECAUSE NEITHER IS ENOUGH ON ITS OWN.
 *
 *   The ALGORITHM is tested here. jsdom lays nothing out - every rectangle it
 *   reports is zero - so a test that swept the real app under jsdom would find
 *   nothing and pass while the screen was wrong, which is worse than no test.
 *   Instead the sweep is fed rectangles this file controls, and asked to find
 *   a planted collision, to ignore the cases that only look like one, and to
 *   stay linear.
 *
 *   The LAYOUT is checked on the device, by the button this adds to the
 *   diagnostics panel: "Check every screen for overlaps". That is the half
 *   that knows what a real browser did, and it is one tap on the phone where
 *   the bug was found.
 */
const { check, open } = require("./harness.js");

/* No ledger: this exercises one pure function. */
const { dom, errs } = open();
const w = dom.window, d = w.document;

/* A fake view whose boxes report exactly the rectangles we say they do. */
function view(boxes){
  const v = d.createElement("div");
  boxes.forEach(b => {
    const host = b.parent || v;
    const e = d.createElement(b.tag || "span");
    e.className = b.cls || "";
    /* jsdom resolves this app's border shorthand to 16px, which would make a
       field's content box collapse - so the fixture states the box it means
       rather than leaning on jsdom's CSS. */
    if (b.style) e.setAttribute("style", b.style);
    /* a fixture that cannot express "out of the flow" cannot test the rule
       that treats it differently */
    if (b.fixed) e.style.position = "fixed";
    e.textContent = b.text === undefined ? "x" : b.text;
    e.getBoundingClientRect = () => ({
      left:b.l, top:b.t, right:b.l + b.w, bottom:b.t + b.h,
      width:b.w, height:b.h
    });
    host.appendChild(e);
    b.el = e;
  });
  v.getBoundingClientRect = () => ({left:0,top:0,right:1000,bottom:1000,
                                    width:1000,height:1000});
  return v;
}

setTimeout(() => {
  const sweep = w.overlapSweep;
  console.log("\n  el barrido de solapamientos");
  check("la app lo expone", typeof sweep, "function");

  /* THE BUG IT WAS WRITTEN FOR: an icon drawn on top of the text beside it. */
  let r = sweep(view([
    {tag:"svg", cls:"icon", l:9, t:10, w:16, h:16, text:""},
    {cls:"text", l:2,  t:8,  w:300, h:20, text:"Search 345 forms"}
  ]));
  check("encuentra el icono sobre el texto", r.hits.length, 1);
  check("y nombra a los dos", /icon/.test(r.hits[0]) && /text/.test(r.hits[0]), true);
  /* An icon paints without carrying a word, so svg AND img have to count -
     otherwise the very bug this was written for slips through. */
  r = sweep(view([
    {tag:"img", cls:"pic", l:9, t:10, w:16, h:16, text:""},
    {cls:"text", l:2, t:8, w:300, h:20, text:"Miracle Seed"}
  ]));
  check("y un <img> encima cuenta igual", r.hits.length, 1);

  /* A FIELD PAINTS ITS VALUE, and `value` is not `textContent` - so without
     a rule for it an <input> is never a box, and the sweep reports "nothing
     overlaps" with the icon sitting squarely on the text. Found by planting
     the original bug back into the running app and watching the tool miss
     it, which is the only way that kind of hole ever shows. */
  r = sweep(view([
    {tag:"svg", cls:"icon", l:9, t:10, w:16, h:16, text:""},
    {tag:"input", cls:"campo", l:2, t:8, w:300, h:24, text:"",
     style:"padding:9px 11px;border-width:1px"}
  ]));
  check("un icono sobre un <input> tambien cuenta", r.hits.length, 1);

  /* FIXED: the text now starts past the icon. */
  r = sweep(view([
    {cls:"icon", l:9,  t:10, w:16, h:16, text:""},
    {cls:"text", l:34, t:8,  w:300, h:20, text:"Search 345 forms"}
  ]));
  check("y no se queja cuando ya hay hueco", r.hits.length, 0);

  /* NOT a collision: boxes that merely touch. Layout kisses all the time and
     a check that shouts about it is a check that gets turned off. */
  r = sweep(view([
    {cls:"a", l:0,  t:0, w:100, h:20},
    {cls:"b", l:99, t:0, w:100, h:20}
  ]));
  check("ignora un roce de un pixel", r.hits.length, 0);

  /* NOT a collision: one inside the other. Every nested box overlaps its
     parent by definition, which is what makes the naive version useless. */
  const outer = d.createElement("div");
  outer.getBoundingClientRect = () => ({left:0,top:0,right:200,bottom:40,
                                        width:200,height:40});
  r = sweep(view([
    {cls:"child", parent:outer, l:10, t:10, w:50, h:20}
  ]));
  check("ignora lo anidado", r.hits.length, 0);

  /* Stacked rows, the normal case: 200 boxes, none overlapping. This is also
     what proves the sweep is not quadratic - the naive loop froze a real
     renderer on this shape. */
  const rows = [];
  for (let i = 0; i < 200; i++) rows.push({cls:"r", l:0, t:i*30, w:300, h:20});
  const t0 = Date.now();
  r = sweep(view(rows));
  const ms = Date.now() - t0;
  check("200 filas apiladas: sin solapes", r.hits.length, 0);
  check("y las cuenta todas", r.boxes, 200);
  check("en tiempo lineal (<150ms)", ms < 150, true);

  /* One bad row hidden among good ones still gets found. */
  const many = rows.slice(0, 60);
  many.push({cls:"intruso", l:20, t:31, w:120, h:16});
  r = sweep(view(many));
  check("encuentra uno malo entre 60 buenos", r.hits.length, 1);
  check("y dice cual", /intruso|\.r/.test(r.hits[0]), true);

  /* A FLOATING LAYER IS NOT A FAULT - BUT IT IS NOT HIDDEN EITHER.

     The "+" button floats over the list below 900px on purpose, and the page
     scrolls out from under it. Counting that as a fault put a permanent
     "1 overlap" on HOME and Builds the first time this was run on a signed-in
     page with real rows (2026-09-16), and a check that cries wolf is a check
     that gets turned off.

     The danger in fixing it is going blind, which this tool has already done
     once. So the case is pinned from both ends: it must NOT be a hit, and it
     MUST still be reported. */
  r = sweep(view([
    {cls:"fila", l:0, t:0, w:300, h:60, text:"115"},
    {cls:"fab", l:200, t:20, w:110, h:44, text:"+ New build", fixed:true}
  ]));
  check("el boton flotante no cuenta como fallo", r.hits.length, 0);
  check("pero SI se reporta aparte", r.floating.length, 1);
  check("y nombra a los dos",
     /fab/.test(r.floating[0]) && /fila/.test(r.floating[0]), true);

  /* Two floating layers fighting over one corner is nobody's design. */
  r = sweep(view([
    {cls:"toast", l:200, t:20, w:110, h:44, text:"saved", fixed:true},
    {cls:"fab", l:210, t:24, w:110, h:44, text:"+ New", fixed:true}
  ]));
  check("dos capas flotantes encimadas SI es fallo", r.hits.length, 1);

  /* And the one it was written for must survive the new rule: neither of
     those is out of the flow, so it stays a hit. */
  r = sweep(view([
    {tag:"svg", cls:"icon", l:9, t:10, w:16, h:16, text:""},
    {cls:"text", l:2,  t:8,  w:300, h:20, text:"Search 345 forms"}
  ]));
  check("y el bug original sigue siendo fallo", r.hits.length, 1);

  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
}, 900);
