/* The Teams pane: the list, and the team editor - six slots, a build and an
   item in each. The Item Clause lives in teamPickItem: an item is a decision
   about the TEAM, so the only way to set one is through the slot being edited. */
import {
  bst, byName, byText, dexNo, MOVE_BY, natMult, plural, splitPct, STAT_KEYS,
} from "../core/data.js";
import {
  $, el, fbtn, filterLabel, note, searchField, setPressed, toast,
} from "../core/dom.js";
import {
  activeAbility, baseAbility, buildLink, buildsFor, hasItem, hasStone, S,
} from "../core/state.js";
import { drop, put, putNew } from "../core/store.js";
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

/* ================================================================ the list */
function drawTeams(){
  const host = $("listTeams");
  if (!host) return;
  host.innerHTML = "";
  const all = Object.keys(S.teams).sort(function(a, b){
    return String(S.teams[a].name).localeCompare(String(S.teams[b].name));
  });
  if (!all.length) {
    host.appendChild(el("div", "empty",
      "No teams yet. A team is six builds and the items they hold."));
    return;
  }
  const q = ($("teamSearch")?.value || "").trim().toLowerCase();
  const ids = all.filter(function(id){ return !q || teamMatches(S.teams[id], q); });
  if (!ids.length) {
    host.appendChild(el("div", "empty", "No team matches"));
    return;
  }
  ids.forEach(function(id){ host.appendChild(teamRow(id, S.teams[id])); });
}

/* THE MEMBERS ARE SEARCHED TOO, and the items with them. "Which team is my
   Farigiraf in" and "who is holding the Sitrus Berry" are both questions
   about a Pokemon, asked at the list rather than by opening six teams. */
function teamMatches(t, q){
  const hay = [t.name, t.notes?.idea || ""];
  (t.slots || []).forEach(function(sl){
    if (sl?.item) hay.push(sl.item);
    const b = sl?.build_id && S.builds[sl.build_id];
    if (b) hay.push(b.pokemon, b.mega, b.role);
  });
  return hay.filter(Boolean).join(" ").toLowerCase().includes(q);
}

/* One team in the list: its name, how many slots are filled, how many can be
   brought today, whether anything breaks a clause, and who is in it. */
function teamRow(id, t){
  const r = teamReport(t);
  const row = el("button", "row");
  const m = el("div", "rmain");
  const h = el("div", "rname");
  h.appendChild(document.createTextNode(t.name || "Untitled"));
  h.appendChild(el("span", "tag" + (r.filled === TEAM_SLOTS ? " ok" : ""),
    r.filled + "/" + TEAM_SLOTS));
  if (r.ready < r.filled)
    h.appendChild(el("span", "tag warn", r.ready + " playable today"));
  if (r.problems.length)
    h.appendChild(el("span", "tag bad", r.problems.length + " illegal"));
  m.appendChild(h);
  const meta = el("div", "rmeta");
  r.slots.filter(function(x){ return x.name; }).forEach(function(x){
    meta.appendChild(el("span", null, x.name));
  });
  m.appendChild(meta);
  row.appendChild(m);
  row.onclick = function(){ teamSheet(id, t); };
  return row;
}

/* ========================================================== the team editor
   A view, not a sheet: a sheet on a sheet took every unsaved slot with it.
   `draft` is the team being edited; nothing is written until Save.
   redraw() re-renders it in place from the draft - it used to close a sheet
   and open a new one, which is why a Back from the item picker took the
   whole team with it. */
function teamSheet(id, t){
  const draft = structuredClone(t || {name:"", slots:[], notes:{}});
  draft.slots = teamSlots(draft);
  function redraw(){ teamSheet(id, draft); }

  openEditor("teamedit", draft.name || "New team", function(body){
    nameField(body, draft);
    const r = teamReport(draft);
    teamVerdict(body, r);
    body.appendChild(el("h2", null, "The six"));
    const list = el("div", "list");
    r.slots.forEach(function(x, i){
      list.appendChild(teamSlotRow(draft, id, x, i, redraw));
    });
    body.appendChild(list);
    scenarioSection(body, r);
    ideaField(body, draft);
  }, [
    fbtn("Save", "primary", function(){ saveTeam(id, draft); }),
    fbtn(id ? "Delete" : "Cancel", id ? "danger" : "", function(){ deleteTeam(id, draft); })
  ]);
}

function nameField(body, draft){
  const fn = el("div", "field");
  fn.appendChild(el("label", "f", "Name"));
  const inp = el("input"); inp.type = "text"; inp.value = draft.name || "";
  inp.oninput = function(){ draft.name = inp.value; };
  fn.appendChild(inp);
  body.appendChild(fn);
}

/* What is wrong first, because a team that cannot be registered is not a
   team - the clauses are measured facts about this format, not opinions.
   Then what he HAS, where it is and what is still missing, so a team can be
   four-sixths real and still worth writing. */
function teamVerdict(body, r){
  r.problems.forEach(function(msg){
    body.appendChild(note("bad", "<strong>Illegal.</strong> " + msg));
  });
  r.warnings.forEach(function(msg){
    body.appendChild(note("warn", msg));
  });
  let line = r.ready + " of " + r.filled + " ready to bring";
  if (r.missing.length)
    line += " · still to get: " + r.missing.join(", ");
  if (r.filled < TEAM_SLOTS)
    line += " · " + (TEAM_SLOTS - r.filled) + " slot" +
            (TEAM_SLOTS - r.filled > 1 ? "s" : "") + " empty";
  body.appendChild(el("div", "note", line));
}

function ideaField(body, draft){
  const fw = el("div", "field");
  fw.appendChild(el("label", "f", "The idea"));
  const ta = el("textarea");
  ta.value = draft.notes?.idea || "";
  ta.oninput = function(){
    draft.notes = draft.notes || {}; draft.notes.idea = ta.value; };
  fw.appendChild(ta);
  body.appendChild(fw);
}

/* SAVE. A new team asks the database for a free id derived from its name
   (see putNew); an edit keeps its own. */
function saveTeam(id, draft){
  if (!draft.name) { toast("Give the team a name"); return; }
  const stem = String(draft.name).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "team";
  const doc = teamDoc(draft);
  (id ? put("teams/" + id, doc).then(function(){ return id; })
      : putNew("teams", stem, doc)).then(function(){
    leaveEditor("teams"); toast("Team saved");
  });
}

/* DELETE, after asking - or, for a team never saved, just leave. The builds
   are not touched. */
function deleteTeam(id, draft){
  if (!id) { leaveEditor("teams"); return; }
  ask("Delete the team “" + draft.name + "”?",
      "The builds are not touched — only this arrangement of them.",
      "Delete", true).then(function(ok){
    if (!ok) return;
    drop("teams/" + id).then(function(){ leaveEditor("teams"); toast("Deleted"); });
  });
}

/* ----------------------------------------------------- which one evolves --
   ONE SELECTOR, BOTH SECTIONS. The Speed order and the type table are two
   readings of the same battle, so they cannot be allowed to disagree on
   screen - and they did: the order listed four Megas at once while the table
   had just learned that only one of them happens.

     "creo que el selector de mega es mas honesto no? porque el pokemon solo
      cambia de stat al mega evolucionar y si no mega evoluciona la tabla de
      speed no cambia."   (player, 2026-09-21)

   An unevolved slot is its base row whatever stone it holds, so the honest
   unit is a WORLD - nobody evolved, or this one did - and both sections are
   drawn from the one chosen. */
function scenarioSection(body, r){
  const SCEN = scenarios(r);
  const scenAt = {v: null};
  let scenWhy = null, speedBox = null, typeBox = null;
  function paintScenario(){
    const cur = SCEN.find(function(x){ return x.at === scenAt.v; }) || SCEN[0];
    if (scenWhy) scenWhy.textContent = cur.why;
    if (speedBox) paintSpeeds(speedBox, teamSpeeds(r, cur.at));
    if (typeBox) paintTypes(typeBox, teamTypes(r, cur.at));
  }
  if (SCEN.length > 1) {
    body.appendChild(el("h2", null, "Which one Mega Evolves"));
    body.appendChild(el("p", "sub", "A Pokemon only takes the Mega's stats "
      + "and typing by evolving, and only one may do it per battle — so "
      + "these are " + SCEN.length + " different teams, not one. The Speed "
      + "order and the weaknesses below both follow this choice."));
    body.appendChild(scenarioButtons(SCEN, scenAt, paintScenario));
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
}

/* The worlds to choose between: nobody evolves, then one per slot whose Mega
   changes its typing or its Speed. */
function scenarios(r){
  const SCEN = [{at: null, tab: r.megaCases.length ? "Nobody evolves" : "The six",
               why: "Every one of them in base form. Mega Evolution resolves "
                  + "after switch-ins, so this is what takes the first hit "
                  + "— and staying here to resist something is a play, "
                  + "not a delay."}];
  r.megaCases.forEach(function(x){
    const bits = [];
    if (x.retype) bits.push(x.from.join("/") + " → " + x.to.join("/"));
    if (x.respeed) bits.push("Speed " + x.speFrom + " → " + x.speTo);
    SCEN.push({at: x.i, tab: x.mega,
               why: x.name + " Mega Evolves: " + bits.join(", ")
                  + ". Only one Pokemon may Mega Evolve per battle, so this "
                  + "is a different team from the others, never an upgrade "
                  + "to them."});
  });
  return SCEN;
}

/* The segmented control that picks the world. */
function scenarioButtons(SCEN, scenAt, paint){
  const seg = el("div", "seg");
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", "Which one Mega Evolves");
  SCEN.forEach(function(sc){
    const b2 = el("button", null, sc.tab);
    setPressed(b2, sc.at === scenAt.v);
    b2.onclick = function(){
      scenAt.v = sc.at;
      Array.prototype.forEach.call(seg.children, function(x){
        setPressed(x, x === b2);
      });
      paint();
    };
    seg.appendChild(b2);
  });
  return seg;
}

/* WHERE EACH NUMBER CAME FROM, on its own line: the base, the SP spent on it
   and what the nature did. Without that a Speed order is six numbers to take
   on trust, and the SP is the half he can still change. The evolved one is
   written in the Mega's ink so the row that changed is the one that stands
   out. */
function paintSpeeds(host, rows){
  host.innerHTML = "";
  rows.forEach(function(x){
    const line = el("div", "mb3");
    const nm = el("strong", null, x.form);
    if (x.mega) nm.classList.add("c-mega");
    line.appendChild(nm);
    const num = el("span", "mono mx6");
    num.textContent = String(x.spe);
    line.appendChild(num);
    const how = el("span", "c-faint");
    how.textContent = x.base + " base"
      + (x.sp ? " + " + x.sp + " SP" : "")
      + (natMult(x.nature, "spe") !== 1
         ? "  ×" + natMult(x.nature, "spe") + " " + x.nature : "");
    line.appendChild(how);
    host.appendChild(line);
  });
  const sfoot = el("div", "st mt6");
  sfoot.textContent = "At level 50, with each build's own SP and nature. "
    + "Fastest first — so the bottom of the list is what moves first "
    + "under Trick Room.";
  host.appendChild(sfoot);
}

/* EVERY TYPE THAT HITS ANY OF THEM, never the first six (player, 2026-09-21:
   "no debería tener límite de tipo que mostrar tanto para weak como para
   resists"). Sorted worst first, so a cap silently dropped the tail - and the
   tail is where a single x4 sits: a Chesnaught weak to Flying x4 was
   invisible behind six shared weaknesses, the exact hole this table exists to
   find. Each type says who is weak to it and who resists it. */
function paintTypes(host, all){
  const tt = all.filter(function(x){ return x.weak; });
  host.innerHTML = "";
  if (!tt.length) {
    host.appendChild(el("div", "note", "Nothing on the team is weak to "
      + "anything."));
    return;
  }
  const grid = el("div", "typegrid");
  host.appendChild(grid);
  tt.forEach(function(x){
    const d = el("div", "st");
    const head = el("div");
    head.appendChild(typeChip(x.type));
    if (x.weak >= 3) head.appendChild(el("span", "tag bad",
      x.weak + " of the six"));
    d.appendChild(head);
    const wk = el("div", "c-bad");
    wk.textContent = "weak: " + withMultipliers(x.weakOf);
    d.appendChild(wk);
    /* the other half of the answer, and the one that decides whether a
       shared weakness is actually a problem: who can take the hit */
    const rs = el("div", x.resistOf.length ? "c-good" : "c-faint");
    rs.textContent = x.resistOf.length
      ? "resists: " + withMultipliers(x.resistOf)
      : "nothing on the team resists it";
    d.appendChild(rs);
    grid.appendChild(d);
  });
}

/* "Chesnaught ×4, Incineroar ×2". EVERY NAME CARRIES ITS OWN MULTIPLIER
   (player, 2026-09-21: "tampoco dice el multiplicador de x por cuanto
   resiste o por cuanto es debil"): x4 and x2 are different problems, and so
   are x0.25, x0.5 and an immunity. */
function withMultipliers(list){
  return list.map(function(e){
    return e.name + " ×" + (e.m === 0 ? "0" : e.m);
  }).join(", ");
}

/* ================================================================ a slot ==
   One slot: which build, which item, and why it holds it.

   The BUILD is chosen, not the Pokemon - that is what lets three different
   Farigiraf be three different answers, and what makes editing a set update
   every team carrying it. The item is chosen here because the Item Clause is
   a team-level rule. */
function teamSlotRow(draft, id, x, i, redraw){
  let row = x.build ? slotCard(x) : null;
  if (!row) {
    row = el("div", "row");
    const m = el("div", "rmain");
    const h = el("div", "rname");
    h.appendChild(el("span", "st", "Slot " + (i + 1) + " — empty"));
    m.appendChild(h);
    row.appendChild(m);
  }
  row.appendChild(slotButtons(draft, id, x, i, redraw));
  return row;
}

/* A filled slot wears the same card as everywhere else, typed as the BUILD's
   Pokemon - the Mega when a stone is on it, because that is what walks onto
   the field - and carrying the set it runs: the ability it chose, its nature,
   its item, its SP and its moves. Checking what a team does used to mean
   opening six builds (player, 2026-09-21: "la card en team builder del
   pokemon es suficientemente grande como para mostrar el resumen de
   habilidad, Nature, SPs, moves"). Returns null for a build whose Pokemon
   the dex does not carry. */
function slotCard(x){
  const draw = byName[x.build.mega || x.build.pokemon] || byName[x.build.pokemon];
  if (!draw) return null;
  const ab = activeAbility(x.build);
  const spTxt = STAT_KEYS.map(function(k){
    return x.build.stat_points?.[k] || 0; }).join("/");
  return pokeCard(draw, {
    tag: "div",
    name: x.build.pokemon,
    abValue: ab || "—",
    abLabel: x.build.mega ? "Ability after Mega" : "Ability",
    /* ONLY THE FORM THE BUILD PLAYS AS: a Mega build is drawn as the Mega
       row, and a base build must not grow the species' whole Mega line
       beside a set that carries no stone (player, 2026-09-27). */
    megas: false,
    /* THE ITEM GETS A CELL OF ITS OWN, because on this screen it is the
       decision being made - the six items are read down the column against
       each other. */
    cells: [
      labelBox(x.build.nature || null, "Nature", "wide"),
      labelBox(x.slot.item || null, "Item", "wide"),
      labelBox(spTxt === "0/0/0/0/0/0" ? null : spTxt,
               "SP  hp/atk/def/spa/spd/spe", "wide")
    ],
    badges: function(h){ slotBadges(h, x); },
    meta: function(meta){
      meta.appendChild(el("span", "mono",
        (x.build.moves || []).length + " moves"));
    },
    notes: function(body){ slotMoves(body, x); }
  });
}

/* The Mega it runs, and whether it can be brought today. */
function slotBadges(h, x){
  if (x.build.mega) h.appendChild(el("span", "tag mega", x.build.mega));
  if (x.state === "parked")
    h.appendChild(el("span", "tag warn", "in HOME — recall it first"));
  else if (x.state === "unbound")
    h.appendChild(el("span", "tag warn", "you do not have one yet"));
  else if (x.state === "orphan")
    h.appendChild(el("span", "tag bad", "its Pokemon is gone"));
  if (x.row?.status === "rental")
    h.appendChild(el("span", "tag warn", "rental — cannot be trained"));
}

/* THE MOVE NAMES, not the count: a count tells you a set is finished, the
   names are what you read a team off. Each is its own chip so a phone breaks
   between them and never inside one. Then why the slot holds its item. */
function slotMoves(body, x){
  const mv = el("div", "rmeta mt4");
  if ((x.build.moves || []).length) {
    x.build.moves.forEach(function(n){
      const mrow = MOVE_BY[n];
      const sp2 = el("span", "tag");
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

/* The slot's buttons: pick or change the build, set the item, open the set
   in the build editor, empty the slot. */
function slotButtons(draft, id, x, i, redraw){
  const side = el("div", "rside");
  const pick = el("button", "btn sm", x.build ? "Change" : "Fill");
  pick.onclick = function(e){
    e.stopPropagation();
    /* the draft and the slot index go in, so the picker can grey out a
       species another slot already holds - the Species Clause enforced where
       the choice is made, exactly like the Item Clause */
    teamPickBuild(draft, i, function(bid){
      draft.slots[i] = {build_id:bid, item:x.slot.item || "", why:x.slot.why || ""};
      redraw();
    });
  };
  side.appendChild(pick);
  if (!x.build) return side;
  const it = el("button", "btn sm", x.slot.item ? "Item" : "+ Item");
  it.onclick = function(e){
    e.stopPropagation();
    teamPickItem(draft, i, redraw);
  };
  side.appendChild(it);
  const ed = el("button", "btn sm", "Edit set");
  ed.title = "Open this build's editor — the team is saved first";
  ed.onclick = function(e){
    e.stopPropagation();
    teamEditBuild(draft, id, x.slot.build_id);
  };
  side.appendChild(ed);
  const rm = el("button", "btn sm", "×");
  rm.title = "Empty this slot";
  rm.onclick = function(e){ e.stopPropagation(); draft.slots[i] = {}; redraw(); };
  side.appendChild(rm);
  return side;
}

/* STRAIGHT INTO THE SET, from the screen where its problems are visible
   (player, 2026-09-21: "podria haber un acceso rapido si uno quisiera
   cambiar rapido una build en el team builder en vez de ir a la otra
   pestaña").

   THE TEAM IS WRITTEN FIRST, and that is not a convenience: leaving for the
   build editor abandons this draft, so saving first is the only version of
   this that cannot lose work. A team never saved has no id to write to, and
   inventing one would create a team he never asked for, so that case asks
   for a name instead. */
function teamEditBuild(draft, id, bid){
  const b = S.builds[bid];
  if (!b) { toast("That build is gone"); return; }
  if (!id) {
    toast("Name and save the team first — editing a build leaves this screen");
    return;
  }
  put("teams/" + id, teamDoc(draft)).then(function(){
    buildSheet(bid, b);
  });
}

/* ------------------------------------------- WHICH BUILD GOES IN THE SLOT --
   A search box and filters, because a slot is picked out of every build in
   the ledger (player, 2026-09-21: "el selector de slot no tiene buscador!
   imaginate tener 100 builds diferentes y tener que deslizar").

   The questions asked while a team is put together. WHAT IS IT - the search
   box, which reads the build's own words as well as its Pokemon's: an id, a
   species, a Mega, a role, a nature, an ability, any move, a type, a dex
   number. WHAT JOB DOES IT DO - the role and type chips, built from the
   builds that EXIST, so they offer exactly what is there; a row with a
   single chip cannot narrow anything and is left out. No "where is it"
   filter: a team can be written before one of its six exists, and where a
   copy lives is the boxes' question (player, 2026-09-21).

   And the Species Clause is enforced HERE, the way the Item Clause is in the
   item picker: a species another slot already holds is greyed out with the
   reason written on it, rather than accepted and reported as illegal. */
function teamPickBuild(draft, idx, onPick){
  const taken = takenSpecies(draft, idx);
  const F = {role:{}, type:{}, sort:"az"};
  openSheet("Which build?", function(body){
    if (!Object.keys(S.builds).length) {
      body.appendChild(el("div", "empty",
        "No builds yet. A team is made of builds, so write one first."));
      return;
    }
    const rows = pickRows(taken);
    const inp = searchField(body, "Search " + rows.length + " build" +
      (rows.length === 1 ? "" : "s") + " — name, move, role, nature, type",
      function(){ draw(); });
    sortControls(body, F, draw);
    roleChips(body, rows, F, draw);
    typeChips(body, rows, F, draw);
    const count = el("div", "sub mb6");
    body.appendChild(count);
    const list = el("div", "list cards");
    body.appendChild(list);
    function draw(){ drawPicks(list, count, rows, F, inp.q(), onPick); }
    draw();
    /* focus LAST, after the sheet has its height - the same 60ms the species
       picker and the calculator's use */
    setTimeout(function(){ inp.focus(); }, 60);
  }, [fbtn("Back", "", function(){ closeSheet(); })]);
}

/* The species the OTHER slots hold. PER FORM, which is what the clause was
   measured on - 0 of the 642 Worlds teams repeats even a form - so two
   Squawkabilly of different plumage are still two of the same thing. */
function takenSpecies(draft, idx){
  const taken = {};
  (draft?.slots || []).forEach(function(sl, j){
    if (j === idx || !sl?.build_id) return;
    const ob = S.builds[sl.build_id];
    if (ob?.pokemon) taken[ob.pokemon] = 1;
  });
  return taken;
}

/* ONE PASS over the ledger, so the filter rows and the list read the same
   facts rather than each deriving their own. `p` is the form the build PLAYS
   AS - the Mega when a stone is on it. */
function pickRows(taken){
  return Object.keys(S.builds).map(function(bid){
    const b = S.builds[bid], lk = buildLink(bid);
    const p = (b.mega && byName[b.mega]) || byName[b.pokemon] || null;
    const hay = [bid, b.pokemon, b.mega, b.role, b.nature, baseAbility(b),
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
}

/* A–Z AND DEX, AND THE STATS ARE ALL OR NONE (player, 2026-09-21: "me basta
   con el orden de a-z, dex, y si voy a poner bst y speed, entonces tambien
   importan los de atk, def, spa, spd..."). The two he asked for are the row;
   the six stats and BST sit together behind a fold. */
function sortControls(body, F, draw){
  const SORTS = [["az", "A–Z"], ["dex", "Dex no."]];
  const STATSORTS = [["bst", "BST"], ["hp", "HP"], ["atk", "Atk"],
                   ["def", "Def"], ["spa", "SpA"], ["spd", "SpD"],
                   ["spe", "Spe"]];
  const srow = el("div", "toggles mb8");
  const strow2 = el("div", "toggles mb8");
  strow2.hidden = true;
  const groups = [srow, strow2];
  SORTS.forEach(function(o){ sortButton(srow, groups, F, o[0], o[1], draw); });
  STATSORTS.forEach(function(o){ sortButton(strow2, groups, F, o[0], o[1], draw); });
  body.appendChild(filterLabel("Sort"));
  body.appendChild(srow);
  body.appendChild(foldToggle("By a stat", STATSORTS.length, strow2));
  body.appendChild(strow2);
}

/* One sort choice. Pressing it un-presses every other in both rows. */
function sortButton(row, groups, F, key, text, draw){
  const t = el("button", "tog", text);
  setPressed(t, F.sort === key);
  t.onclick = function(){
    F.sort = key;
    groups.forEach(function(g){ pressOnly(g, t); });
    draw();
  };
  row.appendChild(t);
}

/* Mark `on` as the pressed button of a group, and every sibling as not. */
function pressOnly(group, on){
  Array.prototype.forEach.call(group.children, function(x){
    setPressed(x, x === on);
  });
}

/* WHAT JOB IT DOES. `role` is typed by hand, so the chips are the distinct
   roles that exist, matched case-insensitively and labelled with the
   spelling first used. FOLDED, AND IT STAYS FOLDED: with a role per build
   these are as many chips as builds, and they pushed the list off the screen
   (player, 2026-09-21: "el role podria ir oculto o plegado siempre"). The
   count rides on the button. */
function roleChips(body, rows, F, draw){
  const roleKeys = [], roleN = {}, roleText = {};
  rows.forEach(function(r){
    if (!r.role) return;
    const k = r.role.toLowerCase();
    if (!roleN[k]) { roleKeys.push(k); roleText[k] = r.role; }
    roleN[k] = (roleN[k] || 0) + 1;
  });
  roleKeys.sort(function(a, b){
    return roleN[b] - roleN[a] || a.localeCompare(b); });
  if (roleKeys.length < 2) return;
  const rrow = el("div", "toggles mb8");
  rrow.hidden = true;
  roleKeys.forEach(function(k){
    filterChip(rrow, F, draw, "role", k, roleText[k] + " · " + roleN[k]);
  });
  body.appendChild(foldToggle("Role", roleKeys.length, rrow));
  body.appendChild(rrow);
}

/* A TYPE IS WHY THE SIXTH SLOT EXISTS: the hole the other five leave. The
   chips are the types the builds actually cover, so the row shrinks with the
   box rather than always showing eighteen. */
function typeChips(body, rows, F, draw){
  const tKeys = [], tN = {};
  rows.forEach(function(r){
    r.types.forEach(function(t){
      if (!tN[t]) tKeys.push(t);
      tN[t] = (tN[t] || 0) + 1;
    });
  });
  tKeys.sort(byText);
  if (tKeys.length < 2) return;
  const trow = el("div", "toggles mb10");
  tKeys.forEach(function(t){ filterChip(trow, F, draw, "type", t, t + " · " + tN[t], t); });
  body.appendChild(filterLabel("Type — any of these, the form it plays as"));
  body.appendChild(trow);
}

/* One filter chip, on or off - a slot is being FILLED here, not queried, so
   the third "rule it out" state the Find tab needs would be a control nobody
   reaches for. A type chip wears the type's colours. */
function filterChip(row, F, draw, group, key, text, type){
  const t = el("button", "tog", text);
  setPressed(t, false);
  if (type) typeSkin(t, type, false);
  t.onclick = function(){
    if (F[group][key]) delete F[group][key]; else F[group][key] = 1;
    const on = !!F[group][key];
    setPressed(t, on);
    if (type) typeSkin(t, type, on);
    draw();
  };
  row.appendChild(t);
  return t;
}

/* A button that folds `panel` open and shut: a caret, the label, and how many
   things are inside, so what is in there shows without opening it. */
function foldToggle(text, n, panel){
  const tog = el("button", "btn sm fold inline");
  tog.type = "button";
  tog.setAttribute("aria-expanded", "false");
  const caret = el("span", "foldcaret");
  caret.innerHTML = "&#9656;";
  tog.appendChild(caret);
  tog.appendChild(el("span", null, text));
  tog.appendChild(el("span", "n", String(n)));
  tog.onclick = function(){
    const open = panel.hidden;
    panel.hidden = !open;
    tog.setAttribute("aria-expanded", open ? "true" : "false");
    caret.innerHTML = open ? "&#9662;" : "&#9656;";
  };
  return tog;
}

/* The list, filtered and sorted. A species another slot holds goes LAST and
   is not hidden: the clause is the reason it cannot be picked, and that is
   worth reading once. */
function drawPicks(list, count, rows, F, q, onPick){
  const ro = Object.keys(F.role), ty = Object.keys(F.type);
  const hits = rows.filter(function(r){
    if (q && !r.hay.includes(q)) return false;
    if (ro.length && !ro.includes(r.role.toLowerCase())) return false;
    if (ty.length && !r.types.some(function(t){ return ty.includes(t); }))
      return false;
    return true;
  });
  hits.sort(pickOrder(F.sort));
  /* stable, so it re-orders the chosen sort rather than replacing it */
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

/* The comparator for a sort key. A stat sort reads the FORM THE BUILD PLAYS
   AS, Mega included - the same row every other number on the card comes
   from - and a build with no dex row sorts last rather than at zero. */
function pickOrder(sort){
  const IDX = {hp:0, atk:1, def:2, spa:3, spd:4, spe:5};
  return function(a, b){
    if (sort === "dex")
      return a.dex - b.dex || a.b.pokemon.localeCompare(b.b.pokemon);
    if (sort === "bst")
      return b.bst - a.bst || a.b.pokemon.localeCompare(b.b.pokemon);
    if (IDX[sort] != null) {
      const k = IDX[sort];
      const av = a.p ? a.p.b[k] : -1, bv = b.p ? b.p.b[k] : -1;
      return bv - av || a.b.pokemon.localeCompare(b.b.pokemon);
    }
    return a.b.pokemon.localeCompare(b.b.pokemon) || a.id.localeCompare(b.id);
  };
}

/* One build, drawn as the card every other list draws.

   A BUILD IS STILL A POKEMON, so the slot picker shows the card the rest of
   the app shows, with the build's own facts as the extra cells. It had a
   typing, a nature and the four move names and nothing else - and this is the
   screen where a team is decided. */
function buildPickRow(r, onPick){
  const b = r.b, bid = r.id, lk = r.lk;
  const badges = function(h){
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
  const opts = {
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
  let btn;
  if (r.p) {
    btn = pokeCard(r.p, opts);
  } else {
    /* a build for a species the dex does not carry: it is still an idea worth
       picking, so it keeps a row rather than disappearing */
    btn = el("button", "row" + (r.dupe ? " illegal" : ""));
    const m = el("div", "rmain");
    const h = el("div", "rname");
    h.appendChild(document.createTextNode(b.pokemon));
    badges(h);
    m.appendChild(h);
    btn.appendChild(m);
    if (!r.dupe) btn.onclick = opts.onclick;
  }
  if (r.dupe && btn.tagName === "BUTTON") btn.disabled = true;
  return btn;
}

/* ------------------------------------------------ WHICH ITEM THE SLOT HOLDS --
   One item per team - the Item Clause - so anything another slot already
   holds is greyed out here, where the choice is made, rather than reported
   after the fact. The same two questions as every other picker: what kind of
   thing is it (the game's own categories), and can I actually use it -
   "owned" is the one that matters here, because an item not recorded is a
   2000 VP decision, not a choice between six. */
function teamPickItem(draft, i, redraw){
  const taken = {};
  draft.slots.forEach(function(sl, j){
    if (j !== i && sl?.item) taken[sl.item] = 1;
  });
  openSheet("Which item?", function(body){
    body.appendChild(el("p", "sub",
      "One item per team — the Item Clause. Anything another slot already " +
      "holds is greyed out."));
    const POOL = holdable();
    const inp = searchField(body, "Search " + POOL.length +
      " holdable items — name or effect", function(){ draw(); });
    const F = {cat:{}, own:false};
    itemFilters(body, POOL, F, draw);
    const count = el("div", "sub mb6");
    body.appendChild(count);
    const list = el("div", "list");
    body.appendChild(list);
    function draw(){
      drawItemPicks(list, count, POOL, F, inp.q(), {draft: draft, i: i, taken: taken, redraw: redraw});
    }
    draw();
    setTimeout(function(){ inp.focus(); }, 60);
  }, [fbtn("Back", "", function(){ closeSheet(); })]);
}

/* The category chips and "Only ones you own". Drawn only when there is more
   than one thing to choose between. */
function itemFilters(body, POOL, F, draw){
  const nCat = {};
  POOL.forEach(function(x){ nCat[x.cat] = (nCat[x.cat] || 0) + 1; });
  const crow = el("div", "toggles mb8");
  ["Hold Items", "Berries", "Mega Stones"].forEach(function(k){
    if (!nCat[k]) return;
    const t = el("button", "tog", k + " · " + nCat[k]);
    setPressed(t, false);
    t.onclick = function(){
      if (F.cat[k]) delete F.cat[k]; else F.cat[k] = 1;
      setPressed(t, F.cat[k]);
      draw();
    };
    crow.appendChild(t);
  });
  const own = el("button", "tog", "Only ones you own");
  setPressed(own, false);
  own.onclick = function(){
    F.own = !F.own;
    setPressed(own, F.own);
    draw();
  };
  crow.appendChild(own);
  if (crow.children.length > 1) {
    body.appendChild(filterLabel("Narrow it — any of these"));
    body.appendChild(crow);
  }
}

/* A stone is owned when the STONE ledger says so, not the item one - they
   are two different tables and always have been. */
function ownsItem(x){
  return x.stone ? hasStone(x.name) : hasItem(x.name);
}

/* "No item" first, then ALL the items that pass the filters. There are 118
   in Champions and this once drew 60, so half the pool was invisible and
   nothing said so - the worst shape for a list you are choosing FROM. `slot`
   is {draft, i, taken, redraw}. */
function drawItemPicks(list, count, POOL, F, q, slot){
  const cats = Object.keys(F.cat);
  list.innerHTML = "";
  const none = el("button", "row");
  none.appendChild(el("div", "rmain")).appendChild(
    el("div", "rname", "— no item —"));
  none.onclick = function(){
    slot.draft.slots[slot.i].item = ""; slot.draft.slots[slot.i].why = "";
    closeSheet(); slot.redraw(); };
  list.appendChild(none);
  const pool = POOL.filter(function(x){
    if (cats.length && !cats.includes(x.cat)) return false;
    if (F.own && !ownsItem(x)) return false;
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
  pool.forEach(function(x){ list.appendChild(itemPickRow(x, slot)); });
}

/* One item: its name, whether it is a stone, whether another slot holds it
   or it is not owned, how many of THIS slot's Pokemon hold it on the ladder,
   and what it does - whole, not the first 120 characters, because the cut
   landed exactly where an item says when it does NOT work. */
function itemPickRow(x, slot){
  const draft = slot.draft, i = slot.i, taken = slot.taken;
  const btn = el("button", "row" + (taken[x.name] ? " illegal" : ""));
  if (taken[x.name]) { btn.disabled = true; btn.classList.add("dim"); }
  const m = el("div", "rmain");
  const h = el("div", "rname");
  h.appendChild(document.createTextNode(x.name));
  if (x.stone) h.appendChild(el("span", "tag mega", "Mega Stone"));
  if (taken[x.name])
    h.appendChild(el("span", "tag bad", "another slot holds it"));
  /* owned or not, said on the row - a filter you have to turn on to read is
     not an answer */
  else if (!ownsItem(x))
    h.appendChild(el("span", "tag warn", x.vp ? x.vp + " VP" : "not owned"));
  /* The ladder's share belongs here, at the slot, and not on the build: the
     Item Clause makes the item a team decision. */
  const who = draft.slots[i]?.build_id
    && S.builds[draft.slots[i].build_id];
  const utag = who ? usageTag(splitPct(who.pokemon, "i", x.name),
                            who.pokemon, "i") : null;
  if (utag) h.appendChild(utag);
  m.appendChild(h);
  if (x.text) m.appendChild(numText(x.text, "div", "st"));
  btn.appendChild(m);
  if (!taken[x.name]) btn.onclick = function(){ pickItem(x, slot); };
  return btn;
}

/* Set the item, then ask why this one - the half of a team that is not
   derivable from anything else. */
function pickItem(x, slot){
  const draft = slot.draft, i = slot.i;
  draft.slots[i].item = x.name;
  closeSheet();
  openSheet(x.name + " on " + S.builds[draft.slots[i].build_id]?.pokemon,
    function(b2){
      b2.appendChild(el("p", "sub", "Why this one? One line is enough."));
      const f = el("div", "field");
      const ta = el("textarea"); ta.value = draft.slots[i].why || "";
      ta.oninput = function(){ draft.slots[i].why = ta.value; };
      f.appendChild(ta); b2.appendChild(f);
    }, [fbtn("Done", "primary", function(){ closeSheet(); slot.redraw(); })]);
}

export { drawTeams, teamSheet };
