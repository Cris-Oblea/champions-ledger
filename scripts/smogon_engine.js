// Runs Smogon's own Champions damage engine over a batch of questions.
//
// Why this exists: scripts/damage.py implements the Champions formula exactly -
// 872 of 909 cases match this engine to the last HP - but it models four
// modifiers, while this engine models 46 attacker-side abilities, 65
// defender-side ones, a dozen conditional base powers and every multi-hit.
// Reimplementing those in Python would drift the moment Smogon updates them, so
// anything ability-dependent is asked here instead.
//
// The bundle is vendored under data/raw/smogon_calc/ and is plain CommonJS, so
// this needs Node and nothing else - no npm install.
//
//   node scripts/smogon_engine.js cases.json
//   echo '[{...}]' | node scripts/smogon_engine.js -
//
// A case is:
//   {attacker, move, defender,               // Smogon spellings: "Glalie-Mega"
//    anature, aevs:{atk:32}, aability, aitem, aboosts:{atk:1}, acurHP,
//    dnature, devs:{hp:20,def:12}, dability, ditem, dboosts,
//    weather, terrain, gameType,             // gameType defaults to Doubles
//    screen, isCrit, alliesFainted}
//
// Output is one JSON array: {lo, hi, maxHP, desc, rolls, error}.

const path = require('path');
const fs = require('fs');
const BUNDLE = path.join(__dirname, '..', 'data', 'raw', 'smogon_calc', 'calc');

let Generations, Pokemon, Move, Field, calculateChampions;
try {
  ({Generations} = require(path.join(BUNDLE, 'data', 'index.js')));
  ({Pokemon} = require(path.join(BUNDLE, 'pokemon.js')));
  ({Move} = require(path.join(BUNDLE, 'move.js')));
  ({Field} = require(path.join(BUNDLE, 'field.js')));
  ({calculateChampions} = require(path.join(BUNDLE, 'mechanics', 'champions.js')));
} catch (e) {
  console.error('Cannot load the Champions engine from ' + BUNDLE);
  console.error('Re-fetch it with: python scripts/fetch_smogon_calc.py');
  process.exit(2);
}

const gen = Generations.get(0);   // Champions is generation 0 in this bundle

function readInput(arg) {
  if (arg === '-' || arg === undefined) {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  }
  return JSON.parse(fs.readFileSync(arg, 'utf8'));
}

const cases = readInput(process.argv[2]);
const out = [];

for (const c of cases) {
  try {
    const attacker = new Pokemon(gen, c.attacker, {
      nature: c.anature || 'Serious',
      evs: c.aevs || {},                 // "evs" is the SP field for gen 0
      ability: c.aability || undefined,
      item: c.aitem || undefined,
      boosts: c.aboosts || undefined,
      alliesFainted: c.alliesFainted || undefined,
      curHP: c.acurHP || undefined,
      status: c.astatus || undefined,
    });
    const defender = new Pokemon(gen, c.defender, {
      nature: c.dnature || 'Serious',
      evs: c.devs || {},
      ability: c.dability || undefined,
      item: c.ditem || undefined,
      boosts: c.dboosts || undefined,
      curHP: c.dcurHP || undefined,
      status: c.dstatus || undefined,
    });
    // Champions is VGC, so Doubles is the default - Singles would silently drop
    // the x0.75 spread modifier off every spread move.
    // Every field switch the calculator's own Field panel exposes, so a
    // number here can be checked against calc.pokemonshowdown.com rather than
    // reasoned about. Side flags are split: a Helping Hand is on the ATTACKER's
    // side, a Friend Guard on the DEFENDER's.
    const field = new Field({
      gameType: c.gameType || 'Doubles',
      weather: c.weather || undefined,
      terrain: c.terrain || undefined,
      isGravity: !!c.gravity,
      isMagicRoom: !!c.magicRoom,
      isWonderRoom: !!c.wonderRoom,
      isBeadsOfRuin: !!c.beadsOfRuin,
      isSwordOfRuin: !!c.swordOfRuin,
      isTabletsOfRuin: !!c.tabletsOfRuin,
      isVesselOfRuin: !!c.vesselOfRuin,
      isAuraBreak: !!c.auraBreak,
      isDarkAura: !!c.darkAura,
      isFairyAura: !!c.fairyAura,
      attackerSide: {
        isHelpingHand: !!c.helpingHand,
        isBattery: !!c.battery,
        isPowerSpot: !!c.powerSpot,
        isSteelySpirit: !!c.steelySpirit,
        isFlowerGift: !!c.flowerGiftAtk,
        isTailwind: !!c.tailwindAtk,
        isPowerTrick: !!c.powerTrickAtk,
      },
      defenderSide: {
        isReflect: c.screen === 'Reflect',
        isLightScreen: c.screen === 'Light Screen',
        isAuroraVeil: c.screen === 'Aurora Veil',
        isFriendGuard: !!c.friendGuard,
        isProtected: !!c.protected,
        isFlowerGift: !!c.flowerGiftDef,
        isForesight: !!c.foresight,
        isPowerTrick: !!c.powerTrickDef,
      },
    });
    if (c.charge) field.attackerSide.isCharge = true;
    const move = new Move(gen, c.move, {isCrit: !!c.isCrit});
    const result = calculateChampions(gen, attacker, defender, move, field);

    // For a single hit `damage` is one 16-long roll array. For a multi-hit (or
    // Parental Bond) it is one array PER HIT, so the damage the target actually
    // takes is the per-hit minimum summed, to the per-hit maximum summed -
    // never the min and max of the flattened list.
    const d = result.damage;
    const perHit = Array.isArray(d) && Array.isArray(d[0]) ? d : [d];
    const arrays = perHit.map(h => (Array.isArray(h) ? h.flat(2) : [h]))
      .filter(h => h.length && typeof h[0] === 'number');
    const lo = arrays.reduce((s, h) => s + Math.min(...h), 0);
    const hi = arrays.reduce((s, h) => s + Math.max(...h), 0);
    let desc = '';
    try { desc = result.desc(); } catch (e) { desc = '(no damage - immune, blocked or the move fails)'; }
    // kochance() folds in everything that happens BETWEEN turns - Leftovers,
    // sand and hail chip, burn, poison and its toxic counter, Leech Seed,
    // Grassy Terrain, entry hazards - which is what turns a bare "2HKO" into
    // a real one. It only has anything to say once those are actually set.
    // kochance(false) reports its own failures with console.log - straight into
    // the stdout this script's JSON goes to. Muzzle it for the call, and skip
    // it entirely when nothing landed (immune, blocked, or the move fails).
    let ko = null;
    if (hi > 0) {
      const say = console.log;
      console.log = () => {};
      try { ko = result.kochance(false); } catch (e) { ko = null; }
      finally { console.log = say; }
    }
    out.push({
      attacker: attacker.name, move: c.move, defender: defender.name,
      ability: attacker.ability, dability: defender.ability,
      maxHP: defender.maxHP(),
      hits: arrays.length,
      lo: lo, hi: hi,
      pct_lo: +(100 * lo / defender.maxHP()).toFixed(1),
      pct_hi: +(100 * hi / defender.maxHP()).toFixed(1),
      desc: desc,
      ko_text: ko && ko.text ? ko.text : null,
      ko_n: ko ? ko.n : null,
      ko_chance: ko ? ko.chance : null,
    });
  } catch (e) {
    out.push({attacker: c.attacker, move: c.move, defender: c.defender,
              error: String(e && e.message ? e.message : e)});
  }
}
process.stdout.write(JSON.stringify(out, null, 1));
