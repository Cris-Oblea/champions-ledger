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
import ast, collections, glob, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q
import damage as Dm

bad = 0


def ok(label, got, want="0"):
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


def main():
    print("\n  el codigo")
    dups = []
    for f in sorted(glob.glob(os.path.join(ROOT, "scripts", "*.py"))):
        try:
            tree = ast.parse(open(f, encoding="utf-8").read())
        except SyntaxError as e:
            dups.append("%s no parsea: %s" % (os.path.basename(f), e))
            continue
        seen = collections.Counter()
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                                 ast.ClassDef)):
                seen[node.name] += 1
            elif isinstance(node, ast.Assign):
                for t in node.targets:
                    if isinstance(t, ast.Name):
                        seen[t.id] += 1
        dups += ["%s: %s" % (os.path.basename(f), k)
                 for k, v in seen.items() if v > 1]
    ok("ningun nombre definido dos veces en un modulo", lst(dups))

    print("\n  las formas, una por una")
    mons = Q.db("pokemon")
    learn = Q.db("learnsets")
    ok("formas en el dex", len(mons), len(mons))

    wrong = [p["name"] for p in mons
             if (Q.find_pokemon(p["name"]) or {}).get("name") != p["name"]]
    ok("find_pokemon devuelve la forma pedida", lst(wrong))

    by = collections.defaultdict(list)
    for p in mons:
        by[Q.norm(p["name"])].append(p["name"])
    ok("ninguna colision bajo norm()",
       lst(["/".join(v) for v in by.values() if len(v) > 1]))

    def resolve(p):
        """The order query.py uses: the form, then norm(), then the species."""
        mv = learn.get(p["name"]) or []
        if not mv:
            mv = next((learn[k] for k in learn
                       if Q.norm(k) == Q.norm(p["name"])), [])
        if not mv:
            mv = next((learn[k] for k in learn
                       if Q.species_norm(k) == Q.species_norm(p["name"])), [])
        return mv

    ok("cada forma resuelve un movepool",
       lst([p["name"] for p in mons if not resolve(p)]))
    ok("y la forma gana a su especie cuando tiene pool propio",
       lst([p["name"] for p in mons
            if learn.get(p["name"]) and
            len(resolve(p)) != len(learn[p["name"]])]))

    megas = [p for p in mons if p.get("is_mega")]
    stones = collections.defaultdict(list)
    for p in megas:
        s = Q.stone_for(p)
        if s:
            stones[s].append(p["name"])
    ok("cada Mega tiene piedra",
       lst([p["name"] for p in megas if not Q.stone_for(p)]))
    ok("ninguna piedra sirve a dos Megas",
       lst(["%s: %s" % (k, ", ".join(v)) for k, v in stones.items()
            if len(v) > 1]))
    ok("la correspondencia es 1:1", len(stones), len(megas))

    miss = []
    for p in mons:
        try:
            Dm.smogon_name(p["name"])
        except SystemExit:
            miss.append(p["name"])
    ok("cada forma tiene nombre en el motor de Smogon", lst(miss))

    print("\n  los ficheros que todo lo demas lee")
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "db", "*.json"))):
        name = os.path.basename(f)
        dup = []

        def hook(pairs, dup=dup):
            ks = [k for k, _ in pairs]
            for k in ks:
                if ks.count(k) > 1 and k not in dup:
                    dup.append(k)
            return dict(pairs)
        try:
            json.loads(open(f, encoding="utf-8").read(), object_pairs_hook=hook)
            ok("%s carga y no repite claves" % name, lst(dup))
        except Exception as e:
            ok("%s carga" % name, str(e)[:40])

    print("\n  las tablas derivadas apuntan a cosas que existen")
    moves = {m["name"] for m in Q.db("moves")}
    abil = {a["name"] for a in Q.db("abilities")}
    am = Q.db("ability_moves") or {}
    ok("cada movimiento de la tabla de habilidades existe",
       lst([n for r in (am.get("abilities") or {}).values()
            for n in (r.get("moves") or []) if n not in moves]))
    ok("cada habilidad con regla existe",
       lst([a for a in (am.get("abilities") or {}) if a not in abil]))
    il = Q.db("item_links") or {}
    ok("cada movimiento que un item sirve existe",
       lst([n for n in (il.get("by_move") or {}) if n not in moves]))
    ok("cada habilidad que un item sirve existe",
       lst([a for a in (il.get("by_ability") or {}) if a not in abil]))
    st = (Q.db("statuses") or {}).get("statuses") or {}
    ok("cada movimiento que causa estado existe",
       lst([n for r in st.values() for n in (r.get("moves") or [])
            if n not in moves]))
    ok("cada learnset apunta a movimientos reales",
       lst([k for k, v in learn.items() if any(n not in moves for n in v)]))
    tf = Q.db("text_facts") or {}
    ok("cada texto de movimiento corresponde a un movimiento",
       lst([n for n in (tf.get("moves") or {}) if n not in moves]))
    ok("cada texto de habilidad corresponde a una habilidad",
       lst([a for a in (tf.get("abilities") or {}) if a not in abil]))

    print("\n%s" % ("TODO BIEN" if not bad else "%d FALLOS" % bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
