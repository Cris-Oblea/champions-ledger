/* THE CHECKLIST: what is still missing, and in what order to go after it.

   Champions' own route in is a gacha, so the dex is finished through Pokemon
   GO into HOME and the GTS for the rest. A list of everything he does not own
   in dex order answers nothing; what this pane is for is the ORDER - one copy
   per species, easiest first.

   The rule this pins down is the one that is easy to get backwards: a species
   already in HOME is DONE even when a copy is also welded into the Champions
   box, because the HOME copy is the one that makes the slot elastic. */
const { describe } = require("node:test");
const { check, open, idle, row: boxRow, click, one, all, byId, found } = require("./harness.js");

/** @param {string} id
   @param {string} name
   @param {string} location
   @param {string} status
   @param {string} origin */
const row = (id, name, location, status, origin) =>
  boxRow(id, name, {location, status, origin, trained:true});
/* Aggron is bought and welded, Meganium is a rental, Dragonite only exists in
   HOME, and Garchomp is in BOTH - which is the case that must NOT be listed. */
const ROWS = [
  row("aggron",    "Aggron",    "champions", "permanent", "champions"),
  row("meganium",  "Meganium",  "champions", "rental",    "champions"),
  row("dragonite", "Dragonite", "home",      "permanent", "home"),
  row("garchomp",  "Garchomp",  "champions", "permanent", "champions"),
  row("garchomp2", "Garchomp",  "home",      "permanent", "home"),
  row("dragonite2","Dragonite", "home",      "permanent", "home"),
  /* THE GTS REFUSES THEM, AND THEY ARE NOT THE SAME CASE. Melmetal was tried
     in game and refused: it drops out of the list. Celebi is a Mythical like
     Melmetal, which is ONE data point and not a rule, so it stays - last, and
     with a warning. */
  row("melmetal", "Melmetal",  "home",      "permanent", "home"),
  row("celebi",   "Celebi",    "home",      "permanent", "home"),
];

const { dom, errs } = open({ box: ROWS });
const w = dom.window, d = w.document;
/** @param {string} k */
const pane = k => found([...all(d, ".homeseg button")]
  .find(b => b.dataset.home === k), "the " + k + " pane");
/** THE NAME, NOT THE WHOLE LINE. A card's name line also carries badges - a
   difficulty chip, "frees a slot", a Worlds medal - and they are elements,
   while the name itself is the one bare text node pokeCard appends.
   @param {string} id */
const names = id => [...all(d, "#" + id + " .row.card .rname")]
  .map(x => [...x.childNodes].filter(n => n.nodeType === 3)
                             .map(n => n.textContent).join("").trim());

(async () => {
  await idle();
  w.go("home");

  describe("three panes, one switch", () => {
    check("starts on the box", byId(d, "homePaneBox").hidden, false);
    pane("gts").click();
    check("GTS opens", byId(d, "homePaneGts").hidden, false);
    check("...and the box closes", byId(d, "homePaneBox").hidden, true);
    pane("dex").click();
    check("Dex opens", byId(d, "homePaneDex").hidden, false);
    check("...and GTS closes", byId(d, "homePaneGts").hidden, true);
  });

  describe("what is missing, and in what order", () => {
    /* 264 = the dex without the Megas. A Mega is not caught, it is made with
       its stone, so it cannot be on a list of catches. */
    check("the goal is the dex without Megas",
       w.CHAMP.DEX.filter(p => !p[4]).length, 264);
    check("four species are his", /4 of 264/.test(
       byId(d, "dexDone").textContent), true);
    check("260 to go", byId(d, "nDexMissing").textContent, 260);
  });

  describe("and the ones he HAS in Champions are GTS targets", () => {
    /* WHAT HE HAS IN CHAMPIONS IS NOT A CHECKLIST: the Champions Box shows it.
       What the box cannot say is what to trade for it. */
    check("no 'frees a slot' list in Dex",
       !!d.getElementById("listDexFree"), false);
    pane("gts").click();
    /* THE CARDS ARE THE CHIPS, NOT THE TARGETS. Read from HOME: what his own
       rule lets him offer - a duplicate past the first copy, or a species
       Champions cannot use. The targets are on the "Ask for" line, and one
       that frees a slot is marked. */
    const chips = names("listGtsWant");
    check("Dragonite is a chip: a duplicate inside HOME",
       chips.indexOf("Dragonite") >= 0, true);
    /* AND GARCHOMP IS NOT, though it has two rows. One is Champions origin and
       can never leave the game, so it can never be the copy kept - the HOME
       one is the only real one. Duplicates count HOME-origin copies only. */
    check("not Garchomp, its second copy is Champions origin",
       chips.indexOf("Garchomp") >= 0, false);
    check("Aggron is not a chip, it is a target",
       chips.indexOf("Aggron") >= 0, false);
    const asks = [...all(d, "#listGtsWant .st")]
      .map(x => x.textContent).join(" ");
    check("and appears as something to ask for", /Aggron/.test(asks), true);
    /* WHAT IS ASKED FOR IS ALWAYS PLAYABLE: trading for something Champions
       cannot use buys a HOME row and nothing else. */
    check("and never proposes asking for something Champions lacks",
       [...all(d, "#listGtsWant .st .tag")]
         .every(t => !!w.byName[t.textContent]), true);
    /** THE FILTER, which is the question the screen opens with
       @param {string} v */
    const wantTog = v => [...all(d, "#gtsWantFilter button")]
      .find(b => b.dataset.want === v);
    check("there is a filter for the ones he cannot use", !!wantTog("outside"), true);
    check("Melmetal is not recommended: the GTS refuses it",
       names("listGtsWant").indexOf("Melmetal") >= 0, false);
    check("and that is said, not hidden",
       /Melmetal/.test(byId(d, "gtsWantSub").textContent), true);
    /* Celebi IS listed - one data point is not a rule - but last, and warned */
    const celebi = [...all(d, "#listGtsWant .row.card")]
      .find(c => [...one(c, ".rname").childNodes]
        .filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim()
          === "Celebi");
    check("Celebi is still listed", !!celebi, true);
    check("...warning that the GTS may refuse it",
       !!celebi && /GTS may refuse it/.test(celebi.textContent), true);
    click(wantTog("outside"));
    check("and leaves only those",
       names("listGtsWant").every(n => !w.byName[n]), true);
    click(wantTog("all"));
    check("marked as freeing a slot",
       !!d.querySelector("#listGtsWant .tag.ok"), true);
    check("the record comes from his own closed trades",
       /closed trades/.test(byId(d, "gtsWantSub").textContent) ||
       !w.CHAMP_GTS_ROWS, true);
    pane("dex").click();

    /* THE CASE THAT MATTERS: Garchomp is in the box AND in HOME, and neither
       list may ask for it. */
    check("Garchomp is not among the missing",
       names("listDexMissing").indexOf("Garchomp") >= 0, false);
    check("nor Aggron, he has it in Champions",
       names("listDexMissing").indexOf("Aggron") >= 0, false);
    check("nor Dragonite, which lives only in HOME",
       names("listDexMissing").indexOf("Dragonite") >= 0, false);
  });

  describe("the filter", () => {
    const inp = byId(d, "dexFilter");
    inp.value = "aggron";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("filters to nothing, because Aggron is not missing",
       !!d.querySelector("#listDexMissing .empty"), true);
    /* the name comes from the list itself, so the test does not depend on
       whether a given species is in Champions' roster */
    inp.value = "";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const first = names("listDexMissing")[0];
    inp.value = first.toLowerCase();
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("and finds what IS missing", names("listDexMissing").join(","), first);
    inp.value = "";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    check("and it undoes", byId(d, "nDexMissing").textContent, 260);
  });

  describe("HOME holds any name", () => {
    /* Oinkologne lives in HOME and not in Champions, and PokeAPI has no
       `oinkologne` row - the species is filed as `oinkologne-male` and
       `oinkologne-female`. A lookup by the bare name must still resolve, or
       the sheet is built from null. */
    const hd = w.CHAMP.HOME_DEX || {};
    ["Oinkologne", "Oinkologne-F", "Deoxys", "Giratina", "Shaymin", "Meloetta",
     "Keldeo", "Wormadam", "Darmanitan", "Minior", "Enamorus", "Dudunsparce",
     "Frillish", "Jellicent"].forEach(function(n){
      check(n + " has a row", !!(hd[n] && hd[n].b && hd[n].b[0]), true);
    });
    check("and the female is not the male", found((hd["Oinkologne-F"] || {b:[]}).b, "(hd['Oinkologne-F'] || {b:[]}).b").join("/"),
       "115/90/70/59/90/65");
    /* and a row no dex knows opens a sheet instead of throwing */
    w.pokeSheet(/** @type {ListedBox} */ ({name:"Syclant", location:"home", status:"permanent",
                 origin:"home", _id:"cap"}));
    check("a name no dex knows does not break the sheet",
       !!d.getElementById("sheetBody"), true);
    check("...and it says so", /not in any dex/.test(
       byId(d, "sheetBody").textContent), true);
    w.closeSheet();
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
