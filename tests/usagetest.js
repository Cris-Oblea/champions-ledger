/* What this Pokemon's own players run, in the build editor.

   Four things that can each go wrong on their own, all checked here:

     - pokebase paginates every per-Pokemon section CLIENT-SIDE, out of props
       the server already sent, so the rendered HTML only ever holds page 1
       (five moves of nineteen). The asset must carry every page.
     - the picker must badge EVERY move: a blank row reads as "no data" when
       it means "nobody brought it". Every move carries a percentage, and the
       sort defaults to it.
     - a nature dropdown of 25 in alphabetical order does not answer "what do
       people pick"; abilities the same.
     - the move percentage is a share of move SLOTS, not of sets, so nothing
       in that column can pass ~25 and a fixed "50% is popular" threshold
       would paint every move in the game as fringe.

   Rillaboom is the fixture: 19 moves over four pages, 26 spreads over six,
   and no Season block at all - the case that shows whether a parser mixes
   two different measurements.
*/
const { describe } = require("node:test");
const { check, open, idle, row, build, click, one, all, byId, found } = require("./harness.js");

const ROWS = [row("rillaboom", "Rillaboom", {trained:true})];
const BUILDS = [build("rillaboom", "Rillaboom", {ability:"Grassy Surge",
  nature:"Adamant", stat_points:{hp:32,atk:32,def:0,spa:0,spd:2,spe:0},
  moves:["Fake Out",null,null,null]})];

const { dom, errs } = open({ box: ROWS, builds: BUILDS });
const w = dom.window, d = w.document;
/** @param {[string, number][]} a */
const sum = a => a.reduce((n, r) => n + r[1], 0);
/** @param {string} t */
const foot = t => [...all(d, "#sheetFoot .btn")]
  .find(b => b.textContent.trim() === t);
/** @param {RegExp} re */
const slotWith = re => [...all(d, ".slot")].find(s => re.test(s.textContent));
/** The usage chip is its OWN element, and has to be read as one. Taken off the
   row's text it runs into the tag before it - "priority +4" followed by "2.2%"
   reads as "42.2%" - which is a measurement error in the test, not in the app.
   @param {ParentNode} r */
const usageOf = r => {
  const t = [...all(r, ".rname .tag")]
    .find(x => /^\d+(\.\d+)?%$/.test(x.textContent.trim()));
  return t ? Number(t.textContent.replace("%", "")) : null;
};
/** EVERY NUMBER ON A CARD IS A CELL: a <b> with the value and a <span> with the
   label under it. Reading the label and the value as the two elements they
   are cannot go stale the way matching prose would.
   @param {ParentNode} r */
const cells = r => [...all(r, ".statline > div, .cardline > div")];
/** ".lbl", not the first span: a cell whose value is a LIST holds one
   unbreakable span per item inside its <b>, so the first span in the cell is
   an ability name and not the caption.
   @param {ParentNode} r
   @param {string} lab */
const cellOf = (r, lab) => cells(r).find(c =>
  found((c.querySelector("span.lbl") || c.querySelector("span")), "a cell's caption")
    .textContent.trim() === lab);
/** Every number the cell draws: the base and what each Mega moves it to. BST
   writes them as "465 -> 565" and the stats as separate lines, so they are
   read from the whole cell, not from one label.
   @param {ParentNode} r
   @param {string} lab */
const cellNums = (r, lab) => (found(cellOf(r, lab), "cellOf(r, lab)").textContent.match(/\d+/g) || []).map(Number);
/** WHAT THE POKEMON REACHES, not what its base row says: the whole Mega line
   decides the order (Absol, Garchomp and Lucario rank by their Megas' Speed).
   Descending sorts on the highest number of the line...
   @param {ParentNode} r
   @param {string} lab */
const reachOf = (r, lab) => {
  const ns = cellNums(r, lab);
  return ns.length ? Math.max(...ns) : 0;
};
/** ...and ascending, which is the Trick Room list, on the LOWEST: a Mega that
   raises Speed does not help anyone go slow.
   @param {ParentNode} r
   @param {string} lab */
const lowOf = (r, lab) => {
  const ns = cellNums(r, lab);
  return ns.length ? Math.min(...ns) : 0;
};
/** @param {ParentNode} r */
const shareOf = r => Number(one(cellOf(r, "of teams"), "b").textContent.replace("%", ""));

/** The open sheet's chips and rows.
   @param {string} t */
const sheetChip = t => [...all(d, ".sheet .tog")]
  .find(b => b.textContent.trim() === t);
const sheetRows = () => [...all(d, ".sheet .list .row")];

(async () => {
  await idle();
  describe("the asset carries every page, not the first", () => {
    const S = w.CHAMP_SPLITS || {};
    check("regulation stamped in the asset", S.r, "M-C");
    const rilla = (S.p || {})["Rillaboom"] || {};
    check("Rillaboom's moves (4 pages of 5)", found(rilla.m, "rilla.m").length >= 19, true);
    check("Rillaboom's spreads (6 pages)", found(rilla.s, "rilla.s").length > 5, true);
    check("Rillaboom's items (4 pages)", found(rilla.i, "rilla.i").length >= 19, true);
    check("teammates with a %, not just an order", found(rilla.t, "rilla.t")[0].length === 2, true);
    check("and that % is a number", typeof found(rilla.t, "rilla.t")[0][1], "number");

    /* The measurement that decides how the chip may be coloured. If pokebase
       ever switches this column back to a share of SETS it sums to ~400 and
       every number in the app silently changes meaning. */
    check("moves sum to ~100 (share of SLOTS)", Math.abs(sum(found(rilla.m, "rilla.m")) - 100) < 12, true);
    check("items sum to ~100 (share of SETS)", Math.abs(sum(found(rilla.i, "rilla.i")) - 100) < 12, true);
    check("no move passes 30%", found(rilla.m, "rilla.m").every(r => r[1] <= 30), true);
  });

  /* ONE FACT, ONE CHIP, AND THE CHIP SAYS OF WHAT. Black Glasses could say
     x1.2 three times (the physical probe, the special one and Smogon's
     sentence), Life Orb could contradict itself (x1.2998 against 1.3x), and a
     chip reading "1/3" or "Double" names no subject. scripts/effect_chips.py
     decides all of that; this checks the result. */
  describe("one fact, one chip, and the chip says of what", () => {
    const E = w.CHAMP.EFFECTS || {};
    /** @param {string} n */
    const txt = n => (E[n].c || []).map(p => p[0]);
    const twice = Object.keys(E).filter(n => {
      const t = txt(n);
      return new Set(t).size !== t.length;
    });
    check("no entry repeats a chip", twice.join(", "), "");
    const units = Object.keys(E).filter(
      n => txt(n).some(t => / stages stages| turns turns|max HP max HP/.test(t)));
    check("no unit is written twice", units.join(", "), "");
    const bare = Object.keys(E).filter(
      n => txt(n).some(t => /^(half|double|third|quarter)$/i.test(t)));
    check("no chip is a bare word with no number", bare.join(", "), "");

    check("...and 1.2998 appears nowhere",
       JSON.stringify(E).indexOf("1.2998") >= 0, false);
    /* RULE 6: the description is Smogon's FULL text and states every number,
       so a chip only exists when it says something the description does not
       (Sitrus Berry's "1/2 HP" and "1/4 HP" chips said nothing). And Smogon's
       one-line summary under it would be the same description again. */
    const ABIL = w.CHAMP.ABIL, ITEMS = found(w.CHAMP.ITEMS, "ITEMS");
    /** @param {string} n */
    const itemText = n => ((ITEMS.find(r => r[0] === n) || [])[3]) || "";
    /** @param {string} n */
    const shown = n => ABIL[n] || itemText(n);
    check("Sitrus Berry has no chips repeating its sentence", E["Sitrus Berry"] ? txt("Sitrus Berry").length : 0, 0);
    check("...and its sentence states both figures",
       /1\/4 max HP when at 1\/2 max HP or less/.test(itemText("Sitrus Berry")), true);
    check("nor does Life Orb repeat 1.3 and 1/10", E["Life Orb"] ? txt("Life Orb").length : 0, 0);
    check("no description appears twice (no summary under it)",
       Object.keys(E).filter(n => shown(n) && E[n].desc).join(", "), "");
    check("no chip repeats a number of its description",
       Object.keys(E).filter(n => shown(n) && txt(n).length).join(", "), "");
    check("Intimidate says Mega Evolving fires it again",
       /Mega Evolving into it fires it again/.test(ABIL["Intimidate"]), true);
    check("Drizzle says how many turns", /for 5 turns/.test(ABIL["Drizzle"]), true);
  });
  await describe("the dropdowns are ordered by usage", async () => {
    w.go("builds");
    click(all(d, "#listBuilds .row")[0]);
    await idle();
    /** @param {string} lab */
    const sel = lab => found([...all(d, ".field")]
      .find(f => (f.querySelector("label") || {}).textContent &&
                 new RegExp(lab).test(one(f, "label").textContent)), "the field " + lab)
      .querySelector("select");
    const nat = found(sel("^Nature"), "nat");
    check("the first nature is the most used",
       nat.options[0].text.startsWith("Adamant"), true);
    check("and carries its %", /·\s+\d/.test(nat.options[0].text), true);
    const marked = [...nat.options].filter(o => /·\s+\d/.test(o.text));
    check("only the ones pokebase lists are marked",
       marked.length > 0 && marked.length < nat.options.length, true);
    check("the marked ones come first, in order",
       marked.every((o, i) => o.index === i), true);
    const abl = found(sel("^Ability"), "abl");
    check("the most used ability leads",
       abl.options[0].text.startsWith("Grassy Surge"), true);

    /* ------------------------------------------------ spreads and teammates */
    const txt = byId(d, "v-buildedit").textContent;
    check("there is a reference block", /What its players run/.test(txt), true);
    check("and it says it fills nothing in",
       /nothing here fills anything in/i.test(txt), true);
    /* An indicator sits beside a choice and changes nothing. A spread that
       can be CLICKED is an autobuilder. */
    check("the spreads are not buttons",
       [...all(d, "#v-buildedit .field")]
         .filter(f => /SP spreads/.test((f.querySelector("label")||{}).textContent||""))
         .every(f => all(f, "button").length === 0), true);
    check("and who it is brought with appears", /Brought alongside/.test(txt), true);
    check("Sneasler among them", /Sneasler/.test(txt), true);
  });
  await describe("the picker marks EVERY move", async () => {
    click(slotWith(/Fake Out/));
    await idle();
    check("there is a usage sort", !!sheetChip("Usage %"), true);
    check("and it is the default",
       found(sheetChip("Usage %"), "sheetChip('Usage %')").getAttribute("aria-pressed"), "true");
    const rr = sheetRows();
    check("there are rows", rr.length > 10, true);
    check("all carry a %", rr.every(r => usageOf(r) !== null), true);
    const ps = rr.map(usageOf);
    check("highest to lowest",
       ps.every((v, i) => i === 0 || found(ps[i - 1], "ps[i - 1]") >= found(v, "v")), true);
    check("the first is the most used", found(ps[0], "ps[0]") >= 20, true);
    check("and the tail reaches 0%", ps[ps.length - 1], 0);
  });

  describe("the multi-hit tag", () => {
    const inp = one(d, ".sheet input[type=text]");
    inp.value = "bullet seed";
    inp.dispatchEvent(new w.Event("input", {bubbles:true}));
    const bs = sheetRows()[0];
    check("Bullet Seed says it hits several times",
       /2–5 hits/.test(one(bs, ".rname").textContent), true);
    check("and the total is in the title",
       /quoted at 3 hits = 75 BP/.test(
         one(bs, ".rname .tag.ok").title), true);
    check("and it names Skill Link",
       /Skill Link forces 5 = 125 BP/.test(
         one(bs, ".rname .tag.ok").title), true);
  });

  await describe("Clear slot and Back close the sheet", async () => {
    check("both are there", !!foot("Clear slot") && !!foot("Back"), true);
    click(foot("Back"));
    await idle();
    check("Back closes the sheet", byId(d, "scrim").hidden, true);
    check("and leaves the move alone",
       /Fake Out/.test(byId(d, "v-buildedit").textContent), true);
    click(slotWith(/Fake Out/));
    await idle();
    click(foot("Clear slot"));
    await idle();
    check("Clear slot closes the sheet", byId(d, "scrim").hidden, true);
    check("and empties the slot",
       /Empty slot 1/.test(byId(d, "v-buildedit").textContent), true);
  });
  await describe("one table, with filters and a sort by stat", async () => {
    /* A tier list IS Find's list sorted by one column, so it composes with
       every filter - a speed tier can also be "and it learns Fake Out and I
       own it". No separate tiers block, no fixed Speed boxes. */
    w.go("find");
    await idle();
    /** The active tab's label carries an arrow, so an exact match would
       stop finding it the moment it is selected.
       @param {string} t */
    const sortTab = t => [...all(d, "#findSort .tog")]
      .find(b => b.textContent.trim().replace(/[↑↓]/, "").trim() === t);
    ["Dex #","BST","HP","Atk","Def","SpA","SpD","Spe"].forEach(t =>
      check("sort by " + t, !!sortTab(t), true));
    check("no fixed Speed boxes",
       !d.getElementById("findSpeMin") && !d.getElementById("findSpeMax") &&
       !d.getElementById("findBst"), true);
    /* And no min/max either: an order answers "who is slowest" without a
       threshold guessed in advance. */
    check("no minimums or maximums", !d.getElementById("findAddStat"), true);
    check("BST is the default sort",
       found(sortTab("BST"), "sortTab('BST')").getAttribute("aria-pressed"), "true");

    const rows = () => [...all(d, "#findOut .row")];
    const vr = rows().map(r => reachOf(r, "BST"));
    check("there are rows", vr.length > 20, true);
    check("sorted by BST", vr.every((x,i) => i===0 || vr[i-1] >= x), true);

    /* NOTHING IS HIDDEN. Ranking by one stat must not drop the other five -
       an Attack list is read with the Speed beside it. The ranked one is
       marked instead. */
    click(sortTab("Spe"));
    const sp = rows().map(r => reachOf(r, "Spe"));
    check("switching to Spe reorders the same table",
       sp.every((x,i) => i===0 || sp[i-1] >= x), true);
    check("and all six stats are still there",
       ["HP","Atk","Def","SpA","SpD","Spe"].every(k => !!cellOf(rows()[0], k)),
       true);
    check("the ranked one is marked",
       one(rows()[0], ".statline .on span").textContent.trim(), "Spe");
    /* BST AND THE ABILITY ARE CELLS TOO, so the card speaks one visual
       language - and a cell is the only shape this file can assert without
       matching prose. */
    check("BST has its own cell", !!cellOf(rows()[0], "BST"), true);
    /* "Possible ability", not "Ability": a dex row lists what this Pokemon
       CAN have, while a build row shows the one it runs. */
    check("and so does the ability",
       !!cellOf(rows()[0], "Possible ability"), true);
    check("the ability says something",
       one(cellOf(rows()[0], "Possible ability"), "b")
         .textContent.length > 2, true);
    /* SP and nature are the builder's business, not the list's. */
    check("no SP in the listing",
       /at 0 SP|max/.test(rows()[0].textContent), false);
    check("the header says what it sorts by",
       /by Spe, highest first/.test(
         one(d, "#findOut .sub").textContent), true);
    check("and the active tab carries the arrow",
       /↓/.test(found(sortTab("Spe"), "sortTab('Spe')").textContent), true);

    /* Tapping the active stat flips the direction - and ascending Speed IS
       the Trick Room list, which is why there is no "Speed at most" box. */
    click(sortTab("Spe"));
    const asc = rows().map(r => lowOf(r, "Spe"));
    check("tapping it again reverses the order",
       asc.every((x,i) => i===0 || asc[i-1] <= x), true);
    check("and the header says so",
       /by Spe, lowest first/.test(
         one(d, "#findOut .sub").textContent), true);
    check("with the arrow flipped",
       /↑/.test(found(sortTab("Spe"), "sortTab('Spe')").textContent), true);
    click(sortTab("Spe"));   // back to descending

    /* No "current regulation only" scope toggle: it was unclear and cut. The
       two box filters stay. */
    check("no M-C filter", !d.getElementById("findInMeta"), true);
    check("but the box ones are there",
       !!d.getElementById("findInChamp") && !!d.getElementById("findInHome"),
       true);
    click(sortTab("Atk"));
    click(d.getElementById("findClear"));
    check("Clear goes back to BST",
       found(sortTab("BST"), "sortTab('BST')").getAttribute("aria-pressed"), "true");
  });

  /* THE PODIUM. A result, not a rate - and the Mega it became is resolved by
     the stone it held, because a teamlist records the BASE ability and so
     cannot tell you. The 2026 champion ran a Floette holding a Floettite and
     a Dragonite holding a Dragoninite; both were Megas. */
  await describe("Worlds medals, and the set that won them", async () => {
    const P = w.CHAMP.PODIUM || {};
    check("there are forms with a podium", Object.keys(P).length > 20, true);
    /* FILED UNDER WHAT WAS REGISTERED. Of the 16,875 team slots pokedata
       publishes, zero are written as "Mega something" - the entrant is always
       the base form holding a stone, and that is who wears the medal. */
    check("nothing is filed as a Mega",
       Object.keys(P).some(k => k.startsWith("Mega ")), false);
    const champ = found((P["Dragonite"] || []).find(
      e => e.y === 2026 && e.d === "masters" && e.r === 1), "champ");
    check("Dragonite won the 2026 masters", !!champ, true);
    check("with its whole set",
       champ.it === "Dragoninite" && champ.ab === "Multiscale" &&
       champ.na === "Modest" && found(champ.mv, "champ.mv").length === 4, true);
    /* and the stone says what it became, derived rather than deduced by hand */
    check("and the stone says which Mega it becomes", champ.mg, "Mega Dragonite");
    check("and with which ability", !!champ.mgab, true);
    check("Floette was on that team too",
       (P["Floette-Eternal"] || []).some(
         e => e.y === 2026 && e.d === "masters" && e.r === 1 &&
              e.mg === "Mega Floette"), true);
    check("no podium goes past the top 8",
       Object.values(P).every(v => v.every(e => e.r >= 1 && e.r <= 8)), true);
    /* 2023 split its divisions across two pokedata events; reading both gave
       Seniors and Juniors two podiums each */
    const dupes = Object.values(P).some(v => {
      /** @type {Record<string, number>} */
      const seen = {};
      return v.some(e => {
        const k = e.y + e.d + e.r + e.who;
        if (seen[k]) return true;
        seen[k] = 1; return false;
      });
    });
    check("no duplicate entries (2023 spans two events)", dupes, false);

    w.closeSheet();
    const dex = w.CHAMP.DEX.map(r => ({name:r[0], species:r[1], types:r[2],
      b:r[3], mega:!!r[4], ab:r[5], dex:r[6]||0}));
    w.findDetail(found(dex.find(x => x.name === "Dragonite"), "dex.find(x => x.name === 'Dragonite')"));
    await idle();
    check("the sheet wears the medal",
       /Worlds 2026 · 1st/.test(
         (d.querySelector(".sheet .tag.gold")||{}).textContent||""), true);
    const fold = [...all(d, ".sheet .fold")]
      .find(b => /Worlds/.test(b.textContent));
    check("and a fold with the sets", !!fold, true);
    click(fold);
    const card = found([...all(d, ".sheet .note")]
      .find(n => /Worlds \d{4}/.test(n.textContent)), "card");
    check("showing item, ability, nature and moves",
       /Dragoninite/.test(card.textContent) &&
       /Multiscale/.test(card.textContent) &&
       /Modest/.test(card.textContent) &&
       /Extreme Speed/.test(card.textContent), true);
    check("and the division", /masters/.test(card.textContent), true);
    check("and which Mega it evolves into",
       /Mega Evolves into Mega Dragonite/.test(card.textContent), true);
  });

  /* HISTORY, and it must keep saying so. A Worlds is played once under one
     regulation and frozen; 2026 was M-B. The three divisions are three
     metagames off one roster and must never be pooled - if an "All" tab ever
     appears here, that rule has been broken. */
  describe("Worlds: history, by year and by division", () => {
    w.closeSheet();
    /** @param {string} t */
    const yr = t => [...all(d, "#worldYear .tog")]
      .find(b => b.textContent.trim() === t);
    /** @param {string} t */
    const dv = t => [...all(d, "#worldDiv .tog")]
      .find(b => b.textContent.trim() === t);
    const rows = () => [...all(d, "#worldOut .row")];
    check("there is a 2026 tab", !!yr("2026"), true);
    check("and earlier years", !!yr("2024"), true);
    check("the latest is the default",
       found(yr("2026"), "yr('2026')").getAttribute("aria-pressed"), "true");
    check("three divisions", !!dv("Masters") && !!dv("Seniors") && !!dv("Juniors"),
       true);
    check("and NO tab that pools them",
       [...all(d, "#worldDiv .tog")]
         .some(b => /all|todas/i.test(b.textContent)), false);
    const rr = rows();
    check("Masters 2026 has rows", rr.length > 10, true);
    check("Kingambit leads", /Kingambit/.test(rr[0].textContent), true);
    /* The share and the count are two cells, not one sentence: a ranking is
       the one place numbers have to be scannable down the column. */
    check("with its team count",
       /^\d+ \/ \d+$/.test(one(cellOf(rr[0], "brought it"), "b").textContent.trim()), true);
    const ps = rr.map(shareOf);
    check("highest to lowest", ps.every((v, i) => i === 0 || ps[i - 1] >= v), true);
    click(dv("Juniors"));
    check("Juniors is another list", rows().map(shareOf)[0] !== ps[0] ||
       rows()[0].textContent !== rr[0].textContent, true);
    check("and the header says so",
       /juniors/.test(one(d, "#worldOut .sub").textContent), true);
  });

  /* THE SPECIFICITY TRAP. A field rule guarded by a bare `:not()` chain takes
     the specificity of its ARGUMENT - (0,4,1), heavier than any sane rule
     aimed at a field - and the rules it beats lose in silence: nothing in CSS
     says out loud that a rule never applied. Asserted so it cannot return. */
  await describe("the fields get the style written for them", async () => {
    /** @param {Element} n */
    const cs = n => w.getComputedStyle(n);
    w.go("find");
    click(d.getElementById("findAddMove"));
    await idle();
    const si = one(d, ".sheet .search input");
    const svg = one(d, ".sheet .search svg");
    check("the text starts after the magnifier",
       parseFloat(cs(si).paddingLeft) >= 34, true);
    check("and the magnifier does not eat the click", cs(svg).pointerEvents, "none");
    w.closeSheet();
    const pass = byId(d, "gatePass");
    check("the password field leaves room for the browser's eye",
       parseFloat(cs(pass).paddingRight) >= 34, true);
    w.go("builds");
    click(all(d, "#listBuilds .row")[0]);
    await idle();
    const num = one(d, ".sp .spnum");
    check("the SP number box uses its own padding", cs(num).padding, "6px 2px");
    const normal = cs(num).color;
    found(num.closest(".sp"), "num.closest('.sp')").classList.add("over");
    const over = cs(num).color;
    check("and turns red past the 32 cap", over !== normal, true);
    found(num.closest(".sp"), "num.closest('.sp')").classList.remove("over");
  });
  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
