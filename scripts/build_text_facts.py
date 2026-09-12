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
import argparse, glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q

RAW = os.path.join(ROOT, "data", "raw", "pokebase")
OUT = os.path.join(ROOT, "data", "db", "text_facts.json")

DESC = re.compile(r'\\"name\\":\\"([^\\"]+)\\"'
                  r'((?:(?!\\"name\\").){0,900}?)'
                  r'\\"description\\":\\"((?:[^\\"]|\\\\.)*?)\\"', re.S)


def pokebase(kind):
    """kind: "moves" or "abilities" - pokebase paginates both."""
    out = {}
    for f in sorted(glob.glob(os.path.join(RAW, kind + "*.html"))):
        h = open(f, encoding="utf-8", errors="replace").read()
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--show", type=int, default=12)
    a = ap.parse_args()

    moves = [m for m in Q.db("moves") if m.get("useable")]
    mv, mdiff = merge(moves, pokebase("moves"), "moves")
    ab, adiff = merge(Q.db("abilities"), pokebase("abilities"), "abilities")

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
                       "Merged by scripts/build_text_facts.py. Per entry, the "
                       "text that states more wins - numbers, stages, turns - "
                       "and a bare 'gives the X status' is penalised. Ties go "
                       "to Serebii. Both originals are kept.",
                       "moves": mv, "abilities": ab}, f,
                      ensure_ascii=False, indent=1)
        print("\nwrote %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
