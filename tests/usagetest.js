/* What this Pokemon's own players run, in the build editor (player,
   2026-09-15).

   Four things were wrong at once and they are all checked here:

     - pokebase paginates every per-Pokemon section CLIENT-SIDE, out of props
       the server already sent, so the rendered HTML only ever held page 1 and
       the app knew five moves of nineteen. "TIENE PAGES!"
     - the picker badged only the moves it happened to have, and a blank row
       reads as "no data" when it means "nobody brought it". Every move now
       carries a percentage, and the sort defaults to it.
     - a nature dropdown of 25 in alphabetical order does not answer "what do
       people pick"; abilities the same.
     - the move percentage is a share of move SLOTS, not of sets, so nothing
       in that column can pass ~25 and a fixed "50% is popular" threshold
       would paint every move in the game as fringe.

   Rillaboom is the fixture because it is the page he opened: 19 moves over
   four pages, 26 spreads over six, and no Season block at all - the case that
   proved the old parser had been mixing two different measurements.
*/
const { describe } = require("node:test");
const { check, open, idle } = require("./harness.js");
const UID = "u1";

const ROWS = [{user_id:UID, id:"rillaboom", name:"Rillaboom",
  location:"champions", status:"permanent", origin:"champions", note:"",
  ord:0, updated_at:"2026-09-15", shiny:false, trained:true}];
const BUILDS = [{user_id:UID, id:"rillaboom", pokemon:"Rillaboom", mega:null,
  ability:"Grassy Surge", mega_ability:null, nature:"Adamant",
  stat_points:{hp:32,atk:32,def:0,spa:0,spd:2,spe:0},
  moves:["Fake Out",null,null,null], role:"", rationale:"", extra:{},
  updated_at:"2026-09-15"}];

const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;
const click = n => n.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
const sum = a => a.reduce((n, r) => n + r[1], 0);
const foot = t => [...d.querySelectorAll("#sheetFoot .btn")]
  .find(b => b.textContent.trim() === t);
const slotWith = re => [...d.querySelectorAll(".slot")].find(s => re.test(s.textContent));
/* The usage chip is its OWN element, and has to be read as one. Taken off the
   row's text it runs into the tag before it - "priority +4" followed by "2.2%"
   reads as "42.2%" - which is a measurement error in the test, not in the app. */
const usageOf = r => {
  const t = [...r.querySelectorAll(".rname .tag")]
    .find(x => /^\d+(\.\d+)?%$/.test(x.textContent.trim()));
  return t ? Number(t.textContent.replace("%", "")) : null;
};
/* EVERY NUMBER ON A CARD IS A CELL: a <b> with the value and a <span> with the
   label under it. It used to be one prose line of ".fact" spans, read by
   matching the text - so when the stats became a table the selector found
   nothing and the test died on a null instead of failing an assertion. Reading
   the label and the value as the two elements they are cannot go stale that way. */
const cells = r => [...r.querySelectorAll(".statline > div, .cardline > div")];
/* ".lbl", not the first span: a cell whose value is a LIST holds one
   unbreakable span per item inside its <b>, so the first span in the cell is
   an ability name and not the caption. */
const cellOf = (r, lab) => cells(r).find(c =>
  (c.querySelector("span.lbl") || c.querySelector("span"))
    .textContent.trim() === lab);
/* Every number the cell draws: the base and what each Mega moves it to. BST
   writes them as "465 -> 565" and the stats as separate lines, so they are
   read from the whole cell, not from one label. */
const cellNums = (r, lab) => (cellOf(r, lab).textContent.match(/\d+/g) || []).map(Number);
/* WHAT THE POKEMON REACHES, not what its base row says: the whole Mega line
   decides the order (player, 2026-09-19: "absol, garchomp y lucario deberian
   aparecer primero en el filtro de speed de mayor a menor"). Descending sorts
   on the highest number of the line... */
const reachOf = (r, lab) => {
  const ns = cellNums(r, lab);
  return ns.length ? Math.max(...ns) : 0;
};
/* ...and ascending, which is the Trick Room list, on the LOWEST: a Mega that
   raises Speed does not help anyone go slow. */
const lowOf = (r, lab) => {
  const ns = cellNums(r, lab);
  return ns.length ? Math.min(...ns) : 0;
};
const shareOf = r => Number(cellOf(r, "of teams")
  .querySelector("b").textContent.replace("%", ""));

/* The open sheet's chips and rows. */
const sheetChip = t => [...d.querySelectorAll(".sheet .tog")]
  .find(b => b.textContent.trim() === t);
const sheetRows = () => [...d.querySelectorAll(".sheet .list .row")];

(async () => {
  await idle();
  describe("el asset trae todas las paginas, no la primera", () => {
    const S = w.CHAMP_SPLITS || {};
    check("regulacion sellada en el asset", S.r, "M-C");
    const rilla = (S.p || {})["Rillaboom"] || {};
    check("moves de Rillaboom (4 paginas de 5)", rilla.m.length >= 19, true);
    check("spreads de Rillaboom (6 paginas)", rilla.s.length > 5, true);
    check("items de Rillaboom (4 paginas)", rilla.i.length >= 19, true);
    check("teammates con % y no solo orden", rilla.t[0].length === 2, true);
    check("y ese % es un numero", typeof rilla.t[0][1], "number");

    /* The measurement that decides how the chip may be coloured. If pokebase
       ever switches this column back to a share of SETS it sums to ~400 and
       every number in the app silently changes meaning. */
    check("moves suman ~100 (share de SLOTS)", Math.abs(sum(rilla.m) - 100) < 12, true);
    check("items suman ~100 (share de SETS)", Math.abs(sum(rilla.i) - 100) < 12, true);
    check("ningun move pasa de 30%", rilla.m.every(r => r[1] <= 30), true);
  });

  /* UN HECHO, UN CHIP, Y EL CHIP DICE DE QUE. Black Glasses decia x1.2 tres
     veces - la sonda fisica, la especial y la frase de Smogon, las tres lo
     mismo - y Life Orb se contradecia a si mismo con x1.2998 dos veces y 1.3x
     una. Y un chip que pone "1/3", o "Double", no nombra ningun sujeto.
     scripts/effect_chips.py decide todo eso; esto comprueba el resultado. */
  describe("un hecho, un chip, y el chip dice de que", () => {
    const E = w.CHAMP.EFFECTS || {};
    const txt = n => (E[n].c || []).map(p => p[0]);
    const twice = Object.keys(E).filter(n => {
      const t = txt(n);
      return new Set(t).size !== t.length;
    });
    check("ninguna entrada repite un chip", twice.join(", "), "");
    const units = Object.keys(E).filter(
      n => txt(n).some(t => / stages stages| turns turns|max HP max HP/.test(t)));
    check("ninguna unidad se escribe dos veces", units.join(", "), "");
    const bare = Object.keys(E).filter(
      n => txt(n).some(t => /^(half|double|third|quarter)$/i.test(t)));
    check("ningun chip es solo una palabra sin numero", bare.join(", "), "");

    check("...y 1.2998 ya no aparece en ningun sitio",
       JSON.stringify(E).indexOf("1.2998") >= 0, false);
    /* REGLA 6 (player, 2026-09-27): "sitrus berry dice que al alcanzar 1/2 de
       hp, te recupera 1/4 de hp y tiene dos tags con 1/2 hp y 1/4 hp, que no
       dicen absolutamente nada... se debe aplicar a todos los items y
       abilities." La descripcion es el texto COMPLETO de Smogon ahora, y dice
       cada numero - asi que un chip solo existe si dice algo que ella no. Y la
       frase corta de Smogon debajo era la misma descripcion otra vez. */
    const ABIL = w.CHAMP.ABIL, ITEMS = w.CHAMP.ITEMS;
    const itemText = n => ((ITEMS.find(r => r[0] === n) || [])[3]) || "";
    const shown = n => ABIL[n] || itemText(n);
    check("Sitrus Berry sin chips que repiten su frase", E["Sitrus Berry"] ? txt("Sitrus Berry").length : 0, 0);
    check("...y su frase dice las dos cifras",
       /1\/4 max HP when at 1\/2 max HP or less/.test(itemText("Sitrus Berry")), true);
    check("Life Orb tampoco repite 1.3 y 1/10", E["Life Orb"] ? txt("Life Orb").length : 0, 0);
    check("ninguna descripcion aparece dos veces (sin resumen debajo)",
       Object.keys(E).filter(n => shown(n) && E[n].desc).join(", "), "");
    check("ningun chip repite un numero de su descripcion",
       Object.keys(E).filter(n => shown(n) && txt(n).length).join(", "), "");
    check("Intimidate dice que vuelve a activarse al megaevolucionar",
       /Mega Evolving into it fires it again/.test(ABIL["Intimidate"]), true);
    check("Drizzle dice cuantos turnos", /for 5 turns/.test(ABIL["Drizzle"]), true);
  });
  await describe("los desplegables se ordenan por uso", async () => {
    w.go("builds");
    click(d.querySelectorAll("#listBuilds .row")[0]);
    await idle();
    const sel = lab => [...d.querySelectorAll(".field")]
      .find(f => (f.querySelector("label") || {}).textContent &&
                 new RegExp(lab).test(f.querySelector("label").textContent))
      .querySelector("select");
    const nat = sel("^Nature");
    check("la primera naturaleza es la mas usada",
       /^Adamant/.test(nat.options[0].text), true);
    check("y lleva su %", /·\s+\d/.test(nat.options[0].text), true);
    const marked = [...nat.options].filter(o => /·\s+\d/.test(o.text));
    check("solo las que pokebase lista van marcadas",
       marked.length > 0 && marked.length < nat.options.length, true);
    check("las marcadas van primero y en orden",
       marked.every((o, i) => o.index === i), true);
    const abl = sel("^Ability");
    check("la ability mas usada encabeza",
       /^Grassy Surge/.test(abl.options[0].text), true);

    /* ------------------------------------------------ spreads y teammates */
    const txt = d.getElementById("v-buildedit").textContent;
    check("hay un bloque de referencia", /What its players run/.test(txt), true);
    check("y dice que no rellena nada",
       /nothing here fills anything in/i.test(txt), true);
    /* The rule he had to state twice: an indicator sits beside a choice and
       changes nothing. A spread that can be CLICKED is an autobuilder. */
    check("los spreads no son botones",
       [...d.querySelectorAll("#v-buildedit .field")]
         .filter(f => /SP spreads/.test((f.querySelector("label")||{}).textContent||""))
         .every(f => f.querySelectorAll("button").length === 0), true);
    check("y aparece con quien se trae", /Brought alongside/.test(txt), true);
    check("Sneasler entre ellos", /Sneasler/.test(txt), true);
  });
  await describe("el picker marca TODOS los movimientos", async () => {
    click(slotWith(/Fake Out/));
    await idle();
    check("existe el orden por uso", !!sheetChip("Usage %"), true);
    check("y es el que viene puesto",
       sheetChip("Usage %").getAttribute("aria-pressed"), "true");
    const rr = sheetRows();
    check("hay filas", rr.length > 10, true);
    check("todas llevan %", rr.every(r => usageOf(r) !== null), true);
    const ps = rr.map(usageOf);
    check("y van de mayor a menor",
       ps.every((v, i) => i === 0 || ps[i - 1] >= v), true);
    check("el primero es el mas usado", ps[0] >= 20, true);
    check("y la cola llega a 0%", ps[ps.length - 1], 0);
  });

  describe("tag de multi-golpe", () => {
    const inp = d.querySelector(".sheet input[type=text]");
    inp.value = "bullet seed";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const bs = sheetRows()[0];
    check("Bullet Seed dice que golpea varias veces",
       /2–5 hits/.test(bs.querySelector(".rname").textContent), true);
    check("y el total esta en el title",
       /quoted at 3 hits = 75 BP/.test(
         bs.querySelector(".rname .tag.ok").title), true);
    check("y nombra Skill Link",
       /Skill Link forces 5 = 125 BP/.test(
         bs.querySelector(".rname .tag.ok").title), true);
  });

  await describe("Clear slot y Back cierran la ventana", async () => {
    check("estan los dos", !!foot("Clear slot") && !!foot("Back"), true);
    click(foot("Back"));
    await idle();
    check("Back cierra el sheet", d.getElementById("scrim").hidden, true);
    check("y no toca el movimiento",
       /Fake Out/.test(d.getElementById("v-buildedit").textContent), true);
    click(slotWith(/Fake Out/));
    await idle();
    click(foot("Clear slot"));
    await idle();
    check("Clear slot cierra el sheet", d.getElementById("scrim").hidden, true);
    check("y vacia la ranura",
       /Empty slot 1/.test(d.getElementById("v-buildedit").textContent), true);
  });
  await describe("una sola tabla, con filtros y orden por stat", async () => {
    /* This started as a separate "Tiers" block with a tab per stat. The player
       replaced the idea with a better one: Find already filters by type,
       ability and move, so a tier list is just this list sorted by one column
       - and keeping it apart meant a speed tier could never also be "and it
       learns Fake Out and I own it". The two fixed Speed boxes are gone. */
    w.go("find");
    await idle();
    /* The active tab's label carries an arrow, so an exact match would
       stop finding it the moment it is selected. */
    const sortTab = t => [...d.querySelectorAll("#findSort .tog")]
      .find(b => b.textContent.trim().replace(/[↑↓]/, "").trim() === t);
    ["Dex #","BST","HP","Atk","Def","SpA","SpD","Spe"].forEach(t =>
      check("orden por " + t, !!sortTab(t), true));
    check("las cajas fijas de Speed ya no existen",
       !d.getElementById("findSpeMin") && !d.getElementById("findSpeMax") &&
       !d.getElementById("findBst"), true);
    /* And no min/max either: the player cut that idea the same hour. An
       order answers "who is slowest" without needing a threshold guessed
       in advance, which is what the Trick Room box was asking for. */
    check("ni minimos ni maximos", !d.getElementById("findAddStat"), true);
    check("BST es el orden por defecto",
       sortTab("BST").getAttribute("aria-pressed"), "true");

    const rows = () => [...d.querySelectorAll("#findOut .row")];
    const vr = rows().map(r => reachOf(r, "BST"));
    check("hay filas", vr.length > 20, true);
    check("ordenado por BST", vr.every((x,i) => i===0 || vr[i-1] >= x), true);

    /* NOTHING IS HIDDEN. Ranking by one stat must not drop the other five -
       an Attack list is read with the Speed beside it. The ranked one is
       marked instead. */
    click(sortTab("Spe"));
    const sp = rows().map(r => reachOf(r, "Spe"));
    check("cambiar a Spe reordena la misma tabla",
       sp.every((x,i) => i===0 || sp[i-1] >= x), true);
    check("y las seis stats siguen ahi",
       ["HP","Atk","Def","SpA","SpD","Spe"].every(k => !!cellOf(rows()[0], k)),
       true);
    check("la rankeada va marcada",
       rows()[0].querySelector(".statline .on span").textContent.trim(), "Spe");
    /* BST AND LA HABILIDAD TAMBIEN SON CUADROS. The player asked for it so
       the card speaks one visual language ("seria bonito que bst tambien
       tuviera un cuadro como los stats... y tambien para la habilidad"), and
       a cell is the only shape this file can assert without matching prose. */
    check("BST tiene su propio cuadro", !!cellOf(rows()[0], "BST"), true);
    /* "Possible ability", not "Ability": a dex row lists what this
       Pokemon CAN have, while a build row shows the one it runs. The
       two labels were the same word on cards that mean different
       things, and the search shares its card with the box now. */
    check("y la habilidad tambien",
       !!cellOf(rows()[0], "Possible ability"), true);
    check("la habilidad dice algo",
       cellOf(rows()[0], "Possible ability").querySelector("b")
         .textContent.length > 2, true);
    /* SP and nature are the builder's business, not the list's. */
    check("sin SPs en el listado",
       /at 0 SP|max/.test(rows()[0].textContent), false);
    check("el encabezado dice por que ordena",
       /by Spe, highest first/.test(
         d.querySelector("#findOut .sub").textContent), true);
    check("y la pestana activa lleva la flecha",
       /↓/.test(sortTab("Spe").textContent), true);

    /* Tapping the active stat flips the direction - and ascending Speed IS
       the Trick Room list, which is why there is no "Speed at most" box. */
    click(sortTab("Spe"));
    const asc = rows().map(r => lowOf(r, "Spe"));
    check("tocarla de nuevo invierte el orden",
       asc.every((x,i) => i===0 || asc[i-1] <= x), true);
    check("y el encabezado lo dice",
       /by Spe, lowest first/.test(
         d.querySelector("#findOut .sub").textContent), true);
    check("con la flecha al reves",
       /↑/.test(sortTab("Spe").textContent), true);
    click(sortTab("Spe"));   // back to descending

    /* The M-C scope toggle is GONE. It was added, renamed because he could
       not tell what it meant, and then cut outright - "no me sirve en find,
       lo encuentro malo". The two box filters stay. */
    check("no hay filtro de M-C", !d.getElementById("findInMeta"), true);
    check("pero si los de las cajas",
       !!d.getElementById("findInChamp") && !!d.getElementById("findInHome"),
       true);
    click(sortTab("Atk"));
    click(d.getElementById("findClear"));
    check("Clear vuelve a BST",
       sortTab("BST").getAttribute("aria-pressed"), "true");
  });

  /* THE PODIUM. A result, not a rate - and a Mega is filed under the MEGA,
     resolved by the stone it held, because a teamlist records the BASE
     ability and so cannot tell you. The 2026 champion ran a Floette holding
     a Floettite and a Dragonite holding a Dragoninite; both were Megas. */
  await describe("medallas de Worlds, y el set con que se ganaron", async () => {
    const P = w.CHAMP.PODIUM || {};
    check("hay formas con podio", Object.keys(P).length > 20, true);
    /* FILED UNDER WHAT WAS REGISTERED. Of the 16,875 team slots pokedata
       publishes, zero are written as "Mega something" - the entrant is always
       the base form holding a stone, and that is who wears the medal. */
    check("nada se archiva como Mega",
       Object.keys(P).some(k => /^Mega /.test(k)), false);
    const champ = (P["Dragonite"] || []).find(
      e => e.y === 2026 && e.d === "masters" && e.r === 1);
    check("Dragonite gano el 2026 masters", !!champ, true);
    check("con su set completo",
       champ.it === "Dragoninite" && champ.ab === "Multiscale" &&
       champ.na === "Modest" && champ.mv.length === 4, true);
    /* and the stone says what it became, derived rather than deduced by hand */
    check("y la piedra dice en que mega evoluciona", champ.mg, "Mega Dragonite");
    check("y con que habilidad", !!champ.mgab, true);
    check("Floette tambien estaba en ese equipo",
       (P["Floette-Eternal"] || []).some(
         e => e.y === 2026 && e.d === "masters" && e.r === 1 &&
              e.mg === "Mega Floette"), true);
    check("ningun podio pasa del top 8",
       Object.values(P).every(v => v.every(e => e.r >= 1 && e.r <= 8)), true);
    /* 2023 split its divisions across two pokedata events; reading both gave
       Seniors and Juniors two podiums each */
    const dupes = Object.values(P).some(v => {
      const seen = {};
      return v.some(e => {
        const k = e.y + e.d + e.r + e.who;
        if (seen[k]) return true;
        seen[k] = 1; return false;
      });
    });
    check("sin entradas duplicadas (2023 va en dos eventos)", dupes, false);

    w.closeSheet();
    const dex = w.CHAMP.DEX.map(r => ({name:r[0], species:r[1], types:r[2],
      b:r[3], mega:!!r[4], ab:r[5], dex:r[6]||0}));
    w.findDetail(dex.find(x => x.name === "Dragonite"));
    await idle();
    check("la ficha lleva la medalla",
       /Worlds 2026 · 1st/.test(
         (d.querySelector(".sheet .tag.gold")||{}).textContent||""), true);
    const fold = [...d.querySelectorAll(".sheet .fold")]
      .find(b => /Worlds/.test(b.textContent));
    check("y un desplegable con los sets", !!fold, true);
    click(fold);
    const cards = [...d.querySelectorAll(".sheet .note")]
      .filter(n => /Worlds \d{4}/.test(n.textContent));
    check("que muestra item, ability, nature y moves",
       /Dragoninite/.test(cards[0].textContent) &&
       /Multiscale/.test(cards[0].textContent) &&
       /Modest/.test(cards[0].textContent) &&
       /Extreme Speed/.test(cards[0].textContent), true);
    check("y dice la division", /masters/.test(cards[0].textContent), true);
    check("y en que Mega evoluciona",
       /Mega Evolves into Mega Dragonite/.test(cards[0].textContent), true);
  });

  /* HISTORY, and it must keep saying so. A Worlds is played once under one
     regulation and frozen; 2026 was M-B. The three divisions are three
     metagames off one roster and must never be pooled - if an "All" tab ever
     appears here, that rule has been broken. */
  describe("Worlds: historia, por anio y por division", () => {
    w.closeSheet();
    const yr = t => [...d.querySelectorAll("#worldYear .tog")]
      .find(b => b.textContent.trim() === t);
    const dv = t => [...d.querySelectorAll("#worldDiv .tog")]
      .find(b => b.textContent.trim() === t);
    const rows = () => [...d.querySelectorAll("#worldOut .row")];
    check("hay pestana 2026", !!yr("2026"), true);
    check("y anios anteriores", !!yr("2024"), true);
    check("la ultima es la que viene puesta",
       yr("2026").getAttribute("aria-pressed"), "true");
    check("tres divisiones", !!dv("Masters") && !!dv("Seniors") && !!dv("Juniors"),
       true);
    check("y NO hay una que las mezcle",
       [...d.querySelectorAll("#worldDiv .tog")]
         .some(b => /all|todas/i.test(b.textContent)), false);
    const rr = rows();
    check("Masters 2026 trae filas", rr.length > 10, true);
    check("Kingambit encabeza", /Kingambit/.test(rr[0].textContent), true);
    /* The share and the count are two cells now, not one sentence - "24.6% ·
       97 of 394 teams" was prose in a ranking, which is the one place numbers
       have to be scannable down the column. */
    check("con su cuenta de equipos",
       /^\d+ \/ \d+$/.test(cellOf(rr[0], "brought it")
         .querySelector("b").textContent.trim()), true);
    const ps = rr.map(shareOf);
    check("de mayor a menor", ps.every((v, i) => i === 0 || ps[i - 1] >= v), true);
    click(dv("Juniors"));
    check("Juniors es otra lista", rows().map(shareOf)[0] !== ps[0] ||
       rows()[0].textContent !== rr[0].textContent, true);
    check("y el encabezado lo dice",
       /juniors/.test(d.querySelector("#worldOut .sub").textContent), true);
  });

  /* THE SPECIFICITY TRAP. The field rule guarded itself with a bare `:not()`
     chain, and `:not()` takes the specificity of its ARGUMENT - (0,4,1),
     heavier than any sane rule aimed at a field. Three rules lost to it in
     silence for as long as they had existed, and nothing about CSS says out
     loud that a rule never applied. Asserted here so it cannot come back. */
  await describe("los campos reciben el estilo que les escribieron", async () => {
    const cs = n => w.getComputedStyle(n);
    w.go("find");
    click(d.getElementById("findAddMove"));
    await idle();
    const si = d.querySelector(".sheet .search input");
    const svg = d.querySelector(".sheet .search svg");
    check("el texto arranca despues de la lupa",
       parseFloat(cs(si).paddingLeft) >= 34, true);
    check("y la lupa no se come el clic", cs(svg).pointerEvents, "none");
    w.closeSheet();
    const pass = d.getElementById("gatePass");
    check("el campo de contrasena deja sitio al ojito del navegador",
       parseFloat(cs(pass).paddingRight) >= 34, true);
    w.go("builds");
    click(d.querySelectorAll("#listBuilds .row")[0]);
    await idle();
    const num = d.querySelector(".sp .spnum");
    check("el numero de SP usa su propio padding", cs(num).padding, "6px 2px");
    const normal = cs(num).color;
    num.closest(".sp").classList.add("over");
    const over = cs(num).color;
    check("y se pone rojo al pasarse del tope de 32", over !== normal, true);
    num.closest(".sp").classList.remove("over");
  });
  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
