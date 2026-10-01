/* A spread move takes x0.75 while both targets are up, and fourteen of them
   land on your own partner as well - which the player's own rule says not to
   run unless the ally absorbs it. Neither fact was on a move row anywhere
   except one line of small print, and the move PICKER showed neither, so the
   choice was made blind.

   Serebii is not the source for this: it spells one target four ways and gets
   three moves wrong outright. So the sweep below checks the shipped data
   against Smogon's engine target column - the truth - rather than against the
   table that produced it, and the render checks confirm the badges reach the
   three places a move is drawn. */
const fs = require("fs");
const { describe } = require("node:test");
const { ROOT, check, open, idle, row, build, click } = require("./harness.js");

const raw = JSON.parse(fs.readFileSync(
  ROOT + "data/raw/smogon_calc/raw_moves.json", "utf8"));
const key = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SM = {};
Object.keys(raw).forEach(n => { if (raw[n] && typeof raw[n] === "object")
                                  SM[key(n)] = raw[n].target; });

const ROWS = [row("garchomp", "Garchomp", {trained:true})];
const BUILDS = [build("garchomp", "Garchomp", {ability:"Rough Skin",
  nature:"Jolly", stat_points:{hp:0,atk:32,def:0,spa:0,spd:2,spe:32},
  moves:["Earthquake","Rock Slide","Dragon Claw","Protect"]})];
const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;
const tags = n => [...n.querySelectorAll(".tag")].map(t => t.textContent);

const tagsOf = m => [...w.moveRowFor(w.MOVE_BY[m], [], null)
  .querySelectorAll(".tag")].map(t => t.textContent);

(async () => {
  await idle();
  /* ---------------------------------------------------------- the sweep --- */
  /* The moves as the page reads them, by name: the row a build draws is the
     one this checks. */
  const MOVES = Object.values(w.MOVE_BY);
  const mv = n => w.MOVE_BY[n];
  await describe("barrido de los " + MOVES.length + " movimientos usables", () => {
    let nSpread = 0, nAlly = 0;
    const mismatch = [];
    MOVES.forEach(m => {
      const t = SM[key(m.name)];
      if (t === undefined) return;          // Octazooka: not in Smogon's table
      const wantSpread = t === "allAdjacent" || t === "allAdjacentFoes";
      const wantAlly = t === "allAdjacent";
      if (m.spread !== wantSpread || m.hitsAlly !== wantAlly)
        mismatch.push(m.name + " (" + t + " -> spread=" + m.spread +
                      " ally=" + m.hitsAlly + ")");
      nSpread += m.spread; nAlly += m.hitsAlly;
    });
    check("ninguno discrepa con el motor de Smogon", mismatch.join(", ") || "0", "0");
    /* 38 when this was written, with the comment "Smogon lists 39; Overdrive is
       the one Champions does not have". It has it now: Regulation M-C brought
       Toxtricity (2026-09-09), which learns it, so Overdrive went useable and the
       count went to 39. The number is asserted with its cause beside it, so the
       next move to arrive is a named change rather than a bare digit to bump. */
    check("movimientos spread", nSpread, 39);
    check("de esos, golpean al aliado", nAlly, 16);

    check("el 39o es Overdrive, que llego con M-C", !!mv("Overdrive"), true);
    check("...y es spread", mv("Overdrive").spread, true);

    check("Burning Jealousy es spread (Serebii: no)", mv("Burning Jealousy").spread, true);
    check("Corrosive Gas golpea al aliado (Serebii: no)", mv("Corrosive Gas").hitsAlly, true);
    check("Misty Explosion golpea al aliado", mv("Misty Explosion").hitsAlly, true);
    check("Psyshield Bash NO apunta al aliado", mv("Psyshield Bash").target,
       "Selected Target");
    check("Mountain Gale NO apunta a si mismo", mv("Mountain Gale").target,
       "Selected Target");
    check("Tailwind sigue siendo Ally", mv("Tailwind").target, "Ally");
  });

  /* -------------------------------------------------- the badges on screen */
  w.go("builds");
  click(d.querySelectorAll("#listBuilds .row")[0]);
  await idle();
  const slots = [...d.querySelectorAll(".slot")]
    .filter(s => /Earthquake|Rock Slide|Dragon Claw|Protect/.test(s.textContent));
  const by = n => slots.find(s => s.textContent.includes(n));
  /* Priority has to show its NUMBER on the row. Filtering a movepool by
     "priority" and getting back rows that do not say how much is no answer:
     +1 and +3 are a different move in doubles. The Pokemon's own sheet
     showed no priority at all - which is where the player was looking
     (2026-09-12) - and the two renderers that did show it only handled +N,
     so nothing ever said that Dragon Tail moves LAST. One priorityTag() now,
     shared by all three. */
  await describe("la prioridad, con su numero", () => {
    check("Fake Out dice +3", tagsOf("Fake Out").indexOf("priority +3") >= 0, true);
    check("Aqua Jet dice +1", tagsOf("Aqua Jet").indexOf("priority +1") >= 0, true);
    check("Dragon Tail dice -6 (va ultimo)",
       tagsOf("Dragon Tail").indexOf("priority -6") >= 0, true);
    check("Earthquake no lleva etiqueta de prioridad",
       tagsOf("Earthquake").some(t => /priority/.test(t)), false);
  });

  const eq = by("Earthquake");
  await describe("la hoja del build", () => {
    const rs = by("Rock Slide"), dc = by("Dragon Claw");
    check("Earthquake lleva spread", tags(eq).indexOf("spread") >= 0, true);
    check("Earthquake avisa del aliado", tags(eq).indexOf("hits ally") >= 0, true);
    check("Earthquake lo dice tambien en texto",
       /ally/.test(eq.textContent), true);
    check("Rock Slide lleva spread", tags(rs).indexOf("spread") >= 0, true);
    check("Rock Slide NO avisa del aliado",
       tags(rs).indexOf("hits ally") >= 0, false);
    check("Dragon Claw no lleva ninguno",
       tags(dc).indexOf("spread") >= 0 || tags(dc).indexOf("hits ally") >= 0,
       false);
  });

  /* the picker, which is where the move is actually chosen */
  click(eq);
  await idle();
  await describe("el buscador de movimientos", () => {
    const rows = [...d.querySelectorAll(".sheet .row")];
    const find = n => rows.find(r => r.textContent.indexOf(n) >= 0);
    const peq = find("Earthquake"), pdc = find("Dragon Claw");
    check("Earthquake en la lista lleva spread",
       peq && tags(peq).indexOf("spread") >= 0, true);
    check("Earthquake en la lista avisa del aliado",
       peq && tags(peq).indexOf("hits ally") >= 0, true);
    check("Dragon Claw en la lista no lleva ninguno",
       pdc ? (tags(pdc).indexOf("spread") >= 0 ||
              tags(pdc).indexOf("hits ally") >= 0) : "no está", false);
  });

  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
