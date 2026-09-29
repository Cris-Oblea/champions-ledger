/* The Worlds view inside Find: what won at every VGC World Championship. */
import { anyRow, C } from "../core/data.js";
import { $, el } from "../core/dom.js";
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
   same roster and are three different metagames - Incineroar is 41% of the
   Masters teams and 26% of the Juniors' - so they are tabs and there is no
   "all" option. Masters leads because that is the division he enters.

   Counted per TEAM, not per appearance: under the Species Clause a team holds
   a species at most once, so "52.8%" is 208 of 394 teams and not 208 slots. */
var WORLD = {year: null, div: "masters"};

function worldInit(){
  var years = C.WORLDS || [];
  var yrow = $("worldYear"); yrow.innerHTML = "";
  $("worldOut").innerHTML = "";
  if (!years.length) {
    $("worldOut").appendChild(el("div", "empty",
      "No Worlds archive in this build."));
    return;
  }
  WORLD.year = years[0].y;
  years.forEach(function(r){
    var t = el("button", "tog", String(r.y));
    t.setAttribute("aria-pressed", r.y === WORLD.year ? "true" : "false");
    t.onclick = function(){
      WORLD.year = r.y;
      Array.prototype.forEach.call(yrow.children, function(x){
        x.setAttribute("aria-pressed", x === t ? "true" : "false");
      });
      worldDraw();
    };
    yrow.appendChild(t);
  });
  var drow = $("worldDiv"); drow.innerHTML = "";
  [["masters","Masters"],["seniors","Seniors"],["juniors","Juniors"]]
    .forEach(function(o){
      var t = el("button", "tog", o[1]);
      t.setAttribute("aria-pressed", o[0] === WORLD.div ? "true" : "false");
      t.onclick = function(){
        WORLD.div = o[0];
        Array.prototype.forEach.call(drow.children, function(x){
          x.setAttribute("aria-pressed", x === t ? "true" : "false");
        });
        worldDraw();
      };
      drow.appendChild(t);
    });
  worldDraw();
}

function worldDraw(){
  var out = $("worldOut");
  if (!out) return;
  out.innerHTML = "";
  var yr = (C.WORLDS || []).find(function(r){ return r.y === WORLD.year; });
  var d = yr?.d[WORLD.div];
  if (!d) {
    out.appendChild(el("div", "empty",
      "pokedata published no " + WORLD.div + " teamlists for " + WORLD.year +
      " — standings only, upstream."));
    return;
  }
  var own = ownedNames();
  var head = el("p", "sub");
  head.textContent = "Worlds " + WORLD.year + " " + WORLD.div + " · " + d.n +
    " teams · the " + d.top.length + " most brought";
  out.appendChild(head);
  var list = el("div", "cards");
  d.top.forEach(function(row, i){
    var name = row[0], teams = row[1], pct = row[2];
    /* anyRow, not byName. A Worlds list is HISTORY: 53 of the names across the
       four championships are not in the Champions dex - the 2025 field was
       full of Calyrex and Koraidon - and every one of them drew a bare name
       with no types, no stats, no BST and no sheet behind it. They have all
       three now, off the same HOME_DEX the box uses, and the sheet says where
       the numbers came from (player, 2026-09-18: "necesito que todos si tengan
       esa informacion"). */
    var p = anyRow(name);
    var mine = (name in own) || (p && p.species in own);
    /* The Worlds list is Pokemon too, so it reads like the rest of the app -
       the player asked for the card everywhere, not only in the search. */
    /* Two numbers, so two cells. "24.6% - 97 of 394 teams" is a sentence you
       read; a share and a count side by side are numbers you scan down the
       column, which is the only way a ranking gets used. */
    var cells = [
      labelBox(pct + "%", "of teams"),
      labelBox(teams + " / " + d.n, "brought it")
    ];
    var title = teams + " of the " + d.n + " " + WORLD.div +
      " teams at Worlds " + WORLD.year + " carried " + name +
      ". One per team - the Species Clause allows no second copy.";
    var r;
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
      var cl = r.querySelector(".cardline");
      if (cl) cl.title = title;
    } else {
      /* a name with no row in any dex - it still holds its place in the
         ranking rather than disappearing from it */
      r = el("button", "row");
      var m = el("div", "rmain");
      var h = el("div", "rname");
      h.appendChild(el("span", "mono", "#" + (i + 1) + "  "));
      h.appendChild(document.createTextNode(name));
      m.appendChild(h);
      var cl2 = cardLine(cells);
      cl2.title = title;
      m.appendChild(cl2);
      r.appendChild(m);
    }
    list.appendChild(r);
  });
  out.appendChild(list);
}

export { worldInit };
