/* 08-teams.js - Six slots, the clauses checked, and what is still to get.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import { $, C, STONE_OF, byName, capNote, cardLine, el, labelBox, splitPct,
  toast, typeCard, typeChip, usageTag } from "./01-data.js";
import { S, buildLink, buildsFor, hasStone } from "./02-state.js";
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
  var row = typeCard(el("div", "row"),
    x.build ? (byName[x.build.mega || x.build.pokemon] ||
               byName[x.build.pokemon]) : null);
  var m = el("div", "rmain");
  var h = el("div", "rname");

  if (!x.build) {
    h.appendChild(el("span", "st", "Slot " + (i + 1) + " — empty"));
  } else {
    h.appendChild(document.createTextNode(x.build.pokemon));
    if (x.build.mega) h.appendChild(el("span", "tag mega", x.build.mega));
    if (x.state === "parked")
      h.appendChild(el("span", "tag warn", "in HOME — recall it first"));
    else if (x.state === "unbound")
      h.appendChild(el("span", "tag warn", "you do not have one yet"));
    else if (x.state === "orphan")
      h.appendChild(el("span", "tag bad", "its Pokemon is gone"));
    if (x.row && x.row.status === "rental")
      h.appendChild(el("span", "tag warn", "rental — cannot be trained"));
  }
  m.appendChild(h);

  if (x.build) {
    var meta = el("div", "rmeta");
    if (x.types) x.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
    meta.appendChild(el("span", "mono", (x.build.moves || []).length + " moves"));
    m.appendChild(meta);
    /* THE ITEM GETS A BOX OF ITS OWN, because on this screen it is the
       decision being made - the Item Clause is a team rule, so the six items
       are read down the column against each other. */
    m.appendChild(cardLine([
      labelBox(x.build.nature || null, "Nature"),
      labelBox(x.slot.item || null, "Item", "wide")
    ]));
    if (x.slot.why) m.appendChild(el("div", "st", x.slot.why));
  }
  row.appendChild(m);

  var side = el("div", "rside");
  var pick = el("button", "btn sm", x.build ? "Change" : "Fill");
  pick.onclick = function(e){
    e.stopPropagation();
    teamPickBuild(function(bid){
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

function teamPickBuild(onPick){
  openSheet("Which build?", function(body){
    var ids = Object.keys(S.builds).sort(function(a, b){
      return String(S.builds[a].pokemon).localeCompare(String(S.builds[b].pokemon));
    });
    if (!ids.length) {
      body.appendChild(el("div", "empty",
        "No builds yet. A team is made of builds, so write one first."));
      return;
    }
    var list = el("div", "list");
    ids.forEach(function(bid){
      var b = S.builds[bid], lk = buildLink(bid), p = byName[b.pokemon];
      var btn = el("button", "row");
      var m = el("div", "rmain");
      var h = el("div", "rname");
      h.appendChild(document.createTextNode(b.pokemon));
      /* several builds per species is the point, so the id is shown: it is
         what tells farigiraf from farigiraf-2 */
      if (buildsFor(b.pokemon).length > 1)
        h.appendChild(el("span", "tag", bid));
      if (b.role) h.appendChild(el("span", "tag", b.role));
      if (lk.state === "unbound")
        h.appendChild(el("span", "tag warn", "not owned yet"));
      if (lk.state === "parked") h.appendChild(el("span", "tag warn", "in HOME"));
      m.appendChild(h);
      var meta = el("div", "rmeta");
      if (p) p.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
      meta.appendChild(el("span", null, b.nature || "—"));
      meta.appendChild(el("span", "mono", (b.moves || []).join(", ") || "no moves"));
      m.appendChild(meta);
      btn.appendChild(m);
      btn.onclick = function(){ closeSheet(); onPick(bid); };
      list.appendChild(btn);
    });
    body.appendChild(list);
  }, [fbtn("Back", "", function(){ closeSheet(); })]);
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
    var wrap = el("div", "search field");
    wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    var inp = el("input"); inp.type = "text";
    inp.placeholder = "Filter " + (C.ITEMS || []).length + " items";
    wrap.appendChild(inp);
    body.appendChild(wrap);
    var list = el("div", "list");
    body.appendChild(list);

    function draw(){
      var q = inp.value.trim().toLowerCase();
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
        return !q || it[0].toLowerCase().indexOf(q) >= 0 ||
               String(it[3] || "").toLowerCase().indexOf(q) >= 0;
      });
      pool.forEach(function(it){
        var btn = el("button", "row" + (taken[it[0]] ? " illegal" : ""));
        if (taken[it[0]]) { btn.disabled = true; btn.style.opacity = "0.5"; }
        var m = el("div", "rmain");
        var h = el("div", "rname");
        h.appendChild(document.createTextNode(it[0]));
        if (taken[it[0]])
          h.appendChild(el("span", "tag bad", "another slot holds it"));
        /* How many of THIS slot's Pokemon hold this item on the ladder. The
           item is a team decision - the Item Clause makes it one - so the
           number belongs here, at the slot, and not on the build. */
        var who = draft.slots[i] && draft.slots[i].build
          && S.builds[draft.slots[i].build];
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
    inp.oninput = draw;
    draw();
  }, [fbtn("Back", "", function(){ closeSheet(); })]);
}

function drawTeams(){
  var host = $("listTeams");
  if (!host) return;
  host.innerHTML = "";
  var ids = Object.keys(S.teams).sort(function(a, b){
    return String(S.teams[a].name).localeCompare(String(S.teams[b].name));
  });
  if (!ids.length) {
    host.appendChild(el("div", "empty",
      "No teams yet. A team is six builds and the items they hold."));
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
