/* Everything the app can work out about a team without drawing it: the
   six slots, what a slot becomes if it Mega Evolves, the clause report, the
   Speed order and the shared weaknesses. teamReport, teamSpeeds and teamTypes
   are also read by the browser tests (PUBLIC), which assert that they agree. */
import {
  byName, C, COSTS, megasFor, natMult, statAt, STONE_OF,
} from "./data.js";
import { buildLink, hasStone, S } from "./state.js";

/* ===================================================================== teams
   A team is six slots, and a slot points at a BUILD rather than at a box row -
   so one Pokemon can sit in any number of teams and editing its set updates
   every one of them (player, 2026-09-13). A build may itself be unbound, which
   is what lets a team be four-sixths real and still worth writing down: he
   asked to be told what he has, where it is, and what is still missing.

   THE ITEM LIVES ON THE SLOT. Not a layout choice - the Item Clause means six
   Pokemon field exactly one Sitrus Berry, so an item stored per build is a
   preference that cannot survive contact with a team. That is why builds
   deliberately carry no item at all. */
var TEAM_SLOTS = 6;

/* What gets written. Built in one place because it is now saved from two -
   the Save button, and the quick jump into a build's editor, which has to
   put this draft somewhere before it leaves the screen. */
function teamDoc(draft){
  return {name: draft.name,
          slots: draft.slots.filter(function(x){ return x?.build_id; }),
          notes: draft.notes || {}};
}

/* WHAT THIS SLOT BECOMES IF IT MEGA EVOLVES, or null.

   Two routes, because the stone is recorded in two places for two different
   reasons and both are real. A BUILD declares its `mega` - the stone is what
   creates the form, so it lives in the build. A SLOT can also hold the stone
   as its item, which is where the Item Clause puts it. Reading only one of
   them would miss half the teams. */
function megaOf(b, slot){
  if (!b) return null;
  if (b.mega && byName[b.mega]) return byName[b.mega];
  if (slot?.item) {
    var ms = megasFor(b.pokemon) || [];
    for (const m of ms) {
      if (m && STONE_OF[m.name] === slot.item) return m;
    }
  }
  return null;
}

function teamSlots(t){
  var out = (t?.slots || []).slice(0, TEAM_SLOTS);
  while (out.length < TEAM_SLOTS) out.push({});
  return out;
}

/* Everything the app can work out about a team, in one pass, so the sheet and
   the list agree by construction rather than by both remembering. */
function teamReport(t){
  var slots = teamSlots(t), r = {
    slots: [], filled: 0, ready: 0, problems: [], warnings: [],
    missing: [], stones: [], speeds: [],
    /* the slots whose stone changes something the screen shows - what makes
       the type table and the Speed order more than one table each */
    megaCases: []
  };
  var itemSeen = {}, formSeen = {};
  slots.forEach(function(sl, i){
    var b = sl.build_id ? S.builds[sl.build_id] : null;
    var info = {i: i, slot: sl, build: b, name: b?.pokemon};
    if (b) {
      r.filled++;
      var lk = buildLink(sl.build_id);
      info.state = lk.state;
      info.row = lk.row;
      /* "ready" means it could be brought TODAY: the Pokemon exists and is in
         the Champions box. Parked in HOME is one recall away; unbound is not
         owned at all. */
      if (lk.state === "active") r.ready++;
      else if (lk.state === "parked")
        r.warnings.push(b.pokemon + " is parked in HOME - recall it before you can play it");
      else if (lk.state === "orphan")
        r.problems.push(b.pokemon + "'s build points at a Pokemon that is gone");
      else r.missing.push(b.pokemon);

      var p = byName[b.pokemon];
      /* THE SPEED THE BUILD ACTUALLY HAS, not its species' base row:

           "seria bueno que representara el numero real de la build de cada
            pokemon, para saber quien es mas rapido en mi build y saber el
            orden correcto como saber quien es mas lento en mis builds de mi
            team."   (player, 2026-09-21)

         Base Speed cannot answer that. Two builds of the same species differ
         by 32 SP and a nature - 0.9 to 1.1 is a fifth of the number either
         way - which is most of what a Speed order is decided by, and it is
         precisely the part a Trick Room team is built around. Same formula
         the calculator and the SP editor use, at level 50.

         READ OFF THE FORM IT PLAYS AS, Mega included, like every other number
         on this screen: Garchomp is 102 and Mega Garchomp Z is 151, so a
         Speed order quoting the base row for a build carrying the stone names
         the wrong one as moving first. */
      var mg = megaOf(b, sl);
      if (p) {
        info.p = p;
        info.types = p.types;
        info.mega = mg || null;
        info.sp = b.stat_points?.spe || 0;
        info.nature = b.nature || "";
        /* A SCENARIO IS EARNED BY A CHANGE, whichever half of the screen it
           lands in. The stone swaps the typing, the stats, or both - and the
           player settled the model by naming the reason (2026-09-21): "el
           pokemon solo cambia de stat al mega evolucionar y si no mega
           evoluciona la tabla de speed no cambia".

           So the two sections answer to ONE selector, and the list is the
           union of what either of them would notice. Mega Sceptile retypes
           AND gains 25 Speed; Mega Camerupt keeps Fire/Ground and drops from
           40 to 20, which the type table cannot see and the Speed order very
           much can. Filing scenarios by retyping alone would have lost it. */
        if (mg) {
          var retype = mg.types.join("/") !== p.types.join("/");
          var respeed = mg.b[5] !== p.b[5];
          if (retype) info.megaTypes = mg.types;
          if (retype || respeed) {
            r.megaCases.push({i: i, name: b.pokemon, mega: mg.name,
                              retype: retype, respeed: respeed,
                              from: p.types, to: mg.types,
                              speFrom: p.b[5], speTo: mg.b[5]});
          }
        }
        /* Species Clause is per FORM, not per species: two Squawkabilly of
           different plumage still cannot share a team. */
        if (formSeen[b.pokemon]) r.problems.push("two " + b.pokemon + " - the Species Clause forbids it");
        formSeen[b.pokemon] = 1;
      }
      if (b.mega) {
        var st = STONE_OF[b.mega];
        r.stones.push({name: b.mega, stone: st, owned: st ? hasStone(st) : false});
      }
    }
    if (sl.item) {
      if (itemSeen[sl.item]) r.problems.push("two " + sl.item + " - the Item Clause allows one per team");
      itemSeen[sl.item] = 1;
    }
    r.slots.push(info);
  });
  /* Several stones are legal and most Worlds teams carried two; only one
     Pokemon may actually Mega Evolve in a battle. A warning, never a block. */
  if (r.stones.length > 1)
    r.warnings.push(r.stones.length + " Mega Stones - legal, but only one can " +
                    "Mega Evolve per battle, so it is a team-preview choice");
  r.stones.filter(function(x){ return x.stone && !x.owned; }).forEach(function(x){
    r.warnings.push(x.stone + " is not owned, so " + x.name + " is not reachable yet");
  });
  /* THE BASE WORLD, so `r.speeds` still means one definite thing. Every
     other world is asked for by name through teamSpeeds(). */
  r.speeds = teamSpeeds(r, null);
  return r;
}

/* The Speed order for one outcome. `megaAt` is the slot that Mega Evolved,
   or null for nobody - the same argument teamTypes takes, because they are
   two readings of the same battle and must never disagree on screen.

   A Pokemon only gains the Mega's stats by evolving, so an unevolved slot is
   its base row no matter what stone it is carrying. That is the whole reason
   this is a selector and not four Megas listed at once, which is what it used
   to be and could not happen. */
function teamSpeeds(r, megaAt){
  var out = [];
  r.slots.forEach(function(s, i){
    if (!s.build || !s.p) return;
    var evolved = megaAt != null && i === megaAt && s.mega;
    var row = evolved ? s.mega : s.p;
    out.push({name: s.name,
              form: evolved ? s.mega.name : s.name,
              mega: evolved,
              base: row.b[5],
              nature: s.nature,
              sp: s.sp,
              spe: statAt(row.b[5], s.sp, false, natMult(s.nature, "spe"))});
  });
  out.sort(function(a, b){ return b.spe - a.spe; });
  return out;
}

/* What the six of them, together, are weak to. The chart is already shipped,
   so this is a count rather than a claim: how many of the team take super
   effective damage from each attacking type, and how many resist it. */
/* `megaAt` is the slot index that has Mega Evolved, or null for nobody.

   ONE TABLE WAS NEVER THE TRUTH FOR A TEAM CARRYING A RETYPING STONE, and the
   player named the shape himself (2026-09-21):

     "podria la tabla mencionar dos casos cuando se hallen? ... si mi equipo
      tiene 2 megapiedras, hacer dos tablas cuando una o ambos de los pokemones
      que evolucionan cambian de tipo ... también es importante mencionar que a
      veces no se megaevoluciona de inmediato porque es preferible esperar tal
      vez para resistir algo, entre otros. así que también debería quedar una
      tabla antes de ser mega si el tipo cambiase."

   Both halves are right and both are already rules of this format. Only ONE
   Pokemon may Mega Evolve per battle, so two stones are two different teams
   and never one, which is why they cannot be merged into a single table. And
   "before" is not a transitional state to be skipped: Mega Evolution resolves
   AFTER switch-ins, so the base typing is what takes the first hit, and
   staying in base form to resist something is a real play. */
function teamTypes(r, megaAt){
  var out = [];
  /* Stellar is in the chart and NOT in Champions - there is no Tera here, so
     no move can be that type and counting it would invent a weakness. */
  Object.keys(C.CHART).filter(function(t){ return t !== "Stellar"; })
        .forEach(function(atk){
    /* THE NAMES, not just the tally. "Fire: 3 weak, 1 resist" is a count of
       a thing you then have to work out for yourself, one Pokemon at a time
       (player, 2026-09-21: "no dice quien es debil a que cosa ni tampoco
       quien resiste que cosa"). The multiplier rides along because x4 and x2
       are not the same problem, and neither are x0.25 and x0.5. */
    var weakOf = [], resistOf = [];
    r.slots.forEach(function(s, si){
      if (!s.types || !s.name) return;
      var evolved = megaAt != null && si === megaAt && s.megaTypes;
      var types = evolved ? s.megaTypes : s.types;
      var who = evolved ? s.mega.name : s.name;
      var m = 1;
      types.forEach(function(t){
        var v = C.CHART[atk]?.[t];
        m *= (v == null ? 1 : v);
      });
      if (m > 1) weakOf.push({name: who, m: m});
      else if (m < 1) resistOf.push({name: who, m: m});
    });
    /* worst first on each side, so the x4 leads the weaknesses and the
       immunity leads the resistances */
    weakOf.sort(function(a, b){ return b.m - a.m; });
    resistOf.sort(function(a, b){ return a.m - b.m; });
    out.push({type: atk, weak: weakOf.length, resist: resistOf.length,
              weakOf: weakOf, resistOf: resistOf});
  });
  return out.sort(function(a, b){ return b.weak - a.weak || a.resist - b.resist; });
}

/* ------------------------------------------------ WHAT CAN ACTUALLY BE HELD --
   Two things were wrong with the pool this picker offered, and the player hit
   both in the same minute (2026-09-21):

     "en el apartado de items no puedo equipar mega piedras!"
     "los items miscellaneous no se pueden equipar...."
     "solo necesito los hold items (los berries son hold items igual) y las
      mega piedras para equiparlas..."

   THE STONES WERE NEVER IN THE LIST. `build_tracker_data.py` skips every row
   with `is_mega_stone` when it builds C.ITEMS - deliberately, because the
   Items tab gives them a pane of their own - so all 81 of them were missing
   from the one screen where an item is actually equipped. They come from
   C.STONES here instead, which is [stone, mega, species].

   AND A THIRD OF WHAT WAS THERE COULD NOT BE HELD. 33 of the 118 rows are
   Miscellaneous, which is the game's bucket for things that are not held at
   all, so they were a third of the list you scroll through and none of them
   was ever an answer.

   Berries are Hold Items in every sense that matters here - the category is
   the shop's shelf, not a rule - so they stay, and the chip stays with them
   because "which Berry" is a real question. */
function holdable(){
  var out = (C.ITEMS || []).filter(function(it){
    var cat = it[2] || "Miscellaneous";
    return cat === "Hold Items" || cat === "Berries";
  }).map(function(it){
    return {name: it[0], vp: it[1], cat: it[2] || "Hold Items",
            text: it[3] || "", stone: false};
  });
  /* one row per STONE, not per Mega: Charizardite X and Y are two stones and
     one species, and the mapping is 1:1 over all 81 */
  var seen = {};
  (C.STONES || []).forEach(function(r){
    var st = r[0];
    if (!st || seen[st]) return;
    seen[st] = 1;
    out.push({name: st, vp: COSTS.mega_stone_shop, cat: "Mega Stones",
              text: "Mega Evolves " + (r[2] || r[1]) + " into " + r[1] + ".",
              stone: true});
  });
  out.sort(function(a, b){ return a.name.localeCompare(b.name); });
  return out;
}

export {
  holdable, TEAM_SLOTS, teamDoc, teamReport, teamSlots, teamSpeeds, teamTypes,
};
