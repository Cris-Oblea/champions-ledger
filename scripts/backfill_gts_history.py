#!/usr/bin/env python3
"""Recover the GTS trades that closed before the history feature existed.

The app only started recording closed trades on 2026-09-12. Everything before
that looked lost - but it was not: completing a trade writes a note on the
Pokemon that arrives, "GTS for <chip>, <deposit date>", and those notes are
still in the ledger. Twenty-one of them, back to 2026-09-08.

That matters because closed trades are the only hard evidence of what the
market pays, and the player's pricing rules are derived from them. Five
remembered trades produced the rule that a chip fetches its Mega's BST;
twenty-one show that rule is a CEILING a chip can reach, not a price it
commands - Beedrill hits it every time and twice beat it, while Chesnaught,
Starmie and Raichu all traded at base parity instead.

    python scripts/backfill_gts_history.py --dry-run
    python scripts/backfill_gts_history.py --write

Merges rather than overwrites: entries already in meta.gts.history are left
alone and matched on (gave, got) so a re-run adds nothing twice.
"""
import argparse, collections, io, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def sb(sql, as_json=True):
    argv = ["supabase", "db", "query", sql, "--linked"] + (["-o", "json"] if as_json else [])
    r = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("supabase failed:\n" + (r.stderr or r.stdout)[:600])
    m = re.search(r"\[.*\]|\{.*\}", r.stdout, re.S)
    if not m:
        return []
    d = json.loads(m.group(0))
    # `-o json` returns a bare array; without it the CLI wraps the rows in an
    # object with a `rows` key and a boundary warning. Accept both.
    if isinstance(d, dict):
        d = d.get("rows", [])
    return d


def dexmaps():
    dex = json.load(io.open(os.path.join(ROOT, "data", "db", "pokemon.json"),
                            encoding="utf-8"))
    base = {p["name"]: p for p in dex if not p.get("is_mega")}
    megas = collections.defaultdict(list)
    for p in dex:
        if p.get("is_mega"):
            megas[p["species"]].append(p)
    return base, megas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not a.write and not a.dry_run:
        a.dry_run = True

    base, megas = dexmaps()

    def bst(n):
        p = base.get(n)
        return p["base_stats"]["total"] if p else None

    def mega_bst(n):
        p = base.get(n)
        if not p:
            return None
        ms = megas.get(p["species"]) or []
        return max([m["base_stats"]["total"] for m in ms]) if ms else None

    rows = sb("select name, shiny, note, updated_at from box "
              "where note ilike '%GTS for %' order by updated_at")
    cur = sb("select coalesce(data->'history','[]'::jsonb) as h from meta "
             "where id='gts'")
    existing = (cur[0].get("h") if cur else None) or []
    seen = {(e.get("gave"), e.get("got")) for e in existing}

    # SHININESS OF A PAST CHIP IS NOT RECOVERABLE, and guessing it would be
    # worse than leaving it blank. The arriving Pokemon's note records the
    # species that was given, never which copy - and "every Chesnaught still
    # in the box is shiny" says nothing about the two that left. Since the
    # whole point of tracking shininess is to measure what the premium is
    # worth, a fabricated flag would poison exactly that number. Backfilled
    # rows therefore carry null, meaning "not known", and only trades the app
    # recorded itself count towards the shiny measurement.

    added = []
    for r in rows:
        m = re.match(r"GTS for (.+?),\s*(.+)$", r.get("note") or "")
        if not m:
            continue
        gave, dep = m.group(1).strip(), m.group(2).strip()
        got = r["name"]
        if (gave, got) in seen:
            continue
        b, mg = bst(gave), mega_bst(gave)
        added.append({"gave": gave, "got": got, "deposited": dep,
                      "closed": r["updated_at"][:10], "days": None,
                      "gaveShiny": None,
                      "gaveBst": b, "gaveValue": mg or b, "gotBst": bst(got),
                      "rankAtDeposit": None,
                      "backfilled": "recovered from the box note"})
        seen.add((gave, got))

    added.sort(key=lambda e: e["closed"], reverse=True)
    merged = existing + added
    merged.sort(key=lambda e: e.get("closed") or "", reverse=True)

    print("%d already recorded, %d recovered, %d total"
          % (len(existing), len(added), len(merged)))
    for e in added:
        got, val = e["gotBst"], e["gaveValue"]
        d = ("%+d" % (got - val)) if (got and val) else "?"
        print("  %-18s -> %-18s %s vs its %s ceiling%s"
              % (e["gave"], e["got"], d, val, ""))

    if a.dry_run:
        print("\n--dry-run: nothing written")
        return 0

    payload = json.dumps({"history": merged})
    tmp = os.path.join(ROOT, "data", "raw", "_gts_history.json")
    io.open(tmp, "w", encoding="utf-8").write(payload)
    sb("update meta set data = data || %s::jsonb where id='gts'"
       % sql_literal(payload), as_json=False)
    print("\nwrote %d entries to meta.gts.history" % len(merged))
    return 0


def sql_literal(s):
    return "'" + s.replace("'", "''") + "'"


if __name__ == "__main__":
    sys.exit(main())
