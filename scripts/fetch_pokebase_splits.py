#!/usr/bin/env python3
"""What each Pokemon actually runs, per Pokemon, from pokebase's own pages.

    python scripts/fetch_pokebase_splits.py            # every Pokemon with usage
    python scripts/fetch_pokebase_splits.py --force    # ignore what is stored

The global tables answer "how much is Sucker Punch used" across the whole
ladder. This answers the question a build actually asks: of the people running
KINGAMBIT, what do THEY run - which moves, which item, which ability, which
nature, which SP spread, and beside whom.

THE PAGE HAS TWO OF THESE, AND THEY ARE NOT THE SAME NUMBERS (and the
rendered HTML shows only the top five of each section):

  TOURNAMENT BUILDS - tournament teamlists for ONE regulation ("M-C"), as
      label/share rows. Present for every Pokemon that has been brought to an
      event. Kingambit: Defiant 99%.
  RANKED LADDER     - per season, split into doubles and singles. Only present
      for a Pokemon that was ranked that season. Kingambit: Defiant 95.7%.

The old parser walked the rendered HTML looking for a heading called "Moves"
and kept the longest run of percentages it found, so it took whichever block
happened to be longer. The result was a file that mixed the two: Kingambit's
moves summed to 370 (four slots per set, so a share OF SETS) while Rillaboom's
summed to 94 (a share of move SLOTS). The same column, two meanings, decided
by which Pokemon you looked up. Both are now captured, separately and whole.

EVERYTHING IS READ FROM THE NEXT.JS FLIGHT PAYLOAD - `self.__next_f.push(...)`
- because the markup only ever shows the top five ("Show all 37") and its CSS
class names are build hashes. Rillaboom: 37 moves, 27 items, 14 natures, 50
spreads, 10 teammates. The abilities are the one exception: they have no
table, only a tooltip each ("99% of tournament builds in M-C run Defiant."),
which also names the regulation. Layout as of pokebase's 2026-10-24 redesign.

WHY POKEBASE AND NOT PIKALYTICS. Pikalytics has the same shape of data but
stopped updating - the rule is one month to update or it stops being a
source. pokebase is the live data for the format being played.

THE RAW HTML IS NOT CACHED, and that is deliberate. Each page is 1.3 MB of
Next.js markup and there are 321 of them: 427 MB, more than twice the entire
existing raw cache, to keep bytes that are re-derivable and that nothing else
reads. Only the extract is stored, which is a few hundred KB.

IT RUNS WEEKLY, not nightly, for the same reason the Smogon analyses do: six
minutes and 427 MB of someone else's bandwidth for numbers that drift slowly.
refresh.py --deep pulls it.
"""
import argparse
import json
import os
import re
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import dex
import net
from fetch_pokebase import carrying, find_key, payload, rsc_lines
from paths import META

OUT = os.path.join(META, "usage_splits.json")
BASE = "https://pokebase.app/pokemon-champions/pokemon/"

# pokebase's stat keys, and what this project calls them
SP_KEYS = [("hp", "hp"), ("attack", "atk"), ("defense", "def"),
           ("specialAttack", "spa"), ("specialDefense", "spd"),
           ("speed", "spe")]


# --------------------------------------------------------------- the payload

def _lists(lines: dict[str, Any], key: str) -> list[list[Any]]:
    """Every array stored under `key`, in page order."""
    return [v for v in find_key(lines, key) if dex.is_arr(v)]


def _rows(rows: list[dict[str, Any]] | None,
          extra: Callable[[dict[str, Any], dict[str, Any]], None] | None = None) -> list[dict[str, Any]]:
    """A section, trimmed to what the app reads.

    `percent` is allowed to be missing, and only one section ever is: the
    LADDER's teammates are a ranked list with no number behind it. The
    tournament block measures the same thing ("Sneasler 53.9%"), so the two
    must not be shown as if they said the same thing.
    """
    out: list[dict[str, Any]] = []
    for r in rows or ():
        row = {"name": r["name"], "percent": r.get("percent")}
        if row["percent"] is None:
            del row["percent"]
        if extra:
            extra(r, row)
        out.append(row)
    return out


def _spreads(rows: list[dict[str, Any]] | None, field: str) -> list[dict[str, Any]]:
    """The SP spreads of one section, with their share."""
    out: list[dict[str, Any]] = []
    for r in rows or ():
        vals = dex.obj(r.get(field))
        sp = {short: vals[long_] for long_, short in SP_KEYS if vals.get(long_)}
        if sp:
            out.append({"sp": sp, "percent": r["percent"]})
    return out


# ----------------------------------------------------------- tournament side

def _kind(rows: list[Any]) -> str | None:
    """Which section a table of rows is, read off its own fields.

    Order of appearance would be shorter, and is exactly the assumption that
    produced the mixed file this replaces, so each table names itself: a
    spread carries `values`, a nature its `detail`, and the rest link where
    they point (a move, an item, a teammate).
    """
    f = rows[0] if rows else None
    if not dex.is_obj(f):
        return None
    if "values" in f and "percent" in f:
        return "spreads"
    if "share" not in f:
        return None
    if "detail" in f:
        return "natures"
    m = re.search(r"/pokemon-champions/(moves|items|pokemon)/", f.get("href") or "")
    return {"moves": "moves", "items": "items", "pokemon": "teammates"}[m.group(1)] if m else None


# "+Atk / −Sp. Atk" -> "+Atk / -SpA", how natures.json and the app write it
_NATURE_WORDS = [("−", "-"), ("Sp. Atk", "SpA"), ("Sp. Def", "SpD")]


def _shares(rows: list[dict[str, Any]] | None, slots: bool = False) -> list[dict[str, Any]]:
    """A `label`/`share` section as name + percent. `share` is a fraction of
    builds; `slots` turns it into a share of slots by dividing by the sum,
    which is the moves a set carries on average (four, but one for Ditto)."""
    out: list[dict[str, Any]] = []
    per = (sum(r["share"] for r in rows or ()) or 1) if slots else 1
    for r in rows or ():
        row: dict[str, Any] = {"name": r["label"], "percent": round(r["share"] * 100 / per, 1)}
        if r.get("detail"):
            d: str = r["detail"]
            for a, b in _NATURE_WORDS:
                d = d.replace(a, b)
            row["effect"] = d
        out.append(row)
    return out


_ABILITY_TIP = re.compile(r'"title":"([\d.]+)% of tournament builds in ([A-Za-z0-9-]+) run ([^"]+?)\."')


def tournament(lines: dict[str, Any], flow: str, mega: bool) -> dict[str, Any]:
    """The regulation's tournament block, every row of every section."""
    got: dict[str, list[dict[str, Any]]] = {}
    for rows in _lists(lines, "rows"):
        k = _kind(rows)
        if k and k not in got:
            got[k] = rows
    # Abilities have no table: a species has at most three, and their share
    # is only in each one's tooltip, which also names the regulation. A Mega
    # has exactly ONE ability (player, 2026-10-24), so it runs it on every
    # set; the tooltip's small share only counts teamlists that wrote the
    # Mega's ability instead of the base one.
    tips = _ABILITY_TIP.findall(flow)
    share = {name: float(pct) for pct, _, name in tips}
    if mega:
        share = dict.fromkeys(list(share)[:1], 100.0)
    elif not any(share.values()):
        share = {}   # every tip at 0%: the teamlists match none of them (Lycanroc)
    abilities = sorted(share.items(), key=lambda x: -x[1])
    return {
        # pokebase gives a move's share of BUILDS; dividing by the sum keeps
        # the column a share of move SLOTS (see build_splits_data)
        "moves": _shares(got.get("moves"), slots=True),
        "items": _shares(got.get("items")),
        "natures": _shares(got.get("natures")),
        "teammates": _shares(got.get("teammates")),
        "spreads": _spreads(got.get("spreads"), "values"),
        "abilities": [{"name": n, "percent": v} for n, v in abilities],
        "regulation": tips[0][1].upper() if tips else None,
    }


# --------------------------------------------------------------- ladder side

def season(lines: dict[str, Any]) -> dict[str, Any] | None:
    """The newest DOUBLES ladder season, or None when the page has no block.

    Singles is dropped here for the same reason fetch_smogon.py drops it: it
    never reaches an official tournament, and the player enters VGC. Both
    formats are published under the same seasonId, so the filter has to be on
    the row rather than on the page.
    """
    seasons: dict[Any, dex.Row] = {}   # keyed by the page's own id
    for arr in _lists(lines, "seasons"):
        for s in arr:
            if dex.is_obj(s) and s.get("id"):
                seasons[s["id"]] = s
    best, best_n = None, -1
    for o in carrying(list(lines.values()), ("seasonId", "moves")):
        if o.get("format") != "doubles":
            continue
        n: int = dex.obj(seasons.get(o.get("seasonId"))).get("season") or 0
        if n > best_n:
            best, best_n = o, n
    if not best:
        return None
    meta = dex.obj(seasons.get(best.get("seasonId")))
    return {
        "name": meta.get("name"),
        "dates": meta.get("dateRangeLabel"),
        "rank": best.get("rank"),
        "of": best.get("totalRanked"),
        "moves": _rows(best.get("moves")),
        "items": _rows(best.get("items")),
        "natures": _rows(best.get("natures")),
        "abilities": _rows(best.get("abilities")),
        "teammates": _rows(best.get("teammates")),
        "spreads": _spreads(best.get("statSpreads"), "values"),
    }


def parse(html: str, mega: bool = False) -> dict[str, dict[str, Any]]:
    # the props of every component on the page, which is where the
    # sections that paginate keep their rows
    """Everything one Pokemon page holds: the tournament block for the
    regulation, and the ladder seasons when the page has them.
    """
    flow = payload(html)
    lines = rsc_lines(flow)
    got = {"tournament": tournament(lines, flow, mega)}
    ladder = season(lines)
    if ladder:
        got["season"] = ladder
    return got


def fetch(slug: str) -> str | None:
    """One Pokemon page, or None (printed) when it fails."""
    try:
        return net.text(BASE + slug)
    except net.ERRORS as e:
        print("  FAILED %s -> %s" % (slug, e))
        return None


def _stored(force: bool) -> dict[str, Any]:
    """What an earlier run already wrote, so an ordinary run only fetches the
    Pokemon it has not seen; nothing under --force."""
    if not os.path.exists(OUT) or force:
        return {}
    try:
        return json.loads(Path(OUT).read_text(encoding="utf-8")).get("pokemon") or {}
    except (OSError, ValueError):
        return {}


def _fetch_missing(rows: list[dict[str, Any]], out: dict[str, Any],
                   force: bool) -> tuple[int, list[str]]:
    """Fetch each ladder row not in `out` yet into it; (how many were fetched,
    the names whose page had no usage block)."""
    n = 0
    empty: list[str] = []
    for r in rows:
        slug, name = r.get("slug"), r.get("name")
        if not slug or not name or (name in out and not force):
            continue
        html = fetch(slug)
        if not html:
            continue
        got = parse(html, mega="-mega" in slug)
        t = got.get("tournament") or {}
        if any(t.get(k) for k in ("moves", "items", "natures", "spreads")):
            out[name] = got
        else:
            empty.append(name)
        n += 1
        if n % 25 == 0:
            print("  %d fetched" % n, flush=True)
        time.sleep(0.25)
    return n, empty


def main() -> int:
    """Fetch the splits page of every Pokemon on the ladder and write
    usage_splits.json.
    """
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n")[0])
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    usage = json.loads(Path(META, "usage_pokemon.json").read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = usage.get("rows") or []

    out = dict(_stored(a.force))
    n, empty = _fetch_missing(rows, out, a.force)

    regs: list[str] = sorted({r for v in out.values()
                              if (r := dex.obj(v.get("tournament")).get("regulation"))})
    blob: dict[str, Any] = {"source": "pokebase.app per-Pokemon pages",
            "note": ("What each Pokemon's own players run. TWO datasets, kept "
                     "apart because their percentages are not the same "
                     "measure: `tournament` is teamlists for one regulation "
                     "and exists for every Pokemon; `season` is the ladder "
                     "and only exists for a Pokemon ranked that season. Read "
                     "from the Next.js payload, which carries every row of "
                     "every section - the rendered HTML only shows the top "
                     "five."),
            "regulations": regs,
            "fetched": time.strftime("%Y-%m-%d"),
            "count": len(out), "pokemon": out}
    blob["fetched"] = dex.kept_stamp(OUT, blob)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(blob, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print("wrote %s  (%d Pokemon, %d new, regulation %s)"
          % (OUT, len(out), n, ", ".join(regs) or "?"))
    if empty:
        print("  no usage block: %s" % ", ".join(empty[:12]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
