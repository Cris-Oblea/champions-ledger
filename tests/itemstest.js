/* The Items tab (player, 2026-09-10).

   It was called "Gear" and its held-items pane was two rows of toggle
   buttons: the ones you own, and a search that popped prompt() asking for a
   made-up "shop category" before it would record anything. You could read 118
   item NAMES and never learn what one of them did.

   It reads like the Mega Stone list now: every item in the game, in the four
   groups Champions itself uses - Hold Items, Berries, Miscellaneous, and
   stones in their own pane - each row carrying what the item does, what it
   costs in VP, and whether it is owned. */
const { describe } = require("node:test");
const { check, open, idle, click } = require("./harness.js");
const UID = "u1";

/* A ROW PER OWNED THING since migration 6, not a list inside one document.
   The old [name, [category]] pairs were converted by that migration, so the
   two shapes the app used to read are one shape here. */
const META = [];
const ITEMS = [{user_id:UID, id:"Life Orb", updated_at:"2026-09-10"},
               {user_id:UID, id:"Sitrus Berry", updated_at:"2026-09-10"}];
const STONES = [{user_id:UID, id:"Garchompite", updated_at:"2026-09-10"}];

const { dom, errs } = open({ meta: META, items: ITEMS, stones: STONES });
const w = dom.window, d = w.document;
const rows = () => [...d.querySelectorAll("#itemCats .row")];
/* An item's row in the list, found by its name. */
const item = n => rows().find(r => r.textContent.indexOf(n) === 0);
const heads = () => [...d.querySelectorAll("#itemCats h2")]
  .map(h => h.textContent.trim());

(async () => {
  await idle();
  w.go("gear");
  describe("la pestaña", () => {
    check("se llama Items",
       /Items/.test(d.querySelector("#v-gear h1").textContent), true);
  });
  await describe("las categorias del juego", async () => {
    click(d.getElementById("gearItems"));
    await idle();
    const hs = heads();
    ["Hold Items", "Berries", "Miscellaneous"].forEach(function(c, i){
      check(c, hs[i] && hs[i].indexOf(c) === 0, true);
    });
    check("cada una lleva tengo/total", /\d\/\d+$/.test(hs[0]), true);
  });

  describe("el listado", () => {
    const all = rows();
    check("estan todos los items", all.length, w.CHAMP.ITEMS.length);
    check("ninguna Mega Stone aqui",
       all.every(r => !/ite$|ite Z$/.test(
         r.querySelector(".rname").textContent.trim())), true);
    check("cada fila trae descripcion",
       all.filter(r => r.querySelectorAll(".st").length).length, all.length);
    check("y precio o procedencia, nunca en blanco",
       all.every(r => (r.querySelector(".rside").textContent || "").trim()
         .length > 1), true);
    const lo = item("Life Orb");
    check("Life Orb sale como owned",
       /owned/.test(lo.querySelector(".rside").textContent), true);
    /* Life Orb is a shop item with a price; Leftovers is not sold at all - you
       start with it - so its slot says that instead of a made-up VP. */
    const leftovers = item("Leftovers");
    check("Leftovers dice de donde sale",
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
    check("todo precio dice su fuente",
       all.filter(r => /\d VP/.test(r.querySelector(".rside").textContent))
          .every(r => /serebii|pokebase/i
            .test(r.querySelector(".rside span").title || "")), true);
    check("ningun item se queda con 'price ?'",
       all.every(r => !/price \?/.test(r.querySelector(".rside").textContent)),
       true);
    const scarf = item("Muscle Band");
    check("Muscle Band trae su precio en VP",
       /\d VP/.test(scarf.querySelector(".rside").textContent), true);
  });

  /* the player's own example: an item that extends a field effect serves
     the MOVE and the ABILITY that set it, and naming only the move misses
     the half that matters on most teams */
  describe("a que sirve cada item", () => {
    const heat = item("Heat Rock");
    check("Heat Rock nombra el move", /Sunny Day/.test(heat.textContent), true);
    check("y la habilidad", /Drought/.test(heat.textContent), true);
    const seed = item("Electric Seed");
    check("Electric Seed llega a Electric Surge",
       /Electric Surge/.test(seed.textContent), true);
    const clay = item("Light Clay");
    check("Light Clay incluye Aurora Veil (confirmado en juego)",
       /Aurora Veil/.test(clay.textContent), true);
    const coal = item("Charcoal");
    check("Charcoal dice que sube los Fire",
       /every Fire move/.test(coal.textContent), true);
    const balloon = item("Air Balloon");
    check("Air Balloon sabe que es Ground (texto de pokebase)",
       /Ground/.test(balloon.textContent), true);
  });

  await describe("marcar y desmarcar", async () => {
    click(item("Leftovers"));
    await idle();
    const wrote = w.__WROTE[w.__WROTE.length - 1];
    check("se guarda", !!wrote, true);
    check("en la tabla items, no en meta", wrote.table, "items");
    /* the row stays focused after the tap, and an activeElement guard here
       used to swallow the redraw: the item only changed once you left the
       tab. Found by the player. */
    check("y la fila se actualiza en el momento",
       /owned/.test(item("Leftovers").querySelector(".rside").textContent), true);
    check("el contador de la seccion tambien",
       /Hold Items \d+\//.test(heads()[0]), true);
    check("la fila es el item mismo", wrote.row.id, "Leftovers");
    /* THE POINT OF MIGRATION 6. Marking one item writes that item and
       nothing else, so a device that never saw Life Orb cannot drop it.
       Before, this wrote the whole owned list from its own copy of it and
       "sin perder los que ya estaban" was a real risk to assert against. */
    check("y no toca ninguna otra fila",
       JSON.stringify(wrote.row).indexOf("Life Orb") < 0, true);
    click(item("Life Orb"));
    await idle();
    const gone = w.__DELETED[w.__DELETED.length - 1];
    check("desmarcar borra su fila", gone && gone.id, "Life Orb");
    check("de la tabla items", gone && gone.table, "items");
  });

  describe("buscar", () => {
    const inp = d.getElementById("itemSearch");
    inp.value = "burn";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const byText = rows();
    check("busca dentro de la descripcion", byText.length > 0, true);
    check("y no solo por nombre",
       byText.some(r => !/burn/i.test(
         r.querySelector(".rname").textContent)), true);
    inp.value = "sitrus";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("y por nombre tambien", rows().length, 1);
    inp.value = "";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
  });

  /* The status table no longer sits behind a third tab on Items: it was
     moved next to the field toggles on the damage view, which is where
     it actually gets applied (page comment, 2026-09-11).

     FOLDED since 2026-09-19, and drawn when the fold is first opened -
     it is a dictionary you read once, and open by default it was pushing
     the number this screen exists for further up the scroll. So this
     opens it, which doubles as the assertion that opening it works. */
  describe("los estados", () => {
    /* the fourth thing that decides a turn, and the app said nothing
       about it until now. Champions halved full paralysis and the app
       was quietly implying the console games' 25%. */
    check("la tabla vive ahora en la vista de damage",
       !!d.querySelector("#v-calc #statusList"), true);
    check("y arranca plegada", d.getElementById("statusBody").hidden, true);
    click(d.getElementById("statusFold"));
    check("se abre al tocarla", d.getElementById("statusBody").hidden, false);
    const st = [...d.querySelectorAll("#statusList .row")];
    check("los ocho estados", st.length, 8);
    const par = st.find(r => r.textContent.indexOf("Paralysis") === 0);
    check("paralisis dice 12.5%", /12\.5%/.test(par.textContent), true);
    check("y que antes era 25%", /was 25%/.test(par.textContent), true);
    check("marcada como rebalanceada por Champions",
       /rebalanced in Champions/.test(par.textContent), true);
    check("la Velocidad sigue al 50%", /Speed 50%/.test(par.textContent), true);
    const burn = st.find(r => r.textContent.indexOf("Burn") === 0);
    check("la quemadura avisa de que el chip es numero de consola",
       /main-series number/.test(burn.textContent), true);
    check("pero su x0.5 sobre fisicos esta medido",
       /physical damage taken 50%/.test(burn.textContent), true);
    check("cada numero dice de donde sale",
       [...par.querySelectorAll(".tag")].some(t => /rebalance page/.test(t.title || "")),
       true);
    check("y lista los movimientos que lo causan",
       /moves cause it/.test(par.textContent), true);
  });

  /* La calculadora lleva un atacante Y un defensor, asi que cada
     milimetro que gasta lo gasta dos veces. Eran cuatro desplegables de
     ancho completo por lado, uno debajo de otro, antes de llegar a las
     stats (2026-09-19: "ocupa demasiado espacio... espaciado enorme
     entre lineas y secciones"). No se quita nada: se juntan. */
  describe("la calculadora, mas junta", () => {
    w.CALC.atk = {name:"Garchomp", buildId:null,
      sp:{hp:0,atk:32,def:0,spa:0,spd:0,spe:32},
      boost:{atk:0,def:0,spa:0,spd:0,spe:0}, nature:null, ability:null,
      item:null, status:null, curHP:null};
    w.calcDraw();
    const col = d.getElementById("calcAtk");
    const loose = [...col.querySelectorAll(".field")]
      .filter(f => !f.closest(".grid2"));
    check("ningun desplegable suelto a ancho completo", loose.length, 0);
    const grid = col.querySelector(".grid2.tight");
    check("los cuatro van en un solo bloque",
       grid ? grid.querySelectorAll(".field").length : 0, 4);
    check("y son los cuatro que se ponen antes de leer el numero",
       [...grid.querySelectorAll("label.f")].map(l => l.textContent).join(","),
       "Ability,Item,Nature,Status");
    check("las seis stats siguen ahi, con su cabecera",
       col.querySelectorAll(".sp").length, 7);
  });

  /* LO QUE SE MIDIO EN EL NAVEGADOR, NO EN JSDOM. jsdom no maqueta, asi
     que las alturas reales se tomaron con scripts/preview.py en iframes
     de 400 / 820 / 1526px y estan en el PR. Lo que SI se puede asegurar
     aqui es la estructura que las produjo, que es lo que se rompe sin
     que nadie lo note:

       - la etiqueta de cada grupo del campo va DENTRO de su fila, no en
         una linea propia: eran ocho lineas de puro titulo y una columna
         de 747px que estiraba al atacante y al defensor a su altura
       - y los controles de las stats bajan del suelo global de 42px,
         que es un objetivo tactil y sigue vigente en todo lo demas. */
  describe("el campo, junto en lugar de en lineas sueltas", () => {
    const col = d.getElementById("calcAtk");
    const frows = [...d.querySelectorAll("#calcField .fieldrow")];
    check("cada grupo es una fila", frows.length, 8);
    check("con su etiqueta dentro, no encima",
       frows.every(r => r.firstElementChild.className === "fieldgroup"), true);
    check("y sus botones en la misma fila",
       frows.every(r => r.querySelectorAll(".tog").length > 0), true);
    check("ninguna etiqueta suelta fuera de una fila",
       [...d.querySelectorAll("#calcField > .fieldgroup")].length, 0);
    check("los 32 botones del campo siguen ahi",
       d.querySelectorAll("#calcField .tog").length, 32);
    /* Y LAS DOS MITADES DE UN LADO SIGUEN APILADAS, a proposito. Ponerlas
       una al lado de la otra ahorraba 107px - 950 a 843 - y estuvo puesto
       hasta que se MIRO la pantalla: un lado mide 360px a tres columnas,
       asi que cada mitad son 169 y la casilla del SP salia de VEINTIDOS
       pixeles. Ningun ancho arregla eso; a 1920 serian 220. */
    check("un lado no se parte en dos", !!col.querySelector(".calcsplit"), false);
    /* y lleva su Pokemon encima, como TODAS las demas listas de la app -
       era la ultima que dibujaba una fila pelada (2026-09-19: "a la
       calculadora tambien le faltan los sprites") */
    check("el lado lleva la card con su tipo",
       col.querySelector(".row").className.split(" ").indexOf("card") >= 0,
       true);
    check("y su sprite", !!col.querySelector(".row img"), true);
    check("a tamano nativo, no reescalado",
       col.querySelector(".row img").getAttribute("width"), "96");
    /* y la fila de stat conserva sus cuatro partes: etiqueta, casilla,
       stage y el valor calculado */
    /* [2], no [1]: la 0 es la cabecera y la 1 es HP, que no lleva stage */
    const sprow = [...col.querySelectorAll(".sp")][2];
    check("la fila de stat tiene sus cuatro partes", sprow.children.length, 4);
    check("con su casilla editable", !!sprow.querySelector("input"), true);
    check("y su selector de stage", !!sprow.querySelector("select"), true);
  });


  await describe("las piedras siguen en su panel", async () => {
    click(d.getElementById("gearStones"));
    await idle();
    check("81 piedras listadas",
       d.querySelectorAll("#listStonesOwned .row, #listStonesNot .row").length,
       w.CHAMP.STONES.length);
  });
  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
