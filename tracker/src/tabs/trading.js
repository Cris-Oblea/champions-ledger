/* The GTS pane's "Worth trading": what each Pokemon you could let go is
   worth as a chip, and what it can realistically fetch. */
import { anyRow, byName } from "../core/data.js";
import { $, el, fbtn } from "../core/dom.js";
import { boxRows, originOf } from "../core/state.js";
import {
  elapsedText, gtsBlocked, gtsOffers, gtsRecord, gtsSuggest, keepableCopies,
} from "../core/trade.js";
import { pokeCard } from "../ui/card.js";
import { findDetail } from "../ui/pokemon.js";

/* The closed-trade record behind the suggestions, as one sentence. */
function ownRecord(rec){
  if (!rec.n) return "";
  var gap = "";
  if (rec.gap != null) {
    gap = ", and what came back ran " + (rec.gap >= 0 ? "+" : "") + rec.gap +
      " BST on the median";
    if (rec.gapMax != null) gap += " and +" + rec.gapMax + " at best";
  }
  return " Your own record: <strong>" + rec.n + "</strong> closed trades, " +
    "half of them inside " + (elapsedText(rec.median) || "an unknown time") +
    gap + ".";
}
/* The trade suggestions' empty state, by the filter that emptied them. */
const EMPTY_WANT = {
  outside: "Nothing in HOME that Champions cannot use can go up right now",
  dupes: "No duplicates to spare",
};

/* ============================================ trades worth making, from HOME

   THIS READS THE HOME BOX, not the Champions one. The first version listed
   the species welded into Champions and called them targets, which is a list
   of Pokemon he already owns printed under a new heading - and the Champions
   Box tab is that screen (player, 2026-09-21: "el listado de los pokemones
   que tengo en champions es un poco tonto... si lo puedo ver desde champions
   box"). The second half of what he said is the design: "seria bueno que el
   gts recomendara hacer intercambios leyendo los pokemones que estan en mi
   home, y que no solo sea una copia de la lista de la caja de champions".

   So it starts from the CHIPS. Every Pokemon in HOME that his own rule allows
   him to put up - a duplicate past the first copy, or a species Champions
   cannot use - is asked the question the deposit screen asks one at a time:
   what could this fetch? The answer is gtsSuggest, which already knows the
   two price bands, drops what people are actually running, and prefers a
   species whose Mega Stone is sitting dead in the bag.

   What was ADDED to it is the slot: a species owned only in the Champions box
   used to count as owned and was filtered out, which removed the best asks on
   the board. An Encounter Pokemon can never leave, so a HOME copy of one is
   worth a whole slot - more than a dead stone, and the only thing here that
   cannot be bought back.

   AND NOTHING SAYS "EASY IN GO" ANY MORE. It did, off a declared `supply`
   score, and he cut it: "es dificil que pongas que algunos son faciles en go,
   porque sigue siendo dificil obtener algunos. para determinar que es facil
   en go es mejor hacer un estudio". He is right - 260 of the 264 sit at
   supply 2 because 2 is the default, so the claim was mostly a guess wearing
   a number. What replaced it is his own closed trades, which are measured. */
function gtsChips(){
  var taken = {};
  gtsOffers().forEach(function(o){ if (o.offeredId) taken[o.offeredId] = 1; });
  /* what can LEAVE: HOME, plus anything in the Champions box that came from
     HOME and can go back. A rental or an Encounter buy can never reach a GTS
     box at all. */
  var all = boxRows("home").concat(boxRows("champions").filter(function(r){
    return originOf(r) === "home";
  }));
  var copies = keepableCopies();
  /* HIS RULE, NOT OURS: only a duplicate past the first copy, or a species
     Champions cannot use. Offering a singleton of a legal species loses it -
     and a rental of that species in the Champions box does not make it a
     duplicate, because a rental can never come back out.

     AND WHAT HOME'S GTS WILL NOT TAKE AT ALL. Melmetal is in his box, is a
     species Champions cannot use, and was being recommended as a chip - and
     the GTS refuses to hold it (player, 2026-09-21: "melmetal esta bloqueado
     del gts"). A recommendation you cannot act on is worse than none.
     data/meta/gts_blocked.json is the list and says who confirmed each. */
  return all.filter(function(r){
    if (taken[r._id]) return false;              /* already in a GTS slot */
    if (gtsBlocked(r.name) === "confirmed") return false;
    return (copies[r.name] || 0) > 1 || !byName[r.name];
  });
}
var TRADE_CAP = 6, tradeAll = false, WANT_FILTER = "all";
function setWantFilter(v){
  WANT_FILTER = v;
  tradeAll = false;
  var seg = $("gtsWantFilter");
  if (seg) Array.prototype.forEach.call(seg.children, function(b){
    b.setAttribute("aria-pressed", b.dataset.want === v ? "true" : "false");
  });
  drawGtsWanted();
}
function drawGtsWanted(){
  var host = $("listGtsWant"), more = $("gtsWantMore");
  if (!host) return;
  var seg = $("gtsWantFilter");
  if (seg && !seg._wired) {
    seg._wired = 1;
    Array.prototype.forEach.call(seg.children, function(b){
      b.onclick = function(){ setWantFilter(b.dataset.want); };
    });
  }
  var chips = gtsChips(), rec = gtsRecord(null);
  /* The segment answers "which KIND of chip"; this answers "that one". With
     44 chips the two are different questions and the segment cannot do both. */
  var wq = ($("gtsWantSearch")?.value || "")
    .trim().toLowerCase();
  if (wq) {
    chips = chips.filter(function(c){
      var p = byName[c.name];
      return c.name.toLowerCase().includes(wq) ||
             (p?.types.join(" ").toLowerCase().includes(wq));
    });
  }
  if (WANT_FILTER === "outside") {
    chips = chips.filter(function(c){ return !byName[c.name]; });
  } else if (WANT_FILTER === "dupes") {
    chips = chips.filter(function(c){ return !!byName[c.name]; });
  }
  /* ONE CARD PER SPECIES, COUNTED. Three spare Garchomp are three chips and
     one recommendation - they price identically and fetch identically, so
     three identical cards is the top of the list saying one thing three
     times (seen live, 2026-09-21). Which COPY goes up is a decision for the
     deposit screen, which knows about shininess and training; a shiny prices
     differently, so it keeps a card of its own. */
  var group = {}, ideas = [];
  chips.forEach(function(c){
    var k = c.name + (c.shiny ? "|shiny" : "");
    if (group[k]) { group[k].n++; return; }
    /* THE ASKS ARE PLAYABLE ONLY, and that was never the thing to widen
       (player, 2026-09-21: "eso estaba bien, no quiero cambiar por pokemones
       que no pueda usar"). A trade that comes back with something Champions
       cannot play has bought a HOME row and nothing else. It is the CHIP
       side he meant - see the filter below. */
    var asks = gtsSuggest(c.name, 24, !!c.shiny);
    if (!asks.length) return;
    group[k] = {rec:c, n:1, asks:asks,
                frees:asks.filter(function(a){ return a.frees; }),
                stones:asks.filter(function(a){ return a.stone; })};
    ideas.push(group[k]);
  });
  /* THE CHEAPEST CURRENCY FIRST, which is his own reasoning: "de esos que no
     puedo usar cambiarlos por pokemones usables en champions". A duplicate of
     a playable species is still a Pokemon he could bring to a game; one
     Champions cannot use costs him nothing at all to give away, so it is what
     to spend before anything else. Then the best outcome - a chip that can
     buy back a welded slot, then one that turns on a dead stone - and then
     whatever reaches furthest. */
  ideas.sort(function(a, b){
    return (gtsBlocked(a.rec.name) ? 1 : 0) - (gtsBlocked(b.rec.name) ? 1 : 0) ||
           (byName[a.rec.name] ? 1 : 0) - (byName[b.rec.name] ? 1 : 0) ||
           (b.frees.length ? 1 : 0) - (a.frees.length ? 1 : 0) ||
           (b.stones.length ? 1 : 0) - (a.stones.length ? 1 : 0) ||
           (b.asks[0] ? b.asks[0].bst : 0) - (a.asks[0] ? a.asks[0].bst : 0);
  });
  $("nGtsWant").textContent = ideas.length;
  $("gtsWantSub").innerHTML = ideas.length
    ? "Read off your <strong>HOME box</strong>: everything your own rule lets "
      + "you put up — a duplicate past the first copy, or a species "
      + "Champions cannot use — with what it could realistically fetch. "
      + "An ask marked <em>frees a slot</em> is a species you hold only in the "
      + "Champions box, where it is welded: a HOME copy is worth the whole slot."
      + ownRecord(rec)
    : "Nothing in HOME can go up right now. Your rule allows a duplicate past "
      + "the first copy, or a species Champions cannot use — a singleton "
      + "of a legal species would be lost for good.";
  /* NOTHING IS HIDDEN SILENTLY. One name is dropped for being impossible, so
     the count says which and why rather than leaving a gap in a list. */
  var dropped = boxRows("home").filter(function(r){
    return gtsBlocked(r.name) === "confirmed";
  }).map(function(r){ return r.name; });
  if (dropped.length) {
    $("gtsWantSub").innerHTML += " Not shown: <strong>"
      + dropped.join(", ") + "</strong> — HOME’s GTS will not hold "
      + (dropped.length === 1 ? "it" : "them") + " at all.";
  }
  host.innerHTML = "";
  if (!ideas.length) {
    host.appendChild(el("div", "empty",
      wq ? "Nothing in HOME matches that" : EMPTY_WANT[WANT_FILTER] || "Nothing to offer"));
  }
  var cap = tradeAll ? ideas.length : TRADE_CAP;
  ideas.slice(0, cap).forEach(function(i){
    var p = anyRow(i.rec.name);
    var mine = gtsRecord(i.rec.name);
    host.appendChild(pokeCard(p, {
      name: i.rec.name,
      shiny: !!i.rec.shiny,
      badges: function(nm){
        /* A SHINY IS ITS OWN CARD AND HAS TO SAY SO. It prices differently -
           the shiny premium is part of what the chip is worth - so it does
           not group with the plain copies, and two Garchomp cards side by
           side with nothing to tell them apart read as a bug (seen live,
           2026-09-21). The sprite is the shiny one; at card size that is not
           a difference you can rely on. */
        if (gtsBlocked(i.rec.name) === "inferred") {
          var mb = el("span", "tag bad", "GTS may refuse it");
          mb.title = "It is a Mythical, and the one Mythical you have tried - "
            + "Melmetal - the GTS would not hold. That is one data point, not "
            + "a rule, so it is still listed. If this one is refused too, say "
            + "so and it stops being a guess.";
          nm.appendChild(mb);
        }
        if (!byName[i.rec.name]) {
          var ox = el("span", "tag", "not in Champions");
          ox.title = "It can live in HOME for ever and can never enter a "
            + "game, so giving it away costs you nothing playable. This is "
            + "the currency to spend first.";
          nm.appendChild(ox);
        }
        if (i.rec.shiny) nm.appendChild(el("span", "tag warn", "shiny"));
        if (i.n > 1) {
          var c = el("span", "tag", i.n + " spare");
          c.title = "You hold " + i.n + " of these that your rule lets you "
            + "trade. They price the same, so this is one recommendation.";
          nm.appendChild(c);
        }
        if (i.frees.length) nm.appendChild(el("span", "tag ok", "frees a slot"));
        if (mine.mine) {
          var t = el("span", "tag", mine.mine + " traded · "
            + (elapsedText(mine.myMedian) || "?"));
          t.title = "You have closed " + mine.mine + " trade"
            + (mine.mine === 1 ? "" : "s") + " offering this species. Half of "
            + "them cleared inside "
            + (elapsedText(mine.myMedian) || "an unknown time") + ".";
          nm.appendChild(t);
        }
      },
      notes: function(m){
        var line = el("div", "st");
        /* THE WHOLE LIST OPENS. It showed six and said "+16 more", which is
           the app knowing something and not saying it (player, 2026-09-21:
           "solo pones algunos pokemones, me gustaria tener una vision mas
           amplia"). Six is still what it opens with, because a card is read
           at a glance and 24 tags is not a glance - but the rest is one tap
           away and nothing is behind a scroll you cannot reach. */
        function askTag(a){
          var tone = "";
          if (a.frees) tone = " ok";
          else if (a.stone) tone = " warn";
          var tag = el("span", "tag" + tone, a.name);
          tag.title = a.bst + " BST"
            + (a.frees ? " — you hold it only in the Champions box, so a "
                + "HOME copy frees that slot" : "")
            + (a.stone ? " — turns on " + a.stone + ", already bought" : "")
            + (a.band === "base" ? " — under what this chip is worth, "
                + "which is the ask that clears fastest"
              : " — at or above what this chip is worth");
          return tag;
        }
        function paintAsks(n){
          line.innerHTML = "";
          line.appendChild(document.createTextNode("Ask for: "));
          i.asks.slice(0, n).forEach(function(a, k){
            if (k) line.appendChild(document.createTextNode(" "));
            line.appendChild(askTag(a));
          });
          if (i.asks.length > n) {
            line.appendChild(document.createTextNode(" "));
            line.appendChild(fbtn("+" + (i.asks.length - n) + " more", "sm quiet",
              function(ev){
                if (ev?.stopPropagation) ev.stopPropagation();
                paintAsks(i.asks.length);
              }));
          }
        }
        paintAsks(6);
        m.appendChild(line);
      },
      onclick: function(){ findDetail(p); }
    }));
  });
  more.innerHTML = "";
  if (ideas.length > cap) {
    more.appendChild(fbtn("Show the other " + (ideas.length - cap), "sm",
      function(){ tradeAll = true; drawGtsWanted(); }));
  } else if (tradeAll && ideas.length > TRADE_CAP) {
    more.appendChild(fbtn("Show fewer", "sm",
      function(){ tradeAll = false; drawGtsWanted(); }));
  }
}

export { drawGtsWanted };
