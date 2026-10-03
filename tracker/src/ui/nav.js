/* Tabs, the two editor views, the modal sheet, the app's own confirm, and
   the phone's Back button.

   A small surface on purpose: go() changes tab, openSheet() shows a sheet,
   ask() asks. The tab bar's own data, the scroll lock behind a sheet and the
   history counters stay private. */
import { $, el, resetHost, showPane } from "../core/dom.js";
import { S } from "../core/state.js";

/* ===================================================================== tabs */
/* [view id, label, icon path]. The view id is the `v-<id>` section in the
   markup and what go() takes. Labels are kept to one word so the phone's bar
   never wraps to two lines; each view's own heading spells the name out. */
const TABS = [
  ["box", "Champs", "M3 8h18v11H3zM3 8l2-4h14l2 4M9 12h6"],
  ["home", "HOME", "M3 13h5l1 3h6l1-3h5M5 13 7 5h10l2 8v6H5z"],
  ["builds", "Builds", "M4 19V9m5 10V5m5 14v-7m5 7V8"],
  ["calc", "Damage Calc.", "M7 4h10v16H7zM10 8h4M10 12h4M10 16h4"],
  ["find", "Find", "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4"],
  ["gear", "Items", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 12h2m12 0h2m-8-8v2m0 12v2M6.5 6.5 8 8m8 8 1.5 1.5m0-11L16 8M8 16l-1.5 1.5"],
  /* the id stays `trainer` from when the tab was a profile: an internal
     name only, and renaming it would touch every go("trainer") */
  ["trainer", "Settings", "M4 7h9m4 0h3M15 5v4M4 17h3m4 0h9M9 15v4"]
];
/* Does a media query match? Never throws: a LAYOUT question must never be
   able to stop the app loading, and jsdom (where the tests run) has no
   matchMedia - a TypeError here once killed the rest of startup. */
function mq(q){
  try { return !!(window.matchMedia?.(q).matches); }
  catch (e) { return false; }
}
/* The toast sits above the tab bar, whose height changes with the
   breakpoint and again in the desktop rail, so the bar is measured and
   published as --navh rather than hard-coded in the CSS. */
function syncNavHeight(){
  const nav = $("tabs");
  if (!nav) return;
  let h = nav.getBoundingClientRect().height;
  /* in the >=900px rail the bar is full height down the side, not a strip
     along the bottom, so it must not push the toast up the screen */
  if (mq("(min-width:900px)")) h = 0;
  document.documentElement.style.setProperty("--navh", Math.round(h) + "px");
}
window.addEventListener("resize", syncNavHeight);
window.addEventListener("orientationchange", syncNavHeight);

/* Draw the tab bar from TABS, once, at startup. */
function buildTabs(){
  const nav = $("tabs");
  TABS.forEach(function(t){
    const b = el("button");
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
const EXTRA_VIEWS = ["buildedit", "teamedit"];
/* which tab stays lit while an editor is open - both belong to Builds */
const EDITOR_HOME = {buildedit: "builds", teamedit: "builds"};

/* A tab that rebuilds itself every time it is shown registers its redraw
   here - boot.js: onShow("calc", calcDraw) - so navigation never imports
   the tabs it switches between. */
const ON_SHOW = {};
function onShow(tab, fn){ ON_SHOW[tab] = fn; }

/* Show one view (a tab or an editor), hide the rest, light its tab. */
function go(tab){
  /* ONE HISTORY ENTRY PER TAB CHANGE, so Back walks them one at a time.
     TABHIST seeds itself with the tab being left: at boot S.tab already
     equals the first tab, so without the seed the first Back would have
     nothing to return to.

     Never while servicing a Back - the handler calls go() itself and would
     re-push what it just popped - and never on the way into or out of an
     editor, whose own history entry is paid for by layerOpened() and
     layerClosed(). */
  if (!NAV_BACK && S.tab !== tab &&
      !EXTRA_VIEWS.includes(tab) && !EXTRA_VIEWS.includes(S.tab)) {
    if (!TABHIST.length) TABHIST.push(S.tab || tab);
    TABHIST.push(tab);
    try { history.pushState({champTab: TABHIST.length}, ""); } catch (e) {}
  }
  S.tab = tab;
  if (ON_SHOW[tab]) setTimeout(ON_SHOW[tab], 0);
  TABS.forEach(function(t){
    $("v-" + t[0]).hidden = t[0] !== tab;
  });
  EXTRA_VIEWS.forEach(function(v){ $("v-" + v).hidden = v !== tab; });
  const lit = EDITOR_HOME[tab] || tab;
  Array.prototype.forEach.call($("tabs").children, function(b){
    b.setAttribute("aria-selected", b.dataset.tab === lit ? "true" : "false");
  });
  window.scrollTo(0, 0);
}

/* Leaving an editor returns to the list it came from, which is the Builds tab
   with one pane or the other showing. */
function leaveEditor(pane){
  const wasOpen = inEditor();
  go("builds");
  buildsPane(pane === "teams" ? "teams" : "builds");
  if (wasOpen) layerClosed();
}

/* The sheet API, rendered into a full-screen view instead ("buildedit" or
   "teamedit"). Same arguments as openSheet - `build(body)` fills it, `foot`
   is the buttons - so a builder written for a sheet works here unchanged. */
function openEditor(view, title, build, foot){
  const pre = view === "teamedit" ? "teamEdit" : "buildEdit";
  $(pre + "Title").textContent = title;
  build(resetHost($(pre + "Body")));
  const f = $(pre + "Foot");
  f.innerHTML = "";
  (foot || []).filter(Boolean).forEach(function(b){ f.appendChild(b); });
  const wasOpen = inEditor();
  go(view);
  if (!wasOpen) layerOpened();
}

/* ===================================================================== sheet */
/* ---------- body scroll lock -------------------------------------------
   With a sheet open, the page underneath must not scroll - on a phone that is
   the clearest "this is a web page" tell. overscroll-behavior:contain on
   .sheetbody stops the chaining; this pins the page itself and restores the
   exact scroll position after. A counter, not a boolean, because a sheet may
   close and reopen itself while a dialog sits over it. */
let _lockY = 0, _lockN = 0;
function lockScroll(on){
  const b = document.body;
  if (on) {
    if (_lockN++ === 0) {
      _lockY = window.scrollY || 0;
      b.classList.add("scrolllock");
      b.style.top = (-_lockY) + "px";
    }
  } else if (_lockN > 0 && --_lockN === 0) {
    b.classList.remove("scrolllock");
    b.style.top = "";
    window.scrollTo(0, _lockY);
  }
}

/* The modal sheet: `build(body)` fills it, `foot` is its buttons (nulls are
   skipped). Opening one while another is open replaces it in place. */
function openSheet(title, build, foot){
  $("sheetTitle").textContent = title;
  /* #sheetBody is ONE node reused by every sheet - resetHost says why it
     takes more than innerHTML to empty it */
  const body = resetHost($("sheetBody"));
  build(body);
  const f = $("sheetFoot"); f.innerHTML = "";
  /* a caller may pass null for a button that does not apply to this case,
     which is cleaner than building two different arrays */
  const btns = (foot || []).filter(Boolean);
  btns.forEach(function(b){ f.appendChild(b); });
  f.hidden = !btns.length;
  const wasOpen = !$("scrim").hidden;
  $("scrim").hidden = false;
  if (!wasOpen) { lockScroll(true); layerOpened(); }
  /* a sheet that opens scrolled halfway down its predecessor is disorienting */
  body.scrollTop = 0;
}
function closeSheet(){
  const wasOpen = !$("scrim").hidden;
  $("scrim").hidden = true;
  if (wasOpen) { lockScroll(false); layerClosed(); }
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
   it. Every confirm in the app guards something irreversible - deleting a
   build, buying a rental into Champions origin, closing a trade - so it is
   drawn in the app's own design instead.

   Returns a promise so the callers read the same way they did with confirm(),
   one `await`-shaped step instead of a callback pyramid.

   THE SAFE ANSWER IS THE DEFAULT. Escape, the backdrop and the Cancel button
   all resolve false, and Cancel is the button that takes focus - a question
   about something that cannot be undone should not be dismissable into a yes. */
function ask(title, body, okLabel, danger){
  return new Promise(function(resolve){
    const scrim = $("askScrim");
    $("askTitle").textContent = title;
    /* TEXT, NOT HTML. Several of these messages interpolate a Pokemon's name
       or a trade's contents; none of that should ever be parsed as markup.
       A blank line starts a new paragraph, which is how the messages were
       already written for confirm(). */
    const host = $("askBody");
    host.innerHTML = "";
    if (body?.nodeType) host.appendChild(body);
    else String(body || "").split(/\n\s*\n/).forEach(function(par){
      if (par.trim()) host.appendChild(el("p", null, par.trim()));
    });
    const yes = $("askYes"), no = $("askNo");
    yes.textContent = okLabel || "OK";
    yes.className = "btn " + (danger ? "danger" : "primary");
    let done = false;
    function finish(v){
      if (done) return;
      done = true;
      scrim.hidden = true;
      layerClosed();
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
    layerOpened();
    setTimeout(function(){ no.focus(); }, 30);
  });
}

/* ================================================= THE PHONE'S BACK BUTTON ==
   The page loads once and everything after is a hidden/shown <section>, so
   without help the browser's only history entry IS the page, and Android's
   Back would leave the app. So every layer and tab change pushes an entry,
   and Back undoes the topmost thing instead.

   WHAT BACK SHOULD UNDO, topmost first - the same order the eye would expect:

       the confirm dialog   ->  cancel it, which is already the safe answer
       an open sheet        ->  close it
       an editor            ->  return to the list it came from
       a tab change         ->  the tab before it
       nothing left         ->  and only then does Back leave the app

   HOW IT STAYS HONEST. Every layer that opens pushes one history entry, and a
   layer closed from inside the app calls history.back() to spend it. That
   second half is the part that is easy to get wrong: without it the entry
   survives its own dialog, and the next Back finds nothing open and walks the
   user off a tab they never left. SWALLOW counts the pops we caused
   ourselves, so the handler ignores exactly those and no more. */
let LAYERS = 0;                  /* history entries pushed for open layers */
let SWALLOW = 0;                 /* pops we caused and have already acted on */
const TABHIST = [];                /* tabs visited, so Back can step through */
let NAV_BACK = false;            /* true while a pop is being serviced */

function layerOpened(){
  /* A NEW LAYER DRAINS ANY STALE SWALLOW. layerClosed() asks the browser to
     spend an entry and counts on the pop coming back; if that pop never
     arrives - a browser that refuses history.back(), a jsdom that implements
     back() without dispatching popstate - the count leaks and every future
     Back is eaten by a press that already happened. Opening a layer is the
     moment that can never be true any more, so it resets there. */
  SWALLOW = 0;
  LAYERS++;
  try { history.pushState({champLayer: LAYERS}, ""); } catch (e) {}
}
function layerClosed(){
  if (LAYERS <= 0 || NAV_BACK) return;
  LAYERS--; SWALLOW++;
  try { history.back(); } catch (e) { SWALLOW--; }
}

/* is one of the two editor views showing? */
function inEditor(){
  return EXTRA_VIEWS.some(function(v){
    const n = $("v-" + v);
    return n && !n.hidden;
  });
}

window.addEventListener("popstate", function(){
  if (SWALLOW > 0) { SWALLOW--; return; }
  NAV_BACK = true;
  try {
    if (LAYERS > 0) {
      LAYERS--;
      if (!$("askScrim").hidden) {
        /* the dialog resolves false on its own Cancel path */
        const no = $("askNo");
        if (no?.onclick) no.onclick();
      } else if (!$("scrim").hidden) {
        closeSheet();
      } else if (inEditor()) {
        leaveEditor();
      }
      return;
    }
    /* no layer left: step back through the tabs this session has visited */
    /* No re-push: every tab change already bought its own entry on the way
       in, so the stack and the browser's history stay the same length. */
    if (TABHIST.length > 1) {
      TABHIST.pop();
      go(TABHIST.at(-1));
    }
  } finally { NAV_BACK = false; }
});

/* Builds and Teams share one tab, switched by a segmented control: an eighth
   tab would wrap the phone's bar onto two rows, and they belong together
   anyway, since a team IS six builds. */
function buildsPane(which){
  showPane({builds:["buildsPane", "bldPaneBuilds"],
            teams:["teamsPane", "bldPaneTeams"]}, which);
  /* the "New build" button in the header belongs to the Builds pane only */
  const add = $("buildAdd");
  if (add) add.hidden = which !== "builds";
}

export {
  ask, buildsPane, buildTabs, closeSheet, go, leaveEditor, mq, onShow,
  openEditor, openSheet,
};
