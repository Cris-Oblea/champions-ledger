/* A GTS trade must be an EXCHANGE: what you gave leaves, what you got arrives. */
/* the repo, found from this file - NOT a hardcoded path. Every test in
   here carried an absolute Windows path, so none of them had ever run
   anywhere but one laptop, and all fifteen died instantly the first time
   CI tried (2026-09-13). */
const ROOT = require("path").join(__dirname, "..") + "/";
const UID = "u1";
const ROWS = [
  {user_id:UID,id:"chesnaught",name:"Chesnaught",location:"home",status:"permanent",origin:"home",note:"",ord:0,updated_at:"2026-09-09"},
  {user_id:UID,id:"sableye",name:"Sableye",location:"home",status:"permanent",origin:"home",note:"",ord:1,updated_at:"2026-09-09"}
];
const META = [];
/* A row per trade since migration 7. The offer is open because `closed` is
   null, and closing it is an UPDATE of this same row - not a delete from one
   array and a differently-shaped push onto another. */
const GTS = [{user_id:UID,id:"chesnaught",offered:"Chesnaught",
  requested:"Golisopod",offered_id:"chesnaught",deposited:"2026-09-08",
  deposited_at:"2026-09-08T10:00:00Z",closed:null,closed_at:null,note:"",
  data:{},updated_at:"2026-09-09"}];
const { dom, errs } = require("./harness.js").open(ROOT, { box: ROWS, meta: META, gts: GTS });
const w = dom.window, d = w.document;
setTimeout(()=>{
  console.log("  en HOME antes:", Object.keys(w.S.box).join(", "));
  console.log("  ofertas GTS  :", Object.keys(w.S.gts).length);
  w.go("home");
  const row = d.querySelectorAll("#listGts .row")[0];
  row.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
  setTimeout(()=>{
    const btn = [...d.querySelectorAll("#sheetFoot .btn")]
      .find(b=>/Trade went through/.test(b.textContent));
    console.log("  boton encontrado:", !!btn);
    btn.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
    /* AND THEN CONFIRM IT. Closing a trade is asked in the app's own dialog
       now, not the browser's - so the click above opens a question and stops
       there, and this test has been clicking into a scrim ever since. It kept
       "passing" because it had no exit code either: three checks printing NO
       and a gate line reading ok. Both halves are fixed here. */
    const yes = d.getElementById("askYes");
    if (yes && !d.getElementById("askScrim").hidden) {
      yes.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
    }
    setTimeout(()=>{
      console.log("\n  ESCRITURAS:");
      w.__WROTE.forEach(x=>console.log("    ", x.table, JSON.stringify(x.row).slice(0,110)));
      console.log("  BORRADOS:");
      w.__DELETED.forEach(x=>console.log("    ", x.table, x.id));
      const added = w.__WROTE.some(x=>x.table==="box" && x.row.name==="Golisopod");
      /* the trade is in the history; the note is his, and arrives empty */
      const noNote = w.__WROTE.filter(x=>x.table==="box" && x.row.name==="Golisopod")
        .every(x=>!x.row.note);
      const removed = w.__DELETED.some(x=>x.table==="box" && x.id==="chesnaught");
      /* The trade CLOSES on its own row now: the same id comes back with a
         `closed` date on it, so the offer leaves the open list by becoming
         history rather than by being deleted from an array. */
      const offerCleared = w.__WROTE.some(x=>x.table==="gts" &&
        x.row.id==="chesnaught" && !!x.row.closed);
      console.log("\n  Golisopod agregado :", added ? "SI" : "NO");
      console.log("  Chesnaught borrado :", removed ? "SI" : "NO  <-- EL BUG");
      console.log("  oferta cerrada     :", offerCleared ? "SI" : "NO");
      console.log("  llega sin nota     :", noNote ? "SI" : "NO");
      console.log("  ERRORES:", errs.length?errs.slice(0,2):"ninguno");
      /* A TEST WITH NO EXIT CODE IS NOT A TEST. This one printed its three
         answers and exited 0 whatever they said, so the gate has been reading
         "a trade removes what you gave away: ok" off a check that could not
         fail - and all three were NO. */
      const fails = [!added && "el Pokemon recibido no se agrego",
                     !removed && "el que diste sigue en la caja",
                     !offerCleared && "la oferta no se cerro",
                     !noNote && "el recibido llega con una nota 'GTS for'",
                     errs.length && ("errores JS: " + errs[0])].filter(Boolean);
      if (fails.length) console.log("\n  FALLOS: " + fails.join(" | ") + "\n");
      else console.log("\n  todo bien\n");
      process.exit(fails.length ? 1 : 0);
    },400);
  },400);
},1500);
