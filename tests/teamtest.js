/* The team builder: six slots, and the rules of the format checked rather than
   remembered.

   A team is what the game asks about: not what one Pokemon runs, but what he
   is BRINGING. Three things decide its shape, and each is asserted here:

     A slot points at a BUILD, not a box row - so one Pokemon can sit in any
     number of teams, and three different Farigiraf are three different
     answers.

     THE ITEM LIVES ON THE SLOT. The Item Clause means six Pokemon field
     exactly one Sitrus Berry, so an item stored per build is a preference that
     cannot survive contact with a team. That is why builds carry none.

     A TEAM MAY BE INCOMPLETE. Four of six is worth writing down; the app says
     what he has, where it is, and what is still to get.

   The fixture breaks both clauses on purpose. */
const { describe } = require("node:test");
const { check, open, idle, row, build } = require("./harness.js");
const UID = "u1";

const B = (id, pokemon, box_id, extra) => build(id, pokemon, {box_id,
  nature:"Adamant", stat_points:{hp:0,atk:32,def:0,spa:0,spd:2,spe:32},
  moves:["Protect"], ...extra});

const ROWS = [row("garchomp", "Garchomp", {trained:true}),
              row("farigiraf", "Farigiraf", {trained:true}),
              row("sableye", "Sableye", {location:"home", origin:"home", trained:true})];
const BUILDS = [B("garchomp","Garchomp","garchomp",{moves:["Earthquake","Protect"], ability:"Rough Skin"}),
                B("farigiraf","Farigiraf","farigiraf",{role:"Trick Room"}),
                B("farigiraf-2","Farigiraf","farigiraf",{role:"Armor Tail"}),
                B("sableye","Sableye","sableye"),
                B("kingambit-idea","Kingambit",null),
                /* Ampharos Electric -> Electric/Dragon: the stone changes the
                   typing, so its team has TWO profiles. */
                B("ampharos","Ampharos",null,{mega:"Mega Ampharos"}),
                /* Camerupt Fire/Ground -> Fire/Ground: the stone changes no
                   typing (only the Speed). */
                B("camerupt","Camerupt",null,{mega:"Mega Camerupt"})];
const TEAMS = [{user_id:UID, id:"t1", name:"Trial", slots:[
  {build_id:"garchomp",      item:"Life Orb",     why:"power"},
  {build_id:"farigiraf",     item:"Sitrus Berry", why:"bulk"},
  {build_id:"farigiraf-2",   item:"Focus Sash",   why:"second Farigiraf, on purpose"},
  {build_id:"sableye",       item:"Life Orb",     why:"repeated item, on purpose"},
  {build_id:"kingambit-idea",item:"Leftovers",    why:"not owned yet"}
], notes:{}, updated_at:"2026-09-13"},
  {user_id:UID, id:"t2", name:"Stones", slots:[
    {build_id:"ampharos", item:"", why:""},
    {build_id:"camerupt", item:"", why:""},
    {build_id:"garchomp", item:"", why:""}
  ], notes:{}, updated_at:"2026-09-13"}];

const { dom, errs } = open({ box: ROWS, builds: BUILDS, teams: TEAMS });
const w = dom.window, d = w.document;

const find = (rows, n) => rows.find(x => new RegExp(n).test(x.form));
const byType = (t, rows) => rows.find(x => x.type === t);

(async () => {
  await idle();
  const r = w.teamReport(w.S.teams.t1);

  describe("what he has, where it is, and what is missing", () => {
    check("five slots filled", r.filled, 5);
    check("and always six", r.slots.length, 6);
    check("three can be brought today", r.ready, 3);
    check("it names the one still to get", r.missing.join(","), "Kingambit");
    check("and warns about the one in HOME",
       r.warnings.some(x => /Sableye is parked in HOME/.test(x)), true);
  });

  describe("the clauses, checked rather than remembered", () => {
    check("Species Clause: two Farigiraf",
       r.problems.some(x => /two Farigiraf.*Species Clause/.test(x)), true);
    check("Item Clause: two Life Orb",
       r.problems.some(x => /two Life Orb.*Item Clause/.test(x)), true);
    check("and nothing else is called illegal", r.problems.length, 2);
  });

  describe("what is derived", () => {
    check("Speed order, fastest first",
       r.speeds[0].name, "Garchomp");
    /* Stellar is in the type chart and NOT in Champions - there is no Tera here,
       so counting it would invent a weakness nothing can exploit. */
    check("Stellar does not count as a weakness",
       w.teamTypes(r).some(x => x.type === "Stellar"), false);
    check("the shared weaknesses come out sorted",
       w.teamTypes(r)[0].weak >= w.teamTypes(r)[5].weak, true);
  });

  describe("the list", () => {
    /* Teams shares the Builds tab: an eighth tab would wrap the phone's bar
       onto two rows. */
    w.go("builds");
    w.buildsPane("teams");
    check("there is no Teams tab",
       [...d.querySelectorAll("#tabs button, #tabs a")]
         .some(b => b.textContent.trim() === "Teams"), false);
    check("and the teams pane shows",
       d.getElementById("teamsPane").hidden, false);
    check("while the builds pane hides",
       d.getElementById("buildsPane").hidden, true);
    /* TWO teams in the list, and "Stones" sorts before "Trial" - so the row
       is found by its name, not by its position. */
    const row = [...d.querySelectorAll("#listTeams .row")]
      .find(x => /Trial/.test(x.textContent));
    check("the team is listed", !!row, true);
    check("with how many slots it fills", /5\/6/.test(row.textContent), true);
    check("how many are playable today", /3 playable today/.test(row.textContent), true);
    check("and what is illegal", /2 illegal/.test(row.textContent), true);
  });

  /* A slot's build picker: it is picked out of every build in the ledger, so
     it needs a search box and filters. */
  describe("a slot's picker: search and filters", () => {
    w.teamSheet("t1", w.S.teams.t1);
    const fill = [...d.querySelectorAll("#teamEditBody button")]
      .filter(b => /^(Change|Fill)$/.test(b.textContent.trim()));
    check("every slot has its button", fill.length >= 6, true);
    fill[0].click();                       /* slot 1, Garchomp's */
    const sb = d.getElementById("sheetBody");
    const inp = sb.querySelector(".search input");
    const rows = () => [...sb.querySelectorAll(".list .row")];
    check("the picker has a search box", !!inp, true);
    check("and all seven builds are there", rows().length, 7);
    check("it says how many", /7 builds/.test(sb.textContent), true);

    inp.value = "armor"; inp.oninput();
    check("searches the build's ROLE", rows().length, 1);
    check("and finds the one with that role",
       /Farigiraf/.test(rows()[0].textContent), true);
    inp.value = "earthquake"; inp.oninput();
    check("searches a MOVE", rows().length, 1);
    check("and finds its Pokemon", /Garchomp/.test(rows()[0].textContent), true);
    inp.value = "dragon"; inp.oninput();
    /* Garchomp, and the Ampharos build because its stone makes it
       Electric/Dragon - the filter reads the form it PLAYS AS */
    check("searches by TYPE", rows().length, 2);
    check("and finds the type a stone gives",
       /Ampharos/.test(sb.textContent), true);
    check("the counter says so", /2 of 7 builds/.test(sb.textContent), true);

    /* the X: without it a filter is emptied by backspacing */
    sb.querySelector(".search .clr").click();
    check("the X empties the field", inp.value, "");
    check("and they all come back", rows().length, 7);

    /* The Species Clause is enforced HERE, as the Item Clause is in the item
       picker: a species another slot holds is greyed out with the reason
       written, rather than accepted and called illegal afterwards. */
    const dis = rows().filter(r => r.disabled);
    check("the species already on the team are greyed out", dis.length, 4);
    check("with the reason written",
       /no team may run two of the same species/.test(sb.textContent), true);
    /* the greyed ones go last, so the first row is always pickable */
    check("and a pickable one comes first", rows()[0].disabled, false);
    check("with the greyed ones last",
       rows()[rows().length - 1].disabled, true);

    /* WHERE A COPY IS, IS THE BOXES' QUESTION. A team can be theoretical, so
       that filter has no place here. */
    const chip = t => [...sb.querySelectorAll(".tog")]
      .find(b => b.textContent.trim().indexOf(t) === 0);
    check("no filter by where it is", !!chip("Ready today"), false);
    check("nor by whether he owns it", !!chip("Not owned"), false);
    check("nor a sort by that", !!chip("Ready first"), false);

    /* Only A-Z and Dex in view; the stats, all of them, folded. */
    check("sorts A–Z", !!chip("A–Z"), true);
    check("and by Dex", !!chip("Dex no."), true);
    const fold = t => [...sb.querySelectorAll(".btn.fold")]
      .find(b => b.textContent.indexOf(t) >= 0);
    check("the stats sit behind a fold", !!fold("By a stat"), true);
    const statRow = fold("By a stat").nextSibling;
    check("closed at first", statRow.hidden, true);
    fold("By a stat").click();
    check("and it opens", statRow.hidden, false);
    /* if BST and Speed are there, all six are: half a list is arbitrary */
    ["BST", "HP", "Atk", "Def", "SpA", "SpD", "Spe"].forEach(function(k){
      check("  sorts by " + k, !!chip(k), true);
    });
    chip("Spe").click();
    check("fastest first", /Garchomp/.test(rows()[0].textContent), true);

    /* Role takes too much room, so it is folded, always. */
    check("role is folded", !!fold("Role"), true);
    const roleRow = fold("Role").nextSibling;
    check("closed at first", roleRow.hidden, true);
    fold("Role").click();
    check("and it opens", roleRow.hidden, false);
    check("with the roles that exist", !!chip("Trick Room"), true);
    chip("Trick Room").click();
    check("filters by role", rows().length, 1);
    chip("Trick Room").click();
    check("releasing it brings them all back", rows().length, 7);

    /* The item picker searches, and filters too. */
    w.teamSheet("t1", w.S.teams.t1);
    const it = [...d.querySelectorAll("#teamEditBody button")]
      .find(b => /^(\+ Item|Item)$/.test(b.textContent.trim()));
    it.click();
    const ib = d.getElementById("sheetBody");
    check("the item picker searches too", !!ib.querySelector(".search input"), true);
    const icat = t => [...ib.querySelectorAll(".tog")]
      .some(b => b.textContent.indexOf(t) === 0);
    check("filters by category", icat("Berries"), true);
    check("and by what he owns",
       [...ib.querySelectorAll(".tog")]
         .some(b => /Only ones you own/.test(b.textContent)), true);

    /* ONLY WHAT CAN BE HELD: every Mega Stone (C.ITEMS leaves them out, so they
       come from C.STONES), and nothing Miscellaneous, which cannot be held. */
    check("Mega Stones can be equipped", icat("Mega Stones"), true);
    check("and Miscellaneous is not offered", icat("Miscellaneous"), false);
    const irow = n => [...ib.querySelectorAll(".list .row")]
      .find(r => r.textContent.indexOf(n) === 0);
    check("a given stone is there", !!irow("Garchompite"), true);
    check("and can be tapped", irow("Garchompite").disabled, false);
    check("marked as a stone",
       /Mega Stone/.test(irow("Garchompite").textContent), true);
    const misc = [...ib.querySelectorAll(".list .row")]
      .some(r => /Rare Candy|Exp\. Share|Ability Capsule/.test(r.textContent));
    check("nothing unholdable in the list", misc, false);

    /* And the Speed order with each build's REAL number. */
    w.teamSheet("t1", w.S.teams.t1);
    const sp = w.teamReport(w.S.teams.t1).speeds;
    /* Garchomp: base 102, +32 SP, Adamant leaves Speed alone -> 102+32+20 = 154 */
    check("real Speed, not the base", sp[0].spe, 154);
    check("and it says where it comes from", sp[0].base, 102);
    check("with the SP invested", sp[0].sp, 32);
    check("fastest first", sp[0].name, "Garchomp");
    check("and slowest last", sp[sp.length - 1].spe <= sp[0].spe, true);
    check("the screen writes it",
       /154/.test(d.getElementById("teamEditBody").textContent), true);

    /* The weaknesses say WHO and BY HOW MUCH. */
    const weak = d.getElementById("teamEditBody").textContent;
    check("names who is weak", /weak: [A-Z]/.test(weak), true);
    check("with the multiplier", /weak: [^\n]*×\d/.test(weak), true);
    check("and who resists", /resists: |nothing on the team resists it/.test(weak),
       true);
    const tt = w.teamTypes(w.teamReport(w.S.teams.t1));
    const one = tt.find(x => x.weak);
    check("and the data carries the names", one.weakOf.length, one.weak);
    check("with each one's multiplier", typeof one.weakOf[0].m, "number");
  });

  /* A SLOT'S CARD CARRIES THE WHOLE SET, so a team can be read without
     opening six builds. */
  await describe("the slot's card, and the shortcut to the build", async () => {
    w.teamSheet("t1", w.S.teams.t1);
    const eb = d.getElementById("teamEditBody");
    const slot0 = eb.querySelectorAll(".list .row")[0];
    check("the card names the chosen ability",
       /Rough Skin/.test(slot0.textContent), true);
    check("and the label says it is THE one",
       /Ability/.test(slot0.textContent), true);
    check("it carries the nature", /Adamant/.test(slot0.textContent), true);
    check("it carries the SP", /0\/32\/0\/0\/2\/32/.test(slot0.textContent), true);
    check("and the move NAMES, not a count",
       /Earthquake/.test(slot0.textContent) && /Protect/.test(slot0.textContent),
       true);
    check("the item keeps its cell", /Life Orb/.test(slot0.textContent), true);

    const edBtn = [...eb.querySelectorAll("button")]
      .filter(b => b.textContent.trim() === "Edit set");
    check("every filled slot has a shortcut to its build", edBtn.length, 5);
    edBtn[0].click();
    /* THE SHORTCUT SAVES THE TEAM BEFORE LEAVING, and that is a promise: both
       editors are views, so jumping without saving would lose the draft. The
       test waits for that write the way the screen does. */
    await idle();
    check("and it opens the build editor",
       d.getElementById("v-buildedit").hidden, false);
    check("the team editor closes", d.getElementById("v-teamedit").hidden, true);
    check("and it is the right build",
       /Garchomp/.test(d.getElementById("buildEditTitle").textContent), true);
  });

  /* ONE SELECTOR, TWO SECTIONS. Only one Pokemon may Mega Evolve per battle,
     and a Pokemon only takes its Mega's stats by evolving - so "nobody
     evolves" and "this one evolves" are different teams, and the Speed order
     and the weaknesses must tell the SAME story. */
  describe("one world at a time: Speed and types under one selector", () => {
    const r2 = w.teamReport(w.S.teams.t2);
    const megaCase = n => r2.megaCases.find(x => new RegExp(n).test(x.mega));

    /* Ampharos retypes AND changes Speed; Camerupt does NOT retype but DOES
       change Speed, which filtering by retyping alone would have lost. */
    check("two stones change something", r2.megaCases.length, 2);
    check("Ampharos retypes", megaCase("Ampharos").retype, true);
    check("from Electric", megaCase("Ampharos").from.join("/"), "Electric");
    check("to Electric/Dragon", megaCase("Ampharos").to.join("/"), "Electric/Dragon");
    check("Camerupt does NOT retype", megaCase("Camerupt").retype, false);
    check("but does change Speed", megaCase("Camerupt").respeed, true);
    check("from 40", megaCase("Camerupt").speFrom, 40);
    check("to 20", megaCase("Camerupt").speTo, 20);

    /* THE SPEED FOLLOWS THE SELECTOR. Unevolved, the stone does nothing. */
    const spBase = w.teamSpeeds(r2, null);
    const spCam  = w.teamSpeeds(r2, megaCase("Camerupt").i);
    check("unevolved, Camerupt runs at its base", find(spBase, "Camerupt").base, 40);
    check("and is not called Mega", /^Camerupt$/.test(find(spBase, "Camerupt").form), true);
    check("evolved, it drops to the Mega's base",
       find(spCam, "Mega Camerupt").base, 20);
    check("and the rest of the team does not move",
       find(spCam, "Ampharos").base, find(spBase, "Ampharos").base);
    check("only one evolves at a time",
       spCam.filter(x => x.mega).length, 1);
    check("and in the base world, none", spBase.filter(x => x.mega).length, 0);

    /* THE TYPES FOLLOW THE SAME SELECTOR. */
    const base = w.teamTypes(r2, null);
    const mega = w.teamTypes(r2, megaCase("Ampharos").i);
    check("before evolving it is not weak to Ice",
       byType("Ice", base).weakOf.some(x => /Ampharos/.test(x.name)), false);
    check("after, it is",
       byType("Ice", mega).weakOf.some(x => /Mega Ampharos/.test(x.name)), true);
    check("and the table names it by its Mega form",
       byType("Ice", mega).weakOf.find(x => /Ampharos/.test(x.name)).name,
       "Mega Ampharos");
    check("Fairy starts hitting it",
       byType("Fairy", mega).weakOf.some(x => /Mega Ampharos/.test(x.name)), true);
    check("which it did not before",
       byType("Fairy", base).weakOf.some(x => /Ampharos/.test(x.name)), false);

    /* And on screen: ONE selector, and the two sections under it. */
    w.teamSheet("t2", w.S.teams.t2);
    const eb2 = d.getElementById("teamEditBody");
    const seg = [...eb2.querySelectorAll(".seg")].pop();
    const tabs = seg ? [...seg.children].map(b => b.textContent.trim()) : [];
    check("three worlds", tabs.length, 3);
    check("and nobody's comes first", tabs[0], "Nobody evolves");
    check("it starts there", seg.children[0].getAttribute("aria-pressed"), "true");
    check("it says the two below follow it",
       /Speed order and the weaknesses below both follow this choice/
         .test(eb2.textContent), true);
    check("the selector sits ABOVE the Speed order",
       eb2.textContent.indexOf("Which one Mega Evolves")
         < eb2.textContent.indexOf("Speed order"), true);

    /* THE SPEED BLOCK ONLY. A Mega's name also lives on the selector's tab and
       on the slot's card, so searching the whole editor says nothing about
       which form is in use. */
    const speedTxt = () => {
      const h = [...eb2.querySelectorAll("h2")].find(x => /Speed order/.test(x.textContent));
      return h.nextSibling.textContent.replace(/\s+/g, " ");
    };
    const camTab = tabs.findIndex(t => /Camerupt/.test(t));
    seg.children[camTab].click();
    check("picking Camerupt says so with its Speed",
       /Speed 40 → 20/.test(eb2.textContent), true);
    check("and the order names it Mega", /Mega Camerupt/.test(speedTxt()), true);
    check("with the other one unevolved", /Mega Ampharos/.test(speedTxt()), false);

    const ampTab = tabs.findIndex(t => /Ampharos/.test(t));
    seg.children[ampTab].click();
    check("switching explains the type change",
       /Electric → Electric\/Dragon/.test(eb2.textContent), true);
    check("and now the other one evolves",
       /Mega Ampharos/.test(speedTxt()), true);
    check("with Camerupt back in its base form",
       /Mega Camerupt/.test(speedTxt()), false);
    check("and its Speed back to its base",
       /40 base/.test(speedTxt()), true);

    /* A team with no stone that changes anything gets no controls. */
    w.teamSheet("t1", w.S.teams.t1);
    const eb1 = d.getElementById("teamEditBody");
    check("no change, no selector",
       /Which one Mega Evolves/.test(eb1.textContent), false);
    check("but the table is still there", /weak: /.test(eb1.textContent), true);
    check("and so is the Speed order",
       /Speed order/.test(eb1.textContent), true);
  });

  describe("the tabs' own filters", () => {
    check("the builds filter has its X",
       !!d.querySelector("#buildSearch").parentNode.querySelector(".clr"), true);
    const bf = d.getElementById("boxFilter");
    check("the Champions Box has a filter", !!bf, true);
    const champ = () => d.querySelectorAll("#listChampOrigin .row").length;
    check("and both Encounter ones are there", champ(), 2);
    bf.value = "farigiraf"; bf.oninput();
    check("filters by name", champ(), 1);
    check("and the heading says how many of how many",
       d.getElementById("nChampOrigin").textContent, "1 of 2");
    bf.parentNode.querySelector(".clr").click();
    check("the X brings it all back", champ(), 2);
    check("and the heading returns to the total",
       d.getElementById("nChampOrigin").textContent, "2");
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
