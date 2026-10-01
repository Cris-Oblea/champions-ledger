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
   The only source in this project with REASONING in it, and until now the
   only one the phone never saw. 54 Pokemon have a written VGC analysis: the
   sets people actually run, the SP spread and what each point of it survives,
   which Pokemon check it, which partners cover its holes. It was downloaded
   every night and read only through `query.py pokemon` on the laptop.

   LOADED ON DEMAND. 407 KB against a dex payload of 419 - paying that on every
   visit for a panel opened while arguing about a build is the wrong trade. The
   script tag is added the first time a sheet asks, and the file is immutable
   by its content hash, so it is fetched once ever. */
const loadAnalysis = lazyScript("CHAMP_ANALYSIS", "CHAMP_ANALYSIS_URL");

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
   The same loader, for a different 503 KB.

     "La idea es tener la DEX COMPLETA... necesito tener la database de todas
      las abilities, todos los moves, todos los pokemones. asi cuando se
      consulta por algo se sabe todo y el tag not in champions indica si es
      posible usarlo o no."  (player, 2026-09-19)

   So this carries three things for the 933 species the game has not added:
   every movepool, the move rows the app does not ship to the phone, and the
   ability text Champions has no entry for - Protosynthesis had a name on the
   sheet and nothing to say about it.

   Fetched when one of those sheets is opened and never otherwise, because most
   sessions never open one. What is in it and where each part comes from is
   argued in scripts/build_outside_dex.py - the short version being that the
   MOVES are Champions' own data all along, and only the ability text is
   main-series. */
const loadOutside = lazyScript("CHAMP_OUTSIDE", "CHAMP_OUTSIDE_URL");

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
