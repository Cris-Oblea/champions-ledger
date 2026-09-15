/* 06-builds.js - The build editor - species, Mega, ability, nature, SP, moves.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import {
  $, C, COSTS, FORMS, MOVE_BY, STAT_KEYS, STAT_LABEL, STONE_OF, byName,
  catName, effectLine, el, learnset, megasFor, natMult, statAt, toast,
  typeChip,
} from "./01-data.js";
import { S, boxRows, buildLink, hasStone, ownedNames } from "./02-state.js";
import { drop, put, putNew } from "./03-store.js";
import { closeSheet, fbtn, leaveEditor, openEditor, openSheet }
  from "./04-nav.js";
/* The analysis panel is the box sheet's, deliberately - one renderer, so the
   guide reads the same wherever it is opened. */
import { analysisPanel } from "./05-box.js";
/* The move picker badges each move with what the build's own ability does to
   it, and ranks the list - both are the damage screen's and the search view's
   rules, asked for rather than copied. A build is where an ability meets a
   movepool, so this file is the one place those two have to meet. */
import { AB_SET, abilityHit, abilityTag } from "./11-damage.js";
import { itemTags, moveFilters, moveScore, priorityTag, spreadNote, spreadTags }
  from "./12-find.js";
/* ==================================================================== builds */
function spTotal(sp){
  return STAT_KEYS.reduce(function(a,k){ return a + (Number(sp[k]) || 0); }, 0);
}
function buildRow(id, b){
  var p = byName[b.mega || b.pokemon] || byName[b.pokemon];
  var lk = buildLink(id);
  var isRental = !!(lk.row && lk.row.status === "rental");
  var row = el("button", "row " + (lk.state === "orphan" ? "illegal"
                                 : lk.state === "parked" || isRental ? "rental"
                                 : "perm"));
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
  meta.appendChild(el("span", null, b.nature || "—"));
  meta.appendChild(el("span", "mono", (b.moves || []).length + " moves"));
  if (b.role) meta.appendChild(el("span", null, b.role));
  m.appendChild(meta);
  row.appendChild(m);
  row.onclick = function(){ buildSheet(id, b); };
  return row;
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
      var sel0 = el("select");
      sel0.appendChild(new Option("— pick —", ""));
      var ownedNow = {};
      boxRows("champions").concat(boxRows("home")).forEach(function(r){
        ownedNow[r.name] = (ownedNow[r.name] || 0) + 1;
      });
      FORMS.forEach(function(q){        /* already the non-Mega dex, sorted */
        sel0.appendChild(new Option(
          q.name + (ownedNow[q.name] ? "" : "  (not in your boxes)"), q.name));
      });
      sel0.onchange = function(){
        draft.pokemon = sel0.value;
        draft._boxId = null;            // the copy is chosen separately
        redraw();
      };
      sel0.value = draft.pokemon || "";
      f0.appendChild(sel0);
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
    if (lk.state === "unbound") {
      var ub = el("div", "note");
      ub.innerHTML = copies.length
        ? "<strong>Not installed on anything.</strong> Kept as a plan. Nothing " +
          "here costs VP until you point it at one of your " + draft.pokemon + "."
        : "<strong>You do not have a " + draft.pokemon + " yet.</strong> The " +
          "set is saved anyway, so the idea keeps — it just cannot be trained " +
          "or brought to a battle until one arrives.";
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
    var g = el("div", "grid2");
    var fa = el("div", "field");
    fa.appendChild(el("label", "f", "Ability (base form)"));
    var sa = el("select");
    ((p && p.ab) || []).forEach(function(a){ sa.appendChild(new Option(a, a)); });
    if (draft.ability && (!p || p.ab.indexOf(draft.ability) < 0))
      sa.appendChild(new Option(draft.ability, draft.ability));
    sa.value = draft.ability || (p && p.ab[0]) || "";
    sa.onchange = function(){ draft.ability = sa.value; redraw(); };
    fa.appendChild(sa);
    g.appendChild(fa);

    var fn = el("div", "field");
    fn.appendChild(el("label", "f", "Nature · 500 VP"));
    var sn = el("select");
    Object.keys(C.NATURES).sort().forEach(function(n){
      sn.appendChild(new Option(n + " — " + C.NATURES[n][2], n));
    });
    sn.value = draft.nature || "Hardy";
    sn.onchange = function(){ draft.nature = sn.value; redraw(); };
    fn.appendChild(sn);
    g.appendChild(fn);
    body.appendChild(g);

    if (draft.ability && C.ABIL[draft.ability]) {
      body.appendChild(el("p", "sub", C.ABIL[draft.ability]));
      /* and what it does as a NUMBER - Guts reads x1.5 from the engine's own
         modifier stage, which is the half of the sentence that decides a
         calculation */
      var abnum = effectLine(draft.ability);
      if (abnum) body.appendChild(abnum);
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
      if (!confirm("Delete the " + draft.pokemon + " build?")) return;
      drop("builds/" + id).then(function(){ leaveEditor(); toast("Deleted"); });
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
                         "Filter " + ls.length + " legal moves");
    var list = el("div", "list");
    body.appendChild(list);
    var score = moveScore;
    function draw(){
      var hits = ui.apply();
      list.innerHTML = "";
      hits.slice(0, 80).forEach(function(m){
        var r = el("button", "row");
        var mm = el("div", "rmain");
        var h = el("div", "rname");
        h.appendChild(typeChip(m.type));
        h.appendChild(document.createTextNode(m.name));
        priorityTag(m, h); spreadTags(m, h); itemTags(m, h);
        var atag = abil ? abilityTag(abil, m, apoke) : null;
        if (atag) h.appendChild(atag);
        mm.appendChild(h);
        mm.appendChild(el("div", "rmeta")).appendChild(el("span", "mono",
          catName(m.cat) +
          "  ·  " + (m.bp ? m.bp + " BP" : "— BP") +
          "  ·  " + (m.acc == null ? "—" : m.acc) + " acc" +
          "  ·  " + (m.pp == null ? "—" : m.pp) + " PP" +
          (m.bp ? "  ·  " + Math.round(score(m)) + " effective" : "") +
          (function(){
            var hh = abil ? abilityHit(abil, m, apoke) : null;
            return hh && hh.x && m.bp
              ? "  ·  " + Math.round(m.bp * hh.x) + " BP with " + abil : "";
          })()));
        mm.appendChild(el("div", "rmeta")).appendChild(el("span", null, m.target));
        if (m.text) mm.appendChild(el("div", "st", m.text));
        r.appendChild(mm);
        r.onclick = function(){
          draft.moves[idx] = m.name;
          done();
        };
        list.appendChild(r);
      });
      if (!hits.length) list.appendChild(el("div", "empty", "Nothing matches"));
    }
    draw();
  }, [
    fbtn("Clear slot", "", function(){ draft.moves[idx] = null; done(); }),
    fbtn("Back", "", function(){ done(); })
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
