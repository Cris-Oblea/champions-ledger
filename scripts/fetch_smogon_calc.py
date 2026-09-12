"""Vendor Smogon's Champions damage engine into data/raw/smogon_calc/.

Smogon publishes a Champions-specific calculator at
calc.pokemonshowdown.com/champions.html. It is not gen 9 with a skin: Champions
is wired in as its own generation (gen 0) with its own mechanics file, its own
324-form roster, its own 513-move table and 406 curated sets. That makes it the
sixth source, and the only executable one.

Why vendor it rather than hit the site:

  * scripts/smogon_engine.js runs it locally, so `damage.py --engine smogon`
    needs no network and no npm install - the bundle is plain CommonJS.
  * It is a moving target. Twelve moves (Anchor Shot, Blood Moon, Bolt Beak,
    Fishious Rend and friends) are recorded as base power ONLY, because no
    Champions Pokemon learns them yet - the same twelve our own `useable` flag
    marks False. When a regulation gives one of them a learner, Smogon fills the
    entry in. Re-running this and diffing is how we notice.

    python scripts/fetch_smogon_calc.py --check

  * The moves patch (CHAMPIONS_PATCH) is the shortest statement anywhere of what
    Champions rebalanced off Scarlet/Violet.

Source of truth stays Serebii for rules and this for mechanics arithmetic; see
analysis/smogon_calc.md for where the two disagree and who wins.

    python scripts/fetch_smogon_calc.py
    python scripts/fetch_smogon_calc.py --check     # report drift, write nothing
"""
import os, sys, json, argparse, hashlib
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "raw", "smogon_calc")
BASE = "https://calc.pokemonshowdown.com"

# Everything the engine needs to run standalone, plus the sets file.
FILES = [
    "champions.html",
    "calc/util.js", "calc/stats.js", "calc/move.js", "calc/pokemon.js",
    "calc/field.js", "calc/items.js", "calc/calc.js", "calc/desc.js",
    "calc/result.js", "calc/adaptable.js", "calc/index.js",
    "calc/data/species.js", "calc/data/moves.js", "calc/data/items.js",
    "calc/data/abilities.js", "calc/data/types.js", "calc/data/natures.js",
    "calc/data/index.js",
    "calc/mechanics/util.js", "calc/mechanics/champions.js",
    "js/shared_controls.js", "js/data/sets/champions.js",
]


def fetch(rel):
    req = urllib.request.Request(BASE + "/" + rel,
                                 headers={"User-Agent": "pokemon-champions-db"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def digest(b):
    return hashlib.sha256(b).hexdigest()[:16]


def dump_json():
    """Re-export the Champions tables as JSON so Python can read them.

    Needs Node, but only here - smogon_engine.js is what actually calculates.
    """
    import subprocess
    script = """
const path=require('path');
const B=%s;
const M=require(path.join(B,'calc','data','moves.js')).MOVES[0];
const S=require(path.join(B,'calc','data','species.js')).SPECIES[0];
const fs=require('fs');
fs.writeFileSync(path.join(B,'raw_moves.json'),JSON.stringify(M,null,1));
fs.writeFileSync(path.join(B,'raw_species.json'),JSON.stringify(S,null,1));
const s=fs.readFileSync(path.join(B,'js','data','sets','champions.js'),'utf8');
const d=JSON.parse(s.slice(s.indexOf('{')).trim().replace(/;$/,''));
fs.writeFileSync(path.join(B,'champions_sets.json'),JSON.stringify(d,null,1));
console.log(Object.keys(M).length+' moves, '+Object.keys(S).length+
            ' species, '+Object.keys(d).length+' set entries');
""" % json.dumps(OUT)
    p = subprocess.run(["node", "-e", script], capture_output=True, text=True)
    if p.returncode != 0:
        print("  (could not re-export JSON: %s)" % (p.stderr or "").strip()[:200])
        return
    print("  " + p.stdout.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="report what changed upstream, write nothing")
    a = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    changed, same, failed = [], 0, []
    for rel in FILES:
        dest = os.path.join(OUT, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        try:
            body = fetch(rel)
        except Exception as e:
            failed.append((rel, str(e)))
            continue
        old = open(dest, "rb").read() if os.path.exists(dest) else None
        if old == body:
            same += 1
            continue
        changed.append((rel, digest(old) if old else "-", digest(body)))
        if not a.check:
            open(dest, "wb").write(body)

    print("%s: %d unchanged, %d changed, %d failed"
          % ("CHECK" if a.check else "fetched", same, len(changed), len(failed)))
    for rel, o, n in changed:
        print("  changed  %-40s %s -> %s" % (rel, o, n))
    for rel, err in failed:
        print("  FAILED   %-40s %s" % (rel, err[:60]))
    if changed and not a.check:
        dump_json()
        print("\nUpstream moved. Worth re-checking:")
        print("  - the twelve learner-less move stubs (see analysis/smogon_calc.md)")
        print("  - CHAMPIONS_PATCH in calc/data/moves.js, the rebalance list")
        print("  - python scripts/damage.py --selftest")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
