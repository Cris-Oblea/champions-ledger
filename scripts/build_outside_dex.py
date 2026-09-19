#!/usr/bin/env python3
"""The rest of the dex: what Champions does NOT have -> tracker/outsidedex.js

    python scripts/build_outside_dex.py
    python scripts/build_outside_dex.py --report    # counts only, write nothing

WHY THE WHOLE DEX AND NOT JUST THE PLAYABLE PART (player, 2026-09-19):

    "La idea es tener la DEX COMPLETA, la unica dex diferente es la de champions
     y no es diferente por numero ni nada, solamente es diferente por tener
     pokemones habilitados y otros no. pero necesito tener la database de todas
     las abilities, todos los moves, todos los pokemones. asi cuando se consulta
     por algo se sabe todo y el tag not in champions indica si es posible usarlo
     o no. ademas el balanceo de champions recien se ve cuando habilitan a esos
     pokemones que faltan en regulaciones nuevas."

That last sentence is the argument, and it is right: Champions rebalances a
Pokemon WHEN IT ADDS IT. Until then there is nothing of ours to contradict, and
knowing what Flutter Mane would bring is exactly how you judge whether you want
it. The "not in Champions" tag is what says it cannot be played yet.

THREE THINGS SHIP HERE, and each fills a hole the app had:

  ab   ABILITY TEXT for the 95 abilities carried by species Champions lacks.
       Protosynthesis had a name and no description - the sheet listed it and
       could say nothing about it.

  mv   THE MOVE ROWS the app does not ship. build_home_moves.py dropped 6,385
       of these on the reasoning that a name with no base power is a word
       rather than information - Flutter Mane lost six that way. The reasoning
       was right and the conclusion was wrong, because checking found something
       better than a workaround: OUR OWN DATABASE ALREADY HAS THEM. data/db/
       moves.json holds 901 moves, of which 512 are useable and 389 are not,
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
import csv
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q                                             # noqa: E402
from audit_learnsets import CHAMPIONS_VG                      # noqa: E402
from fetch_home_dex import key as hkey, table                 # noqa: E402

OUT = os.path.join(ROOT, "tracker", "outsidedex.js")
ENGLISH = "9"
# PokeAPI's damage classes, and our three codes for them. Asserted below
# against move_damage_classes.csv rather than trusted, because a silent
# reordering upstream would turn every status move into a physical one.
CLASS = {"status": "T", "physical": "P", "special": "S"}
# ...and OUR spelling of the same three, which is what moves.json writes.
CAT = {"Physical": "P", "Special": "S", "Status": "T"}


def key(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def clean(s):
    """One line, and no markup. PokeAPI's effect text carries its own wiki
    links - [Pound]{move:pound} - which are noise on a phone."""
    s = re.sub(r"\[([^\]]*)\]\{[^}]*\}", lambda m: m.group(1) or "", s or "")
    return " ".join(s.split())


def build():
    # --- what Champions already has; these are never overridden -----------
    # Keyed, because upstream writes "Will-O-Wisp" and "will-o-wisp" and our
    # row is the one whose spelling must win - it is the one the rest of the
    # app looks moves up by.
    champ_by_key = {key(m["name"]): m for m in Q.db("moves")}
    champ_abils = {key(a["name"]) for a in Q.db("abilities")}
    home = json.load(io.open(os.path.join(ROOT, "data", "db", "home_dex.json"),
                             encoding="utf-8"))

    # --- the upstream tables ----------------------------------------------
    types = {r["id"]: r["identifier"].capitalize() for r in table("types.csv")}
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
    # Upstream's move table is used for ONE thing: turning a learn row's move
    # id into a name we can look up in ours. Every number comes from our row.
    upstream_name = {r["id"]: mname.get(r["id"]) for r in table("moves.csv")}

    # --- the abilities Champions has no row for ---------------------------
    ab = {}
    for aid, n in aname.items():
        if key(n) in champ_abils:
            continue
        txt = aprose.get(aid)
        if txt:
            ab[n] = txt

    # --- movepools, complete, plus rows for what Champions lacks ----------
    pk = {}
    for r in table("pokemon.csv"):
        pk.setdefault(r["identifier"], r["id"])
    by_pid = collections.defaultdict(lambda: collections.defaultdict(set))
    for r in table("pokemon_moves.csv"):
        by_pid[r["pokemon_id"]][r["version_group_id"]].add(r["move_id"])

    pools, mv, missing, nomatch = {}, {}, [], set()
    for name in sorted(home):
        pid = pk.get(hkey(name))
        groups = by_pid.get(pid) if pid else None
        if not groups:
            missing.append(name)
            continue
        g = (CHAMPIONS_VG if groups.get(CHAMPIONS_VG)
             else max(groups, key=lambda k: int(k)))
        names = []
        for mid in sorted(groups[g], key=lambda x: int(x)):
            up = upstream_name.get(mid)
            row = champ_by_key.get(key(up)) if up else None
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
                mv[nm] = [row.get("type"), CAT.get(row.get("category"), "T"),
                          row.get("power"), row.get("accuracy"), row.get("pp")]
        if names:
            pools[name] = sorted(set(names))
        else:
            missing.append(name)
    return {"m": pools, "mv": mv, "ab": ab}, missing, sorted(nomatch)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
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
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(body)
    print("wrote %s  (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
