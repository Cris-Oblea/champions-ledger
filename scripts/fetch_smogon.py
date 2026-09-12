"""Fetch Smogon's written VGC analyses for Pokemon Champions.

Smogon is the only source here with reasoning rather than numbers: why these
stat points, why this move over that one, what else the slot can run. Coverage
is incomplete - many Pokemon have no analysis yet - so this fills in on top of
the usage data rather than replacing it.

VGC is doubles by definition (bring 6, pick 4), so only formats named "VGC*"
are kept. Singles ladders (OU, Battle Stadium Singles) never reach official
tournaments and are dropped.

Smogon serves the dex through a JSON-RPC endpoint:
    POST /dex/_rpc/dump-basics   {"gen":"champions"}
    POST /dex/_rpc/dump-pokemon  {"alias":..., "gen":"champions", "language":"en"}

Outputs:
    data/meta/smogon_analyses.json   per-Pokemon VGC sets + prose
    data/db/smogon_basics.json       Smogon's own move/item/ability/flag tables

Usage:
    python scripts/fetch_smogon.py
    python scripts/fetch_smogon.py --force
"""
import os, re, sys, json, time, html, urllib.request

RPC = "https://www.smogon.com/dex/_rpc/"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "data", "meta")
DB = os.path.join(ROOT, "data", "db")
RAW = os.path.join(ROOT, "data", "raw", "smogon")


def rpc(method, params, timeout=60):
    body = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(
        RPC + method, data=body,
        headers={"User-Agent": UA, "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:
            if attempt == 2:
                print("  RPC failed %s %s -> %s" % (method, params, e))
                return None
            time.sleep(1.5 * (attempt + 1))


def strip_html(s):
    """Smogon prose is HTML; keep the words and the internal links' text."""
    if not s:
        return ""
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", s, flags=re.S)
    s = re.sub(r"</(p|li|ul|ol)>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n", s).strip()


def is_vgc(fmt):
    return bool(fmt) and fmt.strip().upper().startswith("VGC")


def parse_moveset(ms):
    slots = []
    for slot in ms.get("moveslots") or []:
        opts = [m.get("move") for m in slot if isinstance(m, dict) and m.get("move")]
        if opts:
            slots.append(opts)
    return {
        "name": ms.get("name"),
        "pokemon": ms.get("pokemon"),
        "abilities": ms.get("abilities") or [],
        "items": ms.get("items") or [],
        "natures": ms.get("natures") or [],
        # Champions uses Stat Points, not the 252-EV system; Smogon stores them
        # in the same field, so the small numbers here are SP spreads.
        "stat_points": ms.get("evconfigs") or [],
        "moveslots": slots,
        "explanation": strip_html(ms.get("description")),
    }


def main():
    force = "--force" in sys.argv
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(META, exist_ok=True)
    os.makedirs(DB, exist_ok=True)

    basics_path = os.path.join(RAW, "basics.json")
    if os.path.exists(basics_path) and not force:
        basics = json.load(open(basics_path, encoding="utf-8"))
    else:
        print("Fetching dump-basics ...")
        basics = rpc("dump-basics", {"gen": "champions"})
        if not basics:
            sys.exit("could not load Smogon basics")
        json.dump(basics, open(basics_path, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)

    mons = basics.get("pokemon") or []
    print("  %d Pokemon, %d moves, %d items, %d abilities"
          % (len(mons), len(basics.get("moves") or []),
             len(basics.get("items") or []), len(basics.get("abilities") or [])))

    json.dump({
        "source": "smogon.com/dex/champions",
        "fetched": time.strftime("%Y-%m-%d"),
        "moveflags": basics.get("moveflags") or [],
        "natures": basics.get("natures") or [],
        "types": basics.get("types") or [],
        "items": basics.get("items") or [],
        "abilities": basics.get("abilities") or [],
        "moves": basics.get("moves") or [],
    }, open(os.path.join(DB, "smogon_basics.json"), "w", encoding="utf-8"),
        ensure_ascii=False, indent=1)

    print("Fetching per-Pokemon analyses (VGC formats only) ...")
    out, with_analysis = [], 0
    for i, mon in enumerate(mons, 1):
        alias = mon.get("alias") or re.sub(r"[^a-z0-9-]", "",
                                           (mon.get("name") or "").lower().replace(" ", "-"))
        cache = os.path.join(RAW, alias + ".json")
        if os.path.exists(cache) and not force:
            data = json.load(open(cache, encoding="utf-8"))
        else:
            data = rpc("dump-pokemon",
                       {"alias": alias, "gen": "champions", "language": "en"})
            if data is None:
                continue
            json.dump(data, open(cache, "w", encoding="utf-8"), ensure_ascii=False)
            time.sleep(0.15)

        strategies = []
        for st in data.get("strategies") or []:
            if not is_vgc(st.get("format")):
                continue
            movesets = [parse_moveset(m) for m in st.get("movesets") or []]
            if not (movesets or st.get("overview") or st.get("comments")):
                continue
            strategies.append({
                "format": st.get("format"),
                "outdated": st.get("outdated"),
                "overview": strip_html(st.get("overview")),
                "comments": strip_html(st.get("comments")),
                "movesets": movesets,
                "credits": [c.get("username") for c in
                            ((st.get("credits") or {}).get("teams") or [{}])[0].get("members", [])
                            if isinstance(c, dict)] if st.get("credits") else [],
            })
        if strategies:
            with_analysis += 1
        out.append({
            "name": mon.get("name"),
            "alias": alias,
            "types": mon.get("types") or [],
            "base_stats": {k: mon.get(k) for k in
                           ("hp", "atk", "def", "spa", "spd", "spe") if k in mon},
            "learnset": data.get("learnset") or [],
            "vgc_strategies": strategies,
        })
        if i % 50 == 0:
            print("  %d/%d (%d with VGC analysis)" % (i, len(mons), with_analysis),
                  flush=True)

    json.dump({
        "source": "smogon.com/dex/champions",
        "game": "Pokemon Champions",
        "note": "VGC formats only (doubles, bring 6 pick 4). Singles dropped.",
        "fetched": time.strftime("%Y-%m-%d"),
        "count": len(out),
        "with_vgc_analysis": with_analysis,
        "pokemon": out,
    }, open(os.path.join(META, "smogon_analyses.json"), "w", encoding="utf-8"),
        ensure_ascii=False, indent=1)
    print("  %d Pokemon, %d with a written VGC analysis" % (len(out), with_analysis))


if __name__ == "__main__":
    main()
