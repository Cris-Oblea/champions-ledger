/* 01-data.js - The dex blob unpacked, and the small helpers everything else calls.
   Part of the app; assembled into one script by scripts/build_tracker_page.py. */
/* ===================================================================== data */
const C = window.CHAMP;
const DEX = C.DEX.map(function(r){
  return {name:r[0], species:r[1], types:r[2], b:r[3], mega:!!r[4], ab:r[5],
          dex:r[6] || 0};
});
/* HOME lists by National Dex number, so the box can be read in the same order
   and the two screens checked line by line. Anything Champions has never heard
   of has no number here - Melmetal and Oricorio - and sorts last rather than
   being given one from memory. */
function dexNo(name){
  var n = C.DEXNO?.[name];
  if (n) return n;
  var p = byName[name];
  return p?.dex ? p.dex : 99999;
}
function dexLabel(name){
  var n = dexNo(name);
  return n === 99999 ? "#----" : "#" + String(n).padStart(4, "0");
}
/* VIEW state, read all over the app and written by the controls in 13-boot:
   the box sort, and whether HOME shows every row. One exported object rather
   than two exported variables, because an importer may change an object's
   properties but may never reassign another module's binding. */
const VIEW = {sort: "dex", homeAll: false};
function rowMatches(r, q){
  if (!q) return true;
  if (r.name.toLowerCase().includes(q)) return true;
  if (String(dexNo(r.name)).includes(q)) return true;
  var p = byName[r.name];
  if (p?.types.join(" ").toLowerCase().includes(q)) return true;
  if (q === "shiny" && r.shiny) return true;
  if (q === "trained" && r.trained) return true;
  if (r.note && String(r.note).toLowerCase().includes(q)) return true;
  return false;
}
function sortRows(rows){
  var r = rows.slice();
  if (VIEW.sort === "az") {
    r.sort(function(a, b){ return a.name.localeCompare(b.name); });
  } else {
    r.sort(function(a, b){
      return dexNo(a.name) - dexNo(b.name) || a.name.localeCompare(b.name);
    });
  }
  return r;
}
const byName = {}; DEX.forEach(function(p){ byName[p.name] = p; });
const FORMS = DEX.filter(function(p){ return !p.mega; })
               .sort(function(a,b){ return a.name.localeCompare(b.name); });
const MEGAS_OF = {};
DEX.forEach(function(p){
  if (!p.mega) return;
  MEGAS_OF[p.species] ||= [];
  MEGAS_OF[p.species].push(p);
});
const STONE_OF = {};                       // mega name -> stone name
C.STONES.forEach(function(r){ STONE_OF[r[1]] = r[0]; });
const MOVES = C.MOVES.map(function(r,i){
  return {i:i, name:r[0], type:r[1], cat:r[2], bp:r[3], acc:r[4], pp:r[5],
          pri:r[6], target:r[7], spread:!!r[8], hitsAlly:!!r[9],
          hits:r[10] || null, crit:!!r[11], f:r[12] || "", sec:!!r[13],
          text:r[14] || ""};
});
/* P physical, S special, T status - three codes, never two */
/* 1 -> "1st", 4 -> "4th": a finishing place. Worlds ranks stop at 8. */
function ordinal(n){ return ({1: "1st", 2: "2nd", 3: "3rd"})[n] || n + "th"; }
/* "1 build", "3 builds" */
function plural(n, word){ return n + " " + word + (n === 1 ? "" : "s"); }
const CATEGORY = {P: "Physical", S: "Special"};
function catName(c){ return CATEGORY[c] || "Status"; }
const MOVE_BY = {}; MOVES.forEach(function(m){ MOVE_BY[m.name] = m; });
const STAT_KEYS = ["hp","atk","def","spa","spd","spe"];
const STAT_LABEL = {hp:"HP", atk:"Atk", def:"Def", spa:"SpA", spd:"SpD", spe:"Spe"};
/* THE REAL TYPE COLOURS, NOT AN APPROXIMATION.

   These were eighteen hand-written hexes with no source beside them, darkened
   at some point so white text would sit on them - and a darkened colour is no
   longer the colour. Every one of the eighteen was wrong: Fire read #C8501E, a
   dark brick, against the real #FD7D24. The player asked the question that
   settled it (2026-09-16): "son esos los originales o solo un aproximado?"

   They come from pokemon.com's own stylesheet now, fetched and parsed by
   scripts/build_type_colors.py, and each type brings three facts:

     top     the type's colour
     bottom  the SECOND colour - and three types really have one, which the
             player spotted before the script did: Flying is #3DC7EF over
             #BDB9B8, Ground #F7DE3F over #AB9842, Dragon #53A4CF over #F16E57
     ink     the colour that type's name is written in, #FFFFFF or #212121,
             which is why some badges are white-on-colour and some are black.
             Eight of the eighteen are written in black, and reading their
             choice is what lets the app keep the true colour instead of
             darkening it until white works.

   The three tables below are views onto that one source. They are built rather
   than written so nothing can drift from it. */
var TYPE_COLORS = window.CHAMP?.TYPE_COLORS || {};
const TYPE_COLOR = {}, TYPE_COLOR2 = {}, TYPE_INK = {};
Object.keys(TYPE_COLORS).forEach(function(t){
  TYPE_COLOR[t] = TYPE_COLORS[t].top;
  TYPE_COLOR2[t] = TYPE_COLORS[t].bottom || TYPE_COLORS[t].top;
  TYPE_INK[t] = TYPE_COLORS[t].ink || "#FFFFFF";
});
const COSTS = {ranked_win:300, mega_stone_shop:2000, keep_rental_pokemon:2500,
             training_move:250, training_nature:500, training_ability:500,
             training_stat_point:5};

/* ===================================================================== util */
function $(id){ return document.getElementById(id); }
function el(tag, cls, txt){
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}
function slug(s){
  return (String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-")
          .replace(/^-|-$/g,"")) || "x";
}
function freeSlug(s, taken){
  var b = slug(s), k = b, n = 2;
  while (taken[k]) { k = b + "-" + n; n++; }
  return k;
}
var toastT = null;
function toast(msg){
  var t = $("toast");
  t.textContent = msg;
  /* restart the entrance animation, otherwise a second toast inside the
     window just swaps the text with no sign anything happened */
  t.hidden = true; void t.offsetWidth; t.hidden = false;
  clearTimeout(toastT);
  /* long messages need longer than short ones - 2.6s is not enough to read
     "That copy is already in the GTS, waiting for Steelix" */
  var ms = Math.min(7000, Math.max(2600, 1200 + msg.length * 55));
  toastT = setTimeout(function(){ t.hidden = true; }, ms);
}
/* A type's colour as rgba, so a card can be tinted with it without needing
   color-mix - which would add a newer browser requirement than anything else
   this page relies on. Returns the hex untouched when it is not one. */
function tintOf(h, alpha){
  if (h?.charAt(0) !== "#" || h.length !== 7) return null;
  return "rgba(" + Number.parseInt(h.slice(1, 3), 16) + "," +
                   Number.parseInt(h.slice(3, 5), 16) + "," +
                   Number.parseInt(h.slice(5, 7), 16) + "," + alpha + ")";
}
/* Dress a row as a CARD wearing its Pokemon's type: the band across the top
   and the tint behind it. Used by every list that shows Pokemon, so the four
   of them cannot drift apart.

   It only adds - the caller's own classes stay, and that matters: the LEFT
   stripe still means origin (HOME-elastic, Champions-welded, rental) or
   ownership, which is a different fact from the type and must not be traded
   away for a tidier picture. Two edges, two facts.

   The card styling itself is scoped to `.cards`, so a row marked here and
   dropped into a plain `.list` simply stays a row. */
function typeCard(row, p, shiny){
  row.className += " card";
  var types = p?.types || [];
  var c1 = TYPE_COLOR[types[0]];
  if (!c1) return row;
  /* A DUAL TYPE IS ITS OWN COLOUR, not its first half. Fire/Psychic and
     Fire/Rock are different Pokemon and should not wear the same card
     (player, 2026-09-16: "podría ser color diferente... tener más tonalidades
     para los tipo doble. una combinación de colores. para los mono tipo el
     color principal solamente").

     Two variables rather than one gradient, because the tint is painted as
     two half-width columns that each fade downward - a single gradient cannot
     vary along both axes, and this way a mono type sets both halves to the
     same colour and comes out exactly as it did. */
  /* A MONO TYPE WITH TWO OFFICIAL TONES USES ITS OWN SECOND ONE. Flying,
     Ground and Dragon are halved on pokemon.com's own badge, so a pure Flying
     card wears sky over grey exactly as the badge does - the same mechanism
     the dual type uses, fed from one type instead of two. */
  /* FOUR COLOURS, because a Dragon/Flying has four: each type's top tone and
     each type's bottom tone. The band paints them as two stripes that blend
     left to right, so a single-toned type's stripe comes out solid and the
     other fifteen look exactly as they did.

     The band's LEFT half is always type 1 and its RIGHT half type 2, each
     split top-to-bottom by that type's own two tones. A mono Pokemon has no
     type 2, so BOTH halves take type 1 and the band halves top-to-bottom -
     which is how the badge itself is halved. Setting the right half to the
     second tone instead drew an X on pure Dragon. */
  var mono = !types[1];
  var top1 = c1, bot1 = TYPE_COLOR2[types[0]] || c1;
  var top2 = mono ? top1 : TYPE_COLOR[types[1]];
  var bot2 = mono ? bot1 : (TYPE_COLOR2[types[1]] || top2);
  row.style.setProperty("--tcol", c1);     /* solid, for borders */
  row.style.setProperty("--tcolb", bot1);
  row.style.setProperty("--tcol2", top2);
  row.style.setProperty("--tcol2b", bot2);
  /* THE TINT RUNS THROUGH BOTH TONES TOO, in the same half as the band above
     it (player: "asi la sombra o contraste igual difumina el/los color/es del
     tipo en cada mitad"). So the left half fades Dragon-blue into
     Dragon-salmon before it fades out, and the right half Flying-cyan into
     Flying-grey. A single-toned type sets both to the same value and its fade
     is the plain one it always was. */
  var s1 = tintOf(top1, 0.14), s1b = tintOf(bot1, 0.14) || s1;
  var s2 = tintOf(top2, 0.14) || s1, s2b = tintOf(bot2, 0.14) || s2;
  if (s1) row.style.setProperty("--tsoft", s1);
  if (s1b) row.style.setProperty("--tsoftb", s1b);
  if (s2) row.style.setProperty("--tsoft2", s2);
  if (s2b) row.style.setProperty("--tsoft2b", s2b);
  /* THE PICTURE GOES ON HERE, so it lands on every card from one place rather
     than at six call sites. A marker class rather than `:has(.sprite)`: a
     browser without `:has()` drops the rule silently and the badges would run
     under the image, which is the exact fault the overlap sweep exists for. */
  var pic = spriteFor(p.name, false, shiny);
  if (pic) { row.appendChild(pic); row.className += " hassprite"; }
  return row;
}
/* THE MEGA'S COLOURS, CROSS-FADED OVER THE BASE ONES.

   Eighteen of the 76 Mega species change typing, and four of those change how
   MANY types there are - Garchomp and Aggron come back with one, Ampharos and
   Pinsir with two. The card is made of type colour and said none of it
   (player, 2026-09-20: "como podriamos hacer para las cards que tienen cambio
   de tipo (por ende mas o menos colores) se vea visible?").

   This sets a second set of variables - the same four the band uses and the
   same four the tint uses, under `--m*` - and drops in the layer that carries
   them. The animation lives in the stylesheet; everything here does is decide
   WHETHER there is anything to fade to. A Mega that keeps its typing gets
   nothing at all, which is 57 of the 76.

   No Champions species has two Megas with two DIFFERENT new typings - checked
   over the whole dex - so this is always a two-state fade rather than a
   cycle. If a regulation ever adds one, the first differing Mega wins and the
   second is still spelled out in the chips and the arrows. */
function retypeLayer(row, base, forms){
  var bt = (base.types || []).join("/");
  /* EVERY TYPING IT REACHES, not the first one. Castform reaches three and
     the card showed none of them, because this took the first form that
     differed and cross-faded to it - which on a Castform would have meant
     picking Fire and calling the other two nothing. Deduped, because two
     Megas landing on the same new typing is one colour, not two. */
  var seen = {}, list = [];
  (forms || []).forEach(function(f){
    var k = (f.types || []).join("/");
    if (k === bt || seen[k] || !TYPE_COLOR[(f.types || [])[0]]) return;
    seen[k] = 1;
    list.push(f);
  });
  if (!list.length) return;
  /* NO SPECIES REACHES FOUR, so there is no fourth slot written. If a
     regulation ever adds one, the card falls back to the two-state fade it
     has always done rather than running a cycle with no keyframes. */
  if (list.length > 3) list = list.slice(0, 1);

  function paint(node, f){
    var t = f.types || [], c1 = TYPE_COLOR[t[0]], mono = !t[1];
    var top1 = c1, bot1 = TYPE_COLOR2[t[0]] || c1;
    var top2 = mono ? top1 : TYPE_COLOR[t[1]];
    var bot2 = mono ? bot1 : (TYPE_COLOR2[t[1]] || top2);
    node.style.setProperty("--mcol", c1);
    node.style.setProperty("--mcolb", bot1);
    node.style.setProperty("--mcol2", top2);
    node.style.setProperty("--mcol2b", bot2);
    var s1 = tintOf(top1, 0.14), s1b = tintOf(bot1, 0.14) || s1;
    var s2 = tintOf(top2, 0.14) || s1, s2b = tintOf(bot2, 0.14) || s2;
    if (s1) node.style.setProperty("--msoft", s1);
    if (s1b) node.style.setProperty("--msoftb", s1b);
    if (s2) node.style.setProperty("--msoft2", s2);
    if (s2b) node.style.setProperty("--msoft2b", s2b);
    node.setAttribute("aria-hidden", "true");
    return node;
  }
  /* THE COLOURS LIVE ON THE LAYER NOW, not on the card. With one alternate
     typing the card could carry them, because there was one; with three the
     card would be carrying whichever was written last. The band reads them
     off its own parent either way. */
  var tints = document.createDocumentFragment();
  list.forEach(function(f, i){
    tints.appendChild(paint(el("i", "retype i" + (i + 1)), f));
  });
  /* the tints go FIRST, over the card's own background and under everything
     the card is made of - the content sets its own stacking in the CSS */
  row.insertBefore(tints, row.firstChild);
  /* THE RING IS A LAYER OF ITS OWN, and it has to be, because two fades
     never add up to one.

     The band and the tint have always cross-faded correctly: the base one
     is opaque and stays, the other fades in on top of it, so the card is
     covered at every instant. The ring was the odd one out - the base ring
     faded OUT while this one faded IN, and complementary opacities are not
     complementary COVERAGE. Two layers at 0.5 leave 1 - 0.5 x 0.5 = 0.75,
     so for half a second, twice a cycle, a quarter of the dark card showed
     through its own 2px frame and the edge read as a line drawn behind it
     (player, 2026-09-20: "a veces se ve una linea detras en el fondo, se
     dibuja cada vez que cambia y se va"). Measured in the browser at the
     crossing point: 0.751.

     So each ring is its own element, painted ABOVE the base ring, fading in
     over something that is never less than solid. A pseudo-element could
     not: `::after` is generated last, so the base ring is always above
     `.retype`, which is what forced the fade-out in the first place.

     THE SAME RULE IS WHAT ORDERS A CYCLE. Layer 2 fades in while layer 1 is
     still solid, and layer 1 only drops once layer 2 is fully up - where it
     is covered and cannot be seen going. The last one is the only one that
     fades OUT, over the base, with the others already at zero. Every
     transition is therefore one moving layer over something solid. */
  list.forEach(function(f, i){
    row.appendChild(paint(el("i", "retyperim i" + (i + 1)), f));
  });
  row.classList.add("retyping");
  if (list.length > 1) row.classList.add("n" + list.length);
  row.title = base.name + " is " + bt + ", and it becomes " +
    list.map(function(f){
      return f.name + " " + (f.types || []).join("/");
    }).join(", ") + " - the card shows them all.";
}
/* THE SIX STATS AS A TABLE. Written three times in three files before this
   existed, which is why one of them silently did not mark the ranked stat and
   the class itself had been declaring seven columns for six numbers.

   A table rather than a sentence: "115 HP 175 Atk 117 Def ..." is six numbers
   with six words between them, and that gets read rather than scanned - you
   cannot line two of them up against each other (player, 2026-09-16: "no se
   sabe como leerlo bien... va todo escrito como prosa practicamente").

   `mark` is a stat key to highlight, for the list that is ranked by one. */
/* X, Y, Z - AND NOTHING AT ALL, which is the fourth shape and the common one.
   Champions writes exactly four: plain **Mega**, **Mega X**, **Mega Y** and,
   since M-C, **Mega Z** marking a second Mega on a species that already had
   one.

   THERE IS NO "MEGA M" (player, 2026-09-20: "no existe la mega M... solo esta
   bien Mega (a secas, solo), Mega X, Mega Y y Mega Z"). This returned "M" as a
   stand-in letter for the unlettered Mega, and it went straight onto the
   badges - a species with two lines showed "MEGA M" beside "MEGA Z", naming a
   form the game does not have. An empty suffix is the right answer; the two
   callers that need to TELL two Megas apart use formKey() instead, which says
   the word "mega" rather than inventing a letter for it. */
function megaSuffix(m, base){
  if (m?.battle) return m.battle;          /* Blade, Hero, Sunny... */
  if (m?.sfx !== undefined) return m.sfx;  /* an outside Mega's letter */
  var sp = (base && (base.species || base.name)) || "";
  return String(m.name).replace("Mega ", "").replace(sp, "").trim();
}
/* The same thing where a label has to distinguish two Megas of one species and
   cannot be blank - a stat cell's delta, the arrow before an ability. Garchomp
   is the case: plain Mega Garchomp and Mega Garchomp Z, so the pair reads
   "mega" and "Z" rather than the "M" and "Z" it used to. */
/* The class that colours a Mega wherever it is named - the caption under its
   sprite, the key in a stat cell, the label on its ability box. Four inks,
   and they never all meet: a species has either an X/Y pair or a plain Mega
   with a Z, so each card only has to hold two apart. */
/* A MEGA IS NOT THE ONLY THING A POKEMON TURNS INTO. Three of them change
   stats or typing DURING the battle, off an ability rather than a stone -
   Aegislash to Blade Forme, Palafin to Hero, Castform to whichever of Fire,
   Water and Ice the weather says - and the card had none of it (player,
   2026-09-20: "faltan las formas de batalla (sobre todo las que cambian de
   stats como la de aegislash y la de palafin)... tambien son modificaciones
   in battle, como los megas").

   So the three label helpers below take a FORM, Mega or battle, and a battle
   form answers with its own name. Everything downstream - the type arrow, the
   stat deltas, the sprite caption - is keyed off these and needed no other
   change, which is the point of having had them in one place. */
function formInk(m, base){
  if (m?.battle) return "mk-b";
  var k = megaSuffix(m, base).toUpperCase();
  return "mk-" + (k === "X" || k === "Y" || k === "Z" ? k.toLowerCase() : "m");
}
function formKey(m, base){
  if (m?.battle) return m.battle.toLowerCase();
  return megaSuffix(m, base) || "mega";
}

function statGrid(p, mark, megas){
  /* A POKEMON OR A BARE SPREAD. The damage calculator holds raw arrays - a
     battle form's other spread has no Pokemon of its own - and taking only an
     object is what left it writing its own fourth version of this.

     `megas` adds a SECOND NUMBER under any cell a Mega moves, and nothing at
     all under the ones it does not. That is the whole of what the player asked
     to see - "solo necesito saber las cosas que cambian del pokemon base a
     mega" - and it is why a Pokemon with no Mega line looks exactly as it did
     before: the extra line is only ever drawn where there is a difference. */
  var b = p?.b || p || [];
  var sl = el("div", "statline");
  STAT_KEYS.forEach(function(k, i){
    var cell = el("div", mark === k ? "on" : null);
    cell.appendChild(el("b", null, b[i]));
    cell.appendChild(el("span", "lbl", STAT_LABEL[k]));
    /* ONE ROW PER MEGA, ALWAYS IN THE SAME ORDER, and a blank where that
       form does not move the stat. It used to append only the Megas that
       changed something, so the FIRST line of a cell meant "whichever one
       moved it" - Charizard's Sp. Def is moved by Y alone, and its line sat
       where X's line sits in every other cell (player, 2026-09-20: "en
       charizard la spd en la forma y sube, pero esta alineada con lo de la
       forma x, todo lo de una misma forma debe ir alineado").

       Reading a stat table means reading DOWN a column and ACROSS a row, and
       across only works if row two is the same Pokemon in all six cells. The
       blank costs one invisible line in the cells where that form changes
       nothing, and buys that.

       It also retires the de-duplication that used to sit here: two Megas
       reaching the same number printed it once, which was right while the
       lines were unlabelled arrows and is wrong now that each line says whose
       it is. Two forms landing on the same value is a fact about the two
       forms, and hiding one of them breaks the alignment this fixes. */
    /* A FORM THAT MOVES NOTHING GETS NO ROW AT ALL, in any cell.

       The blank above is what keeps two forms aligned across the six cells,
       and it is worth its invisible line for a form that moves SOMETHING
       somewhere. A form that moves nothing anywhere buys nothing with it and
       costs a line in all six: Castform's three weather forms are 70 across
       the board - they change the typing, not the spread - so the table was
       reserving three empty rows under every number and the card grew half
       its height again to say nothing (seen on the card, 2026-09-21). The
       same applies to a Mega that is taken purely for its ability. */
    var moved = (megas || []).filter(function(m){
      return m.b?.some(function(v, j){ return v !== b[j]; });
    });
    var line = moved.length > 1;
    moved.forEach(function(m){
      if (m.b[i] === b[i]) {
        /* THE PLACEHOLDER HAS TO BE THE SAME SHAPE, not just the same
           class. A real delta is TWO lines - the form's key above its
           number - so a one-line blank left every later row half a line
           high and the columns still did not line up. It carries a hidden
           key of its own now, so the two boxes are identical in height. */
        if (line) {
          var gh = el("span", "mg ghost");
          gh.appendChild(el("span", "mgk", formKey(m, p)));
          gh.appendChild(document.createTextNode("—"));
          cell.appendChild(gh);
        }
        return;
      }
      /* THE NUMBER ITSELF CARRIES THE MEGA'S INK, not just the little key
         beside it - otherwise a species with two Megas prints both deltas in
         the same purple and the cell says nothing about which is which. */
      var d = el("span", "mg " + formInk(m, p) +
                         (m.b[i] > b[i] ? " up" : " down"));
      /* WHOSE NUMBER IT IS. With one Mega the arrow is enough; with two, two
         bare arrows in a cell say nothing about which is which (player,
         2026-09-19: "en la tabla de stats no se cual es el stat de quien").
         The suffix is what tells them apart - X, Y, Z, or the word "mega" for
         the one with no letter, because there is no Mega M. */
      if (line) d.appendChild(el("span", "mgk " + formInk(m, p), formKey(m, p)));
      d.appendChild(document.createTextNode(
        (m.b[i] > b[i] ? "↑" : "↓") + m.b[i]));
      d.title = m.name + ": " + STAT_LABEL[k] + " " + b[i] + " → " + m.b[i];
      cell.appendChild(d);
    });
    sl.appendChild(cell);
  });
  return sl;
}
/* ONE LABELLED CELL, the same object the stat table is made of.

   BST and the ability were loose text beside the type chips while the six
   stats sat in neat boxes underneath, so a card had two visual languages on
   it at once (player, 2026-09-16: "seria bonito que bst tambien tuviera un
   cuadro como los stats, puede ser diferente... asi todo queda bien
   presentable").

   `cls` takes "wide" for a value that is a WORD rather than a number - an
   ability, a nature - which needs the sans face and room to breathe; a number
   keeps the tabular mono the stat cells use, so columns of them line up. "on"
   marks the cell the list is currently ranked by, exactly as in statGrid. */
function labelBox(value, label, cls){
  var d = el("div", cls || null);
  var b = el("b");
  /* AN ARRAY BREAKS ONLY BETWEEN ITS ITEMS. Joining three abilities into one
     string and letting the browser wrap it split "Sticky Hold" across two
     lines, which reads as two different abilities - the break has to land on
     the separator, never inside a name. Each item is therefore its own
     unbreakable span and only the " / " between them may wrap. */
  if (Array.isArray(value)) {
    if (!value.length) b.textContent = "—";
    value.forEach(function(v, i){
      if (i) b.appendChild(document.createTextNode(" / "));
      b.appendChild(el("span", "whole", v));
    });
  } else {
    b.textContent = (value === null || value === undefined || value === "")
      ? "—" : value;
  }
  d.appendChild(b);
  d.appendChild(el("span", "lbl", label));
  return d;
}
/* The strip of them that sits above the stat table. Nulls are dropped, so a
   caller can offer a cell it does not always have without branching. */
function cardLine(cells){
  var row = el("div", "cardline");
  cells.filter(Boolean).forEach(function(c){ row.appendChild(c); });
  return row;
}
/* ============================================================ THE CARD ===
   ONE Pokemon CARD, drawn one way, wherever a Pokemon appears.

   It existed four times over: the box wrote one, Find wrote a richer one, the
   GTS deposit chooser was brought up to match by hand, and every picker that
   lives inside a sheet - add to the box, what to ask for in a trade, who is
   attacking in the calculator, which build fills a team slot - kept the bare
   strip all of them started as. So the same Pokemon showed six stats and its
   abilities on one screen and a name with a BST on the next (player,
   2026-09-20: "no todas las cards de pokemon son iguales... si en un lado una
   card me muestra bst y todos los stats con info completa, espero lo mismo de
   todos los otros lugares").

   The fix is not to copy the good one again - copying is what produced this -
   but to have ONE, with the per-screen extras passed in. Everything a card
   carries is here: its type skin and its picture, the Mega line with the
   stone it needs, BST and abilities with what the Mega turns them into, the
   six stats with the Mega's deltas, and the strip of sprites when there is
   more than one form to look at.

   `p` is the row to DRAW - a Champions dex row, or an outsider's row from
   PokeAPI, which is why nothing here asks whether the game allows it.

   Options, all optional:
     cls       extra classes for the element (origin stripe, "illegal", ...)
     tag       "button" (default) or "div" for a card nobody clicks
     name      the label to show, when it is a box row's own name
     shiny     draw the shiny palette - his copy's colours, not the species'
     dex       false drops the dex number chip
     mark      a stat key to highlight, for a list ranked by one
     megas     false suppresses the whole Mega half
     stats     false leaves the six-stat table to the caller
     abLabel   "Possible ability" (default) or "Ability" where one is chosen
     abValue   the ONE ability this set runs, instead of the species list
     cells     extra labelBox cells for the line above the stats
     pre       fn(nameLine)  - a rank number, before the name
     badges    fn(nameLine)  - tags that belong on the name
     meta      fn(metaLine)  - chips that belong beside the types
     notes     fn(cardBody)  - the .st lines underneath
     onclick   what tapping it does                                        */
/* THE FACTS OF A POKEMON, in the order the card settled: the type chips
   and what the stone swaps them to, BST beside the base abilities, one box
   per Mega ability in its own ink, and the six stats with every form on its
   own row.

   IT IS A FUNCTION BECAUSE THE SHEET NEEDS THE SAME THING. Splitting the
   card into one implementation fixed the lists and left the SHEET - what
   opens when you tap a card - still drawing its own head: a BST cell alone
   on a line, no abilities beside it, and a stat table with no Mega deltas
   and no inks (player, 2026-09-20: "no lo veo reflejado en todas las cards
   de toda la app... bst en una linea, habilidades base en otra... la idea
   es que todas las cards sean iguales en todos lados de la app, sin
   excepciones").

   So the shared middle lives here and both callers append it. `ms` is
   passed in rather than recomputed, because the caller has already decided
   whether this Pokemon has a Mega line to show. */
function pokeFacts(m, p, ms, o){
  o = o || {};
  var label = o.name || p.name;
  /* --- the meta line -------------------------------------------------- */
  var meta = el("div", "rmeta");
  /* THE DEX NUMBER STAYS HERE. It went to the name line for one build, on the
     theory that its 36px was what made the retyping Megas wrap - and measuring
     properly said otherwise: the type line was never over, the detector was
     counting a 1px baseline difference on the arrow as a second row. What the
     move DID do was push 25 names onto two lines, the ones carrying a Worlds
     tag. Measured before and after: type line 0 wraps either way, name line 0
     with the number here and 25 with it there. */
  if (o.dex !== false) meta.appendChild(el("span", "mono", dexLabel(label)));
  (p.types || []).forEach(function(t){ meta.appendChild(typeChip(t)); });
  /* THE OTHER FORM'S TYPES ONLY WHEN IT REALLY SWAPS THEM. Most keep them,
     and repeating an unchanged pair beside itself is noise.
     A BATTLE FORM ALWAYS NAMES ITSELF, even when it is the only arrow on the
     line: "-> FIRE" on a Castform says the stone swaps it, which is a
     different and wrong story. The Megas keep the old rule, where a lone
     arrow needs no letter because there is nothing to tell it apart from. */
  ms.forEach(function(mm){
    if (mm.types.join("/") === p.types.join("/")) return;
    var arrow = el("span", "megato " + formInk(mm, p));
    arrow.textContent = "→" +
      ((mm.battle || ms.length > 1) ? " " + formKey(mm, p) : "");
    meta.appendChild(arrow);
    mm.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
  });
  if (o.meta) o.meta(meta);
  m.appendChild(meta);

  /* --- BST, abilities, and what the Mega makes of them ---------------- */
  /* DEDUPED: Absol's two Megas are both 565, and "465 -> 565 -> 565" says one
     number twice. */
  var bstTxt = String(bst(p)), seen = {};
  ms.forEach(function(mm){
    var v = bst(mm);
    if (v === bst(p) || seen[v]) return;
    seen[v] = 1;
    bstTxt += " → " + v;
  });
  /* THE BASE ABILITIES ONLY. The Megas used to be folded in here behind
     arrows - "Blaze / Solar Power / -> X Tough Claws / -> Y Drought" - which
     made one cell carry three different Pokemon and grow to four lines
     (player, 2026-09-20: "que diga las posibles habilidades de la forma
     normal, pero que tenga un cuadro que indique cual es la habilidad mega y
     en caso de tener mas mega evoluciones tener otro cuadro mas"). */
  /* `abValue` REPLACES the list with one chosen ability, which is what a
     BUILD has: a build is not a species, it is one decision about one
     Pokemon, so its card must not also offer the other two abilities it
     could have had (player, 2026-09-20: "las cards de build solo deben
     mostrar unicamente a lo que la build apunta... el concepto de build es
     eso, mostrar solo lo que pertenece a ello"). */
  m.appendChild(cardLine([
    labelBox(bstTxt, "BST", o.mark === "bst" ? "on" : null),
    labelBox(o.abValue !== undefined ? o.abValue : (p.ab || []),
             o.abLabel || "Possible ability", "wide")
  ].concat(o.cells || [])));
  /* ONE BOX PER MEGA, on a line of their own and sharing it. Labelled in that
     Mega's own ink, so the box, the sprite caption and the stat deltas are
     tied together by colour rather than by reading. The title is where the
     stone went: which one it needs, and whether it is owned. */
  var megasOnly = ms.filter(function(mm){ return !mm.battle; });
  /* NO BOX FOR THE BATTLE FORMS, and that is not an omission.

     A Mega gets one because the stone REPLACES its ability, so the card is
     carrying a fact it has nowhere else. A battle form gains nothing: the
     ability that flips it is the one the Pokemon already has, printed in the
     cell above. All three in Champions have exactly one ability, so a box
     here read "Stance Change" directly under "Stance Change" (seen on the
     card, 2026-09-21) - the same duplication the Mega block was rebuilt to
     stop.

     What the card still says, three ways over: the sprite captioned BLADE in
     its own ink, every stat it moves carrying that ink underneath, and the
     type arrow when the form retypes. Which ability does it is the sheet's
     job, and the sheet's "In battle" block opens with exactly that. */
  if (megasOnly.length) {
    m.appendChild(cardLine(megasOnly.map(function(mm){
      var sfx = megaSuffix(mm, p);
      var cell = labelBox(mm.ab || [],
        (sfx ? "Mega " + sfx : "Mega") + " ability", "wide");
      var lbl = cell.querySelector(".lbl");
      if (lbl) lbl.className = "lbl " + formInk(mm, p);
      /* WHETHER THE STONE IS OWNED IS NOT SAID HERE AT ALL - not as a shape,
         not in the title (player, 2026-09-20: "el tag de tener piedra o no
         deberia ir solo en el apartado de items, me estorba esa info en el
         pokemon... el apartado de items es el que dice si tengo el item o
         no"). One object, one place: a stone is an item and the Items tab is
         what tracks it. What this box is about is the ability the Mega has,
         which is true whether or not the stone is in the bag. */
      cell.title = mm.name + (mm.types.join("/") !== p.types.join("/")
        ? " - becomes " + mm.types.join("/") : "");
      return cell;
    })));
  }
  /* --- the six stats -------------------------------------------------- */
  /* `stats:false` leaves them out, for a caller that wants the table at FULL
     WIDTH below rather than in the narrow column beside a picture - which is
     what a sheet panel does, base form and Mega alike. */
  if (o.stats !== false) m.appendChild(statGrid(p, o.mark, ms));
}
function pokeCard(p, o){
  o = o || {};
  var row = typeCard(el(o.tag || "button", "row" + (o.cls ? " " + o.cls : "")),
                     p, !!o.shiny);
  var m = el("div", "rmain");
  var label = o.name || p.name;

  /* --- the name line ------------------------------------------------- */
  var h = el("div", "rname");
  if (o.pre) o.pre(h);
  h.appendChild(document.createTextNode(label));
  if (o.badges) o.badges(h);
  /* THE LINE, NOT THE FORMS. One chip per Mega carrying only the letter that
     tells them apart - Charizard X and Y, Garchomp and Garchomp Z - and the
     title says what the stone costs and what it swaps, so the card never has
     to spend a line on it. A Mega drawn as itself has no Mega line of its
     own. */
  /* THE FORM LINE IS MEGAS AND BATTLE FORMS TOGETHER, because everything
     below this point - the type arrow, the BST arrow, the stat deltas, the
     strip of sprites - is asking the same question of both: what does this
     Pokemon turn into, and what changes when it does.

     `megas:false` still silences the MEGAS. It is the build card, which shows
     one configuration and nothing the build declined - but a battle form is
     not a thing a build declines. An Aegislash build attacks at 140, whichever
     set it runs, so the form stays on the card. */
  var megas = (o.megas === false || p.mega) ? [] : megaLine(p);
  var ms = megas.concat(battleFormsOf(p));
  /* NO MEGA CHIPS HERE ANY MORE (player, 2026-09-20: "los tags MEGA, MEGA Z,
     Mega X, Mega Y ya no sirven, porque ahora los sprites representan
     visualmente las megas con la leyenda morada que tienen"). They were the
     only way to know a species had a second form back when the card carried
     one picture; the strip of sprites says it better, in colour, with the
     form's own face. What the chip also carried - which stone, and whether it
     is owned - moved to the ability box below, which is the row that is
     actually about that Mega. */
  var med = podiumChip(label);
  if (med) h.appendChild(med);
  m.appendChild(h);

  pokeFacts(m, p, ms, o);
  /* AND THE COLOUR ITSELF SAYS SO when the typing changes - by a stone or by
     an ability, which is why it is handed the whole form line. Castform is
     the one that needed the second half: Forecast reaches three typings and
     the card is made of type colour, so it cycles all four states rather
     than picking one of them to be the answer.
     The CARD's job, not the facts': it paints the card's own band, tint
     and frame, and a sheet has none of those to cross-fade. */
  retypeLayer(row, p, ms);
  /* NO ROW FOR THIS EXACT FORM. A caveat about the numbers themselves, which
     no tag can say for the caller. */
  if (p.approx) {
    var src = el("div", "st");
    src.style.marginTop = "6px";
    src.textContent = "No row for this exact form — showing " + p.approx + ".";
    m.appendChild(src);
  }
  if (o.notes) o.notes(m);
  row.appendChild(m);

  /* --- the sprites ---------------------------------------------------- */
  /* EVERY CARD PUTS ITS SPRITES IN A STRIP ACROSS THE TOP, whether there is
     one of them or three (player, 2026-09-20: "unificar, para ver como
     queda").

     The corner was not a style choice, it was what one 96px sprite allowed
     and three did not - sprites are drawn at native size and nothing shrinks
     them. So a Pokemon with a Mega line got the strip and everything else
     kept the corner, and that left two card shapes in one grid. Measured over
     the Find grid: a corner card starts its name at y=28 and a strip card at
     y=137, and in a row holding both they sit 109px apart. In dex order 55%
     of rows hold both, by Speed 45%, by BST 20%.

     What it costs is the strip's own 104px on the cards that used to overlap
     it: +10% of scroll on the desktop grid, +15% on a phone. What it buys is
     one shape - and 274px of usable width instead of 186, because the corner
     sprite was stealing 88 of it from the name, the types and the boxes.

     A LONE SPRITE CARRIES NO CAPTION. "base" only means something beside the
     thing it is not; on its own it is a word under a picture of the Pokemon
     whose name is written underneath anyway. */
  var strip = el("div", "megapics");
  var self = spriteFor(p.name, false, !!o.shiny);
  if (self) {
    self.className = "megapic";
    self.title = p.name;
    var c0 = el("div", "megapicwrap");
    c0.appendChild(self);
    if (ms.length) c0.appendChild(el("span", "megapickey base", "base"));
    strip.appendChild(c0);
  }
  ms.forEach(function(mm){
    var mp = formSprite(mm, p, false, !!o.shiny);
    if (!mp) return;
    mp.className = "megapic";
    /* WHAT THE FORM DOES TO ITS MOVES rides on the picture's title, the one
       place on a card with room for a sentence: "Morpeko-Hangry - Hunger
       Switch - Aura Wheel is Dark". The sheet says it in full. */
    mp.title = [mm.name, mm.battle && mm.by].concat(formMoves(mm, p).map(
      function(c){ return c[0] + " is " + c[2]; })).filter(Boolean).join(" - ");
    var cell = el("div", "megapicwrap");
    cell.appendChild(mp);
    /* A BATTLE FORM IS CAPTIONED WITH ITS OWN NAME AND NOT THE WORD "MEGA".
       Blade, Hero, Sunny - the caption has to be readable as the thing the
       sprite shows, and calling any of them a Mega would be a lie about how
       it is reached. */
    var key = "mega";
    if (mm.battle) key = mm.battle.toLowerCase();
    else if (megaSuffix(mm, p)) key = "mega " + megaSuffix(mm, p);
    cell.appendChild(el("span", "megapickey " + formInk(mm, p), key));
    strip.appendChild(cell);
  });
  if (strip.children.length) {
    row.classList.add("hasline");
    row.classList.remove("hassprite");
    /* typeCard already pinned one to the corner, and dropping the CLASS only
       stops it narrowing the text - the image is still there and still
       absolutely positioned, so the Pokemon appeared twice. */
    var corner = row.querySelector("img.sprite");
    if (corner) corner.remove();
    row.insertBefore(strip, row.firstChild);
  }
  if (o.onclick) row.onclick = o.onclick;
  return row;
}
/* A Mega is drawn as itself and has no Mega line of its own; everything else
   carries the stones its species can hold. Lived in the Find module while it
   was the only screen that showed them - which is exactly how the other
   screens ended up without them.
   A SPECIES CHAMPIONS LACKS carries its Megas too (player, 2026-09-27: "todos
   los sprites de las diferentes formas... sea por ser megas (incluso cuando
   tienen mas de 1 mega)"): Mewtwo's card had neither X nor Y. They come off
   its outside row with main-series numbers, like the row itself, and are
   never offered anywhere a Champions stone is - megasFor stays the game's. */
function megaLine(p){
  if (!p || p.mega) return [];
  return p.outside ? outsideForms(p, true) : megasFor(p.name);
}
/* THE FORMS IT TAKES DURING THE BATTLE, shaped exactly like a Mega row so the
   card can draw them with the machinery it already has.

   FIVE in Champions. Stance Change flips Aegislash to 140 Atk / 140 Def the
   moment it attacks, Zero to Hero takes Palafin from 70 Attack to 160, and
   Forecast retypes Castform to Fire, Water or Ice with the weather. Hunger
   Switch and Disguise move no number - and they are here anyway, because a
   form is more than its numbers (player, 2026-09-27: "algunas formas
   determinan algunas habilidades o ataques, como aura wheel de morpeko cambia
   de tipo el move segun su forma"). Hangry Morpeko's Aura Wheel is Dark; the
   sheet says so beside the form, off C.FORM_TYPED. These two used to be left
   out as having "nothing to show", and the card lost their picture with it.

   `battle` carries the form's own name and is what tells the three label
   helpers this is not a Mega. `by` is the ability that does it, which is the
   difference between a number and an explanation. `sp` is its picture. */
function battleFormsOf(p){
  if (!p || p.mega) return [];
  if (p.outside) return outsideForms(p, false);
  var bfm = C.BFORMS?.[p.name];
  if (!bfm) return [];
  return Object.keys(bfm.f).map(function(lab){
    var e = bfm.f[lab];
    return {name: p.name + "-" + lab, species: p.species || p.name,
            types: e.t || p.types, b: e.b || p.b, ab: p.ab || [],
            battle: lab, by: bfm.by, sp: e.sp};
  });
}
/* WHAT A FORM DOES TO ITS MOVES, as [move, type before, type in this form].

   C.FORM_TYPED is the table the calculator already reads - the moves whose
   type comes from the USER'S form rather than from the move row - so this is
   the same fact, asked the other way round. Hangry Morpeko is the case that
   made it matter: Aura Wheel is Electric, and Dark in that form. */
function formMoves(form, base){
  var ft = C.FORM_TYPED || {};
  return Object.keys(ft).filter(function(mv){
    var t = ft[mv][form.name];
    return t && t !== ft[mv][base.name];
  }).map(function(mv){
    return [mv, ft[mv][base.name] || MOVE_BY[mv]?.type, ft[mv][form.name]];
  });
}
/* The same two lists for a species Champions does not have, read off its
   outside row. `sfx` is the stone's letter, carried rather than worked out of
   the name: Tatsugiri-Droopy's Mega is "Mega Tatsugiri", and subtracting the
   card's name from it leaves nonsense. */
function outsideForms(p, megas){
  return (p.forms || []).filter(function(f){
    return megas ? f.mega !== undefined : f.mega === undefined;
  }).map(function(f){
    return {name: f.n, species: p.species || p.name, types: f.t || p.types,
            b: f.b || p.b, ab: f.ab || [], outside: true, sp: f.sp,
            sfx: f.mega, battle: f.k, by: f.by};
  });
}
/* ONE PLACE THAT KNOWS WHAT A TYPE LOOKS LIKE.

   There were three others painting a type by hand, and all three had the same
   bug the moment the colours became the real ones: they wrote `color:#fff`
   next to the background, so a selected Electric or Ground filter would have
   been white on yellow. The ink is not a constant - it is the type's own
   (player, 2026-09-16: "los filtros por tipo siguen otros colores que no son
   los que deberían. tiene que estar todo al mismo diseño y colores").

   `on` false leaves the fill off and keeps only the edge, which is what an
   unselected filter is. */
function typeSkin(node, t, on){
  var a = TYPE_COLOR[t], b = TYPE_COLOR2[t];
  if (!a) {
    if (on !== false) { node.style.background = "#777"; node.style.color = "#fff"; }
    return node;
  }
  node.style.borderColor = a;
  if (on === false) { node.style.background = ""; node.style.color = ""; return node; }
  /* halved the way pokemon.com halves it, which shows on the three types that
     carry two colours */
  node.style.background = (b && b !== a)
    ? "linear-gradient(180deg," + a + " 50%," + b + " 50%)" : a;
  node.style.color = TYPE_INK[t] || "#FFFFFF";
  return node;
}
function typeChip(t){ return typeSkin(el("span", "t", t), t); }
function bst(p){ return p.b.reduce(function(a,b){ return a+b; }, 0); }
/* THE CARD FOR A POKEMON CHAMPIONS DOES NOT HAVE.

   A HOME row for one of these used to be a name and a tag and nothing else -
   no types, no BST, no stats, no ability - and HOME is exactly where the
   player decides what to keep and what to send on: "si quisiera hacer un
   cambio en pokemon home, no sabria por que cambiarlos" (2026-09-16). 24 of
   his 129 HOME Pokemon were blank.

   Returns a row shaped like a dex row so every card component can take it
   unchanged, with `outside` set so callers can say where the numbers came
   from. MAIN-SERIES NUMBERS: Champions has no row for these at all, which is
   why there is nothing of ours to contradict - but it is never Champions data
   and the card must not imply it is. `approx` names the base species when
   PokeAPI had no row for that exact form.

   FOR DISPLAY ONLY. Everything that decides what a Pokemon can DO - whether it
   is legal, whether it Mega Evolves, whether it can be brought - still asks
   byName, which knows only the Champions dex. */
function outsideRow(name){
  var h = C.HOME_DEX?.[name];
  if (!h) return null;
  return {name:name, species:name, types:h.t || [], b:h.b || [],
          ab:h.ab || [], mega:false, dex:0,
          outside:true, approx:h.approx || null, forms:h.f || null};
}
/* byName first, always: a Champions Pokemon is never described by this table */
/* ...and one more step before giving up: THE OTHER SPELLING OF THE SAME
   POKEMON. C.LEARN_ALIAS already maps every name the sources write differently
   onto the dex row it really is, and this is the same question - a bare
   "Floette" from a Worlds teamlist IS Floette-Eternal, because that is the
   only Floette the game has. Without it the row drew no types, no stats, no
   BST and no sheet at all (player, 2026-09-18: "floette no tiene ficha, si
   deberia tenerla"). */
function anyRow(name){
  var alias = C.LEARN_ALIAS?.[name];
  return byName[name] || (alias && byName[alias]) || outsideRow(name)
         || (alias && outsideRow(alias)) || null;
}

/* THE PICTURE, FETCHED AND NEVER STORED.

   A sprite is the one thing PokeAPI has that is safe for the species Champions
   DOES have as well: its numbers are rebalanced and PokeAPI's are not, but a
   picture of a Pikachu is a picture of a Pikachu, and Champions publishes none
   of its own.

   THE IMAGES ARE NOT IN THIS REPOSITORY, deliberately. They are Nintendo and
   Game Freak artwork - PokeAPI licenses its own sprites repo NOASSERTION for
   exactly that reason - and this repository is public. Only the id ships; the
   image comes from a CDN at a pinned commit, so nothing of theirs is
   redistributed from here and a takedown is one line rather than a rewritten
   git history.

   The pixel sprite, not the artwork: 1.3-1.7 KB against 126 KB, and at the
   size a card shows it the artwork would be downscaled into mush anyway. */
/* EVERY OUTSIDE HOST THIS APP DRAWS A PICTURE FROM, DECLARED ONCE.

   scripts/build_tracker_page.py reads this array out of the linked app and
   writes it into the Content-Security-Policy, so adding a host here is what
   allows it in production - there is no second place to edit.

   That is not tidiness, it is the bug. The policy said `img-src 'self' data:
   blob:` from the day it was written, the sprites arrived later from a CDN,
   and nothing local enforces _headers: every sprite was there in development
   and blocked the moment it shipped, with no error a person would ever see
   (player, 2026-09-18). */
var IMG_HOSTS = ["https://cdn.jsdelivr.net"];
var SPRITE_PIN = "2ecb4eeacd5a1718621fc30f12772e3f60d830b9";
var SPRITE_BASE = IMG_HOSTS[0] + "/gh/PokeAPI/sprites@" + SPRITE_PIN +
                  "/sprites/pokemon/";
/* TWO SETS, AND THE REASON IS RESOLUTION, NOT TASTE.

     pokemon/<id>.png        96x96,   1.3 KB   - the pixel sprite
     other/home/<id>.png     512x512, ~130 KB  - the HOME render

   A list draws up to 159 of them at once, so it gets the small one; 159 renders
   would be 22 MB. A SHEET draws exactly one, where 130 KB is nothing and the
   detail is really there.

   This is also the answer to "con mas pixeles": the pixel file HAS 96 and no
   more, so drawing it larger enlarges the same 96 pixels and adds nothing. The
   extra detail only exists in the 512 set, which is why the sheet gets it and
   the list cannot. */
/* AND A SHINY REALLY IS A DIFFERENT PICTURE (player, 2026-09-18: "tienen otros
   colores y seria mas representativo"). Both sets carry one - checked at the
   pinned commit, not assumed: sprites/pokemon/shiny/<id>.png is 598 bytes and
   other/home/shiny/<id>.png is 85 KB, beside 597 and 79 KB for the normal
   pair - so it costs a path segment and nothing else.

   It is asked for by the CALLER, and only where a specific copy is in hand:
   a box row, a HOME row, a trade. The search view draws the species rather
   than his copy of it, so it stays the ordinary colour. */
function spriteFor(name, big, shiny){
  return spriteImg(C.SPRITE_ID?.[name], big, shiny);
}
/* A FORM'S PICTURE, which is not always the one its name would give.

   A battle form and an outside Mega carry their own (`sp`). A Champions Mega
   is a dex row with its own entry in SPRITE_ID - except where one row stands
   for two looks: Champions has a single "Mega Meowstic", and the female's is
   white. C.FORM_SPRITE holds exactly those, keyed by the base it is drawn
   from. */
function formSprite(form, base, big, shiny){
  var own = form.sp ||
    C.FORM_SPRITE?.[base?.name]?.[form.name];
  return own ? spriteImg(own, big, shiny) : spriteFor(form.name, big, shiny);
}
/* THE ID IS THE FILE NAME: a number for a row's own picture, "493-ice" for
   one filed by form (Arceus' plates, Silvally's memories, Cherrim in the
   sun). Both are just the part before ".png".

   AND NOT EVERY PICTURE IS IN BOTH SETS. The HOME set lacks nine the pixel
   set has (Pichu's spiky ear, Sinistea's antique teapot, six Pikachu in
   caps) and the pixel set lacks Mega Zygarde, which upstream has only ever
   drawn as a HOME render. C.SPRITE_GAPS lists them per set, measured at the
   pin, so the page asks for the one that exists instead of drawing a 404 and
   then nothing - which is what "not every sprite is loading" was, for these. */
function spriteImg(id, big, shiny){
  if (!id) return null;
  var g = C.SPRITE_GAPS || {};
  var gone = function(k){ return (g[k] || []).includes(id); };
  /* The big picture prefers the HOME render and falls back to the pixel
     sprite; the small one is the pixel sprite unless that one is missing. */
  var home;
  if (big) home = !gone(shiny ? "s" : "n");
  else home = gone(shiny ? "ps" : "p");
  var cls = "sprite";
  if (big) cls = home ? "sprite big" : "sprite big native";
  var img = el("img", cls);
  img.src = SPRITE_BASE + (home ? "other/home/" : "") + (shiny ? "shiny/" : "")
            + id + ".png";
  img.alt = "";                       /* the name is right beside it */
  /* THE BOX IS THE SLOT'S, whichever set filled it: a 512 render drawn in a
     card's 96 is downscaled with smoothing, which a render survives and a
     pixel sprite would not - and a sheet whose render is missing draws the
     pixel one at its own 96 rather than blowing it up to 180. */
  var px = big && home ? 180 : 96;
  img.width = px; img.height = px;
  img.loading = "lazy";               /* only what is actually on screen */
  img.decoding = "async";
  /* OFFLINE IS A NORMAL STATE for this app, and a broken-image glyph would be
     worse than no picture. The card is built to read without it. */
  img.onerror = function(){ img.remove(); };
  return img;
}

/* level-50 stat, the formula the repo verified against 504 speed tiers */
function statAt(base, sp, isHp, mult){
  var v = base + Math.max(0, Math.min(32, sp || 0)) + (isHp ? 75 : 20);
  return Math.floor(v * (isHp ? 1 : (mult || 1)));
}
function natMult(nature, key){
  var n = C.NATURES[nature];
  if (!n) return 1;
  if (n[0] === key) return 1.1;
  if (n[1] === key) return 0.9;
  return 1;
}
function defence(types){
  var out = {};
  Object.keys(C.CHART).forEach(function(atk){
    var m = 1;
    types.forEach(function(d){
      var row = C.CHART[atk];
      if (row?.[d] != null) m *= row[d];
    });
    if (m !== 1) out[atk] = m;
  });
  return out;
}
/* THE FORM FIRST, then the species. The other way round - which is how this
   read until the player found it - hands every regional form its base form's
   movepool: Samurott-Hisui was offered Samurott's 62 moves and told it does
   not learn Ceaseless Edge or Sucker Punch, which it does. 25 forms were
   affected, Rotom-Wash and Ninetales-Alola among them, and the build editor
   offers from this same list, so it was picking sets out of the wrong pool.

   The species fallback still matters and must stay: a Mega has no learnset of
   its own, so Mega Garchomp has to read Garchomp's. */
function learnset(name){
  var p = byName[name];
  var sp = p ? p.species : name;
  /* and four forms find their pool under neither name: Champions' Floette is
     the Eternal Flower one, filed as "Floette-Eternal", and the two gender
     forms inherit the base species' pool. build_tracker_data.py resolves
     those with norm() and ships the answer, so this stays a plain lookup and
     no form is left without a movepool. */
  var alias = C.LEARN_ALIAS?.[name];
  var ids = C.LEARN[name] || (alias && C.LEARN[alias]) || C.LEARN[sp] || null;
  return ids ? ids.map(function(i){ return MOVES[i]; }) : null;
}
/* A Mega belongs to ONE form, not to every form of the species. Reading it off
   the species handed Raichu-Alola the two Mega Raichu and Slowbro-Galar the
   Mega Slowbro - neither can hold that stone - and it got Floette backwards,
   because Mega Floette belongs to Floette-ETERNAL, not to plain Floette.
   Smogon's roster states the relation (`baseSpecies` on each Mega) and
   build_tracker_data.py resolves it there; the species is only the fallback
   for a form Smogon does not carry. */
function megasFor(name){
  var owned = C.MEGA_OWNER?.[name];
  if (owned) return owned.map(function(n){ return byName[n]; }).filter(Boolean);
  /* an alternate form with no Megas of its own gets none - it must not
     inherit its base form's */
  if (byName[name] && byName[name].species !== name) return [];
  var p = byName[name];
  return (p && MEGAS_OF[p.species]) || MEGAS_OF[name] || [];
}

/* ----------------------------------------------------- what a thing DOES ---
   As a number, not as an adjective.

   Serebii writes "It slowly but steadily restores the holder's HP" for
   Leftovers and "boosts the power of the holder's moves" for Life Orb - which
   is what this app showed, with the 1/16 and the x1.3 nowhere on screen. The
   player's complaint was exact: "no me sirve una descripcion bonita que en el
   fondo no me diga la verdad calculada."

   C.EFFECTS carries, for an item, an ability or a move:

     desc  Smogon's own sentence
     c     the chips - one per FACT, each already carrying its subject

   THE CHIPS ARE NOT ASSEMBLED HERE any more, and that is the fix. This used
   to push one chip per engine measurement and one per number found in the
   text, so Black Glasses read "x1.2  x1.2  1.2x" - the physical probe, the
   special probe and Smogon's sentence, all saying the same thing - and Life
   Orb read "x1.2998  x1.2998  1.3x", disagreeing with itself because the
   engine works in 4096ths (player, 2026-09-18: "se tiene que llegar a 1 solo
   concenso de la verdad... no duplicar mas la informacion, es un desperdicio
   y es feo visualmente").

   Deciding that needs the exact 4096ths, the stage each was pushed at and the
   sentence each number sits in - none of which belongs on a phone. It is done
   in scripts/effect_chips.py, where `--audit` can also list the numbers whose
   subject it cannot name yet. What arrives here is [text, why] and is drawn. */
/* A DESCRIPTION WITH ITS NUMBERS MARKED (player, 2026-09-27: "para evitar
   usar tags innecesarios en los items y habilidades, se podria remarcar con
   color los % o numeros para leerlo rapidamente").

   The chips repeated the sentence's own numbers once the sentence became
   Smogon's full text - Sitrus Berry's "1/2 HP" and "1/4 HP" beside "Restores
   1/4 max HP when at 1/2 max HP or less" - so they went (effect_chips.py rule
   6). This is what replaces them: the number stays where it means something,
   in its sentence, and the eye finds it by colour.

   A percentage, a fraction, a multiplier, a count of turns or stages, and the
   four words that are numbers (halved, doubled, quartered, tripled). Built
   from text nodes, never innerHTML: the text is scraped, and a scraped string
   is not markup. */
var NUM_RE = /\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:%|×))?(?:\s(?:turns?|stages?)\b)?|\b(?:halved|halves|doubled|doubles|quartered|tripled)\b/g;
function numText(text, tag, cls){
  var node = el(tag || "span", cls || null);
  var s = String(text == null ? "" : text), last = 0, m;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(s))) {
    if (m.index > last)
      node.appendChild(document.createTextNode(s.slice(last, m.index)));
    node.appendChild(el("b", "num", m[0]));
    last = m.index + m[0].length;
  }
  if (last < s.length) node.appendChild(document.createTextNode(s.slice(last)));
  return node;
}
function effectOf(name){
  return C.EFFECTS?.[name] || null;
}
/* The numbers as short chips: "x1.3 damage dealt", "1/10 of max HP". */
function effectChips(e){
  return (e.c || []).map(function(p){ return {text:p[0], why:p[1]}; });
}
/* A row of them, with the source behind each on hover. */
function effectLine(name){
  var e = effectOf(name);
  if (!e) return null;
  var chips = effectChips(e);
  if (!chips.length && !e.desc) return null;
  var box = el("div", "st");
  box.style.marginTop = "2px";
  chips.forEach(function(c){
    var t = el("span", "tag ok", c.text);
    t.title = c.why;
    t.style.marginRight = "4px";
    box.appendChild(t);
  });
  if (e.desc) {
    var d = el("span", null, e.desc);
    d.style.opacity = ".85";
    box.appendChild(d);
  }
  return box;
}

/* ------------------------------------- what THIS Pokemon's players run ----
   pokebase's per-Pokemon pages: of the Rillaboom brought to an M-C tournament,
   57.2% held a Miracle Seed, 86.3% were Adamant, 99% ran Grassy Surge, and
   53.9% of their teams also carried Sneasler.

   The global tables answer "how used is Sucker Punch". This answers the
   question a build actually asks, which is a different question and the one
   worth having while choosing.

   WHAT THE NUMBER IS A SHARE OF IS NOT THE SAME IN EVERY SECTION, and it has
   to be said out loud because it decides how the chip may be coloured. A set
   holds one item, one ability, one nature and one spread, so those columns are
   a share of SETS and read directly: 57.2% of them held the Seed. It holds up
   to FOUR moves, and pokebase divides by slots, so the move column sums to 100
   across the whole movepool and its top row is near 25 - Fake Out at 24.6% is
   not a quarter of Rillaboom running it, it is essentially all of them. A fixed
   "50% is popular" rule reads every move in the game as fringe, so emphasis is
   measured against that Pokemon's own top row instead, and the tooltip says
   which denominator it is. Teammates are a share of TEAMS, and a team has five
   other slots, so that column sums to ~400.

   Its own asset because it is fetched WEEKLY - the dex is rebuilt nightly, and
   grouping them would re-download the lot every night unchanged.

   A Mega falls back to its base species: pokebase files usage under the
   species people ladder with, and a Mega Charizard Y is a Charizard holding a
   stone as far as the results are concerned. */
function splitsFor(name){
  var all = window.CHAMP_SPLITS?.p || {};
  if (all[name]) return all[name];
  var p = byName[name];
  return (p?.species && all[p.species]) || null;
}
/* The regulation these numbers came from, for anything that prints a source. */
function splitsReg(){
  return window.CHAMP_SPLITS?.r || null;
}
/* The percentage for one thing.

   `null` means this Pokemon has no table at all - a species nobody has
   brought - and 0 means the table exists and this is not in it. They are
   different answers and the app shows them differently: silence against a
   measured "nobody". */
function splitPct(name, kind, what){
  var s = splitsFor(name);
  var rows = s?.[kind];
  if (!rows?.length) return null;
  for (const row of rows) {
    if (row[0] === what) return row[1];
  }
  return 0;
}
/* That Pokemon's own top row for a section. Rows arrive sorted descending, so
   this is row 0 and not a scan. */
function splitMax(name, kind){
  var s = splitsFor(name);
  var rows = s?.[kind];
  return rows?.length ? rows[0][1] : 0;
}
/* A chip, emphasised RELATIVE to that Pokemon's own maximum - see above for
   why a fixed threshold cannot work across sections. */
/* What a usage share is a share OF, by the kind of column it came from. */
const SHARE_OF = {m: "of this Pokemon's move slots", t: "of its teams also carried this"};
function usageTag(pct, name, kind){
  if (pct == null) return null;
  var top = splitMax(name, kind) || 100;
  var share = pct / top;
  var tone = "";
  if (share >= 0.5) tone = " ok";
  else if (pct === 0) tone = " warn";
  var t = el("span", "tag" + tone, pct + "%");
  var of = SHARE_OF[kind] || "of its sets";
  t.title = (pct === 0
        ? "In the table and at 0% — nobody brought this"
        : pct + "% " + of)
    + " · most-run is " + top + "%"
    + (splitsReg() ? " · " + splitsReg() + " tournaments" : "");
  return t;
}

/* --------------------------------------------------------- what WON, and with
   The top 8 of every World Championship, per division, with the exact set the
   Pokemon carried. Everything else in this app is a RATE - how often a thing
   is brought. This is a RESULT: this set, this placement, this player.

   IT IS FILED UNDER THE FORM THAT WAS REGISTERED, which is always the BASE
   one - measured, not assumed: of the 16,875 team slots pokedata publishes,
   exactly zero are written as "Mega something". Takuma Yamazaki won 2026 with
   "Floette [Eternal Flower] @ Floettite", so Floette is who wears the medal.

   This was the other way round for an afternoon and the player corrected it:
   "la base tener la medalla y por consiguiente por el item se sabe que es
   mega". Filing it under the Mega invents an entrant that was never on the
   sheet, and makes a search for Floette come back empty about the team that
   won with one.

   NOTHING IS LOST. The stone is in the set, and the stone settles it - so the
   Mega it becomes and the single ability it gains are both derived for you in
   build_tracker_data.py rather than left as an exercise. The recorded ability
   is the BASE one and that is correct, never mislabelled: it is what the
   Pokemon has until it evolves, and when to evolve is a real decision because
   that ability is doing something until then. */
function podiumFor(name){
  return C.PODIUM?.[name] || [];
}
/* The single best finish, as a chip. A Pokemon that has been top 8 eighteen
   times cannot wear eighteen badges, so the row wears its best and the sheet
   lists them all. */
function podiumChip(name){
  var all = podiumFor(name);
  if (!all.length) return null;
  var best = all[0];
  all.forEach(function(e){
    if (e.r < best.r || (e.r === best.r && e.y > best.y)) best = e;
  });
  var place = ordinal(best.r);
  var t = el("span", "tag" + (best.r <= 3 ? " gold" : ""),
             "Worlds " + best.y + " · " + place);
  t.title = "Top 8 at " + all.length + " World Championship" +
    (all.length === 1 ? "" : "s") + ": " +
    all.map(function(e){
      return e.y + " " + e.d + " #" + e.r;
    }).join(", ") + ". Open it to see the sets.";
  return t;
}

/* ------------------------------------------------------ nothing cut silently

   NO LIST MAY SHOW FEWER ROWS THAN IT HAS WITHOUT SAYING SO.

   Every picker in the app capped itself and none of them mentioned it: the
   species list in the damage calculator drew 50 of 345 forms, the team's item
   picker 60 of 118, a Pokemon's own movepool 60 - and 131 of the 264
   learnsets in Champions are longer than 60, so half the dex was quietly
   losing moves off the end. The player found it on Rillaboom, 67 moves and 60
   drawn: "no se alcanza a ver toda en el movil, se corta".

   A cap is sometimes right - 512 move rows is too many to draw on a phone -
   but a cap nobody can see is indistinguishable from a Pokemon that does not
   learn the move. This says it, in the same words everywhere. */
function capNote(host, shown, total, what){
  if (shown >= total) return null;
  var n = el("div", "sub");
  n.style.margin = "6px 0 0";
  n.textContent = "Showing " + shown + " of " + total + " " + what +
                  " — type above to narrow the list.";
  host.appendChild(n);
  return n;
}

/* ONE SEARCH BOX, AND EVERY LIST GETS ONE.

   Eight copies of the same six lines - a div, an inline magnifier, an input -
   had grown across the app, so a screen only got a search box if whoever wrote
   it remembered to paste them. The team's build picker did not:

     "el selector de slot no tiene buscador! imaginate tener 100 builds
      diferentes y tener que deslizar, es mucho tiempo perdido. yo necesito que
      todos los menus de busqueda de cualquier cosa puedan tener un search y/o
      filtros"  (player, 2026-09-21)

   A helper makes adding one a line rather than a paste, which is the only way
   "every list" stays true of the next list as well.

   It carries its own clear button rather than relying on `type=search`: the
   native one is drawn by the browser inside our own border, Safari hides it
   the moment a search field is restyled, and a filter you cannot empty in one
   tap is a filter you stop using. */
function addClear(wrap, inp){
  if (!wrap || !inp || wrap.querySelector(".clr")) return;
  var clr = el("button", "clr", "×");
  clr.type = "button";
  clr.title = "Clear";
  clr.setAttribute("aria-label", "Clear the filter");
  wrap.appendChild(clr);
  function paint(){ wrap.classList.toggle("has", !!inp.value); }
  /* WRAPS whatever handler is already on the field rather than replacing it.
     The seven boxes written straight into the markup are wired in 13-boot,
     and this pass runs over them afterwards - taking `oninput` would have
     silently unwired all seven. */
  var prev = inp.oninput;
  inp.oninput = function(e){ paint(); if (prev) prev.call(inp, e); };
  clr.onclick = function(e){
    /* guarded: a test, or any code, may call this handler directly */
    if (e) { e.preventDefault(); e.stopPropagation(); }
    inp.value = "";
    /* through the field's own handler, so the list redraws exactly as it does
       for a keystroke - there is no second code path to keep in step */
    if (inp.oninput) inp.oninput(e);
    inp.focus();
  };
  paint();
}

/* Every search box written straight into the markup gets the same clear
   button, so the two ways a field can be born look identical on screen. */
function wireClears(root){
  var wraps = (root || document).querySelectorAll(".search");
  Array.prototype.forEach.call(wraps, function(w){
    var inp = w.querySelector("input");
    if (inp) addClear(w, inp);
  });
}

function searchField(host, placeholder, onInput){
  var wrap = el("div", "search field");
  wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/>'
                 + '<path d="m20 20-3.5-3.5"/></svg>';
  var inp = el("input");
  inp.type = "text";
  inp.placeholder = placeholder || "Search";
  inp.setAttribute("aria-label", inp.placeholder);
  /* a filter box is not a name being typed for the first time - autocorrect
     and a capital letter on a phone both fight what is being typed here */
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "none");
  inp.setAttribute("autocorrect", "off");
  inp.setAttribute("spellcheck", "false");
  wrap.appendChild(inp);
  if (onInput) inp.oninput = onInput;
  addClear(wrap, inp);
  if (host) host.appendChild(wrap);
  inp.wrap = wrap;
  /* the value, lowercased and trimmed - every caller was writing this out */
  inp.q = function(){ return inp.value.trim().toLowerCase(); };
  return inp;
}

/* ------------------------------------------------------- what leaves here --
   The surface of this part. Everything not named below is private to the file:
   `slug` (freeSlug is the only caller) and `toastT` (toast's own timer).

   Until the module pass this list did not exist - every one of these names, and
   the two private ones, was a global that any of the thirteen parts could read
   or overwrite. */
export {
  $, C, COSTS, DEX, FORMS, MEGAS_OF, MOVES, MOVE_BY, STAT_KEYS, STAT_LABEL,
  STONE_OF, TYPE_COLOR, TYPE_COLOR2, TYPE_INK, bst, byName, capNote, catName,
  defence, dexLabel, dexNo, el, freeSlug, anyRow, battleFormsOf, cardLine,
  formInk, formMoves, labelBox, learnset, pokeFacts, outsideRow, searchField,
  formSprite, spriteFor, statGrid, wireClears, typeSkin, effectLine, numText,
  podiumChip, podiumFor, splitPct, splitsFor, splitsReg, usageTag, megaLine,
  pokeCard, megasFor, natMult, rowMatches, sortRows, statAt, toast, typeChip,
  VIEW, ordinal, plural,
};
