/* THE CHECKLIST: what is still missing, and in what order to go after it.

   Champions' own route in is a gacha, so the dex is finished through Pokemon
   GO into HOME and the GTS for the rest. A list of everything he does not own
   would be 134 cards in dex order and answer nothing; what this pane is for
   is the ORDER (player, 2026-09-20: "la idea es ir priorizando pokemones que
   no tengo por al menos 1 copia por especie", and the first bucket is his
   own: "los mas priorizados deberian ser los que estan haciendo espacio en
   pokemon champions en estos momentos").

   The rule this pins down is the one that is easy to get backwards: a species
   already in HOME is DONE even when a copy is also welded into the Champions
   box, because the HOME copy is the one that makes the slot elastic. */
const { describe } = require("node:test");
const { check, open, idle, row: boxRow, click } = require("./harness.js");

const row = (id, name, location, status, origin) =>
  boxRow(id, name, {location, status, origin, trained:true});
/* Aggron is bought and welded, Meganium is a rental, Dragonite only exists in
   HOME, and Garchomp is in BOTH - which is the case that must NOT be listed. */
const ROWS = [
  row("aggron",    "Aggron",    "champions", "permanent", "champions"),
  row("meganium",  "Meganium",  "champions", "rental",    "champions"),
  row("dragonite", "Dragonite", "home",      "permanent", "home"),
  row("garchomp",  "Garchomp",  "champions", "permanent", "champions"),
  row("garchomp2", "Garchomp",  "home",      "permanent", "home"),
  row("dragonite2","Dragonite", "home",      "permanent", "home"),
  /* EL GTS NO LOS ACEPTA, Y NO SON EL MISMO CASO. Melmetal lo probo el
     jugador y lo rechazo: se cae de la lista. Celebi es Mythical como
     Melmetal, que es UN dato y no una regla, asi que se queda pero al final
     y avisando. */
  row("melmetal", "Melmetal",  "home",      "permanent", "home"),
  row("celebi",   "Celebi",    "home",      "permanent", "home"),
];

const { dom, errs } = open({ box: ROWS });
const w = dom.window, d = w.document;
const pane = k => [...d.querySelectorAll(".homeseg button")]
  .find(b => b.dataset.home === k);
/* THE NAME, NOT THE WHOLE LINE. A card's name line also carries badges - a
   difficulty chip, "frees a slot", a Worlds medal - and they are elements,
   while the name itself is the one bare text node pokeCard appends. Splitting
   the textContent on capitals worked until a badge arrived in lower case. */
const names = id => [...d.querySelectorAll("#" + id + " .row.card .rname")]
  .map(x => [...x.childNodes].filter(n => n.nodeType === 3)
                             .map(n => n.textContent).join("").trim());

(async () => {
  await idle();
  w.go("home");

  describe("tres paneles, un selector", () => {
    check("empieza en la caja", d.getElementById("homePaneBox").hidden, false);
    pane("gts").click();
    check("GTS se abre", d.getElementById("homePaneGts").hidden, false);
    check("...y la caja se cierra", d.getElementById("homePaneBox").hidden, true);
    pane("dex").click();
    check("Dex se abre", d.getElementById("homePaneDex").hidden, false);
    check("...y GTS se cierra", d.getElementById("homePaneGts").hidden, true);
  });

  describe("que falta, y en que orden", () => {
    /* 264 = el dex sin las megas. Una mega no se obtiene, se crea con su piedra,
       asi que no puede estar en una lista de capturas. */
    check("el objetivo es el dex sin megas",
       w.CHAMP.DEX.filter(p => !p[4]).length, 264);
    check("cuatro especies son suyas", /4 of 264/.test(
       d.getElementById("dexDone").textContent), true);
    check("faltan 260", d.getElementById("nDexMissing").textContent, 260);
  });

  describe("y los que SI tienes en Champions son objetivos de GTS", () => {
    /* EL LISTADO DE LO QUE TIENE EN CHAMPIONS NO ES UNA CHECKLIST. Se ve en la
       Champions Box; lo que la caja no puede decir es con que cambiarlo
       (player, 2026-09-21: "el listado de champions se puede usar como
       recomendaciones de cambio en el gts"). */
    check("la lista de 'libera slot' ya no esta en Dex",
       !!d.getElementById("listDexFree"), false);
    pane("gts").click();
    /* LAS CARDS SON LOS CHIPS, NO LOS OBJETIVOS. Se lee desde HOME: lo que su
       propia regla deja ofrecer - un duplicado pasada la primera copia, o una
       especie que Champions no puede usar. Los objetivos van en la linea
       "Ask for", y el que libera slot va marcado. */
    const chips = names("listGtsWant");
    check("Dragonite es un chip: duplicado dentro de HOME",
       chips.indexOf("Dragonite") >= 0, true);
    /* Y GARCHOMP NO, aunque haya dos filas. Una es de origen Champions y esa
       no puede salir del juego nunca, asi que no puede ser la copia que se
       queda - la de HOME es la unica de verdad (player, 2026-09-21: "los
       duplicados solo se cuentan cuando el origen es home. cuando el origen es
       champions sea permanente o rental no cuentan para duplicado"). */
    check("Garchomp no, su segunda copia es de origen Champions",
       chips.indexOf("Garchomp") >= 0, false);
    check("Aggron no es un chip, es un objetivo",
       chips.indexOf("Aggron") >= 0, false);
    const asks = [...d.querySelectorAll("#listGtsWant .st")]
      .map(x => x.textContent).join(" ");
    check("y aparece como algo que pedir", /Aggron/.test(asks), true);
    /* LO QUE SE PIDE ES JUGABLE, SIEMPRE. Cambiar por algo que Champions no
       puede usar compra una fila de HOME y nada mas (player, 2026-09-21: "no
       quiero cambiar por pokemones que no pueda usar"). */
    check("y nunca se propone pedir algo que Champions no tiene",
       [...d.querySelectorAll("#listGtsWant .st .tag")]
         .every(t => !!w.byName[t.textContent]), true);
    /* EL FILTRO, que es la pregunta con la que abre la pantalla */
    const wantTog = v => [...d.querySelectorAll("#gtsWantFilter button")]
      .find(b => b.dataset.want === v);
    check("hay filtro por los que no puede usar", !!wantTog("outside"), true);
    check("Melmetal no se recomienda: el GTS no lo acepta",
       names("listGtsWant").indexOf("Melmetal") >= 0, false);
    check("y se dice, no se esconde",
       /Melmetal/.test(d.getElementById("gtsWantSub").textContent), true);
    /* Celebi si se lista - un dato no es una regla - pero al final y avisando */
    const celebi = [...d.querySelectorAll("#listGtsWant .row.card")]
      .find(c => [...c.querySelector(".rname").childNodes]
        .filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim()
          === "Celebi");
    check("Celebi sigue en la lista", !!celebi, true);
    check("...avisando de que el GTS puede rechazarlo",
       !!celebi && /GTS may refuse it/.test(celebi.textContent), true);
    click(wantTog("outside"));
    check("y deja solo esos",
       names("listGtsWant").every(n => !w.byName[n]), true);
    click(wantTog("all"));
    check("marcado como que libera slot",
       !!d.querySelector("#listGtsWant .tag.ok"), true);
    check("el record sale de sus propios trades cerrados",
       /closed trades/.test(d.getElementById("gtsWantSub").textContent) ||
       !w.CHAMP_GTS_ROWS, true);
    pane("dex").click();

    /* EL CASO QUE IMPORTA: Garchomp esta en la caja Y en HOME, y ninguna de las
       dos listas debe pedirlo. */
    check("Garchomp no aparece entre los que faltan",
       names("listDexMissing").indexOf("Garchomp") >= 0, false);
    check("Aggron tampoco, lo tienes en Champions",
       names("listDexMissing").indexOf("Aggron") >= 0, false);
    check("Dragonite tampoco, solo vive en HOME",
       names("listDexMissing").indexOf("Dragonite") >= 0, false);
  });

  describe("el filtro", () => {
    const inp = d.getElementById("dexFilter");
    inp.value = "aggron";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("filtra a nada, porque Aggron no falta",
       !!d.querySelector("#listDexMissing .empty"), true);
    /* el nombre sale de la propia lista, para que el test no dependa de que
       tal especie este o no en el roster de Champions */
    inp.value = "";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const one = names("listDexMissing")[0];
    inp.value = one.toLowerCase();
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("y encuentra lo que si falta", names("listDexMissing").join(","), one);
    inp.value = "";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("y se deshace", d.getElementById("nDexMissing").textContent, 260);
  });

  describe("HOME aguanta cualquier nombre", () => {
    /* Oinkologne vive en HOME y no en Champions, y PokeAPI no tiene fila
       `oinkologne` - la especie esta archivada como `oinkologne-male` y
       `oinkologne-female`. La busqueda pedia el nombre pelado, fallaba, caia a
       lo mismo y volvia a fallar, asi que la ficha se construia con null y
       reventaba en su primera linea. */
    const hd = w.CHAMP.HOME_DEX || {};
    ["Oinkologne", "Oinkologne-F", "Deoxys", "Giratina", "Shaymin", "Meloetta",
     "Keldeo", "Wormadam", "Darmanitan", "Minior", "Enamorus", "Dudunsparce",
     "Frillish", "Jellicent"].forEach(function(n){
      check(n + " tiene fila", !!(hd[n] && hd[n].b && hd[n].b[0]), true);
    });
    check("y la hembra no es el macho", (hd["Oinkologne-F"] || {b:[]}).b.join("/"),
       "115/90/70/59/90/65");
    /* y una fila que no existe en ningun dex abre ficha en vez de tirar error */
    w.pokeSheet({name:"Syclant", location:"home", status:"permanent",
                 origin:"home", _id:"cap"});
    check("un nombre que no conoce ningun dex no rompe la ficha",
       !!d.getElementById("sheetBody"), true);
    check("...y lo dice", /not in any dex/.test(
       d.getElementById("sheetBody").textContent), true);
    w.closeSheet();
  });

  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
