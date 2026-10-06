/* The GTS rules, with no screen in them: which copy may leave (keep one per
   form), what a Pokemon is worth as a chip, how hard a species is to get, and
   the three offer slots. Everything that decides what a chip is WORTH is
   argued in this file, and only here. */
import {
  anyRow, bst, byName, C, FORMS, MEGAS_OF, megasFor, STONE_OF,
} from "./data.js";
import { boxRows, hasStone, originOf, S } from "./state.js";

/* ======================================================================= gts */
/** +12, -3, 0
   @param {number} n */
function signed(n){ return (n > 0 ? "+" : "") + n; }
/** How far apart the two sides of a trade are on ladder demand, as
   [tag tone, sentence]. gap > 0 means asking for the more wanted one.
   @param {number} gap */
function demandFit(gap){
  if (gap >= 120)
    return ["bad", "a long way up — the other side wants theirs far more than yours"];
  if (gap >= 60) return ["warn", "asking up; it can still land, but slowly"];
  if (gap <= -40) return ["", "you are giving up the more wanted one"];
  return ["ok", "well matched on demand"];
}

/* ------------------------------------------------- GTS difficulty ----
   How hard a species is to get through the GTS is TWO questions, and BST
   answers neither:

     DEMAND - measured, from pokebase ladder usage: a Pokemon the other side
              is running is not one they will trade away.
     SUPPLY - how hard it is to obtain in Pokemon GO, the player's only route
              in. No Champions source measures it, so it is declared in
              data/meta/go_sourcing.json and always shown as an estimate.

   The harder half decides the score (build_gts_difficulty.py), because
   either alone is enough to kill a trade; when both are hard it goes to 5. */
/** @typedef {NonNullable<ReturnType<typeof gtsDiff>>} GtsDiff */
/** @typedef {NonNullable<ReturnType<typeof chipValue>>} ChipValue */
/** What he has for keeps (`owned`) and what a HOME copy would free a slot for
    (`frees`), each keyed by form and by species.
    @typedef {{owned: Record<string, number>, frees: Record<string, number>}} Ownership */
/** One species a chip could fetch, scored for the suggestion list.
    @typedef {{name: string, bst: number, spe: number, stone: string | null,
      rank: number | null | undefined, demand: number | undefined,
      band: "reach" | "base", frees: boolean, stretch: boolean,
      score: number}} Ask */
const DIFF_LABEL = ["", "easy", "doable", "hard", "very hard", "near impossible"];
/** A species' GTS difficulty row, unpacked from the payload's array into named
   fields.
   @param {string} name */
function gtsDiff(name){
  const d = C.GTSDIFF?.[name];
  if (!d) return null;
  return {score:d[0], demand:d[1], supply:d[2], rank:d[3], how:d[4] || "",
          usage:d[5], size:d[6] || 0};
}
/** "#224 of 324 · 0.41%". A rank with no denominator is half a fact. An
   ABSENT row is not last place: a species a new regulation just added has
   no row at all, and says "unranked".
   @param {GtsDiff | null} d */
function ladderText(d){
  if (!d) return "";
  /* Never name the regulation in this string: the ladder data refreshes
     under it, and a hard-coded name goes stale while sounding certain. */
  if (d.rank == null) return "unranked" + (d.size ? " (ladder lists " + d.size + ")" : "");
  return "#" + d.rank + (d.size ? " of " + d.size : "") +
         (d.usage != null ? " · " + d.usage.toFixed(2) + "%" : "");
}
/** The question that outranks the trade: if he can just evolve it in GO, a
   chip spent here is a chip wasted.
   @param {GtsDiff | null} d */
function gtsSelfServe(d){ return d && d.supply <= 2 && d.demand >= 3; }

/* How far above a chip's full price an ask may still be suggested. Measured
   on his closed trades: every trade that landed above the old, tighter
   ceiling closed anyway, and 60 covers all of them (analysis/gts_pricing.md). */
const CEILING = 60;
/* The GTS holds THREE offers at once; an open offer occupies its slot until
   it is taken or withdrawn. A fixed game rule, unlike the box capacity,
   which grows and therefore lives in meta.trainer. */
const GTS_SLOTS = 3;
/* ==================================================== what a chip is WORTH ==
   All derived at read time from the dex plus the ledger; the only stored
   evidence is the trade history, a record of what actually happened.

   THE MEGA LINE IS THE PRICE, the base row only the floor. Measured on his
   own trades: Beedrill (395) fetched Toxapex (495) and Slowbro (490), Mawile
   (380) fetched Glalie (480) - each exactly its Mega's BST.

   Two premiums widen how far up a chip may AIM (`reach`) without touching
   its measured `value`, because neither is measured yet - every surface
   that shows them calls them estimates. The trade history records shininess
   and the ladder rank at the time, so both can be measured later the same
   way the Mega rule was:

     SHINY_REACH   a shiny is rarer than its species and trades above it
     demandReach   a Pokemon the ladder WANTS clears fast whatever its BST:
                   Indeedee (475, no Mega, top-30) cleared the same day,
                   twice, while bigger numbers sat for days */
const SHINY_REACH = 60;    // ESTIMATE: about one BST tier. Not measured.

/** @param {string} name */
function demandReach(name){
  const d = gtsDiff(name);
  if (d?.rank == null) return 0;
  if (d.demand >= 5) return 90;      // top of the ladder: people come to you
  if (d.demand >= 4) return 60;
  if (d.demand >= 3) return 35;
  if (d.demand >= 2) return 15;
  return 0;
}
/** A chip's price: {base, value (the Mega line's best BST), reach (how far
   up it may aim), and the premiums that make up the difference}.
   @param {string} name
   @param {boolean} [shiny] */
function chipValue(name, shiny){
  /* anyRow, NOT byName: a species Champions does not have is exactly what a
     GTS chip is usually made of (only duplicates and species Champions cannot
     use may be offered), and it still has a real BST in HOME_DEX. With no
     Mega line and no ladder row, its price is simply its base row. */
  const p = anyRow(name);
  if (!p) return null;
  const base = bst(p);
  let best = base;
  megasFor(name).forEach(function(m){ best = Math.max(best, bst(m)); });
  const dem = demandReach(name);
  return {base:base, value:best, viaMega:best > base,
          shiny:!!shiny,
          demandBonus:dem,
          reach:best + (shiny ? SHINY_REACH : 0) + dem,
          shinyBonus:shiny ? SHINY_REACH : 0};
}
/** the shiny flag lives on the box row, not on the species
   @param {BoxRow | null | undefined} rec */
function chipValueOf(rec){
  if (!rec) return null;
  return chipValue(rec.name, !!rec.shiny);
}

/** Stones bought for a Pokemon that is nowhere in the ledger - 2000 VP each,
   sitting dead until a trade brings one in.
   @returns {{stone: string, species: string, mega: string, bst: number | null, megaBst: number, spe: number | null}[]} */
function deadStones(){
  /** @type {Record<string, number>} */
  const have = {};
  boxRows("home").concat(boxRows("champions")).forEach(function(r){
    have[r.name] = 1;
    const p = byName[r.name];
    if (p?.species) have[p.species] = 1;
  });
  /** @type {ReturnType<typeof deadStones>} */
  const out = [];
  /* walk the Megas, not the stones: STONE_OF is keyed by Mega name, and a
     stone is only dead if NO form of its species is anywhere in the ledger */
  Object.keys(MEGAS_OF).forEach(function(sp){
    if (have[sp]) return;
    MEGAS_OF[sp].forEach(function(m){
      const st = STONE_OF[m.name];
      if (!st || !hasStone(st)) return;
      const base = byName[sp];
      out.push({stone:st, species:sp, mega:m.name,
                bst:base ? bst(base) : null, megaBst:bst(m),
                spe:base ? base.b[5] : null});
    });
  });
  out.sort(function(a, b){ return (a.bst || 0) - (b.bst || 0); });
  return out;
}

/** IS AN ASK OF BST `b` IN RANGE FOR CHIP `v`? "reach", "base" or null - the
   two bands askBands() explains, written once so the suggestion list and
   anything checking a single trade can never disagree.

   The ceiling is CEILING above the chip's reach; the floor is 70 below its
   base row, and nothing in his 51 priced trades ever landed below it -
   asking for less than you could is safe.
   @param {ChipValue | null} v
   @param {number} b
   @returns {"reach" | "base" | null} */
function chipBand(v, b){
  if (!v) return null;
  if (b > v.reach + CEILING || b < Math.min(v.base, v.value) - 70) return null;
  return b >= v.value - 25 ? "reach" : "base";
}
/** What this chip could realistically fetch, best first, up to `limit`
   (14): species not already his for keeps, in range of the chip, not in
   high demand (a top-of-ladder Pokemon is played, not traded), ranked up
   when it would free a welded slot or put a dead stone to use.
   @param {string} chipName
   @param {number} [limit]
   @param {boolean} [shiny]
   @returns {Ask[]} */
function gtsSuggest(chipName, limit, shiny){
  const v = chipValue(chipName, shiny);
  if (!v) return [];
  const own = ownership();
  const bands = askBands(v, own, deadStonesBySpecies(own));
  bands.reach.sort(bySuggestScore);
  bands.base.sort(bySuggestScore);
  /* filled alternately, so a chip with a big Mega cannot bury the safer half
     under thirty reach-band targets */
  const want = limit || 14;
  /** @type {Ask[]} */
  const out = [];
  while (out.length < want && (bands.reach.length || bands.base.length)) {
    const up = bands.reach.shift();
    if (up) out.push(up);
    const safe = out.length < want ? bands.base.shift() : undefined;
    if (safe) out.push(safe);
  }
  return out;
}

/** OWNED IN HOME IS DONE; OWNED ONLY IN CHAMPIONS IS STILL A TARGET. Both used
   to count as owned, which quietly removed the best asks on the board: an
   Encounter Pokemon can never leave the box, so a second copy arriving through
   HOME is worth a whole slot. `owned` is what he has for keeps (HOME, or
   HOME-origin in the box); `frees` is what a HOME copy would free a slot for.
   Both are keyed by form and by species.
   @returns {Ownership} */
function ownership(){
  /** @type {Record<string, number>} */
  const owned = {};
  /** @type {Record<string, number>} */
  const frees = {};
  boxRows("home").forEach(function(r){ markOwned(owned, r); });
  boxRows("champions").forEach(function(r){
    markOwned(originOf(r) === "home" ? owned : frees, r);
  });
  return {owned: owned, frees: frees};
}

/** Mark a row's form and its species as owned, so a lookup by either spelling
   finds it.
   @param {Record<string, number>} into
   @param {BoxRow} r */
function markOwned(into, r){
  into[r.name] = 1;
  const p = byName[r.name];
  if (p?.species) into[p.species] = 1;
}

/** Species with a Mega Stone already bought and nothing to hold it: trading
   for one turns 2000 VP back on.
   @param {Ownership} own
   @returns {Record<string, string>} */
function deadStonesBySpecies(own){
  /** @type {Record<string, string>} */
  const dead = {};
  Object.keys(MEGAS_OF).forEach(function(sp){
    if (own.owned[sp] || own.frees[sp]) return;
    MEGAS_OF[sp].forEach(function(m){
      const st = STONE_OF[m.name];
      if (st && hasStone(st)) dead[sp] = st;
    });
  });
  return dead;
}

/** TWO BANDS, NOT ONE WINDOW. A Mega-capable chip prices at its Mega, and a
   single window around that price would cut out the asks around its base
   row - the ones most likely to be TAKEN.

     reach - at or above the chip's full price (the Mega's BST plus the
             estimated premiums): what it can aim at.
     base  - under it, down to 70 below the base row: asking for less than
             you could is how an offer clears the same day.

   Anything people are running (ladder demand 4+) will not be handed over and
   is left out; an UNKNOWN demand is not a low one, so it stays in but is
   never ranked as if it were cheap. Each band is scored against its OWN
   anchor, and A SLOT IS WORTH MORE THAN A STONE: a dead stone is 2000 VP
   already spent, a welded slot cannot be bought back at all.
   @param {ChipValue} v
   @param {Ownership} own
   @param {Record<string, string>} dead
   @returns {{reach: Ask[], base: Ask[]}} */
function askBands(v, own, dead){
  /** @type {{reach: Ask[], base: Ask[]}} */
  const bands = {reach:[], base:[]};
  FORMS.forEach(function(p){
    if (own.owned[p.name] || own.owned[p.species]) return;
    const b = bst(p);
    const band = chipBand(v, b);
    if (!band) return;
    const d = gtsDiff(p.name);
    if (d?.demand != null && d.demand >= 4) return;
    const stone = dead[p.species];
    const anchor = band === "reach" ? v.reach : v.base;
    const free = !!(own.frees[p.name] || own.frees[p.species]);
    bands[band].push({name:p.name, bst:b, spe:p.b[5], stone:stone || null,
              rank:d?.rank, demand:d?.demand, band:band, frees:free,
              stretch:b > v.value,
              score:(free ? 150 : 0) + (stone ? 100 : 0) +
                    (d?.demand != null ? (5 - d.demand) * 6 : 8) +
                    Math.max(0, 20 - Math.abs(anchor - b) / 3)});
  });
  return bands;
}

/** best score first; a tie goes to the bigger BST
   @param {Ask} a
   @param {Ask} b */
function bySuggestScore(a, b){ return b.score - a.score || b.bst - a.bst; }

/** How many days an offer has been sitting, or null when it has no date. An
   offer nobody has taken in nine days is saying the price is wrong.
   @param {Trade} o */
function offerAge(o){
  const t = offerStart(o);
  if (t == null) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}
/** When an offer went up, in ms: the exact time when it has one, else the
   day it was deposited (older rows only stored the date).
   @param {Trade} o */
function offerStart(o){
  if (o.depositedAt) {
    const p = Date.parse(o.depositedAt);
    if (!Number.isNaN(p)) return p;
  }
  if (!o.deposited) return null;
  const t = Date.parse(o.deposited + "T00:00:00");
  return Number.isNaN(t) ? null : t;
}
/** "40 min", "6.5h", "3 days". Hours matter here: time-to-close measures what
   the other side WANTS, the axis BST cannot see, and the difference between
   a trade that cleared in hours and one that sat for days is the signal.
   @param {number | null} ms */
function elapsedText(ms){
  if (ms == null || ms < 0) return null;
  const h = ms / 3600000;
  if (h < 1) return Math.max(1, Math.round(ms / 60000)) + " min";
  if (h < 36) return (h < 10 ? h.toFixed(1) : Math.round(h)) + "h";
  return Math.round(h / 24) + " days";
}

/* One row per trade, from deposit to close (migration 7): `closed` is what
   sorts it into the open offers or the history, so closing a trade updates
   the row that was already there and can never erase another. The history
   is never capped - a closed trade is the only hard evidence of what the
   market pays, and the pricing rules rest on it. */
function gtsRows(){
  return Object.keys(S.gts).map(function(id){
    const r = S.gts[id]; r._id = id; return r;
  });
}
/* closed trades, newest first */
function gtsHistory(){
  return gtsRows().filter(function(r){ return r.closed; })
    .sort(function(a, b){
      return String(b.closedAt || b.closed || "")
        .localeCompare(String(a.closedAt || a.closed || ""));
    });
}

/** HOW MANY KEEPABLE COPIES of each form he has: {name: count}. This is what
   "duplicate" means, and a welded copy does not count.

   A rental or an Encounter buy is Champions origin: it can never leave the
   game, so it can never be the copy he keeps. A HOME Metagross beside a
   rental Metagross is ONE keepable copy, and trading the HOME one would lose
   the species for good. Only a row that can BE in HOME counts - one already
   there, or a HOME-origin one in the Champions box that can be parked back.
   @returns {Record<string, number>} */
function keepableCopies(){
  /** @type {Record<string, number>} */
  const n = {};
  boxRows("home").forEach(function(r){ n[r.name] = (n[r.name] || 0) + 1; });
  boxRows("champions").forEach(function(r){
    if (originOf(r) === "home") n[r.name] = (n[r.name] || 0) + 1;
  });
  return n;
}
/** THE KEEP-ONE RULE: he always keeps one of every form in HOME. Only two
   things may be offered - a copy past the first, or a species Champions does
   not allow at all. True when offering `rec` would give away the last
   keepable copy, which is what the deposit sheet warns about.

   Counts the BOX, not the offers: depositing does not remove the Pokemon, so
   the copy is still there until the trade actually closes. And it counts
   keepable copies only (keepableCopies), so a welded rental never makes the
   one in HOME look expendable.
   @param {BoxRow | null | undefined} rec */
function lastCopyOf(rec){
  if (!rec) return false;
  if (!byName[rec.name]) return false;          // not in the dex: free to trade
  return (keepableCopies()[rec.name] || 0) <= 1;
}
/** THE RULE IS PER FORM, AND HE PICKS WHICH FORM to keep: with a male and a
   female Indeedee, either may be the keeper. So the last-copy warning names
   the other forms of the species still in the box and lets him judge. Returns
   those sibling form names.
   @param {BoxRow} rec */
function otherFormsOf(rec){
  const p = byName[rec.name];
  if (!p?.species) return [];
  /** @type {Record<string, number>} */
  const out = {};
  boxRows("home").concat(boxRows("champions")).forEach(function(r){
    if (r.name === rec.name) return;
    const q = byName[r.name];
    if (q && q.species === p.species) out[r.name] = 1;
  });
  return Object.keys(out);
}

/* open offers, oldest first */
function gtsOffers(){
  return gtsRows().filter(function(r){ return !r.closed; })
    .sort(function(a, b){
      return String(a.depositedAt || a.deposited || "")
        .localeCompare(String(b.depositedAt || b.deposited || ""));
    });
}
/* How many GTS slots are still free. */
function gtsFree(){ return Math.max(0, GTS_SLOTS - gtsOffers().length); }
/** The picker greys committed copies out, but the picker is only the UI. One
   Pokemon cannot sit in two GTS slots, so the rule is checked again at save -
   an offer edited, or a stale sheet left open, must not be able to write a
   collision. Returns the clashing offer, or null.
   @param {{offeredId?: string | null}} d
   @param {string} [exceptId] */
function gtsClash(d, exceptId){
  if (!d.offeredId) return null;
  let hit = null;
  gtsOffers().forEach(function(o){
    if (o._id !== exceptId && o.offeredId === d.offeredId) hit = o;
  });
  return hit;
}
/* CAN THE GTS TAKE IT? "confirmed" (refused, seen in game - listed in
   data/meta/gts_blocked.json), "inferred" (a Mythical, which HOME's GTS
   probably refuses, judged from one confirmed case), or null.

   A confirmed block is dropped from suggestions: a recommendation you cannot
   act on is worse than none. An inferred one is ranked last and tagged
   instead, because one data point is not a rule and a wrong guess that hides
   a chip is worse than one that warns. When a second Mythical is refused in
   game, it moves into gts_blocked.json. */
/** @type {Set<string> | null} */
let MYTH_SET = null;
/** Can HOME's GTS hold this species? "confirmed" when it is known to refuse it,
   "inferred" for a Mythical (one refusal seen, so the rest are only
   suspected), null otherwise.
   @param {string} name */
function gtsBlocked(name){
  if (C.GTSBLOCK?.[name]) return "confirmed";
  MYTH_SET ||= new Set(C.MYTHICAL || []);
  return MYTH_SET.has(name) ? "inferred" : null;
}
/** How long a closed trade took, deposit to close, in ms (null if unknown).
   His own trades are the only MEASURED evidence on the GTS screen: a chip
   that sat for three days was priced wrong however good the arithmetic
   looked.
   @param {Trade} o */
function closeMs(o){
  const start = offerStart(o);
  if (start == null) return null;
  let end = Number.NaN;
  if (o.closedAt) end = Date.parse(o.closedAt);
  else if (o.closed && o.closed !== true) end = Date.parse(o.closed + "T00:00:00");
  if (Number.isNaN(end)) return null;
  const ms = end - start;
  return ms >= 0 ? ms : null;
}
/** The summary of his closed trades: how many, the median time to close
   (overall and for `name`), and the median and largest BST gap between what
   was given and what came back.
   @param {string | null} name */
function gtsRecord(name){
  /** @type {number[]} */
  const all = [];
  /** @type {number[]} */
  const mine = [];
  /** @type {number[]} */
  const gaps = [];
  gtsHistory().forEach(function(o){
    const ms = closeMs(o);
    if (ms == null) return;
    all.push(ms);
    if (name && o.offered === name) mine.push(ms);
    const a = anyRow(o.offered), b = anyRow(o.requested);
    if (a && b) gaps.push(bst(b) - bst(a));
  });
  /** The median, or null for an empty list.
     @param {number[]} xs */
  function mid(xs){
    if (!xs.length) return null;
    const v = xs.slice().sort(function(x, y){ return x - y; });
    return v[Math.floor(v.length / 2)];
  }
  return {n:all.length, median:mid(all), mine:mine.length, myMedian:mid(mine),
          gap:mid(gaps), gapMax:gaps.length ? Math.max.apply(null, gaps) : null};
}

export {
  chipValue, chipValueOf, deadStones, demandFit, DIFF_LABEL, elapsedText,
  GTS_SLOTS, gtsBlocked, gtsClash, gtsDiff, gtsFree, gtsHistory, gtsOffers,
  gtsRecord, gtsSelfServe, gtsSuggest, keepableCopies, ladderText, lastCopyOf,
  offerAge, offerStart, otherFormsOf, signed,
};
