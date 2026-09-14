/* 03-store.js - put/putNew/patch/drop, the Supabase adapter behind them, and sign-in.
   Part of the app; assembled into one script by scripts/build_tracker_page.py. */
import { $, el, toast } from "./01-data.js";
import { S } from "./02-state.js";
/* renderAll still lives in 13-boot, which is not a module yet, so it is reached
   through the bridge the build generates for the parts that have not been
   converted. When 13-boot becomes a module this line changes to name it and
   the bridge shrinks by one - that is what makes the remaining debt visible
   from inside the code instead of only in a plan. A cycle either way (the
   bridge imports this file's put/patch/drop), which ES modules resolve on
   their own: renderAll is a hoisted function declaration and is only ever
   CALLED after both sides have loaded. */
import { renderAll } from "./_legacy.js";
/* ===================================================================== db */
function put(path, body){
  if (!S.db) { toast("Not connected to the store"); return Promise.resolve(); }
  body.updated = new Date().toISOString().slice(0,10);
  return S.db.doc(path).set(body).catch(function(e){
    toast("Could not save: " + (e && e.code || "error"));
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
        if (!taken) { toast("Could not save: " + (e && e.code || "error")); throw e; }
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
    if (e && e.code === "invalid_argument") return S.db.doc(path).set(body);
    toast("Could not save: " + (e && e.code || "error"));
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

function supabaseStore(sb, uid){
  var listeners = {};                 // collection -> [callback]
  var cache = {};                     // collection -> {id: row}

  function emit(coll){
    var rows = cache[coll] || {};
    var docs = Object.keys(rows).sort().map(function(id){
      return {id:id, exists:true, data:function(){
        return docFromRow(coll, rows[id]); }, metadata:{}};
    });
    (listeners[coll] || []).forEach(function(fn){
      fn({docs:docs, size:docs.length, empty:!docs.length,
          docChanges:function(){ return []; }, metadata:{}});
    });
  }

  function load(coll){
    return sb.from(coll).select("*").then(function(r){
      if (r.error) throw r.error;
      var m = {};
      (r.data || []).forEach(function(row){ m[row.id] = row; });
      cache[coll] = m;
      emit(coll);
    });
  }

  var COLLS = ["box", "builds", "teams", "meta"];
  COLLS.forEach(function(coll){
    load(coll).catch(function(e){
      console.error("[ledger] load " + coll, e);
      toast("Could not load " + coll);
    });
  });

  // one channel for the lot: a change made on the phone lands on the PC
  sb.channel("ledger")
    .on("postgres_changes", {event:"*", schema:"public", table:"box"},
        function(){ load("box"); })
    .on("postgres_changes", {event:"*", schema:"public", table:"builds"},
        function(){ load("builds"); })
    /* teams was added after this channel was written and was left out of it,
       so a team saved on the phone never reached the laptop until a reload -
       and that stale view is exactly what makes two devices compute the same
       new id. */
    .on("postgres_changes", {event:"*", schema:"public", table:"teams"},
        function(){ load("teams"); })
    .on("postgres_changes", {event:"*", schema:"public", table:"meta"},
        function(){ load("meta"); })
    .subscribe();

  function split(path){
    var i = path.indexOf("/");
    return [path.slice(0, i), path.slice(i + 1)];
  }

  return {
    doc: function(path){
      var p = split(path), coll = p[0], id = p[1];
      return {
        get: function(){
          var row = (cache[coll] || {})[id];
          return Promise.resolve({id:id, exists:!!row,
            data:function(){ return row ? docFromRow(coll, row) : undefined; },
            metadata:{}});
        },
        /* INSERT, not upsert: the point is that it FAILS when the id is
           taken. Creating a record computes its id from what this device can
           see - farigiraf, farigiraf-2 - so two devices creating at the same
           moment both pick the same one, and an upsert would let the second
           silently replace the first. The primary key (user_id, id) already
           knows better; this just stops asking it to look the other way. */
        create: function(d){
          var row = rowFromDoc(coll, id, uid, d);
          return sb.from(coll).insert(row).then(function(r){
            if (r.error) throw r.error;
            if (!cache[coll]) cache[coll] = {};
            cache[coll][id] = row;
            emit(coll);
          });
        },
        set: function(d){
          var row = rowFromDoc(coll, id, uid, d);
          return sb.from(coll).upsert(row, {onConflict:"user_id,id"})
            .then(function(r){
              if (r.error) throw r.error;
              (cache[coll] = cache[coll] || {})[id] =
                Object.assign({}, cache[coll][id] || {}, row);
              emit(coll);
            });
        },
        update: function(d){
          // meta bodies merge inside the jsonb; the other tables merge columns
          var cur = (cache[coll] || {})[id];
          if (coll === "meta") {
            var merged = Object.assign({}, (cur && cur.data) || {});
            Object.keys(d).forEach(function(k){
              if (k !== "updated") merged[k] = d[k]; });
            return this.set(merged);
          }
          var full = Object.assign({}, cur ? docFromRow(coll, cur) : {}, d);
          return this.set(full);
        },
        delete: function(){
          return sb.from(coll).delete().eq("id", id).then(function(r){
            if (r.error) throw r.error;
            if (cache[coll]) delete cache[coll][id];
            emit(coll);
          });
        },
        onSnapshot: function(next){
          (listeners[coll] = listeners[coll] || []).push(function(snap){
            var hit = null;
            snap.docs.forEach(function(x){ if (x.id === id) hit = x; });
            next(hit || {id:id, exists:false,
                         data:function(){ return undefined; }, metadata:{}});
          });
          var rows = cache[coll];
          if (rows) setTimeout(function(){ emit(coll); }, 0);
          return function(){};
        }
      };
    },
    collection: function(name){
      return {
        onSnapshot: function(next){
          (listeners[name] = listeners[name] || []).push(next);
          if (cache[name]) setTimeout(function(){ emit(name); }, 0);
          return function(){};
        }
      };
    }
  };
}

function connect(){
  var cfg = window.CHAMP_CONFIG || {};
  if (cfg.supabase && window.supabase) return connectSupabase(cfg.supabase);
  if (!window.claude || !window.claude.use) { dbState(false, "no backend configured"); return; }
  window.claude.use("db").then(function(db){
    if (!db) { dbState(false, "not available in this view"); return; }
    S.db = db;
    dbState(true, "live");
    wire(db);
  }, function(){ dbState(false, "failed to load"); });
}

/* attach the app to whichever store it was handed */
function wire(db){
  db.collection("box").onSnapshot(function(snap){
    var m = {};
    snap.docs.forEach(function(d){ m[d.id] = d.data() || {}; });
    S.box = m; S.ready = true; renderAll();
  }, function(e){ dbState(false, e.code); });
  db.collection("builds").onSnapshot(function(snap){
    var m = {};
    snap.docs.forEach(function(d){ m[d.id] = d.data() || {}; });
    S.builds = m; renderAll();
  }, function(e){ dbState(false, e.code); });
  db.collection("teams").onSnapshot(function(snap){
    var m = {}; snap.docs.forEach(function(doc){ m[doc.id] = doc.data(); });
    S.teams = m; renderAll();
  }, function(e){ dbState(false, e.code); });
  ["trainer","stones","items","gts"].forEach(function(k){
    db.doc("meta/" + k).onSnapshot(function(d){
      S.meta[k] = d.exists ? (d.data() || {}) : {};
      renderAll();
    }, function(e){ dbState(false, e.code); });
  });
}

/* ------------------------------------------------------- Supabase + auth --
   The gate is not decoration: until there is a session the app has no rows to
   show, because the server refuses to send any. */
var SB = null;
function connectSupabase(cfg){
  SB = window.supabase.createClient(cfg.url, cfg.key);
  $("gateEmail").value = cfg.email || "";
  $("gateFoot").textContent =
    "Nothing is stored in this page - your box lives in the database, and "
    + "only this password reaches it.";
  SB.auth.getSession().then(function(r){
    var s = r.data && r.data.session;
    if (s) { start(s); } else { showGate(); }
  }, function(){ showGate("Could not reach the database."); });

  SB.auth.onAuthStateChange(function(evt, session){
    if (evt === "SIGNED_OUT") location.reload();
  });
}
function showGate(msg){
  $("gate").hidden = false;
  if (msg) { $("gateErr").textContent = msg; $("gateErr").hidden = false; }
  setTimeout(function(){
    ($("gateEmail").value ? $("gatePass") : $("gateEmail")).focus();
  }, 80);
}
function start(session){
  $("gate").hidden = true;
  S.db = supabaseStore(SB, session.user.id);
  dbState(true, "live");
  signedInChip(session.user.email);
  wire(S.db);
}
function signedInChip(email){
  var bar = $("themeBtn").parentNode;
  if ($("whoBtn")) return;
  var b = el("button", "iconbtn", null);
  b.id = "whoBtn";
  b.title = "Signed in as " + email + " - tap to sign out";
  b.setAttribute("aria-label", "Sign out");
  b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.7" stroke-linecap="round">' +
    '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h11"/></svg>';
  b.onclick = function(){
    if (!confirm("Sign out of " + email + "?")) return;
    SB.auth.signOut();
  };
  bar.insertBefore(b, $("themeBtn"));
}
if ($("gateForm")) {
  $("gateForm").onsubmit = function(e){
    e.preventDefault();
    if (!SB) return;
    var btn = $("gateBtn");
    btn.disabled = true; btn.textContent = "Signing in…";
    $("gateErr").hidden = true;
    SB.auth.signInWithPassword({
      email: $("gateEmail").value.trim(), password: $("gatePass").value
    }).then(function(r){
      btn.disabled = false; btn.textContent = "Sign in";
      if (r.error) {
        $("gateErr").textContent = /invalid/i.test(r.error.message || "")
          ? "That email and password do not match an account."
          : r.error.message;
        $("gateErr").hidden = false;
        $("gatePass").select();
        return;
      }
      $("gatePass").value = "";
      start(r.data.session);
    }, function(){
      btn.disabled = false; btn.textContent = "Sign in";
      $("gateErr").textContent = "Could not reach the database.";
      $("gateErr").hidden = false;
    });
  };
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

/* ------------------------------------------------------- what leaves here --
   Four writes and the connection. Everything else - the Supabase adapter, the
   row/document translation, the sign-in gate - is private to this file, which
   is the whole point of the part: the rest of the app asks for put/patch/drop
   and never learns what is behind them. */
export { connect, drop, patch, put, putNew };
