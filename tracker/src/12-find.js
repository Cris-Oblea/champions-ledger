/* 12-find.js - Find: moves, abilities, items, and one Pokemon's whole sheet.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import {
  $, C, DEX, MOVES, MOVE_BY, SORT, STAT_KEYS, STAT_LABEL, TYPE_COLOR, bst,
  byName, capNote, catName, dexNo, effectLine, el, learnset, podiumChip,
  podiumFor, splitPct, toast, typeChip, usageTag,
} from "./01-data.js";
import { S, boxRows, originOf, ownedNames } from "./02-state.js";
import { closeSheet, fbtn, openSheet } from "./04-nav.js";
import { battleFormNote } from "./05-box.js";
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
var FIND = {moves: [], types: [], typeMode: "and", ability: "",
            inChamp: false, inHome: false,
            sort: "bst", dir: "desc", cat: ""};
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
  var hits = DEX.filter(function(p){
    if (FIND.inChamp || FIND.inHome) {
      var c = FIND.inChamp && ((p.name in own) || (p.species in own));
      var h = FIND.inHome && ((p.name in inHome) || (p.species in inHome));
      if (!c && !h) return false;
    }
    if (FIND.types.length) {
      var tm = FIND.typeMode === "or"
        ? FIND.types.some(function(t){ return p.types.indexOf(t) >= 0; })
        : FIND.types.every(function(t){ return p.types.indexOf(t) >= 0; });
      if (!tm) return false;
    }
    if (FIND.ability && (p.ab || []).indexOf(FIND.ability) < 0) return false;
    if (FIND.moves.length) {
      var ls = learnset(p.name);
      if (!ls) return false;
      var have = {};
      ls.forEach(function(m){ have[m.name] = 1; });
      if (!FIND.moves.every(function(n){ return have[n]; })) return false;
    }
    return true;
  });

  var head = el("p", "sub");
  head.textContent = hits.length + " of " + DEX.length + " forms match" +
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
      return sign * (statOf(b, FIND.sort) - statOf(a, FIND.sort)) ||
             a.name.localeCompare(b.name);
    });
  }
  var list = el("div", "list");
  hits.slice(0, 120).forEach(function(p){
    var here = (p.name in own) || (p.species in own);
    var r = el("button", "row" + (here ? " perm" : ""));
    var m = el("div", "rmain");
    var h = el("div", "rname");
    h.appendChild(document.createTextNode(p.name));
    if (here) {
      // say WHICH copy and how elastic it is, not the retired word "permanent"
      var rec = boxRows("champions").filter(function(x){
        return x.name === p.name || x.name === p.species; })[0];
      var o = rec ? originOf(rec) : null;
      h.appendChild(el("span", "tag " + (o === "home" ? "ok" : ""),
        rec && rec.status === "rental" ? "rental in your box"
        : o === "home" ? "yours, HOME origin"
        : o === "champions" ? "yours, Champions origin"
        : "yours, origin?"));
    }
    if (p.mega) h.appendChild(el("span", "tag mega", "mega"));
    /* THE MEDAL. A result rather than a rate, so it sits on the name with the
       ownership and Mega badges and not down among the numbers. */
    var med = podiumChip(p.name);
    if (med) h.appendChild(med);
    m.appendChild(h);
    var meta = el("div", "rmeta");
    p.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
    /* ALL SIX STATS, ALWAYS, AND THE RANKED ONE MARKED.

       This briefly dropped the other five when one was being ranked, on the
       grounds that they were noise. The player cut that immediately and he is
       right: "si filtro por atk, de mayor a menor, pero tambien quiero ver la
       speed, no puedes quitarme esa informacion." An Attack ranking is read
       WITH the Speed beside it - that is half of what picks the Pokemon.

       So nothing is hidden and the ranked stat is simply made findable, which
       is what the eye needed rather than fewer numbers.

       BASE VALUES ONLY: "no necesito ver en el listado los SPs, puede estar
       todo base." The level-50 floor and ceiling belong on the Pokemon's own
       sheet, where one Pokemon is being decided about; in a list of 120 they
       were three numbers per row answering a question nobody asked yet. */
    var ranking = FIND.sort !== "dex";
    var stats = el("span", "statrow");
    stats.appendChild(el("span", "mono fact" +
      (FIND.sort === "bst" ? " on" : ""), "BST " + bst(p)));
    STAT_KEYS.forEach(function(k, i){
      stats.appendChild(el("span", "mono fact" +
        (ranking && FIND.sort === k ? " on" : ""),
        p.b[i] + " " + STAT_LABEL[k]));
    });
    meta.appendChild(stats);
    meta.appendChild(el("span", null, (p.ab || []).join(" / ")));
    m.appendChild(meta);
    r.appendChild(m);
    r.onclick = function(){ findDetail(p); };
    list.appendChild(r);
  });
  out.appendChild(list);
  if (hits.length > 120) out.appendChild(el("p", "sub",
    "Showing the first 120. Narrow it further to see the rest."));
}


function findDetail(p){
  openSheet(p.name, function(body){
    var chips = el("div", "rmeta");
    p.types.forEach(function(t){ chips.appendChild(typeChip(t)); });
    chips.appendChild(el("span", "mono", "BST " + bst(p)));
    var med0 = podiumChip(p.name);
    if (med0) chips.appendChild(med0);
    body.appendChild(chips);
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
    var sl = el("div", "statline");
    STAT_KEYS.forEach(function(k, i){
      var d = el("div");
      d.appendChild(el("b", null, p.b[i]));
      d.appendChild(el("span", null, STAT_LABEL[k]));
      sl.appendChild(d);
    });
    body.appendChild(sl);

    var bfn = battleFormNote(p);
    if (bfn) body.appendChild(bfn);

    /* resolved BEFORE the abilities, because each ability now reports how much
       of THIS movepool it touches - `var` hoisting made the check pass with
       `ls` still undefined and the line silently never rendered */
    var ls = learnset(p.name);

    body.appendChild(el("h2", null, "Abilities"));
    (p.ab || []).forEach(function(a){
      var n = el("div", "note");
      n.style.marginBottom = "6px";
      n.innerHTML = "<strong>" + a + ".</strong> " + (C.ABIL[a] || "");
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
          return mv && abilityTag(a, mv, p);
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
      body.appendChild(n);
    });

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
    }
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
  ((C.ITEM_FOR_MOVE || {})[m.name] || []).forEach(function(it){
    host.appendChild(el("span", "tag", it));
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
  function chip(row, group, key, text, colour){
    var t = el("button", "tog", text);
    t.setAttribute("aria-pressed", "false");
    if (colour) t.style.borderColor = colour;
    t.onclick = function(){
      var on = !F[group][key];
      if (on) F[group][key] = 1; else delete F[group][key];
      t.setAttribute("aria-pressed", on ? "true" : "false");
      if (colour) {
        t.style.background = on ? colour : "";
        t.style.color = on ? "#fff" : "";
      }
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
  body.appendChild(label("Category — any of these"));
  body.appendChild(crow);

  var mrow = el("div", "toggles"); mrow.style.marginBottom = "8px";
  chip(mrow, "trait", "spread", "Spread");
  chip(mrow, "trait", "ally", "Hits ally");
  chip(mrow, "trait", "pri", "Priority");
  body.appendChild(label("Must have — all of these"));
  body.appendChild(mrow);

  var types = [];
  pool.forEach(function(m){ if (types.indexOf(m.type) < 0) types.push(m.type); });
  types.sort();
  if (types.length > 1) {
    var trow = el("div", "toggles"); trow.style.marginBottom = "10px";
    types.forEach(function(ty){ chip(trow, "type", ty, ty, TYPE_COLOR[ty]); });
    body.appendChild(label("Type — any of these"));
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
      if (cats.length && cats.indexOf(m.cat) < 0) return false;
      if (tys.length && tys.indexOf(m.type) < 0) return false;
      if (trs.length && !trs.every(function(k){
        return k === "spread" ? !!m.spread
             : k === "ally" ? !!m.hitsAlly
             : (m.pri || 0) > 0;
      })) return false;
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
  priorityTag(m, h); spreadTags(m, h); itemTags(m, h);
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
      Object.keys(TYPE_COLOR).sort().forEach(function(ty){
        var b = el("button", "tog", ty);
        b.style.borderColor = TYPE_COLOR[ty];
        b.onclick = function(){
          var i = FIND.types.indexOf(ty);
          if (i >= 0) FIND.types.splice(i, 1); else FIND.types.push(ty);
          paint(); findDraw();
        };
        chips[ty] = b;
        t.appendChild(b);
      });
      function paint(){
        Object.keys(chips).forEach(function(ty){
          var on = FIND.types.indexOf(ty) >= 0, b = chips[ty];
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.style.background = on ? TYPE_COLOR[ty] : "";
          b.style.color = on ? "#fff" : "";
        });
        note.textContent = FIND.typeMode === "or"
          ? "Any one of the types you pick is enough - pick as many as you like."
          : "The Pokemon must have every type you pick. Nothing has more than " +
            "two, so three or more can never match.";
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

  paintSort();
  $("findClear").onclick = function(){
    FIND.moves = []; FIND.types = []; FIND.typeMode = "and";
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
  var list = el("div", "list");
  d.top.forEach(function(row, i){
    var name = row[0], teams = row[1], pct = row[2];
    var p = byName[name];
    var mine = (name in own) || (p && p.species in own);
    var r = el("button", "row" + (mine ? " perm" : ""));
    var m = el("div", "rmain");
    var h = el("div", "rname");
    h.appendChild(el("span", "mono", "#" + (i + 1) + "  "));
    h.appendChild(document.createTextNode(name));
    if (mine) h.appendChild(el("span", "tag ok", "yours"));
    m.appendChild(h);
    var meta = el("div", "rmeta");
    if (p) p.types.forEach(function(t){ meta.appendChild(typeChip(t)); });
    var sp = el("span", "mono", pct + "%  ·  " + teams + " of " + d.n + " teams");
    sp.title = teams + " of the " + d.n + " " + WORLD.div +
      " teams at Worlds " + WORLD.year + " carried " + name +
      ". One per team - the Species Clause allows no second copy.";
    meta.appendChild(sp);
    m.appendChild(meta);
    r.appendChild(m);
    if (p) r.onclick = function(){ findDetail(p); };
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
  findInit, findRun, itemTags, moveFilters, moveRowFor, moveScore, priorityTag,
  factLine, spreadNote, spreadTags, worldDraw,
};
