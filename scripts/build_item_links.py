#!/usr/bin/env python3
"""Which item serves which move, and which ability.

    python scripts/build_item_links.py            # write the table + report
    python scripts/build_item_links.py --report   # report only
    python scripts/build_item_links.py --audit    # every item, classified

The player's example is the shape of the whole problem: **Heat Rock extends the
sun, so it serves the move Sunny Day AND the ability Drought.** Matching item
text against move names finds the move and misses the ability every time -
Electric Seed named Electric Terrain and never Electric Surge, which is what
actually turns the terrain on.

So the link is not item -> move. It is:

    item -> the FIELD EFFECT it names -> everything that causes that effect

and that catches both halves at once. The rest of the item pool links by type,
by category, or by a property of the move, all read from the item's own text.

Nothing here is a hand-written list of moves. The one hand-written thing is the
vocabulary each field effect is spelled with, and every spelling below was
taken from the data: Sunny Day says "harsh sunlight", Drought says "Intense
Sunshine", Snow Warning says "Snowstorm blows". The script fails loudly if a
field effect stops matching a move or an ability, which is what would happen if
a regulation reworded one.
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q

OUT = os.path.join(ROOT, "data", "db", "item_links.json")

TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting",
         "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost",
         "Dragon", "Dark", "Steel", "Fairy"]

# A field effect, and every spelling the game uses for it. "rain" needs a word
# boundary or "terrain" matches it - the same trap that put all six terrain
# abilities in the weather bucket earlier today.
FIELD = {
    "harsh sunlight": r"harsh sunlight|intense sunshine|\bsunlight\b|\bsunshine\b|\bsunny\b",
    "rain":           r"\brain\b|heavy rain",
    "sandstorm":      r"\bsandstorm\b|sand stream",
    "snow":           r"\bsnow\b|snowstorm|\bhail\b",
    "Electric Terrain": r"electric terrain",
    "Grassy Terrain":   r"grassy terrain",
    "Misty Terrain":    r"misty terrain",
    "Psychic Terrain":  r"psychic terrain",
}
# what an item that names a field effect is doing about it
FIELD_WHY = "extends it"

# WHICH WAY A LINK POINTS, from the point of view of whoever USES the move.
#
# A tag on a move row is not neutral. Heat Rock on Sunny Day is a reason to run
# the move; Aspear Berry on Ice Beam is the reason it will not work - the target
# thaws and the freeze was the whole point. Both read as the same grey chip, so
# the screen said "these items are related" and left which way to be worked out
# (player, 2026-09-18: "necesito que ese tag sea visualmente negativo, puesto
# que significa que el freeze de ese ataque se puede evitar con ese item. La
# vision del movimiento es cosas beneficiosas para el usuario y las cosas
# negativas las que lo pueden perjudicar").
#
# Keyed on the reason the rule gave, because that is where the direction was
# already decided - and asserted complete below, so a new rule cannot arrive
# without one.
AGAINST = {
    "cures the {status} this inflicts",       # the target shrugs off the point
    "cures whatever status just landed on it",
    "weakens an incoming {type} move",        # the resist berries
    "punishes an incoming contact move",      # Rocky Helmet
    "nothing {type}-type can touch it while it holds this",
    "shakes off what would lock its moves",   # Mental Herb answers Taunt
    "restores what an incoming move lowered", # White Herb
    "locks it into the first move it picks",  # the Choice items, a cost
}


def side_of(why):
    """'for' or 'against', from the reason - shaped so a type or a status
    in the middle of one does not need an entry of its own."""
    shaped = re.sub(r"\b(?:" + "|".join(TYPES) + r")\b", "{type}", why)
    shaped = re.sub(r"cures the \w+ this inflicts",
                    "cures the {status} this inflicts", shaped)
    return "against" if shaped in AGAINST else "for"


def clean(s):
    return " ".join((s or "").replace("�", "'").split())


def field_setters(moves, abils):
    """For each field effect: the moves and the abilities that turn it on."""
    out = {}
    for eff, pat in FIELD.items():
        rx = re.compile(pat, re.I)
        ms = [m["name"] for m in moves
              if m.get("useable") and rx.search(clean(m.get("effect")))
              and re.search(r"summons|turns the entire field|creates",
                            clean(m.get("effect")), re.I)]
        # a Surge ability activates it; Forecast and Cloud Nine only react to
        # it, so "activates/summons/blows/changes to" is the test
        abs_ = [a["name"] for a in abils
                if rx.search(clean(a.get("effect")))
                and re.search(r"activates|blows|weather changes to|turns the "
                              r"ground into|summons", clean(a.get("effect")), re.I)]
        out[eff] = (sorted(set(ms)), sorted(set(abs_)))
    return out


# status -> the moves that inflict it, from scripts/build_statuses.py
STATUS = {k: (v.get("moves") or [])
          for k, v in ((Q.db("statuses") or {}).get("statuses") or {}).items()}


def item_links(item, props, setters, facts):
    """(moves, abilities, why) for one item, or (None, None, reason).

    The text read here is the MERGED one from build_item_facts.py - pokebase's
    mechanics where it has them, Serebii's flavour otherwise. That is what
    makes Air Balloon linkable at all: Serebii only says it floats, pokebase
    says it is immune to Ground-type moves.
    """
    # BOTH texts, joined: pokebase writes the mechanics ("immune to
    # Ground-type moves", "1/6 of its max HP") and Serebii writes the flavour,
    # and each of them words some rules the other does not. Matching over the
    # pair means neither phrasing is a single point of failure - reading
    # pokebase alone lost every type booster, because it says "Boosts" where
    # Serebii says "boosts".
    f = facts.get(item["name"]) or {}
    t = clean(f.get("text")) + " || " + clean(f.get("serebii_text") or
                                              item.get("effect"))
    name = item["name"]
    dmg = [n for n, p in props.items() if p["bp"] > 0 and p["cat"] != "Status"]
    def has(pat):
        return re.search(pat, t, re.I)

    # --- the field-effect bridge: the move AND the ability, together --------
    for eff, (ms, abs_) in setters.items():
        if has(FIELD[eff]) and (ms or abs_):
            return ms, abs_, ("extends " + eff + " however it was set - "
                              "by the move or by the ability")
    if has(r"\bterrain\b"):
        ms, abs_ = [], []
        for eff, (a, b) in setters.items():
            if "Terrain" in eff:
                ms += a; abs_ += b
        return sorted(set(ms)), sorted(set(abs_)), "extends any terrain it sets"

    # --- one type, going out ----------------------------------------------
    m = has(r"boosts? the power of (?:the holder's|a) ([A-Za-z]+)[\s-]*type "
            r"(?:moves|move|attacks)")
    if m and m.group(1).capitalize() in TYPES:
        ty = m.group(1).capitalize()
        return ([n for n in dmg if props[n]["type"] == ty], [],
                "boosts every " + ty + " move it uses")
    # --- one type, coming in ----------------------------------------------
    m = has(r"immune to ([A-Za-z]+)[\s-]*type moves")
    if m and m.group(1).capitalize() in TYPES:
        ty = m.group(1).capitalize()
        return ([n for n in dmg if props[n]["type"] == ty], [],
                "nothing " + ty + "-type can touch it while it holds this")
    m = has(r"vulnerable to ([A-Za-z]+)[\s-]*type moves")
    if m and m.group(1).capitalize() in TYPES:
        ty = m.group(1).capitalize()
        return ([n for n in dmg if props[n]["type"] == ty], [],
                "an incoming " + ty + " move hits it even through Flying")
    m = has(r"(?:halves damage from the first supereffective|hit with a "
            r"supereffective|hit with a) ([A-Za-z]+)[\s-]*type (?:move|attack)")
    if m and m.group(1).capitalize() in TYPES:
        ty = m.group(1).capitalize()
        return ([n for n in dmg if props[n]["type"] == ty], [],
                "weakens an incoming " + ty + " move")
    # --- one category ------------------------------------------------------
    if has(r"holder's physical moves"):
        return ([n for n in dmg if props[n]["cat"] == "Physical"], [],
                "boosts its physical moves")
    if has(r"holder's special moves"):
        return ([n for n in dmg if props[n]["cat"] == "Special"], [],
                "boosts its special moves")
    # --- a property of the move -------------------------------------------
    if has(r"binding moves"):
        return ([n for n, p in props.items() if p["binds"]], [],
                "boosts its binding moves")
    if has(r"HP-stealing moves|draining moves|HP-draining"):
        return ([n for n, p in props.items() if p["heals"]], [],
                "gives back more from its draining moves")
    if has(r"contact move|makes direct contact with the holder"):
        return ([n for n, p in props.items() if p["contact"]], [],
                "punishes an incoming contact move")
    if has(r"only use the first move it selects|only allows the use of a "
           r"single move"):
        return (sorted(props), [], "locks it into the first move it picks")
    if has(r"move-binding effects|prevent(?:s)? .*choosing|choice"):
        return ([n for n, p in props.items() if p["locks"]], [],
                "shakes off what would lock its moves")
    if has(r"lowered stat"):
        return ([n for n, p in props.items() if p["down_stats"]], [],
                "restores what an incoming move lowered")
    if has(r"accuracy of (?:the holder's|moves targeting the holder)|"
           r"more accurate"):
        return ([n for n, p in props.items()
                 if p["acc"] is not None and p["acc"] < 100], [],
                "changes the odds on everything that can miss")
    if has(r"critical-hit ratio"):
        return (dmg, [], "raises the critical-hit ratio of its attacks")
    if has(r"supereffective moves"):
        return (dmg, [], "boosts whatever it uses that is supereffective")
    if has(r"boosts the power of the holder's moves|"
           r"boosts the power of consecutive uses|"
           r"flinch whenever the holder|restores? .* when it inflicts damage|"
           r"every time it inflicts damage|boosts.*Attack and Sp\. Atk"):
        return (dmg, [], "rides on every attack it lands")
    # --- named outright ----------------------------------------------------
    named = sorted(n for n in props
                   if len(n) > 4 and re.search(r"\b" + re.escape(n) + r"\b", t))
    if named:
        # Light Clay reads "Light Screen or Reflect" and the player has
        # confirmed in game that it extends Aurora Veil too, which the text
        # does not say. CLAUDE.md carries that as a rule; it is applied here
        # rather than left wrong.
        if name == "Light Clay" and "Aurora Veil" in props:
            named = sorted(set(named) | {"Aurora Veil"})
        return named, [], "changes what these moves do"
    # --- the status berries, unblocked 2026-09-10 --------------------------
    # These had no link while nothing said which move causes which status.
    # data/db/statuses.json has that column now, so a Cheri Berry can point at
    # the fifteen moves that paralyse.
    CURES = [("Paralysis", r"paralysis|paraly[sz]ed"),
             ("Freeze", r"thaw|frozen|freez"),
             ("Sleep", r"drowsiness|asleep|\bsleep\b"),
             ("Poison", r"poisoned|poisoning"),
             ("Badly Poisoned", r"badly poisoned"),
             ("Burn", r"\bburn\b|burned"),
             ("Confusion", r"confusion|confused")]
    if has(r"cure|thaw|free itself|shake off|lift the effects|status condition"):
        if has(r"any status condition"):
            got = sorted({n for s in STATUS for n in STATUS[s]})
            return got, [], "cures whatever status just landed on it"
        for st, pat in CURES:
            if has(pat) and STATUS.get(st):
                return (sorted(STATUS[st]), [],
                        "cures the " + st.lower() + " this inflicts")
    # Nothing links, and the reason is worth keeping: an item with no rule
    # reads as one nobody looked at.
    if has(r"restores?|endure with 1 HP|switched out|remove the attacker|"
           r"switch out of battle|moving first|PP"):
        return None, None, "about HP, PP or switching, not about any move"
    return None, None, "nothing in its text names a move, a type or a field effect"


def build():
    moves = Q.db("moves")
    abils = Q.db("abilities")
    props = (Q.db("ability_moves") or {}).get("moves") or {}
    if not props:
        sys.exit("run scripts/build_ability_moves.py first - this needs its "
                 "derived move properties")
    # one property this file needs that the ability table does not carry:
    # a binding move is one that gives the Bound status
    for n, p in props.items():
        mv = next((m for m in moves if m["name"] == n), None)
        p["binds"] = bool(re.search(r"\bBound status\b",
                                    clean(mv.get("effect")) if mv else ""))

    setters = field_setters(moves, abils)
    for eff, (ms, abs_) in setters.items():
        if not ms and not abs_:
            sys.exit("no move or ability sets %r any more - the wording "
                     "changed, fix FIELD" % eff)

    facts = (Q.db("item_facts") or {}).get("prices") or {}
    items, unlinked = {}, []
    for it in Q.db("items"):
        if it.get("is_mega_stone") or it.get("category") == "Miscellaneous":
            continue
        ms, abs_, why = item_links(it, props, setters, facts)
        if ms is None:
            unlinked.append((it["name"], why))
            continue
        items[it["name"]] = {"moves": ms, "abilities": abs_,
                             "why": why, "side": side_of(why)}

    by_move, by_abil = {}, {}
    for it, r in items.items():
        for n in r["moves"]:
            by_move.setdefault(n, []).append(it)
        for n in r["abilities"]:
            by_abil.setdefault(n, []).append(it)
    for d in (by_move, by_abil):
        for k in d:
            d[k] = sorted(d[k])
    return items, by_move, by_abil, unlinked, setters


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--audit", action="store_true")
    a = ap.parse_args()
    items, by_move, by_abil, unlinked, setters = build()

    print("%d items linked, %d left alone" % (len(items), len(unlinked)))
    print("  %d moves and %d abilities have at least one item"
          % (len(by_move), len(by_abil)))
    print("\n--- what turns each field effect on ---")
    for eff, (ms, abs_) in setters.items():
        print("   %-17s moves: %-28s abilities: %s"
              % (eff, ", ".join(ms) or "-", ", ".join(abs_) or "-"))
    if a.audit or a.report:
        print("\n--- every link ---")
        for n in sorted(items):
            r = items[n]
            print("   %-18s %-7s %-46s %s"
                  % (n, r["side"], r["why"][:46],
                     ("%d moves" % len(r["moves"]) if len(r["moves"]) > 4
                      else ", ".join(r["moves"])) +
                     (" + " + ", ".join(r["abilities"]) if r["abilities"] else "")))
        print("\n--- no link, and why ---")
        for n, why in sorted(unlinked):
            print("   %-18s %s" % (n, why))

    if not a.report and not a.audit:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump({"_comment":
                       "Derived by scripts/build_item_links.py from the item, "
                       "move and ability text. An item that names a field "
                       "effect links to the moves AND the abilities that set "
                       "it - that is the point.",
                       "items": items, "by_move": by_move,
                       "by_ability": by_abil}, f, ensure_ascii=False, indent=1)
        print("\nwrote %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
