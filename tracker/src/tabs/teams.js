/* The Teams pane: the list, and the team editor - six slots, a build and an
   item in each. The Item Clause lives in teamPickItem: an item is a decision
   about the TEAM, so the only way to set one is through the slot being edited. */
import {
  bst, byName, byText, dexNo, MOVE_BY, natMult, plural, splitPct, STAT_KEYS,
} from "../core/data.js";
import { $, el, fbtn, note, searchField, toast } from "../core/dom.js";
import {
  activeAbility, baseAbility, buildLink, buildsFor, hasItem, hasStone, S,
} from "../core/state.js";
import { drop, patch, put, putNew } from "../core/store.js";
import {
  holdable, TEAM_SLOTS, teamDoc, teamReport, teamSlots, teamSpeeds, teamTypes,
} from "../core/team.js";
import {
  labelBox, numText, pokeCard, typeChip, typeSkin, usageTag,
} from "../ui/card.js";
import {
  ask, closeSheet, leaveEditor, openEditor, openSheet,
} from "../ui/nav.js";
import { buildSheet } from "./builds.js";

$("teamAdd").onclick = function(){ teamSheet(null, null); };
$("tSave").onclick = function(){
  patch("meta/trainer", {
    box_capacity:Number($("tCap").value) || 50
  }).then(function(){ toast("Box capacity saved"); });
};

/* One slot: which build, which item, and why it holds it.

   The BUILD is chosen, not the Pokemon - that is what lets three different
   Farigiraf be three different answers, and what makes editing a set update
   every team carrying it. The item is chosen here because the Item Clause is a
   team-level rule; the picker greys out anything another slot already holds
   rather than letting the clash happen and complaining afterwards. */
/* STRAIGHT INTO THE SET, from the screen where its problems are visible.

     "podria haber un acceso rapido si uno quisiera cambiar rapido una build
      en el team builder en vez de ir a la otra pestaña."  (player, 2026-09-21)

   THE TEAM IS WRITTEN FIRST, and that is not a convenience. Both editors are
   VIEWS - they stopped being sheets on 2026-09-13 precisely because a sheet
   on a sheet took every unsaved slot with it - so leaving for the build
   editor abandons this draft. Saving first is the only version of this that
   cannot lose work.

   A team that has never been saved has no id to write to, and inventing one
   would create a team he never asked for, so that case asks for a name
   instead of guessing. */
function teamEditBuild(draft, id, bid){
  var b = S.builds[bid];
  if (!b) { toast("That build is gone"); return; }
  if (!id) {
    toast("Name and save the team first — editing a build leaves this screen");
    return;
  }
  put("teams/" + id, teamDoc(draft)).then(function(){
    buildSheet(bid, b);
  });
}

function teamSlotRow(draft, id, x, i, redraw){
  /* A slot holds a Pokemon, so it wears one - the same card as everywhere
     else. Its type is the BUILD's Pokemon, Mega included when a stone is on
     it, because that is what walks onto the field. */
  var draw = x.build ? (byName[x.build.mega || x.build.pokemon] ||
                        byName[x.build.pokemon]) : null;
  var row, m;
  if (draw) {
    /* THE SET IT IS RUNNING, on the card. There is room for it - the card is
       already the tallest thing on the screen - and without it the six slots
       said a name, a nature and "4 moves", so checking what the team actually
       does meant opening six builds one at a time (player, 2026-09-21: "la
       card en team builder del pokemon es suficientemente grande como para
       mostrar el resumen de habilidad, Nature, SPs, moves"). */
    var ab = activeAbility(x.build);
    var spTxt = STAT_KEYS.map(function(k){
      return x.build.stat_points?.[k] || 0; }).join("/");
    row = pokeCard(draw, {
      tag: "div",
      name: x.build.pokemon,
      /* the ability the build CHOSE, not the three the species could have -
         a build's card shows only what the build points at */
      abValue: ab || "—",
      abLabel: x.build.mega ? "Ability after Mega" : "Ability",
      /* ONLY THE FORM THE BUILD PLAYS AS. This read `!x.build.mega`, which is
         the rule upside down: a Mega build is drawn as the Mega row, which has
         no line of its own, so the flag only ever took effect on a BASE build
         - and there it switched the species' whole Mega line ON, base and
         Mega side by side for a set that carries no stone (player,
         2026-09-27). */
      megas: false,
      /* THE ITEM GETS A CELL OF ITS OWN, because on this screen it is the
         decision being made - the Item Clause is a team rule, so the six
         items are read down the column against each other. */
      cells: [
        labelBox(x.build.nature || null, "Nature", "wide"),
        labelBox(x.slot.item || null, "Item", "wide"),
        labelBox(spTxt === "0/0/0/0/0/0" ? null : spTxt,
                 "SP  hp/atk/def/spa/spd/spe", "wide")
      ],
      badges: function(h){
        if (x.build.mega) h.appendChild(el("span", "tag mega", x.build.mega));
        if (x.state === "parked")
          h.appendChild(el("span", "tag warn", "in HOME — recall it first"));
        else if (x.state === "unbound")
          h.appendChild(el("span", "tag warn", "you do not have one yet"));
        else if (x.state === "orphan")
          h.appendChild(el("span", "tag bad", "its Pokemon is gone"));
        if (x.row?.status === "rental")
          h.appendChild(el("span", "tag warn", "rental — cannot be trained"));
      },
      meta: function(meta){
        meta.appendChild(el("span", "mono",
          (x.build.moves || []).length + " moves"));
      },
      notes: function(body){
        /* THE MOVE NAMES, not the count. A count tells you a set is finished;
           the names are what you read a team off. Each is its own chip so a
           phone breaks between them and never inside one. */
        var mv = el("div", "rmeta");
        mv.style.marginTop = "4px";
        if ((x.build.moves || []).length) {
          x.build.moves.forEach(function(n){
            var mrow = MOVE_BY[n];
            var sp2 = el("span", "tag");
            if (mrow) sp2.appendChild(typeChip(mrow.type));
            sp2.appendChild(document.createTextNode(n));
            mv.appendChild(sp2);
          });
        } else {
          mv.appendChild(el("span", "st", "no moves yet"));
        }
        body.appendChild(mv);
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
    var ed = el("button", "btn sm", "Edit set");
    ed.title = "Open this build's editor — the team is saved first";
    ed.onclick = function(e){
      e.stopPropagation();
      teamEditBuild(draft, id, x.slot.build_id);
    };
    side.appendChild(ed);
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
  (draft?.slots || []).forEach(function(sl, j){
    if (j === idx || !sl?.build_id) return;
    var ob = S.builds[sl.build_id];
    if (ob?.pokemon) taken[ob.pokemon] = 1;
  });
  var F = {role:{}, type:{}, sort:"az"};
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
      var hay = [bid, b.pokemon, b.mega, b.role, b.nature, baseAbility(b),
                 activeAbility(b), b.rationale, (b.moves || []).join(" "),
                 p ? p.types.join(" ") : "",
                 byName[b.pokemon] ? dexNo(b.pokemon) : ""]
        .filter(Boolean).join(" ").toLowerCase();
      return {id:bid, b:b, p:p, lk:lk, hay:hay,
              types: p?.types || [],
              role: (b.role || "").trim(),
              bst: p ? bst(p) : -1,
              dex: byName[b.pokemon] ? dexNo(b.pokemon) : 99999,
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

    /* A–Z AND DEX, AND THE STATS ARE ALL OR NONE.

         "el sort de ready first speed bst son super random??? me basta con el
          orden de a-z, dex, y si voy a poner bst y speed, entonces tambien
          importan los de atk, def, spa, spd..."   (player, 2026-09-21)

       He is right twice. "Ready first" was sorting by where the copy lives,
       which is the same box question the filter above it lost. And offering
       BST and Speed but not the other four is a half-set: there is no reason
       Speed is a sort and Attack is not. So the two he asked for are the row,
       and the six stats plus BST are complete, together, behind a fold - the
       same shape the Role chips take, for the same reason. */
    var SORTS = [["az", "A\u2013Z"], ["dex", "Dex no."]];
    var STATSORTS = [["bst", "BST"], ["hp", "HP"], ["atk", "Atk"],
                     ["def", "Def"], ["spa", "SpA"], ["spd", "SpD"],
                     ["spe", "Spe"]];
    var srow = el("div", "toggles"); srow.style.marginBottom = "8px";
    var strow2 = el("div", "toggles");
    strow2.style.margin = "0 0 8px";
    strow2.hidden = true;
    function sortBtn(row, key, text){
      var t = el("button", "tog", text);
      t.setAttribute("aria-pressed", F.sort === key ? "true" : "false");
      t.onclick = function(){
        F.sort = key;
        [srow, strow2].forEach(function(g){
          Array.prototype.forEach.call(g.children, function(x){
            x.setAttribute("aria-pressed", x === t ? "true" : "false");
          });
        });
        draw();
      };
      row.appendChild(t);
    }
    SORTS.forEach(function(o){ sortBtn(srow, o[0], o[1]); });
    STATSORTS.forEach(function(o){ sortBtn(strow2, o[0], o[1]); });
    body.appendChild(label("Sort"));
    body.appendChild(srow);
    var stog = el("button", "btn sm fold inline");
    stog.type = "button";
    stog.setAttribute("aria-expanded", "false");
    var scaret = el("span", "foldcaret");
    scaret.innerHTML = "&#9656;";
    stog.appendChild(scaret);
    stog.appendChild(el("span", null, "By a stat"));
    stog.appendChild(el("span", "n", String(STATSORTS.length)));
    stog.onclick = function(){
      var open = strow2.hidden;
      strow2.hidden = !open;
      stog.setAttribute("aria-expanded", open ? "true" : "false");
      scaret.innerHTML = open ? "&#9662;" : "&#9656;";
    };
    body.appendChild(stog);
    body.appendChild(strow2);

    /* NO "WHERE IT IS" FILTER HERE. It had one - ready today / in HOME / not
       owned - and it was answering a question this screen does not ask
       (player, 2026-09-21):

         "quiero que saques lo de donde esta, porque podria crear incluso un
          team teorico y no necesito saber eso, el donde esta, origen, entre
          otros pertenece a las cajas."

       Which is right, and it is the same rule that made a build its own thing
       in the first place: a team can be written down before a single one of
       its six exists. Where a copy is living is a fact about the BOX, and the
       Box and HOME tabs are the screens for it. The slot rows still say it -
       a badge on the one you picked is information, not a filter - and
       `teamReport` still counts what is playable today above the six. */

    /* WHAT JOB IT DOES. `role` is typed by hand, so the chips are the
       distinct roles that exist, matched case-insensitively and labelled with
       the spelling first used.

       FOLDED, AND IT STAYS FOLDED. With a role per build these are as many
       chips as there are builds, so the list you came here to read was pushed
       off the screen by the controls above it (player, 2026-09-21: "el role
       podria ir oculto o plegado siempre, ocupa demasiado espacio"). The
       count rides on the button, so what is in there is visible without
       opening it. */
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
      var rrow = el("div", "toggles");
      rrow.style.margin = "0 0 8px";
      rrow.hidden = true;
      roleKeys.forEach(function(k){
        chip(rrow, "role", k, roleText[k] + " \u00b7 " + roleN[k]);
      });
      var rtog = el("button", "btn sm fold inline");
      rtog.type = "button";
      rtog.setAttribute("aria-expanded", "false");
      var caret = el("span", "foldcaret");
      caret.innerHTML = "&#9656;";
      rtog.appendChild(caret);
      rtog.appendChild(el("span", null, "Role"));
      var rn = el("span", "n", String(roleKeys.length));
      rtog.appendChild(rn);
      rtog.onclick = function(){
        var open = rrow.hidden;
        rrow.hidden = !open;
        rtog.setAttribute("aria-expanded", open ? "true" : "false");
        caret.innerHTML = open ? "&#9662;" : "&#9656;";
      };
      body.appendChild(rtog);
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
    tKeys.sort(byText);
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
      var ro = Object.keys(F.role), ty = Object.keys(F.type);
      var hits = rows.filter(function(r){
        if (q && !r.hay.includes(q)) return false;
        if (ro.length && !ro.includes(r.role.toLowerCase())) return false;
        if (ty.length && !r.types.some(function(t){ return ty.includes(t); }))
          return false;
        return true;
      });
      /* A stat sort reads the FORM THE BUILD PLAYS AS, Mega included - the
         same row every other number on this card comes from. A build with no
         dex row sorts last rather than at zero. */
      var IDX = {hp:0, atk:1, def:2, spa:3, spd:4, spe:5};
      hits.sort(function(a, b){
        if (F.sort === "dex")
          return a.dex - b.dex || a.b.pokemon.localeCompare(b.b.pokemon);
        if (F.sort === "bst")
          return b.bst - a.bst || a.b.pokemon.localeCompare(b.b.pokemon);
        if (IDX[F.sort] != null) {
          var k = IDX[F.sort];
          var av = a.p ? a.p.b[k] : -1, bv = b.p ? b.p.b[k] : -1;
          return bv - av || a.b.pokemon.localeCompare(b.b.pokemon);
        }
        return a.b.pokemon.localeCompare(b.b.pokemon) || a.id.localeCompare(b.id);
      });
      /* A SPECIES ANOTHER SLOT HOLDS GOES LAST, and is not hidden: the clause
         is the reason it cannot be picked, and that is worth reading once.
         Stable, so it re-orders the chosen sort rather than replacing it. */
      hits.sort(function(a, b){ return (a.dupe ? 1 : 0) - (b.dupe ? 1 : 0); });

      count.textContent = hits.length === rows.length
        ? plural(rows.length, "build")
        : hits.length + " of " + rows.length + " builds";
      list.innerHTML = "";
      hits.forEach(function(r){ list.appendChild(buildPickRow(r, onPick)); });
      if (!hits.length) {
        list.appendChild(el("div", "empty",
          q || ro.length || ty.length ? "Nothing matches" : "No builds yet"));
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
    /* the one it CHOSE, not the three the species could have had - a build's
       card shows only what the build points at */
    abValue: activeAbility(b) || "\u2014",
    abLabel: b.mega ? "Ability after Mega" : "Ability",
    /* a build shows only the form it points at, the same as its slot */
    megas: false,
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
    if (j !== i && sl?.item) taken[sl.item] = 1;
  });
  openSheet("Which item?", function(body){
    body.appendChild(el("p", "sub",
      "One item per team — the Item Clause. Anything another slot already " +
      "holds is greyed out."));
    var POOL = holdable();
    var inp = searchField(body, "Search " + POOL.length +
      " holdable items \u2014 name or effect", function(){ draw(); });

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
    POOL.forEach(function(x){ nCat[x.cat] = (nCat[x.cat] || 0) + 1; });
    var crow = el("div", "toggles"); crow.style.marginBottom = "8px";
    ["Hold Items", "Berries", "Mega Stones"].forEach(function(k){
      if (!nCat[k]) return;
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
      var pool = POOL.filter(function(x){
        if (cats.length && !cats.includes(x.cat)) return false;
        /* a stone is owned when the STONE ledger says so, not the item one -
           they are two different tables and always have been */
        if (F.own && !(x.stone ? hasStone(x.name) : hasItem(x.name))) return false;
        return !q || x.name.toLowerCase().includes(q) ||
               x.text.toLowerCase().includes(q);
      });
      count.textContent = pool.length === POOL.length
        ? POOL.length + " holdable items"
        : pool.length + " of " + POOL.length + " holdable items";
      if (!pool.length) {
        list.appendChild(el("div", "empty", F.own
          ? "Nothing you own matches" : "Nothing matches"));
      }
      pool.forEach(function(x){
        var btn = el("button", "row" + (taken[x.name] ? " illegal" : ""));
        if (taken[x.name]) { btn.disabled = true; btn.style.opacity = "0.5"; }
        var m = el("div", "rmain");
        var h = el("div", "rname");
        h.appendChild(document.createTextNode(x.name));
        if (x.stone) h.appendChild(el("span", "tag mega", "Mega Stone"));
        if (taken[x.name])
          h.appendChild(el("span", "tag bad", "another slot holds it"));
        /* owned or not, said on the row - otherwise the filter above is the
           only place the fact exists, and a filter you have to turn on to
           read is not an answer */
        else if (!(x.stone ? hasStone(x.name) : hasItem(x.name)))
          h.appendChild(el("span", "tag warn", x.vp ? x.vp + " VP" : "not owned"));
        /* How many of THIS slot's Pokemon hold this item on the ladder. The
           item is a team decision - the Item Clause makes it one - so the
           number belongs here, at the slot, and not on the build. */
        /* `build_id`, not `build` - a slot has never had a `build` field, so
           this read undefined and the usage tag never appeared on a single
           item. The one number on this screen that says what other players
           hold, and it was silently off. */
        var who = draft.slots[i]?.build_id
          && S.builds[draft.slots[i].build_id];
        var utag = who ? usageTag(splitPct(who.pokemon, "i", x.name),
                                  who.pokemon, "i") : null;
        if (utag) h.appendChild(utag);
        m.appendChild(h);
        /* whole, not the first 120 characters: the cut landed exactly where
           an item says when it does NOT work */
        if (x.text) m.appendChild(numText(x.text, "div", "st"));
        btn.appendChild(m);
        if (!taken[x.name]) btn.onclick = function(){
          draft.slots[i].item = x.name;
          closeSheet();
          /* why it holds it - the half of teams.json that is not derivable */
          openSheet(x.name + " on " + S.builds[draft.slots[i].build_id]?.pokemon,
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
  var q = ($("teamSearch")?.value || "").trim().toLowerCase();
  var ids = all.filter(function(id){
    if (!q) return true;
    var t = S.teams[id];
    var hay = [t.name, t.notes?.idea || ""];
    (t.slots || []).forEach(function(sl){
      if (sl?.item) hay.push(sl.item);
      var b = sl?.build_id && S.builds[sl.build_id];
      if (b) hay.push(b.pokemon, b.mega, b.role);
    });
    return hay.filter(Boolean).join(" ").toLowerCase().includes(q);
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
  var draft = structuredClone(t || {name:"", slots:[], notes:{}});
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
      list.appendChild(teamSlotRow(draft, id, x, i, redraw));
    });
    body.appendChild(list);

    /* ONE SELECTOR, BOTH SECTIONS. The Speed order and the type table are
       two readings of the same battle, so they cannot be allowed to disagree
       on screen - and they did: the order listed four Megas at once while the
       table had just learned that only one of them happens.

         "creo que el selector de mega es mas honesto no? porque el pokemon
          solo cambia de stat al mega evolucionar y si no mega evoluciona la
          tabla de speed no cambia."   (player, 2026-09-21)

       Exactly so. An unevolved slot is its base row whatever stone it holds,
       so the honest unit is a WORLD - nobody evolved, or this one did - and
       both sections are drawn from it. */
    var SCEN = [{at: null, tab: r.megaCases.length ? "Nobody evolves" : "The six",
                 why: "Every one of them in base form. Mega Evolution resolves "
                    + "after switch-ins, so this is what takes the first hit "
                    + "\u2014 and staying here to resist something is a play, "
                    + "not a delay."}];
    r.megaCases.forEach(function(x){
      var bits = [];
      if (x.retype) bits.push(x.from.join("/") + " \u2192 " + x.to.join("/"));
      if (x.respeed) bits.push("Speed " + x.speFrom + " \u2192 " + x.speTo);
      SCEN.push({at: x.i, tab: x.mega,
                 why: x.name + " Mega Evolves: " + bits.join(", ")
                    + ". Only one Pokemon may Mega Evolve per battle, so this "
                    + "is a different team from the others, never an upgrade "
                    + "to them."});
    });
    var scenAt = {v: null};
    var scenWhy = null, speedBox = null, typeBox = null;

    if (SCEN.length > 1) {
      body.appendChild(el("h2", null, "Which one Mega Evolves"));
      body.appendChild(el("p", "sub", "A Pokemon only takes the Mega's stats "
        + "and typing by evolving, and only one may do it per battle \u2014 so "
        + "these are " + SCEN.length + " different teams, not one. The Speed "
        + "order and the weaknesses below both follow this choice."));
      var seg = el("div", "seg");
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", "Which one Mega Evolves");
      SCEN.forEach(function(sc){
        var b2 = el("button", null, sc.tab);
        b2.setAttribute("aria-pressed", sc.at === scenAt.v ? "true" : "false");
        b2.onclick = function(){
          scenAt.v = sc.at;
          Array.prototype.forEach.call(seg.children, function(x){
            x.setAttribute("aria-pressed", x === b2 ? "true" : "false");
          });
          paintScenario();
        };
        seg.appendChild(b2);
      });
      body.appendChild(seg);
      scenWhy = el("p", "sub");
      body.appendChild(scenWhy);
    }

    if (r.speeds.length > 1) {
      body.appendChild(el("h2", null, "Speed order"));
      speedBox = el("div", "note");
      body.appendChild(speedBox);
    }

    if (r.filled) {
      body.appendChild(el("h2", null, "What the six are weak to"));
      typeBox = el("div");
      body.appendChild(typeBox);
    }
    paintScenario();

    /* ONE WORLD AT A TIME, drawn into both boxes from the same choice. This
       is what keeps the Speed order and the weaknesses from ever telling two
       different stories about the same battle. */
    function paintScenario(){
      var cur = SCEN.find(function(x){ return x.at === scenAt.v; })
                || SCEN[0];
      if (scenWhy) scenWhy.textContent = cur.why;
      if (speedBox) paintSpeeds(speedBox, teamSpeeds(r, cur.at));
      if (typeBox) paintTypes(typeBox, teamTypes(r, cur.at));
    }

    /* WHERE EACH NUMBER CAME FROM, on its own line: the base, the SP spent
       on it and what the nature did. Without that a Speed order is six
       numbers you have to take on trust, and the SP is the half he can still
       change. The evolved one is written in the Mega's ink so the row that
       changed is the one that stands out. */
    function paintSpeeds(host, rows){
      host.innerHTML = "";
      rows.forEach(function(x){
        var line = el("div");
        line.style.marginBottom = "3px";
        var nm = el("strong", null, x.form);
        if (x.mega) nm.style.color = "var(--mega)";
        line.appendChild(nm);
        var num = el("span", "mono");
        num.style.margin = "0 6px";
        num.textContent = String(x.spe);
        line.appendChild(num);
        var how = el("span");
        how.style.color = "var(--faint)";
        how.textContent = x.base + " base"
          + (x.sp ? " + " + x.sp + " SP" : "")
          + (natMult(x.nature, "spe") !== 1
             ? "  ×" + natMult(x.nature, "spe") + " " + x.nature : "");
        line.appendChild(how);
        host.appendChild(line);
      });
      var sfoot = el("div", "st");
      sfoot.style.marginTop = "6px";
      sfoot.textContent = "At level 50, with each build's own SP and nature. "
        + "Fastest first — so the bottom of the list is what moves first "
        + "under Trick Room.";
      host.appendChild(sfoot);
    }

    /* EVERY TYPE THAT HITS ANY OF THEM, never the first six (player,
       2026-09-21: "no debería tener límite de tipo que mostrar tanto para
       weak como para resists"). The list is sorted worst first, so a cap at
       six silently dropped the tail - and the tail is where a single x4 sits.
       A Chesnaught weak to Flying x4 was invisible behind six shared
       weaknesses, which is exactly the hole the table exists to find. */
    function paintTypes(host, all){
      var tt = all.filter(function(x){ return x.weak; });
      host.innerHTML = "";
      if (!tt.length) {
        host.appendChild(el("div", "note", "Nothing on the team is weak to "
          + "anything."));
        return;
      }
      /* EVERY NAME CARRIES ITS OWN MULTIPLIER (player, 2026-09-21: "tampoco
         dice el multiplicador de x por cuanto resiste o por cuanto es
         debil"). Not only the outliers: x4 and x2 are different problems, and
         so are x0.25, x0.5 and an outright immunity. Which one it is decides
         whether a shared weakness is worth restructuring the team for. */
      var say = function(list){
        return list.map(function(e){
          return e.name + " \u00d7" + (e.m === 0 ? "0" : e.m);
        }).join(", ");
      };
      var grid = el("div", "typegrid");
      host.appendChild(grid);
      tt.forEach(function(x){
        var d = el("div", "st");
        var head = el("div");
        head.appendChild(typeChip(x.type));
        if (x.weak >= 3) head.appendChild(el("span", "tag bad",
          x.weak + " of the six"));
        d.appendChild(head);
        var wk = el("div");
        wk.style.color = "var(--bad)";
        wk.textContent = "weak: " + say(x.weakOf);
        d.appendChild(wk);
        /* the other half of the answer, and the one that decides whether a
           shared weakness is actually a problem: who can take the hit */
        var rs = el("div");
        rs.style.color = x.resistOf.length ? "var(--ok)" : "var(--faint)";
        rs.textContent = x.resistOf.length
          ? "resists: " + say(x.resistOf)
          : "nothing on the team resists it";
        d.appendChild(rs);
        grid.appendChild(d);
      });
    }

    var fw = el("div", "field");
    fw.appendChild(el("label", "f", "The idea"));
    var ta = el("textarea");
    ta.value = draft.notes?.idea || "";
    ta.oninput = function(){
      draft.notes = draft.notes || {}; draft.notes.idea = ta.value; };
    fw.appendChild(ta);
    body.appendChild(fw);
  }, [
    fbtn("Save", "primary", function(){
      if (!draft.name) { toast("Give the team a name"); return; }
      var stem = String(draft.name).toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "team";
      var doc = teamDoc(draft);
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

export { drawTeams, teamSheet };
