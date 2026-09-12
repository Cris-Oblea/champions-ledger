#!/usr/bin/env python3
"""Derive, from the real move and ability text, which ability touches which move.

    python scripts/build_ability_moves.py            # write the table + report
    python scripts/build_ability_moves.py --report   # report only, write nothing
    python scripts/build_ability_moves.py --audit    # every ability, classified

Nothing here is a hand-written move list. Each ability carries a PREDICATE over
properties derived from Serebii's own move text, so a move added by a regulation
is classified the day the data refreshes. The report is the point: it prints
what every rule caught, so the classification can be checked, not trusted.

Three rules the earlier version got wrong, all found by the player:

  * A power multiplier CANNOT apply to a move that deals no damage. Adaptability
    was badging Basculegion's Rain Dance - a Water move with 0 BP and no STAB to
    double. Every multiplier rule now requires a damaging move.
  * "1-stage Critical-Hit Ratio Boost" is not a stat stage. Reading it as one is
    what put Contrary on Protect and Roost, which move no stat at all.
  * An ability that changes what comes IN is not an ability that changes what
    goes OUT. Bulletproof and Filter never touch their own Pokemon's moves, so
    they are classed defensive and never badge a movepool.

Two more the sentence splitter got wrong, found 2026-09-10:

  * "Sp. Atk" ENDS A SENTENCE as far as a naive split on "." is concerned, so
    every move whose only stat is a special one fell out of the table. Contrary
    was missing Nasty Plot, Calm Mind, Quiver Dance - and Draco Meteor,
    Overheat and Leaf Storm, which is the whole reason to run Contrary.
  * A stat NAMED is not a stat CHANGED. Gyro Ball ("the lower the user's Speed
    ... the greater this move's power") read as a self-debuff, Sheer Cold's
    fixed accuracy read as one too, and King's Shield's "attackers ... will
    have their Attack lowered" was credited to the user instead of the
    attacker. A real stat change always says "stage" - or maximises one.
"""
import argparse, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q

OUT = os.path.join(ROOT, "data", "db", "ability_moves.json")

STATS = (r"Attack|Defense|Defence|Sp\. ?Atk|Sp\. ?Def|Special Attack|"
         r"Special Defense|Speed|accuracy|evasiveness")
UP = r"[Bb]oost(?:s|ing|ed)?|[Rr]ais(?:e|es|ing)|[Ii]ncreas(?:e|es|ing)"
DOWN = r"[Ll]ower(?:s|ing|ed)?|[Rr]educ(?:e|es|ing)|[Dd]rop(?:s|ping)?"
CRIT = re.compile(r"Critical-Hit Ratio", re.I)
RECOIL = re.compile(r"user\s+(?:also\s+)?takes\s+\d+/\d+\s+of the damage", re.I)
# Serebii writes every real stat change as "by N stage(s)", or maximises one.
# Requiring it is what separates a stat CHANGED from a stat merely NAMED.
STAGE = re.compile(r"\bstages?\b|maximi[sz]e|minimi[sz]e|to maximum", re.I)
# The other side of the field, however it is spelled. A drop written here is
# the target's, even when the same sentence says "the user".
ATTACKER = re.compile(r"attacker|opponent|the foe", re.I)


def clean(s):
    return (s or "").replace("�", "'")


def sentences(text):
    """Split on real sentence ends - and "Sp. Atk" is not one.

    Serebii abbreviates the special stats mid-sentence, so a naive split on
    "." cut "Boosts the user's Sp. Atk stat by 2 stages." in half and left
    neither piece with both a stat name and a verb.
    """
    t = re.sub(r"Sp\.\s*(Atk|Def)", r"Sp.\1", clean(text))
    return [s for s in re.split(r"(?<=[.])\s+", t) if s.strip()]


def stat_moves(m):
    """(self_up, self_down, target_up, target_down) for one move."""
    su = sd = tu = td = False
    body = clean(m.get("effect")) + " " + clean(m.get("in_depth"))
    for s in sentences(body):
        if CRIT.search(s) or not re.search(STATS, s):
            continue
        if not STAGE.search(s):
            continue          # a stat named to derive POWER, not to change it
        has_up, has_down = re.search(UP, s), re.search(DOWN, s)
        if not (has_up or has_down):
            continue
        hits_other = ATTACKER.search(s)
        self_ref = re.search(r"the user'?s?\b|\bits\b(?!\s+held)|itself", s)
        targ_ref = re.search(r"the targets?'?s?\b|targets'", s) or hits_other
        ally_only = re.search(r"\ballies'?\b|an ally'?s?\b", s)
        if ally_only and not (self_ref or targ_ref):
            continue
        if hits_other:
            self_ref = None   # King's Shield lowers the ATTACKER's Attack
        if self_ref:
            su, sd = su or bool(has_up), sd or bool(has_down)
        if targ_ref:
            tu, td = tu or bool(has_up), td or bool(has_down)
        if not self_ref and not targ_ref and re.search(r"\buser\b", s):
            su, sd = su or bool(has_up), sd or bool(has_down)
    return su, sd, tu, td


def down_stats(m):
    """Which of the target's stats this move lowers, by name.

    Hyper Cutter guards Attack and Big Pecks guards Defense; badging either on
    every stat-dropping move would be a lie, so the stat is read out of the
    same sentence the drop came from.
    """
    out = set()
    body = clean(m.get("effect")) + " " + clean(m.get("in_depth"))
    for s in sentences(body):
        if CRIT.search(s) or not STAGE.search(s) or not re.search(DOWN, s):
            continue
        if not (re.search(r"the targets?'?s?\b|targets'", s)
                or ATTACKER.search(s)):
            continue
        for w in re.findall(STATS, s):
            out.add(_STAT_NAME.get(w.replace(". ", "."), w))
    return sorted(out)


# every spelling Serebii uses, folded onto one name each
_STAT_NAME = {"Sp.Atk": "Sp. Atk", "Sp.Def": "Sp. Def", "Defence": "Defense",
              "Special Attack": "Sp. Atk", "Special Defense": "Sp. Def"}


def secondary(m):
    """A SECONDARY effect - what Sheer Force trades for 30% power.

    moves.json puts the crit rate in effect_rate when there is no secondary, so
    "effect_rate > 0" marks Earthquake and Close Combat as having one.
    """
    er = m.get("effect_rate")
    if er in (None, 0):
        return False
    cr = clean(m.get("crit_rate")).rstrip("%")
    try:
        return er != float(cr)
    except ValueError:
        return True


SMOG = os.path.join(ROOT, "data", "raw", "smogon_calc", "raw_moves.json")


def smogon_moves():
    """Smogon's own move table, keyed the way query.key() keys ours.

    It is the better source for two things this file turns on. `secondaries`
    marks the guaranteed on-hit effects - Icy Wind, Rock Tomb, Snarl - that
    Serebii records with no rate at all, and it does NOT count a binding move's
    Bound status, which is that move's primary effect. Checked move by move:
    the two sources agree on 82 and differ on 52, and Smogon is right on all of
    them. `recoil` and `multihit` are explicit fields there too, rather than
    something to read out of prose.
    """
    if not os.path.exists(SMOG):
        return {}
    raw = json.load(open(SMOG, encoding="utf-8"))
    return {Q.key(n): v for n, v in raw.items() if isinstance(v, dict)}


# How many Pokemon a move hits, and whether one of them is your own ally.
# Serebii spells this four ways for one thing - "All Adjacent Foes", "All
# Adjacent Opponents", "All opponents", "Opponent's Side" - and gets three
# moves outright wrong, so Smogon's engine `target` column is the truth
# wherever it has one. Same call damage.py makes; the disagreements it lists
# (Misty Explosion, Burning Jealousy, Psyshield Bash) come out of this
# automatically, and Corrosive Gas is a fourth it does not have.
_SERB_SPREAD = {"all adjacent foes", "all adjacent opponents",
                "all adjacent pokemon", "all opponents"}


def fold(t):
    return "".join(c for c in unicodedata.normalize("NFKD", t or "")
                   if not unicodedata.combining(c)).lower()


def targeting(m, S):
    """(spread, hits_ally) - more than one target, and is the ally one of them?"""
    t = S.get("target") if S else None
    if t in ("allAdjacent", "allAdjacentFoes"):
        return True, t == "allAdjacent"
    if S:                     # Smogon knows the move and says single-target
        return False, False
    k = fold(m.get("target"))
    return k in _SERB_SPREAD, k == "all adjacent pokemon"


def derive(moves):
    sm = smogon_moves()
    out, conflicts = {}, []
    for m in moves:
        if not m.get("useable"):
            continue
        su, sd, tu, td = stat_moves(m)
        f = m.get("flags") or {}
        body = clean(m.get("effect")) + " " + clean(m.get("in_depth"))
        name = m["name"]
        S = sm.get(Q.key(name), {})
        # Serebii owns what a move IS; Smogon's engine owns how an ability
        # treats it. Where the two flag tables disagree the difference is
        # recorded rather than silently resolved.
        for ours, theirs in (("contact", "makesContact"), ("sound", "isSound"),
                             ("punch", "isPunch"), ("biting", "isBite"),
                             ("slicing", "isSlicing"), ("bullet", "isBullet"),
                             ("wind", "isWind")):
            if S and bool(f.get(ours)) != bool(S.get(theirs)):
                conflicts.append((name, ours, bool(f.get(ours)),
                                  bool(S.get(theirs))))
        spread, hits_ally = targeting(m, S)
        if spread != (fold(m.get("target")) in _SERB_SPREAD):
            conflicts.append((name, "spread",
                              fold(m.get("target")) in _SERB_SPREAD, spread))
        out[name] = {
            # the name travels with the props so a rule can ask the status
            # table "does this move paralyse?"
            "name": name,
            "type": m.get("type"), "cat": m.get("category"),
            "bp": m.get("power") or 0, "pri": m.get("priority") or 0,
            # None where Serebii left the cell empty (Double Shock, Revival
            # Blessing); 101 is Champions' "cannot miss"
            "acc": m.get("accuracy"),
            "target": m.get("target"), "spread": spread,
            "hits_ally": hits_ally,
            "down_stats": down_stats(m),
            # Smogon's list, verified against ours move by move
            "sec": bool(S.get("secondaries")) if S else secondary(m),
            "sec_serebii": secondary(m),
            "self_up": su, "self_down": sd, "target_up": tu, "target_down": td,
            "contact": bool(f.get("contact")), "sound": bool(f.get("sound")),
            "punch": bool(f.get("punch")), "biting": bool(f.get("biting")),
            "slicing": bool(f.get("slicing")), "bullet": bool(f.get("bullet")),
            "wind": bool(f.get("wind")), "powder": bool(f.get("powder")),
            "multi": bool(S.get("multihit") and isinstance(S["multihit"], list)
                          and S["multihit"][0] != S["multihit"][1])
                     if S else bool(m.get("hits") and m["hits"][0] != m["hits"][1]),
            "recoil": bool(S.get("recoil")) if S else bool(RECOIL.search(body)),
            # three families Serebii writes in prose and Smogon's table, which
            # only carries what changes damage, does not have at all
            "flinch": bool(re.search(r"flinch", body, re.I)),
            "forces_switch": bool(re.search(
                r"target is forced to switch out", body, re.I)),
            "locks": bool(re.search(
                r"the (?:Taunted|Encore|Move Disabled|Unable to Repeat|"
                r"Healing Prevented) status", body)),
            "pulse_smogon": bool(S.get("isPulse")),
            # Mega Launcher's "Aura and Pulse moves" is a named family, not a
            # flag. Aura Wheel is Morpeko's move and is NOT one of them.
            "pulse": "Pulse" in name or name == "Aura Sphere",
            "heals": bool(S.get("drain")) if S else
                     bool(re.search(r"[Rr]estores? .*HP|[Dd]rain", body)),
        }
    derive.conflicts = conflicts
    return out


# A damaging move is the precondition for every power multiplier: no damage,
# nothing to multiply. This is the guard that was missing.
def dmg(m):
    return m["bp"] > 0 and m["cat"] != "Status"


def can_miss(m):
    """101 is Champions' "never misses"; None is a cell Serebii left empty."""
    return m["acc"] is not None and m["acc"] < 100


# Which move inflicts which status, derived by scripts/build_statuses.py from
# both descriptions. Loaded once; a rule asks `st(move, "Sleep")`.
_STATUS = None
STATUSES = ("Paralysis", "Burn", "Poison", "Badly Poisoned", "Freeze",
            "Sleep", "Confusion", "Flinch")


def st(m, status):
    global _STATUS
    if _STATUS is None:
        rows = (Q.db("statuses") or {}).get("statuses") or {}
        _STATUS = {k: set(v.get("moves") or []) for k, v in rows.items()}
    return m["name"] in _STATUS.get(status, ())


def foe(m):
    """Can this move be aimed at an opposing Pokemon?

    Armor Tail stops an opponent's priority move, never the user's own Protect,
    and Good as Gold blocks a foe's Taunt, not its own Swords Dance - so a
    "def" rule about incoming moves has to know which way a move points.
    """
    k = fold(m["target"])
    return (k in ("all", "selected target", "random target")
            or any(w in k for w in ("foe", "opponent", "enemy", "adjacent pok")))


# ------------------------------------------------------------------ rules ---
# side: "off" changes what this Pokemon's moves do; "def" changes what lands on
# it, and must never badge its own movepool.
RULES = {
 # ---- power multipliers on the user's own moves --------------------------
 "Sheer Force":   ("off", lambda m: dmg(m) and m["sec"], 1.3,
                   "+30% power, and the secondary is lost"),
 "Sharpness":     ("off", lambda m: dmg(m) and m["slicing"], 1.5, "slicing, +50%"),
 "Strong Jaw":    ("off", lambda m: dmg(m) and m["biting"], 1.5, "biting, +50%"),
 "Iron Fist":     ("off", lambda m: dmg(m) and m["punch"], 1.2, "punching, +20%"),
 "Tough Claws":   ("off", lambda m: dmg(m) and m["contact"], 1.3, "contact, +30%"),
 "Punk Rock":     ("off", lambda m: dmg(m) and m["sound"], 1.3, "sound, +30%"),
 "Mega Launcher": ("off", lambda m: dmg(m) and (m["pulse_smogon"] or m["pulse"]), 1.5,
                   "aura/pulse move, +50%"),
 "Technician":    ("off", lambda m: dmg(m) and m["bp"] <= 60, 1.5, "60 BP or less, +50%"),
 "Reckless":      ("off", lambda m: dmg(m) and m["recoil"], 1.2, "recoil move, +20%"),
 "Hustle":        ("off", lambda m: dmg(m) and m["cat"] == "Physical", 1.5,
                   "+50% physical damage, but accuracy drops to 80%"),
 "Analytic":      ("off", lambda m: dmg(m), 1.3, "+30% when moving last"),
 "Sniper":        ("off", lambda m: dmg(m), None, "a crit does 225%, not 150%"),
 "Parental Bond": ("off", lambda m: dmg(m), None, "hits twice, the second at 25%"),
 "Fire Mane":     ("off", lambda m: dmg(m) and m["type"] == "Fire", 1.5, "Fire, +50%"),
 "Steely Spirit": ("off", lambda m: dmg(m) and m["type"] == "Steel", 1.5, "Steel, +50%"),
 "Blaze":         ("off", lambda m: dmg(m) and m["type"] == "Fire", 1.5,
                   "+50% below 1/3 HP"),
 "Torrent":       ("off", lambda m: dmg(m) and m["type"] == "Water", 1.5,
                   "+50% below 1/3 HP"),
 "Overgrow":      ("off", lambda m: dmg(m) and m["type"] == "Grass", 1.5,
                   "+50% below 1/3 HP"),
 "Swarm":         ("off", lambda m: dmg(m) and m["type"] == "Bug", 1.5,
                   "+50% below 1/3 HP"),
 "Sand Force":    ("off", lambda m: dmg(m) and m["type"] in ("Ground", "Rock", "Steel"),
                   1.3, "+30% in a sandstorm"),
 "Water Bubble":  ("off", lambda m: dmg(m) and m["type"] == "Water", 2.0,
                   "Water doubled"),
 # ---- type conversion ----------------------------------------------------
 "Aerilate":      ("off", lambda m: dmg(m) and m["type"] == "Normal", 1.2,
                   "becomes Flying, +20%"),
 "Pixilate":      ("off", lambda m: dmg(m) and m["type"] == "Normal", 1.2,
                   "becomes Fairy, +20%"),
 "Refrigerate":   ("off", lambda m: dmg(m) and m["type"] == "Normal", 1.2,
                   "becomes Ice, +20%"),
 "Dragonize":     ("off", lambda m: dmg(m) and m["type"] == "Normal", 1.2,
                   "becomes Dragon, +20%"),
 # ---- not a multiplier, but it changes the move ---------------------------
 # a damaging move only - Rain Dance is Water and has no STAB to double
 "Adaptability":  ("off", lambda m: dmg(m), None,
                   "STAB x2.0 instead of x1.5, on a move of the user's own type"),
 "Skill Link":    ("off", lambda m: m["multi"], None,
                   "always 5 hits - accuracy is rolled once for the lot"),
 "Scrappy":       ("off", lambda m: dmg(m) and m["type"] in ("Normal", "Fighting"),
                   None, "ignores the Ghost immunity"),
 "Unseen Fist":   ("off", lambda m: dmg(m) and m["contact"], None,
                   "lands even through Protect"),
 "Contrary":      ("off", lambda m: m["self_up"] or m["self_down"], None, None),
 # ---- defensive: about what lands on it, never about its own moves --------
 "Bulletproof":   ("def", lambda m: m["bullet"], None, "immune to bullet moves"),
 "Soundproof":    ("def", lambda m: m["sound"], None, "immune to sound moves"),
 "Overcoat":      ("def", lambda m: m["powder"], None, "immune to powder moves"),
 "Filter":        ("def", None, None, "super-effective damage taken -25%"),
 "Solid Rock":    ("def", None, None, "super-effective damage taken -25%"),
 "Multiscale":    ("def", None, None, "damage taken halved at full HP"),
 "Aura Guard":    ("def", lambda m: m["contact"], None, "contact damage taken -50%"),
 "Thick Fat":     ("def", lambda m: m["type"] in ("Fire", "Ice"), None,
                   "Fire and Ice taken at 50%"),
 "Friend Guard":  ("def", None, None, "allies take 25% less"),
 "Defiant":       ("def", None, None,
                   "+2 Attack whenever one of ITS OWN stats is dropped"),
 "Competitive":   ("def", None, None,
                   "+2 Sp. Atk whenever one of ITS OWN stats is dropped"),
 "Mega Sol":      ("off", lambda m: dmg(m) and m["type"] in ("Fire", "Water"),
                   None, "the user's moves are treated as being in sun: Fire "
                   "boosted, Water weakened, and no rain penalty"),

 # ======================================================================
 # Everything below was added 2026-09-10, after the player found that an
 # ability with no rule reads in the app as an ability that does nothing -
 # Liquid Voice badged nothing on Primarina's Hyper Voice. Each one is
 # written from the ability's own text in data/db/abilities.json, never from
 # memory of the console games. Where Serebii states a number the number is
 # here; where it does not, the multiplier stays None, because `x` is printed
 # as "-> N BP with <ability>" and a stat change is not a base-power change.
 # ======================================================================

 # ---- the move goes off as a different type ------------------------------
 "Liquid Voice":  ("off", lambda m: m["sound"], None,
                   "sound move, so it lands as Water-type"),
 # ---- power that depends on something other than the move ----------------
 "Flash Fire":    ("off", lambda m: dmg(m) and m["type"] == "Fire", 1.5,
                   "+50% once a Fire move has hit it - which it is immune to"),
 "Electromorphosis": ("off", lambda m: dmg(m) and m["type"] == "Electric", None,
                   "charged by taking a hit: the next Electric move is boosted"),
 "Fairy Aura":    ("off", lambda m: dmg(m) and m["type"] == "Fairy", 1.33,
                   "+33% on every Fairy move in play, both sides"),
 "Stakeout":      ("off", dmg, 2.0,
                   "double damage on a Pokemon that just switched in"),
 "Supreme Overlord": ("off", dmg, None,
                   "+10% Attack and Sp. Atk for each ally already fainted"),
 "Rivalry":       ("off", dmg, None,
                   "+25% against the same gender, -25% against the opposite"),
 # a doubled Attack is a STAT, not a base power - hence no multiplier here
 "Huge Power":    ("off", lambda m: dmg(m) and m["cat"] == "Physical", None,
                   "Attack doubled - a stat, so the BP does not change"),
 "Pure Power":    ("off", lambda m: dmg(m) and m["cat"] == "Physical", None,
                   "Attack doubled - a stat, so the BP does not change"),
 "Guts":          ("off", lambda m: dmg(m) and m["cat"] == "Physical", None,
                   "Attack +50% while statused, and burn's own Attack drop is "
                   "ignored"),
 "Solar Power":   ("off", lambda m: dmg(m) and m["cat"] == "Special", None,
                   "Sp. Atk x1.5 in sun, at 1/8 max HP a turn"),
 "Plus":          ("off", lambda m: dmg(m) and m["cat"] == "Special", None,
                   "Sp. Atk +50% while an ally has Plus or Minus"),
 "Minus":         ("off", lambda m: dmg(m) and m["cat"] == "Special", None,
                   "Sp. Atk +50% while an ally has Plus or Minus"),
 # ---- accuracy and crits -------------------------------------------------
 "No Guard":      ("off", can_miss, None,
                   "cannot miss - and neither can anything aimed at it"),
 "Compoundeyes":  ("off", can_miss, None, "accuracy x1.3"),
 "Super Luck":    ("off", dmg, None, "+1 critical-hit stage"),
 "Merciless":     ("off", dmg, None,
                   "always a critical hit against a poisoned target"),
 "Stench":        ("off", dmg, None, "a chance to make the target flinch"),
 # ---- when the move goes off, and what it goes through -------------------
 "Prankster":     ("off", lambda m: m["cat"] == "Status", None,
                   "+1 priority - and it fails outright against a Dark-type"),
 "Gale Wings":    ("off", lambda m: m["type"] == "Flying", None,
                   "+1 priority at full HP - Tailwind and Roost included"),
 "Protean":       ("off", None, None,
                   "the user becomes this move's type before it goes off, "
                   "once per switch-in - so everything gets STAB"),
 "Libero":        ("off", None, None,
                   "the user becomes this move's type before it goes off, "
                   "once per switch-in - so everything gets STAB"),
 "Mold Breaker":  ("off", None, None, "ignores the target's ability"),
 "Stalwart":      ("off", None, None,
                   "ignores opposing abilities and redirection - Lightning "
                   "Rod and Follow Me do not pull it"),
 "Infiltrator":   ("off", None, None,
                   "goes through Substitute, Reflect, Light Screen and "
                   "Safeguard"),
 "Long Reach":    ("off", lambda m: m["contact"], None,
                   "no contact is made: Rough Skin, Static and Rocky Helmet "
                   "never fire"),
 "Piercing Drill": ("off", lambda m: m["contact"], None,
                   "hits through Protect, for a quarter of the damage"),
 "Poison Touch":  ("off", lambda m: dmg(m) and m["contact"], None,
                   "30% chance to poison on contact"),
 "Rock Head":     ("off", lambda m: m["recoil"], None,
                   "no recoil - the drawback is simply gone"),
 "Magician":      ("off", dmg, None, "it takes the target's held item"),
 "Stance Change": ("off", dmg, None,
                   "attacking flips it to Blade Forme first - 140 Attack, not "
                   "the Shield spread's 50"),

 # ---- defensive: about what lands on it, never about its own moves -------
 # a whole category or type taken differently
 "Fur Coat":      ("def", lambda m: m["cat"] == "Physical", None,
                   "physical damage halved"),
 "Marvel Scale":  ("def", lambda m: m["cat"] == "Physical", None,
                   "Defense x1.5 while statused"),
 "Heatproof":     ("def", lambda m: m["type"] == "Fire", None,
                   "Fire damage halved, and so is burn chip"),
 "Purifying Salt": ("def", lambda m: m["type"] == "Ghost", None,
                   "Ghost damage halved, and no status at all"),
 "Fluffy":        ("def", lambda m: m["contact"] or m["type"] == "Fire", None,
                   "contact halved - but Fire doubled, both at once on a "
                   "Fire contact move"),
 "Dry Skin":      ("def", lambda m: m["type"] in ("Water", "Fire"), None,
                   "Water heals it instead of hurting; Fire hurts more"),
 # immunities that give something back
 "Levitate":      ("def", lambda m: dmg(m) and m["type"] == "Ground", None,
                   "damaging Ground moves do nothing"),
 "Eelevate":      ("def", lambda m: dmg(m) and m["type"] == "Ground", None,
                   "it floats: damaging Ground moves do nothing"),
 "Water Absorb":  ("def", lambda m: m["type"] == "Water", None,
                   "no damage - it heals 25% instead"),
 "Volt Absorb":   ("def", lambda m: m["type"] == "Electric", None,
                   "no damage - it heals 25% instead"),
 "Earth Eater":   ("def", lambda m: m["type"] == "Ground", None,
                   "no damage - it heals 25% instead"),
 "Motor Drive":   ("def", lambda m: m["type"] == "Electric", None,
                   "no damage, and +1 Speed"),
 "Sap Sipper":    ("def", lambda m: m["type"] == "Grass", None,
                   "no damage, and +1 Attack"),
 "Lightning Rod": ("def", lambda m: m["type"] == "Electric", None,
                   "drawn to it, does no damage, and gives it +1 Sp. Atk"),
 "Justified":     ("def", lambda m: m["type"] == "Dark", None, "+1 Attack"),
 "Thermal Exchange": ("def", lambda m: m["type"] == "Fire", None,
                   "+1 Attack, and it cannot be burned"),
 "Rattled":       ("def", lambda m: m["type"] in ("Bug", "Ghost", "Dark"),
                   None, "+1 Speed"),
 "Liquid Ooze":   ("def", lambda m: m["heals"], None,
                   "the drain is reversed - the attacker loses that HP"),
 # status, priority and secondaries
 "Good as Gold":  ("def", lambda m: m["cat"] == "Status", None,
                   "a foe's status move does nothing to it"),
 "Magic Bounce":  ("def", lambda m: m["cat"] == "Status", None,
                   "bounced straight back at whoever used it"),
 "Armor Tail":    ("def", lambda m: m["pri"] > 0, None,
                   "an opponent cannot use it against this Pokemon or its ally"),
 "Queenly Majesty": ("def", lambda m: m["pri"] > 0, None,
                   "an opponent cannot use it against this Pokemon or its ally"),
 "Shield Dust":   ("def", lambda m: m["sec"], None,
                   "the secondary effect never happens"),
 "Cursed Body":   ("def", dmg, None,
                   "30% chance the move is disabled once it hits"),
 "Battle Armor":  ("def", None, None, "cannot be hit critically"),
 "Shell Armor":   ("def", None, None, "cannot be hit critically"),
 "Magic Guard":   ("def", None, None,
                   "only a direct attack hurts it - no hazards, weather, "
                   "burn, poison or Leech Seed"),
 "Telepathy":     ("def", lambda m: m["hits_ally"], None,
                   "an ALLY's spread move does nothing to it"),
 # stat drops arriving from the other side
 "Clear Body":    ("def", lambda m: m["down_stats"], None,
                   "the drop has no effect"),
 "White Smoke":   ("def", lambda m: m["down_stats"], None,
                   "the drop has no effect"),
 "Mirror Armor":  ("def", lambda m: m["down_stats"], None,
                   "the drop is bounced back at whoever used it"),
 "Hyper Cutter":  ("def", lambda m: "Attack" in m["down_stats"], None,
                   "its Attack cannot be lowered by a foe"),
 "Big Pecks":     ("def", lambda m: "Defense" in m["down_stats"], None,
                   "its Defense cannot be lowered"),
 "Keen Eye":      ("def", lambda m: "accuracy" in m["down_stats"], None,
                   "its accuracy cannot be lowered"),
 "Illuminate":    ("def", lambda m: "accuracy" in m["down_stats"], None,
                   "its accuracy cannot be lowered"),
 # contact punishers - the reason a physical attacker thinks twice
 "Rough Skin":    ("def", lambda m: m["contact"], None,
                   "1/8 of the attacker's max HP back at it"),
 "Aftermath":     ("def", lambda m: m["contact"], None,
                   "if this is the finishing hit, the attacker loses 1/4 of "
                   "its max HP"),
 "Static":        ("def", lambda m: m["contact"], None,
                   "30% chance the attacker is paralysed"),
 "Flame Body":    ("def", lambda m: m["contact"], None,
                   "30% chance the attacker is burned"),
 "Poison Point":  ("def", lambda m: m["contact"], None,
                   "30% chance the attacker is poisoned"),
 "Effect Spore":  ("def", lambda m: m["contact"], None,
                   "10% chance of paralysis, poison or sleep on the attacker"),
 "Cute Charm":    ("def", lambda m: m["contact"], None,
                   "30% chance the attacker is Attracted"),
 "Gooey":         ("def", lambda m: m["contact"], None,
                   "-1 Speed on the attacker"),
 "Mummy":         ("def", lambda m: m["contact"], None,
                   "the attacker's ability becomes Mummy"),
 "Wandering Spirit": ("def", lambda m: m["contact"], None,
                   "the two abilities are swapped"),
 "Pickpocket":    ("def", lambda m: m["contact"], None,
                   "it steals the attacker's item"),
 "Innards Out":   ("def", dmg, None,
                   "if this is the finishing hit, the attacker loses whatever "
                   "HP was left"),
 "Spicy Spray":   ("def", dmg, None, "the attacker is burned"),
 "Toxic Debris":  ("def", lambda m: dmg(m) and m["cat"] == "Physical", None,
                   "poison spikes are scattered on the attacker's side"),
 # flinching, forced switches and move-locking - three families Serebii spells
 # out in the move text and nowhere else
 "Inner Focus":   ("def", lambda m: m["flinch"], None,
                   "it does not flinch"),
 "Steadfast":     ("def", lambda m: m["flinch"], None,
                   "flinching gives it +1 Speed"),
 "Suction Cups":  ("def", lambda m: m["forces_switch"], None,
                   "it cannot be forced out"),
 "Guard Dog":     ("def", lambda m: m["forces_switch"], None,
                   "it cannot be forced out"),
 "Aroma Veil":    ("def", lambda m: m["locks"], None,
                   "it and its ally are protected from this"),
 "Grass Pelt":    ("def", lambda m: m["cat"] == "Physical", None,
                   "Defense x1.5 while Grassy Terrain is up"),
 "Pressure":      ("def", None, None, "costs the attacker 2 PP, not 1"),

 # ---- the status family, unblocked 2026-09-10 --------------------------
 # These sat in NO_RULE twice because nothing said which move causes which
 # status. data/db/statuses.json has that column now, derived from both
 # descriptions with the traps handled (Electric Terrain PREVENTS sleep,
 # Snore REQUIRES it), so the rules can finally be written.
 "Insomnia":      ("def", lambda m: st(m, "Sleep"), None, "it cannot be put to sleep"),
 "Vital Spirit":  ("def", lambda m: st(m, "Sleep"), None, "it cannot be put to sleep"),
 "Sweet Veil":    ("def", lambda m: st(m, "Sleep"), None,
                   "neither it nor its ally can be put to sleep"),
 "Limber":        ("def", lambda m: st(m, "Paralysis"), None,
                   "it cannot be paralysed"),
 "Immunity":      ("def", lambda m: st(m, "Poison") or st(m, "Badly Poisoned"),
                   None, "it cannot be poisoned"),
 "Magma Armor":   ("def", lambda m: st(m, "Freeze"), None, "it cannot be frozen"),
 "Own Tempo":     ("def", lambda m: st(m, "Confusion"), None,
                   "it cannot be confused"),
 "Leaf Guard":    ("def", lambda m: any(st(m, s) for s in STATUSES), None,
                   "in sun, no status lands on it at all"),
 "Flower Veil":   ("def", lambda m: any(st(m, s) for s in STATUSES), None,
                   "a Grass-type ally cannot be statused by this"),
 "Synchronize":   ("def", lambda m: st(m, "Poison") or st(m, "Paralysis")
                   or st(m, "Burn"), None,
                   "whatever this inflicts is passed straight back"),
 "Corrosion":     ("off", lambda m: st(m, "Poison") or st(m, "Badly Poisoned"),
                   None, "this poisons even a Steel or Poison type"),
}
CONTRARY_UP = "this BOOST becomes a drop - Contrary inverts it"
CONTRARY_DOWN = "this DROP becomes a boost - Contrary inverts it"

# Abilities that mention a move and still get NO rule, each with the reason -
# because "no rule" on its own reads as "this ability does nothing", which is
# what sent the player looking in the first place. Reviewed 2026-09-10.
NO_RULE = {
 "Sturdy": "changes no damage number, only whether the target ends at 1 HP - "
           "the same call CLAUDE.md makes for Focus Sash",
 "Disguise": "same: it eats one hit whole, it does not change what a move does",
 "Damp": "it stops a move used ANYWHERE on the field, including your own. "
         "There is no side for that here - `off` is your moves, `def` is what "
         "lands on you",
 "Anticipation": "tells you something, changes nothing",
 "Forewarn": "tells you something, changes nothing",
 "Illusion": "any damaging hit breaks it - no subset to name",
 "Emergency Exit": "any hit past 50% - no subset to name",
 "Quick Draw": "turn order, like Stall - not a property of any move",
 "Klutz": "about held items, not about moves",
 # the whole status-immunity family, and why it is not derivable today
 "Insomnia": "STATUS FAMILY - see the note below",
 "Vital Spirit": "STATUS FAMILY", "Sweet Veil": "STATUS FAMILY",
 "Immunity": "STATUS FAMILY", "Limber": "STATUS FAMILY",
 "Magma Armor": "STATUS FAMILY", "Own Tempo": "STATUS FAMILY",
 "Oblivious": "STATUS FAMILY", "Leaf Guard": "STATUS FAMILY",
 "Flower Veil": "STATUS FAMILY", "Corrosion": "STATUS FAMILY",
 "Synchronize": "STATUS FAMILY",
}
STATUS_FAMILY_NOTE = """
  The STATUS FAMILY (Insomnia, Limber, Immunity, Own Tempo, Corrosion...) is
  not here because which moves cause which status exists only in Serebii's
  prose - Smogon's table carries nothing but what changes damage. Every regex
  tried for "puts the target to sleep" also catches Electric Terrain, which
  PREVENTS sleep, and Snore, Rest and Sleep Talk, which require it. A wrong
  badge is worse than none, so it waits for a real status column."""


def incoming(p):
    """Could this move ever be aimed at the Pokemon holding the ability?

    A defensive rule listing Swords Dance and Tailwind is noise: nothing on the
    other side of the field can point them here. An ally's spread move can.
    """
    return foe(p) or p["hits_ally"]


def build(props):
    table, report = {}, {}
    for ab, (side, pred, mult, why) in RULES.items():
        if pred is None:
            table[ab] = {"side": side, "all": True, "x": mult, "why": why}
            report[ab] = None
            continue
        hits = sorted(n for n, p in props.items()
                      if pred(p) and (side != "def" or incoming(p)))
        entry = {"side": side, "x": mult, "why": why, "moves": hits}
        if ab == "Contrary":
            entry["why_up"], entry["why_down"] = CONTRARY_UP, CONTRARY_DOWN
            entry["up"] = sorted(n for n, p in props.items() if p["self_up"])
            entry["down"] = sorted(n for n, p in props.items() if p["self_down"])
        table[ab] = entry
        report[ab] = hits
    return table, report


# What KIND of ability this is, for the filter chips in the app's search. The
# first two buckets are not guessed - they are whether this file gave the
# ability a rule, and on which side. The rest are read off the ability text in
# priority order, first match wins, and `--audit` prints every bucket so the
# split can be checked rather than trusted.
CLASS_ORDER = [
    # terrain BEFORE weather, because "Terrain" contains "rain" and matched it
    ("terrain", r"\bterrain\b"),
    ("weather", r"\bweather\b|\brain(?:ing|y)?\b|\bsunshine\b|\bsunlight\b|"
                r"\bsunny\b|\bsandstorm\b|\bsnow(?:ing|storm)?\b|\bhail\b"),
    ("speed",   r"\bspeed\b[^.]{0,30}(?:doubl|rais|increas)|"
                r"(?:doubl|rais|increas)[^.]{0,30}\bspeed\b|"
                r"moving first|attacks last|speed priority bracket"),
    ("status",  r"\bburn|paraly|poison|asleep|\bsleep\b|frozen|freez|confus|"
                r"status condition|attract"),
    ("stats",   r"\battack\b|\bdefen[cs]e\b|sp\. ?atk|sp\. ?def|"
                r"special attack|special defense|\bstats?\b|evasion"),
    ("item",    r"berry|berries|\bitems?\b"),
    ("switch",  r"switch|enters? (?:the )?battle|sent (?:out )?into battle|"
                r"knocks out|copies the|transforms"),
]
# The text mentions a bucket's words in passing, so the regex files it wrong.
# Each of these was read and placed by hand; the audit prints every bucket, so
# a new one shows up rather than hiding.
CLASS_OVERRIDE = {
    # "damage through hazards, WEATHER or status will not break the disguise"
    "Disguise": "other",
    # "will not switch out if it drops below 50% due to Confusion, WEATHER..."
    "Emergency Exit": "other",
    # it is about the sprite it copies, not about the hit that breaks it
    "Illusion": "switch",
}
# NOTE: the two "moves-*" buckets are NOT re-derived here. They are exactly the
# RULES table above - the 129 abilities already classified, with the side each
# one was given. This only fills in the 86 that never had a rule, so nothing
# decided earlier moves because of a regex written later.


def classify(name, table, text):
    """One bucket per ability: what a player would filter on."""
    if name in CLASS_OVERRIDE:
        return CLASS_OVERRIDE[name]
    r = table.get(name)
    if r:
        return "moves-off" if r["side"] == "off" else "moves-def"
    t = clean(text)
    for tag, pat in CLASS_ORDER:
        if re.search(pat, t, re.I):
            return tag
    return "other"


CLASS_LABEL = {
    "moves-off": "changes its own moves",
    "moves-def": "changes what lands on it",
    "weather": "weather", "terrain": "terrain", "speed": "speed and turn order",
    "status": "status conditions", "stats": "stat changes",
    "item": "items and berries", "switch": "switching and copying",
    "other": "everything else",
}


def audit(props, table):
    """Every ability in the format, and what we decided about it."""
    abil = Q.db("abilities")
    KEY = re.compile(r"\bmoves?\b|\bpower\b|\bdamage\b|STAB|priority|contact|"
                     r"sound|punch|bit(?:e|ing)|slicing|bullet|pulse|powder|"
                     r"recoil|immune|absorb", re.I)
    covered, mentions, quiet, decided = [], [], [], []
    for a in abil:
        n, e = a["name"], clean(a.get("effect"))
        if n in table:
            covered.append(n)
        elif n in NO_RULE:
            decided.append((n, NO_RULE[n]))
        elif KEY.search(e):
            mentions.append((n, e))
        else:
            quiet.append(n)
    print("\n=== AUDIT of all %d abilities ===" % len(abil))
    print("  %3d have a move rule here" % len(covered))
    print("  %3d looked at and deliberately left out - reasons below"
          % len(decided))
    print("  %3d mention moves but have NO rule - listed below for review"
          % len(mentions))
    print("  %3d never touch a move (weather, stats on entry, status...)"
          % len(quiet))
    print("\n--- no rule ON PURPOSE ---")
    for n, why in sorted(decided):
        print("   %-18s %s" % (n, why))
    print(STATUS_FAMILY_NOTE)
    print("\n--- mention moves, no rule (these badge nothing) ---")
    for n, e in sorted(mentions):
        print("   %-20s %s" % (n, e[:88]))

    # the filter buckets the app's search offers, so a wrong one is visible
    buckets = {}
    for a in abil:
        buckets.setdefault(classify(a["name"], table, a.get("effect")),
                           []).append(a["name"])
    print("\n--- the filter buckets in the app ---")
    for tag, _ in [("moves-off", 0), ("moves-def", 0)] + CLASS_ORDER + \
                  [("other", 0)]:
        names = sorted(buckets.get(tag, []))
        print("   %-10s %3d  %s" % (tag, len(names), ", ".join(names[:9]) +
                                    (" ..." if len(names) > 9 else "")))
    missing = [n for n in table if n not in {a["name"] for a in abil}]
    if missing:
        print("\n  !! RULES FOR ABILITIES THAT DO NOT EXIST IN CHAMPIONS: %s"
              % ", ".join(missing))
    return missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--audit", action="store_true")
    a = ap.parse_args()

    props = derive(Q.db("moves"))
    table, report = build(props)

    print("%d useable moves classified" % len(props))
    print("  change the USER's stats  : %d up, %d down"
          % (sum(1 for p in props.values() if p["self_up"]),
             sum(1 for p in props.values() if p["self_down"])))
    print("  recoil moves: %d   |  aura/pulse: %d   |  multi-hit 2-5: %d"
          % (sum(1 for p in props.values() if p["recoil"]),
             sum(1 for p in props.values() if p["pulse"]),
             sum(1 for p in props.values() if p["multi"])))
    print()
    for ab in sorted(report):
        side = RULES[ab][0]
        hits = report[ab]
        n = "every move" if hits is None else "%d moves" % len(hits)
        print("  %-14s %-4s %-12s %s"
              % (ab, side, n, ", ".join((hits or [])[:4]) +
                 (" ..." if hits and len(hits) > 4 else "")))

    if a.audit:
        # A rule for an ability that does not exist ships a phantom entry, and
        # printing it was not enough: two survived a scroll today. It ends the
        # run now.
        if audit(props, table):
            sys.exit(1)

    if not a.report and not a.audit:
        with open(OUT, "w", encoding="utf-8") as f:
            classes = dict((a["name"], classify(a["name"], table,
                                                a.get("effect")))
                           for a in Q.db("abilities"))
            json.dump({"_comment":
                       "Derived by scripts/build_ability_moves.py from the move "
                       "and ability text. Do not hand-edit; re-run it instead.",
                       "moves": props, "abilities": table,
                       "classes": classes, "class_labels": CLASS_LABEL}, f,
                      ensure_ascii=False, indent=1)
        print("\nwrote %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
