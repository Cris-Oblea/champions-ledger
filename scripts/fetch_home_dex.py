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
import json
import os
import re
import sys
import urllib.request

import query as Q

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RAW = os.path.join(ROOT, "data", "raw", "pokeapi_csv")
META = os.path.join(ROOT, "data", "meta")
OUT = os.path.join(ROOT, "data", "db", "home_dex.json")
SPRITES = os.path.join(ROOT, "data", "db", "sprite_ids.json")
FORMS = os.path.join(ROOT, "data", "db", "form_line.json")
GAPS = os.path.join(ROOT, "data", "db", "sprite_gaps.json")
# The sprite commit is pinned in the APP, which is what builds the URLs, and
# read from there - one pin, so the ids written here can never be checked
# against a different commit than the one the phone fetches from.
APP_DATA = os.path.join(ROOT, "tracker", "src", "core", "data.js")
SPRITE_RAW = os.path.join(ROOT, "data", "raw", "pokeapi_sprites")
FLAGS = os.path.join(ROOT, "data", "db", "species_flags.json")
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
    # Two Pokemon whose ABILITY is the whole difference, spelled with no token
    # in common past the species. The resolver drops a suffix it cannot place
    # and falls back to the base row, so the Battle Bond Greninja came out
    # with Torrent and Protean and the Own Tempo Rockruff with Keen Eye, Vital
    # Spirit and Steadfast - each carrying exactly the abilities it cannot
    # have. Found by the sweep that found Battle Bond missing from our own
    # Greninja row (2026-09-27).
    "greninja-bond": "greninja-battle-bond",
    "rockruff-dusk": "rockruff-own-tempo",
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
    # Four the weight table spells its own way, each of which fell to the
    # one-suffix-at-a-time step, was marked approximate and so drew NO
    # picture - while being exactly the Pokemon upstream has a row for.
    # Minior's meteor shell is one picture for all seven cores; Smogon writes
    # the Necrozma fusions out in full; and Aegislash-Both is Smogon's own
    # name for "Aegislash, whichever stance", which is the Shield row.
    "minior-meteor": "minior-red-meteor",
    "necrozma-dusk-mane": "necrozma-dusk",
    "necrozma-dawn-wings": "necrozma-dawn",
    "aegislash-both": "aegislash-shield",
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
    return list(csv.DictReader(open(path, encoding="utf-8")))


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
            walk(json.load(open(os.path.join(META, f), encoding="utf-8")))
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
    types = {r["id"]: r["identifier"].capitalize()
             for r in table("types.csv", force)}
    abil = {r["ability_id"]: r["name"]
            for r in table("ability_names.csv", force)
            if r.get("local_language_id") == ENGLISH}

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

    by_form = form_rows(force)
    out, missed = {}, []
    for name in home_only_names():
        pid, approx = resolve(key(name))
        # A NAMED FORM OF A ROW IS NOT AN APPROXIMATION. Arceus-Ice has no row
        # of its own because it has no numbers of its own: its spread IS row
        # 493's, and its typing is written on the form. So it is exact, and
        # the card stops saying "showing arceus" under a picture of the Ice
        # plate - and stops calling it Normal.
        form = by_form(key(name)) if approx else None
        if form:
            pid, approx = form["pid"], None
        if not pid or pid not in st:
            missed.append(name)
            continue
        row = {"t": (form and form["t"]) or
                    [types[t] for _, t in sorted(ty.get(pid, []))],
               "b": [st[pid].get(i, 0) for i in STAT_ORDER],
               "ab": [abil.get(a, a) for _, a in sorted(ab.get(pid, []))]}
        if approx:
            row["approx"] = approx
        out[name] = row
    return out, missed


def species_flags(force=False):
    """Which names are Mythical, and which Legendary.

    WHY IT IS DERIVED AND NOT TYPED. Melmetal cannot be deposited in HOME's
    GTS (player, 2026-09-21) and he confirmed it is a Mythical, which makes
    "Mythicals are refused" the obvious explanation - but a list of the 23
    Mythicals written from memory is exactly the kind of thing this project
    does not do. PokeAPI publishes the flag, at the same pinned commit as
    everything else here, so it is read rather than recalled.

    CHAMPIONS HAS NONE OF EITHER - checked over the whole dex, 0 Mythicals and
    0 Legendaries - so every one of them that ever reaches HOME is a species
    Champions cannot use, which is precisely the pile the GTS recommendations
    put FIRST. The flag is what stops that list leading with something the GTS
    will refuse to hold.

    Returned per NAME, every form, because that is what the app has in hand."""
    myth, leg = set(), set()
    for r in table("pokemon_species.csv", force):
        if r.get("is_mythical") == "1":
            myth.add(r["identifier"])
        if r.get("is_legendary") == "1":
            leg.add(r["identifier"])
    names = [p["name"] for p in Q.db("pokemon")] + home_only_names()
    out = {"mythical": [], "legendary": []}
    for n in sorted(set(names)):
        k = key(n)
        base = k.split("-")[0]
        if k in myth or base in myth:
            out["mythical"].append(n)
        elif k in leg or base in leg:
            out["legendary"].append(n)
    return out


def sprite_pin():
    m = re.search(r'var SPRITE_PIN = "([0-9a-f]{40})"',
                  open(APP_DATA, encoding="utf-8").read())
    if not m:
        sys.exit("SPRITE_PIN not found in %s" % os.path.relpath(APP_DATA, ROOT))
    return m.group(1)


# The four sets the app draws from, by their path in the sprites repo.
SPRITE_DIRS = {
    "pixel": "sprites/pokemon",
    "shiny": "sprites/pokemon/shiny",
    "home": "sprites/pokemon/other/home",
    "home_shiny": "sprites/pokemon/other/home/shiny",
}


def sprite_files(force=False):
    """Every picture that EXISTS at the pinned sprites commit, per set.

    WHY THIS IS ASKED AND NOT ASSUMED. An id used to be written whenever the
    name resolved, on the belief that a row upstream means a picture upstream.
    It does not, in either direction: 48 cards had no id at all because their
    picture is filed by FORM rather than by row (Arceus-Ice is `493-ice.png`,
    Cherrim-Sunshine `421-sunshine.png`), and the HOME set simply lacks a few
    the pixel set has (Pichu's spiky ear, Sinistea's antique teapot). Reading
    the directory listing settles both, once per pin: a pinned commit cannot
    change, so the cached listing is final.

    GitHub's tree API, one call per directory walked. A token is used when the
    environment has one, only for the rate limit - the repository is public."""
    pin = sprite_pin()
    path = os.path.join(SPRITE_RAW, pin + ".json")
    if os.path.exists(path) and not force:
        return {k: set(v)
                for k, v in json.load(open(path, encoding="utf-8")).items()}
    api = "https://api.github.com/repos/PokeAPI/sprites/"
    head = {"User-Agent": "champions-ledger",
            "Accept": "application/vnd.github+json"}
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if tok:
        head["Authorization"] = "Bearer " + tok
    seen = {}

    def get(url):
        if url not in seen:
            req = urllib.request.Request(url, headers=head)
            with urllib.request.urlopen(req, timeout=60) as r:
                seen[url] = json.loads(r.read().decode("utf-8"))
        return seen[url]

    root = get(api + "commits/" + pin)["commit"]["tree"]["sha"]
    out = {}
    for label, sub in SPRITE_DIRS.items():
        sha = root
        for part in sub.split("/"):
            sha = next(e["sha"] for e in get(api + "git/trees/" + sha)["tree"]
                       if e["path"] == part and e["type"] == "tree")
        tree = get(api + "git/trees/" + sha)
        if tree.get("truncated"):
            sys.exit("the listing of %s came back truncated" % sub)
        out[label] = sorted(e["path"][:-4] for e in tree["tree"]
                            if e["type"] == "blob" and e["path"].endswith(".png"))
    os.makedirs(SPRITE_RAW, exist_ok=True)
    json.dump(out, open(path, "w", encoding="utf-8"), separators=(",", ":"))
    return {k: set(v) for k, v in out.items()}


def stem_value(stem):
    """A picture's file name as the app stores it: a number where it is one."""
    return int(stem) if stem.isdigit() else stem


def form_rows(force=False):
    """Every FORM upstream names, by identifier: the row it belongs to, the
    picture it is filed under, and its own typing where it has one.

    PokeAPI gives a row - and so a numbered picture and a spread - only to a
    form whose numbers differ. Arceus' eighteen plates share one spread, so
    they share row 493, and each one's picture is `493-<form>.png`. The same
    holds for Silvally's memories, Genesect's drives, Vivillon's patterns,
    Cherrim in the sun and Pichu's spiky ear. pokemon_forms.csv names every
    one of them with the row it belongs to, and pokemon_form_types.csv the
    typing of the few whose TYPE is the difference - Arceus-Ice is Ice, not
    the Normal of row 493.

    Looked up with the hyphens removed as well, because the weight table
    writes Vivillon-Pokeball where upstream writes vivillon-poke-ball."""
    types = {r["id"]: r["identifier"].capitalize()
             for r in table("types.csv", force)}
    ftypes = {}
    for r in table("pokemon_form_types.csv", force):
        ftypes.setdefault(r["pokemon_form_id"], []).append(
            (int(r["slot"]), types[r["type_id"]]))
    by = {}
    for r in table("pokemon_forms.csv", force):
        row = {"pid": r["pokemon_id"],
               "stem": (r["pokemon_id"] if r.get("is_default") == "1"
                        else "%s-%s" % (r["pokemon_id"], r["form_identifier"])),
               "t": [t for _, t in sorted(ftypes.get(r["id"], []))] or None}
        for k in (r["identifier"], r["identifier"].replace("-", "")):
            by.setdefault(k, row)
    return lambda k: by.get(k) or by.get(k.replace("-", ""))


def sprite_ids(force=False):
    """The picture for every name the app can put on a card.

    A SPRITE IS NOT A RULE. Everything else fetched here is refused for the
    species Champions HAS, because its numbers are rebalanced and PokeAPI's are
    not - but a picture of a Pikachu is a picture of a Pikachu, and Champions
    publishes none of its own. So this half covers the Champions dex too.

    The images are NOT copied into this repository. They are Nintendo and
    Game Freak artwork; PokeAPI itself licenses its sprites repo as NOASSERTION for
    exactly that reason, and this repository is public. The app builds a CDN
    URL from these ids at run time, so nothing of theirs is ever redistributed
    from here and a takedown is a one-line change rather than a git history to
    rewrite.

    The value is the file name without `.png`: a number for a row's own
    picture, `493-ice` for one filed by form. Nothing is written that the
    pixel set at the pin does not actually hold.

    THE FORMS A POKEMON TAKES MID-BATTLE ARE NOT HERE any more. They are not
    cards, they are drawn ON a card, and they live in form_line.json with the
    rest of what the form is - see form_line()."""
    pokemon = table("pokemon.csv", force)
    resolve = resolver(pokemon)
    by_form = form_rows(force)
    files = sprite_files(force)
    out, missed = {}, []
    names = [p["name"] for p in Q.db("pokemon")] + home_only_names()
    for name in names:
        # EXACT ROWS ONLY. A stand-in spread is honest because the card says
        # whose it is; a stand-in PICTURE is not - every Arceus plate looks
        # different, and drawing the plain one under "Arceus-Bug" would be the
        # app asserting something false. The FORM's own file is not a
        # stand-in, which is why it is the second place looked.
        pid, approx = resolve(key(name))
        form = None if pid and not approx else by_form(key(name))
        stem = form["stem"] if form else pid if pid and not approx else None
        if stem and stem in files["pixel"]:
            out[name] = stem_value(stem)
        else:
            missed.append(name)
    return out, missed


def sprite_gaps(ids, force=False):
    """The pictures one set has and the other does not, for the ids in use.

    A sheet asks for the 512px HOME render and a card for the 96px pixel
    sprite, and a missing file is a 404 and then nothing at all. Most gaps
    run one way - the HOME set lacks Pichu's spiky ear, Sinistea's antique
    teapot - and those go straight to the pixel sprite. One runs the other:
    Mega Zygarde arrived with Legends Z-A and upstream has only ever drawn
    its HOME render, so the card shows that, at card size.

      n / s    no HOME render, normal / shiny  -> use the pixel sprite
      p / ps   no pixel sprite, normal / shiny -> use the HOME render"""
    files = sprite_files(force)
    used = sorted({str(v) for v in ids}, key=lambda s: (len(s), s))
    out = {}
    for k, where in (("n", "home"), ("s", "home_shiny"),
                     ("p", "pixel"), ("ps", "shiny")):
        out[k] = [stem_value(s) for s in used if s not in files[where]]
    return out


# THE FORMS A POKEMON TAKES DURING A BATTLE, other than a Mega. Declared, one
# line each, because two things about them are not in any table: which form
# it turns FROM, and what turns it. PokeAPI flags every one of these
# `is_battle_only` - except Minior's core, which it does not, and which Shields
# Down flips exactly as Stance Change flips Aegislash.
#
# upstream form          (the form it turns from,        label,       what does it)
IN_BATTLE = {
    "castform-sunny":       ("castform",                   "Sunny",     "Forecast"),
    "castform-rainy":       ("castform",                   "Rainy",     "Forecast"),
    "castform-snowy":       ("castform",                   "Snowy",     "Forecast"),
    "cherrim-sunshine":     ("cherrim",                    "Sunshine",  "Flower Gift"),
    "darmanitan-zen":       ("darmanitan-standard",        "Zen",       "Zen Mode"),
    "darmanitan-galar-zen": ("darmanitan-galar-standard",  "Zen",       "Zen Mode"),
    "meloetta-pirouette":   ("meloetta-aria",              "Pirouette", "Relic Song"),
    "aegislash-blade":      ("aegislash-shield",           "Blade",     "Stance Change"),
    "kyogre-primal":        ("kyogre",                     "Primal",    "Blue Orb"),
    "groudon-primal":       ("groudon",                    "Primal",    "Red Orb"),
    "zygarde-complete":     ("zygarde-50-power-construct", "Complete",  "Power Construct"),
    "wishiwashi-school":    ("wishiwashi-solo",            "School",    "Schooling"),
    "minior-red":           ("minior-red-meteor",          "Core",      "Shields Down"),
    "mimikyu-busted":       ("mimikyu-disguised",          "Busted",    "Disguise"),
    "cramorant-gulping":    ("cramorant",                  "Gulping",   "Gulp Missile"),
    "cramorant-gorging":    ("cramorant",                  "Gorging",   "Gulp Missile"),
    "eiscue-noice":         ("eiscue-ice",                 "Noice",     "Ice Face"),
    "morpeko-hangry":       ("morpeko-full-belly",         "Hangry",    "Hunger Switch"),
    "zacian-crowned":       ("zacian",                     "Crowned",   "Rusted Sword"),
    "zamazenta-crowned":    ("zamazenta",                  "Crowned",   "Rusty Shield"),
    "palafin-hero":         ("palafin-zero",               "Hero",      "Zero to Hero"),
    "terapagos-terastal":   ("terapagos",                  "Terastal",  "Tera Shift"),
}
# ...and the ones upstream flags battle-only that no card draws, each with its
# reason. A form in neither table stops this script, so a pin bump that adds
# one is noticed rather than silently left off every card.
NOT_DRAWN = {
    "-gmax": "Gigantamax needs Dynamax, and Champions has none",
    "-totem": "a Totem is a boss, never a Pokemon a player owns",
    "terapagos-stellar": "reached by Terastallizing, and Champions has none",
    "necrozma-ultra": "Ultra Burst needs a Z-Crystal, and Champions has none",
    # Champions' own Battle Bond (pokebase, off the game) raises Attack, Sp.
    # Atk and Speed on a KO; it no longer turns Greninja into anything.
    "greninja-ash": "Champions' Battle Bond raises stats instead",
    # Xerneas takes it the moment it is sent out and never leaves it: there is
    # no second state, no trigger and no number to show.
    "xerneas-active": "not a change - Xerneas is always in it once sent out",
}
MEGA_FORM = re.compile(r"^(.+)-mega(?:-([xyz]))?$")


def form_line(force=False):
    """What every card's Pokemon can TURN INTO mid-battle: its Megas and its
    in-battle forms, with the picture and the main-series numbers of each.

    WHY (player, 2026-09-27): "no todos los sprites estan cargando... morpeko
    tiene otra forma y es por habilidad y no se ve su otro sprite... la idea
    es tener todas las imagenes funcionando." And why it matters beyond the
    picture: "algunas formas determinan algunas habilidades o ataques, como
    aura wheel de morpeko cambia de tipo el move segun su forma."

    The card only knew what the CHAMPIONS data said a Pokemon becomes, and
    that data only carries a form when Serebii prints numbers for it - so the
    two forms that move no number (Morpeko's Hangry Mode, Mimikyu's Busted
    Form) had no picture, and no species outside Champions had any form at
    all: no Mega Mewtwo X or Y, no Mega Rayquaza, no Primal Kyogre.

    Keyed by the card's own name. The numbers are upstream's, which is what
    they are for a species Champions lacks; for one it HAS,
    build_tracker_data.py takes only the existence and the picture from here
    and keeps Champions' own numbers - and refuses a form whose upstream
    numbers move while ours carry none."""
    pokemon = table("pokemon.csv", force)
    forms = table("pokemon_forms.csv", force)
    stats = table("pokemon_stats.csv", force)
    ptypes = table("pokemon_types.csv", force)
    pabil = table("pokemon_abilities.csv", force)
    types = {r["id"]: r["identifier"].capitalize()
             for r in table("types.csv", force)}
    abil = {r["ability_id"]: r["name"]
            for r in table("ability_names.csv", force)
            if r.get("local_language_id") == ENGLISH}
    files = sprite_files(force)
    resolve = resolver(pokemon)
    pid_of = {r["identifier"]: r["id"] for r in pokemon}
    species_ident = {r["id"]: r["identifier"]
                     for r in table("pokemon_species.csv", force)}
    species_of = {r["id"]: r["species_id"] for r in pokemon}

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

    def numbers(pid):
        return {"t": [types[t] for _, t in sorted(ty.get(pid, []))],
                "b": [st[pid].get(i, 0) for i in STAT_ORDER],
                "ab": [abil.get(a, a) for _, a in sorted(ab.get(pid, []))]}

    # which cards each upstream row IS - exact resolutions only, the same
    # standard the pictures are held to
    cards = {}
    for name in [p["name"] for p in Q.db("pokemon")
                 if not p.get("is_mega")] + home_only_names():
        pid, approx = resolve(key(name))
        if pid and not approx:
            cards.setdefault(pid, []).append(name)

    def title(ident):
        return " ".join(w.capitalize() for w in ident.split("-"))

    out, unknown, orphan = {}, [], []
    for r in forms:
        fid = r["identifier"]
        mega = MEGA_FORM.match(fid) if r.get("is_mega") == "1" else None
        if mega:
            base, _ = resolve(mega.group(1))
            if not base:
                orphan.append(fid)
                continue
            sfx = (mega.group(2) or "").upper()
            # our name for a Mega is the SPECIES and the stone's letter: "Mega
            # Tatsugiri" for all three Tatsugiri, told apart by their own
            # picture, exactly as the games name them
            sp = species_ident[species_of[base]]
            entry = {"n": "Mega " + title(sp) + (" " + sfx if sfx else ""),
                     "mega": sfx}
        elif fid in IN_BATTLE:
            b_ident, label, how = IN_BATTLE[fid]
            base = pid_of.get(b_ident)
            if not base:
                sys.exit("IN_BATTLE names %s as the form %s turns from, and "
                         "upstream has no such row" % (b_ident, fid))
            entry = {"k": label, "by": how}
        elif r.get("is_battle_only") == "1":
            # "-gmax" is a token anywhere in the name: Mimikyu's Totem is
            # mimikyu-totem-busted, not something ending in -totem
            if not any(fid == k or (k.startswith("-") and k + "-" in fid + "-")
                       for k in NOT_DRAWN):
                unknown.append(fid)
            continue
        else:
            continue
        # the picture: the form's own row where it has one, else its file
        form_pid = r["pokemon_id"]
        stem = (form_pid if form_pid != base
                else "%s-%s" % (form_pid, r["form_identifier"]))
        if stem not in files["pixel"] and stem not in files["home"]:
            sys.exit("no picture for %s at the pinned sprites commit (%s.png)"
                     % (fid, stem))
        entry["sp"] = stem_value(stem)
        entry.update(numbers(form_pid))
        # MOVES NO NUMBER: the typing and the spread are the base's own. What
        # lets a Champions species take this form without a Serebii row for
        # it - Hangry Morpeko is Morpeko's spread in every game
        base_n = numbers(base)
        if entry["t"] == base_n["t"] and entry["b"] == base_n["b"]:
            entry["flat"] = 1
        owners = cards.get(base)
        if not owners:
            orphan.append(fid)
            continue
        # ONE NAME FOR THE FORM, however the card is spelled. Minior and
        # Minior-Meteor are the same row, and its core is Minior-Core from
        # either - the shortest spelling is the species' own
        if "k" in entry:
            entry["n"] = min(owners, key=len) + "-" + entry["k"]
        for name in owners:
            out.setdefault(name, []).append(dict(entry))
    if unknown:
        sys.exit("upstream flags %d battle-only forms this script has never "
                 "classified - add each to IN_BATTLE or NOT_DRAWN: %s"
                 % (len(unknown), ", ".join(sorted(unknown))))
    return out, sorted(orphan)


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
        old = json.load(open(OUT, encoding="utf-8"))
        moved = sorted(k for k in set(old) | set(out) if old.get(k) != out.get(k))
        if moved:
            sys.exit("the pinned data no longer matches for %d: %s"
                     % (len(moved), ", ".join(moved[:12])))
        print("home dex matches the pin (%d species)" % len(out))
        return

    json.dump(out, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    sid, _snot = sprite_ids(args.force)
    json.dump(sid, open(SPRITES, "w", encoding="utf-8"),
              ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    print("wrote %s  (%d names, %.0f KB)"
          % (os.path.relpath(SPRITES, ROOT), len(sid),
             os.path.getsize(SPRITES) / 1024.0))
    fl, orphan = form_line(args.force)
    json.dump(fl, open(FORMS, "w", encoding="utf-8"),
              ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    print("wrote %s  (%d forms on %d cards)"
          % (os.path.relpath(FORMS, ROOT), sum(len(v) for v in fl.values()),
             len(fl)))
    if orphan:
        # a form whose base no card is: Zygarde's Complete Forme turns from
        # the Power Construct Zygarde, which the weight table never names -
        # it is a card of its own there instead
        print("  %d have no card to be drawn on: %s"
              % (len(orphan), ", ".join(orphan)))
    gaps = sprite_gaps(list(sid.values()) +
                    [f["sp"] for fs in fl.values() for f in fs], args.force)
    json.dump(gaps, open(GAPS, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print("wrote %s  (%d with no HOME render, %d with no pixel sprite)"
          % (os.path.relpath(GAPS, ROOT), len(gaps["n"]), len(gaps["p"])))
    flags = species_flags(args.force)
    json.dump(flags, open(FLAGS, "w", encoding="utf-8"),
              ensure_ascii=False, sort_keys=True, indent=1)
    print("wrote %s  (%d mythical, %d legendary)"
          % (os.path.relpath(FLAGS, ROOT), len(flags["mythical"]),
             len(flags["legendary"])))
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
