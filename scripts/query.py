"""Fast cross-source lookups over the Pokemon Champions database.

Everything here is Champions-only (VGC doubles, bring 6 / pick 4). No data from
the console games is mixed in: move power, PP and flags come from the Champions
Attackdex, which differs from Scarlet/Violet.

Sources joined per query:
    data/db/*        Serebii    rules: what exists and what it does
    data/meta/usage_*    pokebase   what the ladder actually runs
    data/meta/tournament_*  pokedata   what placed at official events
    data/meta/smogon_analyses  Smogon  why a set is built that way
    inventory/inventory.json    what YOU own

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
import os, re, sys, json, argparse
from collections import Counter, defaultdict

# Windows consoles default to cp1252, which cannot encode the Korean and
# Japanese player names in the Worlds standings. Replace them instead of
# dying halfway through a dossier.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "db")
META = os.path.join(ROOT, "data", "meta")
INV = os.path.join(ROOT, "inventory", "inventory.json")


# --------------------------------------------------------------------------
# loading + name normalisation
# --------------------------------------------------------------------------
_cache = {}


def load(path, default=None):
    if path in _cache:
        return _cache[path]
    if not os.path.exists(path):
        _cache[path] = default
        return default
    with open(path, encoding="utf-8") as f:
        _cache[path] = json.load(f)
    return _cache[path]


def db(name):
    return load(os.path.join(DB, name + ".json"), [])


def meta(name, default=None):
    return load(os.path.join(META, name + ".json"), default)


# Worlds runs three age divisions off the same roster and the same regulation,
# so all three are real evidence about the format - but they are three separate
# metagames and must never be pooled silently into one percentage. Masters is
# the division the player competes in, so it stays the default everywhere.
WORLDS_TID = "0000191"
DIVISIONS = ("masters", "seniors", "juniors")


def tournament(division="masters"):
    return meta("tournament_%s_%s" % (WORLDS_TID, division))


def tournaments(divisions=None):
    """[(division, data)] for the divisions actually present on disk."""
    out = []
    for d in (divisions or DIVISIONS):
        t = tournament(d)
        if t:
            out.append((d, t))
    return out


def division_shares(name):
    """[(division, n, total)] - how many teams in each division ran `name`."""
    target = norm(name)
    rows = []
    for d, t in tournaments():
        players = t.get("players", [])
        n = sum(1 for pl in players for slot in pl.get("team", [])
                if norm(slot.get("pokemon")) == target)
        rows.append((d, n, len(players)))
    return rows


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
    "mode", "two", "segmented",
    # cosmetic colour variants (Squawkabilly plumage, Flabebe/Florges flowers,
    # Alcremie creams) - none of these words occurs in a species name
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
# Floette: Pikalytics writes the Mega of the Eternal Flower form as
# "Floette-Eternal-Mega", while Serebii calls it simply "Mega Floette"
# (the Floettite only works on that form, so the two mean the same thing).
# Toxtricity (M-C): Serebii suffixes the Low Key form "-L", every other source
# spells it out. "low"/"key" cannot go in _NOISE - that would collapse Low Key
# into Amped, which is a different form with a different ability.
_ALIASES = {"eternal floette mega": "floette mega",
            "key low toxtricity": "l toxtricity"}


def norm(name):
    """Canonical cross-source key. Keeps Mega and form tokens, drops spelling."""
    if not name:
        return ""
    s = str(name).lower().strip()
    s = s.replace("&#10", " ")
    s = re.sub(r"[\[\]()]", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    tokens = []
    for t in s.split():
        t = _FORM_SYNONYMS.get(t, t)
        if t in _NOISE or t in _BASE_MARKERS:
            continue
        if t not in tokens:
            tokens.append(t)
    k = " ".join(sorted(tokens))
    return _ALIASES.get(k, k)


def key(name):
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


def species_norm(name):
    """Key for the base species, ignoring Mega and regional qualifiers."""
    # "z" belongs here with x and y: Regulation M-C's second-Mega suffix.
    # Without it species_norm("Mega Garchomp Z") stayed "garchomp z", matched
    # no base species, and the three Z Megas came back with no movepool at all
    # - so `query.py pokemon "Mega Garchomp Z"` listed none of its moves.
    forms = {"mega", "alola", "hisui", "galar", "paldea", "x", "y", "z", "wash",
             "heat", "frost", "fan", "mow", "dusk", "midnight", "eternal",
             "female", "aqua", "blaze", "combat"}
    return " ".join(t for t in norm(name).split() if t not in forms)


def mega_norm(name):
    """Kept for callers that want the plain canonical key."""
    return norm(name)


# --------------------------------------------------------------------------
# indexes
# --------------------------------------------------------------------------
def usage_index():
    """name -> usage percent, from the pokebase ladder data."""
    rows = (meta("usage_pokemon") or {}).get("rows", [])
    idx = {}
    for r in rows:
        idx[mega_norm(r["name"])] = r["usage_percent"]
    return idx


def usage_of(name, idx=None):
    idx = idx if idx is not None else usage_index()
    return idx.get(mega_norm(name), idx.get(norm(name)))


def move_usage_index():
    rows = (meta("usage_moves") or {}).get("rows", [])
    return {key(r["name"]): r["usage_percent"] for r in rows}


def pokemon_index():
    return {p["name"]: p for p in db("pokemon")}


def find_pokemon(term):
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


def find_move(term):
    moves = db("moves")
    t = key(term)
    for m in moves:
        if key(m["name"]) == t:
            return m
    for m in moves:
        if t in key(m["name"]):
            return m
    return None


# --------------------------------------------------------------------------
# output helpers
# --------------------------------------------------------------------------
def table(rows, headers):
    if not rows:
        print("  (no results)")
        return
    rows = [[("" if c is None else str(c)) for c in r] for r in rows]
    widths = [max(len(headers[i]), max(len(r[i]) for r in rows))
              for i in range(len(headers))]
    line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(line)
    print("  ".join("-" * w for w in widths))
    for r in rows:
        print("  ".join(c.ljust(widths[i]) for i, c in enumerate(r)))


def pct(v):
    return "" if v is None else ("%.1f%%" % v)


def owned_sets():
    inv = load(INV, {}) or {}
    perm = {norm(x) for x in inv.get("permanent_pokemon", [])}
    temp = {norm(x) for x in (inv.get("rental_pokemon", {}) or {}).get("list", [])}
    stones = set(inv.get("mega_stones", []))
    items = set()
    for v in (inv.get("items") or {}).values():
        if isinstance(v, list):
            items.update(v)
    return perm, temp, stones, items


def own_tag(name, perm, temp):
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


def smogon_gloss(name):
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
        for r in (b.get(bucket) or []):
            if key(r.get("name") or "") == k:
                return r
    return None


def cmd_move(a):
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
    on = [k for k, v in f.items() if v]
    if on:
        print("\nSerebii flags: %s" % ", ".join(on))

    mu = move_usage_index()
    print("\nLadder usage: %s" % pct(mu.get(key(mv["name"]))))
    counts, tot = Counter(), 0
    for d, t in tournaments():
        n = 0
        for pl in t.get("players", []):
            if any(key(x) == key(mv["name"])
                   for sl in pl.get("team", []) for x in (sl.get("moves") or [])):
                n += 1
        counts[d] = (n, len(t.get("players", [])))
        tot += n
    print("Worlds teams running it: %s"
          % ", ".join("%s %d/%d (%.1f%%)" % (d, n, m, 100.0 * n / m if m else 0)
                      for d, (n, m) in counts.items()))

    perm, temp, _, _ = owned_sets()
    mine = [(l, own_tag(l, perm, temp)) for l in mv.get("learners", [])
            if own_tag(l, perm, temp)]
    print("\nLearners: %d in the format." % (mv.get("learner_count") or 0))
    if mine:
        print("In your box (%d): %s" % (len(mine), ", ".join(
            "%s%s" % (n, "" if t == "OWN" else " (r)") for n, t in sorted(mine))))
    else:
        print("Nothing in your box learns it.")


def cmd_moves(a):
    moves = db("moves")
    mu = move_usage_index()
    res = []
    for m in moves:
        f = m.get("flags") or {}
        # the Attackdex documents ~900 moves but only ~500 are useable in
        # Champions; the rest have no legal user in the format
        if not getattr(a, "all", False) and m.get("useable") is False:
            continue
        if a.effect and a.effect.lower() not in (
                (m.get("effect") or "") + " " + (m.get("in_depth") or "")).lower():
            continue
        if a.flag and not f.get(a.flag):
            continue
        if a.type and (m.get("type") or "").lower() != a.type.lower():
            continue
        if a.category and (m.get("category") or "").lower() != a.category.lower():
            continue
        if a.min_power and (m.get("power") or 0) < a.min_power:
            continue
        if a.name and key(a.name) not in key(m["name"]):
            continue
        p = m.get("priority")
        if a.priority:
            if p is None:
                continue
            if a.priority == "+" and p <= 0:
                continue
            if a.priority == "-" and p >= 0:
                continue
            if a.priority not in ("+", "-") and p != int(a.priority):
                continue
        if a.learner:
            if a.learner.lower() not in [l.lower() for l in m.get("learners", [])]:
                continue
        res.append(m)

    if a.used:
        res = [m for m in res if mu.get(key(m["name"])) is not None]
    res.sort(key=lambda m: (-(mu.get(key(m["name"])) or -1), -(m.get("power") or 0)))

    print("%d moves" % len(res))

    # --owned turns the list into "what can I actually field": every move gets
    # the Pokemon in the box that learn it, so a capability question ("who has
    # priority?") is answered without cross-referencing 500 learner lists by
    # hand. Permanents sort first because only they can be trained.
    box = {}
    if getattr(a, "owned", False):
        # owned_sets() returns norm() keys, which are lowercased and token
        # sorted ("alola ninetales"), so the display name is read straight from
        # inventory.json instead - the player has to recognise these at a glance.
        inv = load(INV, {}) or {}
        for x in inv.get("permanent_pokemon", []):
            box[norm(x)] = "*" + x
        for x in (inv.get("rental_pokemon", {}) or {}).get("list", []):
            box.setdefault(norm(x), x)

    rows = []
    for m in res[:a.limit]:
        row = [
            m["name"], m.get("type"), (m.get("category") or "")[:4],
            m.get("power"), m.get("accuracy"), m.get("pp"),
            m.get("priority"), m.get("learner_count"),
            pct(mu.get(key(m["name"]))),
        ]
        if box:
            mine = sorted({box[norm(l)] for l in m.get("learners", [])
                           if norm(l) in box},
                          key=lambda x: (not x.startswith("*"), x))
            # A move half the box learns says nothing useful and wrecks the
            # table width; the count still carries the fact.
            shown = [x.lstrip("*") + ("" if x.startswith("*") else " (r)")
                     for x in mine[:6]]
            if len(mine) > 6:
                shown.append("+%d more" % (len(mine) - 6))
            row.append(len(mine))
            row.append(", ".join(shown) or "-")
        rows.append(row)
    heads = ["Move", "Type", "Cat", "Pow", "Acc", "PP", "Pri", "Users", "Usage"]
    if box:
        heads += ["N", "In your box  (r) = rental"]
    table(rows, heads)
    if box:
        print("  N = how many of your %d box Pokemon learn it;"
              " permanents listed first." % len(box))

    if a.learners:
        perm, temp, _, _ = owned_sets()
        ui = usage_index()
        print("\nPokemon that learn these moves (Champions legal):")
        counts = Counter()
        for m in res:
            for l in m.get("learners", []):
                counts[l] += 1
        rows = []
        for name, c in counts.most_common(a.limit):
            rows.append([name, c, pct(usage_of(name, ui)), own_tag(name, perm, temp)])
        table(rows, ["Pokemon", "#Moves", "Usage", "You"])


def cmd_counter_priority(a):
    """Everything that turns priority moves off, plus the priority moves themselves."""
    moves, abilities = db("moves"), db("abilities")
    ui = usage_index()
    perm, temp, _, _ = owned_sets()

    # "priority" plus any word that negates it. Kept broad on purpose: missing a
    # blocker is worse than showing one extra row.
    DENY = ("unable", "cannot", "can't", "prevent", "protect", "block", "fail",
            "immune", "deny", "denies", "stop", "nullif", "negat")
    blockers = []
    for ab in abilities:
        e = (ab.get("effect") or "").lower()
        if "priority" in e and any(d in e for d in DENY):
            blockers.append(("ability", ab["name"], ab.get("effect", ""),
                             ", ".join(ab.get("pokemon", [])[:6])))
    for m in moves:
        e = ((m.get("effect") or "") + " " + (m.get("in_depth") or "")).lower()
        if "priority" in e and any(d in e for d in DENY):
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


def cmd_pokemon(a):
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
    print("  Abilities   %s" % ", ".join(p["abilities"]))
    u = usage_of(p["name"], ui)
    print("  Ladder use  %s" % (pct(u) if u is not None else "not in usage data"))
    tag = own_tag(p["name"], perm, temp)
    print("  You own it  %s" % ("yes (permanent)" if tag == "OWN" else
                                "rental only" if tag == "rent" else "no"))

    megas = [m for m in db("pokemon")
             if m["is_mega"] and norm(m.get("species") or "") == norm(p["name"])]
    for m in megas:
        mb = m["base_stats"]
        stone = next((s for s in stones if norm(s).startswith(norm(p["name"])[:5])), None)
        print("  Mega        %s %s  BST %s  ability %s%s"
              % (m["name"], "/".join(m["types"]), mb["total"],
                 ", ".join(m["abilities"]), "  [stone owned]" if stone else ""))

    learn = load(os.path.join(DB, "learnsets.json"), {}) or {}
    mv = learn.get(p["name"]) or []
    if not mv:
        for k in learn:
            if norm(k) == norm(p["name"]):
                mv = learn[k]
                break
    if not mv:
        # cosmetic and gender forms share the base species' movepool
        for k in learn:
            if species_norm(k) == species_norm(p["name"]):
                mv = learn[k]
                break
    print("\n  Movepool: %d moves" % len(mv))
    if a.moves:
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

    show_smogon(p["name"])


def show_smogon(name):
    sm = meta("smogon_analyses")
    if not sm:
        return
    target = norm(name)
    for entry in sm.get("pokemon", []):
        if norm(entry["name"]) != target:
            continue
        if not entry.get("vgc_strategies"):
            print("\n  Smogon: no written VGC analysis for this Pokemon yet.")
            return
        for st in entry["vgc_strategies"]:
            print("\n  --- Smogon %s ---" % st["format"])
            if st.get("overview"):
                print("  " + st["overview"].replace("\n", "\n  "))
            for ms in st.get("movesets", []):
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
        return
    print("\n  Smogon: no entry found.")


def cmd_brief(a):
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
            mvs = Counter(m for _, s in entries for m in (s.get("moves") or []))
            tot = len(entries)

            def dist(c, label):
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

    # --- Pikalytics: spreads, win rate, cores ---
    for fmt in ("championstournaments", "battledataregmbs3"):
        pk = meta("pikalytics_" + fmt)
        if not pk:
            continue
        row = next((r for r in pk.get("pokemon", []) if norm(r["name"]) == norm(name)),
                   None)
        if not row:
            continue
        print("\nPikalytics [%s, data %s]" % (fmt, pk.get("data_date")))
        if row.get("win_rate"):
            print("  Win rate: %s  (record %s)" % (row["win_rate"], row.get("record")))
        sp = row.get("top_spread") or {}
        if sp.get("stat_points"):
            print("  Top SP spread: %s %s (%s%% of builds)"
                  % (sp["stat_points"], sp.get("nature") or "",
                     sp.get("share_percent")))
        if row.get("moves"):
            print("  Moves:  %s" % ", ".join(
                "%s %s%%" % (m["name"], m["percent"]) for m in row["moves"][:8]))
        if row.get("items"):
            print("  Items:  %s" % ", ".join(
                "%s %s%%" % (m["name"], m["percent"]) for m in row["items"][:6]))
        cores = [c for c in pk.get("cores_2", []) if
                 any(norm(x) == norm(name) for x in c["core"])]
        for c in cores[:4]:
            print("  Core:   %s  (%s teams, %s)"
                  % (" + ".join(c["core"]), c["teams"], c["usage"]))
        break

    # --- speed context ---
    tiers = (meta("speed_tiers") or {}).get("rows", [])
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


def stone_owner_map():
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


def worlds_mega_counts():
    """How often each species actually Mega Evolved at Worlds.

    Teamlists name the base Pokemon and put the stone in the item slot, so a
    Mega shows up as e.g. Staraptor holding Staraptite, never "Mega Staraptor".
    """
    tour = tournament("masters")
    if not tour:
        return {}, 0
    stones = {norm_item for norm_item in
              (key(i["name"]) for i in db("items") if i.get("is_mega_stone"))}
    counts = Counter()
    players = tour.get("players", [])
    for pl in players:
        for slot in pl.get("team", []):
            if slot.get("item") and key(slot["item"]) in stones:
                counts[norm(slot.get("pokemon"))] += 1
    return counts, len(players)


# Abilities that change an offensive stat outright, rather than move power.
STAT_ABILITY = {"Huge Power": ("atk", 2.0), "Pure Power": ("atk", 2.0)}
# Abilities that bias a Pokemon toward one damage category regardless of stats.
BIAS_ABILITY = {"Tough Claws": "physical", "Skill Link": "physical",
                "Sheer Force": "physical", "Huge Power": "physical",
                "Refrigerate": "either", "Adaptability": "either"}


def mega_profile(m):
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


def cmd_megas(a):
    inv = load(INV, {}) or {}
    perm = inv.get("permanent_pokemon", [])
    rentinfo = inv.get("rental_pokemon", {}) or {}
    rent = rentinfo.get("list", [])
    stones = set(inv.get("mega_stones", []))
    econ = (inv.get("economy", {}) or {}).get("costs", {}) or {}
    stone_vp = econ.get("mega_stone_shop", 2000)
    keep_vp = econ.get("keep_rental_pokemon", 2500)
    vp = (inv.get("economy", {}) or {}).get("vp_balance")
    tickets = rentinfo.get("permanence_tickets", 0)
    owner = stone_owner_map()
    ui = usage_index()
    wcounts, wtotal = worlds_mega_counts()
    _bpath = os.path.join(ROOT, "inventory", "builds.json")
    builds = {norm(str(b.get("pokemon")))
              for b in (load(_bpath, {}) or {}).get("builds", [])}
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
            bucket = "ready" if has_stone else "stone"
            cost = "-" if has_stone else "%d VP" % stone_vp
        elif is_rent:
            # A rental can already Mega Evolve; the ticket buys the right to TRAIN it.
            bucket = "both"
            need = 0 if has_stone else stone_vp
            cost = ("%d VP + 1 ticket  (or %d VP)" % (need, need + keep_vp)
                    if need else "1 ticket  (or %d VP)" % keep_vp)
        else:
            if not has_stone:
                continue
            bucket, cost = "orphan", "Encounter only"

        bs, base = m["base_stats"], bases.get(norm(sp))
        bbs = (base or {}).get("base_stats") or {}
        bty, mty = "/".join((base or {}).get("types") or []), "/".join(m["types"])
        gained = ", ".join(m["abilities"])
        lost = [x for x in ((base or {}).get("abilities") or []) if x not in m["abilities"]]
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
    print("%d VP is what buys it a build." % keep_vp)
    print("You have: %s VP, %s permanence ticket(s).\n"
          % (vp if vp is not None else "?", tickets))

    hdr = ["Role", "Mega", "Types", "Offense", "Speed", "Bulk",
           "Gains ability", "Loses", "Worlds", "Built", "Cost to build"]
    order = ["special", "physical", "mixed", "wall/support"]
    rows.sort(key=lambda r: (next((i for i, o in enumerate(order)
                                   if r[0].startswith(o)), 9), -r[5]))
    table(rows, hdr)


SP_BUDGET = 66
SP_MAX = 32


def cmd_build(a):
    """Show the player's own builds and check them against the rules."""
    data = load(os.path.join(ROOT, "inventory", "builds.json"), {}) or {}
    builds = data.get("builds", [])
    if a.name:
        builds = [b for b in builds if norm(a.name) in norm(b["pokemon"])]
    if not builds:
        print("No build recorded for %s" % (a.name or "anyone"))
        return

    learn = load(os.path.join(DB, "learnsets.json"), {}) or {}
    moves_by = {m["name"]: m for m in db("moves")}
    ui = usage_index()

    for b in builds:
        p = find_pokemon(b["pokemon"])
        print("=" * 74)
        title = b["pokemon"] + (" -> " + b["mega"] if b.get("mega") else "")
        print("%s   [%s]" % (title, b.get("role") or ""))
        print("=" * 74)
        if p:
            bs = p["base_stats"]
            print("  base   HP %s Atk %s Def %s SpA %s SpD %s Spe %s"
                  % (bs["hp"], bs["atk"], bs["def"], bs["spa"], bs["spd"], bs["spe"]))
        print("  abil   %s%s" % (b.get("ability") or "--",
                                 " -> " + b["mega_ability"] if b.get("mega_ability") else ""))
        nat = natures().get(b.get("nature") or "")
        print("  nature %s%s" % (b.get("nature") or "-- not recorded --",
                                 "   (%s)" % nat["summary"] if nat else ""))

        sp = b.get("stat_points")
        if sp:
            total = sum(v for v in sp.values() if isinstance(v, int))
            over = [k for k, v in sp.items() if isinstance(v, int) and v > SP_MAX]
            spread = " / ".join("%s %s" % (k.upper(), v) for k, v in sp.items() if v)
            flag = ""
            if total != SP_BUDGET:
                flag = "   *** %d SP, budget is %d ***" % (total, SP_BUDGET)
            elif over:
                flag = "   *** over %d in %s ***" % (SP_MAX, ", ".join(over))
            else:
                flag = "   (%d/%d SP, legal)" % (total, SP_BUDGET)
            print("  SP     %s%s" % (spread, flag))
        else:
            print("  SP     -- not recorded --")

        mvs = b.get("moves") or []
        if mvs:
            print("  moves")
            legal = None
            for k, v in learn.items():
                if norm(k) == norm(b["pokemon"]):
                    legal = v
                    break
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
        else:
            print("  moves  -- not recorded --")

        if b.get("rationale"):
            print("\n  %s" % b["rationale"].replace(". ", ".\n  "))

        # Every other string field on the build is printed as a labelled
        # note, so a field added to builds.json shows up here the same day
        # instead of being silently dropped.
        structural = {"pokemon", "mega", "ability", "mega_ability", "nature",
                      "stat_points", "moves", "role", "rationale", "_missing"}
        for k, v in b.items():
            if k in structural or not isinstance(v, str):
                continue
            print("\n  %s:\n    %s" % (k.replace("_", " ").upper(),
                                     v.replace(". ", ".\n    ")))
        if b.get("_missing"):
            print("\n  TODO: %s" % b["_missing"])
        print()


TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting",
         "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost",
         "Dragon", "Dark", "Steel", "Fairy"]


def typechart():
    return db("typechart") or {}


def natures():
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


def build_abilities():
    """Pokemon name -> the ability the player actually runs, from builds.json."""
    out = {}
    for b in (load(os.path.join(ROOT, "inventory", "builds.json"), {}) or {}).get("builds", []):
        out[norm(b["pokemon"])] = b.get("ability")
        if b.get("mega") and b.get("mega_ability"):
            out[norm(b["mega"])] = b["mega_ability"]
    return out


def defence(types, chart=None, abilities=None):
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


def canon_type(word):
    w = key(word)
    for t in TYPES:
        if key(t) == w:
            return t
    for t in TYPES:
        if key(t).startswith(w):
            return t
    return None


def cmd_types(a):
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
        print("=" * 62); print(label); print("=" * 62)
        _show_defence(d)
        return
    d = defence(types)
    print("=" * 62)
    print(label)
    print("=" * 62)
    _show_defence(d)


def _show_defence(d):
    for tag, test in (("x4", lambda m: m == 4), ("x2", lambda m: m == 2),
                      ("x0.5", lambda m: m == 0.5), ("x0.25", lambda m: m == 0.25),
                      ("x0", lambda m: m == 0)):
        hit = [t for t in TYPES if test(d[t])]
        if hit:
            print("  %-6s %s" % (tag, ", ".join(hit)))
    neutral = [t for t in TYPES if d[t] == 1]
    if neutral:
        print("  %-6s %s" % ("x1", ", ".join(neutral)))


def cmd_resist(a):
    """Who resists ALL of the given attacking types - the coverage question."""
    want = [t for t in (canon_type(x) for x in a.types) if t]
    if not want:
        print("Name at least one type. Example: query.py resist ice fairy")
        return
    chart = typechart()
    perm, temp, _, _ = owned_sets()
    ui = usage_index()
    builds = {b["pokemon"] for b in
              (load(os.path.join(ROOT, "inventory", "builds.json"), {}) or {}).get("builds", [])}
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


def cmd_nature(a):
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


def cmd_core(a):
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
    rows = []
    for t in TYPES:
        hits = [(m["name"], prof[m["name"]][t]) for m in members
                if prof[m["name"]][t] >= 2]
        if not hits:
            continue
        rows.append([t, len(hits),
                     ", ".join("%s x%g" % (n, v) for n, v in hits)])
    rows.sort(key=lambda r: (-r[1], -max(float(x.split("x")[-1])
                                         for x in r[2].split(", "))))
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

    perm, temp, _, _ = owned_sets()
    builds = {b["pokemon"] for b in
              (load(os.path.join(ROOT, "inventory", "builds.json"), {}) or {}).get("builds", [])}
    ui = usage_index()
    have = {m["name"] for m in members}

    cand = []
    for q in db("pokemon"):
        if q["name"] in have:
            continue
        own = own_tag(q["name"], perm, temp)
        if not own:
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
    if not cand:
        print("  Nothing you own resists any of those.")
        return
    cand.sort(key=lambda r: (-r[0], r[6] == "", r[1]))
    print("\n  What you own that resists them:")
    table([c[1:] for c in cand[:14]],
          ["Pokemon", "Types", "Resists", "Usage", "You", "Built"])


def cmd_ability(a):
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
          for r in (meta("usage_abilities") or {}).get("rows", [])}
    print("%s" % hit["name"])
    print("  %s" % hit.get("effect", "(no description)"))
    print("  Ladder use: %s" % pct(au.get(key(hit["name"]))))
    print("\n  Carriers (%d):" % len(hit["pokemon"]))
    table([[n, pct(usage_of(n, ui)), own_tag(n, perm, temp)] for n in hit["pokemon"]],
          ["Pokemon", "Usage", "You"])


def cmd_usage(a):
    rows = (meta("usage_pokemon") or {}).get("rows", [])
    perm, temp, _, _ = owned_sets()
    if a.owned:
        rows = [r for r in rows if own_tag(r["name"], perm, temp)]
    # pokebase stores types as RSC back-references, so read them from our own dex
    local = {norm(p["name"]): p for p in db("pokemon")}
    out = []
    for r in rows[:a.top]:
        bs = r.get("base_stats") or {}
        mine = local.get(norm(r["name"])) or {}
        types = mine.get("types") or [t for t in (r.get("types") or [])
                                      if isinstance(t, str) and not t.startswith("$")]
        out.append([r.get("rank"), r["name"], pct(r["usage_percent"]),
                    "/".join(types), bs.get("spe") or (mine.get("base_stats") or {}).get("spe"),
                    own_tag(r["name"], perm, temp)])
    table(out, ["#", "Pokemon", "Usage", "Types", "Spe", "You"])


def cmd_speed(a):
    rows = (meta("speed_tiers") or {}).get("rows", [])
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


def active_ability(pokemon, item, ability):
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


def worlds_compare(divs, a):
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


def cmd_worlds(a):
    want = list(DIVISIONS) if a.division == "all" else [a.division]
    divs = tournaments(want)
    if not divs:
        print("No tournament data for %s. Run: python scripts/fetch_tournament.py"
              " --division %s" % (a.division, want[0]))
        return
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

    if len(divs) > 1:
        if a.usage:
            worlds_compare(divs, a)
        else:
            for d, t in divs:
                print("\n=== %s ===" % d.upper())
                worlds_listing(t, a)
        return

    tour = divs[0][1]
    players = tour.get("players", [])

    if a.usage:
        top = players[:a.top] if a.top else players
        counts = Counter()
        items = defaultdict(Counter)
        abil = defaultdict(Counter)
        moves = defaultdict(Counter)
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
                    abil[mon][base_ab + (" -> " + becomes if becomes else "")] += 1
                for mv in slot.get("moves", []):
                    moves[mon][mv] += 1
        n = len(top)
        perm, temp, _, _ = owned_sets()
        rows = []
        for mon, c in counts.most_common(a.limit):
            rows.append([mon, c, "%.1f%%" % (100.0 * c / n) if n else "",
                         items[mon].most_common(1)[0][0] if items[mon] else "",
                         abil[mon].most_common(1)[0][0] if abil[mon] else "",
                         ", ".join(m for m, _ in moves[mon].most_common(4)),
                         own_tag(mon, perm, temp)])
        print("\nMost used across the top %d %s teams:" % (n, divs[0][0]))
        table(rows, ["Pokemon", "N", "Share", "Top item", "Top ability",
                     "Most common moves", "You"])
        return

    worlds_listing(tour, a)


def worlds_listing(tour, a):
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


def stone_for(mega):
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


def mega_line(name, mons, stones):
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


def cmd_owned(a):
    perm, temp, stones, items = owned_sets()
    inv = load(INV, {}) or {}
    ui = usage_index()
    mons = db("pokemon")
    byname = {norm(p["name"]): p for p in mons if not p["is_mega"]}

    perm_list = inv.get("permanent_pokemon", [])
    rent_list = inv.get("rental_pokemon", {}).get("list", [])
    tr = inv.get("trainer", {}) or {}
    slots = len(perm_list) + len(rent_list)
    cap = tr.get("box_capacity")
    stated = tr.get("box_used")
    print("BOX %s/%s%s" % (slots, cap or "?",
                           "" if stated in (None, slots)
                           else "   (inventory says box_used=%s - out of sync)" % stated))
    print("Mega Evolution can change stats, TYPING and ABILITY - the Mega ability")
    print("replaces the base one. Compare Mega against Mega, on all three.")

    def row_for(name, label=None):
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


def cmd_item(a):
    items = db("items")
    t = key(a.name)
    hit = next((x for x in items if key(x["name"]) == t), None) or \
          next((x for x in items if t in key(x["name"])), None)
    if not hit:
        print("Item not found: %s" % a.name)
        return
    iu = {key(r["name"]): r["usage_percent"]
          for r in (meta("usage_items") or {}).get("rows", [])}
    _, _, _, owned = owned_sets()
    print("%s%s" % (hit["name"], "  [you own it]" if hit["name"] in owned else ""))
    print("  %s" % hit["effect"])
    print("  Source: %s%s" % (hit["source"],
                              "" if not hit["price_vp"] else " (%d VP)" % hit["price_vp"]))
    print("  Ladder use: %s" % pct(iu.get(key(hit["name"]))))


def main():
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
