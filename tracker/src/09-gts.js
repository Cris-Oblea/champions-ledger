/* 09-gts.js - GTS: what may be offered, what it is worth, and the export.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import { $, C, FORMS, MEGAS_OF, STONE_OF, anyRow, bst, byName, capNote,
 cardLine, dexLabel, dexNo, el, freeSlug, labelBox, megasFor, pokeCard,
 spriteFor, statGrid, toast, typeCard, typeChip } from "./01-data.js";
import { ORIGIN_LABEL, S, boxRows, hasStone, originOf } from "./02-state.js";
import { drop, put, putNew } from "./03-store.js";
import { ask, closeSheet, fbtn, openSheet } from "./04-nav.js";
import { note } from "./13-boot.js";
/* ======================================================================= gts */
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
  add.textContent = full ? "All " + GTS_SLOTS + " slots taken"
                         : "Log an offer" +
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
    /* The history is NOT part of the open-offer list and must not share its
       early return: with nothing deposited this function used to bail before
       drawing it, so the closed trades vanished at exactly the moment you
       would go looking for them - which is what happened the first time every
       offer cleared at once (player, 2026-09-12). */
    drawGtsHistory();
    return;
  }
  /* a collision already in the data is worse than one being made now - it
     means two offers believe they hold the same Pokemon, and closing either
     one would remove a copy the other still counts on */
  var byId = {}, clash = [];
  offers.forEach(function(o){
    if (!o.offeredId) return;
    if (byId[o.offeredId]) clash.push(o.offeredId);
    byId[o.offeredId] = 1;
  });
  /* 2000 VP each, bought for a Pokemon that is not in the ledger. The app
     knew the stones and the box separately and never crossed them. */
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
  offers.forEach(function(o){
    list.appendChild(gtsRow(o._id, o));
  });
  drawGtsHistory();
}

function drawGtsHistory(){
  var wrap = $("gtsHistWrap"), host = $("listGtsHist");
  if (!wrap) return;
  var h = gtsHistory();
  wrap.hidden = !h.length;
  if (!h.length) return;
  $("nGtsHist").textContent = h.length;
  var tog = $("gtsHistToggle"), bod = $("gtsHistBody");
  if (!tog._wired) {
    tog._wired = 1;
    tog.onclick = function(){
      var open = bod.hidden;
      bod.hidden = !open;
      tog.setAttribute("aria-expanded", open ? "true" : "false");
      tog.querySelector(".foldcaret").innerHTML = open ? "&#9662;" : "&#9656;";
      try { localStorage.setItem("champ-gtshist", open ? "1" : ""); } catch (e) {}
    };
    /* a fold that forgets is a fold you reopen every visit */
    try {
      if (localStorage.getItem("champ-gtshist")) tog.onclick();
    } catch (e) {}
  }
  /* the number that turns this into pricing data rather than a diary: what
     the chips actually fetched, against what their rows said they were worth */
  var paid = h.filter(function(r){ return r.gaveValue && r.gotBst; });
  var over = paid.filter(function(r){ return r.gotBst > r.gaveBst + 20; });
  /* Collapsed, this line IS the feature - so it carries the finding rather
     than a description. Measured over every closed trade: how often a chip
     reached the ceiling its Mega line sets. 21 trades say that ceiling is
     reachable, not automatic - Beedrill hits it every time and twice beat it,
     while Chesnaught and Starmie traded at base parity instead. */
  var ceil = h.filter(function(r){ return r.gaveValue && r.gotBst; });
  var hit = ceil.filter(function(r){ return r.gotBst >= r.gaveValue - 10; });
  var mega = ceil.filter(function(r){ return r.gaveValue > r.gaveBst; });
  $("gtsHistSub").textContent = ceil.length
    ? "What the market actually paid, over " + ceil.length + " priced trades. " +
      hit.length + " reached the ceiling their Mega line sets" +
      (mega.length ? ", " + (mega.length - hit.length) + " settled at base parity instead"
                   : "") +
      " — so that ceiling is reachable, not automatic."
    : "What the market actually paid.";
  host.innerHTML = "";
  h.forEach(function(r){
    var row = el("div", "row perm");
    var m = el("div", "rmain");
    var nm = el("div", "rname");
    nm.appendChild(document.createTextNode(
      r.offered + "  →  " + r.requested));
    if (r.closed) nm.appendChild(el("span", "tag", r.closed));
    m.appendChild(nm);
    var meta = el("div", "rmeta");
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
    /* the row that will eventually price a shiny: what a shiny chip actually
       fetched, against what the same species is worth plain */
    if (r.backfilled) {
      meta.appendChild(el("span", "tag", "recovered"));
    }
    if (r.gaveShiny) {
      var prem = (r.gotBst != null && r.gaveValue != null)
        ? r.gotBst - r.gaveValue : null;
      meta.appendChild(el("span", "tag mega", "shiny chip" +
        (prem != null ? " · " + (prem > 0 ? "+" : "") + prem + " over plain" : "")));
    }
    var took = r.tookMs != null ? elapsedText(r.tookMs)
             : (r.days != null ? r.days + " days" : null);
    if (took) {
      var fast = r.tookMs != null && r.tookMs < 6 * 3600000;
      meta.appendChild(el("span", "tag " + (fast ? "ok" : ""),
        took + " to close"));
    }
    m.appendChild(meta);
    row.appendChild(m);
    host.appendChild(row);
  });
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
var DIFF_LABEL = ["", "easy", "doable", "hard", "very hard", "near impossible"];
function gtsDiff(name){
  var d = (C.GTSDIFF || {})[name];
  if (!d) return null;
  return {score:d[0], demand:d[1], supply:d[2], rank:d[3], how:d[4] || "",
          usage:d[5], size:d[6] || 0};
}
/* A rank with no denominator is half a fact - #224 means nothing until you
   know the ladder is 324 long. And an ABSENT row is not rank 324: the
   snapshot is Regulation M-B and M-C added species that have no row at all. */
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
function diffChip(name, node){
  var d = gtsDiff(name);
  if (!d) return;
  var cls = d.score >= 5 ? "bad" : d.score >= 4 ? "warn" : d.score <= 2 ? "ok" : "";
  node.appendChild(el("span", "tag " + cls,
    DIFF_LABEL[d.score] + " to get · " + ladderText(d)));
}

/* One offer, shown as the two sides of a trade rather than a line of text.
   What decides whether a GTS offer is fair here is BST tier - the player's own
   test - so both BSTs are on screen with the gap between them, instead of two
   names and a date. */
function gtsRow(i, o){
  var row = el("button", "row rental gtsrow");
  var m = el("div", "rmain");

  var head = el("div", "rname");
  head.appendChild(el("span", null, "GTS offer"));
  head.appendChild(el("span", "tag warn", o.status || "PENDING"));
  if (o.deposited) head.appendChild(el("span", "tag", o.deposited));
  m.appendChild(head);

  function side(label, name, rec){
    var box = el("div", "gtsside");
    box.appendChild(el("div", "gtslabel", label));
    /* THE PICTURE, HERE TOO. An offer is two Pokemon and it read as two names
       with a BST under each - the only list in the app that did not show what
       it was talking about (player, 2026-09-18: "las cards de gts siguen en
       formato antiguo solo mostrando unicamente BST"). It floats, so it moves
       the text aside instead of sitting on top of it in a box this narrow. */
    var p = anyRow(name);
    var sd = gtsDiff(name);
    if (!p) {
      /* a name no dex carries - it still holds its side of the trade */
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
    /* THE CARD, half-width. This side used to draw its own sprite, its own
       name line and its own BST cell - and it left out the one fact this
       screen is FOR: the Mega line. A chip is priced by its Mega's BST, which
       is the app's own rule, so a trade row that does not show it is missing
       its own argument (player, 2026-09-20). */
    var card = pokeCard(p, {
      tag: "div",
      name: name,
      shiny: !!(rec && rec.shiny),
      badges: function(nm){ if (rec) boxBadges(nm, rec); },
      meta: function(meta){
        /* Both sides (player, 2026-09-11: "beedrill en que posicion esta?").
           The ask decides whether anyone CAN give it; the chip decides whether
           anyone WANTS to. An offer needs both, so both are on screen. */
        if (sd) {
          if (label.indexOf("asked") >= 0) diffChip(name, meta);
          else meta.appendChild(el("span", "tag", "ladder " + ladderText(sd)));
        }
        /* a shiny chip is a more expensive coin than its species - say so on
           the side you are giving, where it changes what you can ask for */
        if (rec && rec.shiny && label.indexOf("asked") < 0) {
          var cvs = chipValueOf(rec);
          if (cvs) meta.appendChild(el("span", "tag mega",
            "shiny — reaches ~" + cvs.reach));
        }
      }
    });
    box.appendChild(card);
    return box;
  }

  var pair = el("div", "gtspair");
  pair.appendChild(side("You gave", o.offered,
    o.offeredId ? S.box[o.offeredId] : null));
  var arrow = el("div", "gtsarrow");
  arrow.textContent = "→";
  pair.appendChild(arrow);
  pair.appendChild(side("You asked for", o.requested, null));
  m.appendChild(pair);

  /* the player's own test for a fair GTS offer is same-tier BST, so the gap is
     worth stating rather than leaving to be worked out from two numbers */
  /* This used to compare the two BASE rows, which contradicted the app's own
     pricing rule one line below: Beedrill 395 asking Steelix 510 read as
     "+115, asking for more than you gave" when the player's measured price
     for a Beedrill is 495, its Mega's BST - a 15-point stretch, not 115. The
     verdict now prices the chip the way his closed trades did. */
  var aRec = o.offeredId ? S.box[o.offeredId] : null;
  var cv = chipValue(o.offered, !!(aRec && aRec.shiny));
  var bP = anyRow(o.requested);
  if (cv && bP) {
    var target = bst(bP);
    var diff = target - cv.reach;
    var verdict = el("div", "rmeta");
    verdict.appendChild(el("span",
      "tag " + (diff <= 20 ? "ok" : diff > 60 ? "bad" : "warn"),
      diff <= 0 ? "within its price"
        : "+" + diff + " over" + (diff <= 20 ? ", a fair stretch" : "")));
    var how = (cv.viaMega || cv.shiny || cv.demandBonus)
      ? " (" + cv.base + " base"
        + (cv.viaMega ? ", " + cv.value + " via its Mega" : "")
        + (cv.shiny ? ", +" + cv.shinyBonus + " est. shiny" : "")
        + (cv.demandBonus ? ", +" + cv.demandBonus + " est. demand" : "") + ")"
      : "";
    verdict.appendChild(el("span", null,
      "chip is worth ~" + cv.reach + how + ", asking " + target));
    if (diff > 60) {
      verdict.appendChild(el("span", null,
        "that is a tier up — it will sit unclaimed"));
    }
    m.appendChild(verdict);
  }

  /* ---- the desirability gap, which BST cannot see ----
     "nadie quiere a flamigo" (player): a chip is worth what the other side
     will take, not what its row says. Two ranks side by side is the whole
     negotiation in one line. */
  var od = gtsDiff(o.offered), rd = gtsDiff(o.requested);
  if (od && rd && od.rank != null && rd.rank != null) {
    var gap = od.rank - rd.rank;   // + means you are asking for the rarer one
    var mv = el("div", "rmeta");
    var cls2 = gap >= 120 ? "bad" : gap >= 60 ? "warn" : gap <= -40 ? "" : "ok";
    mv.appendChild(el("span", "tag " + cls2,
      "offering #" + od.rank + ", asking #" + rd.rank));
    mv.appendChild(el("span", null,
      gap >= 120 ? "a long way up — the other side wants theirs far more than yours"
      : gap >= 60 ? "asking up; it can still land, but slowly"
      : gap <= -40 ? "you are giving up the more wanted one"
      : "well matched on demand"));
    m.appendChild(mv);
  } else if (od && rd && (od.rank == null || rd.rank == null)) {
    var mv2 = el("div", "rmeta");
    mv2.appendChild(el("span", "tag warn", "no demand read"));
    mv2.appendChild(el("span", null,
      (od.rank == null ? o.offered : o.requested) +
      " is not among the " + ((od.size || rd.size) || "ranked") +
      " species the ladder tracks, so how wanted it is here is unknown — " +
      "not zero."));
    m.appendChild(mv2);
  }

  var wd = rd;
  if (wd) {
    var d2 = el("div", "gtsnote");
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
    if (bits.length) { d2.textContent = bits.join(" "); m.appendChild(d2); }
  }

  /* the deposit date was stored and never shown. An offer nobody has taken in
     over a week is not waiting - it is priced wrong. */
  var age = offerAge(o);
  if (age != null) {
    var ar = el("div", "rmeta");
    var waited = elapsedText(Date.now() - offerStart(o));
    ar.appendChild(el("span",
      "tag " + (age >= 14 ? "bad" : age >= 7 ? "warn" : ""),
      (waited || (age + " days")) + " waiting"));
    if (age >= 7) {
      ar.appendChild(el("span", null, age >= 14
        ? "two weeks unclaimed — the ask is too high for this chip"
        : "a week unclaimed — worth re-pointing at something lower"));
    }
    m.appendChild(ar);
  }
  /* the ladder moves under a standing offer: Sneasler went 23% -> 50% while
     an offer for it was sitting there. Recorded at deposit, compared now. */
  if (o.rankAtDeposit != null && rd && rd.rank != null &&
      Math.abs(o.rankAtDeposit - rd.rank) >= 8) {
    var moved = o.rankAtDeposit - rd.rank;      // + means it climbed
    var mr = el("div", "rmeta");
    mr.appendChild(el("span", "tag " + (moved > 0 ? "bad" : "ok"),
      "ladder #" + o.rankAtDeposit + " → #" + rd.rank));
    mr.appendChild(el("span", null, moved > 0
      ? "it got MORE wanted since you posted — harder now than when you asked"
      : "it cooled off since you posted — this is likelier to land now"));
    m.appendChild(mr);
  }

  if (o.note) {
    var n = el("div", "gtsnote");
    n.textContent = o.note;
    m.appendChild(n);
  }

  row.appendChild(m);
  row.onclick = function(){ gtsSheet(i, o); };
  return row;
}

/* The GTS holds THREE slots (player, 2026-09-11). Not three free ones - an
   open offer occupies one until it is taken or withdrawn, so the fourth
   deposit is not a thing the game will accept. A fixed rule, unlike the box
   capacity, which grows and therefore lives in meta.trainer. */
var GTS_SLOTS = 3;
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
var SHINY_REACH = 60;    // ESTIMATE: about one BST tier. Not measured.

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
  var d = gtsDiff(name);
  if (!d || d.rank == null) return 0;
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
  var p = anyRow(name);
  if (!p) return null;
  var base = bst(p);
  var best = base;
  megasFor(name).forEach(function(m){ best = Math.max(best, bst(m)); });
  var dem = demandReach(name);
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
  var have = {};
  boxRows("home").concat(boxRows("champions")).forEach(function(r){
    have[r.name] = 1;
    var p = byName[r.name];
    if (p && p.species) have[p.species] = 1;
  });
  var out = [];
  /* walk the Megas, not the stones: STONE_OF is keyed by Mega name, and a
     stone is only dead if NO form of its species is anywhere in the ledger */
  Object.keys(MEGAS_OF).forEach(function(sp){
    if (have[sp]) return;
    MEGAS_OF[sp].forEach(function(m){
      var st = STONE_OF[m.name];
      if (!st || !hasStone(st)) return;
      var base = byName[sp];
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
function gtsSuggest(chipName, limit, shiny){
  var v = chipValue(chipName, shiny);
  if (!v) return [];
  var owned = {};
  boxRows("home").concat(boxRows("champions")).forEach(function(r){
    owned[r.name] = 1;
    var p = byName[r.name];
    if (p && p.species) owned[p.species] = 1;
  });
  var dead = {};
  Object.keys(MEGAS_OF).forEach(function(sp){
    if (owned[sp]) return;
    MEGAS_OF[sp].forEach(function(m){
      var st = STONE_OF[m.name];
      if (st && hasStone(st)) dead[sp] = st;
    });
  });
  /* TWO bands, not one window (player, 2026-09-13): he wants the Mega reach
     kept AND recommendations around the base row, and a longer list of both.

     One window was the bug. A Mega-capable chip prices at its Mega, so
     [value - 70, reach + 20] moves UP bodily and cuts the base neighbourhood
     out: Beedrill's base is 395 and its window started at 425, so the asks most
     likely to be TAKEN - the ones near what the chip looks like on paper - were
     the ones that could never be suggested.

       reach band - at or above the chip's full price, which is the Mega's BST
                    plus the estimated premiums. What it can aim at.
       base  band - under it, down to 70 below the base row. Asking for less
                    than you could is how an offer clears the same day.

     The two are filled alternately below so a chip with a big Mega cannot bury
     the safer half under thirty reach-band targets. */
  var top = v.reach + 20;
  var floor = Math.min(v.base, v.value) - 70;
  var bands = {reach:[], base:[]};
  FORMS.forEach(function(p){
    if (owned[p.name] || owned[p.species]) return;
    var b = bst(p);
    if (b > top || b < floor) return;
    var d = gtsDiff(p.name);
    /* demand 4+ is a Pokemon people are running; it will not be handed over.
       An unknown demand is NOT a low one, so it is allowed through but never
       ranked as if it were cheap. */
    if (d && d.demand != null && d.demand >= 4) return;
    var band = b >= v.value - 25 ? "reach" : "base";
    var stone = dead[p.species];
    /* Each band is ranked against its OWN anchor, or the base band would be
       nothing but a list of near-misses sorted by how badly they miss. */
    var anchor = band === "reach" ? v.reach : v.base;
    bands[band].push({name:p.name, bst:b, spe:p.b[5], stone:stone || null,
              rank:d && d.rank, demand:d && d.demand, band:band,
              stretch:b > v.value,
              score:(stone ? 100 : 0) +
                    (d && d.demand != null ? (5 - d.demand) * 6 : 8) +
                    Math.max(0, 20 - Math.abs(anchor - b) / 3)});
  });
  function byScore(a, b){ return b.score - a.score || b.bst - a.bst; }
  bands.reach.sort(byScore);
  bands.base.sort(byScore);
  var want = limit || 14;
  var out = [];
  while (out.length < want && (bands.reach.length || bands.base.length)) {
    if (bands.reach.length) out.push(bands.reach.shift());
    if (out.length < want && bands.base.length) out.push(bands.base.shift());
  }
  return out;
}

/* How long an offer has been sitting. `deposited` was stored and never read;
   an offer nobody has taken in nine days is telling you the price is wrong. */
function offerAge(o){
  var t = offerStart(o);
  if (t == null) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}
function offerStart(o){
  if (o.depositedAt) {
    var p = Date.parse(o.depositedAt);
    if (!isNaN(p)) return p;
  }
  if (!o.deposited) return null;
  var t = Date.parse(o.deposited + "T00:00:00");
  return isNaN(t) ? null : t;
}
/* Hours matter here in a way they do not elsewhere. Indeedee is BST 475 and
   cleared in hours; Beedrill is worth 495 by the Mega rule and sat for days.
   Time-to-close measures what the other side WANTS, which is the axis BST
   cannot see - so it is reported at whatever resolution it actually has. */
function elapsedText(ms){
  if (ms == null || ms < 0) return null;
  var h = ms / 3600000;
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
    var r = S.gts[id]; r._id = id; return r;
  });
}
function gtsHistory(){
  return gtsRows().filter(function(r){ return r.closed; })
    .sort(function(a, b){
      return String(b.closedAt || b.closed || "")
        .localeCompare(String(a.closedAt || a.closed || ""));
    });
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
   the copy is still there until the trade actually closes. */
function lastCopyOf(rec){
  if (!rec) return false;
  if (!byName[rec.name]) return false;          // not in the dex: free to trade
  var n = 0;
  boxRows("home").concat(boxRows("champions")).forEach(function(r){
    if (r.name === rec.name) n++;
  });
  return n <= 1;
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
  var p = byName[rec.name];
  if (!p || !p.species) return [];
  var out = {};
  boxRows("home").concat(boxRows("champions")).forEach(function(r){
    if (r.name === rec.name) return;
    var q = byName[r.name];
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
  var hit = null;
  gtsOffers().forEach(function(o){
    if (o._id !== exceptId && o.offeredId === d.offeredId) hit = o;
  });
  return hit;
}
/* A field you tap rather than type into. A typed name is a typo waiting to
   happen, and a typo here is not cosmetic: closing the trade matches the
   deposited Pokemon by name to know which one to remove. */
/* Everything that distinguishes one copy from another, in one place: the box
   list and the GTS picker both call it, so a mark added here shows up in both. */
function boxBadges(node, rec){
  if (rec.shiny) {
    var sh = el("span", "tag", "shiny");
    sh.style.borderColor = "var(--warn)";
    sh.style.color = "var(--warn)";
    node.appendChild(sh);
  }
  if (rec.trained) node.appendChild(el("span", "tag ok", "trained"));
  if (rec.status === "rental") node.appendChild(el("span", "tag warn", "rental"));
  else if (rec.location === "champions") {
    var o = originOf(rec);
    node.appendChild(el("span", "tag" + (o === "home" ? " ok" : ""),
                        ORIGIN_LABEL[o]));
  }
  return node;
}

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
  /* THE SAME CARD AS EVERYWHERE ELSE - a Pokemon should not look like two
     different things on two screens. BST is the whole argument on this screen,
     since equivalence in a GTS deposit is the BST tier, and the card puts it
     in a cell of its own. */
  var p = anyRow(current);
  var b;
  if (p) {
    b = pokeCard(p, {
      cls: rec ? (rec.location === "home" ? "home" : "perm") : "",
      name: current,
      shiny: !!(rec && rec.shiny),
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

/* The Pokemon you can deposit are the ones you actually hold, so the list is
   the box itself - and it carries the box id, not just the name, so three
   Chesnaught stay three distinguishable Chesnaught. */
/* `exceptId` is the offer being EDITED - its own current pick has to stay
   selectable or re-saving that offer would be impossible. Every other open
   offer's Pokemon is physically sitting in a GTS slot and cannot be in two.
   It is the row's id since migration 7; it used to be a position in an array,
   which is a fragile thing to identify a trade by. */
function gtsPickMine(onPick, exceptId){
  /* one Pokemon, one GTS slot (player, 2026-09-11): "no debería dejarme
     elegir el mismo pokemon". A committed copy is shown, greyed, with what it
     is already waiting for - hiding it would just look like it went missing. */
  var taken = {};
  gtsOffers().forEach(function(o){
    if (o._id !== exceptId && o.offeredId) taken[o.offeredId] = o;
  });
  openSheet("Which one are you depositing?", function(body){
    /* A Champions-ORIGIN Pokemon can never leave the game, so it can never
       reach a GTS box - offering one is not a bad idea, it is impossible
       (player, 2026-09-12). The section note here already said so; the filter
       did not, and listed all 40 rows of a box that is entirely Champions
       origin. Rentals are Champions origin by definition, so originOf() drops
       them with the rest, and so does a leftover "unknown" - which is counted
       as Champions origin everywhere else, and is the safe way round: offering
       something you cannot move is a dead end, hiding something you could move
       is one question away. */
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
    /* The box is under a hundred today and scrolling works. It will not stay
       that way, and scrolling a thousand rows to find one Chesnaught is not a
       thing to discover later. */
    var wrap = el("div", "search field");
    wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    var inp = el("input");
    inp.type = "text";
    inp.placeholder = "Filter " + (home.length + champ.length) +
      " in your box - name, type or number";
    wrap.appendChild(inp);
    body.appendChild(wrap);

    /* SORTING AND TWO FILTERS, BECAUSE THIS IS A SHORTLIST, NOT A BOX.
       What goes into a GTS box is decided by his own rule - only DUPLICATES
       and species Champions cannot use may be offered - so those two are the
       question this screen exists to answer, and both were left to be found
       by eye down a hundred rows (player, 2026-09-18: "seria muy interesante
       que el listado tuviese orden por dex number o filtro de pokemones
       duplicados o pokemones con tag not in champions, para asi llegar a
       tener la informacion mas rapida de que podria intercambiar primero").

       Dex order is the default because that is the order HOME itself lists in,
       which is how one screen gets checked against the other. */
    var PICK = {sort: "dex", dupes: false, outside: false};
    var sortWrap = el("div", "toggles");
    [["dex", "Dex no."], ["az", "A-Z"], ["bst", "BST"],
     ["reach", "What it can ask"]].forEach(function(o){
      var t = el("button", "tog", o[1]);
      t.setAttribute("aria-pressed", PICK.sort === o[0] ? "true" : "false");
      t.onclick = function(){
        PICK.sort = o[0];
        [].forEach.call(sortWrap.children, function(c){
          c.setAttribute("aria-pressed", c === t ? "true" : "false");
        });
        draw();
      };
      sortWrap.appendChild(t);
    });
    body.appendChild(sortWrap);

    var filtWrap = el("div", "toggles");
    [["dupes", "Duplicates only", "You hold more than one of this species - " +
      "the Species Clause means a second copy can never share a team with the " +
      "first, so it is pure trade material."],
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

    var out = el("div");
    body.appendChild(out);

    /* how many of this species are anywhere in either box - the count the
       duplicate filter asks about, over the WHOLE ledger and not the section */
    var copies = {};
    home.concat(champAll).forEach(function(r){
      copies[r.name] = (copies[r.name] || 0) + 1;
    });

    function matches(r, q){
      if (PICK.dupes && (copies[r.name] || 0) < 2) return false;
      if (PICK.outside && byName[r.name]) return false;
      if (!q) return true;
      if (r.name.toLowerCase().indexOf(q) >= 0) return true;
      if (String(dexNo(r.name)).indexOf(q) >= 0) return true;
      var p = anyRow(r.name);
      if (p && p.types.join(" ").toLowerCase().indexOf(q) >= 0) return true;
      if (q === "shiny" && r.shiny) return true;
      if (q === "trained" && r.trained) return true;
      return false;
    }

    function orderOf(r){
      var p = anyRow(r.name);
      if (PICK.sort === "az") return r.name;
      if (PICK.sort === "bst") return -(p ? bst(p) : 0);
      if (PICK.sort === "reach") {
        var cv = chipValueOf(r);
        return -(cv ? cv.reach : 0);
      }
      return dexNo(r.name);
    }
    function section(title, all, note, q){
      var rows = all.filter(function(r){ return matches(r, q); });
      if (!rows.length) return 0;
      rows.sort(function(a, b){
        var x = orderOf(a), y = orderOf(b);
        return x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
      });
      out.appendChild(el("h2", null, title));
      if (note) out.appendChild(el("p", "sub", note));
      var l = el("div", "list cards");
      /* the copy count is over the WHOLE set, not the filtered one: "copy 2 of
         2" has to mean the same thing whether or not you typed anything */
      var seen = {}, nth = {};
      all.forEach(function(r){ seen[r.name] = (seen[r.name] || 0) + 1; });
      all.forEach(function(r){
        nth[r._id] = (nth[r.name + "#"] = (nth[r.name + "#"] || 0) + 1);
      });
      rows.forEach(function(r){
        var p = anyRow(r.name);
        var held = taken[r._id];
        var last = !held && lastCopyOf(r);
        var kin = last ? otherFormsOf(r) : [];
        var cd = p && gtsDiff(r.name);
        var cv = p && chipValueOf(r);
        var m = null;
        /* THE SAME CARD AS EVERY OTHER LIST IN THE APP, and the same
           function now: it wears its type, its picture - its own colours if
           the copy is shiny - its Mega line and its six stats, because this
           was a bare row with a BST and a Speed on it and that is not enough
           to choose what to give away (player, 2026-09-18: "solo muestra bst
           y speed, pero falta todo lo demas"). */
        var b = pokeCard(p || anyRow(r.name) || {name:r.name, types:[], b:[0,0,0,0,0,0], ab:[]}, {
          cls: held ? "illegal" : r.location === "home" ? "home" : "perm",
          name: r.name,
          shiny: !!r.shiny,
          badges: function(h){
            if (held) h.appendChild(el("span", "tag bad", "already in the GTS"));
            if (last) h.appendChild(el("span", "tag " + (kin.length ? "" : "warn"),
              kin.length ? "only one of this form" : "your only one"));
            if (seen[r.name] > 1)
              h.appendChild(el("span", "tag", "copy " + nth[r._id] + " of " +
                seen[r.name]));
            /* "copy 1 of 2" does not say WHICH one. The marks do - that is the
               whole reason they exist, and this is where the choice is made. */
            boxBadges(h, r);
          },
          meta: function(meta){
            /* The ladder belongs on THIS side of the trade too (player,
               2026-09-13). It was only ever shown for the Pokemon being asked
               for, which answers "can I get it" and says nothing about the
               half he controls: how fast his own chip clears, and how high it
               can therefore ask. */
            if (cd) meta.appendChild(el("span", "tag" + (cd.demand >= 4 ? " ok" : ""),
              "ladder " + ladderText(cd)));
            else if (p) meta.appendChild(el("span", "tag warn", "no ladder row"));
            if (cv && cv.reach > cv.base)
              meta.appendChild(el("span", "mono", "asks up to ~" + cv.reach));
            if (r.note) meta.appendChild(el("span", null, String(r.note).slice(0, 40)));
          },
          notes: function(body2){ m = body2; }
        });
        if (held) { b.disabled = true; b.style.opacity = "0.55"; }
        /* Only when the price is above the base row, and it says WHICH part is
           measured: the Mega half comes from his own closed trades, the other
           two are estimates. */
        if (cv && cv.reach > cv.base && !held) {
          var why = "Base " + cv.base;
          if (cv.viaMega) why += ", but a chip fetches its Mega's " + cv.value;
          if (cv.demandBonus) why += " · +" + cv.demandBonus +
            " because the ladder wants it (estimate)";
          if (cv.shinyBonus) why += " · +" + cv.shinyBonus + " shiny (estimate)";
          m.appendChild(el("div", "st", why + "."));
        }
        if (last) {
          m.appendChild(el("div", "st", kin.length
            ? "The only " + r.name + " you have, but you still hold " +
              kin.join(", ") + ". Which form to keep is your call — the Male "
              + "Indeedee went this way and the Female was the keeper."
            : "The only " + r.name + " you have, and no other form of it. " +
              "Trading it loses the species — your rule is to keep one of " +
              "everything Champions allows."));
        }
        if (held) {
          m.appendChild(el("div", "st", "Deposited" +
            (held.deposited ? " " + held.deposited : "") + ", waiting for " +
            (held.requested || "something") +
            ". Withdraw that offer first to free this copy."));
        }
        if (!held) b.onclick = function(){ onPick(r); };
        l.appendChild(b);
      });
      out.appendChild(l);
      return rows.length;
    }

    function draw(){
      var q = inp.value.trim().toLowerCase();
      out.innerHTML = "";
      var n = section("In HOME", home, "A GTS deposit comes out of HOME.", q);
      n += section("In the Champions Box", champ,
        "These came in from HOME, so they can go back to it — park one to " +
        "HOME first, then deposit it. Its training comes back with it.", q);
      if (!n) {
        out.appendChild(el("div", "empty",
          PICK.dupes || PICK.outside
            ? "Nothing you can deposit is " +
              (PICK.dupes && PICK.outside
                ? "both a duplicate and outside the Champions dex"
                : PICK.dupes ? "a duplicate" : "outside the Champions dex") +
              (inp.value.trim() ? " and matches “" +
                inp.value.trim() + "”" : "")
            : "Nothing you can deposit matches “" +
              inp.value.trim() + "”"));
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
    inp.oninput = draw;
    draw();
    setTimeout(function(){ inp.focus(); }, 60);
  }, []);
}

/* What you asked for can be anything that exists, so the list is the whole
   dex plus everything HOME can hold that Champions cannot. */
function gtsPickWanted(onPick, chipName, chipShiny){
  openSheet("What did you ask for?", function(body){
    /* Judging a choice you already made is the easy half. This is the half
       that matters: given the chip, what can it actually fetch? Same
       reasoning that produced Abomasnow and Steelix by hand on 2026-09-11 -
       price by the Mega, skip anything the ladder is running, and put a
       stone you already own with nothing to hold it at the top. */
    if (chipName) {
      var v = chipValue(chipName, chipShiny);
      var picks = gtsSuggest(chipName, 14, chipShiny);
      if (v) {
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
      if (picks.length) {
        /* Two sections, because the two bands answer different questions:
           what this chip can REACH, and what it can reach that someone will
           actually take today. */
        /* THE SAME CARD AS EVERY OTHER LIST. This was a name, a BST and a
           Speed - the half of the trade you are choosing blind (player,
           2026-09-20). The two loose numbers are gone because the card
           carries all six of them, and the Mega line with them: what a chip
           can fetch is mostly a question about the target Mega. */
        function pickRow(c){
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
          if (c.stone) {
            m2.appendChild(el("div", "st",
              "You bought " + c.stone + " and have nothing to put it on — " +
              "2000 VP that starts working the moment this lands."));
          } else if (c.stretch) {
            /* Say which premium put it in range, and that the premium is an
               estimate - the Mega half is measured, these two are not. */
            var lift = [];
            if (v.shinyBonus) lift.push("it is shiny (+" + v.shinyBonus + ")");
            if (v.demandBonus) lift.push("the ladder wants your chip (+" +
              v.demandBonus + ")");
            m2.appendChild(el("div", "st",
              "Above the chip's own " + v.value +
              (lift.length ? " — in range because " + lift.join(" and ") +
                             ", which is the estimated half of the price."
                           : " — a stretch, but the kind that lands.")));
          } else if (c.band === "base") {
            m2.appendChild(el("div", "st",
              "Under the " + v.value + " this chip could ask" +
              (v.viaMega ? ", nearer its base row of " + v.base : "") +
              " — asking for less than you could is what makes an offer clear " +
              "the same day."));
          }
          return b2;
        }
        function pickList(title, sub, rows){
          if (!rows.length) return;
          body.appendChild(el("h2", null, title));
          if (sub) body.appendChild(el("p", "sub", sub));
          var sl = el("div", "list cards");
          rows.forEach(function(c){
            var r2 = pickRow(c);
            if (r2) sl.appendChild(r2);
          });
          body.appendChild(sl);
        }
        pickList("Worth asking for",
          "At or above what the chip is worth — " + v.value +
          (v.reach > v.value ? ", up to about " + v.reach + " with the estimated "
                             + "premiums" : "") + ".",
          picks.filter(function(c){ return c.band === "reach"; }));
        pickList("Safer asks",
          "Below its price" + (v.viaMega ? ", around the base row of " + v.base
                                         : "") + ". Less than the chip could " +
          "fetch, and far more likely to be taken.",
          picks.filter(function(c){ return c.band === "base"; }));
        body.appendChild(el("h2", null, "Or anything else"));
      }
    }
    var wrap = el("div", "search field");
    wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    var inp = el("input");
    inp.type = "text";
    inp.placeholder = "Search any Pokemon";
    wrap.appendChild(inp);
    body.appendChild(wrap);
    var list = el("div", "list cards");
    body.appendChild(list);
    function draw(){
      var q = inp.value.trim().toLowerCase();
      list.innerHTML = "";
      var pool = FORMS.filter(function(p){
        return !q || p.name.toLowerCase().indexOf(q) >= 0;
      });
      var hits = pool.slice(0, 120);
      hits.forEach(function(p){
        list.appendChild(pokeCard(p, {
          /* the difficulty belongs HERE most of all - the moment to find out
             an ask is hopeless is before depositing, not weeks later */
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
        }));
      });
      if (q) {
        var homeAll = (C.HOME_ONLY || []).filter(function(n){
          return n.toLowerCase().indexOf(q) >= 0;
        });
        homeAll.slice(0, 40).forEach(function(n){
          /* A species Champions has never heard of still gets a card: the
             numbers come from PokeAPI and the tag says which dex they are.
             Asking for one is a real decision - it is how a HOME shelf gets
             filled - and it was the one row in the app with nothing on it but
             a name. */
          var op = anyRow(n), b;
          var badge = function(h){
            h.appendChild(el("span", "tag bad", "HOME only"));
          };
          var why = function(m){
            m.appendChild(el("div", "st",
              "It can live in HOME, but never enter Champions."));
          };
          if (op) {
            b = pokeCard(op, {cls:"illegal", name:n, badges:badge, notes:why,
                              onclick:function(){ onPick(n); }});
          } else {
            b = el("button", "row illegal");
            var m = el("div", "rmain");
            var h = el("div", "rname");
            h.appendChild(document.createTextNode(n));
            badge(h);
            m.appendChild(h);
            why(m);
            b.appendChild(m);
            b.onclick = function(){ onPick(n); };
          }
          list.appendChild(b);
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
    inp.oninput = draw;
    draw();
    setTimeout(function(){ inp.focus(); }, 60);
  }, []);
}

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
  var d = JSON.parse(JSON.stringify(o));
  openSheet(id == null ? "Log a GTS offer" : "GTS offer", function(body){
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
           !!(d.offeredId && S.box[d.offeredId] && S.box[d.offeredId].shiny));
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
    if ((d.note || "").length > 200) ta.style.minHeight = "180px";
    ta.oninput = function(){ d.note = ta.value; };
    w.appendChild(ta);
    body.appendChild(w);
    body.appendChild(el("div", "note",
      "Depositing is not a trade. The offered Pokemon is still yours and can be " +
      "withdrawn — but it is parked, so it cannot be sent to Champions while " +
      "it sits there."));
  }, [
    id != null ? fbtn("Save changes", "primary", function(){
      if (!d.offered || !d.requested) { toast("Both sides are needed"); return; }
      var cl = gtsClash(d, id);
      if (cl) { toast("That copy is already in the GTS, waiting for " +
                      (cl.requested || "something")); return; }
      /* ONE row. This used to rewrite both arrays of the document, so an edit
         made here carried every open offer and every closed trade with it,
         from this device's copy of them. */
      put("gts/" + id, d).then(function(){
        closeSheet(); toast("Offer updated");
      });
    }) : null,
    id != null ? fbtn("Trade went through", "danger", function(){
      /* A trade is an EXCHANGE: the Pokemon you deposited is gone the moment
         someone takes it, so it has to leave the box as the new one arrives.
         Adding without removing left a Chesnaught behind that no longer
         existed. Player, 2026-09-09. */
      /* the offer records WHICH copy was deposited, so a box with three
         Chesnaught loses the right one. Offers logged before that was stored
         fall back to the first match by name. */
      var going = null;
      if (d.offeredId && S.box[d.offeredId]) {
        going = S.box[d.offeredId];
        going._id = d.offeredId;
      }
      var mine = boxRows("home").concat(boxRows("champions"))
        .filter(function(r){ return r.name === d.offered; });
      if (!going) going = mine[0];
      var msg = going
        ? "Trade done: " + d.offered + " leaves the box and " + d.requested +
          " arrives in HOME." +
          (mine.length > 1 && !d.offeredId
            ? "  You have " + mine.length + " " + d.offered +
              " - the first one is the one being removed." : "")
        : d.offered + " is not in the box any more, so only " + d.requested +
          " will be added.";
      ask("Close this trade?", msg, "Trade done").then(function(ok){
        if (ok) closeTrade();
      });
      function closeTrade(){

      /* The offer is not deleted and re-filed - it is the same trade, and
         closing it writes the ending onto the row it already has. */
      /* A completed trade is the only hard evidence of what the market pays,
         and it was being thrown away. The player's own pricing rule - that a
         chip fetches its MEGA's BST, not its base - came from remembering
         five of these. Kept, they become data. */
      var offRec = d.offeredId ? S.box[d.offeredId] : null;
      var wasShiny = !!(offRec && offRec.shiny);
      var vOff = chipValue(d.offered, wasShiny), vGot = chipValue(d.requested);
      var done = Object.assign({}, d, {
        closed:new Date().toISOString().slice(0, 10),
        closedAt:new Date().toISOString(),
        days:offerAge(d),
        /* the number that ranks demand better than BST does */
        tookMs:(d.depositedAt ? (Date.now() - Date.parse(d.depositedAt)) : null),
        gaveShiny:wasShiny,
        gaveBst:vOff && vOff.base, gaveValue:vOff && vOff.value,
        gotBst:vGot && vGot.base,
        rankAtDeposit:d.rankAtDeposit != null ? d.rankAtDeposit : null});
      /* `history.slice(0, 60)` used to live on this line, so the 61st closed
         trade deleted the oldest. A closed trade is the only hard evidence of
         what the market pays and the pricing rule is derived from them, so the
         cap went with the array. */
      put("gts/" + id, done).then(function(){
        var id = freeSlug(d.requested, S.box);
        // it came in by trade, so it is HOME origin and the slot stays elastic
        return put("box/" + id, {name:d.requested, location:"home",
          status:"permanent", origin:"home",
          note:"GTS for " + d.offered + ", " + (d.deposited || ""),
          order:Object.keys(S.box).length});
      }).then(function(){
        return going ? drop("box/" + going._id) : null;
      }).then(function(){
        closeSheet();
        toast(going ? d.offered + " out, " + d.requested + " in"
                    : d.requested + " is in HOME");
      });
      }
    }) : fbtn("Log it", "primary", function(){
      if (!d.offered || !d.requested) { toast("Both names are needed"); return; }
      if (!gtsFree()) {
        toast("All " + GTS_SLOTS + " GTS slots are taken — withdraw one first");
        return;
      }
      /* Confirm, not block: it is his box and he may well have a reason - the
         one time this happened he gave a #28 and got a #2. But it has to be a
         decision taken, not something noticed afterwards. */
      /* only the hard case stops you: no other form of the species anywhere.
         When a sibling form is in the box the picker has already said so, and
         choosing between forms is his call, not the app's. */
      var lastRec = d.offeredId ? S.box[d.offeredId] : null;
      if (lastCopyOf(lastRec) && !otherFormsOf(lastRec).length) {
        ask("Your only " + d.offered + "?",
            "It is in the Champions dex, so trading it means losing the "
            + "species for good — your own rule is to keep one of everything "
            + "Champions allows.", "Offer it anyway", true)
          .then(function(ok){ if (ok) logIt(); });
        return;
      }
      logIt();

      function logIt(){
      /* stamp what the ladder said TODAY, so a later reading can tell you the
         target moved rather than silently comparing against nothing */
      var rdNow = gtsDiff(d.requested);
      if (rdNow && rdNow.rank != null) d.rankAtDeposit = rdNow.rank;
      /* an offer edited before logging keeps the moment it is actually posted */
      if (!d.depositedAt) d.depositedAt = new Date().toISOString();
      var cl2 = gtsClash(d, null);
      if (cl2) { toast("That copy is already in the GTS, waiting for " +
                       (cl2.requested || "something")); return; }
      /* A NEW row asks the database for a free id rather than guessing from
         what this device has loaded, the same way a build does - beedrill,
         beedrill-2 - so two devices logging at once cannot both pick one. */
      var stem = String(d.offered).toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "offer";
      putNew("gts", stem, d).then(function(){
        closeSheet(); toast("Offer logged");
      });
      }
    }),
    /* NOT danger. Withdrawing a deposit takes your own Pokemon back and loses
       nothing - you can re-log the offer in a second. Red is reserved for the
       things that end something, and painting it red here made the only
       reversible button on the sheet look like the scary one, while "Trade
       went through" - which really does delete a Pokemon from the box - sat
       there in plain grey. Player caught the layout side of this 2026-09-11. */
    id != null ? fbtn("Withdrew it", "", function(){
      /* This carried a warning that a put() omitting `history` would erase
         every closed trade on record, because the two lived in one document.
         Withdrawing deletes one row now, and there is nothing else on it. */
      drop("gts/" + id).then(function(){
        closeSheet(); toast("Offer removed");
      });
    }) : fbtn("Cancel", "", closeSheet)
  ]);
}
$("gtsAdd").onclick = function(){
  if (!gtsFree()) {
    toast("All " + GTS_SLOTS + " GTS slots are taken — withdraw one first");
    return;
  }
  gtsSheet(null, null);
};

/* ==================================================================== export */
function csv(rows){
  return rows.map(function(r){
    return r.map(function(v){
      v = v == null ? "" : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(",");
  }).join("\r\n");
}
function offer(filename, text){
  if (!window.__dl) {
    // no download capability: show it so nothing is trapped
    openSheet(filename, function(body){
      var ta = el("textarea");
      ta.value = text; ta.style.minHeight = "48vh";
      ta.readOnly = true;
      body.appendChild(el("p", "sub", "Copy this out — saving files is not available in this view."));
      body.appendChild(ta);
      setTimeout(function(){ ta.select(); }, 60);
    }, [fbtn("Done", "primary", closeSheet)]);
    return;
  }
  window.__dl.save({filename:filename, data:text}).then(function(){
    toast("Saved " + filename);
  }, function(e){
    if (e && e.code !== "cancelled") toast("Could not save the file");
  });
}
document.querySelectorAll("[data-export]").forEach(function(b){
  b.onclick = function(){
    var k = b.dataset.export;
    if (k === "box-csv") {
      var rows = [["name","location","status","types","bst","note"]];
      ["champions","home"].forEach(function(loc){
        boxRows(loc).forEach(function(r){
          /* anyRow: an exported box should carry the HOME-only rows'
             numbers too, not a pair of empty columns */
          var p = anyRow(r.name);
          rows.push([r.name, loc, r.status, p ? p.types.join("/") : "",
                     p ? bst(p) : "", r.note || ""]);
        });
      });
      offer("champions-box.csv", csv(rows));
    } else if (k === "builds-csv") {
      var rows2 = [["pokemon","mega","ability","nature","hp","atk","def","spa",
                    "spd","spe","sp_total","move1","move2","move3","move4","role"]];
      Object.keys(S.builds).sort().forEach(function(id){
        var b2 = S.builds[id], sp = b2.stat_points || {}, mv = b2.moves || [];
        rows2.push([b2.pokemon, b2.mega || "", b2.ability || "", b2.nature || "",
          sp.hp||0, sp.atk||0, sp.def||0, sp.spa||0, sp.spd||0, sp.spe||0,
          spTotal(sp), mv[0]||"", mv[1]||"", mv[2]||"", mv[3]||"", b2.role||""]);
      });
      offer("champions-builds.csv", csv(rows2));
    } else {
      offer("champions-ledger.json", JSON.stringify(
        {box:S.box, builds:S.builds, teams:S.teams, meta:S.meta}, null, 2));
    }
  };
});

/* ------------------------------------------------------- what leaves here --
   The biggest part in the app and the smallest surface: a drawing, the badges
   05-box puts on a row, and two pickers for PUBLIC - the browser tests use
   `gtsPickMine` to assert that only what can actually leave the game is ever
   offered, and `gtsPickWanted` to assert that a chip Champions has never heard
   of still gets a price and therefore still gets recommendations.

   Everything that decides what a chip is WORTH stays in here: chipValue and
   its three axes, the shiny and demand premiums, the difficulty chips, the
   history and what counts as the last copy of a form. Those rules are argued
   in one file, and now they can only be argued in one file.
*/
export { boxBadges, diffChip, drawGts, gtsDiff, gtsPickMine, gtsPickWanted };
