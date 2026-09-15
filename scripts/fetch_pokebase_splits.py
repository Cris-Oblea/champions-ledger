#!/usr/bin/env python3
"""What each Pokemon actually runs, per Pokemon, from pokebase's own pages.

    python scripts/fetch_pokebase_splits.py            # every Pokemon with usage
    python scripts/fetch_pokebase_splits.py --limit 5  # a sample, for checking
    python scripts/fetch_pokebase_splits.py --force    # ignore what is stored

The global tables answer "how much is Sucker Punch used" across the whole
ladder. This answers the question a build actually asks: of the people running
KINGAMBIT, what do THEY run - which moves, which item, which ability, which
nature, which SP spread, and beside whom.

THE PAGE HAS TWO OF THESE, AND THEY ARE NOT THE SAME NUMBERS. Caught by the
player 2026-09-15 ("mira abilities, natures, items, common teammates, moves.
TIENE PAGES!"), and looking for the pages turned up the bigger problem:

  TOURNAMENT STATS - tournament teamlists for ONE regulation, stamped with it
      on the page ("M-C"). Present for every Pokemon that has been brought to
      an event. Kingambit: Defiant 98.6%.
  SEASON STATS     - the ladder, per season (M-1 .. M-5), split into doubles
      and singles. Only present for a Pokemon that was ranked that season -
      Rillaboom's page has no season block at all. Kingambit: Defiant 94%.

The old parser walked the rendered HTML looking for a heading called "Moves"
and kept the longest run of percentages it found, so it took whichever block
happened to be longer. The result was a file that mixed the two: Kingambit's
moves summed to 370 (four slots per set, so a share OF SETS) while Rillaboom's
summed to 94 (a share of move SLOTS). The same column, two meanings, decided
by which Pokemon you looked up. Both are now captured, separately and whole.

THE PAGES ARE REAL PAGES, AND NONE OF THEM IS A URL. The section paginates
client-side out of props the server already sent, so `?page=N` does not exist
and page 1 is all the rendered HTML ever contains. Everything is in the Next.js
flight payload - `self.__next_f.push([1,"..."])` - which is where this reads
from now. Rillaboom: 26 spreads (6 pages), 19 items (4), 19 moves (4), 9
natures (2), 10 teammates (2). The old parser saw five of each.

TEAMMATES CARRY A PERCENTAGE NOW. They used to be stored as a bare ranked list
because the rendered HTML gives an order and no number; the payload gives
"Sneasler 53.9%", which is the number that makes the section useful for
building a team rather than merely suggestive.

WHY POKEBASE AND NOT PIKALYTICS. Pikalytics has the same shape of data and is
stamped 2026-05 with its ladder code still on season 3 - the player's call
(2026-09-15): one month to update or it stops being a source. pokebase is the
live M-C data, which is the format being played.

THE RAW HTML IS NOT CACHED, and that is deliberate. Each page is 1.3 MB of
Next.js markup and there are 321 of them: 427 MB, more than twice the entire
existing raw cache, to keep bytes that are re-derivable and that nothing else
reads. Only the extract is stored, which is a few hundred KB.

IT RUNS WEEKLY, not nightly, for the same reason the Smogon analyses do: six
minutes and 427 MB of someone else's bandwidth for numbers that drift slowly.
refresh.py --deep pulls it.
"""
import argparse, io, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "data", "meta")
OUT = os.path.join(META, "usage_splits.json")
BASE = "https://pokebase.app/pokemon-champions/pokemon/"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")

# pokebase's stat keys, and what this project calls them
SP_KEYS = [("hp", "hp"), ("attack", "atk"), ("defense", "def"),
           ("specialAttack", "spa"), ("specialDefense", "spd"),
           ("speed", "spe")]
# How a nature's two stats are written everywhere else in this repo. pokebase
# spells them out in camelCase, which is not what natures.json or the app say.
STAT_WORD = {"hp": "HP", "attack": "Atk", "defense": "Def",
             "specialAttack": "SpA", "specialDefense": "SpD", "speed": "Spe"}


# --------------------------------------------------------------- the payload

def flight(html):
    """The Next.js flight stream, unescaped and joined.

    Every `self.__next_f.push([1,"..."])` carries one chunk of a single JSON
    string. Concatenated, they hold the props of every component on the page -
    which is where the sections that paginate keep their rows.
    """
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html,
                        flags=re.S)
    out = []
    for c in chunks:
        try:
            out.append(json.loads('"' + c + '"'))
        except ValueError:
            pass
    return "".join(out)


def _span(s, i, open_c, close_c):
    """The balanced JSON value starting at s[i], honouring strings."""
    depth, k, in_str, esc = 0, i, False, False
    while k < len(s):
        c = s[k]
        if esc:
            esc = False
        elif c == "\\":
            esc = True
        elif c == '"':
            in_str = not in_str
        elif not in_str:
            if c == open_c:
                depth += 1
            elif c == close_c:
                depth -= 1
                if depth == 0:
                    return s[i:k + 1]
        k += 1
    return None


def _json_after(flow, key):
    """Every array that follows a given key, parsed."""
    out = []
    for m in re.finditer(r'"%s":\s*(?=\[)' % re.escape(key), flow):
        raw = _span(flow, m.end(), "[", "]")
        if not raw:
            continue
        try:
            out.append(json.loads(raw))
        except ValueError:
            pass
    return out


def _rows(rows, extra=None):
    """A section, trimmed to what the app reads.

    `percent` is allowed to be missing, and only one section ever is: the
    LADDER's teammates are a ranked list with no number behind it. The
    tournament block measures the same thing ("Sneasler 53.9%"), so the two
    must not be shown as if they said the same thing.
    """
    out = []
    for r in rows or []:
        row = {"name": r["name"], "percent": r.get("percent")}
        if row["percent"] is None:
            del row["percent"]
        if extra:
            extra(r, row)
        out.append(row)
    return out


def _spreads(rows, field):
    out = []
    for r in rows or []:
        vals = r.get(field) or {}
        sp = {short: vals[long_] for long_, short in SP_KEYS if vals.get(long_)}
        if sp:
            out.append({"sp": sp, "percent": r["percent"]})
    return out


# ----------------------------------------------------------- tournament side

def _kind(rows):
    """Which section a table of rows is, read off its own columns.

    Order of appearance would be shorter, and is exactly the assumption that
    produced the mixed file this replaces, so each table names itself: a
    spread carries `values`, a nature carries the stat it raises, a move
    carries its type, a teammate carries how many teams it appeared on.
    """
    if not rows or not isinstance(rows[0], dict):
        return None
    f = rows[0]
    if "percent" not in f:
        return None
    if "values" in f:
        return "spreads"
    if "incStat" in f:
        return "natures"
    if "moveTypeName" in f:
        return "moves"
    if "count" in f:
        return "teammates"
    if "iconUrl" in f:
        return "items"
    return None


def tournament(flow, html):
    """The regulation's tournament block, every page of it."""
    got = {}
    for rows in _json_after(flow, "rows"):
        k = _kind(rows)
        if k and k not in got:
            got[k] = rows

    def nature_effect(src, row):
        if src.get("incStat"):
            row["effect"] = "+%s / -%s" % (
                STAT_WORD.get(src["incStat"], src["incStat"]),
                STAT_WORD.get(src.get("decStat"), src.get("decStat")))

    out = {
        "moves": _rows(got.get("moves")),
        "items": _rows(got.get("items")),
        "natures": _rows(got.get("natures"), nature_effect),
        "teammates": _rows(got.get("teammates")),
        "spreads": _spreads(got.get("spreads"), "values"),
        "abilities": block_abilities(html, "Tournament Stats"),
    }
    reg = re.search(r"\?regulation=([a-z0-9-]+)#usage", flow)
    out["regulation"] = reg.group(1).upper() if reg else None
    return out


def block_abilities(html, under):
    """Abilities, from the rendered HTML.

    They are the one section with no paginator - a species has at most three -
    so the server renders them straight into the markup instead of handing
    rows to a client component, and there is nothing in the payload to read.
    The block is anchored to its parent heading because the two blocks
    disagree (Kingambit is Defiant 98.6% in the tournament data and 94% on the
    ladder) and an unanchored search would take whichever came first.
    """
    top = html.find(">%s<" % under)
    if top < 0:
        top = html.find(under)
    if top < 0:
        return []
    m = re.compile(r"<h3[^>]*>\s*Abilities\s*</h3>").search(html, top)
    if not m:
        return []
    chunk = re.split(r"<h[23][^>]*>", html[m.end():m.end() + 4000])[0]
    toks = [x.strip() for x in
            re.sub(r"\|+", "|", re.sub(r"<[^>]+>", "|", chunk)).split("|")]
    toks = [x for x in toks if x]
    out = []
    for i in range(len(toks) - 2):
        if re.fullmatch(r"\d+(?:\.\d+)?", toks[i + 1]) and toks[i + 2] == "%":
            out.append({"name": toks[i], "percent": float(toks[i + 1])})
    return out


# --------------------------------------------------------------- ladder side

def season(flow):
    """The newest DOUBLES ladder season, or None when the page has no block.

    Singles is dropped here for the same reason fetch_smogon.py drops it: it
    never reaches an official tournament, and the player enters VGC. Both
    formats are published under the same seasonId, so the filter has to be on
    the row rather than on the page.
    """
    seasons = {}
    for arr in _json_after(flow, "seasons"):
        for s in arr:
            if isinstance(s, dict) and s.get("id"):
                seasons[s["id"]] = s
    best, best_n = None, -1
    for m in re.finditer(r'"seasonId"', flow):
        raw = _span(flow, flow.rfind("{", 0, m.start()), "{", "}")
        if not raw:
            continue
        try:
            o = json.loads(raw)
        except ValueError:
            continue
        if o.get("format") != "doubles":
            continue
        n = (seasons.get(o.get("seasonId")) or {}).get("season") or 0
        if n > best_n:
            best, best_n = o, n
    if not best:
        return None
    meta = seasons.get(best.get("seasonId")) or {}
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


def parse(html):
    flow = flight(html)
    got = {"tournament": tournament(flow, html)}
    ladder = season(flow)
    if ladder:
        got["season"] = ladder
    return got


def fetch(slug, timeout=60):
    req = urllib.request.Request(BASE + slug, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if attempt == 2:
                print("  FAILED %s -> %s" % (slug, e))
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    usage = json.load(io.open(os.path.join(META, "usage_pokemon.json"),
                              encoding="utf-8"))
    rows = usage.get("rows") or []
    if a.limit:
        rows = rows[:a.limit]

    have = {}
    if os.path.exists(OUT) and not a.force:
        try:
            have = (json.load(io.open(OUT, encoding="utf-8"))
                    .get("pokemon") or {})
        except (OSError, ValueError):
            have = {}

    out, n, empty = dict(have), 0, []
    for r in rows:
        slug, name = r.get("slug"), r.get("name")
        if not slug or not name:
            continue
        if name in out and not a.force:
            continue
        html = fetch(slug)
        if not html:
            continue
        got = parse(html)
        t = got.get("tournament") or {}
        if any(t.get(k) for k in ("moves", "items", "natures", "spreads")):
            out[name] = got
        else:
            empty.append(name)
        n += 1
        if n % 25 == 0:
            print("  %d fetched" % n, flush=True)
        time.sleep(0.25)

    regs = sorted({(v.get("tournament") or {}).get("regulation")
                   for v in out.values()} - {None})
    blob = {"source": "pokebase.app per-Pokemon pages",
            "note": ("What each Pokemon's own players run. TWO datasets, kept "
                     "apart because their percentages are not the same "
                     "measure: `tournament` is teamlists for one regulation "
                     "and exists for every Pokemon; `season` is the ladder "
                     "and only exists for a Pokemon ranked that season. Read "
                     "from the Next.js payload, which carries every page of "
                     "every section - the rendered HTML only ever holds page "
                     "1."),
            "regulations": regs,
            "fetched": time.strftime("%Y-%m-%d"),
            "count": len(out), "pokemon": out}
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(blob, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print("wrote %s  (%d Pokemon, %d new, regulation %s)"
          % (OUT, len(out), n, ", ".join(regs) or "?"))
    if empty:
        print("  no usage block: %s" % ", ".join(empty[:12]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
