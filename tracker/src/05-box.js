/* 05-box.js - The box and HOME: every row, and every way one gets added.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import {
  $, C, FORMS, SORT, STAT_KEYS, STAT_LABEL, STONE_OF, bst, byName, capNote,
  cardLine, dexLabel, el, freeSlug, labelBox, megasFor, outsideRow,
  spriteFor, statGrid, toast, typeCard, typeChip,
} from "./01-data.js";
import { S, hasStone, originOf } from "./02-state.js";
import { drop, put } from "./03-store.js";
import { ask, closeSheet, fbtn, openSheet } from "./04-nav.js";
/* The badges on a box row - in the GTS, a duplicate, the last copy - are the
   GTS view's own answer about that Pokemon, so they are asked for rather than
   recomputed here. This is why the link order is no longer numeric: 09-gts
   runs before this file because this file imports it. */
import { boxBadges } from "./09-gts.js";
/* ONE sheet, three doors. pokeHead and pokeBody are the whole of a
   Pokemon's sheet; this file supplies only what owning a copy adds -
   origin, shiny, trained, the note and the buttons. */
import { pokeBody, pokeHead } from "./12-find.js";
/* ===================================================================== rows */
function pokeRow(rec){
  var p = byName[rec.name];
  /* WHAT TO DRAW vs WHAT IT CAN DO. `p` stays the Champions dex row and every
     rule below keeps asking it - legality, Megas, whether it can be brought.
     `d` is the row to DRAW, which for a species Champions does not have comes
     from PokeAPI so the card is a card instead of a name and a tag. */
  var d = p || outsideRow(rec.name);
  var o = originOf(rec);
  var cls = rec.location === "home" ? (p ? "home" : "illegal")
          : rec.status === "rental" ? "rental"
          : o === "home" ? "perm" : o === "champions" ? "locked" : "unknown";
  /* HIS COPY'S COLOURS, not the species'. A shiny really is a different
     picture and both sprite sets carry one (player, 2026-09-18). */
  var row = typeCard(el("button", "row " + cls), d, !!rec.shiny);
  var main = el("div", "rmain");
  var nm = el("div", "rname");
  nm.appendChild(document.createTextNode(rec.name));
  boxBadges(nm, rec);
  /* "not in dex" was wrong the moment these rows got their stats: it IS in a
     dex, just not this game's (player, 2026-09-16: "deberia decir not in the
     dex Champs o algo parecido y no solamente not in dex porque si esta en el
     dex xd"). The tag names WHICH dex now. */
  if (!p) nm.appendChild(el("span", "tag bad", "not in Champions"));
  var ms = megasFor(rec.name);
  if (ms.length) {
    var owned = ms.filter(function(m){ return hasStone(STONE_OF[m.name]); });
    var tg = el("span", "tag mega",
      owned.length ? ("mega ×" + owned.length) : "mega — no stone");
    if (!owned.length) tg.className = "tag";
    nm.appendChild(tg);
  }
  main.appendChild(nm);
  var meta = el("div", "rmeta");
  if (d) d.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
  if (SORT === "dex") meta.appendChild(el("span", "mono", dexLabel(rec.name)));
  if (!p) meta.appendChild(el("span", null,
    "it can sit in HOME but never enter the game"));
  main.appendChild(meta);
  /* THE SAME TABLE THE SEARCH USES. The stats were a prose line here too -
     "BST 530 • 100 HP / 125 Atk / ..." - and the box is where two Pokemon get
     compared most often, so it needs scanning more than Find does.
     The ability cell says what this one CAN have, not what it has: a box row
     records no ability (only a build does), so it is labelled for the dex
     reading it is - "Ability" on a build row is the chosen one. */
  if (d) {
    main.appendChild(cardLine([
      labelBox(bst(d), "BST"),
      labelBox(d.ab || [], "Possible ability", "wide")
    ]));
    main.appendChild(statGrid(d));
    /* THE TAG ALREADY SAID IT. A "Main-series numbers - Champions has no data
       for this species" line went here and came straight back out: the card
       already carries a "not in Champions" tag and a line saying it can never
       enter the game, so this was the third way of saying one thing (player,
       2026-09-16: "creo que el texto main-series numbers es totalmente
       innecesario si se tiene el tag").

       What survives is the part the tag CANNOT say: that PokeAPI had no row
       for this exact form and the numbers belong to the base species. That is
       a caveat about the numbers themselves, not a restatement. */
    if (d.approx) {
      var src = el("div", "st");
      src.style.marginTop = "6px";
      src.textContent = "No row for this exact form — showing "
        + d.approx + ".";
      main.appendChild(src);
    }
  }
  row.appendChild(main);
  row.onclick = function(){ pokeSheet(rec); };
  return row;
}

/* The stat line on a sheet is the form the Pokemon STARTS in, and for two of
   these that is the form it never attacks in: Aegislash showed 50 Attack while
   Stance Change gives it 140 the moment it uses a damaging move, and Palafin
   showed 70 against Hero Form's 160. Castform changes TYPE instead, which is
   its whole defensive profile and its STAB. `battle_forms` has carried all
   three in the database for a while and nothing ever shipped it to the app, so
   both sheets were showing the misleading half (found 2026-09-12).
   Returns a node or null, and is used by BOTH sheets - the dex one and the
   one for a Pokemon in your box - because the number is equally wrong on each. */
function battleFormNote(p){
  var bfm = p && (C.BFORMS || {})[p.name];
  if (!bfm) return null;
  var bx = el("div", "note");
  bx.style.marginTop = "8px";
  var lead = el("div");
  lead.innerHTML = "<strong>In battle it changes.</strong> " +
    (bfm.by ? bfm.by + ":" : "");
  bx.appendChild(lead);
  Object.keys(bfm.f).forEach(function(lab){
    var e = bfm.f[lab], bits = [];
    if (e.t) bits.push(e.t.join("/"));
    if (e.b) {
      /* only the stats that actually move, so the eye goes to them */
      STAT_KEYS.forEach(function(k, i){
        if (e.b[i] !== p.b[i])
          bits.push(STAT_LABEL[k] + " " + p.b[i] + " → " + e.b[i]);
      });
    }
    bx.appendChild(el("div", "st", lab + " — " + bits.join(", ")));
  });
  return bx;
}

function pokeSheet(rec){
  /* THE SAME SHEET THE SEARCH VIEW DRAWS, with this copy's own facts wedged
     into the middle of it. It used to be a second, smaller sheet: it had the
     Mega line, the type chart and Smogon's write-up, and it had no abilities,
     no Worlds sets and no movepool at all - so which door you came through
     decided what you were allowed to know about the same Pokemon (player,
     2026-09-18: "las fichas... deben ser todas iguales").

     The row to DRAW, which for a species Champions does not have is the
     main-series one. NOT CALLED `d`: the damage table used to declare
     `var d = defence(...)` inside this same callback and `var` hoists to the
     top of it, so a row named `d` was already undefined by the time `if (d)`
     ran and the whole sheet fell into the "not in the dex" branch - for
     Aegislash, which very much is. */
  var show = byName[rec.name] || outsideRow(rec.name);
  var isHome = rec.location === "home";
  openSheet(rec.name, function(body){
    pokeHead(body, show, {shiny: !!rec.shiny, rec: rec});

    if (rec.status === "rental") {
      var w = el("div", "note warn");
      w.style.marginTop = "12px";
      w.innerHTML = "<strong>Rental.</strong> It cannot be trained — no move, " +
        "nature, ability or SP change — so it is locked to the set it ships " +
        "with. It can still hold a Mega Stone. Buying it for 2500 VP does not " +
        "make it a real permanent: it becomes Champions origin, welded to this " +
        "slot until you release it.";
      body.appendChild(w);
    } else if (rec.location === "champions") {
      body.appendChild(el("h2", null, "Where did it come from?"));
      var o = originOf(rec);
      var togs = el("div", "toggles");
      [["home", "HOME origin", "Caught in GO, or traded in. Can go back out."],
       ["champions", "Champions origin", "From an Encounter. Stuck here."]
      ].forEach(function(opt){
        var t = el("button", "tog", opt[1]);
        t.setAttribute("aria-pressed", o === opt[0] ? "true" : "false");
        t.title = opt[2];
        t.onclick = function(){
          put("box/" + rec._id, {name:rec.name, location:rec.location,
            status:rec.status, note:rec.note || "", order:rec.order || 0,
            origin:opt[0]}).then(function(){
              closeSheet(); toast(rec.name + ": " + opt[1]);
            });
        };
        togs.appendChild(t);
      });
      body.appendChild(togs);
      var on = el("div", "note" + (o === "home" ? "" : o === "unknown" ? " warn" : ""));
      on.style.marginTop = "10px";
      on.innerHTML = o === "home"
        ? "<strong>This slot is elastic.</strong> Park it to HOME whenever you " +
          "need the room; HOME keeps the Champions training, so it comes back " +
          "whole. The round trip costs nothing."
        : o === "champions"
        ? "<strong>This slot is welded.</strong> Training VP spent here can " +
          "never be parked — it plays fine, but it is not an argument for " +
          "keeping the slot. Replacing it with a GO catch routed through HOME " +
          "is a one-time cost that buys a reusable slot."
        : "<strong>Not recorded yet.</strong> It is being counted as Champions " +
          "origin, which is the cautious read rather than a known fact.";
      body.appendChild(on);
    }

    body.appendChild(el("h2", null, "This copy"));
    var flags = el("div", "toggles");
    var shiny = el("button", "tog", "Shiny");
    shiny.setAttribute("aria-pressed", rec.shiny ? "true" : "false");
    shiny.onclick = function(){
      rec.shiny = !rec.shiny;
      shiny.setAttribute("aria-pressed", rec.shiny ? "true" : "false");
    };
    flags.appendChild(shiny);
    var trained = el("button", "tog", "Trained in Champions");
    trained.setAttribute("aria-pressed", rec.trained ? "true" : "false");
    trained.onclick = function(){
      rec.trained = !rec.trained;
      trained.setAttribute("aria-pressed", rec.trained ? "true" : "false");
    };
    flags.appendChild(trained);
    body.appendChild(flags);
    body.appendChild(el("p", "sub",
      "A HOME-origin Pokemon trained inside Champions keeps that training " +
      "forever - HOME stores it, so it comes back with its moves, nature, " +
      "ability and SP intact, for no VP. That is what makes an already-trained " +
      "one worth parking rather than rebuilding."));
    body.appendChild(el("p", "sub",
      "Tap Save below to keep these."));

    body.appendChild(el("h2", null, "Note"));
    var ta = el("textarea");
    ta.value = rec.note || "";
    ta.id = "pkNote";
    body.appendChild(ta);

    /* AND THEN EVERYTHING IT IS, the same as the search view draws it: the
       Mega line, what damages it, its abilities, the Worlds sets it won with,
       its whole movepool and what Smogon wrote. Below the editable half,
       because origin, training and the note are what this door is FOR and an
       edit does not belong under two hundred rows of movepool. */
    pokeBody(body, show, {shiny: !!rec.shiny, rec: rec});
  }, moveButtons(rec, isHome));
}

function moveButtons(rec, isHome){
  var out = [];
  var path = "box/" + rec._id;
  function saveNote(extra){
    var n = $("pkNote");
    var body = {name:rec.name, location:rec.location, status:rec.status,
                note:n ? n.value : (rec.note || ""), order:rec.order || 0,
                origin:rec.origin || "unknown",
                shiny:!!rec.shiny, trained:!!rec.trained};
    Object.keys(extra || {}).forEach(function(k){ body[k] = extra[k]; });
    /* The HOME invariant, held here as well as by the database CHECK: a record
       that lives in HOME is permanent and HOME origin whatever the row used to
       say. This is also the repair path - re-saving a bad legacy row fixes it,
       which the sheet previously had no way to do. */
    if (body.location === "home") { body.status = "permanent"; body.origin = "home"; }
    return put(path, body);
  }
  if (isHome) {
    out.push(fbtn("Save", "primary", function(){
      saveNote().then(function(){ closeSheet(); toast("Saved"); });
    }));
    if (byName[rec.name]) {
      // arriving from HOME is what makes it HOME origin - never guess this
      out.push(fbtn("Send to Champions", "", function(){
        saveNote({location:"champions", status:"permanent", origin:"home"})
          .then(function(){
            closeSheet();
            toast(rec.name + " is in the box, HOME origin" +
                  (S.builds[rec._id] ? " — its build is active again" : ""));
          });
      }));
    }
  } else if (rec.status === "rental") {
    /* NOT primary. Buying spends 2500 VP and makes the Pokemon Champions
       origin, which welds it into the box for good - and the player's own
       plan is to sit on rentals so the VP keeps rolling the Encounter. A
       primary button here reads as "this is what you came to do", which is
       the app arguing against its owner's strategy. */
    out.push(fbtn("Buy it · 2500 VP", "", function(){
      ask("Buy " + rec.name + " for 2500 VP?",
          "It becomes Champions origin: it can never be sent to HOME, and the " +
          "slot only frees by releasing it.", "Buy · 2500 VP")
        .then(function(ok){
      if (!ok) return;
      /* The 2500 VP is NOT deducted from a stored balance any more. The
         ledger tracked one number that only ever went down - buying a rental -
         while ranked wins, which are the other half, went unrecorded, so it
         drifted from the first battle onwards. Nothing can keep it honest, so
         the app does not pretend to (player, 2026-09-12). */
      saveNote({status:"permanent", origin:"champions"})
        .then(function(){ closeSheet(); toast("Champions origin. Costs 2500 VP"); });
      });
    }));
  } else if (originOf(rec) === "home") {
    out.push(fbtn("Park back to HOME", "primary", function(){
      saveNote({location:"home", status:"permanent", origin:"home"})
        .then(function(){
          closeSheet();
          toast(rec.name + " parked. " + (S.builds[rec._id]
            ? "Its build is kept, inactive until it comes back."
            : "The training is kept — recall it any time."));
        });
    }));
    out.push(fbtn("Save", "", function(){
      saveNote().then(function(){ closeSheet(); toast("Saved"); });
    }));
  } else {
    out.push(fbtn("Save", "primary", function(){
      saveNote().then(function(){ closeSheet(); toast("Saved"); });
    }));
  }
  /* Releasing ENDS a Pokemon, and its build used to be deleted with it, on the
     reasoning that the ledger would otherwise fill with sets for Pokemon that
     no longer exist. That reason is gone: a build with no Pokemon is a
     first-class state now - an idea - and the player's whole reason for
     unbinding builds was that an idea should not be lost for want of a row to
     hang it on (2026-09-13). So a release UNBINDS rather than deletes, and the
     set survives for the next copy. Parking back to HOME remains the door that
     keeps the Pokemon itself. */
  out.push(fbtn("Release", "danger", function(){
    /* There can be more than one now, and they are found by their LINK - the
       box row's id is not a build id any more. */
    var mine = Object.keys(S.builds).filter(function(k){
      return S.builds[k].box_id === rec._id;
    });
    var msg = [];
    if (mine.length) {
      msg.push(mine.length + " build" + (mine.length > 1 ? "s" : "") +
               " will be KEPT as " + (mine.length > 1 ? "ideas" : "an idea") +
               ", no longer installed on anything.");
    }
    msg.push((originOf(rec) === "home" && !isHome)
      ? "To free the slot and keep it playable, park it back to HOME instead."
      : "This one is Champions origin, so it cannot come back.");
    ask("Remove " + rec.name + " from the ledger?", msg.join("\n\n"),
        "Remove", true).then(function(ok){
      if (!ok) return;
      release();
    });
    function release(){
    drop(path).then(function(){
      return Promise.all(mine.map(function(k){
        var doc = JSON.parse(JSON.stringify(S.builds[k]));
        delete doc._boxId;
        doc.box_id = null;
        return put("builds/" + k, doc);
      }));
    }).then(function(){
      closeSheet();
      toast(rec.name + " removed" +
            (mine.length ? "; its " + (mine.length > 1 ? "builds are" : "build is") +
                           " kept as an idea" : ""));
    });
    }
  }));
  return out;
}

/* ==================================================================== adding */
function addSheet(loc){
  openSheet(loc === "home" ? "Add to the HOME Box" : "Add to the Champions Box", function(body){
    var marks = {shiny:false, trained:false};
    var mrow = el("div", "toggles");
    mrow.style.marginBottom = "12px";
    [["shiny", "Shiny"], ["trained", "Trained in Champions"]].forEach(function(o){
      var t = el("button", "tog", o[1]);
      t.setAttribute("aria-pressed", "false");
      t.onclick = function(){
        marks[o[0]] = !marks[o[0]];
        t.setAttribute("aria-pressed", marks[o[0]] ? "true" : "false");
      };
      mrow.appendChild(t);
    });
    body._marks = marks;

    if (loc === "champions") {
      body.appendChild(el("div", "note")).innerHTML =
        "<strong>Everything added here came out of an Encounter</strong>, so " +
        "it is Champions origin and can never be sent to HOME. Bringing one " +
        "IN from HOME is a move, not an entry: open it in the HOME Box and " +
        "tap <strong>Send to Champions</strong>, so the record travels " +
        "instead of being written twice.";
      body.appendChild(el("label", "f", "Which one is it? (required)"));
      var st = el("div", "btnrow"); st.style.marginBottom = "12px";
      var mode = {v:null};
      [["champions","Bought · 2500 VP or a ticket"],
       ["rental","Rental · 0 VP"]].forEach(function(o){
        var b = el("button", "tog", o[1]);
        b.setAttribute("aria-pressed", "false");
        b.onclick = function(){
          mode.v = o[0];
          Array.prototype.forEach.call(st.children, function(x){
            x.setAttribute("aria-pressed", x === b ? "true" : "false");
          });
          draw();
        };
        st.appendChild(b);
      });
      body.appendChild(st);
      body._mode = mode;
    }
    body.appendChild(el("p", "sub",
      loc === "home" ? "Anything about this copy, before you pick it:"
                     : "Anything about this copy:"));
    body.appendChild(mrow);

    /* asked first, because until it is answered there is nothing to search */
    var wrap = el("div", "search field");
    wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    var inp = el("input"); inp.type = "text"; inp.placeholder = "Species or form";
    wrap.appendChild(inp);
    body.appendChild(wrap);
    inp.oninput = function(){ draw(); };

    var list = el("div", "list");
    body.appendChild(list);
    /* The Champions Box can only hold what the game allows. The HOME Box can
       hold anything, so it also offers everything the Champions dex has never
       heard of - Melmetal and Oricorio are already in it - and takes a typed
       name on top, because no list here is guaranteed to be complete. */
    function draw(){
      var q = inp.value.trim().toLowerCase();
      list.innerHTML = "";
      /* nothing can be added to the Champions Box until it is said where it
         came from - that answer is what decides whether the slot is elastic */
      if (loc === "champions" && !(body._mode && body._mode.v)) {
        var g = el("div", "note warn");
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
      var pool = FORMS.filter(function(p){
        return !q || p.name.toLowerCase().indexOf(q) >= 0;
      });
      var hits = pool.slice(0, 120);
      if (loc === "home") {
        var homeAll = (C.HOME_ONLY || []).filter(function(n){
          return q && n.toLowerCase().indexOf(q) >= 0;
        });
        var extra = homeAll.slice(0, 40);
        extra.forEach(function(n){
          var r = el("button", "row illegal");
          var m2 = el("div", "rmain");
          var h2 = el("div", "rname");
          h2.appendChild(document.createTextNode(n));
          h2.appendChild(el("span", "tag bad", "not in the Champions dex"));
          m2.appendChild(h2);
          m2.appendChild(el("div", "rmeta")).appendChild(el("span", null,
            "It can live in HOME, but it can never be sent into the game."));
          r.appendChild(m2);
          r.onclick = function(){
            var id = freeSlug(n, S.box);
            put("box/" + id, {name:n, location:"home", status:"permanent",
                origin:"home", note:"", order:Object.keys(S.box).length})
              .then(function(){ closeSheet(); toast(n + " added to HOME"); });
          };
          list.appendChild(r);
        });
      }
      if (!hits.length && !list.children.length) {
        list.appendChild(el("div", "empty", "Nothing matches"));
        if (loc === "home" && q) {
          var add = el("button", "btn primary", "Add “" + inp.value.trim() + "” anyway");
          add.style.marginTop = "10px";
          add.onclick = function(){
            var nm = inp.value.trim();
            var id = freeSlug(nm, S.box);
            put("box/" + id, {name:nm, location:"home", status:"permanent",
                origin:"home", note:"typed by hand", order:Object.keys(S.box).length})
              .then(function(){ closeSheet(); toast(nm + " added to HOME"); });
          };
          list.appendChild(add);
        }
        return;
      }
      hits.forEach(function(p){
        var r = el("button", "row");
        var m = el("div", "rmain");
        m.appendChild(el("div", "rname", p.name));
        var meta = el("div", "rmeta");
        p.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
        if (megasFor(p.name).length) meta.appendChild(el("span", "tag mega", "mega"));
        m.appendChild(meta);
        m.appendChild(cardLine([labelBox(bst(p), "BST")]));
        r.appendChild(m);
        r.onclick = function(){
          /* HOME never asks bought-or-rental, so it must never read an
             answer: everything in HOME is permanent and HOME origin by
             definition. Only the Champions sheet builds a mode, and only the
             Champions branch is allowed to consult it. */
          var mode = loc === "home" ? "home" : (body._mode && body._mode.v);
          if (!mode) { toast("Bought or rental?"); return; }
          var status = (loc === "champions" && mode === "rental")
                     ? "rental" : "permanent";
          /* every route into the Champions Box that goes through this sheet is
             an Encounter, and buying a rental with VP or a ticket does not
             change that - it stays Champions origin */
          var origin = loc === "home" ? "home" : "champions";
          var id = freeSlug(p.name, S.box);
          var mk = body._marks || {};
          put("box/" + id, {name:p.name, location:loc, status:status,
                            origin:origin, note:"",
                            shiny:!!mk.shiny, trained:!!mk.trained,
                            order:Object.keys(S.box).length})
            .then(function(){
              closeSheet();
              toast(p.name + (loc === "home" ? " added to HOME"
                    : mode === "rental" ? " added as a rental"
                    : " added, Champions origin"));
            });
        };
        list.appendChild(r);
      });
      capNote(list, hits.length, pool.length, "forms");
      if (typeof homeAll !== "undefined")
        capNote(list, extra.length, homeAll.length, "HOME-only names");
    }
    draw();
    if (loc === "home") setTimeout(function(){ inp.focus(); }, 60);
  }, []);
}

/* ------------------------------------------------ what Smogon wrote ------
   The only source in this project with REASONING in it, and until now the
   only one the phone never saw. 54 Pokemon have a written VGC analysis: the
   sets people actually run, the SP spread and what each point of it survives,
   which Pokemon check it, which partners cover its holes. It was downloaded
   every night and read only through `query.py pokemon` on the laptop.

   LOADED ON DEMAND. 407 KB against a dex payload of 419 - paying that on every
   visit for a panel opened while arguing about a build is the wrong trade. The
   script tag is added the first time a sheet asks, and the file is immutable
   by its content hash, so it is fetched once ever.

   A tag rather than fetch(): the CSP allows same-origin scripts and the file
   is one assignment, so there is nothing to parse by hand and nothing to get
   wrong about encoding. */
var ANALYSIS_STATE = null;          // null | "loading" | "ready" | "absent"
var ANALYSIS_WAITING = [];

function analysisFor(name){
  var all = window.CHAMP_ANALYSIS;
  if (!all) return null;
  /* Smogon files a Mega under its own name and the box knows it as one too,
     so a direct hit comes first; failing that, a Mega falls back to the base
     species, whose analysis is the one that discusses the stone. */
  if (all[name]) return all[name];
  var p = byName[name];
  if (p && p.species && all[p.species]) return all[p.species];
  return null;
}

function loadAnalysis(then){
  /* Already here? Then there is nothing to load. The asset is a plain
     assignment to window, so anything that has run it - a second panel, a
     future view, a test - counts, and asking again would sit on a script tag
     that resolves nothing. */
  if (window.CHAMP_ANALYSIS) { ANALYSIS_STATE = "ready"; return then(); }
  if (ANALYSIS_STATE === "ready" || ANALYSIS_STATE === "absent") return then();
  ANALYSIS_WAITING.push(then);
  if (ANALYSIS_STATE === "loading") return;
  var url = window.CHAMP_ANALYSIS_URL;
  if (!url) {                       // the single-file build carries no asset
    ANALYSIS_STATE = "absent";
    return flushAnalysis();
  }
  ANALYSIS_STATE = "loading";
  var sc = document.createElement("script");
  sc.src = url;
  sc.onload = function(){ ANALYSIS_STATE = "ready"; flushAnalysis(); };
  sc.onerror = function(){ ANALYSIS_STATE = "absent"; flushAnalysis(); };
  document.head.appendChild(sc);
}

function flushAnalysis(){
  var q = ANALYSIS_WAITING;
  ANALYSIS_WAITING = [];
  q.forEach(function(fn){ try { fn(); } catch (e) {} });
}

/* ------------------------------ what a Pokemon Champions LACKS knows -------
   The same shape, for a different 425 KB. HOME holds 933 species the game has
   never heard of, and the sheet showed their types, BST, stats and abilities
   but nothing about their moves - which was the other half of the request
   (player, 2026-09-18: "tambien deberia poder abrir la ficha y listar los
   movimientos que aprende ese pokemon").

   Fetched when one of those sheets is opened and never otherwise, because
   most sessions never open one. Everything else about this file is argued in
   scripts/build_home_moves.py, including why reading PokeAPI's main-series
   movepool is allowed for a species Champions does not have and forbidden for
   one it does. */
var HM_STATE = "idle", HM_WAITING = [];

function loadHomeMoves(then){
  if (window.CHAMP_HOME_MOVES) { HM_STATE = "ready"; return then(); }
  if (HM_STATE === "ready" || HM_STATE === "absent") return then();
  HM_WAITING.push(then);
  if (HM_STATE === "loading") return;
  var url = window.CHAMP_HOME_MOVES_URL;
  if (!url) { HM_STATE = "absent"; return flushHomeMoves(); }
  HM_STATE = "loading";
  var sc = document.createElement("script");
  sc.src = url;
  sc.onload = function(){ HM_STATE = "ready"; flushHomeMoves(); };
  sc.onerror = function(){ HM_STATE = "absent"; flushHomeMoves(); };
  document.head.appendChild(sc);
}

function flushHomeMoves(){
  var q = HM_WAITING;
  HM_WAITING = [];
  q.forEach(function(fn){ try { fn(); } catch (e) {} });
}

function homeMovesFor(name){
  return (window.CHAMP_HOME_MOVES || {})[name] || null;
}

/* One set, as the thing you would actually build: the four slots, the spread,
   and the reasoning underneath. */
function analysisSet(st){
  var box = el("div", "note");
  box.style.marginBottom = "8px";
  var head = el("div", "rname");
  head.appendChild(el("span", null, st.name || "Set"));
  (st.ability || []).slice(0, 1).forEach(function(a){
    head.appendChild(el("span", "tag", a));
  });
  (st.nature || []).slice(0, 1).forEach(function(n){
    head.appendChild(el("span", "tag", n));
  });
  box.appendChild(head);

  /* The items are a LIST on purpose - Smogon offers alternatives and the Item
     Clause means a team of six fields exactly one of each, so which one is a
     team decision rather than part of the set. */
  if ((st.item || []).length) {
    box.appendChild(el("div", "st", "Items: " + st.item.join(" / ")));
  }
  var mv = (st.moves || []).map(function(slot){
    return Array.isArray(slot) ? slot.join(" / ") : String(slot);
  }).filter(Boolean);
  if (mv.length) {
    var row = el("div", "st");
    row.style.marginTop = "2px";
    mv.forEach(function(m){
      var t = el("span", "tag ok", m);
      t.style.marginRight = "4px";
      row.appendChild(t);
    });
    box.appendChild(row);
  }
  (st.sp || []).forEach(function(sp){
    var bits = STAT_KEYS.map(function(k){
      return sp[k] ? sp[k] + " " + STAT_LABEL[k] : null;
    }).filter(Boolean);
    if (!bits.length) return;
    var total = STAT_KEYS.reduce(function(a, k){ return a + (sp[k] || 0); }, 0);
    var line = el("div", "st", bits.join(" / ") + "   ·   " + total + "/66 SP");
    line.style.color = "var(--accent)";
    box.appendChild(line);
  });
  if (st.why) box.appendChild(prose(st.why));
  return box;
}

/* Smogon's prose, laid out the way their page lays it out.
 *
 * It arrives as one block of lines and reads as a wall - the player's words:
 * "me parece muy dificil de leer". It is not shapeless, though. Three kinds of
 * line, and telling them apart is what makes it skimmable:
 *
 *   Other Options            a section heading - short, no colon
 *   Make It Rain: it hits    a labelled paragraph - the label is the subject
 *   32 HP / 8 Def ... with Timid: the given spread outspeeds ...
 *   Gholdengo, thanks to     plain prose
 *
 * The labelled form is the useful one: the label says what the paragraph is
 * ABOUT, so a reader looking for why an item was chosen can find it without
 * reading the rest. The spread lines use the same shape, with the spread
 * itself as the label, which is exactly how they should be read.
 */
function prose(text){
  var wrap = el("div");
  wrap.style.marginTop = "6px";
  String(text).split(/\n+/).forEach(function(line){
    line = line.trim();
    if (!line) return;
    var cut = line.indexOf(":");
    var label = cut > 0 ? line.slice(0, cut).trim() : "";
    /* A heading is short and has no colon. A label is short and does. Both
       tests are on LENGTH rather than on a list of known words, because
       Smogon's headings differ per Pokemon and a list would go stale. */
    /* ...and does not end in a full stop. "Other Options" is a heading; "Un
       atacante especial." is a short sentence, and the first version drew it
       as one. */
    if (!label && line.split(" ").length <= 5 && !/[.!?]$/.test(line)) {
      var h = el("div", "rname", line);
      h.style.marginTop = "8px";
      wrap.appendChild(h);
      return;
    }
    var para = el("div", "st");
    para.style.marginTop = "4px";
    if (label && label.length <= 70 && cut < line.length - 1) {
      var b = el("strong", null, label);
      b.style.color = "var(--accent)";
      para.appendChild(b);
      para.appendChild(document.createTextNode(" " + line.slice(cut + 1).trim()));
    } else {
      para.textContent = line;
    }
    wrap.appendChild(para);
  });
  return wrap;
}

/* The panel: a fold, because the prose is long and the sheet has a job to do
   before it. */
function analysisPanel(name, host){
  host.innerHTML = "";
  /* Something on screen from the first frame. A panel that is empty while a
     407 KB script loads is indistinguishable from a panel that is broken, and
     on a phone on mobile data that wait is real. */
  var wait = el("div", "st", "Loading Smogon's analysis...");
  host.appendChild(wait);
  var gaveUp = setTimeout(function(){
    if (host.contains(wait)) {
      wait.textContent = "Smogon's analysis did not load. It is a separate "
        + "file, fetched only when this is opened - try again in a moment.";
    }
  }, 8000);
  loadAnalysis(function(){
    clearTimeout(gaveUp);
    if (wait.parentNode) wait.parentNode.removeChild(wait);
    var got = analysisFor(name);
    if (!got || !got.length) {
      host.appendChild(el("div", "st", ANALYSIS_STATE === "absent"
        ? "Smogon's analyses are not in this build."
        : "Smogon has not written one for " + name + " - 54 Pokemon have one."));
      return;
    }
    /* EVERY VGC FORMAT SMOGON HAS, NEWEST FIRST, and the panel says so out
       loud. Nothing here has ever filtered by regulation - Garchomp carries
       both an M-A and an M-B analysis and both were always drawn - but the
       panel gave no way to tell "this is all of it" from "this is the one we
       kept", which is what the player was asking about (2026-09-15: "necesito
       ver todas las opciones de smogon en formato vgc sea de la regulacion
       que sea"). A regulation missing from this line is missing UPSTREAM:
       Smogon writes an analysis per regulation and had published none for the
       current one at the time of the last fetch.

       Sorted by the regulation letter rather than by arrival, so the newest
       reading is the one at the top. Singles stays out - see
       scripts/fetch_smogon.py, that call is settled. */
    var order = got.slice().sort(function(a, b){
      return String(b.format).localeCompare(String(a.format));
    });
    if (order.length > 1) {
      host.appendChild(el("div", "st",
        "Smogon has " + order.length + " VGC analyses for " + name + ": " +
        order.map(function(x){ return x.format; }).join(", ") +
        ". All of them are below."));
    }
    order.forEach(function(st){
      var head = el("div", "st");
      head.style.marginBottom = "4px";
      head.appendChild(el("span", "tag" + (st.outdated ? " warn" : ""),
                          st.format + (st.outdated ? " · outdated" : "")));
      if ((st.credits || []).length) {
        head.appendChild(el("span", null, "  by " + st.credits.join(", ")));
      }
      host.appendChild(head);
      if (st.overview) host.appendChild(prose(st.overview));
      (st.sets || []).forEach(function(x){ host.appendChild(analysisSet(x)); });
    });
  });
}

/* ------------------------------------------------------- what leaves here --
   `pokeRow` is the row both box views draw, `addSheet` the one way a Pokemon
   enters the box, and `battleFormNote` the line explaining a form that only
   exists mid-battle.

   `pokeSheet` is exported for a different reason and it is worth naming: no
   other part calls it. It is in PUBLIC, so the browser tests drive it through
   `window` - they open a sheet for every form in the dex and assert what it
   shows. `moveButtons` stays private.
*/
export { addSheet, analysisPanel, battleFormNote, homeMovesFor,
  loadHomeMoves, pokeRow, pokeSheet };
