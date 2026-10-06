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
   every one of them. A build may itself be unbound (an idea), which lets a
   team be four-sixths real and still worth writing down: the report says what
   he has, where it is, and what is still missing.

   THE ITEM LIVES ON THE SLOT. Not a layout choice - the Item Clause means six
   Pokemon field exactly one Sitrus Berry, so an item stored per build is a
   preference that cannot survive contact with a team. That is why builds
   deliberately carry no item at all. */
const TEAM_SLOTS = 6;

/** What teamReport works out about one slot. Filled in as it goes: a slot
    with no build stops after `name`, one whose species is not in the dex
    after `row`.
    @typedef {{i: number, slot: TeamSlot, build: Build | null,
      name: string | undefined, state?: string, row?: BoxRow, p?: DexRow,
      types?: string[], mega?: DexRow | null, megaTypes?: string[],
      sp?: number, nature?: string}} SlotInfo */
/** A Mega that changes what the screen shows: its typing, its Speed, or both.
    @typedef {{i: number, name: string, mega: string, retype: boolean,
      respeed: boolean, from: string[], to: string[], speFrom: number,
      speTo: number}} MegaCase */
/** One line of the Speed order.
    @typedef {{name: string | undefined, form: string | undefined,
      mega: boolean, base: number, nature: string | undefined,
      sp: number | undefined, spe: number}} SpeedRow */
/** One attacking type against the six, with who is weak and who resists.
    @typedef {{type: string, weak: number, resist: number,
      weakOf: {name: string, m: number}[],
      resistOf: {name: string, m: number}[]}} TypeRow */
/** @typedef {{slots: SlotInfo[], filled: number, ready: number,
      problems: string[], warnings: string[], missing: string[],
      stones: {name: string, stone: string | undefined, owned: boolean}[],
      speeds: SpeedRow[], megaCases: MegaCase[]}} TeamReport */

/** What gets written. Built in one place because it is now saved from two -
   the Save button, and the quick jump into a build's editor, which has to
   put this draft somewhere before it leaves the screen.
   @param {{name: string, slots: (TeamSlot | null | undefined)[], notes?: Record<string, string>}} draft */
function teamDoc(draft){
  return {name: draft.name,
          slots: draft.slots.filter(function(x){ return x?.build_id; }),
          notes: draft.notes || {}};
}

/** WHAT THIS SLOT BECOMES IF IT MEGA EVOLVES, or null.

   Two routes, because the stone is recorded in two places for two different
   reasons and both are real. A BUILD declares its `mega` - the stone is what
   creates the form, so it lives in the build. A SLOT can also hold the stone
   as its item, which is where the Item Clause puts it. Reading only one of
   them would miss half the teams.
   @param {Build | null | undefined} b
   @param {TeamSlot | undefined} slot
   @returns {DexRow | null} */
function megaOf(b, slot){
  if (!b) return null;
  if (b.mega && byName[b.mega]) return byName[b.mega];
  if (slot?.item) {
    const ms = megasFor(b.pokemon) || [];
    for (const m of ms) {
      if (m && STONE_OF[m.name] === slot.item) return m;
    }
  }
  return null;
}

/** Always exactly six slots, empty ones as {}, so every screen can index
   slot 0..5 without checking.
   @param {Team | null | undefined} t
   @returns {TeamSlot[]} */
function teamSlots(t){
  const out = (t?.slots || []).slice(0, TEAM_SLOTS);
  while (out.length < TEAM_SLOTS) out.push({});
  return out;
}

/** Everything the app can work out about a team, in one pass, so the sheet and
   the list agree by construction rather than by both remembering.
   @param {Team | null | undefined} t
   @returns {TeamReport} */
function teamReport(t){
  /** @type {TeamReport} */
  const r = {
    slots: [], filled: 0, ready: 0, problems: [], warnings: [],
    missing: [], stones: [], speeds: [],
    /* the slots whose stone changes something the screen shows - what makes
       the type table and the Speed order more than one table each */
    megaCases: []
  };
  const seen = {item: {}, form: {}};
  teamSlots(t).forEach(function(sl, i){ r.slots.push(slotReport(r, sl, i, seen)); });
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

/** One slot's facts, counted into the report as it goes: whether it can be
   brought, its form and Mega, the Species and Item Clauses.
   @param {TeamReport} r
   @param {TeamSlot} sl
   @param {number} i
   @param {{item: Record<string, number>, form: Record<string, number>}} seen
   @returns {SlotInfo} */
function slotReport(r, sl, i, seen){
  const b = sl.build_id ? S.builds[sl.build_id] : null;
  /** @type {SlotInfo} */
  const info = {i: i, slot: sl, build: b, name: b?.pokemon};
  if (b) {
    r.filled++;
    slotReadiness(r, b, sl, info);
    const p = byName[b.pokemon];
    if (p) {
      slotForm(r, b, sl, p, info);
      /* Species Clause is per FORM, not per species: two Squawkabilly of
         different plumage still cannot share a team. */
      if (seen.form[b.pokemon]) r.problems.push("two " + b.pokemon + " - the Species Clause forbids it");
      seen.form[b.pokemon] = 1;
    }
    if (b.mega) {
      const st = STONE_OF[b.mega];
      r.stones.push({name: b.mega, stone: st, owned: st ? hasStone(st) : false});
    }
  }
  if (sl.item) {
    if (seen.item[sl.item]) r.problems.push("two " + sl.item + " - the Item Clause allows one per team");
    seen.item[sl.item] = 1;
  }
  return info;
}

/** "READY" means it could be brought TODAY: the Pokemon exists and is in the
   Champions box. Parked in HOME is one recall away; unbound is not owned at
   all; an orphan's Pokemon is gone.
   @param {TeamReport} r
   @param {Build} b
   @param {TeamSlot} sl
   @param {SlotInfo} info */
function slotReadiness(r, b, sl, info){
  const lk = buildLink(sl.build_id);
  info.state = lk.state;
  info.row = lk.row;
  if (lk.state === "active") r.ready++;
  else if (lk.state === "parked")
    r.warnings.push(b.pokemon + " is parked in HOME - recall it before you can play it");
  else if (lk.state === "orphan")
    r.problems.push(b.pokemon + "'s build points at a Pokemon that is gone");
  else r.missing.push(b.pokemon);
}

/** The slot's form, and THE SPEED THE BUILD ACTUALLY HAS - its own SP and
   nature, not its species' base row. Two builds of one species differ by 32
   SP and a nature, which is most of what a Speed order is decided by.

   A Mega becomes a "what if it evolves" case (megaCases) only if it CHANGES
   something on screen: the typing, or the Speed. Mega Camerupt keeps
   Fire/Ground but drops from 40 to 20 Speed - invisible to the type table,
   decisive in the Speed order.
   @param {TeamReport} r
   @param {Build} b
   @param {TeamSlot} sl
   @param {DexRow} p
   @param {SlotInfo} info */
function slotForm(r, b, sl, p, info){
  const mg = megaOf(b, sl);
  info.p = p;
  info.types = p.types;
  info.mega = mg || null;
  info.sp = b.stat_points?.spe || 0;
  info.nature = b.nature || "";
  if (!mg) return;
  const retype = mg.types.join("/") !== p.types.join("/");
  const respeed = mg.b[5] !== p.b[5];
  if (retype) info.megaTypes = mg.types;
  if (retype || respeed) {
    r.megaCases.push({i: info.i, name: b.pokemon, mega: mg.name,
                      retype: retype, respeed: respeed,
                      from: p.types, to: mg.types,
                      speFrom: p.b[5], speTo: mg.b[5]});
  }
}

/** The Speed order for one outcome. `megaAt` is the slot that Mega Evolved,
   or null for nobody - the same argument teamTypes takes, because they are
   two readings of the same battle and must never disagree on screen.

   Only one Pokemon may Mega Evolve per battle, and an unevolved slot is its
   base row whatever stone it carries - so this is asked per outcome, never
   with every Mega applied at once.
   @param {TeamReport} r
   @param {number | null} [megaAt] nobody evolved when left out
   @returns {SpeedRow[]} */
function teamSpeeds(r, megaAt){
  /** @type {SpeedRow[]} */
  const out = [];
  r.slots.forEach(function(s, i){
    if (!s.build || !s.p) return;
    const mg = megaAt != null && i === megaAt ? s.mega : null;
    const row = mg || s.p;
    out.push({name: s.name,
              form: mg ? mg.name : s.name,
              mega: !!mg,
              base: row.b[5],
              nature: s.nature,
              sp: s.sp,
              spe: statAt(row.b[5], s.sp, false, natMult(s.nature, "spe"))});
  });
  out.sort(function(a, b){ return b.spe - a.spe; });
  return out;
}

/** What the six of them, together, are weak to and resist, per attacking
   type: a count off the shipped type chart, with the names behind it, worst
   first. `megaAt` is the slot index that has Mega Evolved, or null.

   ONE TABLE PER OUTCOME, because a retyping stone makes several teams out of
   one. Only one Pokemon may Mega Evolve per battle, so two stones are two
   different teams and cannot be merged. And the base typing is a real case,
   not a transition: Mega Evolution resolves after switch-ins, so the base
   form takes the first hit, and staying unevolved to resist something is a
   real play.
   @param {TeamReport} r
   @param {number | null} [megaAt] nobody evolved when left out
   @returns {TypeRow[]} */
function teamTypes(r, megaAt){
  /** @type {TypeRow[]} */
  const out = [];
  /* Stellar is in the chart and NOT in Champions - there is no Tera here, so
     no move can be that type and counting it would invent a weakness. */
  Object.keys(C.CHART).filter(function(t){ return t !== "Stellar"; })
        .forEach(function(atk){
    /* THE NAMES, not just the tally: "Fire: 3 weak" leaves you to work out
       who. The multiplier rides along because x4 and x2 are not the same
       problem, and neither are x0.25 and x0.5. */
    /** @type {{name: string, m: number}[]} */
    const weakOf = [];
    /** @type {{name: string, m: number}[]} */
    const resistOf = [];
    r.slots.forEach(function(s, si){
      if (!s.types || !s.name) return;
      /* megaTypes is set only for a Mega that retypes, so it implies s.mega */
      const mg = megaAt != null && si === megaAt && s.megaTypes ? s.mega : null;
      const types = (mg && s.megaTypes) || s.types;
      const who = mg ? mg.name : s.name;
      let m = 1;
      types.forEach(function(t){
        const v = C.CHART[atk]?.[t];
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
   The pool the team's item picker offers: every Hold Item and Berry, plus
   every Mega Stone.

   The stones come from C.STONES ([stone, mega, species]), because C.ITEMS
   leaves them out on purpose - the Items tab gives them a pane of their own.
   Miscellaneous items are dropped: that is the game's bucket for things that
   cannot be held. Berries stay - their category is the shop's shelf, not a
   rule about holding. */
function holdable(){
  const out = (C.ITEMS || []).filter(function(it){
    const cat = it[2] || "Miscellaneous";
    return cat === "Hold Items" || cat === "Berries";
  }).map(function(it){
    return {name: it[0], vp: it[1], cat: it[2] || "Hold Items",
            text: it[3] || "", stone: false};
  });
  /* one row per STONE, not per Mega: Charizardite X and Y are two stones and
     one species, and the mapping is 1:1 over all 81 */
  /** @type {Record<string, number>} */
  const seen = {};
  (C.STONES || []).forEach(function(r){
    const st = r[0];
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
