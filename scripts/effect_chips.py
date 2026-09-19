#!/usr/bin/env python3
"""One fact, one chip, and the chip says what its number governs.

    python scripts/effect_chips.py            # what every chip reads as
    python scripts/effect_chips.py --audit    # the ones with no subject yet

WHAT WAS WRONG (player, 2026-09-18, both halves of it):

    "en algunas descripciones de items como por ejemplo black glasses dice
     x1.2 3 veces seguidas... se tiene que llegar a 1 solo concenso de la
     verdad y mostrar la informacion claramente 1 vez de manera cuantitativa"

    "overgrow dice 1.5x y 1/3, deberia decir 1.5x damage y at 1/3 hp o algo
     parecido... swift swim dice Double y no dice que"

Black Glasses said x1.2 three times: twice from the engine, which probes a
physical and a special vehicle and gets the same answer from both, and once
more from Smogon's sentence, which says it too. Life Orb managed to disagree
with itself while doing it - x1.2998 twice and 1.3x once - because the engine
works in 4096ths and 5324/4096 is not 1.3 exactly.

And a chip reading 1/3, or Double, names no subject at all. The player's rule
for when a tag earns its place: "si voy a repetir algo en tag es porque la
informacion es nueva o complementaria o tiene otra mirada que ayuda a entender
la habilidad."

THE FIVE RULES, in the order they apply.

 1. COLLAPSE THE ENGINE'S OWN MEASUREMENTS by the value they carry and the
    quantity they multiply. A physical and a special vehicle of the same thing
    are one fact measured twice, not two facts.

 2. ROUND TO WHAT THE ENGINE MEANS. Ten distinct 4096ths exist in Champions and
    two of them - 5324 and 5325 - are both x1.3; nothing else collides at two
    decimals, so rounding there says 1.3 without ever merging two real numbers.
    The exact 4096ths stays in data/db/effects.json and in the chip's tooltip,
    which is where a person checking the working would look.

 3. DROP A TEXT NUMBER THE ENGINE ALREADY MEASURED. The engine is what actually
    runs; Smogon's sentence saying the same thing is agreement, not a second
    fact. Where they DISAGREE, build_effects.py has already recorded a note.

 4. DROP THE WORD-VALUES - half, double, third, quarter. They carry no digit
    and name no subject, and the word is already in the sentence underneath:
    Swift Swim's chip said "Double" next to "this Pokemon's Speed is doubled".

 5. DROP THE LAST TEXT CHIP OF A ONE-NUMBER SENTENCE. If the description holds
    exactly one number, the sentence IS the chip - Aerilate's 1.2x beside "have
    1.2x power" is the same three characters twice. Two or more numbers and the
    chips become the breakdown, which is the reading Overgrow wanted.

WHAT SURVIVES IS THEN LABELLED, and the label is READ OFF THE SENTENCE rather
than guessed: the words on each side of the number, matched against the tables
below. A number whose subject is not in the tables keeps the bare figure and
--audit lists it, so the gaps are counted rather than quietly wrong.
"""
import argparse
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EFFECTS = os.path.join(ROOT, "data", "db", "effects.json")

# No digit, no subject, and the word is in the sentence already.
WORD_VALUES = {"half", "double", "third", "quarter"}

TIMES = "×"                        # the multiplication sign Smogon writes


def quantity(sides):
    """What the engine multiplied, from every side and stage it was seen on.

    Every stage but one scales damage in the direction you would read it: a
    defender's x0.5 at `final`, at `base power`, or on the attacker's `attack`
    stat all mean half the damage arriving.

    `defence` is the exception and it INVERTS. Fur Coat pushes x2 on Defence,
    which is half the damage taken, so "x2 damage taken" would be exactly
    backwards. It names the stat instead and the sentence says the rest.

    AND THE SIDES ARE WEIGHED TOGETHER, not one chip each. Fairy Aura is
    measured as attacker AND as defender and returns x1.33 both times, because
    the ability boosts a Fairy move whoever throws it - two chips reading
    "x1.33 damage dealt" and "x1.33 damage taken" is the same number twice,
    which is the thing being fixed.
    """
    roles = {r for r, _ in sides}
    if roles == {"attacker"}:
        return "damage dealt"
    if any(s == "defence" for _, s in sides):
        return "Defence"
    if roles == {"defender"}:
        return "damage taken"
    return "damage"


# The subject of a number, read off the words beside it. Ordered - the first
# match wins, so the specific patterns come before the general ones. Every
# entry here was taken from a sentence that is really in the data; nothing is
# listed on the chance that it might be.
AFTER = [
    (r"^\s*%?\s*chance to (\w+)", lambda m: m.group(1) + " chance"),
    (r"^\s*%?\s*chance", lambda m: "chance"),
    (r"^\s*(?:%|" + TIMES + r"|x)?\s*(?:target's )?max HP", lambda m: "max HP"),
    (r"^\s*or less of its max HP", lambda m: None),      # BEFORE answers this
    (r"^\s*(?:%|" + TIMES + r"|x)?\s*power", lambda m: "power"),
    (r"^\s*(?:%|" + TIMES + r"|x)?\s*accuracy", lambda m: "accuracy"),
    (r"^\s*(?:%|" + TIMES + r"|x)?\s*damage", lambda m: "damage"),
    (r"^\s*(?:%|" + TIMES + r"|x)?\s*recoil", lambda m: "recoil"),
    (r"^\s*(?:%|" + TIMES + r"|x)?\s*(SpD|SpA|Def|Atk|Spe)\b",
     lambda m: m.group(1)),
    (r"^\s*(?:%|" + TIMES + r"|x)?\s*(Defense|Defence|Attack|Speed)\b",
     lambda m: m.group(1)),
    (r"^\s*%\s*(confusion|psn|burn|freeze|flinch|paralyze|par|frz)\b",
     lambda m: {"psn": "poison", "par": "paralysis",
                "frz": "freeze"}.get(m.group(1), m.group(1)) + " chance"),
    (r"^\s*%\s*dmg dealt", lambda m: "of damage dealt"),
    # Rivalry: "attacks do 1.25x on same gender; 0.75x on opposite"
    (r"^\s*(?:%|" + TIMES + r"|x)\s*on", lambda m: "damage"),
    (r"^\s*%\s*-\d", lambda m: "chance"),
]
BEFORE = [
    (r"\bAt\s*$", lambda m: "at {n} max HP"),            # Overgrow's threshold
    (r"offensive stat is\s*$", lambda m: "offensive stat"),
    (r"(Attack|Speed|Defense|Defence|SpA|SpD|Atk|Def|Spe) is\s*$",
     lambda m: m.group(1)),
    (r"\baccuracy\b[^.]*\bis\s*$", lambda m: "accuracy"),
    (r"\bis healed\s*$", lambda m: "healed"),
    (r"\bis hurt\s*$", lambda m: "damage taken"),
    (r"\bRecovers\s*$", lambda m: "of damage dealt"),
    (r"\bUser loses\s*$", lambda m: "self-damage"),
    (r"\bheals\s*$", lambda m: "healed"),
    (r"\bMax\s*$", lambda m: "at most"),
]


def subject(num):
    """What this number governs, or None if the sentence does not say."""
    phrase, shown = num.get("phrase") or "", num["as_written"]
    lit = shown.split(" ")[0].rstrip("x%")      # the digits, bare
    at = phrase.find(lit)
    if at < 0:
        return None
    before, after = phrase[:at], phrase[at + len(lit):]
    for pat, make in AFTER:
        m = re.match(pat, after)
        if m:
            got = make(m)
            if got:
                return got
            break
    for pat, make in BEFORE:
        m = re.search(pat, before)
        if m:
            return make(m)
    # A SECOND FRACTION IN A SENTENCE THAT IS ABOUT max HP takes the same unit:
    # Salt Cure "deals 1/16 max HP each turn; 1/8 on Steel, Water", Binding
    # Band "1/6 max HP per turn instead of 1/8". Guarded on the sentence really
    # saying "max HP", which is what keeps Dry Skin out of it - "healed 1/4 by
    # Water... 1/8 by Sun" names no unit and its two fractions do opposite
    # things, so it stays bare rather than being labelled wrongly.
    if num.get("kind") == "fraction" and "max HP" in phrase:
        return "of max HP"
    return None


def trim(x4096):
    """The engine's 4096ths as the number a person would say it is."""
    return "%g" % round(x4096 / 4096.0, 2)


def chips(entry):
    """[[text, why], ...] - what the screen shows for one item/ability/move."""
    out, engine_values = [], set()

    # --- 1 and 2: the engine's own, collapsed and rounded ---------------
    groups = {}
    for e in entry.get("effects") or []:
        if not e.get("x4096"):
            continue
        role = e["when"].split(",")[0].replace("as ", "").strip()
        g = groups.setdefault(trim(e["x4096"]),
                              {"raw": set(), "when": [], "sides": set()})
        g["raw"].add(e["x4096"])
        g["sides"].add((role, e.get("stage")))
        if e["when"] not in g["when"]:
            g["when"].append(e["when"])
    for shown in sorted(groups):
        g = groups[shown]
        engine_values.add(float(shown))
        raw = " and ".join("%d/4096" % r for r in sorted(g["raw"]))
        out.append(["x" + shown + " " + quantity(g["sides"]),
                    "measured in the engine: " + raw + ", through "
                    + "; ".join(g["when"][:4])])

    # --- 3, 4 and 5: what Smogon's sentence adds on top -----------------
    nums = entry.get("text_numbers") or []
    if len(nums) > 1:
        seen = set()
        for n in nums:
            shown = n["as_written"]
            if shown in WORD_VALUES or shown in seen:
                continue
            if any(abs(n["value"] - v) < 0.02 for v in engine_values):
                continue
            seen.add(shown)
            out.append([label(shown, subject(n)), n.get("phrase") or ""])
    return out


def label(shown, what):
    """The number and its subject, written the way the engine's chips are.

    Two small things, both of which the eye catches before the meaning does:

    * `2x` becomes `x2`, because the engine's chips beside it read `x0.5` and
      a row that says "x0.5 damage taken" and "2x damage" in the same breath
      looks like two different kinds of number. It is one kind.
    * A subject already inside the figure is not said twice. `as_written` for
      Salt Cure's first fraction is "1/16 of max HP" and the sentence around it
      says "max HP" as well, which read as "1/16 of max HP max HP".
    """
    m = re.match(r"^([\d.]+)x$", shown)
    if m:
        shown = "x" + m.group(1)
    if not what:
        return shown
    if "{n}" in what:
        return what.format(n=shown)
    if what.replace("of ", "").lower() in shown.lower():
        return shown
    return shown + " " + what


BARE = re.compile(r"^[\d./]+[x%]?$")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--audit", action="store_true",
                    help="only the numbers whose subject is not in the tables")
    a = ap.parse_args()
    blob = json.load(io.open(EFFECTS, encoding="utf-8"))["effects"]
    bare, total = [], 0
    for name in sorted(blob):
        cs = chips(blob[name])
        total += len(cs)
        bare += [(name, c[0]) for c in cs if BARE.match(c[0])]
        if cs and not a.audit:
            print("%-22s %s" % (name[:22], "  ".join(c[0] for c in cs)))
    print("\n%d chips over %d entries; %d still bare"
          % (total, len(blob), len(bare)))
    if a.audit:
        for name, c in bare:
            print("  %-22s %s" % (name[:22], c))


if __name__ == "__main__":
    main()
