/* 13-boot.js - renderAll(), go(), and everything that runs on load.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import {
  $, HOME_ALL, MOVE_BY, SORT, byName, el, rowMatches, setHomeAll, setSort,
  sortRows,
} from "./01-data.js";
import { S, boxRows, buildLink, capacity, originRows } from "./02-state.js";
import { connect } from "./03-store.js";
import { buildTabs, fbtn, go, leaveEditor, mq } from "./04-nav.js";
import { addSheet, drawDexPane, pokeRow } from "./05-box.js";
import { buildRow, buildSheet } from "./06-builds.js";
import { drawItems, drawStatuses, drawStones, drawTrainer } from "./07-gear.js";
import { drawTeams } from "./08-teams.js";
import { drawGts, drawGtsWanted } from "./09-gts.js";
import { initScan } from "./10-scan.js";
import { AB_SET, CALC, abilityHit, abilityTag, calcDamage, calcDraw, koCount }
  from "./11-damage.js";
import {
  DIAG_LATEST, FIND, checkLatest, drawDiag, drawDupeHome, findInit, findRun,
} from "./12-find.js";
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
  bc.className = "counter" + (used >= cap ? " full" : used >= cap - 3 ? " tight" : "");

  fill($("listHomeOrigin"), sortRows(oHome), "Nothing routed in from HOME yet");
  fill($("listChampOrigin"), sortRows(oChamp.concat(oUnk)),
       "Nothing marked as Encounter-bought");
  fill($("listRent"), sortRows(rent), "No rentals");
  var hq = ($("homeFilter") && $("homeFilter").value || "").trim().toLowerCase();
  var homeShown = sortRows(home).filter(function(r){ return rowMatches(r, hq); });
  /* NOT `cap` - that is the box capacity, ten lines up, and reusing the name
     here made the full-box check read 48 >= 12. `var` is function-scoped, so
     the second declaration simply overwrote the first. */
  var homeCap = HOME_ALL ? homeShown.length : 12;
  fill($("listHome"), homeShown.slice(0, homeCap),
       hq ? "Nothing in HOME matches that" : "HOME is empty");
  var more = $("homeMore");
  more.innerHTML = "";
  if (homeShown.length > homeCap) {
    more.appendChild(fbtn("Show the other " + (homeShown.length - homeCap), "sm",
      function(){ setHomeAll(true); renderAll(); }));
  } else if (HOME_ALL && homeShown.length > 12) {
    more.appendChild(fbtn("Show fewer", "sm",
      function(){ setHomeAll(false); renderAll(); }));
  }
  /* the checklist is derived from the box and HOME, so it goes stale the
     moment either does - but only the visible pane is worth the work */
  if (!$("homePaneDex").hidden) drawDexPane();
  /* the recommendations are derived from the box and from HOME, so they go
     stale the moment either does - and from the open offers, since a chip
     already sitting in a GTS slot is not a chip */
  if (!$("homePaneGts").hidden) drawGtsWanted();
  $("nHomeOrigin").textContent = oHome.length;
  $("nChampOrigin").textContent = oChamp.length + oUnk.length;
  $("nRent").textContent = rent.length;
  $("nHome").textContent = home.length;

  var warn = $("boxWarn");
  warn.innerHTML = "";
  /* the number that actually matters for box management: slots you can free
     without destroying anything */
  warn.appendChild(note(oHome.length ? "" : "warn",
    "<strong>" + oHome.length + " of " + used + " slots are elastic.</strong> " +
    "The other " + (used - oHome.length) + " can only be freed by releasing " +
    "the Pokemon. Replacing them with your own GO catches through HOME is the " +
    "standing plan."));
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
  var dupes = {};
  perm.concat(rent).forEach(function(r){
    var sp = (byName[r.name] || {}).species || r.name;
    (dupes[sp] = dupes[sp] || []).push(r.name);
  });
  var rep = Object.keys(dupes).filter(function(k){ return dupes[k].length > 1; });
  if (rep.length) {
    warn.appendChild(note("warn", "<strong>Species Clause.</strong> " +
      rep.join(", ") + " appear" + (rep.length === 1 ? "s" : "") +
      " more than once, so those copies can never share a team — " +
      "they are trade material, not spares."));
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
  /* asked once per load, not on every redraw - it is a network round trip */
  if (DIAG_LATEST === "checking…") checkLatest();
}
function note(kind, html){
  var n = el("div", "note " + kind);
  n.style.marginBottom = "10px";
  n.innerHTML = html;
  return n;
}
function fill(node, rows, emptyMsg){
  node.innerHTML = "";
  if (!rows.length) { node.appendChild(el("div", "empty", emptyMsg)); return; }
  rows.forEach(function(r){ node.appendChild(pokeRow(r)); });
}
function drawBuilds(){
  var q = ($("buildSearch").value || "").trim().toLowerCase();
  var node = $("listBuilds");
  node.innerHTML = "";
  var ids = Object.keys(S.builds).sort(function(a, b){
    return String(S.builds[a].pokemon).localeCompare(String(S.builds[b].pokemon));
  }).filter(function(id){
    var b = S.builds[id];
    return !q || (b.pokemon + " " + (b.role || "") + " " +
                  (b.moves || []).join(" ")).toLowerCase().indexOf(q) >= 0;
  });
  if (!ids.length) {
    node.appendChild(el("div", "empty",
      Object.keys(S.builds).length ? "Nothing matches" : "No builds yet"));
    return;
  }
  ids.forEach(function(id){ node.appendChild(buildRow(id, S.builds[id])); });
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
  [].forEach.call(document.querySelectorAll(".view .lede, .view > .sub"),
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
      setSort(b.dataset.sort);
      document.querySelectorAll(".sortseg").forEach(function(g){
        Array.prototype.forEach.call(g.children, function(x){
          x.setAttribute("aria-pressed", x.dataset.sort === SORT ? "true" : "false");
        });
      });
      try { localStorage.setItem("champ-sort", SORT); } catch (e) {}
      renderAll();
    };
  });
});
try {
  var savedSort = localStorage.getItem("champ-sort");
  if (savedSort === "order") savedSort = "dex";   // the option that went away
  if (savedSort) {
    setSort(savedSort);
    document.querySelectorAll(".sortseg").forEach(function(g){
      Array.prototype.forEach.call(g.children, function(x){
        x.setAttribute("aria-pressed", x.dataset.sort === SORT ? "true" : "false");
      });
    });
  }
} catch (e) {}
$("buildAdd").onclick = function(){ buildSheet(null, {}); };
$("buildEditBack").onclick = function(){ leaveEditor(); };
$("teamEditBack").onclick  = function(){ leaveEditor("teams"); };
$("buildSearch").oninput = drawBuilds;
$("stoneSearch").oninput = drawStones;
$("itemSearch").oninput = drawItems;
$("homeFilter").oninput = function(){ setHomeAll(false); renderAll(); };
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

/* Builds and Teams share one tab, by the same switcher. An eighth tab wrapped
   the phone's bar onto two rows, which cost more than the tab was worth
   (player, 2026-09-13) - and they belong together anyway, since a team IS six
   builds. */
function buildsPane(which){
  var panes = {builds:"buildsPane", teams:"teamsPane"};
  var btns = {builds:"bldPaneBuilds", teams:"bldPaneTeams"};
  Object.keys(panes).forEach(function(k){
    $(panes[k]).hidden = k !== which;
    $(btns[k]).setAttribute("aria-pressed", k === which ? "true" : "false");
  });
  /* the "New build" button in the header belongs to the Builds pane only */
  var add = $("buildAdd");
  if (add) add.hidden = which !== "builds";
}
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
  var now = r.getAttribute("data-theme");
  if (!now) {
    now = mq("(prefers-color-scheme: dark)") ? "dark" : "light";
  }
  r.setAttribute("data-theme", now === "dark" ? "light" : "dark");
  try { localStorage.setItem("champ-theme", r.getAttribute("data-theme")); } catch (e) {}
};
try {
  var saved = localStorage.getItem("champ-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
} catch (e) {}

window.calcDamage=calcDamage; window.koCount=koCount; window.byName=byName;
window.MOVE_BY=MOVE_BY; window.AB_SET=AB_SET; window.abilityTag=abilityTag; window.abilityHit=abilityHit;
window.buildLink=buildLink;   /* tests/buildlinktest.js */
window.FIND=FIND; window.findRun=findRun;
renderAll();
foldIntros();
connect();
initScan();
if (window.claude && window.claude.use) {
  window.claude.use("downloads").then(function(d){ if (d) window.__dl = d; },
                                      function(){});
}

/* ------------------------------------------------------- what leaves here --
   This file STARTS the app - the statements at the bottom build the tab bar,
   draw the first screen and connect to the store - which is why the entry
   imports it first: everything it touches is built by the time it runs.

   It is also the only part that imports every other one, and that is the
   shape it should have. `renderAll` is the one redraw, called from the store
   whenever a row changes; `fill`, `note` and `buildsPane` are the three small
   pieces other views ask it for. `drawBuilds` and `gearPane` are private.
*/
export { buildsPane, fill, note, renderAll };
