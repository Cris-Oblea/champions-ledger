#!/usr/bin/env python3
"""Measure every combat modifier against Smogon's own Champions engine.

    python scripts/measure_modifiers.py            # measure and write the table
    python scripts/measure_modifiers.py --quick    # a short smoke subset

Serebii's item text says "slightly boosts the power", which is not a number,
and reciting the number from memory is exactly what this project forbids. So
each modifier is MEASURED: run one case through Smogon's engine with the
modifier and without it, and read the ratio off the two answers.

The output is data/db/modifiers.json, and the printed table is the evidence.
Anything the engine does not model shows as x1.00 and is dropped rather than
carried as a guess.
"""
import argparse, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "db", "modifiers.json")
PY = sys.executable
DMG = os.path.join(ROOT, "scripts", "damage.py")

NUM = re.compile(r"^\s*(\d+)-(\d+) damage of", re.M)


def run(args, timeout=90):
    """One engine call -> (lo, hi), or None if it could not be measured."""
    cmd = [PY, DMG] + args + ["--engine", "smogon", "--single-target"]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=timeout, cwd=ROOT)
    except subprocess.TimeoutExpired:
        return None
    m = NUM.search(p.stdout)
    return (int(m.group(1)), int(m.group(2))) if m else None


# Everything here EXISTS in Champions. Choice Band, Choice Specs, Assault Vest,
# Eviolite, Transistor, Steelworker, Ice Scales and Storm Drain were measured at
# x1.00 and then checked: none of them is in this format at all, which is why.
#
# Each case: a base query chosen so the modifier can actually fire, plus the
# flags that turn it on. A Fire-move case for Blaze, a contact move for Tough
# Claws, a super-effective hit for Filter.
PHYS = ["Garchomp", "Earthquake", "Kingambit", "--atk-sp", "32"]
CONTACT = ["Garchomp", "Dragon Claw", "Dragonite", "--atk-sp", "32"]
SPEC = ["Gholdengo", "Shadow Ball", "Garchomp", "--atk-sp", "32"]
FIRE = ["Incineroar", "Flare Blitz", "Kingambit", "--atk-sp", "32"]
WATER = ["Basculegion", "Wave Crash", "Garchomp", "--atk-sp", "32"]
SE = ["Garchomp", "Earthquake", "Kingambit", "--atk-sp", "32"]      # x2 on Steel

CASES = [
    # ---- attacker abilities -------------------------------------------
    ("atk_ability", "Adaptability", WATER, ["--atk-ability", "Adaptability"]),
    ("atk_ability", "Sheer Force", ["Garchomp", "Iron Head", "Kingambit",
                                    "--atk-sp", "32"],
     ["--atk-ability", "Sheer Force"]),
    ("atk_ability", "Tough Claws", CONTACT, ["--atk-ability", "Tough Claws"]),
    ("atk_ability", "Technician", ["Maushold", "Bullet Seed", "Garchomp",
                                   "--atk-sp", "32"],
     ["--atk-ability", "Technician"]),
    ("atk_ability", "Huge Power", PHYS, ["--atk-ability", "Huge Power"]),
    ("atk_ability", "Guts", PHYS, ["--atk-ability", "Guts",
                                   "--atk-status", "brn"]),

    ("atk_ability", "Sharpness", ["Gallade", "Sacred Sword", "Kingambit",
                                  "--atk-sp", "32"],
     ["--atk-ability", "Sharpness"]),
    ("atk_ability", "Iron Fist", ["Machamp", "Drain Punch", "Kingambit",
                                  "--atk-sp", "32"],
     ["--atk-ability", "Iron Fist"]),
    ("atk_ability", "Strong Jaw", ["Garchomp", "Crunch", "Farigiraf",
                                   "--atk-sp", "32"],
     ["--atk-ability", "Strong Jaw"]),
    ("atk_ability", "Reckless", ["Dragonite", "Double-Edge", "Kingambit",
                                 "--atk-sp", "32"],
     ["--atk-ability", "Reckless"]),
    ("atk_ability", "Hustle", PHYS, ["--atk-ability", "Hustle"]),
    ("atk_ability", "Supreme Overlord", PHYS,
     ["--atk-ability", "Supreme Overlord", "--allies-fainted", "2"]),
    ("atk_ability", "Punk Rock", ["Toucannon", "Boomburst", "Garchomp",
                                  "--atk-sp", "32"],
     ["--atk-ability", "Punk Rock"]),
    ("atk_ability", "Mega Launcher", ["Empoleon", "Dark Pulse", "Farigiraf",
                                      "--atk-sp", "32"],
     ["--atk-ability", "Mega Launcher"]),
    ("atk_ability", "Water Bubble", WATER, ["--atk-ability", "Water Bubble"]),
            # ---- defender abilities -------------------------------------------
    ("def_ability", "Multiscale", ["Kingambit", "Kowtow Cleave", "Dragonite",
                                   "--atk-sp", "32"],
     ["--def-ability", "Multiscale"]),
    ("def_ability", "Filter", SE, ["--def-ability", "Filter"]),
    ("def_ability", "Solid Rock", SE, ["--def-ability", "Solid Rock"]),
    ("def_ability", "Thick Fat", FIRE, ["--def-ability", "Thick Fat"]),
    ("def_ability", "Heatproof", FIRE, ["--def-ability", "Heatproof"]),
    ("def_ability", "Fluffy", CONTACT, ["--def-ability", "Fluffy"]),
        ("def_ability", "Purifying Salt", ["Sinistcha", "Shadow Ball", "Sableye",
                                       "--atk-sp", "32"],
     ["--def-ability", "Purifying Salt"]),
    ("def_ability", "Levitate", PHYS, ["--def-ability", "Levitate"]),
    ("def_ability", "Flash Fire", FIRE, ["--def-ability", "Flash Fire"]),
    ("def_ability", "Water Absorb", WATER, ["--def-ability", "Water Absorb"]),
        ("def_ability", "Bulletproof", ["Maushold", "Bullet Seed", "Garchomp",
                                    "--atk-sp", "32"],
     ["--def-ability", "Bulletproof"]),
    ("def_ability", "Soundproof", ["Toucannon", "Boomburst", "Garchomp",
                                   "--atk-sp", "32"],
     ["--def-ability", "Soundproof"]),
    # ---- attacker items -------------------------------------------------
    ("atk_item", "Life Orb", PHYS, ["--atk-item", "Life Orb"]),
            ("atk_item", "Expert Belt", SE, ["--atk-item", "Expert Belt"]),
    ("atk_item", "Muscle Band", PHYS, ["--atk-item", "Muscle Band"]),
    ("atk_item", "Wise Glasses", SPEC, ["--atk-item", "Wise Glasses"]),
    ("atk_item", "Black Glasses", ["Kingambit", "Kowtow Cleave", "Farigiraf",
                                   "--atk-sp", "32"],
     ["--atk-item", "Black Glasses"]),
    ("atk_item", "Mystic Water", WATER, ["--atk-item", "Mystic Water"]),
    ("atk_item", "Metal Coat", ["Aggron", "Iron Head", "Whimsicott",
                                "--atk-sp", "32"],
     ["--atk-item", "Metal Coat"]),
    ("atk_item", "Fairy Feather", ["Sylveon", "Moonblast", "Garchomp",
                                   "--atk-sp", "32"],
     ["--atk-item", "Fairy Feather"]),
    # ---- defender items -------------------------------------------------
    
    ("def_item", "Chople Berry", ["Machamp", "Close Combat", "Kingambit",
                                  "--atk-sp", "32"],
     ["--def-item", "Chople Berry"]),
    ("def_item", "Colbur Berry", ["Kingambit", "Kowtow Cleave", "Farigiraf",
                                  "--atk-sp", "32"],
     ["--def-item", "Colbur Berry"]),
    # ---- weather ---------------------------------------------------------
    ("weather", "Sun|Fire", FIRE, ["--weather", "Sun"]),
    ("weather", "Sun|Water", WATER, ["--weather", "Sun"]),
    ("weather", "Rain|Water", WATER, ["--weather", "Rain"]),
    ("weather", "Rain|Fire", FIRE, ["--weather", "Rain"]),
    # Sand and Snow raise a DEFENCE, they do not multiply damage: sand gives
    # Rock types +50% Sp. Def and snow gives Ice types +50% Defense. Measured
    # as x0.667 on the damage, which is the same thing seen from the other side.
    ("weather_def", "Sand|Rock|S", ["Gholdengo", "Shadow Ball", "Tyranitar",
                                    "--atk-sp", "32"], ["--weather", "Sand"]),
    ("weather_def", "Snow|Ice|P", ["Garchomp", "Dragon Claw", "Beartic",
                                   "--atk-sp", "32"], ["--weather", "Snow"]),
    # ---- terrain ---------------------------------------------------------
    ("terrain", "Electric|Electric", ["Jolteon", "Thunderbolt", "Pelipper",
                                      "--atk-sp", "32"],
     ["--terrain", "Electric"]),
    ("terrain", "Grassy|Grass", ["Meowscarada", "Flower Trick", "Garchomp",
                                 "--atk-sp", "32"], ["--terrain", "Grassy"]),
    ("terrain", "Grassy|Earthquake", PHYS, ["--terrain", "Grassy"]),
    ("terrain", "Psychic|Psychic", ["Farigiraf", "Psychic", "Machamp",
                                    "--atk-sp", "32"],
     ["--terrain", "Psychic"]),
    ("terrain", "Misty|Dragon", ["Dragonite", "Dragon Claw", "Garchomp",
                                 "--atk-sp", "32"], ["--terrain", "Misty"]),
]

# ---- the Field panel, one switch at a time -----------------------------
ELEC = ["Jolteon", "Thunderbolt", "Garchomp", "--atk-sp", "32"]
DARK = ["Kingambit", "Kowtow Cleave", "Farigiraf", "--atk-sp", "32"]
FAIRY = ["Sylveon", "Moonblast", "Garchomp", "--atk-sp", "32"]
STEEL = ["Aggron", "Iron Head", "Whimsicott", "--atk-sp", "32"]
CASES += [
    ("field", "Helping Hand", PHYS, ["--helping-hand"]),
    ("field", "Friend Guard", PHYS, ["--friend-guard"]),
    ("field", "Charge|Electric", ELEC, ["--charge"]),
    ("field", "Wonder Room", PHYS, ["--wonder-room"]),
    ("field", "Magic Room", PHYS + ["--atk-item", "Life Orb"], ["--magic-room"]),
    ("field", "Protected", PHYS, ["--protected"]),
    ("field", "Battery|special", SPEC, ["--battery"]),
    ("field", "Power Spot", PHYS, ["--power-spot"]),
    ("field", "Steely Spirit|Steel", STEEL, ["--steely-spirit"]),
    ("field", "Dark Aura|Dark", DARK, ["--dark-aura"]),
    ("field", "Fairy Aura|Fairy", FAIRY, ["--fairy-aura"]),
    ("field", "Beads of Ruin", SPEC, ["--beads-of-ruin"]),
    ("field", "Sword of Ruin", PHYS, ["--sword-of-ruin"]),
    ("field", "Tablets of Ruin", PHYS, ["--tablets-of-ruin"]),
    ("field", "Vessel of Ruin", SPEC, ["--vessel-of-ruin"]),
    # Gravity grounds a Flying type, so a Ground move goes from nothing to a
    # real number - the one switch that changes an immunity rather than a
    # multiplier.
    ("field", "Gravity|Ground vs Flying",
     ["Garchomp", "Earthquake", "Pelipper", "--atk-sp", "32"], ["--gravity"]),
    # burn halves a physical attack
    ("status", "Burn|physical", PHYS, ["--atk-status", "brn"]),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    cases = CASES[:8] if a.quick else CASES

    base_cache, table, rows = {}, {}, []
    for group, name, base, flags in cases:
        bk = tuple(base)
        if bk not in base_cache:
            base_cache[bk] = run(base)
        b = base_cache[bk]
        w = run(base + flags)
        if not b or not w:
            rows.append((group, name, "could not measure", None))
            continue
        # the ratio of the maxima, which is what a flat multiplier moves
        ratio = round(w[1] / b[1], 3) if b[1] else 0
        rows.append((group, name, "%d-%d -> %d-%d" % (b[0], b[1], w[0], w[1]),
                     ratio))
        table.setdefault(group, {})[name] = ratio

    print("  %-12s %-18s %-24s %s" % ("grupo", "modificador", "sin -> con", "x"))
    for g, n, shown, r in rows:
        print("  %-12s %-18s %-24s %s" % (g, n, shown,
                                          "%.2f" % r if r is not None else "-"))

    unmodelled = [n for g, n, s, r in rows if r == 1.0]
    if unmodelled:
        print("\n  el motor no las modela (x1.00), se descartan: %s"
              % ", ".join(unmodelled))
        for g in table:
            for n in list(table[g]):
                if table[g][n] == 1.0:
                    del table[g][n]

    if not a.quick:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump({"_comment":
                       "Multipliers MEASURED against Smogon's Champions engine "
                       "by scripts/measure_modifiers.py - never recited. Re-run "
                       "it after fetch_smogon_calc.py reports upstream moved.",
                       **table}, f, ensure_ascii=False, indent=1)
        print("\nwrote %s" % OUT)


if __name__ == "__main__":
    main()
