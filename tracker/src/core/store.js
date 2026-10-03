/* The ledger: loads every Supabase table into S, keeps it live over one
   Realtime channel, and is the only way anything is written (put, putNew,
   patch, drop). The screens call those four and never touch Supabase. */
import { byText } from "./data.js";
import { $, el, toast } from "./dom.js";
import { S } from "./state.js";

/* ============================================================ the ledger ==
   One Supabase client, a cache of every table, and the slice of S each table
   fills. Tables map onto what the app reads like this:

     box, builds, teams, gts -> S[table], {id: record}, sorted by id
     stones, items           -> S[table], {name: {updated}} - a row per owned thing
     meta                    -> S.meta.trainer, the one row that really is a document

   Every row carries user_id, and RLS on the server is what keeps one account's
   rows invisible to another. The key in this page cannot read past it.
   S.db is this connection, or null until the sign-in finishes. */
const TABLES = ["box", "builds", "teams", "stones", "items", "gts", "meta"];

/* The one thing this file knows about the screen: every change has to end in
   a redraw. boot.js says which, with whenChanged(renderAll), so the store
   never imports the screen it serves. */
let redraw = function(){};
function whenChanged(fn){ redraw = fn; }

/* Called once by ui/signin.js with the signed-in client: load every table,
   then subscribe to changes made anywhere else. */
function openLedger(sb, uid){
  S.db = {sb: sb, uid: uid, cache: {}};
  TABLES.forEach(function(t){
    load(t).catch(function(e){
      console.error("[ledger] load " + t, e);
      toast("Could not load " + t);
    });
  });
  /* ONE CHANNEL FOR THE LOT, so a change made on the phone lands on the PC.
     Subscribed from the same TABLES list the loads use, so a table can
     never be loaded but not followed - a device with a stale table is
     exactly how two devices end up computing the same new id. A change
     reloads that whole table: they are small, and a reload cannot drift. */
  let ch = sb.channel("ledger");
  TABLES.forEach(function(t){
    ch = ch.on("postgres_changes", {event:"*", schema:"public", table:t},
               function(){ load(t); });
  });
  ch.subscribe();
}

/* Read a whole table into the cache, then into S. */
function load(t){
  return S.db.sb.from(t).select("*").then(function(r){
    if (r.error) throw r.error;
    const m = {};
    (r.data || []).forEach(function(row){ m[row.id] = row; });
    S.db.cache[t] = m;
    publish(t);
  });
}

/* Hand the cache of one table to S, in the shape the app reads, and redraw. */
function publish(t){
  const rows = S.db.cache[t] || {};
  if (t === "meta") {
    S.meta.trainer = rows.trainer ? docFromRow(t, rows.trainer) : {};
  } else {
    const m = {};
    Object.keys(rows).sort(byText).forEach(function(id){
      m[id] = docFromRow(t, rows[id]); });
    S[t] = m;
  }
  if (t === "box") S.ready = true;
  redraw();
}

/* ================================================================ writes ==
   A path is "table/id": "builds/farigiraf". Every write goes to the database
   first and only then into the cache, so a failed write never shows as saved. */
function splitPath(path){
  const i = path.indexOf("/");
  return [path.slice(0, i), path.slice(i + 1)];
}
/* true (and says so) when there is no connection to write through */
function offline(){
  if (S.db) return false;
  toast("Not connected to the store");
  return true;
}
/* Every failed write tells the user, then rethrows so the caller's own
   promise rejects and nothing downstream treats it as saved. */
function saveFailed(e){
  toast("Could not save: " + (e?.code || "error"));
  throw e;
}

/* Write a whole record, creating or replacing it (an upsert). Stamps
   `updated`; resolves once the database has accepted it. */
function put(path, body){
  if (offline()) return Promise.resolve();
  body.updated = new Date().toISOString().slice(0,10);
  const [t, id] = splitPath(path);
  const row = rowFromDoc(t, id, S.db.uid, body);
  return S.db.sb.from(t).upsert(row, {onConflict:"user_id,id"}).then(function(r){
    if (r.error) throw r.error;
    const c = S.db.cache[t] ||= {};
    c[id] = {...c[id], ...row};
    publish(t);
  }).catch(saveFailed);
}

/* Merge some fields into a record. A meta body merges inside its jsonb (the
   record IS the jsonb), every other table merges columns - both are the
   record as the app reads it, plus `body`. */
function patch(path, body){
  if (offline()) return Promise.resolve();
  const [t, id] = splitPath(path);
  const cur = S.db.cache[t]?.[id];
  return put(path, {...(cur && docFromRow(t, cur)), ...body});
}

/* Create a record under the first id that is actually free.
   `stem` is the readable base - "farigiraf" - and this tries farigiraf,
   farigiraf-2, farigiraf-3... A clash is decided by the DATABASE, not by what
   this device happens to have loaded, which is the only way two devices can
   both be right. Readable ids are worth keeping: the build picker shows the id
   to tell one Farigiraf set from another, and a UUID would say nothing.
   INSERT, not upsert: the point is that it FAILS when the id is taken - two
   devices creating at the same moment both pick the same id, and an upsert
   would let the second silently replace the first.
   Returns the id it used. */
function putNew(t, stem, body){
  if (offline()) return Promise.resolve(null);
  body.updated = new Date().toISOString().slice(0, 10);
  const tried = [];
  let n = 1;
  /* Insert under stem, then stem-2, stem-3... until the database accepts an
     id. */
  function attempt(){
    const id = n === 1 ? stem : stem + "-" + n;
    tried.push(id);
    const row = rowFromDoc(t, id, S.db.uid, body);
    return S.db.sb.from(t).insert(row).then(function(r){
      if (r.error) throw r.error;
      S.db.cache[t] ||= {};
      S.db.cache[t][id] = row;
      publish(t);
      return id;
    }).catch(function(e){
      /* 23505 is Postgres' unique_violation: the id is taken, by this device
         or another one. Anything else is a real failure and must surface. */
      const taken = e && (e.code === "23505" ||
                        /duplicate key|already exists/i.test(e.message || ""));
      if (!taken) saveFailed(e);
      if (++n > 30) {
        toast("Could not find a free id after " + tried.length + " tries");
        throw e;
      }
      return attempt();
    });
  }
  return attempt();
}

/* Delete a record. Quietly does nothing while signed out, since there is
   nothing on screen to delete then. */
function drop(path){
  if (!S.db) return Promise.resolve();
  const [t, id] = splitPath(path);
  return S.db.sb.from(t).delete().eq("id", id).then(function(r){
    if (r.error) throw r.error;
    if (S.db.cache[t]) delete S.db.cache[t][id];
    publish(t);
  });
}

/* ======================================================= rows <-> records ==
   docFromRow turns a database row into the record the app reads (camelCase,
   defaults filled in); rowFromDoc is the way back. They are the only two
   functions that know the column names, so a schema change is edited here
   and in a supabase/ migration, nowhere else. */
function docFromRow(coll, row){
  if (coll === "meta") return row.data || {};
  /* A set table: the row's existence IS the fact, and there is nothing
     else to carry. The date is kept because the app shows it. */
  if (coll === "stones" || coll === "items")
    return {updated:(row.updated_at || "").slice(0, 10)};
  /* One trade, one row, from the deposit to the close - `closed` is the only
     thing that separates an open offer from a piece of history. The columns
     are what the app reads by name; `data` is what the trade MEASURED, spread
     back out so the reader does not have to know which is which. */
  if (coll === "gts") return {
    offered:row.offered, requested:row.requested,
    offeredId:row.offered_id || null,
    deposited:row.deposited || null, depositedAt:row.deposited_at || null,
    closed:row.closed || null, closedAt:row.closed_at || null,
    note:row.note || "", status:row.closed ? "TRADED" : "PENDING",
    ...row.data};
  if (coll === "box") return {name:row.name, location:row.location,
    status:row.status, origin:row.origin, note:row.note || "",
    shiny:!!row.shiny, trained:!!row.trained,
    order:row.ord || 0, updated:(row.updated_at || "").slice(0, 10)};
  if (coll === "teams") return {name:row.name, slots:row.slots || [],
    notes:row.notes || {}, updated:(row.updated_at || "").slice(0, 10)};
  return {pokemon:row.pokemon, box_id:row.box_id || null,
    mega:row.mega, ability:row.ability,
    mega_ability:row.mega_ability, nature:row.nature,
    stat_points:row.stat_points || {}, moves:row.moves || [],
    role:row.role || "", rationale:row.rationale || "",
    extra:row.extra || {}, updated:(row.updated_at || "").slice(0, 10)};
}
/* The app's record turned into its table's row: an owned stone or item is only
   an id, a trade keeps its columns and puts every other field in `data`,
   `meta` is one json document, and a box row, team or build maps field by
   field with the defaults the schema expects. */
function rowFromDoc(coll, id, uid, d){
  if (coll === "stones" || coll === "items") return {user_id:uid, id:id};
  if (coll === "gts") {
    /* everything that is not a column is a measurement, and goes to
       `data` - so a field added to a closed trade tomorrow needs no
       migration, and no field is silently dropped on the way in. */
    const COLS = {offered:1, requested:1, offeredId:1, deposited:1,
                depositedAt:1, closed:1, closedAt:1, note:1,
                status:1, updated:1};
    const extra = {};
    Object.keys(d).forEach(function(k){
      if (!COLS[k] && d[k] !== undefined) extra[k] = d[k];
    });
    return {user_id:uid, id:id,
            offered:d.offered || "", requested:d.requested || "",
            offered_id:d.offeredId || null,
            deposited:d.deposited || null,
            deposited_at:d.depositedAt || null,
            closed:d.closed || null, closed_at:d.closedAt || null,
            note:d.note || "", data:extra};
  }
  if (coll === "meta") {
    const body = {}; Object.keys(d).forEach(function(k){
      if (k !== "updated") body[k] = d[k]; });
    return {user_id:uid, id:id, data:body};
  }
  if (coll === "box") return {user_id:uid, id:id, name:d.name,
    location:d.location || "champions", status:d.status || "permanent",
    origin:d.origin || "unknown", note:d.note || "",
    shiny:!!d.shiny, trained:!!d.trained, ord:d.order || 0};
  if (coll === "teams") return {user_id:uid, id:id, name:d.name || "Untitled",
    slots:d.slots || [], notes:d.notes || {}};
  return {user_id:uid, id:id, pokemon:d.pokemon,
    box_id:d.box_id || null, mega:d.mega || null,
    ability:d.ability || null, mega_ability:d.mega_ability || null,
    nature:d.nature || null, stat_points:d.stat_points || {},
    moves:(d.moves || []).filter(Boolean), role:d.role || "",
    rationale:d.rationale || "", extra:d.extra || {}};
}

/* The connection line in Settings: live, or why not. */
function dbState(ok, why){
  const n = $("dbNote");
  n.innerHTML = "";
  const d = el("span", "dot " + (ok ? "live" : "off"));
  n.appendChild(d);
  n.appendChild(document.createTextNode(ok
    ? " Live. Every edit saves as you make it, on every device you open this on."
    : " Not connected (" + why + "). The reference tabs still work; edits will not save."));
}

export { dbState, drop, openLedger, patch, put, putNew, whenChanged };
