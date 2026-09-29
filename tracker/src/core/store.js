/* Every write (put, putNew, patch, drop) and the Supabase adapter behind
   them. The rest of the app asks for these four and never learns what is
   behind them. */
import { byText } from "./data.js";
import { $, el, toast } from "./dom.js";
import { S } from "./state.js";

/* ===================================================================== db */
function put(path, body){
  if (!S.db) { toast("Not connected to the store"); return Promise.resolve(); }
  body.updated = new Date().toISOString().slice(0,10);
  return S.db.doc(path).set(body).catch(function(e){
    toast("Could not save: " + (e?.code || "error"));
    throw e;
  });
}
/* Create a record under the first id that is actually free.
   `stem` is the readable base - "farigiraf" - and this tries farigiraf,
   farigiraf-2, farigiraf-3... A clash is decided by the DATABASE, not by what
   this device happens to have loaded, which is the only way two devices can
   both be right. Readable ids are worth keeping: the build picker shows the id
   to tell one Farigiraf set from another, and a UUID would say nothing.
   Returns the id it used. */
function putNew(coll, stem, body, cap){
  if (!S.db) { toast("Not connected to the store"); return Promise.resolve(null); }
  body.updated = new Date().toISOString().slice(0, 10);
  var n = 1, tried = [];
  function attempt(){
    var id = n === 1 ? stem : stem + "-" + n;
    tried.push(id);
    return S.db.doc(coll + "/" + id).create(body).then(function(){ return id; },
      function(e){
        /* 23505 is Postgres' unique_violation: the id is taken, by this device
           or another one. Anything else is a real failure and must surface. */
        var taken = e && (e.code === "23505" ||
                          /duplicate key|already exists/i.test(e.message || ""));
        if (!taken) { toast("Could not save: " + (e?.code || "error")); throw e; }
        if (++n > (cap || 30)) {
          toast("Could not find a free id after " + tried.length + " tries");
          throw e;
        }
        return attempt();
      });
  }
  return attempt();
}

function patch(path, body){
  if (!S.db) { toast("Not connected to the store"); return Promise.resolve(); }
  body.updated = new Date().toISOString().slice(0,10);
  return S.db.doc(path).update(body).catch(function(e){
    if (e?.code === "invalid_argument") return S.db.doc(path).set(body);
    toast("Could not save: " + (e?.code || "error"));
    throw e;
  });
}
function drop(path){
  if (!S.db) return Promise.resolve();
  return S.db.doc(path).delete();
}

/* ===================================================== the Supabase store ==
   The app talks to ONE small interface - doc(path).set/update/delete/onSnapshot
   and collection(name).onSnapshot - so the storage backend is swappable. This
   adapter puts Supabase behind that interface, mapping documents onto rows:

     box/{id}     -> table box      (order  <-> ord)
     builds/{id}  -> table builds   (columns one-to-one)
     meta/{id}    -> table meta     (the whole body lives in the data jsonb)

   Every row carries user_id, and RLS on the server is what keeps one account's
   rows invisible to another. The key in this page cannot read past it. */
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
function rowFromDoc(coll, id, uid, d){
  if (coll === "stones" || coll === "items") return {user_id:uid, id:id};
  if (coll === "gts") {
    /* everything that is not a column is a measurement, and goes to
       `data` - so a field added to a closed trade tomorrow needs no
       migration, and no field is silently dropped on the way in. */
    var COLS = {offered:1, requested:1, offeredId:1, deposited:1,
                depositedAt:1, closed:1, closedAt:1, note:1,
                status:1, updated:1};
    var extra = {};
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
    var body = {}; Object.keys(d).forEach(function(k){
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

/* THE STORE BEHIND put/patch/drop: one Supabase client, a cache of every
   table, and the listeners the app registered. `st` carries all of it:
   st.cache[coll][id] is a row as the database holds it; st.emit(coll) tells
   every listener of that table what it holds now. */
function supabaseStore(sb, uid){
  var st = {sb: sb, uid: uid, listeners: {}, cache: {}};
  st.emit = function(coll){ emitSnapshot(st, coll); };
  st.load = function(coll){ return loadTable(st, coll); };
  /* stones and items are tables of their own since migration 6 - a row per
     owned thing, so two devices toggling different ones cannot overwrite
     each other. They load exactly like the rest. */
  COLLS.forEach(function(coll){
    st.load(coll).catch(function(e){
      console.error("[ledger] load " + coll, e);
      toast("Could not load " + coll);
    });
  });
  /* ONE CHANNEL FOR THE LOT, so a change made on the phone lands on the PC.
     Subscribed from the same list the tables load from: teams was once left
     out of a hand-written list, so a team saved on the phone never reached
     the laptop - and that stale view is exactly what makes two devices
     compute the same new id. */
  var ch = sb.channel("ledger");
  COLLS.forEach(function(coll){
    ch = ch.on("postgres_changes", {event:"*", schema:"public", table:coll},
               function(){ st.load(coll); });
  });
  ch.subscribe();
  return {
    doc: function(path){ return docHandle(st, path); },
    collection: function(name){
      return {
        onSnapshot: function(next){
          st.listeners[name] ||= [];
          st.listeners[name].push(next);
          if (st.cache[name]) setTimeout(function(){ st.emit(name); }, 0);
          return function(){};
        }
      };
    }
  };
}

var COLLS = ["box", "builds", "teams", "stones", "items", "gts", "meta"];

/* Hand every listener of a table its rows, sorted by id, in the snapshot
   shape the app reads. */
function emitSnapshot(st, coll){
  var rows = st.cache[coll] || {};
  var docs = Object.keys(rows).sort(byText).map(function(id){
    return {id:id, exists:true, data:function(){
      return docFromRow(coll, rows[id]); }, metadata:{}};
  });
  (st.listeners[coll] || []).forEach(function(fn){
    fn({docs:docs, size:docs.length, empty:!docs.length,
        docChanges:function(){ return []; }, metadata:{}});
  });
}

/* Read a whole table into the cache, then tell its listeners. */
function loadTable(st, coll){
  return st.sb.from(coll).select("*").then(function(r){
    if (r.error) throw r.error;
    var m = {};
    (r.data || []).forEach(function(row){ m[row.id] = row; });
    st.cache[coll] = m;
    st.emit(coll);
  });
}

/* "builds/farigiraf" -> ["builds", "farigiraf"] */
function splitPath(path){
  var i = path.indexOf("/");
  return [path.slice(0, i), path.slice(i + 1)];
}

/* One document: read it, create it, overwrite it, merge into it, delete it,
   or listen to it. Every write goes to the database first and only then into
   the cache, so a failed write never shows as saved. */
function docHandle(st, path){
  var p = splitPath(path), coll = p[0], id = p[1];
  var sb = st.sb, cache = st.cache;
  return {
    get: function(){
      var row = cache[coll]?.[id];
      return Promise.resolve({id:id, exists:!!row,
        data:function(){ return row ? docFromRow(coll, row) : undefined; },
        metadata:{}});
    },
    /* INSERT, not upsert: the point is that it FAILS when the id is taken.
       Creating a record computes its id from what this device can see -
       farigiraf, farigiraf-2 - so two devices creating at the same moment
       both pick the same one, and an upsert would let the second silently
       replace the first. The primary key (user_id, id) already knows better;
       this just stops asking it to look the other way. */
    create: function(d){
      var row = rowFromDoc(coll, id, st.uid, d);
      return sb.from(coll).insert(row).then(function(r){
        if (r.error) throw r.error;
        if (!cache[coll]) cache[coll] = {};
        cache[coll][id] = row;
        st.emit(coll);
      });
    },
    set: function(d){
      var row = rowFromDoc(coll, id, st.uid, d);
      return sb.from(coll).upsert(row, {onConflict:"user_id,id"})
        .then(function(r){
          if (r.error) throw r.error;
          cache[coll] ||= {};
          cache[coll][id] = {...cache[coll][id], ...row};
          st.emit(coll);
        });
    },
    update: function(d){
      // meta bodies merge inside the jsonb; the other tables merge columns
      var cur = cache[coll]?.[id];
      if (coll === "meta") {
        var merged = {...cur?.data};
        Object.keys(d).forEach(function(k){
          if (k !== "updated") merged[k] = d[k]; });
        return this.set(merged);
      }
      var full = {...(cur && docFromRow(coll, cur)), ...d};
      return this.set(full);
    },
    delete: function(){
      return sb.from(coll).delete().eq("id", id).then(function(r){
        if (r.error) throw r.error;
        if (cache[coll]) delete cache[coll][id];
        st.emit(coll);
      });
    },
    onSnapshot: function(next){
      st.listeners[coll] ||= [];
      st.listeners[coll].push(function(snap){
        var hit = null;
        snap.docs.forEach(function(x){ if (x.id === id) hit = x; });
        next(hit || {id:id, exists:false,
                     data:function(){ return undefined; }, metadata:{}});
      });
      if (cache[coll]) setTimeout(function(){ st.emit(coll); }, 0);
      return function(){};
    }
  };
}

/* The one thing this file knows about the screen: every snapshot has to
   end in a redraw. boot.js says which, with whenChanged(renderAll), so the
   store never imports the screen it serves. */
var redraw = function(){};
function whenChanged(fn){ redraw = fn; }

/* attach the app to whichever store it was handed */
function wire(db){
  db.collection("box").onSnapshot(function(snap){
    var m = {};
    snap.docs.forEach(function(d){ m[d.id] = d.data() || {}; });
    S.box = m; S.ready = true; redraw();
  }, function(e){ dbState(false, e.code); });
  db.collection("builds").onSnapshot(function(snap){
    var m = {};
    snap.docs.forEach(function(d){ m[d.id] = d.data() || {}; });
    S.builds = m; redraw();
  }, function(e){ dbState(false, e.code); });
  db.collection("teams").onSnapshot(function(snap){
    var m = {}; snap.docs.forEach(function(doc){ m[doc.id] = doc.data(); });
    S.teams = m; redraw();
  }, function(e){ dbState(false, e.code); });
  /* The two set tables. Their ids ARE the names - "Charizardite Y",
     "Focus Sash" - so the map is the answer to "do I own this". */
  ["stones", "items", "gts"].forEach(function(coll){
    db.collection(coll).onSnapshot(function(snap){
      var m = {};
      snap.docs.forEach(function(doc){ m[doc.id] = doc.data() || {}; });
      S[coll] = m; redraw();
    }, function(e){ dbState(false, e.code); });
  });
  /* stones and items left this list with migration 6, the GTS with 7. What
     remains is the one document that really is a document. */
  ["trainer"].forEach(function(k){
    db.doc("meta/" + k).onSnapshot(function(d){
      S.meta[k] = d.exists ? (d.data() || {}) : {};
      redraw();
    }, function(e){ dbState(false, e.code); });
  });
}
function dbState(ok, why){
  var n = $("dbNote");
  n.innerHTML = "";
  var d = el("span", "dot " + (ok ? "live" : "off"));
  n.appendChild(d);
  n.appendChild(document.createTextNode(ok
    ? " Live. Every edit saves as you make it, on every device you open this on."
    : " Not connected (" + why + "). The reference tabs still work; edits will not save."));
}

export { dbState, drop, patch, put, putNew, supabaseStore, whenChanged, wire };
