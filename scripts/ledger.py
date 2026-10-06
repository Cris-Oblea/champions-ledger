#!/usr/bin/env python3
"""What the player owns, read from the database instead of from the repo.

    python scripts/ledger.py            # what it can see right now
    python scripts/ledger.py --refresh  # ignore the cache

THE DATABASE IS THE ONLY COPY. The repo holds none of his state: copies kept
in files (the old inventory/ folder) drifted in both directions within days,
and every CLI then printed stale numbers as current. So this reads the
ledger, and nothing writes his state anywhere else.

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

A PRICE IS NOT A BALANCE, and the VP balance is not tracked at all: Settings
keeps one editable field, box capacity. A number nobody keeps current goes
stale and then gets quoted as current. So the costs stay and the balance is
gone: say what something COSTS, and ask him what he has if it ever decides
anything.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from paths import DB, RAW

CACHE = os.path.join(RAW, "ledger_cache.json")
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


def _note(msg: str) -> None:
    """Say once, on stderr, where the ledger was read from."""
    global _SAID
    if not _SAID:
        print("  (ledger: %s)" % msg, file=sys.stderr)
        _SAID = True


def _from_db() -> dict[str, list[dict[str, Any]]] | None:
    """Every table, read live from Supabase, or None when it cannot be reached.
    """
    try:
        import backup_ledger
    except ImportError:
        return None
    out = {}
    for t in ("box", "builds", "teams", "stones", "items", "gts", "meta"):
        r = backup_ledger.rows(t)
        if r is None:
            return None
        out[t] = r
    return out


def _from_snapshot() -> tuple[Any, Any]:
    """Every table from the newest backup snapshot, and its date; (None, None)
    when there is none.
    """
    try:
        import backup_ledger
        files = backup_ledger.snapshots(backup_ledger.DEFAULT_DIR)
        if not files:
            return None, None
        d = json.loads(Path(files[-1]).read_text(encoding="utf-8"))
        return d.get("tables"), d.get("_taken_at")
    except (ImportError, OSError, ValueError):
        return None, None


def tables(refresh: bool = False) -> dict[str, list[dict[str, Any]]]:
    """Every table, from whichever source answers first. Never raises."""
    global _CACHED
    if _CACHED is not None and not refresh:
        return _CACHED
    if not refresh and os.path.exists(CACHE):
        try:
            if time.time() - os.path.getmtime(CACHE) < TTL:
                _CACHED = json.loads(Path(CACHE).read_text(encoding="utf-8"))
                return _CACHED
        except (OSError, ValueError):
            pass

    live = _from_db()
    if live is not None:
        try:
            os.makedirs(os.path.dirname(CACHE), exist_ok=True)
            with open(CACHE, "w", encoding="utf-8") as f:
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


def _meta(t: dict[str, list[dict[str, Any]]], key: str) -> dict[str, Any]:
    """One meta document's data."""
    for r in t.get("meta") or []:
        if r.get("id") == key:
            return r.get("data") or {}
    return {}


def _box(t: dict[str, list[dict[str, Any]]], location: str,
         rental: bool | None = None) -> list[str]:
    """The names in one box, in the app's order (rentals only, none, or both).
    """
    rows = [r for r in (t.get("box") or [])
            if r.get("location") == location
            and (rental is None or (r.get("status") == "rental") == rental)]
    rows.sort(key=lambda r: (r.get("ord") or 0, r.get("name") or ""))
    return [r["name"] for r in rows]


def _item_categories() -> dict[str, str]:
    """name -> the group the game itself puts the item in.

    Serebii lays the item page out in three tables and that is where the
    grouping comes from; it was never typed in. It used to be stored beside
    the owned list, which meant a category could drift from the dex that
    defines it.
    """
    path = os.path.join(DB, "items.json")
    try:
        rows = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if isinstance(rows, dict):
        rows = rows.get("items") or []
    out = {}
    for r in rows:
        if isinstance(r, dict) and r.get("name"):
            out[r["name"]] = (r.get("category") or r.get("kind") or "other")
    return out


def inv(refresh: bool = False) -> dict[str, Any]:
    """The shape query.py already expects, built from the ledger.

    Deliberately the OLD shape rather than a nicer one: this replaced a file
    that a dozen call sites read, and a rename on top of a re-source would have
    made a data bug and a typo look identical.
    """
    t = tables(refresh)
    trainer = _meta(t, "trainer")
    # One row per owned item since migration 6, and the categories that used to
    # ride along in the document are the game's own - they come from
    # data/db/items.json. The old [name, [category]] pairs were converted by
    # that migration, so there is one shape to read here rather than two.
    cats = _item_categories()
    items = {}
    for row in (t.get("items") or []):
        name = row.get("id")
        if not name:
            continue
        items.setdefault(cats.get(name, "other"), []).append(name)
    champ = _box(t, "champions")
    return {
        "permanent_pokemon": _box(t, "champions", rental=False),
        "rental_pokemon": {"list": _box(t, "champions", rental=True),
                           "can_be_trained": False},
        "home_box": {"list": _box(t, "home")},
        "mega_stones": sorted(r["id"] for r in (t.get("stones") or [])
                              if r.get("id")),
        "items": {k: sorted(v) for k, v in sorted(items.items())},
        # box_used is DERIVED now. It was a hand-typed number in the file and
        # query.py carried a warning for when it disagreed with the lists;
        # counting the rows makes both the number and the warning unnecessary.
        "trainer": {"box_capacity": trainer.get("box_capacity", 50),
                    "box_used": len(champ)},
        # COSTS only, never a balance - see the note at the top of the file.
        "economy": {"costs": dict(COSTS)},
    }


def builds() -> list[dict[str, Any]]:
    """Every build, newest field set first, with `extra` merged back in."""
    out = []
    for r in sorted(tables().get("builds") or [],
                    key=lambda x: str(x.get("id"))):
        b = {"id": r.get("id")}
        for k in ("pokemon", "box_id", "mega", "ability", "mega_ability",
                  "nature", "stat_points", "moves", "role", "rationale"):
            if r.get(k) not in (None, "", [], {}):
                b[k] = r[k]
        b.update(r.get("extra") or {})
        out.append(b)
    return out


def teams() -> list[dict[str, Any]]:
    """Every team, by id."""
    return sorted(tables().get("teams") or [],
                  key=lambda x: str(x.get("id")))


def main() -> int:
    """Print the box, HOME, stones, items, builds and teams."""
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
