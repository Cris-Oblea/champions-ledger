/* The deployed page is five files now, and JSDOM is handed one string.
 *
 * dist/index.html is a 51 KB shell that points at four hashed assets - the app,
 * the dex, the Smogon engine and supabase-js - so that a nightly dex refresh
 * re-downloads 347 KB instead of all 1,314. Splitting them is a DELIVERY
 * decision; the program is the same one, and the tests must keep exercising the
 * thing that ships rather than a convenient copy of it.
 *
 * So this puts the assets back exactly where they were. That matters twice
 * over: JSDOM will not fetch relative script srcs out of a string, and three of
 * the tests (consistencytest, learnsettest, profiletest) GREP this string for
 * the app's own source - duplicate declarations, whether `vp_balance` is still
 * written. Handed the bare shell they would have passed by finding nothing,
 * which is the worst way for a check to fail.
 */
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");

/* The repo, found from this file - never a hardcoded path, or the tests die
   on any other machine, CI included. Ends in "/" so a test can write
   ROOT + "data/...". */
const ROOT = path.join(__dirname, "..") + "/";

/* ONE CHECK, REPORTED BY NODE'S OWN RUNNER. Every test file used to carry its
   own `ok()`, a failure counter and a process.exit at the end - and three of
   them never exited non-zero at all, so the gate printed "ok" over whatever
   they found. node:test sets the exit code itself: a check that fails fails
   the file, whether or not anyone remembered to count it.

   Values are compared as strings, which is how every check here was written:
   a count against "0", a boolean against true, a list joined into one line. */
function check(label, got, want) {
  test(label, () => assert.equal(String(got), String(want)));
}

/* LET THE PAGE FINISH WHAT IT STARTED. Nothing the app does under test takes
   real time: the stubbed ledger answers with promises that are already
   resolved, and the app's own deferred work - go() running a tab's ON_SHOW,
   the store re-emitting a cached table - sits on zero-delay timers. Node fires
   timers of the same delay in the order they were set, and settles every
   pending promise between two of them, so one zero-delay turn queued after
   the page's own ends after all of it. The tests used to sleep 250 to 1500 ms
   instead - a guess, paid on every wait, that a slower machine could lose. */
const idle = () => new Promise(r => setTimeout(r, 0));

/* The one wait idle() cannot cover: a delay the APP chose, such as the
   confirm dialog moving focus 30 ms after it opens. Polls until cond() holds
   or two seconds pass, and never throws - the check that follows is what
   says whether it held, under its own label. */
async function until(cond) {
  const end = Date.now() + 2000;
  while (!cond() && Date.now() < end) await new Promise(r => setTimeout(r, 10));
}

/* The built page as one HTML string, with each hashed script inlined back so
   jsdom runs it without a server. */
function page() {
  const dist = path.join(ROOT, "tracker", "dist");
  let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  html = html.replace(/<script src="([^"]+\.js)"><\/script>/g, function (m, name) {
    const body = fs.readFileSync(path.join(dist, name), "utf8");
    /* </ has to be escaped on the way back in, or a literal </script> inside
       the code ends the tag early - the same reason the build escapes it. */
    return '<script id="' + name.split(".")[0] + '">'
           + body.replace(/<\//g, "<\/") + "</script>";
  });
  /* A PAGE BUILT WITHOUT SECRETS GETS A TEST ADDRESS. A Dependabot pull
     request never receives the repository's secrets, so its build writes
     `window.CHAMP_CONFIG = {};` - the app then never calls createClient, every
     test's stubbed ledger is never read, and the tests fail on an empty
     box. The tests stub the client, so the
     address is never contacted; it only has to exist. `.invalid` is reserved
     and resolves nowhere, in case anything ever tried. This touches the
     string the TESTS load, never dist/, so no deployed page carries it. */
  html = html.replace("window.CHAMP_CONFIG = {};",
    'window.CHAMP_CONFIG = {"supabase": {"url": "https://ledger.test.invalid", ' +
    '"key": "test", "email": ""}};');
  /* jsdom has no structuredClone, which every browser the app targets does.
     A JSON round trip is the same thing for the plain rows the app clones -
     it is what the app itself used before - and it lives only in the string
     the tests load. */
  html = html.replace("<head>", "<head><script>window.structuredClone = " +
    "window.structuredClone || function(v){ return JSON.parse(JSON.stringify(v)); };" +
    "<\/script>");
  /* The real library would load over each harness's stub and every test would
     read an empty ledger. */
  return html.replace(/<script id="vendor-supabase">[\s\S]*?<\/script>/, "");
}

/* The app's own SOURCE, as a person edits it: every part under tracker/src/
 * (core/, ui/, tabs/ and boot.js), in the order the build reads them.
 *
 * Three assertions in these tests are about the source and not about
 * behaviour - a `var` declared twice, a table read behind the back of its one
 * accessor, a column the app must never write. They used to grep page(), which
 * worked while the page was the parts concatenated verbatim. It is a linked
 * bundle now, and a bundler is entitled to reformat a two-line `if` into one
 * and to RENAME a name that two modules both declare - so those greps would
 * have gone quietly wrong rather than failed. They read this instead, which is
 * the text the fault would actually be written in.
 *
 * The generated `_entry.js` is deliberately not included: it is output, and a
 * smell found in it was written elsewhere.
 */
function source() {
  const src = path.join(ROOT, "tracker", "src");
  return fs.readdirSync(src, { recursive: true })
    .map(f => f.split(path.sep).join("/"))
    .filter(f => f.endsWith(".js") && !path.posix.basename(f).startsWith("_"))
    .sort()
    .map(f => fs.readFileSync(path.join(src, f), "utf8")).join("");
}

/* The stylesheet and the markup AS WRITTEN, assembled the way
 * build_tracker_page.py assembles them: styles/ in the order styles/index.css
 * lists, and markup/index.html with each include line replaced by its file.
 * Two checks read these rather than the built page because they are about
 * what a person wrote - a gradient's angle, an id the script asks for.
 */
function styles() {
  const dir = path.join(ROOT, "tracker", "src", "styles");
  const index = fs.readFileSync(path.join(dir, "index.css"), "utf8");
  return [...index.matchAll(/^@import "([\w.-]+)";$/gm)]
    .map(m => fs.readFileSync(path.join(dir, m[1]), "utf8")).join("");
}

/* The markup as written: markup/index.html with every include expanded. */
function markup() {
  const dir = path.join(ROOT, "tracker", "src", "markup");
  /* twice: the fragments, then the parts/ pieces the fragments include */
  const include = html => html.replace(/^[ \t]*<!--#include ([\w./-]+) -->\r?\n/gm,
    (m, name) => fs.readFileSync(path.join(dir, name), "utf8"));
  return include(include(fs.readFileSync(path.join(dir, "index.html"), "utf8")));
}

/* The stub: the shape supabase-js presents to the app (ui/signin.js and
 * core/store.js) and nothing more. A <script>, because the app reads
 * window.supabase at load.
 *
 * Every write lands in window.__WROTE as {op, table, row} and every delete in
 * window.__DELETED as {table, col, id}, for the tests that assert what the app
 * sent. window.__TAKEN[table] is ids the TABLE holds that the device never
 * loaded - written from another phone - and an insert on one fails the way
 * Postgres does, which is the race createtest.js is about.
 */
function stub(tables, uid, email, taken) {
  const user = tables ? JSON.stringify({ user: { id: uid, email } }) : "null";
  return "<script>" +
    "window.__DB=" + JSON.stringify(tables || {}) + ";window.__WROTE=[];window.__DELETED=[];" +
    "window.__TAKEN=" + JSON.stringify(taken || {}) + ";" +
    `window.supabase={createClient:function(){
      function done(){return Promise.resolve({error:null});}
      function write(op,t){return function(r){
        window.__WROTE.push({op:op,table:t,row:r});
        if(op!=="insert") return done();
        var k=window.__TAKEN[t]||[];
        if(k.indexOf(r.id)>=0) return Promise.resolve({error:{code:"23505",
          message:'duplicate key value violates unique constraint "'+t+'_pkey"'}});
        (window.__TAKEN[t]=k).push(r.id);
        return done();};}
      function eq(t){return function(c,v){
        window.__DELETED.push({table:t,col:c,id:v});
        var p=done(); p.eq=eq(t); return p;};}
      return{
        auth:{getSession:function(){return Promise.resolve({data:{session:${user}}});},
              onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
        from:function(t){return{
          select:function(){return Promise.resolve({data:(window.__DB[t]||[]).slice(),error:null});},
          insert:write("insert",t), upsert:write("upsert",t),
          delete:function(){return{eq:eq(t)};}};},
        channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}};
    }};<\/script>`;
}

/* The built page, booted under jsdom on a stubbed ledger.
 *
 * `tables` maps a table name to its rows and signs the page in; left out, the
 * page boots signed out with every table empty. `errs` collects every error
 * jsdom reports, bar the scrollTo it does not implement, and with
 * `consoleErrors` every console.error the page writes as well.
 */
function open(tables, opts) {
  const { JSDOM, VirtualConsole } = require("jsdom");
  const o = Object.assign({ uid: "u1", email: "t@t" }, opts);
  const errs = [];
  const vc = new VirtualConsole().on("jsdomError",
    e => { if (!/scrollTo/.test(e.message)) errs.push(e.message); });
  if (o.consoleErrors) vc.on("error", (...a) => errs.push(a.join(" ")));
  const dom = new JSDOM(
    page().replace("<head>", "<head>" + stub(tables, o.uid, o.email, o.taken)),
    { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc });
  return { dom, w: dom.window, d: dom.window.document, errs };
}

/* A box row and a build row as the ledger stores them, every column filled.
   A test names only what its case is about - the species, where it sits, its
   origin, the moves - and the rest is the plain default, so the reader sees
   the point of the fixture rather than twelve columns that never vary.
   store.js normalises what it reads (box_id null, shiny a boolean, the date
   cut to a day), so these defaults are the same values the app would see. */
const row = (id, name, fields) => ({
  user_id: "u1", id, name, location: "champions", status: "permanent",
  origin: "champions", note: "", ord: 0, shiny: false, trained: false,
  updated_at: "2026-09-10", ...fields });

const build = (id, pokemon, fields) => ({
  user_id: "u1", id, pokemon, box_id: null, mega: null, ability: null,
  mega_ability: null, nature: null, stat_points: {}, moves: [], role: "",
  rationale: "", extra: {}, updated_at: "2026-09-10", ...fields });

/* A click as a person makes one: bubbling, so the listeners the app hangs on
   a list or a sheet rather than on each button see it. */
const click = n => n.dispatchEvent(
  new n.ownerDocument.defaultView.MouseEvent("click", { bubbles: true }));

module.exports = { ROOT, check, idle, until, page, source, styles, markup, open,
                   row, build, click };
