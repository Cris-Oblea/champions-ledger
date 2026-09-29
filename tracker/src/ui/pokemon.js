/* One Pokemon's full sheet - stats, abilities, damage taken, forms,
   movepool - and Smogon's analysis panel inside it. */
import {
  ANALYSIS_STATE, analysisFor, loadAnalysis, loadOutside, outsideDex,
  outsideMove, outsideMovesFor,
} from "../core/assets.js";
import {
  battleFormsOf, bst, C, catName, defence, formMoves, learnset, MOVE_BY,
  ordinal, podiumFor, STAT_KEYS, STAT_LABEL, STONE_OF,
} from "../core/data.js";
import { el } from "../core/dom.js";
import { FIND } from "../core/state.js";
import {
  cardLine, effectLine, formInk, formSprite, labelBox, megaLine, numText,
  podiumChip, pokeFacts, spriteFor, statGrid, typeChip,
} from "./card.js";
import {
  AB_SET, abilityTag, factLine, moveFilters, moveRowFor,
} from "./moves.js";
import { openSheet } from "./nav.js";

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
    if (wait.parentNode) wait.remove();
    var got = analysisFor(name);
    if (!got?.length) {
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
  var also = C.COSMETIC?.[p.name];
  if (also?.length) {
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

  /* THE PROSE NOTE THAT USED TO SIT HERE IS GONE. It said "In battle it
     changes. Stance Change: Blade - Atk 50 -> 140, Def 140 -> 50..." in one
     grey line, which was the whole of what the app knew about a battle form
     while there was nowhere better to put it. There is now: the block below
     the Mega line draws the same fact as a form - its sprite, its typing, its
     six stats and its own damage table - so keeping the line as well printed
     it twice on the same sheet (seen on the sheet, 2026-09-21). */
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
  var say = numText(C.ABIL[a] || "");
  n.appendChild(say);
  if (!C.ABIL[a]) {
    say.textContent = "Loading…";
    loadOutside(function(){
      var t = outsideDex().ab?.[a];
      say.textContent = "";
      say.appendChild(numText(t || "No description on record for " + a + "."));
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
  /* NOT r.why HERE. It is the rule's one-line summary - "no damage - it heals
     25% instead" - written for the tooltip on a move's tag, where the
     description is not on screen. Under the description it said the same
     thing a second time (player, 2026-09-27: "en algunas abilities habian
     descripciones duplicadas y eran obvias"). What stays is only what the
     description cannot say: how it meets THIS movepool. */
  if (r?.side === "off" && r.scope) {
    sc.textContent = "Affects " + r.scope + " it knows. No per-move tag: " +
                     "it picks out nothing.";
    n.appendChild(sc);
  } else if (r?.side === "off" && ls) {
    var k = ls.filter(function(mn){
      var mv = MOVE_BY[mn];
      return mv && abilityTag(a, mv, form);
    }).length;
    sc.textContent = k
      ? "Tags " + k + " of the " + ls.length + " moves it learns."
      : "Touches none of the moves it learns.";
    n.appendChild(sc);
  } else if (r?.side === "def") {
    sc.textContent = "Changes what lands on it, not its own moves.";
    n.appendChild(sc);
  }
  return n;
}

/* a damage multiplier's tone: taking more is bad, taking less is good */
function multTone(x){
  if (x > 1) return " bad";
  if (x < 1) return " ok";
  return "";
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
      "tag" + multTone(g[0]), g[1]));
    hits.forEach(function(t){ line.appendChild(typeChip(t)); });
    dl.appendChild(line);
  });
  return dl;
}

/* what a battle form changes, as the end of "<ability> ..." */
function formChange(moved, retype){
  if (moved.length) return " moves " + moved.join(", ") + ".";
  if (retype) return " changes the typing, not the spread.";
  return " moves no stat and keeps the typing.";
}
function pokeBody(body, p){

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
  /* megaLine, not megasFor: the same Champions Megas, plus the ones a
     species Champions lacks carries on its outside row - Mewtwo's X and Y */
  var ms = megaLine(p);
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
      var pic = formSprite(m, p, true);
      if (pic) head.appendChild(pic);
      var info = el("div", "sheetfacts");
      var h = el("div", "rname");
      h.appendChild(document.createTextNode(m.name));
      /* the stone is named, because it is what this block is about - but NOT
         whether it is owned. That lives in the Items tab and nowhere else.
         A Mega of a species Champions lacks has no stone in the game's item
         pool to name, and the sheet already says it is not in the dex. */
      if (STONE_OF[m.name]) h.appendChild(el("span", "tag mega", STONE_OF[m.name]));
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
  /* AND THE SAME BLOCK FOR THE FORM IT TAKES WITHOUT A STONE.

     A Mega is not the only thing a Pokemon turns into, and for two of these
     the base row is the most misleading number on the sheet: Stance Change
     gives Aegislash 140 Attack the moment it uses a damaging move, and Zero
     to Hero takes Palafin from 70 to 160. Castform changes TYPE instead,
     three ways, which is its whole defensive profile and its STAB - so it
     earns the same separate damage table a retyping Mega gets (player,
     2026-09-20: "faltan las formas de batalla... hay que incluir esas formas
     en las fichas, porque tambien son modificaciones in battle, como los
     megas").

     It is NOT a stone and must never read like one: no item tag, and the
     line underneath says which ability does it instead of what the stone
     moves. There is no choice to make here either - a Mega is a decision at
     team preview, this just happens. */
  var bfs = battleFormsOf(p);
  if (bfs.length) {
    body.appendChild(el("h2", null,
      bfs.length > 1 ? "In battle — " + bfs[0].by + " gives it "
                       + bfs.length + " more forms"
                     : "In battle — " + bfs[0].by));
    bfs.forEach(function(f){
      var retype = f.types.join("/") !== p.types.join("/");
      var pn = el("div", "panel megablock");
      pn.style.marginBottom = "10px";

      var head = el("div", "sheethead");
      var pic = formSprite(f, p, true);
      if (pic) head.appendChild(pic);
      var info = el("div", "sheetfacts");
      var h = el("div", "rname");
      h.appendChild(document.createTextNode(p.name + " — " + f.battle));
      h.appendChild(el("span", "tag bf", f.by));
      info.appendChild(h);

      var mt = el("div", "rmeta");
      f.types.forEach(function(t){ mt.appendChild(typeChip(t)); });
      info.appendChild(mt);
      /* NO ABILITY CELL. The ability is not something this form gains - it is
         the ability the Pokemon already has, and the sheet explained it in
         Abilities a few lines up. Repeating it is the duplication the Mega
         block was rebuilt to stop. */
      info.appendChild(cardLine([labelBox(bst(f), "BST")]));
      head.appendChild(info);
      pn.appendChild(head);

      pn.appendChild(statGrid(f));
      var moved = STAT_KEYS.map(function(k, i){
        return f.b[i] === p.b[i] ? null
             : STAT_LABEL[k] + " " + p.b[i] + " → " + f.b[i];
      }).filter(Boolean);
      pn.appendChild(el("div", "st",
        f.by + formChange(moved, retype)));
      /* WHAT IT DOES TO ITS MOVES, which for a form that moves no number is
         the whole reason it matters (player, 2026-09-27: "algunas formas
         determinan algunas habilidades o ataques, como aura wheel de morpeko
         cambia de tipo el move segun su forma"). Chips rather than words, the
         way every other type on the sheet is drawn. */
      formMoves(f, p).forEach(function(c){
        var line = el("div", "rmeta");
        line.style.marginTop = "6px";
        line.appendChild(el("span", null, c[0] + ":"));
        if (c[1]) line.appendChild(typeChip(c[1]));
        line.appendChild(el("span", "megato " + formInk(f, p), "→"));
        line.appendChild(typeChip(c[2]));
        line.appendChild(el("span", "st", "in this form"));
        pn.appendChild(line);
      });

      if (retype) {
        pn.appendChild(el("div", "st", "Takes damage differently:"));
        pn.appendChild(damageTable(f.types));
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
      var place = ordinal(e.r);
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
    var outsideHost = el("div");
    body.appendChild(outsideHost);
    outsideHost.appendChild(el("div", "st", "Loading what it knows..."));
    loadOutside(function(){
      outsideHost.innerHTML = "";
      var got = outsideMovesFor(p.name);
      if (!got) {
        outsideHost.appendChild(el("div", "st",
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
      outsideHost.appendChild(el("p", "sub",
        "Which moves it learns is main-series — Champions publishes no "
        + "page for a species it does not have. What each one DOES is "
        + "Champions' own row for that move."
        + (off ? " " + off + " of them are moves Champions has in its database "
           + "but has not enabled; they are marked." : "")));
      var ui2 = moveFilters(outsideHost, pool, function(){ drawOut(); },
                            "Filter " + pool.length + " moves it learns",
                            {cap: 200});
      var list2 = el("div", "list");
      outsideHost.appendChild(list2);
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
    pokeBody(body, p);
  }, []);
}

export { analysisPanel, findDetail, pokeBody, pokeHead };
