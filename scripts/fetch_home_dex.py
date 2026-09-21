#!/usr/bin/env python3
"""Types, base stats and abilities for the species Champions does NOT have.

    python scripts/fetch_home_dex.py            # cached; re-uses data/raw/
    python scripts/fetch_home_dex.py --force    # re-download the tables
    python scripts/fetch_home_dex.py --check    # has the pinned data moved?

WHY THIS EXISTS.

A HOME row for a species Champions has never heard of showed a name, a "not in
the Champions dex" tag and nothing else - no types, no BST, no stats, no
ability. 24 of the player's 129 HOME Pokemon are in that state, and HOME is
exactly where he decides what to keep and what to send on:

    "no me parece correcto que no me muestre el tipo bst y stats y ability como
     el resto de cards, porque si quisiera hacer un cambio en pokemon home, no
     sabria por que cambiarlos"  (2026-09-16)

    "la idea es tener el dex completo en home, necesito tener esa informacion y
     conservar el tag de not in champion dex, asi se cuales cambiar por otros
     motivos."

THE TAG STAYS. This does not make these Pokemon playable and must never read as
if it did - it fills in the card so a decision can be made about a Pokemon
sitting in HOME, and the tag is what says it cannot come into the game.

WHY POKEAPI IS ALLOWED HERE, when fetch_dex_numbers.py says it is used "for
nothing else - no stats, no movepools, no usage".

That rule protects the source hierarchy for what POKEMON CHAMPIONS HAS. It
cannot apply to a species Champions does not have: Serebii's Champions pages do
not cover them, Smogon's Champions roster does not list them, pokebase has no
usage for them, and there is nothing for a main-series number to contradict.
These are main-series rows about main-series Pokemon, which is all that exists -
so the payload marks every one and the card says where the numbers came from.

THE CSVs, NOT THE REST API (the player found the repo, 2026-09-16). PokeAPI
publishes its whole database as plain tables under data/v2/csv. Six of them,
263 KB, one download each - against 1027 HTTP requests and a slug guessed per
form, which is what the first version of this did.

AND THE COMMIT IS PINNED. He asked whether the repository is safe, which is the
right question to ask of anything fetched. Two halves to the answer:

  * NOTHING HERE IS EXECUTED. These are CSV tables, read as text into numbers
    and names. The worst a bad commit upstream could do is give a wrong stat -
    it cannot run anything.
  * So the risk is a number changing quietly, and that is what the pin closes:
    the files are read at ONE COMMIT, not at "whatever master says today".
    `--check` re-downloads at that pin and fails if the result moved, and the
    output is committed, so any change shows in a diff before it ships.

Moving the pin is a deliberate edit, with the diff to read.
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q                                             # noqa: E402

RAW = os.path.join(ROOT, "data", "raw", "pokeapi_csv")
META = os.path.join(ROOT, "data", "meta")
OUT = os.path.join(ROOT, "data", "db", "home_dex.json")
SPRITES = os.path.join(ROOT, "data", "db", "sprite_ids.json")
# PokeAPI/pokeapi, BSD-3-Clause, pinned. Bump deliberately and read the diff.
PIN = "4b82c204ddd19ecb8eda2ea044ccb59e222b721c"
BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/%s/data/v2/csv/" % PIN
# stat_id order: 1 hp, 2 attack, 3 defense, 4 sp.atk, 5 sp.def, 6 speed
STAT_ORDER = [1, 2, 3, 4, 5, 6]
ENGLISH = "9"                       # local_language_id

# The few spellings that are genuinely different words rather than punctuation.
ALIASES = {
    "toxtricity-l": "toxtricity-low-key",
    "toxtricity": "toxtricity-amped",
    "urshifu-r": "urshifu-rapid-strike",
    "farfetchd-galar": "sirfetchd",
    "indeedee-f": "indeedee-female",
    "indeedee-m": "indeedee-male",
    # PokeAPI names the DEFAULT of a split family explicitly where our dex
    # writes the bare species. Each of these is the form our row means.
    "indeedee": "indeedee-male",
    "meowstic": "meowstic-male",
    "pyroar": "pyroar-male",
    "basculin": "basculin-red-striped",
    "aegislash": "aegislash-shield",
    "lycanroc": "lycanroc-midday",
    "mimikyu": "mimikyu-disguised",
    "eiscue": "eiscue-ice",
    "morpeko": "morpeko-full-belly",
    "wishiwashi": "wishiwashi-solo",
    "oricorio": "oricorio-baile",
    "darmanitan-galar": "darmanitan-galar-standard",
    "zygarde": "zygarde-50",
    # Gourgeist and Pumpkaboo: ours are sizes, theirs are the same sizes under
    # other words. Ours with no suffix IS the Medium/Average one.
    "gourgeist": "gourgeist-average",
    "gourgeist-small": "gourgeist-small",
    "gourgeist-large": "gourgeist-large",
    "gourgeist-jumbo": "gourgeist-super",
    "pumpkaboo": "pumpkaboo-average",
    "pumpkaboo-jumbo": "pumpkaboo-super",
    # Tauros' Paldean breeds carry "-breed" upstream
    "tauros-paldea-aqua": "tauros-paldea-aqua-breed",
    "tauros-paldea-blaze": "tauros-paldea-blaze-breed",
    "tauros-paldea-combat": "tauros-paldea-combat-breed",
    # Looked up upstream rather than guessed: each of these is the row that
    # actually exists there, and our bare name means that one.
    "basculegion": "basculegion-male",
    "maushold": "maushold-family-of-four",
    "palafin": "palafin-zero",
    "squawkabilly": "squawkabilly-green-plumage",
    "squawkabilly-blue": "squawkabilly-blue-plumage",
    "squawkabilly-yellow": "squawkabilly-yellow-plumage",
    "squawkabilly-white": "squawkabilly-white-plumage",
    # The six a WORLDS TEAMLIST writes bare while the weight table only carries
    # the suffixed forms, so neither side had a row to meet on and the card was
    # a name and nothing else. pokedata publishes "Landorus"; upstream calls
    # the default form "landorus-incarnate". Each of these was looked up in
    # pokemon.csv rather than guessed.
    "landorus": "landorus-incarnate",
    "thundurus": "thundurus-incarnate",
    "tornadus": "tornadus-incarnate",
    "urshifu": "urshifu-single-strike",
    "tatsugiri": "tatsugiri-curly",
}

# A Mega whose BASE is an alias must not inherit the alias: Pyroar is
# `pyroar-male` on its own, but its Mega is `pyroar-mega`, not
# `pyroar-male-mega`. Looked up, not assumed.
MEGA_BASE = {"pyroar-male": "pyroar"}

# OUR NAME FOR A MEGA IS A PREFIX; THEIRS IS A SUFFIX. "Mega Charizard X" is
# `charizard-mega-x` upstream, and getting that one transform right resolves 80
# of the 81 Megas - including the Z line Regulation M-C added, which PokeAPI
# already carries (absol-mega-z, garchomp-mega-z, lucario-mega-z).
MEGA = re.compile(r"^Mega (.+?)(?: ([XYZ]))?$")


def table(name, force=False):
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, name)
    if not os.path.exists(path) or force:
        req = urllib.request.Request(BASE + name,
                                     headers={"User-Agent": "champions-ledger"})
        with urllib.request.urlopen(req, timeout=60) as r:
            open(path, "wb").write(r.read())
    return list(csv.DictReader(io.open(path, encoding="utf-8")))


def key(name):
    """A spelling reduced to something both sides agree on."""
    m = MEGA.match(name)
    if m:
        base = key(m.group(1))
        base = MEGA_BASE.get(base, base)
        return base + "-mega" + (("-" + m.group(2).lower()) if m.group(2) else "")
    s = name.lower().replace("’", "").replace("'", "").replace(".", "")
    s = re.sub("[^a-z0-9]+", "-", s).strip("-")
    return ALIASES.get(s, s)


def worlds_names():
    """Every Pokemon a WORLDS TEAMLIST names, across all four championships and
    all three divisions.

    These are not in the weight table under the spelling pokedata uses, and 53
    of them are not in the Champions dex at all - the 2025 field was full of
    Calyrex, Koraidon and Flutter Mane, none of which this game has. The app
    drew each of them as a bare name: no types, no BST, no stats, no ability
    and no sheet behind it.

        "en Find, en el apartado Worlds, floette no tiene ficha, si deberia
         tenerla... igualmente en los otros anos habian otros pokemones
         disponibles y existe el mismo problema que en la caja de home... es
         mejor tenerla ahora que ir cargandola despues, ya que cuando los
         pokemones llegan a champions por actualizacion de regulation, muy
         pocas veces sufren balanceos, en stats es poco probable"
         (player, 2026-09-18)

    He is right about the second half too, and it is why this is safe: a
    regulation rebalances MOVEPOOLS far more often than spreads, and a main-
    series spread for a species Champions does not have contradicts nothing of
    ours. The moment it arrives, Serebii's row replaces this one.
    """
    # Walked rather than keyed, because the three shapes here - a round's
    # standings, a year's archive and a division's teamlists - nest a name at
    # three different depths, and a reader that knows only one of them finds
    # five of the six and looks like it worked. Ogerpon was the sixth.
    out = set()
    files = [f for f in os.listdir(META)
             if f.endswith(".json")
             and (f.startswith("tournament_") or f == "worlds_archive.json")]

    def walk(node):
        if isinstance(node, dict):
            n = node.get("name")
            if isinstance(n, str) and n:
                out.add(n)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    for f in files:
        try:
            walk(json.load(io.open(os.path.join(META, f), encoding="utf-8")))
        except (OSError, ValueError):
            continue
    return out


def home_only_names():
    """Every name the app can put on a card that Champions has no row for.

    Two sources, because the box is not the only screen that draws one: the
    weight table (which is what HOME can hold) and every Worlds teamlist (which
    is history, and had no numbers on it at all).
    """
    wt = set(Q.db("weights")["weights"])
    champ = set()
    for p in Q.db("pokemon"):                 # a LIST of form rows
        for n in (p.get("name"), p.get("species")):
            if n:
                champ.add(Q.norm(n))
    return sorted(n for n in (wt | worlds_names())
                  if Q.norm(n) not in champ
                  and "-Mega" not in n and "-Gmax" not in n
                  and "-Totem" not in n and "-Starter" not in n)


def resolver(pokemon):
    """PokeAPI's id for a name, or the closest honest stand-in.

    THE SPELLING IS NOT THE PROBLEM; THE DEFAULT FORM IS. PokeAPI has no row
    called `oinkologne` - it files the species as `oinkologne-male` and
    `oinkologne-female`, and the old lookup asked for the bare name, missed,
    fell back to `k.split("-")[0]`, which is the same bare name, and missed
    again. So a Pokemon sitting in his HOME box had no types, no stats, no
    ability and no picture, and tapping it opened a sheet built from null
    (player, 2026-09-21: "la card y la ficha de Oinkolgne-f tira error de
    script, creo que sigue sin reconocer todos los pokemones"). Sixty-odd
    names were in that state, all of them species whose only rows are forms.

    Three steps, in order, and only the third is an approximation:

    1. THE NAME ITSELF. Unchanged, and still what almost everything hits.
    2. THE FORM THAT NAME MEANS. `deoxys` means Deoxys-Normal, `giratina`
       means Altered, `oinkologne` means the male - so a name with no exact
       row takes the DEFAULT form filed under it. The same step reads a
       shortened suffix: `oinkologne-f` is `oinkologne-female` because every
       earlier token matches and `f` starts `female`. Neither is a guess
       about a different Pokemon, so neither is marked approximate.
       The shortened-suffix rule needs at least one earlier token, which is
       what stops `mew` from resolving to `mewtwo`.
    3. ONE SUFFIX AT A TIME. Only then, and recorded: `arceus-bug` has no row
       of its own and Arceus' eighteen plates share one spread, so the base
       row is the honest answer and the card says whose numbers it is showing.
       Dropping one token rather than all of them is what lets
       `necrozma-dusk-mane` land on `necrozma-dusk` instead of on Necrozma.
    """
    by_key, is_def, order = {}, {}, []
    for r in pokemon:
        i = r["identifier"]
        if i in by_key:
            continue
        by_key[i] = r["id"]
        is_def[i] = str(r.get("is_default") or "") in ("1", "True", "true")
        order.append(i)

    def near(k):
        """Rows that ARE k: a form of it, or its suffix written short."""
        kt = k.split("-")
        out = []
        for i in order:
            if i == k:
                continue
            if i.startswith(k + "-"):
                out.append(i)
                continue
            it = i.split("-")
            if len(kt) > 1 and len(it) == len(kt) and kt[:-1] == it[:-1]                and it[-1].startswith(kt[-1]):
                out.append(i)
        # the default form first, then the shortest name, then alphabetical -
        # a total order, so the same input always gives the same row
        out.sort(key=lambda i: (not is_def[i], len(i), i))
        return out

    def resolve(k):
        if k in by_key:
            return by_key[k], None
        n = near(k)
        if n:
            return by_key[n[0]], None
        parts = k.split("-")
        while len(parts) > 1:
            parts.pop()
            base = "-".join(parts)
            if base in by_key:
                return by_key[base], base
            nb = near(base)
            if nb:
                return by_key[nb[0]], base
        return None, None

    return resolve


def build(force=False):
    pokemon = table("pokemon.csv", force)
    stats = table("pokemon_stats.csv", force)
    ptypes = table("pokemon_types.csv", force)
    pabil = table("pokemon_abilities.csv", force)
    types = dict((r["id"], r["identifier"].capitalize())
                 for r in table("types.csv", force))
    abil = dict((r["ability_id"], r["name"])
                for r in table("ability_names.csv", force)
                if r.get("local_language_id") == ENGLISH)

    resolve = resolver(pokemon)

    st, ty, ab = {}, {}, {}
    for r in stats:
        if int(r["stat_id"]) in STAT_ORDER:
            st.setdefault(r["pokemon_id"], {})[int(r["stat_id"])] = \
                int(r["base_stat"])
    for r in ptypes:
        ty.setdefault(r["pokemon_id"], []).append((int(r["slot"]), r["type_id"]))
    for r in pabil:
        ab.setdefault(r["pokemon_id"], []).append((int(r["slot"]),
                                                   r["ability_id"]))

    out, missed = {}, []
    for name in home_only_names():
        pid, approx = resolve(key(name))
        if not pid or pid not in st:
            missed.append(name)
            continue
        row = {"t": [types[t] for _, t in sorted(ty.get(pid, []))],
               "b": [st[pid].get(i, 0) for i in STAT_ORDER],
               "ab": [abil.get(a, a) for _, a in sorted(ab.get(pid, []))]}
        if approx:
            row["approx"] = approx
        out[name] = row
    return out, missed


def sprite_ids(force=False):
    """PokeAPI's own id for every name the app can put on a card.

    A SPRITE IS NOT A RULE. Everything else fetched here is refused for the
    species Champions HAS, because its numbers are rebalanced and PokeAPI's are
    not - but a picture of a Pikachu is a picture of a Pikachu, and Champions
    publishes none of its own. So this half covers the Champions dex too.

    The images are NOT copied into this repository. They are Nintendo and Game
    Freak artwork; PokeAPI itself licenses its sprites repo as NOASSERTION for
    exactly that reason, and this repository is public. The app builds a CDN
    URL from these ids at run time, so nothing of theirs is ever redistributed
    from here and a takedown is a one-line change rather than a git history to
    rewrite."""
    pokemon = table("pokemon.csv", force)
    resolve = resolver(pokemon)
    out, missed = {}, []
    names = [p["name"] for p in Q.db("pokemon")] + home_only_names()
    # AND THE FORMS A POKEMON TAKES DURING A BATTLE, which are not dex rows and
    # so were never asked for. A card draws its Megas as pictures; Aegislash
    # turning into Blade Forme is the same kind of fact and had no picture to
    # draw (player, 2026-09-20: "faltan las formas de batalla... hay que
    # incluir esas formas en las fichas, porque tambien son modificaciones in
    # battle, como los megas"). PokeAPI spells them exactly as this file's
    # key() reduces them - aegislash-blade, palafin-hero, castform-sunny - so
    # they resolve with no alias of their own.
    for p in Q.db("pokemon"):
        for form in sorted(p.get("battle_forms") or {}):
            names.append(p["name"] + "-" + form)
    for name in names:
        # EXACT ROWS ONLY. A stand-in spread is honest because the card says
        # whose it is; a stand-in PICTURE is not - every Arceus plate looks
        # different, and drawing the plain one under "Arceus-Bug" would be the
        # app asserting something false. No sprite stays the right answer.
        pid, approx = resolve(key(name))
        if pid and not approx:
            out[name] = int(pid)
        else:
            missed.append(name)
    return out, missed


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--check", action="store_true",
                    help="re-download at the pin and fail if the result moved")
    args = ap.parse_args()

    out, missed = build(args.force or args.check)
    if args.check:
        if not os.path.exists(OUT):
            sys.exit("no stored table yet - run without --check")
        old = json.load(io.open(OUT, encoding="utf-8"))
        moved = sorted(k for k in set(old) | set(out) if old.get(k) != out.get(k))
        if moved:
            sys.exit("the pinned data no longer matches for %d: %s"
                     % (len(moved), ", ".join(moved[:12])))
        print("home dex matches the pin (%d species)" % len(out))
        return

    json.dump(out, io.open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    sid, snot = sprite_ids(args.force)
    json.dump(sid, io.open(SPRITES, "w", encoding="utf-8"),
              ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    print("wrote %s  (%d names, %.0f KB)"
          % (os.path.relpath(SPRITES, ROOT), len(sid),
             os.path.getsize(SPRITES) / 1024.0))
    champ = [p["name"] for p in Q.db("pokemon")]
    gap = [n for n in champ if n not in sid]
    if gap:
        print("  %d CHAMPIONS forms have no sprite id: %s"
              % (len(gap), ", ".join(gap[:12])))
    approx = [k for k, v in out.items() if v.get("approx")]
    print("wrote %s  (%d species, %.0f KB)"
          % (os.path.relpath(OUT, ROOT), len(out),
             os.path.getsize(OUT) / 1024.0))
    if approx:
        print("  %d use their base species' row, marked `approx`: %s"
              % (len(approx), ", ".join(sorted(approx)[:10])))
    if missed:
        print("  %d have NO PokeAPI row at all: %s"
              % (len(missed), ", ".join(missed[:20])))
        # WHAT IS LEFT IS NOT A SPELLING PROBLEM, and the line that used to sit
        # here said it was. Every remaining name is a CAP - a Pokemon Smogon's
        # community invented, which rides in on the weights table and has never
        # existed in a game, so no alias can find it and none should be written.
        # Syclant, Revenankh, Pyroak and the rest cannot be in HOME either.
        print("  those are Smogon's CAP creations, carried in by the weights "
              "table. They are not Pokemon and stay blank; an ALIASES entry "
              "would only make one point at a different species.")


if __name__ == "__main__":
    main()
