#!/usr/bin/env python3
"""Emit tracker/data.js - the compact reference blob the phone tracker inlines.

    python scripts/build_tracker_data.py      -> tracker/data.js (window.CHAMP)

Everything here is DERIVED from data/db/ and data/meta/; refresh.py runs it
after build_db.py so the app sees a new regulation's species, moves and
stones. The blob is POSITIONAL (arrays, not objects) to stay small, and
tracker/src/core/data.js is the one place that unpacks it - a column added
here is read there.

The rule for what ships: whatever the phone would otherwise have to derive
(name matching, Mega ownership, which ability touches which move) is
resolved HERE, in Python where norm() and the audits live, so the page is
plain lookups.
"""
import json
import os
import re
from pathlib import Path

import dex
import effect_chips
from check_regulation import live_slug
from paths import POKEBASE, ROOT, SMOGON_CALC

OUT = os.path.join(ROOT, "tracker", "data.js")


# Which flags an ability keys off. One letter each so the blob stays small.
_FLAG_LETTER = {"contact": "c", "sound": "s", "punch": "p", "biting": "b",
                "slicing": "l", "bullet": "u", "wind": "w", "powder": "d"}


def flag_str(m):
    """The move's ability-relevant flags as letters: "cp" = contact + punch."""
    f = m.get("flags") or {}
    return "".join(v for k, v in _FLAG_LETTER.items() if f.get(k))


TEXTS = None


def movetext(m):
    """What one move does, whole.

    scripts/build_text_facts.py picks per move: Smogon's full description for
    every move Champions has, and otherwise Serebii where it states the
    numbers and pokebase where Serebii only names a status.

    NOT CUT SHORT: the end of the text is where a binding move says how to
    escape it and Protect says what makes it fail.
    """
    global TEXTS
    if TEXTS is None:
        TEXTS = (dex.db("text_facts") or {}).get("moves") or {}
    picked = (TEXTS.get(m["name"]) or {}).get("text")
    t = picked or (m.get("effect") or "").strip() or (m.get("in_depth") or "").strip()
    return " ".join(t.split())


# --- moves: only the useable ones, indexed -------------------------------
TARGET_LABEL = {(1, 1): "All Adjacent Pokémon", (1, 0): "All Adjacent Foes",
                (0, 0): "Selected Target"}


def _idx(names, midx):
    """Move names -> sorted indices into MOVES, dropping unuseable ones."""
    return sorted(midx[n] for n in names or [] if n in midx)


def _targeting(m, props):
    """(target label, hits more than one, also hits your ally) for one move.

    How many Pokemon a move hits is NOT read off Serebii's target field: it
    spells one thing four ways and gets some moves wrong (Burning Jealousy is
    a spread move, Corrosive Gas hits your own ally). build_ability_moves.py
    resolves it against Smogon's engine target column and stores the answer
    per move. Where the two disagree the LABEL is corrected as well, so the
    move sheet does not print "Ally" under a single-target attack.
    """
    tgt = m.get("target") or ""
    k = dex.target_key(tgt)
    p = props.get(m["name"]) or {}
    spread = 1 if p.get("spread", k in dex.SPREAD_TARGETS) else 0
    ally = 1 if p.get("hits_ally", k == "all adjacent pokemon") else 0
    if spread != (k in dex.SPREAD_TARGETS) or ally != (k == "all adjacent pokemon"):
        tgt = TARGET_LABEL[(spread, ally)]
    # and the other Serebii slip: a move that DEALS DAMAGE cannot be aimed
    # at your own side. Psyshield Bash reads "Ally" and Mountain Gale
    # reads "Self"; both are ordinary single-target attacks, which is what
    # Smogon's table says by having no target override for either.
    elif (k == "self" or "ally" in k) and dex.CATEGORY.get(m.get("category")) != "T" \
            and (m.get("power") or 0) > 0:
        tgt = "Selected Target"
    return tgt, spread, ally


def build_moves(use):
    """The MOVES rows, in the column order core/data.js unpacks: name, type,
    category, power, accuracy, pp, priority, target, spread, hits ally, hit
    count, always-crit, flags, text."""
    props = (dex.db("ability_moves") or {}).get("moves") or {}
    rows = []
    for m in use:
        tgt, spread, ally = _targeting(m, props)
        rows.append([m["name"], m["type"], dex.CATEGORY.get(m.get("category"), "T"),
                     m.get("power"), m.get("accuracy"), m.get("pp"),
                     m.get("priority") or 0, tgt,
                     spread,
                     # of the spread moves, these also land on your own ally
                     ally,
                     # the damage calculator needs these two: a 2-5 move is
                     # quoted at three hits, and an always-crit move is a flat
                     # x1.5 on the base damage
                     m.get("hits") or None,
                     1 if m.get("always_crit") else 0,
                     flag_str(m),
                     # what the move DOES, so "which of these burns" has an
                     # answer on the phone (see movetext)
                     movetext(m)])
    return rows


def build_learn(learn, midx):
    """Learnsets as index lists."""
    out = {}
    for sp, lst in learn.items():
        ids = _idx(lst, midx)
        if ids:
            out[sp] = ids
    return out


# --- which FORM a Mega actually belongs to --------------------------------
# Our dex files every Mega under the bare species, which would hand an
# alternate form its base form's Megas (Mega Raichu X to Raichu-Alola, who
# cannot hold the stone). Smogon's roster states the relation - each Mega
# carries `baseSpecies` - so it settles this. Floette proves it is not just
# "the base form": Floette-Mega's baseSpecies is Floette-ETERNAL.
def _smogon_mega_bases():
    """Smogon's Mega name -> the baseSpecies it names."""
    try:
        sroster = json.loads(Path(SMOGON_CALC, "raw_species.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        sroster = {}
    return {k: v["baseSpecies"] for k, v in sroster.items()
            if isinstance(v, dict) and v.get("baseSpecies") and "Mega" in k}


def _attach_gendered(p, sname, smog_base, mons, owners):
    """Smogon carries a Mega per GENDER form where one exists -
    Meowstic-F-Mega and Meowstic-M-Mega - while our dex has a single
    "Mega Meowstic" row. Reading only baseSpecies ("Meowstic") would
    leave the female with no Mega at all, which is worse than the bug
    being fixed here, so a gendered Mega is attached to the gendered
    form as well."""
    if not sname:
        return
    for sk, sb in smog_base.items():
        if sb != (p.get("species") or ""):
            continue
        if "-F-Mega" in sk or "-M-Mega" in sk:
            want = (p.get("species") or "") + ("-Female" if "-F-Mega" in sk
                                               else "")
            if any(q["name"] == want for q in mons):
                owners.setdefault(want, [])
                if p["name"] not in owners[want]:
                    owners[want].append(p["name"])


def _owner_form(p, base, mons):
    """The dex row that holds this Mega's stone: Smogon's baseSpecies, mapped
    back onto our spelling, or the bare species when Smogon names none."""
    owner = p.get("species") or p["name"]
    if base:
        hit = next((q["name"] for q in mons
                    if not q.get("is_mega") and dex.norm(q["name"]) == dex.norm(base)),
                   None)
        if hit:
            owner = hit
    return owner


def mega_owners(mons):
    """MEGA_OWNER: dex form -> the Megas it can become. Prints every Mega that
    landed on a form other than its bare species, so a change is visible in
    the refresh log."""
    smog_base = _smogon_mega_bases()
    import damage as _Dm
    owners = {}
    for p in mons:
        if not p.get("is_mega"):
            continue
        try:
            sname = _Dm.smogon_name(p["name"])
        except (OSError, ValueError):
            sname = None
        _attach_gendered(p, sname, smog_base, mons, owners)
        owner = _owner_form(p, smog_base.get(sname or ""), mons)
        if p["name"] not in owners.setdefault(owner, []):
            owners[owner].append(p["name"])
    species_of = {}
    for q in mons:
        species_of.setdefault(q["name"], q.get("species"))
    moved = [(o, ms) for o, ms in owners.items()
             if any(o != species_of.get(m) for m in ms)]
    if moved:
        print("  Megas re-attached to the form that actually holds the stone:")
        for o, ms in moved:
            print("     %-18s %s" % (o, ", ".join(ms)))
    return owners


def learn_aliases(mons, app_learn):
    """Forms whose pool is filed under another name.

    A few forms find nothing by their own name OR their species: Floette and
    Mega Floette (the pool is under "Floette-Eternal") and the gender forms,
    whose movepool is inherited from the base species
    (.claude/rules/data-pipeline.md). The app is a plain key lookup, so the
    resolving happens here, where norm() and the alias table already live.
    """
    out = {}
    for p in mons:
        n, sp = p["name"], p.get("species") or p["name"]
        if n in app_learn or sp in app_learn:
            continue
        hit = next((k for k in app_learn if dex.norm(k) == dex.norm(n)), None)
        if not hit:
            base = re.sub(r"^Mega ", "", n).split("-")[0]
            hit = next((k for k in app_learn if dex.norm(k) == dex.norm(base)), None)
        if not hit:
            # the pool is filed under a SUFFIXED name and the dex row is not:
            # Champions' Floette is the Eternal Flower one, so the dex says
            # "Floette" and the attackdex says "Floette-Eternal"
            hit = next((k for k in app_learn if k.split("-")[0] == base), None)
        if hit:
            out[n] = hit
        else:
            print("  !! no movepool anywhere for %s" % n)
    return out


# --- what a Pokemon becomes mid-battle ------------------------------------
# The dex row is the form it STARTS in, and for some that is the form it
# never attacks in: Stance Change flips Aegislash from 50 Attack to 140 the
# moment it uses a damaging move, Zero to Hero takes Palafin from 70 to 160,
# and Castform's weather forms change the TYPE instead. build_db.py records
# these as `battle_forms`; only what actually CHANGES is shipped.


def _form_change(p, v):
    """{"t": types, "b": stats} for whatever this form changes; {} if nothing."""
    e = {}
    if v.get("types") and v["types"] != p["types"]:
        e["t"] = v["types"]
    st = [v[k] for k in dex.STAT_KEYS]
    if st != [p["base_stats"][k] for k in dex.STAT_KEYS]:
        e["b"] = st
    return e


def battle_forms(mons):
    """BFORMS: name -> {"by": the ability, "f": {form label: changes}}."""
    bforms = {}
    for p in mons:
        out = {}
        for label, v in (p.get("battle_forms") or {}).items():
            e = _form_change(p, v)
            if e:
                out[label] = e
        if out:
            # the ability that does it - each of these has exactly one, and
            # naming it is the difference between a number and an explanation
            bforms[p["name"]] = {"by": (p.get("abilities") or [None])[0],
                                 "f": out}
    return bforms


# --- ...and the forms that move NO number ---------------------------------
# The loop above only sends what Serebii printed a spread or a typing for,
# so a form that changes neither (Morpeko's Hangry Mode, Mimikyu's Busted
# Form) would have no picture. They are real, and can still change a move
# (Hangry Morpeko's Aura Wheel is Dark - FORM_TYPED, keyed by form name).
#
# form_line.json (fetch_home_dex.py) says which forms EXIST and what each
# looks like. It carries upstream's numbers, and those are never used for
# a species Champions has: Champions' own row wins. A form upstream says
# MOVES a number that ours has no row for is refused outright - drawing
# it with the base spread would state the wrong number as ours.
def _mega_picture(name, f, mega_names, sprite_of, form_sprite):
    """A Champions Mega is its own dex row with its own picture; only a
    Mega drawn DIFFERENTLY from a form of its species gets an entry here -
    the female Meowstic's is white."""
    if f["n"] not in mega_names:
        print("  !! upstream has %s on %s; the Champions dex "
              "does not" % (f["n"], name))
    elif f["sp"] != sprite_of.get(f["n"]):
        form_sprite.setdefault(name, {})[f["n"]] = f["sp"]


def _flat_form(name, p, f, bforms):
    """Attach an upstream form's picture to BFORMS. Stops the build when the
    form changes numbers Champions has no row for, or names an ability the
    species lacks - drawing it anyway would state a wrong fact as ours."""
    bf = bforms.setdefault(name, {"by": f["by"], "f": {}})
    if f["k"] in bf["f"]:
        bf["f"][f["k"]]["sp"] = f["sp"]
        return
    if not f.get("flat"):
        raise SystemExit(
            "%s changes its numbers upstream and the Champions data "
            "has no row for it - fetch its block from Serebii rather "
            "than drawing it with %s's spread" % (f["n"], name))
    if f["by"] not in (p.get("abilities") or []):
        raise SystemExit("%s is said to come from %s, which %s does "
                         "not have" % (f["n"], f["by"], name))
    bf["f"][f["k"]] = {"sp": f["sp"]}


def form_pictures(mons, form_line, bforms):
    """Adds the picture of every battle form to `bforms`; returns the Megas
    drawn differently from their species (FORM_SPRITE)."""
    form_sprite = {}
    champ_rows = {p["name"]: p for p in mons}
    mega_names = {p["name"] for p in mons if p.get("is_mega")}
    sprite_of = dex.db("sprite_ids") or {}
    for name, forms in form_line.items():
        p = champ_rows.get(name)
        if not p:
            continue
        for f in forms:
            if "mega" in f:
                _mega_picture(name, f, mega_names, sprite_of, form_sprite)
            else:
                _flat_form(name, p, f, bforms)
    missing_sp = [n + "-" + k for n, v in bforms.items()
                  for k, e in v["f"].items() if "sp" not in e]
    if missing_sp:
        print("  !! battle forms with no picture: %s" % ", ".join(missing_sp))
    return form_sprite


def build_dex(mons):
    """DEX rows: name, species, types, base stats, is-Mega, abilities, dex no."""
    rows = []
    for p in mons:
        b = p["base_stats"]
        # the National Dex number, so the box can be read in the same order
        # Pokemon HOME shows it - which is how you check one against the other
        rows.append([p["name"], p.get("species") or p["name"], p["types"],
                    [b[k] for k in dex.STAT_KEYS],
                    1 if p.get("is_mega") else 0, p.get("abilities") or [],
                    p.get("dex") or 0])
    return rows


def home_dex_with_forms(mons, form_line):
    """HOME_DEX with each outside species' forms attached (Mewtwo's Mega X
    and Y, Kyogre's Primal). Main-series numbers, the same as the row they
    ride on - and the card's "not in Champions" tag covers them too."""
    home_dex = dex.db("home_dex") or {}
    champ = {p["name"] for p in mons}
    for name, forms in form_line.items():
        if name in home_dex and name not in champ:
            home_dex[name] = dict(home_dex[name], f=[
                {k: v for k, v in f.items() if k != "flat"} for f in forms])
    return home_dex


def gts_difficulty():
    """How hard each species is to pull off the GTS: demand measured from
    ladder usage, supply declared in data/meta/go_sourcing.json. Only the
    fields the phone needs, to keep the blob small.

    [score, demand, supply, rank, how, usage, ladder_size]. demand and rank
    are null for a species with no row on the ladder - absent, not zero.
    """
    blob = dex.meta("gts_difficulty") or {}
    size = blob.get("ladder_size")
    return {k: [v["score"], v["demand"], v["supply"], v.get("rank"),
                v.get("how") or "", v.get("usage"), size]
            for k, v in (blob.get("species") or {}).items()}


def build_stones(mons):
    """Stones: 1:1 with the Megas."""
    stones = []
    for p in mons:
        if not p.get("is_mega"):
            continue
        st = dex.stone_for(p)
        stones.append([st or "", p["name"], p.get("species") or ""])
    stones.sort(key=lambda r: r[1])
    return stones


# --- items, in the groups the game itself uses -----------------------------
# Name, VP price, category, what it does, where it comes from, and what it
# serves. The price is the MERGED one - Serebii first, pokebase filling the
# ones it prints as "??? VP" - with a note for items that have no price at
# all because they are rewards. scripts/build_item_facts.py does the merge
# and reports any disagreement.
def _item_row(i, pr, link):
    moves = link.get("moves") or []
    return [i["name"], pr.get("vp") or i.get("price_vp"),
            i.get("category") or "Miscellaneous",
            # the item's ONE description - Smogon's Champions dex
            # first (build_item_facts.py), Serebii's line only where
            # neither of the others has the item
            " ".join((pr.get("text") or i.get("effect") or "").split()),
            pr.get("note") or i.get("source") or "",
            pr.get("source") or "",
            # what this item serves: the sentence, the abilities it
            # works with, and the moves when there are few enough to
            # name. Heat Rock -> Sunny Day AND Drought.
            link.get("why") or "",
            link.get("abilities") or [],
            moves if len(moves) <= 6 else []]


def build_items(items):
    """ITEMS rows, sorted by name. Mega Stones are left out on purpose: they
    ship as STONES and get their own pane."""
    prices = (dex.db("item_facts") or {}).get("prices") or {}
    links = (dex.db("item_links") or {}).get("items", {})
    rows = [_item_row(i, prices.get(i["name"]) or {}, links.get(i["name"]) or {})
            for i in items if not i.get("is_mega_stone")]
    rows.sort()
    return rows


def build_abilities(abil):
    """ABIL: ability -> its ONE description, the text build_text_facts.py
    picked across the sources (the one that states the numbers wins)."""
    atext = (dex.db("text_facts") or {}).get("abilities") or {}
    out = {}
    for a in (abil if isinstance(abil, list) else abil.values()):
        pick = (atext.get(a["name"]) or {}).get("text") or a.get("effect") or ""
        # whole: Smogon's Champions text runs past 400 characters for the
        # abilities with the most exceptions, and those are the ones to read
        out[a["name"]] = " ".join(pick.split())
    return out


# These two take their type from the USER'S FORM, not the move row
FORM_TYPED = {
    "Raging Bull": {"Tauros-Paldea Combat": "Fighting",
                    "Tauros-Paldea Blaze": "Fire",
                    "Tauros-Paldea Aqua": "Water"},
    "Aura Wheel": {"Morpeko": "Electric", "Morpeko-Hangry": "Dark"},
}


def _ability_rule(ab, rule, midx):
    """One AB_MOVES entry, its move names turned into indices (ui/moves.js
    documents every field)."""
    e = {"side": rule.get("side"), "x": rule.get("x"),
         "why": rule.get("why")}
    # `scope` means the rule covers a whole category and therefore picks
    # out nothing - the app states it once on the ability instead of
    # badging every row. Its move list is then dead weight on the phone, so
    # it is dropped here, not in data/db/ability_moves.json, where "which
    # moves does Guts cover" is still a fair question to ask.
    if rule.get("scope"):
        e["scope"] = rule["scope"]
        return e
    if rule.get("all"):
        e["all"] = 1
    else:
        e["m"] = _idx(rule.get("moves"), midx)
        # ...and which of those it STOPS OUTRIGHT, which is the only half
        # a defensive ability may badge a move row with. Everything else it
        # does - halving, punishing, a 30% burn back - belongs on the
        # ability, not on every move row.
        if rule.get("stop"):
            e["stop"] = _idx(rule["stop"], midx)
        # ...and the moves it keeps off YOUR partner, which is the same
        # immunity seen from the other side of the field: green, not red
        # (Telepathy, and Levitate beside your own Earthquake)
        if rule.get("ally_safe"):
            e["ally"] = _idx(rule["ally_safe"], midx)
    if ab == "Contrary":
        e["up"] = _idx(rule.get("up"), midx)
        e["down"] = _idx(rule.get("down"), midx)
        e["why_up"] = rule.get("why_up")
        e["why_down"] = rule.get("why_down")
    return e


def build_ab_moves(am, midx):
    """Which ability touches which move, derived from Serebii's move text and
    cross-checked against Smogon's engine by
    scripts/build_ability_moves.py. Stored as move-index lists so the blob
    stays small and the page never has to re-derive anything."""
    return {ab: _ability_rule(ab, rule, midx)
            for ab, rule in (am.get("abilities") or {}).items()}


def home_only_species(mons, wt):
    """HOME_ONLY: the names the HOME box may hold that Champions does not
    allow. pokebase's species table is the widest list on hand; anything in
    it the Champions dex has never heard of is HOME-only (the picker also
    takes a typed name, since no list is guaranteed complete).

    Matched with norm(), never by exact spelling: pokebase writes Indeedee-F
    where our dex writes Indeedee-Female, and lists Squawkabilly's plumages
    separately - an exact-name filter would call those "not in Champions"
    when they ARE in it, under the canonical name.
    """
    champ_names = {p["name"] for p in mons} | {p.get("species") for p in mons}
    champ_keys = {dex.norm(n) for n in champ_names if n}
    return sorted(n for n in wt
                  if dex.norm(n) not in champ_keys
                  and "-Mega" not in n and "-Gmax" not in n
                  and "-Totem" not in n and "-Starter" not in n)


def canonical_names(mons):
    """norm() key -> the dex row's own spelling (the first row wins)."""
    canon = {}
    for p in mons:
        canon.setdefault(dex.norm(p["name"]), p["name"])
    return canon


def cosmetic_spellings(wt, canon):
    """The spellings that DO collapse onto a dex row: Squawkabilly's plumages,
    Tauros' Paldean breeds written with hyphens, Indeedee-F. Shipped so the
    app can say "this is the same Pokemon" instead of the player meeting the
    question twice - these forms change no stat, no move and no ability, so
    the dex carries one entry on purpose. (COSMETIC)"""
    cosmetic = {}
    for n in wt:
        k = dex.norm(n)
        if k not in canon or n == canon[k]:
            continue
        # a Mega written the other way round ("Abomasnow-Mega") is a spelling,
        # not a form that changes nothing - a Mega changes everything. Only
        # the variants that really are cosmetic belong in this note.
        if "mega" in k.split():
            continue
        cosmetic.setdefault(canon[k], []).append(n)
    return {k: sorted(set(v)) for k, v in cosmetic.items()}


def alias_every_spelling(wt, canon, app_learn, learn_alias):
    """Any spelling the rest of the project treats as the same Pokemon has to
    find that Pokemon's movepool here too, or the page answers "no moves" to
    a name every other source uses. norm() already knows them; only the page
    did not, because LEARN_ALIAS was built over dex rows alone and these are
    by definition not dex rows. "Floette" is the live case: Champions has
    only the Eternal Flower form, so the dex row is "Floette-Eternal" while
    pokebase and every teamlist write the bare name."""
    for n in wt:
        if n in app_learn or n in learn_alias:
            continue
        hit = canon.get(dex.norm(n))
        if not hit:
            continue
        tgt = hit if hit in app_learn else learn_alias.get(hit)
        if tgt:
            learn_alias[n] = tgt


# The damage tab's Ability and Item menus, per side: every ability and item
# that scripts/measure_modifiers.py saw move the damage in Smogon's engine.
# Names only - the page runs that same engine, which applies each one itself.
MENUS = ("atk_ability", "def_ability", "atk_item", "def_item")


def build_mods():
    """MODS: per menu, the sorted names measured to move the damage."""
    measured = dex.db("modifiers") or {}
    return {k: sorted(measured.get(k) or {}) for k in MENUS}


# Aegislash is the one form that depends on which side it is on: it attacks
# as Blade and is hit as Shield.
AEGIS = {"attacking": "Aegislash-Blade", "defending": "Aegislash-Shield"}


def smogon_names(mons):
    """SMOGON_NAME: our spelling -> the one Smogon's engine answers to. norm()
    does the work (Mega Glalie <-> Glalie-Mega) and lives in Python, locked
    by test_norm.py, so the mapping is precomputed here rather than ported
    to JS."""
    import damage as Dm
    names, missing = {}, []
    for p in mons:
        n = p["name"]
        try:
            names[n] = Dm.smogon_name(n)
        except SystemExit:
            missing.append(n)
    if missing:
        print("  %d forms have no name in Smogon's roster: %s"
              % (len(missing), ", ".join(missing[:6])))
    return names


def current_regulation():
    """(regulation, the day it started), or (None, None).

    What this data IS, so the app can state its own vintage instead of
    anyone typing it (a typed regulation goes stale the day it changes).
    pokebase ships the regulation list and marks the current one; asking it
    is better than hardcoding, because the next regulation moves this on its
    own. The ladder numbers are that regulation's, since fetch_pokebase.py
    requests no regulation and therefore gets the default - which is the one
    pokebase calls `defaultLatestRegulationSetSlug`.
    """
    try:
        raw = Path(POKEBASE, "pokemon.html").read_text(
            encoding="utf-8", errors="replace")
    except OSError:                     # no page cached: no regulation shown
        return None, None
    slug = live_slug(raw)
    if not slug:
        return None, None
    st = re.search(r'\\?"value\\?":\\?"%s\\?",\\?"label\\?":\\?"[^"\\]+\\?",'
                   r'\\?"id\\?":\\?"[^"\\]+\\?",\\?"startDate\\?":\\?"(\d{4}-\d\d-\d\d)'
                   % re.escape(slug), raw)
    return slug.upper(), (st.group(1) if st else None)


def build_effects(app_abilities, app_items, app_moves):
    """Trimmed to what a screen needs: the quantified sentence and the chips.

    THE CHIPS ARE DECIDED HERE, not on the phone: one fact, one chip, never
    the same number twice (the engine measures in 4096ths and Smogon writes
    "1.3x", so naive merging shows x1.2998 beside 1.3x).
    scripts/effect_chips.py is that consensus, a script of its own so that
    `--audit` can list the numbers whose subject it still cannot name. The
    raw stage dumps stay in data/db/effects.json for anyone checking.

    WHAT THE SCREEN ALREADY SAYS decides what a chip may add. Each item,
    ability and move carries ONE full description, so Smogon's one-line
    summary ships only where there is no description, and a chip only when
    the description does not state its number - effect_chips.py rule 6.
    """
    shown_text = dict(app_abilities)
    shown_text.update({r[0]: r[3] for r in app_items})
    shown_text.update({r[0]: r[13] for r in app_moves})
    effects = {}
    for name, v in ((dex.db("effects") or {}).get("effects") or {}).items():
        said = shown_text.get(name) or ""
        c = effect_chips.unsaid(effect_chips.chips(v), said)
        desc = None if said else v.get("described")
        if not (c or desc):
            continue
        effects[name] = {"kind": v.get("kind"), "desc": desc, "c": c}
    return effects


# --- WHO STOOD ON THE PODIUM, AND WITH WHAT --------------------------------
# The top 8 of every World Championship, per division, with the actual
# set each Pokemon carried: item, ability, nature and four moves. This is
# the one thing in the project that is a RESULT rather than a rate - not
# "how often is this brought" but "this exact set won".
#
# IT IS FILED UNDER THE FORM THAT WAS REGISTERED, which is always the
# BASE one: of the 16,875 team slots pokedata publishes, none is written as
# "Mega something". Filing it under the Mega would invent an entrant that
# was never on the sheet, and a search for Floette would miss the team that
# won 2026 with one.
#
# NOTHING IS LOST: the stone is in the set, and stone_for() is 1:1 over the
# Megas, so the Mega and the single ability it gains are derived HERE (mg,
# mgab) rather than left to the reader. The recorded ability is the BASE
# one, which is correct: it is what the Pokemon has until it evolves.
#
# Placement comes from the players list's own `rank`, which is the final
# standing - NOT a swiss round number (pokedata numbers the top cut straight
# on from the last swiss round; .claude/rules/data-pipeline.md).
def _best_worlds_sources():
    """ONE EVENT PER (YEAR, DIVISION). 2023 is the case that forces this:
    pokedata put that year's Masters teamlists on the Day 1 event and its
    Seniors and Juniors on the Day 2 one, so both events carry rows for the
    same championship and reading them straight gave Seniors and Juniors two
    podiums each. The one with more players is the complete list."""
    best_src = {}
    for ev in (dex.meta("worlds_archive") or {}).get("events") or []:
        for div, info in (ev.get("divisions") or {}).items():
            if not info.get("teamlists"):
                continue
            key = (ev["year"], div)
            n = info.get("players") or info.get("teams") or 0
            if n > (best_src.get(key) or (0, None))[0]:
                best_src[key] = (n, ev["tid"])
    return best_src


def _podium_row(year, div, pl, slot, mega_of_stone, mega_abil):
    """One top-8 set, in the short keys tracker/src/ui/pokemon.js reads."""
    row = {
        "y": year, "d": div, "r": pl["rank"],
        "who": pl.get("player") or "",
        "rec": pl.get("record") or "",
        "it": slot.get("item") or "",
        "ab": slot.get("ability") or "",
        "na": slot.get("nature") or "",
        "mv": slot.get("moves") or [],
    }
    # the stone says it Mega Evolved, and says into what
    mega = mega_of_stone.get(dex.norm(slot.get("item") or ""))
    if mega:
        row["mg"] = mega
        if mega_abil.get(mega):
            row["mgab"] = mega_abil[mega]
    return row


def build_podium(stones, mons, canon):
    """PODIUM: dex form -> its top-8 sets, newest first, Masters first."""
    mega_of_stone = {dex.norm(st): mega for st, mega, _sp in stones if st}
    mega_abil = {m["name"]: ", ".join(m.get("abilities") or [])
                 for m in mons if m.get("is_mega")}
    podium = {}
    seen_events = []
    for (year, div), (_n, tid) in sorted(_best_worlds_sources().items()):
        t = dex.meta("tournament_%s_%s" % (tid, div))
        if not t:
            continue
        top8 = [pl for pl in t.get("players") or []
                if pl.get("rank") and pl["rank"] <= 8]
        for pl in top8:
            for slot in pl.get("team") or []:
                form = canon.get(dex.norm(slot.get("pokemon") or ""))
                if form:
                    podium.setdefault(form, []).append(
                        _podium_row(year, div, pl, slot, mega_of_stone, mega_abil))
        if top8:
            seen_events.append("%s %s %d" % (year, div, len(top8)))
    for v in podium.values():
        v.sort(key=lambda r: (-r["y"], r["d"] != "masters", r["r"]))
    print("  worlds podium: %d forms over %s"
          % (len(podium), ", ".join(seen_events)))
    return podium


def build_worlds():
    """EVERY WORLDS, AS HISTORY. A Worlds is played once under one regulation
    and then frozen, so this is what the field brought that August and never
    what is current - the app labels it that way. It rides on the dex rather
    than getting an asset of its own because it changes once a YEAR and is
    9 KB: a separate file would cost a second request forever to save nine
    kilobytes a night.

    The three divisions stay apart: three metagames off one roster, so the
    app tabs between them instead of averaging.
    """
    worlds = []
    for y in (dex.meta("worlds_archive") or {}).get("years") or []:
        divs = {}
        for dname, d in (y.get("divisions") or {}).items():
            if not d.get("teamlists") or not d.get("top"):
                continue
            divs[dname] = {"n": d.get("teams") or 0,
                           "top": [[t["name"], t["teams"], t["pct"]]
                                   for t in d["top"]]}
        if divs:
            worlds.append({"y": y.get("year"), "d": divs})
    worlds.sort(key=lambda r: -(r["y"] or 0))
    return worlds


def item_for_move(links):
    """ITEM_FOR_MOVE: which item serves a given move - only the specific ones.
    Life Orb rides on every attack and would badge every row, so anything
    covering more than 8 moves is left out of the reverse index.

    ...and WHICH WAY each one points ("for" / "against"): Heat Rock on Sunny
    Day is a reason to run the move; Aspear Berry on Ice Beam is a reason it
    will not work.
    """
    items = links.get("items") or {}
    return {k: [[i, items[i].get("side") or "for"]
                for i in v if len(items[i]["moves"]) <= 8]
            for k, v in (links.get("by_move") or {}).items()
            if any(len(items[i]["moves"]) <= 8 for i in v)}


def main():
    """Assemble every table the app reads into tracker/data.js (window.CHAMP).
    """
    mons = dex.db("pokemon")
    moves = dex.db("moves")
    items = dex.db("items")
    learn = dex.db("learnsets")
    nat = dex.db("natures")
    chart = dex.db("typechart")
    abil = dex.db("abilities")

    use = sorted((m for m in moves if m.get("useable")), key=lambda m: m["name"])
    midx = {m["name"]: i for i, m in enumerate(use)}
    app_moves = build_moves(use)
    app_learn = build_learn(learn, midx)
    mega_owner = mega_owners(mons)
    learn_alias = learn_aliases(mons, app_learn)
    bforms = battle_forms(mons)
    form_line = dex.db("form_line") or {}
    form_sprite = form_pictures(mons, form_line, bforms)
    dex_rows = build_dex(mons)
    # ...and the National Dex number for everything HOME can hold, which is
    # far more than the Champions dex.
    dexno = (dex.db("dex_numbers") or {}).get("numbers", {})
    home_dex = home_dex_with_forms(mons, form_line)
    stones = build_stones(mons)
    app_items = build_items(items)
    app_natures = {k: [v.get("raises"), v.get("lowers"), v.get("summary")]
                   for k, v in nat.items()}
    app_abilities = build_abilities(abil)
    # pokebase's weight table, read for its KEYS: it names every species and
    # form pokebase knows, which is the list HOME_ONLY and the cosmetic forms
    # are cut from. The weights themselves are Smogon's engine's business.
    wt = (dex.db("weights") or {}).get("weights", {})
    am = dex.db("ability_moves") or {}
    ab_moves = build_ab_moves(am, midx)
    home_only = home_only_species(mons, wt)
    canon = canonical_names(mons)
    cosmetic = cosmetic_spellings(wt, canon)
    alias_every_spelling(wt, canon, app_learn, learn_alias)
    mods = build_mods()
    smogon = smogon_names(mons)
    reg, reg_started = current_regulation()
    effects = build_effects(app_abilities, app_items, app_moves)
    podium = build_podium(stones, mons, canon)
    worlds = build_worlds()
    links = dex.db("item_links") or {}

    blob = {"DEX": dex_rows, "HOME_ONLY": home_only, "MODS": mods,
            "WORLDS": worlds, "PODIUM": podium,
            "DEXNO": dexno, "BFORMS": bforms,
            "REG": reg, "REG_STARTED": reg_started,
            "USAGE_AT": (dex.meta("usage_pokemon") or {}).get("fetched"),
            "SMOGON_NAME": smogon, "AEGIS": AEGIS,
            "MOVES": app_moves, "LEARN": app_learn, "STONES": stones,
            "ITEMS": app_items, "NATURES": app_natures, "CHART": chart,
            "ABIL": app_abilities,
            "FORM_TYPED": FORM_TYPED, "AB_MOVES": ab_moves,
            "ITEM_FOR_MOVE": item_for_move(links),
            "ITEM_FOR_ABILITY": links.get("by_ability") or {},
            "LEARN_ALIAS": learn_alias,
            "COSMETIC": cosmetic,
            "MEGA_OWNER": mega_owner,
            # the status conditions, with Champions' own rebalance
            # (paralysis is 12.5% here, not 25%)
            "STATUSES": (dex.db("statuses") or {}).get("statuses") or {},
            "GTSDIFF": gts_difficulty(),
            # Species HOME's own GTS refuses to take. Not a Champions rule and
            # not scraped - seen in the game, and data/meta/gts_blocked.json
            # says who confirmed each. A chip he cannot deposit must never be
            # recommended.
            "GTSBLOCK": (dex.meta("gts_blocked") or {}).get("blocked") or {},
            # Mythical, read off PokeAPI at the pinned commit rather than
            # typed from memory. The GTS probably refuses them (one confirmed
            # case), so the app ranks them last and tags them - see gtsBlocked
            # in core/trade.js and data/meta/gts_blocked.json.
            "MYTHICAL": (dex.db("species_flags") or {}).get("mythical") or [],
            # THE TYPE COLOURS, from pokemon.com's own stylesheet: top, bottom
            # (Dragon, Flying and Ground are two-toned) and the ink the type's
            # name is written in. scripts/build_type_colors.py; --check says
            # if upstream moved.
            "TYPE_COLORS": dex.db("type_colors") or {},
            # THE SPECIES CHAMPIONS DOES NOT HAVE, so a HOME row for one is a
            # card like any other instead of a name and a tag. MAIN-SERIES
            # NUMBERS, and the card says so - Champions has no row for these
            # at all, so there is nothing of ours to contradict.
            # scripts/fetch_home_dex.py, from PokeAPI's tables at a pinned
            # commit. The "not in the Champions dex" tag stays on every one.
            "HOME_DEX": home_dex,
            # PokeAPI's own id per name, so the app can build a sprite URL.
            # THE IMAGES ARE NOT IN THIS REPOSITORY and must not be: they are
            # Nintendo and Game Freak artwork, PokeAPI licenses its sprites
            # repo NOASSERTION for exactly that reason, and this repo is
            # public. Only the number travels; the picture is fetched from a
            # CDN at a pinned commit when a card is actually on screen.
            "SPRITE_ID": dex.db("sprite_ids") or {},
            # A form drawn differently from the name it shares: Champions has
            # one "Mega Meowstic" row, and the female's Mega is white.
            "FORM_SPRITE": form_sprite,
            # Which pictures one set has and the other lacks, so the page
            # goes straight to the one that exists instead of drawing a 404.
            "SPRITE_GAPS": dex.db("sprite_gaps") or {},
            # what KIND of ability each one is, for the search filters. The two
            # "moves-*" buckets are the RULES table itself, not a re-reading of
            # the text, so the classification already made cannot drift.
            "AB_CLASS": am.get("classes") or {},
            "AB_CLASS_LABEL": am.get("class_labels") or {},
            # WHAT A THING ACTUALLY DOES, AS A NUMBER: Serebii's item text is
            # almost all qualitative ("slowly restores HP", never the 1/16).
            # data/db/effects.json carries the exact multipliers read out of
            # the engine's own modifier stages and the numbers Smogon writes
            # down; build_effects() above trims them to what a screen shows.
            "EFFECTS": effects}

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// GENERATED by scripts/build_tracker_data.py - do not edit\n")
        f.write("window.CHAMP = ")
        json.dump(blob, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print("wrote %s  (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))
    print("  %d forms, %d moves, %d learnsets, %d stones, %d items, "
          "%d abilities, %d ability rules, %d HOME-only"
          % (len(dex_rows), len(app_moves), len(app_learn), len(stones), len(app_items),
             len(app_abilities), len(ab_moves), len(home_only)))


if __name__ == "__main__":
    main()
