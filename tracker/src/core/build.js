/* What a build may be and what changing one costs: the Stat Point budget
   (66, at most 32 in one stat), the moveset rules, and the VP a retune
   costs. Computed here and nowhere else, so the editor and every list agree. */
import {
  byName, COSTS, learnset, MOVE_BY, natMult, spTotal, STAT_KEYS, STAT_LABEL,
  statAt,
} from "./data.js";
import { baseAbility, megaAbility, ownedNames } from "./state.js";

function checks(d, p){
  var out = [];
  var tot = spTotal(d.stat_points);
  if (tot > 66) out.push(["bad", "<strong>" + tot + " Stat Points.</strong> The budget is 66."]);
  STAT_KEYS.forEach(function(k){
    if ((Number(d.stat_points[k]) || 0) > 32)
      out.push(["bad", "<strong>" + STAT_LABEL[k] + " is over 32.</strong> No single stat may pass 32."]);
  });
  var basep = byName[d.mega || d.pokemon] || p;
  if (basep) {
    var atk = statAt(basep.b[1], d.stat_points.atk, false, natMult(d.nature, "atk"));
    var spa = statAt(basep.b[3], d.stat_points.spa, false, natMult(d.nature, "spa"));
    var main = atk >= spa ? "P" : "S";
    (d.moves || []).forEach(function(n){
      var m = MOVE_BY[n];
      if (!m) return;
      if (m.pri > 0 && m.cat !== "T" && m.cat !== main) {
        out.push(["warn", "<strong>" + m.name + " is priority, but " +
          (m.cat === "P" ? "physical" : "special") + ".</strong> This set hits " +
          "harder on " + (main === "P" ? "Attack" : "Sp. Atk") +
          " (" + Math.max(atk, spa) + " vs " + Math.min(atk, spa) +
          "), so the priority slot buys little."]);
      }
      if (m.hitsAlly) {
        out.push(["warn", "<strong>" + m.name + " hits your own ally too.</strong> " +
          "Only run it if the partner absorbs it or is immune."]);
      }
    });
    var abil = megaAbility(d) || "";
    if (abil === "Intimidate" || baseAbility(d) === "Intimidate") {
      out.push(["warn", "<strong>Intimidate on your own side.</strong> Defiant, " +
        "Competitive, Contrary, Guard Dog and Rattled all turn it into a free " +
        "boost for the opponent."]);
    }
    if ((d.moves || []).includes("Weather Ball")) {
      out.push(["warn", "<strong>Weather Ball is never Normal in play.</strong> " +
        "Resolve it to this team's own weather before quoting any number."]);
    }
    var ls = learnset(d.pokemon);
    if (ls) {
      var legal = {};
      ls.forEach(function(m){ legal[m.name] = 1; });
      (d.moves || []).forEach(function(n){
        if (n && !legal[n])
          out.push(["bad", "<strong>" + n + "</strong> is not in " + d.pokemon +
            "'s learnset."]);
      });
    }
  }
  /* AND SAY SO WHEN THE CHOICE IS STILL OPEN. The blank row in the select is
     honest but quiet, and an unset ability is not free: the move badges and
     the damage screen both run without it. Printing the options is an
     indicator, not a pick. */
  if (p && (p.ab || []).length > 1 && !d.ability)
    out.push(["warn", "<strong>No ability chosen.</strong> " + d.pokemon +
      " can have " + p.ab.join(", ") + ". Until one is picked the move badges " +
      "and the calculator run without it."]);
  var own = ownedNames();
  if (d.pokemon && !(d.pokemon in own))
    out.push(["bad", "<strong>" + d.pokemon + " is not in the Champions Box.</strong>"]);
  return out;
}

function retuneCost(a, b){
  var parts = [], vp = 0;
  var sa = a.stat_points || {}, sb = b.stat_points || {};
  var spDelta = STAT_KEYS.reduce(function(n, k){
    return n + Math.abs((Number(sa[k]) || 0) - (Number(sb[k]) || 0));
  }, 0);
  if (spDelta) { vp += spDelta * COSTS.training_stat_point;
                 parts.push(spDelta + " SP × 5"); }
  var ma = (a.moves || []).join("|"), mb = (b.moves || []).join("|");
  if (ma !== mb) {
    var n = (b.moves || []).filter(function(m, i){ return m !== (a.moves || [])[i]; }).length;
    vp += n * COSTS.training_move;
    parts.push(n + " move" + (n === 1 ? "" : "s") + " × 250");
  }
  if ((a.nature || "") !== (b.nature || "")) { vp += 500; parts.push("nature 500"); }
  /* RESOLVED on both sides: writing down the ability a single-ability species
     always had is not a retune, and must not print 500 VP. */
  if ((baseAbility(a) || "") !== (baseAbility(b) || "")) {
    vp += 500; parts.push("ability 500");
  }
  return vp ? {vp:vp, parts:parts} : null;
}

export { checks, retuneCost };
