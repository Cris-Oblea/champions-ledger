/* 07-gear.js - Items, stones, statuses, and the Profile tab.
   Part of the app; assembled into one script by scripts/build_tracker_page.py. */
/* ====================================================================== gear */
function drawStones(){
  var q = ($("stoneSearch").value || "").trim().toLowerCase();
  var own = ownedNames();
  var o = $("listStonesOwned"), n = $("listStonesNot");
  o.innerHTML = ""; n.innerHTML = "";
  var co = 0, cn = 0;
  C.STONES.forEach(function(r){
    var stone = r[0], mega = r[1], species = r[2];
    if (q && (stone + " " + mega).toLowerCase().indexOf(q) < 0) return;
    var have = hasStone(stone);
    var inBox = species in own;
    var row = el("button", "row " + (have ? "perm" : ""));
    var m = el("div", "rmain");
    var h = el("div", "rname");
    h.appendChild(document.createTextNode(stone));
    if (!inBox) h.appendChild(el("span", "tag", "no " + species + " in the box"));
    m.appendChild(h);
    var meta = el("div", "rmeta");
    var mp = byName[mega];
    if (mp) {
      mp.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
      meta.appendChild(el("span", "mono", mega + "  •  BST " + bst(mp) +
        "  •  " + mp.ab.join("/")));
    } else meta.appendChild(el("span", null, mega));
    m.appendChild(meta);
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
    var row = C.STONES.filter(function(r){ return r[0] === s; })[0];
    return row && !(row[2] in own);
  });
  $("stoneNote").innerHTML = "<strong>" + ownedStones().length + " of " +
    C.STONES.length + " stones.</strong> " +
    (dead.length ? dead.length + " unlock a Mega whose species is not in the box — " +
      "dead weight until it arrives: " + dead.join(", ") + "."
     : "Every stone you own has its species in the box.");
}
function toggleStone(stone){
  var cur = ownedStones().slice();
  var i = cur.indexOf(stone);
  if (i >= 0) cur.splice(i, 1); else cur.push(stone);
  cur.sort();
  put("meta/stones", {owned:cur}).then(function(){
    toast(i >= 0 ? stone + " removed" : stone + " owned");
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
function ownedItems(){
  var m = {};
  ((S.meta.items || {}).owned || []).forEach(function(r){
    m[Array.isArray(r) ? r[0] : r] = 1;
  });
  return m;
}
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
  var q = (($("itemSearch") || {}).value || "").trim().toLowerCase();
  var own = ownedItems();
  var nOwn = 0, nTot = 0;

  ITEM_CATS.forEach(function(cat){
    var rows = C.ITEMS.filter(function(r){ return (r[2] || "Miscellaneous") === cat; });
    nTot += rows.length;
    rows.forEach(function(r){ if (own[r[0]]) nOwn++; });
    var hits = rows.filter(function(r){
      return !q || (r[0] + " " + (r[3] || "")).toLowerCase().indexOf(q) >= 0;
    });
    if (!hits.length) return;
    var have = hits.filter(function(r){ return own[r[0]]; }).length;
    var h = el("h2", null, cat + " ");
    h.appendChild(el("span", "n", have + "/" + hits.length));
    pane.appendChild(h);
    var list = el("div", "list");
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
  var row = el("button", "row " + (have ? "perm" : ""));
  var m = el("div", "rmain");
  var h = el("div", "rname");
  h.appendChild(document.createTextNode(name));
  m.appendChild(h);
  if (effect) m.appendChild(el("div", "st", effect));
  /* what this item is FOR: the move and the ability it serves, together.
     Heat Rock extends the sun, so it belongs to Sunny Day and to Drought -
     naming only the move would miss the half that actually sets the weather
     on most teams. */
  var why = r[6], abl = r[7] || [], mvs = r[8] || [];
  if (why) {
    var w = el("div", "st");
    w.style.color = "var(--accent)";
    w.textContent = why + (mvs.length || abl.length
      ? " — " + mvs.concat(abl).join(", ") : "");
    m.appendChild(w);
  }
  row.appendChild(m);
  var side = el("div", "rside");
  var tag = el("span", "tag " + (have ? "mega" : "warn"),
    have ? "owned" : vp ? vp + " VP" : priceless(src));
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
function priceless(src){
  var s = (src || "").replace(/^Shop\s*/, "").replace(/\?\?\?\s*VP/, "").trim();
  if (!s || s === "-") return "not sold";
  return s.slice(0, 24);
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
      t.title = v.source === "serebii" ? "From Champions' own rebalance page"
              : v.source === "measured" ? "Measured against Smogon's Champions engine"
              : "The main-series value - no Champions source states this one";
      if (v.was) t.textContent += " (was " + pct(v.was) + ")";
      line.appendChild(t);
    });
    m.appendChild(line);
    var mv = r.moves || [];
    if (mv.length) {
      var mline = el("div", "st");
      mline.style.color = "var(--accent)";
      mline.textContent = mv.length + (mv.length === 1 ? " move causes it: "
                                                       : " moves cause it: ") +
        mv.slice(0, 8).join(", ") + (mv.length > 8 ? "…" : "");
      m.appendChild(mline);
    }
    row.appendChild(m);
    host.appendChild(row);
  });
  if (!host.children.length)
    host.appendChild(el("div", "empty", "No status data"));
}

function setItem(name, own){
  var meta = S.meta.items || {};
  var rows = (meta.owned || []).filter(function(r){
    return (Array.isArray(r) ? r[0] : r) !== name;
  });
  /* stored as plain names now - the old [name, [category]] shape is still
     read, because the categories are the game's and no longer typed in */
  if (own) rows.push(name);
  rows.sort(function(a, b){
    return String(Array.isArray(a) ? a[0] : a)
      .localeCompare(String(Array.isArray(b) ? b[0] : b));
  });
  var body = {owned:rows};
  if (meta.categories) body.categories = meta.categories;
  put("meta/items", body).then(function(){
    toast(own ? name + " owned" : name + " removed");
  });
}

/* =================================================================== profile
   One editable number and three derived panels. The editable one is box
   capacity, because the app acts on it and only Champions can change it; every
   other field that used to live here was hand-typed, unread, and wrong by the
   time anyone looked (player, 2026-09-12). */
function kv(host, rows){
  host.innerHTML = "";
  rows.forEach(function(r){
    if (r == null) return;
    host.appendChild(el("dt", null, r[0]));
    var d = el("dd", null, String(r[1]));
    if (r[2]) { d.style.color = "var(--" + r[2] + ")"; }
    if (r[3]) d.title = r[3];
    host.appendChild(d);
  });
}

function drawTrainer(){
  var t = S.meta.trainer || {};
  if (document.activeElement && document.activeElement.closest &&
      document.activeElement.closest("#v-trainer")) return;
  $("tCap").value = t.box_capacity != null ? t.box_capacity : 50;

  /* the capacity number means nothing without the usage beside it */
  var inChamp = boxRows("champions");
  var cap = capacity(), used = inChamp.length, free = cap - used;
  var cu = $("capUse");
  cu.innerHTML = "";
  cu.appendChild(el("span", "dot"));
  cu.appendChild(document.createTextNode(
    used + " of " + cap + " used · " + (free < 0 ? 0 : free) + " free"));
  cu.style.color = free <= 0 ? "var(--bad)" : free <= 3 ? "var(--warn)" : "";

  var rent = boxRows("champions", "rental").length;
  var home = boxRows("home").length;
  var stones = ownedStones().length;
  kv($("profCounts"), [
    ["In the Champions box", used + " (" + (used - rent) + " bought, " +
                             rent + " rental" + (rent === 1 ? "" : "s") + ")"],
    ["In HOME", home],
    ["Builds written", Object.keys(S.builds).length],
    ["Mega Stones owned", stones + " of " + (C.STONES || []).length]
  ]);

  /* Vintage, read off the blob rather than typed. The stored `regulation` key
     said M-B three days into M-C, which is exactly the failure this replaces. */
  kv($("profData"), [
    ["Regulation", (C.REG || "unknown") +
       (C.REG_STARTED ? " · since " + C.REG_STARTED : "")],
    ["Dex", (C.DEX || []).length + " forms, " + (C.STONES || []).length +
            " Mega Stones"],
    ["Moves", (C.MOVES || []).length + " useable, " +
              Object.keys(C.AB_MOVES || {}).length + " ability rules"],
    ["Ladder usage", C.USAGE_AT
       ? "fetched " + C.USAGE_AT + ", " + (C.REG || "?") + " ladder"
       : "unknown"],
    ["Tournament data", "Worlds 2026, played under M-B — history, not current",
       null, "A finished event keeps the format it was played in"],
    ["Page built", window.CHAMP_BUILD || "unknown"]
  ]);

  var c = $("costs");
  /* No affordability colouring any more: it read the hand-typed VP balance,
     and colouring against a stale number is worse than not colouring. */
  kv(c, [["A ranked win pays", "+" + COSTS.ranked_win + " VP"],
         ["Stat Point", COSTS.training_stat_point + " VP"],
         ["Move", COSTS.training_move + " VP"],
         ["Nature", COSTS.training_nature + " VP"],
         ["Ability", COSTS.training_ability + " VP"],
         ["Mega Stone", COSTS.mega_stone_shop + " VP"],
         ["Keep a rental", COSTS.keep_rental_pokemon + " VP"],
         ["Full four-move retune", (COSTS.training_move * 4) + " VP"],
         ["Ranked wins that pays for",
          Math.ceil(COSTS.training_move * 4 / COSTS.ranked_win)]]);
}
$("teamAdd").onclick = function(){ teamSheet(null, null); };
$("tSave").onclick = function(){
  patch("meta/trainer", {
    box_capacity:Number($("tCap").value) || 50
  }).then(function(){ toast("Box capacity saved"); });
};

