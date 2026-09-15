/* 11-damage.js - Smogon's engine, and the calculator screen around it.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import {
  $, C, DEX, MOVE_BY, STAT_KEYS, STAT_LABEL, byName, catName, el, learnset,
  natMult, statAt, toast, typeChip,
} from "./01-data.js";
import { closeSheet, openSheet } from "./04-nav.js";
import { S } from "./02-state.js";
/* The modifier tables - which item, weather, terrain and berry touch which
   type. They live in 10-scan for a historical reason and not a good one; this
   import is what finally says so out loud. */
import { BERRY_TYPE, MODS, TERRAIN_MOVE, TYPE_ITEM, WEATHER_MOVE, modFor }
  from "./10-scan.js";
/* One label: whether a move hits both opponents. 12-find imports this file
   back for the ability set, and the cycle costs nothing - both sides are
   function declarations, called from a click, never while loading. */
import { spreadTags } from "./12-find.js";
/* ================================================== the damage calculator ==
   A port of scripts/damage.py, which reproduces all 504 numbers in
   data/meta/speed_tiers.json and agrees with Smogon's own Champions engine on
   895 of 909 cases. Every rounding step is kept where it is: collapsing them
   into one multiply is off by a point or two, and a point is exactly what a
   survival benchmark turns on.

     stat  = floor((base + clamp(SP,0,32) + (75 if HP else 20)) * nature)
     base  = floor(floor(floor(2*50/5+2) * power * A / D) / 50) + 2      */
var LEVEL = 50;
function pokeRound(x){ return (x % 1) <= 0.5 ? Math.floor(x) : Math.floor(x) + 1; }

function weightOf(name){
  var w = C.WEIGHT || {};
  if (w[name] != null) return w[name];
  var p = byName[name];
  return p && w[p.species] != null ? w[p.species] : null;
}
/* Champions stores these four at power 1 because the real number comes from
   weight; without this they calculate as nothing at all. */
function weightPower(move, atk, def){
  var n = move.name, tw = weightOf(def.name);
  if (n === "Low Kick" || n === "Grass Knot") {
    if (tw == null) return null;
    var t = [[10,20],[25,40],[50,60],[100,80],[200,100]];
    for (var i = 0; i < t.length; i++) if (tw < t[i][0]) return t[i][1];
    return 120;
  }
  if (n === "Heavy Slam" || n === "Heat Crash") {
    var aw = weightOf(atk.name);
    if (tw == null || aw == null || tw <= 0) return null;
    var r = aw / tw, u = [[5,120],[4,100],[3,80],[2,60]];
    for (var j = 0; j < u.length; j++) if (r >= u[j][0]) return u[j][1];
    return 40;
  }
  return null;
}
function typeMult(mt, defTypes){
  var m = 1;
  defTypes.forEach(function(t){
    var row = C.CHART[mt];
    if (row && row[t] != null) m *= row[t];
  });
  return m;
}
function boostMult(stages){
  return stages >= 0 ? (2 + stages) / 2 : 2 / (2 - stages);
}

var STAT_IDX = {hp:0, atk:1, def:2, spa:3, spd:4, spe:5};

/* o: {atk, def, move, atkSp, atkNature, atkBoost, defHpSp, defSp, defNature,
      defBoost, defAtkSp, spread, screen, itemMult, powerMult, crit,
      adaptability, typeOverride} */
function calcDamage(o){
  var A = o.atk, D = o.def, M = o.move, notes = [];
  // the screen guards against this, but a bad name should not take the page
  // down - say what is missing instead
  if (!A || !D || !M) {
    return {lo:0, hi:0, hp:1, rolls:[], hits:0, te:1, stab:false, power:0,
            mtype:"", Aatk:0, Ddef:0,
            notes:[["bad", "Not in the Champions dex: " +
              [!A && "attacker", !D && "defender", !M && "move"]
                .filter(Boolean).join(", ")]]};
  }
  var power = M.bp || 0;

  var wp = weightPower(M, A, D);
  if (wp != null) {
    power = wp;
    notes.push(["", M.name + " takes its power from weight: " + wp + " BP (" +
      A.name + " " + weightOf(A.name) + "kg vs " + D.name + " " +
      weightOf(D.name) + "kg)"]);
  }

  var mtype = M.type;
  var ft = (C.FORM_TYPED[M.name] || {})[A.name];
  if (ft) {
    mtype = ft;
    notes.push(["warn", M.name + " takes " + A.name + "'s form: " + ft +
      ", not the Normal in the move row"]);
  }
  if (o.typeOverride && o.typeOverride !== mtype) {
    mtype = o.typeOverride;
    notes.push(["warn", M.name + " resolved as " + mtype + " for this team"]);
  }

  if (!o.magicRoom && o.atkItem && TYPE_ITEM[o.atkItem] === mtype) {
    /* a type-boosting item raises BASE POWER. Applying it to the final damage
       instead is off by a point, which is the whole margin on a survival
       benchmark - the same note damage.py carries. */
    power = pokeRound(power * 4915 / 4096);
    notes.push(["", o.atkItem + ": base power x1.2 -> " + power]);
  }
  if (o.powerMult && o.powerMult !== 1) {
    /* a type-boosting item raises BASE POWER; applying it at the end is off by
       a point, which is the whole margin on a survival benchmark */
    power = pokeRound(power * o.powerMult);
    notes.push(["", "item: base power x" + o.powerMult + " -> " + power]);
  }

  var phys = M.cat === "P";
  var aKey = phys ? "atk" : "spa", dKey = phys ? "def" : "spd";
  if (M.name === "Psyshock") {
    dKey = "def";
    notes.push(["warn", "Psyshock is Special but attacks the target's Defense"]);
  }
  if (M.name === "Body Press") {
    aKey = "def";
    notes.push(["", "Body Press attacks off the user's Defense"]);
  }

  var Aatk;
  if (M.name === "Foul Play") {
    Aatk = statAt(D.b[1], o.defAtkSp || 0, false, natMult(o.defNature, "atk"));
    notes.push(["warn", "Foul Play attacks off the TARGET's Attack -> " + Aatk]);
  } else {
    Aatk = statAt(A.b[STAT_IDX[aKey]], o.atkSp || 0, false,
                  natMult(o.atkNature, aKey));
  }
  /* Wonder Room swaps Defense and Sp. Def outright - it is not a multiplier,
     so it has to happen before the stat is read. */
  var dReadKey = dKey;
  if (o.wonderRoom && dKey !== "hp") {
    dReadKey = dKey === "def" ? "spd" : "def";
    notes.push(["warn", "Wonder Room: Defense and Sp. Def are swapped"]);
  }
  var Ddef = statAt(D.b[STAT_IDX[dReadKey]], o.defSp || 0, false,
                    natMult(o.defNature, dReadKey));

  var boosts = o.atkBoost || 0;
  if (M.name === "Meteor Beam" || M.name === "Electro Shot") {
    /* they raise Sp. Atk on the charging turn, so by the time they land the
       boost is always there - part of the move, not a condition */
    boosts += 1;
    notes.push(["", M.name + " charges first: +1 Sp. Atk (x1.5) already applied"]);
  }
  if (boosts) Aatk = Math.floor(Aatk * boostMult(boosts));
  /* a defensive boost only protects the side it sits on */
  if (o.defBoost) Ddef = Math.floor(Ddef * boostMult(o.defBoost));
  /* Sand and Snow do not multiply damage - they raise a DEFENCE. Sand gives a
     Rock type +50% Sp. Def, Snow gives an Ice type +50% Defense. Measured
     against the engine as x0.667 on the damage, which is the same thing from
     the other side. Player, 2026-09-09. */
  if (o.weather === "Sand" && D.types.indexOf("Rock") >= 0 && dKey === "spd") {
    Ddef = Math.floor(Ddef * 1.5);
    notes.push(["warn", "Sand: " + D.name + " is Rock, so its Sp. Def is x1.5"]);
  }
  if (o.weather === "Snow" && D.types.indexOf("Ice") >= 0 && dKey === "def") {
    Ddef = Math.floor(Ddef * 1.5);
    notes.push(["warn", "Snow: " + D.name + " is Ice, so its Defense is x1.5"]);
  }

  var stab = A.types.indexOf(mtype) >= 0;
  var stabMult = o.adaptability ? 8192 : 6144;   /* 2.0 vs 1.5, in 4096ths */
  if (stab) notes.push(["ok", o.adaptability
    ? "STAB x2.0 (Adaptability)" : "STAB x1.5"]);
  var defTypes = D.types;
  if (o.gravity && defTypes.indexOf("Flying") >= 0) {
    /* Gravity grounds a Flying type: the Ground immunity simply stops
       existing, which is a change to the type chart, not a multiplier. */
    defTypes = defTypes.filter(function(t){ return t !== "Flying"; });
    if (!defTypes.length) defTypes = ["Normal"];
    notes.push(["warn", "Gravity: " + D.name + " is grounded, so its Flying " +
      "half does not apply"]);
  }
  var te = typeMult(mtype, defTypes);
  notes.push([te > 1 ? "ok" : te < 1 ? "warn" : "",
    mtype + " vs " + defTypes.join("/") + ": x" + te]);


  var extra = 1, atkT = A.types;
  /* Protect ends it before anything else is worth computing. */
  if (o.protected) {
    notes.push(["ok", "the target is protecting: nothing lands"]);
    return {lo:0, hi:0, hp:statAt(D.b[0], o.defHpSp || 0, true, 1), rolls:[],
            hits:0, notes:notes, te:te, stab:false, power:0, mtype:mtype,
            Aatk:0, Ddef:0};
  }
  /* Every one of these was measured against the engine; the numbers are in
     data/db/modifiers.json and the cases in scripts/measure_modifiers.py. */
  if (o.helpingHand) { power = pokeRound(power * 6144 / 4096);
    notes.push(["", "Helping Hand: base power x1.5 -> " + power]); }
  if (o.friendGuard) { extra *= 3072 / 4096;
    notes.push(["warn", "Friend Guard on the target's side: x0.75"]); }
  if (o.charge && mtype === "Electric") { power = pokeRound(power * 2);
    notes.push(["", "Charge: base power doubled -> " + power]); }
  if (o.fairyAura && mtype === "Fairy") { extra *= 5365 / 4096;
    notes.push(["", "Fairy Aura: x1.31"]); }
  if (o.atkStatus === "brn" && M.cat === "P") { extra *= 2048 / 4096;
    notes.push(["warn", "the attacker is burned: physical damage halved"]); }
  if (o.magicRoom) notes.push(["warn",
    "Magic Room: held items do nothing while it is up"]);
  /* WHERE a modifier lands matters as much as its size. The engine folds an
     ability into the BASE POWER and a damage-reduction ability into the final
     number, and each has its own rounding step - applying them all at the end
     is off by a point or two, which is the margin a survival benchmark turns
     on. FINAL_ONLY is the set that really does act on the finished damage. */
  var FINAL_ONLY = {"Filter":1, "Solid Rock":1, "Multiscale":1, "Life Orb":1,
                    "Expert Belt":1, "Chople Berry":1, "Colbur Berry":1};
  [["atk_ability", o.atkAbility], ["def_ability", o.defAbility],
   ["atk_item", o.atkItem], ["def_item", o.defItem]].forEach(function(r){
    if (o.magicRoom && (r[0] === "atk_item" || r[0] === "def_item")) return;
    if (r[0] === "atk_item" && TYPE_ITEM[r[1]]) return;   // already in the BP
    var x = modFor(r[0], r[1], M, mtype, te, atkT);
    if (x === null) return;
    if (x === 0) { extra = 0;
      notes.push(["ok", r[1] + ": it does not land at all"]); return; }
    if (FINAL_ONLY[r[1]]) extra *= x;
    else { power = pokeRound(power * x);
           notes.push(["", r[1] + ": base power x" + x + " -> " + power]);
           return; }
    notes.push([x > 1 ? "" : "warn", r[1] + ": x" + x]);
  });
  /* a resist berry halves a super-effective hit of its own type. Only here -
     the measured table also lists Chople and Colbur, and letting both fire
     quartered the damage instead of halving it. */
  if (o.defItem && BERRY_TYPE[o.defItem] === mtype && te > 1 &&
      !(MODS.def_item || {})[o.defItem]) {
    extra *= 2048 / 4096;
    notes.push(["warn", o.defItem + " halves this: x0.5"]);
  }
  /* a type-boosting item raises base power, so it is folded in above, not here */
  if (o.weather) {
    var wk = (WEATHER_MOVE[o.weather] || {})[mtype];
    var wx = wk && (MODS.weather || {})[wk];
    if (wx) { extra *= wx;
      notes.push([wx > 1 ? "" : "warn", o.weather + " on a " + mtype +
        " move: x" + wx]); }
  }
  if (o.terrain) {
    var tk = (TERRAIN_MOVE[o.terrain] || {})[mtype];
    var tx = tk && (MODS.terrain || {})[tk];
    if (tx) { power = pokeRound(power * tx);
      notes.push([tx > 1 ? "" : "warn", o.terrain + " Terrain on a " + mtype +
        " move: base power x" + tx + " -> " + power]); }
    /* Grassy Terrain halves Earthquake's BASE POWER, not its damage - which is
       why the engine's range comes out WIDER than a halved one, and how this
       was caught. Bulldoze and Magnitude go the same way. */
    if (o.terrain === "Grassy" &&
        ["Earthquake", "Bulldoze", "Magnitude"].indexOf(M.name) >= 0) {
      power = pokeRound(power * 2048 / 4096);
      notes.push(["warn", "Grassy Terrain halves " + M.name +
        "'s base power -> " + power]);
    }
  }

  var Dhp = statAt(D.b[0], o.defHpSp || 0, true, 1);
  var base = Math.floor(Math.floor(Math.floor(2 * LEVEL / 5 + 2) * power * Aatk / Ddef) / 50) + 2;

  if (o.spread) {
    base = pokeRound(base * 3072 / 4096);
    notes.push(["warn", "spread move in doubles: x0.75 - but only while TWO " +
      "targets are alive. With one left it is full power."]);
  }
  if (M.crit || o.crit) {
    base = Math.floor(base * 1.5);
    notes.push(["", M.crit ? "always a critical hit: x1.5" : "critical hit: x1.5"]);
  }

  /* each screen covers ITS OWN category: Reflect stops physical, Light Screen
     stops special, Aurora Veil both. Applying any of them to any move halves
     the wrong attacks - a Reflect was cutting Flamethrower. A critical hit
     goes through a screen outright. */
  var COVERS = {"Reflect":["P"], "Light Screen":["S"], "Aurora Veil":["P","S"]};
  var covered = o.screen && (COVERS[o.screen] || []).indexOf(M.cat) >= 0;
  var critting = M.crit || o.crit;
  var screenOn = covered && !critting;
  var screenMult = screenOn ? 2732 / 4096 : 1;
  if (screenOn) notes.push(["warn", o.screen + " in doubles: x0.667"]);
  else if (o.screen && covered)
    notes.push(["", o.screen + " is ignored: a critical hit goes through it"]);
  else if (o.screen)
    notes.push(["", o.screen + " does not cover " + catName(M.cat).toLowerCase() +
      " moves - no reduction"]);

  /* the measured multipliers: ability, item, weather and terrain, each one
     only where it actually applies. An immunity comes back as 0 and ends it. */
  var rolls = [];
  for (var i = 0; i < 16; i++) {
    var d = Math.floor(base * (85 + i) / 100);
    if (stab) d = Math.floor(d * stabMult / 4096);
    d = Math.floor(pokeRound(d) * te);
    if (extra !== 1) d = pokeRound(d * extra);
    if (o.itemMult && o.itemMult !== 1) d = pokeRound(d * o.itemMult);
    if (screenMult !== 1) d = pokeRound(d * screenMult);
    /* an immunity is ZERO; the minimum-1 floor is only for a move that lands */
    rolls.push(te === 0 ? 0 : Math.max(1, Math.floor(d)));
  }
  var lo = rolls[0], hi = rolls[15], hits = 1;

  if (M.hits) {
    var loN = M.hits[0], hiN = M.hits[1];
    if (M.name === "Triple Axel") {
      /* 20 then 40 then 60 BP - the rounding makes a 40 BP hit more than twice
         a 20 BP one, so each is calculated at its own power */
      var per = [20, 40, 60].map(function(bp){
        var sub = {};
        Object.keys(o).forEach(function(k){ sub[k] = o[k]; });
        var m2 = {};
        Object.keys(M).forEach(function(k){ m2[k] = M[k]; });
        m2.bp = bp; m2.hits = null;
        sub.move = m2;
        var r = calcDamage(sub);
        return [r.lo, r.hi];
      });
      lo = per.reduce(function(a, x){ return a + x[0]; }, 0);
      hi = per.reduce(function(a, x){ return a + x[1]; }, 0);
      hits = 3;
      notes.push(["warn", "Triple Axel: 3 hits at 20/40/60 BP. It ends early " +
        "on a miss, so 1 or 2 hits are real outcomes."]);
    } else {
      var n = loN !== hiN ? loN + 1 : loN;
      lo *= n; hi *= n; hits = n;
      notes.push(["", M.name + ": " + n + " hits of " + rolls[0] + "-" + rolls[15] +
        (loN === hiN ? "" : " (the " + loN + "-" + hiN + " average)")]);
      if (loN !== hiN) notes.push(["", "worst case " + loN + " hits: " +
        (rolls[0] * loN) + "-" + (rolls[15] * loN) + "   |   Skill Link is " +
        "always " + hiN + ": " + (rolls[0] * hiN) + "-" + (rolls[15] * hiN)]);
    }
  }
  return {lo:lo, hi:hi, hp:Dhp, rolls:rolls, hits:hits, notes:notes,
          te:te, stab:stab, power:power, mtype:mtype, Aatk:Aatk, Ddef:Ddef};
}

/* How many of these does it take? A KO count, because that is the only thing
   the player counts as a real change - a percentage drop is decoration. */
function koCount(lo, hi, hp){
  if (hi <= 0) return {text:"it does nothing", n:Infinity};
  var best = Math.ceil(hp / hi), worst = Math.ceil(hp / lo);
  function label(n){ return n + "HKO"; }
  if (best === worst) return {text:"guaranteed " + label(best), n:best};
  return {text:label(best) + " on a high roll, " + label(worst) + " otherwise",
          n:best};
}

/* ============================================ the calculator, for real =====
   This does not approximate Smogon's engine - it runs it. The bundle is the
   vendored calc/ compiled for the browser by scripts/build_engine_bundle.py.

   The port that used to live here agreed on the plain cases and drifted by a
   point or two once modifiers stacked, because the real chain runs in four
   separate buckets - base power, attack, defence, final - each chained in
   4096-space with its own rounding step. One point can turn a 2HKO into a
   3HKO, and the KO count is the only thing that counts. */
function engineReady(){
  return !!(window.SMOGON && window.SMOGON.calculate);
}

/* Our spelling is Serebii's ("Mega Glalie"); the engine answers to its own
   ("Glalie-Mega"). The table is precomputed by build_tracker_data.py through
   query.norm(), which has 44 locked test cases - porting that matcher to JS
   would be a second implementation to keep in step. Aegislash is the one form
   whose name depends on the side: it attacks as Blade, and is hit as Shield. */
function engName(name, attacking){
  if (name === "Aegislash" || name === "Aegislash-Shield" ||
      name === "Aegislash-Blade") {
    return (C.AEGIS || {})[attacking ? "attacking" : "defending"] ||
           "Aegislash-Shield";
  }
  return (C.SMOGON_NAME || {})[name] || name;
}

/* our SP object -> the engine's evs, and our boost object -> its boosts */
function engSide(side, P){
  var evs = {}, boosts = {};
  STAT_KEYS.forEach(function(k){
    if (side.sp[k]) evs[k] = side.sp[k];
    if (k !== "hp" && side.boost[k]) boosts[k] = side.boost[k];
  });
  if (side._plusOne) {
    ["atk", "def", "spa", "spd", "spe"].forEach(function(k){
      if (!boosts[k]) boosts[k] = 1;
    });
  }
  var o = {evs: evs, boosts: boosts};
  if (side.nature) o.nature = side.nature;
  if (side.ability) o.ability = side.ability;
  if (side.item) o.item = side.item;
  if (side.status) o.status = side.status;
  if (side.curHP != null && side.curHP !== "") o.curHP = Number(side.curHP);
  return o;
}

function engineCalc(){
  var S = window.SMOGON;
  var a = CALC.atk, d = CALC.def, m = CALC.move;
  var an = engName(a.name, true), dn = engName(d.name, false);
  if (!(C.SMOGON_NAME || {})[a.name] && a.name !== "Aegislash")
    throw new Error(a.name + " is not in Smogon's Champions roster, so the " +
      "engine has no stats for it.");
  if (!(C.SMOGON_NAME || {})[d.name] && d.name !== "Aegislash")
    throw new Error(d.name + " is not in Smogon's Champions roster, so the " +
      "engine has no stats for it.");
  a._plusOne = CALC.plusOneAtk; d._plusOne = CALC.plusOneDef;
  var A = new S.Pokemon(S.gen, an, engSide(a, byName[a.name]));
  var D = new S.Pokemon(S.gen, dn, engSide(d, byName[d.name]));
  var M = new S.Move(S.gen, m.name, {isCrit: !!CALC.crit});
  /* Champions is doubles. The engine takes the x0.75 off the move's target and
     the game type, and has no idea how many Pokemon are actually out - so a
     1-vs-1 endgame is expressed by switching to Singles, exactly as
     scripts/damage.py does with --single-target. */
  var singleTarget = CALC.gameType === "Singles";
  var F = new S.Field({
    gameType: CALC.gameType || "Doubles",
    weather: CALC.weather || undefined,
    terrain: CALC.terrain || undefined,
    isGravity: !!CALC.gravity,
    isWonderRoom: !!CALC.wonderRoom,
    isMagicRoom: !!CALC.magicRoom,
    /* An ability, not a field state - so it comes from whoever has it. But in
       doubles that can be an ALLY who is not in this calculation (Mega Floette
       is the only holder in Champions). Smogon's own Field panel does NOT
       expose it as a switch for exactly this reason, so neither does this one:
       it comes from the ability select and nowhere else. */
    isFairyAura: (a.ability === "Fairy Aura" || d.ability === "Fairy Aura"),
    attackerSide: {
      isHelpingHand: !!CALC.helpingHand,
      isCharge: !!CALC.charge,
      isTailwind: !!CALC.tailwindAtk,
      isPowerTrick: !!CALC.powerTrickAtk
    },
    defenderSide: {
      isReflect: CALC.screen === "Reflect",
      isLightScreen: CALC.screen === "Light Screen",
      isAuroraVeil: CALC.screen === "Aurora Veil",
      isFriendGuard: !!CALC.friendGuard,
      isProtected: !!CALC.protected,
      isSR: !!CALC.stealthRock,
      spikes: CALC.spikes || 0,
      isSeeded: !!CALC.leechSeed,
      isSaltCured: !!CALC.saltCure,
      isNightmared: !!CALC.nightmare,
      isPowerTrick: !!CALC.powerTrickDef,
      isSwitching: CALC.switching ? "out" : undefined
    }
  });
  var r = S.calculate(S.gen, A, D, M, F);
  var flat = [];
  (Array.isArray(r.damage[0]) ? r.damage : [r.damage]).forEach(function(x){
    flat = flat.concat(x);
  });
  /* For a multi-hit the engine gives one array PER HIT, so what the target
     takes is the per-hit minimum summed to the per-hit maximum summed - never
     the min and max of the flattened list. */
  var lo, hi;
  if (Array.isArray(r.damage[0])) {
    lo = 0; hi = 0;
    r.damage.forEach(function(x){
      lo += Math.min.apply(null, x); hi += Math.max.apply(null, x);
    });
  } else {
    lo = Math.min.apply(null, flat); hi = Math.max.apply(null, flat);
  }
  var desc = "";
  try { desc = r.desc(); } catch (e) { desc = ""; }
  var ko = "";
  try { ko = r.koChanceText ? r.koChanceText() : ""; } catch (e) { ko = ""; }
  return {lo:lo, hi:hi, hp:D.maxHP(), curHP:D.curHP(), rolls:flat, desc:desc,
          koText:ko, singleTarget:singleTarget,
          hits:(Array.isArray(r.damage[0]) ? r.damage.length : 1)};
}

/* ------------------------------------------------- the calculator's screen --
   Either side can be loaded from a saved build or set by hand, because the
   question is usually asymmetric: your own Pokemon is built, the opponent's is
   whatever the ladder brings. */
var CALC = {
  atk: {name:null, buildId:null, sp:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},
        boost:{atk:0,def:0,spa:0,spd:0,spe:0}, nature:null,
        ability:null, item:null, status:null, curHP:null},
  def: {name:null, buildId:null, sp:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},
        boost:{atk:0,def:0,spa:0,spd:0,spe:0}, nature:null,
        ability:null, item:null, status:null, curHP:null},
  move: null, gameType:"Doubles", screen:null, crit:false,
  weather: null, terrain: null,
  helpingHand:false, friendGuard:false, charge:false,
  stealthRock:false, spikes:0, leechSeed:false, saltCure:false,
  nightmare:false, switching:false, tailwindAtk:false, powerTrickAtk:false,
  powerTrickDef:false, plusOneAtk:false, plusOneDef:false,
  gravity:false, wonderRoom:false, magicRoom:false, protected:false,
  atkStatus:null,
  spikes: 0
};

/* One side of the calculator: the FULL spread, six stats, the way a real
   calculator does it. The earlier version had a single "SP in the attacking
   stat" box that guessed which stat from the move's category - which is wrong
   the moment you want Sp. Atk and Sp. Def, and wrong again for Body Press and
   Psyshock, where the move does not attack the stat its category implies.

   The Champions budget is enforced here and nowhere else has to: 66 points
   total, 32 in any one stat. */
/* One stat line. Labelled when a Pokemon has more than one, because "60 / 50 /
   140 / 50 / 140 / 60" means nothing without knowing which forme it is. */
function statSpan(b, formName){
  var sp = el("span", "mono",
    (formName ? formName + " " : "base ") + b.join(" / "));
  sp.title = STAT_KEYS.map(function(k, i){
    return STAT_LABEL[k] + " " + b[i];
  }).join("  ·  ");
  return sp;
}

function calcSideCtl(which){
  var side = CALC[which], host = $(which === "atk" ? "calcAtk" : "calcDef");
  host.innerHTML = "";

  var pick = el("button", "row" + (side.name ? "" : " unknown"));
  var m = el("div", "rmain");
  if (side.name) {
    var p = byName[side.name];
    var h = el("div", "rname");
    h.appendChild(document.createTextNode(side.name));
    if (side.buildId) h.appendChild(el("span", "tag ok", "your build"));
    m.appendChild(h);
    var meta = el("div", "rmeta");
    (p ? p.types : []).forEach(function(t){ meta.appendChild(typeChip(t)); });
    if (p) meta.appendChild(statSpan(p.b, null));
    m.appendChild(meta);
    /* THE OTHER SPREAD, WRITTEN OUT. A Pokemon that changes stats mid-battle
       has two, and printing one of them plus a sentence about the other is
       what this used to do: "Aegislash attacks as Blade Forme - 140 Attack,
       not the Shield spread's 50." The player's answer (2026-09-15): "yo
       tambien necesito ver las estadisticas fisicas y especiales, no me sirve
       asi."
       The CALCULATION was already right - engName() asks the engine for
       Aegislash-Blade when it attacks and -Shield when it is hit - so this is
       the display catching up with the arithmetic. Both rows are shown, and
       the one that governs THIS side is marked. */
    var bf = p && (C.BFORMS || {})[p.name];
    if (bf && bf.f) {
      Object.keys(bf.f).forEach(function(fname){
        var alt = bf.f[fname].b;
        if (!alt) return;
        var row = el("div", "rmeta");
        row.appendChild(statSpan(alt, fname));
        /* Aegislash is the one the app switches by itself, and only on the
           attacking side. Anything else is shown as what it WOULD be, because
           claiming it is in play would be a guess about the battle. */
        var mine = p.name === "Aegislash" && which === "atk";
        var tag = el("span", "tag" + (mine ? " ok" : ""),
                     mine ? "in play attacking" : "when " + (bf.by || "it")
                            + " flips it");
        row.appendChild(tag);
        m.appendChild(row);
      });
      var base = el("div", "rmeta");
      base.appendChild(el("span", null,
        "HP / Atk / Def / SpA / SpD / Spe"));
      m.appendChild(base);
    }
  } else {
    m.appendChild(el("div", "rname", which === "atk" ? "Pick the attacker"
                                                     : "Pick the defender"));
    m.appendChild(el("div", "rmeta")).appendChild(
      el("span", null, "From a build, or any Pokemon in the dex"));
  }
  pick.appendChild(m);
  pick.onclick = function(){ calcPickSheet(which); };
  host.appendChild(pick);
  if (!side.name) return;

  var P = byName[side.name];

  /* WHO has the ability matters, so each side owns its own picker. The list
     leads with this Pokemon's real abilities and then every ability that has a
     measured effect, because the opponent's is often the unknown. */
  var g2 = el("div", "grid2");
  g2.style.marginTop = "10px";
  var fa = el("div", "field");
  fa.appendChild(el("label", "f", "Ability"));
  var sa = el("select");
  sa.appendChild(new Option("none", ""));
  var own = (P.ab || []), seen = {};
  own.forEach(function(x){
    seen[x] = 1;
    sa.appendChild(new Option(x + "  (its own)", x));
  });
  Object.keys(MODS[which === "atk" ? "atk_ability" : "def_ability"] || {})
    .sort().forEach(function(x){
      if (!seen[x]) sa.appendChild(new Option(x, x));
    });
  sa.value = side.ability || "";
  sa.onchange = function(){ side.ability = sa.value || null; calcDraw(); };
  fa.appendChild(sa);
  g2.appendChild(fa);

  var fi = el("div", "field");
  fi.appendChild(el("label", "f", "Item"));
  var si = el("select");
  si.appendChild(new Option("none", ""));
  var pool = Object.keys(MODS[which === "atk" ? "atk_item" : "def_item"] || {});
  if (which === "def") pool = pool.concat(Object.keys(BERRY_TYPE));
  if (which === "atk") pool = pool.concat(Object.keys(TYPE_ITEM));
  var done = {};
  pool.sort().forEach(function(x){
    if (done[x]) return;
    done[x] = 1;
    si.appendChild(new Option(x, x));
  });
  si.value = side.item || "";
  si.onchange = function(){ side.item = si.value || null; calcDraw(); };
  fi.appendChild(si);
  g2.appendChild(fi);
  host.appendChild(g2);

  var fn = el("div", "field");
  fn.appendChild(el("label", "f", "Nature"));
  var sn = el("select");
  sn.appendChild(new Option("none", ""));
  Object.keys(C.NATURES).sort().forEach(function(n){
    sn.appendChild(new Option(n + " (" + C.NATURES[n][2] + ")", n));
  });
  sn.value = side.nature || "";
  sn.onchange = function(){ side.nature = sn.value || null; calcDraw(); };
  fn.appendChild(sn);
  host.appendChild(fn);

  /* which stat does the chosen move actually read on this side? Body Press
     attacks off Defense and Psyshock hits it, so this is not the category. */
  var live = calcLiveStats();

  var head = el("div", "sp");
  head.style.color = "var(--faint)";
  ["", "SP 0-32", "stage", "="].forEach(function(t, i){
    var s = el("span", i === 0 ? "k" : i === 3 ? "calc" : "v", t);
    head.appendChild(s);
  });
  host.appendChild(head);

  STAT_KEYS.forEach(function(k, i){
    var used = (which === "atk" && k === live.aKey) ||
               (which === "def" && (k === live.dKey || k === "hp"));
    var row = el("div", "sp" + ((side.sp[k] || 0) > 32 ? " over" : ""));
    var lab = el("span", "k", STAT_LABEL[k]);
    if (used) lab.style.color = "var(--accent)";
    row.appendChild(lab);

    var inp = el("input");
    inp.type = "number"; inp.min = 0; inp.max = 32;
    inp.value = side.sp[k] || 0;
    inp.setAttribute("aria-label", STAT_LABEL[k] + " stat points");
    inp.oninput = function(){
      side.sp[k] = Math.max(0, Math.min(32, Number(inp.value) || 0));
      calcRun(); calcBudget(which);
    };
    row.appendChild(inp);

    if (k === "hp") {
      row.appendChild(el("span", "v", "—"));      // HP takes no stage
    } else {
      var sb = el("select");
      [-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].forEach(function(v){
        sb.appendChild(new Option(v > 0 ? "+" + v : String(v), String(v)));
      });
      sb.value = String(side.boost[k] || 0);
      sb.onchange = function(){ side.boost[k] = Number(sb.value); calcRun(); };
      row.appendChild(sb);
    }

    var val = statAt(P.b[i], side.sp[k] || 0, k === "hp",
                     natMult(side.nature, k));
    var vs = el("span", "calc", String(val));
    if (used) { vs.style.color = "var(--accent)"; vs.style.fontWeight = "600"; }
    row.appendChild(vs);
    host.appendChild(row);
  });

  var g3 = el("div", "grid2");
  var fs = el("div", "field");
  fs.appendChild(el("label", "f", "Status"));
  var ss = el("select");
  [["", "healthy"], ["brn", "burned"], ["psn", "poisoned"],
   ["tox", "badly poisoned"], ["par", "paralysed"], ["slp", "asleep"],
   ["frz", "frozen"]].forEach(function(o){
    ss.appendChild(new Option(o[1], o[0]));
  });
  ss.value = side.status || "";
  ss.onchange = function(){ side.status = ss.value || null; calcDraw(); };
  fs.appendChild(ss);
  g3.appendChild(fs);
  if (which === "def") {
    /* the HP it is ON, not its maximum - after a switch, after chip, after the
       first attack. This is what turns a percentage into a KO answer. */
    var fh = el("div", "field");
    fh.appendChild(el("label", "f", "Current HP"));
    var ih = el("input");
    ih.type = "number"; ih.min = 1;
    ih.placeholder = "full";
    ih.value = side.curHP == null ? "" : side.curHP;
    ih.oninput = function(){
      side.curHP = ih.value === "" ? null : Math.max(1, Number(ih.value) || 1);
      calcRun();
    };
    fh.appendChild(ih);
    g3.appendChild(fh);
  }
  host.appendChild(g3);

  var b = el("div", "budget");
  b.id = which + "Budget";
  host.appendChild(b);
  calcBudget(which);
}

/* 66 total, 32 max in one - the same limits the build editor enforces */
function calcBudget(which){
  var side = CALC[which], node = $(which + "Budget");
  if (!node) return;
  var tot = STAT_KEYS.reduce(function(a, k){ return a + (side.sp[k] || 0); }, 0);
  node.innerHTML = "";
  node.appendChild(el("span", null, tot + " of 66 SP"));
  var over = STAT_KEYS.filter(function(k){ return (side.sp[k] || 0) > 32; });
  var msg = tot > 66 ? (tot - 66) + " over the budget"
          : over.length ? over.map(function(k){ return STAT_LABEL[k]; }).join(", ") + " over 32"
          : (66 - tot) + " left";
  var s = el("span", null, msg);
  if (tot > 66 || over.length) s.style.color = "var(--bad)";
  node.appendChild(s);
}

/* which stats the current move really reads, before any of them are shown */
function calcLiveStats(){
  var m = CALC.move;
  if (!m) return {aKey:"atk", dKey:"def"};
  var phys = m.cat === "P";
  var aKey = phys ? "atk" : "spa", dKey = phys ? "def" : "spd";
  if (m.name === "Psyshock") dKey = "def";      // Special, hits Defense
  if (m.name === "Body Press") aKey = "def";    // attacks off Defense
  if (m.name === "Foul Play") aKey = "atk";     // off the TARGET's Attack
  return {aKey:aKey, dKey:dKey};
}

function calcPickSheet(which){
  var side = CALC[which];
  openSheet(which === "atk" ? "Attacker" : "Defender", function(body){
    var builds = Object.keys(S.builds).sort(function(a, b){
      return String(S.builds[a].pokemon).localeCompare(String(S.builds[b].pokemon));
    });
    if (builds.length) {
      body.appendChild(el("h2", null, "From your builds"));
      var bl = el("div", "list");
      builds.forEach(function(id){
        var b = S.builds[id];
        var nm = b.mega || b.pokemon;
        var p = byName[nm] || byName[b.pokemon];
        if (!p) return;
        var r = el("button", "row perm");
        var mm = el("div", "rmain");
        var h = el("div", "rname");
        h.appendChild(document.createTextNode(nm));
        if (b.mega) h.appendChild(el("span", "tag mega", "mega"));
        mm.appendChild(h);
        var meta = el("div", "rmeta");
        p.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
        meta.appendChild(el("span", "mono", (b.nature || "—") + "  ·  " +
          STAT_KEYS.map(function(k){ return (b.stat_points || {})[k] || 0; }).join("/")));
        mm.appendChild(meta);
        r.appendChild(mm);
        r.onclick = function(){ calcLoadBuild(which, id, b); };
        bl.appendChild(r);
      });
      body.appendChild(bl);
    }

    body.appendChild(el("h2", null, "Or any Pokemon"));
    var wrap = el("div", "search field");
    wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    var inp = el("input"); inp.type = "text";
    inp.placeholder = "Search " + DEX.length + " forms, Megas included";
    wrap.appendChild(inp);
    body.appendChild(wrap);
    var list = el("div", "list");
    body.appendChild(list);
    function draw(){
      var q = inp.value.trim().toLowerCase();
      list.innerHTML = "";
      DEX.filter(function(p){
        return !q || p.name.toLowerCase().indexOf(q) >= 0;
      }).slice(0, 50).forEach(function(p){
        var r = el("button", "row");
        var mm = el("div", "rmain");
        var h = el("div", "rname");
        h.appendChild(document.createTextNode(p.name));
        if (p.mega) h.appendChild(el("span", "tag mega", "mega"));
        mm.appendChild(h);
        var meta = el("div", "rmeta");
        p.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
        meta.appendChild(el("span", "mono", p.b.join(" / ")));
        mm.appendChild(meta);
        r.appendChild(mm);
        r.onclick = function(){
          side.name = p.name; side.buildId = null;
          if (which === "atk") CALC.move = null;
          closeSheet(); calcDraw();
        };
        list.appendChild(r);
      });
      if (!list.children.length) list.appendChild(el("div", "empty", "Nothing matches"));
    }
    inp.oninput = draw;
    draw();
  }, []);
}

function calcLoadBuild(which, id, b){
  var side = CALC[which];
  side.name = b.mega || b.pokemon;
  side.buildId = id;
  side.nature = b.nature || null;
  side.ability = (b.mega ? (b.mega_ability || b.ability) : b.ability) || null;
  var sp = b.stat_points || {};
  STAT_KEYS.forEach(function(k){ side.sp[k] = sp[k] || 0; });
  STAT_KEYS.forEach(function(k){ if (k !== "hp") side.boost[k] = 0; });
  if (which === "atk") CALC.move = null;
  closeSheet();
  calcDraw();
}

function calcMoveSheet(){
  var a = CALC.atk;
  if (!a.name) { toast("Pick the attacker first"); return; }
  var ls = learnset(a.name);
  var build = a.buildId ? S.builds[a.buildId] : null;
  openSheet("Move", function(body){
    if (build && (build.moves || []).length) {
      body.appendChild(el("h2", null, "On this build"));
      var bl = el("div", "list");
      (build.moves || []).forEach(function(n){
        var mv = MOVE_BY[n];
        if (!mv) return;
        bl.appendChild(calcMoveRow(mv, true));
      });
      body.appendChild(bl);
    }
    body.appendChild(el("h2", null, ls ? "Everything it learns" : "All moves"));
    var wrap = el("div", "search field");
    wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    var inp = el("input"); inp.type = "text"; inp.placeholder = "Filter";
    wrap.appendChild(inp);
    body.appendChild(wrap);
    var list = el("div", "list");
    body.appendChild(list);
    if (!ls) {
      body.appendChild(el("div", "note bad",
        "No movepool on record for " + a.name + "."));
    }
    var pool = (ls || []).filter(function(m){ return m.cat !== "T"; });
    function draw(){
      var q = inp.value.trim().toLowerCase();
      list.innerHTML = "";
      pool.filter(function(m){
        return !q || m.name.toLowerCase().indexOf(q) >= 0 ||
               m.type.toLowerCase().indexOf(q) >= 0;
      }).sort(function(x, y){
        return (y.bp || 0) * Math.min(100, y.acc || 100) -
               (x.bp || 0) * Math.min(100, x.acc || 100);
      }).slice(0, 60).forEach(function(m){ list.appendChild(calcMoveRow(m)); });
      if (!list.children.length) list.appendChild(el("div", "empty", "Nothing matches"));
    }
    inp.oninput = draw;
    draw();
  }, []);
}
function calcMoveRow(m, fromBuild){
  var r = el("button", "row" + (fromBuild ? " perm" : ""));
  var mm = el("div", "rmain");
  var h = el("div", "rname");
  h.appendChild(typeChip(m.type));
  h.appendChild(document.createTextNode(m.name));
  spreadTags(m, h);
  mm.appendChild(h);
  mm.appendChild(el("div", "rmeta")).appendChild(el("span", "mono",
    catName(m.cat) + "  ·  " + (m.bp ? m.bp + " BP" : "— BP") + "  ·  " +
    (m.acc == null ? "—" : m.acc) + " acc" +
    (m.hits ? "  ·  " + m.hits[0] + "-" + m.hits[1] + " hits" : "")));
  r.appendChild(mm);
  r.onclick = function(){
    CALC.move = m;
    closeSheet(); calcDraw();
  };
  return r;
}


function calcFieldCtl(){
  var host = $("calcField");
  host.innerHTML = "";
  function tog(label, on, fn, cls){
    var t = el("button", "tog " + (cls || ""), label);
    t.setAttribute("aria-pressed", on ? "true" : "false");
    t.onclick = fn;
    host.appendChild(t);
    return t;
  }
  var m = CALC.move;
  group("The hit itself");
  tog("Critical hit", CALC.crit, function(){ CALC.crit = !CALC.crit; calcDraw(); });
  function group(label){
    var h = el("div", "fieldgroup");
    h.textContent = label;
    host.appendChild(h);
  }
  group("Weather");
  ["Sun", "Rain", "Sand", "Snow"].forEach(function(w){
    tog(w, CALC.weather === w, function(){
      CALC.weather = CALC.weather === w ? null : w; calcDraw();
    });
  });
  group("Terrain");
  ["Electric", "Grassy", "Psychic", "Misty"].forEach(function(t){
    tog(t, CALC.terrain === t, function(){
      CALC.terrain = CALC.terrain === t ? null : t; calcDraw();
    });
  });
  group("The attacker's side");
  tog("Helping Hand", CALC.helpingHand, function(){
    CALC.helpingHand = !CALC.helpingHand; calcDraw(); });
  tog("Charge", CALC.charge, function(){
    CALC.charge = !CALC.charge; calcDraw(); });
  tog("Tailwind", CALC.tailwindAtk, function(){
    CALC.tailwindAtk = !CALC.tailwindAtk; calcDraw(); });
  tog("Power Trick", CALC.powerTrickAtk, function(){
    CALC.powerTrickAtk = !CALC.powerTrickAtk; calcDraw(); });
  tog("+1 All Stats", CALC.plusOneAtk, function(){
    CALC.plusOneAtk = !CALC.plusOneAtk; calcDraw(); });
  group("The target's side");
  tog("Friend Guard", CALC.friendGuard, function(){
    CALC.friendGuard = !CALC.friendGuard; calcDraw(); });
  tog("Protecting", CALC.protected, function(){
    CALC.protected = !CALC.protected; calcDraw(); });
  tog("Power Trick", CALC.powerTrickDef, function(){
    CALC.powerTrickDef = !CALC.powerTrickDef; calcDraw(); });
  tog("+1 All Stats", CALC.plusOneDef, function(){
    CALC.plusOneDef = !CALC.plusOneDef; calcDraw(); });
  tog("Switching out", CALC.switching, function(){
    CALC.switching = !CALC.switching; calcDraw(); });
  /* These do not change one hit - they change the HP the target is ON, which
     is what decides whether the NEXT hit KOes. The player's point: you
     calculate after a switch, after chip, after an attack. */
  group("Already on the target (changes the KO count)");
  tog("Stealth Rock", CALC.stealthRock, function(){
    CALC.stealthRock = !CALC.stealthRock; calcDraw(); });
  [1, 2, 3].forEach(function(n){
    tog(n + " Spikes", CALC.spikes === n, function(){
      CALC.spikes = CALC.spikes === n ? 0 : n; calcDraw(); });
  });
  tog("Leech Seed", CALC.leechSeed, function(){
    CALC.leechSeed = !CALC.leechSeed; calcDraw(); });
  tog("Salt Cure", CALC.saltCure, function(){
    CALC.saltCure = !CALC.saltCure; calcDraw(); });
  tog("Nightmare", CALC.nightmare, function(){
    CALC.nightmare = !CALC.nightmare; calcDraw(); });
  group("Screens on the target's side");
  [["Reflect", "physical", "P"], ["Light Screen", "special", "S"],
   ["Aurora Veil", "both", null]].forEach(function(r){
    var sc = r[0], relevant = !m || !r[2] || m.cat === r[2];
    var t = tog(sc + " (" + r[1] + ")", CALC.screen === sc, function(){
      CALC.screen = CALC.screen === sc ? null : sc; calcDraw();
    });
    /* dimmed rather than hidden, so it is obvious WHY it changes nothing */
    if (!relevant) { t.style.opacity = ".45";
      t.title = sc + " only stops " + r[1] + " moves"; }
  });
  group("The whole field");
  tog("Gravity", CALC.gravity, function(){
    CALC.gravity = !CALC.gravity; calcDraw(); });
  tog("Wonder Room", CALC.wonderRoom, function(){
    CALC.wonderRoom = !CALC.wonderRoom; calcDraw(); });
  tog("Magic Room", CALC.magicRoom, function(){
    CALC.magicRoom = !CALC.magicRoom; calcDraw(); });


}

function calcRun(){
  var out = $("calcOut");
  out.innerHTML = "";
  var a = CALC.atk, d = CALC.def, m = CALC.move;
  if (!a.name || !d.name || !m) {
    out.appendChild(el("div", "empty",
      "Pick an attacker, a move and a defender."));
    return;
  }
  if (!engineReady()) {
    out.appendChild(el("div", "note bad",
      "Smogon's engine did not load, so there is no number to give you. " +
      "Reload the page; if it keeps happening the bundle needs rebuilding."));
    return;
  }
  var r;
  try { r = engineCalc(); }
  catch (e) {
    out.appendChild(el("div", "note bad",
      "The engine could not calculate this: " + (e && e.message || e)));
    return;
  }

  var hp = r.curHP != null ? r.curHP : r.hp;
  var pctLo = r.lo / r.hp * 100, pctHi = r.hi / r.hp * 100;
  var ko = koCount(r.lo, r.hi, hp);
  var kls = ko.n === 1 ? "k1" : ko.n === 2 ? "k2" : "k3";

  /* the number, the percentage and the verdict on one line - this is the
     answer, and it stays on screen while the inputs below it change */
  var v = el("div", "verdict");
  v.appendChild(el("span", "num", r.lo + " - " + r.hi));
  v.appendChild(el("span", "pct", "of " + r.hp + " HP  ·  " +
    pctLo.toFixed(1) + "-" + pctHi.toFixed(1) + "%" +
    (r.hits > 1 ? "  ·  " + r.hits + " hits" : "") +
    (r.curHP != null && r.curHP !== r.hp ? "  ·  on " + r.curHP + " HP" : "")));
  v.appendChild(el("span", "kotag " + kls, r.koText || ko.text));
  out.appendChild(v);

  var bar = el("div", "meter");
  bar.style.height = "8px";
  var fill = el("i");
  fill.style.width = Math.min(100, r.hi / hp * 100) + "%";
  fill.style.background = ko.n === 1 ? "var(--bad)"
                        : ko.n === 2 ? "var(--warn)" : "var(--accent)";
  bar.appendChild(fill);
  out.appendChild(bar);

  /* the engine's own sentence: it names every modifier that actually fired,
     which beats anything this page could narrate */
  if (r.desc) {
    var dsc = el("p", "sub");
    dsc.style.margin = "6px 0 0";
    dsc.textContent = r.desc;
    out.appendChild(dsc);
  }

  var flags = [];
  if (CALC.gameType === "Singles") {
    flags.push(["", "Singles: no spread reduction, and a screen is x0.5 " +
      "instead of the x0.667 it is in doubles."]);
  } else if (m.spread) {
    flags.push(["warn", "Spread move with both targets up: x0.75. In a " +
      "1-vs-1 endgame it is full power - switch to Singles for that number."]);
  }
  if (m.hitsAlly) flags.push(["warn", m.name + " hits your own ally too."]);
  if (m.name === "Weather Ball" && !CALC.weather)
    flags.push(["warn", "Weather Ball is never Normal in play. Set the " +
      "weather and it becomes 100 BP of that type."]);
  if (m.name === "Acrobatics" || m.name === "Poltergeist")
    flags.push(["warn", m.name + " depends on held items - set them on both " +
      "sides, or this is the empty-handed number."]);
  if (m.name === "Payback")
    flags.push(["warn", "Payback doubles only if it moves last."]);
  /* No note for Aegislash any more: both spreads are printed on the side
     control with the governing one marked, which is what a note about numbers
     should have been in the first place. */
  if (flags.length) {
    var fl = el("div", "calcflags");
    flags.forEach(function(t){
      var x = el("div", "note " + (t[0] || ""));
      x.textContent = t[1];
      fl.appendChild(x);
    });
    out.appendChild(fl);
  }

  var det = el("details", "rolls");
  var sum = el("summary", null, "Every roll, and where the number came from");
  det.appendChild(sum);
  var rl = el("div", "rmeta");
  rl.style.fontFamily = "var(--mono)";
  rl.style.marginTop = "8px";
  r.rolls.forEach(function(x){ rl.appendChild(el("span", "tag", String(x))); });
  det.appendChild(rl);
  det.appendChild(el("p", "sub",
    "Calculated by Smogon's own Champions engine, bundled into this page - " +
    "not an approximation of it."));
  out.appendChild(det);
}

function calcDraw(){
  calcSideCtl("atk");
  calcSideCtl("def");
  var b = $("calcMove");
  b.innerHTML = "";
  var mm = el("div", "rmain");
  if (CALC.move) {
    var h = el("div", "rname");
    h.appendChild(typeChip(CALC.move.type));
    h.appendChild(el("span", "nm", CALC.move.name));
    mm.appendChild(h);
    mm.appendChild(el("div", "st", catName(CALC.move.cat) + "  ·  " +
      (CALC.move.bp || "—") + " BP  ·  " + (CALC.move.acc == null ? "—" : CALC.move.acc) + " acc"));
    b.className = "slot";
  } else {
    mm.appendChild(el("div", "rname", "Pick a move"));
    b.className = "slot blank";
  }
  b.appendChild(mm);
  b.onclick = calcMoveSheet;
  calcFieldCtl();
  calcRun();
}

/* ------------------------------------------- which ability boosts what -----
   Each entry answers one question: given this Pokemon's chosen ability, which
   of the moves it actually learns are changed by it? The test runs against the
   move's own flags, so a new move added by a regulation is covered the day the
   data refreshes - nothing here is a hand-written move list.

   `sec` marks a move with a SECONDARY effect, which is what Sheer Force trades
   away for 30% power. */
/* Derived by scripts/build_ability_moves.py from Serebii's move text, cross-
   checked against Smogon's engine, and shipped as move-index lists. Nothing
   here is written by hand, which is the point: three bugs came from hand rules.

     - a power multiplier can never apply to a move that deals no damage
       (Adaptability was badging Basculegion's Rain Dance)
     - "1-stage Critical-Hit Ratio Boost" is not a stat stage
       (Contrary was badging Protect and Roost)
     - an ability that changes what comes IN never badges its own movepool
       (Bulletproof, Filter, Thick Fat are "def" and stay out of it) */
var AB = C.AB_MOVES || {};
var AB_SET = {};
Object.keys(AB).forEach(function(name){
  var e = AB[name], s = {all:!!e.all, side:e.side, x:e.x, why:e.why,
                         scope:e.scope};
  s.m = {}; (e.m || []).forEach(function(i){ s.m[i] = 1; });
  if (e.up)   { s.up = {};   e.up.forEach(function(i){ s.up[i] = 1; }); }
  if (e.down) { s.down = {}; e.down.forEach(function(i){ s.down[i] = 1; }); }
  s.why_up = e.why_up; s.why_down = e.why_down;
  AB_SET[name] = s;
});

function abilityHit(ability, move, poke){
  var r = AB_SET[ability];
  if (!r || r.side !== "off") return null;      // defensive rules badge nothing
  // An ability that covers a whole CATEGORY selects nothing, so a badge on
  // every row is noise that buries the abilities that do select. Guts is the
  // case the player named: it multiplies the Attack STAT while statused, so
  // "the moves it affects" is just "every physical move" - which the row's own
  // category already says. Those are stated once, on the ability itself; see
  // abilityScope(). Measured in build_ability_moves.py, never listed by hand.
  if (r.scope) return null;
  if (r.all) return r;
  if (!r.m[move.i]) return null;
  // Contrary is the one that needs the SIGN, because that is the whole ability:
  // a boosting move becomes a self-debuff and a self-debuff becomes a boost.
  if (r.up && r.up[move.i]) return {x:r.x, why:r.why_up};
  if (r.down && r.down[move.i]) return {x:r.x, why:r.why_down};
  return r;
}
/* the badge that goes on a move row when the chosen ability touches it */
function abilityTag(ability, move, poke){
  var hit = abilityHit(ability, move, poke);
  if (!hit) return null;
  // STAB needs the user's own type; the move table cannot know it
  if (ability === "Adaptability" &&
      !(poke && poke.types.indexOf(move.type) >= 0)) return null;
  var t = el("span", "tag ok", ability);
  t.title = hit.why;
  return t;
}

/* ------------------------------------------------------- what leaves here --
   The engine's answer and the screen that asks for it. What stays private is
   everything that would let a second caller compute damage a slightly
   different way: engSide and engName (how a Pokemon is handed to Smogon's
   engine), typeMult, boostMult, weightPower, pokeRound.

   `CALC` is the screen's own state and is exported for PUBLIC - the browser
   tests set an attacker, a move and a defender on it and compare the page's
   roll against Node's. `engineCalc` is exported for the same reason.
*/
export {
  AB_SET, CALC, abilityHit, abilityTag, calcDamage, calcDraw, engineCalc,
  engineReady, koCount,
};
