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
  /* An offensive rule that selects nothing is broken - that is how Liquid
     Voice badged nothing on Hyper Voice. A rule with a `scope` is the one
     legitimate way to have no move list: it covers a whole category and is
     stated once on the ability instead. */
  const empty = Object.keys(AB).filter(n => AB[n].side === "off" && !AB[n].all &&
                                       !AB[n].scope &&
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
  ok("Gale Wings etiqueta Tailwind", has("Gale Wings", "Tailwind"), true);
  ok("Rock Head etiqueta Double-Edge", has("Rock Head", "Double-Edge"), true);
  ok("Rock Head NO etiqueta Earthquake", has("Rock Head", "Earthquake"), false);
  ok("No Guard etiqueta Focus Blast (70 acc)",
     has("No Guard", "Focus Blast"), true);
  ok("No Guard NO etiqueta Aerial Ace (101 acc)",
     has("No Guard", "Aerial Ace"), false);
  /* An ability that covers a WHOLE CATEGORY must not badge a single row: the
     badge lands on every move and picks out nothing, which is what hid Sheer
     Force and Iron Fist behind Guts on Conkeldurr (player, 2026-09-12). Guts
     is the clearest of them - it multiplies the Attack STAT while statused, so
     "the moves it affects" is only "every physical move".

     BOTH halves are asserted - that it stops badging, AND that it still says
     what it covers - because "no badge" alone would also pass if the rule had
     simply been deleted, and that loses the ability instead of relocating it. */
  console.log("\n  cobertura total: se dice una vez, no por fila");
  [["Guts", "every physical move", "Close Combat"],
   ["Huge Power", "every physical move", "Play Rough"],
   ["Hustle", "every physical move", "Body Slam"],
   ["Prankster", "every status move", "Protect"],
   ["Solar Power", "every special move", "Flamethrower"],
   ["Mold Breaker", "every move", "Earthquake"],
   ["Stance Change", "every damaging move", "Shadow Ball"],
   ["Magician", "every damaging move", "Knock Off"]].forEach(function(c){
    ok(c[0] + " declara su alcance", (AB[c[0]] || {}).scope, c[1]);
    ok(c[0] + " NO etiqueta " + c[2], has(c[0], c[2]), false);
  });

  /* ...and the ones that really select still do, or the fix went too far */
  console.log("\n  las que si seleccionan siguen etiquetando");
  ok("Sheer Force etiqueta Body Slam", has("Sheer Force", "Body Slam"), true);
  ok("Iron Fist etiqueta Drain Punch", has("Iron Fist", "Drain Punch"), true);
  ok("Technician etiqueta Bullet Punch",
     has("Technician", "Bullet Punch"), true);
  /* exenta a proposito: su seleccion real es el STAB, que depende del tipo del
     usuario, y eso lo filtra la pagina - la medicion de alcance no puede verlo */
  ok("Adaptability etiqueta Surf en un Water",
     has("Adaptability", "Surf", water), true);
  ok("ninguna regla con scope conserva lista de movimientos",
     Object.keys(AB).filter(function(n){
       return AB[n].scope && AB[n].m && Object.keys(AB[n].m).length;
     }).join(", ") || "0", "0");

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
