"""Turn the cached Serebii HTML into the Pokemon Champions JSON database.

Writes to data/db/:
    pokemon.json    playable forms: types, base stats, abilities, Megas
    moves.json      Champions moves: power/PP/effect + flags + who learns them
    abilities.json  abilities with their Champions text and their carriers
    items.json      purchasable items and their VP price
    learnsets.json  reverse index: Pokemon -> moves

Everything comes from the Champions sections of Serebii. No other Pokemon game.
"""
import html
import json
import os
import re
from collections import defaultdict
from pathlib import Path

from paths import DB, RAW
from serebii_text import read, unmojibake

# An ability is read by its NAME, never by its link's slug. Serebii links
# Greninja's Battle Bond as href="/abilitydex/.shtml" - an empty slug - and
# every pattern here used to demand [a-z0-9]+, so the name was skipped without
# a word and Battle Bond was missing from the database entirely (player,
# 2026-09-27: "greninja tiene 3 habilidades y no 2... algunas habilidades se
# estan perdiendo"). The <b> is the name; the slug is decoration, and one
# broken slug among the 1,389 ability links on the Pokedex pages was enough to
# lose an ability.
ABIL_LINK = r'/abilitydex/[^"]*"[^>]*>\s*<b>([^<]+)</b>'

# The six base stats in the order every stat table on Serebii lists them.
STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"]

# Sprite suffix -> form. The meaning is species-dependent: "-m" is Mow on
# Rotom but Midnight on Lycanroc, so the per-species map wins.
FORM_SUFFIX = {"a": "Alola", "g": "Galar", "h": "Hisui", "p": "Paldea"}

FORM_BY_SPECIES = {
    ("Rotom", "h"): "Heat", ("Rotom", "w"): "Wash", ("Rotom", "f"): "Frost",
    ("Rotom", "s"): "Fan", ("Rotom", "m"): "Mow",
    ("Lycanroc", "m"): "Midnight", ("Lycanroc", "d"): "Dusk",
    ("Meowstic", "f"): "Female", ("Indeedee", "f"): "Female",
    ("Floette", "e"): "Eternal",
    ("Tauros", "p"): "Paldea Combat", ("Tauros", "b"): "Paldea Blaze",
    ("Tauros", "a"): "Paldea Aqua",
}

# Forms that share the base form's sprite, so no attackdex row exists for them,
# and that are nonetheless SEPARATE POKEMON: the form is fixed when you get the
# creature and can never be changed. Serebii's own wording is the test - these
# pages say "cannot be changed" / "doesn't change", while an in-battle stance
# says "changes its form when...". The in-battle ones stay in `battle_forms`.
#
# Squawkabilly: four plumages, one spread and one movepool, and the third
# ability splits them - "Intimidate - Hustle - Guts (Green & Blue) - Intimidate
# - Hustle - Sheer Force (Yellow & White)". Sheer Force is the whole point: it
# cannot be reached on a Green or Blue bird, and collapsing the four into one
# row lost it from the database entirely. The base row is Green (sprite 931).
#
# Gourgeist: four sizes differing in HP, Attack and Speed, from 55/85/99 on the
# Small to 85/100/54 on the Jumbo - a 45-point Speed spread across what used to
# be one row. The base row is the Medium Variety. The spreads come off the
# page's own "Stats - Small Variety" blocks, so only the naming is declared here.
FIXED_FORMS = {
    "Squawkabilly": {
        "Blue": {"abilities": ["Intimidate", "Hustle", "Guts"]},
        "Yellow": {"abilities": ["Intimidate", "Hustle", "Sheer Force"]},
        "White": {"abilities": ["Intimidate", "Hustle", "Sheer Force"]},
    },
    "Gourgeist": {
        "Small": {"stats_from": "Small"},
        "Large": {"stats_from": "Large"},
        "Jumbo": {"stats_from": "Jumbo"},
    },
}

# Forms a Pokemon takes DURING a battle that change its typing rather than its
# spread, so the "Stats - X" blocks the page carries for Aegislash and Palafin
# do not exist for them. Castform is the only one in Champions: Forecast
# "changes its form and type if Harsh Sunlight, Heavy Rain or Snow is in
# effect" (Serebii), which pokebase spells out as "Water, Fire, or Ice" and
# Smogon's engine pairs exactly. Its defensive profile and its STAB both move.
TYPED_BATTLE_FORMS = {
    "Castform": {"Sunny": ["Fire"], "Rainy": ["Water"], "Snowy": ["Ice"]},
}


def txt(x):
    """Reduce an HTML fragment to plain text."""
    x = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", x, flags=re.S)
    x = re.sub(r"<br\s*/?>", " ", x)
    x = re.sub(r"<[^>]+>", " ", x)
    return unmojibake(re.sub(r"\s+", " ", html.unescape(x)).strip())


def sprite_form(src, species=None):
    """Read the form off the sprite filename (003-a.png -> Alola)."""
    base = src.split("/")[-1].rsplit(".", 1)[0]
    if "-" not in base:
        return None
    suf = base.split("-", 1)[1]
    if species and (species, suf) in FORM_BY_SPECIES:
        return FORM_BY_SPECIES[(species, suf)]
    return FORM_SUFFIX.get(suf, suf.capitalize())


# --------------------------------------------------------------------------
# MOVES
# --------------------------------------------------------------------------
FLAG_LABELS = [
    ("Physical Contact", "contact"),
    ("Sound-Type", "sound"),
    ("Punch Move", "punch"),
    ("Biting Move", "biting"),
    ("Snatchable", "snatchable"),
    ("Slicing Move", "slicing"),
    ("Bullet-Type", "bullet"),
    ("Wind Move", "wind"),
    ("Powder Move", "powder"),
    ("Metronome", "metronome"),
    ("Affected by Gravity", "gravity"),
    ("Defrosts When Used", "defrosts"),
    ("Reflected By", "magic_coat"),
    ("Blocked by", "protect_blocks"),
    ("Copyable by", "mirror_move"),
]


TYPE_PAGES = {"normal", "fire", "water", "electric", "grass", "ice", "fighting",
              "poison", "ground", "flying", "psychict", "bug", "rock", "ghost",
              "dragon", "dark", "steel", "fairy", "physical", "special",
              "other", "status"}


# ------------------------------------------------------ settled numbers --
# Where the sources disagree on a move's number, the one decided on stands
# here with its reason (player, 2026-09-27: "siempre escoger el que mejor se
# acerque a la verdad, puede hacerse una tabla de fuentes y decidir cuál es el
# número realista"). `scripts/audit_sources.py` is that table: Serebii,
# pokebase, Smogon's engine, and PokeAPI's main-series PP pushed through the
# rescale the rest of the move table follows.
#
# A ruling only ever FILLS or REPLACES the one field it names, and it says so
# when Serebii starts agreeing on its own - at that point the line is dead
# weight and should go, rather than silently pinning a value upstream fixed.
MOVE_RULINGS = {
    ("Night Slash", "pp"): (16,
        ("pokebase 16 against Serebii 20. Main series 15 PP, and 101 of the 103 "
         "useable 15-PP moves are 16 here - Night Slash was the only one at 20.")),
    ("Double Shock", "accuracy"): (100,
        ("Serebii leaves the cell empty; pokebase and the main series both say "
         "100, and no Champions rebalance of it has been seen.")),
    # NO SECONDARY AT ALL. Serebii's Champions page carries a stray "10 %" in
    # its Effect Rate cell while its Battle Effect names no freeze - every
    # other move with a rate states that rate in its Battle Effect ("Has a 10%
    # chance of freezing"), Freeze-Dry is the only one that does not. Smogon's
    # engine deletes the secondary for Champions on purpose, its Champions dex
    # text names none, and the player confirmed it in game (2026-09-27: "ojo
    # que freeze-dry ya no congela en champions").
    ("Freeze-Dry", "effect_rate"): (None,
        ("No freeze in Champions: Serebii's Battle Effect names none (the 10% "
         "sits alone in its rate cell), Smogon's engine deletes the secondary, "
         "and the player confirmed it in game.")),
    # The rate cell repeats the guaranteed crit as "100 %". A crit is not a
    # secondary: Sheer Force does not boost the move, and Smogon's engine
    # gives it willCrit and no secondaries.
    ("Frost Breath", "effect_rate"): (None,
        ("No secondary: Serebii's 100% rate is the guaranteed crit, which "
         "Smogon's engine models as willCrit, not as a secondary.")),
}


def apply_move_rulings(moves):
    """Apply MOVE_RULINGS in place. Returns the lines worth printing."""
    said = []
    by = {m["name"]: m for m in moves}
    for (name, field), (value, why) in MOVE_RULINGS.items():
        m = by.get(name)
        if m is None:
            said.append("ruling for %s %s: the move is gone - drop the ruling"
                        % (name, field))
            continue
        if m.get(field) == value:
            said.append("ruling for %s %s: Serebii already says %s - drop the "
                        "ruling" % (name, field, value))
            continue
        m[field] = value
        m.setdefault("rulings", {})[field] = why
    return said


def useable_moves():
    """Slugs from the "Useable Moves" page.

    The Champions Attackdex has a page for ~900 moves, but only about 500 can
    actually be used in the game; the rest are dex entries with no legal user.
    Without this, a query for "protection moves" happily returns Obstruct and
    Silk Trap, which nothing in the format can bring.
    """
    p = os.path.join(RAW, "pages", "moves.html")
    if not os.path.exists(p):
        return None
    s = read(p)
    found = set(re.findall(r"/attackdex-champions/([a-z0-9\-\.'%]+)\.shtml", s))
    return found - TYPE_PAGES


def hit_count(effect):
    """[min, max] hits for a multi-hit move, or None.

    Read off Serebii's own effect text ("The user attacks 2 to 5 times in a
    row", "attacks twice in a row") rather than a hardcoded list, so a move
    added by a later regulation is picked up on the next build. Without this
    the damage calculator returns ONE hit and understates Rock Blast, Pin
    Missile, Dual Wingbeat and Population Bomb by 2x to 10x.
    """
    if not effect:
        return None
    e = effect.lower()
    m = re.search(r"attacks (\d+) to (\d+) times", e)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        # Population Bomb reads "1 to 10 times ... the attack ends if the user
        # misses", so the 1 is the MISS case, not a random hit count - it lands
        # ten times or it stops. Smogon's engine files it as a flat 10 for the
        # same reason. Only Triple Axel and Population Bomb carry that clause;
        # the plain 2-5 group has no accuracy check per hit.
        if lo == 1 and "ends if the user misses" in e:
            return [hi, hi]
        return [lo, hi]
    m = re.search(r"attacks (\d+) times in a row", e)
    if m:
        return [int(m.group(1))] * 2
    if re.search(r"attacks twice in a row", e):
        return [2, 2]
    return None


def always_crit(effect, indepth):
    """True for the moves that always land a critical hit (a flat x1.5).

    Champions has three - Flower Trick, Frost Breath and Storm Throw - and the
    damage calculator has to know, because 1.5x moves a lot of rolls across a
    KO boundary.
    """
    for t in (effect or "", indepth or ""):
        if re.search(r"always a critical hit|"
                     r"always (?:results? in|be|lands?) a critical", t, re.I):
            return True
    return False


def _move_name(s, slug):
    m = re.search(r"<title>(.*?)</title>", s, re.S | re.I)
    name = html.unescape(m.group(1)).split(" - ")[0].strip() if m else None
    return name or slug


def _move_type_and_category(s):
    mtype = cat = None
    mt = re.search(r'/attackdex-champions/\w+\.shtml"><img src="/pokedex-bw/type/(\w+)\.gif', s)
    if mt:
        mtype = mt.group(1).capitalize()
    mc = re.search(r"/pokedex-bw/type/(physical|special|other)\.png", s)
    if mc:
        cat = {"physical": "Physical", "special": "Special", "other": "Status"}[mc.group(1)]
    return mtype, cat


def _cell_number(v):
    v = v.strip().replace("--", "")
    return int(v) if v.isdigit() else None


def _move_numbers(s):
    """(PP, base power, accuracy); None where the cell is empty."""
    mb = re.search(
        r"Power Points.*?Base Power.*?Accuracy.*?</tr>\s*<tr>\s*"
        r'<td class="cen">\s*([^<]*?)</td>\s*<td class="cen">\s*([^<]*?)</td>\s*'
        r'<td class="cen">\s*([^<]*?)</td>', s, re.S)
    if not mb:
        return None, None, None
    return _cell_number(mb.group(1)), _cell_number(mb.group(2)), _cell_number(mb.group(3))


def _move_section(s, label):
    mm = re.search(re.escape(label) + r".*?</tr>\s*<tr>(.*?)</tr>", s, re.S)
    return txt(mm.group(1)) if mm else ""


def _move_crit_priority_target(s):
    mx = re.search(
        r"Base Critical Hit Rate.*?Speed Priority.*?Hit in Battle.*?</tr>\s*<tr>\s*"
        r'<td class="cen">\s*([^<]*?)</td>\s*<td class="cen">\s*([^<]*?)</td>\s*'
        r'<td class="cen">\s*([^<]*?)</td>', s, re.S)
    if not mx:
        return None, None, None
    # txt() rather than .strip(): these cells carry HTML entities, and
    # "All Adjacent Pok&eacute;mon" must come out as a readable target.
    try:
        prio = int(mx.group(2).strip())
    except ValueError:
        prio = None
    return txt(mx.group(1)), prio, txt(mx.group(3))


def _move_flags(s):
    """The property table alternates header rows and value rows. Start at the
    <tr> that OPENS the "Physical Contact" row: starting at the text itself
    loses the first header and shifts every flag by one row."""
    flags = {}
    fi = s.find("Physical Contact")
    if fi <= 0:
        return flags
    start = s.rfind("<tr", 0, fi)
    end = s.find("</table>", fi)
    headers, values = [], []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", s[start:end], re.S):
        cells_h = re.findall(r'<td class="fooevo"[^>]*>(.*?)</td>', r, re.S)
        cells_v = re.findall(r'<td class="cen"[^>]*>(.*?)</td>', r, re.S)
        if cells_h:
            headers.append([txt(c) for c in cells_h])
        elif cells_v:
            values.append([txt(c) for c in cells_v])
    # A header row with no value row (or the reverse) is a page quirk,
    # not an error: pair what lines up and read on.
    for hrow, vrow in zip(headers, values, strict=False):
        for h, v in zip(hrow, vrow, strict=False):
            key = next((k for label, k in FLAG_LABELS if h.startswith(label)), None)
            if key:
                flags[key] = (v.strip().lower() == "yes")
    return flags


def _move_learners(s):
    """Every form in the "Pokemon That Learn" table, once, in page order."""
    li = s.find("That Learn")
    if li <= 0:
        return []
    learners = []
    # "#0", not "#0876": Serebii leaves the dex cell blank on Indeedee's
    # female row. A four-digit-only pattern dropped it from all 45
    # movepools it appears in, so the form ended up with no moves at all.
    for r in re.finditer(
            r'class="fooinfo">#(\d{1,4})</td>.*?'
            r'<img src="(/pokedex-sv/icon/[^"]+)".*?'
            r'<a href="/pokedex-champions/[^"]+">([^<]+)</a>', s[li:], re.S):
        nm = html.unescape(r.group(3)).strip()
        form = sprite_form(r.group(2), nm)
        learners.append(nm + ("-" + form if form else ""))
    return list(dict.fromkeys(learners))


def parse_move(path, useable=None):
    s = read(path)
    slug = os.path.basename(path)[:-5]
    mtype, cat = _move_type_and_category(s)
    pp, power, acc = _move_numbers(s)
    effect = _move_section(s, "Battle Effect:")
    indepth = _move_section(s, "In-Depth Effect:")
    # The FIRST cell after the heading, whatever it holds. A move with no
    # secondary writes "-- %" there, and a pattern that insisted on digits
    # walked on into the next cell, the crit rate: 456 moves came out with a
    # "secondary" as likely as their crit. A GUARANTEED secondary (Lunge, Icy
    # Wind) also writes "--", so this is a chance, never a has-a-secondary flag.
    mrate = re.search(r'Effect Rate:.*?</tr>.*?<td class="cen">\s*([\d.]+)?[^<]*</td>',
                      s, re.S)
    crit, prio, target = _move_crit_priority_target(s)
    learners = _move_learners(s)
    return {
        "slug": slug, "name": _move_name(s, slug), "type": mtype, "category": cat,
        "power": power, "accuracy": acc, "pp": pp,
        "effect": effect, "in_depth": indepth,
        "effect_rate": float(mrate.group(1)) if mrate and mrate.group(1) else None,
        "crit_rate": crit, "priority": prio, "target": target,
        "hits": hit_count(effect), "always_crit": always_crit(effect, indepth),
        "flags": _move_flags(s), "learners": learners,
        "learner_count": len(learners),
        "useable": (slug in useable) if useable else None,
    }


# --------------------------------------------------------------------------
# POKEMON
# --------------------------------------------------------------------------
def master_mega_names():
    """slug -> ordered list of Mega names, from the available-Pokemon list.

    A Pokemon page labels both of its Mega blocks just "Mega Charizard"; only
    the master list carries the X/Y suffix. Charizard's two Megas differ by
    type, but Raichu's are both pure Electric, so the pairing has to be done
    by order of appearance, which both pages agree on.
    """
    p = os.path.join(RAW, "pages", "pokemon.html")
    if not os.path.exists(p):
        return {}
    s = read(p)
    s = s[s.find("List of Available"):]
    pat = re.compile(
        r'#(\d{4}).*?<img src="(/pokemonhome/pokemon/small/[^"]+)".*?'
        r'<a href="/pokedex-champions/([^"]+)/">([^<]+)<br', re.S)
    out = defaultdict(list)
    for m in pat.finditer(s):
        name = re.sub(r"\s+", " ", html.unescape(m.group(4))).strip()
        if name.lower().startswith("mega "):
            out[m.group(3)].append(name)
    return out


def _block_name(blk, slug):
    """The name is the first data cell after the "Name" header."""
    mn = re.search(r'>\s*Name\s*</td>.*?</tr>\s*<tr>\s*'
                   r'<td[^>]*class="fooinfo"[^>]*>\s*([^<]+?)\s*</td>', blk, re.S)
    name = re.sub(r"\s+", " ", html.unescape(mn.group(1))).strip() if mn else None
    return name or slug.capitalize()


def _block_types(blk):
    raw_types = re.findall(
        r'/pokedex-champions/\w+\.shtml"><img src="/pokedex-bw/type/(\w+)\.gif', blk)
    if not raw_types:
        raw_types = re.findall(r"/pokedex-bw/type/(\w+)\.gif", blk)[:2]
    # a block can repeat its own type
    return list(dict.fromkeys(raw.capitalize() for raw in raw_types))


def _block_abilities(blk):
    ab = re.search(r"<b>Abilities</b>\s*:(.*?)</td>", blk, re.S)
    abils = [re.sub(r"\s+", " ", html.unescape(a.group(1))).strip()
             for a in re.finditer(ABIL_LINK, ab.group(1))] if ab else []
    return list(dict.fromkeys(a for a in abils
                              if len(a) > 1 and a.lower() != "details"))


def _six_stats(chunk):
    """The six numbers of a stats table, as a spread, or None."""
    nums = re.findall(r'<td[^>]*>\s*(\d{1,3})\s*</td>', chunk)[:6]
    if len(nums) != 6:
        return None
    return dict(zip(STAT_KEYS, map(int, nums), strict=True))


def _block_stats(stat_blocks, hstart, hend):
    """The stats table that sits inside this header block, if any."""
    pos, total, tailblk = next(((pos, total, tail) for pos, total, tail in stat_blocks
                                if hstart <= pos < hend), (None, None, None))
    if pos is None:
        return None
    stats = _six_stats(tailblk)
    if stats:
        stats["total"] = total
    return stats


def _stats_heading_blocks(s, label=r"[^<]+"):
    """(label, spread) for every "<h2>Stats - <label></h2>" table on the page
    that carries a full spread. Each heading swallows the 1200 characters after
    it, so the label pattern decides which headings can hide the next one - a
    caller keeps the pattern it was written with."""
    for m in re.finditer(r"<h2>Stats - (%s)</h2>(.{0,1200})" % label, s, re.S):
        mb = re.search(r"Base Stats - Total: (\d+)(.{0,900})", m.group(2), re.S)
        st = _six_stats(mb.group(2)) if mb else None
        if st:
            st["total"] = int(mb.group(1))
            yield m.group(1), st


def _gender_forms(s, slug, base):
    """Gender forms get no header block of their own - Basculegion's female
    form exists only as an "<h2>Stats - Female</h2>" table further down the
    page, and it is a real form with its own spread (120/92/65/100/75/78 vs
    the male's physical split). Type and abilities carry over from the base
    form."""
    return [{"slug": slug, "name": "%s-%s" % (base["name"], label),
             "species": base["name"], "form": label,
             "dex": base["dex"], "types": list(base["types"]),
             "abilities": list(base["abilities"]), "base_stats": st,
             "is_mega": False}
            for label, st in _stats_heading_blocks(s, "Female|Male")]


def _in_battle_forms(s):
    """In-battle and size forms live in the same kind of block ("<h2>Stats -
    Blade Forme</h2>", "Stats - Hero Form", "Stats - Jumbo Variety") but they
    are NOT separate rows. Every usage source calls them by the base name -
    pokebase writes "Aegislash (Blade)" for the thing a teamlist just calls
    "Aegislash" - so query.norm() collapses them on purpose, and adding rows
    would make every join ambiguous. They go on the base row instead, because
    the damage calculator still needs the real numbers: Stance Change flips
    Aegislash to Blade the moment it attacks, so its Attack is 140, not 50."""
    bf = {}
    for heading, st in _stats_heading_blocks(s):
        label = heading.strip()
        if re.match(r"(Female|Male)$", label):
            continue
        # "Blade Forme" -> "Blade", "Jumbo Variety" -> "Jumbo"
        short = re.sub(r"\s+(Forme?|Form|Variety|Mode|Size)$", "", label).strip()
        bf[short] = st
    return bf


def parse_pokemon(path, mega_names=None):
    s = read(path)
    slug = os.path.basename(path)[:-5]
    megas_here = iter((mega_names or {}).get(slug, []))
    out = []

    heads = [m.start() for m in re.finditer(r'<td[^>]*class="fooevo"[^>]*>\s*Picture', s)]
    stat_blocks = [(m.start(), int(m.group(1)), m.group(2))
                   for m in re.finditer(r"Base Stats - Total: (\d+)(.{0,900})", s, re.S)]

    for idx, hstart in enumerate(heads):
        hend = heads[idx + 1] if idx + 1 < len(heads) else len(s)
        blk = s[hstart:hend]
        name = _block_name(blk, slug)
        # a page calls both Mega blocks "Mega Charizard"; take the real name
        # (with its X/Y suffix) from the master list, in block order
        if name.lower().startswith("mega "):
            name = next(megas_here, name)
        mdex = re.search(r"National</b>\s*:\s*</td>\s*<td>#(\d+)", blk)
        out.append({"slug": slug, "name": name,
                    "dex": int(mdex.group(1)) if mdex else None,
                    "types": _block_types(blk),
                    "abilities": _block_abilities(blk),
                    "base_stats": _block_stats(stat_blocks, hstart, hend),
                    "is_mega": name.lower().startswith("mega ")})

    if out:
        base = out[0]
        out += _gender_forms(s, slug, base)
        bf = _in_battle_forms(s)
        if bf:
            base["battle_forms"] = bf
    return out


def forms_from_attackdex():
    """Base and regional forms, read from the "Pokemon That Learn X" tables.

    The Pokedex page groups regional forms into one block (Samurott and
    Samurott-Hisui come out with their types merged), while these tables give
    one clean row per form: dex number, types, abilities and stats.
    """
    row = re.compile(
        r'class="fooinfo">#(\d{1,4})</td>.*?'
        r'<img src="(/pokedex-sv/icon/[^"]+)".*?'
        r'<a href="/pokedex-champions/[^"]+">([^<]+)</a>.*?'
        r"(/pokedex-bw/type/\w+\.gif.*?)"
        r'class="fooinfo">((?:\s*<a href="/abilitydex/[^"]*"[^>]*>[^<]+</a>\s*(?:<br\s*/?>)?)+)</td>'
        r"((?:\s*<td[^>]*>\s*\d{1,3}\s*</td>){6})", re.S)
    found = {}
    adir = os.path.join(RAW, "attackdex")
    for fn in sorted(os.listdir(adir)):
        s = read(os.path.join(adir, fn))
        i = s.find("That Learn")
        if i < 0:
            continue
        for m in row.finditer(s[i:]):
            species = html.unescape(m.group(3)).strip()
            form = sprite_form(m.group(2), species)
            key = species + ("-" + form if form else "")
            if key in found:
                continue
            types = [t.capitalize() for t in
                     re.findall(r"/pokedex-bw/type/(\w+)\.gif", m.group(4))]
            abils = [re.sub(r"\s+", " ", html.unescape(a)).strip() for a in
                     re.findall(r'/abilitydex/[^"]*"[^>]*>([^<]+)</a>', m.group(5))]
            nums = [int(n) for n in re.findall(r">\s*(\d{1,3})\s*<", m.group(6))][:6]
            if len(nums) != 6:
                continue
            stats = dict(zip(STAT_KEYS, nums, strict=True))
            stats["total"] = sum(nums)
            # Indeedee's female row carries "#0" instead of "#0876". The
            # sprite filename always has the real number, so read it from
            # there rather than trusting the cell.
            dex = int(m.group(1))
            if not dex:
                mdx = re.match(r"(\d+)", m.group(2).split("/")[-1])
                dex = int(mdx.group(1)) if mdx else None
            found[key] = {
                "slug": None, "name": key, "species": species, "form": form,
                "dex": dex, "types": types, "abilities": abils,
                "base_stats": stats, "is_mega": False,
            }
    return found


# --------------------------------------------------------------------------
# ITEMS / ABILITIES
# --------------------------------------------------------------------------
def parse_items():
    """Every item, in the four groups the game itself uses.

    Serebii lays the page out as one table per group, each announced by a
    <b> heading right before it - Hold Items, Mega Stone, Berries,
    Miscellaneous Items. Reading the tables without those headings threw the
    grouping away, which is why the app could only ever show one flat list.
    """
    s = read(os.path.join(RAW, "pages", "items.html"))
    heads = {"hold items": "Hold Items", "mega stone": "Mega Stones",
             "berries": "Berries", "miscellaneous items": "Miscellaneous"}
    items, seen = [], set()
    group = None
    # walk headings and rows in document order, so each row keeps the last
    # heading seen above it
    for tok in re.finditer(r"<b>(.*?)</b>|<tr[^>]*>(.*?)</tr>", s, re.S):
        if tok.group(1) is not None:
            head = txt(tok.group(1)).strip().lower()
            if head in heads:
                group = heads[head]
            continue
        r = tok
        cells = re.findall(r'<td[^>]*class="fooinfo"[^>]*>(.*?)</td>', r.group(2), re.S)
        if len(cells) < 3:
            continue
        name, effect, loc = txt(cells[0]), txt(cells[1]), txt(cells[2])
        if not name or len(name) > 40 or len(effect) < 20 or name in seen:
            continue
        seen.add(name)
        price = None
        mp = re.search(r"(\d[\d,]*)\s*VP", loc)
        if mp:
            price = int(mp.group(1).replace(",", ""))
            # keep the price in its own field, not repeated inside the source
            loc = re.sub(r"\s*\d[\d,]*\s*VP\s*", " ", loc).strip()
        items.append({
            "name": name, "effect": effect, "source": loc, "price_vp": price,
            "is_mega_stone": "Mega Evolve" in effect,
            "category": group or "Miscellaneous",
        })
    return items


def parse_champions_abilities(pokemon_rows):
    """Ability text as Champions defines it, taken from the Pokemon pages."""
    descs = {}
    holders = defaultdict(list)
    # on a Pokemon page each ability reads <a><b>Name</b></a>: description,
    # with <br /> between consecutive ones
    pat = re.compile(
        r'<a href="' + ABIL_LINK + r'\s*</a>\s*:\s*'
        r'(.*?)(?=<br\s*/?>\s*<a href="/abilitydex/|</td>)', re.S)
    for fn in sorted(os.listdir(os.path.join(RAW, "pokedex"))):
        s = read(os.path.join(RAW, "pokedex", fn))
        for m in pat.finditer(s):
            nm = re.sub(r"\s+", " ", html.unescape(m.group(1))).strip()
            d = txt(m.group(2))
            # A page that splits its abilities into blocks ("Female Abilities:",
            # "Hisuian Form Abilities:") puts that header inside the same <td>,
            # so it lands at the tail of the preceding ability's text.
            d = re.sub(r"\s*(?:[A-Z][A-Za-z]*\s+)*Abilities\s*:?\s*$", "", d).strip()
            if d and len(d) > 15 and nm not in descs:
                descs[nm] = d
    for p in pokemon_rows:
        for a in p["abilities"]:
            holders[a].append(p["name"])
    return [{"name": k, "effect": descs.get(k, ""), "pokemon": sorted(set(v)),
             "count": len(set(v))} for k, v in sorted(holders.items())]


# --------------------------------------------------------------------------
def abilities_by_form(path):
    """The Pokedex page's Abilities cell, split by the form each group names.

    A PAGE WITH SEVERAL FORMS WRITES ONE CELL FOR ALL OF THEM:

        Keen Eye - Sand Rush - Steadfast (Midday Form) -
        Keen Eye - Vital Spirit - No Guard (Midnight Form) -
        Tough Claws (Dusk Form)

    EVERY parenthesis ends a group, including the one that just repeats the
    species - Arcanine's cell reads "... (Arcanine) - ... (Hisuian Form)".
    Reading only the ones that say "Form" was tried and was worse than doing
    nothing: the first group has no terminator, so its abilities spill into the
    next label and Ninetales-Alola came out with Flash Fire and Drought, which
    are the BASE form's. Caught by running it.

    Form rows come from the ATTACKDEX, not from here, because that is the only
    place each form gets a row of its own. Usually the two agree. Lycanroc is
    where they do not: the attackdex row for Midnight lists Keen Eye and Vital
    Spirit and stops, so **No Guard was missing from the database entirely** -
    found in game by the player (2026-09-19: "smogon y el juego si dicen que
    tiene no guard"), then confirmed here, in Serebii's own markup, which links
    /abilitydex/noguard.shtml on that page.

    16 pages group their abilities this way and only that one form was short,
    so this ONLY EVER ADDS - it never replaces the attackdex's list, which is
    right everywhere else. Returns {form label: [abilities]}.
    """
    try:
        s = Path(path).read_text(encoding="cp1252", errors="replace")
    except OSError:
        return {}
    m = re.search(r"<b>Abilities</b>\s*:(.*?)</td>", s, re.S)
    if not m:
        return {}
    # the links in order, and the "(... Form)" markers between them
    cell = m.group(1)
    out, cur = {}, []
    for tok in re.finditer(ABIL_LINK + r'|\(([^)]{1,30})\)', cell):
        if tok.group(1):
            cur.append(re.sub(r"\s+", " ", html.unescape(tok.group(1))).strip())
        elif cur:
            out[tok.group(2).strip()] = cur
            cur = []
    return out


def _add_abilities(p, abs_, added, note=None):
    have = p.get("abilities") or []
    new = [a for a in abs_ if a not in have]
    if new:
        p["abilities"] = have + new
        added.append((p["name"], new, note))
    if note:                       # true whether or not it was already there
        for a in abs_:
            p.setdefault("ability_notes", {})[a] = note


def complete_form_abilities(forms):
    """Add anything the Pokedex page lists for a form that its row is missing.

    Matched with query.norm(), the project's own name matcher, so "(Midnight
    Form)" on the Lycanroc page finds "Lycanroc-Midnight" and "(Hisuian Form)"
    on the Arcanine page finds "Arcanine-Hisui" without a table of suffixes.

    NOT EVERY LABEL IS A FORM. Greninja's cell reads

        Torrent - Protean (Standard) - Battle Bond (Alternate Greninja Only)

    and "Alternate Greninja Only" names no row, so matching labels alone put
    Battle Bond nowhere. A label like that is a QUALIFIER on the abilities in
    front of it. On a species with ONE row there is only one Pokemon they can
    belong to, so they go on it, and the label is kept beside them in
    `ability_notes` - Serebii's words, not ours, and not a rule the player has
    confirmed. On a species with several rows the label is ambiguous and is
    left alone: Meowstic's "(Female Hidden Ability)" is already settled by the
    attackdex's own female row. FIXED_FORMS species are skipped outright:
    Squawkabilly still has one row at this point only because its plumages
    are added further down, with their abilities declared, and giving the
    Green row "(Yellow & White)"'s Sheer Force is the exact mistake that table
    exists to prevent. audit_abilities.py checks that nothing a page names is
    left on no row at all.
    """
    import query as _Q
    by_norm, by_species = {}, defaultdict(list)
    for name, p in forms.items():
        by_norm.setdefault(_Q.norm(name), []).append(p)
        by_species[_Q.norm(p.get("species") or name)].append(p)
    added = []
    for fn in sorted(os.listdir(os.path.join(RAW, "pokedex"))):
        species = os.path.splitext(fn)[0]
        rows = by_species.get(_Q.norm(species), [])
        for label, abs_ in abilities_by_form(
                os.path.join(RAW, "pokedex", fn)).items():
            hits = by_norm.get(_Q.norm(species + " " + label), [])
            for p in hits:
                _add_abilities(p, abs_, added)
            if (not hits and len(rows) == 1
                    and rows[0].get("species") not in FIXED_FORMS):
                _add_abilities(rows[0], abs_, added, label)
    for name, new, note in added:
        print("  +ability  %-22s %s  (from its Pokedex page%s)"
              % (name, ", ".join(new), ": " + note if note else ""))
    return len(added)


def _mega_species(p):
    """"Mega Charizard X" -> species "Charizard", form "Mega X", so the
    Mega still links back to the base form it evolves from.
    Regulation M-C added a third suffix: Z marks a SECOND Mega on a
    species that already had one (Garchomp, Absol, Lucario), the same
    pattern as Charizard X/Y and needing its own stone. Miss it and
    the Z Mega parses as its own species, so mega_line() stops
    offering it on the base Pokemon."""
    base = p["name"].replace("Mega ", "", 1).strip()
    mx = re.match(r"^(.*?)\s+([XYZ])$", base)
    p["species"] = mx.group(1) if mx else base
    p["form"] = "Mega %s" % mx.group(2) if mx else "Mega"


def _merge_dex_row(forms, p):
    """One Pokedex-page row into the attackdex's forms."""
    if p["is_mega"]:
        _mega_species(p)
        forms[p["name"]] = p
    elif p["name"] not in forms:
        # A Pokedex block that repeats a form the attackdex already gave
        # us under its full name is not a second Pokemon. Floette is the
        # case: only the Eternal Flower form is in Champions, so its page
        # block is headed plainly "Floette" and used to land as a species
        # of its own - same types, same abilities, same 551 spread as
        # Floette-Eternal, and no movepool, because no learner table ever
        # says "Floette". Matched on the spread, which needs no name
        # vocabulary.
        twin = next((f for f in forms.values()
                     if f["dex"] == p["dex"] and not f["is_mega"]
                     and f.get("base_stats") == p["base_stats"]), None)
        if twin:
            return
        p.setdefault("species", p["name"])
        p.setdefault("form", None)
        forms[p["name"]] = p
    elif p.get("battle_forms"):
        # The attackdex row wins on types and abilities, but only the
        # Pokedex page carries the in-battle stat blocks - carry them over
        # rather than dropping the row wholesale.
        forms[p["name"]]["battle_forms"] = p["battle_forms"]


def _drop_regional_battle_forms(forms):
    """The Pokedex repeats the regional forms in the same "<h2>Stats - X</h2>"
    block shape as the in-battle ones ("Stats - Alolan Raichu", "Stats -
    Hisuian Arcanine"), and those already arrived from the attackdex with
    their own types and abilities. Keep only the blocks that are nobody's
    row - matched on the spread itself, which is exact and needs no name
    vocabulary. What survives is the real in-battle set: Aegislash-Blade,
    Palafin-Hero and the three Gourgeist sizes."""
    known = {tuple(sorted(p["base_stats"].items()))
             for p in forms.values() if p.get("base_stats")}
    for p in forms.values():
        if not p.get("battle_forms"):
            continue
        bf = {k: v for k, v in p["battle_forms"].items()
              if tuple(sorted(v.items())) not in known}
        if bf:
            p["battle_forms"] = bf
        else:
            del p["battle_forms"]


def _add_fixed_forms(forms):
    """Forms fixed at capture are their own Pokemon, so they get their own row.
    Gourgeist's sizes arrived above as `battle_forms` because the page writes
    them in the same block shape as Aegislash's stance - they are not a
    stance, the size is decided when you meet it and never changes."""
    for species, variants in FIXED_FORMS.items():
        base = forms.get(species)
        if not base:
            continue
        sizes = base.pop("battle_forms", {}) or {}
        for label, spec in variants.items():
            name = "%s-%s" % (species, label)
            if name in forms:
                continue
            st = sizes.get(spec.get("stats_from")) or base["base_stats"]
            forms[name] = {
                "slug": base.get("slug"), "name": name, "species": species,
                "form": label, "dex": base["dex"],
                "types": list(base["types"]),
                "abilities": list(spec.get("abilities") or base["abilities"]),
                "base_stats": dict(st), "is_mega": False,
            }


def _add_typed_battle_forms(forms):
    """Typing a Pokemon only has mid-battle. Stored beside the spread-changing
    stances rather than as rows, because it is one creature: pokebase's
    "Castform-Sunny" and a teamlist's "Castform" are the same registration."""
    for species, variants in TYPED_BATTLE_FORMS.items():
        base = forms.get(species)
        if not base:
            continue
        bf = base.get("battle_forms") or {}
        for label, types in variants.items():
            bf.setdefault(label, dict(base["base_stats"]))
            bf[label] = dict(bf[label], types=list(types))
        base["battle_forms"] = bf


def _write(name, rows):
    Path(DB, name).write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")


def build_pokemon():
    # base and regional forms from the attackdex (one row per form)
    forms = forms_from_attackdex()
    complete_form_abilities(forms)
    # Megas only exist on the Pokedex page
    mega_names = master_mega_names()
    for fn in sorted(os.listdir(os.path.join(RAW, "pokedex"))):
        for p in parse_pokemon(os.path.join(RAW, "pokedex", fn), mega_names):
            if p["base_stats"]:
                _merge_dex_row(forms, p)
    _drop_regional_battle_forms(forms)
    _add_fixed_forms(forms)
    _add_typed_battle_forms(forms)
    return sorted(forms.values(), key=lambda x: (x["dex"] or 0, x["name"]))


def build_moves():
    adir = os.path.join(RAW, "attackdex")
    useable = useable_moves()
    moves = []
    files = sorted(os.listdir(adir))
    for i, fn in enumerate(files):
        moves.append(parse_move(os.path.join(adir, fn), useable))
        if (i + 1) % 250 == 0:
            print("  %d/%d" % (i + 1, len(files)), flush=True)
    for line in apply_move_rulings(moves):
        print("  " + line)
    return moves


def build_learnsets(moves, pokemon):
    """(form -> sorted move names, how many forms inherited the base's)."""
    learn = defaultdict(list)
    for mv in moves:
        for learner in mv["learners"]:
            learn[learner].append(mv["name"])
    learn = {k: sorted(v) for k, v in sorted(learn.items())}
    # A form with no learner table of its own inherits the base form's, which
    # is what the game does: Serebii lists no move for Basculegion-Female or
    # for Squawkabilly's plumages, because they share the species' movepool.
    # Without this they came out of the database with zero moves, which reads
    # as "cannot attack" rather than "Serebii files it under the base name".
    inherited = 0
    for p in pokemon:
        if p["is_mega"] or p["name"] in learn:
            continue
        src = learn.get(p.get("species") or "")
        if src:
            learn[p["name"]] = list(src)
            inherited += 1
    return dict(sorted(learn.items())), inherited


def main():
    os.makedirs(DB, exist_ok=True)

    print("Pokemon...", flush=True)
    pokemon = build_pokemon()
    _write("pokemon.json", pokemon)
    print("  %d forms (%d mega)" % (len(pokemon), sum(1 for p in pokemon if p["is_mega"])))

    print("Moves...", flush=True)
    moves = build_moves()
    _write("moves.json", moves)
    print("  %d moves (%d useable in Champions)"
          % (len(moves), sum(1 for m in moves if m.get("useable"))))

    print("Learnsets...", flush=True)
    learn, inherited = build_learnsets(moves, pokemon)
    _write("learnsets.json", learn)
    print("  %d Pokemon with a movepool (%d inherited from the base form)"
          % (len(learn), inherited))

    print("Items...", flush=True)
    items = parse_items()
    _write("items.json", items)
    print("  %d items" % len(items))

    print("Abilities...", flush=True)
    ab = parse_champions_abilities(pokemon)
    _write("abilities.json", ab)
    print("  %d abilities" % len(ab))


if __name__ == "__main__":
    main()
