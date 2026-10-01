"""Fetch competitive metagame data from pokebase.app (Pokemon Champions only).

Serebii gives us the static rules (what exists, what it does). Pokebase gives us
the living metagame: what people actually run, at what percentage, at what speed.

Outputs to data/meta/:
    usage_pokemon.json    every Pokemon with its ladder/tournament usage %
    usage_moves.json      top 100 moves by usage %
    usage_abilities.json  top 100 abilities by usage %
    usage_items.json      top 100 held items by usage %
    speed_tiers.json      base speed -> actual speed at each investment level
    teams.json            shared teams: full sets, natures, items, rental codes

Pokebase is a Next.js app; list pages are server-rendered, so the numbers are in
the HTML. The Pokemon usage map and the speed/team data live in the RSC flight
payload instead, which we reassemble and index by line id.

Usage:
    python scripts/fetch_pokebase.py          # fetch + parse everything
"""
import json
import os
import re
import sys
import time

import net
from paths import META, ROOT

BASE = "https://pokebase.app/pokemon-champions"
RAW = os.path.join(ROOT, "data", "raw", "pokebase")

PAGES = ["pokemon", "moves", "abilities", "items", "speed-tiers", "teams"]

# The list pages render only 100 rows at a time and the usage % exists only in
# that rendered HTML, so every page of the table has to be walked with ?page=N.
PAGED = {"moves": 10, "abilities": 4, "items": 2}


def fetch(page, force=False, num=None):
    name = page if num in (None, 1) else "%s_p%d" % (page, num)
    dest = os.path.join(RAW, name + ".html")
    if os.path.exists(dest) and os.path.getsize(dest) > 5000 and not force:
        return dest
    os.makedirs(RAW, exist_ok=True)
    url = BASE + "/" + page + ("" if num in (None, 1) else "?page=%d" % num)
    try:
        body = net.get(url, timeout=90)
    except net.ERRORS as e:
        print("  FAILED %s -> %s" % (name, e))
        return None
    with open(dest, "wb") as f:
        f.write(body)
    print("  %-14s %d KB" % (name, len(body) // 1024), flush=True)
    time.sleep(0.4)
    return dest


def read(page):
    p = os.path.join(RAW, page + ".html")
    return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else ""


def read_all_pages(page):
    """Every cached page of a paginated table, in order."""
    yield read(page)
    for n in range(2, PAGED.get(page, 1) + 1):
        s = read("%s_p%d" % (page, n))
        if s:
            yield s


# --------------------------------------------------------------------------
# RSC flight payload
# --------------------------------------------------------------------------
def rsc_payload(page):
    """Reassemble the streamed React Server Component payload."""
    s = read(page)
    chunks = re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', s, re.S)
    return "".join(json.loads(c) for c in chunks)


def rsc_lines(payload):
    """Index the payload by row id.

    A row is `<id>:<json>` or `<id>:T<hex-length>,<raw text>`. The text rows
    hold team write-ups and contain newlines, so splitting on "\\n" corrupts
    everything after them: walk the stream and consume each row by its own
    length instead.
    """
    out, i, n = {}, 0, len(payload)
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


def resolve(node, lines, depth=0):
    """Expand `$<lineid>:path:to:value` back-references used to dedupe the payload."""
    if depth > 12:
        return node
    if isinstance(node, str):
        if node.startswith("$") and ":" in node:
            parts = node[1:].split(":")
            cur = lines.get(parts[0])
            if cur is None:
                return node
            for key in parts[1:]:
                try:
                    cur = cur[int(key)] if isinstance(cur, list) else cur[key]
                except (KeyError, IndexError, ValueError, TypeError):
                    return node
            return resolve(cur, lines, depth + 1)
        return node
    if isinstance(node, list):
        return [resolve(v, lines, depth + 1) for v in node]
    if isinstance(node, dict):
        return {k: resolve(v, lines, depth + 1) for k, v in node.items()}
    return node


def find_key(obj, key, hits=None):
    """Collect every value stored under `key`, at any depth."""
    hits = [] if hits is None else hits
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                hits.append(v)
            find_key(v, key, hits)
    elif isinstance(obj, list):
        for v in obj:
            find_key(v, key, hits)
    return hits


# --------------------------------------------------------------------------
# Parsers
# --------------------------------------------------------------------------
def parse_pokemon_usage():
    """Pokemon usage lives in a id->percent map; names come from the same payload."""
    payload = rsc_payload("pokemon")
    usage = {}
    m = re.search(r'"usagePercentByPokemonId":\{(.*?)\}', payload, re.S)
    if m:
        for pid, pct in re.findall(r'"([0-9a-f]{24})":([\d.]+)', m.group(1)):
            usage[pid] = float(pct)

    # names/stats come from the docs array, keyed by the same object id
    names = {}
    for bucket in find_key(rsc_lines(payload), "docs"):
        if not (isinstance(bucket, list) and bucket):
            continue
        for d in bucket:
            if not (isinstance(d, dict) and "nationalNumber" in d and d.get("id")):
                continue
            types = d.get("type") or []
            names[d["id"]] = {
                "name": d.get("name"), "slug": d.get("slug"),
                "national_number": d.get("nationalNumber"),
                "is_mega": bool(d.get("isMega")),
                "types": [t.get("name") for t in types if isinstance(t, dict)],
                "base_stats": {
                    "hp": d.get("hp"), "atk": d.get("attack"), "def": d.get("defense"),
                    "spa": d.get("specialAttack"), "spd": d.get("specialDefense"),
                    "spe": d.get("speed"),
                },
            }

    rows = []
    for pid, pct in usage.items():
        info = names.get(pid)
        if not info:
            continue
        row = dict(info)
        row["usage_percent"] = pct
        rows.append(row)
    rows.sort(key=lambda r: -r["usage_percent"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows


def parse_table_usage(page):
    """Moves / abilities / items list pages: name + usage % straight from the HTML.

    The usage is the FIRST cell after the name, and only that cell. A move
    nobody runs has "—" there, and a pattern that searched onward for the
    next "N%" found its accuracy instead: Return, Absorb and 199 more were
    recorded at 100% usage. A move with no usage is left out."""
    rows, seen = [], set()
    name = re.compile(r'href="/pokemon-champions/%s/([a-z0-9\-\.]+)">([^<]+)</a>'
                      % re.escape(page))
    first_cell = re.compile(r"</td><td[^>]*><span[^>]*>([\d.]+)?")
    for s in read_all_pages(page):
        for m in name.finditer(s):
            slug = m.group(1)
            if slug in seen:
                continue
            seen.add(slug)
            cell = first_cell.search(s, m.end())
            if not (cell and cell.group(1)):
                continue
            desc = ""
            d = re.search(r"whitespace-pre-wrap[^>]*>([^<]{10,400})<",
                          s[m.end():cell.start()])
            if d:
                desc = re.sub(r"\s+", " ", d.group(1)).strip()
            rows.append({"rank": len(rows) + 1, "slug": slug,
                         "name": m.group(2).strip(),
                         "usage_percent": float(cell.group(1)),
                         "description": desc})
    return rows


def parse_speed_tiers():
    payload = rsc_payload("speed-tiers")
    m = re.search(r'"tierRows":(\[.*?\}\]\}\])', payload, re.S)
    if not m:
        return []
    try:
        rows = json.loads(m.group(1))
    except ValueError:
        # fall back: cut at the next top-level key
        depth, end = 0, None
        raw = payload[payload.find('"tierRows":') + 11:]
        for i, ch in enumerate(raw):
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        rows = json.loads(raw[:end]) if end else []
    out = []
    for r in rows:
        out.append({
            "base_speed": r.get("baseSpeed"),
            "speeds": r.get("speeds", {}),
            "pokemon": [{"name": p.get("name"), "slug": p.get("slug")}
                        for p in r.get("pokemon", [])],
        })
    return out


def parse_teams():
    payload = rsc_payload("teams")
    lines = rsc_lines(payload)
    teams, seen = [], set()
    for bucket in find_key(lines, "community") + find_key(lines, "tournament"):
        if not isinstance(bucket, list):
            continue
        for raw in bucket:
            if not isinstance(raw, dict) or "team" not in raw:
                continue
            t = resolve(raw, lines)
            tid = t.get("id")
            if tid in seen:
                continue
            seen.add(tid)
            members = []
            for slot in t.get("team") or []:
                if not isinstance(slot, dict):
                    continue
                p = slot.get("pokemon") or {}
                item = slot.get("item")
                ability = slot.get("ability")
                members.append({
                    "pokemon": p.get("name") if isinstance(p, dict) else None,
                    "slug": p.get("slug") if isinstance(p, dict) else None,
                    "ability": ability.get("name") if isinstance(ability, dict) else ability,
                    "item": item.get("name") if isinstance(item, dict) else item,
                    "nature": slot.get("nature"),
                    "moves": [mv.get("name") for mv in (slot.get("moves") or [])
                              if isinstance(mv, dict)],
                    "stat_points": slot.get("stats"),
                })
            if not members:
                continue
            creator = t.get("creator") or {}
            reg = t.get("regulationSet") or {}
            teams.append({
                "name": t.get("name"),
                "creator": creator.get("name") if isinstance(creator, dict) else None,
                "regulation": reg.get("name") if isinstance(reg, dict) else None,
                "rental_code": t.get("gameTeamId"),
                "source_url": t.get("sourceUrl"),
                "date_shared": t.get("dateShared"),
                "members": members,
            })
    return teams


# --------------------------------------------------------------------------
def main():
    print("Fetching pokebase.app ...")
    force = "--force" in sys.argv
    for p in PAGES:
        for n in range(1, PAGED.get(p, 1) + 1):
            fetch(p, force=force, num=n)

    os.makedirs(META, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d")

    jobs = [
        ("usage_pokemon", parse_pokemon_usage),
        ("usage_moves", lambda: parse_table_usage("moves")),
        ("usage_abilities", lambda: parse_table_usage("abilities")),
        ("usage_items", lambda: parse_table_usage("items")),
        ("speed_tiers", parse_speed_tiers),
        ("teams", parse_teams),
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
        with open(os.path.join(META, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
        print("  %-18s %d rows" % (name, len(rows)))


if __name__ == "__main__":
    main()
