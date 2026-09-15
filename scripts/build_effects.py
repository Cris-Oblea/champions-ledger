#!/usr/bin/env python3
"""Every item and ability, as a number, read out of Smogon's own engine.

    python scripts/build_effects.py            # build data/db/effects.json
    python scripts/build_effects.py --audit    # and list what has no number

WHY. Serebii's item text is qualitative - "slightly boosts the power", "casts a
tricky glare" - and MEASURED: 197 of the 199 items in Champions carry not one
number in their description. Abilities are better and still prose. A set cannot
be compared against another set out of sentences.

WHY NOT MEASURE THE DAMAGE. A multiplier cannot be recovered from a damage
ratio: the formula ends in `+ 2` and every stage floors, so a x1.5 ability
measures as 1.453 at the low roll and 1.477 at the high one, and no averaging
makes either of them the number.

The engine does not hide it. It builds each stage as a list of multipliers in
4096ths - 4915 is x1.2, 5324 is x1.3, 6144 is x1.5 - and champions.js exports
the four functions that build those lists. scripts/probe_modifiers.js calls
them and reads the values out, against a baseline identical but for the one
thing being probed, so what comes back is attributable and exact.

WHAT THE CASES ARE. Generated, not hand-written - the 37 hand-written cases in
measure_modifiers.py are why only 10 items and 27 abilities had a number. The
engine is asked which items boost a type and which berries resist one, and a
case is built accordingly; everything else gets a generic physical and special
probe on both sides. An item that moves nothing in any of them is reported as
unmodelled rather than recorded as x1.00, because "the engine does not simulate
this" and "this does nothing" are different facts.
"""
import argparse, io, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "db")
OUT = os.path.join(DB, "effects.json")
PROBE = os.path.join(ROOT, "scripts", "probe_modifiers.js")

# Two Pokemon with nothing unusual about them, used as the neutral stage on
# which everything is probed. Garchomp attacks physically, Gholdengo specially;
# the defender is whatever the case needs.
ATK_PHYS = "Garchomp"
ATK_SPEC = "Gholdengo"
DEF = "Kingambit"

# Conditions a modifier needs before it exists at all. Without them the probe
# would report "no effect" for an ability that works perfectly well - which is
# the difference between a missing number and a wrong one.
NEEDS = {
    "Guts": {"status": "brn"},
    "Quick Feet": {"status": "par"},
    "Marvel Scale": {"status": "brn"},
    "Flare Boost": {"status": "brn"},
    "Toxic Boost": {"status": "psn"},
    "Supreme Overlord": {"alliesFainted": 3},
}


def load(name):
    with io.open(os.path.join(DB, name), encoding="utf-8") as f:
        return json.load(f)


def rows(blob, key):
    return blob if isinstance(blob, list) else (blob.get(key) or [])


def engine_map():
    r = subprocess.run(["node", PROBE, "--map"], cwd=ROOT,
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("the probe could not answer: " + (r.stderr or r.stdout))
    return json.loads(r.stdout)


def run(cases, chunk=120):
    got = []
    for i in range(0, len(cases), chunk):
        part = cases[i:i + chunk]
        r = subprocess.run(["node", PROBE, json.dumps(part)], cwd=ROOT,
                           capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit("probe failed: " + (r.stderr or r.stdout)[:400])
        got += json.loads(r.stdout)
        print("  probed %d/%d" % (min(i + chunk, len(cases)), len(cases)),
              flush=True)
    return got


def vehicles(moves):
    """A move to probe with, per type AND per category, verified by the engine.

    Three things a vehicle has to be, and each was learned by getting it wrong:

    * the category asked for. The first version picked the highest-powered move
      of each type with no regard for category, so the "special" probe ran on
      Poltergeist - a PHYSICAL move - and Muscle Band came out as boosting
      special attacks, which it does not.
    * honest about its power. Acrobatics reports 110 with no item and 55 with
      one; a probe through it measures the item, not the thing being probed.
      Caught by asking the engine for the base power and keeping only moves
      that agree with the database.
    * capable of doing damage at all. Poltergeist reports a perfectly good base
      power of 110 and deals ZERO against a target holding no item, because the
      engine zeroes it a stage later. Nothing can be measured through a move
      that deals nothing, and every probe through it reported "no effect" -
      which is how Wise Glasses came out unmodelled when it is plainly x1.1.

    Returns {(type, category): move name} plus ("any", category) for the
    generic probes.
    """
    cands = {}
    for m in moves:
        if not m.get("useable") or m.get("category") == "Status":
            continue
        if not m.get("power") or m.get("hits"):
            continue
        key = (m.get("type"), m.get("category"))
        if key[0] and key[1]:
            cands.setdefault(key, []).append(m)
    for k in cands:
        cands[k].sort(key=lambda m: -m["power"])
        cands[k] = cands[k][:6]

    probes, want = [], {}
    for (t, cat), ms in cands.items():
        for m in ms:
            cid = "vehicle|%s %s|%s" % (t, cat, m["name"])
            want[cid] = ((t, cat), m["name"], m["power"])
            probes.append({"id": cid, "move": m["name"],
                           "atk": {"name": ATK_PHYS if cat == "Physical"
                                   else ATK_SPEC},
                           "def": {"name": DEF}})
    out = {}
    for r in run(probes, chunk=250):
        if r.get("error"):
            continue
        key, name, power = want[r["id"]]
        w = ((r.get("raw") or {}).get("without") or {})
        if w.get("basePower") == power and (w.get("damage") or 0) > 0 \
                and w.get("category") == key[1] and key not in out:
            out[key] = name
    # The generic pair, and WHICH ONE MATTERS. A type-keyed ability is
    # measured through whatever move the generic probe happens to use, so
    # Fluffy came back as "as defender, special move x2" when the vehicle was
    # a Fire move and the x2 is Fluffy's Fire weakness, not a fact about
    # special moves. Normal is chosen where possible - the type nothing keys
    # on - and the type is carried into the label either way.
    for cat in ("Physical", "Special"):
        got = [(t, v) for (t, c), v in out.items() if c == cat]
        if not got:
            continue
        pick = ([g for g in got if g[0] == "Normal"] or sorted(got))[0]
        out[("any", cat)] = pick[1]
        out[("anytype", cat)] = pick[0]
    return out


def a_move(veh, kind, cat):
    """A verified vehicle of this type (or any) in this category."""
    return veh.get((kind, cat)) or veh.get(("any", cat))


def generic_label(veh, cat):
    """What a generic probe really used, so the label cannot mislead."""
    return "%s %s move" % (veh.get(("anytype", cat), "?"), cat.lower())


def cases_for_items(items, emap, veh):
    out = []
    for it in items:
        name = it["name"]
        if it.get("is_mega_stone"):
            continue                      # a stone creates a form, not a mod
        boost = emap["boost"].get(name)
        berry = emap["berry"].get(name)
        if boost:
            # an item that boosts a type boosts it in EITHER category, so both
            # are probed - and the label says which, because that is the fact
            for cat in ("Physical", "Special"):
                mv = a_move(veh, boost, cat)
                if not mv:
                    continue
                out.append({"id": "item|%s|as attacker, %s %s move"
                                  % (name, boost, cat.lower()),
                            "move": mv,
                            "atk": {"name": ATK_PHYS if cat == "Physical"
                                    else ATK_SPEC, "item": name},
                            "atkBase": {"name": ATK_PHYS if cat == "Physical"
                                        else ATK_SPEC},
                            "def": {"name": DEF}})
            continue
        if berry:
            for cat in ("Physical", "Special"):
                mv = a_move(veh, berry, cat)
                if not mv:
                    continue
                out.append({"id": "item|%s|as defender, super-effective %s %s"
                                  % (name, berry, cat.lower()),
                            "move": mv, "typeEff": 2,
                            "atk": {"name": ATK_PHYS if cat == "Physical"
                                    else ATK_SPEC},
                            "def": {"name": DEF, "item": name},
                            "defBase": {"name": DEF}})
            continue
        for side in ("atk", "def"):
            for cat in ("Physical", "Special"):
                mv = a_move(veh, "any", cat)
                if not mv:
                    continue
                who = ATK_PHYS if cat == "Physical" else ATK_SPEC
                label = ("as attacker" if side == "atk" else "as defender")
                c = {"id": "item|%s|%s, %s"
                           % (name, label, generic_label(veh, cat)),
                     "move": mv, "typeEff": 2}
                if side == "atk":
                    c["atk"] = {"name": who, "item": name}
                    c["atkBase"] = {"name": who}
                    c["def"] = {"name": DEF}
                else:
                    c["atk"] = {"name": who}
                    c["def"] = {"name": DEF, "item": name}
                    c["defBase"] = {"name": DEF}
                out.append(c)
    return out


def cases_for_abilities(abilities, veh, touches):
    """Both categories on both sides, plus any move the ability is known to
    touch - ability_moves.json already works out which - so an ability that
    only fires on punches or on sound is probed through one."""
    out = []
    for ab in abilities:
        name = ab["name"]
        extra = NEEDS.get(name, {})
        picks = [("Physical", a_move(veh, "any", "Physical")),
                 ("Special", a_move(veh, "any", "Special"))]
        for mv in (touches.get(name) or [])[:2]:
            picks.append((None, mv))
        for cat, mv in picks:
            if not mv:
                continue
            who = ATK_PHYS if cat != "Special" else ATK_SPEC
            what = generic_label(veh, cat) if cat else ("using %s" % mv)
            for side in ("atk", "def"):
                label = "as attacker" if side == "atk" else "as defender"
                c = {"id": "ability|%s|%s, %s" % (name, label, what),
                     "move": mv, "typeEff": 2}
                if side == "atk":
                    c["atk"] = dict({"name": who, "ability": name}, **extra)
                    c["atkBase"] = dict({"name": who}, **extra)
                    c["def"] = {"name": DEF}
                else:
                    c["atk"] = {"name": who}
                    c["def"] = dict({"name": DEF, "ability": name}, **extra)
                    c["defBase"] = dict({"name": DEF}, **extra)
                out.append(c)
    return out


# ---------------------------------------------------------------------------
# The numbers the engine cannot give, from the source that writes them down.
#
# The engine models DAMAGE. It does not model healing, accuracy or speed, and
# its item records carry nothing but identity - `Sitrus Berry` is
# {isBerry, naturalGift} and no more. Serebii's item text is worse: 197 of 199
# carry no number at all.
#
# Smogon's own dex text does, and the project already downloads it into
# data/db/smogon_basics.json:
#
#   Sitrus Berry  "Restores 1/4 max HP when at 1/2 max HP or less."
#   Wide Lens     "The accuracy of attacks by the holder is 1.1x."
#   Leftovers     "At the end of every turn, holder restores 1/16 of its max HP."
#
# 51 of 169 items, 89 of 215 abilities and 267 of 515 moves carry a number
# there. Every one extracted below keeps the sentence it came from, so a number
# in this file can always be checked against the words that produced it rather
# than being taken on trust.
NUMBER_PATTERNS = [
    ("multiplier", r"(\d+(?:\.\d+)?)\s*[x\u00d7](?![\w])"),
    ("fraction of max HP", r"(\d+)/(\d+)\s+(?:its\s+|of\s+its\s+)?max HP"),
    ("fraction", r"(?<![\d/])(\d+)/(\d+)(?!\d)"),
    ("percent", r"(\d+(?:\.\d+)?)\s*%"),
    ("stages", r"(\d+)\s+stages?"),
    ("turns", r"(\d+)\s+turns?"),
]


# Smogon writes some of it in words, and a word that means a number is a
# number: "Fire power against it is halved" is x0.5, and the cross-check
# against the engine reported a disagreement over it until this existed.
WORD_VALUES = [
    (r"\bhalves\b|\bhalved\b|\bhalf\b", 0.5, "half"),
    (r"\bdoubles\b|\bdoubled\b|\bdouble\b", 2.0, "double"),
    (r"\bquarter\b", 0.25, "quarter"),
    (r"\bthird\b", 1 / 3.0, "third"),
]


def sentence_around(text, at):
    """The sentence a number sits in - the evidence for it."""
    # `rfind` returns -1 when there is no earlier sentence, and -1 + 2 is 1 -
    # which quietly ate the first letter of every phrase that began the text
    # ("t the end of every turn...").
    found = text.rfind(". ", 0, at)
    start = 0 if found < 0 else found + 2
    end = text.find(". ", at)
    return text[start:(end + 1 if end >= 0 else len(text))].strip()


def numbers_from(text):
    out, seen = [], set()
    for kind, pat in NUMBER_PATTERNS:
        for m in re.finditer(pat, text):
            if kind in ("fraction", "fraction of max HP"):
                num, den = int(m.group(1)), int(m.group(2))
                if not den:
                    continue
                value = round(num / den, 6)
                shown = "%d/%d" % (num, den)
                if kind == "fraction of max HP":
                    shown += " of max HP"
            else:
                value = float(m.group(1))
                shown = m.group(1) + {"multiplier": "x", "percent": "%"}.get(
                    kind, "")
                if kind in ("stages", "turns"):
                    # ONE STAGE, NOT "1 stages". The unit belongs to the number
                    # and is written once, here: the app used to append it a
                    # second time and Intimidate read "1 stages stages" on the
                    # player's screen, Light Clay "8 TURNS TURNS". `as_written`
                    # is now complete on its own, which is what stops that
                    # happening again wherever else it gets printed.
                    unit = kind[:-1] if value == 1 else kind
                    shown = "%s %s" % (m.group(1), unit)
            key = (kind, shown, m.start())
            if key in seen:
                continue
            seen.add(key)
            out.append({"kind": kind, "value": value, "as_written": shown,
                        "phrase": sentence_around(text, m.start())})
    for pat, value, shown in WORD_VALUES:
        for m in re.finditer(pat, text, re.I):
            out.append({"kind": "multiplier", "value": value,
                        "as_written": shown,
                        "phrase": sentence_around(text, m.start())})
    # a fraction already claimed as "of max HP" should not be repeated as a
    # bare fraction: one number, one meaning. Matched on the VALUE and not on
    # what it reads as, because "1/16" and "1/16 of max HP" are the same number
    # written two ways and comparing the words stopped catching it.
    hp = {(n["value"], n["phrase"]) for n in out
          if n["kind"] == "fraction of max HP"}
    return [n for n in out
            if not (n["kind"] == "fraction"
                    and (n["value"], n["phrase"]) in hp)]


def smogon_text():
    """name -> (kind, description), from Smogon's own tables."""
    try:
        b = load("smogon_basics.json")
    except (OSError, ValueError):
        return {}
    out = {}
    for kind, key in (("item", "items"), ("ability", "abilities"),
                      ("move", "moves")):
        for r in b.get(key) or []:
            if isinstance(r, dict) and r.get("name"):
                out[(kind, r["name"])] = r.get("description") or ""
    return out


STAGE = {"bp": "base power", "at": "attack", "df": "defence", "fin": "final"}


def collect(results):
    """id -> the exact multipliers it adds, per stage, keyed by the thing."""
    out = {}
    for r in results:
        if r.get("error"):
            kind, name = r["id"].split("|")[:2]
            out.setdefault(name, {"kind": kind, "effects": [], "notes": []})
            note = r["error"]
            if "megaStone" in note:
                note = "the engine's item table does not carry this item"
            if note not in out[name]["notes"]:
                out[name]["notes"].append(note)
            continue
        kind, name, when = r["id"].split("|", 2)
        e = out.setdefault(name, {"kind": kind, "effects": [], "notes": []})
        for stage, vals in (r.get("stages") or {}).items():
            if stage == "basePower":
                e["effects"].append({"when": when, "stage": "base power",
                                     "from": vals[0], "to": vals[1]})
                continue
            for v in vals:
                got = {"when": when, "stage": STAGE.get(stage, stage),
                       "x4096": v, "multiplier": round(v / 4096.0, 4)}
                if got not in e["effects"]:
                    e["effects"].append(got)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--audit", action="store_true")
    a = ap.parse_args()

    items = rows(load("items.json"), "items")
    abilities = rows(load("abilities.json"), "abilities")
    moves = rows(load("moves.json"), "moves")
    try:
        touches = load("ability_moves.json")
        touches = touches.get("abilities", touches)
    except (OSError, ValueError):
        touches = {}
    if isinstance(touches, dict):
        touches = {k: (v.get("moves") if isinstance(v, dict) else v) or []
                   for k, v in touches.items()}

    emap = engine_map()
    veh = vehicles(moves)
    print("verified probe moves: %d type/category pairs" % len(veh))

    cases = (cases_for_items(items, emap, veh)
             + cases_for_abilities(abilities, veh, touches))
    print("%d cases (%d items, %d abilities)"
          % (len(cases), len(items), len(abilities)))
    got = collect(run(cases))

    # One fact, said once. An ability is probed through a generic move of each
    # category AND through whatever ability_moves.json says it touches, so the
    # same x1.5 comes back three times with three labels. The generic label is
    # the true one - "physical move" rather than "using Accelerock", which is
    # just the vehicle - so a specific label is dropped whenever a generic one
    # already carries that exact multiplier at that exact stage.
    for v in got.values():
        generic = {(e["stage"], e.get("x4096")) for e in v["effects"]
                   if ", using " not in e["when"]}
        v["effects"] = [e for e in v["effects"]
                        if ", using " not in e["when"]
                        or (e["stage"], e.get("x4096")) not in generic]
    # The text numbers, beside the engine's. Provenance is per number: an
    # "engine" multiplier is what the engine actually applies, a "smogon text"
    # one is what Smogon says it applies. Where both exist they are compared,
    # and a disagreement is reported rather than resolved - if the two sources
    # of truth disagree, that is the finding.
    text = smogon_text()
    for (kind, name), desc in text.items():
        if not desc:
            continue
        nums = numbers_from(desc)
        if not nums:
            continue
        e = got.setdefault(name, {"kind": kind, "effects": [], "notes": []})
        e.setdefault("kind", kind)
        e["described"] = desc
        e["text_numbers"] = nums
        engine_x = [f["multiplier"] for f in e["effects"]
                    if f.get("multiplier")]
        # A multiplier can be written as a multiplier, as a fraction or as a
        # word: Fluffy's "takes 1/2 damage" IS x0.5, and reading only the "2x"
        # in the same sentence reported a disagreement that was not one.
        said_x = [n["value"] for n in nums
                  if n["kind"] in ("multiplier", "fraction")]
        for x in engine_x:
            if said_x and not any(abs(x - y) < 0.02 for y in said_x):
                e["notes"].append(
                    "engine says x%s, Smogon's text says %s"
                    % (x, " and ".join("x%g" % y for y in said_x)))
    known = {n: v for n, v in got.items()
             if v["effects"] or v.get("text_numbers")}
    blob = {"_comment": ("Exact multipliers read out of Smogon's Champions "
                         "engine by scripts/build_effects.py - the values the "
                         "engine itself pushes, in 4096ths, never measured "
                         "from a damage ratio and never recited."),
            "effects": known}
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(blob, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print("wrote %s: %d with a number" % (OUT, len(known)))

    disagree = [(n, v["notes"]) for n, v in known.items()
                if any("engine says" in x for x in v["notes"])]
    if disagree:
        print("\nthe two sources disagree - worth reading:")
        for n, notes in disagree:
            for x in notes:
                if "engine says" in x:
                    print("  %-20s %s" % (n, x))

    if a.audit:
        print("\nno number, and why:")
        for n in sorted(got):
            if got[n]["effects"] or got[n].get("text_numbers"):
                continue
            why = "; ".join(got[n]["notes"]) or \
                  "nothing changed in any probe - not a damage modifier"
            print("  %-12s %-24s %s" % (got[n]["kind"], n, why[:60]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
