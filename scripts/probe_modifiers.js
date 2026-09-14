/* Ask Smogon's Champions engine for its own modifiers, exactly.
 *
 *   node scripts/probe_modifiers.js '<json cases>'
 *
 * WHY NOT MEASURE THE DAMAGE. A modifier cannot be recovered from a damage
 * ratio. The formula ends in `+ 2`, and every stage floors, so a x1.5 ability
 * measures as 1.453 at the low roll and 1.477 at the high one - neither is the
 * number, and no amount of averaging makes it one.
 *
 * The engine does not hide the number, though. It builds each stage as a list
 * of multipliers in 4096ths - 4915 is x1.2, 5325 is x1.3, 6144 is x1.5 - and
 * `champions.js` EXPORTS the four functions that build those lists. So this
 * calls them directly and reads the values out. Exact, with no arithmetic of
 * ours in between.
 *
 * A case is measured against a baseline with the same everything minus the one
 * thing being probed, so what comes back is attributable: the multipliers that
 * exist WITH the item and not without it.
 *
 * Output: one JSON object per case on stdout.
 */
const path = require("path");
const CALC = path.join(__dirname, "..", "data", "raw", "smogon_calc", "calc");

const { Generations } = require(path.join(CALC, "data", "index"));
const { Pokemon } = require(path.join(CALC, "pokemon"));
const { Move } = require(path.join(CALC, "move"));
const { Field } = require(path.join(CALC, "field"));
const M = require(path.join(CALC, "mechanics", "champions"));

const gen = Generations.get(0);

function build(spec) {
  const opts = {};
  if (spec.item) opts.item = spec.item;
  if (spec.ability) opts.ability = spec.ability;
  if (spec.status) opts.status = spec.status;
  if (spec.evs) opts.evs = spec.evs;
  if (spec.nature) opts.nature = spec.nature;
  if (spec.boosts) opts.boosts = spec.boosts;
  return new Pokemon(gen, spec.name, opts);
}

/* The four stages, each a list of 4096ths. `desc` is written into by the
   engine and thrown away; the mod lists are what is wanted. */
function mods(atkSpec, defSpec, moveName, fieldSpec, typeEff) {
  const attacker = build(atkSpec);
  const defender = build(defSpec);
  const move = new Move(gen, moveName, { species: attacker.name });
  const field = new Field(fieldSpec || { gameType: "Singles" });
  const desc = {};
  /* `desc` is the SEVENTH argument here and the sixth in the others - the
     signatures genuinely differ, and passing it in the wrong slot leaves the
     engine writing to `undefined` with an error that names a field rather than
     an argument. */
  const basePower = M.calculateBasePowerChampions(
    gen, attacker, defender, move, field, false, desc);
  /* The full calculation as well as the stages. A move can report an honest
     base power and still do nothing - Poltergeist is 110 against a target
     holding no item and deals zero, because the engine zeroes it a stage later
     - and a probe vehicle that deals no damage measures nothing at all. */
  let dmg = 0;
  try {
    const res = M.calculateChampions(gen, attacker, defender, move, field);
    const flat = [].concat.apply([], [].concat.apply([], [res.damage])).flat(2);
    const nums = flat.filter((x) => typeof x === "number");
    dmg = nums.length ? Math.max.apply(null, nums) : 0;
  } catch (e) { dmg = 0; }
  return {
    basePower: basePower,
    damage: dmg,
    category: move.category,
    bp: M.calculateBPModsChampions(gen, attacker, defender, move, field, desc,
                                   basePower, false, "first", 1),
    at: M.calculateAtModsChampions(gen, attacker, defender, move, field, desc),
    df: M.calculateDfModsChampions(gen, attacker, defender, move, field, desc,
                                   false, move.category === "Physical"),
    fin: M.calculateFinalModsChampions(gen, attacker, defender, move, field,
                                       desc, false, typeEff || 1, 0),
  };
}

/* What the probed thing ADDS: the multipliers present with it and absent
   without it, per stage, as exact fractions of 4096. */
function attributable(withIt, without) {
  const out = {};
  for (const stage of ["bp", "at", "df", "fin"]) {
    const base = (without[stage] || []).slice();
    const extra = [];
    for (const v of withIt[stage] || []) {
      const i = base.indexOf(v);
      if (i >= 0) base.splice(i, 1);
      else extra.push(v);
    }
    if (extra.length) out[stage] = extra;
  }
  if (withIt.basePower !== without.basePower) {
    out.basePower = [without.basePower, withIt.basePower];
  }
  return out;
}

/* `--map` answers the question the case generator has to ask first: which
   items does the engine treat as boosting a type, and which berries as
   resisting one. Asking the engine beats keeping a list of our own that
   silently rots the day Smogon adds a Plate. */
if (process.argv[2] === "--map") {
  const items = require(path.join(CALC, "items"));
  const out = { boost: {}, berry: {}, known: [] };
  for (const item of gen.items) {
    const t = items.getItemBoostType(item.name);
    if (t) out.boost[item.name] = t;
    const b = items.getBerryResistType(item.name);
    if (b) out.berry[item.name] = b;
    out.known.push(item.name);
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const cases = JSON.parse(process.argv[2] || "[]");
const results = [];
for (const c of cases) {
  try {
    /* Several modifiers only exist against a super-effective hit - Filter,
       Solid Rock, Expert Belt - so the case says what the type chart did
       rather than this assuming neutral. */
    const withIt = mods(c.atk, c.def, c.move, c.field, c.typeEff);
    const without = mods(c.atkBase || c.atk, c.defBase || c.def, c.move,
                         c.field, c.typeEff);
    results.push({
      id: c.id,
      stages: attributable(withIt, without),
      raw: { with: withIt, without: without },
    });
  } catch (e) {
    results.push({ id: c.id, error: String((e && e.message) || e) });
  }
}
process.stdout.write(JSON.stringify(results));
