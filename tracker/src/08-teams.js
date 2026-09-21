/* 08-teams.js - Six slots, the clauses checked, and what is still to get.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import { $, C, STONE_OF, bst, byName, capNote, cardLine, dexNo, el, labelBox,
 pokeCard, searchField, splitPct, toast, typeCard, typeChip, typeSkin,
 usageTag } from "./01-data.js";
import { S, buildLink, buildsFor, hasItem, hasStone } from "./02-state.js";
import { drop, put, putNew } from "./03-store.js";
import { ask, closeSheet, fbtn, leaveEditor, openEditor, openSheet }
  from "./04-nav.js";
/* One coloured note element. */
import { note } from "./13-boot.js";
/* ===================================================================== teams
   A team is six slots, and a slot points at a BUILD rather than at a box row -
   so one Pokemon can sit in any number of teams and editing its set updates
   every one of them (player, 2026-09-13). A build may itself be unbound, which
   is what lets a team be four-sixths real and still worth writing down: he
   asked to be told what he has, where it is, and what is still missing.

   THE ITEM LIVES ON THE SLOT. Not a layout choice - the Item Clause means six
   Pokemon field exactly one Sitrus Berry, so an item stored per build is a
   preference that cannot survive contact with a team. That is why builds
   deliberately carry no item at all. */
var TEAM_SLOTS = 6;

function teamSlots(t){
  var out = (t && t.slots || []).slice(0, TEAM_SLOTS);
  while (out.length < TEAM_SLOTS) out.push({});
  return out;
}

/* Everything the app can work out about a team, in one pass, so the sheet and
   the list agree by construction rather than by both remembering. */
function teamReport(t){
  var slots = teamSlots(t), r = {
    slots: [], filled: 0, ready: 0, problems: [], warnings: [],
    missing: [], stones: [], speeds: []
  };
  var itemSeen = {}, formSeen = {};
  slots.forEach(function(sl, i){
    var b = sl.build_id ? S.builds[sl.build_id] : null;
    var info = {i: i, slot: sl, build: b, name: b && b.pokemon};
    if (b) {
      r.filled++;
      var lk = buildLink(sl.build_id);
      info.state = lk.state;
      info.row = lk.row;
      /* "ready" means it could be brought TODAY: the Pokemon exists and is in
         the Champions box. Parked in HOME is one recall away; unbound is not
         owned at all. */
      if (lk.state === "active") r.ready++;
      else if (lk.state === "parked")
        r.warnings.push(b.pokemon + " is parked in HOME - recall it before you can play it");
      else if (lk.state === "orphan")
        r.problems.push(b.pokemon + "'s build points at a Pokemon that is gone");
      else r.missing.push(b.pokemon);

      var p = byName[b.pokemon];
      if (p) {
        info.types = p.types;
        r.speeds.push({name: b.pokemon, spe: p.b[5]});
        /* Species Clause is per FORM, not per species: two Squawkabilly of
           different plumage still cannot share a team. */
        if (formSeen[b.pokemon]) r.problems.push("two " + b.pokemon + " - the Species Clause forbids it");
        formSeen[b.pokemon] = 1;
      }
      if (b.mega) {
        var st = STONE_OF[b.mega];
        r.stones.push({name: b.mega, stone: st, owned: st ? hasStone(st) : false});
      }
    }
    if (sl.item) {
      if (itemSeen[sl.item]) r.problems.push("two " + sl.item + " - the Item Clause allows one per team");
      itemSeen[sl.item] = 1;
    }
    r.slots.push(info);
  });
  /* Several stones are legal and most Worlds teams carried two; only one
     Pokemon may actually Mega Evolve in a battle. A warning, never a block. */
  if (r.stones.length > 1)
    r.warnings.push(r.stones.length + " Mega Stones - legal, but only one can " +
                    "Mega Evolve per battle, so it is a team-preview choice");
  r.stones.filter(function(x){ return x.stone && !x.owned; }).forEach(function(x){
    r.warnings.push(x.stone + " is not owned, so " + x.name + " is not reachable yet");
  });
  r.speeds.sort(function(a, b){ return b.spe - a.spe; });
  return r;
}

/* What the six of them, together, are weak to. The chart is already shipped,
   so this is a count rather than a claim: how many of the team take super
   effective damage from each attacking type, and how many resist it. */
function teamTypes(r){
  var out = [];
  /* Stellar is in the chart and NOT in Champions - there is no Tera here, so
     no move can be that type and counting it would invent a weakness. */
  Object.keys(C.CHART).filter(function(t){ return t !== "Stellar"; })
        .forEach(function(atk){
    var weak = 0, resist = 0;
    r.slots.forEach(function(s){
      if (!s.types) return;
      var m = 1;
      s.types.forEach(function(t){
        var v = C.CHART[atk] && C.CHART[atk][t];
        m *= (v == null ? 1 : v);
      });
      if (m > 1) weak++; else if (m < 1) resist++;
    });
    out.push({type: atk, weak: weak, resist: resist});
  });
  return out.sort(function(a, b){ return b.weak - a.weak || a.resist - b.resist; });
}

/* One slot: which build, which item, and why it holds it.

   The BUILD is chosen, not the Pokemon - that is what lets three different
   Farigiraf be three different answers, and what makes editing a set update
   every team carrying it. The item is chosen here because the Item Clause is a
   team-level rule; the picker greys out anything another slot already holds
   rather than letting the clash happen and complaining afterwards. */
function teamSlotRow(draft, x, i, redraw){
  /* A slot holds a Pokemon, so it wears one - the same card as everywhere
     else. Its type is the BUILD's Pokemon, Mega included when a stone is on
     it, because that is what walks onto the field. */
  var draw = x.build ? (byName[x.build.mega || x.build.pokemon] ||
                        byName[x.build.pokemon]) : null;
  var row, m;
  if (draw) {
    row = pokeCard(draw, {
      tag: "div",
      name: x.build.pokemon,
      /* the stone the build runs is named on its own badge, so the card does
         not also list the species' whole Mega line here */
      megas: !x.build.mega,
      /* THE ITEM GETS A CELL OF ITS OWN, because on this screen it is the
         decision being made - the Item Clause is a team rule, so the six
         items are read down the column against each other. */
      cells: [
        labelBox(x.build.nature || null, "Nature", "wide"),
        labelBox(x.slot.item || null, "Item", "wide")
      ],
      badges: function(h){
        if (x.build.mega) h.appendChild(el("span", "tag mega", x.build.mega));
        if (x.state === "parked")
          h.appendChild(el("span", "tag warn", "in HOME — recall it first"));
        else if (x.state === "unbound")
          h.appendChild(el("span", "tag warn", "you do not have one yet"));
        else if (x.state === "orphan")
          h.appendChild(el("span", "tag bad", "its Pokemon is gone"));
        if (x.row && x.row.status === "rental")
          h.appendChild(el("span", "tag warn", "rental — cannot be trained"));
      },
      meta: function(meta){
        meta.appendChild(el("span", "mono",
          (x.build.moves || []).length + " moves"));
      },
      notes: function(body){
        if (x.slot.why) body.appendChild(el("div", "st", x.slot.why));
      }
    });
  } else {
    row = el("div", "row");
    m = el("div", "rmain");
    var h = el("div", "rname");
    h.appendChild(el("span", "st", "Slot " + (i + 1) + " — empty"));
    m.appendChild(h);
    row.appendChild(m);
  }

  var side = el("div", "rside");
  var pick = el("button", "btn sm", x.build ? "Change" : "Fill");
  pick.onclick = function(e){
    e.stopPropagation();
    /* the draft and the slot index go in, so the picker can grey out a
       species another slot already holds - the Species Clause enforced where
       the choice is made, exactly like the Item Clause below it */
    teamPickBuild(draft, i, function(bid){
      draft.slots[i] = {build_id:bid, item:x.slot.item || "", why:x.slot.why || ""};
      redraw();
    });
  };
  side.appendChild(pick);
  if (x.build) {
    var it = el("button", "btn sm", x.slot.item ? "Item" : "+ Item");
    it.onclick = function(e){
      e.stopPropagation();
      teamPickItem(draft, i, redraw);
    };
    side.appendChild(it);
    var rm = el("button", "btn sm", "×");
    rm.title = "Empty this slot";
    rm.onclick = function(e){ e.stopPropagation(); draft.slots[i] = {}; redraw(); };
    side.appendChild(rm);
  }
  row.appendChild(side);
  return row;
}

/* ------------------------------------------- WHICH BUILD GOES IN THE SLOT --
   It was an alphabetical run of every build in the ledger, with no way to
   narrow it:

     "el selector de slot no tiene buscador! imaginate tener 100 builds
      diferentes y tener que deslizar, es mucho tiempo perdido. yo necesito
      que todos los menus de busqueda de cualquier cosa puedan tener un search
      y/o filtros asi puedo ir viendo rapidamente como armar el team!"
      (player, 2026-09-21)

   Four controls, and they are the questions asked while a team is being put
   together. WHAT IS IT - the search box, which reads the build's own words as
   well as its Pokemon's: an id, a species, a Mega, a role, a nature, an
   ability, any of its moves, a type, a dex number. CAN I BRING IT TODAY - the
   state row. WHAT JOB DOES IT DO - the role and type rows.

   The role and type rows are built from the builds that EXIST, not from a
   fixed vocabulary, so they offer exactly what is there. `role` is a free
   text field, so it is grouped case-insensitively and shown with its count;
   a vocabulary of one is not a filter, so a row with a single chip is left
   out rather than drawn as a control that cannot narrow anything.

   And the Species Clause is enforced HERE, exactly the way the Item Clause is
   enforced in the item picker below: a species another slot already holds is
   greyed out with the reason written on it, rather than accepted and then
   reported as illegal underneath. */
function teamPickBuild(draft, idx, onPick){
  /* PER FORM, which is what the clause was measured on - 0 of the 642 Worlds
     teams repeats even a form - so two Squawkabilly of different plumage are
     still two of the same thing here. */
  var taken = {};
  ((draft && draft.slots) || []).forEach(function(sl, j){
    if (j === idx || !sl || !sl.build_id) return;
    var ob = S.builds[sl.build_id];
    if (ob && ob.pokemon) taken[ob.pokemon] = 1;
  });
  var F = {state:{}, role:{}, type:{}, sort:"az"};
  openSheet("Which build?", function(body){
    var ids = Object.keys(S.builds);
    if (!ids.length) {
      body.appendChild(el("div", "empty",
        "No builds yet. A team is made of builds, so write one first."));
      return;
    }
    /* ONE PASS over the ledger, so the filter rows and the list read the same
       facts rather than each deriving their own. */
    var rows = ids.map(function(bid){
      var b = S.builds[bid], lk = buildLink(bid);
      /* the form it PLAYS AS - the Mega when a stone is on it, which is the
         row the rest of the app judges a build by */
      var p = (b.mega && byName[b.mega]) || byName[b.pokemon] || null;
      var hay = [bid, b.pokemon, b.mega, b.role, b.nature, b.ability,
                 b.mega_ability, b.rationale, (b.moves || []).join(" "),
                 p ? p.types.join(" ") : "",
                 byName[b.pokemon] ? dexNo(b.pokemon) : ""]
        .filter(Boolean).join(" ").toLowerCase();
      return {id:bid, b:b, p:p, lk:lk, hay:hay,
              types: (p && p.types) || [],
              role: (b.role || "").trim(),
              spe: p ? p.b[5] : -1, bst: p ? bst(p) : -1,
              dupe: !!taken[b.pokemon]};
    });

    function label(t){
      var d = el("div", "sub"); d.style.margin = "0 0 4px"; d.textContent = t;
      return d;
    }
    /* One chip. Two states only - a slot is being FILLED here, not queried,
       so the third "rule it out" state the Find tab needs would be a control
       nobody reaches for while filling six slots. */
    function chip(row, group, key, text, type){
      var t = el("button", "tog", text);
      t.setAttribute("aria-pressed", "false");
      if (type) typeSkin(t, type, false);
      t.onclick = function(){
        if (F[group][key]) delete F[group][key]; else F[group][key] = 1;
        var on = !!F[group][key];
        t.setAttribute("aria-pressed", on ? "true" : "false");
        if (type) typeSkin(t, type, on);
        draw();
      };
      row.appendChild(t);
      return t;
    }

    var inp = searchField(body, "Search " + rows.length + " build" +
      (rows.length === 1 ? "" : "s") + " \u2014 name, move, role, nature, type",
      function(){ draw(); });

    var srow = el("div", "toggles"); srow.style.marginBottom = "8px";
    [["az", "A\u2013Z"], ["ready", "Ready first"], ["spe", "Speed"],
     ["bst", "BST"]].forEach(function(o){
      var t = el("button", "tog", o[1]);
      t.setAttribute("aria-pressed", F.sort === o[0] ? "true" : "false");
      t.onclick = function(){
        F.sort = o[0];
        Array.prototype.forEach.call(srow.children, function(x){
          x.setAttribute("aria-pressed", x === t ? "true" : "false");
        });
        draw();
      };
      srow.appendChild(t);
    });
    body.appendChild(label("Sort"));
    body.appendChild(srow);

    /* CAN I BRING IT. The states are the four `buildLink` returns, counted -
       a state nothing is in would be a chip that can only ever return
       nothing, so it is not drawn at all. */
    var nState = {};
    rows.forEach(function(r){ nState[r.lk.state] = (nState[r.lk.state] || 0) + 1; });
    var strow = el("div", "toggles"); strow.style.marginBottom = "8px";
    [["active", "Ready today"], ["parked", "In HOME"],
     ["unbound", "Not owned yet"], ["orphan", "Orphan"]].forEach(function(o){
      if (!nState[o[0]]) return;
      chip(strow, "state", o[0], o[1] + " \u00b7 " + nState[o[0]]);
    });
    if (strow.children.length > 1) {
      body.appendChild(label("Where it is \u2014 any of these"));
      body.appendChild(strow);
    }

    /* WHAT JOB IT DOES. `role` is typed by hand, so the chips are the
       distinct roles that exist, matched case-insensitively and labelled with
       the spelling first used. */
    var roleKeys = [], roleN = {}, roleText = {};
    rows.forEach(function(r){
      if (!r.role) return;
      var k = r.role.toLowerCase();
      if (!roleN[k]) { roleKeys.push(k); roleText[k] = r.role; }
      roleN[k] = (roleN[k] || 0) + 1;
    });
    roleKeys.sort(function(a, b){
      return roleN[b] - roleN[a] || a.localeCompare(b); });
    if (roleKeys.length > 1) {
      var rrow = el("div", "toggles"); rrow.style.marginBottom = "8px";
      roleKeys.forEach(function(k){
        chip(rrow, "role", k, roleText[k] + " \u00b7 " + roleN[k]);
      });
      body.appendChild(label("Role \u2014 any of these"));
      body.appendChild(rrow);
    }

    /* A TYPE IS WHY THE SIXTH SLOT EXISTS: the hole the other five leave. The
       chips are the types the builds actually cover, so the row shrinks with
       the box rather than always showing eighteen. */
    var tKeys = [], tN = {};
    rows.forEach(function(r){
      r.types.forEach(function(t){
        if (!tN[t]) tKeys.push(t);
        tN[t] = (tN[t] || 0) + 1;
      });
    });
    tKeys.sort();
    if (tKeys.length > 1) {
      var trow = el("div", "toggles"); trow.style.marginBottom = "10px";
      tKeys.forEach(function(t){ chip(trow, "type", t, t + " \u00b7 " + tN[t], t); });
      body.appendChild(label("Type \u2014 any of these, the form it plays as"));
      body.appendChild(trow);
    }

    var count = el("div", "sub"); count.style.margin = "0 0 6px";
    body.appendChild(count);
    var list = el("div", "list cards");
    body.appendChild(list);

    function draw(){
      var q = inp.q();
      var st = Object.keys(F.state), ro = Object.keys(F.role),
          ty = Object.keys(F.type);
      var hits = rows.filter(function(r){
        if (q && r.hay.indexOf(q) < 0) return false;
        if (st.length && st.indexOf(r.lk.state) < 0) return false;
        if (ro.length && ro.indexOf(r.role.toLowerCase()) < 0) return false;
        if (ty.length && !r.types.some(function(t){ return ty.indexOf(t) >= 0; }))
          return false;
        return true;
      });
      var RANK = {active:0, parked:1, unbound:2, orphan:3};
      hits.sort(function(a, b){
        if (F.sort === "spe")
          return b.spe - a.spe || a.b.pokemon.localeCompare(b.b.pokemon);
        if (F.sort === "bst")
          return b.bst - a.bst || a.b.pokemon.localeCompare(b.b.pokemon);
        if (F.sort === "ready")
          return (RANK[a.lk.state] || 0) - (RANK[b.lk.state] || 0) ||
                 a.b.pokemon.localeCompare(b.b.pokemon);
        return a.b.pokemon.localeCompare(b.b.pokemon) || a.id.localeCompare(b.id);
      });
      /* A SPECIES ANOTHER SLOT HOLDS GOES LAST, and is not hidden: the clause
         is the reason it cannot be picked, and that is worth reading once.
         Stable, so it re-orders the chosen sort rather than replacing it. */
      hits.sort(function(a, b){ return (a.dupe ? 1 : 0) - (b.dupe ? 1 : 0); });

      count.textContent = hits.length === rows.length
        ? rows.length + " build" + (rows.length === 1 ? "" : "s")
        : hits.length + " of " + rows.length + " builds";
      list.innerHTML = "";
      hits.forEach(function(r){ list.appendChild(buildPickRow(r, onPick)); });
      if (!hits.length) {
        list.appendChild(el("div", "empty",
          q || st.length || ro.length || ty.length
            ? "Nothing matches" : "No builds yet"));
      }
    }
    draw();
    /* focus LAST, after the sheet has its height - the same 60ms the species
       picker and the calculator's use */
    setTimeout(function(){ inp.focus(); }, 60);
  }, [fbtn("Back", "", function(){ closeSheet(); })]);
}

/* One build, drawn as the card every other list draws.

   A BUILD IS STILL A POKEMON, so the slot picker shows the card the rest of
   the app shows, with the build's own facts as the extra cells. It had a
   typing, a nature and the four move names and nothing else - and this is the
   screen where a team is decided. */
function buildPickRow(r, onPick){
  var b = r.b, bid = r.id, lk = r.lk;
  var badges = function(h){
    /* several builds per species is the point, so the id is shown: it is
       what tells farigiraf from farigiraf-2 */
    if (buildsFor(b.pokemon).length > 1)
      h.appendChild(el("span", "tag", bid));
    if (b.role) h.appendChild(el("span", "tag", b.role));
    if (r.dupe) h.appendChild(el("span", "tag bad", "already on this team"));
    if (lk.state === "unbound")
      h.appendChild(el("span", "tag warn", "not owned yet"));
    if (lk.state === "parked")
      h.appendChild(el("span", "tag warn", "in HOME"));
  };
  var opts = {
    cls: (r.dupe || lk.state === "orphan") ? "illegal" : "",
    name: b.pokemon,
    abLabel: "Ability",
    cells: [labelBox(b.nature || "\u2014", "Nature", "wide")],
    badges: badges,
    meta: function(meta){
      meta.appendChild(el("span", "mono",
        (b.moves || []).join(", ") || "no moves"));
    },
    notes: function(body){
      /* WHY it cannot be picked, in the row itself. The Species Clause is a
         measured fact about this format, not a preference, so it is said
         where the choice is being made. */
      if (r.dupe) body.appendChild(el("div", "st",
        "Another slot already holds a " + b.pokemon +
        ", and no team may run two of the same species."));
    },
    onclick: r.dupe ? null : function(){ closeSheet(); onPick(bid); }
  };
  var btn;
  if (r.p) {
    btn = pokeCard(r.p, opts);
  } else {
    /* a build for a species the dex does not carry: it is still an idea worth
       picking, so it keeps a row rather than disappearing */
    btn = el("button", "row" + (r.dupe ? " illegal" : ""));
    var m = el("div", "rmain");
    var h = el("div", "rname");
    h.appendChild(document.createTextNode(b.pokemon));
    badges(h);
    m.appendChild(h);
    btn.appendChild(m);
    if (!r.dupe) btn.onclick = opts.onclick;
  }
  if (r.dupe && btn.tagName === "BUTTON") btn.disabled = true;
  return btn;
}

function teamPickItem(draft, i, redraw){
  /* Taken is computed from the OTHER slots, so the clause is enforced where
     the choice is made rather than reported after the fact. */
  var taken = {};
  draft.slots.forEach(function(sl, j){
    if (j !== i && sl && sl.item) taken[sl.item] = 1;
  });
  openSheet("Which item?", function(body){
    body.appendChild(el("p", "sub",
      "One item per team — the Item Clause. Anything another slot already " +
      "holds is greyed out."));
    var inp = searchField(body, "Search " + (C.ITEMS || []).length +
      " items \u2014 name or effect", function(){ draw(); });

    /* THE SAME TWO QUESTIONS AS EVERY OTHER PICKER: what kind of thing is it,
       and can I actually use it. A category here is the game's own grouping,
       and "owned" is the one that matters at this screen - an item you have
       not recorded is a 2000 VP decision, not a choice between six. */
    var F = {cat:{}, own:false};
    function label(t){
      var d = el("div", "sub"); d.style.margin = "0 0 4px"; d.textContent = t;
      return d;
    }
    var nCat = {};
    (C.ITEMS || []).forEach(function(it){
      var k = it[2] || "Miscellaneous";
      nCat[k] = (nCat[k] || 0) + 1;
    });
    var crow = el("div", "toggles"); crow.style.marginBottom = "8px";
    Object.keys(nCat).sort().forEach(function(k){
      var t = el("button", "tog", k + " \u00b7 " + nCat[k]);
      t.setAttribute("aria-pressed", "false");
      t.onclick = function(){
        if (F.cat[k]) delete F.cat[k]; else F.cat[k] = 1;
        t.setAttribute("aria-pressed", F.cat[k] ? "true" : "false");
        draw();
      };
      crow.appendChild(t);
    });
    var own = el("button", "tog", "Only ones you own");
    own.setAttribute("aria-pressed", "false");
    own.onclick = function(){
      F.own = !F.own;
      own.setAttribute("aria-pressed", F.own ? "true" : "false");
      draw();
    };
    crow.appendChild(own);
    if (crow.children.length > 1) {
      body.appendChild(label("Narrow it \u2014 any of these"));
      body.appendChild(crow);
    }
    var count = el("div", "sub"); count.style.margin = "0 0 6px";
    body.appendChild(count);
    var list = el("div", "list");
    body.appendChild(list);

    function draw(){
      var q = inp.q();
      var cats = Object.keys(F.cat);
      list.innerHTML = "";
      var none = el("button", "row");
      none.appendChild(el("div", "rmain")).appendChild(
        el("div", "rname", "— no item —"));
      none.onclick = function(){
        draft.slots[i].item = ""; draft.slots[i].why = ""; closeSheet(); redraw(); };
      list.appendChild(none);
      /* ALL of them. There are 118 items in Champions and this drew 60,
         so with an empty box half the pool was invisible and nothing said
         so - the worst shape for a list you are choosing FROM. */
      var pool = (C.ITEMS || []).filter(function(it){
        if (cats.length && cats.indexOf(it[2] || "Miscellaneous") < 0) return false;
        if (F.own && !hasItem(it[0])) return false;
        return !q || it[0].toLowerCase().indexOf(q) >= 0 ||
               String(it[3] || "").toLowerCase().indexOf(q) >= 0;
      });
      count.textContent = pool.length === (C.ITEMS || []).length
        ? pool.length + " items"
        : pool.length + " of " + (C.ITEMS || []).length + " items";
      if (!pool.length) {
        list.appendChild(el("div", "empty", F.own
          ? "Nothing you own matches" : "Nothing matches"));
      }
      pool.forEach(function(it){
        var btn = el("button", "row" + (taken[it[0]] ? " illegal" : ""));
        if (taken[it[0]]) { btn.disabled = true; btn.style.opacity = "0.5"; }
        var m = el("div", "rmain");
        var h = el("div", "rname");
        h.appendChild(document.createTextNode(it[0]));
        if (taken[it[0]])
          h.appendChild(el("span", "tag bad", "another slot holds it"));
        /* owned or not, said on the row - otherwise the filter above is the
           only place the fact exists, and a filter you have to turn on to
           read is not an answer */
        else if (!hasItem(it[0]))
          h.appendChild(el("span", "tag warn", it[1] ? it[1] + " VP" : "not owned"));
        /* How many of THIS slot's Pokemon hold this item on the ladder. The
           item is a team decision - the Item Clause makes it one - so the
           number belongs here, at the slot, and not on the build. */
        /* `build_id`, not `build` - a slot has never had a `build` field, so
           this read undefined and the usage tag never appeared on a single
           item. The one number on this screen that says what other players
           hold, and it was silently off. */
        var who = draft.slots[i] && draft.slots[i].build_id
          && S.builds[draft.slots[i].build_id];
        var utag = who ? usageTag(splitPct(who.pokemon, "i", it[0]),
                                  who.pokemon, "i") : null;
        if (utag) h.appendChild(utag);
        m.appendChild(h);
        if (it[3]) m.appendChild(el("div", "st", String(it[3]).slice(0, 120)));
        btn.appendChild(m);
        if (!taken[it[0]]) btn.onclick = function(){
          draft.slots[i].item = it[0];
          closeSheet();
          /* why it holds it - the half of teams.json that is not derivable */
          openSheet(it[0] + " on " + (S.builds[draft.slots[i].build_id] || {}).pokemon,
            function(b2){
              b2.appendChild(el("p", "sub", "Why this one? One line is enough."));
              var f = el("div", "field");
              var ta = el("textarea"); ta.value = draft.slots[i].why || "";
              ta.oninput = function(){ draft.slots[i].why = ta.value; };
              f.appendChild(ta); b2.appendChild(f);
            }, [fbtn("Done", "primary", function(){ closeSheet(); redraw(); })]);
        };
        list.appendChild(btn);
      });
    }
    draw();
    setTimeout(function(){ inp.focus(); }, 60);
  }, [fbtn("Back", "", function(){ closeSheet(); })]);
}

function drawTeams(){
  var host = $("listTeams");
  if (!host) return;
  host.innerHTML = "";
  var all = Object.keys(S.teams).sort(function(a, b){
    return String(S.teams[a].name).localeCompare(String(S.teams[b].name));
  });
  if (!all.length) {
    host.appendChild(el("div", "empty",
      "No teams yet. A team is six builds and the items they hold."));
    return;
  }
  /* THE MEMBERS ARE SEARCHED TOO, and the items with them. "Which team is my
     Farigiraf in" and "who is holding the Sitrus Berry" are both questions
     about a Pokemon, asked at the list rather than by opening six teams. */
  var q = ($("teamSearch") && $("teamSearch").value || "").trim().toLowerCase();
  var ids = all.filter(function(id){
    if (!q) return true;
    var t = S.teams[id];
    var hay = [t.name, (t.notes && t.notes.idea) || ""];
    (t.slots || []).forEach(function(sl){
      if (sl && sl.item) hay.push(sl.item);
      var b = sl && sl.build_id && S.builds[sl.build_id];
      if (b) hay.push(b.pokemon, b.mega, b.role);
    });
    return hay.filter(Boolean).join(" ").toLowerCase().indexOf(q) >= 0;
  });
  if (!ids.length) {
    host.appendChild(el("div", "empty", "No team matches"));
    return;
  }
  ids.forEach(function(id){
    var t = S.teams[id], r = teamReport(t);
    var row = el("button", "row");
    var m = el("div", "rmain");
    var h = el("div", "rname");
    h.appendChild(document.createTextNode(t.name || "Untitled"));
    h.appendChild(el("span", "tag" + (r.filled === TEAM_SLOTS ? " ok" : ""),
      r.filled + "/" + TEAM_SLOTS));
    if (r.ready < r.filled)
      h.appendChild(el("span", "tag warn", r.ready + " playable today"));
    if (r.problems.length)
      h.appendChild(el("span", "tag bad", r.problems.length + " illegal"));
    m.appendChild(h);
    var meta = el("div", "rmeta");
    r.slots.filter(function(x){ return x.name; }).forEach(function(x){
      meta.appendChild(el("span", null, x.name));
    });
    m.appendChild(meta);
    row.appendChild(m);
    row.onclick = function(){ teamSheet(id, t); };
    host.appendChild(row);
  });
}

function teamSheet(id, t){
  var draft = JSON.parse(JSON.stringify(t || {name:"", slots:[], notes:{}}));
  draft.slots = teamSlots(draft);

  /* Re-render in place. It used to close a sheet and open a new one, which is
     why a Back from the item picker took the whole team with it. */
  function redraw(){ teamSheet(id, draft); }

  openEditor("teamedit", draft.name || "New team", function(body){
    var fn = el("div", "field");
    fn.appendChild(el("label", "f", "Name"));
    var inp = el("input"); inp.type = "text"; inp.value = draft.name || "";
    inp.oninput = function(){ draft.name = inp.value; };
    fn.appendChild(inp);
    body.appendChild(fn);

    var r = teamReport(draft);

    /* What is wrong first, because a team that cannot be registered is not a
       team. The clauses are measured facts about this format, not opinions. */
    r.problems.forEach(function(msg){
      body.appendChild(note("bad", "<strong>Illegal.</strong> " + msg));
    });
    r.warnings.forEach(function(msg){
      body.appendChild(note("warn", msg));
    });

    /* The player asked to be told what he HAS, where it is, and what is still
       missing - so a team can be four-sixths real and still worth writing. */
    var line = r.ready + " of " + r.filled + " ready to bring";
    if (r.missing.length)
      line += " · still to get: " + r.missing.join(", ");
    if (r.filled < TEAM_SLOTS)
      line += " · " + (TEAM_SLOTS - r.filled) + " slot" +
              (TEAM_SLOTS - r.filled > 1 ? "s" : "") + " empty";
    body.appendChild(el("div", "note", line));

    body.appendChild(el("h2", null, "The six"));
    var list = el("div", "list");
    r.slots.forEach(function(x, i){
      list.appendChild(teamSlotRow(draft, x, i, redraw));
    });
    body.appendChild(list);

    if (r.speeds.length > 1) {
      body.appendChild(el("h2", null, "Speed order"));
      body.appendChild(el("div", "note", r.speeds.map(function(x){
        return x.name + " " + x.spe; }).join("  ·  ") +
        "  — base Speed, before nature and SP"));
    }

    if (r.filled) {
      body.appendChild(el("h2", null, "What the six are weak to"));
      var tt = teamTypes(r).filter(function(x){ return x.weak; }).slice(0, 6);
      var tw = el("div");
      if (!tt.length) {
        tw.appendChild(el("div", "note", "Nothing hits more than one of them "
          + "for super effective damage."));
      } else {
        tt.forEach(function(x){
          var d = el("div", "st");
          d.appendChild(typeChip(x.type));
          d.appendChild(document.createTextNode(
            "  " + x.weak + " weak, " + x.resist + " resist"));
          if (x.weak >= 3) d.style.color = "var(--bad)";
          tw.appendChild(d);
        });
      }
      body.appendChild(tw);
    }

    var fw = el("div", "field");
    fw.appendChild(el("label", "f", "The idea"));
    var ta = el("textarea");
    ta.value = (draft.notes && draft.notes.idea) || "";
    ta.oninput = function(){
      draft.notes = draft.notes || {}; draft.notes.idea = ta.value; };
    fw.appendChild(ta);
    body.appendChild(fw);
  }, [
    fbtn("Save", "primary", function(){
      if (!draft.name) { toast("Give the team a name"); return; }
      var stem = String(draft.name).toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "team";
      var doc = {name:draft.name,
                 slots:draft.slots.filter(function(x){ return x && x.build_id; }),
                 notes:draft.notes || {}};
      (id ? put("teams/" + id, doc).then(function(){ return id; })
          : putNew("teams", stem, doc)).then(function(){
        leaveEditor("teams"); toast("Team saved");
      });
    }),
    fbtn(id ? "Delete" : "Cancel", id ? "danger" : "", function(){
      if (!id) { leaveEditor("teams"); return; }
      ask("Delete the team “" + draft.name + "”?",
          "The builds are not touched — only this arrangement of them.",
          "Delete", true).then(function(ok){
        if (!ok) return;
        drop("teams/" + id).then(function(){ leaveEditor("teams"); toast("Deleted"); });
      });
    })
  ]);
}

/* ------------------------------------------------------- what leaves here --
   The Item Clause lives in `teamPickItem`, which greys out what another slot
   already holds, and it is private: an item is a decision about the TEAM, so
   the only way to set one is through the slot that is being edited.

   `teamReport` and `teamTypes` are exported for PUBLIC, not for another part -
   the browser tests read the type table and the clause report straight off
   `window` and assert on them.
*/
export { drawTeams, teamReport, teamSheet, teamTypes };
