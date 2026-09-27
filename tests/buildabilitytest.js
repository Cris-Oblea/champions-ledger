/* The ability a build RUNS, and the one it saves (player, 2026-09-22).

     "los pokemones que tienen solo 1 ability no se guardan, por ejemplo
      stance change de aegislash no queda guardado en la ficha, me paso
      tambien con clawitzer que tiene 1 habilidad no se guarda y no se
      reflejan los bonos en su movelist."

   A <select> of ONE option can never fire its own onchange, so every species
   with a single ability - 26 of them, plus all 81 Megas - showed the right
   ability in the editor and wrote null to the database. The card then had
   nothing to print, the move rows lost their badges (Water Pulse is +50% under
   Mega Launcher) and the calculator modelled no ability at all.

   The fix has two halves and this checks both: a species with one ability is a
   FACT, written into the build, and a species with two or three is a CHOICE,
   which stays unmade until he makes it (2026-09-15: an indicator sits beside a
   choice and never makes it).

   Four fixtures, one per case:
     Clawitzer   one ability, ability null   -> resolved, badged and saved
     Aegislash   one ability, unbound build  -> resolved on the card
     Garchomp    two abilities, ability null -> stays unset, and says so
     Camerupt    a stone, mega_ability null  -> the Mega's own ability

   And the LIST ITSELF, which is what the choice is made from (player,
   2026-09-27: "greninja tiene 3 habilidades y no 2... algunas habilidades se
   estan perdiendo"). Serebii links Battle Bond as /abilitydex/.shtml and every
   pattern demanded a slug, so the picker offered two:
     Greninja    an idea build              -> Torrent, Protean, Battle Bond
     Lycanroc-Midnight                      -> still has No Guard (2026-09-19)
     Greninja-Bond / Rockruff-Dusk in HOME  -> their own ability, not the
                                               base species' three */
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = require("path").join(__dirname, "..") + "/";
const UID = "u1";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(50) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const row = (id, name) => ({user_id:UID, id, name, location:"champions",
  status:"permanent", origin:"champions", note:"", ord:0,
  updated_at:"2026-09-10", shiny:false, trained:true});
const ROWS = [row("clawitzer", "Clawitzer"), row("garchomp", "Garchomp"),
              row("camerupt", "Camerupt")];

const build = (id, pokemon, extra) => Object.assign(
  {user_id:UID, id, pokemon, box_id:id, mega:null, ability:null,
   mega_ability:null, nature:"Modest",
   stat_points:{hp:0,atk:0,def:0,spa:32,spd:0,spe:32},
   moves:["Water Pulse", "Protect", null, null], role:"", rationale:"",
   extra:{}, updated_at:"2026-09-10"}, extra || {});
const BUILDS = [
  build("clawitzer", "Clawitzer"),
  /* an idea, with no Pokemon behind it - the state the ability still has to
     resolve in, because a build is its own thing now */
  build("aegislash", "Aegislash",
        {box_id:null, moves:["Iron Head", null, null, null]}),
  build("garchomp", "Garchomp", {moves:["Earthquake", null, null, null]}),
  build("camerupt", "Camerupt",
        {mega:"Mega Camerupt", moves:["Eruption", null, null, null]}),
  build("greninja", "Greninja",
        {box_id:null, moves:["Dark Pulse", null, null, null]}),
];

const body = require("./harness.js").page(ROOT);
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.__WROTE=[];
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:[]),error:null});},
   upsert:function(r){ window.__WROTE.push({table:t, row:r}); return Promise.resolve({error:null});},
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
const editor = () => d.getElementById("buildEditBody");
const saveBtn = () =>
  [...d.getElementById("buildEditFoot").querySelectorAll("button")]
    .find(b => b.textContent === "Save");
const cardFor = n => [...d.querySelectorAll("#listBuilds .row")]
  .find(r => ((r.querySelector(".rname") || r).textContent.trim().indexOf(n) === 0));

setTimeout(() => {
  console.log("\n  la habilidad que corre una build");
  ok("Aegislash: una sola, o sea es un hecho",
     w.activeAbility({pokemon:"Aegislash"}), "Stance Change");
  ok("Clawitzer: igual", w.activeAbility({pokemon:"Clawitzer"}), "Mega Launcher");
  ok("Garchomp: dos, o sea es una eleccion sin hacer",
     w.activeAbility({pokemon:"Garchomp"}), "null");
  ok("y con piedra corre la del Mega",
     w.activeAbility({pokemon:"Camerupt", mega:"Mega Camerupt"}), "Sheer Force");
  ok("lo elegido manda sobre lo deducido",
     w.activeAbility({pokemon:"Garchomp", ability:"Rough Skin"}), "Rough Skin");

  w.go("builds");
  console.log("\n  y por eso la ficha ya la muestra");
  ok("Clawitzer: Mega Launcher en la tarjeta",
     /Mega Launcher/.test(cardFor("Clawitzer").textContent), true);
  ok("Aegislash: Stance Change, aunque sea solo una idea",
     /Stance Change/.test(cardFor("Aegislash").textContent), true);
  ok("Camerupt con piedra: la del Mega",
     /Sheer Force/.test(cardFor("Camerupt").textContent), true);
  ok("Garchomp no inventa ninguna",
     /Sand Veil|Rough Skin/.test(cardFor("Garchomp").textContent), false);

  click(cardFor("Clawitzer"));
  setTimeout(() => {
    const ab = [...editor().querySelectorAll("select")]
      .find(s => [...s.options].some(o => o.value === "Mega Launcher"));
    console.log("\n  abierta la build de Clawitzer");
    ok("el selector trae la unica que hay", ab.value, "Mega Launcher");
    ok("y no ofrece una fila en blanco",
       [...ab.options].some(o => o.value === ""), false);
    const slot = [...editor().querySelectorAll(".slot")]
      .find(s => /Water Pulse/.test(s.textContent));
    ok("Water Pulse lleva el bono de Mega Launcher",
       /Mega Launcher/.test(slot.textContent), true);
    /* escribirla NO es retunear: es la habilidad que siempre tuvo */
    ok("no cobra 500 VP por anotarla",
       /ability 500/.test(editor().textContent), false);

    click(saveBtn());
    setTimeout(() => {
      const wrote = w.__WROTE.filter(x => x.table === "builds").pop();
      console.log("\n  al guardar");
      ok("guarda la habilidad", wrote.row.ability, "Mega Launcher");
      ok("en la fila de esta build", wrote.row.id, "clawitzer");

      w.go("builds");
      click(cardFor("Garchomp"));
      setTimeout(() => {
        const ab2 = [...editor().querySelectorAll("select")]
          .find(s => [...s.options].some(o => o.value === "Rough Skin"));
        console.log("\n  y con dos habilidades no elige por el");
        ok("el selector abre sin elegir", ab2.value, "");
        ok("y lo dice en la primera fila",
           /not chosen/.test(ab2.options[0].textContent), true);
        ok("los checks avisan de que falta",
           /No ability chosen/.test(editor().textContent), true);
        click(saveBtn());
        setTimeout(() => {
          const w2 = w.__WROTE.filter(x => x.table === "builds").pop();
          ok("y guarda null, no la primera de la lista", w2.row.ability, "null");

          /* the list the choice is made from - his sentence is the case */
          const possible = n => {
            w.findDetail(w.byName[n]);
            const l = [...d.querySelectorAll("#sheetBody .lbl")]
              .find(x => x.textContent === "Possible ability");
            const v = l ? l.previousElementSibling.textContent : "";
            w.closeSheet();
            return v;
          };
          console.log("\n  ninguna habilidad se pierde por el camino");
          ok("Greninja: tres en su ficha", possible("Greninja"),
             "Torrent / Protean / Battle Bond");
          ok("Lycanroc-Midnight sigue con No Guard",
             /No Guard/.test(possible("Lycanroc-Midnight")), true);
          ok("Greninja-Bond de HOME: la suya, no las del base",
             (w.anyRow("Greninja-Bond").ab || []).join(" / "), "Battle Bond");
          ok("Rockruff-Dusk de HOME: Own Tempo",
             (w.anyRow("Rockruff-Dusk").ab || []).join(" / "), "Own Tempo");

          w.go("builds");
          click(cardFor("Greninja"));
          setTimeout(() => {
            const ab3 = [...editor().querySelectorAll("select")]
              .find(s => [...s.options].some(o => o.value === "Protean"));
            /* the set, not the order: the picker ranks by what is run */
            ok("y el selector de su build ofrece las tres",
               [...ab3.options].map(o => o.value).filter(Boolean).sort()
                 .join(" / "), "Battle Bond / Protean / Torrent");

            console.log("\n  sin errores de JS");
            ok("jsdom no reporta errores", errs.join(" | ") || "ninguno", "ninguno");
            console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
            process.exit(bad ? 1 : 0);
          }, 60);
        }, 60);
      }, 60);
    }, 60);
  }, 60);
}, 900);
