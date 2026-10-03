/* The ability a build RUNS, and the one it saves.

   A <select> of ONE option can never fire its own onchange, so every species
   with a single ability - plus every Mega - would show the right ability in
   the editor and write null to the database. The card would then have
   nothing to print, the move rows would lose their badges (Water Pulse is
   +50% under Mega Launcher) and the calculator would model no ability.

   Two halves, both checked: a species with one ability is a FACT, written
   into the build, and a species with two or three is a CHOICE, which stays
   unmade until he makes it (an indicator sits beside a choice and never
   makes it).

   Four fixtures, one per case:
     Clawitzer   one ability, ability null   -> resolved, badged and saved
     Aegislash   one ability, unbound build  -> resolved on the card
     Garchomp    two abilities, ability null -> stays unset, and says so
     Camerupt    a stone, mega_ability null  -> the Mega's own ability

   And the LIST ITSELF, which is what the choice is made from. Serebii links
   Battle Bond as /abilitydex/.shtml, so a pattern demanding a slug loses it:
     Greninja    an idea build              -> Torrent, Protean, Battle Bond
     Lycanroc-Midnight                      -> still has No Guard
     Greninja-Bond / Rockruff-Dusk in HOME  -> their own ability, not the
                                               base species' three */
const { describe } = require("node:test");
const { check, idle, open, row, build, click } = require("./harness.js");

const ROWS = ["Clawitzer", "Garchomp", "Camerupt"]
  .map(n => row(n.toLowerCase(), n, {trained:true}));

const B = (id, pokemon, extra) => build(id, pokemon, {box_id:id,
  nature:"Modest", stat_points:{hp:0,atk:0,def:0,spa:32,spd:0,spe:32},
  moves:["Water Pulse", "Protect", null, null], ...extra});
const BUILDS = [
  B("clawitzer", "Clawitzer"),
  /* an idea, with no Pokemon behind it - the state the ability still has to
     resolve in, because a build is its own thing */
  B("aegislash", "Aegislash",
        {box_id:null, moves:["Iron Head", null, null, null]}),
  B("garchomp", "Garchomp", {moves:["Earthquake", null, null, null]}),
  B("camerupt", "Camerupt",
        {mega:"Mega Camerupt", moves:["Eruption", null, null, null]}),
  B("greninja", "Greninja",
        {box_id:null, moves:["Dark Pulse", null, null, null]}),
];

const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;
const editor = () => d.getElementById("buildEditBody");
const saveBtn = () =>
  [...d.getElementById("buildEditFoot").querySelectorAll("button")]
    .find(b => b.textContent === "Save");
const cardFor = n => [...d.querySelectorAll("#listBuilds .row")]
  .find(r => ((r.querySelector(".rname") || r).textContent.trim().indexOf(n) === 0));

(async () => {
  await idle();
  describe("the ability a build runs", () => {
    check("Aegislash: only one, so it is a fact",
       w.activeAbility({pokemon:"Aegislash"}), "Stance Change");
    check("Clawitzer: the same", w.activeAbility({pokemon:"Clawitzer"}), "Mega Launcher");
    check("Garchomp: two, so it is a choice not yet made",
       w.activeAbility({pokemon:"Garchomp"}), "null");
    check("and with a stone, the Mega's runs",
       w.activeAbility({pokemon:"Camerupt", mega:"Mega Camerupt"}), "Sheer Force");
    check("what was chosen beats what is deduced",
       w.activeAbility({pokemon:"Garchomp", ability:"Rough Skin"}), "Rough Skin");
  });
  describe("and so the card shows it", () => {
    w.go("builds");
    check("Clawitzer: Mega Launcher on the card",
       /Mega Launcher/.test(cardFor("Clawitzer").textContent), true);
    check("Aegislash: Stance Change, even as just an idea",
       /Stance Change/.test(cardFor("Aegislash").textContent), true);
    check("Camerupt with a stone: the Mega's",
       /Sheer Force/.test(cardFor("Camerupt").textContent), true);
    check("Garchomp invents none",
       /Sand Veil|Rough Skin/.test(cardFor("Garchomp").textContent), false);
  });
  await describe("with Clawitzer's build open", async () => {
    click(cardFor("Clawitzer"));
    await idle();
    const ab = [...editor().querySelectorAll("select")]
      .find(s => [...s.options].some(o => o.value === "Mega Launcher"));
    check("the select carries the only one there is", ab.value, "Mega Launcher");
    check("and offers no blank row",
       [...ab.options].some(o => o.value === ""), false);
    const slot = [...editor().querySelectorAll(".slot")]
      .find(s => /Water Pulse/.test(s.textContent));
    check("Water Pulse carries the Mega Launcher bonus",
       /Mega Launcher/.test(slot.textContent), true);
    /* writing it down is NOT a retune: it is the ability it always had */
    check("no 500 VP charged for recording it",
       /ability 500/.test(editor().textContent), false);
  });
  await describe("on save", async () => {
    click(saveBtn());
    await idle();
    const wrote = w.__WROTE.findLast(x => x.table === "builds");
    check("it saves the ability", wrote.row.ability, "Mega Launcher");
    check("on this build's row", wrote.row.id, "clawitzer");
  });
  await describe("and with two abilities it does not choose for him", async () => {
    w.go("builds");
    click(cardFor("Garchomp"));
    await idle();
    const ab2 = [...editor().querySelectorAll("select")]
      .find(s => [...s.options].some(o => o.value === "Rough Skin"));
    check("the select opens unchosen", ab2.value, "");
    check("and says so on its first row",
       /not chosen/.test(ab2.options[0].textContent), true);
    check("the checks warn it is missing",
       /No ability chosen/.test(editor().textContent), true);
    click(saveBtn());
    await idle();
    const w2 = w.__WROTE.findLast(x => x.table === "builds");
    check("and it saves null, not the first in the list", w2.row.ability, "null");
  });
  await describe("no ability is lost on the way", async () => {
    /* the list the choice is made from */
    const possible = n => {
      w.findDetail(w.byName[n]);
      const l = [...d.querySelectorAll("#sheetBody .lbl")]
        .find(x => x.textContent === "Possible ability");
      const v = l ? l.previousElementSibling.textContent : "";
      w.closeSheet();
      return v;
    };
    check("Greninja: three on its sheet", possible("Greninja"),
       "Torrent / Protean / Battle Bond");
    check("Lycanroc-Midnight still has No Guard",
       /No Guard/.test(possible("Lycanroc-Midnight")), true);
    check("HOME's Greninja-Bond: its own, not the base's",
       (w.anyRow("Greninja-Bond").ab || []).join(" / "), "Battle Bond");
    check("HOME's Rockruff-Dusk: Own Tempo",
       (w.anyRow("Rockruff-Dusk").ab || []).join(" / "), "Own Tempo");

    w.go("builds");
    click(cardFor("Greninja"));
    await idle();
    const ab3 = [...editor().querySelectorAll("select")]
      .find(s => [...s.options].some(o => o.value === "Protean"));
    /* the set, not the order: the picker ranks by what is run */
    check("and its build's select offers all three",
       [...ab3.options].map(o => o.value).filter(Boolean).sort()
         .join(" / "), "Battle Bond / Protean / Torrent");
  });

  describe("no JS errors", () => {
    check("jsdom reports no error", errs.join(" | ") || "none", "none");
  });
})();
