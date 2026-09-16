/* 04-nav.js - Tabs, editor views, and the modal sheet they used to be.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import { $, el } from "./01-data.js";
import { S } from "./02-state.js";
/* Three redraws, one per tab that has to rebuild itself when it is shown.
   Each is only ever CALLED - two of them from a setTimeout - so the cycles
   they form with this file (all three import `go` back) cost nothing:
   function declarations are hoisted, and nothing runs while the modules are
   still loading. */
import { calcDraw } from "./11-damage.js";
import { findDraw } from "./12-find.js";
import { buildsPane } from "./13-boot.js";
/* ===================================================================== tabs */
var TABS = [
  /* One word each. "Champs Box" was the only label that wrapped to two lines
     (measured at 360 and 390), which stretched the whole bar and left one tab
     visibly taller than the other six. Each view's own H1 still says
     "Champions Box" and "HOME Box" in full. */
  ["box", "Champs", "M3 8h18v11H3zM3 8l2-4h14l2 4M9 12h6"],
  ["home", "HOME", "M3 13h5l1 3h6l1-3h5M5 13 7 5h10l2 8v6H5z"],
  ["builds", "Builds", "M4 19V9m5 10V5m5 14v-7m5 7V8"],
  ["calc", "Damage Calc.", "M7 4h10v16H7zM10 8h4M10 12h4M10 16h4"],
  ["find", "Find", "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4"],
  ["gear", "Items", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 12h2m12 0h2m-8-8v2m0 12v2M6.5 6.5 8 8m8 8 1.5 1.5m0-11L16 8M8 16l-1.5 1.5"],
  ["trainer", "Profile", "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8M5 21v-1a7 7 0 0 1 14 0v1"]
];
/* The toast sits above the tab bar, whose height changes with the breakpoint
   (47px icon-only at 320, 68px with labels at 412) and again in the desktop
   rail. Measured and published as --navh rather than hard-coded. */
/* A media query is a LAYOUT question, and a layout question must never be able
   to stop the app loading. It could: syncNavHeight() runs during startup, and
   where window.matchMedia is missing the TypeError propagated and killed the
   rest of init - the box and the builds never loaded and every list rendered
   empty. Real browsers all have it; the environment the page is TESTED in does
   not, which is why five DOM tests had been finding an empty page. */
function mq(q){
  try { return !!(window.matchMedia && window.matchMedia(q).matches); }
  catch (e) { return false; }
}
function syncNavHeight(){
  var nav = $("tabs");
  if (!nav) return;
  var h = nav.getBoundingClientRect().height;
  /* in the >=900px rail the bar is full height down the side, not a strip
     along the bottom, so it must not push the toast up the screen */
  if (mq("(min-width:900px)")) h = 0;
  document.documentElement.style.setProperty("--navh", Math.round(h) + "px");
}
window.addEventListener("resize", syncNavHeight);
window.addEventListener("orientationchange", syncNavHeight);

function buildTabs(){
  var nav = $("tabs");
  TABS.forEach(function(t){
    var b = el("button");
    b.setAttribute("role", "tab");
    b.dataset.tab = t[0];
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + t[2] + '"/></svg>';
    b.appendChild(el("span", null, t[1]));
    b.onclick = function(){ go(t[0]); };
    nav.appendChild(b);
  });
  syncNavHeight();
}
/* Views that are NOT tabs: the two editors. They are reached from a list and
   leave by their own Back button, so they never appear in the bar - but go()
   still has to hide every other view, or the old one shows through. */
var EXTRA_VIEWS = ["buildedit", "teamedit"];
/* which tab stays lit while an editor is open - both belong to Builds */
var EDITOR_HOME = {buildedit: "builds", teamedit: "builds"};

function go(tab){
  S.tab = tab;
  if (tab === "calc") setTimeout(calcDraw, 0);
  if (tab === "find") setTimeout(findDraw, 0);
  TABS.forEach(function(t){
    $("v-" + t[0]).hidden = t[0] !== tab;
  });
  EXTRA_VIEWS.forEach(function(v){ $("v-" + v).hidden = v !== tab; });
  var lit = EDITOR_HOME[tab] || tab;
  Array.prototype.forEach.call($("tabs").children, function(b){
    b.setAttribute("aria-selected", b.dataset.tab === lit ? "true" : "false");
  });
  window.scrollTo(0, 0);
}

/* The sheet API, rendered into a view instead. Same three arguments, so the
   body-building code that used openSheet moves across untouched. */
/* Leaving an editor returns to the list it came from, which is the Builds tab
   with one pane or the other showing. */
function leaveEditor(pane){
  go("builds");
  buildsPane(pane === "teams" ? "teams" : "builds");
}

function openEditor(view, title, build, foot){
  var pre = view === "teamedit" ? "teamEdit" : "buildEdit";
  $(pre + "Title").textContent = title;
  var body = $(pre + "Body");
  body.innerHTML = "";
  Object.keys(body).forEach(function(k){
    if (k.charAt(0) === "_") { try { delete body[k]; } catch (e) {} }
  });
  build(body);
  var f = $(pre + "Foot");
  f.innerHTML = "";
  (foot || []).filter(Boolean).forEach(function(b){ f.appendChild(b); });
  go(view);
}

/* ===================================================================== sheet */
var sheetSave = null;
/* ---------- body scroll lock -------------------------------------------
   With a sheet open, dragging it to its end used to start scrolling the page
   underneath - the single clearest "this is a web page" tell on a phone.
   overscroll-behavior:contain on .sheetbody stops the chaining; this stops
   the page moving at all, and restores the exact scroll position after. A
   counter, not a boolean, because gtsSheet closes and reopens itself. */
var _lockY = 0, _lockN = 0;
function lockScroll(on){
  var b = document.body;
  if (on) {
    if (_lockN++ === 0) {
      _lockY = window.scrollY || 0;
      b.style.position = "fixed";
      b.style.top = (-_lockY) + "px";
      b.style.left = "0";
      b.style.right = "0";
    }
  } else if (_lockN > 0 && --_lockN === 0) {
    b.style.position = b.style.top = b.style.left = b.style.right = "";
    window.scrollTo(0, _lockY);
  }
}

function openSheet(title, build, foot){
  $("sheetTitle").textContent = title;
  /* #sheetBody is ONE node reused by every sheet, and innerHTML only clears
     its children - an expando a previous builder hung on it (body._mode,
     body._marks) survives into the next sheet. That is exactly how the
     Champions "rental" choice leaked into the 11 HOME adds of 2026-09-11.
     Anything underscore-prefixed is sheet-local state, so wipe it by hand. */
  var body = $("sheetBody"); body.innerHTML = "";
  Object.keys(body).forEach(function(k){
    if (k.charAt(0) === "_") { try { delete body[k]; } catch (e) {} }
  });
  build(body);
  var f = $("sheetFoot"); f.innerHTML = "";
  /* a caller may pass null for a button that does not apply to this case,
     which is cleaner than building two different arrays */
  var btns = (foot || []).filter(Boolean);
  btns.forEach(function(b){ f.appendChild(b); });
  f.hidden = !btns.length;
  var wasOpen = !$("scrim").hidden;
  $("scrim").hidden = false;
  if (!wasOpen) lockScroll(true);
  /* a sheet that opens scrolled halfway down its predecessor is disorienting */
  body.scrollTop = 0;
}
function closeSheet(){
  var wasOpen = !$("scrim").hidden;
  $("scrim").hidden = true;
  sheetSave = null;
  if (wasOpen) lockScroll(false);
}
$("sheetClose").onclick = closeSheet;
$("scrim").onclick = function(e){ if (e.target === $("scrim")) closeSheet(); };
document.addEventListener("keydown", function(e){
  if (e.key === "Escape" && !$("scrim").hidden) closeSheet();
});
/* ------------------------------------------------- the app's own confirm ---
   `confirm()` draws the OPERATING SYSTEM's dialog in the middle of a designed
   app: another typeface, another button order, another set of words, and on a
   phone it lands at the top of the screen, far from the thumb that asked for
   it. Seven of them were in here and every one guards something irreversible
   - deleting a build, buying a rental into Champions origin, closing a trade
   (player, 2026-09-16: "debería la app tener su propio estilo de alertas y
   notificaciones, para conservar el mismo diseño").

   Returns a promise so the callers read the same way they did with confirm(),
   one `await`-shaped step instead of a callback pyramid.

   THE SAFE ANSWER IS THE DEFAULT. Escape, the backdrop and the Cancel button
   all resolve false, and Cancel is the button that takes focus - a question
   about something that cannot be undone should not be dismissable into a yes. */
function ask(title, body, okLabel, danger){
  return new Promise(function(resolve){
    var scrim = $("askScrim");
    $("askTitle").textContent = title;
    /* TEXT, NOT HTML. Several of these messages interpolate a Pokemon's name
       or a trade's contents; none of that should ever be parsed as markup.
       A blank line starts a new paragraph, which is how the messages were
       already written for confirm(). */
    var host = $("askBody");
    host.innerHTML = "";
    if (body && body.nodeType) host.appendChild(body);
    else String(body || "").split(/\n\s*\n/).forEach(function(par){
      if (par.trim()) host.appendChild(el("p", null, par.trim()));
    });
    var yes = $("askYes"), no = $("askNo");
    yes.textContent = okLabel || "OK";
    yes.className = "btn " + (danger ? "danger" : "primary");
    var done = false;
    function finish(v){
      if (done) return;
      done = true;
      scrim.hidden = true;
      yes.onclick = no.onclick = scrim.onclick = null;
      document.removeEventListener("keydown", onKey, true);
      /* the sheet underneath, if there is one, keeps its own scroll lock */
      if ($("scrim").hidden) lockScroll(false);
      resolve(v);
    }
    function onKey(e){
      if (e.key === "Escape") { e.stopPropagation(); finish(false); }
      else if (e.key === "Enter" && document.activeElement === yes) finish(true);
    }
    yes.onclick = function(){ finish(true); };
    no.onclick = function(){ finish(false); };
    scrim.onclick = function(e){ if (e.target === scrim) finish(false); };
    /* capture, so Escape closes the QUESTION and not the sheet behind it */
    document.addEventListener("keydown", onKey, true);
    if ($("scrim").hidden) lockScroll(true);
    scrim.hidden = false;
    setTimeout(function(){ no.focus(); }, 30);
  });
}

function fbtn(label, cls, fn){
  var b = el("button", "btn " + (cls || ""), label);
  b.onclick = fn;
  return b;
}

/* ------------------------------------------------------- what leaves here --
   Navigation is a small surface on purpose: everything else asks `go` to
   change tab, `openSheet` to show a sheet and `fbtn` for a footer button.

   What stays private is the furniture - TABS and EXTRA_VIEWS (the tab bar's
   own data), lockScroll and _lockY (the iOS scroll lock behind a sheet),
   syncNavHeight, sheetSave and EDITOR_HOME. Before the module pass any of the
   other twelve parts could have reached in and set _lockY. */
export {
  ask, buildTabs, closeSheet, fbtn, go, leaveEditor, mq, openEditor, openSheet,
};
