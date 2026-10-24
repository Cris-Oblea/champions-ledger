"""Fetch competitive metagame data from pokebase.app (Pokemon Champions only).

Serebii gives us the static rules (what exists, what it does). Pokebase gives us
the living metagame: what people actually run, at what percentage, at what speed.

Outputs to data/meta/:
    usage_pokemon.json    every Pokemon with its ladder/tournament usage %
    usage_moves.json      every move with a usage %
    usage_abilities.json  every ability with a usage %
    usage_items.json      every held item with a usage %
    speed_tiers.json      base speed -> actual speed at each investment level

Pokebase is a Next.js app. Everything is read from the RSC flight payload,
which we reassemble and index by line id: since the 2026-10 redesign the list
pages are one unpaginated grid whose CSS class names are build hashes, while
the payload carries each row as a plain object (slug, name, usage, ...).

Usage:
    python scripts/fetch_pokebase.py          # fetch + parse everything
"""
import json
import os
import re
import sys
import time
from collections.abc import Iterator, Sequence
from typing import Any

import dex
import net
from paths import META, POKEBASE

BASE = "https://pokebase.app/pokemon-champions"

PAGES = ["pokemon", "moves", "abilities", "items", "speed-tiers"]

def fetch(page: str, force: bool = False) -> str | None:
    """Download one pokebase page into the cache, unless a real copy is
    already there.
    """
    dest = os.path.join(POKEBASE, page + ".html")
    if os.path.exists(dest) and os.path.getsize(dest) > 5000 and not force:
        return dest
    os.makedirs(POKEBASE, exist_ok=True)
    url = BASE + "/" + page
    try:
        body = net.get(url, timeout=90)
    except net.ERRORS as e:
        print("  FAILED %s -> %s" % (page, e))
        return None
    with open(dest, "wb") as f:
        f.write(body)
    print("  %-14s %d KB" % (page, len(body) // 1024), flush=True)
    time.sleep(0.4)
    return dest


def read(page: str) -> str:
    """A cached page's HTML, or "" when it was never fetched."""
    p = os.path.join(POKEBASE, page + ".html")
    return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else ""


# --------------------------------------------------------------------------
# RSC flight payload
# --------------------------------------------------------------------------
def payload(html: str) -> str:
    """The streamed React Server Component payload, reassembled: every
    `self.__next_f.push([1,"..."])` carries one chunk of one JSON string."""
    chunks = re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html, re.S)
    return "".join(json.loads(c) for c in chunks)


def rsc_payload(page: str) -> str:
    """payload() of a cached page."""
    return payload(read(page))


def rsc_lines(payload: str) -> dict[str, Any]:
    """Index the payload by row id.

    A row is `<id>:<json>` or `<id>:T<hex-length>,<raw text>`. The text rows
    hold team write-ups and contain newlines, so splitting on "\\n" corrupts
    everything after them: walk the stream and consume each row by its own
    length instead.
    """
    out: dict[str, Any] = {}
    i, n = 0, len(payload)
    dec = json.JSONDecoder()
    head = re.compile(r"([0-9a-f]+):")
    text = re.compile(r"T([0-9a-f]+),")
    while i < n:
        m = head.match(payload, i)
        if not m:
            j = payload.find("\n", i)
            if j < 0:
                break
            i = j + 1
            continue
        rid, i = m.group(1), m.end()
        mt = text.match(payload, i)
        if mt:
            length = int(mt.group(1), 16)
            start = mt.end()
            body = payload[start:].encode("utf-8")[:length].decode("utf-8", "ignore")
            out[rid] = body
            i = start + len(body)
        elif payload[i:i + 1] in ("{", "["):
            try:
                obj, end = dec.raw_decode(payload, i)
                out[rid] = obj
                i = end
            except ValueError:
                j = payload.find("\n", i)
                i = j + 1 if j >= 0 else n
        else:
            j = payload.find("\n", i)
            i = j + 1 if j >= 0 else n
        if payload[i:i + 1] == "\n":
            i += 1
    return out


def find_key(obj: Any, key: str, hits: list[Any] | None = None) -> list[Any]:
    """Collect every value stored under `key`, at any depth."""
    hits = [] if hits is None else hits
    if dex.is_obj(obj):
        for k, v in obj.items():
            if k == key:
                hits.append(v)
            find_key(v, key, hits)
    elif dex.is_arr(obj):
        for v in obj:
            find_key(v, key, hits)
    return hits


def carrying(node: Any, keys: Sequence[str]) -> Iterator[dict[str, Any]]:
    """Every object under `node` that has all of `keys`, in document order."""
    if dex.is_obj(node):
        if all(k in node for k in keys):
            yield node
        for v in node.values():
            yield from carrying(v, keys)
    elif dex.is_arr(node):
        for v in node:
            yield from carrying(v, keys)


def rows_with(page: str, *keys: str) -> Iterator[dict[str, Any]]:
    """Every object carrying all of `keys` in a cached list page, in order:
    rows_with("items", "name", "unlock").

    Read as JSON, field by field. The build scripts used to pattern-match the
    raw HTML for a "name" followed by a "description", which paired 17 moves'
    text with the name of their TYPE (a move's type is an object with its own
    "name") and missed Snow Warning, whose text carries an escape the pattern
    did not expect."""
    yield from carrying(list(rsc_lines(rsc_payload(page)).values()), keys)


def usage_rows(page: str, *keys: str) -> Iterator[dict[str, Any]]:
    """Each row object of a list page once, by slug. `usage` is None where the
    page shows "—" (nobody runs it). The same slug also appears in thinner
    objects (the podium, a Mega's link), so name every field the caller reads."""
    seen: set[str] = set()
    for r in rows_with(page, "slug", "name", "usage", *keys):
        if r["slug"] not in seen:
            seen.add(r["slug"])
            yield r


# --------------------------------------------------------------------------
# Parsers
# --------------------------------------------------------------------------
def parse_pokemon_usage() -> list[dict[str, Any]]:
    """The ladder: name, slug, types, usage %.

    Every species on the page is kept, a "—" one at 0.0: the shrink guard in
    daily.py counts these rows, and audit_forms.py's watchlist is exactly the
    names pokebase lists with no usage.
    """
    rows: list[dict[str, Any]] = [
        {"name": r["name"], "slug": r["slug"], "types": list(r["types"]),
         "usage_percent": float(r["usage"] or 0)}
        for r in usage_rows("pokemon", "types")]
    rows.sort(key=lambda r: -r["usage_percent"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows


def parse_table_usage(page: str) -> list[dict[str, Any]]:
    """Moves / abilities / items list pages: name + usage %.

    A row nobody runs has usage None ("—" on the page) and is left out; an
    explicit 0 is kept. Read from the field, never from the markup: a
    pattern that searched the old table onward for the next "N%" found a
    move's accuracy instead, and Return, Absorb and 199 more were recorded
    at 100% usage."""
    rows = [r for r in usage_rows(page) if r["usage"] is not None]
    rows.sort(key=lambda r: -r["usage"])
    return [{"rank": i, "slug": r["slug"], "name": r["name"].strip(),
             "usage_percent": float(r["usage"]),
             "description": re.sub(r"\s+", " ", r.get("description") or "").strip()}
            for i, r in enumerate(rows, 1)]


def tier_speeds(base: int) -> dict[str, int]:
    """A base Speed's level-50 Speed at each investment, the formula of
    statAt() in tracker/src/core/data.js: base + SP + 20, times the nature.
    Integer maths, so a x1.1 never lands a hair under the whole number."""
    neu0, neu_max = base + 20, base + 20 + 32
    top = neu_max * 11 // 10
    return {"max": top, "neuMax": neu_max, "neu0": neu0, "neg0": neu0 * 9 // 10,
            "maxScarf": top * 3 // 2, "neuMaxScarf": neu_max * 3 // 2}


def parse_speed_tiers() -> list[dict[str, Any]]:
    """The speed-tier table: every form grouped by base Speed, fastest first.

    The page sends one object per form (slug, baseSpeed) and computes the
    tiers in the browser since 2026-10, so the speeds are ours."""
    tiers: dict[int, list[dict[str, Any]]] = {}
    seen: set[str] = set()
    for f in rows_with("speed-tiers", "slug", "name", "baseSpeed"):
        if f["slug"] not in seen:
            seen.add(f["slug"])
            tiers.setdefault(int(f["baseSpeed"]), []).append(
                {"name": f["name"], "slug": f["slug"]})
    return [{"base_speed": b, "speeds": tier_speeds(b), "pokemon": tiers[b]}
            for b in sorted(tiers, reverse=True)]


# --------------------------------------------------------------------------
def main() -> None:
    print("Fetching pokebase.app ...")
    force = "--force" in sys.argv
    for p in PAGES:
        fetch(p, force=force)

    os.makedirs(META, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d")

    jobs = [
        ("usage_pokemon", parse_pokemon_usage),
        ("usage_moves", lambda: parse_table_usage("moves")),
        ("usage_abilities", lambda: parse_table_usage("abilities")),
        ("usage_items", lambda: parse_table_usage("items")),
        ("speed_tiers", parse_speed_tiers),
    ]
    print("Parsing ...")
    for name, fn in jobs:
        try:
            rows = fn()
        except Exception as e:  # noqa: BLE001 - one broken parser never stops the rest
            print("  %-18s FAILED: %s" % (name, e))
            continue
        payload = {"source": "pokebase.app/pokemon-champions",
                   "game": "Pokemon Champions", "fetched": stamp,
                   "count": len(rows), "rows": rows}
        path = os.path.join(META, name + ".json")
        payload["fetched"] = dex.kept_stamp(path, payload)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
        print("  %-18s %d rows" % (name, len(rows)))


if __name__ == "__main__":
    main()
