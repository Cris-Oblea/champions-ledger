/* The search view (player, 2026-09-10):

     - adding a move filter had a plain search box while the build editor had
       sort and filters, so the same question was asked two different ways.
       Both now run the one `moveFilters` implementation.
     - the ability list was 215 names in alphabetical order. Every ability now
       carries a bucket, and the first two buckets ARE the rule table in
       build_ability_moves.py, not a second reading of the text.
     - "in my box" was one flag over two boxes. It is now two: the Champions
       box answers "can I play this today", HOME answers "can I bring it in".
*/
const { describe } = require("node:test");
const { check, open, idle, row, click } = require("./harness.js");

const ROWS = [row("garchomp", "Garchomp", {trained:true}),
              row("dragonite", "Dragonite", {location:"home", origin:"home", trained:true})];

const { dom, errs } = open({ box: ROWS });
const w = dom.window, d = w.document;
const sheetChip = t => [...d.querySelectorAll(".sheet .tog")]
  .find(b => b.textContent.trim() === t);
const sheetRows = () => [...d.querySelectorAll(".sheet .list .row")];
const results = () => [...d.querySelectorAll("#findOut .row")];
const countLine = () => [...d.querySelectorAll(".sheet .sub")]
  .map(x => x.textContent).find(t => /abilities$|moves$| of \d+ moves/.test(t)) || "";
/* The AND/OR chip lives in the filter bar, so it can be flipped without
   reopening the sheet. */
const modeChip = () => [...d.querySelectorAll("#findChips .tog")]
  .find(b => /of those types/.test(b.textContent));

(async () => {
  await idle();
  w.go("find");

  await describe("añadir un movimiento: los mismos controles que el builder", async () => {
    click(d.getElementById("findAddMove"));
    await idle();
    ["BP × acc", "A–Z", "PP", "Type"].forEach(function(t){
      check("orden: " + t, !!sheetChip(t), true);
    });
    ["Physical", "Special", "Status", "Spread", "Hits ally", "Priority"]
      .forEach(function(t){ check("filtro: " + t, !!sheetChip(t), true); });
    click(sheetChip("Status"));
    const statusOnly = sheetRows();
    check("filtra a status", statusOnly.every(r => /Status/.test(r.textContent)), true);
    /* both lists cap at 80 rows, so the COUNT is what says it filtered */
    check("y el contador lo dice", / of \d+ moves/.test(countLine()), true);
    click(sheetChip("Ground"));
    check("acumula tipo + categoria",
       sheetRows().every(r => /Ground/.test(r.querySelector(".t").textContent) &&
                              /Status/.test(r.textContent)), true);
    click(sheetRows()[0]);

    await idle();
    check("el filtro queda puesto",
       /learns /.test(d.getElementById("findChips").textContent), true);
  });

  /* the app could show every number about a move and not one word about
     what it does, so "which of these crits" had no answer on the phone */
  await describe("buscar un movimiento por su descripcion", async () => {
    click(d.getElementById("findClear"));
    click(d.getElementById("findAddMove"));
    await idle();
    const inp = d.querySelector(".sheet input[type=text]");
    inp.value = "critical";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const rr = sheetRows();
    check("critical encuentra movimientos", rr.length > 0, true);
    check("y ninguno se llama asi",
       rr.every(r => !/critical/i.test(
         r.querySelector(".rname").textContent)), true);
    check("porque el texto esta en la fila",
       rr.every(r => /Critical/i.test(r.textContent)), true);
    inp.value = "burn";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("burn tambien", sheetRows().length > 0, true);
    /* Serebii says "Gives the target the Taunted status" and stops, so the
       app was showing a name for a mechanic instead of the mechanic.
       build_text_facts.py takes pokebase's line for those. */
    inp.value = "taunt";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const tt = sheetRows().find(r => /Taunt/.test(
      r.querySelector(".rname").textContent));
    check("Taunt explica el mecanismo, no el nombre del estado",
       /three turns|3 turns/.test(tt.textContent), true);
    check("y ningun movimiento se queda sin texto",
       Object.values(w.MOVE_BY).filter(m => !m.text).length <= 1, true);
  });


  await describe("habilidades por categoria", async () => {
    w.closeSheet();
    click(d.getElementById("findClear"));
    click(d.getElementById("findAddAbility"));
    await idle();
    const cls = w.CHAMP.AB_CLASS, lbl = w.CHAMP.AB_CLASS_LABEL;
    /* against the abilities the page carries, not a typed 215: Battle
       Bond made it 216 (2026-09-27) and the literal failed the gate for
       an ability that WAS classified */
    const all = Object.keys(w.CHAMP.ABIL);
    check("todas estan clasificadas", all.filter(a => !cls[a]).join(", ") ||
       "todas", "todas");
    check("y no clasifica ninguna que no exista",
       Object.keys(cls).length, all.length);
    const offChip = [...d.querySelectorAll(".sheet .tog")]
      .find(b => b.textContent.indexOf(lbl["moves-off"]) === 0);
    const defChip = [...d.querySelectorAll(".sheet .tog")]
      .find(b => b.textContent.indexOf(lbl["moves-def"]) === 0);
    check("hay chip de 'cambia sus movimientos'", !!offChip, true);
    check("hay chip de defensivas", !!defChip, true);
    check("el chip trae el conteo", /· \d+$/.test(offChip.textContent), true);
    click(offChip);
    const names = sheetRows().map(r => r.querySelector(".rname")
      .childNodes[0].textContent);
    check("solo salen las ofensivas",
       names.every(n => cls[n] === "moves-off"), true);
    check("y son las de la tabla de reglas",
       names.every(n => w.AB_SET[n] && w.AB_SET[n].side === "off"), true);
    click(defChip);
    check("dos chips suman (OR dentro del grupo)",
       sheetRows().map(r => r.querySelector(".rname").childNodes[0].textContent)
         .every(n => cls[n] === "moves-off" || cls[n] === "moves-def"), true);
    click(offChip); click(defChip);
    const weather = [...d.querySelectorAll(".sheet .tog")]
      .find(b => b.textContent.indexOf(lbl.weather) === 0);
    check("hay chip de weather", !!weather, true);
    click(weather);
    check("y filtra a weather",
       sheetRows().map(r => r.querySelector(".rname").childNodes[0].textContent)
         .every(n => cls[n] === "weather"), true);
  });


  await describe("tipos: Y frente a O", async () => {
    click(d.querySelector(".sheet .fbtn") || d.body);
    w.closeSheet();
    click(d.getElementById("findAddType"));
    await idle();
    click(sheetChip("Rock")); click(sheetChip("Steel"));
    w.closeSheet();
    const andHits = results().length;
    check("Roca Y Acero: solo los dobles",
       results().every(r => /Steel|Rock/.test(r.textContent)), true);
    const mode = modeChip();
    check("hay chip de modo", !!mode, true);
    click(mode);
    check("Roca O Acero: son mas", results().length > andHits, true);
    check("y el chip lo dice",
       /any of those types/.test(d.getElementById("findChips").textContent),
       true);
    click(d.getElementById("findAddType"));
    await idle();

    click(sheetChip("Ground")); w.closeSheet();
    check("tres tipos en O siguen dando resultados", results().length > 0, true);
    click(modeChip());
    check("en Y con tres tipos no hay nada", results().length, 0);
    check("y avisa por que",
       /three types/.test(d.getElementById("findOut").textContent), true);
  });

  /* the sheet you land on after tapping a result. Two things the player
     found: the six stats printed with no label under them, because
     STAT_LABEL was declared twice and the array won at runtime; and the
     movepool was the top 40 by base power with every status move dropped, so
     Protect was not in a Pokemon's own sheet at all. */
  await describe("la ficha del Pokemon", async () => {
    click(d.getElementById("findClear"));
    click([...d.querySelectorAll("#findOut .row")][0]);
    await idle();
    const sl = d.querySelector(".sheet .statline");
    check("hay bloque de stats", !!sl, true);
    ["HP", "Atk", "Def", "SpA", "SpD", "Spe"].forEach(function(k){
      check("dice cual es " + k, sl.textContent.indexOf(k) >= 0, true);
    });
    check("y nada sale como undefined",
       !/undefined/.test(sl.textContent), true);
    check("la fila del buscador tambien va etiquetada",
       /HP.*Atk.*Spe/.test(
         d.querySelectorAll("#findOut .row")[0].textContent), true);

    const chip = t => [...d.querySelectorAll(".sheet .tog")]
      .find(b => b.textContent.trim() === t);
    check("el movepool trae los filtros", !!chip("Physical"), true);
    check("y el orden", !!chip("A–Z"), true);
    const before = [...d.querySelectorAll(".sheet .list .row")].length;
    click(chip("Status"));
    const st = [...d.querySelectorAll(".sheet .list .row")];
    check("los movimientos de estado ya se pueden ver", st.length > 0, true);
    check("y son todos status",
       st.every(r => /Status/.test(r.textContent)), true);
    check("distinto de lo que habia sin filtrar", st.length !== before, true);
  });

  /* "en el filtro de tipo esta el operador logico and y or, pero falta algo
     que diga no, por ejemplo, si pongo en move trick room, pero en type
     quiero colocar que no me muestre ningun pokemon de tipo psyquico"

     Lo construi primero en el picker de MOVES, que es otra pantalla: alli un
     chip de tipo significa "un movimiento Psiquico", no "un Pokemon
     Psiquico". El lo busco donde lo pidio y no estaba. */
  describe("el operador NO, en el filtro de tipo", () => {
    w.closeSheet();
    w.FIND.moves = ["Trick Room"]; w.FIND.types = []; w.FIND.notTypes = [];
    w.findRun();
    const nm = () => [...d.querySelectorAll("#findOut .row .rname")]
      .map(n => n.firstChild.textContent.trim());
    const isPsy = n => (w.byName[n].types || []).indexOf("Psychic") >= 0;
    const withTR = nm();
    check("Trick Room devuelve un monton", withTR.length > 30, true);
    check("y muchos son Psychic", withTR.filter(isPsy).length > 10, true);
    w.FIND.notTypes = ["Psychic"];
    w.findRun();
    const after = nm();
    check("al descartarlo quedan menos", after.length < withTR.length, true);
    check("y ninguno es Psychic", after.filter(isPsy).length, 0);
    check("los que no lo eran siguen ahi",
       after.length, withTR.filter(n => !isPsy(n)).length);
    /* y se ve como filtro, no solo dentro de la hoja */
    w.findDraw();
    check("el chip lo dice arriba",
       [...d.querySelectorAll("#findChips .tog")].map(t => t.textContent)
         .indexOf("not Psychic") >= 0, true);
    d.getElementById("findClear").click();
    check("y Clear lo suelta", w.FIND.notTypes.length, 0);
  });

  /* "seria bueno agregar en el buscador algo que pueda buscar pokemon
     por simple nombre, cuando quiero ver la ficha rapidamente de uno
     sin tener que filtrar" (2026-09-19) */
  describe("el buscador por nombre", () => {
    w.FIND.moves = [];
    const box = d.getElementById("findName");
    const type = v => { box.value = v;
      box.dispatchEvent(new w.Event("input")); };
    const named = () => [...d.querySelectorAll("#findOut .row .rname")]
      .map(n => n.firstChild.textContent.trim());
    type("garchomp");
    check("por nombre", named().join(","), "Garchomp");
    type("445");
    check("por numero de dex", named().join(","), "Garchomp");
    /* y por el nombre de la Mega, que ya no tiene fila propia */
    type("mega absol");
    check("por el nombre de su Mega", named().join(","), "Absol");
    type("zzzz");
    check("lo que no existe no devuelve nada", named().length, 0);
    type("");
  });

  await describe("in my box, ahora en dos", async () => {
    check("hay boton In Champions", !!d.getElementById("findInChamp"), true);
    check("hay boton In HOME", !!d.getElementById("findInHome"), true);
    click(d.getElementById("findInChamp"));
    await idle();
    const champ = results().map(r => r.textContent);
    /* three FORMS, one species: Garchomp and its two Megas. Owning the
       base row is what puts the Mega line in reach, so the search shows
       the line, not just the row. */
    check("solo la linea de Garchomp",
       champ.length && champ.every(t => /Garchomp/.test(t)), true);
    /* UNA CARD POR POKEMON, no una por forma. Las Megas ya no son filas
       propias: viven en la de su base y solo aportan lo que CAMBIA
       (2026-09-19: "en el buscador se me llena de pokemones mega...
       solo necesito saber las cosas que cambian"). Garchomp tiene dos
       Megas, asi que la card lleva dos chips. */
    check("una sola card, no tres", champ.length, 1);
    /* UNA CAJA DE HABILIDAD POR MEGA, que es donde viven ahora: los
       chips "MEGA" / "MEGA Z" del nombre se quitaron el 2026-09-20
       ("los tags MEGA, MEGA Z, Mega X, Mega Y ya no sirven, porque
       ahora los sprites representan visualmente las megas"). La card
       sigue diciendo que hay dos, en tres sitios a la vez: el sprite,
       la caja de habilidad y el delta de cada stat. */
    check("una caja de habilidad por cada Mega de la linea",
       [...results()[0].querySelectorAll(".cardline .lbl")]
         .filter(t => t.textContent.startsWith("Mega")).length, 2);
    check("y un sprite rotulado por cada una",
       [...results()[0].querySelectorAll(".megapickey")]
         .filter(t => !/base/.test(t.textContent)).length, 2);
    check("sin chips de mega en el nombre",
       [...results()[0].querySelectorAll(".rname .tag")]
         .filter(t => /^mega/i.test(t.textContent)).length, 0);
    click(d.getElementById("findInChamp"));
    click(d.getElementById("findInHome"));
    await idle();
    const home = results().map(r => r.textContent);
    check("solo la linea de Dragonite",
       home.length && home.every(t => /Dragonite/.test(t)), true);
    check("una sola card tambien", home.length, 1);
    check("y su Mega sigue estando en la card",
       /mega/i.test(home[0]), true);
    click(d.getElementById("findInChamp"));
    await idle();
    check("los dos a la vez = cualquiera de las dos cajas",
       results().length, 2);
  });
  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
