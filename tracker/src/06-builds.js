/* 06-builds.js - The build editor - species, Mega, ability, nature, SP, moves.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import {
  $, C, COSTS, FORMS, MOVE_BY, STAT_KEYS, STAT_LABEL, STONE_OF, bst, byName,
  capNote, cardLine, catName, dexLabel, dexNo, effectLine, el, labelBox,
  learnset, megasFor, natMult, splitPct, splitsFor, splitsReg, statAt,
  statGrid, toast, typeCard, typeChip, usageTag,
} from "./01-data.js";
import { S, boxRows, buildLink, hasStone, ownedNames } from "./02-state.js";
import { drop, put, putNew } from "./03-store.js";
import { ask, closeSheet, fbtn, leaveEditor, openEditor, openSheet }
  from "./04-nav.js";
/* The analysis panel is the box sheet's, deliberately - one renderer, so the
   guide reads the same wherever it is opened. */
import { analysisPanel } from "./05-box.js";
/* The move picker badges each move with what the build's own ability does to
   it, and ranks the list - both are the damage screen's and the search view's
   rules, asked for rather than copied. A build is where an ability meets a
   movepool, so this file is the one place those two have to meet. */
import { AB_SET, abilityHit, abilityTag } from "./11-damage.js";
import { blockerTags, factLine, itemTags, moveFilters, moveScore,
  priorityTag, spreadNote,
  spreadTags } from "./12-find.js";
/* ==================================================================== builds */
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
  var PS = {sort: "dex", mine: false};
  openSheet("Which Pokemon?", function(body){
    var ownedNow = {};
    boxRows("champions").concat(boxRows("home")).forEach(function(r){
      ownedNow[r.name] = (ownedNow[r.name] || 0) + 1;
    });

    var wrap = el("div", "search field");
    wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/>'
                   + '<path d="m20 20-3.5-3.5"/></svg>';
    var inp = el("input");
    inp.type = "text";
    inp.placeholder = "Search " + FORMS.length + " forms - name, type or number";
    wrap.appendChild(inp);
    body.appendChild(wrap);

    var sortWrap = el("div", "toggles");
    [["dex", "Dex no."], ["az", "A-Z"], ["bst", "BST"],
     ["spe", "Speed"]].forEach(function(o){
      var t = el("button", "tog", o[1]);
      t.setAttribute("aria-pressed", PS.sort === o[0] ? "true" : "false");
      t.onclick = function(){
        PS.sort = o[0];
        [].forEach.call(sortWrap.children, function(c){
          c.setAttribute("aria-pressed", c === t ? "true" : "false");
        });
        draw();
      };
      sortWrap.appendChild(t);
    });
    body.appendChild(sortWrap);

    var mineWrap = el("div", "toggles");
    var mineTog = el("button", "tog", "In your boxes");
    mineTog.title = "Everything else is still here - a set for a Pokemon you "
                  + "have not got yet is an idea worth keeping.";
    mineTog.setAttribute("aria-pressed", "false");
    mineTog.onclick = function(){
      PS.mine = !PS.mine;
      mineTog.setAttribute("aria-pressed", PS.mine ? "true" : "false");
      draw();
    };
    mineWrap.appendChild(mineTog);
    body.appendChild(mineWrap);

    var list = el("div", "list cards");
    body.appendChild(list);

    function draw(){
      var q = inp.value.trim().toLowerCase();
      list.innerHTML = "";
      var hits = FORMS.filter(function(p){
        if (PS.mine && !ownedNow[p.name]) return false;
        if (!q) return true;
        return p.name.toLowerCase().indexOf(q) >= 0
            || p.types.join(" ").toLowerCase().indexOf(q) >= 0
            || String(dexNo(p.name)).indexOf(q) >= 0;
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
        var b = typeCard(el("button", "row" + (ownedNow[p.name] ? " perm" : "")), p);
        var m = el("div", "rmain");
        var h = el("div", "rname");
        h.appendChild(document.createTextNode(p.name));
        if (ownedNow[p.name]) {
          h.appendChild(el("span", "tag ok", ownedNow[p.name] > 1
            ? ownedNow[p.name] + " in your boxes" : "yours"));
        }
        var ms = megasFor(p.name);
        if (ms.length) {
          var own = ms.filter(function(x){ return hasStone(STONE_OF[x.name]); });
          h.appendChild(el("span", "tag " + (own.length ? "mega" : ""),
            own.length ? "mega ×" + own.length : "mega — no stone"));
        }
        m.appendChild(h);
        var meta = el("div", "rmeta");
        meta.appendChild(el("span", "mono", dexLabel(p.name)));
        p.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
        m.appendChild(meta);
        m.appendChild(cardLine([labelBox(bst(p), "BST"),
          labelBox(p.ab || [], "Possible ability", "wide")]));
        m.appendChild(statGrid(p));
        b.appendChild(m);
        b.onclick = function(){ onPick(p.name); };
        list.appendChild(b);
      });
      capNote(list, Math.min(120, hits.length), hits.length, "forms");
      if (!list.children.length) {
        list.appendChild(el("div", "empty", PS.mine
          ? "Nothing in your boxes matches"
          : "Nothing matches"));
      }
    }
    inp.oninput = draw;
    draw();
    setTimeout(function(){ inp.focus(); }, 60);
  }, []);
}

function spTotal(sp){
  return STAT_KEYS.reduce(function(a,k){ return a + (Number(sp[k]) || 0); }, 0);
}
function buildRow(id, b){
  var p = byName[b.mega || b.pokemon] || byName[b.pokemon];
  var lk = buildLink(id);
  var isRental = !!(lk.row && lk.row.status === "rental");
  var row = typeCard(el("button", "row " + (lk.state === "orphan" ? "illegal"
                                 : lk.state === "parked" || isRental ? "rental"
                                 : "perm")), p);
  var m = el("div", "rmain");
  var nm = el("div", "rname");
  nm.appendChild(document.createTextNode(b.pokemon));
  if (b.mega) {
    var st = STONE_OF[b.mega];
    var t = el("span", "tag mega", b.mega.replace(/^Mega /, "Mega "));
    if (!hasStone(st)) { t.className = "tag warn"; t.textContent = st + " missing"; }
    nm.appendChild(t);
  }
  var sp = b.stat_points || {};
  var tot = spTotal(sp);
  if (tot !== 66) nm.appendChild(el("span", "tag bad", tot + "/66 SP"));
  if (isRental) nm.appendChild(el("span", "tag warn", "rental — cannot train"));
  if (lk.state === "parked")
    nm.appendChild(el("span", "tag warn", "in HOME — inactive"));
  if (lk.state === "orphan")
    nm.appendChild(el("span", "tag bad", "orphan — no Pokemon"));
  /* Unbound is not a fault, so it is not badged "bad": it is a set written for
     a Pokemon that is not carrying it yet. The two cases read differently and
     only one is a shopping-list item, so they are told apart. */
  if (lk.state === "unbound") {
    var own = boxRows("champions").concat(boxRows("home"))
      .some(function(r){ return r.name === b.pokemon; });
    nm.appendChild(el("span", "tag", own ? "an idea — not installed"
                                         : "an idea — you have none yet"));
  }
  m.appendChild(nm);
  var meta = el("div", "rmeta");
  if (p) p.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
  meta.appendChild(el("span", "mono", (b.moves || []).length + " moves"));
  if (b.role) meta.appendChild(el("span", null, b.role));
  m.appendChild(meta);
  /* A build is a Pokemon, so it reads like one. The stats here are the base
     row's - what the set is built ON - and seeing them beside the nature is
     most of what tells two Farigiraf apart at a glance.
     Here the ability is a DECISION, not a list of options, so the cell shows
     the one the set runs - and the Mega's when a stone is on it, because that
     is the ability that is live for most of the battle. */
  if (p) {
    var abil = (b.mega && b.mega_ability) || b.ability;
    m.appendChild(cardLine([
      labelBox(bst(p), "BST"),
      labelBox(b.nature || null, "Nature"),
      labelBox(abil || null, b.mega && b.mega_ability ? "Mega ability"
                                                      : "Ability", "wide")
    ]));
    m.appendChild(statGrid(p));
  }
  row.appendChild(m);
  row.onclick = function(){ buildSheet(id, b); };
  return row;
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
  var opts = Array.prototype.slice.call(sel.options);
  var rows = opts.map(function(opt, i){
    return {opt:opt, i:i, pct:splitPct(pokemon, kind, opt.value)};
  });
  if (!rows.some(function(r){ return r.pct; })) return;
  rows.sort(function(a, b){
    var pa = a.pct || 0, pb = b.pct || 0;
    return pb - pa || a.i - b.i;
  });
  rows.forEach(function(r){
    if (r.pct) r.opt.text = r.opt.text + "   ·   " + r.pct + "%";
    sel.appendChild(r.opt);              // appending an existing node MOVES it
  });
}

function buildSheet(id, b, keepOriginal){
  var draft = JSON.parse(JSON.stringify(b || {}));
  /* the link is stored as box_id and edited as _boxId - seed one from the
     other, or editing a build would silently unbind it on save */
  draft._boxId = draft.box_id || null;
  draft.stat_points = draft.stat_points || {hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
  draft.moves = draft.moves || [];
  var original = keepOriginal || JSON.parse(JSON.stringify(draft));
  /* built here, filled in place by paintChecks/paintCost below - they live at
     this scope because the sliders repaint them without rebuilding the sheet */
  var checkBox = el("div"), costBox = el("div");
  var p = null;

  openEditor("buildedit", draft.pokemon || "New build", function(body){
    /* --- species (new builds only) ----------------------------------- */
    /* The species first, and it is ANY form in the dex - not only what is in
       the box. A set for a Pokemon he has not got yet is an idea worth keeping
       until he has it, rather than one lost for want of a row to hang it on
       (player, 2026-09-13). Which copy it is installed on is a second, optional
       question, answered below. */
    if (!id) {
      var f0 = el("div", "field");
      f0.appendChild(el("label", "f", "Pokemon"));
      var chosen = draft.pokemon ? byName[draft.pokemon] : null;
      var pick = typeCard(
        el("button", "row " + (draft.pokemon ? "perm" : "unknown")), chosen);
      var pm = el("div", "rmain");
      pm.appendChild(el("div", "rname", draft.pokemon || "Tap to choose"));
      var pmeta = el("div", "rmeta");
      if (chosen) {
        chosen.types.forEach(function(t){ pmeta.appendChild(typeChip(t)); });
        pmeta.appendChild(el("span", "mono", "BST " + bst(chosen)));
      } else {
        pmeta.appendChild(el("span", null,
          "any of the " + FORMS.length + " forms in the game, owned or not"));
      }
      pm.appendChild(pmeta);
      pick.appendChild(pm);
      pick.onclick = function(){
        speciesSheet(function(name){
          draft.pokemon = name;
          draft._boxId = null;          // the copy is chosen separately
          closeSheet();
          redraw();
        });
      };
      f0.appendChild(pick);
      body.appendChild(f0);
      if (!draft.pokemon) return;
    }

    p = byName[draft.pokemon];

    /* WHICH COPY, and "none yet" is a real answer. Every copy is offered, in
       either box, whether or not it already carries a build - three Farigiraf
       builds is the point, and choosing between them happens in game or per
       team. */
    var copies = boxRows("champions").concat(boxRows("home"))
      .filter(function(r){ return r.name === draft.pokemon; });
    var f1 = el("div", "field");
    f1.appendChild(el("label", "f", "Installed on"));
    var sel1 = el("select");
    sel1.appendChild(new Option(
      copies.length ? "— not installed (just an idea) —"
                    : "— you do not have one yet —", ""));
    copies.forEach(function(r, i){
      var other = Object.keys(S.builds).filter(function(k){
        return k !== id && S.builds[k].box_id === r._id; }).length;
      sel1.appendChild(new Option(
        r.name + " · " + (r.location === "home" ? "HOME" : "Champions box") +
        (copies.length > 1 ? " · copy " + (i + 1) : "") +
        (r.status === "rental" ? " · rental, cannot be trained" : "") +
        (other ? " · already carries a build" : ""), r._id));
    });
    sel1.onchange = function(){ draft._boxId = sel1.value || null; };
    sel1.value = draft._boxId || "";
    f1.appendChild(sel1);
    body.appendChild(f1);

    var lk = id ? buildLink(id) : {state:draft._boxId ? "active" : "unbound"};
    /* NO NOTE WHEN HE OWNS ONE. The select directly above already reads
       "— not installed (just an idea) —", so a paragraph underneath saying
       "Not installed on anything" was the same sentence twice (player,
       2026-09-15: "ese mensaje de not installed es redudandte"). The other
       half stays, because it is not in the dropdown: a set for a species that
       is not in either box cannot be trained or brought at all. */
    if (lk.state === "unbound" && !copies.length) {
      var ub = el("div", "note");
      ub.innerHTML = "<strong>You do not have a " + draft.pokemon +
        " yet.</strong> The set is saved anyway, so the idea keeps — it just " +
        "cannot be trained or brought to a battle until one arrives.";
      body.appendChild(ub);
    }
    if (lk.state === "parked") {
      var pk = el("div", "note warn");
      pk.innerHTML = "<strong>Parked in HOME — this build is inactive.</strong> " +
        "It is kept exactly as it is, because a HOME-origin Pokemon comes back " +
        "with its training. Nothing here can be applied while it sits in HOME; " +
        "send " + draft.pokemon + " to Champions and it is live again.";
      body.appendChild(pk);
    }
    if (lk.state === "orphan") {
      var or = el("div", "note bad");
      or.innerHTML = "<strong>Orphan build.</strong> The Pokemon this belonged " +
        "to is no longer in the ledger, so this set is not on anything. Point " +
        "it at another " + draft.pokemon + ", or delete it.";
      body.appendChild(or);
      /* every copy, including one that already carries a build: more than one
         set per Pokemon is allowed now */
      var cands = boxRows("champions").concat(boxRows("home")).filter(function(r){
        return r.name === draft.pokemon;
      });
      if (cands.length) {
        var fr = el("div", "field");
        fr.appendChild(el("label", "f", "Link this build to"));
        var selr = el("select");
        cands.forEach(function(r){
          selr.appendChild(new Option(
            r.name + " — " + (r.location === "home" ? "in HOME" : "Champions box"),
            r._id));
        });
        fr.appendChild(selr);
        var go = el("button", "fbtn primary", "Link");
        go.onclick = function(){
          /* Re-point the LINK. This used to copy the build to a new id and
             delete the old one, because the id WAS the box row - so relinking
             meant rewriting the build's identity, and anything referring to it
             broke. box_id is a field now; the build keeps its name. */
          var doc = JSON.parse(JSON.stringify(b));
          delete doc._boxId;
          doc.box_id = selr.value;
          put("builds/" + id, doc).then(function(){
            closeSheet(); toast("Linked to " + draft.pokemon);
          });
        };
        fr.appendChild(go);
        body.appendChild(fr);
      }
    }
    var own = ownedNames();
    if (own[draft.pokemon] === "rental") {
      var w = el("div", "note warn");
      w.innerHTML = "<strong>This one is a rental.</strong> Nothing on this page " +
        "can be applied in game until it is made permanent (2500 VP). A rental " +
        "is locked to its default set.";
      body.appendChild(w);
    }

    /* --- mega -------------------------------------------------------- */
    var ms = megasFor(draft.pokemon);
    if (ms.length) {
      var fm = el("div", "field");
      fm.appendChild(el("label", "f", "Mega"));
      var togs = el("div", "toggles");
      var none = el("button", "tog", "Base form only");
      none.setAttribute("aria-pressed", draft.mega ? "false" : "true");
      none.onclick = function(){ draft.mega = null; draft.mega_ability = null; redraw(); };
      togs.appendChild(none);
      ms.forEach(function(m){
        var st = STONE_OF[m.name];
        var t = el("button", "tog mega",
          m.name + (hasStone(st) ? "" : " · " + st + " 2000 VP"));
        t.setAttribute("aria-pressed", draft.mega === m.name ? "true" : "false");
        t.onclick = function(){
          draft.mega = m.name;
          draft.mega_ability = m.ab[0] || null;
          redraw();
        };
        togs.appendChild(t);
      });
      fm.appendChild(togs);
      body.appendChild(fm);
      if (draft.mega) {
        var mm = byName[draft.mega];
        var nt = el("div", "note");
        nt.innerHTML = "<strong>" + draft.mega + ".</strong> " +
          p.types.join("/") + " → " + mm.types.join("/") + ". Ability " +
          p.ab.join("/") + " → " + mm.ab.join("/") + ". Spe " + p.b[5] +
          " → " + mm.b[5] + ". The registered ability is the base one, and " +
          "that is correct — it is what the Pokemon has until it evolves.";
        body.appendChild(nt);
      }
    }

    /* --- ability + nature -------------------------------------------- */
    /* HEADINGS, BECAUSE THIS IS A LONG SCROLL ON A PHONE. Stat Points, Moves,
       Role and Why already had one; the two blocks above them did not, so the
       editor opened as an unbroken column of controls with no way to see
       where you were in it. Same size and weight as the others - this is
       signposting, not decoration. */
    body.appendChild(el("h2", null, "Ability and nature · 500 VP each"));
    var g = el("div", "grid2");
    var fa = el("div", "field");
    fa.appendChild(el("label", "f", "Ability (base form)"));
    var sa = el("select");
    ((p && p.ab) || []).forEach(function(a){ sa.appendChild(new Option(a, a)); });
    if (draft.ability && (!p || p.ab.indexOf(draft.ability) < 0))
      sa.appendChild(new Option(draft.ability, draft.ability));
    /* The same question as the moves: of the people running this Pokemon,
       which ability do they pick? Kingambit is 98.6% Defiant, and a list of
       three cannot say that on its own - so the list is REORDERED by it. */
    orderByUsage(sa, draft.pokemon, "a");
    sa.value = draft.ability || (p && p.ab[0]) || "";
    sa.onchange = function(){ draft.ability = sa.value; redraw(); };
    fa.appendChild(sa);
    /* WHAT THE ABILITY DOES, UNDER THE ABILITY. This used to be appended after
       the whole two-column block, which reads correctly at desktop width -
       the paragraph sits under both columns - and reads WRONG on a phone,
       where the columns stack and the sentence lands directly beneath the
       NATURE select, describing the wrong control. Seen at 360px. Inside the
       field it stays attached in either layout. */
    if (draft.ability && C.ABIL[draft.ability]) {
      fa.appendChild(el("p", "sub", C.ABIL[draft.ability]));
      /* and what it does as a NUMBER - Guts reads x1.5 from the engine's own
         modifier stage, which is the half of the sentence that decides a
         calculation */
      var abnum = effectLine(draft.ability);
      if (abnum) fa.appendChild(abnum);
    }
    g.appendChild(fa);

    var fn = el("div", "field");
    fn.appendChild(el("label", "f", "Nature"));
    var sn = el("select");
    Object.keys(C.NATURES).sort().forEach(function(n){
      sn.appendChild(new Option(n + " — " + C.NATURES[n][2], n));
    });
    /* and the same on natures - 90.3% Adamant on Kingambit is the answer to
       "what do people actually pick", which 25 alphabetical rows cannot give */
    orderByUsage(sn, draft.pokemon, "n");
    sn.value = draft.nature || "Hardy";
    sn.onchange = function(){ draft.nature = sn.value; redraw(); };
    fn.appendChild(sn);
    g.appendChild(fn);
    body.appendChild(g);

    /* THE SPREADS ITS PLAYERS RUN - SHOWN, NEVER APPLIED.
       His rule, and he had to correct me on it (2026-09-15): "no quiero
       autollenado, solo quiero un indicador de lo mas popular para armar las
       builds... el armado final es mio." The first version made these buttons
       that set the six numbers, which is exactly the thing he does not want.
       An indicator informs a decision; a button makes it. So this is text,
       with no click and no handler - the sliders are his. */
    var sp = splitsFor(draft.pokemon);
    if (sp && ((sp.s || []).length || (sp.t || []).length)) {
      var rh = el("h2", null, "What its players run" +
                  (splitsReg() ? " · " + splitsReg() : ""));
      rh.title = "Reference only. Nothing here fills anything in.";
      body.appendChild(rh);
      body.appendChild(el("p", "sub",
        "Reference only — nothing here fills anything in."));
    }
    if (sp && (sp.s || []).length) {
      var sprow = el("div", "field");
      sprow.appendChild(el("label", "f", "SP spreads"));
      /* A spread is [hp, atk, def, spa, spd, spe, percent] - six numbers in
         STAT_KEYS order and then its share. Flat, because an object per row
         was more than twice the bytes for 283 Pokemon and this is the one
         section long enough for that to matter. */
      sp.s.slice(0, 6).forEach(function(row){
        var bits = STAT_KEYS.map(function(k, i){
          return row[i] ? row[i] + " " + STAT_LABEL[k] : null;
        }).filter(Boolean).join(" / ");
        var line = el("div", "st");
        var t = el("span", "tag", row[6] + "%");
        t.style.marginRight = "6px";
        line.appendChild(t);
        line.appendChild(document.createTextNode(bits));
        sprow.appendChild(line);
      });
      body.appendChild(sprow);
    }

    /* WHO IT IS BROUGHT WITH. The Item Clause makes a team a set of six
       decisions that constrain each other, so "53.9% of the teams that
       brought this also brought Sneasler" is the single most useful line in
       the whole block for team building - and it was being thrown away,
       because pokebase renders only the first five and the rest sit in the
       page payload (player, 2026-09-15: "es super completo eso y la ayuda que
       brinda para armar teams"). Reference only, like the spreads. */
    if (sp && (sp.t || []).length) {
      var tmrow = el("div", "field");
      tmrow.appendChild(el("label", "f", "Brought alongside"));
      var tmline = el("div", "rmeta");
      sp.t.forEach(function(pair){
        var t = el("span", "tag", pair[0] + " " + pair[1] + "%");
        t.title = pair[1] + "% of the teams that brought " + draft.pokemon +
          " also brought " + pair[0];
        tmline.appendChild(t);
      });
      tmrow.appendChild(tmline);
      body.appendChild(tmrow);
    }

    /* SMOGON'S GUIDE, HERE, because this is where the decisions are made.
       The same panel the box sheet opens - one place that knows how to draw
       it - and folded, so the 407 KB behind it is fetched only when a build is
       actually being argued about. */
    if (draft.pokemon) {
      var gwrap = el("div");
      var gtog = el("button", "btn sm fold");
      gtog.setAttribute("aria-expanded", "false");
      gtog.textContent = "Read Smogon on " + draft.pokemon;
      var ghost = el("div");
      ghost.hidden = true;
      gtog.onclick = function(){
        var open = ghost.hidden;
        ghost.hidden = !open;
        gtog.setAttribute("aria-expanded", open ? "true" : "false");
        if (open && !ghost._drawn) {
          ghost._drawn = 1;
          analysisPanel(draft.pokemon, ghost);
        }
      };
      gwrap.appendChild(gtog);
      gwrap.appendChild(ghost);
      body.appendChild(gwrap);
    }

    /* --- stat points -------------------------------------------------- */
    /* Dragging the slider was impossible, and the reason was here: oninput
       called redraw(), which rebuilds this entire sheet, so the range element
       under the finger was destroyed on the very first step and the drag died
       with it. A click still worked because a click is one discrete event.
       Nothing below rebuilds the sheet - spPaint() repaints only what depends
       on the value. The slider, the two arrows and the typed box are three
       doors into the same setSp(), so they can never disagree with each other
       or with the draft. */
    body.appendChild(el("h2", null, "Stat Points · 5 VP each"));
    var meter = el("div", "meter");
    var fill = el("i");
    meter.appendChild(fill);
    body.appendChild(meter);
    var bud = el("div", "budget");
    var budSpent = el("span"), budLeft = el("span");
    bud.appendChild(budSpent);
    bud.appendChild(budLeft);
    body.appendChild(bud);

    var spRepaint = [];
    function setSp(k, v, typing){
      draft.stat_points[k] = Math.max(0, Math.min(32, v));
      spPaint(typing);
    }
    /* `typing` is the box the player is mid-keystroke in; writing back to it
       would fight the cursor, so it is the one node spPaint leaves alone */
    function spPaint(typing){
      var t = spTotal(draft.stat_points);
      fill.style.width = Math.min(100, t / 66 * 100) + "%";
      if (t > 66) meter.classList.add("over"); else meter.classList.remove("over");
      budSpent.textContent = t + " of 66 spent";
      budLeft.textContent = t > 66 ? (t - 66) + " over budget"
                                   : (66 - t) + " left";
      bud.style.color = t > 66 ? "var(--bad)" : "";
      spRepaint.forEach(function(f){ f(typing); });
      paintChecks();
      paintCost();
    }

    STAT_KEYS.forEach(function(k, i){
      var line = el("div", "sp spedit");
      line.appendChild(el("span", "k", STAT_LABEL[k]));

      var r = el("input"); r.type = "range"; r.min = 0; r.max = 32; r.step = 1;
      r.setAttribute("aria-label", STAT_LABEL[k] + " stat points");
      r.oninput = function(){ setSp(k, Number(r.value), null); };
      line.appendChild(r);

      var dec = el("button", "step", "−");
      dec.type = "button";
      dec.setAttribute("aria-label", "One less " + STAT_LABEL[k]);
      dec.onclick = function(){
        setSp(k, (Number(draft.stat_points[k]) || 0) - 1, null);
      };
      line.appendChild(dec);

      /* type=text with a digit filter, not type=number: a browser spinner
         would sit right next to our own arrows doing the same job, and on
         Android type=number still lets "e", "+" and "-" through */
      var num = el("input", "spnum");
      num.type = "text";
      num.inputMode = "numeric";
      num.setAttribute("aria-label", STAT_LABEL[k] + " stat points, 0 to 32");
      num.oninput = function(){
        var clean = num.value.replace(/[^0-9]/g, "").slice(0, 2);
        if (clean !== num.value) num.value = clean;
        if (clean === "") return;     // let the box be emptied and retyped
        /* 40 is not a number this box can hold, so correct it on screen too.
           Only OUT-OF-RANGE text is rewritten mid-keystroke - an in-range
           value is left alone, because writing it back would jump the cursor
           to the end while the player is still typing the second digit. */
        if (Number(clean) > 32) num.value = "32";
        setSp(k, Number(clean), num);
      };
      num.onblur = function(){
        if (num.value === "") setSp(k, 0, null);
        num.value = String(Number(draft.stat_points[k]) || 0);
      };
      line.appendChild(num);

      var inc = el("button", "step", "+");
      inc.type = "button";
      inc.setAttribute("aria-label", "One more " + STAT_LABEL[k]);
      inc.onclick = function(){
        setSp(k, (Number(draft.stat_points[k]) || 0) + 1, null);
      };
      line.appendChild(inc);

      var cs = el("span", "calc");
      cs.title = "Level 50 stat";
      line.appendChild(cs);
      body.appendChild(line);

      spRepaint.push(function(typing){
        var v = Number(draft.stat_points[k]) || 0;
        /* a build imported from elsewhere can hold more than 32; show the real
           number and flag it rather than quietly clamping the display */
        r.value = Math.min(32, v);
        if (num !== typing) num.value = String(v);
        if (v > 32) line.classList.add("over"); else line.classList.remove("over");
        dec.disabled = v <= 0;
        inc.disabled = v >= 32;
        var basep = byName[draft.mega || draft.pokemon] || p;
        cs.textContent = basep
          ? String(statAt(basep.b[i], v, k === "hp", natMult(draft.nature, k)))
          : "0";
      });
    });
    body.appendChild(el("p", "sub",
      "Right column is the level-50 stat" +
      (draft.mega ? " in Mega form." : ".") +
      " Points in a defensive stat only earn their place if they move a real " +
      "attack from a 1HKO to a 2HKO — percentages are decoration."));

    /* --- moves --------------------------------------------------------- */
    body.appendChild(el("h2", null, "Moves · 250 VP each"));
    var ls = learnset(draft.pokemon);
    for (var i = 0; i < 4; i++) {
      (function(idx){
        var name = draft.moves[idx];
        var mv = name ? MOVE_BY[name] : null;
        var s = el("button", "slot" + (name ? "" : " blank"));
        var mm = el("div", "rmain");
        if (mv) {
          var h = el("div", "rname");
          h.appendChild(typeChip(mv.type));
          h.appendChild(el("span", "nm", mv.name));
          if (mv.pri > 0) h.appendChild(el("span", "tag ok", "+" + mv.pri));
          spreadTags(mv, h);
          var ab2 = draft.mega ? (draft.mega_ability || draft.ability) : draft.ability;
          var at2 = ab2 ? abilityTag(ab2, mv, byName[draft.mega || draft.pokemon]) : null;
          if (at2) h.appendChild(at2);
          mm.appendChild(h);
          mm.appendChild(el("div", "st",
            catName(mv.cat) +
            "  ·  " + (mv.bp ? mv.bp + " BP" : "—") +
            "  ·  " + (mv.acc == null ? "—" : mv.acc + " acc") +
            "  ·  " + (mv.pp == null ? "—" : mv.pp + " PP") +
            spreadNote(mv)));
        } else if (name) {
          mm.appendChild(el("div", "rname", name));
          mm.appendChild(el("div", "st", "not in the move list"));
        } else {
          mm.appendChild(el("div", "rname", "Empty slot " + (idx + 1)));
          mm.appendChild(el("div", "st",
            "A set may hold fewer than four moves — and sometimes must."));
        }
        s.appendChild(mm);
        s.onclick = function(){ movePicker(draft, idx, ls, redraw); };
        body.appendChild(s);
        body.appendChild(el("div", "gap6"));
      })(i);
    }

    /* --- checks -------------------------------------------------------- */
    /* The 66-point budget and the 32-per-stat cap are the two things a slider
       drag can break, so they repaint with the slider instead of waiting for
       the sheet to be rebuilt. */
    body.appendChild(checkBox);

    /* --- prose --------------------------------------------------------- */
    body.appendChild(el("h2", null, "Role"));
    var tr = el("input"); tr.type = "text"; tr.value = draft.role || "";
    tr.oninput = function(){ draft.role = tr.value; };
    body.appendChild(tr);
    body.appendChild(el("h2", null, "Why"));
    var ta = el("textarea"); ta.value = draft.rationale || "";
    ta.oninput = function(){ draft.rationale = ta.value; };
    body.appendChild(ta);

    /* --- cost ---------------------------------------------------------- */
    body.appendChild(costBox);
    spPaint(null);
  }, [
    fbtn("Save", "primary", function(){
      if (!draft.pokemon) { toast("Pick a Pokemon first"); return; }
      /* The key used to BE the box row - one Pokemon, one build, and no build
         without a Pokemon to carry it. Both halves are gone (player,
         2026-09-13): he wants three different Farigiraf and he wants to write
         a set down for a Pokemon he has not got yet, so the idea survives
         until he does. The id is its own thing now and the link lives in
         box_id, which may be null.
         The id is derived from the species so it stays readable in the ledger
         - farigiraf, farigiraf-2, farigiraf-3 - the same shape the box already
         uses for duplicates. */
      /* A NEW build asks the database for a free id instead of guessing from
         what this device has loaded - see putNew(). An EDIT keeps its own. */
      var stem = String(draft.pokemon).toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      var doc = {pokemon:draft.pokemon, box_id:draft._boxId || null,
                 mega:draft.mega || null,
                 ability:draft.ability || null,
                 mega_ability:draft.mega_ability || null,
                 nature:draft.nature || null,
                 stat_points:draft.stat_points,
                 moves:draft.moves.filter(Boolean),
                 role:draft.role || "", rationale:draft.rationale || "",
                 extra:(b && b.extra) || {}};
      (id ? put("builds/" + id, doc).then(function(){ return id; })
          : putNew("builds", stem, doc)).then(function(){
        leaveEditor(); toast("Build saved");
      });
    }),
    fbtn(id ? "Delete" : "Cancel", id ? "danger" : "", function(){
      if (!id) { leaveEditor(); return; }
      ask("Delete the " + draft.pokemon + " build?",
          "The Pokemon itself is not touched — only this set.",
          "Delete", true).then(function(ok){
        if (!ok) return;
        drop("builds/" + id).then(function(){ leaveEditor(); toast("Deleted"); });
      });
    })
  ]);

  /* redraw rebuilds the sheet from the live draft, carrying the pre-edit
     snapshot forward so the VP cost is measured against the saved set */
  /* in place, for the same reason the team editor does */
  function redraw(){ buildSheet(id, draft, original); }

  /* Both of these sit BELOW the sliders but depend on them, so they are built
     once and refilled in place rather than rebuilt with the sheet. */
  function paintChecks(){
    checkBox.innerHTML = "";
    var probs = checks(draft, p);
    if (!probs.length) return;
    checkBox.appendChild(el("h2", null, "Worth a look"));
    probs.forEach(function(t){
      var n = el("div", "note " + t[0]);
      n.style.marginBottom = "6px";
      n.innerHTML = t[1];
      checkBox.appendChild(n);
    });
  }
  function paintCost(){
    costBox.innerHTML = "";
    var cost = retuneCost(original, draft);
    if (!cost) return;
    var cn = el("div", "note");
    cn.style.marginTop = "12px";
    cn.innerHTML = "<strong>" + cost.vp + " VP</strong> to apply this in game: " +
      cost.parts.join(", ") + ".";
    costBox.appendChild(cn);
  }
}

function checks(d, p){
  var out = [];
  var tot = spTotal(d.stat_points);
  if (tot > 66) out.push(["bad", "<strong>" + tot + " Stat Points.</strong> The budget is 66."]);
  STAT_KEYS.forEach(function(k){
    if ((Number(d.stat_points[k]) || 0) > 32)
      out.push(["bad", "<strong>" + STAT_LABEL[k] + " is over 32.</strong> No single stat may pass 32."]);
  });
  var basep = byName[d.mega || d.pokemon] || p;
  if (basep) {
    var natUp = C.NATURES[d.nature] && C.NATURES[d.nature][0];
    var atk = statAt(basep.b[1], d.stat_points.atk, false, natMult(d.nature, "atk"));
    var spa = statAt(basep.b[3], d.stat_points.spa, false, natMult(d.nature, "spa"));
    var main = atk >= spa ? "P" : "S";
    (d.moves || []).forEach(function(n){
      var m = MOVE_BY[n];
      if (!m) return;
      if (m.pri > 0 && m.cat !== "T" && m.cat !== main) {
        out.push(["warn", "<strong>" + m.name + " is priority, but " +
          (m.cat === "P" ? "physical" : "special") + ".</strong> This set hits " +
          "harder on " + (main === "P" ? "Attack" : "Sp. Atk") +
          " (" + Math.max(atk, spa) + " vs " + Math.min(atk, spa) +
          "), so the priority slot buys little."]);
      }
      if (m.hitsAlly) {
        out.push(["warn", "<strong>" + m.name + " hits your own ally too.</strong> " +
          "Only run it if the partner absorbs it or is immune."]);
      }
    });
    var abil = d.mega ? (d.mega_ability || "") : (d.ability || "");
    if (abil === "Intimidate" || d.ability === "Intimidate") {
      out.push(["warn", "<strong>Intimidate on your own side.</strong> Defiant, " +
        "Competitive, Contrary, Guard Dog and Rattled all turn it into a free " +
        "boost for the opponent."]);
    }
    if ((d.moves || []).some(function(n){ return n === "Weather Ball"; })) {
      out.push(["warn", "<strong>Weather Ball is never Normal in play.</strong> " +
        "Resolve it to this team's own weather before quoting any number."]);
    }
    var ls = learnset(d.pokemon);
    if (ls) {
      var legal = {};
      ls.forEach(function(m){ legal[m.name] = 1; });
      (d.moves || []).forEach(function(n){
        if (n && !legal[n])
          out.push(["bad", "<strong>" + n + "</strong> is not in " + d.pokemon +
            "'s learnset."]);
      });
    }
  }
  var own = ownedNames();
  if (d.pokemon && !(d.pokemon in own))
    out.push(["bad", "<strong>" + d.pokemon + " is not in the Champions Box.</strong>"]);
  return out;
}

function retuneCost(a, b){
  var parts = [], vp = 0;
  var sa = a.stat_points || {}, sb = b.stat_points || {};
  var spChanged = STAT_KEYS.reduce(function(n, k){
    return n + ((Number(sa[k]) || 0) !== (Number(sb[k]) || 0) ? 1 : 0);
  }, 0);
  var spDelta = STAT_KEYS.reduce(function(n, k){
    return n + Math.abs((Number(sa[k]) || 0) - (Number(sb[k]) || 0));
  }, 0);
  if (spDelta) { vp += spDelta * COSTS.training_stat_point;
                 parts.push(spDelta + " SP × 5"); }
  var ma = (a.moves || []).join("|"), mb = (b.moves || []).join("|");
  if (ma !== mb) {
    var n = (b.moves || []).filter(function(m, i){ return m !== (a.moves || [])[i]; }).length;
    vp += n * COSTS.training_move;
    parts.push(n + " move" + (n === 1 ? "" : "s") + " × 250");
  }
  if ((a.nature || "") !== (b.nature || "")) { vp += 500; parts.push("nature 500"); }
  if ((a.ability || "") !== (b.ability || "")) { vp += 500; parts.push("ability 500"); }
  return vp ? {vp:vp, parts:parts} : null;
}

function movePicker(draft, idx, ls, done){
  var abil = draft.mega ? (draft.mega_ability || draft.ability) : draft.ability;
  var apoke = byName[draft.mega || draft.pokemon];
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
    if (abil && AB_SET[abil] && AB_SET[abil].side === "off") {
      var n = el("div", "note");
      n.style.marginBottom = "10px";
      n.innerHTML = "<strong>" + abil + ".</strong> " + (AB_SET[abil].why || "") +
        " Moves it touches are marked below.";
      body.appendChild(n);
    }
    var ui = moveFilters(body, ls, function(){ draw(); },
                         "Filter " + ls.length + " legal moves",
                         /* one Pokemon's legal moves, so show all of them -
                            the longest movepool in Champions is 106 */
                         {usageOf: draft.pokemon, cap: 200});
    var list = el("div", "list");
    body.appendChild(list);
    var score = moveScore;
    function draw(){
      var hits = ui.apply();
      list.innerHTML = "";
      hits.forEach(function(m){
        var r = el("button", "row");
        var mm = el("div", "rmain");
        var h = el("div", "rname");
        h.appendChild(typeChip(m.type));
        h.appendChild(document.createTextNode(m.name));
        priorityTag(m, h); spreadTags(m, h); itemTags(m, h);
        blockerTags(m, h);
        var atag = abil ? abilityTag(abil, m, apoke) : null;
        if (atag) h.appendChild(atag);
        /* EVERY move carries one, including the ones at 0%. The picker used
           to badge four or five and leave the rest of the movepool blank, and
           blank reads as "no data" when it actually meant "nobody brought it"
           - which is an answer, and the one the player asked to see (2026-09-
           15: "lo que yo quiero es que marque todos los ataques posibles con %
           de uso"). splitPct returns null only when the Pokemon has no table
           at all, and that is the one case that stays silent. */
        var utag = usageTag(splitPct(draft.pokemon, "m", m.name),
                            draft.pokemon, "m");
        if (utag) h.appendChild(utag);
        mm.appendChild(h);
        /* One span per fact, so a phone breaks the line between them and
           never inside one - see factLine. Nine badges and five numbers on a
           360px row is what made that matter. */
        var hh = abil ? abilityHit(abil, m, apoke) : null;
        mm.appendChild(factLine([
          catName(m.cat),
          m.bp ? m.bp + " BP" : "— BP",
          (m.acc == null ? "—" : m.acc) + " acc",
          (m.pp == null ? "—" : m.pp) + " PP",
          m.bp ? Math.round(score(m)) + " effective" : null,
          hh && hh.x && m.bp
            ? Math.round(m.bp * hh.x) + " BP with " + abil : null,
          m.target
        ]));
        if (m.text) mm.appendChild(el("div", "st", m.text));
        r.appendChild(mm);
        r.onclick = function(){
          draft.moves[idx] = m.name;
          finish();
        };
        list.appendChild(r);
      });
      if (!hits.length) list.appendChild(el("div", "empty", "Nothing matches"));
    }
    draw();
  }, [
    fbtn("Clear slot", "", function(){ draft.moves[idx] = null; finish(); }),
    fbtn("Back", "", finish)
  ]);
}

/* ------------------------------------------------------- what leaves here --
   A row and the sheet behind it. `checks` - the SP budget, the 32 cap, the
   moveset rules - is private, and so is `retuneCost`, so what a build COSTS
   is computed in one place. `movePicker` too: every move that enters a build
   goes through it, which is what makes the badges and the ranking consistent
   wherever a move is offered.
*/
export { buildRow, buildSheet };
