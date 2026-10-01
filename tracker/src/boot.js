/* Starts the app: wires the controls, draws the first screen, connects the
   store. renderAll() is the one redraw every change ends in. */
/* FIRST, so a script error anywhere after this line is caught and shown. */
import "./core/errors.js";
import { $, el, setPressed, showPane, wireClears } from "./core/dom.js";
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

/* ======================================================================= go */
/* THE EXPLANATION STOPS STANDING IN FRONT OF THE ANSWER.

   Measured at 758px: Builds spent 220px and 58 words before the first build,
   HOME 199px, and Find 350px and 75 words before the first result - about a
   quarter of the first screen, every time, on paragraphs that state rules the
   player knows by heart (66 Stat Points, 32 max, the Item Clause).

   NOTHING IS DELETED, AND NOTHING IS HIDDEN BEHIND A GUESS. The first sentence
   stays - it is the one that says what the screen IS - and the rest goes
   behind a button that says how many words are in it. That is a disclosure,
   not a cut: the text is one tap away, it is still in the page for anyone
   reading the source, and a reader who has never seen the app can open it.

   Done here rather than in the markup so it applies to every intro the app
   ever grows, and so the markup keeps reading as prose. */
function foldIntros(){
  var LONG = 16;                       /* words before it is worth folding */
  Array.prototype.forEach.call(document.querySelectorAll(".view .lede, .view > .sub"),
    function(p){
      if (p.dataset.folded) return;
      /* COLLAPSE THE WHITESPACE FIRST. The markup indents these paragraphs
         across several lines, and `.` does not cross a newline - so the lazy
         match could never reach the end of a first sentence that wrapped, and
         the longest intro in the app folded not at all. */
      var text = (p.textContent || "").replace(/\s+/g, " ").trim();
      if (text.split(/\s+/).length <= LONG) return;
      /* THE FIRST SENTENCE, and only on a real boundary. "0 VP." and "2500
         VP." are not sentence ends, so a full stop counts only when what
         follows starts a new one - a capital, a quote, OR A DIGIT. The digit
         was missing and it cost the tab that needed this most: Builds opens
         "...and it waits. 66 Stat Points, 32 max in one stat.", so nothing
         matched and the longest intro in the app folded not at all. */
      var m = text.match(/^(.+?[.!?])\s+(?=[A-Z0-9"“])([\s\S]+)$/);
      if (!m) return;
      var rest = m[2].trim();
      if (rest.split(/\s+/).length < 6) return;
      p.dataset.folded = "1";
      p.textContent = m[1] + " ";
      var more = el("span", "more");
      more.textContent = rest;
      more.hidden = true;
      var btn = el("button", "whybtn");
      btn.type = "button";
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "why (" + rest.split(/\s+/).length + " words)";
      btn.onclick = function(){
        var open = more.hidden;
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
document.querySelectorAll("[data-add]").forEach(function(b){
  b.onclick = function(){ addSheet(b.dataset.add); };
});
Array.prototype.forEach.call($("calcMode").children, function(b){
  b.onclick = function(){
    CALC.gameType = b.dataset.mode;
    Array.prototype.forEach.call($("calcMode").children, function(x){
      setPressed(x, x === b);
    });
    calcDraw();
  };
});
/* The same segmented control sits on more than one screen (the sort on both
   boxes, the HOME panes in two places), so every copy is marked at once: the
   button whose data-<key> is the chosen value is pressed in each. */
function markSeg(sel, key, value){
  document.querySelectorAll(sel).forEach(function(g){
    Array.prototype.forEach.call(g.children, function(x){
      setPressed(x, x.dataset[key] === value);
    });
  });
}
/* one order for every box list, so HOME and the Champions Box can be read
   against the phone's own screen without re-sorting in your head */
document.querySelectorAll(".sortseg").forEach(function(seg){
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
  var savedSort = localStorage.getItem("champ-sort");
  if (savedSort === "order") savedSort = "dex";   // the option that went away
  if (savedSort) {
    VIEW.sort = savedSort;
    markSeg(".sortseg", "sort", VIEW.sort);
  }
} catch (e) {
  /* Storage throws in private browsing; the default sort stands. */
}
$("buildAdd").onclick = function(){ buildSheet(null, {}); };
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
/* THREE PANES IN HOME, one switcher. The box, the GTS and the dex checklist
   are asked at different times and were one scroll, so the checklist would
   have opened under a 170-row box. The chosen pane is remembered, because
   the answer to "what was I doing in here" is almost always the same one
   (player, 2026-09-20: "podria ser algun submenu"). */
var HOME_PANES = {box:"homePaneBox", gts:"homePaneGts", dex:"homePaneDex"};
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
document.querySelectorAll(".homeseg").forEach(function(seg){
  Array.prototype.forEach.call(seg.children, function(b){
    b.onclick = function(){ homePane(b.dataset.home); };
  });
});
$("dexFilter").oninput = drawDexPane;
try { homePane(localStorage.getItem("champ-homepane") || "box"); }
catch (e) { homePane("box"); }
/* three panes, one switcher - written once so a fourth cannot forget one */
function gearPane(which){
  showPane({stones:["gearStonePane", "gearStones"],
            items:["gearItemPane", "gearItems"]}, which);
}
$("gearStones").onclick = function(){ gearPane("stones"); };
$("gearItems").onclick  = function(){ gearPane("items"); };
$("bldPaneBuilds").onclick = function(){ buildsPane("builds"); };
$("bldPaneTeams").onclick  = function(){ buildsPane("teams"); };
$("railBtn").onclick = function(){
  var sh = document.querySelector(".shell");
  sh.classList.toggle("narrow");
  try { localStorage.setItem("champ-rail", sh.classList.contains("narrow") ? "1" : ""); } catch (e) {}
};
try { if (localStorage.getItem("champ-rail")) document.querySelector(".shell").classList.add("narrow"); } catch (e) {}
$("themeBtn").onclick = function(){
  var r = document.documentElement;
  var now = r.dataset.theme;
  if (!now) {
    now = mq("(prefers-color-scheme: dark)") ? "dark" : "light";
  }
  r.dataset.theme = now === "dark" ? "light" : "dark";
  try { localStorage.setItem("champ-theme", r.dataset.theme); } catch (e) {}
};
try {
  var saved = localStorage.getItem("champ-theme");
  if (saved) document.documentElement.dataset.theme = saved;
} catch (e) {
  /* Storage throws in private browsing; the system theme stands. */
}

renderAll();
foldIntros();
connect();
