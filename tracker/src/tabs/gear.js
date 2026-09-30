/* The Items tab: Mega Stones, held items and the status reference.

   setItem is the only write for an item, which is what keeps the Item
   Clause honest: the team picker greys out what another slot holds, and
   that is only true if nothing else can set one. */
import { byName, C } from "../core/data.js";
import { $, el, toast } from "../core/dom.js";
import {
  hasStone, ownedItems, ownedNames, ownedStones,
} from "../core/state.js";
import { drop, put } from "../core/store.js";
import { effectLine, numText, pokeFacts } from "../ui/card.js";

/* ====================================================================== gear */
function drawStones(){
  var q = ($("stoneSearch").value || "").trim().toLowerCase();
  var own = ownedNames();
  var o = $("listStonesOwned"), n = $("listStonesNot");
  o.innerHTML = ""; n.innerHTML = "";
  var co = 0, cn = 0;
  C.STONES.forEach(function(r){
    var stone = r[0], mega = r[1], species = r[2];
    if (q && !(stone + " " + mega).toLowerCase().includes(q)) return;
    var have = hasStone(stone);
    var inBox = species in own;
    var row = el("button", "row " + (have ? "perm" : ""));
    var m = el("div", "rmain");
    var h = el("div", "rname");
    h.appendChild(document.createTextNode(stone));
    if (!inBox) h.appendChild(el("span", "tag", "no " + species + " in the box"));
    m.appendChild(h);
    var mp = byName[mega];
    if (mp) {
      /* THE MEGA'S OWN FACTS, drawn by the same function as every card and
         the sheet. A stone row is ABOUT a Pokemon - the one the stone
         creates - and it was the last place still writing its own BST cell
         and ability cell, with no stat table at all. Which is the question
         this screen exists to answer: is this 2000 VP worth it. */
      pokeFacts(m, mp, [], {
        dex: false,
        abLabel: "Mega ability",
        meta: function(meta){ meta.appendChild(el("span", null, mega)); }
      });
    } else {
      var meta = el("div", "rmeta");
      meta.appendChild(el("span", null, mega));
      m.appendChild(meta);
    }
    row.appendChild(m);
    var side = el("div", "rside");
    side.appendChild(el("span", "tag " + (have ? "mega" : "warn"),
      have ? "owned" : "2000 VP"));
    row.appendChild(side);
    row.onclick = function(){ toggleStone(stone); };
    if (have) { o.appendChild(row); co++; } else { n.appendChild(row); cn++; }
  });
  $("nStones").textContent = co;
  $("nStonesNot").textContent = cn;
  if (!co) o.appendChild(el("div", "empty", "No stones owned"));
  var dead = ownedStones().filter(function(s){
    var row = C.STONES.find(function(r){ return r[0] === s; });
    return row && !(row[2] in own);
  });
  $("stoneNote").innerHTML = "<strong>" + ownedStones().length + " of " +
    C.STONES.length + " stones.</strong> " +
    (dead.length ? dead.length + " unlock a Mega whose species is not in the box — " +
      "dead weight until it arrives: " + dead.join(", ") + "."
     : "Every stone you own has its species in the box.");
}
/* One row, one stone (migration 6). This used to rewrite the entire owned
   list from this device's copy of it, so a stone marked on the other device
   while this one was asleep was quietly dropped on the next toggle. Now
   marking is an insert of that stone and unmarking a delete of it, and no
   other stone is touched by either. */
function toggleStone(stone){
  var have = hasStone(stone);
  (have ? drop("stones/" + stone) : put("stones/" + stone, {}))
    .then(function(){
      toast(have ? stone + " removed" : stone + " owned");
    });
}

/* Items, the way the game groups them: Hold Items, Berries, Miscellaneous -
   the three tables Serebii lays the page out with, which is where the
   categories come from rather than a set invented here. Mega Stones are the
   fourth and keep their own pane.

   This used to be two rows of toggle buttons: the ones you own, and a search
   that asked prompt() for a made-up "shop category" before it would record
   anything. You could see 118 item NAMES and never what any of them did. It
   reads like the stone list now - a row per item, what it does, what it
   costs, and whether you have it. */

var ITEM_CATS = ["Hold Items", "Berries", "Miscellaneous"];

function drawItems(){
  /* No activeElement guard here. The old pane kept its search box INSIDE this
     container, so a redraw mid-keystroke would have stolen focus and one was
     needed. The rows are buttons now: clicking one leaves it focused inside
     the container, so that same guard swallowed the redraw and an item you
     had just ticked did not change until you left the tab. The search box
     lives outside the container now, so nothing here needs protecting. */
  var pane = $("itemCats");
  pane.innerHTML = "";
  var q = ($("itemSearch")?.value || "").trim().toLowerCase();
  var own = ownedItems();
  var nOwn = 0, nTot = 0;

  ITEM_CATS.forEach(function(cat){
    var rows = C.ITEMS.filter(function(r){ return (r[2] || "Miscellaneous") === cat; });
    nTot += rows.length;
    rows.forEach(function(r){ if (own[r[0]]) nOwn++; });
    var hits = rows.filter(function(r){
      return !q || (r[0] + " " + (r[3] || "")).toLowerCase().includes(q);
    });
    if (!hits.length) return;
    var have = hits.filter(function(r){ return own[r[0]]; }).length;
    var h = el("h2", null, cat + " ");
    h.appendChild(el("span", "n", have + "/" + hits.length));
    pane.appendChild(h);
    /* Items are a list you PICK FROM, 118 of them: a grid is the shape of
       that, not a column six screens long. */
    var list = el("div", "list cards");
    /* owned first, then by name - the same order the stone list reads in */
    hits.sort(function(x, y){
      return (own[y[0]] ? 1 : 0) - (own[x[0]] ? 1 : 0) ||
             x[0].localeCompare(y[0]);
    });
    hits.forEach(function(r){ list.appendChild(itemRow(r, !!own[r[0]])); });
    pane.appendChild(list);
  });
  if (!pane.children.length)
    pane.appendChild(el("div", "empty", "Nothing matches"));
  $("itemNote").innerHTML = "<strong>" + nOwn + " of " + nTot +
    " items recorded.</strong> One item per Pokemon per team — six Pokemon " +
    "can field exactly one Sitrus Berry, so an item is a team decision, not " +
    "part of a build.";
}

function itemRow(r, have){
  var name = r[0], vp = r[1], effect = r[3] || "", src = r[4] || "",
      from = r[5] || "";
  /* THE SAME CARD, without a type - an item has none. It gets the shape and
     the padding so a grid of items reads like every other grid in the app;
     the band falls back to the neutral line colour, which is honest: there is
     no type here to colour it with. */
  var row = el("button", "row card " + (have ? "perm" : ""));
  var m = el("div", "rmain");
  var h = el("div", "rname");
  h.appendChild(document.createTextNode(name));
  m.appendChild(h);
  if (effect) m.appendChild(numText(effect, "div", "st"));
  /* The description is Smogon's Champions text and states its own numbers,
     marked in colour - Leftovers' 1/16 is in the sentence now, not in a chip
     beside it. This line only appears when the engine measured something the
     sentence does NOT say (effect_chips.py rule 6), which today is nothing. */
  var num = effectLine(name);
  if (num) m.appendChild(num);
  /* what this item is FOR: the move and the ability it serves, together.
     Heat Rock extends the sun, so it belongs to Sunny Day and to Drought -
     naming only the move would miss the half that actually sets the weather
     on most teams. */
  var why = r[6], abl = r[7] || [], mvs = r[8] || [];
  if (why) {
    var w = el("div", "st c-accent");
    w.textContent = why + (mvs.length || abl.length
      ? " — " + mvs.concat(abl).join(", ") : "");
    m.appendChild(w);
  }
  row.appendChild(m);
  var side = el("div", "rside");
  var tag = el("span", "tag " + (have ? "mega" : "warn"),
    have ? "owned" : priceLabel(vp, src));
  /* where the number came from, because Serebii has no price for 20 of these
     and pokebase's own table is what filled them in */
  if (vp) tag.title = from === "pokebase"
    ? "Price from pokebase - Serebii prints this one as '??? VP'"
    : "Price from Serebii";
  side.appendChild(tag);
  row.appendChild(side);
  row.onclick = function(){ setItem(name, !have); };
  return row;
}
/* Serebii prints "??? VP" for a shop item whose price it does not have, and
   a plain source for anything that is not sold. Neither is a price, and
   neither gets turned into one here. */
/* Only reached when neither source has a price, which now means the item is
   not sold at all: a reward, a ticket, or something the account starts with.
   The slot says which, rather than pretending there is a number. */
function priceLabel(vp, src){ return vp ? vp + " VP" : priceless(src); }
function priceless(src){
  var s = (src || "").replace(/^Shop\s*/, "").replace(/\?\?\?\s*VP/, "").trim();
  if (!s || s === "-") return "not sold";
  /* Not truncated. 24 characters cut "Received from ..." mid-word, and where
     an item comes from is the whole content of this line. */
  return s;
}

/* ------------------------------------------------------------- statuses ---
   The fourth thing that decides a turn, and the app said nothing about it.
   Champions rebalanced three: paralysis loses the turn 12.5% of the time here,
   not 25%; freeze thaws at 25% and only on a turn it tries to move; sleep
   wakes on a schedule instead of a 2-4 turn roll.

   Every number carries where it came from, because they do not all come from
   the same place: `serebii` is Champions' own rebalance page, `measured` was
   run through Smogon's Champions engine, and `main_series` is the other games'
   value, kept only where no Champions source states one - shown as unconfirmed
   rather than quietly presented as fact. */
var STAT_LABELS = {
  speed: "Speed", skip_turn: "loses the turn", thaw: "thaws",
  wake_turn2: "wakes on turn 2", wake_turn3: "wakes on turn 3",
  physical: "physical damage taken", chip: "chip damage a turn",
  self_hit: "hits itself"
};
function pct(v){
  if (v === 1) return "always";
  var p = v * 100;
  return (Math.round(p * 10) / 10) + "%";
}
/* Where a status multiplier came from, in the order they are trusted. */
const SOURCE_NOTE = {
  serebii: "From Champions' own rebalance page",
  measured: "Measured against Smogon's Champions engine",
  mainline: "The main-series value - no Champions source states this one",
};
function drawStatuses(){
  var host = $("statusList");
  if (!host) return;
  host.innerHTML = "";
  var S2 = C.STATUSES || {};
  Object.keys(S2).forEach(function(name){
    var r = S2[name];
    var row = el("div", "row " + (r.rebalanced_in_champions ? "perm" : ""));
    var m = el("div", "rmain");
    var h = el("div", "rname");
    h.appendChild(document.createTextNode(name));
    if (r.rebalanced_in_champions)
      h.appendChild(el("span", "tag ok", "rebalanced in Champions"));
    if (!r.champions_confirmed)
      h.appendChild(el("span", "tag warn", "main-series number"));
    m.appendChild(h);
    if (r.short) m.appendChild(el("div", "st", r.short));
    /* the numbers, each with its source - a value nobody measured here must
       never look like one that was */
    var line = el("div", "rmeta");
    Object.keys(r).forEach(function(k){
      var v = r[k];
      if (!v || typeof v !== "object" || v.value == null) return;
      var t = el("span", "tag " + (v.source === "main_series" ? "warn" : "ok"),
                 (STAT_LABELS[k] || k) + " " + pct(v.value));
      t.title = SOURCE_NOTE[v.source] || SOURCE_NOTE.mainline;
      if (v.was) t.textContent += " (was " + pct(v.was) + ")";
      line.appendChild(t);
    });
    m.appendChild(line);
    var mv = r.moves || [];
    if (mv.length) {
      var mline = el("div", "st c-accent");
      mline.textContent = mv.length + (mv.length === 1 ? " move causes it: "
                                                       : " moves cause it: ") +
        mv.join(", ");
      m.appendChild(mline);
    }
    row.appendChild(m);
    host.appendChild(row);
  });
  if (!host.children.length)
    host.appendChild(el("div", "empty", "No status data"));
}

/* One row, one item - the same change as toggleStone, for the same reason.
   The old [name, [category]] pairs were carried across by migration 6, so the
   two shapes this used to read are one shape now. */
function setItem(name, own){
  (own ? put("items/" + name, {}) : drop("items/" + name))
    .then(function(){
      toast(own ? name + " owned" : name + " removed");
    });
}

/* The status reference, drawn once, when its fold is first opened - not on
   every redraw of a screen whose whole point is the number at the top. */
function wireStatusFold(){
  var sf = $("statusFold"), sb = $("statusBody");
  if (!sf || !sb || sf._wired) return;
  sf._wired = 1;
  sf.onclick = function(){
    var open = sb.hidden;
    sb.hidden = !open;
    sf.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && !sb._drawn) { sb._drawn = 1; drawStatuses(); }
  };
}

export { drawItems, drawStones, wireStatusFold };
