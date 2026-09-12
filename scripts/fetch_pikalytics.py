"""Fetch per-Pokemon usage breakdowns and team cores from Pikalytics.

Pikalytics publishes an LLM-oriented Markdown mirror of every page under
/ai/..., which is far cleaner to parse than the rendered site. Per Pokemon it
gives move / ability / item percentages, common teammates, the most common SP
spread, a win rate, and featured tournament teams. The format index adds
2- and 3-Pokemon cores, which no other source here provides.

Formats (Champions only):
    battledataregmbs3     ranked ladder, Regulation M-B
    championstournaments  tournament results

Note: Pikalytics stamps these datasets "Data Date: 2026-05" and the ladder
format code says S3 while the live season is M-5, so treat these numbers as
lagging behind pokebase's ladder usage. Cores and win rates are still the most
detailed available anywhere.

Outputs:
    data/meta/pikalytics_<format>.json

Usage:
    python scripts/fetch_pikalytics.py
    python scripts/fetch_pikalytics.py --format championstournaments
    python scripts/fetch_pikalytics.py --force
"""
import os, re, sys, json, time, urllib.parse, urllib.request, urllib.error

BASE = "https://www.pikalytics.com/ai/pokedex"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "data", "meta")
RAW = os.path.join(ROOT, "data", "raw", "pikalytics")

FORMATS = ["battledataregmbs3", "championstournaments"]


def get(url, dest, force=False):
    if os.path.exists(dest) and os.path.getsize(dest) > 200 and not force:
        return open(dest, encoding="utf-8").read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                body = r.read().decode("utf-8", "replace")
            if "Format Not Found" in body or len(body) < 200:
                return None
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "w", encoding="utf-8") as f:
                f.write(body)
            time.sleep(0.25)
            return body
        except urllib.error.HTTPError as e:
            # Most Pokemon simply have no page in a given format; a 404 is an
            # answer, not a failure, and retrying it three times is what made
            # a full crawl take many minutes.
            if e.code in (404, 410):
                return None
            if attempt == 2:
                return None
            time.sleep(1.5 * (attempt + 1))
        except Exception:
            if attempt == 2:
                return None
            time.sleep(1.5 * (attempt + 1))


def bullet_percents(md, heading):
    """Parse a '## <heading>' block of '- **Name**: 12.3%' lines."""
    m = re.search(r"^##+\s*%s\s*$(.*?)(?=^##\s|\Z)" % re.escape(heading),
                  md, re.S | re.M)
    if not m:
        return []
    out = []
    for name, val in re.findall(r"^-\s*\*\*(.+?)\*\*:\s*([\d.]+|undefined)%",
                                m.group(1), re.M):
        out.append({"name": name.strip(),
                    "percent": None if val == "undefined" else float(val)})
    return out


def table_rows(md, heading):
    """Parse a markdown table under a '### <heading>' block."""
    m = re.search(r"^###+\s*%s\s*$(.*?)(?=^###?\s|\Z)" % re.escape(heading),
                  md, re.S | re.M)
    if not m:
        return []
    rows = []
    for line in m.group(1).splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3 or set(cells[0]) <= set("-: ") or cells[0] == "Rank":
            continue
        rows.append(cells)
    return rows


def parse_index(md, fmt):
    notes = []
    m = re.search(r"^##\s*Format Notes\s*$(.*?)(?=^##\s|\Z)", md, re.S | re.M)
    if m:
        notes = [re.sub(r"\s+", " ", x).strip()
                 for x in re.findall(r"^-\s*(.+)$", m.group(1), re.M)]

    def cores(h):
        out = []
        for cells in table_rows(md, h):
            if len(cells) >= 4:
                out.append({"rank": cells[0],
                            "core": [c.strip() for c in cells[1].split(",")],
                            "teams": cells[2], "usage": cells[3]})
        return out

    data_date = None
    md_date = re.search(r"\*\*Data Date\*\*\s*\|?\s*:?\s*([\d-]+)", md)
    if not md_date:
        md_date = re.search(r"Data Date\*\*:\s*([\d-]+)", md)
    if md_date:
        data_date = md_date.group(1)

    slugs = sorted(set(re.findall(
        r"/ai/pokedex/%s/([A-Za-z0-9%%\-]+)" % re.escape(fmt), md)))
    return {"notes": notes, "data_date": data_date,
            "cores_2": cores("2-Pokemon Cores"),
            "cores_3": cores("3-Pokemon Cores"),
            "slugs": slugs}


def parse_pokemon(md, name):
    def field(label):
        m = re.search(r"\|\s*\*\*%s\*\*\s*\|\s*([^|]+?)\s*\|" % re.escape(label), md)
        return m.group(1).strip() if m else None

    spread = nature = spread_share = None
    m = re.search(r"nature with an EV spread of\s*`([^`]+)`", md)
    if m:
        spread = m.group(1)
    m = re.search(r"features a \*\*(.*?)\*\* nature", md)
    if m and m.group(1).strip():
        nature = m.group(1).strip()
    m = re.search(r"accounts for ([\d.]+)% of competitive builds", md)
    if m:
        spread_share = float(m.group(1))

    teams = []
    for tm in re.finditer(
            r"^###\s*Team \d+ by (.+?)\s*$(.*?)(?=^###\s|\Z)", md, re.S | re.M):
        block = tm.group(2)
        rec = re.search(r"\*Record:\s*([^*]+)\*", block)
        mons = re.search(r"\*\*Pokemon\*\*:\s*(.+)", block)
        sm = re.search(r"\*\*Ability\*\*:\s*(.+)", block)
        it = re.search(r"\*\*Item\*\*:\s*(.+)", block)
        mv = re.search(r"\*\*Moves\*\*:\s*(.+)", block)
        teams.append({
            "author": tm.group(1).strip(),
            "record": rec.group(1).strip() if rec else None,
            "team": [x.strip() for x in mons.group(1).split(",")] if mons else [],
            "set": {
                "ability": sm.group(1).strip() if sm else None,
                "item": it.group(1).strip() if it else None,
                "moves": [x.strip() for x in mv.group(1).split(",")] if mv else [],
            },
        })

    weak = re.search(r"\*\*Weak To\*\*\s*\|\s*([^|]+)\|", md)
    resist = re.search(r"\*\*Resists\*\*\s*\|\s*([^|]+)\|", md)
    immune = re.search(r"\*\*Immune To\*\*\s*\|\s*([^|]+)\|", md)

    return {
        "name": name,
        "win_rate": field("Win Rate"),
        "record": field("Record"),
        "usage": field("Usage"),
        "moves": bullet_percents(md, "Common Moves"),
        "abilities": bullet_percents(md, "Common Abilities"),
        "items": bullet_percents(md, "Common Items"),
        "teammates": bullet_percents(md, "Common Teammates"),
        "top_spread": {"stat_points": spread, "nature": nature,
                       "share_percent": spread_share},
        "matchups": {
            "weak_to": weak.group(1).strip() if weak else None,
            "resists": resist.group(1).strip() if resist else None,
            "immune_to": immune.group(1).strip() if immune else None,
        },
        "featured_teams": teams,
    }


def run_format(fmt, force=False, names=None):
    print("Format %s" % fmt)
    idx_md = get("%s/%s" % (BASE, fmt), os.path.join(RAW, fmt, "_index.md"), force)
    if not idx_md:
        print("  index unavailable")
        return None
    idx = parse_index(idx_md, fmt)
    print("  data date %s | %d cores(2) | %d cores(3) | %d linked slugs"
          % (idx["data_date"], len(idx["cores_2"]), len(idx["cores_3"]),
             len(idx["slugs"])))

    # The index does not always link every Pokemon, so drive the crawl from the
    # dex we already built.
    if names is None:
        pk = os.path.join(ROOT, "data", "db", "pokemon.json")
        names = []
        if os.path.exists(pk):
            for p in json.load(open(pk, encoding="utf-8")):
                names.append(p["name"])
    slugs = []
    seen = set()
    for n in names:
        s = n.replace(" ", "-")
        if s.lower() not in seen:
            seen.add(s.lower())
            slugs.append((n, s))
    for s in idx["slugs"]:
        if s.lower() not in seen:
            seen.add(s.lower())
            slugs.append((s.replace("-", " "), s))

    rows, hits = [], 0
    for i, (name, slug) in enumerate(slugs, 1):
        url = "%s/%s/%s" % (BASE, fmt, urllib.parse.quote(slug))
        dest = os.path.join(RAW, fmt, re.sub(r"[^A-Za-z0-9_.-]", "_", slug) + ".md")
        md = get(url, dest, force)
        if not md or "Format Not Found" in md:
            continue
        row = parse_pokemon(md, name)
        if not (row["moves"] or row["items"] or row["win_rate"]):
            continue
        rows.append(row)
        hits += 1
        if i % 60 == 0:
            print("  %d/%d checked, %d with data" % (i, len(slugs), hits), flush=True)

    out = {
        "source": "pikalytics.com/ai/pokedex/%s" % fmt,
        "game": "Pokemon Champions",
        "format": fmt,
        "data_date": idx["data_date"],
        "caveat": "Pikalytics lags the live season; cross-check ladder usage "
                  "against data/meta/usage_pokemon.json (pokebase).",
        "fetched": time.strftime("%Y-%m-%d"),
        "format_notes": idx["notes"],
        "cores_2": idx["cores_2"],
        "cores_3": idx["cores_3"],
        "count": len(rows),
        "pokemon": rows,
    }
    os.makedirs(META, exist_ok=True)
    dest = os.path.join(META, "pikalytics_%s.json" % fmt)
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("  %d Pokemon with data -> %s" % (len(rows), os.path.relpath(dest, ROOT)))
    return out


def main():
    args = sys.argv[1:]
    force = "--force" in args
    fmts = [args[args.index("--format") + 1]] if "--format" in args else FORMATS
    for f in fmts:
        run_format(f, force)


if __name__ == "__main__":
    main()
