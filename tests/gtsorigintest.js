/* You cannot deposit what cannot leave the game.

   A Champions-ORIGIN Pokemon came out of an Encounter and can never leave the
   box, so it can never reach a GTS box in HOME - and the deposit picker must
   not offer one.

   Three ways to be locked, and all three must be filtered:
     origin "champions"  - bought from an Encounter
     status "rental"     - Champions origin by definition, whatever origin says
     origin missing      - counted as Champions origin everywhere else, and the
                           safe way round: offering something you cannot move is
                           a dead end, hiding something you could is one question

   And the ones that CAN go: anything in HOME, plus a HOME-origin Pokemon
   sitting in the Champions box, which can be parked back and deposited. */
const { describe } = require("node:test");
const { check, open, idle, row, click, all, byId, one, text } = require("./harness.js");

/** @param {string} id
   @param {string} name
   @param {string} location
   @param {string | null} origin  null: a row recorded before origin was
   @param {string} [status] */
const R = (id, name, location, origin, status) =>
  row(id, name, {location, origin, status});
const ROWS = [
  R("g1", "Garchomp",  "champions", "champions", "permanent"),
  R("g2", "Sneasler",  "champions", "home",      "rental"),   // rental beats origin
  R("g3", "Mawile",    "champions", null,        "permanent"),
  R("g4", "Sableye",   "champions", "home",      "permanent"),
  R("g5", "Sharpedo",  "home",      "home",      "permanent"),
  /* a DUPLICATE and a Pokemon Champions does not have: the only two things
     his own rule lets him offer */
  R("g6", "Sharpedo",  "home",      "home",      "permanent"),
  R("g7", "Bulbasaur", "home",      "home",      "permanent"),
  /* AND THE CASE THAT BREAKS A NAIVE FILTER: a real Metagross in HOME and a
     Metagross RENTAL in the Champions box. Counting them together gives 2,
     and offering the HOME one as trade material would lose the species. */
  R("g8", "Metagross", "home",      "home",      "permanent"),
  R("g9", "Metagross", "champions", "champions", "rental")];

const { dom, errs } = open({ box: ROWS });
const w = dom.window, d = w.document;

/** @param {Element} b */
const nameOf = b => text(one(b, ".rname").firstChild).trim();

(async () => {
  await idle();
  w.gtsPickMine(function(){}, null);
  const sheet = byId(d, "sheetBody");
  const cards = () => [...all(sheet, ".list .row")];
  /** @param {string} t */
  const tog = t => [...all(sheet, ".tog")]
    .find(b => b.textContent.trim() === t);
  /** @param {string} t */
  const press = t => click(tog(t));
  const offered = cards().map(nameOf);

  describe("what can be deposited", () => {
    check("Sharpedo, which is in HOME", offered.indexOf("Sharpedo") >= 0, true);
    check("Sableye, HOME origin inside the box",
       offered.indexOf("Sableye") >= 0, true);
    check("and nothing else", offered.length, 5);
  });

  describe("what cannot leave the game", () => {
    check("Garchomp (Champions origin) is out",
       offered.indexOf("Garchomp") >= 0, false);
    check("Sneasler (rental) is out", offered.indexOf("Sneasler") >= 0, false);
    check("Mawile (origin not recorded) is out",
       offered.indexOf("Mawile") >= 0, false);
  });

  describe("and it is said, not hidden", () => {
    const notes = [...all(sheet, "p.sub")].map(p => p.textContent);
    check("it counts the ones left out",
       notes.some(t => /4 more in the Champions box/.test(t)), true);
    check("and explains why",
       notes.some(t => /never leave the game/.test(t)), true);
  });

  /* The same card as the rest of the app: a name and a BST are not enough to
     decide what to give away. */
  describe("the same card as everywhere", () => {
    check("every row is a card",
       cards().every(b => / card\b/.test(b.className)), true);
    check("with its six stats",
       cards().every(b => !!b.querySelector(".statline")), true);
    check("and its BST", cards().every(b => /BST/.test(b.textContent)), true);
    /* the one Champions lacks TOO, which is exactly the one that is currency */
    const bulba = cards().find(b => nameOf(b) === "Bulbasaur");
    check("even the one not in Champions has numbers",
       !!bulba && /318/.test(bulba.textContent), true);
  });

  describe("the two filters this screen exists to answer", () => {
    check("there is a dex-number sort", !!tog("Dex no."), true);
    press("Duplicates only");
    /* A RENTAL MAKES NO DUPLICATE. The two Sharpedo are; the HOME Metagross
       is alone, because the rental in the box can never leave the game and so
       can never be the copy that is kept. */
    check("duplicates: only the two Sharpedo",
       cards().map(nameOf).join(","), "Sharpedo,Sharpedo");
    check("Metagross does not count as a duplicate",
       cards().map(nameOf).indexOf("Metagross") >= 0, false);
    press("Duplicates only");
    press("Not in Champions only");
    check("outside the dex: only Bulbasaur", cards().map(nameOf).join(","), "Bulbasaur");
    press("Not in Champions only");
    check("and releasing them brings the five back", cards().length, 5);
    /** AND THE SAFETY NET READS THE SAME NUMBER. The "last copy" warning is
       what catches the mistake a filter would let through, so it must not
       count the rental as a copy either.
       @param {string} n */
    const badgesOf = n => {
      const c = cards().find(b => nameOf(b) === n);
      return c ? [...all(c, ".rname .tag")].map(t => t.textContent) : [];
    };
    check("the HOME Metagross warns it is the last copy",
       badgesOf("Metagross").some(t => /your only one/i.test(t)), true);
    check("and a Sharpedo does not", badgesOf("Sharpedo").some(t => /your only one/i.test(t)),
       false);
  });

  describe("one not in Champions has a price, and therefore advice", () => {
    /* chipValue() must read anyRow, not byName: a species Champions does not
       know has no byName row, and with no price there is no band to search,
       so depositing one would get NO recommendation. */
    w.closeSheet();
    w.gtsPickWanted(function(){}, "Bulbasaur", false);
    const wanted = byId(d, "sheetBody");
    check("it says what it is worth", /is worth about 318/.test(wanted.textContent), true);
    check("and proposes something to ask for",
       all(wanted, ".list .row").length > 0, true);
  });


  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
