/* WHAT A POKEMON TURNS INTO, on the card, for BOTH kinds of turning.

   A Mega gets a sprite in the strip, its own ink, a second number under every
   stat it moves and an arrow when the typing changes. A battle form - the
   same thing from an ABILITY instead of a stone - must get exactly the same,
   and two of them (Aegislash, Palafin) are the ones whose base row is the
   most misleading number on the card.

   There are exactly five in Champions and this test says so, so that a
   regulation adding a sixth - a Wishiwashi, a Minior, an Eiscue, all of them
   one species away on the watchlist - fails here rather than shipping a card
   that quietly leaves it out.

   FIVE, NOT THREE: Hangry Morpeko and Busted Mimikyu move no number, but they
   are real forms with their own picture - and Hangry Mode changes what Aura
   Wheel is. */
const { describe } = require("node:test");
const { check, open, idle } = require("./harness.js");

const { dom, errs } = open();
const w = dom.window, d = w.document;

/* Search the Find tab for one Pokemon and return its card. */
function card(name){
  w.go("find");
  const inp = d.getElementById("findName");
  inp.value = name;
  inp.dispatchEvent(new w.Event("input", {bubbles:true}));
  return [...d.querySelectorAll("#findOut .row.card")]
    .find(r => r.querySelector(".rname").textContent.indexOf(name) === 0);
}

const src = (img) => img ? img.getAttribute("src") : "";
const keys = (c) => [...c.querySelectorAll(".megapickey")]
  .map(x => x.textContent).join(" ");

(async () => {
  await idle();
  describe("how many battle forms Champions has", () => {
    const bf = w.CHAMP.BFORMS;
    check("all five, whether they move a number or not", Object.keys(bf).sort().join(","),
       "Aegislash,Castform,Mimikyu,Morpeko,Palafin");
    check("and each brings its own sprite",
       Object.keys(bf).every(k => Object.values(bf[k].f).every(e => !!e.sp)), true);
    check("and each says which ability causes it",
       Object.keys(bf).every(k => !!bf[k].by), true);
  });

  describe("Aegislash: Stance Change gives it 140 Attack", () => {
    const ae = card("Aegislash");
    check("the card exists", !!ae, true);
    check("Blade's sprite is in the strip",
       [...ae.querySelectorAll(".megapickey")].map(x => x.textContent).join(" "),
       "base blade");
    check("and wears its own ink, not a Mega's",
       !!ae.querySelector(".megapickey.mk-b"), true);
    check("Attack shows the second number",
       /140/.test(ae.querySelectorAll(".statline > div")[1].textContent), true);
    /* NO BOX. The ability that causes it is already printed above - each
       battle form in Champions has a single ability - so another box would
       repeat the word under itself. */
    check("Stance Change appears once",
       (ae.textContent.match(/Stance Change/g) || []).length, 1);
    check("and is not called a Mega ability", /Mega ability/.test(ae.textContent), false);
  });

  describe("Palafin: Zero to Hero, 70 -> 160", () => {
    const pa = card("Palafin");
    check("Hero's sprite is in the strip",
       [...pa.querySelectorAll(".megapickey")].map(x => x.textContent).join(" "),
       "base hero");
    check("Attack shows 160",
       /160/.test(pa.querySelectorAll(".statline > div")[1].textContent), true);
    check("and the BST goes up", /457\s*→\s*650/.test(pa.textContent.replace(/\s+/g," ")), true);
  });

  describe("Castform: Forecast changes its type three ways", () => {
    const ca = card("Castform");
    check("all three sprites are there",
       [...ca.querySelectorAll(".megapickey")].map(x => x.textContent).join(" "),
       "base sunny rainy snowy");
    check("and the three arrows name their form",
       [...ca.querySelectorAll(".megato")].map(x => x.textContent.trim()).join(" "),
       "→ sunny → rainy → snowy");
    ["Fire", "Water", "Ice"].forEach(t => check(t + " chip",
       [...ca.querySelectorAll(".rmeta .t")].some(x => x.textContent === t), true));
    /* THE CARD'S COLOUR CYCLES TOO. One layer per type, not one: with one, the
       colour would have picked Fire and called the other two nothing. Each
       transition is ONE layer moving over something solid. */
    check("one colour layer per type", ca.querySelectorAll(".retype").length, 3);
    check("and one frame per type", ca.querySelectorAll(".retyperim").length, 3);
    check("the card asks for the four-state cycle", ca.classList.contains("n3"), true);
  });


  describe("Morpeko: Hunger Switch moves no number, and is another form", () => {
    const mo = card("Morpeko");
    check("Hangry's sprite is in the strip", keys(mo), "base hangry");
    const hang = mo.querySelectorAll(".megapic")[1];
    check("and it is Hangry's picture, not the base's",
       /\/10187\.png$/.test(src(hang)), true);
    check("its title says what it does to Aura Wheel",
       /Aura Wheel is Dark/.test(hang && hang.title), true);
    check("no invented second number in the stats",
       mo.querySelectorAll(".statline .mg").length, 0);
    w.findDetail(w.byName["Morpeko"]);
    const sb = d.getElementById("sheetBody").textContent.replace(/\s+/g, " ");
    check("the sheet opens the In battle block", /In battle — Hunger Switch/.test(sb), true);
    check("and says Aura Wheel goes from Electric to Dark",
       /Aura Wheel:\s*Electric\s*→\s*Dark/.test(sb), true);
    check("without claiming it changes the Pokemon's typing",
       /changes the typing/.test(sb), false);
  });

  describe("Mimikyu: Disguise is a form too", () => {
    check("Busted's sprite is in the strip", keys(card("Mimikyu")), "base busted");
  });

  describe("one Mega, two pictures", () => {
    const mf = w.pokeCard(w.byName["Meowstic-Female"], {});
    check("female Meowstic draws HER Mega, not the male's",
       /\/10326\.png$/.test(src(mf.querySelectorAll(".megapic")[1])), true);
    const mm = w.pokeCard(w.byName["Meowstic"], {});
    check("and the male his",
       /\/10314\.png$/.test(src(mm.querySelectorAll(".megapic")[1])), true);
  });

  describe("a Pokemon Champions lacks brings its forms too", () => {
    const mw = w.pokeCard(w.anyRow("Mewtwo"), {});
    check("Mewtwo shows Mega X and Mega Y", keys(mw), "base mega X mega Y");
    check("with each letter's ink",
       !!mw.querySelector(".megapickey.mk-x") && !!mw.querySelector(".megapickey.mk-y"),
       true);
    check("and Mega X makes it Psychic/Fighting",
       [...mw.querySelectorAll(".rmeta .t")].map(x => x.textContent).join(","),
       "Psychic,Psychic,Fighting");
    check("Kyogre shows its Primal form",
       keys(w.pokeCard(w.anyRow("Kyogre"), {})), "base primal");
    const tz = w.pokeCard(w.anyRow("Tatsugiri-Droopy"), {});
    check("each Tatsugiri its own Mega, with its own picture",
       /\/10323\.png$/.test(src(tz.querySelectorAll(".megapic")[1])), true);
    const zy = w.pokeCard(w.anyRow("Zygarde"), {});
    check("Mega Zygarde, which only exists as a HOME render, uses it",
       /other\/home\/10301\.png$/.test(src(zy.querySelectorAll(".megapic")[1])), true);
    w.findDetail(w.anyRow("Mewtwo"));
    const mws = d.getElementById("sheetBody").textContent.replace(/\s+/g, " ");
    check("Mewtwo's sheet has its Mega line",
       /Mega line — 2 of them/.test(mws) && /Mega Mewtwo Y/.test(mws), true);
  });

  describe("every card has its picture", () => {
    const sid = w.CHAMP.SPRITE_ID;
    const names = w.CHAMP.DEX.map(r => r[0]).concat(Object.keys(w.CHAMP.HOME_DEX));
    check("no dex or HOME name without a sprite",
       names.filter(n => !sid[n]).join(", "), "");
    check("Arceus-Ice draws its plate, filed by form",
       /\/493-ice\.png$/.test(src(w.pokeCard(w.anyRow("Arceus-Ice"), {})
         .querySelector(".megapic"))), true);
    const pi = w.spriteFor("Pichu-Spiky-eared", true);
    check("a sheet with no HOME render falls back to the 96 sprite, at its size",
       /pokemon\/172-spiky-eared\.png$/.test(src(pi)) && pi.width === 96, true);
  });

  describe("a Pokemon with no battle form is unchanged", () => {
    const ga = card("Garchomp");
    check("Garchomp has no battle-form ink",
       !!ga.querySelector(".mk-b"), false);
    /* and a Mega that DOES retype keeps its two-state fade */
    check("Garchomp cycles two states, not four",
       ga.className.indexOf("n3") < 0 && /retyping/.test(ga.className), true);
    check("with a single layer", ga.querySelectorAll(".retype").length, 1);
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
