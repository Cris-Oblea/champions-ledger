/* The GTS rules, with no screen in them: which copy may leave (keep one per
   form), what a Pokemon is worth as a chip, how hard a species is to get, and
   the three offer slots. Everything that decides what a chip is WORTH is
   argued in this file, and only here. */
import {
  anyRow, bst, byName, C, FORMS, MEGAS_OF, megasFor, STONE_OF,
} from "./data.js";
import { boxRows, hasStone, originOf, S } from "./state.js";

/* ======================================================================= gts */
/* +12, -3, 0 */
function signed(n){ return (n > 0 ? "+" : "") + n; }
/* How far apart the two sides of a trade are on ladder demand, as
   [tag tone, sentence]. gap > 0 means asking for the more wanted one. */
function demandFit(gap){
  if (gap >= 120)
    return ["bad", "a long way up — the other side wants theirs far more than yours"];
  if (gap >= 60) return ["warn", "asking up; it can still land, but slowly"];
  if (gap <= -40) return ["", "you are giving up the more wanted one"];
  return ["ok", "well matched on demand"];
}

/* ------------------------------------------------- GTS difficulty ----
   Why an offer sits unclaimed is TWO questions, and BST answers neither
   (player, 2026-09-11): "tal vez gholdengo sea dificil de obtenerlo por gts
   no por su bst sino porque es escaso".

     DEMAND - measured, from pokebase ladder usage. Sneasler is 23.1% of the
              ladder, rank 9: the other side is running it, not trading it.
     SUPPLY - how hard it is to obtain in Pokemon GO, which is this player's
              only route in. NOT measurable from any Champions source, so it
              is declared in data/meta/go_sourcing.json and always shown as an
              estimate.

   The harder half decides the score, because either one alone is enough to
   kill a trade; when both are hard it goes to 5. */
const DIFF_LABEL = ["", "easy", "doable", "hard", "very hard", "near impossible"];
function gtsDiff(name){
  const d = C.GTSDIFF?.[name];
  if (!d) return null;
  return {score:d[0], demand:d[1], supply:d[2], rank:d[3], how:d[4] || "",
          usage:d[5], size:d[6] || 0};
}
/* A rank with no denominator is half a fact - #224 means nothing until you
   know the ladder is 324 long. And an ABSENT row is not rank 324: a species
   a new regulation just added has no row at all. */
function ladderText(d){
  if (!d) return "";
  /* Do NOT name the regulation here. This string said "M-B" and the ladder
     refreshed to M-C underneath it on 2026-09-11, so the page was confidently
     citing the wrong format. The honest statement is the one the data
     supports: the ladder ranks N species and this is not among them. */
  if (d.rank == null) return "unranked" + (d.size ? " (ladder lists " + d.size + ")" : "");
  return "#" + d.rank + (d.size ? " of " + d.size : "") +
         (d.usage != null ? " · " + d.usage.toFixed(2) + "%" : "");
}
/* The question that outranks the trade: if he can just evolve it in GO, a
   chip spent here is a chip wasted. */
function gtsSelfServe(d){ return d && d.supply <= 2 && d.demand >= 3; }

/* The GTS holds THREE slots (player, 2026-09-11). Not three free ones - an
   open offer occupies one until it is taken or withdrawn, so the fourth
   deposit is not a thing the game will accept. A fixed rule, unlike the box
   capacity, which grows and therefore lives in meta.trainer. */
const CEILING = 60;
const GTS_SLOTS = 3;
/* ==================================================== GTS intelligence ====
   Five things the app knew half of and never joined up. All of it is derived
   at read time from the blob plus the ledger - no new stored data except the
   trade history, which is a record of things that actually happened. */

/* What a chip is WORTH. The player measured this himself and it is not the
   base row: Beedrill 395 fetched Toxapex 495 and Slowbro 490, Mawile 380
   fetched Glalie 480 - each one exactly its Mega's BST. So the base number is
   a floor and the Mega line is the price. */
/* A shiny is rarer than its own species and trades above it (player,
   2026-09-11). Unlike the Mega rule, this one is NOT measured yet - his
   closed trades price Beedrill at exactly Mega Beedrill's 495, but no shiny
   trade has gone through to price the premium. So it is deliberately NOT
   folded into `value`, which stays the measured number. It widens `reach`
   instead - how far up the chip may aim - and every surface says the premium
   is an estimate. The trade history records shininess, so the moment a shiny
   changes hands the real figure can replace this one, exactly the way the
   Mega rule was arrived at. */
const SHINY_REACH = 60;    // ESTIMATE: about one BST tier. Not measured.

/* A WANTED CHIP REACHES HIGHER, and the ladder is where "wanted" is measured
   (player, 2026-09-12): "indeedee voló, no duró nada en gts, y con los
   shinies también pasa lo mismo". Indeedee is BST 475 with no Mega - by the
   stat table alone it is an unremarkable chip - but it sits at ladder #28 and
   cleared the same day, twice.

   So demand belongs in the price, not just in what you ask for. The other
   side takes a trade because they want the thing you are offering, and BST
   does not know that: Squawkabilly is 417 and unranked, Indeedee is 475 and
   top-30, and those are not 58 points apart in practice.

   Estimated, like the shiny premium, and for the same reason - his closed
   trades price the Mega rule exactly but nothing has yet measured this. The
   history records both, so it becomes measurable. */
function demandReach(name){
  const d = gtsDiff(name);
  if (d?.rank == null) return 0;
  if (d.demand >= 5) return 90;      // top of the ladder: people come to you
  if (d.demand >= 4) return 60;
  if (d.demand >= 3) return 35;
  if (d.demand >= 2) return 15;
  return 0;
}
function chipValue(name, shiny){
  /* anyRow, NOT byName. A species Champions has never heard of has no row in
     its dex, so this returned null for every one of them - and with no price
     there was no band to search in, so putting one in a GTS box produced no
     recommendation at all (player, 2026-09-18: "faltan las recomendaciones de
     los pokemones que tienen tag not in champions"). Those are exactly the
     Pokemon a GTS chip is MADE of: by his own rule only duplicates and
     species Champions cannot use may be offered.

     A BST is a BST. HOME_DEX has the real one, there is no Mega line to reach
     for and no ladder row to want it, so the price comes out as the base row
     and says so rather than being absent. */
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
/* the shiny flag lives on the box row, not on the species */
function chipValueOf(rec){
  if (!rec) return null;
  return chipValue(rec.name, !!rec.shiny);
}

/* Stones bought for a Pokemon that is nowhere in the ledger - 2000 VP each,
   sitting dead. The app knew both halves and never crossed them. */
function deadStones(){
  const have = {};
  boxRows("home").concat(boxRows("champions")).forEach(function(r){
    have[r.name] = 1;
    const p = byName[r.name];
    if (p?.species) have[p.species] = 1;
  });
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

/* Candidates this chip could realistically fetch. The reasoning that produced
   Abomasnow and Steelix on 2026-09-11, made repeatable:
     - in the Champions dex, and not already in the ledger
     - BST at or under the chip's value (a small stretch up is allowed, since
       Beedrill 495 -> Steelix 510 is the kind of deal that does land)
     - low demand, because a top-of-ladder Pokemon is being played, not traded
     - and a stone you already own with nothing to put it on wins outright */
/* IS THIS ASK IN RANGE FOR THAT CHIP? The two bands, written once.

   It was inline in gtsSuggest, which asks "what could this chip fetch" and
   walks the dex. Anything asking the mirror question needs the same
   arithmetic, and a second copy of it is how two answers about one trade
   start disagreeing.

   `reach` is at or above what the chip is worth, up to its full price plus a
   little; `base` is under it, down to 70 below the base row. Asking for less
   than you could is how an offer clears the same day. */
function chipBand(v, b){
  if (!v) return null;
  if (b > v.reach + CEILING || b < Math.min(v.base, v.value) - 70) return null;
  return b >= v.value - 25 ? "reach" : "base";
}
/* THE CEILING IS MEASURED NOW, not guessed. It was reach + 20, and his own
   61 closed trades say that is a little tight: 5 of the 51 priced on both
   sides landed ABOVE it, the furthest being Indeedee 475 -> Rillaboom 530,
   and every one of the five closed - three of them inside six hours. 60
   covers all five with nothing to spare. The floor stays at 70 under,
   because in 51 trades NOTHING landed below it: asking for less than you
   could is safe, and a generous floor costs nothing.
   Full write-up in analysis/gts_pricing.md. */
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
  const out = [];
  while (out.length < want && (bands.reach.length || bands.base.length)) {
    if (bands.reach.length) out.push(bands.reach.shift());
    if (out.length < want && bands.base.length) out.push(bands.base.shift());
  }
  return out;
}

/* OWNED IN HOME IS DONE; OWNED ONLY IN CHAMPIONS IS STILL A TARGET. Both used
   to count as owned, which quietly removed the best asks on the board: an
   Encounter Pokemon can never leave the box, so a second copy arriving through
   HOME is worth a whole slot. `owned` is what he has for keeps (HOME, or
   HOME-origin in the box); `frees` is what a HOME copy would free a slot for.
   Both are keyed by form and by species. */
function ownership(){
  const owned = {}, frees = {};
  boxRows("home").forEach(function(r){ markOwned(owned, r); });
  boxRows("champions").forEach(function(r){
    markOwned(originOf(r) === "home" ? owned : frees, r);
  });
  return {owned: owned, frees: frees};
}

function markOwned(into, r){
  into[r.name] = 1;
  const p = byName[r.name];
  if (p?.species) into[p.species] = 1;
}

/* Species with a Mega Stone already bought and nothing to hold it: trading
   for one turns 2000 VP back on. */
function deadStonesBySpecies(own){
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

/* TWO BANDS, NOT ONE WINDOW (player, 2026-09-13): the Mega reach kept AND
   asks around the base row. One window was the bug: a Mega-capable chip
   prices at its Mega, so the window moved up bodily and cut the base
   neighbourhood out - Beedrill's base is 395 and its window started at 425,
   so the asks most likely to be TAKEN could never be suggested.

     reach - at or above the chip's full price (the Mega's BST plus the
             estimated premiums): what it can aim at.
     base  - under it, down to 70 below the base row: asking for less than
             you could is how an offer clears the same day.

   Anything people are running (ladder demand 4+) will not be handed over and
   is left out; an UNKNOWN demand is not a low one, so it stays in but is
   never ranked as if it were cheap. Each band is scored against its OWN
   anchor, and A SLOT IS WORTH MORE THAN A STONE: a dead stone is 2000 VP
   already spent, a welded slot cannot be bought back at all. */
function askBands(v, own, dead){
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

function bySuggestScore(a, b){ return b.score - a.score || b.bst - a.bst; }

/* How long an offer has been sitting. `deposited` was stored and never read;
   an offer nobody has taken in nine days is telling you the price is wrong. */
function offerAge(o){
  const t = offerStart(o);
  if (t == null) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}
function offerStart(o){
  if (o.depositedAt) {
    const p = Date.parse(o.depositedAt);
    if (!Number.isNaN(p)) return p;
  }
  if (!o.deposited) return null;
  const t = Date.parse(o.deposited + "T00:00:00");
  return Number.isNaN(t) ? null : t;
}
/* Hours matter here in a way they do not elsewhere. Indeedee is BST 475 and
   cleared in hours; Beedrill is worth 495 by the Mega rule and sat for days.
   Time-to-close measures what the other side WANTS, which is the axis BST
   cannot see - so it is reported at whatever resolution it actually has. */
function elapsedText(ms){
  if (ms == null || ms < 0) return null;
  const h = ms / 3600000;
  if (h < 1) return Math.max(1, Math.round(ms / 60000)) + " min";
  if (h < 36) return (h < 10 ? h.toFixed(1) : Math.round(h)) + "h";
  return Math.round(h / 24) + " days";
}

/* One table, and `closed` is what sorts a trade into one list or the other
   (migration 7). They used to be two arrays in one document, which is why
   every write had to carry both - the "Withdrew it" button still carried a
   comment warning that a put() omitting history would erase every closed
   trade on record. It cannot now: closing a trade is an update of the row
   that was already there.

   The history was also truncated to 60 by one call site, with 34 in it. A
   closed trade is the only hard evidence of what the market pays, and the
   pricing rule rests on them, so the cap is gone with the array. */
function gtsRows(){
  return Object.keys(S.gts).map(function(id){
    const r = S.gts[id]; r._id = id; return r;
  });
}
function gtsHistory(){
  return gtsRows().filter(function(r){ return r.closed; })
    .sort(function(a, b){
      return String(b.closedAt || b.closed || "")
        .localeCompare(String(a.closedAt || a.closed || ""));
    });
}

/* WHAT COUNTS AS A DUPLICATE, and a welded copy does not.

   It was "how many rows of this species exist in either box", which is a
   different question and a dangerous one to confuse with this one. He has a
   Metagross in HOME and a Metagross RENTAL in the Champions box, and the
   filter called that a duplicate and offered the HOME one as trade material
   (player, 2026-09-21: "ESO NO ES DUPLICADO!, duplicado seria tener dos
   pokemones iguales del mismo origen, aqui tengo un metagross real y un
   metagross rental que nunca se podra mover!, por lo que metagross no es
   duplicado en home"). Trading it away would have lost the species from HOME
   for good, which is exactly what the keep-one rule exists to prevent.

   A rental and an Encounter buy are Champions origin: they can never leave
   the game, so they can never be the copy he keeps. Only a row that can BE in
   HOME counts - one already there, or one in the Champions box that came from
   HOME and can be parked back. */
function keepableCopies(){
  const n = {};
  boxRows("home").forEach(function(r){ n[r.name] = (n[r.name] || 0) + 1; });
  boxRows("champions").forEach(function(r){
    if (originOf(r) === "home") n[r.name] = (n[r.name] || 0) + 1;
  });
  return n;
}
/* THE KEEP-ONE RULE (player, 2026-09-10): "yo siempre quiero quedarme con 1
   especie en home para siempre". Only two things may be offered - a duplicate
   past the first copy, or a species Champions does not allow at all. Offering
   a singleton of a legal species loses it for good.

   This exists because the app let it happen: Indeedee went out on 2026-09-12
   as the last copy of a species sitting at ladder #28, and nothing said a
   word. The trade turned out well - Rillaboom, #2 - but that was the draw,
   not the ledger doing its job.

   Counts the BOX, not the offers: depositing does not remove the Pokemon, so
   the copy is still there until the trade actually closes.

   AND IT COUNTS KEEPABLE COPIES ONLY, which is the same correction the
   duplicate filter needed and for the same reason: a rental or an Encounter
   buy of the species is welded into the Champions box and can never be the
   copy he keeps, so it must not make the one in HOME look expendable. This
   is the warning that catches the mistake the filter would have let through,
   and it was reading the same wrong number. */
function lastCopyOf(rec){
  if (!rec) return false;
  if (!byName[rec.name]) return false;          // not in the dex: free to trade
  return (keepableCopies()[rec.name] || 0) <= 1;
}
/* THE RULE IS PER FORM, NOT PER SPECIES, AND HE PICKS WHICH FORM (player,
   2026-09-12): "tenía indeedee macho y uno hembra, me quedo con la hembra me
   sirve más". So the last Indeedee going out was NOT the mistake it looked
   like - the Female was the keeper and the Male was spare by his own reading.

   That means the warning must not be a flat "this is your last one". It has
   to say what else of the same species is still in the box and let him judge,
   because only he knows which form he wants to keep. Returns the sibling
   forms, so the message can name them. */
function otherFormsOf(rec){
  const p = byName[rec.name];
  if (!p?.species) return [];
  const out = {};
  boxRows("home").concat(boxRows("champions")).forEach(function(r){
    if (r.name === rec.name) return;
    const q = byName[r.name];
    if (q && q.species === p.species) out[r.name] = 1;
  });
  return Object.keys(out);
}

function gtsOffers(){
  return gtsRows().filter(function(r){ return !r.closed; })
    .sort(function(a, b){
      return String(a.depositedAt || a.deposited || "")
        .localeCompare(String(b.depositedAt || b.deposited || ""));
    });
}
function gtsFree(){ return Math.max(0, GTS_SLOTS - gtsOffers().length); }
/* The picker greys committed copies out, but the picker is only the UI. One
   Pokemon cannot sit in two GTS slots, so the rule is checked again at save -
   an offer edited, or a stale sheet left open, must not be able to write a
   collision. Returns the clashing offer, or null. */
function gtsClash(d, exceptId){
  if (!d.offeredId) return null;
  let hit = null;
  gtsOffers().forEach(function(o){
    if (o._id !== exceptId && o.offeredId === d.offeredId) hit = o;
  });
  return hit;
}
/* CONFIRMED, INFERRED, OR FINE - and the difference decides what the list
   does about it.

   CONFIRMED is one name: Melmetal, which he tried. It is dropped, because a
   recommendation you cannot act on is worse than none.

   INFERRED is the other Mythicals. He confirmed Melmetal is one, which makes
   "HOME's GTS refuses Mythicals" the obvious reading of a single data point -
   and a single data point is not a rule. They are ranked LAST and tagged
   instead of dropped, because a wrong guess that hides a chip is worse than
   one that warns about it. When a second is refused the rule earns its place
   and the name moves into data/meta/gts_blocked.json.

   It matters more than one Pokemon: Champions has ZERO Mythicals, so every
   one that ever arrives is a species Champions cannot use - which is exactly
   the pile this list puts first - and thirteen of the twenty-three can be
   caught in GO. */
let MYTH_SET = null;
function gtsBlocked(name){
  if (C.GTSBLOCK?.[name]) return "confirmed";
  if (!MYTH_SET) {
    MYTH_SET = {};
    (C.MYTHICAL || []).forEach(function(n){ MYTH_SET[n] = 1; });
  }
  return MYTH_SET[name] ? "inferred" : null;
}
/* WHAT HIS OWN TRADES SAY, which is the only evidence on this screen that was
   measured rather than estimated. Time to close is the axis BST cannot see:
   it is what the other side WANTED, and a chip that sat for three days was
   priced wrong however good the arithmetic looked. */
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
function gtsRecord(name){
  const all = [], mine = [], gaps = [];
  gtsHistory().forEach(function(o){
    const ms = closeMs(o);
    if (ms == null) return;
    all.push(ms);
    if (name && o.offered === name) mine.push(ms);
    const a = anyRow(o.offered), b = anyRow(o.requested);
    if (a && b) gaps.push(bst(b) - bst(a));
  });
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
