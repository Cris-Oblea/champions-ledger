#!/usr/bin/env python3
"""Bugs of the shape the player kept finding, hunted across the whole project.

    python scripts/audit_lookups.py

Three landed in one day, and none of them was visible by reading the screen:

  * `STAT_LABEL` was declared twice in the page - the second declaration won at
    runtime, so every caller asking for it by name got `undefined`.
  * `learnset()` resolved the SPECIES before the FORM, so 25 regional forms
    were handed their base form's movepool and four resolved to nothing.
  * `megasFor()` had the same fault one table over, offering Raichu-Alola the
    two Mega Raichu and Slowbro-Galar the Mega Slowbro.

They are one kind of fault: **a lookup that silently returns the wrong thing
instead of failing.** `tests/consistencytest.js` sweeps the page for it; this
does the same for the Python side, which is the half that answers questions in
the terminal and builds every file the page reads.

It found one here too: `species_norm` stripped the Mega suffixes x and y but
not **z**, so Regulation M-C's three Z Megas matched no base species and
`query.py pokemon "Mega Garchomp Z"` listed no moves at all.
"""
import ast
import collections
import glob
import json
import os
import sys
from pathlib import Path

import damage as Dm
import dex
from paths import DB, ROOT

bad = 0


def ok(label, got, want="0"):
    """Print one check as OK / FAIL and count the failures in `bad`."""
    global bad
    good = str(got) == str(want)
    if not good:
        bad += 1
    print("  %s  %-52s %s%s" % ("OK  " if good else "FAIL", label, got,
                                "" if good else "   (want %s)" % want))


def lst(xs, n=6):
    xs = list(xs)
    return (", ".join(map(str, xs[:n])) +
            (" (+%d)" % (len(xs) - n) if len(xs) > n else "")) if xs else "0"


def _check_code():
    """No script defines the same top-level name twice (the second silently
    wins), and every script parses."""
    print("\n  the code")
    dups = []
    for f in sorted(glob.glob(os.path.join(ROOT, "scripts", "*.py"))):
        try:
            tree = ast.parse(Path(f).read_text(encoding="utf-8"))
        except SyntaxError as e:
            dups.append("%s does not parse: %s" % (os.path.basename(f), e))
            continue
        seen = collections.Counter()
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                                 ast.ClassDef)):
                seen[node.name] += 1
            elif isinstance(node, ast.Assign):
                seen.update(t.id for t in node.targets if isinstance(t, ast.Name))
        dups += ["%s: %s" % (os.path.basename(f), k)
                 for k, v in seen.items() if v > 1]
    ok("no name defined twice in a module", lst(dups))


def _resolve(p, learn):
    """The order query.py uses: the form, then norm(), then the species."""
    mv = learn.get(p["name"]) or []
    if not mv:
        mv = next((learn[k] for k in learn
                   if dex.norm(k) == dex.norm(p["name"])), [])
    if not mv:
        mv = next((learn[k] for k in learn
                   if dex.species_norm(k) == dex.species_norm(p["name"])), [])
    return mv


def _check_forms(mons, learn):
    """Every form finds itself, collides with nobody under norm(), and
    resolves a movepool."""
    print("\n  the forms, one by one")
    ok("forms in the dex", len(mons), len(mons))

    wrong = [p["name"] for p in mons
             if (dex.find_pokemon(p["name"]) or {}).get("name") != p["name"]]
    ok("find_pokemon returns the form asked for", lst(wrong))

    by = collections.defaultdict(list)
    for p in mons:
        by[dex.norm(p["name"])].append(p["name"])
    ok("no collision under norm()",
       lst(["/".join(v) for v in by.values() if len(v) > 1]))

    ok("every form resolves a movepool",
       lst([p["name"] for p in mons if not _resolve(p, learn)]))
    ok("and the form beats its species when it has its own pool",
       lst([p["name"] for p in mons
            if learn.get(p["name"]) and
            len(_resolve(p, learn)) != len(learn[p["name"]])]))


def _check_megas(mons):
    """Mega Stones and Megas are 1:1, and every form has a name in Smogon's
    engine (else the damage calculator cannot be asked about it)."""
    megas = [p for p in mons if p.get("is_mega")]
    stones = collections.defaultdict(list)
    for p in megas:
        s = dex.stone_for(p)
        if s:
            stones[s].append(p["name"])
    ok("every Mega has a stone",
       lst([p["name"] for p in megas if not dex.stone_for(p)]))
    ok("no stone serves two Megas",
       lst(["%s: %s" % (k, ", ".join(v)) for k, v in stones.items()
            if len(v) > 1]))
    ok("the mapping is 1:1", len(stones), len(megas))

    miss = []
    for p in mons:
        try:
            Dm.smogon_name(p["name"])
        except SystemExit:
            miss.append(p["name"])
    ok("every form has a name in Smogon's engine", lst(miss))


def _duplicate_keys(text):
    """Every key some JSON object in `text` repeats, in the order met."""
    dup = []

    def hook(pairs):
        ks = [k for k, _ in pairs]
        for k in ks:
            if ks.count(k) > 1 and k not in dup:
                dup.append(k)
        return dict(pairs)
    json.loads(text, object_pairs_hook=hook)
    return dup


def _check_db_files():
    """Every data/db file loads and repeats no key (json.loads keeps the
    LAST of a repeated key, silently)."""
    print("\n  the files everything else reads")
    for f in sorted(glob.glob(os.path.join(DB, "*.json"))):
        name = os.path.basename(f)
        try:
            dup = _duplicate_keys(Path(f).read_text(encoding="utf-8"))
            ok("%s loads and repeats no key" % name, lst(dup))
        except (OSError, ValueError) as e:
            ok("%s loads" % name, str(e)[:40])


def _check_references(learn):
    """The derived tables only point at moves, abilities and Pokemon that
    exist."""
    print("\n  the derived tables point at things that exist")
    moves = {m["name"] for m in dex.db("moves")}
    abil = {a["name"] for a in dex.db("abilities")}
    am = dex.db("ability_moves") or {}
    ok("every move in the ability table exists",
       lst([n for r in (am.get("abilities") or {}).values()
            for n in (r.get("moves") or []) if n not in moves]))
    ok("every ability with a rule exists",
       lst([a for a in (am.get("abilities") or {}) if a not in abil]))
    il = dex.db("item_links") or {}
    ok("every move an item serves exists",
       lst([n for n in (il.get("by_move") or {}) if n not in moves]))
    ok("every ability an item serves exists",
       lst([a for a in (il.get("by_ability") or {}) if a not in abil]))
    st = (dex.db("statuses") or {}).get("statuses") or {}
    ok("every move that causes a status exists",
       lst([n for r in st.values() for n in (r.get("moves") or [])
            if n not in moves]))
    ok("every learnset points at real moves",
       lst([k for k, v in learn.items() if any(n not in moves for n in v)]))
    tf = dex.db("text_facts") or {}
    ok("every move text belongs to a move",
       lst([n for n in (tf.get("moves") or {}) if n not in moves]))
    ok("every ability text belongs to an ability",
       lst([a for a in (tf.get("abilities") or {}) if a not in abil]))


def main():
    _check_code()
    mons = dex.db("pokemon")
    learn = dex.db("learnsets")
    _check_forms(mons, learn)
    _check_megas(mons)
    _check_db_files()
    _check_references(learn)
    print("\n%s" % ("TODO BIEN" if not bad else "%d FALLOS" % bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
