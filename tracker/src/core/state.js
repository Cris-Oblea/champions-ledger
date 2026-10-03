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
/* Whether a box row matches a lowercased search: its name, dex number,
   types, note, or the words "shiny" / "trained". */
function rowMatches(r, q){
  if (!q) return true;
  if (r.name.toLowerCase().includes(q)) return true;
  if (String(dexNo(r.name)).includes(q)) return true;
  const p = byName[r.name];
  if (p?.types.join(" ").toLowerCase().includes(q)) return true;
  if (q === "shiny" && r.shiny) return true;
  if (q === "trained" && r.trained) return true;
  if (r.note && String(r.note).toLowerCase().includes(q)) return true;
  return false;
}
/* A copy of the rows in the order VIEW.sort asks for: A-Z, or dex order
   (the order HOME itself shows). */
function sortRows(rows){
  const r = rows.slice();
  if (VIEW.sort === "az") {
    r.sort(function(a, b){ return a.name.localeCompare(b.name); });
  } else {
    r.sort(function(a, b){
      return dexNo(a.name) - dexNo(b.name) || a.name.localeCompare(b.name);
    });
  }
  return r;
}

/* ===================================================================== state
   One map per table, {id: record}, filled by core/store.js. `db` is the live
   connection (null until signed in), `ready` turns true once the box has
   loaded, and `tab` is the screen showing. */
const S = {box:{}, builds:{}, teams:{}, stones:{}, items:{}, gts:{},
         meta:{}, db:null, ready:false, tab:"box"};

/* The box rows in one location ("champions" or "home"), optionally of one
   status ("permanent" / "rental"), in his own order. Each row gets its id as
   `_id`, since the record itself does not carry it. */
function boxRows(loc, st){
  return Object.keys(S.box).map(function(k){
    const v = S.box[k]; v._id = k; return v;
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
   Releasing is the only way out of the box that destroys the Pokemon, so the
   game's two rules about it are enforced here, once:

   - A HOME-origin Pokemon is never released from the Champions box: "Park
     back to HOME" frees the slot and keeps it. A second copy of a real
     Pokemon is value, never a duplicate to get rid of.
   - The game refuses a release that would leave fewer than six to battle
     with. HOME-origin ones can always be parked out, so the floor lands on
     the Champions-origin ones: while six or fewer remain, none can go.

   Returns null when the row can be released, or the reason it cannot
   ("home" / "floor"). A row in the HOME box is only a ledger entry leaving
   (a trade, a transfer), so it is not asked about here. */
const RELEASE_FLOOR = 6;
function releaseBlock(r){
  if (r?.location !== "champions") return null;
  if (originOf(r) === "home") return "home";
  const n = boxRows("champions").filter(function(x){
    return originOf(x) !== "home";
  }).length;
  return n <= RELEASE_FLOOR ? "floor" : null;
}

/* ------------------------------------------------ what a build is BOUND to --
   A build is its own record: several can exist for one species, and one can
   be written for a Pokemon he does not own yet. Its `box_id` says which box
   row runs it, and that gives four states:

     active    box_id is a row in the Champions box - the set it is running
     parked    box_id is a row parked in HOME - kept, but nothing trains there
     orphan    box_id points at a row that no longer exists - worth flagging
     unbound   no box_id - an idea, not a fault

   Never fall back from a missing box_id to the build's own id: an idea build
   for Farigiraf has the id `farigiraf`, and a fallback would silently marry
   it to a box row of the same name. */
function buildLink(id){
  const b = S.builds[id];
  const boxId = b?.box_id;
  if (!boxId) return {state:"unbound"};
  const row = S.box[boxId];
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
/* The builds installed on one box row, found by their link (box_id), never
   by their own id. `exceptId` leaves out the build being edited. */
function buildsOn(boxId, exceptId){
  return Object.keys(S.builds).filter(function(k){
    return k !== exceptId && S.builds[k].box_id === boxId;
  });
}
/* ------------------------------------------- the ability a build RUNS ------
   A species with ONE ability never made a choice, so an empty `ability` on
   its build means that ability, not a blank: Aegislash is Stance Change.
   The editor writes it now; this keeps rows saved before it did correct on
   the card, in the team builder and in the calculator.

   Where the species offers two or three, an unset ability STAYS unset.
   Nothing here picks the first or the popular one - an indicator sits beside
   a choice and never makes it.

   Every Mega has exactly one ability, so a stone always resolves. */
function soleAbility(name){
  const p = name ? byName[name] : null;
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
   base form's (also the fallback for a stone whose own ability is missing) */
function activeAbility(b){
  return megaAbility(b) || baseAbility(b);
}
/* The permanent Champions-box rows of one origin ("home" / "champions"). */
function originRows(o){
  return boxRows("champions", "permanent").filter(function(r){
    return originOf(r) === o;
  });
}
/* The box's size. It grows in game, so it is his setting, not a constant. */
function capacity(){ return S.meta.trainer?.box_capacity || 50; }
/* A ROW PER STONE, not a list inside one document (migration 6). Owning a
   stone is the existence of its row, so marking one on the phone and another
   on the laptop are two independent writes and neither can erase the other.
   A shared list would be rewritten whole from whatever copy a device last
   loaded, and a device that had been asleep would drop what it never saw. */
function ownedStones(){ return Object.keys(S.stones).sort(byText); }
function hasStone(n){ return !!S.stones[n]; }
/* Held items: the same shape, for the same reason. Their categories are
   the game's own and come from the dex. */
function ownedItems(){ return S.items; }
function hasItem(n){ return !!S.items[n]; }
/* {name: status} for every species in the Champions box - "is it here,
   and is it a rental". */
function ownedNames(){
  const m = {}; boxRows("champions").forEach(function(v){ m[v.name] = v.status; });
  return m;
}

/* --------------------------------------------------------- the search view --
   Find's filters, ANDed, so "who learns Imprison AND Wide Guard AND Protect,
   and is in my box" is one question.

     q, moves, types, notTypes, typeMode, ability, cat   what to match
     inChamp, inHome      owned in the Champions box / in HOME, kept apart
                          because "playable today" and "can be brought in"
                          are different questions; both on means either
     sort, dir            a stat key, "bst" or "dex", and "desc" / "asc" -
                          the sort is what makes this the speed-tier list
                          (Speed ascending is the Trick Room view). Tapping
                          the stat already chosen flips the direction. */
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
