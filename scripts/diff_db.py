#!/usr/bin/env python3
"""What changed in the database, field by field, against what is committed.

    python scripts/diff_db.py            # the report
    python scripts/diff_db.py --json     # the same, for a caller
    python scripts/diff_db.py --limit 40 # how many lines per table

WHY COUNTS ARE NOT ENOUGH. The shrink guard asks "did a table come back
smaller", which catches a broken fetch and a mass deletion. It cannot see the
change that actually alters how a battle goes:

    Rock Slide's power moving from 75 to 70
    its flinch chance moving from 30% to 20%
    Leftovers being re-priced, or its effect reworded
    an ability's text changing what it does
    a Pokemon's base stats or typing being retuned
    Archaludon losing two moves while the move table stays the same size

Every one of those leaves all the counts identical. The numbers are already in
the database - `effect_rate` is 30.0 on Rock Slide, not a sentence to read - so
nothing needs to be extracted; they simply were not being COMPARED.

This compares the working copy against the committed one, record by record and
field by field, and says exactly what moved. It is a REPORT, not a gate: a
regulation is supposed to change things, and a run that blocked on that would
be a run nobody could leave switched on. What blocks is the shrink guard, which
is about damage rather than change.

The nightly prints it and the pull request carries it, so the diff of a
regulation night is readable without opening a single JSON file.
"""
import argparse, io, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (file, how records are keyed, which fields are worth a line of their own)
#
# `learners` and `pokemon` are lists of names and are handled separately: what
# matters there is WHICH names came and went - that is a movepool changing -
# not that the list is different.
TABLES = [
    ("data/db/moves.json", "moves", "slug",
     ["name", "type", "category", "power", "accuracy", "pp", "priority",
      "target", "effect", "effect_rate", "crit_rate", "hits", "always_crit",
      "useable", "flags"], "learners"),
    ("data/db/items.json", "items", "name",
     ["category", "effect", "price_vp", "is_mega_stone", "source"], None),
    ("data/db/abilities.json", "abilities", "name",
     ["effect"], "pokemon"),
    ("data/db/pokemon.json", "forms", "slug",
     ["name", "species", "form", "types", "base_stats", "abilities",
      "is_mega", "dex"], None),
]


def committed(rel):
    """The version of a file on HEAD, or None if it is not committed yet."""
    # BYTES, then decode as UTF-8 by hand. `text=True` decodes with the
    # LOCALE encoding - cp1252 on this machine - so every accented character in
    # the committed copy came back mangled and the differ reported 44 moves as
    # changed on a clean working tree. A differ that cries wolf is worse than
    # none: the one night it matters, nobody reads it.
    r = subprocess.run(["git", "show", "HEAD:" + rel], cwd=ROOT,
                       capture_output=True)
    if r.returncode != 0 or not r.stdout.strip():
        return None
    try:
        return json.loads(r.stdout.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


def current(rel):
    try:
        return json.load(io.open(os.path.join(ROOT, rel), encoding="utf-8"))
    except (OSError, ValueError):
        return None


def rows(blob, holder):
    """The records, whether the file is a bare list or wraps one."""
    if isinstance(blob, list):
        return blob
    if isinstance(blob, dict):
        got = blob.get(holder)
        if isinstance(got, list):
            return got
    return []


def by_key(records, key):
    out = {}
    for r in records:
        if isinstance(r, dict) and r.get(key) is not None:
            out[str(r[key])] = r
    return out


def show(v):
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, sort_keys=True)
    return str(v)


def names(v):
    return set(v) if isinstance(v, list) else set()


def table_diff(rel, holder, key, fields, listfield):
    old, new = committed(rel), current(rel)
    if old is None or new is None:
        return {"file": rel, "unknown": True, "lines": []}
    a = by_key(rows(old, holder), key)
    b = by_key(rows(new, holder), key)
    lines = []
    for k in sorted(set(b) - set(a)):
        lines.append(("added", k, "", ""))
    for k in sorted(set(a) - set(b)):
        lines.append(("removed", k, "", ""))
    for k in sorted(set(a) & set(b)):
        for f in fields:
            x, y = a[k].get(f), b[k].get(f)
            if show(x) != show(y):
                lines.append(("changed", k, f, "%s -> %s" % (show(x), show(y))))
        if listfield:
            # A movepool growing or shrinking. The names are what is worth
            # saying: "Slash: +29" is the M-C change the counts could not see.
            gone = names(a[k].get(listfield)) - names(b[k].get(listfield))
            came = names(b[k].get(listfield)) - names(a[k].get(listfield))
            if gone or came:
                bits = []
                if came:
                    bits.append("+%d (%s)" % (len(came), ", ".join(sorted(came)[:8])))
                if gone:
                    bits.append("-%d (%s)" % (len(gone), ", ".join(sorted(gone)[:8])))
                lines.append(("changed", k, listfield, "  ".join(bits)))
    return {"file": rel, "unknown": False, "lines": lines}


def learnset_diff():
    """Per Pokemon, which moves came and went. Keyed by Pokemon, not by move,
    because that is the question the box asks: what can this one do now."""
    rel = "data/db/learnsets.json"
    old, new = committed(rel), current(rel)
    if old is None or new is None:
        return {"file": rel, "unknown": True, "lines": []}
    a = old.get("learnsets", old) if isinstance(old, dict) else {}
    b = new.get("learnsets", new) if isinstance(new, dict) else {}
    lines = []
    for k in sorted(set(b) - set(a)):
        lines.append(("added", k, "", "%d moves" % len(b[k] or [])))
    for k in sorted(set(a) - set(b)):
        lines.append(("removed", k, "", ""))
    for k in sorted(set(a) & set(b)):
        gone, came = names(a[k]) - names(b[k]), names(b[k]) - names(a[k])
        if gone or came:
            bits = []
            if came:
                bits.append("+%d (%s)" % (len(came), ", ".join(sorted(came)[:8])))
            if gone:
                bits.append("-%d (%s)" % (len(gone), ", ".join(sorted(gone)[:8])))
            lines.append(("changed", k, "moves", "  ".join(bits)))
    return {"file": rel, "unknown": False, "lines": lines}


def report(limit=25):
    out = [table_diff(*t) for t in TABLES] + [learnset_diff()]
    total = sum(len(t["lines"]) for t in out)
    text = []
    for t in out:
        if t["unknown"]:
            text.append("%s: not committed yet - nothing to compare" % t["file"])
            continue
        if not t["lines"]:
            continue
        text.append("%s: %d change(s)" % (t["file"], len(t["lines"])))
        for kind, k, f, what in t["lines"][:limit]:
            text.append("  %-8s %-24s %s %s" % (kind, k, f, what))
        if len(t["lines"]) > limit:
            text.append("  ... and %d more" % (len(t["lines"]) - limit))
    if not text:
        text = ["no field changed against the committed database"]
    return total, out, "\n".join(text)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--limit", type=int, default=25)
    a = ap.parse_args()
    total, out, text = report(a.limit)
    if a.json:
        print(json.dumps({"total": total, "tables": out}, ensure_ascii=False))
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
