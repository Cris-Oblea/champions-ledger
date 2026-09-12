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
const ROOT = "C:/Users/CRUIZ/Juegos/Pokemon Champions/";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(50) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const body = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, "");
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
  console.log("\n  las 340 formas, sin excepcion");
  let empty = C.DEX.map(r => r[0]).filter(n => !size(n));
  ok("ninguna forma se queda sin movepool", empty.join(", ") || "0", "0");
  ok("Floette encuentra el suyo", has("Floette", "Moonblast"), true);
  ok("Mega Floette tambien", size("Mega Floette") > 0, true);
  ok("Indeedee-Female hereda el de Indeedee",
     size("Indeedee-Female"), size("Indeedee"));
  ok("Basculegion-Female hereda el de Basculegion",
     size("Basculegion-Female"), size("Basculegion"));

  /* every screen that offers moves goes through this one helper, so the fix
     reaches all of them - assert that nothing reads the table directly */
  const src = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8");
  const direct = (src.match(/C\.LEARN\[/g) || []).length;
  ok("solo learnset() lee la tabla (3 lecturas, todas suyas)", direct, 3);

  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
}, 1200);
