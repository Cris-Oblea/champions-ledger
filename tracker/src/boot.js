/* Starts the app: wires the controls, draws the first screen, connects the
   store. renderAll() is the one redraw every change ends in. */
/* FIRST, so a script error anywhere after this line is caught and shown. */
import "./core/errors.js";
import { byName } from "./core/data.js";
import { $, el, fbtn, note, wireClears } from "./core/dom.js";
import {
  boxRows, capacity, originRows, RELEASE_FLOOR, releaseBlock, rowMatches,
  sortRows, VIEW,
} from "./core/state.js";
import { whenChanged } from "./core/store.js";
import {
  buildsPane, buildTabs, go, leaveEditor, mq, onShow,
} from "./ui/nav.js";
import { connect } from "./ui/signin.js";
import { addSheet, drawDexPane, drawDupeHome, fill } from "./tabs/box.js";
import { buildSheet, drawBuilds } from "./tabs/builds.js";
import { CALC, calcDraw } from "./tabs/damage.js";
import { findDraw, findInit } from "./tabs/find.js";
import { drawItems, drawStatuses, drawStones } from "./tabs/gear.js";
import { drawGts } from "./tabs/gts.js";
import { checkLatest, drawDiag, drawTrainer } from "./tabs/settings.js";
import { drawTeams } from "./tabs/teams.js";
import { drawGtsWanted } from "./tabs/trading.js";

/* ==================================================================== render */
function renderAll(){
  var perm = boxRows("champions", "permanent");
  var rent = boxRows("champions", "rental");
  var home = boxRows("home");
  var oHome = originRows("home"), oChamp = originRows("champions"),
      oUnk = originRows("unknown");
  /* Origin is settled at registration now - every route in decides it, so
     there is no "not recorded" section any more. But an old row could still
     carry one, and a row with nowhere to appear is a row you have silently
     lost, so it gets called out instead. */
  var cap = capacity(), used = perm.length + rent.length;

  var bc = $("boxCount");
  bc.textContent = "box " + used + "/" + cap;
  bc.className = "counter";
  if (used >= cap) bc.className += " full";
  else if (used >= cap - 3) bc.className += " tight";

  /* ONE FILTER, THREE SECTIONS. Which origin a Pokemon has is not part of
     "where is my Chesnaught", so the box's filter runs across all three and
     each heading says how much of itself is showing. */
  var bq = ($("boxFilter")?.value || "").trim().toLowerCase();
  function boxFill(node, rows, empty){
    var hits = rows.filter(function(r){ return rowMatches(r, bq); });
    fill(node, hits, bq ? "Nothing here matches that" : empty);
    return hits.length;
  }
  var nHO = boxFill($("listHomeOrigin"), sortRows(oHome),
                    "Nothing routed in from HOME yet");
  var nCO = boxFill($("listChampOrigin"), sortRows(oChamp.concat(oUnk)),
                    "Nothing marked as Encounter-bought");
  var nRe = boxFill($("listRent"), sortRows(rent), "No rentals");
  var hq = ($("homeFilter")?.value || "").trim().toLowerCase();
  var homeShown = sortRows(home).filter(function(r){ return rowMatches(r, hq); });
  /* NOT `cap` - that is the box capacity, ten lines up, and reusing the name
     here made the full-box check read 48 >= 12. `var` is function-scoped, so
     the second declaration simply overwrote the first. */
  var homeCap = VIEW.homeAll ? homeShown.length : 12;
  fill($("listHome"), homeShown.slice(0, homeCap),
       hq ? "Nothing in HOME matches that" : "HOME is empty");
  var more = $("homeMore");
  more.innerHTML = "";
  if (homeShown.length > homeCap) {
    more.appendChild(fbtn("Show the other " + (homeShown.length - homeCap), "sm",
      function(){ VIEW.homeAll = true; renderAll(); }));
  } else if (VIEW.homeAll && homeShown.length > 12) {
    more.appendChild(fbtn("Show fewer", "sm",
      function(){ VIEW.homeAll = false; renderAll(); }));
  }
  /* the checklist is derived from the box and HOME, so it goes stale the
     moment either does - but only the visible pane is worth the work */
  if (!$("homePaneDex").hidden) drawDexPane();
  /* the recommendations are derived from the box and from HOME, so they go
     stale the moment either does - and from the open offers, since a chip
     already sitting in a GTS slot is not a chip */
  if (!$("homePaneGts").hidden) drawGtsWanted();
  /* "3 of 18" while a filter is on, because a bare 3 under a heading reads
     as the section having shrunk rather than as the filter working. */
  function nOf(id, shown, total){
    $(id).textContent = bq && shown !== total ? shown + " of " + total : total;
  }
  nOf("nHomeOrigin", nHO, oHome.length);
  nOf("nChampOrigin", nCO, oChamp.length + oUnk.length);
  nOf("nRent", nRe, rent.length);
  $("nHome").textContent = home.length;

  var warn = $("boxWarn");
  warn.innerHTML = "";
  /* the number that actually matters for box management: slots you can free
     without destroying anything */
  warn.appendChild(note(oHome.length ? "" : "warn",
    "<strong>" + oHome.length + " of " + used + " slots are elastic.</strong> " +
    "The other " + (used - oHome.length) + " can only be freed by releasing " +
    "the Pokemon, and the game stops releases at " + RELEASE_FLOOR + ", so the " +
    "last " + RELEASE_FLOOR + " Champions-origin ones stay for good. Replacing " +
    "the rest with your own GO catches through HOME is the standing plan."));
  if (used >= cap) {
    warn.appendChild(note("bad", "<strong>The box is full at " + used + "/" + cap +
      ".</strong> Nothing new fits until something leaves."));
  } else if (used >= cap - 3) {
    warn.appendChild(note("warn", "<strong>" + (cap - used) + " slot" +
      (cap - used === 1 ? "" : "s") + " left.</strong>"));
  }
  if (oUnk.length) {
    var w = note("warn", "<strong>" + oUnk.length + " without a recorded " +
      "origin.</strong> They are being counted as Champions origin, which is " +
      "the cautious read. Tap one to say where it really came from: " +
      oUnk.map(function(r){ return r.name; }).join(", "));
    warn.appendChild(w);
  }
  /* A repeat is only worth a warning when one of the copies can actually go.
     HOME-origin copies are real Pokemon and may stay duplicated for good, and
     a Champions-origin one at the release floor cannot leave (player,
     2026-09-27) - calling either "trade material" asks for the impossible. */
  var dupes = {};
  perm.concat(rent).forEach(function(r){
    var sp = byName[r.name]?.species || r.name;
    dupes[sp] ||= [];
    dupes[sp].push(r);
  });
  var rep = Object.keys(dupes).filter(function(k){
    return dupes[k].length > 1 &&
           dupes[k].some(function(r){ return !releaseBlock(r); });
  });
  if (rep.length) {
    warn.appendChild(note("warn", "<strong>Species Clause.</strong> " +
      rep.join(", ") + " appear" + (rep.length === 1 ? "s" : "") +
      " more than once, so those copies can never share a team, and at " +
      "least one of them can be released."));
  }

  drawDupeHome();
  drawBuilds();
  drawStones();
  /* Drawn once, when the fold is first opened - not on every redraw of a
     screen whose whole point is the number at the top. */
  var sf = $("statusFold"), sb = $("statusBody");
  if (sf && sb && !sf._wired) {
    sf._wired = 1;
    sf.onclick = function(){
      var open = sb.hidden;
      sb.hidden = !open;
      sf.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && !sb._drawn) { sb._drawn = 1; drawStatuses(); }
    };
  }
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
      x.setAttribute("aria-pressed", x === b ? "true" : "false");
    });
    calcDraw();
  };
});
/* one order for every box list, so HOME and the Champions Box can be read
   against the phone's own screen without re-sorting in your head */
document.querySelectorAll(".sortseg").forEach(function(seg){
  Array.prototype.forEach.call(seg.children, function(b){
    b.onclick = function(){
      VIEW.sort = b.dataset.sort;
      document.querySelectorAll(".sortseg").forEach(function(g){
        Array.prototype.forEach.call(g.children, function(x){
          x.setAttribute("aria-pressed", x.dataset.sort === VIEW.sort ? "true" : "false");
        });
      });
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
    document.querySelectorAll(".sortseg").forEach(function(g){
      Array.prototype.forEach.call(g.children, function(x){
        x.setAttribute("aria-pressed", x.dataset.sort === VIEW.sort ? "true" : "false");
      });
    });
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
  document.querySelectorAll(".homeseg").forEach(function(g){
    Array.prototype.forEach.call(g.children, function(x){
      x.setAttribute("aria-pressed", x.dataset.home === which ? "true" : "false");
    });
  });
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
  var panes = {stones:"gearStonePane", items:"gearItemPane"};
  var btns = {stones:"gearStones", items:"gearItems"};
  Object.keys(panes).forEach(function(k){
    $(panes[k]).hidden = k !== which;
    $(btns[k]).setAttribute("aria-pressed", k === which ? "true" : "false");
  });
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
