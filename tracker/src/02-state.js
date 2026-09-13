/* 02-state.js - S: the ledger as this device sees it, and what a build is bound to.
   Part of the app; assembled into one script by scripts/build_tracker_page.py. */
/* ===================================================================== state */
var S = {box:{}, builds:{}, teams:{}, meta:{}, db:null, ready:false, tab:"box"};

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
  return r.origin === "home" ? "home"
       : r.origin === "champions" ? "champions" : "unknown";
}
var ORIGIN_LABEL = {home:"HOME origin", champions:"Champions origin",
                    unknown:"origin?"};

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
  var boxId = b && b.box_id;
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
function originRows(o){
  return boxRows("champions", "permanent").filter(function(r){
    return originOf(r) === o;
  });
}
function boxUsed(){
  return boxRows("champions").length;
}
function capacity(){ return (S.meta.trainer && S.meta.trainer.box_capacity) || 50; }
function ownedStones(){ return (S.meta.stones && S.meta.stones.owned) || []; }
function hasStone(n){ return ownedStones().indexOf(n) >= 0; }
function ownedNames(){
  var m = {}; boxRows("champions").forEach(function(v){ m[v.name] = v.status; });
  return m;
}

