/* The sign-in gate, the connection to Supabase, and the signed-in button. */
import { $, el } from "../core/dom.js";
import { S } from "../core/state.js";
import { dbState, supabaseStore, wire } from "../core/store.js";
import { ask } from "./nav.js";

function connect(){
  var cfg = window.CHAMP_CONFIG || {};
  if (cfg.supabase && window.supabase) return connectSupabase(cfg.supabase);
  dbState(false, "no backend configured");
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
    var s = r.data?.session;
    if (s) { start(s); } else { showGate(); }
  }, function(){ showGate("Could not reach the database."); });

  SB.auth.onAuthStateChange(function(evt){
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
    ask("Sign out?", "You are signed in as " + email + ".", "Sign out")
      .then(function(ok){ if (ok) SB.auth.signOut(); });
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

export { connect };
