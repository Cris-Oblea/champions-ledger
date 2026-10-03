/* A GTS trade must be an EXCHANGE: what you gave leaves, what you got arrives. */
const { check, idle, open, row, click } = require("./harness.js");

const UID = "u1";
const ROWS = [
  row("chesnaught", "Chesnaught", {location:"home", origin:"home"}),
  row("sableye", "Sableye", {location:"home", origin:"home", ord:1}),
];
const META = [];
/* A row per trade since migration 7. The offer is open because `closed` is
   null, and closing it is an UPDATE of this same row - not a delete from one
   array and a differently-shaped push onto another. */
const GTS = [{user_id:UID,id:"chesnaught",offered:"Chesnaught",
  requested:"Golisopod",offered_id:"chesnaught",deposited:"2026-09-08",
  deposited_at:"2026-09-08T10:00:00Z",closed:null,closed_at:null,note:"",
  data:{},updated_at:"2026-09-09"}];
const { dom, errs } = open({ box: ROWS, meta: META, gts: GTS });
const w = dom.window, d = w.document;

(async () => {
  await idle();
  w.go("home");
  click(d.querySelectorAll("#listGts .row")[0]);
  await idle();
  const btn = [...d.querySelectorAll("#sheetFoot .btn")]
    .find(b => /Trade went through/.test(b.textContent));
  check("the Trade went through button exists", !!btn, true);
  click(btn);
  /* AND THEN CONFIRM IT. Closing a trade is asked in the app's own dialog,
     not the browser's, so the click above opens a question and stops there -
     without answering it, this test would assert against an unclosed trade. */
  const yes = d.getElementById("askYes");
  if (yes && !d.getElementById("askScrim").hidden) click(yes);
  await idle();

  const got = w.__WROTE.filter(x => x.table === "box" && x.row.name === "Golisopod");
  check("the Pokemon received is added to the box", got.length > 0, true);
  /* the trade is in the history; the note is his, and arrives empty */
  check("and arrives with no note", got.every(x => !x.row.note), true);
  check("the one given leaves the box",
        w.__DELETED.some(x => x.table === "box" && x.id === "chesnaught"), true);
  /* The trade CLOSES on its own row: the same id comes back with a `closed`
     date on it, so the offer leaves the open list by becoming history rather
     than by being deleted from an array. */
  check("the offer closes on its own row",
        w.__WROTE.some(x => x.table === "gts" && x.row.id === "chesnaught" && !!x.row.closed),
        true);
  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
