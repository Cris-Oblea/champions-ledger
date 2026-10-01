/* The move vocabulary every screen borrows: how a move is scored, what its
   tags say, which abilities touch it, and the filters over a movepool.

   Shared rather than copied: a move ranked one way in the build picker and
   another way in search is the bug this file exists to prevent. */
import { byText, C, catName, splitPct } from "../core/data.js";
import { el, filterLabel, searchField, setPressed } from "../core/dom.js";
import { numText, typeChip, typeSkin, usageTag } from "./card.js";

/* ------------------------------------------- which ability boosts what -----
   Each entry answers one question: given this Pokemon's chosen ability, which
   of the moves it actually learns are changed by it? The test runs against the
   move's own flags, so a new move added by a regulation is covered the day the
   data refreshes - nothing here is a hand-written move list.

   `sec` marks a move with a SECONDARY effect, which is what Sheer Force trades
   away for 30% power. */
/* Derived by scripts/build_ability_moves.py from Serebii's move text, cross-
   checked against Smogon's engine, and shipped as move-index lists. Nothing
   here is written by hand, which is the point: three bugs came from hand rules.

     - a power multiplier can never apply to a move that deals no damage
       (Adaptability was badging Basculegion's Rain Dance)
     - "1-stage Critical-Hit Ratio Boost" is not a stat stage
       (Contrary was badging Protect and Roost)
     - an ability that changes what comes IN never badges its own movepool
       (Bulletproof, Filter, Thick Fat are "def" and stay out of it) */
const AB = C.AB_MOVES || {};
const AB_SET = {};
Object.keys(AB).forEach(function(name){
  const e = AB[name], s = {all:!!e.all, side:e.side, x:e.x, why:e.why,
                         scope:e.scope};
  s.m = {}; (e.m || []).forEach(function(i){ s.m[i] = 1; });
  if (e.up)   { s.up = {};   e.up.forEach(function(i){ s.up[i] = 1; }); }
  if (e.down) { s.down = {}; e.down.forEach(function(i){ s.down[i] = 1; }); }
  s.why_up = e.why_up; s.why_down = e.why_down;
  AB_SET[name] = s;
});

function abilityHit(ability, move){
  const r = AB_SET[ability];
  if (r?.side !== "off") return null;      // defensive rules badge nothing
  // An ability that covers a whole CATEGORY selects nothing, so a badge on
  // every row is noise that buries the abilities that do select. Guts is the
  // case the player named: it multiplies the Attack STAT while statused, so
  // "the moves it affects" is just "every physical move" - which the row's own
  // category already says. Those are stated once, on the ability itself; see
  // abilityScope(). Measured in build_ability_moves.py, never listed by hand.
  if (r.scope) return null;
  if (r.all) return r;
  if (!r.m[move.i]) return null;
  // Contrary is the one that needs the SIGN, because that is the whole ability:
  // a boosting move becomes a self-debuff and a self-debuff becomes a boost.
  if (r.up?.[move.i]) return {x:r.x, why:r.why_up};
  if (r.down?.[move.i]) return {x:r.x, why:r.why_down};
  return r;
}
/* the badge that goes on a move row when the chosen ability touches it */
function abilityTag(ability, move, poke){
  const hit = abilityHit(ability, move);
  if (!hit) return null;
  // STAB needs the user's own type; the move table cannot know it
  if (ability === "Adaptability" &&
      !poke?.types.includes(move.type)) return null;
  const t = el("span", "tag ok", ability);
  t.title = hit.why;
  return t;
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
  const h = m.hits;
  if (!h?.length) return;
  const lo = h[0], hi = h.length > 1 ? h[1] : h[0];
  const fixed = lo === hi;
  /* 2-5 hit moves land 3 times on average; any other range is read at its floor */
  const typical = !fixed && lo === 2 && hi === 5 ? 3 : lo;
  const t = el("span", "tag ok",
              fixed ? "×" + lo + " hits" : lo + "–" + hi + " hits");
  const bits = [];
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
  const cls = m.pri > 0 ? "tag ok" : "tag bad";
  const t = el("span", cls, "priority " + (m.pri > 0 ? "+" : "") + m.pri);
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
  (C.ITEM_FOR_MOVE?.[m.name] || []).forEach(function(p){
    /* WHICH WAY THE TAG POINTS. Heat Rock on Sunny Day is a reason to run the
       move; Aspear Berry on Ice Beam is the reason it will not work, because
       the target thaws and the freeze was the whole point. Both read as the
       same grey chip, so the row said "these items are related" and left which
       way to be worked out (player, 2026-09-18). The side is decided in
       scripts/build_item_links.py, from the reason the link was made for. */
    const t = el("span", "tag" + (p[1] === "against" ? " bad" : ""), p[0]);
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
/* EVERY ABILITY THAT SWITCHES THIS MOVE OFF, SEEN FROM THE SIDE THAT USES IT.

   Red is an ability that stops it when an OPPONENT holds it - Levitate under
   your Earthquake. Green is one that only ever helps you: Telepathy stops an
   ALLY's move and nobody else's, so on your partner it is the reason to run
   the spread move and on a foe it does nothing (player, 2026-09-27: "si el
   oponente tiene telepathy no se cubre de mis ataques. hay que tener
   conocimiento de la perspectiva de una habilidad!"). An immunity that works
   against anyone stays red only: a foe's Levitate is a fact you face, pairing
   your own is a strategy you choose. Which side each one works from is
   decided in build_ability_moves.STOP_WHOSE. */
function blockerTags(m, host){
  const AB = C.AB_MOVES || {};
  Object.keys(AB).forEach(function(a){
    const st = AB[a].stop;
    if (!st?.includes(m.i)) return;
    const t = el("span", "tag bad", a);
    t.title = "On an opponent, " + a + ": " + AB[a].why;
    host.appendChild(t);
  });
  Object.keys(AB).forEach(function(a){
    const al = AB[a].ally;
    if (!al?.includes(m.i)) return;
    const t = el("span", "tag ok", a);
    t.title = "On your partner, " + a + " keeps this move off it: " +
              AB[a].why;
    host.appendChild(t);
  });
}
function spreadNote(m){
  let note = "";
  if (m.spread) note += "  ·  " + (m.cat === "T" ? "hits both opponents"
    : "spread ×0.75 while both targets are up, full power with one");
  if (m.hitsAlly) note += "  ·  lands on your own ally too";
  return note;
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
     Only a caller with one Pokemon in hand passes it, and then usage is the
     DEFAULT sort, because that is the first question asked of a movepool
     (player, 2026-09-15: "seria bueno poner filtro a los movimientos de mayor
     a menor uso por el %"). */
  const usageOf = opts?.usageOf || null;
  /* THE CAP LIVES HERE, WITH THE COUNT THAT REPORTS IT. Callers used to slice
     the result themselves while the count said a different number, and half
     the dex had its movepool quietly truncated (Rillaboom: 67 moves, 60
     shown). apply() returns the list already capped, so the two cannot
     disagree. A single movepool is never capped in practice - the longest is
     Gallade at 106; the default 80 is for the whole move table. */
  const cap = opts?.cap || 80;
  const st = {F: {cat:{}, trait:{}, type:{}}, EXCL: {}, onChange: onChange,
            sort: usageOf ? "usage" : "bp"};
  const inp = searchField(body, placeholder || ("Filter " + pool.length +
    " moves"), function(){ onChange(); });
  sortRow(body, st, usageOf);
  /* Two kinds of group, and the labels say which. A move cannot be Physical
     AND Special, or Fire AND Water, so those chips can only ever mean "any of
     these". A move CAN be spread and hit its ally at once, so those mean "all
     of these" - and "no such move" is then an answer, not a failed filter. */
  const crow = el("div", "toggles mb8");
  triChip(crow, st, "cat", "P", "Physical");
  triChip(crow, st, "cat", "S", "Special");
  triChip(crow, st, "cat", "T", "Status");
  body.appendChild(filterLabel("Category — one at a time, or − to rule out"));
  body.appendChild(crow);

  const mrow = el("div", "toggles mb8");
  triChip(mrow, st, "trait", "spread", "Spread");
  triChip(mrow, st, "trait", "ally", "Hits ally");
  triChip(mrow, st, "trait", "pri", "Priority");
  body.appendChild(filterLabel("Must have — all of these, or − to rule out"));
  body.appendChild(mrow);

  const types = [];
  pool.forEach(function(m){ if (!types.includes(m.type)) types.push(m.type); });
  types.sort(byText);
  if (types.length > 1) {
    const trow = el("div", "toggles mb10");
    types.forEach(function(ty){ triChip(trow, st, "type", ty, ty, ty); });
    body.appendChild(filterLabel("Type — any of these, or − to rule out"));
    body.appendChild(trow);
  }
  const count = filterLabel("");
  count.classList.add("mb6");
  body.appendChild(count);

  function apply(){
    const q = inp.q();
    const hits = pool.filter(function(m){ return movePasses(m, q, st.F); });
    hits.sort(moveOrder(st.sort, usageOf));
    count.textContent = hits.length === pool.length
      ? pool.length + " moves"
      : hits.length + " of " + pool.length + " moves";
    if (hits.length > cap)
      count.textContent += " · first " + cap + " shown";
    return hits.slice(0, cap);
  }
  return {apply:apply, input:inp};
}

/* The sort choices: usage first when there is a Pokemon to be a share of. */
function sortRow(body, st, usageOf){
  const srow = el("div", "toggles mb8");
  const sorts = [["bp","BP × acc"],["name","A–Z"],["pp","PP"],["type","Type"]];
  if (usageOf) sorts.unshift(["usage","Usage %"]);
  sorts.forEach(function(o){
    const t = el("button", "tog", o[1]);
    setPressed(t, o[0] === st.sort);
    t.onclick = function(){
      st.sort = o[0];
      Array.prototype.forEach.call(srow.children, function(x){
        setPressed(x, x === t);
      });
      st.onChange();
    };
    srow.appendChild(t);
  });
  body.appendChild(filterLabel("Sort"));
  body.appendChild(srow);
}

/* ONE FILTER CHIP, WITH THREE STATES: off, include, EXCLUDE (player,
   2026-09-19: "falta algo que diga no... que no me muestre ningun pokemon de
   tipo psyquico"). A tap cycles off -> include -> exclude -> off, and an
   excluded chip is drawn with a minus, struck through, because it has to read
   as the opposite of the chip beside it. A type chip wears the type's own
   colours (typeSkin knows which are written in black). */
function triChip(row, st, group, key, text, type){
  const t = el("button", "tog", text);
  setPressed(t, false);
  if (type) typeSkin(t, type, false);
  st.EXCL[group] ||= {};
  st.EXCL[group][key] = t;
  t._paint = function(v){ paintTriChip(t, text, type, v); };
  t.onclick = function(){
    const F = st.F;
    const was = F[group][key] || 0;
    const now = ({0: 1, 1: -1})[was] || 0;
    if (now) F[group][key] = now; else delete F[group][key];
    /* A MOVE HAS EXACTLY ONE CATEGORY, so including one drops the other
       (player, 2026-09-19: "seleccionar una desactiva la otra"). Excludes
       still stack, which keeps "not status" sayable. */
    if (group === "cat" && now === 1) {
      Object.keys(st.EXCL.cat).forEach(function(k){
        if (k !== key && F.cat[k] === 1) {
          delete F.cat[k];
          st.EXCL.cat[k]._paint(0);
        }
      });
    }
    t._paint(now);
    st.onChange();
  };
  row.appendChild(t);
}

/* A chip in one of its three states. A ruled-out type chip drops the type's
   border as well: the border is the last thing still saying "this is a
   Psychic chip" when the whole point is that Psychic is being refused. */
function paintTriChip(t, text, type, v){
  setPressed(t, v === 1);
  t.classList.toggle("no", v === -1);
  t.textContent = (v === -1 ? "− " : "") + text;
  if (type) {
    typeSkin(t, type, v === 1);
    if (v === -1) t.style.borderColor = "";
  }
}

/* Does a move pass the search box and every chip? The text is searched as
   well as the name, because "which of these burns" is what a move list is
   opened for. An EXCLUDE is checked first and on its own, so "no Psychic"
   works with nothing else picked. */
function movePasses(m, q, F){
  if (q && !m.name.toLowerCase().includes(q) &&
      !m.type.toLowerCase().includes(q) &&
      !(m.text || "").toLowerCase().includes(q)) return false;
  if (F.cat[m.cat] === -1) return false;
  if (F.type[m.type] === -1) return false;
  if (!includedOrNone(F.cat, m.cat) || !includedOrNone(F.type, m.type)) return false;
  const trs = Object.keys(F.trait);
  if (trs.some(function(k){ return F.trait[k] === -1 && hasTrait(m, k); }))
    return false;
  const inTr = trs.filter(function(k){ return F.trait[k] === 1; });
  return !inTr.length || inTr.every(function(k){ return hasTrait(m, k); });
}

/* Nothing included in the group, or this value is one of the included. */
function includedOrNone(group, value){
  const inc = Object.keys(group).filter(function(k){ return group[k] === 1; });
  return !inc.length || inc.includes(value);
}

function hasTrait(m, k){
  if (k === "spread") return !!m.spread;
  if (k === "ally") return !!m.hitsAlly;
  return (m.pri || 0) > 0;
}

/* The comparator for a sort key. By usage, a move nobody brought sorts below
   one at 0.1%, and both below silence - a Pokemon with no table at all falls
   back to power rather than to alphabetical noise. */
function moveOrder(sort, usageOf){
  return function(a, b){
    if (sort === "usage") {
      const ua = splitPct(usageOf, "m", a.name);
      const ub = splitPct(usageOf, "m", b.name);
      if (ua == null && ub == null) return moveScore(b) - moveScore(a) ||
                                           a.name.localeCompare(b.name);
      return (ub == null ? -1 : ub) - (ua == null ? -1 : ua) ||
             moveScore(b) - moveScore(a) || a.name.localeCompare(b.name);
    }
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "pp")
      return (b.pp || 0) - (a.pp || 0) || a.name.localeCompare(b.name);
    if (sort === "type")
      return a.type.localeCompare(b.type) || moveScore(b) - moveScore(a) ||
             a.name.localeCompare(b.name);
    return moveScore(b) - moveScore(a) || a.name.localeCompare(b.name);
  };
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
  const box = el("div", "rmeta");
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
   Anything added to one belongs in the other - which is why the build's move
   picker and the search's "+ Move" draw THIS row too, rather than copies
   that had drifted again (no "not in Champions", no PP, no spread note).

   `opts.onPick` makes the row a button that calls it; `opts.usageOf` names
   whose usage to show when it is not `poke` - the build picker's Pokemon is
   the Mega, its usage is recorded on the base species. */
function moveRowFor(m, ability, poke, opts){
  opts = opts || {};
  let abils = [];
  if (typeof ability === "string") abils = [ability];
  else if (ability != null) abils = ability.slice();
  const r = el(opts.onPick ? "button" : "div", "row");
  if (opts.onPick) r.onclick = opts.onPick;
  const mm = el("div", "rmain");
  const h = el("div", "rname");
  h.appendChild(typeChip(m.type));
  h.appendChild(document.createTextNode(m.name));
  /* A move Champions carries but has not enabled. It is shown - the whole
     movepool is the point on a sheet for a species the game has not added -
     and it says plainly that it cannot be used, so nothing here ever reads as
     something you could build with. */
  if (m.notInChampions) {
    const ni = el("span", "tag bad", "not in Champions");
    ni.title = "Champions has a row for this move but no Pokemon it allows can "
             + "use it. It becomes playable if the game enables it.";
    h.appendChild(ni);
  }
  priorityTag(m, h); spreadTags(m, h); itemTags(m, h);
  blockerTags(m, h);
  const hits = [];
  abils.forEach(function(a){
    const hit = abilityHit(a, m);
    if (!hit) return;
    const tag = abilityTag(a, m, poke);          // keeps the Adaptability filter
    if (!tag) return;
    h.appendChild(tag);
    hits.push({ability:a, hit:hit});
  });
  /* How many of THIS Pokemon's players ran it - the same chip the builder
     shows, on the same terms. Only where there IS a Pokemon: the "+ Move"
     sheet searches the whole table with nobody in hand, and a share needs
     something to be a share of.

     And EVERY move carries one, including the ones at 0%. The picker used to
     badge four or five and leave the rest of the movepool blank, and blank
     reads as "no data" when it actually meant "nobody brought it" - which is
     an answer, and the one the player asked to see (2026-09-15: "lo que yo
     quiero es que marque todos los ataques posibles con % de uso").
     splitPct returns null only when the Pokemon has no table at all, and
     that is the one case that stays silent. */
  const who = opts.usageOf || poke?.name;
  if (who) {
    const utag = usageTag(splitPct(who, "m", m.name), who, "m");
    if (utag) h.appendChild(utag);
  }
  mm.appendChild(h);
  const facts = [catName(m.cat),
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
  const spread = spreadNote(m).replace(/^\s*·\s*/, "").trim();
  hits.forEach(function(x){
    if (x.hit.x && m.bp)
      facts.push(Math.round(m.bp * x.hit.x) + " BP with " + x.ability);
  });
  facts.push(m.target);
  mm.appendChild(factLine(facts));
  if (spread) {
    const sp = el("div", "st", spread.split("·").map(function(s){
      return s.trim();
    }).join(" · "));
    sp.classList.add("c-warn");
    mm.appendChild(sp);
  }
  if (m.text) mm.appendChild(numText(m.text, "div", "st"));
  hits.forEach(function(x){
    const w = el("div", "st c-accent");
    // name it when there is more than one, or the two reasons run together
    w.textContent = (hits.length > 1 ? x.ability + ": " : "") + x.hit.why;
    mm.appendChild(w);
  });
  r.appendChild(mm);
  return r;
}

export {
  AB_SET, abilityTag, blockerTags, factLine, itemTags,
  moveFilters, moveRowFor, spreadNote, spreadTags,
};
