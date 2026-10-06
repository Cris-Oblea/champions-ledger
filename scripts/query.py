"""Fast cross-source lookups over the Pokemon Champions database.

This is the command line. Loading, name matching and the shared lookups are
in dex.py, which every other script imports; this file adds the commands and
the one thing they need that dex.py must not touch, the ledger.

Everything here is Champions-only (VGC doubles, bring 6 / pick 4). No data from
the console games is mixed in: move power, PP and flags come from the Champions
Attackdex, which differs from Scarlet/Violet.

Sources joined per query:
    data/db/*        Serebii    rules: what exists and what it does
    data/meta/usage_*    pokebase   what the ladder actually runs
    data/meta/tournament_*  pokedata   what placed at official events
    data/meta/smogon_analyses  Smogon  why a set is built that way
    the Supabase ledger         what YOU own (scripts/ledger.py)

Examples:
    python scripts/query.py moves --flag sound
    python scripts/query.py moves --priority +          # all priority moves
    python scripts/query.py moves --flag bullet --learners
    python scripts/query.py counter-priority            # what shuts priority off
    python scripts/query.py pokemon Garchomp
    python scripts/query.py ability Bulletproof
    python scripts/query.py usage --top 30
    python scripts/query.py speed --min 100
    python scripts/query.py worlds --top 16
    python scripts/query.py worlds --usage
    python scripts/query.py worlds --usage --division seniors
    python scripts/query.py worlds --usage --division all   # divisions compared
    python scripts/query.py owned
"""
import argparse
import contextlib
import io
import os
import re
import sys
import textwrap
from collections import Counter, defaultdict
from collections.abc import Sequence
from typing import Any

import ledger
from dex import (
    DIVISIONS,
    TYPES,
    Row,
    db,
    db_obj,
    find_pokemon,
    key,
    load,
    meta,
    meta_obj,
    norm,
    species_norm,
    stone_for,
    tournament,
    tournaments,
)
from paths import DB

# Windows consoles default to cp1252, which cannot encode the Korean and
# Japanese player names in the Worlds standings. Replace them instead of
# dying halfway through a dossier.
for _s in (sys.stdout, sys.stderr):
    if isinstance(_s, io.TextIOWrapper):     # not when a test swapped it out
        with contextlib.suppress(ValueError):
            _s.reconfigure(errors="replace")


# --------------------------------------------------------------------------
# indexes
# --------------------------------------------------------------------------
def division_shares(name: str) -> list[tuple[str, int, int]]:
    """[(division, n, total)] - how many teams in each division ran `name`."""
    target = norm(name)
    rows = []
    for d, t in tournaments():
        players = t.get("players", [])
        n = sum(1 for pl in players for slot in pl.get("team", [])
                if norm(slot.get("pokemon")) == target)
        rows.append((d, n, len(players)))
    return rows


def usage_index() -> dict[str, float]:
    """name -> usage percent, from the pokebase ladder data."""
    rows = meta_obj("usage_pokemon").get("rows", [])
    idx = {}
    for r in rows:
        idx[norm(r["name"])] = r["usage_percent"]
    return idx


def usage_of(name: str, idx: dict[str, float] | None = None) -> float | None:
    """A Pokemon's ladder usage %, or None when pokebase lists it nowhere."""
    idx = idx if idx is not None else usage_index()
    return idx.get(norm(name))


def move_usage_index() -> dict[str, float]:
    """{move key: usage %} over every move on the ladder."""
    rows = meta_obj("usage_moves").get("rows", [])
    return {key(r["name"]): r["usage_percent"] for r in rows}


# --------------------------------------------------------------------------
# output helpers
# --------------------------------------------------------------------------
def table(rows: Sequence[Sequence[object]], headers: list[str]) -> None:
    if not rows:
        print("  (no results)")
        return
    rows = [[("" if c is None else str(c)) for c in r] for r in rows]
    widths = [max(len(headers[i]), *(len(r[i]) for r in rows))
              for i in range(len(headers))]
    line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(line)
    print("  ".join("-" * w for w in widths))
    for r in rows:
        print("  ".join(c.ljust(widths[i]) for i, c in enumerate(r)))


def pct(v: float | None) -> str:
    return "" if v is None else ("%.1f%%" % v)


def owned_sets() -> tuple[set[str], set[str], set[str], set[str]]:
    """(permanent, rental, stones, items) he owns, as sets of norm() keys /
    names - read from the live ledger through ledger.inv()."""
    inv = ledger.inv()
    perm = {norm(x) for x in inv.get("permanent_pokemon", [])}
    temp = {norm(x) for x in (inv.get("rental_pokemon", {}) or {}).get("list", [])}
    stones = set(inv.get("mega_stones", []))
    items = set()
    for v in (inv.get("items") or {}).values():
        if isinstance(v, list):
            items.update(v)
    return perm, temp, stones, items


def own_tag(name: str, perm: set[str], temp: set[str]) -> str:
    """ "OWN", "rent" or "" - the column the listings print beside a name."""
    n = norm(name)
    if n in perm:
        return "OWN"
    if n in temp:
        return "rent"
    return ""


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------
FLAGS = ["contact", "sound", "punch", "biting", "snatchable", "slicing",
         "bullet", "wind", "powder", "metronome", "gravity", "defrosts",
         "magic_coat", "protect_blocks", "mirror_move"]


def smogon_gloss(name: str) -> Row | None:
    """Smogon's one-line rules text for a move or ability.

    `data/db/smogon_basics.json` is a SECOND rules source sitting next to
    moves.json, and it often says what Serebii's Attackdex only names. Serebii
    writes "The user gains the Sealing Off status" and never defines it; Smogon
    writes "No foe can use any move known by the user". Same for Taunt's
    duration. Always show both - reading only one of them has produced wrong
    answers twice.
    """
    b = db("smogon_basics") or {}
    k = key(name)
    for bucket in ("moves", "abilities", "items"):
        for r in (b.get(bucket) or ()):
            if key(r.get("name") or "") == k:
                return r
    return None


def _worlds_teams_running(move_name: str) -> dict[str, tuple[int, int]]:
    """division -> (teams running the move, teams)."""
    counts: dict[str, tuple[int, int]] = {}
    for d, t in tournaments():
        n = sum(1 for pl in t.get("players", [])
                if any(key(x) == key(move_name)
                       for sl in pl.get("team", []) for x in (sl.get("moves") or ())))
        counts[d] = (n, len(t.get("players", [])))
    return counts


def _print_box_learners(mv: Row) -> None:
    """How many Pokemon in the format learn the move, and which of them are in
    his box ((r) = rental).
    """
    perm, temp, _, _ = owned_sets()
    mine = [(learner, own_tag(learner, perm, temp))
            for learner in mv.get("learners", [])
            if own_tag(learner, perm, temp)]
    print("\nLearners: %d in the format." % (mv.get("learner_count") or 0))
    if mine:
        print("In your box (%d): %s" % (len(mine), ", ".join(
            "%s%s" % (n, "" if t == "OWN" else " (r)") for n, t in sorted(mine))))
    else:
        print("Nothing in your box learns it.")


def _print_move_texts(mv: Row) -> None:
    """The move's text from Serebii and Smogon side by side, so a rebalance
    shows up as a disagreement.
    """
    print("\nSerebii: %s" % (mv.get("effect") or "-"))
    if mv.get("in_depth"):
        print("         %s" % mv["in_depth"][:600])
    g = smogon_gloss(mv["name"])
    if g:
        print("\nSmogon:  %s" % (g.get("description") or "-"))
        if g.get("flags"):
            print("         flags: %s" % ", ".join(g["flags"]))
    else:
        print("\nSmogon:  (not in smogon_basics)")
    # ...and the whole of it, which is what the dex page prints: the one-liner
    # above says "Traps target"; this says what ends it and what escapes it.
    full = (db_obj("smogon_text").get("moves") or {}).get(mv["name"])
    if full:
        print("\nSmogon, in full (smogon.com/dex/champions):")
        print(textwrap.fill(full, 78, initial_indent="         ",
                            subsequent_indent="         "))


def cmd_move(a: argparse.Namespace) -> None:
    """`query.py move <name>`: one move's numbers, flags, texts, ladder usage
    and who in the box learns it. An unknown name suggests the near matches.
    """
    mv = next((m for m in db("moves") if key(m["name"]) == key(a.name)), None)
    if not mv:
        near = [m["name"] for m in db("moves") if key(a.name) in key(m["name"])]
        print("No move called %r.%s" % (a.name,
              ("  Did you mean: " + ", ".join(near[:8])) if near else ""))
        return
    f = mv.get("flags") or {}
    print("=" * 78)
    print("%s   %s %s" % (mv["name"], mv.get("type"), mv.get("category")))
    print("=" * 78)
    print("Power %s | Accuracy %s | PP %s | Priority %s"
          % (mv.get("power"), mv.get("accuracy"), mv.get("pp"), mv.get("priority")))
    print("Target: %s" % mv.get("target"))
    _print_move_texts(mv)
    for field, why in (mv.get("rulings") or {}).items():
        print("\nRuling on %s: %s" % (field, why))
    on = [k for k, v in f.items() if v]
    if on:
        print("\nSerebii flags: %s" % ", ".join(on))

    mu = move_usage_index()
    print("\nLadder usage: %s" % pct(mu.get(key(mv["name"]))))
    counts = _worlds_teams_running(mv["name"])
    print("Worlds teams running it: %s"
          % ", ".join("%s %d/%d (%.1f%%)" % (d, n, m, 100.0 * n / m if m else 0)
                      for d, (n, m) in counts.items()))
    _print_box_learners(mv)


def _priority_ok(p: int | None, want: str | None) -> bool:
    """--priority: "+", "-" or an exact bracket; no filter when not given."""
    if not want:
        return True
    if p is None:
        return False
    if want == "+":
        return p > 0
    if want == "-":
        return p < 0
    return p == int(want)


def _move_matches(m: Row, a: argparse.Namespace) -> bool:
    """Does move row `m` pass every `query.py moves` filter in `a`?"""
    f = m.get("flags") or {}
    text = ((m.get("effect") or "") + " " + (m.get("in_depth") or "")).lower()
    basic = (
        # the Attackdex documents ~900 moves but only ~500 are useable in
        # Champions; the rest have no legal user in the format
        getattr(a, "all", False) or m.get("useable") is not False,
        not a.effect or a.effect.lower() in text,
        not a.flag or f.get(a.flag),
        not a.type or (m.get("type") or "").lower() == a.type.lower(),
        not a.category or (m.get("category") or "").lower() == a.category.lower(),
        not a.min_power or (m.get("power") or 0) >= a.min_power,
        not a.name or key(a.name) in key(m["name"]),
    )
    return (all(basic) and _priority_ok(m.get("priority"), a.priority)
            and (not a.learner or a.learner.lower() in [
                learner.lower() for learner in m.get("learners", [])]))


def _owned_box() -> dict[str, str]:
    """norm() key -> display name, "*" in front of a permanent.

    owned_sets() returns norm() keys, which are lowercased and token
    sorted ("alola ninetales"), so the display name is read straight from
    the ledger instead - he has to recognise these at a glance.
    """
    inv = ledger.inv()
    box = {}
    for x in inv.get("permanent_pokemon", []):
        box[norm(x)] = "*" + x
    for x in (inv.get("rental_pokemon", {}) or {}).get("list", []):
        box.setdefault(norm(x), x)
    return box


def _box_cells(m: Row, box: dict[str, str]) -> list[object]:
    """(how many box Pokemon learn it, the first six by name)."""
    mine = sorted({box[norm(learner)] for learner in m.get("learners", [])
                   if norm(learner) in box},
                  key=lambda x: (not x.startswith("*"), x))
    # A move half the box learns says nothing useful and wrecks the
    # table width; the count still carries the fact.
    shown = [x.lstrip("*") + ("" if x.startswith("*") else " (r)")
             for x in mine[:6]]
    if len(mine) > 6:
        shown.append("+%d more" % (len(mine) - 6))
    return [len(mine), ", ".join(shown) or "-"]


def _print_learner_counts(res: list[Row], a: argparse.Namespace) -> None:
    """Which Pokemon learn how many of the filtered moves, with ladder usage
    and ownership - the answer to "who learns all of these".
    """
    perm, temp, _, _ = owned_sets()
    ui = usage_index()
    print("\nPokemon that learn these moves (Champions legal):")
    counts = Counter()
    for m in res:
        for learner in m.get("learners", []):
            counts[learner] += 1
    rows = [[name, c, pct(usage_of(name, ui)), own_tag(name, perm, temp)]
            for name, c in counts.most_common(a.limit)]
    table(rows, ["Pokemon", "#Moves", "Usage", "You"])


def cmd_moves(a: argparse.Namespace) -> None:
    """`query.py moves`: the move list filtered by flag, type, category, effect
    text and power, most used first.
    """
    mu = move_usage_index()
    res = [m for m in db("moves") if _move_matches(m, a)]
    if a.used:
        res = [m for m in res if mu.get(key(m["name"])) is not None]
    res.sort(key=lambda m: (-(mu.get(key(m["name"])) or -1), -(m.get("power") or 0)))

    print("%d moves" % len(res))

    # --owned turns the list into "what can I actually field": every move gets
    # the Pokemon in the box that learn it, so a capability question ("who has
    # priority?") is answered without cross-referencing 500 learner lists by
    # hand. Permanents sort first because only they can be trained.
    box = _owned_box() if getattr(a, "owned", False) else {}

    rows = []
    for m in res[:a.limit]:
        row = [
            m["name"], m.get("type"), (m.get("category") or "")[:4],
            m.get("power"), m.get("accuracy"), m.get("pp"),
            m.get("priority"), m.get("learner_count"),
            pct(mu.get(key(m["name"]))),
        ]
        if box:
            row += _box_cells(m, box)
        rows.append(row)
    heads = ["Move", "Type", "Cat", "Pow", "Acc", "PP", "Pri", "Users", "Usage"]
    if box:
        heads += ["N", "In your box  (r) = rental"]
    table(rows, heads)
    if box:
        print("  N = how many of your %d box Pokemon learn it;"
              " permanents listed first." % len(box))

    if a.learners:
        _print_learner_counts(res, a)


def cmd_counter_priority(a: argparse.Namespace) -> None:
    """Everything that turns priority moves off, plus the priority moves themselves."""
    moves, abilities = db("moves"), db("abilities")

    # "priority" plus any word that negates it. Kept broad on purpose: missing a
    # blocker is worse than showing one extra row.
    deny = ("unable", "cannot", "can't", "prevent", "protect", "block", "fail",
            "immune", "deny", "denies", "stop", "nullif", "negat")
    blockers = []
    for ab in abilities:
        e = (ab.get("effect") or "").lower()
        if "priority" in e and any(d in e for d in deny):
            blockers.append(("ability", ab["name"], ab.get("effect", ""),
                             ", ".join(ab.get("pokemon", [])[:6])))
    for m in moves:
        e = ((m.get("effect") or "") + " " + (m.get("in_depth") or "")).lower()
        if "priority" in e and any(d in e for d in deny):
            blockers.append(("move", m["name"], m.get("effect", ""),
                             "%d users" % m.get("learner_count", 0)))
    print("Priority denial (abilities and moves):")
    table([[k, n, (d or "")[:88], w] for k, n, d, w in blockers],
          ["Kind", "Name", "Effect", "Carriers"])

    print("\nPriority moves in the format (positive priority):")
    mu = move_usage_index()
    pr = [m for m in moves if (m.get("priority") or 0) > 0]
    pr.sort(key=lambda m: (-(m.get("priority") or 0),
                           -(mu.get(key(m["name"])) or -1)))
    table([[m["name"], m.get("priority"), m.get("type"), m.get("power"),
            m.get("learner_count"), pct(mu.get(key(m["name"])))]
           for m in pr[:a.limit]],
          ["Move", "Pri", "Type", "Pow", "Users", "Usage"])


def _print_megas(p: Row, stones: set[str]) -> None:
    """The Pokemon's Mega lines: typing, BST, ability, and whether the stone is
    owned.
    """
    megas = [m for m in db("pokemon")
             if m["is_mega"] and norm(m.get("species") or "") == norm(p["name"])]
    for m in megas:
        mb = m["base_stats"]
        stone = next((s for s in stones if norm(s).startswith(norm(p["name"])[:5])), None)
        print("  Mega        %s %s  BST %s  ability %s%s"
              % (m["name"], "/".join(m["types"]), mb["total"],
                 ", ".join(m["abilities"]), "  [stone owned]" if stone else ""))


def _movepool(name: str) -> list[str]:
    """The learnset filed under this name, its norm() spelling, or - for a
    cosmetic or gender form - the base species'."""
    learn = load(os.path.join(DB, "learnsets.json"), {}) or {}
    return (learn.get(name)
            or next((v for k, v in learn.items() if norm(k) == norm(name)), None)
            or next((v for k, v in learn.items()
                     if species_norm(k) == species_norm(name)), None)
            or [])


def _print_movepool_table(mv: list[str]) -> None:
    """A movepool as a table: type, category, BP, accuracy and ladder usage,
    strongest first.
    """
    mu = move_usage_index()
    byname = {m["name"]: m for m in db("moves")}
    rows = []
    for name in mv:
        m = byname.get(name)
        if not m:
            continue
        rows.append([name, m.get("type"), (m.get("category") or "")[:4],
                     m.get("power"), m.get("accuracy"), m.get("pp"),
                     m.get("priority"), pct(mu.get(norm(name)))])
    rows.sort(key=lambda r: -(float(r[7].rstrip("%")) if r[7] else -1))
    table(rows, ["Move", "Type", "Cat", "Pow", "Acc", "PP", "Pri", "Usage"])


def cmd_pokemon(a: argparse.Namespace) -> None:
    """`query.py pokemon <name>`: one form's stats, abilities, usage,
    ownership, Megas, movepool and Smogon's analysis.
    """
    p = find_pokemon(a.name)
    if not p:
        print("Not found in the Champions dex: %s" % a.name)
        return
    ui = usage_index()
    perm, temp, stones, _ = owned_sets()
    bs = p["base_stats"]
    print("%s  #%s  %s" % (p["name"], p["dex"], "/".join(p["types"])))
    print("  Base stats  HP %s  Atk %s  Def %s  SpA %s  SpD %s  Spe %s  (BST %s)"
          % (bs["hp"], bs["atk"], bs["def"], bs["spa"], bs["spd"], bs["spe"], bs["total"]))
    # Serebii's qualifier where it gives one, e.g. "Battle Bond (Alternate
    # Greninja Only)" - its words, not a rule the player has confirmed
    notes = p.get("ability_notes") or {}
    print("  Abilities   %s" % ", ".join(
        a + (" (%s, per Serebii)" % notes[a] if a in notes else "")
        for a in p["abilities"]))
    u = usage_of(p["name"], ui)
    print("  Ladder use  %s" % (pct(u) if u is not None else "not in usage data"))
    tag = own_tag(p["name"], perm, temp)
    print("  You own it  %s" % ("yes (permanent)" if tag == "OWN" else
                                "rental only" if tag == "rent" else "no"))
    _print_megas(p, stones)

    mv = _movepool(p["name"])
    print("\n  Movepool: %d moves" % len(mv))
    if a.moves:
        _print_movepool_table(mv)

    show_smogon(p["name"])


def _print_moveset(ms: Row) -> None:
    """One Smogon set: moves slot by slot, then items, abilities, natures and
    spread.
    """
    print("\n  [%s]" % ms["name"])
    for slot in ms["moveslots"]:
        print("    - " + " / ".join(slot))
    if ms["items"]:
        print("    Item:    %s" % " / ".join(ms["items"]))
    if ms["abilities"]:
        print("    Ability: %s" % " / ".join(ms["abilities"]))
    if ms["natures"]:
        print("    Nature:  %s" % " / ".join(ms["natures"]))
    for sp in ms["stat_points"]:
        print("    SP:      %s" % " / ".join(
            "%s %s" % (k.upper(), v) for k, v in sp.items() if v))
    if ms.get("explanation"):
        print("    " + ms["explanation"].replace("\n", "\n    "))


def show_smogon(name: str) -> None:
    """Smogon's written VGC analysis for a Pokemon: each format's overview and
    sets, or a line saying there is none.
    """
    sm = meta("smogon_analyses")
    if not sm:
        return
    entry = next((e for e in sm.get("pokemon", []) if norm(e["name"]) == norm(name)),
                 None)
    if entry is None:
        print("\n  Smogon: no entry found.")
        return
    if not entry.get("vgc_strategies"):
        print("\n  Smogon: no written VGC analysis for this Pokemon yet.")
        return
    for st in entry["vgc_strategies"]:
        print("\n  --- Smogon %s ---" % st["format"])
        if st.get("overview"):
            print("  " + st["overview"].replace("\n", "\n  "))
        for ms in st.get("movesets", []):
            _print_moveset(ms)


# The order a spread is written in, and how each stat is spelled, everywhere
# in this project. "Hp" from a bare .capitalize() is not how anyone writes it.
SP_ORDER = [("hp", "HP"), ("atk", "Atk"), ("def", "Def"),
            ("spa", "SpA"), ("spd", "SpD"), ("spe", "Spe")]


def print_splits(name: str) -> None:
    """What the people who brought THIS Pokemon actually ran.

    pokebase publishes it per Pokemon and `fetch_pokebase_splits.py` stores
    both of its datasets. Nothing here read either of them until now, which
    meant the richest per-Pokemon data in the project was reachable from the
    phone and not from the command line that answers questions about it.

    THE TWO BLOCKS ARE NOT THE SAME MEASUREMENT and are printed apart and
    labelled, because merging them is the bug this whole file was rebuilt to
    stop. In `tournament` the MOVE column is a share of move SLOTS - it sums
    to ~100 over the whole movepool, so its top row sits near 25 and "Fake Out
    24.6%" means nearly every one of them ran it - while items, abilities,
    natures and spreads are per SET and read directly. `season` is the ladder
    and is per SET throughout; it is missing entirely for a Pokemon that was
    not ranked that season.
    """
    blob = meta("usage_splits") or {}
    row = (blob.get("pokemon") or {}).get(name)
    if not row:
        # a Mega is filed under the species people ladder with
        p = find_pokemon(name) or {}
        row = (blob.get("pokemon") or {}).get(p.get("species") or "")
    if not row:
        return

    def line(label: str, rows: list[Row] | None, n: int = 8) -> None:
        """One labelled line of the top entries, with their percentages."""
        if not rows:
            return
        print("  %-10s %s" % (label, ", ".join(
            "%s %s%%" % (r["name"], r["percent"])
            for r in rows[:n] if "percent" in r)))

    t = row.get("tournament") or {}
    if any(t.get(k) for k in ("moves", "items", "abilities", "natures")):
        print("\nWhat its players ran [pokebase, %s tournaments, fetched %s]"
              % (t.get("regulation") or "?", blob.get("fetched") or "?"))
        line("Moves:", t.get("moves"), 12)
        print("             ^ share of move SLOTS, so ~25% is nearly all of "
              "them")
        line("Items:", t.get("items"))
        line("Ability:", t.get("abilities"))
        line("Nature:", t.get("natures"))
        for sp in (t.get("spreads") or [])[:3]:
            # HP / Atk / Def / SpA / SpD / Spe, which is how a spread is
            # written everywhere else. Sorting the keys alphabetically read
            # "2 ATK / 32 HP / 32 SPD" and nobody writes one that way.
            vals = sp.get("sp") or {}
            print("  %-10s %s  %s%%"
                  % ("Spread:", " / ".join(
                      "%d %s" % (vals[k], lab) for k, lab in SP_ORDER
                      if vals.get(k)), sp["percent"]))
        line("Alongside:", t.get("teammates"))

    se = row.get("season") or {}
    if se.get("moves"):
        print("\nLadder [%s, %s]  rank %s of %s"
              % (se.get("name") or "?", se.get("dates") or "?",
                 se.get("rank"), se.get("of")))
        line("Moves:", se.get("moves"), 10)
        print("             ^ share of SETS here, NOT the same measure as above")
        line("Items:", se.get("items"))
        line("Ability:", se.get("abilities"))
        line("Nature:", se.get("natures"))


def cmd_brief(a: argparse.Namespace) -> None:
    """Everything known about one Pokemon, in one place.

    Smogon only has written analyses for ~53 Pokemon. For the rest this is the
    raw material to reason from: what the ladder runs, what actually placed at
    Worlds, who it is played next to, and where it sits on the speed chart.
    """
    p = find_pokemon(a.name)
    if not p:
        print("Not found in the Champions dex: %s" % a.name)
        return
    name, bs = p["name"], p["base_stats"]
    perm, temp, stones, _ = owned_sets()
    ui = usage_index()

    print("=" * 78)
    print("%s   #%s   %s" % (name, p["dex"], "/".join(p["types"])))
    print("=" * 78)
    print("HP %s | Atk %s | Def %s | SpA %s | SpD %s | Spe %s | BST %s"
          % (bs["hp"], bs["atk"], bs["def"], bs["spa"], bs["spd"], bs["spe"],
             bs["total"]))
    print("Abilities: %s" % ", ".join(p["abilities"]))
    tag = own_tag(name, perm, temp)
    print("You own:   %s" % ("permanent" if tag == "OWN" else
                             "rental (2500 VP to keep)" if tag == "rent" else "no"))
    megas = [m for m in db("pokemon")
             if m["is_mega"] and norm(m.get("species") or "") == norm(name)]
    for m in megas:
        mb = m["base_stats"]
        st = [s for s in stones if norm(s)[:5] == norm(name)[:5]]
        print("Mega:      %s %s BST %s, %s%s"
              % (m["name"], "/".join(m["types"]), mb["total"],
                 ", ".join(m["abilities"]),
                 "  [stone owned]" if st else "  [stone 2000 VP]"))

    u = usage_of(name, ui)
    print("\nLadder usage (pokebase): %s" % (pct(u) if u is not None else "n/a"))

    # --- what actually placed at the World Championship ---
    tour = tournament("masters")
    if tour:
        players = tour.get("players", [])
        target = norm(name)
        entries = [(pl, slot) for pl in players for slot in pl.get("team", [])
                   if norm(slot.get("pokemon")) == target]
        others = [(d, n, tot) for d, n, tot in division_shares(name)
                  if d != "masters"]
        if entries:
            n = len(players)
            print("Worlds usage: %d of %d Masters teams (%.1f%%)%s"
                  % (len(entries), n, 100.0 * len(entries) / n,
                     ("   [" + ", ".join(
                         "%s %.1f%% (%d/%d)" % (d, 100.0 * c / tot if tot else 0, c, tot)
                         for d, c, tot in others) + "]") if others else ""))
            items = Counter(s.get("item") for _, s in entries if s.get("item"))
            abil = Counter(s.get("ability") for _, s in entries if s.get("ability"))
            nat = Counter(s.get("nature") for _, s in entries if s.get("nature"))
            mvs = Counter(m for _, s in entries for m in (s.get("moves") or ()))
            tot = len(entries)

            def dist(c: Counter[str], label: str) -> None:
                """The six most common values of one field, as percentages."""
                bits = ["%s %.0f%%" % (k, 100.0 * v / tot) for k, v in c.most_common(6)]
                print("  %-9s %s" % (label, ", ".join(bits)))
            dist(items, "Items:")
            dist(abil, "Ability:")
            dist(nat, "Nature:")
            print("  Moves:    %s" % ", ".join(
                "%s %.0f%%" % (k, 100.0 * v / tot) for k, v in mvs.most_common(10)))

            mates = Counter(o.get("pokemon") for pl, _ in entries
                            for o in pl.get("team", [])
                            if norm(o.get("pokemon")) != target)
            print("  Partners: %s" % ", ".join(
                "%s %.0f%%" % (k, 100.0 * v / tot) for k, v in mates.most_common(8)))

            best = min(entries, key=lambda e: e[0]["rank"])
            pl, slot = best
            print("  Best finish: #%s %s [%s] %s"
                  % (pl["rank"], pl["player"], pl.get("country") or "",
                     pl.get("record") or ""))
            print("     %s @ %s, %s, %s | %s"
                  % (slot.get("pokemon"), slot.get("item"), slot.get("ability"),
                     slot.get("nature"), ", ".join(slot.get("moves") or [])))
        else:
            print("Worlds usage: no Masters team ran it%s"
                  % ("   [" + ", ".join("%s %d/%d" % (d, c, tot)
                                        for d, c, tot in others) + "]"
                     if others else ""))

    # --- what THIS Pokemon's own players run ---
    print_splits(name)

    # --- speed context ---
    tiers = meta_obj("speed_tiers").get("rows", [])
    for t in tiers:
        if any(norm(x["name"]) == norm(name) for x in t["pokemon"]):
            s = t["speeds"]
            print("\nSpeed tier %s: max+ %s | max neutral %s | 0 neutral %s | scarf %s"
                  % (t["base_speed"], s.get("max"), s.get("neuMax"),
                     s.get("neu0"), s.get("maxScarf")))
            peers = [x["name"] for x in t["pokemon"] if norm(x["name"]) != norm(name)]
            if peers:
                print("  Same tier: %s" % ", ".join(peers[:10]))
            break

    show_smogon(name)


def stone_owner_map() -> dict[str, str]:
    """Mega Stone name -> the species it works on, read from the item text."""
    out = {}
    for it in db("items"):
        if not it.get("is_mega_stone"):
            continue
        m = re.search(r"\b(?:An?|The)\s+([A-Z][\w'\-]*(?:\s[A-Z][\w'\-]*)?)\s+holding this stone",
                      it.get("effect") or "")
        if m:
            out[it["name"]] = m.group(1).strip()
    return out


def worlds_mega_counts() -> tuple[Counter[str], int]:
    """How often each species actually Mega Evolved at Worlds.

    Teamlists name the base Pokemon and put the stone in the item slot, so a
    Mega shows up as e.g. Staraptor holding Staraptite, never "Mega Staraptor".
    """
    tour = tournament("masters")
    if not tour:
        return Counter(), 0
    stones = {key(i["name"]) for i in db("items") if i.get("is_mega_stone")}
    counts = Counter()
    players = tour.get("players", [])
    for pl in players:
        for slot in pl.get("team", []):
            if slot.get("item") and key(slot["item"]) in stones:
                counts[norm(slot.get("pokemon"))] += 1
    return counts, len(players)


# Abilities that change an offensive stat outright, rather than move power.
STAT_ABILITY = {"Huge Power": ("atk", 2.0), "Pure Power": ("atk", 2.0)}


def mega_profile(m: Row) -> tuple[str, str, int, str]:
    """What a Mega is actually FOR: role, the offensive stat that matters, bulk.

    The raw stat block lies about several of these. Mega Mawile reads SpA 55 and
    is one of the hardest physical hitters in the game, because Huge Power
    doubles its Attack to 210 - so the ability has to be folded in before any
    role is assigned.
    """
    bs = m["base_stats"]
    atk, spa = float(bs["atk"]), float(bs["spa"])
    label = ""
    for ab in m["abilities"]:
        if ab in STAT_ABILITY:
            stat, mult = STAT_ABILITY[ab]
            if stat == "atk":
                atk *= mult
            else:
                spa *= mult
            label = " (%s x%g)" % (ab, mult)
    bulk = bs["hp"] + bs["def"] + bs["spd"]
    off = max(atk, spa)
    if off < 100 and bulk >= 280:
        role = "wall/support"
    elif atk >= spa * 1.2:
        role = "physical"
    elif spa >= atk * 1.2:
        role = "special"
    else:
        role = "mixed"
    if role in ("physical", "special", "mixed") and bulk >= 330:
        role += "+bulk"

    if role.startswith("physical"):
        stat_txt = "Atk %g%s" % (atk, label)
    elif role.startswith("special"):
        stat_txt = "SpA %g" % spa
    else:
        stat_txt = "Atk %g / SpA %g%s" % (atk, spa, label)

    spe = bs["spe"]
    tempo = ("fast" if spe >= 110 else "mid" if spe >= 80
             else "slow" if spe >= 60 else "Trick Room")
    return role, stat_txt, bulk, "%d %s" % (spe, tempo)


def cmd_megas(_a: argparse.Namespace) -> None:
    """`query.py megas`: every Mega line - base vs Mega, the stone, whether he
    owns it and the species, what a stone or keeping a rental would cost,
    and how often Worlds teams brought it."""
    inv = ledger.inv()
    perm = inv.get("permanent_pokemon", [])
    rentinfo = inv.get("rental_pokemon", {}) or {}
    rent = rentinfo.get("list", [])
    stones = set(inv.get("mega_stones", []))
    econ = (inv.get("economy", {}) or {}).get("costs", {}) or {}
    stone_vp = econ.get("mega_stone_shop", 2000)
    keep_vp = econ.get("keep_rental_pokemon", 2500)
    owner = stone_owner_map()
    wcounts, wtotal = worlds_mega_counts()
    builds = {norm(str(b.get("pokemon"))) for b in ledger.builds()}
    bases = {norm(p["name"]): p for p in db("pokemon") if not p["is_mega"]}

    rows = []
    for m in db("pokemon"):
        if not m["is_mega"]:
            continue
        sp = m.get("species")
        is_perm = any(norm(x) == norm(sp) for x in perm)
        is_rent = any(norm(x) == norm(sp) for x in rent)
        stone = next((s for s, o in owner.items() if norm(o) == norm(sp)), None)
        # X/Y share a species: pick the stone whose name matches the suffix
        matches = [s for s, o in owner.items() if norm(o) == norm(sp)]
        if len(matches) > 1:
            suf = m["name"].rsplit(" ", 1)[-1]
            stone = next((s for s in matches if s.endswith(" " + suf)), matches[0])
        has_stone = stone in stones

        if is_perm:
            cost = "-" if has_stone else "%d VP" % stone_vp
        elif is_rent:
            # A rental can already Mega Evolve; the ticket buys the right to TRAIN it.
            need = 0 if has_stone else stone_vp
            cost = ("%d VP + 1 ticket  (or %d VP)" % (need, need + keep_vp)
                    if need else "1 ticket  (or %d VP)" % keep_vp)
        else:
            if not has_stone:
                continue
            cost = "Encounter only"

        base = bases.get(norm(sp))
        bty, mty = "/".join((base or {}).get("types") or []), "/".join(m["types"])
        gained = ", ".join(m["abilities"])
        lost = [x for x in ((base or {}).get("abilities") or ()) if x not in m["abilities"]]
        wor = wcounts.get(norm(sp), 0)
        role, stat_txt, bulk, tempo = mega_profile(m)
        base_role = mega_profile(base)[0] if base else "?"
        shift = "" if base_role == role else "  (base: %s)" % base_role
        rows.append([role + shift, m["name"],
                     mty if bty == mty else "%s (was %s)" % (mty, bty),
                     stat_txt, tempo, bulk, gained, ", ".join(lost) or "-",
                     "%d (%.0f%%)" % (wor, 100.0 * wor / wtotal) if wor else "-",
                     "yes" if norm(sp) in builds else "-", cost])

    print("Rule: a team of 6 may hold several Mega Stones, but only ONE Pokemon")
    print("can Mega Evolve per battle. A second stone is matchup flexibility at")
    print("team preview (you pick 4 of 6), not two active Megas.")
    print("Role folds the ability in, so Mega Mawile reads as the physical")
    print("attacker it is (Huge Power doubles Attack) and not as its SpA 55.")
    print("A rental CAN Mega Evolve, but cannot be TRAINED - the ticket or")
    # What a rental COSTS is a rule and stays. What he HAS in VP is not
    # tracked (a balance nobody keeps current goes stale and then gets
    # quoted). Ask him if it ever matters.
    print("%d VP is what buys it a build.\n" % keep_vp)

    hdr = ["Role", "Mega", "Types", "Offense", "Speed", "Bulk",
           "Gains ability", "Loses", "Worlds", "Built", "Cost to build"]
    order = ["special", "physical", "mixed", "wall/support"]
    rows.sort(key=lambda r: (next((i for i, o in enumerate(order)
                                   if r[0].startswith(o)), 9), -r[5]))
    table(rows, hdr)


SP_BUDGET = 66
SP_MAX = 32


def _print_spread(sp: dict[str, Any] | None) -> None:
    """A build's Stat Points, flagged when they miss the 66 budget or pass 32
    in a stat.
    """
    if not sp:
        print("  SP     -- not recorded --")
        return
    total = sum(v for v in sp.values() if isinstance(v, int))
    over = [k for k, v in sp.items() if isinstance(v, int) and v > SP_MAX]
    spread = " / ".join("%s %s" % (k.upper(), v) for k, v in sp.items() if v)
    if total != SP_BUDGET:
        flag = "   *** %d SP, budget is %d ***" % (total, SP_BUDGET)
    elif over:
        flag = "   *** over %d in %s ***" % (SP_MAX, ", ".join(over))
    else:
        flag = "   (%d/%d SP, legal)" % (total, SP_BUDGET)
    print("  SP     %s%s" % (spread, flag))


def _print_build_moves(b: Row, learn: dict[str, list[str]],
                       moves_by: dict[str, Row]) -> None:
    """A build's moves, each checked against the form's movepool and shown with
    its usage.
    """
    mvs = b.get("moves") or []
    if not mvs:
        print("  moves  -- not recorded --")
        return
    print("  moves")
    legal = next((v for k, v in learn.items() if norm(k) == norm(b["pokemon"])), None)
    mu = move_usage_index()
    for name in mvs:
        m = moves_by.get(name)
        ok = "" if legal is None or name in legal else "  *** NOT LEGAL ***"
        if m:
            print("    %-16s %-9s %-8s pow %-4s acc %-4s pp %-3s %s%s"
                  % (name, m["type"], m["category"], m["power"] or "-",
                     m["accuracy"] or "-", m["pp"] or "-",
                     pct(mu.get(key(name))) or "", ok))
        else:
            print("    %-16s  *** unknown move ***" % name)


# Every other string field on the build is printed as a labelled note, so a
# field added to builds.json shows up here the same day instead of being
# silently dropped.
BUILD_FIELDS = {"pokemon", "mega", "ability", "mega_ability", "nature",
                "stat_points", "moves", "role", "rationale", "_missing"}


def _print_build_notes(b: Row) -> None:
    """A build's rationale and every free-text field it carries, as paragraphs.
    """
    if b.get("rationale"):
        print("\n  %s" % b["rationale"].replace(". ", ".\n  "))
    for k, v in b.items():
        if k in BUILD_FIELDS or not isinstance(v, str):
            continue
        print("\n  %s:\n    %s" % (k.replace("_", " ").upper(),
                                 v.replace(". ", ".\n    ")))
    if b.get("_missing"):
        print("\n  TODO: %s" % b["_missing"])


def _print_build(b: Row, learn: dict[str, list[str]], moves_by: dict[str, Row]) -> None:
    """One build in full: base stats, spread, nature, ability, moves with their
    checks, and its notes.
    """
    p = find_pokemon(b["pokemon"])
    print("=" * 74)
    title = b["pokemon"] + (" -> " + b["mega"] if b.get("mega") else "")
    print("%s   [%s]" % (title, b.get("role") or ""))
    print("=" * 74)
    if p:
        bs = p["base_stats"]
        print("  base   HP %s Atk %s Def %s SpA %s SpD %s Spe %s"
              % (bs["hp"], bs["atk"], bs["def"], bs["spa"], bs["spd"], bs["spe"]))
    mab = build_mega_ability(b)
    print("  abil   %s%s" % (build_ability(b) or "--",
                             " -> " + mab if mab else ""))
    nat = natures().get(b.get("nature") or "")
    print("  nature %s%s" % (b.get("nature") or "-- not recorded --",
                             "   (%s)" % nat["summary"] if nat else ""))
    _print_spread(b.get("stat_points"))
    _print_build_moves(b, learn, moves_by)
    _print_build_notes(b)
    print()


def cmd_build(a: argparse.Namespace) -> None:
    """Show the player's own builds and check them against the rules."""
    builds = ledger.builds()
    if a.name:
        builds = [b for b in builds if norm(a.name) in norm(b["pokemon"])]
    if not builds:
        print("No build recorded for %s" % (a.name or "anyone"))
        return
    learn = load(os.path.join(DB, "learnsets.json"), {}) or {}
    moves_by = {m["name"]: m for m in db("moves")}
    for b in builds:
        _print_build(b, learn, moves_by)



def typechart() -> dict[str, dict[str, float]]:
    return db("typechart") or {}


def natures() -> dict[str, Row]:
    return db("natures") or {}


# Abilities that change what a type does to the holder. Typing alone is not the
# defensive profile: Rotom-Wash is Ground-immune through Levitate, and a chart
# that ignores that hides the answer to half the teambuilding questions.
ABILITY_DEFENCE = {
    "Levitate": {"Ground": 0.0},
    "Eelevate": {"Ground": 0.0},
    "Flash Fire": {"Fire": 0.0},
    "Water Absorb": {"Water": 0.0},
    "Storm Drain": {"Water": 0.0},
    "Dry Skin": {"Water": 0.0, "Fire": 1.25},
    "Volt Absorb": {"Electric": 0.0},
    "Lightning Rod": {"Electric": 0.0},
    "Motor Drive": {"Electric": 0.0},
    "Sap Sipper": {"Grass": 0.0},
    "Earth Eater": {"Ground": 0.0},
    "Well-Baked Body": {"Fire": 0.0},
    "Wind Rider": {"Flying": 0.0},
    "Thick Fat": {"Fire": 0.5, "Ice": 0.5},
    "Heatproof": {"Fire": 0.5},
    "Water Bubble": {"Fire": 0.5},
    "Purifying Salt": {"Ghost": 0.5},
}


def sole_ability(name: str | None) -> str | None:
    """The ability of a species that only has one - which is not a choice.

    Aegislash is Stance Change, Clawitzer is Mega Launcher, and every one of
    the 81 Megas is a single line, so a build that records no ability for one
    of them is not undecided: the app's <select> had one option and could never
    fire its own onchange, so it could save null. The app writes it, and
    resolves it the same way for any row saved without it.
    Where the species really offers two or three, this returns None and the
    choice stays his.
    """
    p = find_pokemon(name) if name else None
    ab = (p or {}).get("abilities") or []
    return ab[0] if len(ab) == 1 else None


def build_ability(b: Row) -> str | None:
    """The ability a build runs as a base form."""
    return b.get("ability") or sole_ability(b.get("pokemon"))


def build_mega_ability(b: Row) -> str | None:
    """...and the one the stone turns it into, if the build carries one."""
    if not b.get("mega"):
        return None
    return b.get("mega_ability") or sole_ability(b["mega"])


def build_abilities() -> dict[str, str | None]:
    """Pokemon name -> the ability the player actually runs, from builds.json."""
    out = {}
    for b in ledger.builds():
        out[norm(b["pokemon"])] = build_ability(b)
        mab = build_mega_ability(b)
        if mab:
            out[norm(b["mega"])] = mab
    return out


def defence(types: list[str], chart: dict[str, dict[str, float]] | None = None,
            abilities: str | list[str] | None = None) -> dict[str, float]:
    """Multiplier taken from every attacking type.

    `abilities` may be a single ability name or a list; any defensive effect it
    has is applied on top of the type chart.
    """
    chart = chart or typechart()
    out = {}
    for atk in TYPES:
        m = 1.0
        for d in types:
            m *= chart.get(atk, {}).get(d, 1)
        out[atk] = m
    if abilities:
        if isinstance(abilities, str):
            abilities = [abilities]
        for ab in abilities:
            for atk, mult in (ABILITY_DEFENCE.get(ab) or {}).items():
                out[atk] = out[atk] * mult if mult else 0.0
    return out


def canon_type(word: str) -> str | None:
    """A typed type ("elec", "Fairy") -> its canonical name, or None. Exact
    match first, then the unique-looking prefix."""
    w = key(word)
    for t in TYPES:
        if key(t) == w:
            return t
    for t in TYPES:
        if key(t).startswith(w):
            return t
    return None


def cmd_types(a: argparse.Namespace) -> None:
    """Defensive profile of one Pokemon, or of a bare type combination."""
    types = [t for t in (canon_type(x) for x in a.name.replace("/", " ").split()) if t]
    label = "/".join(types)
    if not types:
        p = find_pokemon(a.name)
        if not p:
            print("Not found: %s" % a.name)
            return
        chosen = build_abilities().get(norm(p["name"]))
        ab = [chosen] if chosen else list(p["abilities"])
        types = p["types"]
        label = "%s  (%s)%s" % (p["name"], "/".join(p["types"]),
                                "  [%s]" % chosen if chosen else "")
        d = defence(types, None, ab)
        print("=" * 62)
        print(label)
        print("=" * 62)
        _show_defence(d)
        return
    d = defence(types)
    print("=" * 62)
    print(label)
    print("=" * 62)
    _show_defence(d)


def _show_defence(d: dict[str, float]) -> None:
    """A typing's weaknesses and resistances grouped by multiplier."""
    for tag, test in (("x4", lambda m: m == 4), ("x2", lambda m: m == 2),
                      ("x0.5", lambda m: m == 0.5), ("x0.25", lambda m: m == 0.25),
                      ("x0", lambda m: m == 0)):
        hit = [t for t in TYPES if test(d[t])]
        if hit:
            print("  %-6s %s" % (tag, ", ".join(hit)))
    neutral = [t for t in TYPES if d[t] == 1]
    if neutral:
        print("  %-6s %s" % ("x1", ", ".join(neutral)))


def cmd_resist(a: argparse.Namespace) -> None:
    """Who resists ALL of the given attacking types - the coverage question."""
    want = [t for t in (canon_type(x) for x in a.types) if t]
    if not want:
        print("Name at least one type. Example: query.py resist ice fairy")
        return
    chart = typechart()
    perm, temp, _, _ = owned_sets()
    ui = usage_index()
    builds = {b["pokemon"] for b in ledger.builds()}
    ba = build_abilities()

    rows = []
    for p in db("pokemon"):
        chosen = ba.get(norm(p["name"]))
        # A built Pokemon uses the ability it actually runs; anything else is
        # judged on its best possible ability, marked with * so it reads as a
        # maybe rather than a fact.
        use = [chosen] if chosen else list(p["abilities"])
        d = defence(p["types"], chart, use)
        worst = max(d[t] for t in want)
        if worst > (a.max or 0.5):
            continue
        own = own_tag(p["name"], perm, temp)
        if a.owned and not own:
            continue
        built = "yes" if any(norm(b) == norm(p["name"]) or
                             norm(b) == norm(p.get("species") or "") for b in builds) else ""
        via = ""
        if not chosen:
            plain = defence(p["types"], chart)
            helper = [ab for ab in p["abilities"]
                      if any(plain[t] > d[t] for t in want if ab in ABILITY_DEFENCE)]
            if helper:
                via = " *needs %s" % helper[0]
        elif ABILITY_DEFENCE.get(chosen):
            plain = defence(p["types"], chart)
            if any(plain[t] > d[t] for t in want):
                via = " (%s)" % chosen
        rows.append([p["name"], "/".join(p["types"]),
                     " ".join("%s x%g" % (t, d[t]) for t in want) + via,
                     pct(ui.get(norm(p["name"]))) or "", own, built])
    rows.sort(key=lambda r: (r[4] == "", r[0]))
    print("Resists %s  (worst multiplier <= x%g)"
          % (" and ".join(want), a.max or 0.5))
    table(rows, ["Pokemon", "Types", "Takes", "Usage", "You", "Built"])


def cmd_nature(a: argparse.Namespace) -> None:
    """`query.py nature [name]`: which stat each nature raises and lowers."""
    nat = natures()
    if a.name:
        hit = {k: v for k, v in nat.items() if key(a.name) in key(k)}
        if not hit:
            print("No such nature: %s" % a.name)
            return
    else:
        hit = nat
    rows = []
    for name in sorted(hit):
        v = hit[name]
        rows.append([name, v["summary"],
                     ("+%s" % v["raises"].upper()) if v["raises"] else "-",
                     ("-%s" % v["lowers"].upper()) if v["lowers"] else "-"])
    table(rows, ["Nature", "Summary", "Raises", "Lowers"])


def _core_hits(members: list[Row],
               prof: dict[str, dict[str, float]]) -> list[list[Any]]:
    """[attacking type, how many members it hits for 2x+, who and how hard],
    most members first."""
    rows = []
    for t in TYPES:
        hits = [(m["name"], prof[m["name"]][t]) for m in members
                if prof[m["name"]][t] >= 2]
        if hits:
            rows.append([t, len(hits),
                         ", ".join("%s x%g" % (n, v) for n, v in hits)])
    rows.sort(key=lambda r: (-r[1], -max(float(x.split("x")[-1])
                                         for x in r[2].split(", "))))
    return rows


def _patches(members: list[Row], holes: list[str], chart: dict[str, dict[str, float]],
             ba: dict[str, str | None]) -> list[list[Any]]:
    """Every owned Pokemon outside the core that resists one of the holes."""
    perm, temp, _, _ = owned_sets()
    builds = {b["pokemon"] for b in ledger.builds()}
    ui = usage_index()
    have = {m["name"] for m in members}
    cand = []
    for q in db("pokemon"):
        own = own_tag(q["name"], perm, temp)
        if q["name"] in have or not own:
            continue
        chosen = ba.get(norm(q["name"]))
        d = defence(q["types"], chart, [chosen] if chosen else list(q["abilities"]))
        covered = [t for t in holes if d[t] <= 0.5]
        if not covered:
            continue
        built = "yes" if any(norm(b) == norm(q["name"]) or
                             norm(b) == norm(q.get("species") or "")
                             for b in builds) else ""
        cand.append([len(covered), q["name"], "/".join(q["types"]),
                     ", ".join("%s x%g" % (t, d[t]) for t in covered),
                     pct(ui.get(norm(q["name"]))) or "", own, built])
    cand.sort(key=lambda r: (-r[0], r[6] == "", r[1]))
    return cand


def cmd_core(a: argparse.Namespace) -> None:
    """Combined defensive profile of a partial team, and what patches the holes.

    A hole is an attacking type that hits two or more members for at least
    double. Those are the moves that trade one turn for two Pokemon, which in
    doubles is how games are lost.
    """
    chart = typechart()
    members = []
    for term in a.names:
        p = find_pokemon(term)
        if not p:
            print("Not found: %s" % term)
            return
        members.append(p)

    print("=" * 74)
    print("Core: %s" % ", ".join("%s (%s)" % (m["name"], "/".join(m["types"]))
                                 for m in members))
    print("=" * 74)

    ba = build_abilities()
    prof = {m["name"]: defence(m["types"], chart, ba.get(norm(m["name"])))
            for m in members}
    rows = _core_hits(members, prof)
    if rows:
        print("\n  Attacking types that hit this core for 2x or more:")
        table(rows, ["Type", "Hits", "Who"])
    else:
        print("\n  Nothing hits two of these for double.")

    holes = [r[0] for r in rows if r[1] >= 2]
    if not holes:
        print("\n  No shared hole: no single type doubles two members at once.")
        return

    print("\n  SHARED HOLES (2+ members at 2x or worse): %s" % ", ".join(holes))
    cand = _patches(members, holes, chart, ba)
    if not cand:
        print("  Nothing you own resists any of those.")
        return
    print("\n  What you own that resists them:")
    table([c[1:] for c in cand[:14]],
          ["Pokemon", "Types", "Resists", "Usage", "You", "Built"])


def cmd_ability(a: argparse.Namespace) -> None:
    """`query.py ability <name>`: an ability's text (Serebii, else pokebase or
    Smogon), Smogon's full text, ladder use, and every carrier with its usage
    and ownership.
    """
    abilities = db("abilities")
    t = key(a.name)
    hit = next((x for x in abilities if key(x["name"]) == t), None)
    if not hit:
        hit = next((x for x in abilities if t in key(x["name"])), None)
    if not hit:
        print("Ability not found: %s" % a.name)
        return
    ui = usage_index()
    perm, temp, _, _ = owned_sets()
    au = {key(r["name"]): r["usage_percent"]
          for r in meta_obj("usage_abilities").get("rows", [])}
    print("%s" % hit["name"])
    print("  %s" % (hit.get("effect") or "(Serebii names it but gives no text)"))
    # Battle Bond is the case: named on Greninja's page, never described. The
    # other two sources do describe it, so show them rather than a blank line.
    if not hit.get("effect"):
        pb = ((db_obj("text_facts").get("abilities") or {})
              .get(hit["name"]) or {}).get("pokebase")
        sm = next((x.get("description") for x in
                   db_obj("smogon_basics").get("abilities") or ()
                   if x.get("name") == hit["name"]), None)
        for src, txt in (("pokebase", pb), ("Smogon", sm)):
            if txt:
                print("  %-9s %s" % (src + ":", txt))
    # the whole of it, from Smogon's Champions dex - what the app shows
    full = (db_obj("smogon_text").get("abilities") or {}).get(hit["name"])
    if full:
        print("\n  Smogon, in full (smogon.com/dex/champions):")
        print(textwrap.fill(full, 78, initial_indent="    ",
                            subsequent_indent="    "))
    print("  Ladder use: %s" % pct(au.get(key(hit["name"]))))
    print("\n  Carriers (%d):" % len(hit["pokemon"]))
    table([[n, pct(usage_of(n, ui)), own_tag(n, perm, temp)] for n in hit["pokemon"]],
          ["Pokemon", "Usage", "You"])


def cmd_usage(a: argparse.Namespace) -> None:
    """`query.py usage`: the ladder's most used Pokemon, with their typing from
    our dex and ownership.
    """
    rows = meta_obj("usage_pokemon").get("rows", [])
    perm, temp, _, _ = owned_sets()
    if a.owned:
        rows = [r for r in rows if own_tag(r["name"], perm, temp)]
    # pokebase stores types as RSC back-references, so read them from our own dex
    local = {norm(p["name"]): p for p in db("pokemon")}
    out = []
    for r in rows[:a.top]:
        bs = r.get("base_stats") or {}
        mine = local.get(norm(r["name"])) or {}
        types = mine.get("types") or [t for t in (r.get("types") or ())
                                      if isinstance(t, str) and not t.startswith("$")]
        out.append([r.get("rank"), r["name"], pct(r["usage_percent"]),
                    "/".join(types), bs.get("spe") or (mine.get("base_stats") or {}).get("spe"),
                    own_tag(r["name"], perm, temp)])
    table(out, ["#", "Pokemon", "Usage", "Types", "Spe", "You"])


def cmd_speed(a: argparse.Namespace) -> None:
    """`query.py speed`: pokebase's speed tiers, between --min and --max, with
    ownership.
    """
    rows = meta_obj("speed_tiers").get("rows", [])
    perm, temp, _, _ = owned_sets()
    out = []
    for r in rows:
        if a.min and (r["base_speed"] or 0) < a.min:
            continue
        if a.max and (r["base_speed"] or 0) > a.max:
            continue
        sp = r.get("speeds") or {}
        names = ", ".join(p["name"] for p in r["pokemon"])
        mine = [p["name"] for p in r["pokemon"] if own_tag(p["name"], perm, temp)]
        out.append([r["base_speed"], sp.get("max"), sp.get("neuMax"),
                    sp.get("neu0"), sp.get("maxScarf"),
                    (names[:60] + "..." if len(names) > 60 else names),
                    ",".join(mine)[:28]])
    table(out, ["Base", "Max+", "MaxN", "0N", "Scarf", "Pokemon", "Yours"])


def active_ability(pokemon: str | None, item: str | None,
                   ability: str | None) -> tuple[str | None, str | None]:
    """The ability that is actually ON THE FIELD, not the one on the teamlist.

    A teamlist records the base ability and that is correct - the Pokemon has
    it until it Mega Evolves mid-battle, and only one Pokemon per team ever
    does. So both are true at different moments: a Charizard holding
    Charizardite Y really is Blaze until it becomes Drought.
    Returns (base, becomes) where becomes is set only when evolving changes it.
    """
    if not item or not str(item).lower().replace(" ", "").endswith(("ite", "itex", "itey")):
        return ability, None
    # species_norm, not norm: the teamlist name carries a form qualifier
    # ("Floette [Eternal Flower]") that norm keeps and sorts, so it would
    # never match the Mega's plain species key.
    sp = species_norm(pokemon or "")
    cands = [m for m in db("pokemon") if m["is_mega"]
             and species_norm(m.get("species") or "") == sp]
    if len(cands) > 1:
        suf = str(item).strip().rsplit(" ", 1)[-1].upper()
        if suf in ("X", "Y"):
            cands = [m for m in cands if m["name"].endswith(" " + suf)] or cands
    if not cands or ability in cands[0]["abilities"]:
        return ability, None
    return ability, ", ".join(cands[0]["abilities"])


def worlds_compare(divs: list[tuple[str, Row]], a: argparse.Namespace) -> None:
    """One row per Pokemon, one share column per division.

    The three divisions are separate metagames, so they get separate columns
    instead of one pooled percentage. Sorted by the Masters share when Masters
    is in the set, because that is the division the player enters.
    """
    counts, totals = {}, {}
    for d, t in divs:
        players = t.get("players", [])
        top = players[:a.top] if a.top else players
        totals[d] = len(top)
        c = Counter()
        for pl in top:
            for slot in pl.get("team", []):
                if slot.get("pokemon"):
                    c[slot["pokemon"]] += 1
        counts[d] = c
    order = "masters" if "masters" in counts else divs[0][0]
    mons = sorted({m for c in counts.values() for m in c},
                  key=lambda m: (-(counts[order][m] / (totals[order] or 1)),
                                 -sum(counts[d][m] for d in counts), m))
    perm, temp, _, _ = owned_sets()
    rows = []
    for mon in mons[:a.limit]:
        row = [mon]
        for d, _ in divs:
            c, tot = counts[d][mon], totals[d]
            row.append("%.1f%% (%d)" % (100.0 * c / tot, c) if tot and c else "-")
        row.append(own_tag(mon, perm, temp))
        rows.append(row)
    print("\nShare of teams per division  (%s)"
          % ", ".join("%s %d teams" % (d, totals[d]) for d, _ in divs))
    table(rows, ["Pokemon"] + [d.capitalize() for d, _ in divs] + ["You"])


def _print_event_lines(divs: list[tuple[str, Row]]) -> None:
    """One line per division: event, round with its label (R15 is the Final,
    not swiss), players and fetch date.
    """
    for d, t in divs:
        # The top cut carries on numbering from the last swiss round, so R15 is
        # the Final, not an unfinished swiss. Print the label, never the bare
        # number - reading the number alone is what makes a finished event look
        # like one still in progress.
        lab = t.get("round_label")
        print("%s - division %s, round %s%s%s, %d players (fetched %s)"
              % (t.get("tournament_id"), d, t.get("round") or 0,
                 " (%s)" % lab if lab else "",
                 " COMPLETE" if t.get("complete") else "",
                 len(t.get("players", [])), t.get("fetched")))


def _worlds_usage(top: list[Row]) -> tuple[Counter[str], dict[str, Counter[str]], dict[str, Counter[str]], dict[str, Counter[str]]]:
    """(species -> teams, species -> item/ability/move Counters) over `top`."""
    counts = Counter()
    items, abil, moves = defaultdict(Counter), defaultdict(Counter), defaultdict(Counter)
    for p in top:
        for slot in p.get("team", []):
            mon = slot.get("pokemon")
            if not mon:
                continue
            counts[mon] += 1
            if slot.get("item"):
                items[mon][slot["item"]] += 1
            if slot.get("ability"):
                base_ab, becomes = active_ability(mon, slot.get("item"),
                                                  slot["ability"])
                abil[mon][(base_ab or "") + (" -> " + becomes if becomes else "")] += 1
            for mv in slot.get("moves", []):
                moves[mon][mv] += 1
    return counts, items, abil, moves


def _print_worlds_usage(tour: Row, division: str, a: argparse.Namespace) -> None:
    """Species usage at a Worlds division, with the items, abilities and moves
    each one ran.
    """
    players = tour.get("players", [])
    top = players[:a.top] if a.top else players
    counts, items, abil, moves = _worlds_usage(top)
    n = len(top)
    perm, temp, _, _ = owned_sets()
    rows = []
    for mon, c in counts.most_common(a.limit):
        rows.append([mon, c, "%.1f%%" % (100.0 * c / n) if n else "",
                     items[mon].most_common(1)[0][0] if items[mon] else "",
                     abil[mon].most_common(1)[0][0] if abil[mon] else "",
                     ", ".join(m for m, _ in moves[mon].most_common(4)),
                     own_tag(mon, perm, temp)])
    print("\nMost used across the top %d %s teams:" % (n, division))
    table(rows, ["Pokemon", "N", "Share", "Top item", "Top ability",
                 "Most common moves", "You"])


def cmd_worlds(a: argparse.Namespace) -> None:
    """`query.py worlds`: what each Worlds division brought, never pooled
    across divisions.
    """
    want = list(DIVISIONS) if a.division == "all" else [a.division]
    divs = tournaments(want)
    if not divs:
        print("No tournament data for %s. Run: python scripts/fetch_tournament.py"
              " --division %s" % (a.division, want[0]))
        return
    _print_event_lines(divs)

    if len(divs) > 1 and a.usage:
        worlds_compare(divs, a)
    elif len(divs) > 1:
        for d, t in divs:
            print("\n=== %s ===" % d.upper())
            worlds_listing(t, a)
    elif a.usage:
        _print_worlds_usage(divs[0][1], divs[0][0], a)
    else:
        worlds_listing(divs[0][1], a)


def worlds_listing(tour: Row, a: argparse.Namespace) -> None:
    """Print the top `a.top` (8) teams of one event, with what each Mega
    Evolves into."""
    for p in tour.get("players", [])[:a.top or 8]:
        print("\n#%s  %s [%s]  %s" % (p["rank"], p["player"], p.get("country") or "",
                                      p.get("record") or ""))
        for slot in p.get("team", []):
            base_ab, becomes = active_ability(slot.get("pokemon"),
                                              slot.get("item"),
                                              slot.get("ability"))
            print("   %-26s %-16s %-16s %-9s %s"
                  % (slot.get("pokemon") or "", base_ab or "",
                     slot.get("item") or "", slot.get("nature") or "",
                     ", ".join(slot.get("moves") or [])))
            if becomes:
                print("   %-26s %s" % ("", "^ becomes %s if it Mega Evolves" % becomes))



def mega_line(name: str, mons: list[Row], stones: set[str]) -> tuple[str, str, str]:
    """A Pokemon with a Mega must be judged on its Mega line, not its base one.

    Returns (stats_label, ability_label, owns_stone). Mega Evolution can change
    the stats, the TYPING and the ABILITY, in any combination, and the Mega's
    ability REPLACES the base one - so the base row is the wrong answer on all
    three counts. Often the ability is the whole point of the Mega (Mawile's
    Huge Power, Sableye's Magic Bounce, Meganium's Mega Sol) and sometimes it
    costs you the base ability you were using (Froslass trades Cursed Body for
    Snow Warning).
    """
    megas = [m for m in mons if m["is_mega"] and norm(m.get("species") or "") == norm(name)]
    if not megas:
        return "-", "-", "-"
    stats, abils, stone_bits = [], [], []
    for m in megas:
        bs = m["base_stats"]
        tag = "" if len(megas) == 1 else m["name"].replace("Mega ", "") + " "
        stats.append("%s%s %s/%s/%s" % (tag, "/".join(m["types"]),
                                        bs["total"], bs["spa"], bs["spe"]))
        abils.append("%s%s" % (tag, ",".join(m["abilities"])))
        st = stone_for(m)
        if st is None:
            stone_bits.append("%s?" % tag)
        elif st in stones:
            stone_bits.append("%sowned" % tag)
        else:
            stone_bits.append("%s2000 VP" % tag)
    return ("  |  ".join(stats), "  |  ".join(abils), "  |  ".join(stone_bits))


def cmd_owned(_a: argparse.Namespace) -> None:
    """`query.py owned`: his box against the meta - each Pokemon with its
    stats, ability, usage and both Mega lines.
    """
    stones = owned_sets()[2]
    inv = ledger.inv()
    ui = usage_index()
    mons = db("pokemon")
    byname = {norm(p["name"]): p for p in mons if not p["is_mega"]}

    perm_list = inv.get("permanent_pokemon", [])
    rent_list = inv.get("rental_pokemon", {}).get("list", [])
    tr = inv.get("trainer", {}) or {}
    slots = len(perm_list) + len(rent_list)
    cap = tr.get("box_capacity")
    # box_used is counted from the rows now, so it cannot disagree with the
    # lists. It used to be a hand-typed number in inventory.json and this line
    # carried a warning for exactly that.
    print("BOX %s/%s" % (slots, cap or "?"))
    print("Mega Evolution can change stats, TYPING and ABILITY - the Mega ability")
    print("replaces the base one. Compare Mega against Mega, on all three.")

    def row_for(name: str, label: str | None = None) -> list[Any]:
        """One row of the owned table, Mega line included."""
        p = byname.get(norm(name))
        bs = (p or {}).get("base_stats") or {}
        mlabel, mabil, stone = mega_line(name, mons, stones)
        base_ab = ",".join((p or {}).get("abilities") or [])
        return [label or name, "/".join((p or {}).get("types") or []),
                bs.get("total"), bs.get("spa"), bs.get("spe"),
                base_ab, pct(usage_of(name, ui)), mlabel, mabil, stone]

    head = ["Pokemon", "Types", "BST", "SpA", "Spe", "Ability", "Usage",
            "Mega: types BST/SpA/Spe", "Mega ability", "Stone"]

    # a Pokemon listed twice is two copies kept for different builds
    perm_counts = Counter(perm_list)
    print("\nPERMANENT (%d slots, %d species)" % (len(perm_list), len(perm_counts)))
    rows = []
    for name in sorted(perm_counts, key=perm_list.index):
        n = perm_counts[name]
        rows.append(row_for(name, name + ("  x%d" % n if n > 1 else "")))
    table(rows, head)

    print("\nRENTAL / TIMER (%d) - 2500 VP to keep, cannot be trained,"
          " but CAN hold a Mega Stone" % len(rent_list))
    table([row_for(name) for name in rent_list], head)


def cmd_item(a: argparse.Namespace) -> None:
    """`query.py item <name>`: an item's effect, where it comes from or its VP
    price, ownership and ladder usage.
    """
    items = db("items")
    t = key(a.name)
    hit = next((x for x in items if key(x["name"]) == t), None) or \
          next((x for x in items if t in key(x["name"])), None)
    if not hit:
        print("Item not found: %s" % a.name)
        return
    iu = {key(r["name"]): r["usage_percent"]
          for r in meta_obj("usage_items").get("rows", [])}
    _, _, _, owned = owned_sets()
    print("%s%s" % (hit["name"], "  [you own it]" if hit["name"] in owned else ""))
    print("  %s" % hit["effect"])
    print("  Source: %s%s" % (hit["source"],
                              "" if not hit["price_vp"] else " (%d VP)" % hit["price_vp"]))
    print("  Ladder use: %s" % pct(iu.get(key(hit["name"]))))


def main() -> None:
    """Parse the subcommand and run it; `-h` on any subcommand lists its
    filters.
    """
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")

    m = sub.add_parser("moves", help="filter the Champions move list")
    m.add_argument("--flag", choices=FLAGS)
    m.add_argument("--type")
    m.add_argument("--category", choices=["physical", "special", "status"])
    m.add_argument("--priority", help="+, -, or an exact value like 1")
    m.add_argument("--min-power", type=int)
    m.add_argument("--name")
    m.add_argument("--learner", help="only moves this Pokemon can learn")
    m.add_argument("--effect", help="substring match on the move's effect text")
    m.add_argument("--all", action="store_true",
                   help="include moves not useable in Champions")
    m.add_argument("--used", action="store_true", help="only moves with ladder usage")
    m.add_argument("--learners", action="store_true", help="also list who learns them")
    m.add_argument("--owned", action="store_true",
                   help="add a column naming the Pokemon in your box that learn each move")
    m.add_argument("--limit", type=int, default=60)
    m.set_defaults(func=cmd_moves)

    c = sub.add_parser("counter-priority", help="what denies priority, and what has it")
    c.add_argument("--limit", type=int, default=40)
    c.set_defaults(func=cmd_counter_priority)

    p = sub.add_parser("pokemon", help="full card for one Pokemon")
    p.add_argument("name")
    p.add_argument("--moves", action="store_true", help="print the whole movepool")
    p.set_defaults(func=cmd_pokemon)

    br = sub.add_parser("brief", help="full dossier on one Pokemon (all sources)")
    br.add_argument("name")
    br.set_defaults(func=cmd_brief)

    b = sub.add_parser("ability", help="ability effect + carriers")
    b.add_argument("name")
    b.set_defaults(func=cmd_ability)

    i = sub.add_parser("item", help="item effect, price and usage")
    i.add_argument("name")
    i.set_defaults(func=cmd_item)

    u = sub.add_parser("usage", help="ladder usage ranking")
    u.add_argument("--top", type=int, default=30)
    u.add_argument("--owned", action="store_true", help="only what you own")
    u.set_defaults(func=cmd_usage)

    s = sub.add_parser("speed", help="speed tiers")
    s.add_argument("--min", type=int)
    s.add_argument("--max", type=int)
    s.set_defaults(func=cmd_speed)

    w = sub.add_parser("worlds", help="World Championship standings and teams")
    # No default: listing falls back to 8 players, but an aggregate has to
    # cover the whole division unless a cut is asked for - "usage over the top
    # 8 teams" is not usage.
    w.add_argument("--top", type=int,
                   help="listing: how many players (default 8); "
                        "--usage: aggregate over the top N teams (default all)")
    w.add_argument("--usage", action="store_true", help="aggregate instead of listing")
    w.add_argument("--limit", type=int, default=30)
    w.add_argument("--division", default="masters",
                   choices=list(DIVISIONS) + ["all"],
                   help="age division; 'all' compares the three side by side")
    w.set_defaults(func=cmd_worlds)

    mo = sub.add_parser("move", help="one move: Serebii text AND Smogon's, usage, learners")
    mo.add_argument("name")
    mo.set_defaults(func=cmd_move)

    bd = sub.add_parser("build", help="your own builds, checked against the rules")
    bd.add_argument("name", nargs="?")
    bd.set_defaults(func=cmd_build)

    mg = sub.add_parser("megas", help="which Megas you can actually field")
    mg.set_defaults(func=cmd_megas)

    o = sub.add_parser("owned", help="your box, crossed with the metagame")
    o.set_defaults(func=cmd_owned)

    ty = sub.add_parser("types", help="defensive profile of a Pokemon or a type combo")
    ty.add_argument("name", help='e.g. "Garchomp" or "dragon ground"')
    ty.set_defaults(func=cmd_types)

    rs = sub.add_parser("resist", help="who resists ALL the given attacking types")
    rs.add_argument("types", nargs="+", help="e.g. ice fairy")
    rs.add_argument("--owned", action="store_true", help="only what you own")
    rs.add_argument("--max", type=float, default=None,
                    help="worst allowed multiplier (default 0.5)")
    rs.set_defaults(func=cmd_resist)

    co = sub.add_parser("core", help="shared defensive holes of a partial team")
    co.add_argument("names", nargs="+", help="e.g. Jolteon Sceptile")
    co.set_defaults(func=cmd_core)

    nt = sub.add_parser("nature", help="what a nature raises and lowers")
    nt.add_argument("name", nargs="?", help="leave empty to list all 25")
    nt.set_defaults(func=cmd_nature)

    a = ap.parse_args()
    if not a.cmd:
        ap.print_help()
        return
    a.func(a)


if __name__ == "__main__":
    main()
