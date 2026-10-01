/* The game data the page ships (window.CHAMP), unpacked into lookups, and the
   pure rules read off it: stats, natures, learnsets, Megas, sprites, usage. */

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
  const n = C.DEXNO?.[name];
  if (n) return n;
  const p = byName[name];
  return p?.dex ? p.dex : 99999;
}
function dexLabel(name){
  const n = dexNo(name);
  return n === 99999 ? "#----" : "#" + String(n).padStart(4, "0");
}
const byName = {};
DEX.forEach(function(p){ byName[p.name] = p; });
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
          hits:r[10] || null, crit:!!r[11], f:r[12] || "",
          text:r[13] || ""};
});
/* P physical, S special, T status - three codes, never two */
/* The comparator for sorting names: locale-aware, so an accent never
   sorts after "z". */
function byText(a, b){ return String(a).localeCompare(String(b)); }
/* 1 -> "1st", 4 -> "4th": a finishing place. Worlds ranks stop at 8. */
function ordinal(n){ return ({1: "1st", 2: "2nd", 3: "3rd"})[n] || n + "th"; }
/* "1 build", "3 builds" */
function plural(n, word){ return n + " " + word + (n === 1 ? "" : "s"); }
const CATEGORY = {P: "Physical", S: "Special"};
function catName(c){ return CATEGORY[c] || "Status"; }
const MOVE_BY = {};
MOVES.forEach(function(m){ MOVE_BY[m.name] = m; });
const STAT_KEYS = ["hp","atk","def","spa","spd","spe"];
/* The Stat Points a spread spends, out of the 66 a build may. */
function spTotal(sp){
  return STAT_KEYS.reduce(function(a,k){ return a + (Number(sp[k]) || 0); }, 0);
}
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
const TYPE_COLORS = window.CHAMP?.TYPE_COLORS || {};
const TYPE_COLOR = {}, TYPE_COLOR2 = {}, TYPE_INK = {};
Object.keys(TYPE_COLORS).forEach(function(t){
  TYPE_COLOR[t] = TYPE_COLORS[t].top;
  TYPE_COLOR2[t] = TYPE_COLORS[t].bottom || TYPE_COLORS[t].top;
  TYPE_INK[t] = TYPE_COLORS[t].ink || "#FFFFFF";
});
const COSTS = {ranked_win:300, mega_stone_shop:2000, keep_rental_pokemon:2500,
             training_move:250, training_nature:500, training_ability:500,
             training_stat_point:5};
function slug(s){
  return (String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-")
          .replace(/^-|-$/g,"")) || "x";
}
function freeSlug(s, taken){
  const b = slug(s);
  let k = b, n = 2;
  while (taken[k]) { k = b + "-" + n; n++; }
  return k;
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
  const bfm = C.BFORMS?.[p.name];
  if (!bfm) return [];
  return Object.keys(bfm.f).map(function(lab){
    const e = bfm.f[lab];
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
  const ft = C.FORM_TYPED || {};
  return Object.keys(ft).filter(function(mv){
    const t = ft[mv][form.name];
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
  const h = C.HOME_DEX?.[name];
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
  const alias = C.LEARN_ALIAS?.[name];
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
const IMG_HOSTS = ["https://cdn.jsdelivr.net"];
const SPRITE_PIN = "2ecb4eeacd5a1718621fc30f12772e3f60d830b9";
const SPRITE_BASE = IMG_HOSTS[0] + "/gh/PokeAPI/sprites@" + SPRITE_PIN +
                  "/sprites/pokemon/";

/* level-50 stat, the formula the repo verified against 504 speed tiers */
function statAt(base, sp, isHp, mult){
  const v = base + Math.max(0, Math.min(32, sp || 0)) + (isHp ? 75 : 20);
  return Math.floor(v * (isHp ? 1 : (mult || 1)));
}
function natMult(nature, key){
  const n = C.NATURES[nature];
  if (!n) return 1;
  if (n[0] === key) return 1.1;
  if (n[1] === key) return 0.9;
  return 1;
}
function defence(types){
  const out = {};
  Object.keys(C.CHART).forEach(function(atk){
    let m = 1;
    types.forEach(function(d){
      const row = C.CHART[atk];
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
  const p = byName[name];
  const sp = p ? p.species : name;
  /* and four forms find their pool under neither name: Champions' Floette is
     the Eternal Flower one, filed as "Floette-Eternal", and the two gender
     forms inherit the base species' pool. build_tracker_data.py resolves
     those with norm() and ships the answer, so this stays a plain lookup and
     no form is left without a movepool. */
  const alias = C.LEARN_ALIAS?.[name];
  const ids = C.LEARN[name] || (alias && C.LEARN[alias]) || C.LEARN[sp] || null;
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
  const owned = C.MEGA_OWNER?.[name];
  if (owned) return owned.map(function(n){ return byName[n]; }).filter(Boolean);
  /* an alternate form with no Megas of its own gets none - it must not
     inherit its base form's */
  if (byName[name] && byName[name].species !== name) return [];
  const p = byName[name];
  return (p && MEGAS_OF[p.species]) || MEGAS_OF[name] || [];
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
  const all = window.CHAMP_SPLITS?.p || {};
  if (all[name]) return all[name];
  const p = byName[name];
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
  const s = splitsFor(name);
  const rows = s?.[kind];
  if (!rows?.length) return null;
  for (const row of rows) {
    if (row[0] === what) return row[1];
  }
  return 0;
}
/* That Pokemon's own top row for a section. Rows arrive sorted descending, so
   this is row 0 and not a scan. */
function splitMax(name, kind){
  const s = splitsFor(name);
  const rows = s?.[kind];
  return rows?.length ? rows[0][1] : 0;
}
/* A chip, emphasised RELATIVE to that Pokemon's own maximum - see above for
   why a fixed threshold cannot work across sections. */
/* What a usage share is a share OF, by the kind of column it came from. */
const SHARE_OF = {m: "of this Pokemon's move slots", t: "of its teams also carried this"};

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

export {
  anyRow, battleFormsOf, bst, byName, byText, C, catName, COSTS, defence, DEX,
  dexLabel, dexNo, formMoves, FORMS, freeSlug, learnset, MEGAS_OF, megasFor,
  MOVE_BY, MOVES, natMult, ordinal, outsideForms, outsideRow, plural,
  podiumFor, SHARE_OF, splitMax, splitPct, splitsFor, splitsReg, SPRITE_BASE,
  spTotal, STAT_KEYS, STAT_LABEL, statAt, STONE_OF, TYPE_COLOR, TYPE_COLOR2,
  TYPE_INK,
};
