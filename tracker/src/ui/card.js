/* THE Pokemon card, drawn the same everywhere, and the pieces it is made
   of: type colours, the stat table, facts, badges and usage chips.

   One card for every screen on purpose: when each screen drew its own, the
   same Pokemon showed six stats on one and a name and a BST on the next. A
   screen that needs something extra passes it in (pokeCard's options); it
   never draws a card of its own. */
import {
  anyRow, battleFormsOf, bst, C, dexLabel, formMoves, megasFor, ordinal, outsideForms,
  podiumFor, SHARE_OF, splitMax, splitsReg, SPRITE_BASE, STAT_KEYS,
  STAT_LABEL, TYPE_COLOR, TYPE_COLOR2, TYPE_INK,
} from "../core/data.js";
import { el } from "../core/dom.js";
import { ORIGIN_LABEL, originOf } from "../core/state.js";

/* A type's colour as rgba, so a card can be tinted with it without needing
   color-mix - which would add a newer browser requirement than anything else
   this page relies on. Returns null when the colour is not a #rrggbb hex. */
function tintOf(h, alpha){
  if (h?.charAt(0) !== "#" || h.length !== 7) return null;
  return "rgba(" + Number.parseInt(h.slice(1, 3), 16) + "," +
                   Number.parseInt(h.slice(3, 5), 16) + "," +
                   Number.parseInt(h.slice(5, 7), 16) + "," + alpha + ")";
}
/* THE TYPE'S COLOURS, as the custom properties the band and the tint read
   (--tcol* and --tsoft*). The card sets them on itself; a Mega layer sets
   them on itself too, and since a property set on a node beats the one it
   inherits, the same CSS paints both - in each one's own colours. A tint
   that cannot be made is written as transparent rather than left unset,
   or a layer would inherit the card's.

   FOUR COLOURS, because a dual type has four: each type's top tone and its
   bottom tone (Flying, Ground and Dragon really have two; the rest repeat
   one). The band's LEFT half is type 1 and its RIGHT half type 2, each split
   top-to-bottom by that type's own tones - a dual type is its own colour, not
   its first half. A mono type puts type 1 in both halves, so its band halves
   top-to-bottom exactly as its official badge does. */
function paintTypeColours(node, types){
  const mono = !types[1];
  const c1 = TYPE_COLOR[types[0]];
  const top1 = c1, bot1 = TYPE_COLOR2[types[0]] || c1;
  const top2 = mono ? top1 : TYPE_COLOR[types[1]];
  const bot2 = mono ? bot1 : (TYPE_COLOR2[types[1]] || top2);
  node.style.setProperty("--tcol", c1);     /* solid, for borders */
  node.style.setProperty("--tcolb", bot1);
  node.style.setProperty("--tcol2", top2);
  node.style.setProperty("--tcol2b", bot2);
  /* the tint behind the card fades through the same tones, half by half,
     so the shading under the band matches the band */
  const s1 = tintOf(top1, 0.14), s1b = tintOf(bot1, 0.14) || s1;
  const s2 = tintOf(top2, 0.14) || s1, s2b = tintOf(bot2, 0.14) || s2;
  node.style.setProperty("--tsoft", s1 || "transparent");
  node.style.setProperty("--tsoftb", s1b || "transparent");
  node.style.setProperty("--tsoft2", s2 || "transparent");
  node.style.setProperty("--tsoft2b", s2b || "transparent");
}
/* Dress a row as a CARD wearing its Pokemon's type: the band across the top,
   the tint behind it, and its picture.

   It only adds - the caller's own classes stay, and that matters: the LEFT
   stripe still means origin (HOME-elastic, Champions-welded, rental) or
   ownership, which is a different fact from the type. Two edges, two facts.

   The card styling itself is scoped to `.cards`, so a row marked here and
   dropped into a plain `.list` simply stays a row. */
function typeCard(row, p, shiny){
  row.className += " card";
  const types = p?.types || [];
  const c1 = TYPE_COLOR[types[0]];
  if (!c1) return row;
  paintTypeColours(row, types);
  /* A marker class rather than `:has(.sprite)`: a browser without `:has()`
     drops the rule silently and the badges would run under the image. */
  const pic = spriteFor(p.name, false, shiny);
  if (pic) { row.appendChild(pic); row.className += " hassprite"; }
  return row;
}
/* One retyping layer, carrying the new typing's colours on itself - the
   same properties the card carries, so the same CSS paints it. */
function paintRetype(node, f){
  paintTypeColours(node, f.types || []);
  node.setAttribute("aria-hidden", "true");
  return node;
}
/* THE CARD CROSS-FADES TO EVERY TYPING ITS FORMS REACH - a Mega that retypes,
   or Castform's three weathers. The card is made of type colour, so a change
   of typing has to show in the colour itself. A form that keeps its typing
   adds nothing. The animation lives in the stylesheet; this only decides
   WHAT there is to fade to, and drops one layer in per new typing. */
function retypeLayer(row, base, forms){
  const bt = (base.types || []).join("/");
  /* every distinct new typing, once: two Megas landing on the same typing
     are one colour, not two */
  const seen = {};
  let list = [];
  (forms || []).forEach(function(f){
    const k = (f.types || []).join("/");
    if (k === bt || seen[k] || !TYPE_COLOR[(f.types || [])[0]]) return;
    seen[k] = 1;
    list.push(f);
  });
  if (!list.length) return;
  /* The stylesheet has keyframes for up to three. No species reaches four;
     if one ever does, it falls back to the plain two-state fade rather than
     a cycle with no keyframes. */
  if (list.length > 3) list = list.slice(0, 1);

  /* The colours live on each LAYER, not on the card: with several new
     typings the card could only carry whichever was written last. */
  const tints = document.createDocumentFragment();
  list.forEach(function(f, i){
    tints.appendChild(paintRetype(el("i", "retype i" + (i + 1)), f));
  });
  /* the tints go FIRST, over the card's own background and under everything
     the card is made of - the content sets its own stacking in the CSS */
  row.insertBefore(tints, row.firstChild);
  /* THE RING (the card's frame) IS A LAYER OF ITS OWN, painted ABOVE the base
     ring and fading in over it. Fading the base ring out while the new one
     fades in does not work: two layers at 0.5 opacity cover only 75%, so the
     dark card would show through its own frame mid-fade. Each transition is
     therefore one moving layer over something solid - in a cycle, layer 2
     rises while layer 1 is still solid, and only the last fades out, over
     the base. A pseudo-element cannot do this: `::after` is generated last,
     so the base ring would always sit above `.retype`. */
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
/* ------------------------------------------- naming a form on the card ----
   A Mega is not the only thing a Pokemon turns into: a battle form (Blade,
   Hero, Sunny...) changes stats or typing off an ability. These three helpers
   take either kind of FORM, and everything downstream - the type arrow, the
   stat deltas, the sprite caption - is keyed off them.

   Champions writes exactly four Mega shapes: plain **Mega**, **Mega X**,
   **Mega Y** and **Mega Z** (a second Mega on a species that already had
   one). There is no "Mega M".

   megaSuffix  the letter the game writes: "X", "Y", "Z", "" for a plain Mega,
               or a battle form's own name
   formKey     the same, but never blank, for a label that must tell two forms
               apart (a stat delta, a sprite caption): "mega", "x", "blade"...
   formInk     the class that colours a form wherever it is named - mk-x,
               mk-y, mk-z, mk-m (plain Mega) or mk-b (battle form) */
function megaSuffix(m, base){
  if (m?.battle) return m.battle;          /* Blade, Hero, Sunny... */
  if (m?.sfx !== undefined) return m.sfx;  /* an outside Mega's letter */
  const sp = (base && (base.species || base.name)) || "";
  return String(m.name).replace("Mega ", "").replace(sp, "").trim();
}
function formInk(m, base){
  if (m?.battle) return "mk-b";
  const k = megaSuffix(m, base).toUpperCase();
  return "mk-" + (k === "X" || k === "Y" || k === "Z" ? k.toLowerCase() : "m");
}
function formKey(m, base){
  if (m?.battle) return m.battle.toLowerCase();
  return megaSuffix(m, base) || "mega";
}

/* THE SIX STATS AS A TABLE, so two numbers can be lined up against each
   other - a sentence of them gets read rather than scanned.

   `p` is a Pokemon or a bare array of six (the calculator holds raw spreads).
   `mark` is a stat key to highlight, for a list ranked by one. `megas` is the
   form line: each form that moves any stat gets one extra row, in its own
   ink, under every cell it changes. */
function statGrid(p, mark, megas){
  const b = p?.b || p || [];
  const sl = el("div", "statline");
  STAT_KEYS.forEach(function(k, i){
    const cell = el("div", mark === k ? "on" : null);
    cell.appendChild(el("b", null, b[i]));
    cell.appendChild(el("span", "lbl", STAT_LABEL[k]));
    /* ONE ROW PER FORM, ALWAYS IN THE SAME ORDER, with a blank where that form
       does not move the stat - so row two is the same Pokemon in all six
       cells and the table reads across as well as down. Two forms landing on
       the same value both show it: each row says whose it is.

       A form that moves NOTHING gets no row at all (Castform's weathers change
       typing, not stats): its row would be blank in every cell. */
    const moved = (megas || []).filter(function(m){
      return m.b?.some(function(v, j){ return v !== b[j]; });
    });
    const line = moved.length > 1;
    moved.forEach(function(m){
      if (m.b[i] === b[i]) {
        /* The blank has the SAME SHAPE as a real delta - a key above a
           number, two lines - or every later row would sit half a line
           off. It carries a hidden key of its own for that. */
        if (line) {
          const gh = el("span", "mg ghost");
          gh.appendChild(el("span", "mgk", formKey(m, p)));
          gh.appendChild(document.createTextNode("—"));
          cell.appendChild(gh);
        }
        return;
      }
      /* The number itself carries the form's ink, and with two or more
         forms a key (X, Y, "mega"...) says whose it is - two bare arrows in
         one cell say nothing about which is which. */
      const d = el("span", "mg " + formInk(m, p) +
                         (m.b[i] > b[i] ? " up" : " down"));
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
/* ONE LABELLED CELL, the same box the stat table is made of, so BST, the
   ability and anything else a card states share one visual language.

   `cls` takes "wide" for a value that is a WORD rather than a number - an
   ability, a nature - which needs the sans face and room to breathe; a number
   keeps the tabular mono the stat cells use, so columns of them line up. "on"
   marks the cell the list is currently ranked by, exactly as in statGrid. */
function labelBox(value, label, cls){
  const d = el("div", cls || null);
  const b = el("b");
  /* AN ARRAY BREAKS ONLY BETWEEN ITS ITEMS: each item is an unbreakable span
     and only the " / " may wrap, so "Sticky Hold" never splits across two
     lines and reads as two abilities. */
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
  const row = el("div", "cardline");
  cells.filter(Boolean).forEach(function(c){ row.appendChild(c); });
  return row;
}
/* THE FACTS OF A POKEMON, appended to `m`: the type chips and what each form
   swaps them to, BST beside the base abilities, one box per Mega ability in
   its own ink, and the six stats with every form on its own row.

   Shared by the card and by the sheet that opens when a card is tapped, so
   the two can never show different facts. `ms` is the form line (Megas and
   battle forms), passed in because the caller has already decided whether
   there is one to show; `o` is pokeCard's options. */
function pokeFacts(m, p, ms, o){
  o = o || {};
  const label = o.name || p.name;
  /* --- the meta line -------------------------------------------------- */
  const meta = el("div", "rmeta");
  /* The dex number lives on this line, not the name line: measured, moving
     it there wraps the names that carry a Worlds tag onto two lines. */
  if (o.dex !== false) meta.appendChild(el("span", "mono", dexLabel(label)));
  (p.types || []).forEach(function(t){ meta.appendChild(typeChip(t)); });
  /* A FORM'S TYPES ONLY WHEN IT REALLY SWAPS THEM - repeating an unchanged
     pair is noise. A battle form always names itself on its arrow ("-> sunny
     FIRE"), since a bare arrow reads as a stone; a lone Mega needs no
     letter, there being nothing to tell it apart from. */
  ms.forEach(function(mm){
    if (mm.types.join("/") === p.types.join("/")) return;
    const arrow = el("span", "megato " + formInk(mm, p));
    arrow.textContent = "→" +
      ((mm.battle || ms.length > 1) ? " " + formKey(mm, p) : "");
    meta.appendChild(arrow);
    mm.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
  });
  if (o.meta) o.meta(meta);
  m.appendChild(meta);

  /* --- BST, abilities, and what the Mega makes of them ---------------- */
  /* "465 -> 565": every distinct BST the forms reach, once each */
  const seen = {};
  let bstTxt = String(bst(p));
  ms.forEach(function(mm){
    const v = bst(mm);
    if (v === bst(p) || seen[v]) return;
    seen[v] = 1;
    bstTxt += " → " + v;
  });
  /* The BASE abilities only - each Mega's gets its own box below, so one cell
     never describes three different Pokemon. `abValue` replaces the list
     with the one ability a BUILD runs: a build is one decision, and its card
     must not also offer the abilities it did not choose. */
  m.appendChild(cardLine([
    labelBox(bstTxt, "BST", o.mark === "bst" ? "on" : null),
    labelBox(o.abValue !== undefined ? o.abValue : (p.ab || []),
             o.abLabel || "Possible ability", "wide")
  ].concat(o.cells || [])));
  /* ONE BOX PER MEGA, on a line of their own, labelled in that Mega's ink so
     the box, the sprite caption and the stat deltas are tied together by
     colour. A stone REPLACES the ability, so this is a fact the card has
     nowhere else.

     NO BOX FOR A BATTLE FORM: the ability that flips it is the one already
     printed above (each has exactly one), so a box would say it twice. The
     sheet's "In battle" block names it. */
  const megasOnly = ms.filter(function(mm){ return !mm.battle; });
  if (megasOnly.length) {
    m.appendChild(cardLine(megasOnly.map(function(mm){
      const sfx = megaSuffix(mm, p);
      const cell = labelBox(mm.ab || [],
        (sfx ? "Mega " + sfx : "Mega") + " ability", "wide");
      const lbl = cell.querySelector(".lbl");
      if (lbl) lbl.className = "lbl " + formInk(mm, p);
      /* Whether the stone is OWNED is deliberately not said on the card: a
         stone is an item, and the Items tab is the one place that tracks
         items. This box is about the ability, true with or without it. */
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
/* ============================================================ THE CARD ===
   ONE Pokemon CARD, drawn one way, wherever a Pokemon appears: its type skin
   and pictures, the name line, and pokeFacts().

   `p` is the row to DRAW - a Champions dex row, or an outsider's row from
   PokeAPI (anyRow), which is why nothing here asks whether the game allows
   it.

   Options, all optional:
     cls       extra classes for the element (origin stripe, "illegal", ...)
     tag       "button" (default) or "div" for a card nobody clicks
     name      the label to show, when it is a box row's own name
     shiny     draw the shiny palette - his copy's colours, not the species'
     dex       false drops the dex number chip
     mark      a stat key (or "bst") to highlight, for a list ranked by one
     megas     false leaves out the Megas (the build card: a build shows one
               configuration). Battle forms stay, because no build declines
               them - an Aegislash attacks at 140 whatever its set
     stats     false leaves the six-stat table to the caller
     abLabel   "Possible ability" (default) or "Ability" where one is chosen
     abValue   the ONE ability this set runs, instead of the species list
     cells     extra labelBox cells for the line above the stats
     pre       fn(nameLine)  - a rank number, before the name
     badges    fn(nameLine)  - tags that belong on the name
     meta      fn(metaLine)  - chips that belong beside the types
     notes     fn(cardBody)  - the .st lines underneath
     onclick   what tapping it does                                        */
function pokeCard(p, o){
  o = o || {};
  const row = typeCard(el(o.tag || "button", "row" + (o.cls ? " " + o.cls : "")),
                     p, !!o.shiny);
  const m = el("div", "rmain");
  const label = o.name || p.name;

  /* --- the name line ------------------------------------------------- */
  const h = el("div", "rname");
  if (o.pre) o.pre(h);
  h.appendChild(document.createTextNode(label));
  if (o.badges) o.badges(h);
  /* THE FORM LINE IS MEGAS AND BATTLE FORMS TOGETHER: everything below - the
     type arrow, the BST arrow, the stat deltas, the strip of sprites - asks
     the same question of both: what does this Pokemon turn into. A Mega
     drawn as itself has no form line of its own. */
  const megas = (o.megas === false || p.mega) ? [] : megaLine(p);
  const ms = megas.concat(battleFormsOf(p));
  /* No Mega chips on the name: the strip of sprites shows each form, in its
     own ink, better than a "MEGA X" tag could. */
  const med = podiumChip(label);
  if (med) h.appendChild(med);
  m.appendChild(h);

  pokeFacts(m, p, ms, o);
  /* the colour shows a change of typing too - the CARD's job, not the
     facts': a sheet has no band or frame to cross-fade */
  retypeLayer(row, p, ms);
  /* No row for this exact form: a caveat about the numbers themselves. */
  if (p.approx) {
    const src = el("div", "st mt6");
    src.textContent = "No row for this exact form — showing " + p.approx + ".";
    m.appendChild(src);
  }
  if (o.notes) o.notes(m);
  row.appendChild(m);

  /* --- the sprites ---------------------------------------------------- */
  /* EVERY CARD PUTS ITS SPRITES IN A STRIP ACROSS THE TOP, whether there is
     one of them or three, so every card in a grid has the same shape and the
     names line up across a row. Sprites are drawn at native size and nothing
     shrinks them, which is why a corner could only ever hold one. The strip
     also leaves the text its full width.

     A lone sprite carries no caption: "base" only means something beside the
     thing it is not. */
  const strip = el("div", "megapics");
  const self = spriteFor(p.name, false, !!o.shiny);
  if (self) {
    self.className = "megapic";
    self.title = p.name;
    const c0 = el("div", "megapicwrap");
    c0.appendChild(self);
    if (ms.length) c0.appendChild(el("span", "megapickey base", "base"));
    strip.appendChild(c0);
  }
  ms.forEach(function(mm){
    const mp = formSprite(mm, p, false, !!o.shiny);
    if (!mp) return;
    mp.className = "megapic";
    /* WHAT THE FORM DOES TO ITS MOVES rides on the picture's title, the one
       place on a card with room for a sentence: "Morpeko-Hangry - Hunger
       Switch - Aura Wheel is Dark". The sheet says it in full. */
    mp.title = [mm.name, mm.battle && mm.by].concat(formMoves(mm, p).map(
      function(c){ return c[0] + " is " + c[2]; })).filter(Boolean).join(" - ");
    const cell = el("div", "megapicwrap");
    cell.appendChild(mp);
    /* A battle form is captioned with its own name, never "mega": calling
       Blade Forme a Mega would be a lie about how it is reached. */
    let key = "mega";
    if (mm.battle) key = mm.battle.toLowerCase();
    else if (megaSuffix(mm, p)) key = "mega " + megaSuffix(mm, p);
    cell.appendChild(el("span", "megapickey " + formInk(mm, p), key));
    strip.appendChild(cell);
  });
  if (strip.children.length) {
    row.classList.add("hasline");
    row.classList.remove("hassprite");
    /* typeCard already pinned a sprite to the corner; dropping the class
       only stops it narrowing the text, so the image itself goes too or the
       Pokemon would appear twice. */
    const corner = row.querySelector("img.sprite");
    if (corner) corner.remove();
    row.insertBefore(strip, row.firstChild);
  }
  if (o.onclick) row.onclick = o.onclick;
  return row;
}
/* The Megas a card shows for `p`: none for a Mega drawn as itself, the
   game's own for a Champions species (megasFor), and for a species
   Champions lacks, the ones on its outside row - main-series numbers, like
   the row itself, and never offered anywhere a Champions stone is. */
function megaLine(p){
  if (!p || p.mega) return [];
  return p.outside ? outsideForms(p, true) : megasFor(p.name);
}
/* ONE PLACE THAT KNOWS WHAT A TYPE LOOKS LIKE: its fill, halved the way
   pokemon.com halves it for the types with two tones, and its OWN ink - the
   text colour is the type's, never a fixed white, or Electric and Ground
   would be white on yellow. Every chip, filter and badge that shows a type
   goes through here.

   `on` false leaves the fill off and keeps only the edge, which is what an
   unselected filter is. */
function typeSkin(node, t, on){
  /* a type the palette does not know still reads as a chip: plain grey */
  const a = TYPE_COLOR[t] || "#777", b = TYPE_COLOR2[t];
  node.style.borderColor = a;
  if (on === false) { node.style.background = ""; node.style.color = ""; return node; }
  node.style.background = (b && b !== a)
    ? "linear-gradient(180deg," + a + " 50%," + b + " 50%)" : a;
  node.style.color = TYPE_INK[t] || "#FFFFFF";
  return node;
}
function typeChip(t){ return typeSkin(el("span", "t", t), t); }
/* ---------------------------------------------------------- the pictures ---
   TWO SETS, AND THE REASON IS RESOLUTION, NOT TASTE.

     pokemon/<id>.png        96x96,   ~1.3 KB  - the pixel sprite
     other/home/<id>.png     512x512, ~130 KB  - the HOME render

   A list draws up to ~160 at once, so it gets the small one; a SHEET draws
   one (`big`), where the render's detail is really there. Drawing the pixel
   sprite larger adds nothing: it has 96 pixels and no more.

   `shiny` asks for the shiny picture, which both sets carry. Only a caller
   holding a specific copy (a box row, a HOME row, a trade) asks for it; a
   search draws the species, in its ordinary colours. */
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
  const own = form.sp ||
    C.FORM_SPRITE?.[base?.name]?.[form.name];
  return own ? spriteImg(own, big, shiny) : spriteFor(form.name, big, shiny);
}
/* THE ID IS THE FILE NAME: a number for a row's own picture, "493-ice" for
   one filed by form (Arceus' plates, Silvally's memories, Cherrim in the
   sun).

   NOT EVERY PICTURE IS IN BOTH SETS. C.SPRITE_GAPS lists, per set, the ids
   missing at the pinned commit (measured by fetch_home_dex.py), so the page
   asks for the one that exists instead of drawing a 404 and then nothing. */
function spriteImg(id, big, shiny){
  if (!id) return null;
  const g = C.SPRITE_GAPS || {};
  const gone = function(k){ return (g[k] || []).includes(id); };
  /* The big picture prefers the HOME render and falls back to the pixel
     sprite; the small one is the pixel sprite unless that one is missing. */
  let home;
  if (big) home = !gone(shiny ? "s" : "n");
  else home = gone(shiny ? "ps" : "p");
  let cls = "sprite";
  if (big) cls = home ? "sprite big" : "sprite big native";
  const img = el("img", cls);
  img.src = SPRITE_BASE + (home ? "other/home/" : "") + (shiny ? "shiny/" : "")
            + id + ".png";
  img.alt = "";                       /* the name is right beside it */
  /* THE BOX IS THE SLOT'S, whichever set filled it: a 512 render drawn in a
     card's 96 is downscaled with smoothing, which a render survives and a
     pixel sprite would not - and a sheet whose render is missing draws the
     pixel one at its own 96 rather than blowing it up to 180. */
  const px = big && home ? 180 : 96;
  img.width = px; img.height = px;
  img.loading = "lazy";               /* only what is actually on screen */
  img.decoding = "async";
  /* OFFLINE IS A NORMAL STATE for this app, and a broken-image glyph would be
     worse than no picture. The card is built to read without it. */
  img.onerror = function(){ img.remove(); };
  return img;
}

/* ----------------------------------------------------- what a thing DOES ---
   As a number, not as an adjective: "restores 1/16 of max HP", never "slowly
   restores HP".

   C.EFFECTS carries, for an item, an ability or a move:

     desc  Smogon's own sentence
     c     the chips - one per FACT, each already carrying its subject

   THE CHIPS ARE DECIDED IN scripts/effect_chips.py, not here. Merging the
   engine's measurements with the numbers in the sentence (so one fact never
   shows twice, or twice with different roundings - the engine works in
   4096ths) needs data that does not belong on a phone. What arrives here is
   [text, why] and is drawn as it is. */

/* A DESCRIPTION WITH ITS NUMBERS MARKED in colour, so the eye finds them in
   the sentence: a percentage, a fraction, a multiplier, a count of turns or
   stages, and the words that are numbers (halved, doubled...). This is what
   replaced chips that repeated the sentence's own numbers. Built from text
   nodes, never innerHTML: the text is scraped, and a scraped string is not
   markup. */
/* a number, a fraction or a percentage, with its unit when one follows */
const NUMBER = /\d+(?:\.\d+)?(?:\/\d+)?(?:\s?[%×])?(?:\s(?:turns?|stages?)\b)?/;
/* the words that are numbers */
const NUMBER_WORDS = /\b(?:halved|halves|doubled|doubles|quartered|tripled)\b/;
const NUM_RE = new RegExp(NUMBER.source + "|" + NUMBER_WORDS.source, "g");
function numText(text, tag, cls){
  const node = el(tag || "span", cls || null);
  const s = String(text == null ? "" : text);
  let last = 0, m;
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
/* A row of them, with the source behind each on hover, then the sentence. */
function effectLine(name){
  const e = effectOf(name);
  if (!e) return null;
  const chips = effectChips(e);
  if (!chips.length && !e.desc) return null;
  const box = el("div", "st mt2");
  chips.forEach(function(c){
    const t = el("span", "tag ok", c.text);
    t.title = c.why;
    t.classList.add("mr4");
    box.appendChild(t);
  });
  if (e.desc) {
    const d = el("span", "fxdesc", e.desc);
    box.appendChild(d);
  }
  return box;
}
/* A usage percentage as a chip, emphasised RELATIVE to that Pokemon's own
   top row for the section (core/data.js explains why a fixed threshold
   cannot work), with the denominator and source on hover. 0% is a measured
   "nobody", shown as a warning; null (no table) draws nothing. */
function usageTag(pct, name, kind){
  if (pct == null) return null;
  const top = splitMax(name, kind) || 100;
  const share = pct / top;
  let tone = "";
  if (share >= 0.5) tone = " ok";
  else if (pct === 0) tone = " warn";
  const t = el("span", "tag" + tone, pct + "%");
  const of = SHARE_OF[kind] || "of its sets";
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
  const all = podiumFor(name);
  if (!all.length) return null;
  let best = all[0];
  all.forEach(function(e){
    if (e.r < best.r || (e.r === best.r && e.y > best.y)) best = e;
  });
  const place = ordinal(best.r);
  const t = el("span", "tag" + (best.r <= 3 ? " gold" : ""),
             "Worlds " + best.y + " · " + place);
  t.title = "Top 8 at " + all.length + " World Championship" +
    (all.length === 1 ? "" : "s") + ": " +
    all.map(function(e){
      return e.y + " " + e.d + " #" + e.r;
    }).join(", ") + ". Open it to see the sets.";
  return t;
}

/* Everything that distinguishes one copy from another, in one place: the box
   list and the GTS picker both call it, so a mark added here shows up in both. */
function boxBadges(node, rec){
  if (rec.shiny) {
    const sh = el("span", "tag shiny", "shiny");
    node.appendChild(sh);
  }
  if (rec.trained) node.appendChild(el("span", "tag ok", "trained"));
  if (rec.status === "rental") node.appendChild(el("span", "tag warn", "rental"));
  else if (rec.location === "champions") {
    const o = originOf(rec);
    node.appendChild(el("span", "tag" + (o === "home" ? " ok" : ""),
                        ORIGIN_LABEL[o]));
  }
  return node;
}

/* A species Champions does not have, on THE SAME CARD: picture, typing and
   six stats from PokeAPI, which is what lets a HOME shelf be planned at all.
   A name with no numbers at all keeps a plain row. Every screen draws it
   through here, so "not in Champions" is said in the same words everywhere. */
function outsideCard(n, onclick){
  const badges = function(h){ h.appendChild(el("span", "tag bad", "not in Champions")); };
  const notes = function(m){
    m.appendChild(el("div", "st", "It can live in HOME, but it can never be sent into Champions."));
  };
  const op = anyRow(n);
  if (op) return pokeCard(op, {cls:"illegal", name:n, badges, notes, onclick});
  const r = el("button", "row illegal");
  const m = el("div", "rmain");
  const h = el("div", "rname");
  h.appendChild(document.createTextNode(n));
  badges(h);
  m.appendChild(h);
  notes(m);
  r.appendChild(m);
  r.onclick = onclick;
  return r;
}

export {
  boxBadges, cardLine, effectLine, formInk, formSprite, labelBox, megaLine,
  numText, outsideCard, podiumChip, pokeCard, pokeFacts, spriteFor, statGrid, typeChip,
  typeSkin, usageTag,
};
