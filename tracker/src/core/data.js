/* The game data the page ships (window.CHAMP), unpacked into lookups, and the
   pure rules read off it: stats, natures, learnsets, Megas, sprites, usage.

   Nothing here reads his ledger or the DOM, so any layer may import it. The
   arrays in window.CHAMP are positional to keep the payload small; this file
   is the only place that knows the positions (build_tracker_data.py writes
   them), and everything else reads the named objects below. */

const C = window.CHAMP;
const DEX = C.DEX.map(function(r){
  return {name:r[0], species:r[1], types:r[2], b:r[3], mega:!!r[4], ab:r[5],
          dex:r[6] || 0};
});
/** The National Dex number, so the box sorts in the order HOME shows it and the
   two screens can be checked line by line. A name with no number sorts last
   (99999) rather than being given one from memory.
   @param {string} name */
function dexNo(name){
  const n = C.DEXNO?.[name];
  if (n) return n;
  const p = byName[name];
  return p?.dex ? p.dex : 99999;
}
/** "#0445", or "#----" for a name with no number.
   @param {string} name */
function dexLabel(name){
  const n = dexNo(name);
  return n === 99999 ? "#----" : "#" + String(n).padStart(4, "0");
}
/** @type {Record<string, DexRow>} */
const byName = {};
DEX.forEach(function(p){ byName[p.name] = p; });
/* Every form a box row can be, alphabetical: the dex minus the Megas, which
   are reached through a stone and never owned on their own. */
const FORMS = DEX.filter(function(p){ return !p.mega; })
               .sort(function(a,b){ return a.name.localeCompare(b.name); });
/** @type {Record<string, DexRow[]>} */
const MEGAS_OF = {};                       // species -> its Mega rows
DEX.forEach(function(p){
  if (!p.mega) return;
  MEGAS_OF[p.species] ||= [];
  MEGAS_OF[p.species].push(p);
});
/** @type {Record<string, string>} */
const STONE_OF = {};                       // mega name -> stone name
C.STONES.forEach(function(r){ STONE_OF[r[1]] = r[0]; });
/* `cat` is P physical, S special, T status. `i` is the move's index in
   C.MOVES, which is how learnsets and the ability tables refer to it. */
const MOVES = C.MOVES.map(function(r,i){
  return {i:i, name:r[0], type:r[1], cat:r[2], bp:r[3], acc:r[4], pp:r[5],
          pri:r[6], target:r[7], spread:!!r[8], hitsAlly:!!r[9],
          hits:r[10] || null, crit:!!r[11], f:r[12] || "",
          text:r[13] || ""};
});
/** The comparator for sorting names: locale-aware, so an accent never
   sorts after "z".
   @param {unknown} a
   @param {unknown} b */
function byText(a, b){ return String(a).localeCompare(String(b)); }
/** 1 -> "1st", 4 -> "4th": a finishing place. Worlds ranks stop at 8.
   @param {number} n */
function ordinal(n){ return ({1: "1st", 2: "2nd", 3: "3rd"})[n] || n + "th"; }
/** "1 build", "3 builds"
   @param {number} n
   @param {string} word */
function plural(n, word){ return n + " " + word + (n === 1 ? "" : "s"); }
/** @type {Record<string, string>} */
const CATEGORY = {P: "Physical", S: "Special"};
/** A move's category code as the word the screens show.
   @param {string} c */
function catName(c){ return CATEGORY[c] || "Status"; }
/** @type {Record<string, Move>} */
const MOVE_BY = {};
MOVES.forEach(function(m){ MOVE_BY[m.name] = m; });
/* The order of `b` (base stats) and of every Stat Point spread. */
/** @type {Stat[]} */
const STAT_KEYS = ["hp","atk","def","spa","spd","spe"];
/** The Stat Points a spread spends, out of the 66 a build may.
   @param {SpSpread} sp */
function spTotal(sp){
  return STAT_KEYS.reduce(function(a,k){ return a + (Number(sp[k]) || 0); }, 0);
}
const STAT_LABEL = {hp:"HP", atk:"Atk", def:"Def", spa:"SpA", spd:"SpD", spe:"Spe"};
/* THE OFFICIAL TYPE COLOURS, from pokemon.com's own stylesheet
   (scripts/build_type_colors.py). Each type brings three facts:

     top     the type's colour
     bottom  a second colour - Flying, Ground and Dragon really have two, and
             their badge is halved top to bottom
     ink     the colour the type's name is written in, white or near-black

   Never darken a colour so white text fits on it: a darkened colour is no
   longer the type's colour. `ink` is what keeps the text readable instead.
   The three tables are views onto that one source, built rather than
   written so they cannot drift from it. */
const TYPE_COLORS = window.CHAMP?.TYPE_COLORS || {};
/** @type {Record<string, string>} */
const TYPE_COLOR = {};
/** @type {Record<string, string>} */
const TYPE_COLOR2 = {};
/** @type {Record<string, string>} */
const TYPE_INK = {};
Object.keys(TYPE_COLORS).forEach(function(t){
  TYPE_COLOR[t] = TYPE_COLORS[t].top;
  TYPE_COLOR2[t] = TYPE_COLORS[t].bottom || TYPE_COLORS[t].top;
  TYPE_INK[t] = TYPE_COLORS[t].ink || "#FFFFFF";
});
/* What things cost in VP. The same prices as scripts/ledger.py, which is
   where a recommendation in the terminal reads them. */
const COSTS = {ranked_win:300, mega_stone_shop:2000, keep_rental_pokemon:2500,
             training_move:250, training_nature:500, training_ability:500,
             training_stat_point:5};
/** A name as an id: "Mr. Mime" -> "mr-mime". Empty when nothing is left, so
   each caller names its own fallback.
   @param {unknown} s */
function slug(s){
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
/** The first slug of `s` not already a key of `taken`: mr-mime, mr-mime-2...
   Only for ids decided on this device; a new database row goes through
   store.putNew(), where the DATABASE decides what is free.
   @param {string} s
   @param {Record<string, unknown>} taken */
function freeSlug(s, taken){
  const b = slug(s) || "x";
  let k = b, n = 2;
  while (taken[k]) { k = b + "-" + n; n++; }
  return k;
}
/** THE FORMS A POKEMON TAKES DURING THE BATTLE, off an ability rather than a
   stone, shaped exactly like a Mega row so the card draws them with the same
   machinery: Stance Change (Aegislash), Zero to Hero (Palafin), Forecast
   (Castform), Hunger Switch (Morpeko), Disguise (Mimikyu). A form that moves
   no number is still listed, because it can change what a move does
   (Hangry Morpeko's Aura Wheel is Dark, see formMoves).

   `battle` is the form's own name and is what tells the label helpers in
   ui/card.js that this is not a Mega. `by` is the ability that does it, `sp`
   its picture.
   @param {DexRow | null | undefined} p
   @returns {DexRow[]} */
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
/** WHAT A FORM DOES TO ITS MOVES, as [move, type before, type in this form].

   C.FORM_TYPED is the table the calculator reads - the moves whose type
   comes from the user's form rather than from the move row - so this is the
   same fact asked the other way round.
   @param {DexRow} form
   @param {DexRow} base */
function formMoves(form, base){
  const ft = C.FORM_TYPED || {};
  return Object.keys(ft).filter(function(mv){
    const t = ft[mv][form.name];
    return t && t !== ft[mv][base.name];
  }).map(function(mv){
    return [mv, ft[mv][base.name] || MOVE_BY[mv]?.type, ft[mv][form.name]];
  });
}
/** The Megas (`megas` true) or the battle forms of a species Champions does
   not have, read off its outside row. `sfx` is the stone's letter, carried
   rather than worked out of the name: Tatsugiri-Droopy's Mega is "Mega
   Tatsugiri", and subtracting one name from the other leaves nonsense.
   @param {DexRow} p
   @param {boolean} megas
   @returns {DexRow[]} */
function outsideForms(p, megas){
  return (p.forms || []).filter(function(f){
    return megas ? f.mega !== undefined : f.mega === undefined;
  }).map(function(f){
    return {name: f.n, species: p.species || p.name, types: f.t || p.types,
            b: f.b || p.b, ab: f.ab || [], outside: true, sp: f.sp,
            sfx: f.mega, battle: f.k, by: f.by};
  });
}
/** Base stat total.
   @param {DexRow} p */
function bst(p){ return p.b.reduce(function(a,b){ return a+b; }, 0); }
/** A ROW FOR A POKEMON CHAMPIONS DOES NOT HAVE, so HOME can show what it is
   when deciding what to keep or trade.

   Shaped like a dex row so every card component takes it unchanged, with
   `outside` set so callers can say where the numbers came from: PokeAPI's
   MAIN-SERIES numbers, never Champions data. `approx` names the base species
   when PokeAPI had no row for that exact form.

   FOR DISPLAY ONLY. Whatever decides what a Pokemon can DO - whether it is
   legal, whether it Mega Evolves, whether it can be brought - asks byName,
   which knows only the Champions dex.
   @param {string} name
   @returns {DexRow | null} */
function outsideRow(name){
  const h = C.HOME_DEX?.[name];
  if (!h) return null;
  return {name:name, species:name, types:h.t || [], b:h.b || [],
          ab:h.ab || [], mega:false, dex:0,
          outside:true, approx:h.approx || null, forms:h.f || null};
}
/** The row to DRAW for any name: the Champions row first, always, so a
   Champions Pokemon is never described by outside numbers; then the same
   for the name's other spelling (C.LEARN_ALIAS - a bare "Floette" from a
   Worlds teamlist IS Floette-Eternal, the only Floette the game has); then
   the outside row.
   @param {string} name
   @returns {DexRow | null} */
function anyRow(name){
  const alias = C.LEARN_ALIAS?.[name];
  return byName[name] || (alias && byName[alias]) || outsideRow(name)
         || (alias && outsideRow(alias)) || null;
}

/* THE PICTURES ARE FETCHED, NEVER STORED. Sprites are Nintendo / Game Freak
   artwork and this repository is public, so only the id ships; the image
   comes from PokeAPI's sprites repo on a CDN, at a pinned commit so a
   picture never changes under the app. A takedown is one line here rather
   than a rewritten git history. A picture is safe to borrow even for the
   species Champions has: its numbers are rebalanced, its looks are not.

   IMG_HOSTS is every outside host a picture comes from, declared once:
   scripts/build_tracker_page.py reads this array out of the linked app and
   writes it into the Content-Security-Policy. Adding a host here is what
   allows it in production; nothing local enforces the policy, so a host
   missing from it works in development and is blocked, silently, live. */
const IMG_HOSTS = ["https://cdn.jsdelivr.net"];
const SPRITE_PIN = "2ecb4eeacd5a1718621fc30f12772e3f60d830b9";
const SPRITE_BASE = IMG_HOSTS[0] + "/gh/PokeAPI/sprites@" + SPRITE_PIN +
                  "/sprites/pokemon/";

/** A level-50 stat: base + Stat Points (capped at 32) + 75 for HP or 20 for
   the rest, times the nature. The formula was verified against 504 speed
   tiers.
   @param {number} base
   @param {number | undefined} sp
   @param {boolean} isHp
   @param {number} mult */
function statAt(base, sp, isHp, mult){
  const v = base + Math.max(0, Math.min(32, sp || 0)) + (isHp ? 75 : 20);
  return Math.floor(v * (isHp ? 1 : (mult || 1)));
}
/** The nature's multiplier on one stat: 1.1, 0.9 or 1.
   @param {string | null | undefined} nature
   @param {Stat} key */
function natMult(nature, key){
  const n = nature ? C.NATURES[nature] : null;
  if (!n) return 1;
  if (n[0] === key) return 1.1;
  if (n[1] === key) return 0.9;
  return 1;
}
/** What each attacking type does to this typing, as {type: multiplier}, with
   the neutral (x1) types left out.
   @param {string[]} types */
function defence(types){
  /** @type {Record<string, number>} */
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
/** A Pokemon's movepool, as move rows. THE FORM FIRST, then the species: a
   regional form has its own pool (Samurott-Hisui learns Ceaseless Edge,
   Samurott does not), and the build editor offers from this list. The
   species is the fallback a Mega needs, since a Mega has no learnset of its
   own. Between the two, C.LEARN_ALIAS: the few forms filed under neither
   name (Champions' Floette is the Eternal Flower one), resolved with norm()
   by build_tracker_data.py so this stays a plain lookup.
   @param {string} name */
function learnset(name){
  const p = byName[name];
  const sp = p ? p.species : name;
  const alias = C.LEARN_ALIAS?.[name];
  const ids = C.LEARN[name] || (alias && C.LEARN[alias]) || C.LEARN[sp] || null;
  return ids ? ids.map(function(i){ return MOVES[i]; }) : null;
}
/** The Megas THIS form can become. A Mega belongs to one form, not to the
   species: Raichu-Alola cannot hold a Raichunite, and Mega Floette belongs
   to Floette-Eternal. Smogon's roster states the relation (`baseSpecies` on
   each Mega) and build_tracker_data.py ships it as C.MEGA_OWNER; the species
   is only the fallback for a form Smogon does not carry.
   @param {string} name
   @returns {DexRow[]} */
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
   pokebase's per-Pokemon pages (window.CHAMP_SPLITS): of the Rillaboom
   brought to a tournament, how many held each item, ran each nature,
   ability, spread and move, and which teammates came with it. The global
   usage tables answer "how used is Sucker Punch"; this answers the question
   a build asks.

   WHAT A PERCENTAGE IS A SHARE OF DEPENDS ON THE SECTION, and it decides how
   a chip may be coloured. A set holds one item, ability, nature and spread,
   so those are a share of SETS and read directly. It holds four moves, and
   pokebase divides by slots, so the move column sums to 100 over the whole
   movepool and its top row is near 25 - a fixed "50% is popular" rule would
   call every move fringe. So emphasis is measured against that Pokemon's own
   top row (splitMax), and SHARE_OF names the denominator for the tooltip.
   Teammates are a share of TEAMS, five other slots each, so they sum to ~400.

   A separate asset from the dex because it is fetched weekly and the dex
   nightly. A Mega falls back to its base species: pokebase files usage
   under the species people bring, and a Mega is that species holding a
   stone. */
/** @param {string} name
    @returns {SplitTable | null} */
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
/** The percentage for one thing. `null` means this Pokemon has no table at
   all (nobody brought it) and 0 means the table exists and this is not in
   it: silence against a measured "nobody", and the app shows them
   differently.
   @param {string} name
   @param {string} kind
   @param {string} what */
function splitPct(name, kind, what){
  const s = splitsFor(name);
  const rows = s?.[kind];
  if (!rows?.length) return null;
  for (const row of rows) {
    if (row[0] === what) return row[1];
  }
  return 0;
}
/** That Pokemon's own top row for a section. Rows arrive sorted descending, so
   this is row 0 and not a scan.
   @param {string} name
   @param {string} kind */
function splitMax(name, kind){
  const s = splitsFor(name);
  const rows = s?.[kind];
  return rows?.length ? rows[0][1] : 0;
}
/** What a usage share is a share OF, by the kind of column it came from.
    @type {Record<string, string>} */
const SHARE_OF = {m: "of this Pokemon's move slots", t: "of its teams also carried this"};

/* ---------------------------------------------------------- what WON ------
   The top 8 of every World Championship, per division, with the exact set
   each Pokemon carried. Everything else in the app is a RATE; this is a
   RESULT: this set, this placement, this player.

   Filed under the form that was REGISTERED, which is always the base one -
   of the 16,875 team slots pokedata publishes, none is written as a Mega.
   So the 2026 winner's "Floette @ Floettite" is filed under Floette, and a
   search for Floette finds it. The stone in the set says which Mega it
   becomes, and build_tracker_data.py derives that Mega and its ability. The
   recorded ability is the base one, which is correct: it is what the
   Pokemon has until it evolves. */
/** @param {string} name */
function podiumFor(name){
  return C.PODIUM?.[name] || [];
}

export {
  anyRow, battleFormsOf, bst, byName, byText, C, catName, COSTS, defence, DEX,
  dexLabel, dexNo, formMoves, FORMS, freeSlug, learnset, MEGAS_OF, megasFor,
  MOVE_BY, MOVES, natMult, ordinal, outsideForms, outsideRow, plural,
  podiumFor, SHARE_OF, slug, splitMax, splitPct, splitsFor, splitsReg, SPRITE_BASE,
  spTotal, STAT_KEYS, STAT_LABEL, statAt, STONE_OF, TYPE_COLOR, TYPE_COLOR2,
  TYPE_INK,
};
