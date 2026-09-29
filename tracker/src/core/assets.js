/* The two payloads fetched only when a sheet asks for them: Smogon's written
   analyses, and the part of the dex Champions does not have. */
import { byName } from "./data.js";

/* ------------------------------------------------ what Smogon wrote ------
   The only source in this project with REASONING in it, and until now the
   only one the phone never saw. 54 Pokemon have a written VGC analysis: the
   sets people actually run, the SP spread and what each point of it survives,
   which Pokemon check it, which partners cover its holes. It was downloaded
   every night and read only through `query.py pokemon` on the laptop.

   LOADED ON DEMAND. 407 KB against a dex payload of 419 - paying that on every
   visit for a panel opened while arguing about a build is the wrong trade. The
   script tag is added the first time a sheet asks, and the file is immutable
   by its content hash, so it is fetched once ever.

   A tag rather than fetch(): the CSP allows same-origin scripts and the file
   is one assignment, so there is nothing to parse by hand and nothing to get
   wrong about encoding. */
var ANALYSIS_STATE = null;          // null | "loading" | "ready" | "absent"
var ANALYSIS_WAITING = [];

function analysisFor(name){
  var all = window.CHAMP_ANALYSIS;
  if (!all) return null;
  /* Smogon files a Mega under its own name and the box knows it as one too,
     so a direct hit comes first; failing that, a Mega falls back to the base
     species, whose analysis is the one that discusses the stone. */
  if (all[name]) return all[name];
  var p = byName[name];
  if (p?.species && all[p.species]) return all[p.species];
  return null;
}

function loadAnalysis(then){
  /* Already here? Then there is nothing to load. The asset is a plain
     assignment to window, so anything that has run it - a second panel, a
     future view, a test - counts, and asking again would sit on a script tag
     that resolves nothing. */
  if (window.CHAMP_ANALYSIS) { ANALYSIS_STATE = "ready"; return then(); }
  if (ANALYSIS_STATE === "ready" || ANALYSIS_STATE === "absent") return then();
  ANALYSIS_WAITING.push(then);
  if (ANALYSIS_STATE === "loading") return;
  var url = window.CHAMP_ANALYSIS_URL;
  if (!url) {                       // the single-file build carries no asset
    ANALYSIS_STATE = "absent";
    return flushAnalysis();
  }
  ANALYSIS_STATE = "loading";
  var sc = document.createElement("script");
  sc.src = url;
  sc.onload = function(){ ANALYSIS_STATE = "ready"; flushAnalysis(); };
  sc.onerror = function(){ ANALYSIS_STATE = "absent"; flushAnalysis(); };
  document.head.appendChild(sc);
}

function flushAnalysis(){
  var q = ANALYSIS_WAITING;
  ANALYSIS_WAITING = [];
  q.forEach(function(fn){ try { fn(); } catch (e) {} });
}

/* ------------------------------- THE REST OF THE DEX, ON DEMAND ----------
   The same shape as the analysis loader, for a different 503 KB.

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
var OUT_STATE = "idle", OUT_WAITING = [];

function loadOutside(then){
  if (window.CHAMP_OUTSIDE) { OUT_STATE = "ready"; return then(); }
  if (OUT_STATE === "ready" || OUT_STATE === "absent") return then();
  OUT_WAITING.push(then);
  if (OUT_STATE === "loading") return;
  var url = window.CHAMP_OUTSIDE_URL;
  if (!url) { OUT_STATE = "absent"; return flushOutside(); }
  OUT_STATE = "loading";
  var sc = document.createElement("script");
  sc.src = url;
  sc.onload = function(){ OUT_STATE = "ready"; flushOutside(); };
  sc.onerror = function(){ OUT_STATE = "absent"; flushOutside(); };
  document.head.appendChild(sc);
}

function flushOutside(){
  var q = OUT_WAITING;
  OUT_WAITING = [];
  q.forEach(function(fn){ try { fn(); } catch (e) {} });
}

function outsideDex(){ return window.CHAMP_OUTSIDE || {}; }
function outsideMovesFor(name){ return outsideDex().m?.[name] || null; }
/* A move the app does not ship, dressed as one it does, so the same row
   renderer draws it. `i` is -1 on purpose: the ability badges and the blocker
   tags index by it, and a move with no index must match none of them rather
   than match move 0. */
function outsideMove(name){
  var r = outsideDex().mv?.[name];
  if (!r) return null;
  return {i:-1, name:name, type:r[0], cat:r[1], bp:r[2], acc:r[3], pp:r[4],
          pri:0, target:"Selected Target", spread:false, hitsAlly:false,
          hits:null, crit:false, f:"", sec:false, text:r[5] || "",
          notInChampions:true};
}

export {
  ANALYSIS_STATE, analysisFor, loadAnalysis, loadOutside, outsideDex,
  outsideMove, outsideMovesFor,
};
