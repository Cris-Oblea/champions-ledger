/* Starts the app: wires the controls, draws the first screen, connects the
   store. renderAll() is the one redraw every change ends in. */
/* FIRST, so a script error anywhere after this line is caught and shown. */
import "./core/errors.js";
import { $, $$, el, pressOnly, setPressed, showPane, wireClears } from "./core/dom.js";
import { VIEW } from "./core/state.js";
import { whenChanged } from "./core/store.js";
import {
  buildsPane, buildTabs, go, leaveEditor, mq, onShow,
} from "./ui/nav.js";
import { connect } from "./ui/signin.js";
import { addSheet, drawBoxes, drawDexPane, drawDupeHome } from "./tabs/box.js";
import { buildSheet, drawBuilds } from "./tabs/builds.js";
import { CALC, calcDraw } from "./tabs/damage.js";
import { findDraw, findInit } from "./tabs/find.js";
import { drawItems, drawStones, wireStatusFold } from "./tabs/gear.js";
import { drawGts } from "./tabs/gts.js";
import { checkLatest, drawDiag, drawTrainer } from "./tabs/settings.js";
import { drawTeams } from "./tabs/teams.js";
import { drawGtsWanted } from "./tabs/trading.js";

/* ==================================================================== render
   THE ONE REDRAW. Every snapshot from the store ends here (whenChanged, below),
   and so does every control that changes what a list shows. Each screen draws
   itself from S; this only says which. */
function renderAll(){
  drawBoxes();
  drawDupeHome();
  drawBuilds();
  drawStones();
  wireStatusFold();
  drawItems();
  drawTrainer();
  drawGts();
  drawTeams();
  drawDiag();
  checkLatest();
}

/* =========================================================== the intros ===
   THE EXPLANATION STOPS STANDING IN FRONT OF THE ANSWER. A screen's intro
   paragraph keeps its first sentence - the one that says what the screen IS -
   and the rest folds behind a "why (N words)" button. Nothing is deleted:
   the text is one tap away and still in the page.

   Done here rather than in the markup so it applies to every intro the app
   ever grows, and so the markup keeps reading as prose. */
function foldIntros(){
  const LONG = 16;                       /* words before it is worth folding */
  $$(".view .lede, .view > .sub").forEach(
    function(p){
      if (p.dataset.folded) return;
      /* COLLAPSE THE WHITESPACE FIRST: the markup indents these paragraphs
         across several lines, and `.` does not cross a newline, so a first
         sentence that wrapped would never match. */
      const text = (p.textContent || "").replace(/\s+/g, " ").trim();
      if (text.split(/\s+/).length <= LONG) return;
      /* THE FIRST SENTENCE, and only on a real boundary: a full stop counts
         only when what follows starts a new sentence - a capital, a quote,
         or a digit ("...and it waits. 66 Stat Points..."). */
      const m = text.match(/^(.+?[.!?])\s+(?=[A-Z0-9"“])([\s\S]+)$/);
      if (!m) return;
      const rest = m[2].trim();
      if (rest.split(/\s+/).length < 6) return;
      p.dataset.folded = "1";
      p.textContent = m[1] + " ";
      const more = el("span", "more");
      more.textContent = rest;
      more.hidden = true;
      const btn = el("button", "whybtn");
      btn.type = "button";
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "why (" + rest.split(/\s+/).length + " words)";
      btn.onclick = function(){
        const open = more.hidden;
        more.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.textContent = open ? "less" : "why (" +
          rest.split(/\s+/).length + " words)";
      };
      p.appendChild(btn);
      p.appendChild(more);
    });
}
onShow("calc", calcDraw);
onShow("find", findDraw);
whenChanged(renderAll);
buildTabs();
findInit();
go("box");
$$("[data-add]").forEach(function(b){
  b.onclick = function(){ addSheet(/** @type {BoxLocation} */ (b.dataset.add)); };
});
Array.prototype.forEach.call($("calcMode").children, function(b){
  b.onclick = function(){
    CALC.gameType = b.dataset.mode;
    pressOnly($("calcMode"), b);
    calcDraw();
  };
});
/* The same segmented control sits on more than one screen (the sort on both
   boxes, the HOME panes in two places), so every copy is marked at once: the
   button whose data-<key> is the chosen value is pressed in each. */
function markSeg(sel, key, value){
  $$(sel).forEach(function(g){
    Array.prototype.forEach.call(g.children, function(x){
      setPressed(x, x.dataset[key] === value);
    });
  });
}
/* one order for every box list, so HOME and the Champions Box can be read
   against the phone's own screen without re-sorting in your head */
$$(".sortseg").forEach(function(seg){
  Array.prototype.forEach.call(seg.children, function(b){
    b.onclick = function(){
      VIEW.sort = b.dataset.sort;
      markSeg(".sortseg", "sort", VIEW.sort);
      try { localStorage.setItem("champ-sort", VIEW.sort); } catch (e) {}
      renderAll();
    };
  });
});
try {
  let savedSort = localStorage.getItem("champ-sort");
  if (savedSort === "order") savedSort = "dex";   // the option that went away
  if (savedSort) {
    VIEW.sort = savedSort;
    markSeg(".sortseg", "sort", VIEW.sort);
  }
} catch (e) {
  /* Storage throws in private browsing; the default sort stands. */
}
$("buildAdd").onclick = function(){ buildSheet(null, null); };
$("buildEditBack").onclick = function(){ leaveEditor(); };
$("teamEditBack").onclick  = function(){ leaveEditor("teams"); };
$("buildSearch").oninput = drawBuilds;
$("teamSearch").oninput = drawTeams;
$("stoneSearch").oninput = drawStones;
$("itemSearch").oninput = drawItems;
$("homeFilter").oninput = function(){ VIEW.homeAll = false; renderAll(); };
/* The whole of renderAll, like homeFilter above it: the three box sections
   are filled from there and the field itself lives outside every container
   that gets rebuilt, so nothing steals focus mid-keystroke. */
$("boxFilter").oninput = renderAll;
$("gtsWantSearch").oninput = drawGtsWanted;
$("gtsHistSearch").oninput = drawGts;
/* EVERY search box in the markup gets the clear button the ones built in JS
   already have. Last, so it runs over a DOM that is fully wired - addClear
   WRAPS the handler it finds rather than replacing it, and the handlers are
   assigned directly above. */
wireClears();
/* THREE PANES IN HOME, one switcher: the box, the GTS and the dex checklist
   are asked at different times, and one scroll would bury the checklist
   under the whole box. The chosen pane is remembered, since the answer to
   "what was I doing in here" is almost always the same one. The panes that
   draw something expensive draw it only when shown. */
const HOME_PANES = {box:"homePaneBox", gts:"homePaneGts", dex:"homePaneDex"};
/* Show one of HOME's three panes (box, GTS, dex) and remember it for the next
   visit. The dex and the trade suggestions are drawn only when their pane
   opens - both are slow and most visits never look. */
function homePane(which){
  if (!HOME_PANES[which]) which = "box";
  Object.keys(HOME_PANES).forEach(function(k){
    $(HOME_PANES[k]).hidden = k !== which;
  });
  markSeg(".homeseg", "home", which);
  try { localStorage.setItem("champ-homepane", which); } catch (e) {}
  if (which === "dex") drawDexPane();
  if (which === "gts") drawGtsWanted();
}
$$(".homeseg").forEach(function(seg){
  Array.prototype.forEach.call(seg.children, function(b){
    b.onclick = function(){ homePane(b.dataset.home); };
  });
});
$("dexFilter").oninput = drawDexPane;
try { homePane(localStorage.getItem("champ-homepane") || "box"); }
catch (e) { homePane("box"); }
/* the Items tab's two panes: Mega Stones and held items */
function gearPane(which){
  showPane({stones:["gearStonePane", "gearStones"],
            items:["gearItemPane", "gearItems"]}, which);
}
$("gearStones").onclick = function(){ gearPane("stones"); };
$("gearItems").onclick  = function(){ gearPane("items"); };
$("bldPaneBuilds").onclick = function(){ buildsPane("builds"); };
$("bldPaneTeams").onclick  = function(){ buildsPane("teams"); };
$("railBtn").onclick = function(){
  const sh = document.querySelector(".shell");
  sh.classList.toggle("narrow");
  try { localStorage.setItem("champ-rail", sh.classList.contains("narrow") ? "1" : ""); } catch (e) {}
};
try { if (localStorage.getItem("champ-rail")) document.querySelector(".shell").classList.add("narrow"); } catch (e) {}
$("themeBtn").onclick = function(){
  const r = document.documentElement;
  let now = r.dataset.theme;
  if (!now) {
    now = mq("(prefers-color-scheme: dark)") ? "dark" : "light";
  }
  r.dataset.theme = now === "dark" ? "light" : "dark";
  try { localStorage.setItem("champ-theme", r.dataset.theme); } catch (e) {}
};
try {
  const saved = localStorage.getItem("champ-theme");
  if (saved) document.documentElement.dataset.theme = saved;
} catch (e) {
  /* Storage throws in private browsing; the system theme stands. */
}

renderAll();
foldIntros();
connect();
