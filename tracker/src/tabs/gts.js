/* The GTS pane's offers: the three slots, their history, and the sheet that
   deposits or closes one - with the keep-one rule that decides what may leave. */
import {
  anyRow, bst, byName, C, dexLabel, dexNo, FORMS, freeSlug,
} from "../core/data.js";
import { $, capNote, el, fbtn, note, searchField, toast } from "../core/dom.js";
import { boxRows, originOf, S } from "../core/state.js";
import { drop, put, putNew } from "../core/store.js";
import {
  chipValue, chipValueOf, deadStones, demandFit, DIFF_LABEL, elapsedText,
  GTS_SLOTS, gtsClash, gtsDiff, gtsFree, gtsHistory, gtsOffers, gtsSelfServe,
  gtsSuggest, keepableCopies, ladderText, lastCopyOf, offerAge, offerStart,
  otherFormsOf, signed,
} from "../core/trade.js";
import { boxBadges, pokeCard } from "../ui/card.js";
import { ask, closeSheet, openSheet } from "../ui/nav.js";

$("gtsAdd").onclick = function(){
  if (!gtsFree()) {
    toast("All " + GTS_SLOTS + " GTS slots are taken — withdraw one first");
    return;
  }
  gtsSheet(null, null);
};

/* a box row's card stripe: HOME, or the Champions box */
function locClass(r){ return r.location === "home" ? "home" : "perm"; }

/* ============================================================ open offers */
function drawGts(){
  var list = $("listGts");
  list.innerHTML = "";
  var offers = gtsOffers();
  /* "3" alone reads as an amount; "3/3" reads as a limit, which is the fact
     that changes what he does next */
  $("nGts").textContent = offers.length + "/" + GTS_SLOTS;
  var add = $("gtsAdd");
  var full = offers.length >= GTS_SLOTS;
  add.disabled = full;
  if (full) add.textContent = "All " + GTS_SLOTS + " slots taken";
  else add.textContent = "Log an offer" +
    (offers.length ? "  ·  " + gtsFree() + " free" : "");
  if (offers.length >= GTS_SLOTS) {
    list.appendChild(note("warn", "<strong>All " + GTS_SLOTS +
      " GTS slots are in use.</strong> A deposit holds its slot until someone " +
      "takes it or you withdraw it, so nothing else can go up until one of " +
      "these clears."));
  }
  if (!offers.length) {
    list.appendChild(el("div", "empty",
      "No offers sitting in the GTS — " + GTS_SLOTS + " slots free"));
    /* The history is not part of the open-offer list and must not share its
       early return: the closed trades vanished at exactly the moment you
       would go looking for them (player, 2026-09-12). */
    drawGtsHistory();
    return;
  }
  offerWarnings(list, offers);
  offers.forEach(function(o){
    list.appendChild(gtsRow(o._id, o));
  });
  drawGtsHistory();
}

/* Two things worth saying above the offers. Stones bought for a Pokemon that
   is not in the ledger: 2000 VP each, idle - the app knew the stones and the
   box separately and never crossed them. And a collision already in the
   data: two offers that believe they hold the same copy, where closing
   either would remove a Pokemon the other still counts on. */
function offerWarnings(list, offers){
  var byId = {}, clash = [];
  offers.forEach(function(o){
    if (!o.offeredId) return;
    if (byId[o.offeredId]) clash.push(o.offeredId);
    byId[o.offeredId] = 1;
  });
  var dead = deadStones();
  if (dead.length) {
    var names = {};
    dead.forEach(function(d){ names[d.species] = d.stone; });
    var keys = Object.keys(names);
    list.appendChild(note("warn",
      "<strong>" + keys.length + " Mega Stone" + (keys.length === 1 ? "" : "s") +
      " with nothing to hold " + (keys.length === 1 ? "it" : "them") + ".</strong> " +
      keys.map(function(k){ return names[k] + " (needs " + k + ")"; }).join(", ") +
      ". That is " + (keys.length * 2000) + " VP already spent and idle — " +
      "trading for one of those species turns it on. They are listed as " +
      "targets below."));
  }
  if (clash.length) {
    list.appendChild(note("bad", "<strong>Two offers name the same copy.</strong> " +
      "One Pokemon cannot sit in two GTS slots, so one of these is wrong: " +
      clash.join(", ") + ". Withdraw one and re-log it against a different copy " +
      "before either trade closes."));
  }
}

/* ================================================================ history
   BOTH SIDES OF EVERY CLOSED TRADE, searchable, because the question this
   list answers is "what did a Chesnaught fetch last time" - and a Chesnaught
   can be either half of it. Folded; the fold remembers. */
function drawGtsHistory(){
  var wrap = $("gtsHistWrap"), host = $("listGtsHist");
  if (!wrap) return;
  var h = gtsHistory();
  wrap.hidden = !h.length;
  if (!h.length) return;
  wireHistoryFold($("gtsHistToggle"), $("gtsHistBody"));
  $("gtsHistSub").textContent = marketSummary(h);
  host.innerHTML = "";
  var hq = ($("gtsHistSearch")?.value || "")
    .trim().toLowerCase();
  var shown = h.filter(function(r){
    return !hq || (r.offered + " " + r.requested + " " + (r.note || ""))
      .toLowerCase().includes(hq);
  });
  $("nGtsHist").textContent = hq && shown.length !== h.length
    ? shown.length + " of " + h.length : h.length;
  if (!shown.length) host.appendChild(el("div", "empty", "No trade matches"));
  shown.forEach(function(r){ host.appendChild(historyRow(r)); });
}

/* Wired once. A fold that forgets is a fold you reopen every visit, so its
   state is kept in localStorage. */
function wireHistoryFold(tog, bod){
  if (tog._wired) return;
  tog._wired = 1;
  tog.onclick = function(){
    var open = bod.hidden;
    bod.hidden = !open;
    tog.setAttribute("aria-expanded", open ? "true" : "false");
    tog.querySelector(".foldcaret").innerHTML = open ? "&#9662;" : "&#9656;";
    try { localStorage.setItem("champ-gtshist", open ? "1" : ""); } catch (e) {}
  };
  try {
    if (localStorage.getItem("champ-gtshist")) tog.onclick();
  } catch (e) {}
}

/* Collapsed, the fold's one line IS the feature, so it carries the finding
   rather than a description: over every closed trade, how often a chip
   reached the ceiling its Mega line sets. The trades say that ceiling is
   reachable, not automatic. */
function marketSummary(h){
  var ceil = h.filter(function(r){ return r.gaveValue && r.gotBst; });
  var hit = ceil.filter(function(r){ return r.gotBst >= r.gaveValue - 10; });
  var mega = ceil.filter(function(r){ return r.gaveValue > r.gaveBst; });
  if (!ceil.length) return "What the market actually paid.";
  var parity = mega.length
    ? ", " + (mega.length - hit.length) + " settled at base parity instead" : "";
  return "What the market actually paid, over " + ceil.length + " priced trades. " +
    hit.length + " reached the ceiling their Mega line sets" + parity +
    " — so that ceiling is reachable, not automatic.";
}

/* One closed trade: what went and what came, the BST on both sides and the
   gap, the chip's Mega line when that is what priced it, a shiny chip's
   premium, and how long it took to close. */
function historyRow(r){
  var row = el("div", "row perm");
  var m = el("div", "rmain");
  var nm = el("div", "rname");
  nm.appendChild(document.createTextNode(
    r.offered + "  →  " + r.requested));
  if (r.closed) nm.appendChild(el("span", "tag", r.closed));
  m.appendChild(nm);
  var meta = el("div", "rmeta");
  bstChange(meta, r);
  if (r.backfilled) {
    meta.appendChild(el("span", "tag", "recovered"));
  }
  shinyPremium(meta, r);
  var took = tradeDuration(r);
  if (took) {
    var fast = r.tookMs != null && r.tookMs < 6 * 3600000;
    meta.appendChild(el("span", "tag " + (fast ? "ok" : ""),
      took + " to close"));
  }
  m.appendChild(meta);
  row.appendChild(m);
  return row;
}

/* BST given -> BST got, the gap, and the chip's Mega line when that is what
   priced it. */
function bstChange(meta, r){
  if (r.gaveBst && r.gotBst) {
    var d = r.gotBst - r.gaveBst;
    meta.appendChild(el("span", "mono",
      r.gaveBst + " → " + r.gotBst + " BST"));
    meta.appendChild(el("span", "tag " + (d > 20 ? "ok" : ""),
      (d > 0 ? "+" : "") + d));
  }
  if (r.gaveValue && r.gaveValue > r.gaveBst) {
    meta.appendChild(el("span", null,
      "chip's Mega line: " + r.gaveValue));
  }
}

/* The row that will eventually price a shiny: what a shiny chip actually
   fetched, against what the same species is worth plain. */
function shinyPremium(meta, r){
  if (!r.gaveShiny) return;
  var prem = (r.gotBst != null && r.gaveValue != null)
    ? r.gotBst - r.gaveValue : null;
  meta.appendChild(el("span", "tag mega", "shiny chip" +
    (prem != null ? " · " + signed(prem) + " over plain" : "")));
}

/* How long a trade sat: measured to the hour when the deposit was stamped,
   in days for the ones logged before it was. */
function tradeDuration(r){
  if (r.tookMs != null) return elapsedText(r.tookMs);
  if (r.days != null) return r.days + " days";
  return null;
}

/* How hard a species is to get, as a chip coloured by it: hopeless, hard,
   fair, easy - and where it sits on the ladder. */
function diffChip(name, node){
  var d = gtsDiff(name);
  if (!d) return;
  var cls = "";
  if (d.score >= 5) cls = "bad";
  else if (d.score >= 4) cls = "warn";
  else if (d.score <= 2) cls = "ok";
  node.appendChild(el("span", "tag " + cls,
    DIFF_LABEL[d.score] + " to get · " + ladderText(d)));
}

/* ============================================================ one offer ==
   Shown as the two sides of a trade rather than a line of text. What decides
   whether an offer is fair is BST tier - the player's own test - so both
   sides wear their card, and under them the verdicts that matter: is the ask
   within the chip's price, how wanted each side is, what the target costs
   the other side to give, how long it has waited, and whether the ladder
   moved under it. */
function gtsRow(i, o){
  var row = el("button", "row rental gtsrow");
  var m = el("div", "rmain");

  var head = el("div", "rname");
  head.appendChild(el("span", null, "GTS offer"));
  head.appendChild(el("span", "tag warn", o.status || "PENDING"));
  if (o.deposited) head.appendChild(el("span", "tag", o.deposited));
  m.appendChild(head);

  var pair = el("div", "gtspair");
  pair.appendChild(offerSide("You gave", o.offered,
    o.offeredId ? S.box[o.offeredId] : null));
  var arrow = el("div", "gtsarrow");
  arrow.textContent = "→";
  pair.appendChild(arrow);
  pair.appendChild(offerSide("You asked for", o.requested, null));
  m.appendChild(pair);

  var od = gtsDiff(o.offered), rd = gtsDiff(o.requested);
  [priceVerdict(o), demandGap(o, od, rd), targetNote(rd), waitLine(o),
   ladderMove(o, rd)].forEach(function(n){ if (n) m.appendChild(n); });
  if (o.note) {
    var n = el("div", "gtsnote");
    n.textContent = o.note;
    m.appendChild(n);
  }

  row.appendChild(m);
  row.onclick = function(){ gtsSheet(i, o); };
  return row;
}

/* One side of the trade, as the card - half-width. It carries the one fact
   this screen is FOR: the Mega line, since a chip is priced by its Mega's
   BST (player, 2026-09-20). A name no dex carries still holds its side. */
function offerSide(label, name, rec){
  var box = el("div", "gtsside");
  box.appendChild(el("div", "gtslabel", label));
  var p = anyRow(name);
  var sd = gtsDiff(name);
  if (!p) {
    var nm0 = el("div", "rname");
    nm0.appendChild(document.createTextNode(name || "—"));
    if (rec) boxBadges(nm0, rec);
    box.appendChild(nm0);
    var mt0 = el("div", "rmeta");
    mt0.appendChild(el("span", "mono", dexLabel(name)));
    if (name) mt0.appendChild(el("span", "tag bad", "not in the Champions dex"));
    box.appendChild(mt0);
    return box;
  }
  var asked = label.includes("asked");
  box.appendChild(pokeCard(p, {
    tag: "div",
    name: name,
    shiny: !!rec?.shiny,
    badges: function(nm){ if (rec) boxBadges(nm, rec); },
    meta: function(meta){
      /* Both sides (player, 2026-09-11: "beedrill en que posicion esta?").
         The ask decides whether anyone CAN give it; the chip decides whether
         anyone WANTS to. An offer needs both, so both are on screen. */
      if (sd) {
        if (asked) diffChip(name, meta);
        else meta.appendChild(el("span", "tag", "ladder " + ladderText(sd)));
      }
      /* a shiny chip is a more expensive coin than its species - said on the
         side you are giving, where it changes what you can ask for */
      if (rec?.shiny && !asked) {
        var cvs = chipValueOf(rec);
        if (cvs) meta.appendChild(el("span", "tag mega",
          "shiny — reaches ~" + cvs.reach));
      }
    }
  }));
  return box;
}

/* IS THE ASK WITHIN THE CHIP'S PRICE. The chip is priced the way his closed
   trades priced it - by its Mega's BST, plus the shiny and demand estimates -
   not by its base row: Beedrill 395 asking Steelix 510 is a 15-point stretch
   against a Mega price of 495, not 115. */
function priceVerdict(o){
  var aRec = o.offeredId ? S.box[o.offeredId] : null;
  var cv = chipValue(o.offered, !!aRec?.shiny);
  var bP = anyRow(o.requested);
  if (!cv || !bP) return null;
  var target = bst(bP);
  var diff = target - cv.reach;
  var verdict = el("div", "rmeta");
  var stretch = "warn";
  if (diff <= 20) stretch = "ok";
  else if (diff > 60) stretch = "bad";
  var over = "+" + diff + " over" + (diff <= 20 ? ", a fair stretch" : "");
  verdict.appendChild(el("span", "tag " + stretch,
    diff <= 0 ? "within its price" : over));
  verdict.appendChild(el("span", null,
    "chip is worth ~" + cv.reach + priceParts(cv) + ", asking " + target));
  if (diff > 60) {
    verdict.appendChild(el("span", null,
      "that is a tier up — it will sit unclaimed"));
  }
  return verdict;
}

/* " (395 base, 495 via its Mega, +20 est. shiny)" - how the price was made,
   when it is more than the base row. */
function priceParts(cv){
  if (!(cv.viaMega || cv.shiny || cv.demandBonus)) return "";
  var parts = [cv.base + " base"];
  if (cv.viaMega) parts.push(cv.value + " via its Mega");
  if (cv.shiny) parts.push("+" + cv.shinyBonus + " est. shiny");
  if (cv.demandBonus) parts.push("+" + cv.demandBonus + " est. demand");
  return " (" + parts.join(", ") + ")";
}

/* THE DESIRABILITY GAP, WHICH BST CANNOT SEE. "nadie quiere a flamigo"
   (player): a chip is worth what the other side will take. Two ladder ranks
   side by side are the whole negotiation in one line - and a side the ladder
   does not rank is unknown, not zero. */
function demandGap(o, od, rd){
  if (!od || !rd) return null;
  if (od.rank != null && rd.rank != null) {
    var gap = od.rank - rd.rank;   // + means you are asking for the rarer one
    var mv = el("div", "rmeta");
    var fit = demandFit(gap);
    mv.appendChild(el("span", "tag " + fit[0],
      "offering #" + od.rank + ", asking #" + rd.rank));
    mv.appendChild(el("span", null, fit[1]));
    return mv;
  }
  var mv2 = el("div", "rmeta");
  mv2.appendChild(el("span", "tag warn", "no demand read"));
  mv2.appendChild(el("span", null,
    (od.rank == null ? o.offered : o.requested) +
    " is not among the " + ((od.size || rd.size) || "ranked") +
    " species the ladder tracks, so how wanted it is here is unknown — " +
    "not zero."));
  return mv2;
}

/* What the target costs the OTHER side to give: running it on the ladder,
   hard to obtain in GO, or so easy he can get it himself - which makes
   spending a chip on it spending it twice. */
function targetNote(wd){
  if (!wd) return null;
  var bits = [];
  if (wd.demand >= 4) {
    bits.push("Demand: ladder #" + (wd.rank || "?") +
      ", so the other side is running it rather than trading it.");
  }
  if (wd.supply >= 4) {
    bits.push("Supply: " + (wd.how || "hard to obtain in GO") +
      " Everyone who wants one faces the same wall, so spares barely exist.");
  }
  if (gtsSelfServe(wd)) {
    bits.push("You can get this one yourself in GO — " +
      (wd.how || "it is a normal catch or evolve") +
      " Spending a chip on it is spending it twice.");
  }
  if (wd.demand == null) {
    bits.push("Not among the " + (wd.size || "ranked") + " species the " +
      "ladder tracks — either too little played to register, or too new. " +
      "Either way its demand is unknown rather than low.");
  }
  if (!bits.length && wd.score <= 2) {
    bits.push("Low demand and easy to source — this one should move.");
  }
  if (!bits.length) return null;
  var d2 = el("div", "gtsnote");
  d2.textContent = bits.join(" ");
  return d2;
}

/* HOW LONG IT HAS WAITED. An offer nobody has taken in over a week is not
   waiting - it is priced wrong. */
function waitLine(o){
  var age = offerAge(o);
  if (age == null) return null;
  var ar = el("div", "rmeta");
  var waited = elapsedText(Date.now() - offerStart(o));
  var stale = "";
  if (age >= 14) stale = "bad";
  else if (age >= 7) stale = "warn";
  ar.appendChild(el("span", "tag " + stale,
    (waited || (age + " days")) + " waiting"));
  if (age >= 7) {
    ar.appendChild(el("span", null, age >= 14
      ? "two weeks unclaimed — the ask is too high for this chip"
      : "a week unclaimed — worth re-pointing at something lower"));
  }
  return ar;
}

/* THE LADDER MOVES UNDER A STANDING OFFER: Sneasler went 23% -> 50% while an
   offer for it sat there. Its rank is recorded at deposit and compared now;
   a move of 8 places or more is worth saying. */
function ladderMove(o, rd){
  if (o.rankAtDeposit == null || rd?.rank == null ||
      Math.abs(o.rankAtDeposit - rd.rank) < 8) return null;
  var moved = o.rankAtDeposit - rd.rank;      // + means it climbed
  var mr = el("div", "rmeta");
  mr.appendChild(el("span", "tag " + (moved > 0 ? "bad" : "ok"),
    "ladder #" + o.rankAtDeposit + " → #" + rd.rank));
  mr.appendChild(el("span", null, moved > 0
    ? "it got MORE wanted since you posted — harder now than when you asked"
    : "it cooled off since you posted — this is likelier to land now"));
  return mr;
}

/* ====================================================== the offer's sheet ==
   Log a new offer, or edit, close or withdraw an open one. `d` is the draft;
   each picker re-opens this sheet with its answer filled in. */
function gtsSheet(id, o){
  /* `deposited` is a date the player can edit, so it stays. `depositedAt` is
     the machine stamp: BST does not explain why Indeedee went in hours while
     a Beedrill sat for days (player, 2026-09-12), and a date alone cannot
     measure that - two trades on the same day look identical. */
  var now = new Date();
  o = o || {offered:"", requested:"",
            deposited:now.toISOString().slice(0,10),
            depositedAt:now.toISOString(),
            status:"PENDING", note:""};
  var d = structuredClone(o);
  openSheet(id == null ? "Log a GTS offer" : "GTS offer", function(body){
    offerFields(body, id, d);
  }, id != null ? [
    fbtn("Save changes", "primary", function(){ saveOffer(id, d); }),
    fbtn("Trade went through", "danger", function(){ confirmTrade(id, d); }),
    /* NOT danger. Withdrawing takes your own Pokemon back and loses nothing -
       the offer can be re-logged in a second. Red is for what ends something,
       and "Trade went through", which removes a Pokemon from the box, is. */
    fbtn("Withdrew it", "", function(){
      drop("gts/" + id).then(function(){
        closeSheet(); toast("Offer removed");
      });
    })
  ] : [
    null,
    fbtn("Log it", "primary", function(){ logOffer(d); }),
    fbtn("Cancel", "", closeSheet)
  ]);
}

/* The two sides, the date, a note, and what depositing means. */
function offerFields(body, id, d){
  body.appendChild(pickField("You deposited", d.offered,
    "From your box - it remembers WHICH copy",
    function(){
      gtsPickMine(function(rec){
        d.offered = rec.name;
        d.offeredId = rec._id;      // so three Chesnaught stay three
        closeSheet(); gtsSheet(id, d);
      }, id);
    }, d.offeredId ? S.box[d.offeredId] : null));
  body.appendChild(pickField("You asked for", d.requested,
    "Any Pokemon, including ones Champions does not allow",
    function(){
      gtsPickWanted(function(name){
        d.requested = name;
        closeSheet(); gtsSheet(id, d);
      }, d.offered || null,
         !!(d.offeredId && S.box[d.offeredId]?.shiny));
    }, null));
  var wd = el("div", "field");
  wd.appendChild(el("label", "f", "Date"));
  var di = el("input"); di.type = "text"; di.value = d.deposited || "";
  di.oninput = function(){ d.deposited = di.value; };
  wd.appendChild(di);
  body.appendChild(wd);
  var w = el("div", "field");
  w.appendChild(el("label", "f", "Note"));
  var ta = el("textarea"); ta.value = d.note || "";
  if ((d.note || "").length > 200) ta.classList.add("long");
  ta.oninput = function(){ d.note = ta.value; };
  w.appendChild(ta);
  body.appendChild(w);
  body.appendChild(el("div", "note",
    "Depositing is not a trade. The offered Pokemon is still yours and can be " +
    "withdrawn — but it is parked, so it cannot be sent to Champions while " +
    "it sits there."));
}

/* Edit an open offer - its own row, and nothing else. */
function saveOffer(id, d){
  if (!d.offered || !d.requested) { toast("Both sides are needed"); return; }
  var cl = gtsClash(d, id);
  if (cl) { toast("That copy is already in the GTS, waiting for " +
                  (cl.requested || "something")); return; }
  put("gts/" + id, d).then(function(){
    closeSheet(); toast("Offer updated");
  });
}

/* A TRADE IS AN EXCHANGE: the Pokemon deposited is gone the moment someone
   takes it, so it leaves the box as the new one arrives (player,
   2026-09-09). The offer records WHICH copy went, so a box with three
   Chesnaught loses the right one; offers logged before that was stored fall
   back to the first match by name. Asks first, saying exactly that. */
function confirmTrade(id, d){
  var going = null;
  if (d.offeredId && S.box[d.offeredId]) {
    going = S.box[d.offeredId];
    going._id = d.offeredId;
  }
  var mine = boxRows("home").concat(boxRows("champions"))
    .filter(function(r){ return r.name === d.offered; });
  if (!going) going = mine[0];
  var msg = d.offered + " is not in the box any more, so only " +
    d.requested + " will be added.";
  if (going) {
    msg = "Trade done: " + d.offered + " leaves the box and " + d.requested +
      " arrives in HOME.";
    if (mine.length > 1 && !d.offeredId)
      msg += "  You have " + mine.length + " " + d.offered +
        " - the first one is the one being removed.";
  }
  ask("Close this trade?", msg, "Trade done").then(function(ok){
    if (ok) closeTrade(id, d, going);
  });
}

/* Write the ending onto the offer's own row - it is the same trade, not a
   new record - with what it MEASURED: how long it took, whether the chip was
   shiny, both BSTs and the chip's Mega value. A closed trade is the only
   hard evidence of what the market pays; the pricing rule itself came from
   remembering five of these. Then the new Pokemon arrives in HOME (HOME
   origin, so its slot stays elastic) and the one given leaves the box. */
function closeTrade(id, d, going){
  var offRec = d.offeredId ? S.box[d.offeredId] : null;
  var wasShiny = !!offRec?.shiny;
  var vOff = chipValue(d.offered, wasShiny), vGot = chipValue(d.requested);
  var done = {...d, closed:new Date().toISOString().slice(0, 10),
    closedAt:new Date().toISOString(),
    days:offerAge(d),
    /* the number that ranks demand better than BST does */
    tookMs:(d.depositedAt ? (Date.now() - Date.parse(d.depositedAt)) : null),
    gaveShiny:wasShiny,
    gaveBst:vOff?.base, gaveValue:vOff?.value,
    gotBst:vGot?.base,
    rankAtDeposit:d.rankAtDeposit != null ? d.rankAtDeposit : null};
  put("gts/" + id, done).then(function(){
    var newId = freeSlug(d.requested, S.box);
    /* NO NOTE on the arrival: the closed trade carries the chip, the
       Pokemon and the date (player, 2026-09-28: "como ya tengo un historial
       de trades gts, creo que eso quedó sobrando"). The note is his. */
    return put("box/" + newId, {name:d.requested, location:"home",
      status:"permanent", origin:"home", note:"",
      order:Object.keys(S.box).length});
  }).then(function(){
    return going ? drop("box/" + going._id) : null;
  }).then(function(){
    closeSheet();
    toast(going ? d.offered + " out, " + d.requested + " in"
                : d.requested + " is in HOME");
  });
}

/* Log a new offer. Only the hard case stops you: your only copy of a
   species the game allows, with no other form of it anywhere - and even then
   it asks rather than blocks (the one time this happened he gave a #28 and
   got a #2). Choosing between forms is his call. */
function logOffer(d){
  if (!d.offered || !d.requested) { toast("Both names are needed"); return; }
  if (!gtsFree()) {
    toast("All " + GTS_SLOTS + " GTS slots are taken — withdraw one first");
    return;
  }
  var lastRec = d.offeredId ? S.box[d.offeredId] : null;
  if (lastCopyOf(lastRec) && !otherFormsOf(lastRec).length) {
    ask("Your only " + d.offered + "?",
        "It is in the Champions dex, so trading it means losing the "
        + "species for good — your own rule is to keep one of everything "
        + "Champions allows.", "Offer it anyway", true)
      .then(function(ok){ if (ok) postOffer(d); });
    return;
  }
  postOffer(d);
}

/* Stamp what the ladder says TODAY, so a later reading can tell the target
   moved; stamp the moment it is really posted; and ask the database for a
   free id - beedrill, beedrill-2 - rather than guessing from what this
   device has loaded, so two devices logging at once cannot both pick one. */
function postOffer(d){
  var rdNow = gtsDiff(d.requested);
  if (rdNow?.rank != null) d.rankAtDeposit = rdNow.rank;
  if (!d.depositedAt) d.depositedAt = new Date().toISOString();
  var cl2 = gtsClash(d, null);
  if (cl2) { toast("That copy is already in the GTS, waiting for " +
                   (cl2.requested || "something")); return; }
  var stem = String(d.offered).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "offer";
  putNew("gts", stem, d).then(function(){
    closeSheet(); toast("Offer logged");
  });
}

/* A field you tap rather than type into: a typed name is a typo waiting to
   happen. Empty, it says what it offers; filled, it is the same card as
   everywhere else - BST is the whole argument on this screen, and the card
   puts it in a cell of its own. A name no dex carries says it can sit in
   HOME but never enter the game. */
function pickField(label, current, subtitle, opener, rec){
  var w = el("div", "field");
  w.appendChild(el("label", "f", label));
  if (!current) {
    var blank = el("button", "row unknown");
    var bm = el("div", "rmain");
    bm.appendChild(el("div", "rname", "Tap to choose"));
    bm.appendChild(el("div", "rmeta")).appendChild(el("span", null, subtitle));
    blank.appendChild(bm);
    blank.onclick = opener;
    w.appendChild(blank);
    return w;
  }
  var p = anyRow(current);
  var b;
  if (p) {
    b = pokeCard(p, {
      cls: rec ? locClass(rec) : "",
      name: current,
      shiny: !!rec?.shiny,
      badges: function(h){ if (rec) boxBadges(h, rec); },
      onclick: opener
    });
  } else {
    b = el("button", "row illegal");
    var m = el("div", "rmain");
    var h = el("div", "rname");
    h.appendChild(document.createTextNode(current));
    if (rec) boxBadges(h, rec);
    h.appendChild(el("span", "tag bad", "not in the Champions dex"));
    m.appendChild(h);
    var meta = el("div", "rmeta");
    meta.appendChild(el("span", "mono", dexLabel(current)));
    meta.appendChild(el("span", null,
      "it can sit in HOME but never enter the game"));
    m.appendChild(meta);
    b.appendChild(m);
    b.onclick = opener;
  }
  w.appendChild(b);
  return w;
}

/* ====================================================== what you deposit ==
   The Pokemon you can deposit are the ones you actually hold, so the list is
   the box itself - carrying the box id, not just the name, so three
   Chesnaught stay three distinguishable Chesnaught.

   Only what CAN leave: a Champions-ORIGIN Pokemon never leaves the game, so
   it can never reach a GTS box (player, 2026-09-12). Rentals are Champions
   origin by definition, and so is a leftover "unknown" - the safe way round:
   offering something you cannot move is a dead end, hiding something you
   could move is one question away. And one Pokemon, one GTS slot (player,
   2026-09-11: "no debería dejarme elegir el mismo pokemon"): a copy already
   deposited is shown greyed with what it waits for, never hidden.

   `exceptId` is the offer being EDITED - its own pick has to stay
   selectable, or re-saving that offer would be impossible. */
function gtsPickMine(onPick, exceptId){
  var taken = {};
  gtsOffers().forEach(function(o){
    if (o._id !== exceptId && o.offeredId) taken[o.offeredId] = o;
  });
  openSheet("Which one are you depositing?", function(body){
    var home = boxRows("home");
    var champAll = boxRows("champions");
    var champ = champAll.filter(function(r){ return originOf(r) === "home"; });
    var locked = champAll.length - champ.length;
    if (!home.length && !champ.length) {
      body.appendChild(el("div", "empty", locked
        ? "Nothing here can be deposited. All " + locked + " in the Champions " +
          "box came out of an Encounter, and those can never leave the game — " +
          "only a Pokemon that arrived from HOME can go back to it."
        : "Nothing in the box yet"));
      return;
    }
    var inp = searchField(body, "Filter " + (home.length + champ.length) +
      " in your box — name, type or number", function(){ draw(); });
    var PICK = {sort: "dex", dupes: false, outside: false};
    mineControls(body, PICK, draw);
    var out = el("div");
    body.appendChild(out);
    /* Copies he could KEEP, over the whole ledger and not the section. A
       welded Champions row is not one of them - see keepableCopies. */
    var ctx = {PICK: PICK, copies: keepableCopies(), taken: taken, onPick: onPick};
    function draw(){
      var q = inp.q();
      out.innerHTML = "";
      var n = mineSection(out, "In HOME", home, "A GTS deposit comes out of HOME.", q, ctx);
      n += mineSection(out, "In the Champions Box", champ,
        "These came in from HOME, so they can go back to it — park one to " +
        "HOME first, then deposit it. Its training comes back with it.", q, ctx);
      if (!n) {
        out.appendChild(el("div", "empty",
          emptyPick(PICK, inp.value.trim())));
      }
      /* Said, not silently hidden: a row that vanishes with no explanation is
         a row you think you have lost. */
      if (locked) {
        out.appendChild(el("p", "sub",
          locked + " more in the Champions box " +
          (locked === 1 ? "is" : "are") + " Encounter-bought or rented. Those " +
          "can never leave the game, so they can never reach a GTS box."));
      }
    }
    draw();
    setTimeout(function(){ inp.focus(); }, 60);
  }, []);
}

/* SORTING AND TWO FILTERS, BECAUSE THIS IS A SHORTLIST, NOT A BOX. His rule
   lets only DUPLICATES and species Champions cannot use go (player,
   2026-09-18: "seria muy interesante que el listado tuviese orden por dex
   number o filtro de pokemones duplicados o pokemones con tag not in
   champions"). Dex order first, because that is the order HOME itself lists
   in, which is how one screen gets checked against the other. */
function mineControls(body, PICK, draw){
  var sortWrap = el("div", "toggles");
  [["dex", "Dex no."], ["az", "A-Z"], ["bst", "BST"],
   ["reach", "What it can ask"]].forEach(function(o){
    var t = el("button", "tog", o[1]);
    t.setAttribute("aria-pressed", PICK.sort === o[0] ? "true" : "false");
    t.onclick = function(){
      PICK.sort = o[0];
      Array.prototype.forEach.call(sortWrap.children, function(c){
        c.setAttribute("aria-pressed", c === t ? "true" : "false");
      });
      draw();
    };
    sortWrap.appendChild(t);
  });
  body.appendChild(sortWrap);

  var filtWrap = el("div", "toggles");
  [["dupes", "Duplicates only", "You hold more than one copy you could " +
    "KEEP - in HOME, or in the Champions box and able to go back there. A " +
    "rental or an Encounter buy of the same species does not count: it can " +
    "never leave the game, so it can never be the copy you keep. The " +
    "Species Clause means a real second copy can never share a team with " +
    "the first, so it is pure trade material."],
   ["outside", "Not in Champions only", "HOME can hold it for ever and it " +
    "can never enter the game, so it costs you nothing to give away."]
  ].forEach(function(o){
    var t = el("button", "tog", o[1]);
    t.title = o[2];
    t.setAttribute("aria-pressed", "false");
    t.onclick = function(){
      PICK[o[0]] = !PICK[o[0]];
      t.setAttribute("aria-pressed", PICK[o[0]] ? "true" : "false");
      draw();
    };
    filtWrap.appendChild(t);
  });
  body.appendChild(filtWrap);
}

/* The deposit picker's empty state, naming whichever filters are on. */
function emptyPick(pick, q){
  var match = q ? " and matches “" + q + "”" : "";
  if (pick.dupes && pick.outside)
    return "Nothing you can deposit is both a duplicate and outside the " +
      "Champions dex" + match;
  if (pick.dupes) return "Nothing you can deposit is a duplicate" + match;
  if (pick.outside)
    return "Nothing you can deposit is outside the Champions dex" + match;
  return "Nothing you can deposit matches “" + q + "”";
}

/* Does a box row pass the filters and the search - name, dex number, type,
   or the words "shiny" and "trained"? */
function mineMatches(r, q, ctx){
  if (ctx.PICK.dupes && (ctx.copies[r.name] || 0) < 2) return false;
  if (ctx.PICK.outside && byName[r.name]) return false;
  if (!q) return true;
  if (r.name.toLowerCase().includes(q)) return true;
  if (String(dexNo(r.name)).includes(q)) return true;
  var p = anyRow(r.name);
  if (p?.types.join(" ").toLowerCase().includes(q)) return true;
  if (q === "shiny" && r.shiny) return true;
  if (q === "trained" && r.trained) return true;
  return false;
}

/* The sort key: a name for A-Z, otherwise a number (negated, so the biggest
   BST or the highest ask comes first). */
function mineOrder(r, sort){
  var p = anyRow(r.name);
  if (sort === "az") return r.name;
  if (sort === "bst") return -(p ? bst(p) : 0);
  if (sort === "reach") {
    var cv = chipValueOf(r);
    return -(cv ? cv.reach : 0);
  }
  return dexNo(r.name);
}

/* One box's section. Returns how many rows it drew, so an empty result can
   be said once for both. */
function mineSection(out, title, all, sub, q, ctx){
  var rows = all.filter(function(r){ return mineMatches(r, q, ctx); });
  if (!rows.length) return 0;
  rows.sort(function(a, b){
    var x = mineOrder(a, ctx.PICK.sort), y = mineOrder(b, ctx.PICK.sort);
    if (x < y) return -1;
    if (x > y) return 1;
    return a.name.localeCompare(b.name);
  });
  out.appendChild(el("h2", null, title));
  if (sub) out.appendChild(el("p", "sub", sub));
  var l = el("div", "list cards");
  /* the copy count is over the WHOLE section, not the filtered rows: "copy 2
     of 2" has to mean the same thing whether or not you typed anything */
  var seen = {}, nth = {};
  all.forEach(function(r){ seen[r.name] = (seen[r.name] || 0) + 1; });
  all.forEach(function(r){
    nth[r._id] = (nth[r.name + "#"] = (nth[r.name + "#"] || 0) + 1);
  });
  rows.forEach(function(r){ l.appendChild(mineCard(r, ctx, seen, nth)); });
  out.appendChild(l);
  return rows.length;
}

/* One copy, on the card every list uses - its type, its picture (its own
   colours if shiny), its Mega line and its six stats, because a bare row with
   a BST and a Speed is not enough to choose what to give away (player,
   2026-09-18). The badges say whether it is already deposited, whether it is
   the last of its form, which copy it is and its marks; the meta, how the
   ladder rates it and how high it can ask. */
function mineCard(r, ctx, seen, nth){
  var p = anyRow(r.name);
  var held = ctx.taken[r._id];
  var last = !held && lastCopyOf(r);
  var kin = last ? otherFormsOf(r) : [];
  var cd = p && gtsDiff(r.name);
  var cv = p && chipValueOf(r);
  var m = null;
  var b = pokeCard(p || anyRow(r.name) || {name:r.name, types:[], b:[0,0,0,0,0,0], ab:[]}, {
    cls: held ? "illegal" : locClass(r),
    name: r.name,
    shiny: !!r.shiny,
    badges: function(h){
      if (held) h.appendChild(el("span", "tag bad", "already in the GTS"));
      if (last) h.appendChild(el("span", "tag " + (kin.length ? "" : "warn"),
        kin.length ? "only one of this form" : "your only one"));
      if (seen[r.name] > 1)
        h.appendChild(el("span", "tag", "copy " + nth[r._id] + " of " +
          seen[r.name]));
      /* "copy 1 of 2" does not say WHICH one. The marks do. */
      boxBadges(h, r);
    },
    meta: function(meta){
      /* The ladder on THIS side of the trade too (player, 2026-09-13): how
         fast his own chip clears, and how high it can therefore ask. */
      if (cd) meta.appendChild(el("span", "tag" + (cd.demand >= 4 ? " ok" : ""),
        "ladder " + ladderText(cd)));
      else if (p) meta.appendChild(el("span", "tag warn", "no ladder row"));
      if (cv && cv.reach > cv.base)
        meta.appendChild(el("span", "mono", "asks up to ~" + cv.reach));
      if (r.note) meta.appendChild(el("span", null, String(r.note).slice(0, 40)));
    },
    notes: function(body2){ m = body2; }
  });
  if (held) { b.disabled = true; b.classList.add("dim"); }
  mineNotes(m, r, {held: held, last: last, kin: kin, cv: cv});
  if (!held) b.onclick = function(){ ctx.onPick(r); };
  return b;
}

/* Under the card: why it can ask above its base row (and which part of that
   is measured - the Mega half comes from his own closed trades, the other two
   are estimates); what being the last copy means; and what a deposited copy
   is waiting for. */
function mineNotes(m, r, s){
  var cv = s.cv;
  if (cv && cv.reach > cv.base && !s.held) {
    var why = "Base " + cv.base;
    if (cv.viaMega) why += ", but a chip fetches its Mega's " + cv.value;
    if (cv.demandBonus) why += " · +" + cv.demandBonus +
      " because the ladder wants it (estimate)";
    if (cv.shinyBonus) why += " · +" + cv.shinyBonus + " shiny (estimate)";
    m.appendChild(el("div", "st", why + "."));
  }
  if (s.last) {
    m.appendChild(el("div", "st", s.kin.length
      ? "The only " + r.name + " you have, but you still hold " +
        s.kin.join(", ") + ". Which form to keep is your call — the Male "
        + "Indeedee went this way and the Female was the keeper."
      : "The only " + r.name + " you have, and no other form of it. " +
        "Trading it loses the species — your rule is to keep one of " +
        "everything Champions allows."));
  }
  if (s.held) {
    m.appendChild(el("div", "st", "Deposited" +
      (s.held.deposited ? " " + s.held.deposited : "") + ", waiting for " +
      (s.held.requested || "something") +
      ". Withdraw that offer first to free this copy."));
  }
}

/* ===================================================== what you ask for ==
   Anything that exists: the whole dex, plus everything HOME can hold that
   Champions cannot. And first - given the chip - what it can actually fetch,
   by the same reasoning that picked Abomasnow and Steelix by hand
   (2026-09-11): price by the Mega, skip what the ladder is running, and put a
   stone already owned with nothing to hold it on top. */
function gtsPickWanted(onPick, chipName, chipShiny){
  openSheet("What did you ask for?", function(body){
    if (chipName) chipAdvice(body, chipName, chipShiny, onPick);
    var inp = searchField(body, "Search any Pokemon", function(){ draw(); });
    var list = el("div", "list cards");
    body.appendChild(list);
    function draw(){ drawWanted(list, inp.q(), onPick); }
    draw();
    setTimeout(function(){ inp.focus(); }, 60);
  }, []);
}

/* What the chip is worth, why, and two lists of what it can fetch: what it
   can REACH, and what it can reach that someone will actually take today. */
function chipAdvice(body, chipName, chipShiny, onPick){
  var v = chipValue(chipName, chipShiny);
  var picks = gtsSuggest(chipName, 14, chipShiny);
  if (v) chipWorth(body, chipName, chipShiny, v);
  if (!picks.length) return;
  suggestList(body, "Worth asking for",
    "At or above what the chip is worth — " + v.value +
    (v.reach > v.value ? ", up to about " + v.reach + " with the estimated "
                       + "premiums" : "") + ".",
    picks.filter(function(c){ return c.band === "reach"; }), v, onPick);
  suggestList(body, "Safer asks",
    "Below its price" + (v.viaMega ? ", around the base row of " + v.base
                                   : "") + ". Less than the chip could " +
    "fetch, and far more likely to be taken.",
    picks.filter(function(c){ return c.band === "base"; }), v, onPick);
  body.appendChild(el("h2", null, "Or anything else"));
}

/* The chip's price, and the two premiums on it - demand and shininess - each
   called an ESTIMATE until enough closed trades measure it. */
function chipWorth(body, chipName, chipShiny, v){
  body.appendChild(el("p", "sub",
    chipName + (chipShiny ? " (shiny)" : "") + " is worth about " +
    v.value +
    (v.viaMega ? " — its base row says " + v.base +
                 ", but a chip fetches its Mega's BST, which is what " +
                 "your own closed trades paid." : ".")));
  if (v.demandBonus) {
    var cd = gtsDiff(chipName);
    body.appendChild(note("", "<strong>People want this one.</strong> " +
      chipName + " is ladder #" + cd.rank +
      (cd.usage != null ? " at " + cd.usage.toFixed(1) + "%" : "") +
      ", so it clears fast and can ask above its stat line — your " +
      "Indeedee went the same day, twice, on a 475 body with no Mega. " +
      "About +" + v.demandBonus + " of the " + v.reach +
      " below is that, and it is an <em>estimate</em> until enough " +
      "trades close to measure it."));
  }
  if (chipShiny) {
    body.appendChild(note("", "<strong>It is shiny, so it reaches " +
      "higher.</strong> Targets up to about " + v.reach + " are in range. " +
      "How much higher is an <em>estimate</em> — your closed trades " +
      "price the Mega rule exactly, but no shiny has changed hands yet " +
      "to measure this one. The trade history records shininess, so the " +
      "first shiny trade you close will settle it."));
  }
}

function suggestList(body, title, sub, rows, v, onPick){
  if (!rows.length) return;
  body.appendChild(el("h2", null, title));
  if (sub) body.appendChild(el("p", "sub", sub));
  var sl = el("div", "list cards");
  rows.forEach(function(c){
    var r2 = suggestCard(c, v, onPick);
    if (r2) sl.appendChild(r2);
  });
  body.appendChild(sl);
}

/* One suggestion, on the same card as every other list (player,
   2026-09-20) - what a chip can fetch is mostly a question about the
   target's Mega - with the reason it is on the list: a stone already owned,
   a stretch the premiums put in range, or a safer ask under the price. */
function suggestCard(c, v, onPick){
  var p2 = anyRow(c.name);
  if (!p2) return null;
  var m2 = null;
  var b2 = pokeCard(p2, {
    cls: c.stone ? "perm" : "",
    badges: function(h2){
      if (c.stone)
        h2.appendChild(el("span", "tag ok", "you own " + c.stone));
    },
    meta: function(mt){
      mt.appendChild(el("span", "tag " + (c.rank == null ? "warn" : ""),
        c.rank == null ? "no ladder row" : "ladder #" + c.rank));
    },
    notes: function(body2){ m2 = body2; },
    onclick: function(){ onPick(c.name); }
  });
  var why = suggestWhy(c, v);
  if (why) m2.appendChild(el("div", "st", why));
  return b2;
}

function suggestWhy(c, v){
  if (c.stone) {
    return "You bought " + c.stone + " and have nothing to put it on — " +
      "2000 VP that starts working the moment this lands.";
  }
  if (c.stretch) {
    var lift = [];
    if (v.shinyBonus) lift.push("it is shiny (+" + v.shinyBonus + ")");
    if (v.demandBonus) lift.push("the ladder wants your chip (+" +
      v.demandBonus + ")");
    return "Above the chip's own " + v.value +
      (lift.length ? " — in range because " + lift.join(" and ") +
                     ", which is the estimated half of the price."
                   : " — a stretch, but the kind that lands.");
  }
  if (c.band === "base") {
    return "Under the " + v.value + " this chip could ask" +
      (v.viaMega ? ", nearer its base row of " + v.base : "") +
      " — asking for less than you could is what makes an offer clear " +
      "the same day.";
  }
  return null;
}

/* The search: up to 120 forms from the Champions dex, and - once something
   is typed - up to 40 names only HOME can hold. Both caps are said. */
function drawWanted(list, q, onPick){
  list.innerHTML = "";
  var pool = FORMS.filter(function(p){
    return !q || p.name.toLowerCase().includes(q);
  });
  var hits = pool.slice(0, 120);
  hits.forEach(function(p){ list.appendChild(wantedCard(p, onPick)); });
  if (q) {
    var homeAll = (C.HOME_ONLY || []).filter(function(n){
      return n.toLowerCase().includes(q);
    });
    homeAll.slice(0, 40).forEach(function(n){
      list.appendChild(homeOnlyCard(n, onPick));
    });
    capNote(list, Math.min(40, homeAll.length), homeAll.length,
            "HOME-only names");
  }
  capNote(list, hits.length, pool.length, "forms");
  if (!list.children.length) {
    list.appendChild(el("div", "empty",
      q ? "Nothing matches" : "Start typing a name"));
  }
}

/* A Champions form, with how hard it is to get - the moment to find out an
   ask is hopeless is before depositing, not weeks later - and a warning when
   he could get it in GO himself. */
function wantedCard(p, onPick){
  return pokeCard(p, {
    meta: function(meta){ diffChip(p.name, meta); },
    notes: function(m){
      var wd = gtsDiff(p.name);
      if (wd && gtsSelfServe(wd)) {
        m.appendChild(el("div", "st",
          "You can get this in GO yourself — don't spend a chip on it."));
      } else if (wd && wd.supply >= 4 && wd.how) {
        m.appendChild(el("div", "st", wd.how));
      }
    },
    onclick: function(){ onPick(p.name); }
  });
}

/* A species Champions has never heard of still gets a card, its numbers from
   PokeAPI: asking for one is a real decision - it is how a HOME shelf gets
   filled. A name with no numbers at all keeps a plain row. */
function homeOnlyCard(n, onPick){
  var op = anyRow(n);
  if (op) {
    return pokeCard(op, {cls:"illegal", name:n, badges:homeOnlyBadge,
                         notes:homeOnlyWhy, onclick:function(){ onPick(n); }});
  }
  var b = el("button", "row illegal");
  var m = el("div", "rmain");
  var h = el("div", "rname");
  h.appendChild(document.createTextNode(n));
  homeOnlyBadge(h);
  m.appendChild(h);
  homeOnlyWhy(m);
  b.appendChild(m);
  b.onclick = function(){ onPick(n); };
  return b;
}

function homeOnlyBadge(h){
  h.appendChild(el("span", "tag bad", "HOME only"));
}

function homeOnlyWhy(m){
  m.appendChild(el("div", "st",
    "It can live in HOME, but never enter Champions."));
}

export { diffChip, drawGts, gtsPickMine, gtsPickWanted };
