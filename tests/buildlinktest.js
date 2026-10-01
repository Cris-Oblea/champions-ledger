/* A build is its own thing, and box_id says which Pokemon is carrying it.

   It used to BE the Pokemon - same id, one build per box row, and no build
   without one (player, 2026-09-10). He replaced that on 2026-09-13: several
   builds per species, and builds for Pokemon he does not own yet, so an idea
   is not lost for want of a row to hang it on.

     linked, in the Champions box -> active
     linked, parked in HOME       -> kept, inactive (nothing trains in HOME)
     linked to a row that is gone -> orphan, and still worth flagging
     not linked at all            -> unbound: an idea, which is fine

   Released now UNBINDS rather than deletes. The fixtures below cover all four
   states, including two builds on one Pokemon - the case the old model could
   not represent. */
const { describe } = require("node:test");
const { check, open, idle, until, row, build, click } = require("./harness.js");

const R = (id, name, location, origin) =>
  row(id, name, {location, origin, trained:true});
const ROWS = [
  R("garchomp", "Garchomp", "champions", "champions"),
  R("dragonite", "Dragonite", "home", "home"),
  R("sylveon", "Sylveon", "champions", "home"),   // HOME origin, in the box
  R("camerupt-2", "Camerupt", "home", "home"),    // the relink candidate
  /* The game will not release below six Champions-origin Pokemon (player,
     2026-09-27), so Garchomp needs six more beside it to be releasable at all.
     tests/releasetest.js covers the floor itself. */
  ...["Incineroar", "Whimsicott", "Rillaboom", "Sinistcha", "Gholdengo",
      "Maushold"].map(n => R(n.toLowerCase(), n, "champions", "champions")),
];
/* box_id is the LINK now, and it is not the id. Until 2026-09-13 a build WAS
   the box row it sat on - same id, one build per Pokemon, and no build without
   one. The player replaced that with two rules: several builds for a species
   (three different Farigiraf), and a build for a Pokemon he does not own yet,
   so the idea survives until he does.
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
  describe("el estado de cada build", () => {
    check("garchomp (en la caja) = activa", w.buildLink("garchomp").state, "active");
    check("dragonite (en HOME) = aparcada", w.buildLink("dragonite").state, "parked");
    check("sylveon (HOME origin, en la caja) = activa",
       w.buildLink("sylveon").state, "active");
    check("camerupt (sin Pokemon) = huerfana", w.buildLink("camerupt").state, "orphan");
  });
  describe("como se ven en la lista", () => {
    w.go("builds");
    const rows = [...d.querySelectorAll("#listBuilds .row")];
    /* by the NAME LINE, not by where the name falls in the row text: a
       card with Megas opens with a strip of sprites, so "starts with the
       name" was testing the DOM order of a picture. */
    const by = n => rows.find(r => ((r.querySelector(".rname") || r)
      .textContent.trim().indexOf(n) === 0));
    check("Garchomp sin avisos",
       tags(by("Garchomp")).filter(t => /HOME|orphan/.test(t)).length, 0);
    check("Dragonite dice que esta en HOME",
       tags(by("Dragonite")).indexOf("in HOME — inactive") >= 0, true);
    check("Camerupt dice huerfana",
       tags(by("Camerupt")).indexOf("orphan — no Pokemon") >= 0, true);
    /* unbound is not a fault, and the two cases read differently: a set waiting
       for one of your copies, against a set for a species you do not have */
    check("Kingambit dice que es una idea sin Pokemon",
       tags(by("Kingambit")).indexOf("an idea — you have none yet") >= 0, true);
    check("y la segunda Garchomp sigue activa (dos builds, un Pokemon)",
       w.buildLink("garchomp-2").state, "active");
  });

  await describe("al liberar", async () => {
    w.go("box");
    const boxRow = [...d.querySelectorAll("#listChampOrigin .row, #listHomeOrigin .row")]
      .find(r => r.textContent.indexOf("Garchomp") >= 0);
    click(boxRow);
    await idle();
    const rel = [...d.querySelectorAll(".sheet button")]
      .find(b => b.textContent === "Release");
    check("hay boton Release", !!rel, true);
    click(rel);
    await idle();
    /* A release used to DELETE the builds, so the ledger would not fill with
       sets for Pokemon that no longer exist. That reason died with the model
       change: a build with no Pokemon is a first-class state now, and the
       player's reason for unbinding builds at all was that an idea should
       not be lost for want of a row to hang it on. So a release unbinds and
       keeps them - and garchomp carries TWO, which is the case the old
       one-build-per-row model could not produce. */
    /* THE APP'S OWN QUESTION, not the operating system's. */
    check("pregunta con el dialogo propio",
       d.getElementById("askScrim").hidden, false);
    const asked = d.getElementById("askTitle").textContent + " " +
                  d.getElementById("askBody").textContent;
    await until(() => d.activeElement === d.getElementById("askNo"));
    check("y el boton seguro es el que tiene el foco",
       d.activeElement === d.getElementById("askNo"), true);
    check("avisa de que las builds se conservan",
       /will be KEPT as ideas/.test(asked), true);
    check("...y dice cuantas", /2 builds/.test(asked), true);
    /* answered the way a person answers it */
    click(d.getElementById("askYes"));
    check("y se cierra al responder",
       d.getElementById("askScrim").hidden, true);
    /* The release only STARTS when the question is answered, so the writes
       land a tick later - the old native confirm() returned inline and the
       assertions could follow it straight away. */
    await idle();
    check("borra la fila de la caja",
       w.__DELETED.some(x => x.table === "box" && x.col === "id" && x.id === "garchomp"), true);
    check("NO borra ninguna build",
       w.__DELETED.filter(x => x.table === "builds" && x.col === "id").length, 0);
    const wroteBuilds = w.__WROTE.filter(x => x.table === "builds");
    const unbound = wroteBuilds.filter(x => x.row.box_id === null)
      .map(x => x.row.id).sort();
    check("desata las dos de ese Pokemon", unbound.join(","), "garchomp,garchomp-2");
    check("y no toca la de otro",
       wroteBuilds.some(x => x.row.id === "dragonite"), false);
  });

  check("la pagina no reporta errores de script", errs.join(" | ") || "ninguno", "ninguno");
})();
