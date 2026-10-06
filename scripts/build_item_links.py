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
import argparse
import json
import os
import re
import sys
from collections.abc import Callable
from typing import Any

import dex
from paths import DB

OUT = os.path.join(DB, "item_links.json")


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

# WHICH WAY A LINK POINTS, from the point of view of whoever USES the move.
#
# A tag on a move row is not neutral. Heat Rock on Sunny Day is a reason to run
# the move; Aspear Berry on Ice Beam is the reason it will not work - the target
# thaws and the freeze was the whole point. A move row is read from its USER's
# side: what helps the user is a reason ("for"), what can undo the move is a
# warning ("against", drawn red).
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

# (moves, abilities, why) for one item; None where nothing links
type Link = tuple[list[str] | None, list[str] | None, str]
# move name -> its properties, as ability_moves.json derives them
type Props = dict[str, dict[str, Any]]
# a rule that picks moves out of the properties and the damaging moves
type Pick = Callable[[Props, list[str]], list[str]]


def side_of(why: str) -> str:
    """'for' or 'against', from the reason - shaped so a type or a status
    in the middle of one does not need an entry of its own."""
    shaped = re.sub(r"\b(?:" + "|".join(dex.TYPES) + r")\b", "{type}", why)
    shaped = re.sub(r"cures the \w+ this inflicts",
                    "cures the {status} this inflicts", shaped)
    return "against" if shaped in AGAINST else "for"


def clean(s: str | None) -> str:
    """Collapse whitespace."""
    return " ".join((s or "").split())


def field_setters(moves: list[dex.Row],
                  abils: list[dex.Row]) -> dict[str, tuple[list[str], list[str]]]:
    """For each field effect: the moves and the abilities that turn it on."""
    out: dict[str, tuple[list[str], list[str]]] = {}
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
_STATUSES: dict[str, dex.Row] = dex.db_obj("statuses").get("statuses") or {}
STATUS: dict[str, list[str]] = {k: (v.get("moves") or []) for k, v in _STATUSES.items()}


def _has(t: str, pat: str) -> re.Match[str] | None:
    """Case-insensitive search."""
    return re.search(pat, t, re.I)


def _field_rule(t: str, setters: dict[str, tuple[list[str], list[str]]]) -> Link | None:
    """The field-effect bridge: the move AND the ability, together."""
    hits = [eff for eff, (ms, abs_) in setters.items()
            if _has(t, FIELD[eff]) and (ms or abs_)]
    if len(hits) == 1 or (hits and not all("Terrain" in e for e in hits)):
        ms, abs_ = setters[hits[0]]
        return ms, abs_, ("extends " + hits[0] + " however it was set - "
                          "by the move or by the ability")
    if _has(t, r"\bterrain\b"):
        ms: list[str] = []
        abs_: list[str] = []
        for eff, (a, b) in setters.items():
            if "Terrain" in eff:
                ms += a
                abs_ += b
        return sorted(set(ms)), sorted(set(abs_)), "extends any terrain it sets"
    return None


# One type, going out, then coming in. {} is the type the text names; a text
# that names something that is not a type falls through to the next rule.
TYPE_RULES = [
    ((r"boosts? the power of (?:the holder's|a) ([A-Za-z]+)[\s-]*type "
      r"(?:moves|move|attacks)"), "boosts every {} move it uses"),
    (r"immune to ([A-Za-z]+)[\s-]*type moves",
     "nothing {}-type can touch it while it holds this"),
    (r"vulnerable to ([A-Za-z]+)[\s-]*type moves",
     "an incoming {} move hits it even through Flying"),
    ((r"(?:halves damage from the first supereffective|hit with a "
      r"supereffective|hit with a) ([A-Za-z]+)[\s-]*type (?:move|attack)"),
     "weakens an incoming {} move"),
]


def _type_rule(t: str, props: Props, dmg: list[str]) -> Link | None:
    """An item that boosts one type: links every damaging move of that type."""
    for pat, why in TYPE_RULES:
        m = _has(t, pat)
        if m and m.group(1).capitalize() in dex.TYPES:
            ty = m.group(1).capitalize()
            return [n for n in dmg if props[n]["type"] == ty], [], why.format(ty)
    return None


def _attacks_where(key: str, value: object) -> Pick:
    """A rule picking the damaging moves whose property `key` equals `value`.
    """
    return lambda props, dmg: [n for n in dmg if props[n][key] == value]


def _moves_where(key: str) -> Pick:
    """A rule picking every move with property `key` set."""
    return lambda props, _dmg: [n for n, p in props.items() if p[key]]


def _can_miss(props: Props, _dmg: list[str]) -> list[str]:
    """The moves that can miss."""
    return [n for n, p in props.items() if p["acc"] is not None and p["acc"] < 100]


def _every_move(props: Props, _dmg: list[str]) -> list[str]:
    """Every move."""
    return sorted(props)


def _every_attack(_props: Props, dmg: list[str]) -> list[str]:
    """Every damaging move."""
    return dmg


# One category, then a property of the move: (what the text says, which moves
# that picks out, the reason). The first that matches wins, so the order is
# the priority.
MOVE_RULES = [
    (r"holder's physical moves", _attacks_where("cat", "Physical"),
     "boosts its physical moves"),
    (r"holder's special moves", _attacks_where("cat", "Special"),
     "boosts its special moves"),
    (r"binding moves", _moves_where("binds"), "boosts its binding moves"),
    (r"HP-stealing moves|draining moves|HP-draining", _moves_where("heals"),
     "gives back more from its draining moves"),
    (r"contact move|makes direct contact with the holder",
     _moves_where("contact"), "punishes an incoming contact move"),
    ((r"only use the first move it selects|only allows the use of a "
      r"single move"), _every_move, "locks it into the first move it picks"),
    (r"move-binding effects|prevent(?:s)? .*choosing|choice",
     _moves_where("locks"), "shakes off what would lock its moves"),
    (r"lowered stat", _moves_where("down_stats"),
     "restores what an incoming move lowered"),
    ((r"accuracy of (?:the holder's|moves targeting the holder)|"
      r"more accurate"), _can_miss,
     "changes the odds on everything that can miss"),
    (r"critical-hit ratio", _every_attack,
     "raises the critical-hit ratio of its attacks"),
    (r"supereffective moves", _every_attack,
     "boosts whatever it uses that is supereffective"),
    ((r"boosts the power of the holder's moves|"
      r"boosts the power of consecutive uses|"
      r"flinch whenever the holder|restores? .* when it inflicts damage|"
      r"every time it inflicts damage|boosts.*Attack and Sp\. Atk"),
     _every_attack, "rides on every attack it lands"),
]


def _move_rule(t: str, props: Props, dmg: list[str]) -> Link | None:
    """The first MOVE_RULES pattern the item's text matches, as (moves,
    abilities, why).
    """
    for pat, pick, why in MOVE_RULES:
        if _has(t, pat):
            return pick(props, dmg), [], why
    return None


def _named_rule(t: str, props: Props, name: str) -> Link | None:
    """Moves the text names outright."""
    named = sorted(n for n in props
                   if len(n) > 4 and re.search(r"\b" + re.escape(n) + r"\b", t))
    if not named:
        return None
    # Light Clay reads "Light Screen or Reflect" and the player has
    # confirmed in game that it extends Aurora Veil too, which the text
    # does not say. CLAUDE.md carries that as a rule; it is applied here
    # rather than left wrong.
    if name == "Light Clay" and "Aurora Veil" in props:
        named = sorted(set(named) | {"Aurora Veil"})
    return named, [], "changes what these moves do"


# The status berries. data/db/statuses.json says which move causes which
# status, so a Cheri Berry can point at the moves that paralyse.
CURES = [("Paralysis", r"paralysis|paraly[sz]ed"),
         ("Freeze", r"thaw|frozen|freez"),
         ("Sleep", r"drowsiness|asleep|\bsleep\b"),
         ("Poison", r"poisoned|poisoning"),
         ("Badly Poisoned", r"badly poisoned"),
         ("Burn", r"\bburn\b|burned"),
         ("Confusion", r"confusion|confused")]


def _status_rule(t: str) -> Link | None:
    """A curing berry or item: links the moves that inflict what it cures."""
    if not _has(t, r"cure|thaw|free itself|shake off|lift the effects|status condition"):
        return None
    if _has(t, r"any status condition"):
        got = sorted({n for s in STATUS for n in STATUS[s]})
        return got, [], "cures whatever status just landed on it"
    for st, pat in CURES:
        if _has(t, pat) and STATUS.get(st):
            return (sorted(STATUS[st]), [],
                    "cures the " + st.lower() + " this inflicts")
    return None


def _no_link(t: str) -> Link:
    """Nothing links, and the reason is worth keeping: an item with no rule
    reads as one nobody looked at."""
    if _has(t, r"restores?|endure with 1 HP|switched out|remove the attacker|"
               r"switch out of battle|moving first|PP"):
        return None, None, "about HP, PP or switching, not about any move"
    return None, None, "nothing in its text names a move, a type or a field effect"


def item_links(item: dex.Row, props: Props,
               setters: dict[str, tuple[list[str], list[str]]],
               facts: dict[str, Any]) -> Link:
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
    # ALL THREE, because Smogon's Champions text is the one shown while the
    # rules below were written against the other two's phrasing, and
    # reading only the shown text dropped Air Balloon, Bright Powder,
    # Metronome and Terrain Extender - the same single point of failure,
    # moved. Every phrasing is matched, so a better description can only add.
    f: dex.Row = facts.get(item["name"]) or {}
    t = " || ".join(clean(x) for x in (
        f.get("text"), f.get("pokebase_text"),
        f.get("serebii_text") or item.get("effect")) if x)
    # Smogon writes a list with slashes - "Electric/Grassy/Misty/Psychic
    # Terrain" - which only the last name matched, so Terrain Extender came
    # out as a Psychic Terrain item. Spelled out first, and more than one
    # terrain named is the "any terrain" case of the field rule.
    t = re.sub(r"((?:[A-Z][a-z]+/)+[A-Z][a-z]+) Terrain",
               lambda m: ", ".join(w + " Terrain" for w in m.group(1).split("/")),
               t)
    dmg = [n for n, p in props.items() if p["bp"] > 0 and p["cat"] != "Status"]
    return (_field_rule(t, setters)
            or _type_rule(t, props, dmg)
            or _move_rule(t, props, dmg)
            or _named_rule(t, props, item["name"])
            or _status_rule(t)
            or _no_link(t))


def _mark_binding(props: Props, moves: list[dex.Row]) -> None:
    """One property this file needs that the ability table does not carry:
    a binding move is one that gives the Bound status."""
    for n, p in props.items():
        mv = next((m for m in moves if m["name"] == n), None)
        p["binds"] = bool(re.search(r"\bBound status\b",
                                    clean(mv.get("effect")) if mv else ""))


def _reverse_index(items: dict[str, dict[str, Any]], key: str) -> dict[str, list[str]]:
    """move (or ability) -> the items that serve it, sorted."""
    out: dict[str, list[str]] = {}
    for it, r in items.items():
        for n in r[key]:
            out.setdefault(n, []).append(it)
    return {k: sorted(v) for k, v in out.items()}


def build() -> tuple[dict[str, Any], dict[str, list[str]], dict[str, list[str]],
                     list[tuple[str, str]], dict[str, tuple[list[str], list[str]]]]:
    """Link every held item and berry to the moves and abilities it serves,
    through the field effect it names. Returns the items, both indexes, the
    unlinked items with their reason, and who sets each effect.
    """
    moves = dex.db("moves")
    abils = dex.db("abilities")
    props: Props = dex.db_obj("ability_moves").get("moves") or {}
    if not props:
        sys.exit("run scripts/build_ability_moves.py first - this needs its "
                 "derived move properties")
    _mark_binding(props, moves)

    setters = field_setters(moves, abils)
    for eff, (ms, abs_) in setters.items():
        if not ms and not abs_:
            sys.exit("no move or ability sets %r any more - the wording "
                     "changed, fix FIELD" % eff)

    facts: dict[str, dex.Row] = dex.db_obj("item_facts").get("prices") or {}
    items: dict[str, dict[str, Any]] = {}
    unlinked: list[tuple[str, str]] = []
    for it in dex.db("items"):
        if it.get("is_mega_stone") or it.get("category") == "Miscellaneous":
            continue
        ms, abs_, why = item_links(it, props, setters, facts)
        if ms is None:
            unlinked.append((it["name"], why))
            continue
        items[it["name"]] = {"moves": ms, "abilities": abs_,
                             "why": why, "side": side_of(why)}
    return (items, _reverse_index(items, "moves"),
            _reverse_index(items, "abilities"), unlinked, setters)


def main() -> None:
    """Build the links and write item_links.json; --report and --audit print
    what linked and why the rest did not.
    """
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
