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
const fs = require("fs");
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

const ROWS = [{user_id:UID, id:"rillaboom", name:"Rillaboom",
  location:"champions", status:"permanent", origin:"champions", note:"",
  ord:0, updated_at:"2026-09-15", shiny:false, trained:true}];
const BUILDS = [{user_id:UID, id:"rillaboom", pokemon:"Rillaboom", mega:null,
  ability:"Grassy Surge", mega_ability:null, nature:"Adamant",
  stat_points:{hp:32,atk:32,def:0,spa:0,spd:2,spe:0},
  moves:["Fake Out",null,null,null], role:"", rationale:"", extra:{},
  updated_at:"2026-09-15"}];

const body = require("./harness.js").page(ROOT);
const stub = `<script>
window.__ROWS=${JSON.stringify(ROWS)}; window.__BUILDS=${JSON.stringify(BUILDS)};
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:{user:{id:"u1",email:"t@t"}}}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(t){return{
   select:function(){return Promise.resolve({data:t==="box"?window.__ROWS:(t==="builds"?window.__BUILDS:[]),error:null});},
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

setTimeout(() => {
  /* ---------------------------------------------------- the asset itself */
  console.log("\n  el asset trae todas las paginas, no la primera");
  const S = w.CHAMP_SPLITS || {};
  ok("regulacion sellada en el asset", S.r, "M-C");
  const rilla = (S.p || {})["Rillaboom"] || {};
  ok("moves de Rillaboom (4 paginas de 5)", rilla.m.length >= 19, true);
  ok("spreads de Rillaboom (6 paginas)", rilla.s.length > 5, true);
  ok("items de Rillaboom (4 paginas)", rilla.i.length >= 19, true);
  ok("teammates con % y no solo orden", rilla.t[0].length === 2, true);
  ok("y ese % es un numero", typeof rilla.t[0][1], "number");

  /* The measurement that decides how the chip may be coloured. If pokebase
     ever switches this column back to a share of SETS it sums to ~400 and
     every number in the app silently changes meaning. */
  const sum = a => a.reduce((n, r) => n + r[1], 0);
  ok("moves suman ~100 (share de SLOTS)", Math.abs(sum(rilla.m) - 100) < 12, true);
  ok("items suman ~100 (share de SETS)", Math.abs(sum(rilla.i) - 100) < 12, true);
  ok("ningun move pasa de 30%", rilla.m.every(r => r[1] <= 30), true);

  /* ------------------------------------------------ chips sin duplicacion */
  console.log("\n  las unidades se escriben una sola vez");
  const E = w.CHAMP.EFFECTS || {};
  const dup = Object.keys(E).filter(n => (E[n].t || []).some(
    p => / stages stages| turns turns/.test(p[0])));
  ok("nada dice 'stages stages' ni 'turns turns'", dup.length, 0);
  ok("Intimidate en singular",
     (E["Intimidate"].t || [])[0][0], "1 stage");

  w.go("builds");
  click(d.querySelectorAll("#listBuilds .row")[0]);
  setTimeout(() => {
    /* --------------------------------------------- nature y ability por % */
    console.log("\n  los desplegables se ordenan por uso");
    const sel = lab => [...d.querySelectorAll(".field")]
      .find(f => (f.querySelector("label") || {}).textContent &&
                 new RegExp(lab).test(f.querySelector("label").textContent))
      .querySelector("select");
    const nat = sel("^Nature");
    ok("la primera naturaleza es la mas usada",
       /^Adamant/.test(nat.options[0].text), true);
    ok("y lleva su %", /·\s+\d/.test(nat.options[0].text), true);
    const marked = [...nat.options].filter(o => /·\s+\d/.test(o.text));
    ok("solo las que pokebase lista van marcadas",
       marked.length > 0 && marked.length < nat.options.length, true);
    ok("las marcadas van primero y en orden",
       marked.every((o, i) => o.index === i), true);
    const abl = sel("^Ability");
    ok("la ability mas usada encabeza",
       /^Grassy Surge/.test(abl.options[0].text), true);

    /* ------------------------------------------------ spreads y teammates */
    const txt = d.getElementById("v-buildedit").textContent;
    ok("hay un bloque de referencia", /What its players run/.test(txt), true);
    ok("y dice que no rellena nada",
       /nothing here fills anything in/i.test(txt), true);
    /* The rule he had to state twice: an indicator sits beside a choice and
       changes nothing. A spread that can be CLICKED is an autobuilder. */
    ok("los spreads no son botones",
       [...d.querySelectorAll("#v-buildedit .field")]
         .filter(f => /SP spreads/.test((f.querySelector("label")||{}).textContent||""))
         .every(f => f.querySelectorAll("button").length === 0), true);
    ok("y aparece con quien se trae", /Brought alongside/.test(txt), true);
    ok("Sneasler entre ellos", /Sneasler/.test(txt), true);

    /* ------------------------------------------------------ el move picker */
    const slot = [...d.querySelectorAll(".slot")]
      .find(s => /Fake Out/.test(s.textContent));
    click(slot);
    setTimeout(() => {
      console.log("\n  el picker marca TODOS los movimientos");
      const chip = t => [...d.querySelectorAll(".sheet .tog")]
        .find(b => b.textContent.trim() === t);
      const rows = () => [...d.querySelectorAll(".sheet .list .row")];
      /* The usage chip is its OWN element, and has to be read as one. Taken
         off the row's text it runs into the tag before it - "priority +4"
         followed by "2.2%" reads as "42.2%" - which is a measurement error in
         the test, not in the app. */
      const pct = r => {
        const t = [...r.querySelectorAll(".rname .tag")]
          .find(x => /^\d+(\.\d+)?%$/.test(x.textContent.trim()));
        return t ? Number(t.textContent.replace("%", "")) : null;
      };
      ok("existe el orden por uso", !!chip("Usage %"), true);
      ok("y es el que viene puesto",
         chip("Usage %").getAttribute("aria-pressed"), "true");
      const rr = rows();
      ok("hay filas", rr.length > 10, true);
      ok("todas llevan %", rr.every(r => pct(r) !== null), true);
      const ps = rr.map(pct);
      ok("y van de mayor a menor",
         ps.every((v, i) => i === 0 || ps[i - 1] >= v), true);
      ok("el primero es el mas usado", ps[0] >= 20, true);
      ok("y la cola llega a 0%", ps[ps.length - 1], 0);

      console.log("\n  tag de multi-golpe");
      const inp = d.querySelector(".sheet input[type=text]");
      inp.value = "bullet seed";
      inp.dispatchEvent(new w.Event("input", {bubbles:true}));
      const bs = rows()[0];
      ok("Bullet Seed dice que golpea varias veces",
         /2–5 hits/.test(bs.querySelector(".rname").textContent), true);
      ok("y el total esta en el title",
         /quoted at 3 hits = 75 BP/.test(
           bs.querySelector(".rname .tag.ok").title), true);
      ok("y nombra Skill Link",
         /Skill Link forces 5 = 125 BP/.test(
           bs.querySelector(".rname .tag.ok").title), true);

      /* ----------------------------------------- los botones del pie ---- */
      console.log("\n  Clear slot y Back cierran la ventana");
      const foot = t => [...d.querySelectorAll("#sheetFoot .btn")]
        .find(b => b.textContent.trim() === t);
      ok("estan los dos", !!foot("Clear slot") && !!foot("Back"), true);
      click(foot("Back"));
      setTimeout(() => {
        ok("Back cierra el sheet", d.getElementById("scrim").hidden, true);
        ok("y no toca el movimiento",
           /Fake Out/.test(d.getElementById("v-buildedit").textContent), true);
        click([...d.querySelectorAll(".slot")]
          .find(s => /Fake Out/.test(s.textContent)));
        setTimeout(() => {
          click(foot("Clear slot"));
          setTimeout(() => {
            ok("Clear slot cierra el sheet",
               d.getElementById("scrim").hidden, true);
            ok("y vacia la ranura",
               /Empty slot 1/.test(d.getElementById("v-buildedit").textContent),
               true);
            tiers();
          }, 200);
        }, 300);
      }, 200);
    }, 450);
  }, 400);

  function tiers(){
    console.log("\n  una sola tabla, con filtros y orden por stat");
    /* This started as a separate "Tiers" block with a tab per stat. The player
       replaced the idea with a better one: Find already filters by type,
       ability and move, so a tier list is just this list sorted by one column
       - and keeping it apart meant a speed tier could never also be "and it
       learns Fake Out and I own it". The two fixed Speed boxes are gone. */
    w.go("find");
    setTimeout(() => {
      const sortTab = t => [...d.querySelectorAll("#findSort .tog")]
        .find(b => b.textContent.trim() === t);
      ["Dex #","BST","HP","Atk","Def","SpA","SpD","Spe"].forEach(t =>
        ok("orden por " + t, !!sortTab(t), true));
      ok("las cajas fijas de Speed ya no existen",
         !d.getElementById("findSpeMin") && !d.getElementById("findSpeMax") &&
         !d.getElementById("findBst"), true);
      ok("y hay un + Stat en su lugar", !!d.getElementById("findAddStat"), true);
      ok("BST es el orden por defecto",
         sortTab("BST").getAttribute("aria-pressed"), "true");

      const rows = () => [...d.querySelectorAll("#findOut .row")];
      const bstOf = r => Number(
        r.querySelector(".mono").textContent.match(/BST (\d+)/)[1]);
      const v = rows().map(bstOf);
      ok("hay filas", v.length > 20, true);
      ok("ordenado por BST", v.every((x,i) => i===0 || v[i-1] >= x), true);
      ok("BST no trae fila de tier", !rows()[0].querySelector(".statrow"), true);

      click(sortTab("Spe"));
      const tierNum = r => {
        const sr = r.querySelector(".statrow");
        return sr ? Number(sr.textContent.match(/(\d+) base/)[1]) : null;
      };
      const sp = rows().map(tierNum);
      ok("cambiar a Spe reordena la misma tabla",
         sp.every((x,i) => i===0 || sp[i-1] >= x), true);
      ok("y cada fila trae los tres numeros",
         /at 0 SP/.test(rows()[0].textContent) &&
         /max/.test(rows()[0].textContent), true);
      ok("el encabezado dice por que ordena",
         /by Spe, highest first/.test(
           d.querySelector("#findOut .sub").textContent), true);

      /* The row count is capped at 120, so both lists would read 120 and the
         filter would look like it did nothing. The header carries the real
         number. */
      const matched = () => Number(
        d.querySelector("#findOut .sub").textContent.match(/^(\d+) of/)[1]);
      const all = matched();
      click(d.getElementById("findInMeta"));
      const meta = matched();
      ok("\"Brought to M-C\" acota la lista (" + meta + " de " + all + ")",
         meta > 0 && meta < all, true);
      ok("y lo dice en los chips",
         /brought to an M-C tournament/.test(
           d.getElementById("findChips").textContent), true);
      click(d.getElementById("findClear"));
      ok("Clear lo deja limpio",
         d.getElementById("findInMeta").getAttribute("aria-pressed"), "false");
      ok("y vuelve a BST",
         sortTab("BST").getAttribute("aria-pressed"), "true");
      worlds();
    }, 300);
  }

  /* HISTORY, and it must keep saying so. A Worlds is played once under one
     regulation and frozen; 2026 was M-B. The three divisions are three
     metagames off one roster and must never be pooled - if an "All" tab ever
     appears here, that rule has been broken. */
  function worlds(){
    console.log("\n  Worlds: historia, por anio y por division");
    const yr = t => [...d.querySelectorAll("#worldYear .tog")]
      .find(b => b.textContent.trim() === t);
    const dv = t => [...d.querySelectorAll("#worldDiv .tog")]
      .find(b => b.textContent.trim() === t);
    const rows = () => [...d.querySelectorAll("#worldOut .row")];
    ok("hay pestana 2026", !!yr("2026"), true);
    ok("y anios anteriores", !!yr("2024"), true);
    ok("la ultima es la que viene puesta",
       yr("2026").getAttribute("aria-pressed"), "true");
    ok("tres divisiones", !!dv("Masters") && !!dv("Seniors") && !!dv("Juniors"),
       true);
    ok("y NO hay una que las mezcle",
       [...d.querySelectorAll("#worldDiv .tog")]
         .some(b => /all|todas/i.test(b.textContent)), false);
    const rr = rows();
    ok("Masters 2026 trae filas", rr.length > 10, true);
    ok("Kingambit encabeza", /Kingambit/.test(rr[0].textContent), true);
    ok("con su cuenta de equipos",
       / of \d+ teams/.test(rr[0].textContent), true);
    /* .rmeta .mono, not the first .mono: the rank sits in .rname and carries
       no percentage. */
    const pct = r => Number(r.querySelector(".rmeta .mono").textContent.match(
      /([\d.]+)%/)[1]);
    const ps = rr.map(pct);
    ok("de mayor a menor", ps.every((v, i) => i === 0 || ps[i - 1] >= v), true);
    click(dv("Juniors"));
    ok("Juniors es otra lista", rows().map(pct)[0] !== ps[0] ||
       rows()[0].textContent !== rr[0].textContent, true);
    ok("y el encabezado lo dice",
       /juniors/.test(d.querySelector("#worldOut .sub").textContent), true);
    done();
  }

  function done(){
    console.log("\n  ERRORES JS: " + (errs.length ? errs.join(" | ") : "ninguno"));
    if (errs.length) bad++;
    console.log(bad ? "\n  " + bad + " FALLOS\n" : "\n  todo bien\n");
    process.exit(bad ? 1 : 0);
  }
}, 700);
