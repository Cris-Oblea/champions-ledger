/* 12-find.js - Find: moves, abilities, items, and one Pokemon's whole sheet.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import { $, C, DEX, MOVES, MOVE_BY, SORT, STAT_KEYS, STAT_LABEL, STONE_OF,
 TYPE_COLOR, anyRow, bst, byName, capNote, cardLine, catName, defence,
 dexNo, effectLine, el, labelBox, learnset, megaInk, megaLine, megaSuffix, megasFor,
 podiumChip, pokeFacts, podiumFor, pokeCard, splitPct, spriteFor, statGrid, toast,
 typeCard, typeChip, typeSkin, usageTag } from "./01-data.js";
import { S, boxRows, originOf, ownedNames } from "./02-state.js";
import { closeSheet, fbtn, openSheet } from "./04-nav.js";
import { analysisPanel, battleFormNote, loadOutside, outsideDex,
  outsideMove, outsideMovesFor } from "./05-box.js";
import { AB_SET, abilityHit, abilityTag, engineReady } from "./11-damage.js";
import { fill, note } from "./13-boot.js";
/* --------------------------------------------------------- the search view --
   The question this exists for is "who learns Imprison AND Wide Guard AND
   Protect" - a chain that used to mean asking Claude. Filters are ANDed. */
/* "in my box" was one flag over two different boxes, which cannot answer
   "do I have this in Champions right now" - the question that decides whether
   a Pokemon is playable today - separately from "can I bring it in from
   HOME". Two flags, and both on means either box. */
/* STATS ARE A FILTER LIKE ANY OTHER NOW, and the sort is what makes this the
   tier list. It used to be two fixed boxes - "Speed at least", "Speed at
   most" - which answered one stat and only by filtering, so "where does this
   sit in the Speed order" had no answer here at all and lived in a separate
   block with a tab per stat. The player collapsed the two ideas (2026-09-15):
   one table, per-stat filters, and Find's existing type / ability / move
   filters compose with them. A speed tier that is also "learns Fake Out and I
   own one" is a question the old shape could not ask.

   A DIRECTION, NOT A PAIR OF BOUNDS. The first go at this gave every stat a
   min and a max, and the player cut it the same hour (2026-09-15): "creo que
   poner el maximo y el minimo esta demas, es mejor un orden ascendente y
   descendente como opciones, asi veo como se ordena por ese stat de mayor a
   menor o viceversa."

   He is right, and it also subsumes the thing the old fixed boxes were for.
   "Speed at most" was labelled the Trick Room filter; sorting Speed ASCENDING
   answers that better, because it ranks the slow rather than making you guess
   a threshold first. Two controls became one, and nothing was lost.

   `sort` is a stat key, "bst" or "dex". `dir` is "desc" or "asc"; tapping the
   stat you are already on flips it. */
var FIND = {q: "", moves: [], types: [], notTypes: [], typeMode: "and",
            ability: "",
            inChamp: false, inHome: false,
            sort: "bst", dir: "desc", cat: ""};

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
/* megaLine lives in 01-data.js now, with the card. */
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
  for (var i = 0; i < ms.length; i++) if (fn(ms[i])) return ms[i];
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
      var named = p.name.toLowerCase().indexOf(q) >= 0 ||
                  (p.species || "").toLowerCase().indexOf(q) >= 0 ||
                  String(dexNo(p.name)).indexOf(q) >= 0 ||
                  megaLine(p).some(function(m){
                    return m.name.toLowerCase().indexOf(q) >= 0; });
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
        FIND.notTypes.some(function(t){ return p.types.indexOf(t) >= 0; }))
      return false;
    if (FIND.types.length) {
      var hit = orMega(p, function(f){
        return FIND.typeMode === "or"
          ? FIND.types.some(function(t){ return f.types.indexOf(t) >= 0; })
          : FIND.types.every(function(t){ return f.types.indexOf(t) >= 0; });
      });
      if (!hit) return false;
      if (hit !== p) via = hit;
    }
    if (FIND.ability) {
      var ah = orMega(p, function(f){
        return (f.ab || []).indexOf(FIND.ability) >= 0; });
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
     : ", by " + statLabel(FIND.sort) +
       (FIND.dir === "asc" ? ", lowest first" : ", highest first"));
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
       the Mega deltas, the strip of sprites - is pokeCard() in 01-data.js,
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
          var rec = boxRows("champions").filter(function(x){
            return x.name === p.name || x.name === p.species; })[0];
          var o = rec ? originOf(rec) : null;
          h.appendChild(el("span", "tag " + (o === "home" ? "ok" : ""),
            rec && rec.status === "rental" ? "rental in your box"
            : o === "home" ? "yours, HOME origin"
            : o === "champions" ? "yours, Champions origin"
            : "yours, origin?"));
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


/* ================================================= ONE SHEET, THREE DOORS ==
   A Pokemon's sheet is the same sheet whether it was opened from the Champions
   box, from HOME or from a search result. It was three sheets (player,
   2026-09-18):

     "las fichas tanto de home box, champions box y find... deben ser todas
      iguales, la mas completa es la de find, que dice absolutamente todo,
      habilidades, moves, etc. creo que solo le falta el takes damage que tiene
      la ficha de home box... la unica diferencia es la opcion shiny y si esta
      entrenado en champions y el origen."

   Find had the abilities, the Worlds sets and the whole movepool; the box had
   the Mega line, the type chart and what Smogon wrote. Neither had the other
   half, so which door you came through decided what you were allowed to know.

   Two functions rather than one, and the split is where the box needs to put
   its own controls: IDENTITY first, then whatever that door owns, then the
   REFERENCE. Origin, shiny and trained are edits, and an edit belongs under
   the name it applies to - not below two hundred rows of movepool.

     pokeHead   picture, types, BST, the six stats, the other spellings of
                this name, and what it turns into mid-battle
     pokeBody   the Mega line, what damages it, the abilities, the Worlds sets
                it won with, its movepool, and what Smogon wrote

   `opts.shiny` draws his copy's colours; `opts.rec` is the box row when there
   is one, and its absence is what makes the search view the species rather
   than a copy of it. */
function pokeHead(body, p, opts){
  opts = opts || {};
  /* THE PICTURE SITS BESIDE THE FACTS, NOT ABOVE THEM. Centred on its own
     row at 180px it cost about 190px of height before a single number
     (player, 2026-09-16: "la imagen del profile del pokemon si la encuentro
     grande, ocupa mucho espacio"). Beside the chips and the BST cell it
     shares vertical space those rows were using anyway.

     The 512px render rather than the 96px pixel sprite: a sheet draws one
     Pokemon and can afford the file a list of 159 cannot. */
  var head = el("div", "sheethead");
  var big = spriteFor(p.name, true, opts.shiny);
  if (big) head.appendChild(big);
  var info = el("div", "sheetfacts");
  /* THE SAME FUNCTION AS THE CARD, drawing the BASE POKEMON ONLY.

     A card has one chance to say everything, so it carries the Mega line:
     the ability boxes, the arrows, the deltas. A SHEET HAS A MEGA LINE
     SECTION further down that says all of it properly - each Mega with its
     own picture, its own typing, its own ability and its own six stats, plus
     a sentence naming what the stone moved. Bringing it up here as well put
     the same facts on the screen twice (player, 2026-09-20: "cuando abajo
     donde dice mega line ya dice esos datos... info duplicada = info inutil
     ocupando espacio repitiendo lo mismo que ya se sabe").

     So `ms` is empty: no Mega ability box, no type arrow, no BST arrow and no
     deltas in the stat table. What is left is what this head is for - the
     Pokemon you opened, as it is before any stone.

     The dex number is dropped - the sheet has it in the title - and the
     medal joins the chips, which is the one thing this door adds. */
  pokeFacts(info, p, [], {
    dex: false,
    stats: false,
    name: p.name,
    meta: function(chips){
      var med0 = podiumChip(p.name);
      if (med0) chips.appendChild(med0);
    }
  });
  head.appendChild(info);

  /* THE BASE FORM GETS THE SAME BOX AS A MEGA (player, 2026-09-20: "mega
     line tiene todo dentro de un mismo cuadro, pero la forma base no,
     deberias dejar ambas formas de igual manera").

     It was the odd one out by history rather than by design: the head was
     written first and loose on the page, then abilities got a section of
     their own, then the damage table did, and the Mega block - written last
     - put all three in one panel and read better than any of them. So the
     base is a panel too, in the Mega's order: picture and facts, the six
     stats full width, the abilities explained, what damages it. Two forms,
     one shape, and the sheet is a stack of Pokemon rather than a stack of
     topics. */
  var panel = el("div", "panel megablock");
  panel.style.marginBottom = "10px";
  panel.appendChild(head);
  panel.appendChild(statGrid(p));
  body.appendChild(panel);
  /* handed to pokeBody, which fills it with the abilities and the damage
     table - they are the base form's and belong in the base form's box. */
  body._basePanel = panel;
  /* The other spellings that mean this Pokemon. Squawkabilly's three extra
     plumages and Indeedee-F used to show up as separate entries marked "not
     in the Champions dex" - they are in it, under this name. The note says
     "also written", not "changes nothing", because a few of these do change
     something in battle (Palafin-Hero, Castform's weather forms); what they
     share is one dex entry. */
  var also = (C.COSMETIC || {})[p.name];
  if (also && also.length) {
    var an = el("div", "note");
    an.style.marginBottom = "10px";
    an.innerHTML = "<strong>Also written:</strong> " + also.join(", ") +
      ". Same Pokemon — the dex keeps one entry" +
      (also.length > 1 ? " for all of them." : ".");
    body.appendChild(an);
  }

  /* A SPECIES CHAMPIONS HAS NEVER HEARD OF says so, on every door. HOME can
     hold one for ever and never send it in, and the numbers above it are
     main-series ones because Champions publishes none - which the sheet has
     to say plainly rather than let them read as ours. */
  if (p.outside) {
    var osrc = el("div", "note");
    osrc.style.marginBottom = "10px";
    osrc.innerHTML = "<strong>Not in the Champions dex.</strong> It can live "
      + "in HOME but never enter the game"
      + (p.approx ? ". No row for this exact form either — the numbers "
         + "shown are " + p.approx + "'s" : "") + ".";
    body.appendChild(osrc);
  }

  var bfn = battleFormNote(p);
  if (bfn) body.appendChild(bfn);
}


/* Everything a Pokemon IS, under whatever the door that opened it owns. */
/* The type chart for one typing, as rows of chips. A function because a Mega
   that RETYPES needs its own - Mega Ampharos is Electric/Dragon and takes Ice
   at x2 where Ampharos does not - and printing one table under two typings
   would be the same number meaning two different things. */
/* ONE ABILITY, EXPLAINED: the text, the measured multiplier, and what it
   does to THIS movepool. A function at module level because both the base
   panel and each Mega panel call it - and `form` matters, since "tags N of
   the moves it learns" has to be counted against the form that HAS the
   ability. */
function abilityNote(a, form, badge, ls){
  var n = el("div", "note");
  n.style.marginBottom = "6px";
  /* CHAMPIONS' OWN TEXT FIRST, ALWAYS. 95 of the abilities carried by
     species the game has not added have no row here at all - Protosynthesis
     was a name on the sheet with nothing to say about it - so those fall
     back to the outside dex, which says on screen that it is main-series.
     An ability Champions HAS never reaches that branch. */
  n.innerHTML = "<strong>" + a + ".</strong> ";
  /* WHOSE ability it is, when it is not the base form's. In that Mega's
     own ink, so the note, the sprite caption, the stat deltas and the
     card all say the same form the same way. */
  if (badge) n.insertBefore(badge, n.firstChild);
  var say = el("span");
  say.textContent = C.ABIL[a] || "";
  n.appendChild(say);
  if (!C.ABIL[a]) {
    say.textContent = "Loading…";
    loadOutside(function(){
      var t = (outsideDex().ab || {})[a];
      say.textContent = t || "No description on record for " + a + ".";
      if (t) {
        var tg = el("span", "tag", "main-series text");
        tg.title = "Champions has no row for " + a + " because no Pokemon it "
                 + "allows carries it. This is the main-series description.";
        say.appendChild(tg);
      }
    });
  }
  var anum = effectLine(a);
  if (anum) n.appendChild(anum);
  /* What it does to this Pokemon's moves, said HERE rather than as a badge
     on every row. Two shapes, and the difference is the whole point:
     an ability that covers a category (Guts, every physical move) names
     the category, because badging all of them picks out nothing; one that
     really selects says how many of THIS movepool it hits, so the badges
     below have a number to be checked against. */
  var r = AB_SET[a], sc = el("div", "st");
  sc.style.marginTop = "2px";
  if (r && r.side === "off" && r.scope) {
    sc.textContent = "Affects " + r.scope + " it knows — " + r.why +
                     ". No per-move tag: it picks out nothing.";
    n.appendChild(sc);
  } else if (r && r.side === "off" && ls) {
    var k = ls.filter(function(mn){
      var mv = MOVE_BY[mn];
      return mv && abilityTag(a, mv, form);
    }).length;
    sc.textContent = k
      ? "Tags " + k + " of the " + ls.length + " moves it learns."
      : "Touches none of the moves it learns.";
    n.appendChild(sc);
  } else if (r && r.side === "def") {
    sc.textContent = "Changes what lands on it, not its own moves — " +
                     r.why + ".";
    n.appendChild(sc);
  }
  return n;
}

function damageTable(types){
  var dfc = defence(types);
  var dl = el("div");
  [[4, "×4"], [2, "×2"], [.5, "½"], [.25, "¼"],
   [0, "immune"]].forEach(function(g){
    var hits = Object.keys(dfc).filter(function(t){ return dfc[t] === g[0]; });
    if (!hits.length) return;
    var line = el("div", "rmeta");
    line.style.marginBottom = "5px";
    line.appendChild(el("span",
      "tag" + (g[0] > 1 ? " bad" : g[0] < 1 ? " ok" : ""), g[1]));
    hits.forEach(function(t){ line.appendChild(typeChip(t)); });
    dl.appendChild(line);
  });
  return dl;
}

function pokeBody(body, p, opts){
  opts = opts || {};

  /* THE ORDER IS THE ORDER A POKEMON IS READ IN (player, 2026-09-19): "estan
     los datos como el tipo, stats y la habilidad deberia seguirle, luego la
     info de las megas y tabla de debilidad extra por si algun tipo cambio."

     So: the head above carries the types and the six stats, then the
     abilities, then what damages it, then the Mega line - and each Mega
     carries its OWN damage table, but only when the stone really retypes it. */

  /* resolved BEFORE the abilities, because each ability now reports how much
     of THIS movepool it touches - `var` hoisting made the check pass with
     `ls` still undefined and the line silently never rendered */
  var ls = learnset(p.name);



  /* THE BASE FORM'S, AND ONLY THOSE. A Mega's ability is explained in the
     Mega line block, beside the form that has it - everything about a Mega
     lives there (player, 2026-09-20: "para tener el orden correcto, cosas
     de mega tipo, habilidad, debilidades, resistencias etc. todo en mega
     line... la informacion se entrega de manera ordenada"). */
  var caja = body._basePanel || body;
  (p.ab || []).forEach(function(a){
    caja.appendChild(abilityNote(a, p, null, ls));
  });

  /* WHAT DAMAGES IT. The box sheet had this and the search view did not,
     which is backwards - the search view is where a Pokemon is being
     weighed against the field. A type chart is a type chart: it needs the
     types and nothing else, so a species Champions has never heard of gets
     one too. */
  caja.appendChild(el("div", "st", "Takes damage:"));
  caja.appendChild(damageTable(p.types));

  /* ============================================ WHAT THE STONE MAKES OF IT ==
     One block per Mega, and each one is a whole Pokemon rather than a line of
     differences. The version before this was the stones panel from the Items
     tab with a sentence bolted on:

       "adentro de la ficha del pokemon, creo que copiaste y pegaste lo de las
        piedras de los items, ese cuadro esta horrible, repite informacion...
        feisimo"

     He was right - and it also said too little. It printed a BST and then a
     sentence naming three of the six stats, so "what does Mega Absol Z
     actually look like" had no answer on the sheet built to answer it:

       "dice los bst, pero le falta toda la info, y deberia decir solo la info
        de mega absol, lo mismo para lo de mega absol z."

     So each Mega gets its picture, its stone, its types, its full six stats
     with the ones the stone MOVES marked, and its ability beside the one it
     gives up. Nothing is repeated from the base block above: what is the same
     is simply not mentioned. */
  var ms = megasFor(p.name);
  if (ms.length) {
    body.appendChild(el("h2", null,
      ms.length > 1 ? "Mega line — " + ms.length + " of them, and only one"
                      + " may evolve in a battle"
                    : "Mega line"));
    ms.forEach(function(m){
      var retype = m.types.join("/") !== p.types.join("/");
      var pn = el("div", "panel megablock");
      pn.style.marginBottom = "10px";

      var head = el("div", "sheethead");
      var pic = spriteFor(m.name, true);
      if (pic) head.appendChild(pic);
      var info = el("div", "sheetfacts");
      var h = el("div", "rname");
      h.appendChild(document.createTextNode(m.name));
      /* the stone is named, because it is what this block is about - but NOT
         whether it is owned. That lives in the Items tab and nowhere else. */
      h.appendChild(el("span", "tag mega", STONE_OF[m.name]));
      info.appendChild(h);

      var mt = el("div", "rmeta");
      m.types.forEach(function(t){ mt.appendChild(typeChip(t)); });
      info.appendChild(mt);

      /* THE ABILITY IS OFTEN THE REASON, and sometimes the cost - Mawile gains
         Huge Power, Froslass trades Cursed Body for Snow Warning - so both
         halves are named and neither is left to be worked out. */
      /* NOTHING THE SHEET ALREADY SAID. The base types, its BST and its
         abilities are four lines up, in the head and in Abilities, so naming
         them again here is the duplication this block was rebuilt to stop
         (player, 2026-09-19: "me parece tonto mencionar las habilidades que un
         pokemon tuvo antes de ser mega, si la ficha ya dice la informacion de
         las habilidades de ese pokemon... es muy importante no duplicar la
         informacion"). What is left is only what the stone makes. */
      info.appendChild(cardLine([
        labelBox(bst(m), "BST"),
        labelBox(m.ab, "Ability", "wide")
      ]));
      head.appendChild(info);
      pn.appendChild(head);

      /* ITS ABILITY, EXPLAINED, HERE. The block named it in a cell and left
         it at that, so a sheet that spells out three base abilities went
         quiet on the one that is live for most of the battle. It is
         explained in the same shape as the others - the text, the measured
         multiplier, what it does to this movepool - under the form that
         has it rather than up in the base Pokemon's list. */
      (m.ab || []).forEach(function(ab){
        var note = abilityNote(ab, m, null, ls);
        note.style.marginTop = "8px";
        pn.appendChild(note);
      });

      /* ITS OWN SIX, with the ones the stone moved marked. The base spread is
         four lines up; this is the other one, not a repeat of it. */
      pn.appendChild(statGrid(m));
      var moved = STAT_KEYS.map(function(k, i){
        return m.b[i] === p.b[i] ? null
             : STAT_LABEL[k] + " " + p.b[i] + " → " + m.b[i];
      }).filter(Boolean);
      pn.appendChild(el("div", "st",
        moved.length ? "The stone moves " + moved.join(", ") + "."
                     : "The stone moves no stat — it is here for the "
                       + "ability."));

      /* AND ITS OWN DAMAGE TABLE, only when the typing really changes.
         "la tabla de takes damage deberia ser diferente si el pokemon cambia
          de tipo" - it should, and it is a different table, not a caveat:
         Mega Ampharos picks up a Dragon's weaknesses and loses none of the
         Electric ones. Drawn here rather than above, because above is the
         Pokemon you own. */
      if (retype) {
        pn.appendChild(el("div", "st", "Takes damage differently:"));
        pn.appendChild(damageTable(m.types));
      }
      body.appendChild(pn);
    });
  }
  /* WHAT IT WON WITH. Folded, because a Kingambit has eighteen of these
     and the movepool below is what the sheet is usually opened for - but
     one tap away, because "what did the set that actually won look like" is
     a different and better question than "what is popular" (player,
     2026-09-15: "ver que moveset llevo, que item, que habilidad, naturaleza
     etc. toda la info disponible").

     History, and it says so: each line carries its year and division, and a
     Worlds keeps the regulation it was played in. */
  var pod = podiumFor(p.name);
  if (pod.length) {
    var wrap = el("div");
    wrap.style.marginBottom = "10px";
    var tog = el("button", "btn sm fold");
    tog.setAttribute("aria-expanded", "false");
    tog.textContent = "Worlds — " + pod.length + " top-8 set" +
                      (pod.length === 1 ? "" : "s");
    var host = el("div");
    host.hidden = true;
    tog.onclick = function(){
      var open = host.hidden;
      host.hidden = !open;
      tog.setAttribute("aria-expanded", open ? "true" : "false");
    };
    wrap.appendChild(tog);
    host.appendChild(el("p", "sub",
      "Frozen history — each World Championship keeps the regulation it " +
      "was played in. The three divisions are separate metagames and are " +
      "never pooled, so each set says which it came from."));
    pod.forEach(function(e){
      var card = el("div", "note");
      card.style.marginBottom = "6px";
      var head = el("div", "rname");
      var place = e.r === 1 ? "1st" : e.r === 2 ? "2nd"
                : e.r === 3 ? "3rd" : e.r + "th";
      head.appendChild(el("span", "tag" + (e.r <= 3 ? " gold" : ""),
                          "Worlds " + e.y + " · " + e.d + " · " + place));
      if (e.who) head.appendChild(document.createTextNode(e.who));
      if (e.rec) head.appendChild(el("span", "tag", e.rec));
      card.appendChild(head);
      card.appendChild(factLine([
        e.it ? e.it : "no item recorded",
        e.ab ? e.ab : null,
        e.na ? e.na : null]));
      /* THE STONE SAYS IT MEGA EVOLVED, AND SAYS INTO WHAT. The ability
         above is the BASE one - that is what a teamlist records and it is
         correct, because it is the ability the Pokemon actually has until
         it evolves. A Mega has exactly one ability, so the stone settles
         what it becomes; that is derived rather than left to be worked out
         (player, 2026-09-15: "esa se sabe por descarte"). */
      if (e.mg) {
        var mg = el("div", "st");
        mg.style.color = "var(--mega)";
        mg.textContent = "Mega Evolves into " + e.mg +
          (e.mgab ? " — ability becomes " + e.mgab : "");
        card.appendChild(mg);
      }
      var mv = el("div", "rmeta");
      (e.mv || []).forEach(function(n){
        var mm2 = MOVE_BY[n];
        var chip = el("span", "tag", n);
        if (mm2) chip.title = catName(mm2.cat) + " · " +
          (mm2.bp ? mm2.bp + " BP" : "— BP") + " · " +
          (mm2.acc == null ? "—" : mm2.acc) + " acc";
        mv.appendChild(chip);
      });
      if ((e.mv || []).length) card.appendChild(mv);
      host.appendChild(card);
    });
    wrap.appendChild(host);
    body.appendChild(wrap);
  }

  if (ls && FIND.moves.length) {
    body.appendChild(el("h2", null, "The moves you asked for"));
    var l = el("div", "list");
    FIND.moves.forEach(function(n){
      var mv = MOVE_BY[n];
      if (mv) l.appendChild(moveRowFor(mv, p.ab || [], p));
    });
    body.appendChild(l);
  }
  if (ls) {
    /* The movepool was the top 40 by base power with every status move
       dropped, so Protect and Trick Room were not in a Pokemon's own sheet
       at all. It runs the same controls as the build editor and the search
       now - one implementation, so searching inside one Pokemon's pool works
       the way searching anywhere else does. */
    body.appendChild(el("h2", null, "Movepool"));
    var ui = moveFilters(body, ls, function(){ drawPool(); },
                         "Filter " + ls.length + " moves it learns",
                         /* the whole pool, and its own usage numbers - this
                            is the same question the build editor asks, so
                            it gets the same answer */
                         {cap: 200, usageOf: p.name});
    var pool = el("div", "list");
    body.appendChild(pool);
    function drawPool(){
      var hits = ui.apply();
      pool.innerHTML = "";
      hits.forEach(function(m){
        pool.appendChild(moveRowFor(m, p.ab || [], p));
      });
      if (!hits.length)
        pool.appendChild(el("div", "empty", "Nothing matches"));
    }
    drawPool();
  } else if (p.outside) {
    /* A SPECIES CHAMPIONS DOES NOT HAVE STILL KNOWS THINGS. Its movepool is
       not in learnsets.json - nothing of ours covers it - so it comes from
       the same PokeAPI tables its stats do, fetched only when a sheet like
       this one is opened. The section says where it came from, because these
       are main-series moves on a main-series Pokemon and must never read as
       Champions data. */
    body.appendChild(el("h2", null, "Movepool"));
    var host = el("div");
    body.appendChild(host);
    host.appendChild(el("div", "st", "Loading what it knows..."));
    loadOutside(function(){
      host.innerHTML = "";
      var got = outsideMovesFor(p.name);
      if (!got) {
        host.appendChild(el("div", "st",
          "No movepool on record for " + p.name + " — there is no "
          + "Champions page for it and nothing upstream either."));
        return;
      }
      /* THE WHOLE MOVEPOOL, not the half the app happens to ship. A move
         Champions has DISABLED still has a full Champions row - type,
         category, base power, accuracy, PP - it is simply not sent to the
         phone, because the pickers draw from that list and a build made of a
         disabled move would be an illegal build the app helped write. Here
         they are wanted, and they carry a tag saying which they are. */
      var off = 0;
      var pool = got.map(function(n){
        var m = MOVE_BY[n];
        if (m) return m;
        var o = outsideMove(n);
        if (o) off++;
        return o;
      }).filter(Boolean);
      host.appendChild(el("p", "sub",
        "Which moves it learns is main-series — Champions publishes no "
        + "page for a species it does not have. What each one DOES is "
        + "Champions' own row for that move."
        + (off ? " " + off + " of them are moves Champions has in its database "
           + "but has not enabled; they are marked." : "")));
      var ui2 = moveFilters(host, pool, function(){ drawOut(); },
                            "Filter " + pool.length + " moves it learns",
                            {cap: 200});
      var list2 = el("div", "list");
      host.appendChild(list2);
      function drawOut(){
        var hits = ui2.apply();
        list2.innerHTML = "";
        hits.forEach(function(m){
          list2.appendChild(moveRowFor(m, p.ab || [], p));
        });
        if (!hits.length)
          list2.appendChild(el("div", "empty", "Nothing matches"));
      }
      drawOut();
    });
  }

  /* WHAT SMOGON WROTE. Last, and folded, because it is long and the 407 KB
     behind it is not fetched until it is opened. The box sheet had it and the
     search view did not, which meant the one place built for reading about a
     Pokemon was the one place that would not show you the prose. */
  var aw = el("div");
  aw.style.marginTop = "10px";
  var atog = el("button", "btn sm fold");
  atog.setAttribute("aria-expanded", "false");
  var ahost = el("div");
  ahost.hidden = true;
  atog.textContent = "What Smogon says about " + p.name;
  atog.onclick = function(){
    var open = ahost.hidden;
    ahost.hidden = !open;
    atog.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && !ahost._drawn) { ahost._drawn = 1; analysisPanel(p.name, ahost); }
  };
  aw.appendChild(atog);
  aw.appendChild(ahost);
  body.appendChild(aw);
}

/* The search view's door: the species, not a copy of it, so no shiny and no
   ownership block between the two halves. */
function findDetail(p){
  openSheet(p.name, function(body){
    pokeHead(body, p, {});
    pokeBody(body, p, {});
  }, []);
}

/* --------------------------------------------------- spread, and the ally --
   Two facts that decide games in doubles and are easy to miss on a phone:
   a spread move deals x0.75 while both targets are up, and fourteen of them
   land on your own partner as well - which the player's own rule says not to
   run unless the ally is immune or absorbs it.

   Neither flag is read off Serebii's target field. It spells one thing four
   ways and gets three moves wrong outright, so build_ability_moves.py resolves
   both against Smogon's engine target column: Burning Jealousy really is a
   spread move, Corrosive Gas strips your own ally's item, and Psyshield Bash
   is a single-target attack however "Ally" reads.

   There is no hover on a phone, so the badge says it and the line under it
   says it again in full. */
function spreadTags(m, host){
  if (m.spread) host.appendChild(el("span", "tag warn", "spread"));
  if (m.hitsAlly) host.appendChild(el("span", "tag bad", "hits ally"));
  multiHitTag(m, host);
}
/* MULTI-HIT, WITH THE TOTAL. 14 moves in Champions hit more than once, and the
   BP column shows one hit of them - Bullet Seed reads 25 BP next to Seed Bomb's
   80 and loses, when it is really 75 across three hits and 125 with Skill Link.
   A row that does not say so is comparing the wrong numbers, which is why the
   player asked for the tag (2026-09-15: "falta que los movimientos tengan tag
   de si son multi-hit").

   Three shapes, and they are genuinely different moves:
     fixed     Dragon Darts always twice - the total is just n x BP
     2 to 5    quoted at THREE hits, the repo's own convention, and Skill Link
               replaces the range with a flat five (and one accuracy roll for
               the whole move, so it is all-or-nothing)
     1 to 10   Population Bomb, where "the attack ends if the user misses"
               makes the 1 a miss rather than a hit count */
function multiHitTag(m, host){
  var h = m.hits;
  if (!h || !h.length) return;
  var lo = h[0], hi = h.length > 1 ? h[1] : h[0];
  var fixed = lo === hi;
  var typical = fixed ? lo : (lo === 2 && hi === 5 ? 3 : lo);
  var t = el("span", "tag ok",
              fixed ? "×" + lo + " hits" : lo + "–" + hi + " hits");
  var bits = [];
  if (m.bp) {
    bits.push(fixed ? lo + " × " + m.bp + " BP = " + (lo * m.bp)
                    : "quoted at " + typical + " hits = " +
                      (typical * m.bp) + " BP");
    if (!fixed && lo === 2 && hi === 5)
      bits.push("Skill Link forces 5 = " + (5 * m.bp) +
                " BP, on one accuracy roll for the whole move");
  }
  t.title = bits.join(" · ") || "Hits more than once";
  host.appendChild(t);
}
/* Priority, with its NUMBER. Filtering a movepool by "priority" and getting
   back rows that do not say how much is no answer: +1 and +2 are a different
   move in doubles, and the whole point of Fake Out over Quick Attack is the
   extra stage. Negative priority is shown for the same reason - Vital Throw
   and Dragon Tail moving last is a fact about the turn, not a footnote. The
   move picker already did this for +N; the Pokemon's own sheet did not, which
   is where the player was looking (2026-09-12). */
function priorityTag(m, host){
  if (!m.pri) return;
  var cls = m.pri > 0 ? "tag ok" : "tag bad";
  var t = el("span", cls, "priority " + (m.pri > 0 ? "+" : "") + m.pri);
  t.title = m.pri > 0
    ? "Goes before any move of lower priority, whatever the Speed"
    : "Goes after every move of higher priority, whatever the Speed";
  host.appendChild(t);
}
/* The item that exists for this move. Only the SPECIFIC ones are indexed -
   Life Orb rides on all 334 attacks and would badge every row with noise -
   so a tag here means "this item was made for this move": Heat Rock on Sunny
   Day, Light Clay on Reflect, Big Root on Giga Drain. */
function itemTags(m, host){
  ((C.ITEM_FOR_MOVE || {})[m.name] || []).forEach(function(p){
    /* WHICH WAY THE TAG POINTS. Heat Rock on Sunny Day is a reason to run the
       move; Aspear Berry on Ice Beam is the reason it will not work, because
       the target thaws and the freeze was the whole point. Both read as the
       same grey chip, so the row said "these items are related" and left which
       way to be worked out (player, 2026-09-18). The side is decided in
       scripts/build_item_links.py, from the reason the link was made for. */
    var t = el("span", "tag" + (p[1] === "against" ? " bad" : ""), p[0]);
    t.title = p[1] === "against"
      ? p[0] + " answers this move"
      : p[0] + " is an item made for this move";
    host.appendChild(t);
  });
}

/* WHAT TURNS THIS MOVE OFF. A defensive ability badges nothing on a move row
   as a rule, and that is right while the alternative is all 67 of them - Fire
   Lash would carry 32 grey chips. These are the narrow class the player asked
   for and named exactly: the ones that make the move do NOTHING.

     "si viese zap cannon en algun pokemon como raichu, y veo que tiene el tag
      bulletproof, sabria que ese move es bloqueado por esa habilidad"

   Zap Cannon comes back Bulletproof, Lightning Rod, Motor Drive, Volt Absorb;
   Fire Lash comes back empty, because Big Pecks only eats its Defence drop and
   that is not the move being blocked. Which is which is derived in
   scripts/build_ability_moves.py, never listed here. */
function blockerTags(m, host){
  var AB = C.AB_MOVES || {};
  Object.keys(AB).forEach(function(a){
    var st = AB[a].stop;
    if (!st || st.indexOf(m.i) < 0) return;
    var t = el("span", "tag bad", a);
    t.title = a + ": " + AB[a].why;
    host.appendChild(t);
  });
}
function spreadNote(m){
  return (m.spread ? "  ·  " + (m.cat === "T" ? "hits both opponents"
            : "spread ×0.75 while both targets are up, full power with one")
          : "") +
         (m.hitsAlly ? "  ·  lands on your own ally too" : "");
}

/* ------------------------------------------------ finding one move fast ---
   The search box, the sort and the filter chips that sit above a move list.
   It lives here, once, because the build editor and the search view ask the
   same question and used to answer it differently - the editor had a sort and
   the search view had nothing at all.

   Everything stacks: the sort is one choice, each filter group ANDs with the
   others, and the chips inside one group OR together. `apply()` hands back the
   pool the chips describe; the caller draws its own rows, because the editor
   badges abilities and effective BP and the search view does not. */
function moveScore(m){ return (m.bp || 0) * Math.min(100, m.acc || 100) / 100; }

function moveFilters(body, pool, onChange, placeholder, opts){
  /* `usageOf` is a Pokemon name, and it is what turns this from "rank the
     movepool by raw power" into "rank it by what its players actually bring".
     Only the build editor passes one - the Find tab lists moves with no
     Pokemon in hand, so there is nothing to be a share OF there - and when it
     does, usage is the DEFAULT sort, because that is the first question asked
     of a movepool (player, 2026-09-15: "seria bueno poner filtro a los
     movimientos de mayor a menor uso por el %"). */
  var usageOf = (opts || {}).usageOf || null;
  /* THE CAP LIVES HERE, WITH THE COUNT THAT REPORTS IT. Every caller used to
     slice the result itself and this told the user a different number: the
     count line said "first 80 shown" while a Pokemon's own sheet was slicing
     at 60. Half the dex - 131 of the 264 learnsets are longer than 60 - had
     its movepool quietly truncated with nothing on screen saying so, which is
     what the player hit on Rillaboom (67 moves, 60 shown). `apply()` returns
     the list already capped, so the two cannot disagree again.

     A single Pokemon's movepool is not capped in practice: the longest in
     Champions is Gallade at 106. The default 80 is for the whole move table,
     where 512 rows really is too many to draw. */
  var cap = (opts || {}).cap || 80;
  var sorter = {v: usageOf ? "usage" : "bp"};
  var F = {cat:{}, trait:{}, type:{}};
  function label(t){
    var d = el("div", "sub"); d.style.margin = "0 0 4px"; d.textContent = t;
    return d;
  }
  var wrap = el("div", "search field");
  wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var inp = el("input"); inp.type = "text";
  inp.placeholder = placeholder || ("Filter " + pool.length + " moves");
  wrap.appendChild(inp);
  body.appendChild(wrap);
  inp.oninput = function(){ onChange(); };

  var srow = el("div", "toggles"); srow.style.marginBottom = "8px";
  var sorts = [["bp","BP × acc"],["name","A–Z"],["pp","PP"],["type","Type"]];
  if (usageOf) sorts.unshift(["usage","Usage %"]);
  sorts.forEach(function(o){
    var t = el("button", "tog", o[1]);
    t.setAttribute("aria-pressed", o[0] === sorter.v ? "true" : "false");
    t.onclick = function(){
      sorter.v = o[0];
      Array.prototype.forEach.call(srow.children, function(x){
        x.setAttribute("aria-pressed", x === t ? "true" : "false");
      });
      onChange();
    };
    srow.appendChild(t);
  });
  body.appendChild(label("Sort"));
  body.appendChild(srow);

  /* one filter chip. A type chip carries its own type colour, because that is
     how the rest of the page names a type. */
  /* `type` is a TYPE NAME, not a colour: the fill and the ink both come from
     typeSkin, which is the only thing that knows a type is two-toned and which
     of the eighteen are written in black. Passing a bare colour here is what
     let this one write #fff next to it. */
  /* THREE STATES, NOT TWO: off, include, EXCLUDE.

       "en el filtro de tipo esta el operador logico and y or, pero falta algo
        que diga no, por ejemplo, si pongo en move trick room, pero en type
        quiero colocar que no me muestre ningun pokemon de tipo psyquico, no
        existe esa opcion."  (player, 2026-09-19)

     A tap cycles off -> include -> exclude -> off, and an excluded chip is
     drawn struck through with a minus, because it has to read as the opposite
     of the chip beside it rather than as a second shade of on.

     It also answers the one thing the category group loses by going exclusive
     below: "physical or special" is "NOT status". */
  var EXCL = {};                       // group -> key -> the chip node
  function chip(row, group, key, text, type){
    var t = el("button", "tog", text);
    t.setAttribute("aria-pressed", "false");
    if (type) typeSkin(t, type, false);
    (EXCL[group] = EXCL[group] || {})[key] = t;
    function paint(v){
      t.setAttribute("aria-pressed", v === 1 ? "true" : "false");
      t.classList.toggle("no", v === -1);
      t.textContent = (v === -1 ? "− " : "") + text;
      if (type) {
        typeSkin(t, type, v === 1);
        /* typeSkin keeps the type's colour on the border even when it is off,
           which is right for an unpicked chip and wrong for a ruled-out one:
           the border is the only thing left saying "this is a Psychic chip"
           when the whole point is that Psychic is being refused. */
        if (v === -1) t.style.borderColor = "";
      }
    }
    t._paint = paint;
    t.onclick = function(){
      var was = F[group][key] || 0;
      var now = was === 0 ? 1 : was === 1 ? -1 : 0;
      if (now) F[group][key] = now; else delete F[group][key];
      /* A MOVE HAS EXACTLY ONE CATEGORY, so two of them included at once can
         only ever mean "either", and the player read the group as an AND and
         expected picking one to drop the other (2026-09-19: "seleccionar una
         desactiva la otra... un move solo puede tener 1 de las 3 categorias").
         Includes are exclusive here; excludes still stack, which is what keeps
         "not status" and "neither status nor physical" sayable. */
      if (group === "cat" && now === 1) {
        Object.keys(EXCL.cat).forEach(function(k){
          if (k !== key && F.cat[k] === 1) {
            delete F.cat[k];
            EXCL.cat[k]._paint(0);
          }
        });
      }
      paint(now);
      onChange();
    };
    row.appendChild(t);
  }
  /* Two groups, two meanings, and the headers say which. A move cannot be
     Physical AND Special, or Fire AND Water, so those chips can only ever mean
     "any of these". A move CAN be spread and hit your ally at once, so those
     mean "all of these" - picking Spread and Priority asks for a move that is
     both, and being told there is no such move (0 of 514) is the answer to
     that question, not a filter that failed. */
  var crow = el("div", "toggles"); crow.style.marginBottom = "8px";
  chip(crow, "cat", "P", "Physical");
  chip(crow, "cat", "S", "Special");
  chip(crow, "cat", "T", "Status");
  body.appendChild(label("Category — one at a time, or − to rule out"));
  body.appendChild(crow);

  var mrow = el("div", "toggles"); mrow.style.marginBottom = "8px";
  chip(mrow, "trait", "spread", "Spread");
  chip(mrow, "trait", "ally", "Hits ally");
  chip(mrow, "trait", "pri", "Priority");
  body.appendChild(label("Must have — all of these, or − to rule out"));
  body.appendChild(mrow);

  var types = [];
  pool.forEach(function(m){ if (types.indexOf(m.type) < 0) types.push(m.type); });
  types.sort();
  if (types.length > 1) {
    var trow = el("div", "toggles"); trow.style.marginBottom = "10px";
    types.forEach(function(ty){ chip(trow, "type", ty, ty, ty); });
    body.appendChild(label("Type — any of these, or − to rule out"));
    body.appendChild(trow);
  }
  var count = label("");
  count.style.margin = "0 0 6px";
  body.appendChild(count);

  function apply(){
    var q = inp.value.trim().toLowerCase();
    var cats = Object.keys(F.cat), tys = Object.keys(F.type),
        trs = Object.keys(F.trait);
    var hits = pool.filter(function(m){
      /* the text is searched as well as the name, because "which of these
         burns" and "which crit" are the questions a move list is opened for */
      if (q && m.name.toLowerCase().indexOf(q) < 0 &&
          m.type.toLowerCase().indexOf(q) < 0 &&
          (m.text || "").toLowerCase().indexOf(q) < 0) return false;
      /* An EXCLUDE is checked before an include, and on its own: "no Psychic"
         has to work with nothing else picked, which it cannot do if an empty
         include list is read as "everything is rejected". */
      if (F.cat[m.cat] === -1) return false;
      if (F.type[m.type] === -1) return false;
      var inCat = cats.filter(function(k){ return F.cat[k] === 1; });
      var inTy = tys.filter(function(k){ return F.type[k] === 1; });
      if (inCat.length && inCat.indexOf(m.cat) < 0) return false;
      if (inTy.length && inTy.indexOf(m.type) < 0) return false;
      var has = function(k){
        return k === "spread" ? !!m.spread
             : k === "ally" ? !!m.hitsAlly
             : (m.pri || 0) > 0;
      };
      if (trs.some(function(k){ return F.trait[k] === -1 && has(k); }))
        return false;
      var inTr = trs.filter(function(k){ return F.trait[k] === 1; });
      if (inTr.length && !inTr.every(has)) return false;
      return true;
    });
    hits.sort(function(a, b){
      if (sorter.v === "usage") {
        /* A move nobody brought sorts below one at 0.1%, and both sort below
           silence - a Pokemon with no table at all gets -1 for everything, so
           the list falls back to power rather than to alphabetical noise. */
        var ua = splitPct(usageOf, "m", a.name);
        var ub = splitPct(usageOf, "m", b.name);
        if (ua == null && ub == null) return moveScore(b) - moveScore(a) ||
                                             a.name.localeCompare(b.name);
        return (ub == null ? -1 : ub) - (ua == null ? -1 : ua) ||
               moveScore(b) - moveScore(a) || a.name.localeCompare(b.name);
      }
      if (sorter.v === "name") return a.name.localeCompare(b.name);
      if (sorter.v === "pp")
        return (b.pp || 0) - (a.pp || 0) || a.name.localeCompare(b.name);
      if (sorter.v === "type")
        return a.type.localeCompare(b.type) || moveScore(b) - moveScore(a) ||
               a.name.localeCompare(b.name);
      return moveScore(b) - moveScore(a) || a.name.localeCompare(b.name);
    });
    count.textContent = hits.length === pool.length
      ? pool.length + " moves"
      : hits.length + " of " + pool.length + " moves";
    if (hits.length > cap)
      count.textContent += " · first " + cap + " shown";
    return hits.slice(0, cap);
  }
  return {apply:apply, input:inp};
}

/* A META LINE THAT BREAKS BETWEEN FACTS AND NEVER INSIDE ONE.

   "Physical · 40 BP · 100 acc · 12 PP · 40 effective" as one text node lets a
   phone wrap it wherever a space happens to fall, so "100" ends a line and
   "acc" starts the next, or a separator dot is orphaned in the left margin.
   Each fact is its own nowrap span and the dot between them is drawn by CSS,
   which means the only place a wrap can happen is a join.

   Falsy parts are dropped, so a caller can pass a conditional straight in
   rather than assembling a string with the separators in it - which is what
   every one of these did, three times over, with slightly different spacing. */
function factLine(parts){
  var box = el("div", "rmeta");
  parts.filter(Boolean).forEach(function(t){
    box.appendChild(el("span", "mono fact", t));
  });
  return box;
}

/* one move row, badged with whatever ability of this Pokemon touches it.

   `ability` takes a single name (the build editor, where one ability is
   chosen) or the whole list (a dex sheet, where none is). It used to take
   `p.ab[0]` even on the sheet, so Conkeldurr - Guts, Sheer Force, Iron Fist -
   only ever answered for Guts, and the two that actually pick out moves were
   invisible. Every ability that hits is badged now, by name, because the
   question is "which moves, and with WHICH ability". They are alternatives,
   never at once: a Pokemon has one ability per battle.

   THIS ROW AND THE BUILD PICKER'S ARE THE SAME ROW, and they have to stay
   that way. A Pokemon's moves are shown in exactly two places - the builder
   and the search - and they had drifted: the picker gained the usage share,
   the effective number and the target, and this one did not, so the same move
   read differently depending on which screen you were on (player, 2026-09-15:
   "la ficha de moves cambio en build y la de find igual deberia conservar los
   mismos cambios para que se entienda de la misma forma en ambas partes").
   Anything added to one belongs in the other. */
function moveRowFor(m, ability, poke){
  var abils = ability == null ? []
            : (typeof ability === "string" ? [ability] : ability.slice());
  var r = el("div", "row");
  var mm = el("div", "rmain");
  var h = el("div", "rname");
  h.appendChild(typeChip(m.type));
  h.appendChild(document.createTextNode(m.name));
  /* A move Champions carries but has not enabled. It is shown - the whole
     movepool is the point on a sheet for a species the game has not added -
     and it says plainly that it cannot be used, so nothing here ever reads as
     something you could build with. */
  if (m.notInChampions) {
    var ni = el("span", "tag bad", "not in Champions");
    ni.title = "Champions has a row for this move but no Pokemon it allows can "
             + "use it. It becomes playable if the game enables it.";
    h.appendChild(ni);
  }
  priorityTag(m, h); spreadTags(m, h); itemTags(m, h);
  blockerTags(m, h);
  var hits = [];
  abils.forEach(function(a){
    var hit = abilityHit(a, m, poke);
    if (!hit) return;
    var tag = abilityTag(a, m, poke);          // keeps the Adaptability filter
    if (!tag) return;
    h.appendChild(tag);
    hits.push({ability:a, hit:hit});
  });
  /* How many of THIS Pokemon's players ran it - the same chip the builder
     shows, on the same terms. Only where there IS a Pokemon: the "+ Move"
     sheet searches the whole table with nobody in hand, and a share needs
     something to be a share of. */
  if (poke && poke.name) {
    var utag = usageTag(splitPct(poke.name, "m", m.name), poke.name, "m");
    if (utag) h.appendChild(utag);
  }
  mm.appendChild(h);
  var facts = [catName(m.cat),
               m.bp ? m.bp + " BP" : "— BP",
               (m.acc == null ? "—" : m.acc) + " acc",
               (m.pp == null ? "—" : m.pp) + " PP",
               /* BP x accuracy, which is how this project ranks moves - and
                  the number the picker sorts on by default */
               m.bp ? Math.round(moveScore(m)) + " effective" : null];
  /* THE SPREAD SENTENCE IS PROSE, NOT A FACT, and it has to go somewhere that
     can wrap. A `.fact` is `white-space:nowrap` so that "100 acc" never breaks
     between the number and the unit; "spread x0.75 while both targets are up,
     full power with one" inside one is 413px wide on a 360px screen and runs
     straight off the edge. The "spread" chip on the name already flags it;
     the explanation goes below, where a line break is allowed. */
  var spread = spreadNote(m).replace(/^\s*·\s*/, "").trim();
  hits.forEach(function(x){
    if (x.hit.x && m.bp)
      facts.push(Math.round(m.bp * x.hit.x) + " BP with " + x.ability);
  });
  facts.push(m.target);
  mm.appendChild(factLine(facts));
  if (spread) {
    var sp = el("div", "st", spread.replace(/\s*·\s*/g, " · "));
    sp.style.color = "var(--warn)";
    mm.appendChild(sp);
  }
  if (m.text) mm.appendChild(el("div", "st", m.text));
  hits.forEach(function(x){
    var w = el("div", "st");
    w.style.color = "var(--accent)";
    // name it when there is more than one, or the two reasons run together
    w.textContent = (hits.length > 1 ? x.ability + ": " : "") + x.hit.why;
    mm.appendChild(w);
  });
  r.appendChild(mm);
  return r;
}

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
        return FIND.moves.indexOf(m.name) < 0;
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
          if (m.text) mm.appendChild(el("div", "st", m.text));
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
      Object.keys(live).sort().forEach(function(ty){
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
          var on = FIND.types.indexOf(ty) >= 0;
          var no = FIND.notTypes.indexOf(ty) >= 0;
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
      var wrap = el("div", "search field");
      wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
      var inp = el("input"); inp.type = "text"; inp.placeholder = "Ability";
      wrap.appendChild(inp);
      body.appendChild(wrap);
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
      var all = Object.keys(C.ABIL).sort();
      function draw(){
        var q = inp.value.trim().toLowerCase();
        var ks = Object.keys(pick);
        var hits = all.filter(function(a){
          if (q && a.toLowerCase().indexOf(q) < 0 &&
              (C.ABIL[a] || "").toLowerCase().indexOf(q) < 0) return false;
          if (ks.length && ks.indexOf(CLS[a] || "other") < 0) return false;
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
            "tag " + (k === "moves-off" ? "ok" : k === "moves-def" ? "warn" : ""),
            CLSL[k] || k));
          ((C.ITEM_FOR_ABILITY || {})[a] || []).forEach(function(it){
            h.appendChild(el("span", "tag", it));
          });
          mm.appendChild(h);
          /* The WHOLE text. Clicking this row sets the filter and closes the
             sheet - it does not open the ability anywhere - so 110 characters
             was the only place the description appeared, cut mid-sentence and
             without even an ellipsis to admit it. */
          mm.appendChild(el("div", "st", C.ABIL[a] || ""));
          r.appendChild(mm);
          r.onclick = function(){ FIND.ability = a; closeSheet(); findDraw(); };
          list.appendChild(r);
        });
        if (!hits.length) list.appendChild(el("div", "empty", "Nothing matches"));
      }
      inp.oninput = draw;
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
      var m = b.getAttribute("data-mode");
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
    var arrow = o[0] === "dex" ? ""
              : FIND.dir === "asc" ? " ↑" : " ↓";
    var t = el("button", "tog", o[1] + (on ? arrow : ""));
    t.setAttribute("aria-pressed", on ? "true" : "false");
    t.title = o[0] === "dex" ? "Dex order"
      : on ? "Tap again for " +
             (FIND.dir === "asc" ? "highest first" : "lowest first")
      : "Rank by " + o[1] + ", highest first";
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

/* ----------------------------------------------------------------- worlds --
   Every World Championship pokedata publishes, as HISTORY.

   The distinction is the whole point and the app has to keep saying it: a
   Worlds is played once, under one regulation, and then frozen. 2026 was M-B.
   Quoting any of it as what is popular now is the mistake this block exists
   to prevent, so the year carries its format and the lede says "frozen".

   THE THREE DIVISIONS ARE NEVER POOLED. Masters, Seniors and Juniors run the
   same roster and are three different metagames - Incineroar is 41% of the
   Masters teams and 26% of the Juniors' - so they are tabs and there is no
   "all" option. Masters leads because that is the division he enters.

   Counted per TEAM, not per appearance: under the Species Clause a team holds
   a species at most once, so "52.8%" is 208 of 394 teams and not 208 slots. */
var WORLD = {year: null, div: "masters"};

function worldInit(){
  var years = C.WORLDS || [];
  var yrow = $("worldYear"); yrow.innerHTML = "";
  $("worldOut").innerHTML = "";
  if (!years.length) {
    $("worldOut").appendChild(el("div", "empty",
      "No Worlds archive in this build."));
    return;
  }
  WORLD.year = years[0].y;
  years.forEach(function(r){
    var t = el("button", "tog", String(r.y));
    t.setAttribute("aria-pressed", r.y === WORLD.year ? "true" : "false");
    t.onclick = function(){
      WORLD.year = r.y;
      Array.prototype.forEach.call(yrow.children, function(x){
        x.setAttribute("aria-pressed", x === t ? "true" : "false");
      });
      worldDraw();
    };
    yrow.appendChild(t);
  });
  var drow = $("worldDiv"); drow.innerHTML = "";
  [["masters","Masters"],["seniors","Seniors"],["juniors","Juniors"]]
    .forEach(function(o){
      var t = el("button", "tog", o[1]);
      t.setAttribute("aria-pressed", o[0] === WORLD.div ? "true" : "false");
      t.onclick = function(){
        WORLD.div = o[0];
        Array.prototype.forEach.call(drow.children, function(x){
          x.setAttribute("aria-pressed", x === t ? "true" : "false");
        });
        worldDraw();
      };
      drow.appendChild(t);
    });
  worldDraw();
}

function worldDraw(){
  var out = $("worldOut");
  if (!out) return;
  out.innerHTML = "";
  var yr = (C.WORLDS || []).filter(function(r){ return r.y === WORLD.year; })[0];
  var d = yr && yr.d[WORLD.div];
  if (!d) {
    out.appendChild(el("div", "empty",
      "pokedata published no " + WORLD.div + " teamlists for " + WORLD.year +
      " — standings only, upstream."));
    return;
  }
  var own = ownedNames();
  var head = el("p", "sub");
  head.textContent = "Worlds " + WORLD.year + " " + WORLD.div + " · " + d.n +
    " teams · the " + d.top.length + " most brought";
  out.appendChild(head);
  var list = el("div", "cards");
  d.top.forEach(function(row, i){
    var name = row[0], teams = row[1], pct = row[2];
    /* anyRow, not byName. A Worlds list is HISTORY: 53 of the names across the
       four championships are not in the Champions dex - the 2025 field was
       full of Calyrex and Koraidon - and every one of them drew a bare name
       with no types, no stats, no BST and no sheet behind it. They have all
       three now, off the same HOME_DEX the box uses, and the sheet says where
       the numbers came from (player, 2026-09-18: "necesito que todos si tengan
       esa informacion"). */
    var p = anyRow(name);
    var mine = (name in own) || (p && p.species in own);
    /* The Worlds list is Pokemon too, so it reads like the rest of the app -
       the player asked for the card everywhere, not only in the search. */
    /* Two numbers, so two cells. "24.6% - 97 of 394 teams" is a sentence you
       read; a share and a count side by side are numbers you scan down the
       column, which is the only way a ranking gets used. */
    var cells = [
      labelBox(pct + "%", "of teams"),
      labelBox(teams + " / " + d.n, "brought it")
    ];
    var title = teams + " of the " + d.n + " " + WORLD.div +
      " teams at Worlds " + WORLD.year + " carried " + name +
      ". One per team - the Species Clause allows no second copy.";
    var r;
    if (p) {
      r = pokeCard(p, {
        cls: mine ? "perm" : "",
        name: name,
        cells: cells,
        pre: function(h){ h.appendChild(el("span", "mono", "#" + (i + 1) + "  ")); },
        badges: function(h){
          if (mine) h.appendChild(el("span", "tag ok", "yours"));
        },
        onclick: function(){ findDetail(p); }
      });
      var cl = r.querySelector(".cardline");
      if (cl) cl.title = title;
    } else {
      /* a name with no row in any dex - it still holds its place in the
         ranking rather than disappearing from it */
      r = el("button", "row");
      var m = el("div", "rmain");
      var h = el("div", "rname");
      h.appendChild(el("span", "mono", "#" + (i + 1) + "  "));
      h.appendChild(document.createTextNode(name));
      m.appendChild(h);
      var cl2 = cardLine(cells);
      cl2.title = title;
      m.appendChild(cl2);
      r.appendChild(m);
    }
    list.appendChild(r);
  });
  out.appendChild(list);
}

/* ------------------------------------------------------------ diagnostics --
   "It does not work on my phone" is not something to guess at from a desktop
   browser that works. This reports what the page can actually see, on the
   device where it is failing, without needing a console. */
var BOOT_ERRORS = [];
window.addEventListener("error", function(e){
  BOOT_ERRORS.push((e.message || "error") +
    (e.filename ? "  @" + String(e.filename).split("/").pop() : "") +
    (e.lineno ? ":" + e.lineno : ""));
  showBootError();
});
window.addEventListener("unhandledrejection", function(e){
  BOOT_ERRORS.push("unhandled: " + ((e.reason && e.reason.message) || e.reason));
  showBootError();
});

/* an error that only reaches the console is invisible on a phone */
function showBootError(){
  var bar = document.getElementById("bootErr");
  if (!bar) return;
  bar.hidden = false;
  bar.textContent = BOOT_ERRORS.length + " script error" +
    (BOOT_ERRORS.length === 1 ? "" : "s") + " - open Trainer > Diagnostics";
}

/* The newest write across the three tables. A save that failed silently shows
   up here as a date that stopped moving. */
function lastWrite(){
  var best = "";
  [S.box, S.builds, S.teams, S.meta].forEach(function(t){
    Object.keys(t || {}).forEach(function(k){
      var v = t[k] && (t[k].updated_at || t[k].updated);
      if (v && String(v) > best) best = String(v);
    });
  });
  return best ? best.slice(0, 16).replace("T", " ") : "never";
}

/* Filled in by checking the deployed page's own build stamp. Starts as a
   question rather than a claim, because until the fetch answers we do not
   know - and a diagnostic that guesses is worse than one that says so. */
var DIAG_LATEST = "checking…";
function checkLatest(){
  /* Guarded for the same reason matchMedia is: this runs inside the startup
     redraw, and an optional capability that is missing must degrade, never
     throw. An unguarded fetch() here reproduced the exact bug fixed hours
     earlier - a ReferenceError that aborted the rest of the load. */
  if (typeof fetch !== "function") { DIAG_LATEST = "cannot check here"; return; }
  fetch(location.pathname + "?probe=" + Date.now(), {cache:"no-store"})
    .then(function(r){ return r.ok ? r.text() : null; })
    .then(function(t){
      if (!t) { DIAG_LATEST = "could not check"; return; }
      var m = t.match(/CHAMP_BUILD\s*=\s*['"]([^'"]+)['"]/);
      var live = m ? m[1] : null;
      var mine = window.CHAMP_BUILD || "";
      DIAG_LATEST = !live ? "could not check"
        : live === mine ? "yes, this is the current build"
        : "NO - the server has " + live + ", reload to get it";
    })
    .catch(function(){ DIAG_LATEST = "could not check (offline?)"; })
    .then(function(){ if ($("diagOut") && $("diagOut").children.length) drawDiag(); });
}

function diagLines(){
  var L = [];
  function add(k, v){ L.push([k, v]); }
  add("Page built", (window.CHAMP_BUILD || "unknown"));
  /* Is the page in front of you the one that is deployed? A phone serving a
     cached copy is the nastiest failure here, because nothing looks broken -
     the numbers are just quietly out of date. Compare the build stamp baked
     into this file against the one the server is handing out right now. */
  add("Latest deployed", DIAG_LATEST);
  /* What the reference data describes, so a wrong number can be traced to the
     refresh rather than to the page. */
  add("Regulation", (C && C.REG ? C.REG : "unknown") +
      (C && C.REG_STARTED ? " since " + C.REG_STARTED : ""));
  add("Ladder usage fetched", (C && C.USAGE_AT) || "unknown");
  add("Per-Pokemon splits", (function(){
    var S = window.CHAMP_SPLITS || {};
    var n = Object.keys(S.p || {}).length;
    return n ? n + " Pokemon, " + (S.r || "?") + ", fetched " + (S.f || "?")
             : "absent";
  })());
  /* A truncated download looks like a working page with things missing, so the
     counts are stated and anything at zero is called out. */
  add("Blob integrity", [
        [(C && C.DEX || []).length, "forms"],
        [(C && C.MOVES || []).length, "moves"],
        [Object.keys((C && C.AB_MOVES) || {}).length, "ability rules"],
        [(C && C.STONES || []).length, "stones"],
        [(C && C.ITEMS || []).length, "items"]
      ].map(function(p){ return p[0] + " " + p[1]; }).join(", ") +
      ([(C && C.DEX || []).length, (C && C.MOVES || []).length,
        Object.keys((C && C.AB_MOVES) || {}).length].some(function(n){ return !n; })
        ? "  MISSING" : ""));
  add("Last ledger write", lastWrite());
  add("Browser", navigator.userAgent);
  add("Screen", window.innerWidth + " x " + window.innerHeight +
      " @" + (window.devicePixelRatio || 1) + "x");
  add("Reference data", C && C.DEX ? C.DEX.length + " forms, " +
      (C.MOVES || []).length + " moves" : "MISSING");
  add("Dex numbers", C && C.DEXNO ? Object.keys(C.DEXNO).length : "MISSING");
  add("Smogon engine", engineReady() ? "loaded" : "NOT LOADED");
  add("Supabase client", window.supabase ? "loaded" : "NOT LOADED");
  add("Signed in", S.db ? "yes" : "no");
  add("Rows loaded", Object.keys(S.box).length + " box, " +
      Object.keys(S.builds).length + " builds");
  try {
    localStorage.setItem("__t", "1"); localStorage.removeItem("__t");
    add("Local storage", "works");
  } catch (e) { add("Local storage", "BLOCKED - " + e.name); }
  add("Sort", SORT);
  add("Script errors", BOOT_ERRORS.length ? BOOT_ERRORS.join(" | ") : "none");
  return L;
}

function drawDiag(){
  var host = $("diagOut");
  if (!host) return;
  host.innerHTML = "";
  var dl = el("dl", "kv");
  diagLines().forEach(function(r){
    dl.appendChild(el("dt", null, r[0]));
    var dd = el("dd", null, String(r[1]));
    dd.style.textAlign = "left";
    dd.style.wordBreak = "break-word";
    dd.style.fontSize = "11.5px";
    if (/MISSING|NOT LOADED|BLOCKED/.test(String(r[1]))) dd.style.color = "var(--bad)";
    dl.appendChild(dd);
  });
  host.appendChild(dl);

  var b = el("button", "btn sm", "Copy this");
  b.style.marginTop = "10px";
  b.onclick = function(){
    var txt = diagLines().map(function(r){ return r[0] + ": " + r[1]; }).join("\n");
    try {
      navigator.clipboard.writeText(txt).then(function(){ toast("Copied"); },
        function(){ diagFallback(txt); });
    } catch (e) { diagFallback(txt); }
  };
  host.appendChild(b);

  /* ------------------------------------------- nothing painted on top -----
     The search icon sat on the text you were typing, in all eight search
     boxes, for as long as those boxes had existed - and the only thing that
     ever found it was a person looking at a phone. He asked for the check
     rather than for the one bug: "si es algo bueno entonces seria bueno
     terminarlo... tal vez se nos ocurran mas cosas y queden solapamientos."

     It lives HERE, in diagnostics, and not in the test suite, for a reason
     that is not laziness: jsdom does not lay anything out - every rectangle
     it reports is zero - so a test there would pass while the screen was
     wrong, which is the worst kind of check. Run on the real device, against
     the real layout, it is the measurement that would have caught it.

     SWEPT, NOT COMPARED PAIRWISE. Find lays out thousands of boxes and the
     obvious double loop froze the renderer outright. Sorted by top edge, each
     box is only measured against the ones that start before it ends. */
  var ob = el("button", "btn sm", "Check every screen for overlaps");
  ob.style.marginTop = "8px";
  ob.style.marginLeft = "8px";
  ob.onclick = function(){ overlapReport(host); };
  host.appendChild(ob);
}

function overlapSweep(view){
  var boxes = [], all = view.querySelectorAll("*");
  for (var i = 0; i < all.length; i++) {
    var e = all[i], tag = e.tagName;
    /* An ICON paints without carrying a word, and an icon on top of text is
       the exact bug this exists for - so svg and img count as painted even
       though their textContent is empty. Anything else has to say something
       to be worth colliding with. */
    var isIcon = /^(svg|img)$/i.test(tag);
    /* A FIELD PAINTS ITS VALUE, and `value` is not `textContent`. Without
       this line an <input> was never a box at all - so the sweep could not
       see the one bug it was written for, and said "nothing overlaps" with
       the icon sitting on the text. Caught by planting the bug back and
       watching the tool miss it. */
    var isField = /^(input|textarea|select)$/i.test(tag);
    if (e.children.length && !isIcon) continue;
    if (!isIcon && !isField && !e.textContent.trim()) continue;
    var r = e.getBoundingClientRect();
    if (isField) r = contentBox(e, r);
    if (r.width < 4 || r.height < 4) continue;
    boxes.push({e: e, r: r});
  }
  boxes.sort(function(a, b){ return a.r.top - b.r.top; });
  var hits = [], floats = [];
  for (var i2 = 0; i2 < boxes.length && hits.length < 12; i2++) {
    var A = boxes[i2];
    for (var j = i2 + 1; j < boxes.length; j++) {
      var B = boxes[j];
      if (B.r.top >= A.r.bottom - 1) break;         /* the sweep's whole point */
      if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
      var ox = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      var oy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      /* a two-pixel kiss is layout, not a collision */
      if (ox <= 1 || oy <= 1 || ox * oy < 30) continue;
      var line = label(A.e) + "  over  " + label(B.e) +
                 "  (" + Math.round(ox * oy) + "px²)";
      /* A FLOATING LAYER IS NOT A COLLISION, AND IS NOT HIDDEN EITHER.

         Exactly one of the two is out of the flow - the "+" button that floats
         over the list below 900px, a sheet, a toast - so it is MEANT to be on
         top and the page scrolls out from under it. Counting that as a fault
         put a permanent "1 overlap" on HOME and Builds, and a check that cries
         wolf is a check that gets turned off.

         But it is NOT dropped, because that is how a check goes blind - the
         last time something was quietly excluded here the sweep stopped seeing
         the bug it was written for. It is reported in its own list, so a
         floating layer that really is swallowing something is still visible.

         BOTH out of the flow is a genuine fault: two floating layers fighting
         over the same corner is nobody's design. */
      if (floatingLayer(A.e) !== floatingLayer(B.e)) {
        if (floats.length < 8) floats.push(line);
        continue;
      }
      hits.push(line);
      break;
    }
  }
  return {boxes: boxes.length, hits: hits, floating: floats};

  /* Out of the flow: its own layer, by declaration. Read off the ancestors
     because the painted leaf inherits the positioning of the box that floats -
     the "+" glyph is a plain span inside a fixed button.

     ASKED ONLY WHEN TWO BOXES ACTUALLY TOUCH, never per box. Asking up front
     cost a getComputedStyle per ancestor of all 200 boxes and pushed the sweep
     past its own 150ms budget - the linear-time test caught it on the first
     run. Collisions are rare, so this runs a handful of times. */
  function floatingLayer(e){
    for (var n = e; n && n.nodeType === 1 && n !== view; n = n.parentNode) {
      var pos = window.getComputedStyle(n).position;
      if (pos === "fixed" || pos === "sticky" || pos === "absolute") return true;
    }
    return false;
  }

  /* A FIELD'S BOX INCLUDES ITS PADDING, and the icon lives in that padding ON
     PURPOSE - that is the whole point of the 34px. Compared as border boxes
     the two always intersect, so the sweep called a correct search box broken
     and would have gone on calling it broken after any fix. What matters is
     whether something covers the field's TEXT, so a field is measured by its
     content box. */
  function contentBox(e, r){
    var cs = window.getComputedStyle(e);
    function n(v){ return parseFloat(v) || 0; }
    var l = r.left + n(cs.borderLeftWidth) + n(cs.paddingLeft);
    var t = r.top + n(cs.borderTopWidth) + n(cs.paddingTop);
    var rt = r.right - n(cs.borderRightWidth) - n(cs.paddingRight);
    var b = r.bottom - n(cs.borderBottomWidth) - n(cs.paddingBottom);
    /* A NONSENSE COMPUTED STYLE MUST NOT BLIND THE SWEEP. If the insets come
       back bigger than the box - jsdom resolves a border to 16px here, and a
       real browser could do something odd with a shorthand - the content box
       collapses, the element falls under the 4px floor and quietly stops
       being checked at all. Falling back to the border box keeps it visible:
       a slightly generous rectangle reports a false positive, which someone
       reads, and missing one reports nothing, which nobody does. */
    if (rt - l < 4 || b - t < 4) return r;
    return {left:l, top:t, right:rt, bottom:b, width:rt - l, height:b - t};
  }
  function label(e){
    /* An SVG's className is an SVGAnimatedString, so String() on it reads
       "[object SVGAnimatedString]" - which is what the first report said. */
    var c = (e.getAttribute && e.getAttribute("class") || "").split(" ")[0];
    var t = (e.value || e.textContent || "").trim().slice(0, 14);
    return e.tagName.toLowerCase() + (c ? "." + c : "") +
           (t ? " “" + t + "”" : "");
  }
}

function overlapReport(host){
  /* Found through `host`, not by id: `$()` is for ids the MARKUP declares, and
     check_app asserts exactly that - a lookup for something no markup
     contains is usually a typo, which is a check worth keeping sharp. */
  var old = host.querySelector(".overlapout");
  if (old) old.parentNode.removeChild(old);
  var out = el("div", "note overlapout");
  out.style.marginTop = "10px";
  /* EVERY VIEW, not just the one you are standing on. The diagnostics panel
     lives in Profile, so a sweep of "the current screen" could only ever
     sweep Profile - the one screen nobody was worried about.

     A hidden view reports every rectangle as zero, so each one is shown for
     the length of a measurement and put straight back. The flicker is the
     price of measuring the real layout instead of guessing at it. */
  var open = document.querySelector(".view:not([hidden])");
  var views = [].slice.call(document.querySelectorAll(".view"));
  var total = 0, bad = [], over = [];
  views.forEach(function(v){
    var was = v.hidden;
    v.hidden = false;
    var r = overlapSweep(v);
    v.hidden = was;
    total += r.boxes;
    r.hits.forEach(function(h){ bad.push(v.id + " — " + h); });
    (r.floating || []).forEach(function(h){ over.push(v.id + " — " + h); });
  });
  if (open) open.hidden = false;

  if (!bad.length) {
    out.innerHTML = "<strong>Nothing overlaps.</strong> Swept " + total +
      " painted boxes across " + views.length + " views at " +
      window.innerWidth + "px wide.";
  } else {
    out.className = "note bad overlapout";
    out.innerHTML = "<strong>" + bad.length + " overlap" +
      (bad.length === 1 ? "" : "s") + "</strong> at " + window.innerWidth +
      "px, of " + total + " painted boxes:";
    bad.slice(0, 14).forEach(function(h){ out.appendChild(el("div", "st", h)); });
  }
  /* SHOWN, NOT COUNTED. The "+" button floats over the list on purpose and the
     page scrolls out from under it, so it is not a fault - but listing it is
     what keeps the check honest: a floating layer really swallowing something
     would otherwise be invisible, which is how this tool went blind once
     before. */
  if (over.length) {
    var fl = el("div", "st");
    fl.style.marginTop = "8px";
    fl.innerHTML = "<strong>" + over.length + " floating layer" +
      (over.length === 1 ? "" : "s") + " over content</strong> — by " +
      "design (the + button, a sheet, a toast). Listed so it cannot hide:";
    out.appendChild(fl);
    over.slice(0, 8).forEach(function(h){ out.appendChild(el("div", "st", h)); });
  }
  host.appendChild(out);
}

function diagFallback(txt){
  openSheet("Diagnostics", function(body){
    body.appendChild(el("p", "sub", "Select it all and copy."));
    var ta = el("textarea");
    ta.value = txt; ta.readOnly = true; ta.style.minHeight = "40vh";
    body.appendChild(ta);
    setTimeout(function(){ ta.select(); }, 60);
  }, [fbtn("Done", "primary", closeSheet)]);
}

/* ------------------------------------------- duplicates against HOME ----
   The sweep this answers (player, 2026-09-11): which Champions slots am I
   holding for a species I already have safe in HOME? Those are the ones to
   free first, because the species is not lost when the slot goes - the HOME
   copy can be sent in whenever it is wanted.

   What it costs to free depends entirely on ORIGIN, so the panel splits on
   that and never on "permanent":
     - HOME origin    -> Park back to HOME. Free, build kept, recall any time.
     - Champions origin -> Release only. The Pokemon and its build are gone,
                          and the VP to rebuild the set is the real price.
     - rental         -> Champions origin by definition, but nothing is lost:
                          it cannot be trained, so it carries no build.
   Matching is on the exact form name, because Ninetales-Alola in HOME does
   not cover a plain Ninetales. Same-species-different-form pairs are real but
   are NOT interchangeable, so they get a footnote instead of a row. */
function dupeReport(){
  var homeNames = {}, homeSpecies = {};
  boxRows("home").forEach(function(r){
    homeNames[r.name] = (homeNames[r.name] || 0) + 1;
    var sp = (byName[r.name] || {}).species || r.name;
    (homeSpecies[sp] = homeSpecies[sp] || []).push(r.name);
  });
  var hits = [], formOnly = [];
  boxRows("champions").forEach(function(r){
    if (homeNames[r.name]) { hits.push(r); return; }
    var sp = (byName[r.name] || {}).species || r.name;
    if (homeSpecies[sp]) {
      formOnly.push({name:r.name, others:homeSpecies[sp].filter(function(n){
        return n !== r.name; })});
    }
  });
  var by = {home:[], champions:[], rental:[]};
  hits.forEach(function(r){
    by[r.status === "rental" ? "rental" : originOf(r)].push(r);
  });
  return {hits:hits, formOnly:formOnly, by:by};
}
function drawDupeHome(){
  var blk = $("dupeBlock");
  var d = dupeReport();
  if (!d.hits.length && !d.formOnly.length) { blk.hidden = true; return; }
  blk.hidden = false;
  $("nDupeHome").textContent = d.hits.length;

  var free = d.by.home.length, rent = d.by.rental.length,
      lock = d.by.champions.length;
  $("dupeSub").textContent = d.hits.length
    ? "Champions slots whose species you also hold in HOME. Freeing one does " +
      "not lose the species - the HOME copy goes in when you want it, and that " +
      "copy is HOME origin, so the slot stays elastic from then on."
    : "Nothing in the box is duplicated in HOME.";

  var n = $("dupeNote");
  n.innerHTML = "";
  if (free) {
    n.appendChild(note("", "<strong>" + free + " HOME origin.</strong> " +
      "Park these back - the slot frees, the build survives, and you can " +
      "recall them any time. Nothing is lost, so do these first."));
  }
  if (rent) {
    n.appendChild(note("", "<strong>" + rent + " rental.</strong> " +
      "Champions origin, so releasing is the only exit - but a rental " +
      "cannot be trained, so it carries no build and costs nothing to drop."));
  }
  if (lock) {
    var withBuild = d.by.champions.filter(function(r){ return S.builds[r._id]; });
    n.appendChild(note("warn", "<strong>" + lock + " Champions origin.</strong> " +
      "These can only be freed by <em>releasing</em> them, which destroys the " +
      "Pokemon. " + (withBuild.length
        ? withBuild.length + " of them carry a build that dies with it (" +
          withBuild.map(function(r){ return r.name; }).join(", ") +
          ") - the set is re-makeable in VP, the slot is not."
        : "None of them carries a build.")));
  }
  /* an empty list under a heading that already reads "0" is a fourth way of
     saying nothing; the form-only note below is the only real content then */
  var host = $("listDupeHome");
  host.innerHTML = "";
  host.hidden = !d.hits.length;
  if (d.hits.length) {
    fill(host, d.by.home.concat(d.by.rental, d.by.champions), "");
  }
  if (d.formOnly.length) {
    n.appendChild(note("", "<strong>Same species, different form:</strong> " +
      d.formOnly.map(function(f){
        return f.name + " (HOME has " + f.others.join(", ") + ")";
      }).join("; ") + ". Not interchangeable - different stats, typing or " +
      "ability - so these are NOT counted above."));
  }
}

/* ------------------------------------------------------- what leaves here --
   The search view, the diagnostics panel, and the move vocabulary every other
   screen borrows: how a move is scored, what its badges say, whether it hits
   the ally. Those are exported precisely because they must not be reimplemented
   - a move ranked one way in the picker and another way in search is the bug
   this prevents.

   `findDetail` and `moveRowFor` are exported for PUBLIC: the browser tests
   stack the filters and read the rows back off window.
*/
export {
  DIAG_LATEST, FIND, checkLatest, drawDiag, drawDupeHome, findDetail, findDraw,
  blockerTags,
  findInit, findRun, itemTags, moveFilters, moveRowFor, moveScore, pokeBody,
  pokeHead, priorityTag,
  factLine, overlapSweep, spreadNote, spreadTags, worldDraw,
};
