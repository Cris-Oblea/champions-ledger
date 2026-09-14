/* 10-scan.js - Reading a screenshot of the box.
   Part of the app; linked into one script by scripts/build_tracker_page.py. */
import { $, C, FORMS, byName, el, freeSlug, toast } from "./01-data.js";
import { S } from "./02-state.js";
import { put } from "./03-store.js";
import { fbtn } from "./04-nav.js";
/* ====================================================================== scan */
function initScan(){
  if (!window.claude || !window.claude.use) return;
  window.claude.use("sample").then(function(sample){
    if (!sample) return;
    sample.limits().then(function(lim){
      if (!lim || !lim.images) return;
      window.__sample = sample;
      $("scanPane").hidden = false;
      $("scanFile").accept = lim.images.mediaTypes.join(",");
      $("scanFile").onchange = function(){
        var files = Array.prototype.slice.call($("scanFile").files || [])
                      .slice(0, lim.images.maxCount);
        if (!files.length) return;
        runScan(files);
      };
    }, function(){});
  }, function(){});
}
function runScan(files){
  var out = $("scanOut");
  out.innerHTML = "";
  out.appendChild(el("p", "sub", "Reading…"));
  var names = FORMS.map(function(p){ return p.name; });
  window.__sample.json(
    "These are screenshots of a Pokemon box. List every Pokemon name you can " +
    "read. Answer as JSON: {\"names\":[\"...\"]}. Use ONLY names from this " +
    "list, matching the closest one: " + names.join(", ") +
    ". If a name is unreadable, leave it out.",
    {images:files, modelTier:"complex"}
  ).then(function(res){
    var found = (res && res.names || []).filter(function(n){ return byName[n]; });
    out.innerHTML = "";
    if (!found.length) { out.appendChild(el("div", "empty", "No names read")); return; }
    out.appendChild(el("p", "sub", "Tick what is right, then add:"));
    var chosen = {};
    var togs = el("div", "toggles");
    found.forEach(function(n){
      chosen[n] = true;
      var t = el("button", "tog", n);
      t.setAttribute("aria-pressed", "true");
      t.onclick = function(){
        chosen[n] = !chosen[n];
        t.setAttribute("aria-pressed", chosen[n] ? "true" : "false");
      };
      togs.appendChild(t);
    });
    out.appendChild(togs);
    var br = el("div", "btnrow"); br.style.marginTop = "10px";
    ["champions","home"].forEach(function(loc){
      br.appendChild(fbtn("Add to " + (loc === "home" ? "HOME" : "the box"),
        "primary", function(){
          var picks = Object.keys(chosen).filter(function(n){ return chosen[n]; });
          var taken = JSON.parse(JSON.stringify(S.box));
          var chain = Promise.resolve();
          picks.forEach(function(n){
            var id = freeSlug(n, taken);
            taken[id] = 1;
            chain = chain.then(function(){
              return put("box/" + id, {name:n, location:loc, status:"permanent",
                note:"read from a screenshot", order:Object.keys(taken).length});
            });
          });
          chain.then(function(){
            out.innerHTML = "";
            toast(picks.length + " added");
          });
        }));
    });
    out.appendChild(br);
  }, function(e){
    out.innerHTML = "";
    out.appendChild(el("div", "note bad",
      e && e.code === "rate_limited" ? "Too many requests — try again shortly."
      : "Could not read the screenshots."));
  });
}

/* ------------------------------------------- abilities, items, weather ----
   Every multiplier here was MEASURED against Smogon's own Champions engine by
   scripts/measure_modifiers.py - run the case with the modifier and without it
   and read the ratio - because Serebii's item text says "slightly boosts the
   power", which is not a number, and reciting one from memory is the thing
   this project forbids.

   Anything measured at x1.00 was then checked against the format: Choice Band,
   Choice Specs, Assault Vest, Eviolite, Transistor, Steelworker, Ice Scales and
   Storm Drain are not in Champions at all, which is why they moved nothing. */
var MODS = C.MODS || {};

/* which types each modifier cares about - the measurement gives the number,
   this says when it applies */
var TYPE_ABIL = {
  "Water Bubble": ["Water"], "Fire Mane": ["Fire"],
  "Thick Fat": ["Fire", "Ice"], "Heatproof": ["Fire"],
  "Flash Fire": ["Fire"], "Water Absorb": ["Water"], "Levitate": ["Ground"],
  "Earth Eater": ["Ground"], "Volt Absorb": ["Electric"],
  "Lightning Rod": ["Electric"], "Sap Sipper": ["Grass"],
  "Motor Drive": ["Electric"], "Well-Baked Body": ["Fire"],
  "Dry Skin": ["Water", "Fire"]
};
var FLAG_ABIL = {           // ability -> the move flag it keys off
  "Tough Claws": "c", "Fluffy": "c", "Aura Guard": "c", "Unseen Fist": "c",
  "Iron Fist": "p", "Strong Jaw": "b", "Sharpness": "l", "Punk Rock": "s",
  "Soundproof": "s", "Bulletproof": "u", "Overcoat": "d"
};
var WEATHER_MOVE = {
  "Sun":  {Fire: "Sun|Fire",  Water: "Sun|Water"},
  "Rain": {Water: "Rain|Water", Fire: "Rain|Fire"},
  "Sand": {}, "Snow": {}
};
var TERRAIN_MOVE = {
  "Electric": {Electric: "Electric|Electric"},
  "Grassy":   {Grass: "Grassy|Grass"},
  "Psychic":  {Psychic: "Psychic|Psychic"},
  "Misty":    {Dragon: "Misty|Dragon"}
};

/* does this ability touch THIS move? returns the measured multiplier, 0 for an
   immunity, or null when it does not apply */
function modFor(group, name, move, mtype, te, atkTypes){
  if (!name) return null;
  var tbl = MODS[group] || {};
  if (!(name in tbl)) return null;
  var x = tbl[name];
  var types = TYPE_ABIL[name];
  if (types && types.indexOf(mtype) < 0) return null;
  var flag = FLAG_ABIL[name];
  if (flag && move.f.indexOf(flag) < 0) return null;
  if (name === "Sheer Force" && !move.sec) return null;
  if (name === "Technician" && !(move.bp && move.bp <= 60)) return null;
  if (name === "Reckless" && !MOVE_RECOIL[move.name]) return null;
  if (name === "Mega Launcher" && !MOVE_PULSE[move.name]) return null;
  if (name === "Hustle" && move.cat !== "P") return null;
  if ((name === "Filter" || name === "Solid Rock" || name === "Expert Belt")
      && te <= 1) return null;
  if (name === "Adaptability" && atkTypes.indexOf(mtype) < 0) return null;
  if (name === "Huge Power" && move.cat !== "P") return null;
  if (name === "Guts" && move.cat !== "P") return null;
  return x;
}
/* the two named families the flags cannot express */
var MOVE_RECOIL = {}, MOVE_PULSE = {};
(C.RECOIL || []).forEach(function(n){ MOVE_RECOIL[n] = 1; });
(C.PULSE || []).forEach(function(n){ MOVE_PULSE[n] = 1; });

/* the resist berries, keyed by the type they halve */
var BERRY_TYPE = {
  "Chople Berry": "Fighting", "Colbur Berry": "Dark", "Occa Berry": "Fire",
  "Passho Berry": "Water", "Wacan Berry": "Electric", "Rindo Berry": "Grass",
  "Yache Berry": "Ice", "Shuca Berry": "Ground", "Coba Berry": "Flying",
  "Payapa Berry": "Psychic", "Tanga Berry": "Bug", "Charti Berry": "Rock",
  "Kasib Berry": "Ghost", "Haban Berry": "Dragon", "Babiri Berry": "Steel",
  "Kebia Berry": "Poison", "Roseli Berry": "Fairy", "Chilan Berry": "Normal"
};
var TYPE_ITEM = {
  "Black Glasses": "Dark", "Mystic Water": "Water", "Metal Coat": "Steel",
  "Fairy Feather": "Fairy", "Charcoal": "Fire", "Magnet": "Electric",
  "Miracle Seed": "Grass", "Hard Stone": "Rock", "Black Belt": "Fighting",
  "Dragon Fang": "Dragon", "Never-Melt Ice": "Ice", "Poison Barb": "Poison",
  "Sharp Beak": "Flying", "Silk Scarf": "Normal", "Silver Powder": "Bug",
  "Soft Sand": "Ground", "Spell Tag": "Ghost", "Twisted Spoon": "Psychic"
};

/* ------------------------------------------------------- what leaves here --
   `initScan` is the screenshot reader, and the rest is the MODIFIER TABLES -
   which item, weather, terrain and berry touch which type, and by how much.
   11-damage is their only other reader.

   They sit in this file for a historical reason and not a good one: the scan
   view was where the first table was needed. Moving them to a part of their
   own is a separate change, and a file that says what it exports is the thing
   that makes it visible at all - before, nothing recorded that the damage
   screen was reaching into the scanner. */
export {
  BERRY_TYPE, MODS, TERRAIN_MOVE, TYPE_ITEM, WEATHER_MOVE, initScan, modFor,
};
