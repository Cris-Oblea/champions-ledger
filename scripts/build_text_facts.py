#!/usr/bin/env python3
"""The best description of every move and ability, across both sources.

    python scripts/build_text_facts.py            # write + report
    python scripts/build_text_facts.py --report   # report only

The player's point, after the same fix on items: a description with no numbers
in it is not information. Serebii writes **"Gives the target the Bound
status."** and stops - and CLAUDE.md already records that reading one rules
source produced two wrong answers for exactly this reason.

But neither source wins outright, which is why this picks per entry rather than
switching wholesale:

    Taunt        serebii "Gives the target the Taunted status."
                 pokebase "...use only attack moves for three turns."   <- wins
    Stone Edge   serebii "This move has a 1-stage Critical-Hit Ratio Boost."
                 pokebase "...a heightened chance of landing a critical hit."
                                                                    serebii wins
    Sheer Force  serebii "...increased in power by 30% but lose their secondary"
                 pokebase "...but increases the moves' power."      serebii wins

So each text is scored on how much it actually STATES - digits, percentages,
fractions, stages, turns, chances - a bare "gives the X status" is penalised,
and the higher score wins. A tie goes to Serebii, which is this project's
ground truth for rules. Both texts are kept either way, and the report prints
every entry where the two disagree, so the choice can be argued with.
"""
import argparse
import glob
import json
import os
import re
from pathlib import Path

import query as Q

# The number reader the effect chips use to decide what a description already
# says - one reader, so "the text states it" means the same thing in both.
from effect_chips import same_number, values

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RAW = os.path.join(ROOT, "data", "raw", "pokebase")
OUT = os.path.join(ROOT, "data", "db", "text_facts.json")

DESC = re.compile(r'\\"name\\":\\"([^\\"]+)\\"'
                  r'((?:(?!\\"name\\").){0,900}?)'
                  r'\\"description\\":\\"((?:[^\\"]|\\\\.)*?)\\"', re.S)


def pokebase(kind):
    """kind: "moves" or "abilities" - pokebase paginates both."""
    out = {}
    for f in sorted(glob.glob(os.path.join(RAW, kind + "*.html"))):
        h = Path(f).read_text(encoding="utf-8", errors="replace")
        for m in DESC.finditer(h):
            t = m.group(3)
            t = t.replace("\\u2019", "'").replace("�", "'")
            t = re.sub(r"\\u[0-9a-fA-F]{4}", " ", t)
            t = t.replace("\\n", " ").replace("\\", "")
            out.setdefault(m.group(1), " ".join(t.split()))
    return out


BARE_STATUS = re.compile(r"^Gives the (?:target|user)(?:'s spot)? the "
                         r"[A-Za-z\- ]+ status\.?$", re.I)


def score(t):
    """How much does this sentence actually state?"""
    t = t or ""
    if not t:
        return -99
    s = (len(re.findall(r"\d", t)) * 2 + t.count("%") * 3 +
         len(re.findall(r"\d/\d", t)) * 3 +
         3 * len(re.findall(r"stage|turn|chance|priority", t, re.I)))
    # naming a status is not explaining it - the exact hole CLAUDE.md records
    if BARE_STATUS.match(t.strip()):
        s -= 6
    return s


def clean(s):
    return " ".join((s or "").replace("�", "'").split())


def merge(rows, pb, label):
    out, wins = {}, {"serebii": 0, "pokebase": 0, "only serebii": 0,
                     "only pokebase": 0}
    diffs = []
    for r in rows:
        n = r["name"]
        s, p = clean(r.get("effect")), pb.get(n, "")
        if s and not p:
            pick, src = s, "only serebii"
        elif p and not s:
            pick, src = p, "only pokebase"
        else:
            # a tie goes to Serebii: it is the ground truth for rules
            src = "pokebase" if score(p) > score(s) else "serebii"
            pick = p if src == "pokebase" else s
        wins[src] += 1
        if s and p and s != p:
            diffs.append((n, src, s, p))
        out[n] = {"text": pick, "source": src.replace("only ", ""),
                  "serebii": s, "pokebase": p}
    print("\n%s: %d" % (label, len(out)))
    for k, v in wins.items():
        print("   %-14s %d" % (k, v))
    return out, diffs


# --------------------------------------------- Smogon's full description ---
# (player, 2026-09-27) "octolock solo dice que lo deja octolocked and can't
# escape statuses. pero no dice que significa cada uno de esos statuses!...
# necesito que todos los moves esten igual de bien definidos como lo hace
# smogon."
#
# Both sources above NAME a mechanic; Smogon's dex page DEFINES it: Octolock
# traps the target, lowers its Def and SpD by 1 every turn, can be escaped
# with Shed Shell or a pivot, and ends when either one leaves. So for a move
# Champions has, Smogon's text is the description - it is written for
# Champions' own dex, rebalance included (it has no freeze on Freeze-Dry,
# which Smogon's engine deletes on purpose for this game).
#
# What it says less precisely than our own numbers, the numbers add - never a
# rewrite, only what the sentence leaves as a word:
#
#   "a higher chance for a critical hit"  -> the rate our row carries, 12.5%
#   "equal to the user's level"           -> 50, the level every Champions
#                                            Pokemon battles at
LEVEL = 50


def augment(m, text, base_crit):
    crit = (m.get("crit_rate") or "").strip()
    if crit and crit not in ("None", base_crit, "100%") and             "higher chance for a critical hit" in text and crit not in text:
        text = text.replace(
            "higher chance for a critical hit",
            "higher chance for a critical hit (%s, against %s for a normal "
            "move)" % (crit, base_crit), 1)
    if "equal to the user's level" in text:
        text = text.replace("equal to the user's level",
                            "equal to the user's level (%d HP: every Pokemon "
                            "in Champions is level %d)" % (LEVEL, LEVEL), 1)
    return text


def secondary_rate(m):
    """The chance of a secondary effect, when effect_rate is one - moves.json
    puts the crit rate there when the move has none."""
    er, cr = m.get("effect_rate"), (m.get("crit_rate") or "").rstrip("%")
    if er in (None, 0):
        return None
    try:
        return None if float(er) == float(cr) else float(er)
    except ValueError:
        return float(er)


def smogon_first(moves, mv):
    """Put Smogon's description in front, and report what it leaves out."""
    long = (Q.db("smogon_text") or {}).get("moves") or {}
    rates = {}
    for m in moves:
        c = (m.get("crit_rate") or "").strip()
        rates[c] = rates.get(c, 0) + 1
    base_crit = max((c for c in rates if c.endswith("%") and c != "100%"),
                    key=lambda c: rates[c])
    used, gaps = 0, []
    for m in moves:
        n = m["name"]
        s = long.get(n)            # Champions' own dex, never another game's
        if not s:
            continue
        row = mv[n]
        row["smogon"] = s
        row["text"] = augment(m, s, base_crit)
        row["source"] = "smogon"
        used += 1
        # A CHANCE WE CARRY THAT SMOGON DOES NOT STATE is reported, never
        # pasted in: it is a disagreement about the game, not about wording.
        # Freeze-Dry was the case that proved it - Serebii's rate cell said
        # 10 while its own text named no freeze, Smogon's engine deletes the
        # secondary for Champions, and the player confirmed it in game. It is
        # settled in build_db.MOVE_RULINGS now; a new line here is a new one.
        r = secondary_rate(m)
        if r and r < 100 and ("%d%%" % r) not in s:
            gaps.append((n, r))
    print("\nsmogon's full description: %d of %d moves" % (used, len(moves)))
    for n, r in gaps:
        print("   DISPUTE %-14s our row carries a %d%% secondary chance; "
              "Smogon's Champions text states none" % (n, r))
    return mv



def smogon_abilities(ab):
    """The same for abilities (player, 2026-09-27: "haz lo mismo con las
    abilities e items, smogon casi siempre los tiene mejor descritos y con
    numeros"). Smogon's Champions text replaces the pick outright - Intimidate
    goes from "lowers the Attack of opposing Pokemon" to that plus who is
    immune to it - and the two originals stay beside it.

    ONE DESCRIPTION, NOT TWO (player: "no se dupliquen las descripciones...
    en algunas abilities habian descripciones duplicadas y eran obvias"). The
    app used to print this line AND Smogon's one-line summary under it, which
    said the same thing twice; build_tracker_data.py now drops the summary
    wherever this text exists.

    A number the old pick states and Smogon's text does not is PRINTED, not
    merged: two sentences about one ability are exactly the duplication just
    removed, and most of these are one fact in two units (25% evasion is x0.8
    accuracy)."""
    long = (Q.db("smogon_text") or {}).get("abilities") or {}
    used, gaps = 0, []
    for n, row in ab.items():
        t = long.get(n)
        if not t:
            continue
        old = row.get("text") or ""
        full = t
        # "On switch-in, this Pokemon summons Rain." - and for how long is
        # the one number the sentence leaves out, which Serebii's own line
        # for the same ability states. Added from there, as the moves' crit
        # rate is, never as a second sentence about the whole ability.
        olds = " ".join(x for x in (row.get("serebii"), row.get("pokebase")) if x)
        dur = re.search(r"\b(\d+) turns\b", olds)
        if dur and "turn" not in t and re.search(r"summons|begins", t):
            full = t.rstrip(".") + ", for %s turns." % dur.group(1)
        # "Upon entering battle OR RECEIVING THE ABILITY" (Serebii) against
        # Smogon's "On switch-in": the half Smogon drops is the one the player
        # confirmed in game - a Pokemon that Mega Evolves into Intimidate
        # fires it again (CLAUDE.md). Only Intimidate carries the clause today.
        if re.search(r"receiv\w* the ability", olds, re.I) and \
                full.startswith("On switch-in"):
            full = full.replace("On switch-in", "On switch-in, or on receiving "
                                "this Ability (Mega Evolving into it fires it "
                                "again)", 1)
        row.update(smogon=t, text=full, source="smogon")
        used += 1
        stated = values(full)
        lost = sorted(v for v in values(olds) if not same_number(v, stated))
        if lost:
            gaps.append((n, lost, olds))
    print("\nsmogon's full description: %d of %d abilities" % (used, len(ab)))
    # What is left after the units are allowed for is either a word the
    # sentence uses instead of a digit, or a real disagreement - Effect Spore
    # (Serebii 10%, Smogon 30%) and Healer (Serebii 30%, Smogon 50%) were the
    # two on 2026-09-27. Printed so a new one is seen; Smogon's Champions text
    # is what ships.
    for n, lost, old in gaps:
        print("   only the old text says %-12s %-16s %s"
              % ("/".join("%g" % v for v in lost), n, old[:60]))
    return ab


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--show", type=int, default=12)
    a = ap.parse_args()

    moves = [m for m in Q.db("moves") if m.get("useable")]
    mv, mdiff = merge(moves, pokebase("moves"), "moves")
    mv = smogon_first(moves, mv)
    ab, adiff = merge(Q.db("abilities"), pokebase("abilities"), "abilities")
    ab = smogon_abilities(ab)

    print("\n--- where pokebase won, because Serebii only named a status ---")
    shown = 0
    for n, src, s, p in mdiff + adiff:
        if src == "pokebase" and shown < a.show:
            print("   %-16s was: %-44s" % (n, s[:44]))
            print("   %-16s now: %s" % ("", p[:70]))
            shown += 1

    if not a.report:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump({"_comment":
                       "Merged by scripts/build_text_facts.py. A move or "
                       "ability Champions has is described by Smogon's own "
                       "Champions dex page (`smogon`) - a move with our crit "
                       "rate and level added where it leaves them as words. "
                       "Otherwise, per entry, the "
                       "text that states more wins - numbers, stages, turns - "
                       "and a bare 'gives the X status' is penalised. Ties go "
                       "to Serebii. Every original is kept.",
                       "moves": mv, "abilities": ab}, f,
                      ensure_ascii=False, indent=1)
        print("\nwrote %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
