/* WHAT A POKEMON TURNS INTO, on the card, for BOTH kinds of turning.

   The Megas have had the full treatment for a while - a sprite in the strip,
   its own ink, a second number under every stat it moves, an arrow when the
   typing changes. The three forms that do the same thing from an ABILITY
   instead of a stone had none of it, and two of them are the ones whose base
   row is the most misleading number on the card (player, 2026-09-20: "faltan
   las formas de batalla (sobre todo las que cambian de stats como la de
   aegislash y la de palafin)... tambien son modificaciones in battle, como
   los megas").

   There are exactly five in Champions and this test says so, so that a
   regulation adding a sixth - a Wishiwashi, a Minior, an Eiscue, all of them
   one species away on the watchlist - fails here rather than shipping a card
   that quietly leaves it out.

   FIVE, NOT THREE (player, 2026-09-27: "morpeko tiene otra forma y es por
   habilidad y no se ve su otro sprite... la idea es tener todas las imagenes
   funcionando"). Hangry Morpeko and Busted Mimikyu move no number and were
   left off for that - which took their picture with them, and with it the
   one thing Hangry Mode really changes: "aura wheel de morpeko cambia de tipo
   el move segun su forma". */
const { describe } = require("node:test");
const { check, open, idle } = require("./harness.js");

const { dom, errs } = open();
const w = dom.window, d = w.document;

function card(name){
  w.go("find");
  const inp = d.getElementById("findName");
  inp.value = name;
  inp.dispatchEvent(new w.Event("input", {bubbles:true}));
  return [...d.querySelectorAll("#findOut .row.card")]
    .find(r => r.querySelector(".rname").textContent.indexOf(name) === 0);
}

const src = (img) => img ? img.getAttribute("src") : "";
const keys = (c) => [...c.querySelectorAll(".megapickey")]
  .map(x => x.textContent).join(" ");

(async () => {
  await idle();
  describe("cuantas formas de batalla tiene Champions", () => {
    const bf = w.CHAMP.BFORMS;
    check("las cinco, muevan un numero o no", Object.keys(bf).sort().join(","),
       "Aegislash,Castform,Mimikyu,Morpeko,Palafin");
    check("y cada una trae su propio sprite",
       Object.keys(bf).every(k => Object.values(bf[k].f).every(e => !!e.sp)), true);
    check("y cada una dice que habilidad la provoca",
       Object.keys(bf).every(k => !!bf[k].by), true);
  });

  describe("Aegislash: Stance Change le da 140 de ataque", () => {
    const ae = card("Aegislash");
    check("la card existe", !!ae, true);
    check("el sprite de Blade esta en la tira",
       [...ae.querySelectorAll(".megapickey")].map(x => x.textContent).join(" "),
       "base blade");
    check("y lleva su propia tinta, no la de una mega",
       !!ae.querySelector(".megapickey.mk-b"), true);
    check("el ataque muestra el segundo numero",
       /140/.test(ae.querySelectorAll(".statline > div")[1].textContent), true);
    /* SIN CAJA. La habilidad que lo provoca ya esta arriba - las tres formas de
       batalla de Champions tienen una sola habilidad - asi que una caja mas
       repetiria la palabra debajo de si misma. */
    check("Stance Change aparece una sola vez",
       (ae.textContent.match(/Stance Change/g) || []).length, 1);
    check("y no la llama habilidad mega", /Mega ability/.test(ae.textContent), false);
  });

  describe("Palafin: Zero to Hero, 70 -> 160", () => {
    const pa = card("Palafin");
    check("el sprite de Hero esta en la tira",
       [...pa.querySelectorAll(".megapickey")].map(x => x.textContent).join(" "),
       "base hero");
    check("el ataque muestra 160",
       /160/.test(pa.querySelectorAll(".statline > div")[1].textContent), true);
    check("y el BST sube", /457\s*→\s*650/.test(pa.textContent.replace(/\s+/g," ")), true);
  });

  describe("Castform: Forecast le cambia el tipo tres veces", () => {
    const ca = card("Castform");
    check("los tres sprites estan",
       [...ca.querySelectorAll(".megapickey")].map(x => x.textContent).join(" "),
       "base sunny rainy snowy");
    check("y las tres flechas nombran su forma",
       [...ca.querySelectorAll(".megato")].map(x => x.textContent.trim()).join(" "),
       "→ sunny → rainy → snowy");
    ["Fire", "Water", "Ice"].forEach(t => check("chip de " + t,
       [...ca.querySelectorAll(".rmeta .t")].some(x => x.textContent === t), true));
    /* EL COLOR DE LA CARD TAMBIEN CICLA. Una capa por tipo, no una sola: con
       una sola el color habria elegido Fuego y llamado nada a los otros dos.
       Cada transicion es UNA capa moviendose sobre algo solido, que es la
       regla que dejo el marco. */
    check("una capa de color por tipo", ca.querySelectorAll(".retype").length, 3);
    check("y un marco por tipo", ca.querySelectorAll(".retyperim").length, 3);
    check("la card pide el ciclo de cuatro", ca.classList.contains("n3"), true);
  });


  describe("Morpeko: Hunger Switch no mueve ningun numero, y es otra forma", () => {
    const mo = card("Morpeko");
    check("el sprite de Hangry esta en la tira", keys(mo), "base hangry");
    const hang = mo.querySelectorAll(".megapic")[1];
    check("y es el dibujo de Hangry, no el de la base",
       /\/10187\.png$/.test(src(hang)), true);
    check("su titulo dice lo que le hace a Aura Wheel",
       /Aura Wheel is Dark/.test(hang && hang.title), true);
    check("sin segundo numero inventado en los stats",
       mo.querySelectorAll(".statline .mg").length, 0);
    w.findDetail(w.byName["Morpeko"]);
    const sb = d.getElementById("sheetBody").textContent.replace(/\s+/g, " ");
    check("la ficha abre el bloque In battle", /In battle — Hunger Switch/.test(sb), true);
    check("y dice que Aura Wheel pasa de Electric a Dark",
       /Aura Wheel:\s*Electric\s*→\s*Dark/.test(sb), true);
    check("sin decir que cambia el tipo del Pokemon",
       /changes the typing/.test(sb), false);
  });

  describe("Mimikyu: Disguise tambien es una forma", () => {
    check("el sprite de Busted esta en la tira", keys(card("Mimikyu")), "base busted");
  });

  describe("una mega, dos dibujos", () => {
    const mf = w.pokeCard(w.byName["Meowstic-Female"], {});
    check("Meowstic hembra dibuja SU mega, no la del macho",
       /\/10326\.png$/.test(src(mf.querySelectorAll(".megapic")[1])), true);
    const mm = w.pokeCard(w.byName["Meowstic"], {});
    check("y el macho la suya",
       /\/10314\.png$/.test(src(mm.querySelectorAll(".megapic")[1])), true);
  });

  describe("un Pokemon que Champions no tiene tambien trae sus formas", () => {
    const mw = w.pokeCard(w.anyRow("Mewtwo"), {});
    check("Mewtwo muestra Mega X y Mega Y", keys(mw), "base mega X mega Y");
    check("con la tinta de cada letra",
       !!mw.querySelector(".megapickey.mk-x") && !!mw.querySelector(".megapickey.mk-y"),
       true);
    check("y Mega X lo vuelve Psychic/Fighting",
       [...mw.querySelectorAll(".rmeta .t")].map(x => x.textContent).join(","),
       "Psychic,Psychic,Fighting");
    check("Kyogre muestra su forma Primal",
       keys(w.pokeCard(w.anyRow("Kyogre"), {})), "base primal");
    const tz = w.pokeCard(w.anyRow("Tatsugiri-Droopy"), {});
    check("cada Tatsugiri su propia mega, con su propio dibujo",
       /\/10323\.png$/.test(src(tz.querySelectorAll(".megapic")[1])), true);
    const zy = w.pokeCard(w.anyRow("Zygarde"), {});
    check("Mega Zygarde, que solo existe como render HOME, lo usa",
       /other\/home\/10301\.png$/.test(src(zy.querySelectorAll(".megapic")[1])), true);
    w.findDetail(w.anyRow("Mewtwo"));
    const mws = d.getElementById("sheetBody").textContent.replace(/\s+/g, " ");
    check("la ficha de Mewtwo trae su Mega line",
       /Mega line — 2 of them/.test(mws) && /Mega Mewtwo Y/.test(mws), true);
  });

  describe("toda card tiene su dibujo", () => {
    const sid = w.CHAMP.SPRITE_ID;
    const names = w.CHAMP.DEX.map(r => r[0]).concat(Object.keys(w.CHAMP.HOME_DEX));
    check("ningun nombre del dex ni de HOME sin sprite",
       names.filter(n => !sid[n]).join(", "), "");
    check("Arceus-Ice dibuja su placa, archivada por forma",
       /\/493-ice\.png$/.test(src(w.pokeCard(w.anyRow("Arceus-Ice"), {})
         .querySelector(".megapic"))), true);
    const pi = w.spriteFor("Pichu-Spiky-eared", true);
    check("una ficha sin render HOME cae al sprite de 96, a su tamano",
       /pokemon\/172-spiky-eared\.png$/.test(src(pi)) && pi.width === 96, true);
  });

  describe("un Pokemon sin forma de batalla no cambia en nada", () => {
    const ga = card("Garchomp");
    check("Garchomp no tiene tinta de forma de batalla",
       !!ga.querySelector(".mk-b"), false);
    /* y una mega que SI cambia de tipo sigue con su fundido de dos estados */
    check("Garchomp cicla dos estados, no cuatro",
       ga.className.indexOf("n3") < 0 && /retyping/.test(ga.className), true);
    check("con una sola capa", ga.querySelectorAll(".retype").length, 1);
  });

  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
