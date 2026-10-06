/* A regional form has its OWN movepool.

   learnset() must look up the FORM before the species: the other way round
   hands every regional form its base form's pool - Samurott-Hisui would get
   Samurott's moves and "not learn" Ceaseless Edge or Sucker Punch, which it
   does - and the build editor offers from this same list.

   The species fallback has to stay, though: a Mega has no learnset of its own,
   so Mega Garchomp reads Garchomp's. Both halves are asserted here. */
const { describe } = require("node:test");
const { check, open, source, idle } = require("./harness.js");

const { dom, errs } = open();
const w = dom.window;

(async () => {
  await idle();
  /** @param {string} form
     @param {string} move */
  const has = (form, move) =>
    (w.learnset(form) || []).some(m => m.name === move);
  /** @param {string} f */
  const size = f => (w.learnset(f) || []).length;
  const C = w.CHAMP;

  describe("the cases found on a build", () => {
    check("Samurott-Hisui learns Ceaseless Edge",
       has("Samurott-Hisui", "Ceaseless Edge"), true);
    check("Samurott-Hisui learns Sucker Punch",
       has("Samurott-Hisui", "Sucker Punch"), true);
    check("Rotom-Wash learns Hydro Pump", has("Rotom-Wash", "Hydro Pump"), true);
  });

  describe("and does not lend them to the base form", () => {
    check("base Samurott does NOT learn Ceaseless Edge",
       has("Samurott", "Ceaseless Edge"), false);
    check("base Rotom does NOT learn Hydro Pump", has("Rotom", "Hydro Pump"), false);
  });

  describe("the species fallback is still alive (Megas need it)", () => {
    check("Mega Garchomp reads Garchomp's pool",
       size("Mega Garchomp"), size("Garchomp"));
    check("and it is not empty", size("Mega Garchomp") > 0, true);
  });

  /* the sweep: every form that has its own key must read its own pool, not
     its species'. A sweep, because a sample misses most of such a class. */
  describe("a sweep of every form with its own pool", () => {
    /** @type {string[]} */
  const wrong = [];
    C.DEX.forEach(function(r){
      const form = r[0], sp = r[1];
      if (form === sp || r[4]) return;              // r[4] = is a Mega
      if (!C.LEARN[form] || !C.LEARN[sp]) return;
      const own = C.LEARN[form].length;
      if (size(form) !== own) wrong.push(form);
    });
    check("none reads its species' pool", wrong.join(", ") || "0", "0");
  });

  /* and the other half of the question: is EVERY form covered? The hard ones
     are Floette and Mega Floette (Champions' Floette is the Eternal Flower
     one, filed as "Floette-Eternal") and the gender forms, whose pool is the
     base species'. */
  describe("every form, no exception", () => {
    const empty = C.DEX.map(r => r[0]).filter(n => !size(n));
    check("no form is left without a movepool", empty.join(", ") || "0", "0");
    /* Champions' Floette is the Eternal Flower one and there is no other: the
       master list has only 670-e, no learner table says plain "Floette", and the
       Pokedex block carries the Eternal spread. The bare name still has to find
       it, because every usage source writes it that way. */
    check("Floette-Eternal has its own", has("Floette-Eternal", "Moonblast"), true);
    check("and a bare 'Floette' lands on it (the only one that exists)",
       has("Floette", "Moonblast"), true);
    check("so does Mega Floette", size("Mega Floette") > 0, true);
    /* Indeedee-Female does NOT inherit: Serebii lists it in the learner tables
       under a "#0" dex cell, which a \d{4} pattern drops. It has its own pool,
       and the difference is the point - Follow Me is on the female only. */
    check("Indeedee-Female has its own movepool, not the male's",
       size("Indeedee-Female") !== size("Indeedee") && size("Indeedee-Female") > 0,
       true);
    check("...and is the one that learns Follow Me",
       has("Indeedee-Female", "Follow Me"), true);
    check("...which the male does not", has("Indeedee", "Follow Me"), false);
    /* Basculegion-Female really does inherit: Serebii gives it no learner row at
       all, only an "<h2>Stats - Female</h2>" block. */
    check("Basculegion-Female inherits Basculegion's",
       size("Basculegion-Female"), size("Basculegion"));
    /* the fixed forms (plumages, sizes) share the species pool */
    check("Squawkabilly-White inherits Squawkabilly's",
       size("Squawkabilly-White"), size("Squawkabilly"));
    check("Gourgeist-Jumbo inherits Gourgeist's",
       size("Gourgeist-Jumbo"), size("Gourgeist"));

    /* every screen that offers moves goes through this one helper, so the fix
       reaches all of them - assert that nothing reads the table directly */
    const code = source();
    const direct = (code.match(/C\.LEARN\[/g) || []).length;
    check("only learnset() reads the table (3 reads, all its own)", direct, 3);
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
