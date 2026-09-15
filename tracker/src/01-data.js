/* 01-data.js - The dex blob unpacked, and the small helpers everything else calls.
   Part of the app; assembled into one script by scripts/build_tracker_page.py. */
/* ===================================================================== data */
var C = window.CHAMP;
var DEX = C.DEX.map(function(r){
  return {name:r[0], species:r[1], types:r[2], b:r[3], mega:!!r[4], ab:r[5],
          dex:r[6] || 0};
});
/* HOME lists by National Dex number, so the box can be read in the same order
   and the two screens checked line by line. Anything Champions has never heard
   of has no number here - Melmetal and Oricorio - and sorts last rather than
   being given one from memory. */
function dexNo(name){
  var n = (C.DEXNO || {})[name];
  if (n) return n;
  var p = byName[name];
  return p && p.dex ? p.dex : 99999;
}
function dexLabel(name){
  var n = dexNo(name);
  return n === 99999 ? "#----" : "#" + String(n).padStart(4, "0");
}
/* Two pieces of VIEW state, read all over the app and written by the controls
   in 13-boot. They live here because sortRows() and rowMatches() below are what
   read them, but a module's binding may only be assigned by the module that
   declares it - so the writers call these instead of assigning across the
   boundary. That restriction is the point: before, any of thirteen files could
   have written either one and nothing said so. */
var SORT = "dex";
var HOME_ALL = false;
function setSort(v){ SORT = v; }
function setHomeAll(v){ HOME_ALL = v; }
function rowMatches(r, q){
  if (!q) return true;
  if (r.name.toLowerCase().indexOf(q) >= 0) return true;
  if (String(dexNo(r.name)).indexOf(q) >= 0) return true;
  var p = byName[r.name];
  if (p && p.types.join(" ").toLowerCase().indexOf(q) >= 0) return true;
  if (q === "shiny" && r.shiny) return true;
  if (q === "trained" && r.trained) return true;
  if (r.note && String(r.note).toLowerCase().indexOf(q) >= 0) return true;
  return false;
}
function sortRows(rows){
  var r = rows.slice();
  if (SORT === "az") {
    r.sort(function(a, b){ return a.name.localeCompare(b.name); });
  } else {
    r.sort(function(a, b){
      return dexNo(a.name) - dexNo(b.name) || a.name.localeCompare(b.name);
    });
  }
  return r;
}
var byName = {}; DEX.forEach(function(p){ byName[p.name] = p; });
var FORMS = DEX.filter(function(p){ return !p.mega; })
               .sort(function(a,b){ return a.name.localeCompare(b.name); });
var MEGAS_OF = {};
DEX.forEach(function(p){
  if (!p.mega) return;
  (MEGAS_OF[p.species] = MEGAS_OF[p.species] || []).push(p);
});
var STONE_OF = {};                       // mega name -> stone name
C.STONES.forEach(function(r){ STONE_OF[r[1]] = r[0]; });
var MOVES = C.MOVES.map(function(r,i){
  return {i:i, name:r[0], type:r[1], cat:r[2], bp:r[3], acc:r[4], pp:r[5],
          pri:r[6], target:r[7], spread:!!r[8], hitsAlly:!!r[9],
          hits:r[10] || null, crit:!!r[11], f:r[12] || "", sec:!!r[13],
          text:r[14] || ""};
});
/* P physical, S special, T status - three codes, never two */
function catName(c){ return c === "P" ? "Physical" : c === "S" ? "Special" : "Status"; }
var MOVE_BY = {}; MOVES.forEach(function(m){ MOVE_BY[m.name] = m; });
var STAT_KEYS = ["hp","atk","def","spa","spd","spe"];
var STAT_LABEL = {hp:"HP", atk:"Atk", def:"Def", spa:"SpA", spd:"SpD", spe:"Spe"};
var TYPE_COLOR = {
  Normal:"#8A8A78", Fire:"#C8501E", Water:"#2E6FC4", Electric:"#B08A08",
  Grass:"#3E8C33", Ice:"#3E92A6", Fighting:"#A63424", Poison:"#8140A0",
  Ground:"#9A7A28", Flying:"#6C6BC4", Psychic:"#C43F76", Bug:"#6E8A18",
  Rock:"#8A7A3A", Ghost:"#5A4C90", Dragon:"#5340C8", Dark:"#4E423A",
  Steel:"#6E7C8A", Fairy:"#C0538A", Stellar:"#3F7F7A"
};
var COSTS = {ranked_win:300, mega_stone_shop:2000, keep_rental_pokemon:2500,
             training_move:250, training_nature:500, training_ability:500,
             training_stat_point:5};

/* ===================================================================== util */
function $(id){ return document.getElementById(id); }
function el(tag, cls, txt){
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}
function slug(s){
  return (String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-")
          .replace(/^-|-$/g,"")) || "x";
}
function freeSlug(s, taken){
  var b = slug(s), k = b, n = 2;
  while (taken[k]) { k = b + "-" + n; n++; }
  return k;
}
var toastT = null;
function toast(msg){
  var t = $("toast");
  t.textContent = msg;
  /* restart the entrance animation, otherwise a second toast inside the
     window just swaps the text with no sign anything happened */
  t.hidden = true; void t.offsetWidth; t.hidden = false;
  clearTimeout(toastT);
  /* long messages need longer than short ones - 2.6s is not enough to read
     "That copy is already in the GTS, waiting for Steelix" */
  var ms = Math.min(7000, Math.max(2600, 1200 + msg.length * 55));
  toastT = setTimeout(function(){ t.hidden = true; }, ms);
}
function typeChip(t){
  var s = el("span", "t", t);
  s.style.background = TYPE_COLOR[t] || "#777";
  return s;
}
function bst(p){ return p.b.reduce(function(a,b){ return a+b; }, 0); }

/* The compact rows printed Atk / SpA / Spe and silently dropped HP, Def and
   SpD - the same three missing in all three copies of the line, which is what
   duplicated logic does every time. One helper now, so a stat cannot go missing
   in one place only. STAT_LABEL is the display casing of STAT_KEYS. */
/* STAT_LABEL is declared ONCE, above, keyed by stat name. It used to be
   declared a second time here as a plain array, and the second declaration won
   at runtime - so every caller that asked for STAT_LABEL["hp"] got undefined.
   That is why a Pokemon's sheet printed six numbers with no label under them,
   and why the SP rows in a build had blank captions. Found by the player. */
function statLine(p){
  return p.b.map(function(v, i){
    return v + " " + STAT_LABEL[STAT_KEYS[i]];
  }).join(" / ");
}

/* level-50 stat, the formula the repo verified against 504 speed tiers */
function statAt(base, sp, isHp, mult){
  var v = base + Math.max(0, Math.min(32, sp || 0)) + (isHp ? 75 : 20);
  return Math.floor(v * (isHp ? 1 : (mult || 1)));
}
function natMult(nature, key){
  var n = C.NATURES[nature];
  if (!n) return 1;
  if (n[0] === key) return 1.1;
  if (n[1] === key) return 0.9;
  return 1;
}
function defence(types){
  var out = {};
  Object.keys(C.CHART).forEach(function(atk){
    var m = 1;
    types.forEach(function(d){
      var row = C.CHART[atk];
      if (row && row[d] != null) m *= row[d];
    });
    if (m !== 1) out[atk] = m;
  });
  return out;
}
/* THE FORM FIRST, then the species. The other way round - which is how this
   read until the player found it - hands every regional form its base form's
   movepool: Samurott-Hisui was offered Samurott's 62 moves and told it does
   not learn Ceaseless Edge or Sucker Punch, which it does. 25 forms were
   affected, Rotom-Wash and Ninetales-Alola among them, and the build editor
   offers from this same list, so it was picking sets out of the wrong pool.

   The species fallback still matters and must stay: a Mega has no learnset of
   its own, so Mega Garchomp has to read Garchomp's. */
function learnset(name){
  var p = byName[name];
  var sp = p ? p.species : name;
  /* and four forms find their pool under neither name: Champions' Floette is
     the Eternal Flower one, filed as "Floette-Eternal", and the two gender
     forms inherit the base species' pool. build_tracker_data.py resolves
     those with norm() and ships the answer, so this stays a plain lookup and
     no form is left without a movepool. */
  var alias = (C.LEARN_ALIAS || {})[name];
  var ids = C.LEARN[name] || (alias && C.LEARN[alias]) || C.LEARN[sp] || null;
  return ids ? ids.map(function(i){ return MOVES[i]; }) : null;
}
/* A Mega belongs to ONE form, not to every form of the species. Reading it off
   the species handed Raichu-Alola the two Mega Raichu and Slowbro-Galar the
   Mega Slowbro - neither can hold that stone - and it got Floette backwards,
   because Mega Floette belongs to Floette-ETERNAL, not to plain Floette.
   Smogon's roster states the relation (`baseSpecies` on each Mega) and
   build_tracker_data.py resolves it there; the species is only the fallback
   for a form Smogon does not carry. */
function megasFor(name){
  var owned = (C.MEGA_OWNER || {})[name];
  if (owned) return owned.map(function(n){ return byName[n]; }).filter(Boolean);
  /* an alternate form with no Megas of its own gets none - it must not
     inherit its base form's */
  if (byName[name] && byName[name].species !== name) return [];
  var p = byName[name];
  return (p && MEGAS_OF[p.species]) || MEGAS_OF[name] || [];
}

/* ----------------------------------------------------- what a thing DOES ---
   As a number, not as an adjective.

   Serebii writes "It slowly but steadily restores the holder's HP" for
   Leftovers and "boosts the power of the holder's moves" for Life Orb - which
   is what this app showed, with the 1/16 and the x1.3 nowhere on screen. The
   player's complaint was exact: "no me sirve una descripcion bonita que en el
   fondo no me diga la verdad calculada."

   C.EFFECTS carries both halves for an item, an ability or a move:

     x  the multipliers the ENGINE applies, read out of its own modifier
        stages in 4096ths - Guts is 6144/4096, not the 1.477 a damage ratio
        suggests
     t  the numbers Smogon writes down, each with the sentence it came from,
        so a number on screen can always be traced back to its words

   Both, where both exist, because agreeing is the evidence. */
function effectOf(name){
  return (C.EFFECTS || {})[name] || null;
}
/* The numbers as short chips: "x1.3", "1/16 of max HP". Deliberately not a
   sentence - a sentence is what this is replacing. */
function effectChips(e){
  var out = [];
  (e.x || []).forEach(function(p){
    out.push({text:"x" + p[1], why:p[0] + " (measured in the engine)"});
  });
  (e.t || []).forEach(function(p){
    var unit = p[1] === "fraction of max HP" ? " of max HP"
             : p[1] === "stages" ? " stages"
             : p[1] === "turns" ? " turns" : "";
    out.push({text:p[0] + unit, why:p[2]});
  });
  return out;
}
/* A row of them, with the source behind each on hover. */
function effectLine(name){
  var e = effectOf(name);
  if (!e) return null;
  var chips = effectChips(e);
  if (!chips.length && !e.desc) return null;
  var box = el("div", "st");
  box.style.marginTop = "2px";
  chips.forEach(function(c){
    var t = el("span", "tag ok", c.text);
    t.title = c.why;
    t.style.marginRight = "4px";
    box.appendChild(t);
  });
  if (e.desc) {
    var d = el("span", null, e.desc);
    d.style.opacity = ".85";
    box.appendChild(d);
  }
  return box;
}

/* ------------------------------------- what THIS Pokemon's players run ----
   pokebase's per-Pokemon pages, off the live M-C ladder: of the people using
   Kingambit, 99.1% run Sucker Punch, 37.6% hold a Chople Berry, 94% pick
   Defiant, 86.9% go Adamant.

   The global tables answer "how used is Sucker Punch". This answers the
   question a build actually asks, which is a different question and the one
   worth having while choosing.

   Its own asset because it is fetched WEEKLY - the dex is rebuilt nightly, and
   grouping them would re-download 206 KB every night that had not changed.

   A Mega falls back to its base species: pokebase files usage under the
   species people ladder with, and a Mega Charizard Y is a Charizard holding a
   stone as far as the ladder is concerned. */
function splitsFor(name){
  var all = window.CHAMP_SPLITS || {};
  if (all[name]) return all[name];
  var p = byName[name];
  return (p && p.species && all[p.species]) || null;
}
/* The percentage for one thing, or null when this Pokemon's players do not
   run it at all - which is itself worth showing differently from 0%. */
function splitPct(name, kind, what){
  var s = splitsFor(name);
  var rows = s && s[kind];
  if (!rows) return null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === what) return rows[i][1];
  }
  return null;
}
/* A chip. Above 50% it is the norm, below 5% it is a fringe pick, and saying
   which is more useful than the bare number. */
function usageTag(pct){
  if (pct == null) return null;
  var t = el("span", "tag" + (pct >= 50 ? " ok" : pct < 5 ? " warn" : ""),
             pct + "%");
  t.title = pct >= 50 ? "Most of this Pokemon's players run this"
          : pct < 5 ? "Very few of this Pokemon's players run this"
          : "Some of this Pokemon's players run this";
  return t;
}

/* ------------------------------------------------------- what leaves here --
   The surface of this part. Everything not named below is private to the file:
   `slug` (freeSlug is the only caller) and `toastT` (toast's own timer).

   Until the module pass this list did not exist - every one of these names, and
   the two private ones, was a global that any of the thirteen parts could read
   or overwrite. */
export {
  $, C, COSTS, DEX, FORMS, HOME_ALL, MEGAS_OF, MOVES, MOVE_BY, SORT,
  STAT_KEYS, STAT_LABEL, STONE_OF, TYPE_COLOR,
  bst, byName, catName, defence, dexLabel, dexNo, el, freeSlug, learnset,
  effectChips, effectLine, effectOf, splitPct, splitsFor, usageTag,
  megasFor, natMult, rowMatches, setHomeAll, setSort, sortRows, statAt,
  statLine, toast, typeChip,
};
