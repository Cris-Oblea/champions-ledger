/* One Pokemon's full sheet - stats, abilities, damage taken, forms,
   movepool - and Smogon's analysis panel inside it.

   ONE SHEET, WHICHEVER DOOR OPENED IT: the Champions box, HOME and a search
   result all draw it with pokeHead + pokeBody, so which screen you came from
   never decides what you are allowed to know. A door adds only its own
   controls, between the two halves (see pokeHead). */
import {
  analysisFor, loadAnalysis, loadOutside, outsideDex,
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
  const box = el("div", "note mb8");
  const head = el("div", "rname");
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
  const mv = (st.moves || []).map(function(slot){
    return Array.isArray(slot) ? slot.join(" / ") : String(slot);
  }).filter(Boolean);
  if (mv.length) {
    const row = el("div", "st mt2");
    mv.forEach(function(m){
      const t = el("span", "tag ok mr4", m);
      row.appendChild(t);
    });
    box.appendChild(row);
  }
  (st.sp || []).forEach(function(sp){
    const bits = STAT_KEYS.map(function(k){
      return sp[k] ? sp[k] + " " + STAT_LABEL[k] : null;
    }).filter(Boolean);
    if (!bits.length) return;
    const total = STAT_KEYS.reduce(function(a, k){ return a + (sp[k] || 0); }, 0);
    const line = el("div", "st c-accent", bits.join(" / ") + "   ·   " + total + "/66 SP");
    box.appendChild(line);
  });
  if (st.why) box.appendChild(prose(st.why));
  return box;
}

/* Smogon's prose, laid out the way their page lays it out.
 *
 * It arrives as one block of lines, which reads as a wall. It is not
 * shapeless, though: three kinds of line, and telling them apart is what
 * makes it skimmable:
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
  const wrap = el("div", "mt6");
  String(text).split(/\n+/).forEach(function(line){
    line = line.trim();
    if (!line) return;
    const cut = line.indexOf(":");
    const label = cut > 0 ? line.slice(0, cut).trim() : "";
    /* A heading is short, has no colon and does not end like a sentence
       ("Other Options"); a label is short and does have a colon. Both tests
       are on SHAPE rather than on a list of known words, because Smogon's
       headings differ per Pokemon and a list would go stale. */
    if (!label && line.split(" ").length <= 5 && !/[.!?]$/.test(line)) {
      const h = el("div", "rname mt8", line);
      wrap.appendChild(h);
      return;
    }
    const para = el("div", "st mt4");
    if (label && label.length <= 70 && cut < line.length - 1) {
      const b = el("strong", "c-accent", label);
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
  /* Something on screen from the first frame: a panel that is empty while
     its script loads looks exactly like a broken one, and on mobile data the
     wait is real. */
  const wait = el("div", "st", "Loading Smogon's analysis...");
  host.appendChild(wait);
  const gaveUp = setTimeout(function(){
    if (host.contains(wait)) {
      wait.textContent = "Smogon's analysis did not load. It is a separate "
        + "file, fetched only when this is opened - try again in a moment.";
    }
  }, 8000);
  loadAnalysis(function(ready){
    clearTimeout(gaveUp);
    if (wait.parentNode) wait.remove();
    const got = analysisFor(name);
    if (!got?.length) {
      host.appendChild(el("div", "st", !ready
        ? "Smogon's analyses are not in this build."
        : "Smogon has not written one for " + name + " - " +
          Object.keys(window.CHAMP_ANALYSIS).length + " Pokemon have one."));
      return;
    }
    /* EVERY VGC FORMAT SMOGON HAS, NEWEST FIRST, and the panel lists them, so
       "this is all of it" can be told from "this is the one kept". Nothing is
       filtered by regulation: a regulation missing here is missing UPSTREAM.
       Sorted by the format name, so the newest regulation is on top. Singles
       stays out (scripts/fetch_smogon.py says why). */
    const order = got.slice().sort(function(a, b){
      return String(b.format).localeCompare(String(a.format));
    });
    if (order.length > 1) {
      host.appendChild(el("div", "st",
        "Smogon has " + order.length + " VGC analyses for " + name + ": " +
        order.map(function(x){ return x.format; }).join(", ") +
        ". All of them are below."));
    }
    order.forEach(function(st){
      const head = el("div", "st mb4");
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
   Two functions rather than one, and the split is where a door puts its own
   controls: IDENTITY first, then whatever that door owns, then the
   REFERENCE. The box's origin, shiny and trained switches are edits, and an
   edit belongs under the name it applies to - not below two hundred rows of
   movepool.

     pokeHead   picture, types, BST, the six stats, the other spellings of
                this name, and what it turns into mid-battle
     pokeBody   the Mega line, what damages it, the abilities, the Worlds sets
                it won with, its movepool, and what Smogon wrote

   `opts.shiny` draws his copy's colours; `opts.rec` is the box row when there
   is one, and its absence is what makes the search view the species rather
   than a copy of it. */
function pokeHead(body, p, opts){
  opts = opts || {};
  /* THE PICTURE SITS BESIDE THE FACTS, NOT ABOVE THEM, sharing height those
     rows use anyway instead of costing a screenful before the first number.
     The big HOME render, since a sheet draws only one (ui/card.js). */
  const head = el("div", "sheethead");
  const big = spriteFor(p.name, true, opts.shiny);
  if (big) head.appendChild(big);
  const info = el("div", "sheetfacts");
  /* THE SAME FUNCTION AS THE CARD, drawing the BASE POKEMON ONLY (`ms` is
     empty). A card carries the Mega line because it has one chance to say
     everything; a sheet has a whole Mega section below, so repeating it
     here would put the same facts on screen twice.

     The dex number is dropped - the sheet has it in the title - and the
     Worlds medal joins the chips. */
  pokeFacts(info, p, [], {
    dex: false,
    stats: false,
    name: p.name,
    meta: function(chips){
      const med0 = podiumChip(p.name);
      if (med0) chips.appendChild(med0);
    }
  });
  head.appendChild(info);

  /* THE BASE FORM GETS THE SAME BOX AS A MEGA, in the same order: picture
     and facts, the six stats full width, the abilities explained, what
     damages it. Every form one shape, so the sheet reads as a stack of
     Pokemon rather than a stack of topics. */
  const panel = el("div", "panel megablock mb10");
  panel.appendChild(head);
  panel.appendChild(statGrid(p));
  body.appendChild(panel);
  /* handed to pokeBody, which fills it with the abilities and the damage
     table - they are the base form's and belong in the base form's box. */
  body._basePanel = panel;
  /* The other spellings that mean this Pokemon (Squawkabilly's plumages,
     Indeedee-F): one dex entry, so they are not separate Pokemon. The note
     says "also written", not "changes nothing", because a few do change
     something in battle (Palafin-Hero, Castform's weathers). */
  const also = C.COSMETIC?.[p.name];
  if (also?.length) {
    const an = el("div", "note mb10");
    an.innerHTML = "<strong>Also written:</strong> " + also.join(", ") +
      ". Same Pokemon — the dex keeps one entry" +
      (also.length > 1 ? " for all of them." : ".");
    body.appendChild(an);
  }

  /* A SPECIES CHAMPIONS DOES NOT HAVE says so, on every door: HOME can hold
     it but never send it in, and the numbers above are main-series ones
     (Champions publishes none), which must never read as Champions data. */
  if (p.outside) {
    const osrc = el("div", "note mb10");
    osrc.innerHTML = "<strong>Not in the Champions dex.</strong> It can live "
      + "in HOME but never enter the game"
      + (p.approx ? ". No row for this exact form either — the numbers "
         + "shown are " + p.approx + "'s" : "") + ".";
    body.appendChild(osrc);
  }
}

/* ONE ABILITY, EXPLAINED: the text, the measured multiplier, and what it
   does to THIS movepool. Both the base panel and each Mega panel call it,
   and `form` matters: "tags N of the moves it learns" is counted against
   the form that HAS the ability. `badge` names whose it is, when it is not
   the base form's; `ls` is the learnset. */
function abilityNote(a, form, badge, ls){
  const n = el("div", "note mb6");
  /* CHAMPIONS' OWN TEXT FIRST, ALWAYS. An ability only species outside the
     game carry has no Champions row, so it falls back to the outside dex and
     says on screen that the text is main-series. An ability Champions HAS
     never reaches that branch. */
  n.innerHTML = "<strong>" + a + ".</strong> ";
  /* the badge is in that form's own ink, so the note, the sprite caption
     and the stat deltas all name the form the same way */
  if (badge) n.insertBefore(badge, n.firstChild);
  const say = numText(C.ABIL[a] || "");
  n.appendChild(say);
  if (!C.ABIL[a]) {
    say.textContent = "Loading…";
    loadOutside(function(){
      const t = outsideDex().ab?.[a];
      say.textContent = "";
      say.appendChild(numText(t || "No description on record for " + a + "."));
      if (t) {
        const tg = el("span", "tag", "main-series text");
        tg.title = "Champions has no row for " + a + " because no Pokemon it "
                 + "allows carries it. This is the main-series description.";
        say.appendChild(tg);
      }
    });
  }
  const anum = effectLine(a);
  if (anum) n.appendChild(anum);
  /* What it does to this Pokemon's moves, said HERE rather than as a badge
     on every row. Two shapes, and the difference is the whole point:
     an ability that covers a category (Guts, every physical move) names
     the category, because badging all of them picks out nothing; one that
     really selects says how many of THIS movepool it hits, so the badges
     below have a number to be checked against. */
  const r = AB_SET[a], sc = el("div", "st");
  sc.classList.add("mt2");
  /* NOT r.why HERE: that is the one-line summary written for a move tag's
     tooltip, where the description is not on screen. Under the description
     it would repeat it. Only what the description cannot say goes here: how
     the ability meets THIS movepool. */
  if (r?.side === "off" && r.scope) {
    sc.textContent = "Affects " + r.scope + " it knows. No per-move tag: " +
                     "it picks out nothing.";
    n.appendChild(sc);
  } else if (r?.side === "off" && ls) {
    const k = ls.filter(function(mn){
      const mv = MOVE_BY[mn];
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
/* The type chart for one typing, as rows of chips grouped x4, x2, 1/2, 1/4,
   immune. Called per typing, because a Mega that RETYPES has its own table -
   one table under two typings would be one number meaning two things. */
function damageTable(types){
  const dfc = defence(types);
  const dl = el("div");
  [[4, "×4"], [2, "×2"], [.5, "½"], [.25, "¼"],
   [0, "immune"]].forEach(function(g){
    const hits = Object.keys(dfc).filter(function(t){ return dfc[t] === g[0]; });
    if (!hits.length) return;
    const line = el("div", "rmeta mb5");
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
/* ONE POKEMON'S SHEET, BELOW ITS HEAD, in the order a Pokemon is read in:
   the head carries the types and the six stats; then the abilities and what
   damages it; then the Mega line and the battle forms, each with its own
   damage table only when it really retypes; then what it won with, its
   movepool, and what Smogon wrote. */
function pokeBody(body, p){
  /* resolved first, because each ability reports how much of THIS movepool
     it touches */
  const ls = learnset(p.name);
  baseBlock(body, p, ls);
  megaSection(body, p, ls);
  battleFormSection(body, p);
  worldsFold(body, p);
  if (ls && FIND.moves.length) askedMoves(body, p);
  if (ls) ownMovepool(body, p, ls);
  else if (p.outside) outsideMovepool(body, p);
  /* WHAT SMOGON WROTE. Last, and folded, because it is long and the payload
     behind it is not fetched until it is opened. */
  const aw = analysisFold(p.name, "What Smogon says about " + p.name);
  aw.classList.add("mt10");
  body.appendChild(aw);
}

/* THE BASE FORM'S ABILITIES, AND ONLY THOSE - a Mega's is explained in its
   own block, beside the form that has it. Then
   WHAT DAMAGES IT: a type chart needs the types and nothing else, so a
   species Champions has never heard of gets one too. The box sheet may hand
   in its own panel (`body._basePanel`) for these to go in. */
function baseBlock(body, p, ls){
  const caja = body._basePanel || body;
  (p.ab || []).forEach(function(a){
    caja.appendChild(abilityNote(a, p, null, ls));
  });
  caja.appendChild(el("div", "st", "Takes damage:"));
  caja.appendChild(damageTable(p.types));
}

/* ============================================ WHAT THE STONE MAKES OF IT ==
   One block per Mega, each a whole Pokemon rather than a line of
   differences: its picture, its stone, its types, its six stats with the
   ones the stone MOVES said, and its ability explained. Nothing the sheet
   already said above is repeated. megaLine, not megasFor, so a species
   Champions lacks shows its Megas too (Mewtwo's X and Y). */
function megaSection(body, p, ls){
  const ms = megaLine(p);
  if (!ms.length) return;
  body.appendChild(el("h2", null,
    ms.length > 1 ? "Mega line — " + ms.length + " of them, and only one"
                    + " may evolve in a battle"
                  : "Mega line"));
  ms.forEach(function(m){
    /* the stone is named, because it is what this block is about - but NOT
       whether it is owned: that lives in the Items tab and nowhere else */
    const pn = formPanel(p, m, m.name,
      STONE_OF[m.name] ? el("span", "tag mega", STONE_OF[m.name]) : null,
      [labelBox(bst(m), "BST"), labelBox(m.ab, "Ability", "wide")]);
    /* ITS ABILITY, EXPLAINED - the text, the measured multiplier, what it
       does to this movepool - under the form that has it. The ability is
       often the reason, and sometimes the cost: Mawile gains Huge Power,
       Froslass trades Cursed Body for Snow Warning. */
    (m.ab || []).forEach(function(ab){
      const note = abilityNote(ab, m, null, ls);
      note.classList.add("mt8");
      pn.appendChild(note);
    });
    pn.appendChild(statGrid(m));
    const moved = movedStats(p, m);
    pn.appendChild(el("div", "st",
      moved.length ? "The stone moves " + moved.join(", ") + "."
                   : "The stone moves no stat — it is here for the "
                     + "ability."));
    retypedTable(pn, p, m);
    body.appendChild(pn);
  });
}

/* AND THE SAME BLOCK FOR THE FORMS IT TAKES WITHOUT A STONE: Stance Change
   gives Aegislash 140 Attack the moment it attacks, Zero to Hero takes
   Palafin from 70 to 160, Forecast retypes Castform three ways. It is NOT a
   stone and must never read like one: no item tag, no ability cell - the
   ability is the one it already has, and the line underneath says it is
   what does this. */
function battleFormSection(body, p){
  const bfs = battleFormsOf(p);
  if (!bfs.length) return;
  body.appendChild(el("h2", null,
    bfs.length > 1 ? "In battle — " + bfs[0].by + " gives it "
                     + bfs.length + " more forms"
                   : "In battle — " + bfs[0].by));
  bfs.forEach(function(f){
    const retype = f.types.join("/") !== p.types.join("/");
    const pn = formPanel(p, f, p.name + " — " + f.battle,
      el("span", "tag bf", f.by), [labelBox(bst(f), "BST")]);
    pn.appendChild(statGrid(f));
    pn.appendChild(el("div", "st",
      f.by + formChange(movedStats(p, f), retype)));
    formMoves(f, p).forEach(function(c){ pn.appendChild(formMoveLine(c, f, p)); });
    retypedTable(pn, p, f);
    body.appendChild(pn);
  });
}

/* The head of a Mega's or a battle form's block: its picture, its name with
   one tag, its types, and a strip of cells. */
function formPanel(p, f, nameText, tag, cells){
  const pn = el("div", "panel megablock mb10");
  const head = el("div", "sheethead");
  const pic = formSprite(f, p, true);
  if (pic) head.appendChild(pic);
  const info = el("div", "sheetfacts");
  const h = el("div", "rname");
  h.appendChild(document.createTextNode(nameText));
  if (tag) h.appendChild(tag);
  info.appendChild(h);
  const mt = el("div", "rmeta");
  f.types.forEach(function(t){ mt.appendChild(typeChip(t)); });
  info.appendChild(mt);
  info.appendChild(cardLine(cells));
  head.appendChild(info);
  pn.appendChild(head);
  return pn;
}

/* "Atk 80 → 150", for every stat the form moves. */
function movedStats(p, f){
  return STAT_KEYS.map(function(k, i){
    return f.b[i] === p.b[i] ? null
         : STAT_LABEL[k] + " " + p.b[i] + " → " + f.b[i];
  }).filter(Boolean);
}

/* ITS OWN DAMAGE TABLE, only when the typing really changes - it is a
   different table, not a caveat: Mega Ampharos picks up a Dragon's
   weaknesses and loses none of the Electric ones. */
function retypedTable(pn, p, f){
  if (f.types.join("/") === p.types.join("/")) return;
  pn.appendChild(el("div", "st", "Takes damage differently:"));
  pn.appendChild(damageTable(f.types));
}

/* WHAT A FORM DOES TO ITS MOVES, which for a form that moves no number is the
   whole reason it matters (Hangry Morpeko's Aura Wheel turns Dark). `c` is
   [move, type before, type in this form]. */
function formMoveLine(c, f, p){
  const line = el("div", "rmeta mt6");
  line.appendChild(el("span", null, c[0] + ":"));
  if (c[1]) line.appendChild(typeChip(c[1]));
  line.appendChild(el("span", "megato " + formInk(f, p), "→"));
  line.appendChild(typeChip(c[2]));
  line.appendChild(el("span", "st", "in this form"));
  return line;
}

/* WHAT IT WON WITH. Folded, because some Pokemon have eighteen of these and
   the movepool is what the sheet is usually opened for - but one tap away,
   because "what did the set that actually won look like" is a better
   question than "what is popular". History, and it says so: each set
   carries its year, its division and the regulation. */
function worldsFold(body, p){
  const pod = podiumFor(p.name);
  if (!pod.length) return;
  const wrap = el("div", "mb10");
  const tog = el("button", "btn sm fold");
  tog.setAttribute("aria-expanded", "false");
  tog.textContent = "Worlds — " + pod.length + " top-8 set" +
                    (pod.length === 1 ? "" : "s");
  const host = el("div");
  host.hidden = true;
  tog.onclick = function(){
    const open = host.hidden;
    host.hidden = !open;
    tog.setAttribute("aria-expanded", open ? "true" : "false");
  };
  wrap.appendChild(tog);
  host.appendChild(el("p", "sub",
    "Frozen history — each World Championship keeps the regulation it " +
    "was played in. The three divisions are separate metagames and are " +
    "never pooled, so each set says which it came from."));
  pod.forEach(function(e){ host.appendChild(worldsSet(e)); });
  wrap.appendChild(host);
  body.appendChild(wrap);
}

/* One top-8 set: the finish, the player, their record, the item, ability and
   nature, what it Mega Evolved into, and the four moves. The ability is the
   BASE one - what a teamlist records - and the stone settles what the Mega
   became. */
function worldsSet(e){
  const card = el("div", "note mb6");
  const head = el("div", "rname");
  const place = ordinal(e.r);
  head.appendChild(el("span", "tag" + (e.r <= 3 ? " gold" : ""),
                      "Worlds " + e.y + " · " + e.d + " · " + place));
  if (e.who) head.appendChild(document.createTextNode(e.who));
  if (e.rec) head.appendChild(el("span", "tag", e.rec));
  card.appendChild(head);
  card.appendChild(factLine([
    e.it ? e.it : "no item recorded",
    e.ab ? e.ab : null,
    e.na ? e.na : null]));
  if (e.mg) {
    const mg = el("div", "st c-mega");
    mg.textContent = "Mega Evolves into " + e.mg +
      (e.mgab ? " — ability becomes " + e.mgab : "");
    card.appendChild(mg);
  }
  const mv = el("div", "rmeta");
  (e.mv || []).forEach(function(n){
    const mm2 = MOVE_BY[n];
    const chip = el("span", "tag", n);
    if (mm2) chip.title = catName(mm2.cat) + " · " +
      (mm2.bp ? mm2.bp + " BP" : "— BP") + " · " +
      (mm2.acc == null ? "—" : mm2.acc) + " acc";
    mv.appendChild(chip);
  });
  if ((e.mv || []).length) card.appendChild(mv);
  return card;
}

/* The moves the Find search asked for, first, when the sheet was opened from
   a search that named some. */
function askedMoves(body, p){
  body.appendChild(el("h2", null, "The moves you asked for"));
  const l = el("div", "list");
  FIND.moves.forEach(function(n){
    const mv = MOVE_BY[n];
    if (mv) l.appendChild(moveRowFor(mv, p.ab || [], p));
  });
  body.appendChild(l);
}

/* THE WHOLE MOVEPOOL, status moves included, with the same controls as the
   build editor and the search - one implementation, so searching inside one
   Pokemon's pool works the way searching anywhere else does - and its own
   players' usage on every move. */
function ownMovepool(body, p, ls){
  body.appendChild(el("h2", null, "Movepool"));
  moveFilters(body, ls, learnerRow(p), "Filter " + ls.length + " moves it learns",
              {cap: 200, usageOf: p.name});
}

/* the row renderer for a movepool: every ability this species can have */
function learnerRow(p){
  return function(m){ return moveRowFor(m, p.ab || [], p); };
}

/* A SPECIES CHAMPIONS DOES NOT HAVE STILL KNOWS THINGS. Its movepool comes
   from the same PokeAPI tables its stats do, fetched only when a sheet like
   this is opened, and the section says so: these are main-series moves on a
   main-series Pokemon and must never read as Champions data. What each move
   DOES is Champions' own row for it - including the moves Champions has but
   has not enabled, which are marked. */
function outsideMovepool(body, p){
  body.appendChild(el("h2", null, "Movepool"));
  const outsideHost = el("div");
  body.appendChild(outsideHost);
  outsideHost.appendChild(el("div", "st", "Loading what it knows..."));
  loadOutside(function(){
    outsideHost.innerHTML = "";
    const got = outsideMovesFor(p.name);
    if (!got) {
      outsideHost.appendChild(el("div", "st",
        "No movepool on record for " + p.name + " — there is no "
        + "Champions page for it and nothing upstream either."));
      return;
    }
    let off = 0;
    const pool = got.map(function(n){
      const m = MOVE_BY[n];
      if (m) return m;
      const o = outsideMove(n);
      if (o) off++;
      return o;
    }).filter(Boolean);
    outsideHost.appendChild(el("p", "sub",
      "Which moves it learns is main-series — Champions publishes no "
      + "page for a species it does not have. What each one DOES is "
      + "Champions' own row for that move."
      + (off ? " " + off + " of them are moves Champions has in its database "
         + "but has not enabled; they are marked." : "")));
    moveFilters(outsideHost, pool, learnerRow(p),
                "Filter " + pool.length + " moves it learns", {cap: 200});
  });
}

/* A folded "what Smogon wrote" button: the analysis panel is drawn - and its
   payload fetched - only the first time it is opened. The build editor and
   the Pokemon sheet both use it, with their own label. */
function analysisFold(name, label){
  const aw = el("div");
  const atog = el("button", "btn sm fold");
  atog.setAttribute("aria-expanded", "false");
  const ahost = el("div");
  ahost.hidden = true;
  atog.textContent = label;
  atog.onclick = function(){
    const open = ahost.hidden;
    ahost.hidden = !open;
    atog.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && !ahost._drawn) { ahost._drawn = 1; analysisPanel(name, ahost); }
  };
  aw.appendChild(atog);
  aw.appendChild(ahost);
  return aw;
}

/* The search view's door: the species, not a copy of it, so no shiny and no
   ownership block between the two halves. */
function findDetail(p){
  openSheet(p.name, function(body){
    pokeHead(body, p, {});
    pokeBody(body, p);
  }, []);
}

export { analysisFold, findDetail, pokeBody, pokeHead };
