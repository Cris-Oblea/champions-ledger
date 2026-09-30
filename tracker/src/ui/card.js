/* THE Pokemon card, drawn the same everywhere, and the pieces it is made
   of: type colours, the stat table, facts, badges and usage chips. */
import {
  battleFormsOf, bst, C, dexLabel, formMoves, megasFor, ordinal, outsideForms,
  podiumFor, SHARE_OF, splitMax, splitsReg, SPRITE_BASE, STAT_KEYS,
  STAT_LABEL, TYPE_COLOR, TYPE_COLOR2, TYPE_INK,
} from "../core/data.js";
import { el } from "../core/dom.js";
import { ORIGIN_LABEL, originOf } from "../core/state.js";

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
/* One retyping layer, carrying the new typing's colours as the --m* custom
   properties: both halves of the band, and the soft tints behind them. */
function paintRetype(node, f){
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

  /* THE COLOURS LIVE ON THE LAYER NOW, not on the card. With one alternate
     typing the card could carry them, because there was one; with three the
     card would be carrying whichever was written last. The band reads them
     off its own parent either way. */
  var tints = document.createDocumentFragment();
  list.forEach(function(f, i){
    tints.appendChild(paintRetype(el("i", "retype i" + (i + 1)), f));
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
    row.appendChild(paintRetype(el("i", "retyperim i" + (i + 1)), f));
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
    var src = el("div", "st mt6");
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
  /* a type the palette does not know still reads as a chip: plain grey */
  var a = TYPE_COLOR[t] || "#777", b = TYPE_COLOR2[t];
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
/* a number, a fraction or a percentage, with its unit when one follows */
var NUMBER = /\d+(?:\.\d+)?(?:\/\d+)?(?:\s?[%×])?(?:\s(?:turns?|stages?)\b)?/;
/* the four words that are numbers */
var NUMBER_WORDS = /\b(?:halved|halves|doubled|doubles|quartered|tripled)\b/;
var NUM_RE = new RegExp(NUMBER.source + "|" + NUMBER_WORDS.source, "g");
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
  var box = el("div", "st mt2");
  chips.forEach(function(c){
    var t = el("span", "tag ok", c.text);
    t.title = c.why;
    t.classList.add("mr4");
    box.appendChild(t);
  });
  if (e.desc) {
    var d = el("span", "fxdesc", e.desc);
    box.appendChild(d);
  }
  return box;
}
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

/* A field you tap rather than type into. A typed name is a typo waiting to
   happen, and a typo here is not cosmetic: closing the trade matches the
   deposited Pokemon by name to know which one to remove. */
/* Everything that distinguishes one copy from another, in one place: the box
   list and the GTS picker both call it, so a mark added here shows up in both. */
function boxBadges(node, rec){
  if (rec.shiny) {
    var sh = el("span", "tag shiny", "shiny");
    node.appendChild(sh);
  }
  if (rec.trained) node.appendChild(el("span", "tag ok", "trained"));
  if (rec.status === "rental") node.appendChild(el("span", "tag warn", "rental"));
  else if (rec.location === "champions") {
    var o = originOf(rec);
    node.appendChild(el("span", "tag" + (o === "home" ? " ok" : ""),
                        ORIGIN_LABEL[o]));
  }
  return node;
}

export {
  boxBadges, cardLine, effectLine, formInk, formSprite, labelBox, megaLine,
  numText, podiumChip, pokeCard, pokeFacts, spriteFor, statGrid, typeChip,
  typeSkin, usageTag,
};
