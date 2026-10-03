/* The two payloads fetched only when a sheet asks for them: Smogon's written
   analyses, and the part of the dex Champions does not have. */
import { byName } from "./data.js";

/* ------------------------------------------------ the loader, once -------
   lazyScript(global, urlGlobal) returns load(then). The first call adds a
   <script> for window[urlGlobal]; every call, however many sheets ask while it
   is in flight, gets then(ready) once the answer is known. `ready` is false
   when the file failed or this build carries none (the single-file build sets
   the URL to ''), and the callers say which.

   A tag rather than fetch(): the CSP allows same-origin scripts and each file
   is one assignment to window, so there is nothing to parse by hand and
   nothing to get wrong about encoding. And because it IS an assignment,
   anything that already ran it - a second panel, a test - counts as loaded. */
function lazyScript(global, urlGlobal){
  let state = "idle", waiting = [];      // idle | loading | ready | absent
  function settle(to){
    state = to;
    const q = waiting;
    waiting = [];
    q.forEach(function(fn){ try { fn(to === "ready"); } catch (e) {} });
  }
  return function load(then){
    if (window[global]) { state = "ready"; return then(true); }
    if (state === "ready" || state === "absent") return then(state === "ready");
    waiting.push(then);
    if (state === "loading") return;
    const url = window[urlGlobal];
    if (!url) return settle("absent");
    state = "loading";
    const sc = document.createElement("script");
    sc.src = url;
    sc.onload = function(){ settle("ready"); };
    sc.onerror = function(){ settle("absent"); };
    document.head.appendChild(sc);
  };
}

/* ------------------------------------------------ what Smogon wrote ------
   Smogon's written VGC analyses: the only source here with REASONING in it -
   the sets people run, what each SP of a spread survives, what checks the
   Pokemon and which partners cover it.

   LOADED ON DEMAND: it is about as big as the whole dex payload, and only a
   sheet's analysis panel reads it. The file is named by its content hash, so
   it is fetched once and then served from cache. */
const loadAnalysis = lazyScript("CHAMP_ANALYSIS", "CHAMP_ANALYSIS_URL");

/* The analysis for a name, or null (also null before it has loaded). */
function analysisFor(name){
  const all = window.CHAMP_ANALYSIS;
  if (!all) return null;
  /* Smogon files a Mega under its own name and the box knows it as one too,
     so a direct hit comes first; failing that, a Mega falls back to the base
     species, whose analysis is the one that discusses the stone. */
  if (all[name]) return all[name];
  const p = byName[name];
  if (p?.species && all[p.species]) return all[p.species];
  return null;
}

/* ------------------------------- THE REST OF THE DEX, ON DEMAND ----------
   So the app knows every Pokemon, not only the ones Champions has: for the
   species the game has not added, their movepools, the move rows the page
   does not otherwise ship, and the ability text Champions has no entry for.
   A "not in Champions" tag can then say what a thing is AND that it cannot
   be used.

   Fetched when one of those sheets is opened, never otherwise. Where each
   part comes from is argued in scripts/build_outside_dex.py: the moves are
   Champions' own data, only the ability text is main-series. */
const loadOutside = lazyScript("CHAMP_OUTSIDE", "CHAMP_OUTSIDE_URL");

/* {} until loaded, so a caller never has to test for it */
function outsideDex(){ return window.CHAMP_OUTSIDE || {}; }
function outsideMovesFor(name){ return outsideDex().m?.[name] || null; }
/* A move the app does not ship, dressed as one it does, so the same row
   renderer draws it. `i` is -1 on purpose: the ability badges and the blocker
   tags index by it, and a move with no index must match none of them rather
   than match move 0. */
function outsideMove(name){
  const r = outsideDex().mv?.[name];
  if (!r) return null;
  return {i:-1, name:name, type:r[0], cat:r[1], bp:r[2], acc:r[3], pp:r[4],
          pri:0, target:"Selected Target", spread:false, hitsAlly:false,
          hits:null, crit:false, f:"", sec:false, text:r[5] || "",
          notInChampions:true};
}

export {
  analysisFor, loadAnalysis, loadOutside, outsideDex, outsideMove,
  outsideMovesFor,
};
