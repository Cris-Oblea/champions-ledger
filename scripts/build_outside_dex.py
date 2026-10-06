#!/usr/bin/env python3
"""The rest of the dex: what Champions does NOT have -> tracker/outsidedex.js

    python scripts/build_outside_dex.py
    python scripts/build_outside_dex.py --report    # counts only, write nothing

WHY THE WHOLE DEX AND NOT JUST THE PLAYABLE PART: the app should know every
Pokemon, every move and every ability. Champions rebalances a Pokemon WHEN IT
ADDS IT, so until then there is nothing of ours to contradict, and knowing
what Flutter Mane would bring is how you judge whether you want it. The "not
in Champions" tag is what says it cannot be played yet.

THREE THINGS SHIP HERE:

  ab   ABILITY TEXT for the abilities only species Champions lacks carry
       (Protosynthesis), which Champions has no entry for.

  mv   THE MOVE ROWS the app does not ship. A name with no base power would
       be a word rather than information - but OUR OWN DATABASE HAS THEM:
       data/db/moves.json holds 901 moves, of which 512 are useable and 389 are not,
       and 388 of the 389 carry a full Champions row - type, category, base
       power, accuracy and PP. They were never missing; they were simply not
       shipped, because the app only sends the playable ones to the phone.

       So these come from Champions' own data and not from upstream. Only the
       ability text below needs PokeAPI at all.

  m    the movepool per species, now COMPLETE rather than the intersection.

WHY THIS IS ITS OWN ASSET rather than 389 more rows in the dex. The dex is
rebuilt and re-downloaded every night; this is read when an outside sheet is
opened and never otherwise. It also keeps the unplayable moves OUT of `C.MOVES`,
which is what the build editor and the move pickers draw from - a set built out
of a move Champions has disabled would be an illegal set the app helped write.

THE ABILITY TEXT is the one part that is main-series, and the app says so. It
is never consulted for an ability Champions HAS: there, Champions' own row
wins, because the rebalance makes upstream wrong. Read at the same pinned
PokeAPI commit as the stats, from tables that are not executed - see
fetch_home_dex.py for why that pin exists and what it protects.
"""
import argparse
import collections
import json
import os
import re
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import dex
from audit_learnsets import CHAMPIONS_VG
from fetch_home_dex import key as hkey
from fetch_home_dex import resolver, table
from paths import DB, ROOT

OUT = os.path.join(ROOT, "tracker", "outsidedex.js")
ENGLISH = "9"
# PokeAPI's damage classes, and our three codes for them. Asserted below
# against move_damage_classes.csv rather than trusted, because a silent
# reordering upstream would turn every status move into a physical one.
CLASS = {"status": "T", "physical": "P", "special": "S"}


def clean(s: str | None) -> str:
    """One line, and no markup. PokeAPI's effect text carries its own wiki
    links - [Pound]{move:pound} - which are noise on a phone."""
    s = re.sub(r"\[([^\]]*)\]\{[^}]*\}", lambda m: m.group(1) or "", s or "")
    return " ".join(s.split())


def _upstream_names() -> tuple[dict[str, str | None], dict[str, str], dict[str, str]]:
    """(move id -> upstream's English name, ability id -> name, ability id ->
    its short effect). Upstream's move table is used for ONE thing: turning a
    learn row's move id into a name we can look up in ours. Every number
    comes from our row."""
    dmg = {r["id"]: r["identifier"] for r in table("move_damage_classes.csv")}
    unknown = sorted(set(dmg.values()) - set(CLASS))
    if unknown:
        sys.exit("move_damage_classes.csv has a class this script has no code "
                 "for: %s - add it to CLASS rather than guessing" % unknown)
    mname = {r["move_id"]: r["name"] for r in table("move_names.csv")
             if r["local_language_id"] == ENGLISH}
    aname = {r["ability_id"]: r["name"] for r in table("ability_names.csv")
             if r["local_language_id"] == ENGLISH}
    aprose = {r["ability_id"]: clean(r["short_effect"] or r["effect"])
              for r in table("ability_prose.csv")
              if r["local_language_id"] == ENGLISH}
    upstream_name = {r["id"]: mname.get(r["id"]) for r in table("moves.csv")}
    return upstream_name, aname, aprose


def _pool(move_ids: Iterable[str], upstream_name: dict[str, str | None],
          champ_by_key: dict[str, dex.Row], smogon: dict[str, Any], mv: dict[str, Any],
          nomatch: set[str]) -> list[str]:
    """One species' movepool in OUR spelling; a move Champions cannot use goes
    into `mv` with its numbers, an upstream move we have no row for into
    `nomatch`."""
    names = []
    for mid in sorted(move_ids, key=int):
        up = upstream_name.get(mid)
        row = champ_by_key.get(dex.slug(up)) if up else None
        if not row:
            # measured at zero: every move any of these species learns is
            # already in moves.json. Counted rather than assumed, so the
            # day one is not, the report says so instead of it vanishing.
            if up:
                nomatch.add(up)
            continue
        nm = row["name"]                       # OUR spelling, always
        names.append(nm)
        if not row.get("useable") and nm not in mv:
            mv[nm] = [row.get("type"), dex.CATEGORY.get(row.get("category") or "", "T"),
                      row.get("power"), row.get("accuracy"), row.get("pp"),
                      smogon.get(nm) or clean(row.get("effect") or "")]
    return names


def build() -> tuple[dict[str, Any], list[str], list[str]]:
    # --- what Champions already has; these are never overridden -----------
    # Keyed, because upstream writes "Will-O-Wisp" and "will-o-wisp" and our
    # row is the one whose spelling must win - it is the one the rest of the
    # app looks moves up by.
    """The payload for species Champions lacks: their movepools and the move
    rows the app does not ship, Champions' own row always winning over
    upstream's.
    """
    champ_by_key = {dex.slug(m["name"]): m for m in dex.db("moves")}
    # WHAT EACH ONE DOES, from CHAMPIONS' OWN DEX only: Smogon's full
    # text where its Champions dex has the move, else Serebii's
    # attackdex-champions line, which covers every one of them. Never an
    # older game's page, which can describe a different move.
    smogon = (dex.db("smogon_text") or {}).get("moves") or {}
    champ_abils = {dex.slug(a["name"]) for a in dex.db("abilities")}
    home = json.loads(Path(DB, "home_dex.json").read_text(encoding="utf-8"))
    upstream_name, aname, aprose = _upstream_names()

    # --- the abilities Champions has no row for ---------------------------
    ab = {n: aprose[aid] for aid, n in aname.items()
          if dex.slug(n) not in champ_abils and aprose.get(aid)}

    # --- movepools, complete, plus rows for what Champions lacks ----------
    # THE SAME RESOLVER THE STATS USE, and for the same reason: PokeAPI files
    # a species whose only rows are forms under those forms, so asking for the
    # bare name misses. `oinkologne` is `oinkologne-male`, `deoxys` is
    # `deoxys-normal`, `giratina` is Altered - and each of those had a spread
    # and an ability here while its movepool came back empty - half a sheet.
    # The movepool comes from the last game the species appeared in.
    #
    # The approximate half is taken here too, and it is right: Arceus' plates
    # and Silvally's memories share one movepool exactly as they share one
    # spread, and the sheet already says whose row it is showing.
    resolve = resolver(table("pokemon.csv"))
    by_pid = collections.defaultdict(lambda: collections.defaultdict(set))
    for r in table("pokemon_moves.csv"):
        by_pid[r["pokemon_id"]][r["version_group_id"]].add(r["move_id"])

    pools, mv, missing, nomatch = {}, {}, [], set()
    for name in sorted(home):
        pid = resolve(hkey(name))[0]
        groups = by_pid.get(pid) if pid else None
        if not groups:
            missing.append(name)
            continue
        g = (CHAMPIONS_VG if groups.get(CHAMPIONS_VG)
             else max(groups, key=int))
        names = _pool(groups[g], upstream_name, champ_by_key, smogon, mv, nomatch)
        if names:
            pools[name] = sorted(set(names))
        else:
            missing.append(name)
    return {"m": pools, "mv": mv, "ab": ab}, missing, sorted(nomatch)


def main() -> None:
    """Build and write the outside dex, and report what did not match."""
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n")[0])
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    blob, missing, nomatch = build()
    print("%d species with a movepool, %d moves in total"
          % (len(blob["m"]), sum(len(v) for v in blob["m"].values())))
    print("  %d move rows taken from moves.json because the app does not "
          "ship them" % len(blob["mv"]))
    if nomatch:
        print("  %d move names with NO row in moves.json at all: %s"
              % (len(nomatch), ", ".join(nomatch[:8])))
    print("  %d ability descriptions Champions has no entry for" % len(blob["ab"]))
    print("  %d species with nothing upstream at all (fan-made, or a spelling "
          "fetch_home_dex also could not place)" % len(missing))
    if a.report:
        return
    body = ("/* GENERATED by scripts/build_outside_dex.py - do not edit.\n"
            "   The rest of the dex: movepools, move rows and ability text for\n"
            "   what Pokemon Champions does NOT have, from PokeAPI at the\n"
            "   pinned commit. Never consulted for anything Champions HAS. */\n"
            "window.CHAMP_OUTSIDE = "
            + json.dumps(blob, ensure_ascii=False, separators=(",", ":"))
            + ";\n")
    Path(OUT).write_text(body, encoding="utf-8", newline="\n")
    print("wrote %s  (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
