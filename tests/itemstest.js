/* The Items tab (player, 2026-09-10).

   It was called "Gear" and its held-items pane was two rows of toggle
   buttons: the ones you own, and a search that popped prompt() asking for a
   made-up "shop category" before it would record anything. You could read 118
   item NAMES and never learn what one of them did.

   It reads like the Mega Stone list now: every item in the game, in the four
   groups Champions itself uses - Hold Items, Berries, Miscellaneous, and
   stones in their own pane - each row carrying what the item does, what it
   costs in VP, and whether it is owned. */
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";
const UID = "u1";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(48) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

/* A ROW PER OWNED THING since migration 6, not a list inside one document.
   The old [name, [category]] pairs were converted by that migration, so the
   two shapes the app used to read are one shape here. */
const META = [];
const ITEMS = [{user_id:UID, id:"Life Orb", updated_at:"2026-09-10"},
               {user_id:UID, id:"Sitrus Berry", updated_at:"2026-09-10"}];
const STONES = [{user_id:UID, id:"Garchompite", updated_at:"2026-09-10"}];

const body = require("./harness.js").page(ROOT);
const stub = `<script>
window.__META=${JSON.stringify(META)}; window.__ITEMS=${JSON.stringify(ITEMS)};
window.__STONES=${JSON.stringify(STONES)}; window.__WROTE=[]; window.__DELETED=[];
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:
     t==="meta"?window.__META:t==="items"?window.__ITEMS:
     t==="stones"?window.__STONES:[],error:null});},
   insert:function(r){ window.__WROTE.push({table:t,row:r}); return Promise.resolve({error:null}); },
   upsert:function(r){ window.__WROTE.push({table:t,row:r}); return Promise.resolve({error:null}); },
   delete:function(){return {eq:function(col,val){ window.__DELETED.push({table:t,id:val});
     return Promise.resolve({error:null}); }};}
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
const rows = () => [...d.querySelectorAll("#itemCats .row")];
const heads = () => [...d.querySelectorAll("#itemCats h2")]
  .map(h => h.textContent.trim());

setTimeout(() => {
  w.go("gear");
  console.log("\n  la pestaña");
  ok("se llama Items",
     /Items/.test(d.querySelector("#v-gear h1").textContent), true);

  click(d.getElementById("gearItems"));
  setTimeout(() => {
    console.log("\n  las categorias del juego");
    const hs = heads();
    ["Hold Items", "Berries", "Miscellaneous"].forEach(function(c, i){
      ok(c, hs[i] && hs[i].indexOf(c) === 0, true);
    });
    ok("cada una lleva tengo/total", /\d+\/\d+$/.test(hs[0]), true);

    console.log("\n  el listado");
    const all = rows();
    ok("estan todos los items", all.length, w.CHAMP.ITEMS.length);
    ok("ninguna Mega Stone aqui",
       all.every(r => !/ite$|ite Z$/.test(
         r.querySelector(".rname").textContent.trim())), true);
    ok("cada fila trae descripcion",
       all.filter(r => r.querySelectorAll(".st").length).length, all.length);
    ok("y precio o procedencia, nunca en blanco",
       all.every(r => (r.querySelector(".rside").textContent || "").trim()
         .length > 1), true);
    const lo = all.find(r => r.textContent.indexOf("Life Orb") === 0);
    ok("Life Orb sale como owned",
       /owned/.test(lo.querySelector(".rside").textContent), true);
    /* Life Orb is a shop item with a price; Leftovers is not sold at all - you
       start with it - so its slot says that instead of a made-up VP. */
    const leftovers = all.find(r => r.textContent.indexOf("Leftovers") === 0);
    ok("Leftovers dice de donde sale",
       /start with it/.test(leftovers.querySelector(".rside").textContent), true);
    /* This used to assert "Rocky Helmet costs 2000 VP, filled in from pokebase
       because Serebii prints ??? VP". Both halves stopped being true: Serebii's
       shop table now prices it at 1000, and the only items still taking the
       pokebase fallback are the eight Mega stones - which this list excludes on
       purpose, and whose price the page does not carry anywhere.

       So the check moved to what a page test can actually see, and it is the
       stronger claim anyway: a VP number must never be anonymous. The two
       sources disagree on twelve items (Serebii 700/1000 vs pokebase 2000) and
       that is printed by build_item_facts.py for a human to settle - which is
       exactly why every figure on screen has to say who said it. */
    ok("todo precio dice su fuente",
       all.filter(r => /\d+ VP/.test(r.querySelector(".rside").textContent))
          .every(r => /serebii|pokebase/i
            .test(r.querySelector(".rside span").title || "")), true);
    ok("ningun item se queda con 'price ?'",
       all.every(r => !/price \?/.test(r.querySelector(".rside").textContent)),
       true);
    const scarf = all.find(r => r.textContent.indexOf("Muscle Band") === 0);
    ok("Muscle Band trae su precio en VP",
       /\d+ VP/.test(scarf.querySelector(".rside").textContent), true);

    /* the player's own example: an item that extends a field effect serves
       the MOVE and the ABILITY that set it, and naming only the move misses
       the half that matters on most teams */
    console.log("\n  a que sirve cada item");
    const heat = all.find(r => r.textContent.indexOf("Heat Rock") === 0);
    ok("Heat Rock nombra el move", /Sunny Day/.test(heat.textContent), true);
    ok("y la habilidad", /Drought/.test(heat.textContent), true);
    const seed = all.find(r => r.textContent.indexOf("Electric Seed") === 0);
    ok("Electric Seed llega a Electric Surge",
       /Electric Surge/.test(seed.textContent), true);
    const clay = all.find(r => r.textContent.indexOf("Light Clay") === 0);
    ok("Light Clay incluye Aurora Veil (confirmado en juego)",
       /Aurora Veil/.test(clay.textContent), true);
    const coal = all.find(r => r.textContent.indexOf("Charcoal") === 0);
    ok("Charcoal dice que sube los Fire",
       /every Fire move/.test(coal.textContent), true);
    const balloon = all.find(r => r.textContent.indexOf("Air Balloon") === 0);
    ok("Air Balloon sabe que es Ground (texto de pokebase)",
       /Ground/.test(balloon.textContent), true);

    console.log("\n  marcar y desmarcar");
    click(leftovers);
    setTimeout(() => {
      const wrote = w.__WROTE[w.__WROTE.length - 1];
      ok("se guarda", !!wrote, true);
      ok("en la tabla items, no en meta", wrote.table, "items");
      /* the row stays focused after the tap, and an activeElement guard here
         used to swallow the redraw: the item only changed once you left the
         tab. Found by the player. */
      const again = rows().find(r => r.textContent.indexOf("Leftovers") === 0);
      ok("y la fila se actualiza en el momento",
         /owned/.test(again.querySelector(".rside").textContent), true);
      ok("el contador de la seccion tambien",
         /Hold Items \d+\//.test(heads()[0]), true);
      ok("la fila es el item mismo", wrote.row.id, "Leftovers");
      /* THE POINT OF MIGRATION 6. Marking one item writes that item and
         nothing else, so a device that never saw Life Orb cannot drop it.
         Before, this wrote the whole owned list from its own copy of it and
         "sin perder los que ya estaban" was a real risk to assert against. */
      ok("y no toca ninguna otra fila",
         JSON.stringify(wrote.row).indexOf("Life Orb") < 0, true);
      click(lo);
      setTimeout(() => {
        const gone = w.__DELETED[w.__DELETED.length - 1];
        ok("desmarcar borra su fila", gone && gone.id, "Life Orb");
        ok("de la tabla items", gone && gone.table, "items");

        console.log("\n  buscar");
        const inp = d.getElementById("itemSearch");
        inp.value = "burn";
        inp.dispatchEvent(new w.Event("input", {bubbles:true}));
        const byText = rows();
        ok("busca dentro de la descripcion", byText.length > 0, true);
        ok("y no solo por nombre",
           byText.some(r => !/burn/i.test(
             r.querySelector(".rname").textContent)), true);
        inp.value = "sitrus";
        inp.dispatchEvent(new w.Event("input", {bubbles:true}));
        ok("y por nombre tambien", rows().length, 1);
        inp.value = "";
        inp.dispatchEvent(new w.Event("input", {bubbles:true}));

        /* the fourth thing that decides a turn, and the app said nothing
           about it until now. Champions halved full paralysis and the app
           was quietly implying the console games' 25%. */
        /* The status table no longer sits behind a third tab on Items: it was
           moved next to the field toggles on the damage view, which is where
           it actually gets applied (page comment, 2026-09-11).

           FOLDED since 2026-09-19, and drawn when the fold is first opened -
           it is a dictionary you read once, and open by default it was pushing
           the number this screen exists for further up the scroll. So this
           opens it, which doubles as the assertion that opening it works. */
        console.log("\n  los estados");
        ok("la tabla vive ahora en la vista de damage",
           !!d.querySelector("#v-calc #statusList"), true);
        ok("y arranca plegada", d.getElementById("statusBody").hidden, true);
        d.getElementById("statusFold")
         .dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
        ok("se abre al tocarla", d.getElementById("statusBody").hidden, false);
        const st = [...d.querySelectorAll("#statusList .row")];
        ok("los ocho estados", st.length, 8);
        const par = st.find(r => r.textContent.indexOf("Paralysis") === 0);
        ok("paralisis dice 12.5%", /12\.5%/.test(par.textContent), true);
        ok("y que antes era 25%", /was 25%/.test(par.textContent), true);
        ok("marcada como rebalanceada por Champions",
           /rebalanced in Champions/.test(par.textContent), true);
        ok("la Velocidad sigue al 50%", /Speed 50%/.test(par.textContent), true);
        const burn = st.find(r => r.textContent.indexOf("Burn") === 0);
        ok("la quemadura avisa de que el chip es numero de consola",
           /main-series number/.test(burn.textContent), true);
        ok("pero su x0.5 sobre fisicos esta medido",
           /physical damage taken 50%/.test(burn.textContent), true);
        ok("cada numero dice de donde sale",
           [...par.querySelectorAll(".tag")].some(t => /rebalance page/.test(t.title || "")),
           true);
        ok("y lista los movimientos que lo causan",
           /moves cause it/.test(par.textContent), true);
        /* ------------------------ y el resto de la pantalla, mas junto */
        /* La calculadora lleva un atacante Y un defensor, asi que cada
           milimetro que gasta lo gasta dos veces. Eran cuatro desplegables de
           ancho completo por lado, uno debajo de otro, antes de llegar a las
           stats (2026-09-19: "ocupa demasiado espacio... espaciado enorme
           entre lineas y secciones"). No se quita nada: se juntan. */
        console.log("\n  la calculadora, mas junta");
        w.CALC.atk = {name:"Garchomp", buildId:null,
          sp:{hp:0,atk:32,def:0,spa:0,spd:0,spe:32},
          boost:{atk:0,def:0,spa:0,spd:0,spe:0}, nature:null, ability:null,
          item:null, status:null, curHP:null};
        w.calcDraw();
        const col = d.getElementById("calcAtk");
        const loose = [...col.querySelectorAll(".field")]
          .filter(f => !f.closest(".grid2"));
        ok("ningun desplegable suelto a ancho completo", loose.length, 0);
        const grid = col.querySelector(".grid2.tight");
        ok("los cuatro van en un solo bloque",
           grid ? grid.querySelectorAll(".field").length : 0, 4);
        ok("y son los cuatro que se ponen antes de leer el numero",
           [...grid.querySelectorAll("label.f")].map(l => l.textContent).join(","),
           "Ability,Item,Nature,Status");
        ok("las seis stats siguen ahi, con su cabecera",
           col.querySelectorAll(".sp").length, 7);


        console.log("\n  las piedras siguen en su panel");
        click(d.getElementById("gearStones"));
        setTimeout(() => {
          ok("81 piedras listadas",
             d.querySelectorAll("#listStonesOwned .row, #listStonesNot .row").length,
             w.CHAMP.STONES.length);
          console.log("\n  ERRORES JS: " +
                      (errs.length ? errs.join(" | ") : "ninguno"));
          console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
          process.exit(bad || errs.length ? 1 : 0);
        }, 300);
      }, 300);
    }, 300);
  }, 500);
}, 1200);
