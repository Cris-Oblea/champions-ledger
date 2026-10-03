/* A spread move takes x0.75 while both targets are up, and some land on your
   own partner as well - not to be run unless the ally absorbs it. Both facts
   must be on every move row, the move PICKER included, or the choice is made
   blind.

   Serebii is not the source for this: it spells one target four ways and gets
   some moves wrong outright. So the sweep below checks the shipped data
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
  await describe("a sweep of the " + MOVES.length + " useable moves", () => {
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
    check("none disagrees with Smogon's engine", mismatch.join(", ") || "0", "0");
    /* The count is asserted with its cause beside it, so the next move a
       regulation adds is a named change rather than a bare digit to bump:
       39 since Regulation M-C brought Toxtricity, whose Overdrive went
       useable. */
    check("spread moves", nSpread, 39);
    check("of those, hit the ally", nAlly, 16);

    check("the 39th is Overdrive, which came with M-C", !!mv("Overdrive"), true);
    check("...and it is spread", mv("Overdrive").spread, true);

    check("Burning Jealousy is spread (Serebii: no)", mv("Burning Jealousy").spread, true);
    check("Corrosive Gas hits the ally (Serebii: no)", mv("Corrosive Gas").hitsAlly, true);
    check("Misty Explosion hits the ally", mv("Misty Explosion").hitsAlly, true);
    check("Psyshield Bash does NOT target the ally", mv("Psyshield Bash").target,
       "Selected Target");
    check("Mountain Gale does NOT target itself", mv("Mountain Gale").target,
       "Selected Target");
    check("Tailwind is still Ally", mv("Tailwind").target, "Ally");
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
     +1 and +3 are a different move in doubles, and a NEGATIVE priority
     (Dragon Tail moves LAST) is as much a fact about the turn. One
     priorityTag(), shared by every renderer. */
  await describe("priority, with its number", () => {
    check("Fake Out says +3", tagsOf("Fake Out").indexOf("priority +3") >= 0, true);
    check("Aqua Jet says +1", tagsOf("Aqua Jet").indexOf("priority +1") >= 0, true);
    check("Dragon Tail says -6 (moves last)",
       tagsOf("Dragon Tail").indexOf("priority -6") >= 0, true);
    check("Earthquake carries no priority tag",
       tagsOf("Earthquake").some(t => /priority/.test(t)), false);
  });

  const eq = by("Earthquake");
  await describe("the build's sheet", () => {
    const rs = by("Rock Slide"), dc = by("Dragon Claw");
    check("Earthquake carries spread", tags(eq).indexOf("spread") >= 0, true);
    check("Earthquake warns about the ally", tags(eq).indexOf("hits ally") >= 0, true);
    check("Earthquake also says it in text",
       /ally/.test(eq.textContent), true);
    check("Rock Slide carries spread", tags(rs).indexOf("spread") >= 0, true);
    check("Rock Slide does NOT warn about the ally",
       tags(rs).indexOf("hits ally") >= 0, false);
    check("Dragon Claw carries neither",
       tags(dc).indexOf("spread") >= 0 || tags(dc).indexOf("hits ally") >= 0,
       false);
  });

  /* the picker, which is where the move is actually chosen */
  click(eq);
  await idle();
  await describe("the move picker", () => {
    const rows = [...d.querySelectorAll(".sheet .row")];
    const find = n => rows.find(r => r.textContent.indexOf(n) >= 0);
    const peq = find("Earthquake"), pdc = find("Dragon Claw");
    check("Earthquake in the list carries spread",
       peq && tags(peq).indexOf("spread") >= 0, true);
    check("Earthquake in the list warns about the ally",
       peq && tags(peq).indexOf("hits ally") >= 0, true);
    check("Dragon Claw in the list carries neither",
       pdc ? (tags(pdc).indexOf("spread") >= 0 ||
              tags(pdc).indexOf("hits ally") >= 0) : "not there", false);
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
