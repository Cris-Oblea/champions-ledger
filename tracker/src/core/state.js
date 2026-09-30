/* His state (S), loaded from the ledger, and the rules about his box that
   every screen asks the same way: origin, the release floor, what a build is
   bound to, and the lists' sort and search state (VIEW, FIND).

   S is exported as an OBJECT on purpose: another module may set S.box or
   S.tab, but `S = ...` anywhere but here is a build error rather than a
   silent second ledger. */
import { byName, byText, dexNo } from "./data.js";

/* VIEW state, read all over the app and written by the controls in boot.js:
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

/* ===================================================================== state */
const S = {box:{}, builds:{}, teams:{}, stones:{}, items:{}, gts:{},
         meta:{}, db:null, ready:false, tab:"box"};

function boxRows(loc, st){
  return Object.keys(S.box).map(function(k){
    var v = S.box[k]; v._id = k; return v;
  }).filter(function(v){
    return v.location === loc && (!st || v.status === st);
  }).sort(function(a,b){
    return (a.order||0) - (b.order||0) || String(a.name).localeCompare(b.name);
  });
}
/* ORIGIN, not "permanent", is the fact that matters. A Champions-origin
   Pokemon came out of an Encounter and can never leave the box; a HOME-origin
   one can be parked back to HOME and recalled with its training intact. A
   rental is an Encounter loan, so it is Champions origin by definition. */
function originOf(r){
  if (r.status === "rental") return "champions";
  if (r.origin === "home" || r.origin === "champions") return r.origin;
  return "unknown";
}
const ORIGIN_LABEL = {home:"HOME origin", champions:"Champions origin",
                    unknown:"origin?"};

/* ------------------------------------------------ who can be RELEASED ----
   Two in-game rules (player, 2026-09-27), and releasing is the only way out
   of the box that destroys the Pokemon, so both are enforced here, once:

   - A HOME-origin Pokemon is never released from the Champions box. The game
     does not offer it, and it has no reason to: "Park back to HOME" frees the
     slot and keeps the Pokemon. It is a real Pokemon, so a second copy of it
     is value, never a duplicate to get rid of.
   - The game refuses a release that would leave fewer than six to battle
     with. HOME-origin ones can always be parked out, so the floor lands on
     the Champions-origin ones: while six or fewer remain, none of them can
     go, and those six hold their slots for good ("así de simple").

   Returns null when the row can be released, or the reason it cannot. A row
   in the HOME box is only a ledger entry leaving (a trade, a transfer), so it
   is not asked about here. */
const RELEASE_FLOOR = 6;
function releaseBlock(r){
  if (r?.location !== "champions") return null;
  if (originOf(r) === "home") return "home";
  var n = boxRows("champions").filter(function(x){
    return originOf(x) !== "home";
  }).length;
  return n <= RELEASE_FLOOR ? "floor" : null;
}

/* ------------------------------------------------ a build has an OWNER ----
   A build is not a plan for a species, it is the set THIS Pokemon is carrying,
   so it lives and dies with the box row of the same id (player, 2026-09-10):

     in the Champions box  -> ACTIVE. The set it is actually running.
     parked back in HOME   -> KEPT but inactive. Nothing can be trained in
                              HOME, and it returns with the Pokemon.
     the row is released   -> the build goes with it. A Champions-origin
                              Pokemon can only leave by being released, so its
                              build always dies; a HOME-origin one has "Park
                              back to HOME", which keeps both.

   Anything else leaves an ORPHAN - a set for a Pokemon that no longer exists.
   There was one already (the Camerupt build, after its Camerupt was traded
   away), which is what prompted the rule. */
/* UNBOUND is not orphaned. A build with no box_id is an idea - a set written
   down for a Pokemon he does not have yet, so it survives until he does
   (player, 2026-09-13). An ORPHAN is different and still worth flagging: the
   build points at a row that no longer exists, which is what happens when the
   Pokemon is released or traded. */
function buildLink(id){
  var b = S.builds[id];
  var boxId = b?.box_id;
  if (!boxId) return {state:"unbound"};
  var row = S.box[boxId];
  if (!row) return {state:"orphan"};
  row._id = boxId;
  return {row:row, state:row.location === "champions" ? "active" : "parked"};
}
/* Every build written for this species, so the team builder and the sheet can
   offer the choice between them. A plain comparison is correct: both sides are
   dex names written by the picker, never a spelling from an outside source -
   norm() exists to join the five SOURCES, not our own rows. */
function buildsFor(name){
  return Object.keys(S.builds).filter(function(k){
    return S.builds[k].pokemon === name;
  });
}
/* The builds installed on one box row, found by their LINK (box_id): a
   build's own id stopped being its Pokemon's id when builds became many per
   species. `exceptId` leaves out the build being edited. */
function buildsOn(boxId, exceptId){
  return Object.keys(S.builds).filter(function(k){
    return k !== exceptId && S.builds[k].box_id === boxId;
  });
}
/* ------------------------------------------- the ability a build RUNS ------
   A SPECIES WITH ONE ABILITY NEVER MADE A CHOICE, so an empty `ability` on
   such a build is not a blank to be drawn as an em dash - it is the only
   ability that Pokemon has ever had. Aegislash is Stance Change, Clawitzer is
   Mega Launcher, and the editor showed exactly that in a <select> of one
   option while the row it saved held null (player, 2026-09-22: "los pokemones
   que tienen solo 1 ability no se guardan... no se reflejan los bonos en su
   movelist"). The editor writes it now; this is what makes the rows written
   before it did read correctly anyway, on the card, in the team builder and
   in the calculator.

   Where the species really does offer two or three, an unset ability STAYS
   unset. Nothing here picks the first or the popular one - an indicator sits
   beside a choice and never makes it (2026-09-15).

   All 81 Megas have exactly one ability, so a stone always resolves. */
function soleAbility(name){
  var p = name ? byName[name] : null;
  return p?.ab?.length === 1 ? p.ab[0] : null;
}
function baseAbility(b){
  return b?.ability || soleAbility(b?.pokemon) || null;
}
/* what the stone turns it into - null when the build carries no stone */
function megaAbility(b){
  return b?.mega ? (b.mega_ability || soleAbility(b.mega)) : null;
}
/* the one actually on the field: the Mega's while it is a Mega, otherwise the
   base form's. The base ability is the fallback for a stone whose own ability
   is somehow missing, which is the shape every call site already used. */
function activeAbility(b){
  return megaAbility(b) || baseAbility(b);
}
function originRows(o){
  return boxRows("champions", "permanent").filter(function(r){
    return originOf(r) === o;
  });
}
function capacity(){ return S.meta.trainer?.box_capacity || 50; }
/* A ROW PER STONE, not a list inside one document (migration 6).
   Owning a stone is the existence of its row, so marking one on the phone
   and another on the laptop are two independent writes and neither can
   erase the other. As a list they rewrote the whole document from
   whatever copy that device last loaded, and a device that had been
   asleep silently dropped what it never saw. */
function ownedStones(){ return Object.keys(S.stones).sort(byText); }
function hasStone(n){ return !!S.stones[n]; }
/* Same shape, same reason. The categories the old document carried are
   the game's own and come from the dex. */
function ownedItems(){ return S.items; }
function hasItem(n){ return !!S.items[n]; }
function ownedNames(){
  var m = {}; boxRows("champions").forEach(function(v){ m[v.name] = v.status; });
  return m;
}

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
const FIND = {q: "", moves: [], types: [], notTypes: [], typeMode: "and",
            ability: "",
            inChamp: false, inHome: false,
            sort: "bst", dir: "desc", cat: ""};

export {
  activeAbility, baseAbility, boxRows, buildLink, buildsFor, buildsOn,
  capacity, FIND,
  hasItem, hasStone, megaAbility, ORIGIN_LABEL, originOf, originRows,
  ownedItems, ownedNames, ownedStones, RELEASE_FLOOR, releaseBlock,
  rowMatches, S, soleAbility, sortRows, VIEW,
};
