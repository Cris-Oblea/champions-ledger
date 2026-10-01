/* The Damage tab: Smogon's engine and the calculator screen around it.

   How a Pokemon is handed to the engine (engSide, engName) stays private, so
   there is one way to ask it. CALC and engineCalc are exported for the
   browser tests (PUBLIC), which compare the page's roll against Node's. */
import {
  anyRow, byName, byText, C, catName, DEX, learnset, MOVE_BY, natMult, plural,
  STAT_KEYS, STAT_LABEL, statAt,
} from "../core/data.js";
import { $, capNote, el, searchField, setPressed, toast } from "../core/dom.js";
import { activeAbility, baseAbility, S } from "../core/state.js";
import { labelBox, pokeCard, statGrid, typeChip } from "../ui/card.js";
import { spreadTags } from "../ui/moves.js";
import { closeSheet, openSheet } from "../ui/nav.js";

/* ----------------------------------- what the calculator lets you pick ----
   The Ability and Item menus offer only what can change the number, and that
   list is MEASURED rather than written: scripts/measure_modifiers.py runs
   Smogon's Champions engine with and without each ability and item, and every
   one that moves the damage is named in C.MODS, a list per menu. The engine
   applies them itself; this screen only offers the names.

   Anything measured at x1.00 was then checked against the format: Choice Band,
   Choice Specs, Assault Vest, Eviolite, Transistor, Steelworker, Ice Scales and
   Storm Drain are not in Champions at all, which is why they moved nothing. */
const MODS = C.MODS || {};

/* The resist berries and the type-boosting items, keyed by the type each one
   acts on. The Item menu offers them beside C.MODS. */
const BERRY_TYPE = {
  "Chople Berry": "Fighting", "Colbur Berry": "Dark", "Occa Berry": "Fire",
  "Passho Berry": "Water", "Wacan Berry": "Electric", "Rindo Berry": "Grass",
  "Yache Berry": "Ice", "Shuca Berry": "Ground", "Coba Berry": "Flying",
  "Payapa Berry": "Psychic", "Tanga Berry": "Bug", "Charti Berry": "Rock",
  "Kasib Berry": "Ghost", "Haban Berry": "Dragon", "Babiri Berry": "Steel",
  "Kebia Berry": "Poison", "Roseli Berry": "Fairy", "Chilan Berry": "Normal"
};
const TYPE_ITEM = {
  "Black Glasses": "Dark", "Mystic Water": "Water", "Metal Coat": "Steel",
  "Fairy Feather": "Fairy", "Charcoal": "Fire", "Magnet": "Electric",
  "Miracle Seed": "Grass", "Hard Stone": "Rock", "Black Belt": "Fighting",
  "Dragon Fang": "Dragon", "Never-Melt Ice": "Ice", "Poison Barb": "Poison",
  "Sharp Beak": "Flying", "Silk Scarf": "Normal", "Silver Powder": "Bug",
  "Soft Sand": "Ground", "Spell Tag": "Ghost", "Twisted Spoon": "Psychic"
};

/* How many of these does it take? A KO count, because that is the only thing
   the player counts as a real change - a percentage drop is decoration. */
function koCount(lo, hi, hp){
  if (hi <= 0) return {text:"it does nothing", n:Infinity};
  const best = Math.ceil(hp / hi), worst = Math.ceil(hp / lo);
  if (best === worst) return {text:"guaranteed " + hko(best), n:best};
  return {text:hko(best) + " on a high roll, " + hko(worst) + " otherwise",
          n:best};
}
function hko(n){ return n + "HKO"; }

/* ============================================ the calculator, for real =====
   This does not approximate Smogon's engine - it runs it. The bundle is the
   vendored calc/ compiled for the browser by scripts/build_engine_bundle.py.

   A hand port used to live here. It agreed on the plain cases and drifted by
   a point or two once modifiers stacked, because the real chain runs in four
   separate buckets - base power, attack, defence, final - each chained in
   4096-space with its own rounding step. One point can turn a 2HKO into a
   3HKO, and the KO count is the only thing that counts. */
function engineReady(){
  return !!window.SMOGON?.calculate;
}

/* Our spelling is Serebii's ("Mega Glalie"); the engine answers to its own
   ("Glalie-Mega"). The table is precomputed by build_tracker_data.py through
   query.norm(), which has 44 locked test cases - porting that matcher to JS
   would be a second implementation to keep in step. Aegislash is the one form
   whose name depends on the side: it attacks as Blade, and is hit as Shield. */
function engName(name, attacking){
  if (name === "Aegislash" || name === "Aegislash-Shield" ||
      name === "Aegislash-Blade") {
    return C.AEGIS?.[attacking ? "attacking" : "defending"] ||
           "Aegislash-Shield";
  }
  return C.SMOGON_NAME?.[name] || name;
}

/* our SP object -> the engine's evs, and our boost object -> its boosts */
function engSide(side){
  const evs = {}, boosts = {};
  STAT_KEYS.forEach(function(k){
    if (side.sp[k]) evs[k] = side.sp[k];
    if (k !== "hp" && side.boost[k]) boosts[k] = side.boost[k];
  });
  if (side._plusOne) {
    ["atk", "def", "spa", "spd", "spe"].forEach(function(k){
      if (!boosts[k]) boosts[k] = 1;
    });
  }
  const o = {evs: evs, boosts: boosts};
  if (side.nature) o.nature = side.nature;
  if (side.ability) o.ability = side.ability;
  if (side.item) o.item = side.item;
  if (side.status) o.status = side.status;
  if (side.curHP != null && side.curHP !== "") o.curHP = Number(side.curHP);
  return o;
}

/* Ask the engine about CALC as it stands. Returns the damage range, the HP it
   is out of, every roll, the engine's own sentence and KO text, and how many
   hits. Throws for a Pokemon the engine has no stats for. */
function engineCalc(){
  const S = window.SMOGON;
  const a = CALC.atk, d = CALC.def, m = CALC.move;
  const an = engName(a.name, true), dn = engName(d.name, false);
  if (!C.SMOGON_NAME?.[a.name] && a.name !== "Aegislash")
    throw new Error(a.name + " is not in Smogon's Champions roster, so the " +
      "engine has no stats for it.");
  if (!C.SMOGON_NAME?.[d.name] && d.name !== "Aegislash")
    throw new Error(d.name + " is not in Smogon's Champions roster, so the " +
      "engine has no stats for it.");
  a._plusOne = CALC.plusOneAtk; d._plusOne = CALC.plusOneDef;
  const A = new S.Pokemon(S.gen, an, engSide(a));
  const D = new S.Pokemon(S.gen, dn, engSide(d));
  const M = new S.Move(S.gen, m.name, {isCrit: !!CALC.crit});
  const r = S.calculate(S.gen, A, D, M, engineField(S, a, d));
  const range = damageRange(r.damage);
  let desc = "";
  try { desc = r.desc(); } catch (e) { desc = ""; }
  let ko = "";
  try { ko = r.koChanceText ? r.koChanceText() : ""; } catch (e) { ko = ""; }
  return {lo:range.lo, hi:range.hi, hp:D.maxHP(), curHP:D.curHP(),
          rolls:range.rolls, desc:desc, koText:ko,
          /* Champions is doubles. The engine takes the x0.75 off the move's
             target and the game type, and has no idea how many Pokemon are
             actually out - so a 1-vs-1 endgame is expressed by switching to
             Singles, exactly as scripts/damage.py does with --single-target. */
          singleTarget:CALC.gameType === "Singles",
          hits:(Array.isArray(r.damage[0]) ? r.damage.length : 1)};
}

/* Every switch on the Field panel, as the engine's Field. */
function engineField(S, a, d){
  return new S.Field({
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
}

/* For a multi-hit the engine gives one array PER HIT, so what the target
   takes is the per-hit minimum summed to the per-hit maximum summed - never
   the min and max of the flattened list. */
function damageRange(damage){
  const multi = Array.isArray(damage[0]);
  let flat = [];
  (multi ? damage : [damage]).forEach(function(x){ flat = flat.concat(x); });
  if (!multi) return {lo:Math.min.apply(null, flat), hi:Math.max.apply(null, flat), rolls:flat};
  let lo = 0, hi = 0;
  damage.forEach(function(x){
    lo += Math.min.apply(null, x); hi += Math.max.apply(null, x);
  });
  return {lo:lo, hi:hi, rolls:flat};
}

/* ------------------------------------------------- the calculator's screen --
   Either side can be loaded from a saved build or set by hand, because the
   question is usually asymmetric: your own Pokemon is built, the opponent's is
   whatever the ladder brings. */
const CALC = {
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
  atkStatus:null
};

/* ONE SIDE OF THE CALCULATOR: the Pokemon, its ability, item, nature and
   status, the FULL spread - six stats, the way a real calculator does it -
   and, on the defender, the HP it is on. A single "SP in the attacking stat"
   box guessed which stat from the move's category, which is wrong for Sp. Atk
   and Sp. Def together and wrong again for Body Press and Psyshock. The
   Champions budget - 66 in all, 32 in one - is shown here too. */
function calcSideCtl(which){
  const side = CALC[which], host = $(which === "atk" ? "calcAtk" : "calcDef");
  host.innerHTML = "";
  host.appendChild(sidePick(which, side));
  if (!side.name) return;
  const P = byName[side.name];
  host.appendChild(sideSelects(which, side, P));
  /* which stat does the chosen move actually read on this side? Body Press
     attacks off Defense and Psyshock hits it, so this is not the category. */
  const live = calcLiveStats();
  host.appendChild(statsHeader());
  STAT_KEYS.forEach(function(k, i){
    host.appendChild(statRow(which, side, P, k, i, live));
  });
  if (which === "def") host.appendChild(curHPField(side));
  const b = el("div", "budget");
  b.id = which + "Budget";
  host.appendChild(b);
  calcBudget(which);
}

/* THE CARD, WITH ITS POKEMON ON IT - the same one the pickers draw, so the
   Pokemon you chose looks like the Pokemon you chose it from (player,
   2026-09-19: "a la calculadora tambien le faltan los sprites"). Nothing
   chosen yet, or a name with no row anywhere, gets the one shape that needs
   no data. Either way, tapping it opens the picker. */
function sidePick(which, side){
  const p0 = side.name ? anyRow(side.name) : null;
  if (side.name && p0) {
    let m = null;
    const pick = pokeCard(p0, {
      badges: function(h){
        if (side.buildId) h.appendChild(el("span", "tag ok", "your build"));
      },
      notes: function(body){ m = body; },
      onclick: function(){ calcPickSheet(which); }
    });
    otherSpreads(m, byName[side.name], which);
    return pick;
  }
  const blank = el("button", "row unknown");
  const bm = el("div", "rmain");
  const pickWhat = which === "atk" ? "Pick the attacker" : "Pick the defender";
  bm.appendChild(el("div", "rname", side.name || pickWhat));
  bm.appendChild(el("div", "rmeta")).appendChild(
    el("span", null, "From a build, or any Pokemon in the dex"));
  blank.appendChild(bm);
  blank.onclick = function(){ calcPickSheet(which); };
  return blank;
}

/* THE OTHER SPREAD, WRITTEN OUT. A Pokemon that changes stats mid-battle has
   two, and a sentence about the second was not enough (player, 2026-09-15:
   "yo tambien necesito ver las estadisticas fisicas y especiales, no me sirve
   asi"). The CALCULATION was already right - engName() asks for
   Aegislash-Blade when it attacks - so this is the display catching up with
   the arithmetic: both rows shown, the one in play marked. Aegislash is the
   one the app switches by itself, and only when attacking; anything else is
   shown as what it WOULD be, because claiming it is in play would be a guess
   about the battle. */
function otherSpreads(m, p, which){
  const bf = p && C.BFORMS?.[p.name];
  if (!bf?.f) return;
  Object.keys(bf.f).forEach(function(fname){
    const alt = bf.f[fname].b;
    if (!alt) return;
    const row = el("div", "rmeta");
    const mine = p.name === "Aegislash" && which === "atk";
    const tag = el("span", "tag" + (mine ? " ok" : ""),
                 mine ? "in play attacking" : "when " + (bf.by || "it")
                        + " flips it");
    row.appendChild(el("span", null, fname));
    row.appendChild(tag);
    m.appendChild(row);
    m.appendChild(statGrid(alt));
  });
}

/* ONE COMPACT BLOCK, NOT FOUR STACKED ONES: ability, item, nature and status
   are the four things you set on a Pokemon before you read the number, and
   the screen carries two sides (player, 2026-09-19: "ocupa demasiado espacio
   en pantalla"). The two halves stay stacked above the stats: side by side
   the SP boxes came out 22px wide. */
function sideSelects(which, side, P){
  const g2 = el("div", "grid2 tight mt8");
  g2.appendChild(sideField("Ability", abilityOptions(which, P), side, "ability"));
  g2.appendChild(sideField("Item", itemOptions(which), side, "item"));
  const natures = Object.keys(C.NATURES).sort(byText).map(function(n){
    return [n + " (" + C.NATURES[n][2] + ")", n];
  });
  g2.appendChild(sideField("Nature", [["none", ""]].concat(natures), side, "nature"));
  g2.appendChild(sideField("Status", [["healthy", ""], ["burned", "brn"],
    ["poisoned", "psn"], ["badly poisoned", "tox"], ["paralysed", "par"],
    ["asleep", "slp"], ["frozen", "frz"]], side, "status"));
  return g2;
}

/* A labelled <select> of [text, value] options that writes side[key] and
   redraws the calculator. */
function sideField(label, options, side, key){
  const f = el("div", "field");
  f.appendChild(el("label", "f", label));
  const s = el("select");
  options.forEach(function(o){ s.appendChild(new Option(o[0], o[1])); });
  s.value = side[key] || "";
  s.onchange = function(){ side[key] = s.value || null; calcDraw(); };
  f.appendChild(s);
  return f;
}

/* WHO has the ability matters, so each side owns its own list: this
   Pokemon's real abilities first, then every one with a measured effect on
   this side, because the opponent's is often the unknown. */
function abilityOptions(which, P){
  const opts = [["none", ""]];
  const own = (P.ab || []), seen = {};
  own.forEach(function(x){
    seen[x] = 1;
    opts.push([x + "  (its own)", x]);
  });
  (MODS[which === "atk" ? "atk_ability" : "def_ability"] || []).slice()
    .sort(byText).forEach(function(x){
      if (!seen[x]) opts.push([x, x]);
    });
  return opts;
}

/* The measured items for this side, plus the type-boosting items for the
   attacker and the resist berries for the defender - each once. */
function itemOptions(which){
  const opts = [["none", ""]];
  let pool = (MODS[which === "atk" ? "atk_item" : "def_item"] || []).slice();
  if (which === "def") pool = pool.concat(Object.keys(BERRY_TYPE));
  if (which === "atk") pool = pool.concat(Object.keys(TYPE_ITEM));
  const done = {};
  pool.sort(byText);
  pool.forEach(function(x){
    if (done[x]) return;
    done[x] = 1;
    opts.push([x, x]);
  });
  return opts;
}

/* The column heads over the six stat rows. */
function statsHeader(){
  const head = el("div", "sp c-faint");
  ["", "SP 0-32", "stage", "="].forEach(function(t, i){
    const s = el("span", ["k", "v", "v", "calc"][i], t);
    head.appendChild(s);
  });
  return head;
}

/* One stat: its SP, its stage (HP takes none) and the stat it makes, the
   one the move actually reads marked in the accent colour. */
function statRow(which, side, P, k, i, live){
  const used = (which === "atk" && k === live.aKey) ||
             (which === "def" && (k === live.dKey || k === "hp"));
  const row = el("div", "sp" + ((side.sp[k] || 0) > 32 ? " over" : ""));
  const lab = el("span", "k", STAT_LABEL[k]);
  if (used) lab.classList.add("c-accent");
  row.appendChild(lab);

  const inp = el("input");
  inp.type = "number"; inp.min = 0; inp.max = 32;
  inp.value = side.sp[k] || 0;
  inp.setAttribute("aria-label", STAT_LABEL[k] + " stat points");
  inp.oninput = function(){
    side.sp[k] = Math.max(0, Math.min(32, Number(inp.value) || 0));
    calcRun(); calcBudget(which);
  };
  row.appendChild(inp);

  if (k === "hp") row.appendChild(el("span", "v", "—"));
  else row.appendChild(stageSelect(side, k));

  const val = statAt(P.b[i], side.sp[k] || 0, k === "hp",
                   natMult(side.nature, k));
  const vs = el("span", "calc", String(val));
  if (used) vs.classList.add("used");
  row.appendChild(vs);
  return row;
}

/* -6 to +6. */
function stageSelect(side, k){
  const sb = el("select");
  [-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].forEach(function(v){
    sb.appendChild(new Option(v > 0 ? "+" + v : String(v), String(v)));
  });
  sb.value = String(side.boost[k] || 0);
  sb.onchange = function(){ side.boost[k] = Number(sb.value); calcRun(); };
  return sb;
}

/* The HP it is ON, not its maximum - after a switch, after chip, after the
   first attack. This is what turns a percentage into a KO answer. */
function curHPField(side){
  const g3 = el("div", "grid2 tight");
  const fh = el("div", "field");
  fh.appendChild(el("label", "f", "Current HP"));
  const ih = el("input");
  ih.type = "number"; ih.min = 1;
  ih.placeholder = "full";
  ih.value = side.curHP == null ? "" : side.curHP;
  ih.oninput = function(){
    side.curHP = ih.value === "" ? null : Math.max(1, Number(ih.value) || 1);
    calcRun();
  };
  fh.appendChild(ih);
  g3.appendChild(fh);
  return g3;
}

/* 66 total, 32 max in one - the same limits the build editor enforces */
function calcBudget(which){
  const side = CALC[which], node = $(which + "Budget");
  if (!node) return;
  const tot = STAT_KEYS.reduce(function(a, k){ return a + (side.sp[k] || 0); }, 0);
  node.innerHTML = "";
  node.appendChild(el("span", null, tot + " of 66 SP"));
  const over = STAT_KEYS.filter(function(k){ return (side.sp[k] || 0) > 32; });
  let msg = (66 - tot) + " left";
  if (tot > 66) msg = (tot - 66) + " over the budget";
  else if (over.length) msg = over.map(function(k){ return STAT_LABEL[k]; }).join(", ") + " over 32";
  const s = el("span", null, msg);
  if (tot > 66 || over.length) s.classList.add("c-bad");
  node.appendChild(s);
}

/* which stats the current move really reads, before any of them are shown */
function calcLiveStats(){
  const m = CALC.move;
  if (!m) return {aKey:"atk", dKey:"def"};
  const phys = m.cat === "P";
  let aKey = phys ? "atk" : "spa", dKey = phys ? "def" : "spd";
  if (m.name === "Psyshock") dKey = "def";      // Special, hits Defense
  if (m.name === "Body Press") aKey = "def";    // attacks off Defense
  if (m.name === "Foul Play") aKey = "atk";     // off the TARGET's Attack
  return {aKey:aKey, dKey:dKey};
}

/* PICK A SIDE: from his builds (searchable - a hundred builds is a hundred
   cards to scroll past), or any form in the dex. */
function calcPickSheet(which){
  const side = CALC[which];
  openSheet(which === "atk" ? "Attacker" : "Defender", function(body){
    buildPicks(body, which);
    body.appendChild(el("h2", null, "Or any Pokemon"));
    const inp = searchField(body, "Search " + DEX.length +
      " forms, Megas included", function(){ draw(); });
    const list = el("div", "list cards");
    body.appendChild(list);
    function draw(){ drawDexPicks(list, inp.q(), which, side); }
    draw();
  }, []);
}

/* "From your builds", with its own filter and count. */
function buildPicks(body, which){
  const builds = Object.keys(S.builds).sort(function(a, b){
    return String(S.builds[a].pokemon).localeCompare(String(S.builds[b].pokemon));
  });
  if (!builds.length) return;
  body.appendChild(el("h2", null, "From your builds"));
  const bq = searchField(body, "Filter " + builds.length + " build" +
    (builds.length === 1 ? "" : "s"), function(){ drawBuilds(); });
  const bl = el("div", "list cards");
  const bcount = el("div", "sub mb6");
  body.appendChild(bcount);
  function drawBuilds(){
    const q = bq.q();
    bl.innerHTML = "";
    let shown = 0;
    builds.forEach(function(id){
      const card = buildPickCard(which, id, q);
      if (!card) return;
      shown++;
      bl.appendChild(card);
    });
    bcount.textContent = shown === builds.length
      ? plural(builds.length, "build")
      : shown + " of " + builds.length + " builds";
    if (!shown) bl.appendChild(el("div", "empty", "No build matches"));
  }
  body.appendChild(bl);
  drawBuilds();
}

/* One build as THE SAME CARD AS THE BOX AND FIND - picking who is attacking
   is a comparison between Pokemon, so it needs the numbers being compared -
   with its nature and spread as cells. Null when it does not match the filter
   or has no dex row. */
function buildPickCard(which, id, q){
  const b = S.builds[id];
  const p = byName[b.mega || b.pokemon] || byName[b.pokemon];
  if (!p) return null;
  const hay = [id, b.pokemon, b.mega, b.role, b.nature, baseAbility(b),
             (b.moves || []).join(" "), p.types.join(" ")]
    .filter(Boolean).join(" ").toLowerCase();
  if (q && !hay.includes(q)) return null;
  return pokeCard(p, {
    cls: "perm",
    abLabel: "Ability",
    cells: [
      labelBox(b.nature || "—", "Nature", "wide"),
      labelBox(STAT_KEYS.map(function(k){
        return b.stat_points?.[k] || 0;
      }).join("/"), "SP")
    ],
    onclick: function(){ calcLoadBuild(which, id, b); }
  });
}

/* Up to 120 forms, and it says so: a Pokemon merely past the cut used to look
   like one the calculator did not know about. */
function drawDexPicks(list, q, which, side){
  list.innerHTML = "";
  const all = DEX.filter(function(p){
    return !q || p.name.toLowerCase().includes(q);
  });
  all.slice(0, 120).forEach(function(p){
    list.appendChild(pokeCard(p, {
      onclick: function(){
        side.name = p.name; side.buildId = null;
        if (which === "atk") CALC.move = null;
        closeSheet(); calcDraw();
      }
    }));
  });
  capNote(list, Math.min(120, all.length), all.length, "forms");
  if (!list.children.length) list.appendChild(el("div", "empty", "Nothing matches"));
}

/* Load a saved build onto a side: its form, nature, ability and spread, and
   no stat stages. A new attacker drops the move it had. */
function calcLoadBuild(which, id, b){
  const side = CALC[which];
  side.name = b.mega || b.pokemon;
  side.buildId = id;
  side.nature = b.nature || null;
  side.ability = activeAbility(b);
  const sp = b.stat_points || {};
  STAT_KEYS.forEach(function(k){ side.sp[k] = sp[k] || 0; });
  STAT_KEYS.forEach(function(k){ if (k !== "hp") side.boost[k] = 0; });
  if (which === "atk") CALC.move = null;
  closeSheet();
  calcDraw();
}

/* PICK THE MOVE: the build's own moves first when the attacker came from a
   build, then everything it learns - ALL of it, damaging moves ranked by
   power times accuracy. The longest movepool is 106, and a cut at 60 took
   moves off half the dex with nothing saying so. */
function calcMoveSheet(){
  const a = CALC.atk;
  if (!a.name) { toast("Pick the attacker first"); return; }
  const ls = learnset(a.name);
  const build = a.buildId ? S.builds[a.buildId] : null;
  openSheet("Move", function(body){
    if (build && (build.moves || []).length) {
      body.appendChild(el("h2", null, "On this build"));
      const bl = el("div", "list");
      (build.moves || []).forEach(function(n){
        const mv = MOVE_BY[n];
        if (!mv) return;
        bl.appendChild(calcMoveRow(mv, true));
      });
      body.appendChild(bl);
    }
    body.appendChild(el("h2", null, ls ? "Everything it learns" : "All moves"));
    const inp = searchField(body, "Filter by name or type",
                          function(){ draw(); });
    const list = el("div", "list");
    body.appendChild(list);
    if (!ls) {
      body.appendChild(el("div", "note bad",
        "No movepool on record for " + a.name + "."));
    }
    const pool = (ls || []).filter(function(m){ return m.cat !== "T"; });
    function draw(){
      const q = inp.q();
      list.innerHTML = "";
      pool.filter(function(m){
        return !q || m.name.toLowerCase().includes(q) ||
               m.type.toLowerCase().includes(q);
      }).sort(function(x, y){
        return (y.bp || 0) * Math.min(100, y.acc || 100) -
               (x.bp || 0) * Math.min(100, x.acc || 100);
      }).forEach(function(m){ list.appendChild(calcMoveRow(m)); });
      if (!list.children.length) list.appendChild(el("div", "empty", "Nothing matches"));
    }
    draw();
  }, []);
}
function calcMoveRow(m, fromBuild){
  const r = el("button", "row" + (fromBuild ? " perm" : ""));
  const mm = el("div", "rmain");
  const h = el("div", "rname");
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

/* THE FIELD PANEL: every switch the engine reads, in labelled rows. A GROUP'S
   LABEL SITS ON THE SAME LINE AS ITS BUTTONS - eight full-width headings cost
   eight lines of nothing (player, 2026-09-19: "sigo pensando que ocupan
   espacio innecesario"). Each switch is written out as its own assignment to
   CALC, which is what lets check_app.js prove every one reaches the engine. */
function calcFieldCtl(){
  const host = $("calcField");
  host.innerHTML = "";
  const f = fieldRows(host);
  f.group("The hit", "What happens on this particular hit");
  f.tog("Critical hit", CALC.crit, function(){ CALC.crit = !CALC.crit; calcDraw(); });
  weatherAndTerrain(f);
  attackerSwitches(f);
  targetSwitches(f);
  screenSwitches(f, CALC.move);
  f.group("Field", "Conditions that apply to both sides at once");
  f.tog("Gravity", CALC.gravity, function(){
    CALC.gravity = !CALC.gravity; calcDraw(); });
  f.tog("Wonder Room", CALC.wonderRoom, function(){
    CALC.wonderRoom = !CALC.wonderRoom; calcDraw(); });
  f.tog("Magic Room", CALC.magicRoom, function(){
    CALC.magicRoom = !CALC.magicRoom; calcDraw(); });
}

/* The two builders the Field panel is made of: group() starts a labelled row
   (its label a cell in the row, the reason on hover), tog() adds a toggle to
   the current row. */
function fieldRows(host){
  let cur = null;
  return {
    group: function(label, why){
      cur = el("div", "fieldrow");
      const h = el("span", "fieldgroup");
      h.textContent = label;
      if (why) h.title = why;
      cur.appendChild(h);
      host.appendChild(cur);
    },
    tog: function(label, on, fn, cls){
      const t = el("button", "tog " + (cls || ""), label);
      setPressed(t, on);
      t.onclick = fn;
      (cur || host).appendChild(t);
      return t;
    }
  };
}

/* One weather and one terrain at most; tapping the one that is on turns it
   off. */
function weatherAndTerrain(f){
  f.group("Weather");
  ["Sun", "Rain", "Sand", "Snow"].forEach(function(w){
    f.tog(w, CALC.weather === w, function(){
      CALC.weather = CALC.weather === w ? null : w; calcDraw();
    });
  });
  f.group("Terrain");
  ["Electric", "Grassy", "Psychic", "Misty"].forEach(function(t){
    f.tog(t, CALC.terrain === t, function(){
      CALC.terrain = CALC.terrain === t ? null : t; calcDraw();
    });
  });
}

function attackerSwitches(f){
  f.group("Attacker", "On the attacking Pokemon's side of the field");
  f.tog("Helping Hand", CALC.helpingHand, function(){
    CALC.helpingHand = !CALC.helpingHand; calcDraw(); });
  f.tog("Charge", CALC.charge, function(){
    CALC.charge = !CALC.charge; calcDraw(); });
  f.tog("Tailwind", CALC.tailwindAtk, function(){
    CALC.tailwindAtk = !CALC.tailwindAtk; calcDraw(); });
  f.tog("Power Trick", CALC.powerTrickAtk, function(){
    CALC.powerTrickAtk = !CALC.powerTrickAtk; calcDraw(); });
  f.tog("+1 All Stats", CALC.plusOneAtk, function(){
    CALC.plusOneAtk = !CALC.plusOneAtk; calcDraw(); });
}

/* The target's side, and then what changes the HP it is ON rather than one
   hit - which is what decides whether the NEXT hit KOes (the player's point:
   you calculate after a switch, after chip, after an attack). */
function targetSwitches(f){
  f.group("Target", "On the target's side of the field");
  f.tog("Friend Guard", CALC.friendGuard, function(){
    CALC.friendGuard = !CALC.friendGuard; calcDraw(); });
  f.tog("Protecting", CALC.protected, function(){
    CALC.protected = !CALC.protected; calcDraw(); });
  f.tog("Power Trick", CALC.powerTrickDef, function(){
    CALC.powerTrickDef = !CALC.powerTrickDef; calcDraw(); });
  f.tog("+1 All Stats", CALC.plusOneDef, function(){
    CALC.plusOneDef = !CALC.plusOneDef; calcDraw(); });
  f.tog("Switching out", CALC.switching, function(){
    CALC.switching = !CALC.switching; calcDraw(); });
  f.group("On the target", "These change the KO count rather than the roll");
  f.tog("Stealth Rock", CALC.stealthRock, function(){
    CALC.stealthRock = !CALC.stealthRock; calcDraw(); });
  /* layers of Spikes; the group already says what they are */
  [1, 2, 3].forEach(function(n){
    f.tog("Spikes ×" + n, CALC.spikes === n, function(){
      CALC.spikes = CALC.spikes === n ? 0 : n; calcDraw(); });
  });
  f.tog("Leech Seed", CALC.leechSeed, function(){
    CALC.leechSeed = !CALC.leechSeed; calcDraw(); });
  f.tog("Salt Cure", CALC.saltCure, function(){
    CALC.saltCure = !CALC.saltCure; calcDraw(); });
  f.tog("Nightmare", CALC.nightmare, function(){
    CALC.nightmare = !CALC.nightmare; calcDraw(); });
}

/* One screen at most. A screen that cannot touch the chosen move is dimmed
   rather than hidden, so it is obvious WHY it changes nothing. */
function screenSwitches(f, m){
  f.group("Screens", "Reflect, Light Screen and Aurora Veil on the target's side");
  [["Reflect", "physical", "P"], ["Light Screen", "special", "S"],
   ["Aurora Veil", "both", null]].forEach(function(r){
    const sc = r[0], relevant = !m || !r[2] || m.cat === r[2];
    const t = f.tog(sc + " (" + r[1] + ")", CALC.screen === sc, function(){
      CALC.screen = CALC.screen === sc ? null : sc; calcDraw();
    });
    if (!relevant) { t.classList.add("dim");
      t.title = sc + " only stops " + r[1] + " moves"; }
  });
}

/* The verdict's colour by hits to KO: one, two, or three and more. */
const KO_CLASS = {1: "k1", 2: "k2"};
const KO_FILL = {1: "var(--bad)", 2: "var(--warn)"};

/* THE ANSWER: the range, the percentage and the KO verdict on one line, a
   bar, the engine's own sentence - it names every modifier that actually
   fired - the notes a number cannot carry, and every roll. */
function calcRun(){
  const out = $("calcOut");
  out.innerHTML = "";
  const a = CALC.atk, d = CALC.def, m = CALC.move;
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
  let r;
  try { r = engineCalc(); }
  catch (e) {
    out.appendChild(el("div", "note bad",
      "The engine could not calculate this: " + (e?.message || e)));
    return;
  }
  const hp = r.curHP != null ? r.curHP : r.hp;
  const ko = koCount(r.lo, r.hi, hp);
  out.appendChild(verdictLine(r, ko));
  out.appendChild(koBar(r, hp, ko));
  if (r.desc) {
    const dsc = el("p", "sub mt6 mb0");
    dsc.textContent = r.desc;
    out.appendChild(dsc);
  }
  const flags = calcFlags(m);
  if (flags.length) {
    const fl = el("div", "calcflags");
    flags.forEach(function(t){
      const x = el("div", "note " + (t[0] || ""));
      x.textContent = t[1];
      fl.appendChild(x);
    });
    out.appendChild(fl);
  }
  out.appendChild(rollsDetails(r));
}

/* The number, the percentage and the verdict on one line - this is the
   answer, and it stays on screen while the inputs below it change. */
function verdictLine(r, ko){
  const pctLo = r.lo / r.hp * 100, pctHi = r.hi / r.hp * 100;
  const v = el("div", "verdict");
  v.appendChild(el("span", "num", r.lo + " - " + r.hi));
  v.appendChild(el("span", "pct", "of " + r.hp + " HP  ·  " +
    pctLo.toFixed(1) + "-" + pctHi.toFixed(1) + "%" +
    (r.hits > 1 ? "  ·  " + r.hits + " hits" : "") +
    (r.curHP != null && r.curHP !== r.hp ? "  ·  on " + r.curHP + " HP" : "")));
  v.appendChild(el("span", "kotag " + (KO_CLASS[ko.n] || "k3"), r.koText || ko.text));
  return v;
}

function koBar(r, hp, ko){
  const bar = el("div", "meter ko");
  const fill = el("i");
  fill.style.width = Math.min(100, r.hi / hp * 100) + "%";
  fill.style.background = KO_FILL[ko.n] || "var(--accent)";
  bar.appendChild(fill);
  return bar;
}

/* What the number cannot say by itself: Singles vs a spread move's x0.75, a
   move that hits the ally, and the moves whose power depends on something
   the calculator was not told. */
function calcFlags(m){
  const flags = [];
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
  return flags;
}

function rollsDetails(r){
  const det = el("details", "rolls");
  const sum = el("summary", null, "Every roll, and where the number came from");
  det.appendChild(sum);
  const rl = el("div", "rmeta");
  r.rolls.forEach(function(x){ rl.appendChild(el("span", "tag", String(x))); });
  det.appendChild(rl);
  det.appendChild(el("p", "sub",
    "Calculated by Smogon's own Champions engine, bundled into this page - " +
    "not an approximation of it."));
  return det;
}

/* The whole Damage tab, from CALC: both sides, the move slot, the field and
   the answer. */
function calcDraw(){
  calcSideCtl("atk");
  calcSideCtl("def");
  const b = $("calcMove");
  b.innerHTML = "";
  const mm = el("div", "rmain");
  if (CALC.move) {
    const h = el("div", "rname");
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

export { CALC, calcDraw, engineCalc, engineReady };
