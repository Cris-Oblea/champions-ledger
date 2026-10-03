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
import argparse
import json
import os
import re

import dex
from fetch_pokebase import rows_with
from paths import DB

OUT = os.path.join(DB, "item_facts.json")


def pokebase_unlocks():
    """name -> how the shop unlocks it ("shop-1000-vp")."""
    out = {}
    for r in rows_with("items", "name", "unlock"):
        out.setdefault(r["name"], r["unlock"])
    return out


def pokebase_text():
    """pokebase's description: the mechanics, with the numbers in them."""
    out = {}
    for r in rows_with("items", "name", "description"):
        if isinstance(r["description"], str):
            t = r["description"].replace("\u2019", "'")
            out.setdefault(r["name"], " ".join(t.split()))
    return out


def vp_of(unlock):
    """`shop-2000-vp` -> 2000. Anything else is not a price."""
    m = re.match(r"shop-(\d+)-vp$", unlock or "")
    return int(m.group(1)) if m else None


UNLOCK_LABEL = {
    "beginning": "you start with it",
    "deposit-legends-za": "deposit from Legends: Z-A",
}


def _price(it, pb):
    """(VP, who priced it, unlock, and 'agree', 'clash', 'filled' or None)."""
    serebii = it.get("price_vp")
    unlock = pb.get(it["name"])
    pbvp = vp_of(unlock)
    status = None
    if serebii and pbvp:
        status = "agree" if serebii == pbvp else "clash"
        if status == "clash":
            # SETTLED by the player's ruling: Serebii's price wins. Serebii's
            # item page IS the shop listing, item
            # by item; pokebase buckets everything it is unsure of into
            # shop-2000-vp, which is why all twelve disagreements run the
            # same way. Keeping pokebase's bucket alongside Serebii's price
            # left the record contradicting itself - Rocky Helmet read
            # "vp 1000, unlock shop-2000-vp" - so the bucket is rewritten
            # to match the price that won.
            unlock = "shop-%d-vp" % serebii
    elif pbvp:
        status = "filled"
    src = "serebii" if serebii else "pokebase" if pbvp else None
    return serebii or pbvp, src, unlock, status


def _unpriced_note(it, unlock):
    """Where an item with no price comes from, or "" when nothing says."""
    note = UNLOCK_LABEL.get(unlock or "", "")
    if not note:
        s = (it.get("source") or "").strip()
        note = "" if s in ("", "-") else s
    return note


def _texts(it, smogon, pbtext):
    """SMOGON'S CHAMPIONS DEX FIRST: it almost always describes an item
    better, and with its numbers. Sitrus Berry is "Restores 1/4 max HP when at 1/2
    max HP or less. Single use." there; Light Clay names Aurora Veil,
    which the player confirmed in game and Serebii's line leaves out.
    pokebase's mechanics and Serebii's flavour stay behind it, and both
    are kept, because the item links read them too."""
    ser = " ".join((it.get("effect") or "").split())
    smo = smogon.get(it["name"])
    pbt = pbtext.get(it["name"])
    return {"text": smo or pbt or ser,
            "text_source": ("smogon" if smo else
                            "pokebase" if pbt else "serebii"),
            "pokebase_text": pbt or "",
            "serebii_text": ser}


def _print_summary(rows, filled, agree, nothing, clash):
    """How many items each source priced, where they agree, and every clash."""
    print("%d items" % len(rows))
    print("  %3d priced by Serebii" % sum(1 for r in rows.values()
                                          if r["source"] == "serebii"))
    print("  %3d filled in from pokebase" % len(filled))
    print("  %3d agree where both have a price" % agree)
    print("  %3d have no price anywhere (rewards, tickets)" % len(nothing))
    print("  %3d described by Smogon's Champions dex, %d by pokebase, %d left "
          "on Serebii"
          % tuple(sum(1 for r in rows.values() if r["text_source"] == k)
                  for k in ("smogon", "pokebase", "serebii")))
    if clash:
        # SETTLED by the player's ruling: Serebii's price wins. Serebii's
        # page IS the shop listing, priced item by item;
        # pokebase buckets what it is unsure of into shop-2000-vp, which is why
        # all of these run the same way. Printed as a resolved decision, not as
        # an open question - a question that keeps asking itself gets answered
        # again every time someone reads it.
        print("\n  %d priced by Serebii where pokebase disagrees "
              "(Serebii wins - the player's ruling):" % len(clash))
        for n, s, p in clash:
            print("     %-22s %s VP, not pokebase's %s" % (n, s, p))
    if filled:
        print("\n  filled in (Serebii prints these as '??? VP'):")
        for n, v in sorted(filled)[:40]:
            print("     %-24s %d VP" % (n, v))


def main():
    """Price every item (Serebii first, pokebase to fill gaps), attach its
    texts, and write item_facts.json.
    """
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()

    pb = pokebase_unlocks()
    pbtext = pokebase_text()
    smogon = (dex.db("smogon_text") or {}).get("items") or {}
    rows, filled, agree, clash, nothing = {}, [], 0, [], []
    for it in dex.db("items"):
        name = it["name"]
        vp, src, unlock, status = _price(it, pb)
        agree += status == "agree"
        if status == "clash":
            clash.append((name, it.get("price_vp"), vp_of(pb.get(name))))
        if status == "filled":
            filled.append((name, vp))
        note = "" if vp else _unpriced_note(it, unlock)
        if not vp and not note:
            nothing.append(name)
        rows[name] = {"vp": vp, "source": src, "unlock": unlock, "note": note,
                      **_texts(it, smogon, pbtext)}
    _print_summary(rows, filled, agree, nothing, clash)

    if not a.report:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump({"_comment":
                       "Merged by scripts/build_item_facts.py. PRICE: Serebii "
                       "first, pokebase's `unlock` filling the ones Serebii "
                       "prints as '??? VP'. TEXT: Smogon's Champions dex first, "
                       "then pokebase (the mechanics), then Serebii (flavour). "
                       "`source` and `text_source` say which answered.",
                       "prices": rows}, f, ensure_ascii=False, indent=1)
        print("\nwrote %s" % OUT)


if __name__ == "__main__":
    main()
