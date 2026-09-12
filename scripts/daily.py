#!/usr/bin/env python3
"""The daily job: refresh every source, rebuild the app, deploy if it moved.

    python scripts/daily.py              # the real thing
    python scripts/daily.py --dry-run    # refresh and report, never deploy
    python scripts/daily.py --install    # register the Windows scheduled task
    python scripts/daily.py --uninstall

Why this exists rather than a bare `refresh.py` in Task Scheduler:

  * It says WHAT CHANGED. A refresh that prints 200 lines and exits 0 tells you
    nothing; this diffs the files that carry meaning - the ladder, the Smogon
    engine, the move and species counts - and writes one line per change.
  * It only deploys when something actually moved, so an unattended run does
    not push an identical build to Cloudflare every night.
  * It never lets a half-finished refresh reach the phone: the damage selftest
    and the name-matching test must pass, or it stops before deploying and
    says so. A wrong number on the phone is worse than a stale one.
  * It keeps a log, because nobody watches a 3am job.

The sources move on different clocks. pokebase's ladder is the one that
changes daily - and the one whose cache made a plain refresh a no-op until
2026-09-11. Serebii is rules and only moves on a regulation. Smogon's engine
moves when Smogon ships. All three are checked every run anyway; checking is
cheap and missing a regulation is not.
"""
import argparse, datetime, hashlib, io, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
LOGDIR = os.path.join(ROOT, "data", "raw", "daily_logs")
STATE = os.path.join(ROOT, "data", "raw", "daily_state.json")
TASK = "ChampionsLedgerDaily"

# what is worth reporting a change in, and how to describe it
WATCH = [
    ("ladder",  "data/meta/usage_pokemon.json",      "pokebase ladder usage"),
    ("engine",  "data/raw/smogon_calc/calc/data/moves.js", "Smogon engine moves"),
    ("sets",    "data/raw/smogon_calc/js/data/sets/champions.js", "Smogon sets"),
    ("species", "data/db/pokemon.json",              "species and forms"),
    ("moves",   "data/db/moves.json",                "move table"),
    ("items",   "data/db/items.json",                "item table"),
    ("gtsdiff", "data/meta/gts_difficulty.json",     "GTS difficulty"),
    ("analyses", "data/meta/smogon_analyses.json",   "Smogon written analyses"),
    ("pika",    "data/meta/pikalytics_battledataregmbs3.json", "Pikalytics"),
    ("worlds",  "data/meta/tournament_0000191_masters.json", "Worlds Masters"),
    ("archive", "data/meta/worlds_archive.json",      "the Worlds archive"),
    ("abil",    "data/db/abilities.json",             "ability text"),
    ("bundle",  "tracker/engine.bundle.js",           "the engine the app runs"),
]


def digest(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def snapshot():
    return {k: digest(rel) for k, rel, _ in WATCH}


def ladder_summary():
    """The one source whose *content* is worth summarising, not just hashing."""
    p = os.path.join(ROOT, "data", "meta", "usage_pokemon.json")
    try:
        d = json.load(io.open(p, encoding="utf-8"))
    except Exception:
        return None
    rows = d.get("rows") or []
    top = [(r.get("name"), r.get("usage_percent")) for r in rows[:5]]
    return {"fetched": d.get("fetched"), "rows": len(rows), "top": top}


def log(lines):
    os.makedirs(LOGDIR, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y-%m-%d")
    with io.open(os.path.join(LOGDIR, stamp + ".log"), "a", encoding="utf-8") as f:
        for ln in lines:
            f.write(ln + "\n")
    # keep a month, no more
    keep = sorted(os.listdir(LOGDIR))[-31:]
    for old in os.listdir(LOGDIR):
        if old not in keep:
            try:
                os.remove(os.path.join(LOGDIR, old))
            except OSError:
                pass


def sh(argv, cwd=ROOT):
    r = subprocess.run(argv, cwd=cwd, capture_output=True, text=True)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def install_task():
    """Register it with Windows Task Scheduler, daily."""
    script = os.path.join(ROOT, "scripts", "daily.py")
    cmd = '"%s" "%s"' % (PY, script)
    rc, out = sh(["schtasks", "/Create", "/TN", TASK, "/TR", cmd,
                  "/SC", "DAILY", "/ST", "05:30", "/F"])
    print(out.strip())
    if rc == 0:
        print("\nRegistered '%s', daily at 05:30." % TASK)
        print("It only runs while the PC is on and awake; a missed day is")
        print("picked up by the next run, because every source is re-read in")
        print("full rather than diffed against the last one.")
        print("\n  schtasks /Run /TN %s     run it now" % TASK)
        print("  schtasks /Query /TN %s   when it last ran" % TASK)
    return rc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--skip-deploy", action="store_true")
    ap.add_argument("--deep", action="store_true",
                    help="force the slow-moving sources today, whatever day it is")
    a = ap.parse_args()

    if a.install:
        return install_task()
    if a.uninstall:
        rc, out = sh(["schtasks", "/Delete", "/TN", TASK, "/F"])
        print(out.strip())
        return rc

    started = datetime.datetime.now()
    out = ["", "=" * 62,
           "daily run  %s" % started.strftime("%Y-%m-%d %H:%M:%S")]

    before = snapshot()
    before_ladder = ladder_summary()

    # Three tiers, because the sources move on different clocks and two of
    # them skip anything already cached:
    #   daily - pokebase's ladder, and Smogon's calculator (which re-downloads
    #           all 23 files every run and compares hashes, so the engine and
    #           its move table are genuinely current).
    #   deep  - Smogon's 324 written analyses and Pikalytics. Both serve from
    #           cache for ever otherwise, so without this they freeze. Neither
    #           changes daily, and 324 requests a night for nothing is rude.
    #           Mondays, or --deep.
    # A regulation still needs `refresh.py --regulation` by hand: it clears the
    # Serebii page caches, and getting that wrong leaves new species with no
    # movepool. Deliberately not automatic - see analysis/regulation_m_c.md.
    deep = a.deep or datetime.date.today().weekday() == 0
    argv = [PY, "scripts/refresh.py"] + (["--deep"] if deep else [])
    out.append("mode: " + ("deep (Smogon analyses + Pikalytics forced)"
                           if deep else "daily (ladder + engine)"))
    rc, refresh_out = sh(argv)
    tail = [l for l in refresh_out.splitlines() if l.strip()][-4:]
    out.append("refresh.py exit %d" % rc)
    out += ["  " + l for l in tail]

    after = snapshot()
    after_ladder = ladder_summary()

    changed = [label for key, rel, label in WATCH
               if before.get(key) != after.get(key)]
    if changed:
        out.append("CHANGED: " + ", ".join(changed))
    else:
        out.append("nothing moved")

    if before_ladder and after_ladder and before_ladder != after_ladder:
        out.append("  ladder %s (%d rows) -> %s (%d rows)"
                   % (before_ladder["fetched"], before_ladder["rows"],
                      after_ladder["fetched"], after_ladder["rows"]))
        out.append("  top now: " + ", ".join(
            "%s %s%%" % (n, p) for n, p in (after_ladder["top"] or [])))

    # Correctness gate. A stale app beats a wrong one, so a failing selftest
    # stops the deploy rather than shipping numbers nobody checked.
    gate_ok = True
    for argv, what in ((["scripts/damage.py", "--selftest"], "damage selftest"),
                       (["scripts/test_norm.py"], "name matching")):
        g, gout = sh([PY] + argv)
        if g != 0:
            gate_ok = False
            out.append("BLOCKED: %s failed" % what)
            out += ["  " + l for l in gout.splitlines()[-6:]]
        else:
            out.append("ok: %s" % what)

    deployed = False
    if a.dry_run or a.skip_deploy:
        out.append("deploy skipped (flag)")
    elif not gate_ok:
        out.append("deploy skipped: a check failed")
    elif not changed:
        out.append("deploy skipped: identical build")
    else:
        d, dout = sh(["npx", "wrangler", "deploy"],
                     cwd=os.path.join(ROOT, "tracker"))
        ver = [l.strip() for l in dout.splitlines() if "Version ID" in l]
        out.append("deploy exit %d  %s" % (d, ver[0] if ver else ""))
        deployed = d == 0

    out.append("took %ds" % int((datetime.datetime.now() - started).total_seconds()))
    json.dump({"last_run": started.isoformat(), "changed": changed,
               "deployed": deployed}, io.open(STATE, "w", encoding="utf-8"))
    log(out)
    print("\n".join(out))
    return 0 if gate_ok else 1


if __name__ == "__main__":
    sys.exit(main())
