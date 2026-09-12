/* Which ability badges which move, checked on the built page.

   Every case here is one the player found by opening a build and seeing the
   wrong thing - or nothing at all, which is worse, because an untagged move
   reads as "checked, this ability does not touch it".

     - Liquid Voice badged nothing on Primarina's Hyper Voice (2026-09-10)
     - Adaptability badged Rain Dance, a 0 BP move with no STAB to double
     - Contrary badged Protect, which moves no stat
     - Contrary badged NOTHING on Draco Meteor, Overheat or Leaf Storm, which
       is the entire reason to run Contrary: the sentence splitter cut
       "Sp. Atk" in half and lost every special-stat move (2026-09-10)

   The page exports abilityTag/AB_SET, so the rules are called directly rather
   than hunted for in the DOM - that way a failure names the rule. */
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
 from:function(){return{select:function(){return Promise.resolve({data:[],error:null});},
   upsert:function(){return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){return Promise.resolve({error:null});}};}};},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};<\/script>`;
const errs = [];
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window;

setTimeout(() => {
  const MOVE = w.MOVE_BY, AB = w.AB_SET;
  const water = {types:["Water","Fairy"]};
  const tag = (ab, mv, poke) => {
    const t = w.abilityTag(ab, MOVE[mv], poke || null);
    return t ? (t.title || "sin texto") : "SIN ETIQUETA";
  };
  const has = (ab, mv, poke) => tag(ab, mv, poke) !== "SIN ETIQUETA";

  console.log("\n  la tabla");
  /* 129 when the table was completed; 140 once data/db/statuses.json gave the
     status family the column it had been waiting for (Insomnia, Limber,
     Immunity, Own Tempo, Magma Armor, Sweet Veil, Leaf Guard, Flower Veil,
     Synchronize, Corrosion...). Every key must name a real Champions ability:
     two placeholders survived a scroll and `--audit` now exits non-zero on
     them, which is how scripts/audit_lookups.py found them. */
  ok("reglas cargadas", Object.keys(AB).length, 140);
  ok("Insomnia ya sabe que Spore la duerme",
     !!(AB["Insomnia"] && AB["Insomnia"].m &&
        Object.keys(AB["Insomnia"].m).length), true);
  const empty = Object.keys(AB).filter(n => AB[n].side === "off" && !AB[n].all &&
                                       Object.keys(AB[n].m).length === 0);
  ok("ninguna regla ofensiva vacia", empty.join(", ") || "0", "0");

  console.log("\n  lo que el jugador encontro");
  ok("Liquid Voice etiqueta Hyper Voice", has("Liquid Voice", "Hyper Voice"), true);
  ok("...y dice que sale como Water", /Water/.test(tag("Liquid Voice", "Hyper Voice")), true);
  ok("Adaptability NO etiqueta Rain Dance",
     has("Adaptability", "Rain Dance", water), false);
  ok("Contrary NO etiqueta Protect", has("Contrary", "Protect"), false);
  ok("Contrary NO etiqueta Roost", has("Contrary", "Roost"), false);

  console.log("\n  Contrary, que era el agujero grande");
  ["Draco Meteor", "Overheat", "Leaf Storm", "Make It Rain"].forEach(n => {
    ok(n + ": la BAJADA pasa a subida", /boost/i.test(tag("Contrary", n)), true);
  });
  ["Nasty Plot", "Calm Mind", "Quiver Dance"].forEach(n => {
    ok(n + ": la SUBIDA pasa a bajada", /drop/i.test(tag("Contrary", n)), true);
  });
  ok("Close Combat sigue invirtiendose",
     /boost/i.test(tag("Contrary", "Close Combat")), true);

  console.log("\n  el resto de las reglas nuevas");
  ok("Prankster etiqueta Protect", has("Prankster", "Protect"), true);
  ok("Prankster NO etiqueta Earthquake", has("Prankster", "Earthquake"), false);
  ok("Gale Wings etiqueta Tailwind", has("Gale Wings", "Tailwind"), true);
  ok("Rock Head etiqueta Double-Edge", has("Rock Head", "Double-Edge"), true);
  ok("Rock Head NO etiqueta Earthquake", has("Rock Head", "Earthquake"), false);
  ok("Stance Change etiqueta Shadow Ball",
     has("Stance Change", "Shadow Ball"), true);
  ok("No Guard etiqueta Focus Blast (70 acc)",
     has("No Guard", "Focus Blast"), true);
  ok("No Guard NO etiqueta Aerial Ace (101 acc)",
     has("No Guard", "Aerial Ace"), false);
  ok("Huge Power etiqueta Play Rough", has("Huge Power", "Play Rough"), true);
  ok("Huge Power NO etiqueta Moonblast (especial)",
     has("Huge Power", "Moonblast"), false);
  ok("Magician etiqueta un ataque", has("Magician", "Knock Off"), true);

  console.log("\n  las defensivas no etiquetan el movepool propio");
  ["Soundproof", "Fur Coat", "Rough Skin", "Levitate", "Inner Focus",
   "Telepathy", "Pressure"].forEach(n => {
    ok(n + " no marca nada del propio set", has(n, "Hyper Voice") ||
       has(n, "Earthquake") || has(n, "Fake Out"), false);
  });

  console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
  console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
  process.exit(bad || errs.length ? 1 : 0);
}, 1200);
