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
import html
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import dex
import net
from paths import DB, META, RAW

RPC = "https://www.smogon.com/dex/_rpc/"
CACHE = os.path.join(RAW, "smogon")


def _post(method: str, params: dict[str, Any], timeout: float = 60) -> Any:
    """One Smogon RPC answer, decoded; raises net.ERRORS.

    `decode("utf-8", "replace")` looks safe and silently destroys data: Smogon
    has served cp1252 at least once, where the multiplication sign is a bare
    0xD7 - invalid UTF-8 - so every "1.3x damage" in the item and ability text
    became "1.3�". The numbers survived; the operator did not. So try the
    encoding it claims, then the one it has actually used, and only then give
    up a character."""
    raw = net.get(RPC + method, data=json.dumps(params).encode("utf-8"),
                  headers={"Content-Type": "application/json"}, timeout=timeout)
    for enc in ("utf-8", "cp1252"):
        try:
            return json.loads(raw.decode(enc))
        except (UnicodeDecodeError, ValueError):
            continue
    return json.loads(raw.decode("utf-8", "replace"))


def rpc(method: str, params: dict[str, Any]) -> Any:
    """Call Smogon's dex API, or None (printed) when it fails."""
    try:
        return _post(method, params, 60)
    except net.ERRORS as e:
        print("  RPC failed %s %s -> %s" % (method, params, e))
        return None


def strip_html(s: str | None) -> str:
    """Smogon prose is HTML; keep the words and the internal links' text."""
    if not s:
        return ""
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", s, flags=re.S)
    s = re.sub(r"</(p|li|ul|ol)>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n", s).strip()


# Where Serebii's spelling is a different word, not just different punctuation:
# it writes Compoundeyes as one, Smogon's page is compound-eyes.
DEX_ALIAS = {"Compoundeyes": "compound-eyes"}


def dex_alias(name: str) -> str:
    """Smogon's URL spelling: "King's Rock" -> kings-rock, "U-turn" -> u-turn."""
    return DEX_ALIAS.get(name) or dex.slug(name)


def ask_dex(kind: str, alias: str) -> Any:
    """One entry from Champions' own dex: its text, None when the dex has no
    such entry, and the string "failed" when the question never got an answer
    - the two must not look alike, or a network blip would be cached as "not
    in Champions" for good."""
    try:
        d = _post("dump-" + kind, {"alias": alias, "gen": "champions"})
    except json.JSONDecodeError:
        return None           # it answered, and the answer is no entry
    except net.ERRORS:
        return "failed"
    return (d or {}).get("description") or None


# What is asked for, per kind: the RPC, the cache folder and the list of names.
DEX_KINDS = (
    ("moves", "move", "moves.json"),
    ("abilities", "ability", "abilities.json"),
    ("items", "item", "items.json"),
)


def dex_texts(force: bool = False) -> None:
    """Smogon's FULL description of every move, ability and item - the text
    its dex page prints.

    WHY: the other sources NAME a mechanic ("Octolock: can't escape"); Smogon
    DEFINES it, with its numbers, for moves, abilities and items alike.

    dump-basics carries only the one-line shortDesc ("Traps target, lowers
    Def and SpD by 1 each turn."). The page itself asks dump-move,
    dump-ability and dump-item, which answer with the whole mechanic: what it
    does, how much, how long, what ends it and what does not trigger it.

    CHAMPIONS' OWN DEX AND NO OTHER. Serebii and Smogon both keep one page per
    entry PER GAME,
    and one reads differently from the next - Freeze-Dry freezes in
    Scarlet/Violet and does not in Champions. Something the Champions dex does
    not describe gets no text here, never an older game's.

    One request per entry, cached per entry INCLUDING "not in Champions", so a
    nightly run only asks about what it has never seen; the Monday --deep run
    asks everything again, which is what keeps it current."""
    out, asked, failed = {}, 0, []
    for bucket, rpc_kind, source in DEX_KINDS:
        cache_dir = os.path.join(CACHE, bucket)
        os.makedirs(cache_dir, exist_ok=True)
        rows = json.loads(Path(DB, source).read_text(encoding="utf-8"))
        rows = rows if isinstance(rows, list) else list(rows.values())
        got_all = {}
        for r in rows:
            alias = dex_alias(r["name"])
            path = os.path.join(cache_dir, alias + ".json")
            got = None
            if os.path.exists(path) and not force:
                got = json.loads(Path(path).read_text(encoding="utf-8"))
                if got.get("gen") != "champions":
                    got = None                  # another game's: ask again
            if got is None:
                t = ask_dex(rpc_kind, alias)
                asked += 1
                time.sleep(0.15)
                if t == "failed":
                    failed.append(r["name"])
                    continue
                got = {"gen": "champions", "text": t}
                Path(path).write_text(
                    json.dumps(got, ensure_ascii=False), encoding="utf-8")
            if got.get("text"):
                got_all[r["name"]] = got["text"]
        out[bucket] = got_all
        print("  %-9s %d described by Champions' dex, of %d"
              % (bucket, len(got_all), len(rows)))
    blob = dict({
        "source": "smogon.com/dex/champions (dump-move, dump-ability, dump-item)",
        "fetched": time.strftime("%Y-%m-%d"),
        "note": "Champions' own dex only. An entry it does not describe is "
                "absent, never filled from another game.",
    }, **out)
    path = Path(DB, "smogon_text.json")
    blob["fetched"] = dex.kept_stamp(path, blob)
    path.write_text(json.dumps(blob, ensure_ascii=False, indent=1, sort_keys=True),
                    encoding="utf-8")
    print("  %d requests" % asked)
    if failed:
        print("  !! %d requests failed and will be asked again: %s"
              % (len(failed), ", ".join(failed[:10])))
    moves = json.loads(Path(DB, "moves.json").read_text(encoding="utf-8"))
    missing = [m["name"] for m in moves
               if m.get("useable") and m["name"] not in out["moves"]]
    if missing:
        print("  !! %d Champions moves with no description: %s"
              % (len(missing), ", ".join(missing[:10])))


def is_vgc(fmt: str | None) -> bool:
    """Is this a VGC format? Singles analyses are kept out."""
    return bool(fmt) and fmt.strip().upper().startswith("VGC")


def parse_moveset(ms: dict[str, Any]) -> dict[str, Any]:
    """One Smogon set reduced to the fields kept: moves per slot, items,
    abilities, natures, SP and the explanation.
    """
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


def _basics(force: bool) -> Any:
    """Smogon's Champions dex basics, from the cache unless --force."""
    basics_path = os.path.join(CACHE, "basics.json")
    if os.path.exists(basics_path) and not force:
        return json.loads(Path(basics_path).read_text(encoding="utf-8"))
    print("Fetching dump-basics ...")
    basics = rpc("dump-basics", {"gen": "champions"})
    if not basics:
        sys.exit("could not load Smogon basics")
    Path(basics_path).write_text(
        json.dumps(basics, ensure_ascii=False, indent=1), encoding="utf-8")
    return basics


def _write_basics(basics: dict[str, Any]) -> None:
    """Write smogon_basics.json: move flags, natures, types, items, abilities
    and moves as Champions' dex has them.
    """
    blob = {
        "source": "smogon.com/dex/champions",
        "fetched": time.strftime("%Y-%m-%d"),
        "moveflags": basics.get("moveflags") or [],
        "natures": basics.get("natures") or [],
        "types": basics.get("types") or [],
        "items": basics.get("items") or [],
        "abilities": basics.get("abilities") or [],
        "moves": basics.get("moves") or [],
    }
    path = Path(DB, "smogon_basics.json")
    blob["fetched"] = dex.kept_stamp(path, blob)
    path.write_text(json.dumps(blob, ensure_ascii=False, indent=1), encoding="utf-8")


def _pokemon_dump(alias: str, force: bool) -> Any:
    """One Pokemon's dump, cached; None when Smogon did not answer."""
    cache = os.path.join(CACHE, alias + ".json")
    if os.path.exists(cache) and not force:
        return json.loads(Path(cache).read_text(encoding="utf-8"))
    data = rpc("dump-pokemon", {"alias": alias, "gen": "champions", "language": "en"})
    if data is not None:
        Path(cache).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        time.sleep(0.15)
    return data


def _credits(st: dict[str, Any]) -> list[str | None]:
    """The usernames credited for an analysis."""
    if not st.get("credits"):
        return []
    members = ((st.get("credits") or {}).get("teams") or [{}])[0].get("members", [])
    return [c.get("username") for c in members if isinstance(c, dict)]


def _vgc_strategies(data: dict[str, Any]) -> list[dict[str, Any]]:
    """The VGC analyses in a dump that say anything; singles are dropped."""
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
            "credits": _credits(st),
        })
    return strategies


def main() -> None:
    """Fetch Champions' dex basics and texts, then each Pokemon's dump, and
    write every VGC analysis to smogon_analyses.json.
    """
    force = "--force" in sys.argv
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(META, exist_ok=True)
    os.makedirs(DB, exist_ok=True)

    basics = _basics(force)
    mons = basics.get("pokemon") or []
    print("  %d Pokemon, %d moves, %d items, %d abilities"
          % (len(mons), len(basics.get("moves") or []),
             len(basics.get("items") or []), len(basics.get("abilities") or [])))
    _write_basics(basics)

    print("Fetching every move, ability and item's full description ...")
    dex_texts(force)

    print("Fetching per-Pokemon analyses (VGC formats only) ...")
    out, with_analysis = [], 0
    for i, mon in enumerate(mons, 1):
        alias = mon.get("alias") or re.sub(r"[^a-z0-9-]", "",
                                           (mon.get("name") or "").lower().replace(" ", "-"))
        data = _pokemon_dump(alias, force)
        if data is None:
            continue
        strategies = _vgc_strategies(data)
        with_analysis += bool(strategies)
        out.append({
            "name": mon.get("name"),
            "alias": alias,
            "types": mon.get("types") or [],
            "base_stats": {k: mon.get(k) for k in dex.STAT_KEYS
                           if k in mon},
            "learnset": data.get("learnset") or [],
            "vgc_strategies": strategies,
        })
        if i % 50 == 0:
            print("  %d/%d (%d with VGC analysis)" % (i, len(mons), with_analysis),
                  flush=True)

    blob = {
        "source": "smogon.com/dex/champions",
        "game": "Pokemon Champions",
        "note": "VGC formats only (doubles, bring 6 pick 4). Singles dropped.",
        "fetched": time.strftime("%Y-%m-%d"),
        "count": len(out),
        "with_vgc_analysis": with_analysis,
        "pokemon": out,
    }
    path = Path(META, "smogon_analyses.json")
    blob["fetched"] = dex.kept_stamp(path, blob)
    path.write_text(json.dumps(blob, ensure_ascii=False, indent=1), encoding="utf-8")
    print("  %d Pokemon, %d with a written VGC analysis" % (len(out), with_analysis))


if __name__ == "__main__":
    main()
