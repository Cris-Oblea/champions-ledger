/* A build is its own thing, and box_id says which Pokemon is carrying it.

   Several builds per species, and builds for Pokemon he does not own yet,
   so an idea is not lost for want of a row to hang it on.

     linked, in the Champions box -> active
     linked, parked in HOME       -> kept, inactive (nothing trains in HOME)
     linked to a row that is gone -> orphan, and still worth flagging
     not linked at all            -> unbound: an idea, which is fine

   A release UNBINDS rather than deletes. The fixtures below cover all four
   states, including two builds on one Pokemon. */
const { describe } = require("node:test");
const { check, open, idle, until, row, build, click } = require("./harness.js");

const R = (id, name, location, origin) =>
  row(id, name, {location, origin, trained:true});
const ROWS = [
  R("garchomp", "Garchomp", "champions", "champions"),
  R("dragonite", "Dragonite", "home", "home"),
  R("sylveon", "Sylveon", "champions", "home"),   // HOME origin, in the box
  R("camerupt-2", "Camerupt", "home", "home"),    // the relink candidate
  /* The game will not release below six Champions-origin Pokemon, so
     Garchomp needs six more beside it to be releasable at all.
     tests/releasetest.js covers the floor itself. */
  ...["Incineroar", "Whimsicott", "Rillaboom", "Sinistcha", "Gholdengo",
      "Maushold"].map(n => R(n.toLowerCase(), n, "champions", "champions")),
];
/* box_id is the LINK, and it is not the id: several builds for a species
   (three different Farigiraf), and a build for a Pokemon he does not own yet.
   No fallback from a missing box_id to the id, deliberately: an idea build for
   Farigiraf gets the id "farigiraf", and a fallback would silently marry it to
   a box row of the same name. */
const B = (id, pokemon, box_id = id) => build(id, pokemon, {box_id,
  nature:"Jolly", stat_points:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32},
  moves:["Protect"]});
const BUILDS = [B("garchomp","Garchomp"), B("dragonite","Dragonite"),
                B("sylveon","Sylveon"), B("camerupt","Camerupt"),
                /* the two new shapes */
                B("garchomp-2","Garchomp", "garchomp"),
                B("kingambit-idea","Kingambit", null)];

const { dom, errs } = open({ box: ROWS, builds: BUILDS });
/* The app asks with its OWN dialog now, not the operating system's, so there
   is nothing to stub: the question is in the DOM and the test answers it by
   clicking, which is what a person does too. A confirm() stub left here would
   keep passing while the real dialog was broken. */
dom.window.confirm = function () { throw new Error("native confirm() must not be used"); };
const w = dom.window, d = w.document;
const tags = n => [...n.querySelectorAll(".tag")].map(t => t.textContent);

(async () => {
  await idle();
  describe("each build's state", () => {
    check("garchomp (in the box) = active", w.buildLink("garchomp").state, "active");
    check("dragonite (in HOME) = parked", w.buildLink("dragonite").state, "parked");
    check("sylveon (HOME origin, in the box) = active",
       w.buildLink("sylveon").state, "active");
    check("camerupt (no Pokemon) = orphan", w.buildLink("camerupt").state, "orphan");
  });
  describe("how they look in the list", () => {
    w.go("builds");
    const rows = [...d.querySelectorAll("#listBuilds .row")];
    /* by the NAME LINE, not by where the name falls in the row text: a
       card with Megas opens with a strip of sprites, so "starts with the
       name" was testing the DOM order of a picture. */
    const by = n => rows.find(r => ((r.querySelector(".rname") || r)
      .textContent.trim().indexOf(n) === 0));
    check("Garchomp has no warnings",
       tags(by("Garchomp")).filter(t => /HOME|orphan/.test(t)).length, 0);
    check("Dragonite says it is in HOME",
       tags(by("Dragonite")).indexOf("in HOME — inactive") >= 0, true);
    check("Camerupt says orphan",
       tags(by("Camerupt")).indexOf("orphan — no Pokemon") >= 0, true);
    /* unbound is not a fault, and the two cases read differently: a set waiting
       for one of your copies, against a set for a species you do not have */
    check("Kingambit says it is an idea with no Pokemon",
       tags(by("Kingambit")).indexOf("an idea — you have none yet") >= 0, true);
    check("and the second Garchomp is still active (two builds, one Pokemon)",
       w.buildLink("garchomp-2").state, "active");
  });

  await describe("on release", async () => {
    w.go("box");
    const boxRow = [...d.querySelectorAll("#listChampOrigin .row, #listHomeOrigin .row")]
      .find(r => r.textContent.indexOf("Garchomp") >= 0);
    click(boxRow);
    await idle();
    const rel = [...d.querySelectorAll(".sheet button")]
      .find(b => b.textContent === "Release");
    check("there is a Release button", !!rel, true);
    click(rel);
    await idle();
    /* A release UNBINDS the builds and keeps them: a build with no Pokemon
       is a first-class state (an idea), and an idea should not be lost for
       want of a row to hang it on. garchomp carries TWO, so both must be
       unbound. */
    /* THE APP'S OWN QUESTION, not the operating system's. */
    check("it asks with the app's own dialog",
       d.getElementById("askScrim").hidden, false);
    const asked = d.getElementById("askTitle").textContent + " " +
                  d.getElementById("askBody").textContent;
    await until(() => d.activeElement === d.getElementById("askNo"));
    check("and the safe button is the one with focus",
       d.activeElement === d.getElementById("askNo"), true);
    check("it warns the builds are kept",
       /will be KEPT as ideas/.test(asked), true);
    check("...and says how many", /2 builds/.test(asked), true);
    /* answered the way a person answers it */
    click(d.getElementById("askYes"));
    check("and it closes when answered",
       d.getElementById("askScrim").hidden, true);
    /* The release only STARTS when the question is answered, so the writes
       land a tick later. */
    await idle();
    check("it deletes the box row",
       w.__DELETED.some(x => x.table === "box" && x.col === "id" && x.id === "garchomp"), true);
    check("it deletes NO build",
       w.__DELETED.filter(x => x.table === "builds" && x.col === "id").length, 0);
    const wroteBuilds = w.__WROTE.filter(x => x.table === "builds");
    const unbound = wroteBuilds.filter(x => x.row.box_id === null)
      .map(x => x.row.id).sort();
    check("it unbinds both of that Pokemon's", unbound.join(","), "garchomp,garchomp-2");
    check("and leaves another's alone",
       wroteBuilds.some(x => x.row.id === "dragonite"), false);
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
