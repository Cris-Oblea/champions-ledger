"""Turn the cached Serebii HTML into the Pokemon Champions JSON database.

Writes to data/db/:
    pokemon.json    playable forms: types, base stats, abilities, Megas
    moves.json      Champions moves: power/PP/effect + flags + who learns them
    abilities.json  abilities with their Champions text and their carriers
    items.json      purchasable items and their VP price
    learnsets.json  reverse index: Pokemon -> moves

Everything comes from the Champions sections of Serebii. No other Pokemon game.
"""
import os, re, json, html
from collections import defaultdict

from serebii_text import read, unmojibake

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
DB = os.path.join(ROOT, "data", "db")

# Sprite suffix -> form. The meaning is species-dependent: "-m" is Mow on
# Rotom but Midnight on Lycanroc, so the per-species map wins.
FORM_SUFFIX = {"a": "Alola", "g": "Galar", "h": "Hisui", "p": "Paldea"}

FORM_BY_SPECIES = {
    ("Rotom", "h"): "Heat", ("Rotom", "w"): "Wash", ("Rotom", "f"): "Frost",
    ("Rotom", "s"): "Fan", ("Rotom", "m"): "Mow",
    ("Lycanroc", "m"): "Midnight", ("Lycanroc", "d"): "Dusk",
    ("Meowstic", "f"): "Female",
    ("Floette", "e"): "Eternal",
    ("Tauros", "p"): "Paldea Combat", ("Tauros", "b"): "Paldea Blaze",
    ("Tauros", "a"): "Paldea Aqua",
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


def parse_move(path, useable=None):
    s = read(path)
    slug = os.path.basename(path)[:-5]

    name = None
    m = re.search(r"<title>(.*?)</title>", s, re.S | re.I)
    if m:
        name = html.unescape(m.group(1)).split(" - ")[0].strip()
    if not name:
        name = slug

    mtype = None
    mt = re.search(r'/attackdex-champions/\w+\.shtml"><img src="/pokedex-bw/type/(\w+)\.gif', s)
    if mt:
        mtype = mt.group(1).capitalize()
    cat = None
    mc = re.search(r"/pokedex-bw/type/(physical|special|other)\.png", s)
    if mc:
        cat = {"physical": "Physical", "special": "Special", "other": "Status"}[mc.group(1)]

    pp = power = acc = None
    mb = re.search(
        r"Power Points.*?Base Power.*?Accuracy.*?</tr>\s*<tr>\s*"
        r'<td class="cen">\s*([^<]*?)</td>\s*<td class="cen">\s*([^<]*?)</td>\s*'
        r'<td class="cen">\s*([^<]*?)</td>', s, re.S)
    if mb:
        def num(v):
            v = v.strip().replace("--", "")
            return int(v) if v.isdigit() else None
        pp, power, acc = num(mb.group(1)), num(mb.group(2)), num(mb.group(3))

    def section(label):
        mm = re.search(re.escape(label) + r".*?</tr>\s*<tr>(.*?)</tr>", s, re.S)
        return txt(mm.group(1)) if mm else ""

    effect = section("Battle Effect:")
    indepth = section("In-Depth Effect:")

    mrate = re.search(r'Effect Rate:.*?</tr>.*?<td class="cen">\s*([\d.]+)\s*%', s, re.S)
    effect_rate = float(mrate.group(1)) if mrate else None

    crit = prio = target = None
    mx = re.search(
        r"Base Critical Hit Rate.*?Speed Priority.*?Hit in Battle.*?</tr>\s*<tr>\s*"
        r'<td class="cen">\s*([^<]*?)</td>\s*<td class="cen">\s*([^<]*?)</td>\s*'
        r'<td class="cen">\s*([^<]*?)</td>', s, re.S)
    if mx:
        # txt() rather than .strip(): these cells carry HTML entities, and
        # "All Adjacent Pok&eacute;mon" must come out as a readable target.
        crit = txt(mx.group(1))
        try:
            prio = int(mx.group(2).strip())
        except ValueError:
            prio = None
        target = txt(mx.group(3))

    # The property table alternates header rows and value rows. Start at the
    # <tr> that OPENS the "Physical Contact" row: starting at the text itself
    # loses the first header and shifts every flag by one row.
    flags = {}
    fi = s.find("Physical Contact")
    if fi > 0:
        start = s.rfind("<tr", 0, fi)
        end = s.find("</table>", fi)
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", s[start:end], re.S)
        headers, values = [], []
        for r in rows:
            cells_h = re.findall(r'<td class="fooevo"[^>]*>(.*?)</td>', r, re.S)
            cells_v = re.findall(r'<td class="cen"[^>]*>(.*?)</td>', r, re.S)
            if cells_h:
                headers.append([txt(c) for c in cells_h])
            elif cells_v:
                values.append([txt(c) for c in cells_v])
        for hrow, vrow in zip(headers, values):
            for h, v in zip(hrow, vrow):
                for label, key in FLAG_LABELS:
                    if h.startswith(label):
                        flags[key] = (v.strip().lower() == "yes")
                        break

    learners = []
    li = s.find("That Learn")
    if li > 0:
        tail = s[li:]
        for r in re.finditer(
                r'class="fooinfo">#(\d{4})</td>.*?'
                r'<img src="(/pokedex-sv/icon/[^"]+)".*?'
                r'<a href="/pokedex-champions/[^"]+">([^<]+)</a>', tail, re.S):
            nm = html.unescape(r.group(3)).strip()
            form = sprite_form(r.group(2), nm)
            learners.append(nm + ("-" + form if form else ""))
    seen, uniq = set(), []
    for l in learners:
        if l not in seen:
            seen.add(l)
            uniq.append(l)

    return {
        "slug": slug, "name": name, "type": mtype, "category": cat,
        "power": power, "accuracy": acc, "pp": pp,
        "effect": effect, "in_depth": indepth, "effect_rate": effect_rate,
        "crit_rate": crit, "priority": prio, "target": target,
        "hits": hit_count(effect), "always_crit": always_crit(effect, indepth),
        "flags": flags, "learners": uniq, "learner_count": len(uniq),
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


def parse_pokemon(path, mega_names=None):
    s = read(path)
    slug = os.path.basename(path)[:-5]
    megas_here = list((mega_names or {}).get(slug, []))
    mega_seen = 0
    out = []

    heads = [m.start() for m in re.finditer(r'<td[^>]*class="fooevo"[^>]*>\s*Picture', s)]
    stat_blocks = [(m.start(), int(m.group(1)), m.group(2))
                   for m in re.finditer(r"Base Stats - Total: (\d+)(.{0,900})", s, re.S)]

    for idx, hstart in enumerate(heads):
        hend = heads[idx + 1] if idx + 1 < len(heads) else len(s)
        blk = s[hstart:hend]

        # the name is the first data cell after the "Name" header
        name = None
        mn = re.search(r'>\s*Name\s*</td>.*?</tr>\s*<tr>\s*'
                       r'<td[^>]*class="fooinfo"[^>]*>\s*([^<]+?)\s*</td>', blk, re.S)
        if mn:
            name = re.sub(r"\s+", " ", html.unescape(mn.group(1))).strip()
        if not name:
            name = slug.capitalize()

        # a page calls both Mega blocks "Mega Charizard"; take the real name
        # (with its X/Y suffix) from the master list, in block order
        if name.lower().startswith("mega ") and mega_seen < len(megas_here):
            name = megas_here[mega_seen]
            mega_seen += 1

        mdex = re.search(r"National</b>\s*:\s*</td>\s*<td>#(\d+)", blk)
        dex = int(mdex.group(1)) if mdex else None

        raw_types = re.findall(
            r'/pokedex-champions/\w+\.shtml"><img src="/pokedex-bw/type/(\w+)\.gif', blk)
        if not raw_types:
            raw_types = re.findall(r"/pokedex-bw/type/(\w+)\.gif", blk)[:2]
        types = []
        for t in raw_types:                      # a block can repeat its own type
            t = t.capitalize()
            if t not in types:
                types.append(t)

        abils = []
        ab = re.search(r"<b>Abilities</b>\s*:(.*?)</td>", blk, re.S)
        if ab:
            for a in re.finditer(r'/abilitydex/[a-z0-9]+\.shtml"[^>]*>\s*<b>([^<]+)</b>', ab.group(1)):
                abils.append(re.sub(r"\s+", " ", html.unescape(a.group(1))).strip())
        seen, ab2 = set(), []
        for a in abils:
            if a not in seen and len(a) > 1 and a.lower() != "details":
                seen.add(a)
                ab2.append(a)

        stats = None
        for pos, total, tailblk in stat_blocks:
            if hstart <= pos < hend:
                nums = re.findall(r'<td[^>]*>\s*(\d{1,3})\s*</td>', tailblk)[:6]
                if len(nums) == 6:
                    stats = dict(zip(["hp", "atk", "def", "spa", "spd", "spe"], map(int, nums)))
                    stats["total"] = total
                break

        out.append({"slug": slug, "name": name, "dex": dex, "types": types,
                    "abilities": ab2, "base_stats": stats,
                    "is_mega": name.lower().startswith("mega ")})

    # Gender forms get no header block of their own - Basculegion's female form
    # exists only as an "<h2>Stats - Female</h2>" table further down the page,
    # and it is a real form with its own spread (120/92/65/100/75/78 vs the
    # male's physical split). Type and abilities carry over from the base form.
    if out:
        base = out[0]
        for m in re.finditer(r"<h2>Stats - (Female|Male)</h2>(.{0,1200})", s, re.S):
            mb = re.search(r"Base Stats - Total: (\d+)(.{0,900})", m.group(2), re.S)
            if not mb:
                continue
            nums = re.findall(r'<td[^>]*>\s*(\d{1,3})\s*</td>', mb.group(2))[:6]
            if len(nums) != 6:
                continue
            st = dict(zip(["hp", "atk", "def", "spa", "spd", "spe"], map(int, nums)))
            st["total"] = int(mb.group(1))
            out.append({"slug": slug, "name": "%s-%s" % (base["name"], m.group(1)),
                        "dex": base["dex"], "types": list(base["types"]),
                        "abilities": list(base["abilities"]), "base_stats": st,
                        "is_mega": False})

    # In-battle and size forms live in the same kind of block ("<h2>Stats -
    # Blade Forme</h2>", "Stats - Hero Form", "Stats - Jumbo Variety") but they
    # are NOT separate rows. Every usage source calls them by the base name -
    # pokebase writes "Aegislash (Blade)" for the thing a teamlist just calls
    # "Aegislash" - so query.norm() collapses them on purpose, and adding rows
    # would make every join ambiguous. They go on the base row instead, because
    # the damage calculator still needs the real numbers: Stance Change flips
    # Aegislash to Blade the moment it attacks, so its Attack is 140, not 50.
    if out:
        base = out[0]
        bf = {}
        for m in re.finditer(r"<h2>Stats - ([^<]+)</h2>(.{0,1200})", s, re.S):
            label = m.group(1).strip()
            if re.match(r"(Female|Male)$", label):
                continue
            mb = re.search(r"Base Stats - Total: (\d+)(.{0,900})", m.group(2), re.S)
            if not mb:
                continue
            nums = re.findall(r'<td[^>]*>\s*(\d{1,3})\s*</td>', mb.group(2))[:6]
            if len(nums) != 6:
                continue
            st = dict(zip(["hp", "atk", "def", "spa", "spd", "spe"], map(int, nums)))
            st["total"] = int(mb.group(1))
            # "Blade Forme" -> "Blade", "Jumbo Variety" -> "Jumbo"
            short = re.sub(r"\s+(Forme?|Form|Variety|Mode|Size)$", "", label).strip()
            bf[short] = st
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
        r'class="fooinfo">#(\d{4})</td>.*?'
        r'<img src="(/pokedex-sv/icon/[^"]+)".*?'
        r'<a href="/pokedex-champions/[^"]+">([^<]+)</a>.*?'
        r"(/pokedex-bw/type/\w+\.gif.*?)"
        r'class="fooinfo">((?:\s*<a href="/abilitydex/[^"]+"[^>]*>[^<]+</a>\s*(?:<br\s*/?>)?)+)</td>'
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
                     re.findall(r'/abilitydex/[^"]+"[^>]*>([^<]+)</a>', m.group(5))]
            nums = [int(n) for n in re.findall(r">\s*(\d{1,3})\s*<", m.group(6))][:6]
            if len(nums) != 6:
                continue
            stats = dict(zip(["hp", "atk", "def", "spa", "spd", "spe"], nums))
            stats["total"] = sum(nums)
            found[key] = {
                "slug": None, "name": key, "species": species, "form": form,
                "dex": int(m.group(1)), "types": types, "abilities": abils,
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
    HEADS = {"hold items": "Hold Items", "mega stone": "Mega Stones",
             "berries": "Berries", "miscellaneous items": "Miscellaneous"}
    items, seen = [], set()
    group = None
    # walk headings and rows in document order, so each row keeps the last
    # heading seen above it
    for tok in re.finditer(r"<b>(.*?)</b>|<tr[^>]*>(.*?)</tr>", s, re.S):
        if tok.group(1) is not None:
            head = txt(tok.group(1)).strip().lower()
            if head in HEADS:
                group = HEADS[head]
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
        r'<a href="/abilitydex/[a-z0-9]+\.shtml"[^>]*>\s*<b>([^<]+)</b>\s*</a>\s*:\s*'
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
def main():
    os.makedirs(DB, exist_ok=True)

    print("Pokemon...", flush=True)
    # base and regional forms from the attackdex (one row per form)
    forms = forms_from_attackdex()
    # Megas only exist on the Pokedex page
    mega_names = master_mega_names()
    dex_rows = []
    for fn in sorted(os.listdir(os.path.join(RAW, "pokedex"))):
        dex_rows.extend(parse_pokemon(os.path.join(RAW, "pokedex", fn), mega_names))
    for p in dex_rows:
        if not p["base_stats"]:
            continue
        if p["is_mega"]:
            # "Mega Charizard X" -> species "Charizard", form "Mega X", so the
            # Mega still links back to the base form it evolves from.
            # Regulation M-C added a third suffix: Z marks a SECOND Mega on a
            # species that already had one (Garchomp, Absol, Lucario), the same
            # pattern as Charizard X/Y and needing its own stone. Miss it and
            # the Z Mega parses as its own species, so mega_line() stops
            # offering it on the base Pokemon.
            base = p["name"].replace("Mega ", "", 1).strip()
            mx = re.match(r"^(.*?)\s+([XYZ])$", base)
            p["species"] = mx.group(1) if mx else base
            p["form"] = "Mega %s" % mx.group(2) if mx else "Mega"
            forms[p["name"]] = p
        elif p["name"] not in forms:
            p["species"], p["form"] = p["name"], None
            forms[p["name"]] = p
        elif p.get("battle_forms"):
            # The attackdex row wins on types and abilities, but only the
            # Pokedex page carries the in-battle stat blocks - carry them over
            # rather than dropping the row wholesale.
            forms[p["name"]]["battle_forms"] = p["battle_forms"]
    # The Pokedex repeats the regional forms in the same "<h2>Stats - X</h2>"
    # block shape as the in-battle ones ("Stats - Alolan Raichu", "Stats -
    # Hisuian Arcanine"), and those already arrived from the attackdex with
    # their own types and abilities. Keep only the blocks that are nobody's
    # row - matched on the spread itself, which is exact and needs no name
    # vocabulary. What survives is the real in-battle set: Aegislash-Blade,
    # Palafin-Hero and the three Gourgeist sizes.
    known = {tuple(sorted(p["base_stats"].items()))
             for p in forms.values() if p.get("base_stats")}
    for p in forms.values():
        bf = p.get("battle_forms")
        if not bf:
            continue
        bf = {k: v for k, v in bf.items()
              if tuple(sorted(v.items())) not in known}
        if bf:
            p["battle_forms"] = bf
        else:
            del p["battle_forms"]

    pokemon = sorted(forms.values(), key=lambda x: (x["dex"] or 0, x["name"]))
    json.dump(pokemon, open(os.path.join(DB, "pokemon.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("  %d forms (%d mega)" % (len(pokemon), sum(1 for p in pokemon if p["is_mega"])))

    print("Moves...", flush=True)
    adir = os.path.join(RAW, "attackdex")
    useable = useable_moves()
    moves = []
    files = sorted(os.listdir(adir))
    for i, fn in enumerate(files):
        moves.append(parse_move(os.path.join(adir, fn), useable))
        if (i + 1) % 250 == 0:
            print("  %d/%d" % (i + 1, len(files)), flush=True)
    json.dump(moves, open(os.path.join(DB, "moves.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("  %d moves (%d useable in Champions)"
          % (len(moves), sum(1 for m in moves if m.get("useable"))))

    print("Learnsets...", flush=True)
    learn = defaultdict(list)
    for mv in moves:
        for l in mv["learners"]:
            learn[l].append(mv["name"])
    learn = {k: sorted(v) for k, v in sorted(learn.items())}
    json.dump(learn, open(os.path.join(DB, "learnsets.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("  %d Pokemon with a movepool" % len(learn))

    print("Items...", flush=True)
    items = parse_items()
    json.dump(items, open(os.path.join(DB, "items.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("  %d items" % len(items))

    print("Abilities...", flush=True)
    ab = parse_champions_abilities(pokemon)
    json.dump(ab, open(os.path.join(DB, "abilities.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("  %d abilities" % len(ab))


if __name__ == "__main__":
    main()
