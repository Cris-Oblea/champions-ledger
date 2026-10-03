/* The SP slider must survive a drag. A redraw() from oninput rebuilds the
   whole sheet, which replaces the element under the finger on the first step
   and ends the drag there - while a click still works, being one discrete
   event. This test drives a drag as a browser does: several `input` events on
   the SAME node, checking it survives every one of them. It also covers the
   other two ways in, the arrows and the typed box. */
const { check, open, idle, row, build, click } = require("./harness.js");
const ROWS = [row("primarina", "Primarina", {origin:"home"})];
const BUILDS = [build("primarina", "Primarina", {ability:"Torrent",
  nature:"Modest", stat_points:{hp:4,atk:0,def:0,spa:32,spd:8,spe:22},
  moves:["Hyper Voice"]})];
const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;
const fire = (n,t)=>n.dispatchEvent(new w.Event(t,{bubbles:true}));
(async () => {
  await idle();
  w.go("builds");
  click(d.querySelectorAll("#listBuilds .row")[0]);
  await idle();
  const rows = [...d.querySelectorAll(".sp.spedit")];
  check("one SP row per stat", rows.length, 6);
  const spa = rows[3];                       // hp atk def spa spd spe
  const range = spa.querySelector("input[type=range]");
  const num   = spa.querySelector(".spnum");
  const steps = spa.querySelectorAll(".step");
  const dec = steps[0], inc = steps[1];
  const budget = () => d.querySelector(".budget").firstChild.textContent;

  check("SpA's starting value", num.value, "32");
  check("the starting budget", budget(), "66 of 66 spent");

  /* THE REGRESSION: a drag is many input events on one node. If the node is
     detached after the first, the drag is dead. */
  let detached = 0;
  for (const v of [30, 28, 26, 24, 22]) {
    range.value = String(v);
    fire(range, "input");
    if (!d.contains(range)) detached++;
  }
  check("the slider survives the drag", detached, 0);
  check("value after dragging to 22", num.value, "22");
  check("the budget updated", budget(), "56 of 66 spent");
  check("nothing was rebuilt", d.querySelectorAll(".sp.spedit").length, 6);

  click(inc); click(inc);
  check("two + arrows add 2", num.value, "24");
  click(dec);
  check("one - arrow takes 1", num.value, "23");
  check("the slider followed the button", range.value, "23");

  num.value = "1x2";           // letters typed into the box
  fire(num, "input");
  check("letters are filtered out", num.value, "12");
  check("the slider followed the text", range.value, "12");

  num.value = "4x0";           // filtered to 40, which is over the cap
  fire(num, "input");
  check("40 is clipped to 32 on screen", num.value, "32");
  check("the slider followed the clip", range.value, "32");

  num.value = "0"; fire(num, "input");
  check("going down to 0 disables the - arrow", dec.disabled, "true");
  num.value = "32"; fire(num, "input");
  check("going up to 32 disables the + arrow", inc.disabled, "true");
  click(inc);
  check("the 32 cap holds", num.value, "32");
  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
