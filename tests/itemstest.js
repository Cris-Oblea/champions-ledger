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
const ROOT = "C:/Users/CRUIZ/Juegos/Pokemon Champions/";
const UID = "u1";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(48) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

/* the OLD shape on purpose - [name, [category]] - because that is what is in
   the ledger right now and it must keep reading */
const META = [{user_id:UID, id:"items",
               data:{categories:["power_boost","berry"],
                     owned:[["Life Orb",["power_boost"]],
                            ["Sitrus Berry",["berry"]]]},
               updated_at:"2026-09-10"},
              {user_id:UID, id:"stones", data:{owned:["Garchompite"]},
               updated_at:"2026-09-10"}];

const body = fs.readFileSync(ROOT + "tracker/dist/index.html", "utf8")
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/, "");
const stub = `<script>
window.__META=${JSON.stringify(META)}; window.__WROTE=[];
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="meta"?window.__META:[],error:null});},
   upsert:function(r){ window.__WROTE.push(r); return Promise.resolve({error:null}); },
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
    ok("Life Orb sale como owned (formato viejo)",
       /owned/.test(lo.querySelector(".rside").textContent), true);
    /* Life Orb is a shop item with a price; Leftovers is not sold at all - you
       start with it - so its slot says that instead of a made-up VP. */
    const leftovers = all.find(r => r.textContent.indexOf("Leftovers") === 0);
    ok("Leftovers dice de donde sale",
       /start with it/.test(leftovers.querySelector(".rside").textContent), true);
    /* Serebii prints "??? VP" for these; pokebase has the real number */
    const helmet = all.find(r => r.textContent.indexOf("Rocky Helmet") === 0);
    ok("Rocky Helmet ya tiene precio (via pokebase)",
       /2000 VP/.test(helmet.querySelector(".rside").textContent), true);
    ok("y dice de donde salio el numero",
       /pokebase/.test(helmet.querySelector(".rside span").title || ""), true);
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
      /* the row stays focused after the tap, and an activeElement guard here
         used to swallow the redraw: the item only changed once you left the
         tab. Found by the player. */
      const again = rows().find(r => r.textContent.indexOf("Leftovers") === 0);
      ok("y la fila se actualiza en el momento",
         /owned/.test(again.querySelector(".rside").textContent), true);
      ok("el contador de la seccion tambien",
         /Hold Items \d+\//.test(heads()[0]), true);
      ok("y queda dentro",
         (wrote.data.owned || []).indexOf("Leftovers") >= 0, true);
      ok("sin perder los que ya estaban",
         (wrote.data.owned || []).some(x =>
           (Array.isArray(x) ? x[0] : x) === "Life Orb"), true);
      click(lo);
      setTimeout(() => {
        const w2 = w.__WROTE[w.__WROTE.length - 1];
        ok("desmarcar lo saca",
           (w2.data.owned || []).every(x =>
             (Array.isArray(x) ? x[0] : x) !== "Life Orb"), true);

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
        console.log("\n  los estados");
        click(d.getElementById("gearStatus"));
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
