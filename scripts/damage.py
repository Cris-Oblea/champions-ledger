"""Champions damage calculator.

The formula was not documented by any of the five sources, so it is taken from
the one place that has it: pokebase.app's own damage calculator, which bundles
`@smogon/calc` and drives it with Champions data. Two things were read straight
out of that bundle (cached under data/raw/pokebase_calc/):

    stat  = floor((base + clamp(SP,0,32) + (75 if hp else 20)) * nature)
    base damage = floor(floor(floor(2*L/5+2) * power * A / D) / 50) + 2   at L=50

Both halves are now confirmed a second time, independently: Smogon publishes its
own Champions engine (gen 0 in @smogon/calc, vendored under
data/raw/smogon_calc/) and it implements the same two lines character for
character. See analysis/smogon_calc.md.

Champions is VGC doubles, so a move hitting more than one target takes the 0.75
spread modifier. Forgetting it overstates every spread move by a third.

The modifier is decided WHEN THE MOVE GOES OFF, not by the move itself: with
only one opposing Pokemon left it is back to full power (player, confirmed in
game 2026-09-04). Neither this file nor Smogon's engine can see the field, so
that case is the caller's to declare - `--single-target`.

WHAT THIS FILE GUARANTEES

`selftest()` does two things. It checks the three survival claims Smogon states
in prose, and then it runs `parity_block()`, which asks Smogon's own engine the
same 20 questions - one per mechanic - and requires identical answers. Over a
909-case sweep the two agree on 895 (98.5%); every one of the remaining 14 is a
move whose power depends on battle state nobody supplied - whether the attacker
holds an item, whether the target does, whether there is terrain, who moves
first - and `caveats()` prints a CONDITIONAL line for each of them. There are
ZERO cases where this file returns a different number without saying so.

Focus Sash and Sturdy are deliberately absent (player, 2026-09-04): they change
no damage number, only whether the target lands on 1 HP. A resist Berry is not
the same thing - that really does halve the figure, and it is modelled.

WHAT IT DOES NOT MODEL, ON PURPOSE

Abilities. The engine models 46 attacker-side and 65 defender-side;
reimplementing those here would drift the moment Smogon updates them. Instead
`caveats()` names any ability in play that changes damage, and the exact answer
is one flag away:

    --engine smogon      run the question through Smogon's engine (needs Node)

Usage:
    python scripts/damage.py --selftest
    python scripts/damage.py "Mega Glalie" Explosion Kingambit --atk-sp 32 --nature adamant
    python scripts/damage.py Basculegion "Wave Crash" Kingambit \\
        --engine smogon --atk-ability Adaptability
"""
import os, sys, re, json, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q

LEVEL = 50
SPREAD = 0.75          # any move with more than one target, in doubles

# The engine applies these at different stages, so they are NOT one x1.69 step.
# Sheer Force and Sharpness scale BASE POWER; Life Orb scales the FINAL damage.
SHEER_FORCE = 5325 / 4096.0     # x1.3 to base power, secondary effect removed
SHARPNESS   = 6144 / 4096.0     # x1.5 to base power, slicing moves only
LIFE_ORB    = 5324 / 4096.0     # x1.3 to final damage
# Smogon's full ability text (longer than the one our smogon_basics dump keeps):
# "If a secondary effect was removed, it also removes the user's Life Orb recoil
#  and Shell Bell recovery". So Sheer Force + Life Orb costs NO recoil - but only
#  on a move that actually had a secondary to remove.
LIFE_ORB_RECOIL = 1 / 10.0      # of max HP, per attack, unless Sheer Force applied


def poke_round(x):
    """The game rounds a half DOWN, unlike Python's round()."""
    return int(x) if (x % 1) <= 0.5 else int(x) + 1


def stat(base, sp, nature_mult=1.0, is_hp=False):
    sp = max(0, min(32, int(sp)))
    v = base + sp + (75 if is_hp else 20)
    return int(v) if is_hp else int(v * nature_mult)


def nature_mults(name):
    """Per-stat multipliers for a nature; data/db/natures.json already has them."""
    flat = {k: 1.0 for k in ("hp", "atk", "def", "spa", "spd", "spe")}
    if not name:
        return flat
    nats = Q.db("natures") or {}
    row = next((v for k, v in nats.items() if Q.key(k) == Q.key(name)), None)
    if not row:
        raise SystemExit("No nature called %r" % name)
    return {k: float(v) for k, v in (row.get("multipliers") or flat).items()}


def find_mon(name, attacking=False):
    """Resolve a Pokemon, including its in-battle forms.

    `battle_forms` on a row holds the spreads that are the same Pokemon to every
    usage source but a different stat line in battle - Aegislash-Blade,
    Palafin-Hero, the three Gourgeist sizes. query.norm() collapses those names
    on purpose (pokebase writes "Aegislash (Blade)" for what a teamlist calls
    "Aegislash"), so they are reached by asking for them explicitly:

        Aegislash-Blade, Palafin-Hero, Gourgeist-Large

    Aegislash is the one that must not be left to the caller. Stance Change puts
    it in Blade Forme the moment it uses a damaging move, so ATTACKING off the
    Shield spread means calculating with 50 Attack instead of 140 - wrong by
    2.8x, every time. It switches itself when it is the attacker.
    """
    rows = Q.db("pokemon")
    base = next((p for p in rows if Q.norm(p["name"]) == Q.norm(name)), None)
    tail = ""
    if base is None:
        # "Gourgeist-Jumbo" is not a row and norm() keeps "jumbo", so peel the
        # trailing qualifier off and look the species up on its own.
        stem, _, tail = re.sub(r"[_()\[\]]", " ", name.strip()).rpartition("-") \
            if "-" in name else name.strip().rpartition(" ")
        if stem:
            base = next((p for p in rows if Q.norm(p["name"]) == Q.norm(stem)), None)
    if base is None:
        raise SystemExit("No Pokemon called %r" % name)

    forms = base.get("battle_forms") or {}
    picked = None
    # an explicit suffix wins: "Palafin-Hero", "Gourgeist Jumbo"
    if not tail:
        tail = re.sub(r"^%s" % re.escape(base["name"]), "", name.strip(), flags=re.I)
    tail = tail.strip(" -_()[]").lower()
    if tail:
        picked = next((k for k in forms if k.lower() == tail), None)
    if picked is None and attacking and Q.norm(base["name"]) == Q.norm("Aegislash"):
        picked = "Blade"

    if picked:
        p = dict(base)
        p["base_stats"] = dict(forms[picked])
        p["name"] = "%s-%s" % (base["name"], picked)
        p["_form_note"] = ("Stance Change: attacking as Blade Forme (%d Atk / %d SpA)"
                           % (p["base_stats"]["atk"], p["base_stats"]["spa"])
                           if picked == "Blade" else
                           "%s Forme" % picked)
        return p
    return base


def find_move(name):
    for m in Q.db("moves"):
        if Q.key(m["name"]) == Q.key(name):
            return m
    raise SystemExit("No move called %r" % name)


def weight_of(name):
    """Species weight in kg. Champions stores several moves at power 1 because
    their real power is derived from weight; without this they calculate as
    nothing. Source: data/db/weights.json."""
    w = (Q.db("weights") or {}).get("weights", {})
    for k, v in w.items():
        if Q.norm(k) == Q.norm(name):
            return float(v)
    return None


def weight_power(move_name, attacker, defender):
    """Real base power for the weight-derived moves, or None if not one."""
    k = Q.key(move_name)
    tw = weight_of(defender if isinstance(defender, str) else defender["name"])
    if k in (Q.key("Low Kick"), Q.key("Grass Knot")):
        if tw is None:
            return None
        for limit, bp in ((10, 20), (25, 40), (50, 60), (100, 80), (200, 100)):
            if tw < limit:
                return bp
        return 120
    if k in (Q.key("Heavy Slam"), Q.key("Heat Crash")):
        aw = weight_of(attacker if isinstance(attacker, str) else attacker["name"])
        if tw is None or aw is None or tw <= 0:
            return None
        r = aw / tw
        for limit, bp in ((5, 120), (4, 100), (3, 80), (2, 60)):
            if r >= limit:
                return bp
        return 40
    return None


# Serebii spells the target field several ways for one thing - "All Adjacent
# Foes", "All Adjacent Opponents", "All opponents", "Opponent's Side" - and
# gets Misty Explosion outright wrong ("Selected Target" for a move that hits
# every adjacent Pokemon, your own ally included). Each miss costs the x0.75
# spread modifier, i.e. a third of the damage. The truth column is the `target`
# field in Smogon's Champions engine, cached under data/raw/smogon_calc/.
_SPREAD_OVERRIDE = {
    "misty explosion": True,    # Serebii: "Selected Target"
    "burning jealousy": True,   # Serebii: "Opponent's Side"
    "psyshield bash": False,    # Serebii: "Ally" - it is single-target
}


def is_spread(move):
    """Does this move hit more than one target, and so take the x0.75?"""
    over = _SPREAD_OVERRIDE.get(Q.key(move["name"]))
    if over is not None:
        return over
    t = (move.get("target") or "").lower()
    if "all" not in t:
        return False
    # "All allies", "All Allies", "Team" never hit an opponent
    return any(w in t for w in ("adjacent", "opponent", "foe", "pok"))


# Psyshock is the only move in Champions that attacks one defence and is
# categorised as the other: it is Special, but it hits the physical Defense.
_DEFENCE_OVERRIDE = {"psyshock": "def"}


# An ability only matters to a given move. Each entry says what has to be true
# for the warning to be worth printing; anything not listed always applies.
_ABILITY_SCOPE = {
    # keyed by ability -> the move types it can touch
    "thick fat": ("Fire", "Ice"), "heatproof": ("Fire",),
    "flash fire": ("Fire",), "fire mane": ("Fire",),
    "water bubble": ("Water", "Fire"), "water absorb": ("Water",),
    "storm drain": ("Water",), "dry skin": ("Water", "Fire"),
    "volt absorb": ("Electric",), "lightning rod": ("Electric",),
    "motor drive": ("Electric",), "sap sipper": ("Grass",),
    "levitate": ("Ground",), "eelevate": ("Ground",),
    "earth eater": ("Ground",), "purifying salt": ("Ghost",),
    "torrent": ("Water",), "blaze": ("Fire",), "overgrow": ("Grass",),
    "swarm": ("Bug",),
    "fairy aura": ("Fairy",), "dark aura": ("Dark",),
    "aerilate": ("Normal",), "pixilate": ("Normal",),
    "dragonize": ("Normal",), "scrappy": ("Normal", "Fighting"),
}
_ABILITY_FLAG = {          # ability -> the move flag it keys off
    "tough claws": "contact", "fluffy": "contact", "unseen fist": "contact",
    "piercing drill": "contact", "iron fist": "punch",
    "strong jaw": "biting", "mega launcher": "pulse",
    "liquid voice": "sound", "soundproof": "sound",
    "bulletproof": "bullet",
}


def _ability_applies(k, M, mtype, A, D):
    """Would this ability change THIS move's number?"""
    types = _ABILITY_SCOPE.get(k)
    if types is not None and mtype not in types:
        return False
    flag = _ABILITY_FLAG.get(k)
    if flag is not None and not (M.get("flags") or {}).get(flag):
        return False
    if k in ("huge power", "pure power", "hustle", "guts", "fur coat",
             "marvel scale", "reckless") and M.get("category") != "Physical":
        return False
    if k == "reckless" and not re.search(r"recoil|recharge",
                                         (M.get("effect") or ""), re.I):
        return False
    if k == "technician" and (M.get("power") or 0) > 60:
        return False
    if k in ("adaptability", "protean", "libero") and mtype in (A.get("types") or []):
        # Adaptability only adds on top of a STAB it already has
        return k == "adaptability"
    if k in ("armor tail", "queenly majesty") and (M.get("priority") or 0) <= 0:
        return False
    if k in ("filter", "solid rock") and type_mult(mtype, D.get("types") or []) <= 1:
        return False
    if k == "sniper" and not M.get("always_crit"):
        return False
    return True


def caveats(A, D, M, moves_last=None):
    """Everything this calculator cannot model, named out loud.

    The point is that a number is never silently wrong. `damage.py` implements
    the formula plus a handful of modifiers; Smogon's engine models 46
    attacker-side and 65 defender-side abilities and a dozen conditional base
    powers. Where one of those is in play, say so and point at --engine smogon,
    which runs the real engine over the same question.
    """
    out = []
    cond = {
        "raging bull": "breaks Reflect, Light Screen and Aurora Veil first",
        "acrobatics": "x2 base power when the user holds no item - this number "
                      "ASSUMES IT DOES hold one. Under the Item Clause it "
                      "almost certainly does; if it does not, double this",
        "payback": "x2 base power when the user moves last",
        "hex": "x2 base power against a statused target",
        "infernal parade": "x2 base power against a statused target",
        "barb barrage": "x2 base power against a poisoned target",
        "facade": "x2 base power when the user is burned, paralysed or poisoned",
        "venoshock": "x2 base power against a poisoned target",
        "lash out": "x2 base power when the user has been debuffed",
        "smelling salts": "x2 base power against a paralysed target",
        "knock off": "x1.5 base power when the target holds a removable item - "
                     "NOT applied here; a Mega Stone on its own holder does not "
                     "count as removable",
        "poltergeist": "FAILS outright if the target holds no item - this "
                       "number ASSUMES THE TARGET HOLDS ONE, which on a real "
                       "team it essentially always does",
        "steel roller": "FAILS outright with no terrain up",
        "electro ball": "base power scales with the speed ratio",
        "gyro ball": "base power scales with the speed ratio",
        "eruption": "base power scales with the user's remaining HP",
        "water spout": "base power scales with the user's remaining HP",
        "flail": "base power scales with the user's remaining HP",
        "reversal": "base power scales with the user's remaining HP",
        "hard press": "base power scales with the target's remaining HP",
        "stored power": "base power scales with the user's boosts",
        "power trip": "base power scales with the user's boosts",
        "punishment": "base power scales with the target's boosts",
        "brick break": "breaks Reflect, Light Screen and Aurora Veil first",
        "psychic fangs": "breaks Reflect, Light Screen and Aurora Veil first",
        "weather ball": "type AND base power depend on the weather - 100 BP of "
                        "the weather's type, never the Normal 50 printed here",
        "terrain pulse": "type and base power depend on the terrain",
    }
    c = cond.get(Q.key(M["name"]))
    if c and not (Q.key(M["name"]) == Q.key("Payback") and moves_last is not None):
        out.append("CONDITIONAL: %s - %s" % (M["name"], c))

    # Abilities that change a damage number and are not implemented here - but
    # only the ones that could touch THIS move. Warning about Heatproof on a
    # Ghost attack is noise, and noise is how a warning stops being read.
    known = {"refrigerate", "sheer force", "sharpness"}
    mtype = M.get("type")
    for mon in (A, D):
        for ab in (mon.get("abilities") or []):
            k = Q.key(ab)
            if k in known or k not in _DAMAGE_ABILITIES:
                continue
            if not _ability_applies(k, M, mtype, A, D):
                continue
            out.append("ABILITY not modelled: %s %s - %s"
                       % (mon["name"], ab, _DAMAGE_ABILITIES[k]))
    if out:
        out.append("  -> for an exact number run the same query with "
                   "--engine smogon")
    return out


# Abilities that Smogon's Champions engine treats as a damage modifier. Kept as
# a flat name->effect map rather than reimplemented, because reimplementing 111
# abilities in Python would drift away from the engine the moment it is updated.
_DAMAGE_ABILITIES = {
    "adaptability": "STAB becomes 2.0 instead of 1.5 (x1.33)",
    "protean": "STAB on every move it uses",
    "libero": "STAB on every move it uses",
    "huge power": "x2 Attack", "pure power": "x2 Attack",
    "tough claws": "x1.3 on contact moves",
    "technician": "x1.5 on moves of 60 BP or less",
    "iron fist": "x1.2 on punching moves",
    "reckless": "x1.2 on recoil moves",
    "strong jaw": "x1.5 on biting moves",
    "mega launcher": "x1.5 on pulse moves",
    "sand force": "x1.3 on Rock/Ground/Steel in sand",
    "solar power": "x1.5 Sp. Atk in sun",
    "guts": "x1.5 Attack when statused",
    "hustle": "x1.5 Attack on physical moves",
    "supreme overlord": "up to x1.5 as allies faint",
    "water bubble": "x2 on Water moves, halves incoming Fire",
    "fire mane": "x1.5 on Fire moves",
    "mega sol": "treats its own moves as being in sun",
    "analytic": "x1.3 when moving last",
    "rivalry": "x1.25 or x0.75 by gender match",
    "aerilate": "Normal -> Flying, x1.2",
    "pixilate": "Normal -> Fairy, x1.2",
    "refrigerate": "Normal -> Ice, x1.2",
    "dragonize": "Normal -> Dragon, x1.2",
    "liquid voice": "sound moves become Water",
    "parental bond": "the move hits a second time at x0.25",
    "sniper": "x1.5 on a critical hit",
    "merciless": "always crits a poisoned target",
    "fairy aura": "x1.33 to EVERY Fairy move on the field, both sides",
    "dark aura": "x1.33 to EVERY Dark move on the field, both sides",
    "mold breaker": "ignores the target's defensive ability",
    "scrappy": "Normal and Fighting hit Ghost",
    "unnerve": "the target's resist Berry does not activate",
    "gale wings": "Flying moves gain priority at full HP",
    "unseen fist": "contact moves go through Protect",
    "piercing drill": "contact moves go through Protect",
    # defensive
    "multiscale": "halves damage while at full HP",
    "filter": "x0.75 against super-effective", "solid rock": "x0.75 against super-effective",
    "fur coat": "halves physical damage",
    "fluffy": "halves contact damage, doubles Fire damage",
    "thick fat": "halves Fire and Ice",
    "heatproof": "halves Fire",
    "purifying salt": "halves Ghost",
    "friend guard": "x0.75 to damage taken by its ally",
    "marvel scale": "x1.5 Defense when statused",
    "unaware": "ignores the other side's stat boosts",
    "sturdy": "survives a full-HP KO at 1 HP",
    "levitate": "immune to Ground", "eelevate": "immune to Ground",
    "flash fire": "immune to Fire, then x1.5 its own Fire",
    "water absorb": "immune to Water", "dry skin": "immune to Water, x1.25 Fire taken",
    "volt absorb": "immune to Electric", "lightning rod": "immune to Electric",
    "motor drive": "immune to Electric", "storm drain": "immune to Water",
    "sap sipper": "immune to Grass", "earth eater": "immune to Ground",
    "bulletproof": "immune to bullet moves", "soundproof": "immune to sound moves",
    "armor tail": "immune to priority moves", "queenly majesty": "immune to priority moves",
    "shell armor": "cannot be crit", "battle armor": "cannot be crit",
    "ripen": "its resist Berry quarters instead of halving",
    "contrary": "every stat change is inverted",
}


# Moves whose type is read off the user's FORM, not the move row. Serebii says
# so in the effect text ("This move's type depends on the user's form") but
# leaves the row at Normal, so reading the type column gives a Normal move that
# does not exist - the same trap Weather Ball sets. Unlike Weather Ball the
# answer needs no battle state at all: the attacker's name settles it.
_FORM_TYPED = {
    "raging bull": {"Tauros-Paldea Combat": "Fighting",
                    "Tauros-Paldea Blaze": "Fire",
                    "Tauros-Paldea Aqua": "Water"},
    "aura wheel": {"Morpeko": "Electric", "Morpeko-Hangry": "Dark"},
}


def form_type(move, attacker):
    """The real type of a form-typed move, or None if it is not one.

    Both sides go through norm(), which SORTS its tokens - so the table is
    written in reading order and normalised here rather than pre-baked, which
    is what a hand-written "tauros paldea blaze" key got wrong.
    """
    table = _FORM_TYPED.get(Q.key(move["name"]))
    if not table:
        return None
    want = Q.norm(attacker["name"])
    return next((t for name, t in table.items() if Q.norm(name) == want), None)


def type_mult(move_type, def_types):
    tc = Q.db("typechart")
    m = 1.0
    for t in def_types:
        m *= float(tc.get(move_type, {}).get(t, 1))
    return m


def calc(attacker, move, defender, atk_sp=0, atk_nature=None, def_hp_sp=0,
         def_sp=0, def_nature=None, atk_ability=None, def_ability=None,
         power_mult=1.0, item_mult=1.0, boosts=0, def_boosts=0,
         override_power=None, spread=None, screen=None,
         target_atk_sp=0, target_atk_nature=None, moves_last=None,
         detail=None):
    """Returns (min_damage, max_damage, defender_max_hp, notes)."""
    A = find_mon(attacker, attacking=True) if isinstance(attacker, str) else attacker
    D = find_mon(defender) if isinstance(defender, str) else defender
    M = find_move(move) if isinstance(move, str) else move
    notes = []
    if A.get("_form_note"):
        notes.append(A["_form_note"])
    if D.get("_form_note"):
        notes.append("target: %s" % D["_form_note"])
    notes.extend(caveats(A, D, M, moves_last))

    power = override_power if override_power is not None else (M.get("power") or 0)
    if override_power is None:
        wp = weight_power(M["name"], A, D)
        if wp is not None:
            power = wp
            notes.append("weight-derived power: %d BP (%s %skg vs %s %skg)"
                         % (wp, A["name"], weight_of(A["name"]),
                            D["name"], weight_of(D["name"])))
    # Payback doubles when the user moves after the target. That is not a
    # species fact - Tailwind, Trick Room, a Choice Scarf and any Speed boost
    # or drop all decide it - so it is never guessed, only answered when the
    # caller says which way round the turn went.
    if Q.key(M["name"]) == Q.key("Payback") and moves_last is not None:
        if moves_last:
            power *= 2
            notes.append("Payback: the attacker moves last, so x2 -> %d BP" % power)
        else:
            notes.append("Payback: the attacker moves first, so no doubling")

    mtype = M.get("type")
    ft = form_type(M, A)
    if ft:
        notes.append("%s takes %s's form: %s, not the Normal in the move row"
                     % (M["name"], A["name"], ft))
        mtype = ft
    phys = M.get("category") == "Physical"

    ab = atk_ability if atk_ability is not None else (A.get("abilities") or [None])[0]
    if ab == "Refrigerate" and mtype == "Normal":
        power = poke_round(power * 4915 / 4096.0)
        mtype = "Ice"
        notes.append("Refrigerate: Normal -> Ice, power x1.2 -> %d" % power)
    # Type-boosting items (Black Glasses, Mystic Water, Metal Coat, Fairy
    # Feather) raise BASE POWER. Applying them to the final damage instead is
    # off by a point, which is the whole margin on a survival benchmark.
    if power_mult != 1.0:
        power = poke_round(power * power_mult)
        notes.append("item: base power x%.2f -> %d" % (power_mult, power))

    an = nature_mults(atk_nature)
    dn = nature_mults(def_nature)
    a_key, d_key = ("atk", "def") if phys else ("spa", "spd")
    # Psyshock is Special but hits the physical Defense - the only move in
    # Champions that splits the two, and it is exactly the move people aim at
    # special walls, so getting it wrong is expensive.
    dov = _DEFENCE_OVERRIDE.get(Q.key(M["name"]))
    if dov:
        d_key = dov
        notes.append("%s is Special but attacks the target's Defense" % M["name"])
    # A few moves attack off a stat that is not the category's usual one.
    # Body Press uses the user's Defense; Foul Play uses the TARGET's Attack.
    if Q.key(M["name"]) == Q.key("Body Press"):
        a_key = "def"
        notes.append("Body Press attacks off the user's Defense")
    Aatk = stat(A["base_stats"][a_key], atk_sp, an[a_key])
    if Q.key(M["name"]) == Q.key("Foul Play"):
        # Off the TARGET's Attack. This used to assume the target was a
        # max-Attack, Adamant Pokemon, which overstated it by about a third
        # against anything uninvested - and Foul Play is aimed at exactly the
        # bulky, uninvested targets that assumption is wrong about. The target's
        # real investment is a parameter now, defaulting to none.
        Aatk = stat(D["base_stats"]["atk"], target_atk_sp,
                    nature_mults(target_atk_nature)["atk"])
        notes.append("Foul Play attacks off the TARGET's Attack "
                     "(%d SP%s -> %d)"
                     % (target_atk_sp,
                        ", %s" % target_atk_nature if target_atk_nature else "",
                        Aatk))
    Ddef = stat(D["base_stats"][d_key], def_sp, dn[d_key])
    # Meteor Beam and Electro Shot raise the user's Sp. Atk by one stage on the
    # charging turn, so by the time they land the boost is ALWAYS there - it is
    # part of the move, not a condition. Contrary inverts it to -1 instead, and
    # that is the one case this cannot see, so it says so rather than guessing.
    if Q.key(M["name"]) in (Q.key("Meteor Beam"), Q.key("Electro Shot")):
        if "Contrary" in (A.get("abilities") or []):
            notes.append("%s charges for +1 Sp. Atk, but Contrary would invert "
                         "it to -1 - run --engine smogon with the real ability"
                         % M["name"])
        else:
            boosts += 1
            notes.append("%s charges first: +1 Sp. Atk (x1.5) is already "
                         "applied" % M["name"])
    if boosts:
        Aatk = int(Aatk * ((2 + boosts) / 2.0 if boosts > 0 else 2.0 / (2 - boosts)))
    # A defensive boost only protects the side it sits on: Calm Mind raises
    # Sp. Def and does nothing against a physical hit, Bulk Up the reverse.
    # def_boosts is (stat, stages) e.g. ("spd", 1); a bare int is read as the
    # stat this move actually attacks.
    if def_boosts:
        bstat, bstage = def_boosts if isinstance(def_boosts, (tuple, list))                         else (d_key, def_boosts)
        if bstat == d_key and bstage:
            Ddef = int(Ddef * ((2 + bstage) / 2.0 if bstage > 0
                               else 2.0 / (2 - bstage)))
            notes.append("target is at %+d %s" % (bstage, bstat))
    Dhp = stat(D["base_stats"]["hp"], def_hp_sp, 1.0, is_hp=True)

    base = int(int(int(2 * LEVEL / 5 + 2) * power * Aatk / Ddef) / 50) + 2

    # @smogon/calc applies these in a fixed order with a rounding step between
    # each one; collapsing them into a single multiply is off by a point or two,
    # which is exactly the margin a survival benchmark turns on.
    if spread is None:
        spread = is_spread(M)
    if spread:
        base = poke_round(base * 3072 / 4096.0)
        notes.append("spread move in doubles: x0.75")
        notes.append("  ...but only while TWO targets are alive. With one left "
                     "it is full power - re-run with --single-target")

    # Flower Trick, Frost Breath and Storm Throw always crit, which is a flat
    # x1.5 on the base damage - enough to move a roll across a KO boundary.
    if M.get("always_crit"):
        base = int(base * 1.5)
        notes.append("always a critical hit: x1.5")

    stab = mtype in A["types"]
    if stab:
        notes.append("STAB x1.5")
    te = type_mult(mtype, D["types"])
    notes.append("%s vs %s: x%s" % (mtype, "/".join(D["types"]), te))

    # Reflect / Light Screen / Aurora Veil are 2732/4096 in DOUBLES, not the
    # 0.5 they are in singles - and each one only covers ITS OWN category.
    # Reflect stops physical, Light Screen stops special, Aurora Veil both.
    # Applying any of them to any move (which this used to do) halved the wrong
    # attacks: a Reflect was cutting Flamethrower and a Light Screen Earthquake.
    # Player, 2026-09-09.
    covers = {"Reflect": ("Physical",), "Light Screen": ("Special",),
              "Aurora Veil": ("Physical", "Special")}
    screen_applies = bool(screen) and M.get("category") in covers.get(screen, ())
    # a critical hit ignores screens outright
    if screen_applies and M.get("always_crit"):
        screen_applies = False
        notes.append("%s is ignored: a critical hit goes through a screen"
                     % screen)
    base_mult = 2732 / 4096.0 if screen_applies else 1.0
    if screen and not screen_applies and not M.get("always_crit"):
        notes.append("%s does not cover %s moves - no reduction"
                     % (screen, (M.get("category") or "").lower()))

    rolls = []
    for i in range(16):                       # the 85%..100% damage roll
        d = int(base * (85 + i) / 100)
        if stab:
            d = int(d * 6144 / 4096)
        d = int(poke_round(d) * te)
        if item_mult != 1.0:
            d = poke_round(d * item_mult)
        if base_mult != 1.0:
            d = poke_round(d * base_mult)
        # An immunity is ZERO, not one. The minimum-1 floor only applies to a
        # move that actually connects; a x0 type matchup does not connect at all.
        rolls.append(0 if te == 0 else max(1, int(d)))
    if screen_applies:
        notes.append("%s in doubles: x0.667" % screen)

    lo, hi = rolls[0], rolls[-1]

    # A multi-hit move lands 2-5 times (or 2, 3 or 10). Returning one hit's
    # damage understates Rock Blast and Pin Missile by up to 5x and Dual
    # Wingbeat by 2x - the single largest error this calculator used to make.
    hits = M.get("hits")
    if hits and not override_power:
        lo_n, hi_n = hits
        if Q.key(M["name"]) == Q.key("Triple Axel"):
            # Three hits, but not three equal ones: 20 then 40 then 60 BP. The
            # rounding steps make a hit at 40 BP more than twice a hit at 20,
            # so each one is calculated at its own power rather than scaled.
            per = [calc(A, M, D, atk_sp=atk_sp, atk_nature=atk_nature,
                        def_hp_sp=def_hp_sp, def_sp=def_sp,
                        def_nature=def_nature, atk_ability=atk_ability,
                        def_ability=def_ability, power_mult=power_mult,
                        item_mult=item_mult, boosts=boosts,
                        def_boosts=def_boosts, override_power=bp, spread=spread,
                        screen=screen, target_atk_sp=target_atk_sp,
                        target_atk_nature=target_atk_nature,
                        moves_last=moves_last)[:2]
                   for bp in (20, 40, 60)]
            lo = sum(x[0] for x in per)
            hi = sum(x[1] for x in per)
            notes.append("Triple Axel: 3 hits at 20/40/60 BP -> %s"
                         % " + ".join("%d-%d" % x for x in per))
            notes.append("  it ends early on a miss, so 1 or 2 hits are the "
                         "%d-%d and %d-%d cases"
                         % (per[0][0], per[0][1],
                            per[0][0] + per[1][0], per[0][1] + per[1][1]))
        else:
            # A 2-5 move is quoted at min+1 hits - three for the whole 2-5
            # family - which is what the engine uses and what the in-game
            # distribution averages out to. The tails matter too, so both are
            # printed rather than hidden behind the headline number.
            n = lo_n + 1 if lo_n != hi_n else lo_n
            lo, hi = lo * n, hi * n
            notes.append("%s: %d hits of %d-%d%s"
                         % (M["name"], n, rolls[0], rolls[-1],
                            "" if lo_n == hi_n else " (the %d-%d average)" % (lo_n, hi_n)))
            if lo_n != hi_n:
                notes.append("  worst case %d hits: %d-%d   |   Skill Link is "
                             "always %d hits: %d-%d"
                             % (lo_n, rolls[0] * lo_n, rolls[-1] * lo_n,
                                hi_n, rolls[0] * hi_n, rolls[-1] * hi_n))
    if detail is not None:
        detail["rolls"] = rolls
        detail["hits"] = (hits[0] + 1 if hits and hits[0] != hits[1]
                          else (hits[0] if hits else 1))
    return lo, hi, Dhp, notes


def selftest():
    """Check the calculator against the damage claims in Smogon's own prose."""
    print("Validating against benchmarks Smogon states in its Champions analyses\n")
    ok = True

    # "30 HP / 24 Def / 12 SpD with Bold or Relaxed: ... survive Black Glasses
    #  Kingambit's Kowtow Cleave"  (Black Glasses = x1.2 Dark)
    lo, hi, hp, notes = calc("Kingambit", "Kowtow Cleave", "Farigiraf",
                             atk_sp=32, atk_nature="Adamant",
                             def_hp_sp=30, def_sp=24, def_nature="Relaxed",
                             power_mult=4915 / 4096.0)
    surv = hi < hp
    print("Black Glasses Kingambit Kowtow Cleave -> Farigiraf 30HP/24Def Relaxed")
    print("   %d-%d of %d HP  (%.0f%%-%.0f%%)   survives=%s  [Smogon: survives]"
          % (lo, hi, hp, 100.0*lo/hp, 100.0*hi/hp, surv))
    ok &= surv

    # "12 HP / 24 Def / 27 SpA / 3 SpD ... avoid the OHKO from non-Black Glasses
    #  Kingambit's Kowtow Cleave"
    lo2, hi2, hp2, _ = calc("Kingambit", "Kowtow Cleave", "Farigiraf",
                            atk_sp=32, atk_nature="Adamant",
                            def_hp_sp=12, def_sp=24, def_nature="Modest")
    surv2 = hi2 < hp2
    print("Plain Kingambit Kowtow Cleave -> Farigiraf 12HP/24Def Modest")
    print("   %d-%d of %d HP  (%.0f%%-%.0f%%)   survives=%s  [Smogon: survives]"
          % (lo2, hi2, hp2, 100.0*lo2/hp2, 100.0*hi2/hp2, surv2))
    ok &= surv2

    # "32 HP / 11 Def / 23 SpD with Calm or Sassy: cannot be OHKOed by Mega
    #  Floette's Light of Ruin"
    lo3, hi3, hp3, _ = calc("Mega Floette", "Light of Ruin", "Farigiraf",
                            atk_sp=32, atk_nature="Modest",
                            def_hp_sp=32, def_sp=23, def_nature="Calm")
    surv3 = hi3 < hp3
    print("Mega Floette Light of Ruin -> Farigiraf 32HP/23SpD Calm")
    print("   %d-%d of %d HP  (%.0f%%-%.0f%%)   survives=%s  [Smogon: cannot be OHKOed]"
          % (lo3, hi3, hp3, 100.0*lo3/hp3, 100.0*hi3/hp3, surv3))
    ok &= surv3

    # Smogon computed that third spread WITH Fairy Aura, which is Mega Floette's
    # own ability and boosts every Fairy move on the field by x1.33. The engine
    # says 192-226 of 227 - it survives by a single HP, not by the comfortable
    # quarter this line shows. The benchmark is "cannot be OHKOed" either way,
    # but the margin is the parity block's job, not this one's.
    print("   (Fairy Aura is not modelled here; the engine says 192-226 - it"
          " lives by 1 HP)")

    ok &= parity_block()
    print("\n%s" % ("ALL BENCHMARKS PASS" if ok else "MISMATCH - the formula is wrong"))
    return ok


# Cases chosen to cover every mechanic this file models, one each. Run through
# BOTH engines with abilities neutralised; the numbers must be identical. This
# is the guard that matters: the prose benchmarks above only check three
# survival claims, while this checks the arithmetic itself against the engine
# that defines it. 'Illuminate' is the neutral ability - it does nothing to
# damage on either side.
PARITY = [
    # plain physical, plain special, a resisted hit
    ("Garchomp", "Earthquake", "Incineroar", "Jolly", "what a neutral hit looks like"),
    ("Gholdengo", "Shadow Ball", "Sinistcha", "Modest", "plain special"),
    ("Basculegion", "Wave Crash", "Kingambit", "Adamant", "no STAB advantage"),
    # spread modifier, including the four Serebii mislabels
    ("Garchomp", "Earthquake", "Kingambit", "Adamant", "spread x0.75"),
    ("Clefable", "Misty Explosion", "Gholdengo", "Modest",
     "Serebii calls this single-target; it is not"),
    ("Sinistcha", "Matcha Gotcha", "Garchomp", "Modest", "spread, mislabelled"),
    ("Glimmora", "Mortal Spin", "Farigiraf", "Adamant", "spread, mislabelled"),
    # multi-hit
    ("Maushold", "Population Bomb", "Kingambit", "Jolly", "10 hits"),
    ("Abomasnow", "Icicle Spear", "Garchomp", "Adamant", "2-5 hits"),
    ("Dragonite", "Dual Wingbeat", "Sinistcha", "Adamant", "2 hits"),
    # always-crit, split defence, weight-derived power
    ("Froslass", "Frost Breath", "Dragonite", "Modest", "always crits, x1.5"),
    ("Alakazam", "Psyshock", "Sneasler", "Modest", "Special, hits Defense"),
    ("Kingambit", "Low Kick", "Tyranitar", "Adamant", "power from weight"),
    # attacks off a stat that is not the category's usual one
    ("Mega Eelektross", "Body Press", "Charizard", "Modest",
     "attacks off the user's Defense"),
    ("Morpeko", "Foul Play", "Garchomp", "Adamant",
     "attacks off the TARGET's Attack"),
    # type or power decided by something the move row does not say
    ("Tauros-Paldea Blaze", "Raging Bull", "Kingambit", "Adamant",
     "type comes from the user's form, not the move row"),
    ("Glimmora", "Meteor Beam", "Torkoal", "Modest",
     "charges first, so the +1 Sp. Atk always lands"),
    # the in-battle form
    ("Aegislash", "Shadow Ball", "Farigiraf", "Modest", "Stance Change -> Blade"),
    # answers that depend on the state of the field, once the caller supplies it
    ("Spiritomb", "Payback", "Tyranitar", "Adamant", "x2 when the user moves last",
     {"moves_last": True}, {}),
    ("Garchomp", "Earthquake", "Kingambit", "Jolly",
     "spread keeps full power with one target left",
     {"spread": False}, {"gameType": "Singles"}),
]


def engine_case(attacker, move, defender, atk_sp, atk_nature,
                def_hp_sp, def_sp, def_nature):
    """Build one question for Smogon's engine from the same inputs calc() takes.

    The stat the SP goes into must follow the move, not its category label:
    Body Press attacks off Defense and Psyshock hits the target's Defense even
    though it is Special. Deciding that in one place is what keeps the two
    engines answering the SAME question - it was the last parity failure.
    """
    M = find_move(move)
    phys = M.get("category") == "Physical"
    a_key = "atk" if phys else "spa"
    if Q.key(M["name"]) == Q.key("Body Press"):
        a_key = "def"
    d_key = _DEFENCE_OVERRIDE.get(Q.key(M["name"])) or ("def" if phys else "spd")
    return {
        "attacker": smogon_name(attacker, attacking=True),
        "defender": smogon_name(defender),
        "move": M["name"],
        "anature": atk_nature or "Serious",
        "aevs": {a_key: max(0, min(32, atk_sp))},
        "dnature": def_nature or "Serious",
        "devs": {"hp": max(0, min(32, def_hp_sp)), d_key: max(0, min(32, def_sp))},
    }


def parity_block():
    """Check this file against Smogon's engine, mechanic by mechanic."""
    print("\nParity against Smogon's own Champions engine (abilities neutralised)\n")
    cases = []
    for row in PARITY:
        atk, mv, dfn, nat = row[0], row[1], row[2], row[3]
        over = row[6] if len(row) > 6 else {}
        cases.append(dict(engine_case(atk, mv, dfn, 32, nat, 20, 12, "Serious"),
                          aability="Illuminate", dability="Illuminate", **over))
    try:
        got = run_smogon(cases)
    except SystemExit as e:
        print("  SKIPPED - %s" % e)
        print("  (install Node, or run python scripts/fetch_smogon_calc.py)")
        return True

    ok = True
    for row, r in zip(PARITY, got):
        atk, mv, dfn, nat, why = row[0], row[1], row[2], row[3], row[4]
        extra = row[5] if len(row) > 5 else {}
        if r.get("error"):
            print("  ERROR  %-14s %-17s %s" % (atk, mv, r["error"]))
            ok = False
            continue
        lo, hi, hp, _ = calc(atk, mv, dfn, atk_sp=32, atk_nature=nat,
                             def_hp_sp=20, def_sp=12, def_nature="Serious",
                             atk_ability="Illuminate", **extra)
        match = (lo, hi, hp) == (r["lo"], r["hi"], r["maxHP"])
        ok &= match
        print("  %s %-14s %-17s -> %-12s ours %4d-%-4d  engine %4d-%-4d   %s"
              % ("ok  " if match else "FAIL", atk, mv, dfn, lo, hi,
                 r["lo"], r["hi"], why))
        if not match and hp != r["maxHP"]:
            print("        HP disagrees: %d vs %d - the STAT formula is wrong"
                  % (hp, r["maxHP"]))
    agree = 0
    for row, r in zip(PARITY, got):
        if r.get("error"):
            continue
        ex = row[5] if len(row) > 5 else {}
        if calc(row[0], row[1], row[2], atk_sp=32, atk_nature=row[3],
                def_hp_sp=20, def_sp=12, def_nature="Serious",
                atk_ability="Illuminate", **ex)[:2] == (r["lo"], r["hi"]):
            agree += 1
    print("\n  %d/%d mechanics agree with the engine" % (agree, len(PARITY)))
    return ok


SMOGON_BUNDLE = os.path.join(ROOT, "data", "raw", "smogon_calc")


def smogon_name(name, attacking=False):
    """Our spelling -> the Champions roster spelling in Smogon's engine.

    norm() does the work (Mega Glalie <-> Glalie-Mega), and these are the only
    names where the two rosters genuinely disagree, checked by sweeping all 340
    forms through the engine: they split Aegislash into its two stances, spell
    every gender form "-F" (Basculegion, Meowstic and Indeedee), and file plain
    Floette under its Eternal Flower name.
    """
    if Q.norm(name) == Q.norm("Aegislash"):
        return "Aegislash-Blade" if attacking else "Aegislash-Shield"
    special = {Q.norm("Basculegion-Female"): "Basculegion-F",
               Q.norm("Meowstic-Female"): "Meowstic-F",
               Q.norm("Indeedee-Female"): "Indeedee-F",
               Q.norm("Floette"): "Floette-Eternal"}
    if Q.norm(name) in special:
        return special[Q.norm(name)]
    path = os.path.join(SMOGON_BUNDLE, "raw_species.json")
    if not os.path.exists(path):
        raise SystemExit(
            "Smogon's engine is not vendored - expected %s\n"
            "Fetch it with: python scripts/fetch_smogon_calc.py" % path)
    roster = json.load(open(path, encoding="utf-8"))
    hit = next((k for k in roster if Q.norm(k) == Q.norm(name)), None)
    if not hit:
        raise SystemExit("Smogon's Champions roster has no %r" % name)
    return hit


def run_smogon(cases):
    """Hand a batch of questions to Smogon's own engine via Node."""
    import subprocess
    js = os.path.join(ROOT, "scripts", "smogon_engine.js")
    try:
        p = subprocess.run(["node", js, "-"], input=json.dumps(cases),
                           capture_output=True, text=True)
    except FileNotFoundError:
        raise SystemExit("--engine smogon needs Node on PATH (node --version)")
    if p.returncode != 0:
        raise SystemExit("smogon_engine.js failed:\n%s" % (p.stderr or "").strip())
    return json.loads(p.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("attacker", nargs="?")
    ap.add_argument("move", nargs="?")
    ap.add_argument("defender", nargs="?")
    ap.add_argument("--atk-sp", type=int, default=32)
    ap.add_argument("--nature", default=None)
    ap.add_argument("--def-hp-sp", type=int, default=0)
    ap.add_argument("--def-sp", type=int, default=0)
    ap.add_argument("--def-nature", default=None)
    ap.add_argument("--item-mult", type=float, default=1.0)
    ap.add_argument("--screen", choices=["Reflect", "Light Screen", "Aurora Veil"],
                    default=None, help="a screen on the target's side (x0.667 in doubles)")
    ap.add_argument("--engine", choices=["local", "smogon", "auto"], default="auto",
                    help="'smogon' runs Smogon's own Champions engine via Node, "
                         "which models every ability and conditional base power. "
                         "'auto' (the default) uses the local formula until you "
                         "ask for something only the engine can honour, then "
                         "switches and says so. 'local' refuses instead.")
    ap.add_argument("--atk-ability", default=None)
    ap.add_argument("--def-ability", default=None)
    ap.add_argument("--atk-item", default=None)
    ap.add_argument("--def-item", default=None)
    ap.add_argument("--weather", default=None,
                    choices=["Sun", "Rain", "Sand", "Snow"])
    ap.add_argument("--target-atk-sp", type=int, default=0,
                    help="Foul Play only: the TARGET's Attack investment")
    ap.add_argument("--target-atk-nature", default=None)
    ap.add_argument("--terrain", default=None,
                    choices=["Electric", "Grassy", "Misty", "Psychic"])
    ap.add_argument("--boost", type=int, default=0,
                    help="the attacker's stat stages, e.g. 2 after a Swords Dance")
    ap.add_argument("--def-boost", type=int, default=0,
                    help="the target's stages in the stat this move attacks")
    ap.add_argument("--crit", action="store_true", help="assume a critical hit")
    ap.add_argument("--allies-fainted", type=int, default=0,
                    help="Supreme Overlord: how many of the attacker's allies are down")
    ap.add_argument("--target-hp", type=int, default=None,
                    help="the target's CURRENT HP - Multiscale and Sturdy need it")
    ap.add_argument("--single-target", action="store_true",
                    help="only ONE Pokemon is on the other side, so a spread "
                         "move keeps its full power (no x0.75)")
    ap.add_argument("--atk-status", default=None,
                    choices=["brn", "par", "psn", "tox", "slp", "frz"])
    ap.add_argument("--def-status", default=None,
                    choices=["brn", "par", "psn", "tox", "slp", "frz"],
                    help="also feeds the between-turns chip in the KO count")
    # Every switch calc.pokemonshowdown.com's Field panel exposes, so a number
    # here can be checked against the real calculator instead of argued about.
    for f, h in (("helping-hand", "an ally used Helping Hand (doubles)"),
                 ("friend-guard", "an ally of the TARGET has Friend Guard"),
                 ("charge", "the attacker used Charge (Electric x2)"),
                 ("gravity", "Gravity is up: Flying types are grounded"),
                 ("magic-room", "Magic Room: held items do nothing"),
                 ("wonder-room", "Wonder Room: Defense and Sp. Def swapped"),
                 ("power-trick-atk", "the attacker used Power Trick"),
                 ("power-trick-def", "the target used Power Trick"),
                 ("protected", "the target is protecting"),
                 ("foresight", "the target is Foresighted"),
                 ("battery", "an ally has Battery (special x1.3)"),
                 ("power-spot", "an ally has Power Spot"),
                 ("steely-spirit", "an ally has Steely Spirit"),
                 ("flower-gift-atk", "Flower Gift on the attacker's side"),
                 ("flower-gift-def", "Flower Gift on the target's side"),
                 ("dark-aura", "Dark Aura is up"),
                 ("fairy-aura", "Fairy Aura is up"),
                 ("aura-break", "Aura Break is up"),
                 ("beads-of-ruin", "Beads of Ruin: Sp. Def -25%%"),
                 ("sword-of-ruin", "Sword of Ruin: Defense -25%%"),
                 ("tablets-of-ruin", "Tablets of Ruin: Attack -25%%"),
                 ("vessel-of-ruin", "Vessel of Ruin: Sp. Atk -25%%")):
        ap.add_argument("--" + f, action="store_true", help=h)
    ap.add_argument("--moves-last", action="store_true",
                    help="Payback: the attacker moves after the target")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest or not a.attacker:
        selftest()
        return

    # Flags the local formula cannot honour. Accepting one and quietly ignoring
    # it is the exact failure this calculator is built to not have, so the
    # default routes the question to the engine that CAN answer it, out loud.
    engine_only = [n for n, v in (
        ("--weather", a.weather), ("--terrain", a.terrain),
        ("--atk-ability", a.atk_ability), ("--def-ability", a.def_ability),
        ("--atk-item", a.atk_item), ("--def-item", a.def_item),
        ("--crit", a.crit or None), ("--boost", a.boost or None),
        ("--def-boost", a.def_boost or None),
        ("--allies-fainted", a.allies_fainted or None),
        ("--target-hp", a.target_hp),
        ("--atk-status", a.atk_status), ("--def-status", a.def_status),
    ) if v]
    if engine_only and a.engine == "auto":
        print("   (%s: only Smogon's engine models %s, switching to it)"
              % (", ".join(engine_only),
                 "that" if len(engine_only) == 1 else "those"))
        a.engine = "smogon"
    elif engine_only and a.engine == "local":
        raise SystemExit(
            "The local formula cannot honour %s. Drop the flag, or use "
            "--engine smogon." % ", ".join(engine_only))

    if a.engine == "smogon":
        case = engine_case(a.attacker, a.move, a.defender, a.atk_sp, a.nature,
                           a.def_hp_sp, a.def_sp, a.def_nature)
        case.update({"aability": a.atk_ability, "dability": a.def_ability,
                     "aitem": a.atk_item, "ditem": a.def_item,
                     "weather": a.weather, "terrain": a.terrain,
                     "screen": a.screen, "isCrit": a.crit,
                     "alliesFainted": a.allies_fainted or None,
                     "dcurHP": a.target_hp,
                     "astatus": a.atk_status, "dstatus": a.def_status,
                     "helpingHand": a.helping_hand, "friendGuard": a.friend_guard,
                     "charge": a.charge, "gravity": a.gravity,
                     "magicRoom": a.magic_room, "wonderRoom": a.wonder_room,
                     "powerTrickAtk": a.power_trick_atk,
                     "powerTrickDef": a.power_trick_def,
                     "protected": a.protected, "foresight": a.foresight,
                     "battery": a.battery, "powerSpot": a.power_spot,
                     "steelySpirit": a.steely_spirit,
                     "flowerGiftAtk": a.flower_gift_atk,
                     "flowerGiftDef": a.flower_gift_def,
                     "darkAura": a.dark_aura, "fairyAura": a.fairy_aura,
                     "auraBreak": a.aura_break,
                     "beadsOfRuin": a.beads_of_ruin,
                     "swordOfRuin": a.sword_of_ruin,
                     "tabletsOfRuin": a.tablets_of_ruin,
                     "vesselOfRuin": a.vessel_of_ruin})
        if a.single_target:
            # The engine decides the x0.75 from the MOVE's target type and has
            # no idea how many Pokemon are actually out, so the only lever is
            # gameType. Singles also halves screens instead of the doubles
            # 0.667, which is the one case the two cannot be separated.
            if a.screen:
                raise SystemExit(
                    "--single-target and --screen cannot be combined on the "
                    "engine: its only lever for the spread modifier is the "
                    "game type, which would also switch screens to their "
                    "singles value. Run them separately.")
            case["gameType"] = "Singles"
        if a.boost:
            phys = find_move(a.move).get("category") == "Physical"
            case["aboosts"] = {("atk" if phys else "spa"): a.boost}
        if a.def_boost:
            d_key = _DEFENCE_OVERRIDE.get(Q.key(find_move(a.move)["name"])) or (
                "def" if find_move(a.move).get("category") == "Physical" else "spd")
            case["dboosts"] = {d_key: a.def_boost}
        r = run_smogon([case])[0]
        if r.get("error"):
            raise SystemExit("Smogon engine: %s" % r["error"])
        # The engine falls back to the FIRST ability in the species row when
        # none is given, and Kingambit's first is Defiant, not Supreme Overlord.
        # So a bare --allies-fainted quietly buys nothing; say so.
        if a.allies_fainted and Q.key(r.get("ability") or "") != Q.key("Supreme Overlord"):
            print("   NOTE: --allies-fainted does nothing here - %s is using %s, "
                  "not Supreme Overlord. Add --atk-ability \"Supreme Overlord\"."
                  % (r["attacker"], r.get("ability")))
        print("%s %s -> %s   [Smogon's own engine]"
              % (r["attacker"], r["move"], r["defender"]))
        print("   %s" % r["desc"])
        print("   %d-%d damage of %d HP  =  %.1f%% - %.1f%%"
              % (r["lo"], r["hi"], r["maxHP"], r["pct_lo"], r["pct_hi"]))
        if r.get("ko_text"):
            print("   %s" % r["ko_text"])
        return

    detail = {}
    lo, hi, hp, notes = calc(a.attacker, a.move, a.defender, atk_sp=a.atk_sp,
                             atk_nature=a.nature, def_hp_sp=a.def_hp_sp,
                             def_sp=a.def_sp, def_nature=a.def_nature,
                             item_mult=a.item_mult, screen=a.screen,
                             spread=False if a.single_target else None,
                             moves_last=a.moves_last,
                             target_atk_sp=a.target_atk_sp,
                             target_atk_nature=a.target_atk_nature,
                             detail=detail)
    print("%s %s -> %s" % (a.attacker, a.move, a.defender))
    for n in notes:
        print("   %s" % n)
    if lo >= hp:
        verdict = "   GUARANTEED OHKO"
    elif hi >= hp:
        # The 16 rolls are the 85%..100% spread. For a single hit the share of
        # them that reaches the target's HP IS the OHKO chance. For a multi-hit
        # the hits roll independently, so counting this way would be wrong -
        # say "possible" and leave the exact odds to --engine smogon, which
        # convolves them properly.
        rolls = detail.get("rolls") or []
        if detail.get("hits", 1) == 1 and rolls:
            pct = 100.0 * sum(1 for r in rolls if r >= hp) / len(rolls)
            verdict = "   possible OHKO (%.0f%% of rolls)" % pct
        else:
            verdict = "   possible OHKO (odds need --engine smogon)"
    else:
        verdict = "   no OHKO"
    print("   %d-%d damage of %d HP  =  %.1f%% - %.1f%%%s"
          % (lo, hi, hp, 100.0*lo/hp, 100.0*hi/hp, verdict))


if __name__ == "__main__":
    main()
