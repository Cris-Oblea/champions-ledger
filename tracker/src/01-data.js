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
  /* p[0] ALREADY CARRIES ITS UNIT. This used to append one - " stages" onto
     "1 stages", " turns" onto "8 turns" - and the player read the result on
     his phone: Intimidate saying "1 stages stages" and an item "8 TURNS
     TURNS". The unit is written once, by build_effects.py, where the number
     is extracted. Nothing is added here. */
  (e.t || []).forEach(function(p){
    out.push({text:p[0], why:p[2]});
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
   pokebase's per-Pokemon pages: of the Rillaboom brought to an M-C tournament,
   57.2% held a Miracle Seed, 86.3% were Adamant, 99% ran Grassy Surge, and
   53.9% of their teams also carried Sneasler.

   The global tables answer "how used is Sucker Punch". This answers the
   question a build actually asks, which is a different question and the one
   worth having while choosing.

   WHAT THE NUMBER IS A SHARE OF IS NOT THE SAME IN EVERY SECTION, and it has
   to be said out loud because it decides how the chip may be coloured. A set
   holds one item, one ability, one nature and one spread, so those columns are
   a share of SETS and read directly: 57.2% of them held the Seed. It holds up
   to FOUR moves, and pokebase divides by slots, so the move column sums to 100
   across the whole movepool and its top row is near 25 - Fake Out at 24.6% is
   not a quarter of Rillaboom running it, it is essentially all of them. A fixed
   "50% is popular" rule reads every move in the game as fringe, so emphasis is
   measured against that Pokemon's own top row instead, and the tooltip says
   which denominator it is. Teammates are a share of TEAMS, and a team has five
   other slots, so that column sums to ~400.

   Its own asset because it is fetched WEEKLY - the dex is rebuilt nightly, and
   grouping them would re-download the lot every night unchanged.

   A Mega falls back to its base species: pokebase files usage under the
   species people ladder with, and a Mega Charizard Y is a Charizard holding a
   stone as far as the results are concerned. */
function splitsFor(name){
  var all = (window.CHAMP_SPLITS || {}).p || {};
  if (all[name]) return all[name];
  var p = byName[name];
  return (p && p.species && all[p.species]) || null;
}
/* The regulation these numbers came from, for anything that prints a source. */
function splitsReg(){
  return (window.CHAMP_SPLITS || {}).r || null;
}
/* The percentage for one thing.

   `null` means this Pokemon has no table at all - a species nobody has
   brought - and 0 means the table exists and this is not in it. They are
   different answers and the app shows them differently: silence against a
   measured "nobody". */
function splitPct(name, kind, what){
  var s = splitsFor(name);
  var rows = s && s[kind];
  if (!rows || !rows.length) return null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === what) return rows[i][1];
  }
  return 0;
}
/* That Pokemon's own top row for a section. Rows arrive sorted descending, so
   this is row 0 and not a scan. */
function splitMax(name, kind){
  var s = splitsFor(name);
  var rows = s && s[kind];
  return rows && rows.length ? rows[0][1] : 0;
}
/* A chip, emphasised RELATIVE to that Pokemon's own maximum - see above for
   why a fixed threshold cannot work across sections. */
function usageTag(pct, name, kind){
  if (pct == null) return null;
  var top = splitMax(name, kind) || 100;
  var share = pct / top;
  var t = el("span", "tag" + (share >= 0.5 ? " ok" : pct === 0 ? " warn" : ""),
             (pct === 0 ? "0%" : pct + "%"));
  var of = kind === "m" ? "of this Pokemon's move slots"
         : kind === "t" ? "of its teams also carried this"
         : "of its sets";
  t.title = (pct === 0
        ? "In the table and at 0% — nobody brought this"
        : pct + "% " + of)
    + " · most-run is " + top + "%"
    + (splitsReg() ? " · " + splitsReg() + " tournaments" : "");
  return t;
}

/* --------------------------------------------------------- what WON, and with
   The top 8 of every World Championship, per division, with the exact set the
   Pokemon carried. Everything else in this app is a RATE - how often a thing
   is brought. This is a RESULT: this set, this placement, this player.

   IT IS FILED UNDER THE FORM THAT WAS REGISTERED, which is always the BASE
   one - measured, not assumed: of the 16,875 team slots pokedata publishes,
   exactly zero are written as "Mega something". Takuma Yamazaki won 2026 with
   "Floette [Eternal Flower] @ Floettite", so Floette is who wears the medal.

   This was the other way round for an afternoon and the player corrected it:
   "la base tener la medalla y por consiguiente por el item se sabe que es
   mega". Filing it under the Mega invents an entrant that was never on the
   sheet, and makes a search for Floette come back empty about the team that
   won with one.

   NOTHING IS LOST. The stone is in the set, and the stone settles it - so the
   Mega it becomes and the single ability it gains are both derived for you in
   build_tracker_data.py rather than left as an exercise. The recorded ability
   is the BASE one and that is correct, never mislabelled: it is what the
   Pokemon has until it evolves, and when to evolve is a real decision because
   that ability is doing something until then. */
function podiumFor(name){
  return (C.PODIUM || {})[name] || [];
}
/* The single best finish, as a chip. A Pokemon that has been top 8 eighteen
   times cannot wear eighteen badges, so the row wears its best and the sheet
   lists them all. */
function podiumChip(name){
  var all = podiumFor(name);
  if (!all.length) return null;
  var best = all[0];
  all.forEach(function(e){
    if (e.r < best.r || (e.r === best.r && e.y > best.y)) best = e;
  });
  var place = best.r === 1 ? "1st" : best.r === 2 ? "2nd"
            : best.r === 3 ? "3rd" : best.r + "th";
  var t = el("span", "tag" + (best.r <= 3 ? " gold" : ""),
             "Worlds " + best.y + " · " + place);
  t.title = "Top 8 at " + all.length + " World Championship" +
    (all.length === 1 ? "" : "s") + ": " +
    all.map(function(e){
      return e.y + " " + e.d + " #" + e.r;
    }).join(", ") + ". Open it to see the sets.";
  return t;
}

/* ------------------------------------------------------ nothing cut silently

   NO LIST MAY SHOW FEWER ROWS THAN IT HAS WITHOUT SAYING SO.

   Every picker in the app capped itself and none of them mentioned it: the
   species list in the damage calculator drew 50 of 345 forms, the team's item
   picker 60 of 118, a Pokemon's own movepool 60 - and 131 of the 264
   learnsets in Champions are longer than 60, so half the dex was quietly
   losing moves off the end. The player found it on Rillaboom, 67 moves and 60
   drawn: "no se alcanza a ver toda en el movil, se corta".

   A cap is sometimes right - 512 move rows is too many to draw on a phone -
   but a cap nobody can see is indistinguishable from a Pokemon that does not
   learn the move. This says it, in the same words everywhere. */
function capNote(host, shown, total, what){
  if (shown >= total) return null;
  var n = el("div", "sub");
  n.style.margin = "6px 0 0";
  n.textContent = "Showing " + shown + " of " + total + " " + what +
                  " — type above to narrow the list.";
  host.appendChild(n);
  return n;
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
  bst, byName, capNote, catName, defence, dexLabel, dexNo, el, freeSlug,
  learnset,
  effectChips, effectLine, effectOf, podiumChip, podiumFor, splitMax, splitPct,
  splitsFor, splitsReg, usageTag,
  megasFor, natMult, rowMatches, setHomeAll, setSort, sortRows, statAt,
  statLine, toast, typeChip,
};
