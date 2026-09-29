/* The Find tab: search every Pokemon by type, ability, move and stat. */
import {
  bst, byText, C, catName, DEX, dexNo, learnset, MOVES, STAT_KEYS, STAT_LABEL,
} from "../core/data.js";
import { $, el, fbtn, searchField } from "../core/dom.js";
import { boxRows, FIND, originOf, ownedNames } from "../core/state.js";
import { megaLine, numText, pokeCard, typeChip, typeSkin } from "../ui/card.js";
import {
  blockerTags, itemTags, moveFilters, priorityTag, spreadTags,
} from "../ui/moves.js";
import { closeSheet, openSheet } from "../ui/nav.js";
import { findDetail } from "../ui/pokemon.js";
import { worldInit } from "./worlds.js";

/* ============================================ A MEGA LIVES ON ITS BASE ROW ==
   The search listed all 345 forms, 81 of which are Megas, so a fifth of every
   result page was a Pokemon you cannot own:

     "en el buscador se me llena de pokemones mega, y necesito saber solo su
      cambio de tipo, de habilidad, de stats. Solo necesito saber las cosas que
      cambian del pokemon base a mega... los pokemones se guardan en todo lugar
      en su forma normal y no mega."  (player, 2026-09-19)

   That is the whole argument: a Mega only exists mid-battle, and only because
   a stone is held. It is not a thing you store, so it is not a thing you
   browse - it is a fact ABOUT the Pokemon you store.

   THREE THINGS HAVE TO SURVIVE THE FOLD, or it costs more than it saves.

   1. THE QUERY. Mega Ampharos is Electric/Dragon and Mega Staraptor is
      Fighting/Flying; searching those types found them while they were rows of
      their own, and folding them in would silently lose the answer. A filter
      matches the base form OR any of its Megas, and the card says which.

   2. THE RANK. "en el filtro de stats, por ejemplo absol, garchomp y lucario
      deberian aparecer primero en el filtro de speed de mayor a menor, porque
      sus formas base tienen una velocidad diferente a la mega, pero igualmente
      los stats de la mega afectan al rank." So the sort reads the value the
      Pokemon can REACH: the highest across the line going down, the lowest
      going up - because a Mega that raises Speed does not help a Trick Room
      list, and the base is what is slow.

   3. WHAT CHANGES. Only that. A stat cell gains a second number when the Mega
      moves it, the types and the ability are shown only when the stone really
      swaps them, and a Pokemon with no Mega looks exactly as it did before. */
/* megaLine lives in ui/card.js, with the card. */
/* the value this Pokemon can reach in the direction being ranked */
function reach(p, key, dir){
  var best = statOf(p, key);
  megaLine(p).forEach(function(m){
    var v = statOf(m, key);
    best = dir === "asc" ? Math.min(best, v) : Math.max(best, v);
  });
  return best;
}
/* does the base OR any of its Megas satisfy `fn`? Returns the form that did,
   so the card can say "matched as Mega Ampharos" rather than leaving it to be
   worked out. */
function orMega(p, fn){
  if (fn(p)) return p;
  var ms = megaLine(p);
  for (const m of ms) if (fn(m)) return m;
  return null;
}
/* bst is not a base stat but it filters and sorts exactly like one, so it
   rides in the same table rather than keeping its own input. */
var FIND_STATS = [["bst","BST"],["hp","HP"],["atk","Atk"],["def","Def"],
                  ["spa","SpA"],["spd","SpD"],["spe","Spe"]];
function statOf(p, key){
  return key === "bst" ? bst(p) : p.b[STAT_KEYS.indexOf(key)];
}
function statLabel(key){
  return key === "bst" ? "BST" : STAT_LABEL[key];
}

function findDraw(){
  var host = $("findChips");
  host.innerHTML = "";
  function chip(label, onClear, cls, title){
    var t = el("button", "tog " + (cls || ""), label);
    t.setAttribute("aria-pressed", "true");
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
  $("findInChamp").setAttribute("aria-pressed", FIND.inChamp ? "true" : "false");
  $("findInHome").setAttribute("aria-pressed", FIND.inHome ? "true" : "false");
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

/* ", highest first" / ", lowest first", after the prefix given */
function dirLabel(prefix){
  return prefix + (FIND.dir === "asc" ? "lowest first" : "highest first");
}
const OWNED_ORIGIN = {home: "HOME origin", champions: "Champions origin"};
function findRun(){
  var out = $("findOut");
  out.innerHTML = "";
  var own = ownedNames();
  var inHome = {};
  boxRows("home").forEach(function(r){ inHome[r.name] = 1; });
  var q = (FIND.q || "").trim().toLowerCase();
  var matchedAs = {};                 /* base name -> the Mega that matched */
  var hits = DEX.filter(function(p){
    if (p.mega) return false;         /* it rides on its base row now */
    /* THE NAME BOX. "seria bueno agregar en el buscador algo que pueda buscar
       pokemon por simple nombre, cuando quiero ver la ficha rapidamente de uno
       sin tener que filtrar" - so it matches the name, the species and the dex
       number, and it matches a Mega's name too, because typing "mega absol"
       should find the card that carries it. */
    if (q) {
      var named = p.name.toLowerCase().includes(q) ||
                  (p.species || "").toLowerCase().includes(q) ||
                  String(dexNo(p.name)).includes(q) ||
                  megaLine(p).some(function(m){
                    return m.name.toLowerCase().includes(q); });
      if (!named) return false;
    }
    if (FIND.inChamp || FIND.inHome) {
      var c = FIND.inChamp && ((p.name in own) || (p.species in own));
      var h = FIND.inHome && ((p.name in inHome) || (p.species in inHome));
      if (!c && !h) return false;
    }
    /* Each filter may be satisfied by the base OR by a Mega, and the LAST one
       that needed a Mega is remembered so the card can say so. */
    var via = null;
    /* RULED OUT WINS, and it is checked on the BASE form only. A Mega that
       picks up Psychic does not make the Pokemon Psychic in the box, and the
       question being asked - "nothing Psychic on this team" - is about what
       walks on. */
    if (FIND.notTypes.length &&
        FIND.notTypes.some(function(t){ return p.types.includes(t); }))
      return false;
    if (FIND.types.length) {
      var hit = orMega(p, function(f){
        return FIND.typeMode === "or"
          ? FIND.types.some(function(t){ return f.types.includes(t); })
          : FIND.types.every(function(t){ return f.types.includes(t); });
      });
      if (!hit) return false;
      if (hit !== p) via = hit;
    }
    if (FIND.ability) {
      var ah = orMega(p, function(f){
        return (f.ab || []).includes(FIND.ability); });
      if (!ah) return false;
      if (ah !== p) via = ah;
    }
    if (FIND.moves.length) {
      /* A MEGA SHARES ITS BASE'S MOVEPOOL - "el moveset es el mismo en el base
         que en el mega al final" - so this one is asked of the base only. */
      var ls = learnset(p.name);
      if (!ls) return false;
      var have = {};
      ls.forEach(function(m){ have[m.name] = 1; });
      if (!FIND.moves.every(function(n){ return have[n]; })) return false;
    }
    if (via) matchedAs[p.name] = via;
    return true;
  });

  var head = el("p", "sub");
  var BASES = DEX.filter(function(p){ return !p.mega; }).length;
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
  /* THE SORT IS THE TIER LIST, and it reads both ways. Descending is the
     speed tier; ascending is the Trick Room one, and it replaces the "Speed
     at most" box that used to ask for a threshold nobody knows in advance.
     Dex order is the one non-ranking answer. */
  if (FIND.sort === "dex") {
    hits.sort(function(a, b){
      return dexNo(a.name) - dexNo(b.name) || a.name.localeCompare(b.name);
    });
  } else {
    var sign = FIND.dir === "asc" ? -1 : 1;
    hits.sort(function(a, b){
      return sign * (reach(b, FIND.sort, FIND.dir) -
                     reach(a, FIND.sort, FIND.dir)) ||
             a.name.localeCompare(b.name);
    });
  }
  /* A GRID once there is room for one: 345 results in a single column is
     nineteen screens, three across is six. The class does the deciding, by
     width, so a phone still gets one column. */
  var list = el("div", "cards");
  hits.slice(0, 120).forEach(function(p){
    var here = (p.name in own) || (p.species in own);
    /* THE CARD, and nothing about it lives here any more. Everything this
       block used to draw by hand - the type skin, the Mega chips and what
       they swap, BST and the ability with their arrows, the six stats with
       the Mega deltas, the strip of sprites - is pokeCard() in ui/card.js,
       because the same card has to appear on every screen that shows a
       Pokemon and copying this one is what let the others fall behind
       (player, 2026-09-20).

       ALL SIX STATS, ALWAYS, AND THE RANKED ONE MARKED. This briefly dropped
       the other five when one was being ranked and the player cut it
       immediately: "si filtro por atk, de mayor a menor, pero tambien quiero
       ver la speed, no puedes quitarme esa informacion." Nothing is hidden;
       the ranked stat is simply made findable. */
    var ranking = FIND.sort !== "dex";
    var r = pokeCard(p, {
      cls: here ? "perm" : "",
      mark: ranking ? FIND.sort : null,
      badges: function(h){
        if (here) {
          /* say WHICH copy and how elastic it is, not the retired word
             "permanent" */
          var rec = boxRows("champions").find(function(x){
            return x.name === p.name || x.name === p.species; });
          var o = rec ? originOf(rec) : null;
          var ownTag = rec?.status === "rental" ? "rental in your box"
            : "yours, " + (OWNED_ORIGIN[o] || "origin?");
          h.appendChild(el("span", "tag " + (o === "home" ? "ok" : ""), ownTag));
        }
        /* WHEN A MEGA IS THE REASON THIS POKEMON MATCHED AT ALL, say so.
           Searching Fighting finds Staraptor because its Mega is
           Fighting/Flying, and a card showing only Normal/Flying looks like a
           bug. */
        var via = matchedAs[p.name];
        if (via) {
          var vt = el("span", "tag warn", "as " + via.name);
          vt.title = "The base form does not match - this one does.";
          h.appendChild(vt);
        }
      },
      onclick: function(){ findDetail(p); }
    });
    list.appendChild(r);
  });
  out.appendChild(list);
  if (hits.length > 120) out.appendChild(el("p", "sub",
    "Showing the first 120. Narrow it further to see the rest."));
}

const CLS_TONE = {"moves-off": "ok", "moves-def": "warn"};
function findInit(){
  /* Typed, not tapped: this one narrows as you go rather than adding a chip,
     because it is the control for "open Garchomp" and not for building a
     query. It still lives beside the chips, so clearing it is one gesture. */
  var nameBox = $("findName");
  if (nameBox) {
    nameBox.value = FIND.q || "";
    nameBox.oninput = function(){ FIND.q = nameBox.value; findRun(); };
  }
  $("findAddMove").onclick = function(){
    openSheet("Add a move filter", function(body){
      /* the same controls the build editor has - one implementation, so
         "which special Electric move" is asked the same way in both places */
      var pool = MOVES.filter(function(m){
        return !FIND.moves.includes(m.name);
      });
      var ui = moveFilters(body, pool, function(){ draw(); },
                           "Any of " + pool.length + " moves");
      var list = el("div", "list");
      body.appendChild(list);
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
          mm.appendChild(h);
          mm.appendChild(el("div", "st", catName(m.cat) + "  ·  " +
            (m.bp ? m.bp + " BP" : "— BP") + "  ·  " +
            (m.acc == null ? "—" : m.acc) + " acc  ·  " + m.target));
          if (m.text) mm.appendChild(numText(m.text, "div", "st"));
          r.appendChild(mm);
          r.onclick = function(){
            FIND.moves.push(m.name); closeSheet(); findDraw();
          };
          list.appendChild(r);
        });
        if (!list.children.length) list.appendChild(el("div", "empty", "Nothing matches"));
      }
      draw();
      setTimeout(function(){ ui.input.focus(); }, 60);
    }, []);
  };

  /* Types come in two questions, not one. "Rock AND Steel" is a dual type and
     can only ever be two, because nothing has three; "Rock OR Steel OR Ground"
     is a whole group of Pokemon and has no limit. The sheet asks which one you
     mean and stays open, because picking three types through three round trips
     was the real cost. */
  $("findAddType").onclick = function(){
    openSheet("Type filter", function(body){
      var note = el("p", "sub");
      body.appendChild(note);
      var mrow = el("div", "toggles"); mrow.style.margin = "0 0 10px";
      [["and", "has ALL of these"], ["or", "has ANY of these"]].forEach(function(o){
        var b = el("button", "tog", o[1]);
        b.setAttribute("aria-pressed", FIND.typeMode === o[0] ? "true" : "false");
        b.onclick = function(){
          FIND.typeMode = o[0];
          Array.prototype.forEach.call(mrow.children, function(x){
            x.setAttribute("aria-pressed", x === b ? "true" : "false");
          });
          paint(); findDraw();
        };
        mrow.appendChild(b);
      });
      body.appendChild(mrow);
      var t = el("div", "toggles");
      body.appendChild(t);
      var chips = {};
      /* THE TYPES THAT EXIST HERE, not every type that has a colour. Stellar
         was on the list and nothing in Champions is Stellar - the format has
         no Terastallization at all - so it was a filter that could only ever
         return zero. Derived from the dex rather than from the palette, so a
         regulation that adds a type adds the filter and one that never had a
         carrier never shows one. */
      /* DEX here is the mapped OBJECT list, not C.DEX's raw arrays - reading
         r[2] off it gave undefined, the forEach threw, and the filter rendered
         with no types at all. findtest caught it on the first run. */
      var live = {};
      DEX.forEach(function(p){ (p.types || []).forEach(function(t){ live[t] = 1; }); });
      Object.keys(live).sort(byText).forEach(function(ty){
        var b = el("button", "tog", ty);
        typeSkin(b, ty, false);
        /* OFF -> HAS IT -> HASN'T IT -> OFF. The ALL/ANY control above says
           how the picked types combine and had no way to say NOT, which is the
           one the player actually asked for and the one I first built in the
           wrong screen - it went into the MOVE picker's chips, where it reads
           "a Psychic move", not "a Psychic Pokemon" (2026-09-19: "en el filtro
           de tipo esta el operador logico and y or, pero falta algo que diga
           no... si pongo en move trick room, pero en type quiero colocar que
           no me muestre ningun pokemon de tipo psyquico"). He looked for it
           here, where he said it, and it was not here. */
        b.onclick = function(){
          var i = FIND.types.indexOf(ty), j = FIND.notTypes.indexOf(ty);
          if (i < 0 && j < 0) FIND.types.push(ty);
          else if (i >= 0) { FIND.types.splice(i, 1); FIND.notTypes.push(ty); }
          else FIND.notTypes.splice(j, 1);
          paint(); findDraw();
        };
        chips[ty] = b;
        t.appendChild(b);
      });
      function paint(){
        Object.keys(chips).forEach(function(ty){
          var on = FIND.types.includes(ty);
          var no = FIND.notTypes.includes(ty);
          var b = chips[ty];
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.classList.toggle("no", no);
          b.textContent = (no ? "− " : "") + ty;
          /* the type's own ink, not #fff - eight of the eighteen are written
             in black and white on Electric is unreadable */
          typeSkin(b, ty, on);
          /* a ruled-out chip drops the type's border too: that border is the
             last thing still saying "this is a Psychic chip" when the whole
             point is that Psychic is being refused */
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
      paint();
    }, [fbtn("Done", "primary", function(){ closeSheet(); findDraw(); })]);
  };

  $("findAddAbility").onclick = function(){
    openSheet("Add an ability filter", function(body){
      var inp = searchField(body, "Search " + Object.keys(C.ABIL).length +
        " abilities — name or effect", function(){ draw(); });
      /* Every ability sorted into ONE bucket, so 215 names can be narrowed to
         the kind you are actually after. The two "changes moves" buckets are
         not re-derived here: they ARE the rule table in
         build_ability_moves.py, with the side each ability was given. The rest
         are read off the ability text by the same script, and `--audit` prints
         every bucket so a wrong one is visible rather than buried. */
      var CLS = C.AB_CLASS || {}, CLSL = C.AB_CLASS_LABEL || {};
      var ORDER = ["moves-off","moves-def","weather","terrain","speed",
                   "status","stats","item","switch","other"];
      var pick = {};
      var frow = el("div", "toggles"); frow.style.margin = "8px 0 10px";
      ORDER.forEach(function(k){
        var n = 0;
        Object.keys(C.ABIL).forEach(function(a){ if (CLS[a] === k) n++; });
        if (!n) return;
        var t = el("button", "tog", (CLSL[k] || k) + " · " + n);
        t.setAttribute("aria-pressed", "false");
        t.onclick = function(){
          if (pick[k]) delete pick[k]; else pick[k] = 1;
          t.setAttribute("aria-pressed", pick[k] ? "true" : "false");
          draw();
        };
        frow.appendChild(t);
      });
      body.appendChild(frow);
      var count = el("div", "sub"); count.style.margin = "0 0 6px";
      body.appendChild(count);
      var list = el("div", "list");
      body.appendChild(list);
      var all = Object.keys(C.ABIL).sort(byText);
      function draw(){
        var q = inp.q();
        var ks = Object.keys(pick);
        var hits = all.filter(function(a){
          if (q && !a.toLowerCase().includes(q) &&
              !(C.ABIL[a] || "").toLowerCase().includes(q)) return false;
          if (ks.length && !ks.includes(CLS[a] || "other")) return false;
          return true;
        });
        /* It said "215 abilities" while drawing 80 of them, which is a
           count of the wrong thing. There are 215 in Champions, so there is
           no reason to cut at all - all of them are drawn now. */
        count.textContent = hits.length === all.length
          ? all.length + " abilities"
          : hits.length + " of " + all.length + " abilities";
        list.innerHTML = "";
        hits.forEach(function(a){
          var r = el("button", "row");
          var mm = el("div", "rmain");
          var h = el("div", "rname");
          h.appendChild(document.createTextNode(a));
          var k = CLS[a] || "other";
          h.appendChild(el("span",
            "tag " + (CLS_TONE[k] || ""),
            CLSL[k] || k));
          (C.ITEM_FOR_ABILITY?.[a] || []).forEach(function(it){
            h.appendChild(el("span", "tag", it));
          });
          mm.appendChild(h);
          /* The WHOLE text. Clicking this row sets the filter and closes the
             sheet - it does not open the ability anywhere - so 110 characters
             was the only place the description appeared, cut mid-sentence and
             without even an ellipsis to admit it. */
          mm.appendChild(numText(C.ABIL[a] || "", "div", "st"));
          r.appendChild(mm);
          r.onclick = function(){ FIND.ability = a; closeSheet(); findDraw(); };
          list.appendChild(r);
        });
        if (!hits.length) list.appendChild(el("div", "empty", "Nothing matches"));
      }
      draw();
      setTimeout(function(){ inp.focus(); }, 60);
    }, []);
  };

  /* These two are TOGGLES, not actions - they flip a filter and stay on. They
     were styled exactly like "+ Move" next to them and carried no pressed
     state, so the only feedback was a chip appearing in another row. The chip
     stays; the button now also says what it is. */
  $("findInChamp").onclick = function(){
    FIND.inChamp = !FIND.inChamp; findDraw(); };
  $("findInHome").onclick = function(){
    FIND.inHome = !FIND.inHome; findDraw(); };

  /* SEARCH OR WORLDS, one tap apart. They answer different questions - "who
     matches this" and "what won that August" - and Worlds used to live BELOW
     345 result rows, which at nineteen screens is the same as not being
     there. A segmented control rather than a seventh entry in the rail,
     because it belongs to Find rather than being another place to be. */
  var mrow = $("findMode");
  Array.prototype.forEach.call(mrow.children, function(b){
    b.onclick = function(){
      var m = b.dataset.mode;
      Array.prototype.forEach.call(mrow.children, function(x){
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      $("findSearch").hidden = m !== "search";
      $("findWorlds").hidden = m !== "worlds";
    };
  });

  paintSort();
  $("findClear").onclick = function(){
    FIND.q = ""; if ($("findName")) $("findName").value = "";
    FIND.moves = []; FIND.types = []; FIND.notTypes = []; FIND.typeMode = "and";
    FIND.ability = "";
    FIND.inChamp = false; FIND.inHome = false;
    FIND.sort = "bst"; FIND.dir = "desc";
    paintSort();
    findDraw();
  };
  worldInit();
}

/* The sort row. Dex order plus BST and the six stats - picking one turns the
   result list into that stat's tier order, which is the whole of what the
   separate Tiers block used to be.

   TAPPING THE ONE YOU ARE ALREADY ON FLIPS THE DIRECTION, and the arrow on
   it says which way it is pointing. Descending is the speed tier; ascending
   is the Trick Room one. That second reading is the reason there are no min
   and max boxes: a threshold has to be guessed before you can ask, and an
   order does not. */
function paintSort(){
  var row = $("findSort");
  if (!row) return;
  row.innerHTML = "";
  [["dex","Dex #"]].concat(FIND_STATS).forEach(function(o){
    var on = o[0] === FIND.sort;
    var arrow = "";
    if (o[0] !== "dex") arrow = FIND.dir === "asc" ? " ↑" : " ↓";
    var t = el("button", "tog", o[1] + (on ? arrow : ""));
    t.setAttribute("aria-pressed", on ? "true" : "false");
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
