/* A regional form has its OWN movepool (player, 2026-09-10).

   He opened the Samurott-Hisui build and the app told him it does not learn
   Ceaseless Edge or Sucker Punch. It does. Then the same with Rotom-Wash and
   Hydro Pump.

   The cause was one line: learnset() looked up the SPECIES first and the form
   second, so every regional form was handed its base form's pool -
   Samurott-Hisui got Samurott's 62 moves instead of its own 68. 25 forms were
   affected, and because the build editor offers from this same list, it was
   picking sets out of the wrong pool.

   The species fallback has to stay, though: a Mega has no learnset of its own,
   so Mega Garchomp reads Garchomp's. Both halves are asserted here. */
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
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(50) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const body = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script id="vendor-supabase">[\s\S]*?<\/script>/, "");
const stub = `<script>window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:null}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(){return{select:function(){return Promise.resolve({data:[],error:null});}};},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};<\/script>`;
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window;

setTimeout(() => {
  const has = (form, move) =>
    (w.learnset(form) || []).some(m => m.name === move);
  const size = f => (w.learnset(f) || []).length;
  const C = w.CHAMP;

  console.log("\n  lo que encontro el jugador");
  ok("Samurott-Hisui aprende Ceaseless Edge",
     has("Samurott-Hisui", "Ceaseless Edge"), true);
  ok("Samurott-Hisui aprende Sucker Punch",
     has("Samurott-Hisui", "Sucker Punch"), true);
  ok("Rotom-Wash aprende Hydro Pump", has("Rotom-Wash", "Hydro Pump"), true);

  console.log("\n  y no se los presta a la forma base");
  ok("Samurott base NO aprende Ceaseless Edge",
     has("Samurott", "Ceaseless Edge"), false);
  ok("Rotom base NO aprende Hydro Pump", has("Rotom", "Hydro Pump"), false);

  console.log("\n  la caida a la especie sigue viva (las Megas la necesitan)");
  ok("Mega Garchomp lee el pool de Garchomp",
     size("Mega Garchomp"), size("Garchomp"));
  ok("y no esta vacio", size("Mega Garchomp") > 0, true);

  /* the sweep: every form that has its own key must read its own pool, not
     its species'. A sample would have missed 24 of the 25. */
  console.log("\n  barrido de todas las formas con pool propio");
  let wrong = [];
  C.DEX.forEach(function(r){
    const form = r[0], sp = r[1];
    if (form === sp || r[4]) return;              // r[4] = is a Mega
    if (!C.LEARN[form] || !C.LEARN[sp]) return;
    const own = C.LEARN[form].length;
    if (size(form) !== own) wrong.push(form);
  });
  ok("ninguna lee el pool de su especie", wrong.join(", ") || "0", "0");

  /* and the other half of the question: is EVERY form covered? Four were not
     - Floette and Mega Floette (Champions' Floette is the Eternal Flower one,
     filed as "Floette-Eternal") and the two gender forms, whose pool is the
     base species'. */
  console.log("\n  todas las formas, sin excepcion");
  let empty = C.DEX.map(r => r[0]).filter(n => !size(n));
  ok("ninguna forma se queda sin movepool", empty.join(", ") || "0", "0");
  /* Champions' Floette is the Eternal Flower one and there is no other: the
     master list has only 670-e, no learner table says plain "Floette", and the
     Pokedex block carries the Eternal spread. The bare name still has to find
     it, because every usage source writes it that way. */
  ok("Floette-Eternal tiene el suyo", has("Floette-Eternal", "Moonblast"), true);
  ok("y 'Floette' a secas cae en el (es el unico que existe)",
     has("Floette", "Moonblast"), true);
  ok("Mega Floette tambien", size("Mega Floette") > 0, true);
  /* Indeedee-Female does NOT inherit: Serebii lists it in the learner tables
     under a "#0" dex cell, which a \d{4} pattern dropped, so it used to come
     out with the male's list or with nothing. It has its own pool, and the
     difference is the point - Follow Me is on the female only. */
  ok("Indeedee-Female tiene movepool propio, no el del macho",
     size("Indeedee-Female") !== size("Indeedee") && size("Indeedee-Female") > 0,
     true);
  ok("...y es la que aprende Follow Me",
     has("Indeedee-Female", "Follow Me"), true);
  ok("...que el macho no aprende", has("Indeedee", "Follow Me"), false);
  /* Basculegion-Female really does inherit: Serebii gives it no learner row at
     all, only an "<h2>Stats - Female</h2>" block. */
  ok("Basculegion-Female hereda el de Basculegion",
     size("Basculegion-Female"), size("Basculegion"));
  /* the forms split on 2026-09-12 share the species pool */
  ok("Squawkabilly-White hereda el de Squawkabilly",
     size("Squawkabilly-White"), size("Squawkabilly"));
  ok("Gourgeist-Jumbo hereda el de Gourgeist",
     size("Gourgeist-Jumbo"), size("Gourgeist"));

  /* every screen that offers moves goes through this one helper, so the fix
     reaches all of them - assert that nothing reads the table directly */
  const src = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8");
  const direct = (src.match(/C\.LEARN\[/g) || []).length;
  ok("solo learnset() lee la tabla (3 lecturas, todas suyas)", direct, 3);

  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
}, 1200);
