/* The Worlds view inside Find: what won at every VGC World Championship. */
import { anyRow, C } from "../core/data.js";
import { $, el, setPressed } from "../core/dom.js";
import { ownedNames } from "../core/state.js";
import { cardLine, labelBox, pokeCard } from "../ui/card.js";
import { findDetail } from "../ui/pokemon.js";

/* ----------------------------------------------------------------- worlds --
   Every World Championship pokedata publishes, as HISTORY.

   The distinction is the whole point and the app has to keep saying it: a
   Worlds is played once, under one regulation, and then frozen. 2026 was M-B.
   Quoting any of it as what is popular now is the mistake this block exists
   to prevent, so the year carries its format and the lede says "frozen".

   THE THREE DIVISIONS ARE NEVER POOLED. Masters, Seniors and Juniors run the
   same roster and are three different metagames (one Pokemon can be twice
   as common in one as in another), so they are tabs and there is no "all"
   option. Masters leads because that is the division he enters.

   Counted per TEAM, not per appearance: under the Species Clause a team holds
   a species at most once, so "52.8%" is 208 of 394 teams and not 208 slots. */
/** @type {{year: number | null, div: string}} */
const WORLD = {year: null, div: "masters"};

/* Build the year and division rows (newest year first) and draw. */
function worldInit(){
  const years = C.WORLDS || [];
  const yrow = $("worldYear"); yrow.innerHTML = "";
  $("worldOut").innerHTML = "";
  if (!years.length) {
    $("worldOut").appendChild(el("div", "empty",
      "No Worlds archive in this build."));
    return;
  }
  WORLD.year = years[0].y;
  years.forEach(function(r){
    const t = el("button", "tog", String(r.y));
    setPressed(t, r.y === WORLD.year);
    t.onclick = function(){
      WORLD.year = r.y;
      Array.prototype.forEach.call(yrow.children, function(x){
        setPressed(x, x === t);
      });
      worldDraw();
    };
    yrow.appendChild(t);
  });
  const drow = $("worldDiv"); drow.innerHTML = "";
  [["masters","Masters"],["seniors","Seniors"],["juniors","Juniors"]]
    .forEach(function(o){
      const t = el("button", "tog", o[1]);
      setPressed(t, o[0] === WORLD.div);
      t.onclick = function(){
        WORLD.div = o[0];
        Array.prototype.forEach.call(drow.children, function(x){
          setPressed(x, x === t);
        });
        worldDraw();
      };
      drow.appendChild(t);
    });
  worldDraw();
}

/* The chosen year and division: its most-brought Pokemon, ranked. */
function worldDraw(){
  const out = $("worldOut");
  if (!out) return;
  out.innerHTML = "";
  const yr = (C.WORLDS || []).find(function(r){ return r.y === WORLD.year; });
  const d = yr?.d[WORLD.div];
  if (!d) {
    out.appendChild(el("div", "empty",
      "pokedata published no " + WORLD.div + " teamlists for " + WORLD.year +
      " — standings only, upstream."));
    return;
  }
  const own = ownedNames();
  const head = el("p", "sub");
  head.textContent = "Worlds " + WORLD.year + " " + WORLD.div + " · " + d.n +
    " teams · the " + d.top.length + " most brought";
  out.appendChild(head);
  const list = el("div", "cards");
  d.top.forEach(function(row, i){
    const name = row[0], teams = row[1], pct = row[2];
    /* anyRow, not byName: a Worlds list is HISTORY, and many of its names are
       not in the Champions dex (earlier years ran other formats). They still
       get a card and a sheet, off the same HOME_DEX the box uses, and the
       sheet says where the numbers came from. */
    const p = anyRow(name);
    const mine = (name in own) || (p && p.species in own);
    /* The same card as every list. Two numbers, so two cells. "24.6% - 97 of 394 teams" is a sentence you
       read; a share and a count side by side are numbers you scan down the
       column, which is the only way a ranking gets used. */
    const cells = [
      labelBox(pct + "%", "of teams"),
      labelBox(teams + " / " + d.n, "brought it")
    ];
    const title = teams + " of the " + d.n + " " + WORLD.div +
      " teams at Worlds " + WORLD.year + " carried " + name +
      ". One per team - the Species Clause allows no second copy.";
    let r;
    if (p) {
      r = pokeCard(p, {
        cls: mine ? "perm" : "",
        name: name,
        cells: cells,
        pre: function(h){ h.appendChild(el("span", "mono", "#" + (i + 1) + "  ")); },
        badges: function(h){
          if (mine) h.appendChild(el("span", "tag ok", "yours"));
        },
        onclick: function(){ findDetail(p); }
      });
      const cl = /** @type {HTMLElement | null} */ (r.querySelector(".cardline"));
      if (cl) cl.title = title;
    } else {
      /* a name with no row in any dex - it still holds its place in the
         ranking rather than disappearing from it */
      r = el("button", "row");
      const m = el("div", "rmain");
      const h = el("div", "rname");
      h.appendChild(el("span", "mono", "#" + (i + 1) + "  "));
      h.appendChild(document.createTextNode(name));
      m.appendChild(h);
      const cl2 = cardLine(cells);
      cl2.title = title;
      m.appendChild(cl2);
      r.appendChild(m);
    }
    list.appendChild(r);
  });
  out.appendChild(list);
}

export { worldInit };
