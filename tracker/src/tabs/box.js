/* The Champions box and the HOME box: rows, adding a Pokemon, a row's
   sheet, duplicates, and the dex checklist.

   pokeSheet is exported for the browser tests alone (PUBLIC): they open a
   sheet for every form in the dex and assert what it shows. */
import {
  anyRow, byName, C, dexLabel, FORMS, freeSlug, outsideRow,
} from "../core/data.js";
import {
  $, capNote, el, fbtn, note, searchField, pressOnly, setPressed, toast,
} from "../core/dom.js";
import {
  boxRows, buildsOn, capacity, originOf, originRows, RELEASE_FLOOR,
  releaseBlock, rowMatches, S, sortRows, VIEW,
} from "../core/state.js";
import { drop, put } from "../core/store.js";
import { gtsDiff } from "../core/trade.js";
import { boxBadges, outsideCard, pokeCard } from "../ui/card.js";
import { ask, closeSheet, openSheet } from "../ui/nav.js";
import { findDetail, pokeBody, pokeHead } from "../ui/pokemon.js";
import { diffChip } from "./gts.js";
import { drawGtsWanted } from "./trading.js";

/* ===================================================================== rows */
/* The row's left stripe, by origin, for a permanent Champions-box Pokemon. */
const ORIGIN_CLASS = {home: "perm", champions: "locked"};
/* What the sheet says about a slot, by where the Pokemon came from. */
function originNote(o, rec){
  if (o === "home")
    return "<strong>This slot is elastic.</strong> Park it to HOME whenever you " +
      "need the room; HOME keeps the Champions training, so it comes back " +
      "whole. The round trip costs nothing.";
  if (o === "champions" && releaseBlock(rec) === "floor")
    return "<strong>This slot is permanent.</strong> The game will not release " +
      "a Pokemon while " + RELEASE_FLOOR + " or fewer are left to battle " +
      "with, and HOME-origin ones can always be parked out - so the last " +
      RELEASE_FLOOR + " Champions-origin Pokemon hold their slots for good.";
  if (o === "champions")
    return "<strong>This slot is welded.</strong> Training VP spent here can " +
      "never be parked — it plays fine, but it is not an argument for " +
      "keeping the slot. Replacing it with a GO catch routed through HOME " +
      "is a one-time cost that buys a reusable slot.";
  return "<strong>Not recorded yet.</strong> It is being counted as Champions " +
    "origin, which is the cautious read rather than a known fact.";
}
/* the end of the "released" toast: what happened to its builds */
function keptAs(n){
  return (n > 1 ? "its builds are" : "its build is") + " kept as an idea";
}
/* One box row as a card, opening that copy's sheet. */
function pokeRow(rec){
  const p = byName[rec.name];
  /* WHAT TO DRAW vs WHAT IT CAN DO. `p` stays the Champions dex row and every
     rule below keeps asking it - legality, Megas, whether it can be brought.
     `d` is the row to DRAW, which for a species Champions does not have comes
     from PokeAPI so the card is a card instead of a name and a tag. */
  const d = p || outsideRow(rec.name);
  const o = originOf(rec);
  let cls;
  if (rec.location === "home") cls = p ? "home" : "illegal";
  else if (rec.status === "rental") cls = "rental";
  else cls = ORIGIN_CLASS[o] || "unknown";
  if (!d) {
    /* no row anywhere: a name typed by hand into HOME. It still has to be
       tappable, so it keeps the one shape that needs no data. */
    const bare = el("button", "row " + cls);
    const bm = el("div", "rmain");
    const bh = el("div", "rname");
    bh.appendChild(document.createTextNode(rec.name));
    boxBadges(bh, rec);
    bh.appendChild(el("span", "tag bad", "not in Champions"));
    bm.appendChild(bh);
    bare.appendChild(bm);
    bare.onclick = function(){ pokeSheet(rec); };
    return bare;
  }
  /* THE CARD EVERY OTHER LIST DRAWS. All a BOX row adds is what a dex row
     cannot know: which copy this is, where it came from, and that his shiny
     is a different picture. */
  return pokeCard(d, {
    cls: cls,
    name: rec.name,
    shiny: !!rec.shiny,
    dex: VIEW.sort === "dex",
    /* The ability cell says what this one CAN have, not what it has: a box
       row records no ability - only a build does. */
    badges: function(nm){
      boxBadges(nm, rec);
      /* "not in Champions", not "not in dex": it IS in a dex, with stats on
         the card, just not this game's */
      if (!p) nm.appendChild(el("span", "tag bad", "not in Champions"));
    },
    meta: function(meta){
      if (!p) meta.appendChild(el("span", null,
        "it can sit in HOME but never enter the game"));
    },
    onclick: function(){ pokeSheet(rec); }
  });
}

/* ONE COPY'S SHEET: the same sheet the search view draws (ui/pokemon.js),
   with this copy's own facts wedged into the middle - where it came from,
   shiny, trained, its note - and the buttons that move it. `anyRow`, so a
   species Champions lacks still draws its main-series row. */
function pokeSheet(rec){
  const show = anyRow(rec.name);
  const isHome = rec.location === "home";
  openSheet(rec.name, function(body){
    if (show) pokeHead(body, show, {shiny: !!rec.shiny, rec: rec});
    else body.appendChild(unknownNote(rec));
    originBlock(body, rec);
    copyFlags(body, rec);
    body.appendChild(el("h2", null, "Note"));
    const ta = el("textarea");
    ta.value = rec.note || "";
    ta.id = "pkNote";
    body.appendChild(ta);
    /* AND THEN EVERYTHING IT IS, as the search view draws it - below the
       editable half, because origin, training and the note are what this
       door is FOR, and an edit does not belong under two hundred rows of
       movepool. */
    if (show) pokeBody(body, show);
  }, moveButtons(rec, isHome));
}

/* A ROW THAT EXISTS NOWHERE MUST NOT TAKE THE SHEET DOWN WITH IT. HOME can
   hold anything, including a misspelt name no table has heard of, and the
   honest answer is to say so - and that renaming fixes it. */
function unknownNote(rec){
  const gone = el("div", "note warn");
  gone.innerHTML = "<strong>" + rec.name + "</strong> is not in any dex " +
    "this app carries — not Champions', and not the main series' " +
    "either. It can sit in HOME, but there is nothing to show about it. " +
    "If the spelling is off, renaming it is what fixes this.";
  return gone;
}

/* A rental says what renting means. A Champions-box Pokemon asks where it
   came from - HOME or an Encounter - and says what that makes its slot. */
function originBlock(body, rec){
  if (rec.status === "rental") {
    const w = el("div", "note warn mt12");
    w.innerHTML = "<strong>Rental.</strong> It cannot be trained — no move, " +
      "nature, ability or SP change — so it is locked to the set it ships " +
      "with. It can still hold a Mega Stone. Buying it for 2500 VP does not " +
      "make it a real permanent: it becomes Champions origin, welded to this " +
      "slot until you release it.";
    body.appendChild(w);
    return;
  }
  if (rec.location !== "champions") return;
  body.appendChild(el("h2", null, "Where did it come from?"));
  const o = originOf(rec);
  const togs = el("div", "toggles");
  [["home", "HOME origin", "Caught in GO, or traded in. Can go back out."],
   ["champions", "Champions origin", "From an Encounter. Stuck here."]
  ].forEach(function(opt){ togs.appendChild(originButton(rec, o, opt)); });
  body.appendChild(togs);
  const on = el("div", o === "unknown" ? "note warn mt10" : "note mt10");
  on.innerHTML = originNote(o, rec);
  body.appendChild(on);
}

/* One origin choice: saving it writes the row and closes the sheet. */
function originButton(rec, o, opt){
  const t = el("button", "tog", opt[1]);
  setPressed(t, o === opt[0]);
  t.title = opt[2];
  t.onclick = function(){
    put("box/" + rec._id, {name:rec.name, location:rec.location,
      status:rec.status, note:rec.note || "", order:rec.order || 0,
      origin:opt[0]}).then(function(){
        closeSheet(); toast(rec.name + ": " + opt[1]);
      });
  };
  return t;
}

/* Shiny and trained, toggled here and written by Save below. */
function copyFlags(body, rec){
  body.appendChild(el("h2", null, "This copy"));
  const flags = el("div", "toggles");
  flags.appendChild(flagButton(rec, "shiny", "Shiny"));
  flags.appendChild(flagButton(rec, "trained", "Trained in Champions"));
  body.appendChild(flags);
  body.appendChild(el("p", "sub",
    "A HOME-origin Pokemon trained inside Champions keeps that training " +
    "forever - HOME stores it, so it comes back with its moves, nature, " +
    "ability and SP intact, for no VP. That is what makes an already-trained " +
    "one worth parking rather than rebuilding."));
  body.appendChild(el("p", "sub",
    "Tap Save below to keep these."));
}

/* A toggle that flips rec[key] in memory; saveCopy() writes it. */
function flagButton(rec, key, label){
  const b = el("button", "tog", label);
  setPressed(b, rec[key]);
  b.onclick = function(){
    rec[key] = !rec[key];
    setPressed(b, rec[key]);
  };
  return b;
}

/* Write the row back whole - the note from the sheet, the marks, and any
   change passed in `extra`. The HOME invariant is held here as well as by the
   database CHECK: a record that lives in HOME is permanent and HOME origin
   whatever the row used to say, which also makes re-saving a bad legacy row
   the repair for it. */
function saveCopy(rec, extra){
  const n = $("pkNote");
  const body = {name:rec.name, location:rec.location, status:rec.status,
              note:n ? n.value : (rec.note || ""), order:rec.order || 0,
              origin:rec.origin || "unknown",
              shiny:!!rec.shiny, trained:!!rec.trained};
  Object.keys(extra || {}).forEach(function(k){ body[k] = extra[k]; });
  if (body.location === "home") { body.status = "permanent"; body.origin = "home"; }
  return put("box/" + rec._id, body);
}

/* The sheet's buttons: where this copy can go from here, then Release where
   the game allows it. */
function moveButtons(rec, isHome){
  const out = stayButtons(rec, isHome);
  if (!releaseBlock(rec)) out.push(releaseButton(rec, isHome));
  return out;
}

/* Save: write the sheet's edits back and close. */
function saveButton(rec, cls){
  return fbtn("Save", cls, function(){
    saveCopy(rec).then(function(){ closeSheet(); toast("Saved"); });
  });
}

/* In HOME: Save, and Send to Champions for a species the game has - arriving
   from HOME is what makes it HOME origin, never a guess. A rental: Buy, NOT
   primary, because buying welds it into the box for good, and keeping VP to
   roll Encounters is usually the better use. HOME origin in the box: Park
   back to HOME first. Anything else: Save. */
function stayButtons(rec, isHome){
  if (isHome) {
    const out = [saveButton(rec, "primary")];
    if (byName[rec.name]) {
      out.push(fbtn("Send to Champions", "", function(){
        saveCopy(rec, {location:"champions", status:"permanent", origin:"home"})
          .then(function(){
            closeSheet();
            toast(rec.name + " is in the box, HOME origin" +
                  (buildsOn(rec._id).length ? " — its build is active again" : ""));
          });
      }));
    }
    return out;
  }
  if (rec.status === "rental") return [buyButton(rec)];
  if (originOf(rec) === "home") {
    return [fbtn("Park back to HOME", "primary", function(){
      saveCopy(rec, {location:"home", status:"permanent", origin:"home"})
        .then(function(){
          closeSheet();
          toast(rec.name + " parked. " + (buildsOn(rec._id).length
            ? "Its build is kept, inactive until it comes back."
            : "The training is kept — recall it any time."));
        });
    }), saveButton(rec, "")];
  }
  return [saveButton(rec, "primary")];
}

/* Buying a rental, after asking. The 2500 VP is not deducted from any
   stored balance: VP is not tracked at all, since ranked wins would have to
   be recorded too and a balance that only goes down drifts from the first
   battle. */
function buyButton(rec){
  return fbtn("Buy it · 2500 VP", "", function(){
    ask("Buy " + rec.name + " for 2500 VP?",
        "It becomes Champions origin: it can never be sent to HOME, and the " +
        "slot only frees by releasing it.", "Buy · 2500 VP")
      .then(function(ok){
        if (!ok) return;
        saveCopy(rec, {status:"permanent", origin:"champions"})
          .then(function(){ closeSheet(); toast("Champions origin. Costs 2500 VP"); });
      });
  });
}

/* RELEASE ENDS A POKEMON, AND UNBINDS ITS BUILDS rather than deleting them: a
   build with no Pokemon is a first-class state - an idea - and an idea
   should not be lost for want of a row to hang it on. Only offered where the
   game allows it - see releaseBlock. */
function releaseButton(rec, isHome){
  return fbtn("Release", "danger", function(){
    const mine = buildsOn(rec._id);
    const msg = [];
    if (mine.length) {
      msg.push(mine.length + " build" + (mine.length > 1 ? "s" : "") +
               " will be KEPT as " + (mine.length > 1 ? "ideas" : "an idea") +
               ", no longer installed on anything.");
    }
    if (!isHome) msg.push("This one is Champions origin, so it cannot come back.");
    ask("Remove " + rec.name + " from the ledger?", msg.join("\n\n"),
        "Remove", true).then(function(ok){
      if (ok) releaseCopy(rec, mine);
    });
  });
}

/* Delete the row FIRST, then unbind its builds: a failed delete leaves both
   untouched, never builds pointing nowhere with the Pokemon still there. */
function releaseCopy(rec, mine){
  drop("box/" + rec._id).then(function(){
    return Promise.all(mine.map(function(k){
      const doc = structuredClone(S.builds[k]);
      delete doc._boxId;
      doc.box_id = null;
      return put("builds/" + k, doc);
    }));
  }).then(function(){
    closeSheet();
    toast(rec.name + " removed" +
          (mine.length ? "; " + keptAs(mine.length) : ""));
  });
}

/* ==================================================================== adding
   Add a Pokemon to either box. The Champions Box can only hold what the game
   allows, and asks first whether it was bought or rented - that answer is
   what decides whether the slot is elastic. The HOME Box can hold anything,
   so it also offers every species Champions has never heard of, and takes a
   typed name on top, because no list here is guaranteed to be complete. */
function addSheet(loc){
  openSheet(loc === "home" ? "Add to the HOME Box" : "Add to the Champions Box", function(body){
    const marks = {shiny:false, trained:false};
    const mrow = markToggles(marks);
    body._marks = marks;
    if (loc === "champions") body._mode = boughtOrRental(body, function(){ draw(); });
    body.appendChild(el("p", "sub",
      loc === "home" ? "Anything about this copy, before you pick it:"
                     : "Anything about this copy:"));
    body.appendChild(mrow);
    const inp = searchField(body, "Species or form", function(){ draw(); });
    const list = el("div", "list cards");
    body.appendChild(list);
    function draw(){ drawAddList(list, inp, loc, body); }
    draw();
    if (loc === "home") setTimeout(function(){ inp.focus(); }, 60);
  }, []);
}

/* Shiny and trained, set before the Pokemon is picked. */
function markToggles(marks){
  const mrow = el("div", "toggles mb12");
  [["shiny", "Shiny"], ["trained", "Trained in Champions"]].forEach(function(o){
    const t = el("button", "tog", o[1]);
    setPressed(t, false);
    t.onclick = function(){
      marks[o[0]] = !marks[o[0]];
      setPressed(t, marks[o[0]]);
    };
    mrow.appendChild(t);
  });
  return mrow;
}

/* The Champions Box's required question, and why: everything added here came
   out of an Encounter, so it is Champions origin. Bringing one IN from HOME is
   a move, not an entry - Send to Champions, from the HOME Box. */
function boughtOrRental(body, draw){
  body.appendChild(el("div", "note")).innerHTML =
    "<strong>Everything added here came out of an Encounter</strong>, so " +
    "it is Champions origin and can never be sent to HOME. Bringing one " +
    "IN from HOME is a move, not an entry: open it in the HOME Box and " +
    "tap <strong>Send to Champions</strong>, so the record travels " +
    "instead of being written twice.";
  body.appendChild(el("label", "f", "Which one is it? (required)"));
  const st = el("div", "btnrow mb12");
  const mode = {v:null};
  [["champions","Bought · 2500 VP or a ticket"],
   ["rental","Rental · 0 VP"]].forEach(function(o){
    const b = el("button", "tog", o[1]);
    setPressed(b, false);
    b.onclick = function(){
      mode.v = o[0];
      pressOnly(st, b);
      draw();
    };
    st.appendChild(b);
  });
  body.appendChild(st);
  return mode;
}

/* The list to add from. The Champions Box waits for bought-or-rental, with
   the search box off until it is answered. */
function drawAddList(list, inp, loc, body){
  const q = inp.q();
  list.innerHTML = "";
  if (loc === "champions" && !body._mode?.v) {
    const g = el("div", "note warn");
    g.innerHTML = "<strong>Say whether it is bought or a rental first</strong>, " +
      "at the top of this sheet. A rental cannot be trained, and buying " +
      "one later costs 2500 VP without making it any less stuck here.";
    list.appendChild(g);
    inp.disabled = true;
    inp.placeholder = "Choose bought or rental above first";
    return;
  }
  inp.disabled = false;
  inp.placeholder = "Species or form";
  const pool = FORMS.filter(function(p){
    return !q || p.name.toLowerCase().includes(q);
  });
  const hits = pool.slice(0, 120);
  let homeAll = null, extra = [];
  if (loc === "home") {
    homeAll = (C.HOME_ONLY || []).filter(function(n){
      return q && n.toLowerCase().includes(q);
    });
    extra = homeAll.slice(0, 40);
    extra.forEach(function(n){ list.appendChild(homeOnlyAdd(n)); });
  }
  if (!hits.length && !list.children.length) {
    list.appendChild(el("div", "empty", "Nothing matches"));
    if (loc === "home" && q) list.appendChild(typedAdd(inp.value.trim()));
    return;
  }
  hits.forEach(function(p){ list.appendChild(addCard(p, loc, body)); });
  capNote(list, hits.length, pool.length, "forms");
  if (homeAll)
    capNote(list, extra.length, homeAll.length, "HOME-only names");
}

/* A species Champions does not have, added to HOME from its card. */
function homeOnlyAdd(n){
  const add = function(){
    const id = freeSlug(n, S.box);
    put("box/" + id, {name:n, location:"home", status:"permanent",
        origin:"home", note:"", order:Object.keys(S.box).length})
      .then(function(){ closeSheet(); toast(n + " added to HOME"); });
  };
  return outsideCard(n, add);
}

/* A name no list carries, added to HOME exactly as typed. */
function typedAdd(nm){
  const add = el("button", "btn primary mt10", "Add “" + nm + "” anyway");
  add.onclick = function(){
    const id = freeSlug(nm, S.box);
    put("box/" + id, {name:nm, location:"home", status:"permanent",
        origin:"home", note:"typed by hand", order:Object.keys(S.box).length})
      .then(function(){ closeSheet(); toast(nm + " added to HOME"); });
  };
  return add;
}

/* ONE CARD, THE SAME ONE: choosing what to add is exactly the moment the six
   stats and the Mega line matter. Picking it writes the row. HOME never asks
   bought-or-rental, so it never reads an answer:
   everything in HOME is permanent and HOME origin by definition. Every route
   into the Champions Box through this sheet is an Encounter - buying a rental
   does not change that - so it is Champions origin. */
function addCard(p, loc, body){
  return pokeCard(p, {onclick: function(){
    const mode = loc === "home" ? "home" : body._mode?.v;
    if (!mode) { toast("Bought or rental?"); return; }
    const status = (loc === "champions" && mode === "rental")
               ? "rental" : "permanent";
    const origin = loc === "home" ? "home" : "champions";
    const id = freeSlug(p.name, S.box);
    const mk = body._marks || {};
    put("box/" + id, {name:p.name, location:loc, status:status,
                      origin:origin, note:"",
                      shiny:!!mk.shiny, trained:!!mk.trained,
                      order:Object.keys(S.box).length})
      .then(function(){
        closeSheet();
        let where = " added, Champions origin";
        if (loc === "home") where = " added to HOME";
        else if (mode === "rental") where = " added as a rental";
        toast(p.name + where);
      });
  }});
}

/* ============================================================ the two boxes
   The Champions box - its counter, its three sections by origin, the
   warnings that matter for managing it - and the HOME box list. Called by
   renderAll on every change. */
function drawBoxes(){
  const perm = boxRows("champions", "permanent");
  const rent = boxRows("champions", "rental");
  const home = boxRows("home");
  const oHome = originRows("home"), oChamp = originRows("champions"),
      oUnk = originRows("unknown");
  const cap = capacity(), used = perm.length + rent.length;
  boxCounter(used, cap);
  /* ONE FILTER, THREE SECTIONS. Which origin a Pokemon has is not part of
     "where is my Chesnaught", so the box's filter runs across all three and
     each heading says how much of itself is showing. */
  const bq = ($("boxFilter")?.value || "").trim().toLowerCase();
  const nHO = boxSection($("listHomeOrigin"), sortRows(oHome), bq,
                       "Nothing routed in from HOME yet");
  const nCO = boxSection($("listChampOrigin"), sortRows(oChamp.concat(oUnk)), bq,
                       "Nothing marked as Encounter-bought");
  const nRe = boxSection($("listRent"), sortRows(rent), bq, "No rentals");
  drawHomeList(home);
  /* the checklist and the trade ideas are derived from the box and HOME, so
     they go stale the moment either does - but only the visible pane is
     worth the work */
  if (!$("homePaneDex").hidden) drawDexPane();
  if (!$("homePaneGts").hidden) drawGtsWanted();
  sectionCount("nHomeOrigin", bq, nHO, oHome.length);
  sectionCount("nChampOrigin", bq, nCO, oChamp.length + oUnk.length);
  sectionCount("nRent", bq, nRe, rent.length);
  $("nHome").textContent = home.length;
  boxWarnings({used: used, cap: cap, oHome: oHome, oUnk: oUnk,
               copies: perm.concat(rent)});
}

/* "box 44/50", amber within three of full and red at full. */
function boxCounter(used, cap){
  const bc = $("boxCount");
  bc.textContent = "box " + used + "/" + cap;
  bc.className = "counter";
  if (used >= cap) bc.className += " full";
  else if (used >= cap - 3) bc.className += " tight";
}

/* One section of the Champions box, filtered. Returns how many it shows. */
function boxSection(node, rows, bq, empty){
  const hits = rows.filter(function(r){ return rowMatches(r, bq); });
  fill(node, hits, bq ? "Nothing here matches that" : empty);
  return hits.length;
}

/* "3 of 18" while a filter is on, because a bare 3 under a heading reads as
   the section having shrunk rather than as the filter working. */
function sectionCount(id, bq, shown, total){
  $(id).textContent = bq && shown !== total ? shown + " of " + total : total;
}

/* The HOME box: twelve rows until he asks for the rest. */
function drawHomeList(home){
  const hq = ($("homeFilter")?.value || "").trim().toLowerCase();
  const homeShown = sortRows(home).filter(function(r){ return rowMatches(r, hq); });
  const homeCap = VIEW.homeAll ? homeShown.length : 12;
  fill($("listHome"), homeShown.slice(0, homeCap),
       hq ? "Nothing in HOME matches that" : "HOME is empty");
  const more = $("homeMore");
  more.innerHTML = "";
  if (homeShown.length > homeCap) {
    more.appendChild(fbtn("Show the other " + (homeShown.length - homeCap), "sm",
      function(){ VIEW.homeAll = true; drawBoxes(); }));
  } else if (VIEW.homeAll && homeShown.length > 12) {
    more.appendChild(fbtn("Show fewer", "sm",
      function(){ VIEW.homeAll = false; drawBoxes(); }));
  }
}

/* What matters for managing the box, in order: how many slots are elastic
   (the ones that can be freed without destroying anything), how full it is,
   any row without a recorded origin (a row with nowhere to appear is a row
   silently lost), and a species held twice where one copy can actually go.
   HOME-origin copies may stay duplicated for good, and a Champions-origin
   one at the release floor cannot leave, so neither is
   called trade material. */
function boxWarnings(b){
  const warn = $("boxWarn");
  warn.innerHTML = "";
  warn.appendChild(note(b.oHome.length ? "" : "warn",
    "<strong>" + b.oHome.length + " of " + b.used + " slots are elastic.</strong> " +
    "The other " + (b.used - b.oHome.length) + " can only be freed by releasing " +
    "the Pokemon, and the game stops releases at " + RELEASE_FLOOR + ", so the " +
    "last " + RELEASE_FLOOR + " Champions-origin ones stay for good. Replacing " +
    "the rest with your own GO catches through HOME is the standing plan."));
  if (b.used >= b.cap) {
    warn.appendChild(note("bad", "<strong>The box is full at " + b.used + "/" + b.cap +
      ".</strong> Nothing new fits until something leaves."));
  } else if (b.used >= b.cap - 3) {
    warn.appendChild(note("warn", "<strong>" + (b.cap - b.used) + " slot" +
      (b.cap - b.used === 1 ? "" : "s") + " left.</strong>"));
  }
  if (b.oUnk.length) {
    warn.appendChild(note("warn", "<strong>" + b.oUnk.length + " without a recorded " +
      "origin.</strong> They are being counted as Champions origin, which is " +
      "the cautious read. Tap one to say where it really came from: " +
      b.oUnk.map(function(r){ return r.name; }).join(", ")));
  }
  const rep = releasableRepeats(b.copies);
  if (rep.length) {
    warn.appendChild(note("warn", "<strong>Species Clause.</strong> " +
      rep.join(", ") + " appear" + (rep.length === 1 ? "s" : "") +
      " more than once, so those copies can never share a team, and at " +
      "least one of them can be released."));
  }
}

/* Species held more than once in the Champions box where at least one copy
   can be released. */
function releasableRepeats(copies){
  const dupes = {};
  copies.forEach(function(r){
    const sp = byName[r.name]?.species || r.name;
    dupes[sp] ||= [];
    dupes[sp].push(r);
  });
  return Object.keys(dupes).filter(function(k){
    return dupes[k].length > 1 &&
           dupes[k].some(function(r){ return !releaseBlock(r); });
  });
}

/* ====================================================== what is still missing
   THE GOAL IS THE WHOLE CHAMPIONS DEX, one copy of each form. Champions' own
   route in is a gacha (an Encounter: random species, take one), so the way
   to CHOOSE what you own is Pokemon GO into HOME, and the GTS for what GO
   cannot give.

   So this is an ORDER OF ATTACK, not a list: every form owned nowhere,
   easiest to get first. A species owned only in Champions is not a hole -
   it is a target of its own (a HOME copy would free its welded slot), and
   the GTS pane lists those. Extra copies are a later question, so nothing
   here asks for a second of anything.

   Returns {missing (sorted), have, total}. */
function dexChecklist(){
  const inHome = {}, inChamp = {};
  boxRows("home").forEach(function(r){ inHome[r.name] = true; });
  boxRows("champions").forEach(function(r){ inChamp[r.name] = r.status; });
  const missing = [];
  let have = 0;
  FORMS.forEach(function(p){
    if (inHome[p.name] || inChamp[p.name]) { have++; return; }
    missing.push(p);
  });
  /* EASIEST FIRST. `supply` is the estimate of how hard the species is to get
     in GO - the half he can act on. Unknown sorts in the middle (3). */
  missing.sort(function(a, b){
    const da = gtsDiff(a.name), db = gtsDiff(b.name);
    return (da?.supply || 3) - (db?.supply || 3) ||
           a.name.localeCompare(b.name);
  });
  return {missing:missing, have:have, total:FORMS.length};
}
/* One entry. The same card every other list draws, plus the two things this
   list is for: how hard it is to get, and what getting it would buy. */
function dexCard(p, why){
  return pokeCard(p, {
    dex: VIEW.sort === "dex",
    badges: function(nm){ diffChip(p.name, nm); },
    notes: function(m){
      if (why) m.appendChild(el("div", "st", why));
    },
    /* THE DEX SHEET, not the box one. There is no copy to open - that is the
       whole point of the list - so it opens what a Pokemon IS. */
    onclick: function(){ findDetail(p); }
  });
}
/* twelve until he asks for the rest, like the HOME list */
const DEX_CAP = 12, dexAll = {missing:false};
/* HOME's "Dex" pane: the progress line and the missing list. */
function drawDexPane(){
  const c = dexChecklist();
  const q = ($("dexFilter")?.value || "").trim().toLowerCase();
  const miss = c.missing.filter(function(p){
    return !q || p.name.toLowerCase().includes(q) ||
           String(dexLabel(p.name)).toLowerCase().includes(q) ||
           p.types.join(" ").toLowerCase().includes(q);
  });

  $("dexDone").innerHTML = "";
  $("dexDone").appendChild(note("", "<strong>" + c.have + " of " + c.total +
    "</strong> species are yours somewhere — in the Champions box, in " +
    "HOME, or both. " + (c.total - c.have) + " to go."));

  $("nDexMissing").textContent = c.missing.length;
  $("dexMissingSub").textContent = "One copy per species is the target here. "
    + "Extra copies are a later question, so nothing on this page asks for a "
    + "second of anything. Easiest to get first. The ones you own in Champions "
    + "but not in HOME are not here — they are targets rather than holes, "
    + "and the GTS pane lists them with what you could offer for each.";

  const host = $("listDexMissing"), more = $("dexMissingMore");
  const cap = dexAll.missing ? miss.length : DEX_CAP;
  host.innerHTML = "";
  if (!miss.length) {
    host.appendChild(el("div", "empty", q ? "Nothing here matches that"
                                          : "Nothing left — the dex is done"));
  } else {
    miss.slice(0, cap).forEach(function(p){
      const d = gtsDiff(p.name);
      host.appendChild(dexCard(p, d?.how ? d.how : ""));
    });
  }
  more.innerHTML = "";
  if (miss.length > cap) {
    more.appendChild(fbtn("Show the other " + (miss.length - cap), "sm",
      function(){ dexAll.missing = true; drawDexPane(); }));
  } else if (dexAll.missing && miss.length > DEX_CAP) {
    more.appendChild(fbtn("Show fewer", "sm",
      function(){ dexAll.missing = false; drawDexPane(); }));
  }
}

/* ------------------------------------------- duplicates against HOME ----
   Which Champions slots hold a species already safe in HOME? Those are the
   ones to free first: the species is not lost when the slot goes.

   ONLY WHAT CAN ACTUALLY GO. `releaseBlock` drops the two kinds the game
   will not let him act on - a HOME-origin copy (never a duplicate: a real
   Pokemon, and it cannot be released from the box anyway) and a
   Champions-origin one at the release floor - so what is left is exactly the
   releasable set: Champions origin above the floor, and rentals.
   Matching is on the exact form name, because Ninetales-Alola in HOME does
   not cover a plain Ninetales. Same-species-different-form pairs are real but
   are NOT interchangeable, so they get a footnote instead of a row. */
function dupeReport(){
  const homeNames = {}, homeSpecies = {};
  boxRows("home").forEach(function(r){
    homeNames[r.name] = (homeNames[r.name] || 0) + 1;
    const sp = byName[r.name]?.species || r.name;
    homeSpecies[sp] ||= [];
    homeSpecies[sp].push(r.name);
  });
  const hits = [], formOnly = [];
  boxRows("champions").forEach(function(r){
    if (releaseBlock(r)) return;
    if (homeNames[r.name]) { hits.push(r); return; }
    const sp = byName[r.name]?.species || r.name;
    if (homeSpecies[sp]) {
      formOnly.push({name:r.name, others:homeSpecies[sp].filter(function(n){
        return n !== r.name; })});
    }
  });
  const by = {champions:[], rental:[]};
  hits.forEach(function(r){
    by[r.status === "rental" ? "rental" : "champions"].push(r);
  });
  return {hits:hits, formOnly:formOnly, by:by};
}
/* The "duplicated in HOME" block of the Champions box, hidden when empty. */
function drawDupeHome(){
  const blk = $("dupeBlock");
  const d = dupeReport();
  if (!d.hits.length && !d.formOnly.length) { blk.hidden = true; return; }
  blk.hidden = false;
  $("nDupeHome").textContent = d.hits.length;

  const rent = d.by.rental.length, lock = d.by.champions.length;
  $("dupeSub").textContent = d.hits.length
    ? "Champions-origin slots whose species you also hold in HOME, and that " +
      "the game will let you release. Freeing one does not lose the species - " +
      "the HOME copy goes in when you want it, and that copy is HOME origin, " +
      "so the slot stays elastic from then on."
    : "Nothing releasable in the box is duplicated in HOME.";

  const n = $("dupeNote");
  n.innerHTML = "";
  if (rent) {
    n.appendChild(note("", "<strong>" + rent + " rental.</strong> " +
      "Releasing is the only exit - but a rental cannot be trained, so it " +
      "carries no build and costs nothing to drop."));
  }
  if (lock) {
    const withBuild = d.by.champions.filter(function(r){
      return buildsOn(r._id).length;
    });
    n.appendChild(note("warn", "<strong>" + lock + " Champions origin.</strong> " +
      "Releasing destroys the Pokemon, and only works while more than " +
      RELEASE_FLOOR + " Champions-origin Pokemon are left. " + (withBuild.length
        ? withBuild.length + " of them carry a build, which is kept as an idea (" +
          withBuild.map(function(r){ return r.name; }).join(", ") + ")."
        : "None of them carries a build.")));
  }
  /* an empty list under a heading that already reads "0" is a fourth way of
     saying nothing; the form-only note below is the only real content then */
  const host = $("listDupeHome");
  host.innerHTML = "";
  host.hidden = !d.hits.length;
  if (d.hits.length) {
    fill(host, d.by.rental.concat(d.by.champions), "");
  }
  if (d.formOnly.length) {
    n.appendChild(note("", "<strong>Same species, different form:</strong> " +
      d.formOnly.map(function(f){
        return f.name + " (HOME has " + f.others.join(", ") + ")";
      }).join("; ") + ". Not interchangeable - different stats, typing or " +
      "ability - so these are NOT counted above."));
  }
}

/* Replace a list's rows with box cards, or one empty-state line. */
function fill(node, rows, emptyMsg){
  node.innerHTML = "";
  if (!rows.length) { node.appendChild(el("div", "empty", emptyMsg)); return; }
  rows.forEach(function(r){ node.appendChild(pokeRow(r)); });
}

export { addSheet, drawBoxes, drawDexPane, drawDupeHome, pokeSheet };
