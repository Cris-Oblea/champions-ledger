#!/usr/bin/env python3
"""What every item costs and what it actually does, merged across two sources.

    python scripts/build_item_facts.py            # write + report
    python scripts/build_item_facts.py --report   # report only

Serebii is this project's ground truth for rules, but not for shop prices: it
prints "Shop ??? VP" for 20 items it does not have the price of, which left the
app showing a price for some items and a shrug for others.

pokebase carries the same table as structured data with an `unlock` field -
`shop-2000-vp`, `shop-700-vp`, `beginning`, `deposit-legends-za` - for all 166
items that can be held (57 hold items, 28 berries, 81 Mega Stones). It does not
carry the 33 Miscellaneous tickets, which are rewards and have no price at all.

So the two are merged with Serebii first and pokebase filling the gaps, and
every disagreement is printed rather than silently resolved. `price_source`
records which one answered, so a number can always be traced back.

The same page fixes a second problem the player raised: **Serebii's item text is
flavour, pokebase's is mechanics.** Serebii says Air Balloon "makes the holder
float in the air" and never mentions Ground; pokebase says "immune to
Ground-type moves, as well as Spikes, Toxic Spikes and Sticky Web". Serebii says
Sitrus Berry restores "a small amount"; pokebase says 1/4 of max HP at 1/2 or
less. So pokebase's description wins where it has one, Serebii fills the rest,
and `text_source` records which - it is the text the app shows AND the text the
item/move/ability links are derived from.
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q

RAW = os.path.join(ROOT, "data", "raw", "pokebase")
OUT = os.path.join(ROOT, "data", "db", "item_facts.json")

# "name":"Life Orb", ... ,"unlock":"shop-1000-vp"  - escaped inside the RSC
# payload, so the quotes arrive as \" and the window is capped so one item's
# name cannot pair with the next item's unlock
PAIR = re.compile(r'\\"name\\":\\"([^\\"]+)\\"'
                  r'((?:(?!\\"name\\").){0,1500}?)'
                  r'\\"unlock\\":\\"([^\\"]+)\\"', re.S)
DESC = re.compile(r'\\"name\\":\\"([^\\"]+)\\"'
                  r'((?:(?!\\"name\\").){0,900}?)'
                  r'\\"description\\":\\"((?:[^\\"]|\\.)*?)\\"', re.S)


def pokebase_pages():
    for fn in ("items.html", "items_p2.html"):
        p = os.path.join(RAW, fn)
        if os.path.exists(p):
            yield open(p, encoding="utf-8", errors="replace").read()


def pokebase_unlocks():
    out = {}
    for h in pokebase_pages():
        for m in PAIR.finditer(h):
            out.setdefault(m.group(1), m.group(3))
    return out


def pokebase_text():
    """pokebase's description: the mechanics, with the numbers in them."""
    out = {}
    for h in pokebase_pages():
        for m in DESC.finditer(h):
            t = m.group(3).replace("\u2019", "'").replace("�", "'")
            t = t.replace("\n", " ").replace("\\", "")
            out.setdefault(m.group(1), " ".join(t.split()))
    return out


def vp_of(unlock):
    """`shop-2000-vp` -> 2000. Anything else is not a price."""
    m = re.match(r"shop-(\d+)-vp$", unlock or "")
    return int(m.group(1)) if m else None


UNLOCK_LABEL = {
    "beginning": "you start with it",
    "deposit-legends-za": "deposit from Legends: Z-A",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()

    items = Q.db("items")
    pb = pokebase_unlocks()
    pbtext = pokebase_text()
    rows, filled, agree, clash, nothing = {}, [], 0, [], []
    for it in items:
        name = it["name"]
        serebii = it.get("price_vp")
        unlock = pb.get(name)
        pbvp = vp_of(unlock)
        if serebii and pbvp:
            if serebii == pbvp:
                agree += 1
            else:
                clash.append((name, serebii, pbvp))
                # SETTLED by the player, 2026-09-13: "los precios son los que
                # dice serebii". Serebii's item page IS the shop listing, item
                # by item; pokebase buckets everything it is unsure of into
                # shop-2000-vp, which is why all twelve disagreements run the
                # same way. Keeping pokebase's bucket alongside Serebii's price
                # left the record contradicting itself - Rocky Helmet read
                # "vp 1000, unlock shop-2000-vp" - so the bucket is rewritten
                # to match the price that won.
                unlock = "shop-%d-vp" % serebii
        vp = serebii or pbvp
        src = ("serebii" if serebii else "pokebase" if pbvp else None)
        if not serebii and pbvp:
            filled.append((name, pbvp))
        note = ""
        if not vp:
            note = UNLOCK_LABEL.get(unlock or "", "")
            if not note:
                s = (it.get("source") or "").strip()
                note = "" if s in ("", "-") else s
            if not note:
                nothing.append(name)
        ser = " ".join((it.get("effect") or "").replace("�", "'").split())
        rows[name] = {"vp": vp, "source": src, "unlock": unlock, "note": note,
                      "text": pbtext.get(name) or ser,
                      "text_source": "pokebase" if pbtext.get(name) else "serebii",
                      "serebii_text": ser}

    print("%d items" % len(rows))
    print("  %3d priced by Serebii" % sum(1 for r in rows.values()
                                          if r["source"] == "serebii"))
    print("  %3d filled in from pokebase" % len(filled))
    print("  %3d agree where both have a price" % agree)
    print("  %3d have no price anywhere (rewards, tickets)" % len(nothing))
    print("  %3d described by pokebase (the mechanics), %d left on Serebii"
          % (sum(1 for r in rows.values() if r["text_source"] == "pokebase"),
             sum(1 for r in rows.values() if r["text_source"] == "serebii")))
    if clash:
        # SETTLED by the player, 2026-09-13: "los precios son los que dice
        # serebii". Serebii's page IS the shop listing, priced item by item;
        # pokebase buckets what it is unsure of into shop-2000-vp, which is why
        # all of these run the same way. Printed as a resolved decision, not as
        # an open question - a question that keeps asking itself gets answered
        # again every time someone reads it.
        print("\n  %d priced by Serebii where pokebase disagrees "
              "(Serebii wins - the player's ruling, 2026-09-13):" % len(clash))
        for n, s, p in clash:
            print("     %-22s %s VP, not pokebase's %s" % (n, s, p))
    if filled:
        print("\n  filled in (Serebii prints these as '??? VP'):")
        for n, v in sorted(filled)[:40]:
            print("     %-24s %d VP" % (n, v))

    if not a.report:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump({"_comment":
                       "Merged by scripts/build_item_facts.py. PRICE: Serebii "
                       "first, pokebase's `unlock` filling the ones Serebii "
                       "prints as '??? VP'. TEXT: pokebase first, because its "
                       "description is the mechanics and Serebii's is flavour. "
                       "`source` and `text_source` say which answered.",
                       "prices": rows}, f, ensure_ascii=False, indent=1)
        print("\nwrote %s" % OUT)


if __name__ == "__main__":
    main()
