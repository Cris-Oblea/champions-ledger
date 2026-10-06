/* The GTS pane's "Worth trading": what each Pokemon you could let go is
   worth as a chip, and what it can realistically fetch. */
import { anyRow, byName } from "../core/data.js";
import { $, el, fbtn, field, setPressed } from "../core/dom.js";
import { boxRows, originOf } from "../core/state.js";
import {
  elapsedText, gtsBlocked, gtsOffers, gtsRecord, gtsSuggest, keepableCopies,
} from "../core/trade.js";
import { pokeCard } from "../ui/card.js";
import { findDetail } from "../ui/pokemon.js";

/* The closed-trade record behind the suggestions, as one sentence. */
function ownRecord(rec){
  if (!rec.n) return "";
  let gap = "";
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
   THIS READS THE HOME BOX: it starts from the CHIPS, not from what he wants.
   Every Pokemon his own rule allows him to put up - a duplicate past the
   first copy, or a species Champions cannot use - is asked the question the
   deposit screen asks one at a time: what could this fetch? gtsSuggest
   (core/trade.js) answers: the two price bands, nothing people are actually
   running, and a species whose Mega Stone sits dead in the bag ranked up.

   The best asks FREE A SLOT: a species he holds only in the Champions box is
   welded there (an Encounter Pokemon can never leave), so a HOME copy of it
   is worth a whole slot - more than a dead stone, and the only thing here
   that cannot be bought.

   NOTHING HERE SAYS "EASY IN GO": the `supply` estimate is mostly its
   default value, too weak to recommend on. His own closed trades, which are
   measured, are what this screen quotes instead. */
function gtsChips(){
  const taken = {};
  gtsOffers().forEach(function(o){ if (o.offeredId) taken[o.offeredId] = 1; });
  /* what can LEAVE: HOME, plus anything in the Champions box that came from
     HOME and can go back. A rental or an Encounter buy can never reach a GTS
     box at all. */
  const all = boxRows("home").concat(boxRows("champions").filter(function(r){
    return originOf(r) === "home";
  }));
  const copies = keepableCopies();
  /* HIS RULE, NOT OURS: only a duplicate past the first copy, or a species
     Champions cannot use. Offering a singleton of a legal species loses it -
     and a rental of that species in the Champions box does not make it a
     duplicate, because a rental can never come back out.

     AND NOT WHAT HOME'S GTS REFUSES TO HOLD (seen in game, e.g. Melmetal):
     a recommendation you cannot act on is worse than none.
     data/meta/gts_blocked.json is the list and says who confirmed each. */
  return all.filter(function(r){
    if (taken[r._id]) return false;              /* already in a GTS slot */
    if (gtsBlocked(r.name) === "confirmed") return false;
    return (copies[r.name] || 0) > 1 || !byName[r.name];
  });
}
/* six cards until he asks for the rest; the segment's current choice */
const TRADE_CAP = 6;
let tradeAll = false, WANT_FILTER = "all";
/* Switch the All / Not in Champions / Duplicates segment and redraw. */
function setWantFilter(v){
  WANT_FILTER = v;
  tradeAll = false;
  const seg = $("gtsWantFilter");
  if (seg) Array.prototype.forEach.call(seg.children, function(b){
    setPressed(b, b.dataset.want === v);
  });
  drawGtsWanted();
}
/* THE "WORTH TRADING" LIST: one card per spare species, each with what it
   could ask for, the cheapest currency first. Six to start with, the rest one
   tap away. */
function drawGtsWanted(){
  const host = $("listGtsWant"), more = $("gtsWantMore");
  if (!host) return;
  wireWantFilter($("gtsWantFilter"));
  /* The segment answers "which KIND of chip"; the search box answers "that
     one". */
  const wq = (field("gtsWantSearch")?.value || "")
    .trim().toLowerCase();
  const ideas = tradeIdeas(filteredChips(wq));
  $("nGtsWant").textContent = String(ideas.length);
  $("gtsWantSub").innerHTML = wantSubtitle(ideas.length, gtsRecord(null));
  host.innerHTML = "";
  if (!ideas.length) {
    host.appendChild(el("div", "empty",
      wq ? "Nothing in HOME matches that" : EMPTY_WANT[WANT_FILTER] || "Nothing to offer"));
  }
  const cap = tradeAll ? ideas.length : TRADE_CAP;
  ideas.slice(0, cap).forEach(function(i){ host.appendChild(ideaCard(i)); });
  more.innerHTML = "";
  if (ideas.length > cap) {
    more.appendChild(fbtn("Show the other " + (ideas.length - cap), "sm",
      function(){ tradeAll = true; drawGtsWanted(); }));
  } else if (tradeAll && ideas.length > TRADE_CAP) {
    more.appendChild(fbtn("Show fewer", "sm",
      function(){ tradeAll = false; drawGtsWanted(); }));
  }
}

/* The All / Not in Champions / Duplicates segment, wired once. */
function wireWantFilter(seg){
  if (!seg || seg._wired) return;
  seg._wired = 1;
  Array.prototype.forEach.call(seg.children, function(b){
    b.onclick = function(){ setWantFilter(b.dataset.want); };
  });
}

/* The chips, narrowed by the search box (name or type) and the segment. */
function filteredChips(wq){
  let chips = gtsChips();
  if (wq) {
    chips = chips.filter(function(c){
      const p = byName[c.name];
      return c.name.toLowerCase().includes(wq) ||
             (p?.types.join(" ").toLowerCase().includes(wq));
    });
  }
  if (WANT_FILTER === "outside") {
    chips = chips.filter(function(c){ return !byName[c.name]; });
  } else if (WANT_FILTER === "dupes") {
    chips = chips.filter(function(c){ return !!byName[c.name]; });
  }
  return chips;
}

/* ONE CARD PER SPECIES, COUNTED. Three spare Garchomp are three chips and one
   recommendation - they price and fetch identically. Which COPY goes up is
   the deposit screen's decision; a shiny prices differently, so it keeps a
   card of its own. THE ASKS ARE PLAYABLE ONLY (gtsSuggest walks the
   Champions dex): a trade that brings back something Champions cannot play
   has bought a HOME row and nothing else. */
function tradeIdeas(chips){
  const group = {}, ideas = [];
  chips.forEach(function(c){
    const k = c.name + (c.shiny ? "|shiny" : "");
    if (group[k]) { group[k].n++; return; }
    const asks = gtsSuggest(c.name, 24, !!c.shiny);
    if (!asks.length) return;
    group[k] = {rec:c, n:1, asks:asks,
                frees:asks.filter(function(a){ return a.frees; }),
                stones:asks.filter(function(a){ return a.stone; })};
    ideas.push(group[k]);
  });
  ideas.sort(ideaOrder);
  return ideas;
}

/* THE CHEAPEST CURRENCY FIRST: a species Champions cannot use costs him
   nothing to give away, so it is spent before a duplicate of a playable one.
   Then the best outcome - a chip that can buy back a welded
   slot, then one that turns on a dead stone - then whatever reaches
   furthest. What the GTS may refuse goes last. */
function ideaOrder(a, b){
  return (gtsBlocked(a.rec.name) ? 1 : 0) - (gtsBlocked(b.rec.name) ? 1 : 0) ||
         (byName[a.rec.name] ? 1 : 0) - (byName[b.rec.name] ? 1 : 0) ||
         (b.frees.length ? 1 : 0) - (a.frees.length ? 1 : 0) ||
         (b.stones.length ? 1 : 0) - (a.stones.length ? 1 : 0) ||
         (b.asks[0] ? b.asks[0].bst : 0) - (a.asks[0] ? a.asks[0].bst : 0);
}

/* What the list is read off and why, with his own closed-trade record - and
   NOTHING HIDDEN SILENTLY: a name dropped for being impossible is named. */
function wantSubtitle(n, rec){
  let sub = n
    ? "Read off your <strong>HOME box</strong>: everything your own rule lets "
      + "you put up — a duplicate past the first copy, or a species "
      + "Champions cannot use — with what it could realistically fetch. "
      + "An ask marked <em>frees a slot</em> is a species you hold only in the "
      + "Champions box, where it is welded: a HOME copy is worth the whole slot."
      + ownRecord(rec)
    : "Nothing in HOME can go up right now. Your rule allows a duplicate past "
      + "the first copy, or a species Champions cannot use — a singleton "
      + "of a legal species would be lost for good.";
  const dropped = boxRows("home").filter(function(r){
    return gtsBlocked(r.name) === "confirmed";
  }).map(function(r){ return r.name; });
  if (dropped.length) {
    sub += " Not shown: <strong>"
      + dropped.join(", ") + "</strong> — HOME’s GTS will not hold "
      + (dropped.length === 1 ? "it" : "them") + " at all.";
  }
  return sub;
}

/* One spare species, as its card, with what it could ask for underneath. */
function ideaCard(i){
  const p = anyRow(i.rec.name);
  const mine = gtsRecord(i.rec.name);
  return pokeCard(p, {
    name: i.rec.name,
    shiny: !!i.rec.shiny,
    badges: function(nm){ ideaBadges(nm, i, mine); },
    notes: function(m){ m.appendChild(askLine(i)); },
    onclick: function(){ findDetail(p); }
  });
}

/* Whether the GTS may refuse it, whether Champions can use it, shiny (a shiny
   is its own card and has to say so - at card size the sprite alone is not a
   difference you can rely on), how many spare, whether an ask frees a slot,
   and his own record trading this species. */
function ideaBadges(nm, i, mine){
  if (gtsBlocked(i.rec.name) === "inferred") {
    const mb = el("span", "tag bad", "GTS may refuse it");
    mb.title = "It is a Mythical, and the one Mythical you have tried - "
      + "Melmetal - the GTS would not hold. That is one data point, not "
      + "a rule, so it is still listed. If this one is refused too, say "
      + "so and it stops being a guess.";
    nm.appendChild(mb);
  }
  if (!byName[i.rec.name]) {
    const ox = el("span", "tag", "not in Champions");
    ox.title = "It can live in HOME for ever and can never enter a "
      + "game, so giving it away costs you nothing playable. This is "
      + "the currency to spend first.";
    nm.appendChild(ox);
  }
  if (i.rec.shiny) nm.appendChild(el("span", "tag warn", "shiny"));
  if (i.n > 1) {
    const c = el("span", "tag", i.n + " spare");
    c.title = "You hold " + i.n + " of these that your rule lets you "
      + "trade. They price the same, so this is one recommendation.";
    nm.appendChild(c);
  }
  if (i.frees.length) nm.appendChild(el("span", "tag ok", "frees a slot"));
  if (mine.mine) {
    const t = el("span", "tag", mine.mine + " traded · "
      + (elapsedText(mine.myMedian) || "?"));
    t.title = "You have closed " + mine.mine + " trade"
      + (mine.mine === 1 ? "" : "s") + " offering this species. Half of "
      + "them cleared inside "
      + (elapsedText(mine.myMedian) || "an unknown time") + ".";
    nm.appendChild(t);
  }
}

/* "Ask for: ..." - six to start, because a card is read at a glance and 24
   tags is not a glance, and the whole list one tap away. */
function askLine(i){
  const line = el("div", "st");
  /* The first n asks as tags, and a button that shows the rest in place. */
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
  return line;
}

/* One ask, coloured by what it buys: a freed slot, a stone turned on, or
   simply a price - with the reason on hover. */
function askTag(a){
  let tone = "";
  if (a.frees) tone = " ok";
  else if (a.stone) tone = " warn";
  const tag = el("span", "tag" + tone, a.name);
  tag.title = a.bst + " BST"
    + (a.frees ? " — you hold it only in the Champions box, so a "
        + "HOME copy frees that slot" : "")
    + (a.stone ? " — turns on " + a.stone + ", already bought" : "")
    + (a.band === "base" ? " — under what this chip is worth, "
        + "which is the ask that clears fastest"
      : " — at or above what this chip is worth");
  return tag;
}

export { drawGtsWanted };
