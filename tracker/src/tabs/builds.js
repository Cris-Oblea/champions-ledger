/* The Builds tab: the list, and the build editor - species, Mega, ability,
   nature, Stat Points, moves, and what a change costs in VP. */
import { checks, retuneCost } from "../core/build.js";
import {
  bst, byName, byText, C, catName, dexNo, FORMS, learnset, megasFor, MOVE_BY,
  natMult, splitPct, splitsFor, splitsReg, spTotal, STAT_KEYS, STAT_LABEL,
  statAt,
} from "../core/data.js";
import {
  $, capNote, el, fbtn, searchField, setPressed, toast,
} from "../core/dom.js";
import {
  activeAbility, boxRows, buildLink, buildsOn, megaAbility, ORIGIN_LABEL,
  originOf, ownedNames, S, soleAbility,
} from "../core/state.js";
import { drop, put, putNew } from "../core/store.js";
import {
  boxBadges, effectLine, labelBox, numText, pokeCard, typeChip,
} from "../ui/card.js";
import {
  AB_SET, abilityTag, moveFilters, moveRowFor, spreadNote, spreadTags,
} from "../ui/moves.js";
import {
  ask, closeSheet, leaveEditor, openEditor, openSheet,
} from "../ui/nav.js";
import { analysisFold } from "../ui/pokemon.js";

/* ==================================================================== builds */
/* THE "TRAINED" TAG FOLLOWS THE BUILD, both ways (player, 2026-09-27):
   "si la coloco sobre un pokemon, ese pokemon se considere entrenado, así no
   tengo que manualmente estar tageandolos" - and, minutes later, "cuando
   quiera desmarcar la build sobre un pokemon también el tag debería
   desaparecer". So when a build moves from one copy to another, is unbound,
   or is deleted, the copy it LEFT loses the tag - unless another build still
   sits on it - and the copy it ARRIVED on gains it.
   The manual toggle in the box sheet stays, for a copy trained with no set
   written down; this only acts on the copies a build actually moved between.
   A rental is never tagged: it cannot be trained, whatever set is written.
   `buildId` is excluded when counting what is left on the old copy, because
   the local copy of S.builds only catches up when the write echoes back.
   The whole row goes back, because the store writes a box row whole. */
function setTrained(boxId, on){
  const r = boxId && S.box[boxId];
  if (!r || !!r.trained === on || (on && r.status === "rental"))
    return Promise.resolve();
  const row = {};
  Object.keys(r).forEach(function(k){ if (k !== "_id") row[k] = r[k]; });
  row.trained = on;
  return put("box/" + boxId, row);
}
function syncTrained(fromId, toId, buildId){
  if ((fromId || null) === (toId || null)) return setTrained(toId, true);
  const stillCarried = fromId && buildsOn(fromId, buildId).length;
  return Promise.all([
    stillCarried ? null : setTrained(fromId, false),
    setTrained(toId, true)
  ]);
}
/* ------------------------------------------- choosing which Pokemon it is --
   A <select> of 264 forms in one alphabetical run, with no way to search it:

     "el selector de pokemon en el apartado de builds al crear una nueva build
      me muestra un listado sin filtro por nombre ni dex ni nada, es solo un
      box con opciones, necesito buscar rapidamente entre los pokemones
      disponibles del juego, y no buscar manualmente en una lista."
      (player, 2026-09-18)

   So it is a field you TAP, like the GTS pickers and the calculator's - a
   sheet with a search box, the sorts the rest of the app offers, and the same
   card everywhere else draws. Searching matches the name, either type, or the
   dex number, because those are the three things anyone knows about a Pokemon
   they are looking for.

   The WHOLE dex, still. A set for a Pokemon he has not got yet is an idea
   worth keeping until he has it (2026-09-13), so "in your boxes" is a filter
   and never a limit - and the ones he owns are marked rather than the ones he
   does not, which is the shorter list to read. */
function speciesSheet(onPick){
  const PS = {sort: "dex", mine: false};
  openSheet("Which Pokemon?", function(body){
    const ownedNow = {};
    boxRows("champions").concat(boxRows("home")).forEach(function(r){
      ownedNow[r.name] = (ownedNow[r.name] || 0) + 1;
    });

    const inp = searchField(body, "Search " + FORMS.length +
      " forms \u2014 name, type or number", function(){ draw(); });

    const sortWrap = el("div", "toggles");
    [["dex", "Dex no."], ["az", "A-Z"], ["bst", "BST"],
     ["spe", "Speed"]].forEach(function(o){
      const t = el("button", "tog", o[1]);
      setPressed(t, PS.sort === o[0]);
      t.onclick = function(){
        PS.sort = o[0];
        Array.prototype.forEach.call(sortWrap.children, function(c){
          setPressed(c, c === t);
        });
        draw();
      };
      sortWrap.appendChild(t);
    });
    body.appendChild(sortWrap);

    const mineWrap = el("div", "toggles");
    const mineTog = el("button", "tog", "In your boxes");
    mineTog.title = "Everything else is still here - a set for a Pokemon you "
                  + "have not got yet is an idea worth keeping.";
    setPressed(mineTog, false);
    mineTog.onclick = function(){
      PS.mine = !PS.mine;
      setPressed(mineTog, PS.mine);
      draw();
    };
    mineWrap.appendChild(mineTog);
    body.appendChild(mineWrap);

    const list = el("div", "list cards");
    body.appendChild(list);

    function draw(){
      const q = inp.q();
      list.innerHTML = "";
      const hits = FORMS.filter(function(p){
        if (PS.mine && !ownedNow[p.name]) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q)
            || p.types.join(" ").toLowerCase().includes(q)
            || String(dexNo(p.name)).includes(q);
      });
      hits.sort(function(a, b){
        if (PS.sort === "az") return a.name.localeCompare(b.name);
        if (PS.sort === "bst") return bst(b) - bst(a) || a.name.localeCompare(b.name);
        if (PS.sort === "spe") return b.b[5] - a.b[5] || a.name.localeCompare(b.name);
        return dexNo(a.name) - dexNo(b.name) || a.name.localeCompare(b.name);
      });
      /* 120, and it SAYS so - the same cap and the same note the calculator's
         picker uses, because a list that stops without saying reads as a
         Pokemon the app has never heard of. */
      hits.slice(0, 120).forEach(function(p){
        list.appendChild(pokeCard(p, {
          cls: ownedNow[p.name] ? "perm" : "",
          badges: function(h){
            if (ownedNow[p.name]) {
              h.appendChild(el("span", "tag ok", ownedNow[p.name] > 1
                ? ownedNow[p.name] + " in your boxes" : "yours"));
            }
          },
          onclick: function(){ onPick(p.name); }
        }));
      });
      capNote(list, Math.min(120, hits.length), hits.length, "forms");
      if (!list.children.length) {
        list.appendChild(el("div", "empty", PS.mine
          ? "Nothing in your boxes matches"
          : "Nothing matches"));
      }
    }
    draw();
    setTimeout(function(){ inp.focus(); }, 60);
  }, []);
}

function buildRow(id, b){
  const p = byName[b.mega || b.pokemon] || byName[b.pokemon];
  const lk = buildLink(id);
  const isRental = lk.row?.status === "rental";
  const badges = function(nm){
    /* the form the set runs, named. NO "stone missing" badge: that was an
       audit of what he owns on a card about a SET, and a stone's status
       belongs to the Items tab. */
    if (b.mega) nm.appendChild(el("span", "tag mega", b.mega));
    const tot = spTotal(b.stat_points || {});
    if (tot !== 66) nm.appendChild(el("span", "tag bad", tot + "/66 SP"));
    if (isRental) nm.appendChild(el("span", "tag warn", "rental — cannot train"));
    if (lk.state === "parked")
      nm.appendChild(el("span", "tag warn", "in HOME — inactive"));
    if (lk.state === "orphan")
      nm.appendChild(el("span", "tag bad", "orphan — no Pokemon"));
    /* Unbound is not a fault, so it is not badged "bad": it is a set written
       for a Pokemon that is not carrying it yet. The two cases read
       differently and only one is a shopping-list item. */
    if (lk.state === "unbound") {
      const own = boxRows("champions").concat(boxRows("home"))
        .some(function(r){ return r.name === b.pokemon; });
      nm.appendChild(el("span", "tag", own ? "an idea — not installed"
                                           : "an idea — you have none yet"));
    }
  };
  let cls = "perm";
  if (lk.state === "orphan") cls = "illegal";
  else if (lk.state === "parked" || isRental) cls = "rental";
  if (!p) {
    /* a set for a species the dex does not carry - still a build, still
       openable */
    const bare = el("button", "row " + cls);
    const bm = el("div", "rmain");
    const bh = el("div", "rname");
    bh.appendChild(document.createTextNode(b.pokemon));
    badges(bh);
    bm.appendChild(bh);
    bare.appendChild(bm);
    bare.onclick = function(){ buildSheet(id, b); };
    return bare;
  }
  /* A BUILD SHOWS ONLY WHAT THE BUILD POINTS AT. It is one Pokemon in one
     configuration, so the card carries that form and nothing else: if a stone
     is on it, the Mega's own types, BST and spread and the ability it runs as
     a Mega; if not, the base form and the ability it runs as a base. No
     "possible" list, no other Mega line, no deltas to a form this set does
     not use (player, 2026-09-20: "si es mega o no, cual habilidad en
     especifico tiene la build, porque se ve muy desordenado").

     `p` is already the right row - byName[b.mega] when there is a stone - so
     the only thing left is to stop the card offering the species' options
     beside the decision. */
  const mab = megaAbility(b);
  return pokeCard(p, {
    cls: cls,
    name: b.pokemon,
    megas: false,
    abValue: activeAbility(b),
    abLabel: mab ? "Mega ability" : "Ability",
    cells: [labelBox(b.nature || null, "Nature", "wide")],
    badges: badges,
    meta: function(meta){
      meta.appendChild(el("span", "mono", (b.moves || []).length + " moves"));
      if (b.role) meta.appendChild(el("span", null, b.role));
    },
    onclick: function(){ buildSheet(id, b); }
  });
}

/* A <select> REORDERED by what this Pokemon's players run.

   A dropdown of 25 natures in alphabetical order makes the player read all 25
   to find the two that anyone actually picks; sorting it by usage puts those
   two at the top and costs nothing, because the whole list is still there
   (player, 2026-09-15: "lo mismo para las naturalezas debe ordenarse por % de
   uso... lo mismo para las habilidades").

   ANYTHING THE TABLE DOES NOT LIST KEEPS ITS ORIGINAL ORDER, below the ones
   that do, and is not labelled. A nature nobody brought is not "0% popular",
   it is simply absent from a sample, and stamping it with a number would be
   inventing a measurement. The moves list is the deliberate exception, and it
   says why there.

   This only REORDERS and LABELS. The selected value is untouched, and the
   caller sets it afterwards - an indicator sits beside a choice and never
   makes it. */
function orderByUsage(sel, pokemon, kind){
  const opts = Array.prototype.slice.call(sel.options);
  const rows = opts.map(function(opt, i){
    return {opt:opt, i:i, pct:splitPct(pokemon, kind, opt.value)};
  });
  if (!rows.some(function(r){ return r.pct; })) return;
  rows.sort(function(a, b){
    const pa = a.pct || 0, pb = b.pct || 0;
    return pb - pa || a.i - b.i;
  });
  rows.forEach(function(r){
    if (r.pct) r.opt.text = r.opt.text + "   ·   " + r.pct + "%";
    sel.appendChild(r.opt);              // appending an existing node MOVES it
  });
}

/* THE BUILD EDITOR. One screen, drawn top to bottom by the sections below,
   each a function of its own that takes the editor's state `ed`:

     ed.id        the build's id, or null for a new one
     ed.b         the build as saved (null for a new one)
     ed.draft     the copy being edited - every control writes here
     ed.original  the draft as it was when the editor opened, which is what
                  the VP cost is measured against
     ed.p         the dex row of the species being edited
     ed.redraw()  rebuild the whole editor from the draft
     ed.checkBox, ed.costBox   filled in place by paintChecks and paintCost,
                  because the sliders repaint them without a rebuild

   Nothing is saved until Save; Cancel or Back simply drops the draft. */
function buildSheet(id, b, keepOriginal){
  const draft = structuredClone(b || {});
  /* the link is stored as box_id and edited as _boxId - seed one from the
     other, or editing a build would silently unbind it on save */
  draft._boxId = draft.box_id || null;
  draft.stat_points = draft.stat_points || {hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
  draft.moves = draft.moves || [];
  /* THE ONE ABILITY A SPECIES HAS IS A FACT, NOT A CHOICE, and it belongs in
     the build rather than only in the control that displays it. A <select> of
     one option can never fire its own onchange, so Aegislash and Clawitzer
     saved a null ability: no badges on their moves, nothing for the
     calculator to model (player, 2026-09-22). Written here, BEFORE `original`
     is snapshotted, so recording it costs no VP - he is not changing an
     ability, he is writing down the one it has always had. */
  if (!draft.ability) draft.ability = soleAbility(draft.pokemon);
  if (draft.mega && !draft.mega_ability)
    draft.mega_ability = soleAbility(draft.mega);
  const ed = {id: id, b: b, draft: draft, p: null,
            original: keepOriginal || structuredClone(draft),
            checkBox: el("div"), costBox: el("div")};
  /* redraw rebuilds the sheet from the live draft, carrying the pre-edit
     snapshot forward so the VP cost is measured against the saved set */
  ed.redraw = function(){ buildSheet(id, draft, ed.original); };

  openEditor("buildedit", draft.pokemon || "New build", function(body){
    if (!id && !speciesField(body, ed)) return;
    ed.p = byName[draft.pokemon];
    const copies = copyField(body, ed);
    linkNotes(body, ed, copies);
    megaField(body, ed);
    abilityAndNature(body, ed);
    usageReference(body, ed);
    smogonFold(body, draft.pokemon);
    const spPaint = statPoints(body, ed);
    moveSlots(body, ed);
    /* The 66-point budget and the 32-per-stat cap are the two things a slider
       drag can break, so they repaint with the slider instead of waiting for
       the sheet to be rebuilt. */
    body.appendChild(ed.checkBox);
    proseFields(body, draft);
    body.appendChild(ed.costBox);
    spPaint(null);
  }, [
    fbtn("Save", "primary", function(){ saveBuild(ed); }),
    fbtn(id ? "Delete" : "Cancel", id ? "danger" : "", function(){ deleteBuild(ed); })
  ]);
}

/* --- species (new builds only) -------------------------------------------
   The species first, and it is ANY form in the dex - not only what is in the
   box. A set for a Pokemon he has not got yet is an idea worth keeping until
   he has it, rather than one lost for want of a row to hang it on (player,
   2026-09-13). Which copy it is installed on is a second, optional question,
   answered below. Returns whether a species is chosen - until one is, there
   is nothing else to edit. */
function speciesField(body, ed){
  const draft = ed.draft;
  const f0 = el("div", "field");
  f0.appendChild(el("label", "f", "Pokemon"));
  const chosen = draft.pokemon ? byName[draft.pokemon] : null;
  const open = function(){
    speciesSheet(function(name){
      draft.pokemon = name;
      draft._boxId = null;          // the copy is chosen separately
      /* and everything that belonged to the OTHER species goes with it -
         a stone it cannot hold, and the ability buildSheet committed for it.
         The redraw fills in the new species' own single ability. */
      draft.ability = null;
      draft.mega = null;
      draft.mega_ability = null;
      closeSheet();
      ed.redraw();
    });
  };
  let pick;
  if (chosen) {
    /* the card, so the species you picked reads the same here as in the
       list you picked it from - and it is the form the BUILD plays as, the
       same rule the build list follows: the Mega row once a stone is chosen,
       the base form alone otherwise. The Mega toggles below are where the
       species' options are offered - the card is the decision. */
    pick = pokeCard(byName[draft.mega] || chosen,
                    {cls:"perm", name:draft.pokemon, megas:false,
                     onclick:open});
  } else {
    pick = el("button", "row unknown");
    const pm = el("div", "rmain");
    pm.appendChild(el("div", "rname", "Tap to choose"));
    const pmeta = el("div", "rmeta");
    pmeta.appendChild(el("span", null,
      "any of the " + FORMS.length + " forms in the game, owned or not"));
    pm.appendChild(pmeta);
    pick.appendChild(pm);
    pick.onclick = open;
  }
  f0.appendChild(pick);
  body.appendChild(f0);
  return !!draft.pokemon;
}

/* --- which copy ----------------------------------------------------------
   WHICH COPY, and "none yet" is a real answer. Every copy is offered, in
   either box, whether or not it already carries a build - three Farigiraf
   builds is the point, and choosing between them happens in game or per team.

   THE DROPDOWN IS THE ANSWER, AND THE CARD UNDER IT IS THE COPY IT NAMES
   (player, 2026-09-28). A list of cards was tried first, so he could see "si
   es shiny, si ya está entrenado, etc. para saber sobre qué estoy colocando
   la build" - and it lost what the dropdown does without anyone noticing: its
   closed face IS the current state. A list has no closed face, so its first
   row read as the value on every build, and taking a build off meant tapping
   a sentence nothing said was a button. So both halves, each doing what it is
   good at: the dropdown says where the build is and is where it is changed or
   taken off, its options carrying the badges so two copies are told apart;
   the card of the chosen copy sits underneath with everything else, and is
   swapped in place so the page does not jump under his thumb.

   Returns the copies, which the notes below need. */
function copyField(body, ed){
  const draft = ed.draft;
  const copies = boxRows("champions").concat(boxRows("home"))
    .filter(function(r){ return r.name === draft.pokemon; });
  const f1 = el("div", "field");
  f1.appendChild(el("label", "f", "Installed on"));
  if (copies.length) {
    const sel1 = el("select");
    sel1.appendChild(new Option("— not installed (just an idea) —", ""));
    const labels = copies.map(function(r){ return copyLabel(r, ed.id); });
    /* TWO COPIES CAN BE THE SAME IN EVERYTHING THE LEDGER RECORDS - his two
       Heracross are both in HOME, neither shiny nor trained, no note - and
       two identical lines read as a bug. They are not, so the line says so,
       rather than inventing a "copy 2" that tells nothing apart: whichever
       he picks is the same Pokemon as far as anything here knows. */
    copies.forEach(function(r, i){
      const alike = labels.filter(function(t){ return t === labels[i]; }).length;
      sel1.appendChild(new Option(labels[i] +
        (alike > 1 ? " · one of " + alike + " identical" : ""), r._id));
    });
    sel1.value = draft._boxId || "";
    const copyCard = el("div", "mt8");
    sel1.onchange = function(){
      draft._boxId = sel1.value || null;
      paintCopy(copyCard, copies, ed);
    };
    f1.appendChild(sel1);
    f1.appendChild(copyCard);
    paintCopy(copyCard, copies, ed);
  } else {
    f1.appendChild(el("p", "sub", "— you do not have one yet —"));
  }
  body.appendChild(f1);
  return copies;
}

/* One copy, as the dropdown names it: where, shiny, trained, origin, what it
   already carries, its note. */
function copyLabel(r, exceptId){
  const others = buildsOn(r._id, exceptId);
  const note = r.note && r.note.length > 40
    ? r.note.slice(0, 39) + "…" : r.note;
  return [
    r.name,
    r.location === "home" ? "in HOME" : "Champions box",
    r.shiny && "shiny",
    r.trained && "trained",
    r.status === "rental" ? "rental, cannot be trained"
      : r.location === "champions" && ORIGIN_LABEL[originOf(r)],
    others.length && "already carries " + others.join(", "),
    note
  ].filter(Boolean).join(" · ");
}

/* The card of the copy the dropdown names, redrawn in place. */
function paintCopy(copyCard, copies, ed){
  copyCard.innerHTML = "";
  const r = copies.find(function(c){ return c._id === ed.draft._boxId; });
  if (!r) return;
  const others = buildsOn(r._id, ed.id);
  const pr = byName[r.name];
  copyCard.appendChild(pr ? pokeCard(pr, {
    tag: "div",
    name: r.name,
    shiny: !!r.shiny,
    megas: false,
    badges: function(h){
      h.appendChild(el("span", "tag" + (r.location === "home" ? " warn" : ""),
        r.location === "home" ? "in HOME" : "Champions box"));
      boxBadges(h, r);
    },
    meta: function(meta){
      if (r.status === "rental")
        meta.appendChild(el("span", null, "rental — cannot be trained"));
      if (others.length)
        meta.appendChild(el("span", "mono",
          "already carries " + others.join(", ")));
      if (r.note) meta.appendChild(el("span", null, r.note));
    }
  }) : el("div", "row", r.name));
}

/* --- what state the build is in ------------------------------------------
   One note per state that needs saying: a set for a species he has none of,
   a build parked in HOME, an orphan (with the field that re-links it), and a
   rental that nothing can be applied to.

   NO NOTE WHEN HE OWNS ONE AND IT IS NOT INSTALLED. The dropdown above
   already reads "— not installed (just an idea) —", so a paragraph saying
   "Not installed on anything" was the same sentence twice (player,
   2026-09-15: "ese mensaje de not installed es redudandte"). */
function linkNotes(body, ed, copies){
  const draft = ed.draft;
  const lk = ed.id ? buildLink(ed.id) : {state:draft._boxId ? "active" : "unbound"};
  if (lk.state === "unbound" && !copies.length) {
    const ub = el("div", "note");
    ub.innerHTML = "<strong>You do not have a " + draft.pokemon +
      " yet.</strong> The set is saved anyway, so the idea keeps — it just " +
      "cannot be trained or brought to a battle until one arrives.";
    body.appendChild(ub);
  }
  if (lk.state === "parked") {
    const pk = el("div", "note warn");
    pk.innerHTML = "<strong>Parked in HOME — this build is inactive.</strong> " +
      "It is kept exactly as it is, because a HOME-origin Pokemon comes back " +
      "with its training. Nothing here can be applied while it sits in HOME; " +
      "send " + draft.pokemon + " to Champions and it is live again.";
    body.appendChild(pk);
  }
  if (lk.state === "orphan") orphanNote(body, ed);
  if (ownedNames()[draft.pokemon] === "rental") {
    const w = el("div", "note warn");
    w.innerHTML = "<strong>This one is a rental.</strong> Nothing on this page " +
      "can be applied in game until it is made permanent (2500 VP). A rental " +
      "is locked to its default set.";
    body.appendChild(w);
  }
}

/* An orphan: the Pokemon it belonged to has left the ledger. Offers every
   copy of the species - including one that already carries a build, since
   more than one set per Pokemon is allowed - to re-link it to. */
function orphanNote(body, ed){
  const draft = ed.draft;
  const or = el("div", "note bad");
  or.innerHTML = "<strong>Orphan build.</strong> The Pokemon this belonged " +
    "to is no longer in the ledger, so this set is not on anything. Point " +
    "it at another " + draft.pokemon + ", or delete it.";
  body.appendChild(or);
  const cands = boxRows("champions").concat(boxRows("home")).filter(function(r){
    return r.name === draft.pokemon;
  });
  if (!cands.length) return;
  const fr = el("div", "field");
  fr.appendChild(el("label", "f", "Link this build to"));
  const selr = el("select");
  cands.forEach(function(r){
    selr.appendChild(new Option(
      r.name + " — " + (r.location === "home" ? "in HOME" : "Champions box"),
      r._id));
  });
  fr.appendChild(selr);
  const go = el("button", "fbtn primary", "Link");
  go.onclick = function(){
    /* Re-point the LINK. The build keeps its id and its name; only box_id
       changes. */
    const doc = structuredClone(ed.b);
    delete doc._boxId;
    doc.box_id = selr.value;
    put("builds/" + ed.id, doc).then(function(){
      return syncTrained(null, doc.box_id, ed.id);
    }).then(function(){
      closeSheet(); toast("Linked to " + draft.pokemon);
    });
  };
  fr.appendChild(go);
  body.appendChild(fr);
}

/* --- mega ----------------------------------------------------------------
   Base form, or one of the species' Megas. Only the form's name: what the
   stone costs is the Items tab's business, not this picker's. */
function megaField(body, ed){
  const draft = ed.draft, p = ed.p;
  const ms = megasFor(draft.pokemon);
  if (!ms.length) return;
  const fm = el("div", "field");
  fm.appendChild(el("label", "f", "Mega"));
  const togs = el("div", "toggles");
  const none = el("button", "tog", "Base form only");
  setPressed(none, !draft.mega);
  none.onclick = function(){ draft.mega = null; draft.mega_ability = null; ed.redraw(); };
  togs.appendChild(none);
  ms.forEach(function(m){
    const t = el("button", "tog mega", m.name);
    setPressed(t, draft.mega === m.name);
    t.onclick = function(){
      draft.mega = m.name;
      draft.mega_ability = m.ab[0] || null;
      ed.redraw();
    };
    togs.appendChild(t);
  });
  fm.appendChild(togs);
  body.appendChild(fm);
  if (draft.mega) {
    const mm = byName[draft.mega];
    const nt = el("div", "note");
    nt.innerHTML = "<strong>" + draft.mega + ".</strong> " +
      p.types.join("/") + " → " + mm.types.join("/") + ". Ability " +
      p.ab.join("/") + " → " + mm.ab.join("/") + ". Spe " + p.b[5] +
      " → " + mm.b[5] + ". The registered ability is the base one, and " +
      "that is correct — it is what the Pokemon has until it evolves.";
    body.appendChild(nt);
  }
}

/* --- ability + nature ----------------------------------------------------
   HEADINGS, BECAUSE THIS IS A LONG SCROLL ON A PHONE: every block of the
   editor has one, so there is always a way to see where you are in it. */
function abilityAndNature(body, ed){
  body.appendChild(el("h2", null, "Ability and nature · 500 VP each"));
  const g = el("div", "grid2");
  g.appendChild(abilityField(ed));
  g.appendChild(natureField(ed));
  body.appendChild(g);
}

/* The base form's ability, the list REORDERED by what this Pokemon's players
   pick - Kingambit is 98.6% Defiant, and a list of three cannot say that on
   its own. */
function abilityField(ed){
  const draft = ed.draft, p = ed.p;
  const fa = el("div", "field");
  fa.appendChild(el("label", "f", "Ability (base form)"));
  const sa = el("select");
  (p?.ab || []).forEach(function(a){ sa.appendChild(new Option(a, a)); });
  if (draft.ability && !p?.ab.includes(draft.ability))
    sa.appendChild(new Option(draft.ability, draft.ability));
  orderByUsage(sa, draft.pokemon, "a");
  /* A REAL CHOICE STARTS UNMADE, and the control has to be able to say so.
     A <select> always displays one of its options, so two or three
     abilities opened on the first one and read as chosen while the build
     held nothing. The blank row says "not chosen" out loud and disappears
     the moment he picks. Inserted after the usage sort so it stays on top. */
  if (!draft.ability)
    sa.insertBefore(new Option("— not chosen —", ""), sa.firstChild);
  sa.value = draft.ability || "";
  sa.onchange = function(){ draft.ability = sa.value || null; ed.redraw(); };
  fa.appendChild(sa);
  /* WHAT THE ABILITY DOES, UNDER THE ABILITY - inside the field, so on a
     phone, where the two columns stack, it does not land beneath the nature
     and describe the wrong control. Then the same as a NUMBER: Guts reads
     x1.5 from the engine's own modifier stage, which is the half of the
     sentence that decides a calculation. */
  if (draft.ability && C.ABIL[draft.ability]) {
    fa.appendChild(numText(C.ABIL[draft.ability], "p", "sub"));
    const abnum = effectLine(draft.ability);
    if (abnum) fa.appendChild(abnum);
  }
  return fa;
}

/* The nature, reordered the same way (90.3% Adamant on Kingambit is the
   answer 25 alphabetical rows cannot give), and blank until he picks one: a
   nature is 25 choices and 500 VP - it is his. */
function natureField(ed){
  const draft = ed.draft;
  const fn = el("div", "field");
  fn.appendChild(el("label", "f", "Nature"));
  const sn = el("select");
  Object.keys(C.NATURES).sort(byText).forEach(function(n){
    sn.appendChild(new Option(n + " — " + C.NATURES[n][2], n));
  });
  orderByUsage(sn, draft.pokemon, "n");
  if (!draft.nature)
    sn.insertBefore(new Option("— not chosen —", ""), sn.firstChild);
  sn.value = draft.nature || "";
  sn.onchange = function(){ draft.nature = sn.value || null; ed.redraw(); };
  fn.appendChild(sn);
  return fn;
}

/* --- what its players run ------------------------------------------------
   THE SPREADS ITS PLAYERS RUN, AND WHO THEY BRING IT WITH - SHOWN, NEVER
   APPLIED. His rule (2026-09-15): "no quiero autollenado, solo quiero un
   indicador de lo mas popular para armar las builds... el armado final es
   mio." An indicator informs a decision; a button makes it. So this is text,
   with no click and no handler - the sliders are his. */
function usageReference(body, ed){
  const draft = ed.draft;
  const sp = splitsFor(draft.pokemon);
  if (!sp) return;
  if ((sp.s || []).length || (sp.t || []).length) {
    const rh = el("h2", null, "What its players run" +
                (splitsReg() ? " · " + splitsReg() : ""));
    rh.title = "Reference only. Nothing here fills anything in.";
    body.appendChild(rh);
    body.appendChild(el("p", "sub",
      "Reference only — nothing here fills anything in."));
  }
  if ((sp.s || []).length) body.appendChild(spreadRows(sp.s));
  if ((sp.t || []).length) body.appendChild(teammateRow(sp.t, draft.pokemon));
}

/* The six most-run spreads. A spread is [hp, atk, def, spa, spd, spe,
   percent] - six numbers in STAT_KEYS order, then its share: flat, because
   an object per row was more than twice the bytes for 283 Pokemon. */
function spreadRows(spreads){
  const sprow = el("div", "field");
  sprow.appendChild(el("label", "f", "SP spreads"));
  spreads.slice(0, 6).forEach(function(row){
    const bits = STAT_KEYS.map(function(k, i){
      return row[i] ? row[i] + " " + STAT_LABEL[k] : null;
    }).filter(Boolean).join(" / ");
    const line = el("div", "st");
    const t = el("span", "tag mr6", row[6] + "%");
    line.appendChild(t);
    line.appendChild(document.createTextNode(bits));
    sprow.appendChild(line);
  });
  return sprow;
}

/* WHO IT IS BROUGHT WITH. The Item Clause makes a team six decisions that
   constrain each other, so "53.9% of the teams that brought this also
   brought Sneasler" is the most useful line here for team building (player,
   2026-09-15: "es super completo eso y la ayuda que brinda para armar
   teams"). */
function teammateRow(pairs, pokemon){
  const tmrow = el("div", "field");
  tmrow.appendChild(el("label", "f", "Brought alongside"));
  const tmline = el("div", "rmeta");
  pairs.forEach(function(pair){
    const t = el("span", "tag", pair[0] + " " + pair[1] + "%");
    t.title = pair[1] + "% of the teams that brought " + pokemon +
      " also brought " + pair[0];
    tmline.appendChild(t);
  });
  tmrow.appendChild(tmline);
  return tmrow;
}

/* SMOGON'S GUIDE, HERE, because this is where the decisions are made - the
   same folded panel the Pokemon sheet opens, one place that knows how to draw
   it, fetched only when a build is actually being argued about. */
function smogonFold(body, pokemon){
  if (!pokemon) return;
  body.appendChild(analysisFold(pokemon, "Read Smogon on " + pokemon));
}

/* --- stat points ---------------------------------------------------------
   NOTHING HERE REBUILDS THE EDITOR. Dragging a slider used to be impossible
   because oninput called redraw(), which destroyed the range element under
   the finger on the first step. spPaint() repaints only what depends on the
   values. The slider, the two arrows and the typed box are three doors into
   the same setSp(), so they can never disagree with each other or with the
   draft. Returns spPaint, which buildSheet calls once the whole editor -
   the checks and the cost included - is on the page. */
function statPoints(body, ed){
  const draft = ed.draft;
  body.appendChild(el("h2", null, "Stat Points · 5 VP each"));
  const meter = el("div", "meter");
  const fill = el("i");
  meter.appendChild(fill);
  body.appendChild(meter);
  const bud = el("div", "budget");
  const budSpent = el("span"), budLeft = el("span");
  bud.appendChild(budSpent);
  bud.appendChild(budLeft);
  body.appendChild(bud);

  const spRepaint = [];
  function setSp(k, v, typing){
    draft.stat_points[k] = Math.max(0, Math.min(32, v));
    spPaint(typing);
  }
  /* `typing` is the box the player is mid-keystroke in; writing back to it
     would fight the cursor, so it is the one node spPaint leaves alone */
  function spPaint(typing){
    const t = spTotal(draft.stat_points);
    fill.style.width = Math.min(100, t / 66 * 100) + "%";
    if (t > 66) meter.classList.add("over"); else meter.classList.remove("over");
    budSpent.textContent = t + " of 66 spent";
    budLeft.textContent = t > 66 ? (t - 66) + " over budget"
                                 : (66 - t) + " left";
    bud.classList.toggle("c-bad", t > 66);
    spRepaint.forEach(function(f){ f(typing); });
    paintChecks(ed);
    paintCost(ed);
  }
  STAT_KEYS.forEach(function(k, i){
    spRepaint.push(statLine(body, ed, k, i, setSp));
  });
  body.appendChild(el("p", "sub",
    "Right column is the level-50 stat" +
    (draft.mega ? " in Mega form." : ".") +
    " Points in a defensive stat only earn their place if they move a real " +
    "attack from a 1HKO to a 2HKO — percentages are decoration."));
  return spPaint;
}

/* One stat's row: slider, minus, the typed box, plus, and the level-50 stat
   it makes. Returns the function that repaints the row from the draft. */
function statLine(body, ed, k, i, setSp){
  const draft = ed.draft;
  const line = el("div", "sp spedit");
  line.appendChild(el("span", "k", STAT_LABEL[k]));

  const r = el("input"); r.type = "range"; r.min = 0; r.max = 32; r.step = 1;
  r.setAttribute("aria-label", STAT_LABEL[k] + " stat points");
  r.oninput = function(){ setSp(k, Number(r.value), null); };
  line.appendChild(r);

  const dec = el("button", "step", "−");
  dec.type = "button";
  dec.setAttribute("aria-label", "One less " + STAT_LABEL[k]);
  dec.onclick = function(){
    setSp(k, (Number(draft.stat_points[k]) || 0) - 1, null);
  };
  line.appendChild(dec);

  const num = statNumber(draft, k, setSp);
  line.appendChild(num);

  const inc = el("button", "step", "+");
  inc.type = "button";
  inc.setAttribute("aria-label", "One more " + STAT_LABEL[k]);
  inc.onclick = function(){
    setSp(k, (Number(draft.stat_points[k]) || 0) + 1, null);
  };
  line.appendChild(inc);

  const cs = el("span", "calc");
  cs.title = "Level 50 stat";
  line.appendChild(cs);
  body.appendChild(line);

  return function(typing){
    const v = Number(draft.stat_points[k]) || 0;
    /* a build imported from elsewhere can hold more than 32; show the real
       number and flag it rather than quietly clamping the display */
    r.value = Math.min(32, v);
    if (num !== typing) num.value = String(v);
    if (v > 32) line.classList.add("over"); else line.classList.remove("over");
    dec.disabled = v <= 0;
    inc.disabled = v >= 32;
    const basep = byName[draft.mega || draft.pokemon] || ed.p;
    cs.textContent = basep
      ? String(statAt(basep.b[i], v, k === "hp", natMult(draft.nature, k)))
      : "0";
  };
}

/* The typed box. type=text with a digit filter, not type=number: a browser
   spinner would sit right next to our own arrows doing the same job, and on
   Android type=number still lets "e", "+" and "-" through. */
function statNumber(draft, k, setSp){
  const num = el("input", "spnum");
  num.type = "text";
  num.inputMode = "numeric";
  num.setAttribute("aria-label", STAT_LABEL[k] + " stat points, 0 to 32");
  num.oninput = function(){
    const clean = num.value.replace(/\D/g, "").slice(0, 2);
    if (clean !== num.value) num.value = clean;
    if (clean === "") return;     // let the box be emptied and retyped
    /* 40 is not a number this box can hold, so correct it on screen too.
       Only OUT-OF-RANGE text is rewritten mid-keystroke - an in-range value
       is left alone, because writing it back would jump the cursor to the
       end while the player is still typing the second digit. */
    if (Number(clean) > 32) num.value = "32";
    setSp(k, Number(clean), num);
  };
  num.onblur = function(){
    if (num.value === "") setSp(k, 0, null);
    num.value = String(Number(draft.stat_points[k]) || 0);
  };
  return num;
}

/* --- moves ---------------------------------------------------------------
   Four slots; tapping one opens the move picker for it. */
function moveSlots(body, ed){
  body.appendChild(el("h2", null, "Moves · 250 VP each"));
  const ls = learnset(ed.draft.pokemon);
  for (let idx = 0; idx < 4; idx++) {
    body.appendChild(moveSlot(ed, idx, ls));
    body.appendChild(el("div", "gap6"));
  }
}

/* One slot, a button that opens the move picker for it. */
function moveSlot(ed, idx, ls){
  const draft = ed.draft;
  const name = draft.moves[idx];
  const s = el("button", "slot" + (name ? "" : " blank"));
  s.appendChild(slotFace(draft, name, idx));
  s.onclick = function(){ movePicker(draft, idx, ls, ed.redraw); };
  return s;
}

/* What a slot shows: the move with its badges and numbers - or, for a name
   the move list does not know, that; or an empty slot, which is allowed. */
function slotFace(draft, name, idx){
  const mv = name ? MOVE_BY[name] : null;
  const mm = el("div", "rmain");
  if (mv) {
    mm.appendChild(slotHead(draft, mv));
    mm.appendChild(el("div", "st", moveNumbers(mv)));
  } else if (name) {
    mm.appendChild(el("div", "rname", name));
    mm.appendChild(el("div", "st", "not in the move list"));
  } else {
    mm.appendChild(el("div", "rname", "Empty slot " + (idx + 1)));
    mm.appendChild(el("div", "st",
      "A set may hold fewer than four moves — and sometimes must."));
  }
  return mm;
}

/* The move's type and name, its priority, whether it is a spread move, and
   what the build's own ability does to it. */
function slotHead(draft, mv){
  const h = el("div", "rname");
  h.appendChild(typeChip(mv.type));
  h.appendChild(el("span", "nm", mv.name));
  if (mv.pri > 0) h.appendChild(el("span", "tag ok", "+" + mv.pri));
  spreadTags(mv, h);
  const ab2 = activeAbility(draft);
  const at2 = ab2 ? abilityTag(ab2, mv, byName[draft.mega || draft.pokemon]) : null;
  if (at2) h.appendChild(at2);
  return h;
}

/* "Physical · 100 BP · 95 acc · 16 PP", a dash for any number the move
   does not have, and the spread note. */
function moveNumbers(mv){
  return catName(mv.cat) +
    "  ·  " + (mv.bp ? mv.bp + " BP" : "—") +
    "  ·  " + (mv.acc == null ? "—" : mv.acc + " acc") +
    "  ·  " + (mv.pp == null ? "—" : mv.pp + " PP") +
    spreadNote(mv);
}

/* --- role and why --------------------------------------------------------
   Free text, his own words. They write straight into the draft. */
function proseFields(body, draft){
  body.appendChild(el("h2", null, "Role"));
  const tr = el("input"); tr.type = "text"; tr.value = draft.role || "";
  tr.oninput = function(){ draft.role = tr.value; };
  body.appendChild(tr);
  body.appendChild(el("h2", null, "Why"));
  const ta = el("textarea"); ta.value = draft.rationale || "";
  ta.oninput = function(){ draft.rationale = ta.value; };
  body.appendChild(ta);
}

/* What the checks in core/build.js find wrong with the draft: over budget, a
   stat past 32, a moveset rule. Refilled in place on every slider step. */
function paintChecks(ed){
  const checkBox = ed.checkBox;
  checkBox.innerHTML = "";
  const probs = checks(ed.draft, ed.p);
  if (!probs.length) return;
  checkBox.appendChild(el("h2", null, "Worth a look"));
  probs.forEach(function(t){
    const n = el("div", "note mb6 " + t[0]);
    n.innerHTML = t[1];
    checkBox.appendChild(n);
  });
}

/* What applying the draft in game would cost in VP, against the set as it
   was when the editor opened. Refilled in place on every slider step. */
function paintCost(ed){
  const costBox = ed.costBox;
  costBox.innerHTML = "";
  const cost = retuneCost(ed.original, ed.draft);
  if (!cost) return;
  const cn = el("div", "note mt12");
  cn.innerHTML = "<strong>" + cost.vp + " VP</strong> to apply this in game: " +
    cost.parts.join(", ") + ".";
  costBox.appendChild(cn);
}

/* SAVE. The id is the build's own now, and the link to a box row lives in
   box_id, which may be null (player, 2026-09-13: three different Farigiraf,
   and a set for a Pokemon he has not got yet). A NEW build asks the database
   for a free id derived from the species - farigiraf, farigiraf-2 - instead
   of guessing from what this device has loaded (see putNew). An EDIT keeps
   its own. Then the trained tag follows the build to its copy. */
function saveBuild(ed){
  const draft = ed.draft, id = ed.id, b = ed.b;
  if (!draft.pokemon) { toast("Pick a Pokemon first"); return; }
  const stem = String(draft.pokemon).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const doc = {pokemon:draft.pokemon, box_id:draft._boxId || null,
             mega:draft.mega || null,
             ability:draft.ability || null,
             mega_ability:draft.mega_ability || null,
             nature:draft.nature || null,
             stat_points:draft.stat_points,
             moves:draft.moves.filter(Boolean),
             role:draft.role || "", rationale:draft.rationale || "",
             extra:b?.extra || {}};
  (id ? put("builds/" + id, doc).then(function(){ return id; })
      : putNew("builds", stem, doc)).then(function(){
    return syncTrained(b?.box_id, doc.box_id, id);
  }).then(function(){
    leaveEditor(); toast("Build saved");
  });
}

/* DELETE, after asking - or, for a build never saved, just leave. The copy
   it sat on loses its trained tag unless another build is still on it. */
function deleteBuild(ed){
  const id = ed.id;
  if (!id) { leaveEditor(); return; }
  ask("Delete the " + ed.draft.pokemon + " build?",
      "Only this set goes. The Pokemon it sits on loses its trained tag, " +
      "unless another build is still on it.",
      "Delete", true).then(function(ok){
    if (!ok) return;
    drop("builds/" + id).then(function(){
      return syncTrained(ed.b?.box_id, null, id);
    }).then(function(){ leaveEditor(); toast("Deleted"); });
  });
}

function movePicker(draft, idx, ls, done){
  const abil = activeAbility(draft);
  const apoke = byName[draft.mega || draft.pokemon];
  /* CLOSE THE SHEET, THEN REDRAW. `done` is the editor's redraw and nothing
     more, so every exit from this picker used to leave the sheet sitting on
     top of the editor it had just changed. Picking a move looked like it
     worked - the slot really was set, underneath - but "Clear slot" and
     "Back" looked broken, because their whole effect was on the screen behind
     the one still covering it, and the only way out was the X (player,
     2026-09-15: "el botón clear slot y back de la ventana de slot de moves no
     funcionan, debo cerrar con la X"). Every exit goes through here now. */
  function finish(){ closeSheet(); done(); }
  openSheet("Slot " + (idx + 1), function(body){
    if (!ls) {
      body.appendChild(el("div", "note bad",
        "No movepool on record for " + draft.pokemon + ", so nothing can be " +
        "offered here. Re-run scripts/refresh.py - the attackdex is where " +
        "learnsets come from."));
      return;
    }
    if (abil && AB_SET[abil]?.side === "off") {
      const n = el("div", "note mb10");
      n.innerHTML = "<strong>" + abil + ".</strong> " + (AB_SET[abil].why || "") +
        " Moves it touches are marked below.";
      body.appendChild(n);
    }
    const ui = moveFilters(body, ls, function(){ draw(); },
                         "Filter " + ls.length + " legal moves",
                         /* one Pokemon's legal moves, so show all of them -
                            the longest movepool in Champions is 106 */
                         {usageOf: draft.pokemon, cap: 200});
    const list = el("div", "list");
    body.appendChild(list);
    function draw(){
      const hits = ui.apply();
      list.innerHTML = "";
      hits.forEach(function(m){
        list.appendChild(moveRowFor(m, abil, apoke, {
          usageOf: draft.pokemon,
          onPick: function(){ draft.moves[idx] = m.name; finish(); },
        }));
      });
      if (!hits.length) list.appendChild(el("div", "empty", "Nothing matches"));
    }
    draw();
  }, [
    fbtn("Clear slot", "", function(){ draft.moves[idx] = null; finish(); }),
    fbtn("Back", "", finish)
  ]);
}

function drawBuilds(){
  const q = ($("buildSearch").value || "").trim().toLowerCase();
  const node = $("listBuilds");
  node.innerHTML = "";
  const ids = Object.keys(S.builds).sort(function(a, b){
    return String(S.builds[a].pokemon).localeCompare(String(S.builds[b].pokemon));
  }).filter(function(id){
    const b = S.builds[id];
    return !q || (b.pokemon + " " + (b.role || "") + " " +
                  (b.moves || []).join(" ")).toLowerCase().includes(q);
  });
  if (!ids.length) {
    node.appendChild(el("div", "empty",
      Object.keys(S.builds).length ? "Nothing matches" : "No builds yet"));
    return;
  }
  ids.forEach(function(id){ node.appendChild(buildRow(id, S.builds[id])); });
}

export { buildSheet, drawBuilds };
