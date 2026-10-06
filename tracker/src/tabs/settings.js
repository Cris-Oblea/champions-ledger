/* The Settings tab: the box capacity, the counts and the data's vintage,
   the VP prices, the export buttons, and the diagnostics. */
import { anyRow, bst, byText, C, COSTS, spTotal } from "../core/data.js";
import { $, $$, el, fbtn, field, toast } from "../core/dom.js";
import { BOOT_ERRORS } from "../core/errors.js";
import {
  baseAbility, boxRows, capacity, ownedStones, S, VIEW,
} from "../core/state.js";
import { patch } from "../core/store.js";
import { closeSheet, openSheet } from "../ui/nav.js";
import { engineReady } from "./damage.js";

/* ================================================================ settings
   One editable number and three derived panels. The editable one is box
   capacity, because the app acts on it and only the game can change it.
   Everything else is DERIVED from the ledger and the shipped data, never
   typed: a hand-typed field goes stale the day after it is written. */
$("tSave").onclick = function(){
  patch("meta/trainer", {
    box_capacity:Number(field("tCap").value) || 50
  }).then(function(){ toast("Box capacity saved"); });
};

/* Fill a <dl> with [label, value, tooltip?] rows; null rows are skipped. */
function kv(host, rows){
  host.innerHTML = "";
  rows.forEach(function(r){
    if (r == null) return;
    host.appendChild(el("dt", null, r[0]));
    const d = el("dd", null, String(r[1]));
    if (r[2]) d.title = r[2];
    host.appendChild(d);
  });
}

/* The Settings panels. Skipped while a field in the tab has focus, so a
   redraw from another device never overwrites a number being typed. */
function drawTrainer(){
  const t = S.meta.trainer || {};
  if (document.activeElement?.closest?.("#v-trainer")) return;
  field("tCap").value = t.box_capacity != null ? t.box_capacity : 50;

  /* the capacity number means nothing without the usage beside it */
  const inChamp = boxRows("champions");
  const cap = capacity(), used = inChamp.length, free = cap - used;
  const cu = $("capUse");
  cu.innerHTML = "";
  cu.appendChild(el("span", "dot"));
  cu.appendChild(document.createTextNode(
    used + " of " + cap + " used · " + Math.max(free, 0) + " free"));
  cu.classList.toggle("c-bad", free <= 0);
  cu.classList.toggle("c-warn", free > 0 && free <= 3);

  const rent = boxRows("champions", "rental").length;
  const home = boxRows("home").length;
  const stones = ownedStones().length;
  kv($("profCounts"), [
    ["In the Champions box", used + " (" + (used - rent) + " bought, " +
                             rent + " rental" + (rent === 1 ? "" : "s") + ")"],
    ["In HOME", home],
    ["Builds written", Object.keys(S.builds).length],
    ["Mega Stones owned", stones + " of " + (C.STONES || []).length]
  ]);

  /* Vintage, read off the shipped data rather than typed, so it can never
     name a regulation the data has moved past. */
  kv($("profData"), [
    ["Regulation", (C.REG || "unknown") +
       (C.REG_STARTED ? " · since " + C.REG_STARTED : "")],
    ["Dex", (C.DEX || []).length + " forms, " + (C.STONES || []).length +
            " Mega Stones"],
    ["Moves", (C.MOVES || []).length + " useable, " +
              Object.keys(C.AB_MOVES || {}).length + " ability rules"],
    ["Ladder usage", C.USAGE_AT
       ? "fetched " + C.USAGE_AT + ", " + (C.REG || "?") + " ladder"
       : "unknown"],
    /* The per-Pokemon splits are a SEPARATE asset on a separate clock - the
       dex is rebuilt nightly, these weekly - so their date is its own line.
       Two numbers from two fetches shown under one date is how a stale one
       hides. */
    ["What each Pokemon runs", (function(){
      const S = window.CHAMP_SPLITS || {};
      const n = Object.keys(S.p || {}).length;
      return n ? n + " Pokemon, " + (S.r || "?") +
                 " tournaments, fetched " + (S.f || "?") + " · weekly"
               : "not in this build";
    })(),
      "Refreshed by the Monday deep run. Moves are a share of move slots, " +
      "everything else a share of sets."],
    ["Tournament data", "Worlds 2026, played under M-B — history, not current",
       "A finished event keeps the format it was played in"],
    ["Page built", window.CHAMP_BUILD || "unknown"]
  ]);

  const c = $("costs");
  /* No affordability colouring: VP held is not tracked, and colouring
     against a stale balance is worse than not colouring. */
  kv(c, [["A ranked win pays", "+" + COSTS.ranked_win + " VP"],
         ["Stat Point", COSTS.training_stat_point + " VP"],
         ["Move", COSTS.training_move + " VP"],
         ["Nature", COSTS.training_nature + " VP"],
         ["Ability", COSTS.training_ability + " VP"],
         ["Mega Stone", COSTS.mega_stone_shop + " VP"],
         ["Keep a rental", COSTS.keep_rental_pokemon + " VP"],
         ["Full four-move retune", (COSTS.training_move * 4) + " VP"],
         ["Ranked wins that pays for",
          Math.ceil(COSTS.training_move * 4 / COSTS.ranked_win)]]);
}

/* ==================================================================== export */
/* rows -> CSV text, quoting any cell with a comma, quote or newline */
function csv(rows){
  return rows.map(function(r){
    return r.map(function(v){
      v = v == null ? "" : String(v);
      return /[",\n]/.test(v) ? '"' + v.replaceAll('"', '""') + '"' : v;
    }).join(",");
  }).join("\r\n");
}
/* Hand the viewer a file: a Blob behind a temporary <a download>, which is
   how every browser saves generated data without a server round trip. */
function offer(filename, text){
  const type = filename.endsWith(".json") ? "application/json" : "text/csv";
  const url = URL.createObjectURL(new Blob([text], {type: type + ";charset=utf-8"}));
  const a = el("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 0);
  toast("Saved " + filename);
}
$$("[data-export]").forEach(function(b){
  b.onclick = function(){
    const k = b.dataset.export;
    if (k === "box-csv") {
      const rows = [["name","location","status","types","bst","note"]];
      ["champions","home"].forEach(function(loc){
        boxRows(loc).forEach(function(r){
          /* anyRow: an exported box should carry the HOME-only rows'
             numbers too, not a pair of empty columns */
          const p = anyRow(r.name);
          rows.push([r.name, loc, r.status, p ? p.types.join("/") : "",
                     p ? bst(p) : "", r.note || ""]);
        });
      });
      offer("champions-box.csv", csv(rows));
    } else if (k === "builds-csv") {
      const rows2 = [["pokemon","mega","ability","nature","hp","atk","def","spa",
                    "spd","spe","sp_total","move1","move2","move3","move4","role"]];
      Object.keys(S.builds).sort(byText).forEach(function(id){
        const b2 = S.builds[id], sp = b2.stat_points || {}, mv = b2.moves || [];
        rows2.push([b2.pokemon, b2.mega || "", baseAbility(b2) || "", b2.nature || "",
          sp.hp||0, sp.atk||0, sp.def||0, sp.spa||0, sp.spd||0, sp.spe||0,
          spTotal(sp), mv[0]||"", mv[1]||"", mv[2]||"", mv[3]||"", b2.role||""]);
      });
      offer("champions-builds.csv", csv(rows2));
    } else {
      offer("champions-ledger.json", JSON.stringify(
        {box:S.box, builds:S.builds, teams:S.teams, meta:S.meta}, null, 2));
    }
  };
});

/* The newest write across the three tables. A save that failed silently shows
   up here as a date that stopped moving. */
function lastWrite(){
  let best = "";
  [S.box, S.builds, S.teams, S.meta].forEach(function(t){
    Object.keys(t || {}).forEach(function(k){
      const v = t[k] && (t[k].updated_at || t[k].updated);
      if (v && String(v) > best) best = String(v);
    });
  });
  return best ? best.slice(0, 16).replace("T", " ") : "never";
}

/* Filled in by checking the deployed page's own build stamp. Starts as a
   question rather than a claim, because until the fetch answers we do not
   know - and a diagnostic that guesses is worse than one that says so. */
let DIAG_LATEST = "checking…";
/* Fetch the live page once per load and compare its build stamp with this
   copy's, for the diagnostics' "Latest deployed" line. */
function checkLatest(){
  /* asked once per load, not on every redraw - it is a network round trip */
  if (DIAG_LATEST !== "checking…") return;
  /* Guarded for the same reason matchMedia is: this runs inside the startup
     redraw, and an optional capability that is missing must degrade, never
     throw. An unguarded fetch() here reproduced the exact bug fixed hours
     earlier - a ReferenceError that aborted the rest of the load. */
  if (typeof fetch !== "function") { DIAG_LATEST = "cannot check here"; return; }
  fetch(location.pathname + "?probe=" + Date.now(), {cache:"no-store"})
    .then(function(r){ return r.ok ? r.text() : null; })
    .then(function(t){
      if (!t) { DIAG_LATEST = "could not check"; return; }
      const m = /CHAMP_BUILD\s*=\s*['"]([^'"]+)['"]/.exec(t);
      const live = m ? m[1] : null;
      const mine = window.CHAMP_BUILD || "";
      if (!live) DIAG_LATEST = "could not check";
      else if (live === mine) DIAG_LATEST = "yes, this is the current build";
      else DIAG_LATEST = "NO - the server has " + live + ", reload to get it";
    })
    .catch(function(){ DIAG_LATEST = "could not check (offline?)"; })
    .then(function(){ if ($("diagOut")?.children.length) drawDiag(); });
}

/* The diagnostics, as [label, value] lines: everything needed to tell a
   broken page, a stale cache and stale data apart from a phone. */
function diagLines(){
  const L = [];
  function add(k, v){ L.push([k, v]); }
  add("Page built", (window.CHAMP_BUILD || "unknown"));
  /* Is the page in front of you the one that is deployed? A phone serving a
     cached copy is the nastiest failure here, because nothing looks broken -
     the numbers are just quietly out of date. Compare the build stamp baked
     into this file against the one the server is handing out right now. */
  add("Latest deployed", DIAG_LATEST);
  /* What the reference data describes, so a wrong number can be traced to the
     refresh rather than to the page. */
  add("Regulation", (C?.REG ? C.REG : "unknown") +
      (C?.REG_STARTED ? " since " + C.REG_STARTED : ""));
  add("Ladder usage fetched", C?.USAGE_AT || "unknown");
  add("Per-Pokemon splits", (function(){
    const S = window.CHAMP_SPLITS || {};
    const n = Object.keys(S.p || {}).length;
    return n ? n + " Pokemon, " + (S.r || "?") + ", fetched " + (S.f || "?")
             : "absent";
  })());
  /* A truncated download looks like a working page with things missing, so the
     counts are stated and anything at zero is called out. */
  add("Blob integrity", [
        [(C?.DEX || []).length, "forms"],
        [(C?.MOVES || []).length, "moves"],
        [Object.keys(C?.AB_MOVES || {}).length, "ability rules"],
        [(C?.STONES || []).length, "stones"],
        [(C?.ITEMS || []).length, "items"]
      ].map(function(p){ return p[0] + " " + p[1]; }).join(", ") +
      ([(C?.DEX || []).length, (C?.MOVES || []).length,
        Object.keys(C?.AB_MOVES || {}).length].some(function(n){ return !n; })
        ? "  MISSING" : ""));
  add("Last ledger write", lastWrite());
  add("Browser", navigator.userAgent);
  add("Screen", window.innerWidth + " x " + window.innerHeight +
      " @" + (window.devicePixelRatio || 1) + "x");
  add("Reference data", C?.DEX ? C.DEX.length + " forms, " +
      (C.MOVES || []).length + " moves" : "MISSING");
  add("Dex numbers", C?.DEXNO ? Object.keys(C.DEXNO).length : "MISSING");
  add("Smogon engine", engineReady() ? "loaded" : "NOT LOADED");
  add("Supabase client", window.supabase ? "loaded" : "NOT LOADED");
  add("Signed in", S.db ? "yes" : "no");
  add("Rows loaded", Object.keys(S.box).length + " box, " +
      Object.keys(S.builds).length + " builds");
  try {
    localStorage.setItem("__t", "1"); localStorage.removeItem("__t");
    add("Local storage", "works");
  } catch (e) { add("Local storage", "BLOCKED - " + e.name); }
  add("Sort", VIEW.sort);
  add("Script errors", BOOT_ERRORS.length ? BOOT_ERRORS.join(" | ") : "none");
  return L;
}

/* The diagnostics panel: the lines, Copy, and the overlap check. */
function drawDiag(){
  const host = $("diagOut");
  if (!host) return;
  host.innerHTML = "";
  const dl = el("dl", "kv diag");
  diagLines().forEach(function(r){
    dl.appendChild(el("dt", null, r[0]));
    const dd = el("dd", null, String(r[1]));
    if (/MISSING|NOT LOADED|BLOCKED/.test(String(r[1]))) dd.classList.add("c-bad");
    dl.appendChild(dd);
  });
  host.appendChild(dl);

  const b = el("button", "btn sm mt10", "Copy this");
  b.onclick = function(){
    const txt = diagLines().map(function(r){ return r[0] + ": " + r[1]; }).join("\n");
    if (!navigator.clipboard) { diagFallback(txt); return; }
    navigator.clipboard.writeText(txt).then(function(){ toast("Copied"); },
      function(){ diagFallback(txt); });
  };
  host.appendChild(b);

  /* ------------------------------------------- nothing painted on top -----
     A button that checks every screen for one thing drawn over another (an
     icon over the text being typed, a badge under a picture).

     It lives HERE, in diagnostics, and not in the test suite: jsdom does not
     lay anything out - every rectangle it reports is zero - so a test there
     would pass while the screen was wrong. Run on the real device, against
     the real layout, it measures what is actually drawn. */
  const ob = el("button", "btn sm mt8 ml8", "Check every screen for overlaps");
  ob.onclick = function(){ overlapReport(host); };
  host.appendChild(ob);
}

/* One view: how many painted boxes, the collisions (up to 12), and the
   floating layers that sit over content. */
function overlapSweep(view){
  const boxes = paintedBoxes(view);
  boxes.sort(function(a, b){ return a.r.top - b.r.top; });
  const hits = [], floats = [];
  for (let i2 = 0; i2 < boxes.length && hits.length < 12; i2++) {
    const hit = firstCollision(boxes, i2, view, floats);
    if (hit) hits.push(hit);
  }
  return {boxes: boxes.length, hits: hits, floating: floats};
}

/* Every leaf that paints something, with its rectangle. An ICON paints
   without carrying a word, and an icon on top of text is the exact bug this
   exists for, so svg and img count even though their text is empty. A FIELD
   PAINTS ITS VALUE, which is not its textContent, so a field counts even
   when empty - an icon over a search box's text is the bug this exists for.
   Anything else has to say something to be worth colliding with. */
function paintedBoxes(view){
  const boxes = [];
  for (const e of view.querySelectorAll("*")) {
    const tag = e.tagName;
    const isIcon = /^(svg|img)$/i.test(tag);
    const isField = /^(input|textarea|select)$/i.test(tag);
    if (e.children.length && !isIcon) continue;
    if (!isIcon && !isField && !e.textContent.trim()) continue;
    let r = e.getBoundingClientRect();
    if (isField) r = contentBox(e, r);
    if (r.width < 4 || r.height < 4) continue;
    boxes.push({e: e, r: r});
  }
  return boxes;
}

/* SWEPT, NOT COMPARED PAIRWISE (a double loop over thousands of boxes
   freezes the renderer): boxes are sorted by top edge, so box i is only
   measured against the ones that start before it ends. Returns the
   first real collision as a line of text. A two-pixel kiss is layout, not a
   collision.

   A FLOATING LAYER IS NOT A COLLISION, AND IS NOT HIDDEN EITHER. When exactly
   one of the two is out of the flow - the "+" button over a list, a sheet, a
   toast - it is MEANT to be on top, so counting it would cry wolf; it goes
   into `floats` instead, so a layer really swallowing something still shows.
   BOTH out of the flow is a genuine fault: two floating layers fighting over
   one corner is nobody's design. */
function firstCollision(boxes, i, view, floats){
  const A = boxes[i];
  for (let j = i + 1; j < boxes.length; j++) {
    const B = boxes[j];
    if (B.r.top >= A.r.bottom - 1) break;         /* the sweep's whole point */
    if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
    const ox = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
    const oy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
    if (ox <= 1 || oy <= 1 || ox * oy < 30) continue;
    const line = overlapLabel(A.e) + "  over  " + overlapLabel(B.e) +
               "  (" + Math.round(ox * oy) + "px²)";
    if (floatingLayer(A.e, view) !== floatingLayer(B.e, view)) {
      if (floats.length < 8) floats.push(line);
      continue;
    }
    return line;
  }
  return null;
}

/* Out of the flow: its own layer, by declaration. Read off the ancestors
   because the painted leaf inherits the positioning of the box that floats -
   the "+" glyph is a plain span inside a fixed button. ASKED ONLY WHEN TWO
   BOXES ACTUALLY TOUCH: a getComputedStyle per ancestor of every box would
   make the sweep too slow to run. */
function floatingLayer(e, view){
  for (let n = e; n?.nodeType === 1 && n !== view; n = n.parentNode) {
    const pos = window.getComputedStyle(n).position;
    if (pos === "fixed" || pos === "sticky" || pos === "absolute") return true;
  }
  return false;
}

/* A FIELD'S BOX INCLUDES ITS PADDING, and the search icon lives in that
   padding ON PURPOSE. What matters is whether something covers the field's
   TEXT, so a field is measured by its content box. A NONSENSE COMPUTED STYLE
   MUST NOT BLIND THE SWEEP: if the insets come back bigger than the box
   (jsdom resolves a border to 16px here), the border box is used instead -
   a generous rectangle reports a false positive, which someone reads; a
   collapsed one reports nothing, which nobody does. */
function contentBox(e, r){
  const cs = window.getComputedStyle(e);
  const l = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
  const t = r.top + px(cs.borderTopWidth) + px(cs.paddingTop);
  const rt = r.right - px(cs.borderRightWidth) - px(cs.paddingRight);
  const b = r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom);
  if (rt - l < 4 || b - t < 4) return r;
  return {left:l, top:t, right:rt, bottom:b, width:rt - l, height:b - t};
}

/* "12px" -> 12, anything unparseable -> 0 */
function px(v){ return Number.parseFloat(v) || 0; }

/* "span.tag “Fire”" - an element as a person can find it. An SVG's className
   is an SVGAnimatedString, so the class is read as an attribute. */
function overlapLabel(e){
  const c = (e.getAttribute?.("class") || "").split(" ")[0];
  const t = (e.value || e.textContent || "").trim().slice(0, 14);
  return e.tagName.toLowerCase() + (c ? "." + c : "") +
         (t ? " “" + t + "”" : "");
}

/* Sweep every view and write the result under the button. */
function overlapReport(host){
  /* Found through `host`, not by id: `$()` is for ids the MARKUP declares, and
     check_app asserts exactly that - a lookup for something no markup
     contains is usually a typo, which is a check worth keeping sharp. */
  const old = host.querySelector(".overlapout");
  if (old) old.remove();
  const out = el("div", "note overlapout mt10");
  /* EVERY VIEW, not just the one you are standing on - the button lives in
     Settings, so "the current screen" would only ever be Settings.

     A hidden view reports every rectangle as zero, so each one is shown for
     the length of a measurement and put straight back. The flicker is the
     price of measuring the real layout instead of guessing at it. */
  const views = $$(".view");
  const open = views.find(function(v){ return !v.hidden; });
  const bad = [], over = [];
  let total = 0;
  views.forEach(function(v){
    const was = v.hidden;
    v.hidden = false;
    const r = overlapSweep(v);
    v.hidden = was;
    total += r.boxes;
    r.hits.forEach(function(h){ bad.push(v.id + " — " + h); });
    (r.floating || []).forEach(function(h){ over.push(v.id + " — " + h); });
  });
  if (open) open.hidden = false;

  if (!bad.length) {
    out.innerHTML = "<strong>Nothing overlaps.</strong> Swept " + total +
      " painted boxes across " + views.length + " views at " +
      window.innerWidth + "px wide.";
  } else {
    out.className = "note bad overlapout";
    out.innerHTML = "<strong>" + bad.length + " overlap" +
      (bad.length === 1 ? "" : "s") + "</strong> at " + window.innerWidth +
      "px, of " + total + " painted boxes:";
    bad.slice(0, 14).forEach(function(h){ out.appendChild(el("div", "st", h)); });
  }
  /* SHOWN, NOT COUNTED. The "+" button floats over the list on purpose, so
     it is not a fault - but listing it keeps the check honest: a floating
     layer really swallowing something would otherwise be invisible. */
  if (over.length) {
    const fl = el("div", "st mt8");
    fl.innerHTML = "<strong>" + over.length + " floating layer" +
      (over.length === 1 ? "" : "s") + " over content</strong> — by " +
      "design (the + button, a sheet, a toast). Listed so it cannot hide:";
    out.appendChild(fl);
    over.slice(0, 8).forEach(function(h){ out.appendChild(el("div", "st", h)); });
  }
  host.appendChild(out);
}

/* Where the clipboard API is missing or refused: the text in a sheet, to
   select and copy by hand. */
function diagFallback(txt){
  openSheet("Diagnostics", function(body){
    body.appendChild(el("p", "sub", "Select it all and copy."));
    const ta = el("textarea", "diagdump");
    ta.value = txt; ta.readOnly = true;
    body.appendChild(ta);
    setTimeout(function(){ ta.select(); }, 60);
  }, [fbtn("Done", "primary", closeSheet)]);
}

export { checkLatest, drawDiag, drawTrainer, overlapSweep };
