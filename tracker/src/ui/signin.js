/* The sign-in gate, the connection to Supabase, and the signed-in button. */
import { $, el, field } from "../core/dom.js";
import { dbState, openLedger } from "../core/store.js";
import { ask } from "./nav.js";

/* Called once by boot.js. A build with no Supabase config (or no client
   library) still runs the reference tabs and says it is not connected. */
function connect(){
  const cfg = window.CHAMP_CONFIG || {};
  if (cfg.supabase && window.supabase) return connectSupabase(cfg.supabase);
  dbState(false, "no backend configured");
}

/* ------------------------------------------------------- Supabase + auth --
   The gate is not decoration: until there is a session the app has no rows to
   show, because the server refuses to send any. */
/** @type {Ledger["sb"] | null} */
let SB = null;
/** Create the client, restore the session or show the sign-in gate, and reload
   on sign-out so no ledger stays on screen. Only called with the library loaded.
   @param {{url: string, key: string, email?: string}} cfg */
function connectSupabase(cfg){
  const sb = SB = /** @type {NonNullable<Window["supabase"]>} */ (window.supabase).createClient(cfg.url, cfg.key);
  field("gateEmail").value = cfg.email || "";
  $("gateFoot").textContent =
    "Nothing is stored in this page - your box lives in the database, and "
    + "only this password reaches it.";
  sb.auth.getSession().then(function(r){
    const s = r.data?.session;
    if (s) { start(s); } else { showGate(); }
  }, function(){ showGate("Could not reach the database."); });

  sb.auth.onAuthStateChange(function(evt){
    if (evt === "SIGNED_OUT") location.reload();
  });
}
/** Show the sign-in form, with an error line when there is one.
   @param {string} [msg] */
function showGate(msg){
  $("gate").hidden = false;
  if (msg) { $("gateErr").textContent = msg; $("gateErr").hidden = false; }
  setTimeout(function(){
    (field("gateEmail").value ? field("gatePass") : field("gateEmail")).focus();
  }, 80);
}
/** Signed in: hide the gate and open the ledger as this user.
   @param {import("@supabase/supabase-js").Session} session */
function start(session){
  $("gate").hidden = true;
  openLedger(/** @type {Ledger["sb"]} */ (SB), session.user.id);
  dbState(true, "live");
  signedInChip(session.user.email || "");
}
/** The header button that says who is signed in and signs out.
   @param {string} email */
function signedInChip(email){
  const bar = /** @type {ParentNode} */ ($("themeBtn").parentNode);
  if ($("whoBtn")) return;
  const b = el("button", "iconbtn", null);
  b.id = "whoBtn";
  b.title = "Signed in as " + email + " - tap to sign out";
  b.setAttribute("aria-label", "Sign out");
  b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.7" stroke-linecap="round">' +
    '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h11"/></svg>';
  b.onclick = function(){
    ask("Sign out?", "You are signed in as " + email + ".", "Sign out")
      .then(function(ok){ if (ok) SB?.auth.signOut(); });
  };
  bar.insertBefore(b, $("themeBtn"));
}
if ($("gateForm")) {
  $("gateForm").onsubmit = function(e){
    e.preventDefault();
    if (!SB) return;
    const btn = field("gateBtn");
    btn.disabled = true; btn.textContent = "Signing in…";
    $("gateErr").hidden = true;
    SB.auth.signInWithPassword({
      email: field("gateEmail").value.trim(), password: field("gatePass").value
    }).then(function(r){
      btn.disabled = false; btn.textContent = "Sign in";
      if (r.error) {
        $("gateErr").textContent = /invalid/i.test(r.error.message || "")
          ? "That email and password do not match an account."
          : r.error.message;
        $("gateErr").hidden = false;
        field("gatePass").select();
        return;
      }
      field("gatePass").value = "";
      start(r.data.session);
    }, function(){
      btn.disabled = false; btn.textContent = "Sign in";
      $("gateErr").textContent = "Could not reach the database.";
      $("gateErr").hidden = false;
    });
  };
}

export { connect };
