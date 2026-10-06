/* The Find tab: search every Pokemon by type, ability, move and stat, and
   the Worlds view beside it (tabs/worlds.js). The filters live in FIND
   (core/state.js), so they survive leaving the tab. */
import {
  bst, byText, C, DEX, dexNo, learnset, MOVES, STAT_KEYS, STAT_LABEL,
} from "../core/data.js";
import {
  $, el, fbtn, field, kids, pressOnly, searchField, setPressed,
} from "../core/dom.js";
import { boxRows, FIND, originOf, ownedNames } from "../core/state.js";
import { megaLine, numText, pokeCard, typeSkin } from "../ui/card.js";
import { moveFilters, moveRowFor } from "../ui/moves.js";
import { closeSheet, openSheet } from "../ui/nav.js";
import { findDetail } from "../ui/pokemon.js";
import { worldInit } from "./worlds.js";

/** One search's context: the name box, what he owns, and, per base form,
    the Mega that matched for it.
    @typedef {{q: string, own: Record<string, string>, inHome: Record<string, number>,
      matchedAs: Record<string, DexRow>}} FindCtx */

/* ============================================ A MEGA LIVES ON ITS BASE ROW ==
   A Mega only exists mid-battle, and only because a stone is held. It is not
   a thing you store, so it is not a result of its own - it is a fact ABOUT
   the Pokemon you store. Three things have to survive that, or it would cost
   more than it saves:

   1. THE QUERY. Mega Ampharos is Electric/Dragon; a search for Dragon must
      still find Ampharos. A filter matches the base form OR any of its Megas
      (orMega), and the card says which matched.

   2. THE RANK. The sort reads the value the Pokemon can REACH (reach): the
      highest across its line going down, the lowest going up - a Mega that
      raises Speed does not help a Trick Room list, the base is what is slow.

   3. WHAT CHANGES. The card shows the Mega's deltas, and a Pokemon with no
      Mega looks exactly as it would otherwise. */
/** the value this Pokemon can reach in the direction being ranked
   @param {DexRow} p
   @param {string} key
   @param {string} dir */
function reach(p, key, dir){
  let best = statOf(p, key);
  megaLine(p).forEach(function(m){
    const v = statOf(m, key);
    best = dir === "asc" ? Math.min(best, v) : Math.max(best, v);
  });
  return best;
}
/** does the base OR any of its Megas satisfy `fn`? Returns the form that did,
   so the card can say "matched as Mega Ampharos" rather than leaving it to be
   worked out.
   @param {DexRow} p
   @param {(f: DexRow) => boolean} fn */
function orMega(p, fn){
  if (fn(p)) return p;
  const ms = megaLine(p);
  for (const m of ms) if (fn(m)) return m;
  return null;
}
/* bst is not a base stat but it filters and sorts exactly like one, so it
   rides in the same table rather than keeping its own input. */
const FIND_STATS = [["bst","BST"],["hp","HP"],["atk","Atk"],["def","Def"],
                  ["spa","SpA"],["spd","SpD"],["spe","Spe"]];
/** a base stat by key, or the BST
   @param {DexRow} p
   @param {string} key */
function statOf(p, key){
  return key === "bst" ? bst(p) : p.b[STAT_KEYS.indexOf(/** @type {Stat} */ (key))];
}
/** A stat's column caption, BST included.
   @param {string} key */
function statLabel(key){
  return key === "bst" ? "BST" : STAT_LABEL[key];
}

/* Redraw the chips for the active filters (each removes itself when
   tapped), then the results. */
function findDraw(){
  const host = $("findChips");
  host.innerHTML = "";
  /** One active filter, drawn as a chip that removes it when tapped.
     @param {string} label
     @param {() => void} onClear
     @param {string} [cls]
     @param {string} [title] */
  function chip(label, onClear, cls, title){
    const t = el("button", "tog " + (cls || ""), label);
    setPressed(t, true);
    t.title = title || "Remove this filter";
    t.onclick = onClear;
    host.appendChild(t);
  }
  FIND.moves.forEach(function(n, i){
    chip("learns " + n, function(){ FIND.moves.splice(i, 1); findDraw(); });
  });
  FIND.types.forEach(function(t, i){
    chip("is " + t, function(){ FIND.types.splice(i, 1); findDraw(); });
  });
  /* A RULED-OUT TYPE IS A FILTER TOO, so it gets a chip up here with the rest
     - otherwise it is invisible once the sheet is shut and a search quietly
     returns fewer Pokemon than it should for no reason on screen. */
  FIND.notTypes.forEach(function(t, i){
    chip("not " + t, function(){ FIND.notTypes.splice(i, 1); findDraw(); },
         "no", "Remove this filter");
  });
  /* the AND/OR only means something with two or more, and it is the whole
     difference between "a Rock/Steel Pokemon" and "the Rock, Steel and Ground
     ones" - so it is switchable from here, not buried in the sheet */
  if (FIND.types.length > 1) {
    chip(FIND.typeMode === "or" ? "any of those types" : "all of those types",
      function(){
        FIND.typeMode = FIND.typeMode === "or" ? "and" : "or"; findDraw();
      }, FIND.typeMode === "and" && FIND.types.length > 2 ? "bad" : "",
      "Tap to switch between ALL of those types and ANY of them");
  }
  if (FIND.ability) chip("has " + FIND.ability,
    function(){ FIND.ability = ""; findDraw(); });
  setPressed($("findInChamp"), FIND.inChamp);
  setPressed($("findInHome"), FIND.inHome);
  if (FIND.inChamp) chip("in the Champions box",
    function(){ FIND.inChamp = false; findDraw(); });
  if (FIND.inHome) chip("in HOME",
    function(){ FIND.inHome = false; findDraw(); });

  if (!host.children.length) {
    host.appendChild(el("p", "sub",
      "No filters yet. Add one below - they all have to be true at once."));
  }
  findRun();
}

/** ", highest first" / ", lowest first", after the prefix given
   @param {string} prefix */
function dirLabel(prefix){
  return prefix + (FIND.dir === "asc" ? "lowest first" : "highest first");
}
/** @type {Record<string, string>} */
const OWNED_ORIGIN = {home: "HOME origin", champions: "Champions origin"};

/* THE SEARCH. Every base form that passes every filter at once, ranked, as
   cards - 120 at most, and it says so. */
function findRun(){
  const out = $("findOut");
  out.innerHTML = "";
  const own = ownedNames();
  /** @type {Record<string, number>} */
  const inHome = {};
  boxRows("home").forEach(function(r){ inHome[r.name] = 1; });
  /** @type {FindCtx} */
  const ctx = {q: (FIND.q || "").trim().toLowerCase(), own: own, inHome: inHome,
             matchedAs: {}};              /* base name -> the Mega that matched */
  const hits = DEX.filter(function(p){ return findMatches(p, ctx); });

  const head = el("p", "sub");
  const BASES = DEX.filter(function(p){ return !p.mega; }).length;
  head.textContent = hits.length + " of " + BASES + " Pokemon match" +
    (FIND.moves.length > 1
      ? " - all " + FIND.moves.length + " moves on the same Pokemon" : "") +
    (FIND.sort === "dex" ? ", in dex order"
     : ", by " + statLabel(FIND.sort) + dirLabel(", "));
  out.appendChild(head);

  if (!hits.length) {
    out.appendChild(el("div", "empty",
      FIND.typeMode === "and" && FIND.types.length > 2
        ? "No Pokemon has three types. Tap “all of those types” to make it "
          + "ANY of them."
        : "Nothing learns all of that. Drop a filter and try again."));
    return;
  }
  sortFinds(hits);
  /* A GRID once there is room for one: the class decides by width, so a
     phone still gets one column and a desktop three. */
  const list = el("div", "cards");
  hits.slice(0, 120).forEach(function(p){ list.appendChild(findCard(p, ctx)); });
  out.appendChild(list);
  if (hits.length > 120) out.appendChild(el("p", "sub",
    "Showing the first 120. Narrow it further to see the rest."));
}

/** Does one base form pass every filter? A Mega rides on its base row, so it
   is never a result of its own - but each filter may be satisfied by the
   base OR by one of its Megas, and the LAST one that needed a Mega is
   remembered in ctx.matchedAs so the card can say so.
   @param {DexRow} p
   @param {FindCtx} ctx */
function findMatches(p, ctx){
  if (p.mega) return false;
  if (ctx.q && !nameMatches(p, ctx.q)) return false;
  if (!inTheBoxes(p, ctx) || ruledOut(p)) return false;
  const via = typeAndAbility(p);
  if (via === false) return false;
  if (FIND.moves.length && !learnsAll(p)) return false;
  if (via) ctx.matchedAs[p.name] = via;
  return true;
}

/** The type and ability filters, each satisfied by the base or by a Mega.
   Returns false when one fails; otherwise the Mega that was needed (the
   ability's, if both needed one), or null when the base form did it all.
   @param {DexRow} p
   @returns {DexRow | null | false} */
function typeAndAbility(p){
  let via = null;
  if (FIND.types.length) {
    const hit = orMega(p, hasTheTypes);
    if (!hit) return false;
    if (hit !== p) via = hit;
  }
  if (FIND.ability) {
    const ah = orMega(p, function(f){
      return (f.ab || []).includes(FIND.ability); });
    if (!ah) return false;
    if (ah !== p) via = ah;
  }
  return via;
}

/** THE NAME BOX, for opening one Pokemon's sheet quickly without building a
   query: the name, the species, the dex number - and a Mega's name, because
   typing "mega absol" should find the card that carries it.
   @param {DexRow} p
   @param {string} q */
function nameMatches(p, q){
  return p.name.toLowerCase().includes(q) ||
         (p.species || "").toLowerCase().includes(q) ||
         String(dexNo(p.name)).includes(q) ||
         megaLine(p).some(function(m){
           return m.name.toLowerCase().includes(q); });
}

/** The two box toggles: in the Champions box, in HOME - both on means either.
   With neither on, every Pokemon passes.
   @param {DexRow} p
   @param {FindCtx} ctx */
function inTheBoxes(p, ctx){
  if (!FIND.inChamp && !FIND.inHome) return true;
  const c = FIND.inChamp && ((p.name in ctx.own) || (p.species in ctx.own));
  const h = FIND.inHome && ((p.name in ctx.inHome) || (p.species in ctx.inHome));
  return c || h;
}

/** RULED OUT WINS, and it is checked on the BASE form only. A Mega that picks
   up Psychic does not make the Pokemon Psychic in the box, and the question
   being asked - "nothing Psychic on this team" - is about what walks on.
   @param {DexRow} p */
function ruledOut(p){
  return FIND.notTypes.some(function(t){ return p.types.includes(t); });
}

/** ALL of the picked types, or ANY of them - the switch the chip row offers.
   @param {DexRow} f */
function hasTheTypes(f){
  return FIND.typeMode === "or"
    ? FIND.types.some(function(t){ return f.types.includes(t); })
    : FIND.types.every(function(t){ return f.types.includes(t); });
}

/** Every picked move, in one movepool. A MEGA SHARES ITS BASE'S MOVEPOOL, so
   this is asked of the base only.
   @param {DexRow} p */
function learnsAll(p){
  const ls = learnset(p.name);
  if (!ls) return false;
  /** @type {Record<string, number>} */
  const have = {};
  ls.forEach(function(m){ have[m.name] = 1; });
  return FIND.moves.every(function(n){ return have[n]; });
}

/** THE SORT IS THE TIER LIST, and it reads both ways: descending is the speed
   tier, ascending the Trick Room one. Dex order is the one non-ranking
   answer. A stat ranks by what the Pokemon can REACH - see reach().
   @param {DexRow[]} hits */
function sortFinds(hits){
  if (FIND.sort === "dex") {
    hits.sort(function(a, b){
      return dexNo(a.name) - dexNo(b.name) || a.name.localeCompare(b.name);
    });
    return;
  }
  const sign = FIND.dir === "asc" ? -1 : 1;
  hits.sort(function(a, b){
    return sign * (reach(b, FIND.sort, FIND.dir) -
                   reach(a, FIND.sort, FIND.dir)) ||
           a.name.localeCompare(b.name);
  });
}

/** One result, on THE card (ui/card.js). ALL SIX STATS, ALWAYS, AND THE
   RANKED ONE MARKED: ranking by one stat must not hide the others. Badged
   with whether he owns one, and - when a Mega is the reason it matched at
   all - which Mega: Fighting finds Staraptor because its Mega is
   Fighting/Flying, and a card showing only Normal/Flying would look like a
   bug.
   @param {DexRow} p
   @param {FindCtx} ctx */
function findCard(p, ctx){
  const here = (p.name in ctx.own) || (p.species in ctx.own);
  const ranking = FIND.sort !== "dex";
  return pokeCard(p, {
    cls: here ? "perm" : "",
    mark: ranking ? FIND.sort : null,
    badges: function(h){
      if (here) h.appendChild(ownedTag(p));
      const via = ctx.matchedAs[p.name];
      if (via) {
        const vt = el("span", "tag warn", "as " + via.name);
        vt.title = "The base form does not match - this one does.";
        h.appendChild(vt);
      }
    },
    onclick: function(){ findDetail(p); }
  });
}

/** WHICH copy he owns and how elastic it is: a rental, or his, with its
   origin - the origin is what says whether the slot can be freed.
   @param {DexRow} p */
function ownedTag(p){
  const rec = boxRows("champions").find(function(x){
    return x.name === p.name || x.name === p.species; });
  const o = rec ? originOf(rec) : null;
  const ownTag = rec?.status === "rental" ? "rental in your box"
    : "yours, " + ((o && OWNED_ORIGIN[o]) || "origin?");
  return el("span", "tag " + (o === "home" ? "ok" : ""), ownTag);
}

/* ============================================================== wiring ==
   Run once at boot: the name box, the three filter sheets, the two box
   toggles, Search/Worlds, the sort row and Clear. */
function findInit(){
  /* Typed, not tapped: this one narrows as you go rather than adding a chip,
     because it is the control for "open Garchomp" and not for building a
     query. It still lives beside the chips, so clearing it is one gesture. */
  const nameBox = field("findName");
  if (nameBox) {
    nameBox.value = FIND.q || "";
    nameBox.oninput = function(){ FIND.q = nameBox.value; findRun(); };
  }
  $("findAddMove").onclick = moveFilterSheet;
  $("findAddType").onclick = typeFilterSheet;
  $("findAddAbility").onclick = abilityFilterSheet;
  /* TOGGLES, not actions - they flip a filter and stay on, so they carry a
     pressed state as well as the chip that appears. */
  $("findInChamp").onclick = function(){
    FIND.inChamp = !FIND.inChamp; findDraw(); };
  $("findInHome").onclick = function(){
    FIND.inHome = !FIND.inHome; findDraw(); };
  wireFindMode();
  paintSort();
  $("findClear").onclick = clearFind;
  worldInit();
}

/* SEARCH OR WORLDS, one tap apart. They answer different questions - "who
   matches this" and "what won that August" - so each gets the whole screen.
   A segmented control rather than another tab, because it belongs to Find. */
function wireFindMode(){
  const mrow = $("findMode");
  kids(mrow).forEach(function(b){
    b.onclick = function(){
      const m = b.dataset.mode;
      pressOnly(mrow, b);
      $("findSearch").hidden = m !== "search";
      $("findWorlds").hidden = m !== "worlds";
    };
  });
}

/* Every filter off, the sort back to BST highest first. */
function clearFind(){
  FIND.q = ""; if (field("findName")) field("findName").value = "";
  FIND.moves = []; FIND.types = []; FIND.notTypes = []; FIND.typeMode = "and";
  FIND.ability = "";
  FIND.inChamp = false; FIND.inHome = false;
  FIND.sort = "bst"; FIND.dir = "desc";
  paintSort();
  findDraw();
}

/* ADD A MOVE: the same filter controls as the build editor's move picker -
   one implementation, so "which special Electric move" is asked the same way
   in both places. Picking one adds a "learns" chip and closes. */
function moveFilterSheet(){
  openSheet("Add a move filter", function(body){
    const pool = MOVES.filter(function(m){
      return !FIND.moves.includes(m.name);
    });
    const ui = moveFilters(body, pool, moveFilterRow,
                         "Any of " + pool.length + " moves");
    setTimeout(function(){ ui.input.focus(); }, 60);
  }, []);
}

/** a move row that adds a "learns" chip when tapped
   @param {Move} m */
function moveFilterRow(m){
  return moveRowFor(m, [], null, {onPick: function(){
    FIND.moves.push(m.name); closeSheet(); findDraw();
  }});
}

/* TYPES COME IN TWO QUESTIONS, not one. "Rock AND Steel" is a dual type and
   can only ever be two; "Rock OR Steel OR Ground" is a group with no limit.
   The sheet asks which one you mean and stays open, so several types are
   picked in one visit. Each chip cycles OFF -> HAS IT -> HASN'T IT. */
function typeFilterSheet(){
  openSheet("Type filter", function(body){
    const note = el("p", "sub");
    body.appendChild(note);
    const mrow = el("div", "toggles mb10");
    /** @type {Record<string, HTMLElement>} */
    const chips = {};
    function paint(){ paintTypeFilter(chips, note); }
    /** @type {[string, string][]} */
    const modes = [["and", "has ALL of these"], ["or", "has ANY of these"]];
    modes.forEach(function(o){
      mrow.appendChild(typeModeButton(mrow, o, paint));
    });
    body.appendChild(mrow);
    const t = el("div", "toggles");
    body.appendChild(t);
    liveTypes().forEach(function(ty){
      chips[ty] = typeFilterChip(ty, paint);
      t.appendChild(chips[ty]);
    });
    paint();
  }, [fbtn("Done", "primary", function(){ closeSheet(); findDraw(); })]);
}

/** ALL or ANY.
   @param {HTMLElement} mrow
   @param {[string, string]} o
   @param {() => void} paint */
function typeModeButton(mrow, o, paint){
  const b = el("button", "tog", o[1]);
  setPressed(b, FIND.typeMode === o[0]);
  b.onclick = function(){
    FIND.typeMode = o[0];
    pressOnly(mrow, b);
    paint(); findDraw();
  };
  return b;
}

/* THE TYPES THAT EXIST HERE, not every type that has a colour: nothing in
   Champions is Stellar (no Terastallization at all), so that chip could only
   ever return zero. Read off the dex, so a regulation that adds a type adds
   the filter. */
function liveTypes(){
  /** @type {Record<string, number>} */
  const live = {};
  DEX.forEach(function(p){ (p.types || []).forEach(function(t){ live[t] = 1; }); });
  return Object.keys(live).sort(byText);
}

/** One type chip: off -> has it -> hasn't it -> off.
   @param {string} ty
   @param {() => void} paint */
function typeFilterChip(ty, paint){
  const b = el("button", "tog", ty);
  typeSkin(b, ty, false);
  b.onclick = function(){
    const i = FIND.types.indexOf(ty), j = FIND.notTypes.indexOf(ty);
    if (i < 0 && j < 0) FIND.types.push(ty);
    else if (i >= 0) { FIND.types.splice(i, 1); FIND.notTypes.push(ty); }
    else FIND.notTypes.splice(j, 1);
    paint(); findDraw();
  };
  return b;
}

/** Every chip in its state - in the type's own ink, since white on Electric is
   unreadable; a ruled-out chip drops the type's border too, the last thing
   still saying "Psychic" when the point is that Psychic is being refused -
   and the note that explains ALL/ANY and warns that three types under ALL
   can never match.
   @param {Record<string, HTMLElement>} chips
   @param {HTMLElement} note */
function paintTypeFilter(chips, note){
  Object.keys(chips).forEach(function(ty){
    const on = FIND.types.includes(ty);
    const no = FIND.notTypes.includes(ty);
    const b = chips[ty];
    setPressed(b, on);
    b.classList.toggle("no", no);
    b.textContent = (no ? "− " : "") + ty;
    typeSkin(b, ty, on);
    if (no) b.style.borderColor = "";
  });
  note.textContent = (FIND.typeMode === "or"
    ? "Any one of the types you pick is enough - pick as many as you like."
    : "The Pokemon must have every type you pick. Nothing has more than " +
      "two, so three or more can never match.")
    + " Tap a type twice to rule it OUT instead"
    + (FIND.notTypes.length
       ? " — ruling out " + FIND.notTypes.join(", ") + "." : ".");
  note.className = "sub";
  if (FIND.typeMode === "and" && FIND.types.length > 2) {
    note.textContent = "Nothing has three types. Switch to “has ANY " +
      "of these”, or drop one.";
    note.className = "note bad";
  }
}

/* the tag tone of an ability's kind: changes your moves / what lands on it */
/** @type {Record<string, string>} */
const CLS_TONE = {"moves-off": "ok", "moves-def": "warn"};

/* ADD AN ABILITY: every ability, searchable by name or by what it does, and
   sorted into ONE kind each so the whole list can be narrowed to the kind
   you are after. The two "changes moves" kinds ARE the rule table in
   build_ability_moves.py, with the side each ability was given; the rest are
   read off the text by the same script, whose --audit prints every bucket. */
function abilityFilterSheet(){
  openSheet("Add an ability filter", function(body){
    const inp = searchField(body, "Search " + Object.keys(C.ABIL).length +
      " abilities — name or effect", function(){ draw(); });
    /** @type {Record<string, number>} */
    const pick = {};
    body.appendChild(abilityKindChips(pick, function(){ draw(); }));
    const count = el("div", "sub mb6");
    body.appendChild(count);
    const list = el("div", "list");
    body.appendChild(list);
    const all = Object.keys(C.ABIL).sort(byText);
    function draw(){ drawAbilityPicks(list, count, all, pick, inp.q()); }
    draw();
    setTimeout(function(){ inp.focus(); }, 60);
  }, []);
}

/** One chip per kind that has any abilities, with its count.
   @param {Record<string, number>} pick
   @param {() => void} draw */
function abilityKindChips(pick, draw){
  const CLS = C.AB_CLASS || {}, CLSL = C.AB_CLASS_LABEL || {};
  const ORDER = ["moves-off","moves-def","weather","terrain","speed",
               "status","stats","item","switch","other"];
  const frow = el("div", "toggles mt8 mb10");
  ORDER.forEach(function(k){
    let n = 0;
    Object.keys(C.ABIL).forEach(function(a){ if (CLS[a] === k) n++; });
    if (!n) return;
    const t = el("button", "tog", (CLSL[k] || k) + " · " + n);
    setPressed(t, false);
    t.onclick = function(){
      if (pick[k]) delete pick[k]; else pick[k] = 1;
      setPressed(t, !!pick[k]);
      draw();
    };
    frow.appendChild(t);
  });
  return frow;
}

/** ALL of them that match - the list is short enough that there is no reason
   to cut, and the count counts what is drawn.
   @param {HTMLElement} list
   @param {HTMLElement} count
   @param {string[]} all
   @param {Record<string, number>} pick
   @param {string} q */
function drawAbilityPicks(list, count, all, pick, q){
  const CLS = C.AB_CLASS || {};
  const ks = Object.keys(pick);
  const hits = all.filter(function(a){
    if (q && !a.toLowerCase().includes(q) &&
        !(C.ABIL[a] || "").toLowerCase().includes(q)) return false;
    if (ks.length && !ks.includes(CLS[a] || "other")) return false;
    return true;
  });
  count.textContent = hits.length === all.length
    ? all.length + " abilities"
    : hits.length + " of " + all.length + " abilities";
  list.innerHTML = "";
  hits.forEach(function(a){ list.appendChild(abilityPickRow(a)); });
  if (!hits.length) list.appendChild(el("div", "empty", "Nothing matches"));
}

/** One ability: its kind, the items that serve it, and its WHOLE text - this
   row is the only place the description appears, so it is never cut.
   @param {string} a */
function abilityPickRow(a){
  const CLS = C.AB_CLASS || {}, CLSL = C.AB_CLASS_LABEL || {};
  const r = el("button", "row");
  const mm = el("div", "rmain");
  const h = el("div", "rname");
  h.appendChild(document.createTextNode(a));
  const k = CLS[a] || "other";
  h.appendChild(el("span",
    "tag " + (CLS_TONE[k] || ""),
    CLSL[k] || k));
  (C.ITEM_FOR_ABILITY?.[a] || []).forEach(function(it){
    h.appendChild(el("span", "tag", it));
  });
  mm.appendChild(h);
  mm.appendChild(numText(C.ABIL[a] || "", "div", "st"));
  r.appendChild(mm);
  r.onclick = function(){ FIND.ability = a; closeSheet(); findDraw(); };
  return r;
}

/* The sort row. Dex order plus BST and the six stats - picking one turns the
   result list into that stat's tier order.

   TAPPING THE ONE YOU ARE ALREADY ON FLIPS THE DIRECTION, and the arrow on
   it says which way it is pointing. Descending is the speed tier; ascending
   is the Trick Room one. That second reading is the reason there are no min
   and max boxes: a threshold has to be guessed before you can ask, and an
   order does not. */
function paintSort(){
  const row = $("findSort");
  if (!row) return;
  row.innerHTML = "";
  [["dex","Dex #"]].concat(FIND_STATS).forEach(function(o){
    const on = o[0] === FIND.sort;
    let arrow = "";
    if (o[0] !== "dex") arrow = FIND.dir === "asc" ? " ↑" : " ↓";
    const t = el("button", "tog", o[1] + (on ? arrow : ""));
    setPressed(t, on);
    if (o[0] === "dex") t.title = "Dex order";
    else if (on) t.title = "Tap again for " +
      (FIND.dir === "asc" ? "highest first" : "lowest first");
    else t.title = "Rank by " + o[1] + ", highest first";
    t.onclick = function(){
      /* already here: flip. Somewhere else: go there, highest first, which is
         what you mean nine times out of ten. */
      if (o[0] === FIND.sort && o[0] !== "dex")
        FIND.dir = FIND.dir === "asc" ? "desc" : "asc";
      else { FIND.sort = o[0]; FIND.dir = "desc"; }
      paintSort();
      findRun();
    };
    row.appendChild(t);
  });
}

export { findDraw, findInit, findRun };
