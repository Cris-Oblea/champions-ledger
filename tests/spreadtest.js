/* A spread move takes x0.75 while both targets are up, and fourteen of them
   land on your own partner as well - which the player's own rule says not to
   run unless the ally absorbs it. Neither fact was on a move row anywhere
   except one line of small print, and the move PICKER showed neither, so the
   choice was made blind.

   Serebii is not the source for this: it spells one target four ways and gets
   three moves wrong outright. So the sweep below checks the shipped data
   against Smogon's engine target column - the truth - rather than against the
   table that produced it, and the render checks confirm the badges reach the
   three places a move is drawn. */
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(46) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

/* ---------------------------------------------------------- the sweep --- */
global.window = {};
eval(fs.readFileSync(ROOT + "tracker/data.js", "utf8"));
const MOVES = global.window.CHAMP.MOVES;
const raw = JSON.parse(fs.readFileSync(
  ROOT + "data/raw/smogon_calc/raw_moves.json", "utf8"));
const key = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SM = {};
Object.keys(raw).forEach(n => { if (raw[n] && typeof raw[n] === "object")
                                  SM[key(n)] = raw[n].target; });

let mismatch = [], nSpread = 0, nAlly = 0;
MOVES.forEach(r => {
  const t = SM[key(r[0])];
  if (t === undefined) return;            // Octazooka: not in Smogon's table
  const wantSpread = (t === "allAdjacent" || t === "allAdjacentFoes") ? 1 : 0;
  const wantAlly = t === "allAdjacent" ? 1 : 0;
  if (r[8] !== wantSpread || r[9] !== wantAlly)
    mismatch.push(r[0] + " (" + t + " -> spread=" + r[8] + " ally=" + r[9] + ")");
  nSpread += r[8]; nAlly += r[9];
});
console.log("\n  barrido de los " + MOVES.length + " movimientos usables");
ok("ninguno discrepa con el motor de Smogon", mismatch.join(", ") || "0", "0");
/* 38 when this was written, with the comment "Smogon lists 39; Overdrive is
   the one Champions does not have". It has it now: Regulation M-C brought
   Toxtricity (2026-09-09), which learns it, so Overdrive went useable and the
   count went to 39. The number is asserted with its cause beside it, so the
   next move to arrive is a named change rather than a bare digit to bump. */
ok("movimientos spread", nSpread, 39);
ok("de esos, golpean al aliado", nAlly, 16);

const row = n => MOVES.find(m => m[0] === n);
ok("el 39o es Overdrive, que llego con M-C", !!row("Overdrive"), true);
ok("...y es spread", row("Overdrive")[8], 1);

ok("Burning Jealousy es spread (Serebii: no)", row("Burning Jealousy")[8], 1);
ok("Corrosive Gas golpea al aliado (Serebii: no)", row("Corrosive Gas")[9], 1);
ok("Misty Explosion golpea al aliado", row("Misty Explosion")[9], 1);
ok("Psyshield Bash NO apunta al aliado", row("Psyshield Bash")[7],
   "Selected Target");
ok("Mountain Gale NO apunta a si mismo", row("Mountain Gale")[7],
   "Selected Target");
ok("Tailwind sigue siendo Ally", row("Tailwind")[7], "Ally");

/* -------------------------------------------------- the badges on screen */
const UID = "u1";
const ROWS = [{user_id:UID,id:"garchomp",name:"Garchomp",location:"champions",
               status:"permanent",origin:"champions",note:"",ord:0,
               updated_at:"2026-09-10",shiny:false,trained:true}];
const BUILDS = [{user_id:UID,id:"garchomp",pokemon:"Garchomp",mega:null,
  ability:"Rough Skin",mega_ability:null,nature:"Jolly",
  stat_points:{hp:0,atk:32,def:0,spa:0,spd:2,spe:32},
  moves:["Earthquake","Rock Slide","Dragon Claw","Protect"],
  role:"",rationale:"",extra:{},updated_at:"2026-09-10"}];
const body = require("./harness.js").page(ROOT);
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:[]),error:null});},
   upsert:function(){return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){return Promise.resolve({error:null});}};}
 };},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};
<\/script>`;
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window, d = w.document;
const click = n => n.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
const tags = n => [...n.querySelectorAll(".tag")].map(t => t.textContent);

setTimeout(() => {
  w.go("builds");
  click(d.querySelectorAll("#listBuilds .row")[0]);
  setTimeout(() => {
    const slots = [...d.querySelectorAll(".slot")]
      .filter(s => /Earthquake|Rock Slide|Dragon Claw|Protect/.test(s.textContent));
    const by = n => slots.find(s => s.textContent.indexOf(n) === 0 ||
                                    s.textContent.indexOf(n) >= 0);
    /* Priority has to show its NUMBER on the row. Filtering a movepool by
       "priority" and getting back rows that do not say how much is no answer:
       +1 and +3 are a different move in doubles. The Pokemon's own sheet
       showed no priority at all - which is where the player was looking
       (2026-09-12) - and the two renderers that did show it only handled +N,
       so nothing ever said that Dragon Tail moves LAST. One priorityTag() now,
       shared by all three. */
    const tagsOf = m => [...w.moveRowFor(w.MOVE_BY[m], [], null)
      .querySelectorAll(".tag")].map(t => t.textContent);
    console.log("\n  la prioridad, con su numero");
    ok("Fake Out dice +3", tagsOf("Fake Out").indexOf("priority +3") >= 0, true);
    ok("Aqua Jet dice +1", tagsOf("Aqua Jet").indexOf("priority +1") >= 0, true);
    ok("Dragon Tail dice -6 (va ultimo)",
       tagsOf("Dragon Tail").indexOf("priority -6") >= 0, true);
    ok("Earthquake no lleva etiqueta de prioridad",
       tagsOf("Earthquake").some(t => /priority/.test(t)), false);

    console.log("\n  la hoja del build");
    const eq = by("Earthquake"), rs = by("Rock Slide"), dc = by("Dragon Claw");
    ok("Earthquake lleva spread", tags(eq).indexOf("spread") >= 0, true);
    ok("Earthquake avisa del aliado", tags(eq).indexOf("hits ally") >= 0, true);
    ok("Earthquake lo dice tambien en texto",
       /ally/.test(eq.textContent), true);
    ok("Rock Slide lleva spread", tags(rs).indexOf("spread") >= 0, true);
    ok("Rock Slide NO avisa del aliado",
       tags(rs).indexOf("hits ally") >= 0, false);
    ok("Dragon Claw no lleva ninguno",
       tags(dc).indexOf("spread") >= 0 || tags(dc).indexOf("hits ally") >= 0,
       false);

    /* the picker, which is where the move is actually chosen */
    click(eq);
    setTimeout(() => {
      const rows = [...d.querySelectorAll(".sheet .row")];
      const find = n => rows.find(r => r.textContent.indexOf(n) >= 0);
      console.log("\n  el buscador de movimientos");
      const peq = find("Earthquake"), pdc = find("Dragon Claw");
      ok("Earthquake en la lista lleva spread",
         peq && tags(peq).indexOf("spread") >= 0, true);
      ok("Earthquake en la lista avisa del aliado",
         peq && tags(peq).indexOf("hits ally") >= 0, true);
      ok("Dragon Claw en la lista no lleva ninguno",
         pdc ? (tags(pdc).indexOf("spread") >= 0 ||
                tags(pdc).indexOf("hits ally") >= 0) : "no está", false);

      console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
      console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
      process.exit(bad || errs.length ? 1 : 0);
    }, 400);
  }, 400);
}, 1200);
