/* Bugs of one SHAPE, hunted mechanically: a lookup that silently returns the
   wrong thing instead of failing. Two examples, neither visible by reading
   the screen:

     STAT_LABEL declared twice - the second declaration, an array, wins at
     runtime, so every caller asking STAT_LABEL["hp"] gets undefined and a
     Pokemon's sheet prints six numbers with no captions.

     learnset() resolving the SPECIES before the FORM, which hands regional
     forms their base form's movepool and leaves some forms with nothing.

   So this sweeps every table the page reads, asserts every key it will be
   asked for is there, and re-checks the code smells in the built file. It is
   a sweep, not a sample, because a sample misses nearly all of a class like
   that. */
const { describe } = require("node:test");
const { check, open, page, source, idle, click } = require("./harness.js");

const list = a => {
  if (!a.length) return "0";
  const more = a.length > 6 ? " (+" + (a.length - 6) + ")" : "";
  return a.slice(0, 6).join(", ") + more;
};

const src = page();
/* the code smells below are about the SOURCE, so they read the source */
const code = source();
const { dom, errs } = open();
const w = dom.window;

(async () => {
  await idle();
  const C = w.CHAMP, DEX = C.DEX;

  describe("the code", () => {
    const twice = re => {
      const seen = new Set(), dup = new Set();
      for (const [, name] of code.matchAll(re)) (seen.has(name) ? dup : seen).add(name);
      return [...dup];
    };
    check("no var declared twice",
       list(twice(/^var ([A-Za-z_$][\w$]*)\s*=/gm)), "0");
    check("no function declared twice",
       list(twice(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)), "0");
    /* a guard that skips the redraw when focus is inside the container it is
       about to rebuild: legitimate for a form of text inputs (the Settings
       tab), wrong for a list of buttons (the row tapped keeps focus, and the
       redraw is swallowed). Matched by SHAPE - the early `return` - so a
       dialog reading activeElement to decide what Enter does is not counted. */
    const guards = code.split("\n").filter(function(l){
      return /activeElement/.test(l) && /\breturn\b/.test(l) &&
             !/^\s*\/?\*/.test(l);
    });
    check("only one redraw guard remains", guards.length, 1);
    check("and it is the Settings tab's",
       guards.join(" ").indexOf("#v-trainer") >= 0, true);
  });

  /* A CARD MUST SAY WHERE ITS CONTENTS START.

     A card is a <button>, and a button centres its own contents when its box
     is taller than they are - which is every card in a grid row except the
     tallest, because grid items stretch. `display:block` does NOT stop it,
     because the centring happens inside the button's own box - so this
     asserts the explicit answer, not the absence of the symptom. Geometry
     cannot be tested here at all: jsdom lays nothing out and reports every
     rectangle as zero, so the shape of the rule is the only thing this file
     can hold on to. */
  describe("the card", () => {
    const css = (src.match(/<style>([^]*?)<\/style>/g) || []).join(" ");
    /* the top-level rule, at the start of a line - not one indented inside a
       media query, which can come earlier in the file */
    const cardRule = (css.match(/(?:^|\n)\.row\.card\{[^}]*\}/) || [""])[0];
    check("the .row.card rule exists", !!cardRule, true);
    check("it says which way it stacks", /flex-direction:\s*column/.test(cardRule), true);
    check("and where the contents start",
       /justify-content:\s*flex-start/.test(cardRule), true);
  });

  /* THE INTROS FOLD, AND NOTHING IS LOST WHEN THEY DO. The first sentence
     stays and the rest goes behind a button that says how many words are in
     it.

     A fold that fails does so SILENTLY - no fold and no complaint - in two
     known ways: a boundary rule that wants a capital after the full stop
     (Builds continues "...it waits. 66 Stat Points"), and a regex dot that
     does not cross the markup's line breaks. Hence this test. */
  describe("the intro texts", () => {
    const d = w.document;
    const ledes = [...d.querySelectorAll(".view .lede, .view > .sub")];
    const folded = ledes.filter(p => p.dataset.folded);
    check("some intros are folded", folded.length >= 3, true);
    check("and Builds' is one of them",
       !!d.querySelector("#v-builds .lede .whybtn"), true);
    const bl = d.querySelector("#v-builds .lede");
    check("the first sentence stays visible",
       /A set is its own thing/.test(bl.firstChild.textContent), true);
    /* NOT DELETED - one tap away, and in the page for anyone reading source */
    check("the rest is still in the DOM",
       /66 Stat Points/.test(bl.querySelector(".more").textContent), true);
    check("but hidden at first", bl.querySelector(".more").hidden, true);
    check("the button says how many words it hides",
       /^why \(\d+ words\)$/.test(bl.querySelector(".whybtn").textContent), true);
    click(bl.querySelector(".whybtn"));
    check("and tapping it opens it", bl.querySelector(".more").hidden, false);
    check("...saying how to close it", bl.querySelector(".whybtn").textContent,
       "less");
  });
  describe("the tables, swept", () => {
    const names = {}, species = {};
    DEX.forEach(r => { names[r[0]] = r; species[r[1]] = 1; });

    check("every form has a movepool",
       list(DEX.map(r => r[0]).filter(n => !(w.learnset(n) || []).length)), "0");
    check("every form has coloured types",
       list(DEX.filter(r => r[2].some(t => !(w.TYPE_COLOR||{})[t])).map(r => r[0])), "0");
    /* THE COLOURS ARE FETCHED, NOT TYPED, and this is what stops them being
       typed again (a hand-typed palette drifts, and a darkened colour is not
       the type's colour - Fire is #FD7D24, not #C8501E).

       Three facts per type, all three from pokemon.com's own rule: the colour,
       the second tone, and the ink that type's name is written in. */
    const TC = C.TYPE_COLORS || {};
    check("the colour table rides in the payload", Object.keys(TC).length >= 18, true);
    check("and every app colour comes from it",
       list(Object.keys(w.TYPE_COLOR || {})
         .filter(t => !TC[t] || TC[t].top !== w.TYPE_COLOR[t])), "0");
    check("Fire is the official one, not the darkened",
       (w.TYPE_COLOR || {}).Fire, "#FD7D24");
    /* the three officially two-toned types */
    check("Dragon, Flying and Ground are two-toned",
       Object.keys(TC).filter(t => TC[t].two_tone).sort().join(","),
       "Dragon,Flying,Ground");
    check("and the rest repeat their colour",
       list(Object.keys(TC).filter(t => !TC[t].two_tone &&
         w.TYPE_COLOR2[t] !== w.TYPE_COLOR[t])), "0");
    /* the ink is a decision pokemon.com already made, and reading it is what
       lets the app keep the true colour instead of darkening it */
    check("eight types are written in black",
       Object.keys(TC).filter(t => TC[t].ink !== "#FFFFFF").sort().join(","),
       "Electric,Fairy,Flying,Grass,Ground,Ice,Normal,Steel");
    check("and every type has an ink", list(Object.keys(TC)
       .filter(t => !/^#[0-9A-F]{6}$/.test(w.TYPE_INK[t] || ""))), "0");
    /* NOTHING INVENTED. Stellar reaches typechart.json only because that file
       is built from Smogon's dump-basics, which inherits from Scarlet/Violet;
       Champions has no Terastallization and no Pokemon carries the type. So
       the palette is exactly the eighteen pokemon.com publishes, and this
       asserts nobody adds a nineteenth. */
    check("the 18 and nothing more", Object.keys(TC).length, 18);
    check("none invented", list(Object.keys(TC).filter(t => !TC[t].official)), "0");
    check("Stellar has no colour, because it does not exist here",
       !!(w.TYPE_COLOR || {}).Stellar, false);
    check("every dex ability has text",
       list([...new Set(DEX.map(r => r[5] || []).flat())]
         .filter(a => !C.ABIL[a])), "0");
    check("every dex ability is classified",
       list([...new Set(DEX.map(r => r[5] || []).flat())]
         .filter(a => !(C.AB_CLASS || {})[a])), "0");
    check("every Mega has a stone",
       list(C.STONES.filter(r => !r[0]).map(r => r[1])), "0");
    check("every stone points at a Mega that exists",
       list(C.STONES.filter(r => !names[r[1]]).map(r => r[1])), "0");
    check("every form has a dex number",
       list(DEX.filter(r => !r[6] && !(C.DEXNO || {})[r[1]]).map(r => r[0])), "0");
    check("every form resolves a name in Smogon's engine",
       list(DEX.map(r => r[0]).filter(n => !(C.SMOGON_NAME || {})[n] &&
                                           !(C.AEGIS || {})[n] &&
                                           !/Aegislash/.test(n))), "0");
  });

  /* the same fault as learnset(), one table over: megasFor() reading the
     SPECIES would offer Raichu-Alola the two Mega Raichu and Slowbro-Galar
     Mega Slowbro. Smogon's roster states which form each Mega comes from,
     and it is not always the base one - Mega Floette belongs to
     Floette-ETERNAL. */
  describe("every Mega, on the form that holds the stone", () => {
    const megaNames = DEX.filter(r => r[4]).map(r => r[0]);
    check("no Mega is left without an owner",
       list(megaNames.filter(m => !Object.keys(C.MEGA_OWNER || {})
         .some(k => C.MEGA_OWNER[k].indexOf(m) >= 0))), "0");
    check("no alternate form inherits its base's Megas",
       list(DEX.filter(r => r[0] !== r[1] && !r[4]).filter(function(r){
         const offered = (w.megasFor(r[0]) || []).map(x => x.name);
         const own = (C.MEGA_OWNER || {})[r[0]] || [];
         return offered.some(m => own.indexOf(m) < 0);
       }).map(r => r[0])), "0");
    check("Raichu-Alola cannot Mega Evolve",
       (w.megasFor("Raichu-Alola") || []).length, 0);
    check("nor can Slowbro-Galar", (w.megasFor("Slowbro-Galar") || []).length, 0);
    check("Raichu can, with both of its", (w.megasFor("Raichu") || []).length, 2);
    check("Mega Floette belongs to Floette-Eternal",
       ((C.MEGA_OWNER || {})["Floette-Eternal"] || []).join(","), "Mega Floette");
    check("no key repeats a Mega",
       list(Object.keys(C.MEGA_OWNER || {}).filter(k =>
         new Set(C.MEGA_OWNER[k]).size !== C.MEGA_OWNER[k].length)), "0");
  });

  /* one Pokemon, one name: Indeedee-F and Indeedee-Female are the same entry,
     never one of them labelled "not in Champions". HOME_ONLY is matched with
     norm(), never by exact spelling. */
  describe("one Pokemon, one name", () => {
    const spellings = (C.HOME_ONLY || []).filter(function(n){
      return Object.keys(C.COSMETIC || {}).some(function(k){
        return (C.COSMETIC[k] || []).indexOf(n) >= 0;
      });
    });
    check("no alternate spelling is offered as HOME-only", list(spellings), "0");
    check("Indeedee-F is not in HOME_ONLY",
       (C.HOME_ONLY || []).indexOf("Indeedee-F") >= 0, false);
    check("nor are Squawkabilly's plumages",
       (C.HOME_ONLY || []).filter(n => n.indexOf("Squawkabilly-") === 0).length, 0);
    /* The plumages are NOT cosmetic spellings of one entry: the plumage is
       fixed when you catch the bird and decides the third ability - Green and
       Blue get Guts, Yellow and White Sheer Force - and collapsing them would
       leave Sheer Force with no carrier in the database at all. Each is its
       own dex row, so none may be filed as a spelling of another. */
    check("the plumages are NOT cosmetic spellings",
       ((C.COSMETIC || {})["Squawkabilly"] || []).length, 0);
    check("each plumage is its own dex row",
       ["Squawkabilly", "Squawkabilly-Blue", "Squawkabilly-Yellow",
        "Squawkabilly-White"].filter(n =>
          C.DEX.some(r => r[0] === n)).length, 4);
    check("and so are Gourgeist's four sizes",
       ["Gourgeist", "Gourgeist-Small", "Gourgeist-Large",
        "Gourgeist-Jumbo"].filter(n =>
          C.DEX.some(r => r[0] === n)).length, 4);
    check("no Mega slips in as a cosmetic spelling",
       list(Object.keys(C.COSMETIC || {}).filter(k =>
         (C.COSMETIC[k] || []).some(n => /-Mega/.test(n)))), "0");
  });

  describe("the derived tables", () => {
    const moveNames = {};
    C.MOVES.forEach(r => { moveNames[r[0]] = 1; });
    const badMove = [];
    Object.keys(C.AB_MOVES || {}).forEach(a => {
      (C.AB_MOVES[a].m || []).forEach(i => {
        if (!C.MOVES[i]) badMove.push(a + "[" + i + "]");
      });
    });
    check("every index in the ability table points at a move",
       list(badMove), "0");
    check("every move an item serves exists",
       list(Object.keys(C.ITEM_FOR_MOVE || {}).filter(n => !moveNames[n])), "0");
    check("every ability an item serves exists",
       list(Object.keys(C.ITEM_FOR_ABILITY || {}).filter(a => !C.ABIL[a])), "0");
    check("every move that causes a status exists",
       list(Object.keys(C.STATUSES || {})
         .map(s => C.STATUSES[s].moves || []).flat().filter(n => !moveNames[n])), "0");
    check("every learnset points at real moves",
       list(Object.keys(C.LEARN).filter(k =>
         C.LEARN[k].some(i => !C.MOVES[i]))), "0");
    check("every learnset alias points at a real key",
       list(Object.keys(C.LEARN_ALIAS || {})
         .filter(k => !C.LEARN[C.LEARN_ALIAS[k]])), "0");
  });

  /* WHAT A MOVE DOES, WHOLE, AND FROM CHAMPIONS: a description that defines
     the mechanic (not just names it), is never cut short, and comes from
     Champions' own dex - never another game's page. */
  describe("what each move does", () => {
    const txt = n => (w.MOVE_BY[n] || {}).text || "";
    check("every Champions move has a description",
       list(Object.values(w.MOVE_BY).filter(m => !m.text).map(m => m.name)), "0");
    check("Octolock says it lowers Def and SpD every turn",
       /Defense and Special Defense are lowered by 1 stage/.test(txt("Octolock")), true);
    check("...and how it is escaped and when it ends",
       /Shed Shell/.test(txt("Octolock")) && /leaves the field/.test(txt("Octolock")),
       true);
    check("nothing cut: Fire Spin reaches its end",
       /not stackable/.test(txt("Fire Spin")), true);
    check("Freeze-Dry does not freeze in Champions",
       /freez/i.test(txt("Freeze-Dry")), false);
    check("a high crit move states its Champions number",
       /12\.5%/.test(txt("Night Slash")), true);
    check("Night Shade says 50 at level 50",
       /50 HP/.test(txt("Night Shade")), true);
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
