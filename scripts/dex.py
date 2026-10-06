"""The Champions database as Python: load it, name things, find things.

Every script that reads data/db or data/meta imports this module, so a name
is matched the same way everywhere: the five sources spell forms five ways,
and a join written with its own matcher drops species silently. It reads
files only - no network, no ledger - so a build script that imports it runs
anywhere, the gate included. query.py is the command line on top of it.

    db("moves"), meta("usage_pokemon")   a file, parsed once and cached
    norm(name)       the cross-source key for a Pokemon (keeps Mega and form)
    key(name)        the key for a move, item or ability (spelling only)
    species_norm()   the base species, form qualifiers dropped
    target_key()     Serebii's move target, comparable to SPREAD_TARGETS
    find_pokemon(), find_move(), stone_for()
    kept_stamp()     a rewritten file keeps its date when nothing else moved
"""
import json
import os
import re
import unicodedata
from collections.abc import Iterable
from typing import Any

from paths import DB, META

# The game's own type order, which is also how every type table is printed.
TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting",
         "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost",
         "Dragon", "Dark", "Steel", "Fairy"]

# The six stats in the order the game lists them; every stat table and
# spread in the repo is keyed and ordered by these.
STAT_KEYS = ("hp", "atk", "def", "spa", "spd", "spe")

# A move's category as moves.json spells it -> the one-letter code the app
# and the outside dex ship. Three distinct codes: taking the first letter
# collapses Special and Status onto "S", which silently turned every
# Protect into a special attack downstream.
CATEGORY = {"Physical": "P", "Special": "S", "Status": "T"}

# Serebii's target column spells "hits more than one Pokemon" four ways.
# Compared against target_key(), never against the display string.
SPREAD_TARGETS = {"all adjacent foes", "all adjacent opponents",
                  "all adjacent pokemon", "all opponents"}


# --------------------------------------------------------------------------
# loading
# --------------------------------------------------------------------------
# A JSON document as read from disk: the data boundary, like docFromRow in the
# app. Each reader states the shape it expects where it uses one.
type Json = Any
# One JSON object: a row of a table, a Pokemon, a move.
type Row = dict[str, Any]

_cache: dict[str, Json] = {}


def load(path: str, default: Json = None) -> Json:
    """Read a JSON file once and keep it; `default` when it does not exist."""
    if path in _cache:
        return _cache[path]
    if not os.path.exists(path):
        _cache[path] = default
        return default
    with open(path, encoding="utf-8") as f:
        _cache[path] = json.load(f)
    return _cache[path]


def kept_stamp(path: str | os.PathLike[str], blob: dict[str, Any]) -> str:
    """blob["fetched"], unless the file at `path` already holds this same blob: then
    the date already on it. A source re-parsed from cache, or re-fetched with
    nothing new in it, must not rewrite its file with only a new date - the
    nightly report hashes these files, and a moved date read as "Smogon
    written analyses changed" every night while nothing had."""
    try:
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        return blob["fetched"]
    same = "fetched" in old and json.loads(json.dumps({**blob, "fetched": old["fetched"]})) == old
    return old["fetched"] if same else blob["fetched"]


def db(name: str) -> Json:
    """A data/db table, or [] when it has not been built."""
    return load(os.path.join(DB, name + ".json"), [])


def meta(name: str) -> Json:
    """A data/meta file, or None when it has not been fetched."""
    return load(os.path.join(META, name + ".json"))


# Worlds runs three age divisions off the same roster and the same regulation,
# so all three are real evidence about the format - but they are three separate
# metagames and must never be pooled silently into one percentage. Masters is
# the division the player competes in, so it stays the default everywhere.
WORLDS_TID = "0000191"
DIVISIONS = ("masters", "seniors", "juniors")


def tournament(division: str = "masters") -> Json:
    """One division of the current Worlds, or None."""
    return meta("tournament_%s_%s" % (WORLDS_TID, division))


def tournaments(divisions: Iterable[str] | None = None) -> list[tuple[str, Json]]:
    """[(division, data)] for the divisions actually present on disk."""
    out: list[tuple[str, Json]] = []
    for d in (divisions or DIVISIONS):
        t = tournament(d)
        if t:
            out.append((d, t))
    return out


# --------------------------------------------------------------------------
# names
# --------------------------------------------------------------------------
# The four sources spell forms differently and put the qualifier on different
# sides: Serebii "Ninetales-Alola", pokebase "Alolan Ninetales", pokedata
# "Basculegion [Male]", Smogon "Garchomp". Reducing a name to a sorted token
# set makes prefix and suffix spellings land on the same key.
_FORM_SYNONYMS = {
    "alolan": "alola", "hisuian": "hisui", "galarian": "galar",
    "paldean": "paldea", "kantonian": "kanto",
    # "f" is how Smogon and pokebase abbreviate the female form, and our dex
    # spells it out. Without this, Indeedee-F and Indeedee-Female were two
    # different Pokemon to every join - the app listed both, one of them
    # marked "not in the Champions dex". The male needs no entry: "male" and
    # "m" are already base markers, because the male IS the dex row.
    "f": "female",
    # Serebii's biggest Gourgeist is the Jumbo Variety; Smogon's engine and
    # pokebase both call it "Gourgeist-Super".
    "super": "jumbo",
}
# Words that carry no identity. Cosmetic and in-battle forms collapse onto the
# base: Sinistcha's Masterpiece/Unremarkable and Maushold's Family of Three/Four
# are cosmetic, and Aegislash's Blade/Shield is a stance the ability flips
# mid-battle, not a separate dex entry.
#
# The second group is stocked ahead of need. Champions adds Pokemon each
# regulation (M-B brought 22 species and 16 Megas), and when a species with
# cosmetic or in-battle forms arrives, the sources will spell it their usual
# different ways. Listing the tokens now means those names resolve on day one
# instead of silently failing to join. Harmless while unused: none of these
# words appears in a species name.
_NOISE = {
    "breed", "flower", "form", "forme", "the", "of", "family",
    "masterpiece", "unremarkable", "three", "four", "blade", "shield",
    "artisan", "counterfeit", "phony", "antique",
    # in-battle stances and cosmetic sets, for species not yet in Champions
    "hero", "busted", "hangry", "noice", "face", "core", "meteor", "school",
    "solo", "zen", "crowned", "segment", "segments", "plumage", "trim",
    "cream", "strawberry", "berry", "sweet", "size", "small", "super",
    "large", "average", "east", "west", "sea", "spring", "summer", "autumn",
    "winter", "sunny", "rainy", "snowy", "sunshine", "overcast", "gulping",
    "gorging", "sword", "shield-", "ten", "fifty", "hundred", "percent",
    "mode", "two", "segmented", "medium", "variety", "plumages",
    # cosmetic colour variants (Floette/Florges flowers, Alcremie creams,
    # Minior's cores) - none of these words occurs in a species name.
    # NOT cosmetic on Squawkabilly, where the plumage decides the third
    # ability; _SIGNIFICANT below takes those four back for that species only.
    "blue", "green", "yellow", "white", "orange", "purple", "pink",
}
# "Male" marks the base form for the gender-split species here (Basculegion and
# Meowstic are both listed male-first), so it collapses; "Female" is kept.
# "Amped", "Curly", "Ice", "Full Belly" and friends are the default form of
# species that may arrive in a later regulation.
_BASE_MARKERS = {"male", "m", "standard", "midday", "kanto", "kantonian",
                 "amped", "curly", "incarnate", "aria", "ordinary", "red",
                 "striped", "natural", "baile", "disguised", "full", "belly",
                 "ice"}


# Irreducible spelling differences, keyed by the already-normalised form.
# Floette: a usage source (Pikalytics, since dropped) wrote the Mega of the
# Eternal Flower form as
# "Floette-Eternal-Mega", while Serebii calls it simply "Mega Floette"
# (the Floettite only works on that form, so the two mean the same thing).
# Toxtricity (M-C): Serebii suffixes the Low Key form "-L", every other source
# spells it out. "low"/"key" cannot go in _NOISE - that would collapse Low Key
# into Amped, which is a different form with a different ability.
# Floette: only the Eternal Flower form is in Champions - the master list has
# no other, no learner table ever says plain "Floette", the Pokedex page's one
# block carries the Eternal 551 spread and Smogon's roster agrees - so a bare
# "Floette" from any usage source means that form and must land on its row.
_ALIASES = {"eternal floette mega": "floette mega",
            "key low toxtricity": "l toxtricity",
            "floette": "eternal floette"}

# Words that are cosmetic on most species but IDENTITY on these ones, so _NOISE
# must not eat them here. A colour is decoration on a Florges and a different
# Pokemon on a Squawkabilly, where Yellow and White carry Sheer Force and Green
# and Blue carry Guts; a size word is decoration nowhere else and 45 points of
# Speed on a Gourgeist. Scoped per species rather than removed from _NOISE,
# because the same words still have to collapse on Floette, Florges, Alcremie
# and every cosmetic set a later regulation brings in.
# The base row's own form word is NOT listed: our dex row "Squawkabilly" IS the
# Green Plumage and "Gourgeist" IS the Medium Variety, so those two words have
# to keep collapsing or the base form would answer to two different keys.
_SIGNIFICANT = {
    "squawkabilly": {"blue", "yellow", "white"},
    "gourgeist": {"small", "large", "jumbo"},
}


def norm(name: object) -> str:
    """Canonical cross-source key. Keeps Mega and form tokens, drops spelling."""
    if not name:
        return ""
    s = str(name).lower().strip()
    s = s.replace("&#10", " ")
    s = re.sub(r"[\[\]()]", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    raw = [_FORM_SYNONYMS.get(t, t) for t in s.split()]
    keep: set[str] = set()
    for t in raw:
        if t in _SIGNIFICANT:
            keep = _SIGNIFICANT[t]
            break
    tokens: list[str] = []
    for t in raw:
        if (t in _NOISE or t in _BASE_MARKERS) and t not in keep:
            continue
        if t not in tokens:
            tokens.append(t)
    k = " ".join(sorted(tokens))
    return _ALIASES.get(k, k)


def key(name: object) -> str:
    """Plain key for moves, items and abilities.

    These must NOT go through norm(): its form vocabulary would eat real words
    ("Sitrus Berry" -> "sitrus", "Behemoth Blade" -> "behemoth"), and sorting
    tokens would let two different names collide. Only case and punctuation are
    normalised here.
    """
    if not name:
        return ""
    s = str(name).lower().strip()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slug(name: str | None) -> str:
    """The URL spelling Smogon and PokeAPI share: lower case, apostrophes and
    dots dropped, every other run of punctuation one hyphen. "King's Rock" ->
    kings-rock, "U-turn" -> u-turn, "Mr. Mime" -> mr-mime."""
    s = (name or "").lower().replace("'", "").replace("’", "").replace(".", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def target_key(target: str | None) -> str:
    """Serebii's target field, de-accented and lower-cased: "All Adjacent
    Pokemon" really carries an accented e."""
    return "".join(c for c in unicodedata.normalize("NFKD", target or "")
                   if not unicodedata.combining(c)).lower()


def species_norm(name: object) -> str:
    """Key for the base species, ignoring Mega and regional qualifiers."""
    # "z" belongs here with x and y: Regulation M-C's second-Mega suffix.
    # Without it species_norm("Mega Garchomp Z") stayed "garchomp z", matched
    # no base species, and the three Z Megas came back with no movepool at all
    # - so `query.py pokemon "Mega Garchomp Z"` listed none of its moves.
    forms = {"mega", "alola", "hisui", "galar", "paldea", "x", "y", "z", "wash",
             "heat", "frost", "fan", "mow", "dusk", "midnight", "eternal",
             "female", "aqua", "blaze", "combat",
             # kept by _SIGNIFICANT in norm() because they name a real form,
             # but still only a qualifier on the species: a Yellow Plumage
             # Squawkabilly and a Jumbo Gourgeist have the species' movepool.
             "blue", "yellow", "white", "small", "large", "jumbo"}
    return " ".join(t for t in norm(name).split() if t not in forms)


# --------------------------------------------------------------------------
# lookups
# --------------------------------------------------------------------------
def find_pokemon(term: str) -> Row | None:
    """Match by exact name, then normalised name, then substring."""
    mons = db("pokemon")
    t = term.strip().lower()
    for p in mons:
        if p["name"].lower() == t:
            return p
    n = norm(term)
    exact = [p for p in mons if norm(p["name"]) == n and not p["is_mega"]]
    if exact:
        return exact[0]
    exact = [p for p in mons if norm(p["name"]) == n]
    if exact:
        return exact[0]
    part = [p for p in mons if t in p["name"].lower()]
    return part[0] if part else None


def find_move(name: str) -> Row | None:
    """The move with exactly this name (case and punctuation aside), or None.

    No substring fallback, unlike find_pokemon: damage.py answers for the move
    it is given, and "Earthquak" quietly becoming some other move would be a
    wrong number that looks right.
    """
    k = key(name)
    return next((m for m in db("moves") if key(m["name"]) == k), None)


def stone_for(mega: Row) -> str | None:
    """The one stone that creates this Mega form, by name.

    A species may now hold TWO Megas, each with its own stone - Charizardite
    X/Y, and since Regulation M-C the "Z" line (Garchompite Z, Absolite Z,
    Lucarionite Z). Owning "Garchompite" does not make Mega Garchomp Z
    reachable, so the stone has to be resolved per Mega form, not per species.
    """
    species = mega.get("species") or mega["name"].replace("Mega ", "", 1)
    want = (mega.get("form") or "Mega").replace("Mega", "").strip().lower()
    head = re.sub(r"[^a-z]", "", species.lower())[:5]
    for it in db("items"):
        # only stones, or a plain held item wins the prefix test:
        # "Dragon Fang" would answer for Dragonite, "Sharp Beak" for Sharpedo
        if not it.get("is_mega_stone"):
            continue
        toks = re.sub(r"[^a-z0-9 ]", " ", it["name"].lower()).split()
        if not toks or not toks[0].startswith(head):
            continue
        suffix = toks[1] if len(toks) > 1 and toks[1] in ("x", "y", "z") else ""
        if suffix == want:
            return it["name"]
    return None
