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
const { check, open } = require("./harness.js");

const { dom, errs } = open();
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
  check("reglas cargadas", Object.keys(AB).length, 140);
  check("Insomnia ya sabe que Spore la duerme",
     !!(AB["Insomnia"] && AB["Insomnia"].m &&
        Object.keys(AB["Insomnia"].m).length), true);
  /* An offensive rule that selects nothing is broken - that is how Liquid
     Voice badged nothing on Hyper Voice. A rule with a `scope` is the one
     legitimate way to have no move list: it covers a whole category and is
     stated once on the ability instead. */
  const empty = Object.keys(AB).filter(n => AB[n].side === "off" && !AB[n].all &&
                                       !AB[n].scope &&
                                       Object.keys(AB[n].m).length === 0);
  check("ninguna regla ofensiva vacia", empty.join(", ") || "0", "0");

  console.log("\n  lo que el jugador encontro");
  check("Liquid Voice etiqueta Hyper Voice", has("Liquid Voice", "Hyper Voice"), true);
  check("...y dice que sale como Water", /Water/.test(tag("Liquid Voice", "Hyper Voice")), true);
  check("Adaptability NO etiqueta Rain Dance",
     has("Adaptability", "Rain Dance", water), false);
  check("Contrary NO etiqueta Protect", has("Contrary", "Protect"), false);
  check("Contrary NO etiqueta Roost", has("Contrary", "Roost"), false);

  console.log("\n  Contrary, que era el agujero grande");
  ["Draco Meteor", "Overheat", "Leaf Storm", "Make It Rain"].forEach(n => {
    check(n + ": la BAJADA pasa a subida", /boost/i.test(tag("Contrary", n)), true);
  });
  ["Nasty Plot", "Calm Mind", "Quiver Dance"].forEach(n => {
    check(n + ": la SUBIDA pasa a bajada", /drop/i.test(tag("Contrary", n)), true);
  });
  check("Close Combat sigue invirtiendose",
     /boost/i.test(tag("Contrary", "Close Combat")), true);

  console.log("\n  el resto de las reglas nuevas");
  check("Gale Wings etiqueta Tailwind", has("Gale Wings", "Tailwind"), true);
  check("Rock Head etiqueta Double-Edge", has("Rock Head", "Double-Edge"), true);
  check("Rock Head NO etiqueta Earthquake", has("Rock Head", "Earthquake"), false);
  check("No Guard etiqueta Focus Blast (70 acc)",
     has("No Guard", "Focus Blast"), true);
  check("No Guard NO etiqueta Aerial Ace (101 acc)",
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
    check(c[0] + " declara su alcance", (AB[c[0]] || {}).scope, c[1]);
    check(c[0] + " NO etiqueta " + c[2], has(c[0], c[2]), false);
  });

  /* ...and the ones that really select still do, or the fix went too far */
  console.log("\n  las que si seleccionan siguen etiquetando");
  check("Sheer Force etiqueta Body Slam", has("Sheer Force", "Body Slam"), true);
  check("Iron Fist etiqueta Drain Punch", has("Iron Fist", "Drain Punch"), true);
  check("Technician etiqueta Bullet Punch",
     has("Technician", "Bullet Punch"), true);
  /* exenta a proposito: su seleccion real es el STAB, que depende del tipo del
     usuario, y eso lo filtra la pagina - la medicion de alcance no puede verlo */
  check("Adaptability etiqueta Surf en un Water",
     has("Adaptability", "Surf", water), true);
  check("ninguna regla con scope conserva lista de movimientos",
     Object.keys(AB).filter(function(n){
       return AB[n].scope && AB[n].m && Object.keys(AB[n].m).length;
     }).join(", ") || "0", "0");

  console.log("\n  las defensivas no etiquetan el movepool propio");
  ["Soundproof", "Fur Coat", "Rough Skin", "Levitate", "Inner Focus",
   "Telepathy", "Pressure"].forEach(n => {
    check(n + " no marca nada del propio set", has(n, "Hyper Voice") ||
       has(n, "Earthquake") || has(n, "Fake Out"), false);
  });

  /* ------------------------------------ lo que APAGA un movimiento -------- */
  /* Una defensiva no etiqueta el movepool propio, y eso sigue bien: la
     alternativa eran las 67, y Fire Lash habria llevado 32 chips grises. Pero
     hay una clase mas estrecha, la que el jugador nombro exactamente:

       "si viese zap cannon en algun pokemon como raichu, y veo que tiene el
        tag bulletproof, sabria que ese move es bloqueado por esa habilidad"

     BLOQUEADO. No "recibe la mitad", no "te puede quemar de vuelta" - el
     movimiento no hace nada. Esa lista se dibuja en rojo sobre la fila. */
  console.log("\n  lo que apaga un movimiento, en rojo");
  const blockers = mv => {
    const host = w.document.createElement("div");
    w.blockerTags(MOVE[mv], host);
    return [...host.children].map(n => n.textContent).sort();
  };
  const allBad = mv => {
    const host = w.document.createElement("div");
    w.blockerTags(MOVE[mv], host);
    return [...host.children].every(n => / bad\b/.test(n.className));
  };
  check("Zap Cannon lo bloquean cuatro",
     blockers("Zap Cannon").join(", "),
     "Bulletproof, Lightning Rod, Motor Drive, Volt Absorb");
  check("...y las cuatro van en negativo", allBad("Zap Cannon"), true);

  /* LA PERSPECTIVA (player, 2026-09-27): "telepathy sale en tags negativos
     para todos los moves que hacen hit a los allies, pero en realidad deberia
     ser verde positivo... si el oponente tiene telepathy no se cubre de mis
     ataques." Rojo es la habilidad de un RIVAL que apaga el move; verde es la
     de TU COMPANERO que lo esquiva - la razon de emparejarlos. */
  console.log("\n  la perspectiva: rojo en el rival, verde en tu companero");
  const tagged = (mv, cls) => {
    const host = w.document.createElement("div");
    w.blockerTags(MOVE[mv], host);
    return [...host.children].filter(n => n.classList.contains(cls))
      .map(n => n.textContent).sort();
  };
  check("Telepathy nunca es roja", Object.keys(MOVE).some(
     mv => tagged(mv, "bad").indexOf("Telepathy") >= 0), false);
  check("Boomburst: Soundproof en rojo (el rival)",
     tagged("Boomburst", "bad").join(", "), "Soundproof");
  check("...y Telepathy en verde (tu companero)",
     tagged("Boomburst", "ok").join(", "), "Telepathy");
  /* "si yo tiro earthquake y me switchean a un pokemon con levitate no le
     hago nada" - una inmunidad contra cualquiera es un hecho del rival: roja,
     y solo roja, para no escribir el mismo nombre dos veces en la fila */
  check("Earthquake: Levitate en rojo", tagged("Earthquake", "bad").indexOf("Levitate") >= 0, true);
  check("...y no tambien en verde", tagged("Earthquake", "ok").indexOf("Levitate") >= 0, false);
  check("ninguna fila repite un nombre", Object.keys(MOVE).filter(mv => {
       const all = tagged(mv, "bad").concat(tagged(mv, "ok"));
       return new Set(all).size !== all.length; }).join(", "), "");
  check("un move que no toca al aliado no tiene verdes",
     tagged("Zap Cannon", "ok").length, 0);
  check("Armor Tail solo cuenta en el rival",
     Object.keys(MOVE).some(mv => tagged(mv, "ok").indexOf("Armor Tail") >= 0), false);
  check("Sleep Powder trae Overcoat", blockers("Sleep Powder").indexOf("Overcoat") >= 0, true);
  check("Earthquake trae Levitate", blockers("Earthquake").indexOf("Levitate") >= 0, true);
  /* la mitad que hay que NO etiquetar: Big Pecks se come la bajada de Defensa
     de Fire Lash, que no es el movimiento siendo bloqueado */
  check("Fire Lash no lleva ninguno", blockers("Fire Lash").length, 0);
  check("Protect tampoco", blockers("Protect").length, 0);
  /* y una defensiva que solo amortigua nunca aparece */
  check("Fur Coat no bloquea nada",
     Object.keys(w.CHAMP.AB_MOVES).filter(
       n => n === "Fur Coat" && w.CHAMP.AB_MOVES[n].stop).length, 0);
  /* ------------------------------ "hit by" no es lo mismo que "damage" --- */
  /* El jugador leyo el tag de Will-O-Wisp y cazo la regla (2026-09-19):
     "thermal exchange se activa con dano y no con ataques fuego de status".
     Serebii lo dice con esas palabras - "takes DAMAGE from a Fire-type move" -
     y la regla decia solo "tipo Fuego". Lo mismo pasaba en otras cuatro.

     Will-O-Wisp SIGUE bloqueado, pero por la otra mitad de la habilidad: no
     puede ser quemado, lo queme lo que lo queme. Es la razon la que cambia. */
  console.log("\n  una habilidad de dano no reacciona a un status");
  const statusOf = n => (AB[n] ? Object.keys(AB[n].m || {}) : [])
    .map(i => w.CHAMP.MOVES[i]).filter(m => m[2] === "T").map(m => m[0]).sort();
  check("Thermal Exchange solo toca Will-O-Wisp, y por la quemadura",
     statusOf("Thermal Exchange").join(","), "Will-O-Wisp");
  check("...y lo dice en el texto",
     /damaging Fire move/.test(AB["Thermal Exchange"].why), true);
  check("Rattled ya no se asusta de un Taunt", statusOf("Rattled").join(","), "");
  check("Thick Fat no amortigua un Will-O-Wisp", statusOf("Thick Fat").join(","), "");
  check("Heatproof tampoco", statusOf("Heatproof").join(","), "");
  check("Dry Skin ni con Soak ni con Will-O-Wisp",
     statusOf("Dry Skin").join(","), "");
  /* y las que SI absorben el tipo entero, status incluido, siguen haciendolo */
  check("Sap Sipper sigue comiendose el Sleep Powder",
     statusOf("Sap Sipper").indexOf("Sleep Powder") >= 0, true);
  check("Lightning Rod sigue atrayendo el Thunder Wave",
     statusOf("Lightning Rod").indexOf("Thunder Wave") >= 0, true);


  console.log("\n  y los items dicen para que lado juegan");
  const items = mv => {
    const host = w.document.createElement("div");
    w.itemTags(MOVE[mv], host);
    return [...host.children].map(
      n => n.textContent + (/ bad\b/.test(n.className) ? "!" : ""));
  };
  /* el ejemplo del jugador: la baya descongela, asi que el freeze - que era
     todo el punto del tag - no llega */
  check("Aspear Berry en Ice Fang va en negativo",
     items("Ice Fang").indexOf("Aspear Berry!") >= 0, true);
  check("Chesto Berry en Sleep Powder tambien",
     items("Sleep Powder").indexOf("Chesto Berry!") >= 0, true);
  /* y uno que de verdad sirve al movimiento sigue en positivo */
  check("Heat Rock en Sunny Day sigue en positivo",
     items("Sunny Day").indexOf("Heat Rock") >= 0, true);
  check("Light Clay en Reflect tambien",
     items("Reflect").indexOf("Light Clay") >= 0, true);


  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
}, 1200);
