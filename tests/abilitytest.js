/* Which ability badges which move, checked on the built page.

   Every case here is a wrong badge - or a missing one, which is worse,
   because an untagged move reads as "checked, this ability does not touch
   it":

     - Liquid Voice must badge Primarina's Hyper Voice
     - Adaptability must NOT badge Rain Dance, a 0 BP move with no STAB to double
     - Contrary must NOT badge Protect, which moves no stat
     - Contrary MUST badge Draco Meteor, Overheat and Leaf Storm, the entire
       reason to run it - a sentence splitter that cuts "Sp. Atk" in half
       loses every special-stat move

   The page exports abilityTag/AB_SET, so the rules are called directly rather
   than hunted for in the DOM - that way a failure names the rule. */
const { describe } = require("node:test");
const { check, open, idle } = require("./harness.js");

const { dom, errs } = open();
const w = dom.window;

(async () => {
  await idle();
  const MOVE = w.MOVE_BY, AB = w.AB_SET;
  const water = {types:["Water","Fairy"]};
  const tag = (ab, mv, poke) => {
    const t = w.abilityTag(ab, MOVE[mv], poke || null);
    return t ? (t.title || "no text") : "NO TAG";
  };
  const has = (ab, mv, poke) => tag(ab, mv, poke) !== "NO TAG";
  /* The chips blockerTags() or itemTags() draws on a move's row. */
  const drawn = (fn, mv) => {
    const host = w.document.createElement("div");
    w[fn](MOVE[mv], host);
    return [...host.children];
  };
  const blockers = mv => drawn("blockerTags", mv).map(n => n.textContent).sort();
  const allBad = mv => drawn("blockerTags", mv).every(n => / bad\b/.test(n.className));
  const tagged = (mv, cls) => drawn("blockerTags", mv)
    .filter(n => n.classList.contains(cls)).map(n => n.textContent).sort();
  const items = mv => drawn("itemTags", mv)
    .map(n => n.textContent + (/ bad\b/.test(n.className) ? "!" : ""));

  describe("the table", () => {
    /* 140 rules since data/db/statuses.json gave the status family its column
       (Insomnia, Limber, Immunity, Own Tempo, Magma Armor, Sweet Veil, Leaf
       Guard, Flower Veil, Synchronize, Corrosion...). Every key must name a
       real Champions ability: `--audit` exits non-zero on a placeholder, and
       scripts/audit_lookups.py checks it too. */
    check("rules loaded", Object.keys(AB).length, 140);
    check("Insomnia knows Spore puts it to sleep",
       !!(AB["Insomnia"] && AB["Insomnia"].m &&
          Object.keys(AB["Insomnia"].m).length), true);
    /* An offensive rule that selects nothing is broken. A rule with a `scope`
       is the one legitimate way to have no move list: it covers a whole
       category and is stated once on the ability instead. */
    const empty = Object.keys(AB).filter(n => AB[n].side === "off" && !AB[n].all &&
                                         !AB[n].scope &&
                                         Object.keys(AB[n].m).length === 0);
    check("no empty offensive rule", empty.join(", ") || "0", "0");
  });

  describe("the cases found on a build", () => {
    check("Liquid Voice badges Hyper Voice", has("Liquid Voice", "Hyper Voice"), true);
    check("...and says it comes out as Water", /Water/.test(tag("Liquid Voice", "Hyper Voice")), true);
    check("Adaptability does NOT badge Rain Dance",
       has("Adaptability", "Rain Dance", water), false);
    check("Contrary does NOT badge Protect", has("Contrary", "Protect"), false);
    check("Contrary does NOT badge Roost", has("Contrary", "Roost"), false);
  });

  describe("Contrary, the big hole", () => {
    ["Draco Meteor", "Overheat", "Leaf Storm", "Make It Rain"].forEach(n => {
      check(n + ": the DROP becomes a boost", /boost/i.test(tag("Contrary", n)), true);
    });
    ["Nasty Plot", "Calm Mind", "Quiver Dance"].forEach(n => {
      check(n + ": the BOOST becomes a drop", /drop/i.test(tag("Contrary", n)), true);
    });
    check("Close Combat still inverts",
       /boost/i.test(tag("Contrary", "Close Combat")), true);
  });

  describe("the rest of the newer rules", () => {
    check("Gale Wings badges Tailwind", has("Gale Wings", "Tailwind"), true);
    check("Rock Head badges Double-Edge", has("Rock Head", "Double-Edge"), true);
    check("Rock Head does NOT badge Earthquake", has("Rock Head", "Earthquake"), false);
    check("No Guard badges Focus Blast (70 acc)",
       has("No Guard", "Focus Blast"), true);
    check("No Guard does NOT badge Aerial Ace (101 acc)",
       has("No Guard", "Aerial Ace"), false);
  });

  /* An ability that covers a WHOLE CATEGORY must not badge a single row: the
     badge lands on every move and picks out nothing, hiding the abilities
     that DO select (Sheer Force and Iron Fist behind Guts on Conkeldurr).
     Guts is the clearest - it multiplies the Attack STAT while statused, so
     "the moves it affects" is only "every physical move".

     BOTH halves are asserted - that it stops badging, AND that it still says
     what it covers - because "no badge" alone would also pass if the rule had
     simply been deleted, and that loses the ability instead of relocating it. */
  describe("whole coverage: said once, not per row", () => {
    [["Guts", "every physical move", "Close Combat"],
     ["Huge Power", "every physical move", "Play Rough"],
     ["Hustle", "every physical move", "Body Slam"],
     ["Prankster", "every status move", "Protect"],
     ["Solar Power", "every special move", "Flamethrower"],
     ["Mold Breaker", "every move", "Earthquake"],
     ["Stance Change", "every damaging move", "Shadow Ball"],
     ["Magician", "every damaging move", "Knock Off"]].forEach(function(c){
      check(c[0] + " declares its scope", (AB[c[0]] || {}).scope, c[1]);
      check(c[0] + " does NOT badge " + c[2], has(c[0], c[2]), false);
    });
  });

  /* ...and the ones that really select still do, or the fix went too far */
  describe("the ones that do select still badge", () => {
    check("Sheer Force badges Body Slam", has("Sheer Force", "Body Slam"), true);
    check("Iron Fist badges Drain Punch", has("Iron Fist", "Drain Punch"), true);
    check("Technician badges Bullet Punch",
       has("Technician", "Bullet Punch"), true);
    /* exempt on purpose: its real selection is STAB, which depends on the
       user's type, and the page filters that - the scope measurement cannot
       see it */
    check("Adaptability badges Surf on a Water type",
       has("Adaptability", "Surf", water), true);
    check("no scoped rule keeps a move list",
       Object.keys(AB).filter(function(n){
         return AB[n].scope && AB[n].m && Object.keys(AB[n].m).length;
       }).join(", ") || "0", "0");
  });

  describe("defensive abilities do not badge their own movepool", () => {
    ["Soundproof", "Fur Coat", "Rough Skin", "Levitate", "Inner Focus",
     "Telepathy", "Pressure"].forEach(n => {
      check(n + " marks nothing in its own set", has(n, "Hyper Voice") ||
         has(n, "Earthquake") || has(n, "Fake Out"), false);
    });
  });

  /* A defensive ability does not badge its own movepool, and that stays: the
     alternative is every one of them on every row. But there is a narrower
     class - the ones that switch a move OFF entirely (Bulletproof on Zap
     Cannon). Not "takes half", not "might burn you back": the move does
     nothing. That list is drawn on the row, in red. */
  describe("what switches a move off, in red", () => {
    check("four abilities block Zap Cannon",
       blockers("Zap Cannon").join(", "),
       "Bulletproof, Lightning Rod, Motor Drive, Volt Absorb");
    check("...and all four are negative", allBad("Zap Cannon"), true);
  });

  /* THE PERSPECTIVE. Red is an OPPONENT's ability that switches the move
     off; green is YOUR PARTNER's that dodges it - the reason to pair them
     (Telepathy beside a spread move). */
  describe("the perspective: red on the foe, green on your partner", () => {
    check("Telepathy is never red", Object.keys(MOVE).some(
       mv => tagged(mv, "bad").indexOf("Telepathy") >= 0), false);
    check("Boomburst: Soundproof in red (the foe)",
       tagged("Boomburst", "bad").join(", "), "Soundproof");
    check("...and Telepathy in green (your partner)",
       tagged("Boomburst", "ok").join(", "), "Telepathy");
    /* an immunity against anyone is a fact about the foe (a Levitate switching
       in under your Earthquake): red, and only red, so the row never writes
       the same name twice */
    check("Earthquake: Levitate in red", tagged("Earthquake", "bad").indexOf("Levitate") >= 0, true);
    check("...and not also in green", tagged("Earthquake", "ok").indexOf("Levitate") >= 0, false);
    check("no row repeats a name", Object.keys(MOVE).filter(mv => {
         const all = tagged(mv, "bad").concat(tagged(mv, "ok"));
         return new Set(all).size !== all.length; }).join(", "), "");
    check("a move that does not touch the ally has no greens",
       tagged("Zap Cannon", "ok").length, 0);
    check("Armor Tail only counts on the foe",
       Object.keys(MOVE).some(mv => tagged(mv, "ok").indexOf("Armor Tail") >= 0), false);
    check("Sleep Powder lists Overcoat", blockers("Sleep Powder").indexOf("Overcoat") >= 0, true);
    check("Earthquake lists Levitate", blockers("Earthquake").indexOf("Levitate") >= 0, true);
    /* the half NOT to badge: Big Pecks eats Fire Lash's Defense drop, which
       is not the move being blocked */
    check("Fire Lash has none", blockers("Fire Lash").length, 0);
    check("nor Protect", blockers("Protect").length, 0);
    /* and a defensive ability that only softens never appears */
    check("Fur Coat blocks nothing",
       Object.keys(w.CHAMP.AB_MOVES).filter(
         n => n === "Fur Coat" && w.CHAMP.AB_MOVES[n].stop).length, 0);
  });

  /* Thermal Exchange triggers on DAMAGE from a Fire move, not on any Fire
     move ("takes DAMAGE from a Fire-type move", in Serebii's words) - and the
     same held for four others. Will-O-Wisp IS still blocked, but by the other
     half of the ability: it cannot be burned, whatever burns it. It is the
     reason that changes. */
  describe("a damage ability does not react to a status move", () => {
    const statusOf = n => (AB[n] ? Object.keys(AB[n].m || {}) : [])
      .map(i => w.CHAMP.MOVES[i]).filter(m => m[2] === "T").map(m => m[0]).sort();
    check("Thermal Exchange only touches Will-O-Wisp, through the burn",
       statusOf("Thermal Exchange").join(","), "Will-O-Wisp");
    check("...and says so in its text",
       /damaging Fire move/.test(AB["Thermal Exchange"].why), true);
    check("Rattled is not scared by a Taunt", statusOf("Rattled").join(","), "");
    check("Thick Fat does not soften a Will-O-Wisp", statusOf("Thick Fat").join(","), "");
    check("nor Heatproof", statusOf("Heatproof").join(","), "");
    check("Dry Skin reacts to neither Soak nor Will-O-Wisp",
       statusOf("Dry Skin").join(","), "");
    /* and the ones that DO absorb the whole type, status included, still do */
    check("Sap Sipper still eats Sleep Powder",
       statusOf("Sap Sipper").indexOf("Sleep Powder") >= 0, true);
    check("Lightning Rod still draws Thunder Wave",
       statusOf("Lightning Rod").indexOf("Thunder Wave") >= 0, true);
  });


  describe("and the items say which side they play for", () => {
    /* the berry thaws, so the freeze - the whole point of the move - never
       lands */
    check("Aspear Berry on Ice Fang is negative",
       items("Ice Fang").indexOf("Aspear Berry!") >= 0, true);
    check("so is Chesto Berry on Sleep Powder",
       items("Sleep Powder").indexOf("Chesto Berry!") >= 0, true);
    /* and one that really serves the move stays positive */
    check("Heat Rock on Sunny Day stays positive",
       items("Sunny Day").indexOf("Heat Rock") >= 0, true);
    check("so does Light Clay on Reflect",
       items("Reflect").indexOf("Light Clay") >= 0, true);
  });


  /* THE SHEET COUNTS WHAT AN ABILITY TOUCHES in that Pokemon's own movepool.
     The count once looked moves up by name in a list that held moves, found
     none, and told every Pokemon its ability touched nothing. */
  describe("the sheet counts the moves an ability touches", () => {
    w.findDetail(w.byName["Scizor"]);
    const sb = w.document.getElementById("sheetBody").textContent;
    check("Technician tags some of Scizor's moves",
       /Technician\.[^]*?Tags \d+ of the \d+ moves it learns/.test(sb), true);
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
