"""Champions damage calculator: Smogon's own Champions engine, asked from Python.

Smogon publishes a Champions engine (generation 0 in @smogon/calc, vendored
under data/raw/smogon_calc/). It is the one the app runs, and this script asks
the same engine through scripts/smogon_engine.js, so the page and the terminal
cannot disagree. The engine is never hand-ported: the modifier chain runs in
four buckets with a rounding step between each, and a one-point drift flips a
KO count. (A port once lived here; it did not model abilities and read every
move whose power is not a number - Serebii writes "1" for all of them - as a
1 BP hit.)

WHAT THIS FILE ADDS TO THE ENGINE

  * Champions names -> the engine's roster spellings (smogon_name).
  * The SP go into the stat the MOVE uses: Body Press attacks off Defense,
    Psyshock hits the target's Defense, Foul Play reads the target's Attack.
  * Doubles by default, so a spread move takes x0.75. The modifier is decided
    WHEN THE MOVE IS CHOSEN: with only one opposing Pokemon on the field it is
    full power, and a partner's KO before it resolves does NOT restore it
    (confirmed in game by the player). Neither this file
    nor the engine can see the field, so that case is the caller's to declare
    with --single-target.
  * A move whose damage needs a fact beyond the two Pokemon and their stats
    is never answered with a guess. NEEDS lists the ones the engine can answer
    once the fact is given, and refuses until it is; NOT_A_CALC lists the ones
    no damage calculation answers, and says what they do instead.

Focus Sash and Sturdy change no damage number, only whether the target lands
on 1 HP (confirmed in game); the KO line is read with that in mind.

Usage:
    python scripts/damage.py --selftest
    python scripts/damage.py "Mega Glalie" Explosion Kingambit --nature adamant
    python scripts/damage.py Basculegion "Wave Crash" Kingambit --atk-ability Adaptability
    python scripts/damage.py Pinsir Fling Garchomp --atk-item "Iron Ball"
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import dex
from paths import ROOT, SMOGON_CALC

# Psyshock is the only move in Champions that attacks one defence and is
# categorised as the other: it is Special, but it hits the physical Defense.
_DEFENCE_OVERRIDE = {"psyshock": "def"}

# Moves the engine answers correctly once it is told one more fact, and
# answers WRONGLY without it - so without it the question is refused. Each
# entry: the move, the flags that supply the fact, and why it is needed.
NEEDS = {
    "fling": (("atk_item",),
              ("its power is the Fling power of the item the user holds - "
              "give --atk-item")),
    "acrobatics": (("atk_item",),
                   ("it doubles only when the user holds nothing, and under the "
                   "Item Clause everyone holds something - give --atk-item "
                   "(the item, or 'none')")),
    "poltergeist": (("def_item",),
                    ("it fails when the target holds nothing - give --def-item "
                    "(the item, or 'none')")),
    "steel roller": (("terrain",), "it fails without terrain - give --terrain"),
    "gyro ball": (("atk_spe_sp", "def_spe_sp"),
                  ("its power comes from the two Speed stats - give "
                  "--atk-spe-sp and --def-spe-sp")),
    "electro ball": (("atk_spe_sp", "def_spe_sp"),
                     ("its power comes from the two Speed stats - give "
                     "--atk-spe-sp and --def-spe-sp")),
    "payback": (("atk_spe_sp", "def_spe_sp"),
                ("it doubles when the user moves last, which the engine reads "
                "off the two Speed stats - give --atk-spe-sp and --def-spe-sp "
                "(Trick Room, Tailwind and priority change the order, and the "
                "engine cannot see them)")),
}

# Moves whose damage is not a function of the two Pokemon at all. The engine
# returns 0 or a meaningless roll for them, so they get a sentence instead.
NOT_A_CALC = {
    "super fang": "Super Fang always takes half of the target's CURRENT HP "
                  "(1 HP if it has 1 left), whatever the stats. Ghost types "
                  "are immune.",
    "beat up": "Beat Up hits once per healthy Pokemon in the user's party, "
               "each hit from that Pokemon's base Attack. The engine has no "
               "party to count.",
    "counter": "Counter returns double the physical damage the user took this "
               "turn.",
    "mirror coat": "Mirror Coat returns double the special damage the user "
                   "took this turn.",
    "metal burst": "Metal Burst returns 1.5x the damage the user took this "
                   "turn.",
    "comeuppance": "Comeuppance returns 1.5x the damage the user took this "
                   "turn.",
    "endeavor": "Endeavor cuts the target's HP down to the user's current HP.",
    "spit up": "Spit Up's power is the number of Stockpiles used first.",
    "fissure": "Fissure is a one-hit KO if it hits.",
    "guillotine": "Guillotine is a one-hit KO if it hits.",
    "horn drill": "Horn Drill is a one-hit KO if it hits.",
    "sheer cold": "Sheer Cold is a one-hit KO if it hits.",
}


def move_named(name: str) -> dex.Row:
    """The move row, or the run stops: there is no guessing which was meant."""
    return dex.find_move(name) or sys.exit("No move called %r" % name)


def check_move(a: argparse.Namespace) -> None:
    """Refuse a question the engine would answer with a guess."""
    k = dex.key(move_named(a.move)["name"])
    if k in NOT_A_CALC:
        raise SystemExit("Not a damage calculation: " + NOT_A_CALC[k])
    need = NEEDS.get(k)
    if need and not all(getattr(a, f) not in (None, "") for f in need[0]):
        raise SystemExit("%s needs more than the two Pokemon: %s."
                         % (move_named(a.move)["name"], need[1]))


def smogon_name(name: str, attacking: bool = False) -> str:
    """Our spelling -> the Champions roster spelling in Smogon's engine.

    norm() does the work (Mega Glalie <-> Glalie-Mega), and these are the only
    names where the two rosters genuinely disagree, checked by sweeping all 340
    forms through the engine: they split Aegislash into its two stances, spell
    every gender form "-F" (Basculegion, Meowstic and Indeedee), and file plain
    Floette under its Eternal Flower name. Aegislash attacks as Blade: Stance
    Change switches it the moment it uses a damaging move, and the Shield
    spread has 50 Attack to Blade's 140.
    """
    if dex.norm(name) == dex.norm("Aegislash"):
        return "Aegislash-Blade" if attacking else "Aegislash-Shield"
    special = {dex.norm("Basculegion-Female"): "Basculegion-F",
               dex.norm("Meowstic-Female"): "Meowstic-F",
               dex.norm("Indeedee-Female"): "Indeedee-F",
               dex.norm("Floette"): "Floette-Eternal"}
    if dex.norm(name) in special:
        return special[dex.norm(name)]
    path = os.path.join(SMOGON_CALC, "raw_species.json")
    if not os.path.exists(path):
        raise SystemExit(
            "Smogon's engine is not vendored - expected %s\n"
            "Fetch it with: python scripts/fetch_smogon_calc.py" % path)
    roster = json.loads(Path(path).read_text(encoding="utf-8"))
    hit = next((k for k in roster if dex.norm(k) == dex.norm(name)), None)
    if not hit:
        raise SystemExit("Smogon's Champions roster has no %r" % name)
    return hit


def run_smogon(cases: list[dict[str, Any]]) -> Any:
    """Hand a batch of questions to Smogon's own engine via Node."""
    js = os.path.join(ROOT, "scripts", "smogon_engine.js")
    try:
        p = subprocess.run(["node", js, "-"], input=json.dumps(cases),
                           capture_output=True, text=True, check=False)
    except FileNotFoundError:
        raise SystemExit("damage.py needs Node on PATH (node --version)") from None
    if p.returncode != 0:
        raise SystemExit("smogon_engine.js failed:\n%s" % (p.stderr or "").strip())
    return json.loads(p.stdout)


# (the flag, its help): each is a switch on the engine's Field; the flag's
# camelCase is the key Smogon's engine reads it under.
FIELD_FLAGS = (("helping-hand", "an ally used Helping Hand (doubles)"),
               ("friend-guard", "an ally of the TARGET has Friend Guard"),
               ("charge", "the attacker used Charge (Electric x2)"),
               ("gravity", "Gravity is up: Flying types are grounded"),
               ("magic-room", "Magic Room: held items do nothing"),
               ("wonder-room", "Wonder Room: Defense and Sp. Def swapped"),
               ("power-trick-atk", "the attacker used Power Trick"),
               ("power-trick-def", "the target used Power Trick"),
               ("protected", "the target is protecting"),
               ("foresight", "the target is Foresighted"),
               ("battery", "an ally has Battery (special x1.3)"),
               ("power-spot", "an ally has Power Spot"),
               ("steely-spirit", "an ally has Steely Spirit"),
               ("flower-gift-atk", "Flower Gift on the attacker's side"),
               ("flower-gift-def", "Flower Gift on the target's side"),
               ("dark-aura", "Dark Aura is up"),
               ("fairy-aura", "Fairy Aura is up"),
               ("aura-break", "Aura Break is up"),
               ("beads-of-ruin", "Beads of Ruin: Sp. Def -25%%"),
               ("sword-of-ruin", "Sword of Ruin: Defense -25%%"),
               ("tablets-of-ruin", "Tablets of Ruin: Attack -25%%"),
               ("vessel-of-ruin", "Vessel of Ruin: Sp. Atk -25%%"))


def _camel(flag: str) -> str:
    """A command-line flag as the engine's field name ("atk-ability" ->
    "atkAbility").
    """
    head, *rest = flag.split("-")
    return head + "".join(w.capitalize() for w in rest)


def _parser() -> argparse.ArgumentParser:
    """The calculator's command line: the two Pokemon and the move, then a flag
    for every fact the engine may need.
    """
    ap = argparse.ArgumentParser()
    ap.add_argument("attacker", nargs="?")
    ap.add_argument("move", nargs="?")
    ap.add_argument("defender", nargs="?")
    ap.add_argument("--atk-sp", type=int, default=32,
                    help="SP in the stat the move attacks with")
    ap.add_argument("--nature", default=None)
    ap.add_argument("--def-hp-sp", type=int, default=0)
    ap.add_argument("--def-sp", type=int, default=0,
                    help="SP in the stat the move hits")
    ap.add_argument("--def-nature", default=None)
    ap.add_argument("--atk-spe-sp", type=int, default=None,
                    help="the attacker's Speed SP (Gyro Ball, Electro Ball, Payback)")
    ap.add_argument("--def-spe-sp", type=int, default=None,
                    help="the target's Speed SP (Gyro Ball, Electro Ball, Payback)")
    ap.add_argument("--target-atk-sp", type=int, default=0,
                    help="Foul Play only: the TARGET's Attack investment")
    ap.add_argument("--screen", choices=["Reflect", "Light Screen", "Aurora Veil"],
                    default=None, help="a screen on the target's side (x0.667 in doubles)")
    ap.add_argument("--atk-ability", default=None)
    ap.add_argument("--def-ability", default=None)
    ap.add_argument("--atk-item", default=None, help="the item, or 'none'")
    ap.add_argument("--def-item", default=None, help="the item, or 'none'")
    ap.add_argument("--weather", default=None,
                    choices=["Sun", "Rain", "Sand", "Snow"])
    ap.add_argument("--terrain", default=None,
                    choices=["Electric", "Grassy", "Misty", "Psychic"])
    ap.add_argument("--boost", type=int, default=0,
                    help="the attacker's stat stages, e.g. 2 after a Swords Dance")
    ap.add_argument("--def-boost", type=int, default=0,
                    help="the target's stages in the stat this move attacks")
    ap.add_argument("--crit", action="store_true", help="assume a critical hit")
    ap.add_argument("--allies-fainted", type=int, default=0,
                    help="Supreme Overlord: how many of the attacker's allies are down")
    ap.add_argument("--atk-hp", type=int, default=None,
                    help="the attacker's CURRENT HP (Reversal, Flail, Eruption...)")
    ap.add_argument("--target-hp", type=int, default=None,
                    help="the target's CURRENT HP (Multiscale, Hard Press...)")
    ap.add_argument("--single-target", action="store_true",
                    help="only ONE Pokemon is on the other side, so a spread "
                         "move keeps its full power (no x0.75)")
    ap.add_argument("--atk-status", default=None,
                    choices=["brn", "par", "psn", "tox", "slp", "frz"])
    ap.add_argument("--def-status", default=None,
                    choices=["brn", "par", "psn", "tox", "slp", "frz"],
                    help="also feeds the between-turns chip in the KO count")
    # Every switch calc.pokemonshowdown.com's Field panel exposes, so a number
    # here can be checked against the real calculator instead of argued about.
    for f, h in FIELD_FLAGS:
        ap.add_argument("--" + f, action="store_true", help=h)
    ap.add_argument("--selftest", action="store_true")
    return ap


def _item(v: str | None) -> str | None:
    """An item flag, with "none" meaning no item."""
    return None if v is None or dex.key(v) == "none" else v


def engine_case(a: argparse.Namespace) -> dict[str, Any]:
    """One question for Smogon's engine, from the parsed arguments.

    The SP go into the stat the MOVE uses, not the one its category suggests:
    Body Press attacks off Defense and Psyshock hits the target's Defense even
    though it is Special.
    """
    move_row = move_named(a.move)
    phys = move_row.get("category") == "Physical"
    k = dex.key(move_row["name"])
    a_key = "def" if k == dex.key("Body Press") else ("atk" if phys else "spa")
    d_key = _DEFENCE_OVERRIDE.get(k) or ("def" if phys else "spd")
    aevs = {a_key: a.atk_sp}
    devs = {"hp": a.def_hp_sp, d_key: a.def_sp}
    if a.target_atk_sp:
        devs["atk"] = a.target_atk_sp
    if a.atk_spe_sp is not None:
        aevs["spe"] = a.atk_spe_sp
    if a.def_spe_sp is not None:
        devs["spe"] = a.def_spe_sp
    case = {
        "attacker": smogon_name(a.attacker, attacking=True),
        "defender": smogon_name(a.defender),
        "move": move_row["name"],
        "anature": a.nature or "Serious",
        "aevs": {s: max(0, min(32, v)) for s, v in aevs.items()},
        "dnature": a.def_nature or "Serious",
        "devs": {s: max(0, min(32, v)) for s, v in devs.items()},
        "aability": a.atk_ability, "dability": a.def_ability,
        "aitem": _item(a.atk_item), "ditem": _item(a.def_item),
        "weather": a.weather, "terrain": a.terrain,
        "screen": a.screen, "isCrit": a.crit,
        "alliesFainted": a.allies_fainted or None,
        "acurHP": a.atk_hp, "dcurHP": a.target_hp,
        "astatus": a.atk_status, "dstatus": a.def_status,
    }
    case.update({_camel(f): getattr(a, f.replace("-", "_")) for f, _h in FIELD_FLAGS})
    if a.single_target:
        # The engine decides the x0.75 from the MOVE's target type and has
        # no idea how many Pokemon are actually out, so the only lever is
        # gameType. Singles also halves screens instead of the doubles
        # 0.667, which is the one case the two cannot be separated.
        if a.screen:
            raise SystemExit(
                "--single-target and --screen cannot be combined on the "
                "engine: its only lever for the spread modifier is the "
                "game type, which would also switch screens to their "
                "singles value. Run them separately.")
        case["gameType"] = "Singles"
    if a.boost:
        case["aboosts"] = {("atk" if phys else "spa"): a.boost}
    if a.def_boost:
        case["dboosts"] = {d_key: a.def_boost}
    return case


def answer(a: argparse.Namespace) -> Any:
    """Run one calculation through Smogon's engine and print its description,
    the damage range against max HP, and the KO chance.
    """
    check_move(a)
    r = run_smogon([engine_case(a)])[0]
    if r.get("error"):
        raise SystemExit("Smogon engine: %s" % r["error"])
    # The engine falls back to the FIRST ability in the species row when
    # none is given, and Kingambit's first is Defiant, not Supreme Overlord.
    # So a bare --allies-fainted quietly buys nothing; say so.
    if a.allies_fainted and dex.key(r.get("ability") or "") != dex.key("Supreme Overlord"):
        print("   NOTE: --allies-fainted does nothing here - %s is using %s, "
              "not Supreme Overlord. Add --atk-ability \"Supreme Overlord\"."
              % (r["attacker"], r.get("ability")))
    print("%s %s -> %s" % (r["attacker"], r["move"], r["defender"]))
    print("   %s" % r["desc"])
    print("   %d-%d damage of %d HP  =  %.1f%% - %.1f%%"
          % (r["lo"], r["hi"], r["maxHP"], r["pct_lo"], r["pct_hi"]))
    if r.get("ko_text"):
        print("   %s" % r["ko_text"])
    return r


# The three survival claims Smogon states in its Champions prose, and one
# guard per rule this file adds to the engine. Each: the arguments, and what
# must come back - "survives" (hi < max HP), (lo, hi) exactly, "refused", or
# a second list of arguments whose answer must DIFFER from this one.
SELFTEST = [
    # "30 HP / 24 Def / 12 SpD with Bold or Relaxed: ... survive Black
    #  Glasses Kingambit's Kowtow Cleave"
    (["Kingambit", "Kowtow Cleave", "Farigiraf", "--nature", "Adamant",
      "--atk-item", "Black Glasses", "--def-hp-sp", "30", "--def-sp", "24",
      "--def-nature", "Relaxed"], "survives"),
    # "12 HP / 24 Def / 27 SpA / 3 SpD ... avoid the OHKO from non-Black
    #  Glasses Kingambit's Kowtow Cleave"
    (["Kingambit", "Kowtow Cleave", "Farigiraf", "--nature", "Adamant",
      "--def-hp-sp", "12", "--def-sp", "24", "--def-nature", "Modest"], "survives"),
    # "32 HP / 11 Def / 23 SpD with Calm or Sassy: cannot be OHKOed by Mega
    #  Floette's Light of Ruin" - with Fairy Aura it lives by 1 HP
    (["Mega Floette", "Light of Ruin", "Farigiraf", "--nature", "Modest",
      "--def-hp-sp", "32", "--def-sp", "23", "--def-nature", "Calm"], "survives"),
    # Seismic Toss is the user's level, 50 - the old port said 1-2
    (["Mawile", "Seismic Toss", "Garchomp"], (50, 50)),
    # Body Press attacks off Defense, so the SP must land there
    (["Mega Eelektross", "Body Press", "Charizard", "--atk-sp", "0"],
     ["Mega Eelektross", "Body Press", "Charizard", "--atk-sp", "32"]),
    # a spread move keeps full power with one target left
    (["Garchomp", "Earthquake", "Kingambit"],
     ["Garchomp", "Earthquake", "Kingambit", "--single-target"]),
    # a fact the engine needs is asked for, and a non-calculation refused
    (["Pinsir", "Fling", "Garchomp"], "refused"),
    (["Houndoom", "Super Fang", "Garchomp"], "refused"),
]


def _run_quiet(argv: list[str]) -> Any:
    """answer() for a list of arguments -> the engine's row, or 'refused'."""
    import contextlib
    import io
    a = _parser().parse_args(argv)
    with contextlib.redirect_stdout(io.StringIO()):
        try:
            return answer(a)
        except SystemExit as e:
            if "Smogon engine" in str(e) or "needs Node" in str(e):
                raise
            return "refused"


def _span(r: Any) -> str:
    """A self-test result as "lo-hi", or "refused"."""
    return r if r == "refused" else "%d-%d" % (r["lo"], r["hi"])


def selftest() -> bool:
    """Smogon's own prose benchmarks, and one guard per rule this file adds."""
    ok = True
    for argv, want in SELFTEST:
        r = _run_quiet(argv)
        if isinstance(want, list):
            other = _run_quiet(want)
            good = _span(r) != _span(other)
            got, want_s = "%s vs %s" % (_span(r), _span(other)), "differ"
        elif want == "survives":
            good = r != "refused" and r["hi"] < r["maxHP"]
            got = "refused" if r == "refused" else "%s of %d" % (_span(r), r["maxHP"])
            want_s = want
        elif want == "refused":
            good, got, want_s = r == "refused", _span(r), want
        else:
            good, got, want_s = _span(r) == "%d-%d" % want, _span(r), "%d-%d" % want
        print("  %s  %-40s %-20s [%s]" % ("ok  " if good else "FAIL",
                                           " / ".join(argv[:3]), got, want_s))
        ok &= good
    print("\n%s" % ("ALL CHECKS PASS" if ok else "A CHECK FAILED"))
    return ok


def main() -> None:
    """Run the self-test (also when no Pokemon is given), otherwise answer the
    one calculation asked.
    """
    a = _parser().parse_args()
    if a.selftest or not a.attacker:
        raise SystemExit(0 if selftest() else 1)
    answer(a)


if __name__ == "__main__":
    main()
