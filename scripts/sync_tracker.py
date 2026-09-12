#!/usr/bin/env python3
"""Two-way bridge between inventory/*.json and the phone tracker database.

    python scripts/sync_tracker.py export --out DIR    # local  -> docs to push
    python scripts/sync_tracker.py import --in DIR     # docs pulled -> local
    python scripts/sync_tracker.py import --in DIR --dry-run

The tracker owns STATE only: who is in the box, who is in HOME, which stones
and items are owned, VP, and the editable half of a build.  Every other key in
inventory/ - the prose, the _comment blocks, the changelogs, the reasoning - is
never touched by an import.  That split is deliberate: the app is the fastest
place to record WHAT changed, the repo stays the place that records WHY.
"""
import argparse, json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INV = os.path.join(ROOT, "inventory", "inventory.json")
BUILDS = os.path.join(ROOT, "inventory", "builds.json")

# keys of a build the tracker edits directly; anything else round-trips in the
# doc's "extra" bag so a one-off note is never lost
CORE = ["pokemon", "mega", "ability", "mega_ability", "nature",
        "stat_points", "moves", "role", "rationale"]

TODAY = datetime.date.today().isoformat()


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(p, d):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")


def slug(name, taken):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "x"
    base, n = s, 2
    while s in taken:
        s, n = "%s-%d" % (base, n), n + 1
    taken.add(s)
    return s


# --------------------------------------------------------------- export ----
def cmd_export(a):
    inv, bl = load(INV), load(BUILDS)
    os.makedirs(a.out, exist_ok=True)
    docs = []

    # ORIGIN decides whether a slot is elastic. inventory.json's _origin_rule
    # was written when it was NOT recorded per Pokemon; since 2026-09-10 it is
    # asked at registration - every route in settles it, and the tracker will
    # not add to the Champions Box without an answer. "unknown" now only ever
    # means a row written before that, and the app flags those rather than
    # filing them anywhere quiet.
    origin_of = inv.get("_origin_of") or {}
    marks = inv.get("_marks") or {}          # shiny / trained, per name

    taken = set()
    order = 0
    for name in inv["permanent_pokemon"]:
        docs.append(("box", slug(name, taken), {
            "name": name, "location": "champions", "status": "permanent",
            "origin": origin_of.get(name, "unknown"),
            "shiny": bool(marks.get(name, {}).get("shiny")),
            "trained": bool(marks.get(name, {}).get("trained")),
            "note": "", "order": order, "updated": TODAY}))
        order += 1
    for name in inv["rental_pokemon"]["list"]:
        # a rental is an Encounter loan, so it is Champions origin by definition
        docs.append(("box", slug(name, taken), {
            "name": name, "location": "champions", "status": "rental",
            "origin": "champions",
            "note": "", "order": order, "updated": TODAY}))
        order += 1
    for name in inv["home_box"]["list"]:
        docs.append(("box", slug(name, taken), {
            "name": name, "location": "home", "status": "permanent",
            "origin": "home",
            "shiny": bool(marks.get(name, {}).get("shiny")),
            "trained": bool(marks.get(name, {}).get("trained")),
            "note": "", "order": order, "updated": TODAY}))
        order += 1

    btaken = set()
    for b in bl["builds"]:
        d = {k: b.get(k) for k in CORE}
        d["extra"] = {k: v for k, v in b.items() if k not in CORE}
        d["updated"] = TODAY
        docs.append(("builds", slug(b["pokemon"], btaken), d))

    # an item can sit in two shop categories at once - a Sitrus Berry is both
    # "recovery" and "berry" - so membership is a list, never a single tag
    cat_of = {}
    for cat, names in inv["items"].items():
        if cat.startswith("_"):
            continue
        for n in names:
            cat_of.setdefault(n, []).append(cat)
    docs.append(("meta", "items", {
        "categories": [c for c in inv["items"] if not c.startswith("_")],
        "owned": [[n, cs] for n, cs in sorted(cat_of.items())],
        "updated": TODAY}))

    docs.append(("meta", "stones", {
        "owned": sorted(inv["mega_stones"]), "updated": TODAY}))

    tr, ec = inv["trainer"], inv["economy"]
    docs.append(("meta", "trainer", {
        "rank": tr.get("rank"), "regulation": tr.get("regulation"),
        "season": tr.get("season"), "box_capacity": tr.get("box_capacity"),
        "vp_balance": ec.get("vp_balance"),
        "training_tickets": ec.get("training_tickets_incoming"),
        "permanence_tickets": inv["rental_pokemon"].get("permanence_tickets"),
        "updated": TODAY}))

    docs.append(("meta", "gts", {
        "open_offers": inv["home_box"]["gts_pending"].get("open_offers", []),
        "updated": TODAY}))

    man = []
    for coll, did, body in docs:
        sub = os.path.join(a.out, coll)
        os.makedirs(sub, exist_ok=True)
        p = os.path.join(sub, did + ".json")
        save(p, body)
        man.append({"collection": coll, "doc_id": did, "file_path": p})
    save(os.path.join(a.out, "manifest.json"), man)
    print("%d docs -> %s" % (len(man), a.out))
    for coll in ("box", "builds", "meta"):
        print("  %-8s %d" % (coll, sum(1 for m in man if m["collection"] == coll)))


# --------------------------------------------------------------- import ----
def read_docs(d, coll):
    sub = os.path.join(d, coll)
    if not os.path.isdir(sub):
        return {}
    return {f[:-5]: load(os.path.join(sub, f))
            for f in sorted(os.listdir(sub)) if f.endswith(".json")}


def cmd_import(a):
    if a.json:
        # the tracker's own "Everything JSON" export, straight from the app.
        # This is the credential-free route now that the data lives in
        # Supabase: RLS means nothing outside a signed-in session can read it,
        # and the app is already signed in.
        blob = load(a.json)
        box = blob.get("box") or {}
        builds = blob.get("builds") or {}
        meta = blob.get("meta") or {}
    else:
        box = read_docs(a.inp, "box")
        builds = read_docs(a.inp, "builds")
        meta = read_docs(a.inp, "meta")
    if not box and not builds and not meta:
        sys.exit("nothing to import - pass --json FILE or --in DIR")

    inv, bl = load(INV), load(BUILDS)
    before = json.dumps([inv, bl], ensure_ascii=False, sort_keys=True)

    def bucket(loc, st=None):
        rows = [v for v in box.values() if v.get("location") == loc
                and (st is None or v.get("status") == st)]
        rows.sort(key=lambda v: (v.get("order", 0), v.get("name", "")))
        return [v["name"] for v in rows]

    if box:
        inv["permanent_pokemon"] = bucket("champions", "permanent")
        inv["rental_pokemon"]["list"] = bucket("champions", "rental")
        inv["home_box"]["list"] = bucket("home")
        used = len(inv["permanent_pokemon"]) + len(inv["rental_pokemon"]["list"])
        inv["trainer"]["box_used"] = used
        inv["home_box"]["count"] = "%d Pokemon, %d species" % (
            len(inv["home_box"]["list"]), len(set(inv["home_box"]["list"])))

        # answers to _origin_rule's open question, as the player records them.
        # Kept in a sibling map so permanent_pokemon stays a plain list of
        # names and query.py's owned_sets() is untouched.
        og = {}
        for v in box.values():
            if v.get("location") == "champions" and v.get("status") != "rental":
                og[v["name"]] = v.get("origin") or "unknown"
        inv["_origin_of"] = dict(sorted(og.items()))

        # Shiny is why a particular copy is the one worth keeping, and
        # "trained" is worth more than it looks: a HOME-origin Pokemon trained
        # inside Champions keeps that training forever, so it comes back built
        # for no VP. Both are per-copy facts the plain name lists cannot hold.
        mk = {}
        for v in box.values():
            if v.get("shiny") or v.get("trained"):
                mk[v["name"]] = {k: True for k in ("shiny", "trained")
                                 if v.get(k)}
        inv["_marks"] = dict(sorted(mk.items()))
        elastic = sum(1 for o in og.values() if o == "home")
        inv["_origin_of_note"] = (
            "Recorded in the tracker by the player, one at a time. "
            "%d of %d box slots are elastic (HOME origin, can be parked and "
            "recalled with the training intact); %d are welded (Champions "
            "origin or not yet answered) and free only by releasing. "
            "'unknown' means NOT ASKED YET, not 'Champions origin'."
            % (elastic, used, used - elastic))

    if "stones" in meta:
        inv["mega_stones"] = sorted(meta["stones"].get("owned", []))
    if "items" in meta:
        cats = {}
        for row in meta["items"].get("owned", []):
            if isinstance(row, list):
                n, cs = row[0], (row[1] if len(row) > 1 else "other")
            else:
                n, cs = row, "other"
            for c in ([cs] if isinstance(cs, str) else cs) or ["other"]:
                cats.setdefault(c, []).append(n)
        for c in list(inv["items"]):
            if not c.startswith("_"):
                inv["items"][c] = sorted(cats.get(c, []))
        for c, names in cats.items():
            if c not in inv["items"]:
                inv["items"][c] = sorted(names)
    if "trainer" in meta:
        t = meta["trainer"]
        for k in ("rank", "regulation", "season", "box_capacity"):
            if t.get(k) is not None:
                inv["trainer"][k] = t[k]
        if t.get("vp_balance") is not None:
            inv["economy"]["vp_balance"] = t["vp_balance"]
        if t.get("training_tickets") is not None:
            inv["economy"]["training_tickets_incoming"] = t["training_tickets"]
        if t.get("permanence_tickets") is not None:
            inv["rental_pokemon"]["permanence_tickets"] = t["permanence_tickets"]
    if "gts" in meta:
        inv["home_box"]["gts_pending"]["open_offers"] = \
            meta["gts"].get("open_offers", [])
    inv["trainer"]["last_updated"] = TODAY

    if builds:
        out = []
        for did in sorted(builds):
            d = builds[did]
            b = {}
            for k in CORE:
                if d.get(k) not in (None, "", []):
                    b[k] = d[k]
            b.update(d.get("extra") or {})
            out.append(b)
        bl["builds"] = out

    after = json.dumps([inv, bl], ensure_ascii=False, sort_keys=True)
    if before == after:
        print("no change")
        return
    print("inventory: %d permanent, %d rental, %d HOME, %d stones, %d builds"
          % (len(inv["permanent_pokemon"]), len(inv["rental_pokemon"]["list"]),
             len(inv["home_box"]["list"]), len(inv["mega_stones"]),
             len(bl["builds"])))
    if a.dry_run:
        print("(dry run - nothing written)")
        return
    save(INV, inv)
    save(BUILDS, bl)
    print("wrote inventory/inventory.json and inventory/builds.json")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export")
    e.add_argument("--out", required=True)
    e.set_defaults(fn=cmd_export)
    i = sub.add_parser("import")
    g = i.add_mutually_exclusive_group(required=True)
    g.add_argument("--json", metavar="FILE",
                   help="the tracker's own 'Everything JSON' export")
    g.add_argument("--in", dest="inp", metavar="DIR",
                   help="a directory of pulled documents")
    i.add_argument("--dry-run", action="store_true")
    i.set_defaults(fn=cmd_import)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
