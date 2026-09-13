#!/usr/bin/env python3
"""What the player owns, read from the database instead of from the repo.

    python scripts/ledger.py            # what it can see right now
    python scripts/ledger.py --refresh  # ignore the cache

`inventory/inventory.json` and `inventory/builds.json` used to hold this, and
by 2026-09-13 they were wrong in both directions at once: the box said 47 and
HOME 39 against a real 38 and 101, while builds.json held ten sets the app had
never seen. `query.py owned` was printing "BOX 47/50" off two-day-old files.

The player settled it: "ya nada deberia guardar datos en el repo, la DB es la
que manda en ese sentido... yo borre esas builds cuando saque a los pokemones
de champions que las tenian, no me importa perderlas." So the files are gone
and this reads the ledger.

THREE SOURCES, IN ORDER, AND IT SAYS WHICH ONE IT USED:

  1. a cache under data/raw/, if it is younger than TTL. query.py is a CLI a
     person runs a dozen times in a row and each table costs a round trip
     through the Supabase CLI - without this, `query.py brief` would take
     fifteen seconds.
  2. the live database.
  3. the newest backup snapshot, which backup_ledger.py is already writing on
     every run. Offline, that is a real answer with a date on it, and saying
     "as of Tuesday" beats both a crash and a silent zero.

Where there is none of the three - CI, a fresh clone - it returns empty
structures and says so once. Nothing here may ever raise: twelve scripts import
query.py, four of them inside the gate, and none of them should care whether a
database was reachable.

THE VP COSTS BELOW ARE NOT LEDGER DATA. They are rules of the game, observed in
play, and they stay in the repo where rules live - the same reason the Item
Clause is in CLAUDE.md and not in a table.

A PRICE IS NOT A BALANCE, and the balance is no longer tracked at all (player,
2026-09-13: "en la app ya hablamos sobre eso y no es necesario... solo dejamos
la casilla box para modificarla"). Profile keeps one editable field, box
capacity. A number nobody can edit is a number that goes stale and then gets
quoted as current - vp_balance had sat at 8000 since 2026-09-12, and the
permanence-ticket count with it. So the costs stay and the balance is gone: say
what something COSTS, and ask him what he has if it ever decides anything.
"""
import argparse, io, json, os, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "data", "raw", "ledger_cache.json")
TTL = 900                                   # seconds

# Observed in game by the player on 2026-08-29. Serebii's training page still
# shows the launch prices (2 / 100 / 200 / 400) and is wrong; these are what
# the game actually charges.
COSTS = {"ranked_win": 300, "mega_stone_shop": 2000,
         "keep_rental_pokemon": 2500, "training_move": 250,
         "training_nature": 500, "training_ability": 500,
         "training_stat_point": 5}

_CACHED = None                              # per-process, on top of the file
_SAID = False


def _note(msg):
    global _SAID
    if not _SAID:
        print("  (ledger: %s)" % msg, file=sys.stderr)
        _SAID = True


def _from_db():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import backup_ledger
    except ImportError:
        return None
    out = {}
    for t in ("box", "builds", "teams", "meta"):
        r = backup_ledger.rows(t)
        if r is None:
            return None
        out[t] = r
    return out


def _from_snapshot():
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import backup_ledger
        files = backup_ledger.snapshots(backup_ledger.DEFAULT_DIR)
        if not files:
            return None, None
        d = json.load(io.open(files[-1], encoding="utf-8"))
        return d.get("tables"), d.get("_taken_at")
    except Exception:
        return None, None


def tables(refresh=False):
    """Every table, from whichever source answers first. Never raises."""
    global _CACHED
    if _CACHED is not None and not refresh:
        return _CACHED
    if not refresh and os.path.exists(CACHE):
        try:
            if time.time() - os.path.getmtime(CACHE) < TTL:
                _CACHED = json.load(io.open(CACHE, encoding="utf-8"))
                return _CACHED
        except (OSError, ValueError):
            pass

    live = _from_db()
    if live is not None:
        try:
            os.makedirs(os.path.dirname(CACHE), exist_ok=True)
            with io.open(CACHE, "w", encoding="utf-8") as f:
                json.dump(live, f, ensure_ascii=False, default=str)
        except OSError:
            pass
        _CACHED = live
        return _CACHED

    snap, when = _from_snapshot()
    if snap is not None:
        _note("database unreachable - using the snapshot of %s" % when)
        _CACHED = snap
        return _CACHED

    _note("no database and no snapshot - nothing is known about the box")
    _CACHED = {"box": [], "builds": [], "teams": [], "meta": []}
    return _CACHED


def _meta(t, key):
    for r in t.get("meta") or []:
        if r.get("id") == key:
            return r.get("data") or {}
    return {}


def _box(t, location, rental=None):
    rows = [r for r in (t.get("box") or [])
            if r.get("location") == location
            and (rental is None or (r.get("status") == "rental") == rental)]
    rows.sort(key=lambda r: (r.get("ord") or 0, r.get("name") or ""))
    return [r["name"] for r in rows]


def inv(refresh=False):
    """The shape query.py already expects, built from the ledger.

    Deliberately the OLD shape rather than a nicer one: this replaced a file
    that a dozen call sites read, and a rename on top of a re-source would have
    made a data bug and a typo look identical.
    """
    t = tables(refresh)
    trainer = _meta(t, "trainer")
    items = {}
    for row in (_meta(t, "items").get("owned") or []):
        name, cats = (row[0], row[1]) if isinstance(row, list) else (row, "other")
        for c in ([cats] if isinstance(cats, str) else cats) or ["other"]:
            items.setdefault(c, []).append(name)
    champ = _box(t, "champions")
    return {
        "permanent_pokemon": _box(t, "champions", rental=False),
        "rental_pokemon": {"list": _box(t, "champions", rental=True),
                           "can_be_trained": False},
        "home_box": {"list": _box(t, "home")},
        "mega_stones": sorted(_meta(t, "stones").get("owned") or []),
        "items": {k: sorted(v) for k, v in sorted(items.items())},
        # box_used is DERIVED now. It was a hand-typed number in the file and
        # query.py carried a warning for when it disagreed with the lists;
        # counting the rows makes both the number and the warning unnecessary.
        "trainer": {"box_capacity": trainer.get("box_capacity", 50),
                    "box_used": len(champ)},
        # COSTS only, never a balance - see the note at the top of the file.
        "economy": {"costs": dict(COSTS)},
    }


def builds(refresh=False):
    """Every build, newest field set first, with `extra` merged back in."""
    out = []
    for r in sorted(tables(refresh).get("builds") or [],
                    key=lambda x: str(x.get("id"))):
        b = {"id": r.get("id")}
        for k in ("pokemon", "box_id", "mega", "ability", "mega_ability",
                  "nature", "stat_points", "moves", "role", "rationale"):
            if r.get(k) not in (None, "", [], {}):
                b[k] = r[k]
        b.update(r.get("extra") or {})
        out.append(b)
    return out


def teams(refresh=False):
    return sorted(tables(refresh).get("teams") or [],
                  key=lambda x: str(x.get("id")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    i = inv(a.refresh)
    print("box %d/%d   (%d owned, %d rental)"
          % (i["trainer"]["box_used"], i["trainer"]["box_capacity"],
             len(i["permanent_pokemon"]), len(i["rental_pokemon"]["list"])))
    print("HOME %d" % len(i["home_box"]["list"]))
    print("stones %d, items %d, builds %d, teams %d"
          % (len(i["mega_stones"]), sum(len(v) for v in i["items"].values()),
             len(builds()), len(teams())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
