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

const row = (id, name, location, origin) => ({user_id:UID, id, name, location,
  status:"permanent", origin, note:"", ord:0, updated_at:"2026-09-10",
  shiny:false, trained:true});
const ROWS = [row("garchomp","Garchomp","champions","champions"),
              row("dragonite","Dragonite","home","home")];

const body = require("./harness.js").page(ROOT);
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)};
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:[],error:null});},
   upsert:function(){return Promise.resolve({error:null});},
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
const sheetChip = t => [...d.querySelectorAll(".sheet .tog")]
  .find(b => b.textContent.trim() === t);
const sheetRows = () => [...d.querySelectorAll(".sheet .list .row")];
const results = () => [...d.querySelectorAll("#findOut .row")];

setTimeout(() => {
  w.go("find");

  console.log("\n  añadir un movimiento: los mismos controles que el builder");
  click(d.getElementById("findAddMove"));
  setTimeout(() => {
    ["BP × acc", "A–Z", "PP", "Type"].forEach(function(t){
      ok("orden: " + t, !!sheetChip(t), true);
    });
    ["Physical", "Special", "Status", "Spread", "Hits ally", "Priority"]
      .forEach(function(t){ ok("filtro: " + t, !!sheetChip(t), true); });
    const countLine = () => [...d.querySelectorAll(".sheet .sub")]
      .map(x => x.textContent).find(t => /abilities$|moves$| of \d+ moves/.test(t)) || "";
    click(sheetChip("Status"));
    const statusOnly = sheetRows();
    ok("filtra a status", statusOnly.every(r => /Status/.test(r.textContent)), true);
    /* both lists cap at 80 rows, so the COUNT is what says it filtered */
    ok("y el contador lo dice", / of \d+ moves/.test(countLine()), true);
    click(sheetChip("Ground"));
    ok("acumula tipo + categoria",
       sheetRows().every(r => /Ground/.test(r.querySelector(".t").textContent) &&
                              /Status/.test(r.textContent)), true);
    const pickName = sheetRows()[0].querySelector(".rname").textContent
      .replace(/priority \+\d| ?spread| ?hits ally/g, "").trim();
    click(sheetRows()[0]);

    setTimeout(() => {
      ok("el filtro queda puesto",
         /learns /.test(d.getElementById("findChips").textContent), true);
      click(d.getElementById("findClear"));

      /* the app could show every number about a move and not one word about
         what it does, so "which of these crits" had no answer on the phone */
      console.log("\n  buscar un movimiento por su descripcion");
      click(d.getElementById("findAddMove"));
      setTimeout(() => {
        var inp = d.querySelector(".sheet input[type=text]");
        inp.value = "critical";
        inp.dispatchEvent(new w.Event("input", {bubbles:true}));
        var rr = sheetRows();
        ok("critical encuentra movimientos", rr.length > 0, true);
        ok("y ninguno se llama asi",
           rr.every(r => !/critical/i.test(
             r.querySelector(".rname").textContent)), true);
        ok("porque el texto esta en la fila",
           rr.every(r => /Critical/i.test(r.textContent)), true);
        inp.value = "burn";
        inp.dispatchEvent(new w.Event("input", {bubbles:true}));
        ok("burn tambien", sheetRows().length > 0, true);
        /* Serebii says "Gives the target the Taunted status" and stops, so the
           app was showing a name for a mechanic instead of the mechanic.
           build_text_facts.py takes pokebase's line for those. */
        inp.value = "taunt";
        inp.dispatchEvent(new w.Event("input", {bubbles:true}));
        const tt = sheetRows().find(r => /^PsychicTaunt|Taunt/.test(
          r.querySelector(".rname").textContent));
        ok("Taunt explica el mecanismo, no el nombre del estado",
           /three turns|3 turns/.test(tt.textContent), true);
        ok("y ningun movimiento se queda sin texto",
           w.CHAMP.MOVES.filter(m => !m[14]).length <= 1, true);
        w.closeSheet();
        click(d.getElementById("findClear"));
        afterText();
      }, 350);
    }, 400);
  }, 400);

  function afterText(){

      console.log("\n  habilidades por categoria");
      click(d.getElementById("findAddAbility"));
      setTimeout(() => {
        const cls = w.CHAMP.AB_CLASS, lbl = w.CHAMP.AB_CLASS_LABEL;
        ok("las 215 estan clasificadas", Object.keys(cls).length, 215);
        const offChip = [...d.querySelectorAll(".sheet .tog")]
          .find(b => b.textContent.indexOf(lbl["moves-off"]) === 0);
        const defChip = [...d.querySelectorAll(".sheet .tog")]
          .find(b => b.textContent.indexOf(lbl["moves-def"]) === 0);
        ok("hay chip de 'cambia sus movimientos'", !!offChip, true);
        ok("hay chip de defensivas", !!defChip, true);
        ok("el chip trae el conteo", /· \d+$/.test(offChip.textContent), true);
        click(offChip);
        const names = sheetRows().map(r => r.querySelector(".rname")
          .childNodes[0].textContent);
        ok("solo salen las ofensivas",
           names.every(n => cls[n] === "moves-off"), true);
        ok("y son las de la tabla de reglas",
           names.every(n => w.AB_SET[n] && w.AB_SET[n].side === "off"), true);
        click(defChip);
        ok("dos chips suman (OR dentro del grupo)",
           sheetRows().map(r => r.querySelector(".rname").childNodes[0].textContent)
             .every(n => cls[n] === "moves-off" || cls[n] === "moves-def"), true);
        click(offChip); click(defChip);
        const weather = [...d.querySelectorAll(".sheet .tog")]
          .find(b => b.textContent.indexOf(lbl.weather) === 0);
        ok("hay chip de weather", !!weather, true);
        click(weather);
        ok("y filtra a weather",
           sheetRows().map(r => r.querySelector(".rname").childNodes[0].textContent)
             .every(n => cls[n] === "weather"), true);
        click(d.querySelector(".sheet .fbtn") || d.body);
        w.closeSheet();

        console.log("\n  tipos: Y frente a O");
        click(d.getElementById("findAddType"));
        setTimeout(function(){
          var tchip = function(t){
            return [...d.querySelectorAll(".sheet .tog")]
              .find(function(b){ return b.textContent.trim() === t; });
          };
          click(tchip("Rock")); click(tchip("Steel"));
          w.closeSheet();
          var andHits = results().length;
          ok("Roca Y Acero: solo los dobles",
             results().every(function(r){ return /Steel|Rock/.test(r.textContent); }),
             true);
          /* the mode chip lives in the filter bar, so it can be flipped
             without reopening the sheet */
          var mode = [...d.querySelectorAll("#findChips .tog")]
            .find(function(b){ return /of those types/.test(b.textContent); });
          ok("hay chip de modo", !!mode, true);
          click(mode);
          ok("Roca O Acero: son mas", results().length > andHits, true);
          ok("y el chip lo dice",
             /any of those types/.test(d.getElementById("findChips").textContent),
             true);
          click(d.getElementById("findAddType"));
          setTimeout(function(){
            var g = [...d.querySelectorAll(".sheet .tog")]
              .find(function(b){ return b.textContent.trim() === "Ground"; });
            click(g); w.closeSheet();
            ok("tres tipos en O siguen dando resultados", results().length > 0, true);
            var mode2 = [...d.querySelectorAll("#findChips .tog")]
              .find(function(b){ return /of those types/.test(b.textContent); });
            click(mode2);
            ok("en Y con tres tipos no hay nada", results().length, 0);
            ok("y avisa por que",
               /three types/.test(d.getElementById("findOut").textContent), true);
            click(d.getElementById("findClear"));
            pokemonSheet();
          }, 300);
        }, 300);
      }, 400);
  }

  /* the sheet you land on after tapping a result. Two things the player
     found: the six stats printed with no label under them, because
     STAT_LABEL was declared twice and the array won at runtime; and the
     movepool was the top 40 by base power with every status move dropped, so
     Protect was not in a Pokemon's own sheet at all. */
  function pokemonSheet(){
    console.log("\n  la ficha del Pokemon");
    click([...d.querySelectorAll("#findOut .row")][0]);
    setTimeout(function(){
      const sl = d.querySelector(".sheet .statline");
      ok("hay bloque de stats", !!sl, true);
      ["HP", "Atk", "Def", "SpA", "SpD", "Spe"].forEach(function(k){
        ok("dice cual es " + k, sl.textContent.indexOf(k) >= 0, true);
      });
      ok("y nada sale como undefined",
         !/undefined/.test(sl.textContent), true);
      ok("la fila del buscador tambien va etiquetada",
         /HP.*Atk.*Spe/.test(
           d.querySelectorAll("#findOut .row")[0].textContent), true);

      const chip = t => [...d.querySelectorAll(".sheet .tog")]
        .find(b => b.textContent.trim() === t);
      ok("el movepool trae los filtros", !!chip("Physical"), true);
      ok("y el orden", !!chip("A–Z"), true);
      const before = [...d.querySelectorAll(".sheet .list .row")].length;
      click(chip("Status"));
      const st = [...d.querySelectorAll(".sheet .list .row")];
      ok("los movimientos de estado ya se pueden ver", st.length > 0, true);
      ok("y son todos status",
         st.every(r => /Status/.test(r.textContent)), true);
      ok("distinto de lo que habia sin filtrar", st.length !== before, true);
      w.closeSheet();
      afterTypes();
    }, 400);
  }

  function afterTypes(){
    /* --------------------------- el operador NO, en el filtro de TIPO --- */
    /* "en el filtro de tipo esta el operador logico and y or, pero falta algo
       que diga no, por ejemplo, si pongo en move trick room, pero en type
       quiero colocar que no me muestre ningun pokemon de tipo psyquico"

       Lo construi primero en el picker de MOVES, que es otra pantalla: alli un
       chip de tipo significa "un movimiento Psiquico", no "un Pokemon
       Psiquico". El lo busco donde lo pidio y no estaba. */
    console.log("\n  el operador NO, en el filtro de tipo");
    w.FIND.moves = ["Trick Room"]; w.FIND.types = []; w.FIND.notTypes = [];
    w.findRun();
    const nm = () => [...d.querySelectorAll("#findOut .row .rname")]
      .map(n => n.firstChild.textContent.trim());
    const isPsy = n => (w.byName[n].types || []).indexOf("Psychic") >= 0;
    const withTR = nm();
    ok("Trick Room devuelve un monton", withTR.length > 30, true);
    ok("y muchos son Psychic", withTR.filter(isPsy).length > 10, true);
    w.FIND.notTypes = ["Psychic"];
    w.findRun();
    const after = nm();
    ok("al descartarlo quedan menos", after.length < withTR.length, true);
    ok("y ninguno es Psychic", after.filter(isPsy).length, 0);
    ok("los que no lo eran siguen ahi",
       after.length, withTR.filter(n => !isPsy(n)).length);
    /* y se ve como filtro, no solo dentro de la hoja */
    w.findDraw();
    ok("el chip lo dice arriba",
       [...d.querySelectorAll("#findChips .tog")].map(t => t.textContent)
         .indexOf("not Psychic") >= 0, true);
    d.getElementById("findClear").click();
    ok("y Clear lo suelta", w.FIND.notTypes.length, 0);
    w.FIND.moves = [];

        /* ------------------------ buscar por nombre, sin filtrar ----- */
        /* "seria bueno agregar en el buscador algo que pueda buscar pokemon
           por simple nombre, cuando quiero ver la ficha rapidamente de uno
           sin tener que filtrar" (2026-09-19) */
        console.log("\n  el buscador por nombre");
        const box = d.getElementById("findName");
        const type = v => { box.value = v;
          box.dispatchEvent(new w.Event("input")); };
        const named = () => [...d.querySelectorAll("#findOut .row .rname")]
          .map(n => n.firstChild.textContent.trim());
        type("garchomp");
        ok("por nombre", named().join(","), "Garchomp");
        type("445");
        ok("por numero de dex", named().join(","), "Garchomp");
        /* y por el nombre de la Mega, que ya no tiene fila propia */
        type("mega absol");
        ok("por el nombre de su Mega", named().join(","), "Absol");
        type("zzzz");
        ok("lo que no existe no devuelve nada", named().length, 0);
        type("");


        console.log("\n  in my box, ahora en dos");
        ok("hay boton In Champions", !!d.getElementById("findInChamp"), true);
        ok("hay boton In HOME", !!d.getElementById("findInHome"), true);
        click(d.getElementById("findInChamp"));
        setTimeout(() => {
          const champ = results().map(r => r.textContent);
          /* three FORMS, one species: Garchomp and its two Megas. Owning the
             base row is what puts the Mega line in reach, so the search shows
             the line, not just the row. */
          ok("solo la linea de Garchomp",
             champ.length && champ.every(t => /Garchomp/.test(t)), true);
          /* UNA CARD POR POKEMON, no una por forma. Las Megas ya no son filas
             propias: viven en la de su base y solo aportan lo que CAMBIA
             (2026-09-19: "en el buscador se me llena de pokemones mega...
             solo necesito saber las cosas que cambian"). Garchomp tiene dos
             Megas, asi que la card lleva dos chips. */
          ok("una sola card, no tres", champ.length, 1);
          /* UNA CAJA DE HABILIDAD POR MEGA, que es donde viven ahora: los
             chips "MEGA" / "MEGA Z" del nombre se quitaron el 2026-09-20
             ("los tags MEGA, MEGA Z, Mega X, Mega Y ya no sirven, porque
             ahora los sprites representan visualmente las megas"). La card
             sigue diciendo que hay dos, en tres sitios a la vez: el sprite,
             la caja de habilidad y el delta de cada stat. */
          ok("una caja de habilidad por cada Mega de la linea",
             [...results()[0].querySelectorAll(".cardline .lbl")]
               .filter(t => /^Mega/.test(t.textContent)).length, 2);
          ok("y un sprite rotulado por cada una",
             [...results()[0].querySelectorAll(".megapickey")]
               .filter(t => !/base/.test(t.textContent)).length, 2);
          ok("sin chips de mega en el nombre",
             [...results()[0].querySelectorAll(".rname .tag")]
               .filter(t => /^mega/i.test(t.textContent)).length, 0);
          click(d.getElementById("findInChamp"));
          click(d.getElementById("findInHome"));
          setTimeout(() => {
            const home = results().map(r => r.textContent);
            ok("solo la linea de Dragonite",
               home.length && home.every(t => /Dragonite/.test(t)), true);
            ok("una sola card tambien", home.length, 1);
            ok("y su Mega sigue estando en la card",
               /mega/i.test(home[0]), true);
            click(d.getElementById("findInChamp"));
            setTimeout(() => {
              ok("los dos a la vez = cualquiera de las dos cajas",
                 results().length, 2);
              console.log("\n  ERRORES JS: " +
                          (errs.length ? errs.join(" | ") : "ninguno"));
              console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
              process.exit(bad || errs.length ? 1 : 0);
            }, 250);
          }, 250);
        }, 250);
  }
}, 1200);
