#!/usr/bin/env python3
"""Emit tracker/data.js - the compact reference blob the phone tracker inlines.

Everything here is DERIVED from data/db/. Re-run it after build_db.py so the
tracker sees a new regulation's species, moves and stones.
"""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q

OUT = os.path.join(ROOT, "tracker", "data.js")



# Which flags an ability keys off. One letter each so the blob stays small.
_FLAG_LETTER = {"contact": "c", "sound": "s", "punch": "p", "biting": "b",
                "slicing": "l", "bullet": "u", "wind": "w", "powder": "d"}


def flag_str(m):
    f = m.get("flags") or {}
    return "".join(v for k, v in _FLAG_LETTER.items() if f.get(k))


def secondary(m):
    """Does the move carry a SECONDARY effect - the thing Sheer Force trades?

    moves.json puts the crit rate in effect_rate when there is no secondary, so
    "effect_rate > 0" marks Earthquake and Close Combat as having one. The
    honest test is whether it differs from the crit rate.
    """
    er = m.get("effect_rate")
    if er in (None, 0):
        return 0
    cr = (m.get("crit_rate") or "").rstrip("%")
    try:
        cr = float(cr)
    except ValueError:
        return 1
    return 0 if er == cr else 1


TEXTS = None


def movetext(m):
    """The effect line for one move: the best of the two sources.

    scripts/build_text_facts.py picks per move - Serebii where it states the
    numbers, pokebase where Serebii only names a status ("Gives the target the
    Bound status") and where Serebii has nothing at all.
    """
    global TEXTS
    if TEXTS is None:
        TEXTS = (Q.db("text_facts") or {}).get("moves") or {}
    picked = (TEXTS.get(m["name"]) or {}).get("text")
    t = picked or (m.get("effect") or "").strip() or (m.get("in_depth") or "").strip()
    return " ".join(t.replace("�", "'").split())[:300]


def main():
    mons = Q.db("pokemon")
    moves = Q.db("moves")
    items = Q.db("items")
    learn = Q.db("learnsets")
    nat = Q.db("natures")
    chart = Q.db("typechart")
    abil = Q.db("abilities")

    # --- moves: only the useable ones, indexed ---------------------------
    use = [m for m in moves if m.get("useable")]
    use.sort(key=lambda m: m["name"])
    midx = {m["name"]: i for i, m in enumerate(use)}
    # Physical / Special / Status must stay three distinct codes - taking the
    # first letter collapses Special and Status onto "S", which silently turns
    # every Protect into a special attack downstream
    CAT = {"Physical": "P", "Special": "S", "Status": "T"}
    # "All Adjacent Pokemon" really carries an accented e, so match on a
    # de-accented key rather than on the display string
    def fold(t):
        return "".join(c for c in unicodedata.normalize("NFKD", t)
                       if not unicodedata.combining(c))

    # How many Pokemon a move hits is NOT read off Serebii's target field here.
    # It spells one thing four ways and gets three moves outright wrong, so
    # build_ability_moves.py resolves it against Smogon's engine target column
    # and stores the answer per move. Reading the raw field cost Burning
    # Jealousy and Misty Explosion their spread modifier, and left Corrosive
    # Gas looking like a single-target move when it strips your own ally's
    # item too. Where the two disagree the LABEL is corrected as well, so the
    # move sheet does not print "Ally" under a single-target attack.
    props = (Q.db("ability_moves") or {}).get("moves") or {}
    LABEL = {(1, 1): "All Adjacent Pokémon", (1, 0): "All Adjacent Foes",
             (0, 0): "Selected Target"}
    SPREAD = {"all adjacent foes", "all adjacent opponents",
              "all adjacent pokemon", "all opponents"}
    MOVES = []
    for m in use:
        tgt = m.get("target") or ""
        k = fold(tgt).lower()
        p = props.get(m["name"]) or {}
        spread = 1 if p.get("spread", k in SPREAD) else 0
        ally = 1 if p.get("hits_ally", k == "all adjacent pokemon") else 0
        if spread != (k in SPREAD) or ally != (k == "all adjacent pokemon"):
            tgt = LABEL[(spread, ally)]
        # and the other Serebii slip: a move that DEALS DAMAGE cannot be aimed
        # at your own side. Psyshield Bash reads "Ally" and Mountain Gale
        # reads "Self"; both are ordinary single-target attacks, which is what
        # Smogon's table says by having no target override for either.
        elif (k == "self" or "ally" in k) and CAT.get(m.get("category")) != "T" \
                and (m.get("power") or 0) > 0:
            tgt = "Selected Target"
        MOVES.append([m["name"], m["type"], CAT.get(m.get("category"), "T"),
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
                      flag_str(m), secondary(m),
                      # what the move DOES. It was not in the blob at all, so
                      # the app could show every number about a move and not
                      # one word about its effect - and "which of these burns"
                      # had no answer on the phone. Serebii's short line,
                      # falling back to the long one.
                      movetext(m)])

    # --- learnsets as index lists ---------------------------------------
    LEARN = {}
    for sp, lst in learn.items():
        ids = sorted(midx[n] for n in lst if n in midx)
        if ids:
            LEARN[sp] = ids

    # --- which FORM a Mega actually belongs to ----------------------------
    # Our dex files every Mega under the bare species, so an alternate form
    # inherited its base form's Megas: the app was offering Mega Raichu X to
    # Raichu-Alola and Mega Slowbro to Slowbro-Galar, neither of which can
    # hold the stone. Smogon's roster states the relation - each Mega carries
    # `baseSpecies` - so it settles this the way the damage engine settles
    # arithmetic. Floette is the case that proves it is not just "the base
    # form": Floette-Mega's baseSpecies is Floette-ETERNAL.
    MEGA_OWNER = {}
    try:
        sroster = json.load(open(os.path.join(
            ROOT, "data", "raw", "smogon_calc", "raw_species.json"),
            encoding="utf-8"))
    except Exception:
        sroster = {}
    smog_base = {}
    for k, v in sroster.items():
        if isinstance(v, dict) and v.get("baseSpecies") and "Mega" in k:
            smog_base[k] = v["baseSpecies"]
    import damage as _Dm
    for p in mons:
        if not p.get("is_mega"):
            continue
        owner = p.get("species") or p["name"]
        try:
            sname = _Dm.smogon_name(p["name"])
        except Exception:
            sname = None
        base = smog_base.get(sname or "")
        # Smogon carries a Mega per GENDER form where one exists -
        # Meowstic-F-Mega and Meowstic-M-Mega - while our dex has a single
        # "Mega Meowstic" row. Reading only baseSpecies ("Meowstic") would
        # leave the female with no Mega at all, which is worse than the bug
        # being fixed here, so a gendered Mega is attached to the gendered
        # form as well.
        for sk, sb in smog_base.items():
            if not sname or sb != (p.get("species") or ""):
                continue
            if "-F-Mega" in sk or "-M-Mega" in sk:
                want = (p.get("species") or "") + ("-Female" if "-F-Mega" in sk
                                                   else "")
                if any(q["name"] == want for q in mons):
                    MEGA_OWNER.setdefault(want, [])
                    if p["name"] not in MEGA_OWNER[want]:
                        MEGA_OWNER[want].append(p["name"])
        if base:
            # map Smogon's spelling back onto ours
            hit = next((q["name"] for q in mons
                        if not q.get("is_mega") and Q.norm(q["name"]) == Q.norm(base)),
                       None)
            if hit:
                owner = hit
        if p["name"] not in MEGA_OWNER.setdefault(owner, []):
            MEGA_OWNER[owner].append(p["name"])
    moved = [(o, ms) for o, ms in MEGA_OWNER.items()
             if any(o != (next((q.get("species") for q in mons
                                if q["name"] == m), None)) for m in ms)]
    if moved:
        print("  Megas re-attached to the form that actually holds the stone:")
        for o, ms in moved:
            print("     %-18s %s" % (o, ", ".join(ms)))

    # --- forms whose pool is filed under another name ---------------------
    # Four of the 340 find nothing by their own name OR their species:
    # Floette and Mega Floette (the pool is under "Floette-Eternal") and the
    # two gender forms, whose movepool CLAUDE.md records as inherited from the
    # base species. The app is a plain key lookup, so the resolving happens
    # here, where norm() and the alias table already live.
    LEARN_ALIAS = {}
    for p in mons:
        n, sp = p["name"], p.get("species") or p["name"]
        if n in LEARN or sp in LEARN:
            continue
        hit = next((k for k in LEARN if Q.norm(k) == Q.norm(n)), None)
        if not hit:
            base = re.sub(r"^Mega ", "", n).split("-")[0]
            hit = next((k for k in LEARN if Q.norm(k) == Q.norm(base)), None)
        if not hit:
            # the pool is filed under a SUFFIXED name and the dex row is not:
            # Champions' Floette is the Eternal Flower one, so the dex says
            # "Floette" and the attackdex says "Floette-Eternal"
            hit = next((k for k in LEARN if k.split("-")[0] == base), None)
        if hit:
            LEARN_ALIAS[n] = hit
        else:
            print("  !! no movepool anywhere for %s" % n)

    # --- what a Pokemon becomes mid-battle --------------------------------
    # The dex row is the form it STARTS in, and for two of these that is the
    # form it never attacks in: the sheet was printing Aegislash at 50 Attack
    # when Stance Change flips it to 140 the moment it uses a damaging move,
    # and Palafin at 70 when Zero to Hero makes it 160. Castform's three
    # weather forms change the TYPE instead, which is its whole defensive
    # profile and its STAB. The data has carried all of this in `battle_forms`
    # for a while; nothing shipped it to the app, so the app has been showing
    # the misleading half. Only what actually CHANGES is sent.
    BFORMS = {}
    for p in mons:
        bf = p.get("battle_forms") or {}
        if not bf:
            continue
        base, out = p["base_stats"], {}
        for label, v in bf.items():
            e = {}
            if v.get("types") and v["types"] != p["types"]:
                e["t"] = v["types"]
            st = [v[k] for k in ("hp", "atk", "def", "spa", "spd", "spe")]
            if st != [base[k] for k in ("hp", "atk", "def", "spa", "spd", "spe")]:
                e["b"] = st
            if e:
                out[label] = e
        if out:
            # the ability that does it - each of these has exactly one, and
            # naming it is the difference between a number and an explanation
            BFORMS[p["name"]] = {"by": (p.get("abilities") or [None])[0],
                                 "f": out}

    # --- dex -------------------------------------------------------------
    DEX = []
    for p in mons:
        b = p["base_stats"]
        # the National Dex number, so the box can be read in the same order
        # Pokemon HOME shows it - which is how you check one against the other
        DEX.append([p["name"], p.get("species") or p["name"], p["types"],
                    [b["hp"], b["atk"], b["def"], b["spa"], b["spd"], b["spe"]],
                    1 if p.get("is_mega") else 0, p.get("abilities") or [],
                    p.get("dex") or 0])
    # ...and the National Dex number for everything HOME can hold, which is
    # far more than the Champions dex: Melmetal and Oricorio are already in the
    # box without one.
    DEXNO = (Q.db("dex_numbers") or {}).get("numbers", {})
    # How hard each species is to pull off the GTS: demand measured from
    # ladder usage, supply declared in data/meta/go_sourcing.json. Only the
    # fields the phone needs, to keep the blob small.
    _gd = (Q.meta("gts_difficulty") or {}).get("species") or {}
    # [score, demand, supply, rank, how, usage, ladder_size]. demand and rank
    # are null for a species with no row on the M-B ladder - absent, not zero.
    GTSDIFF = {k: [v["score"], v["demand"], v["supply"], v.get("rank"),
                   v.get("how") or "", v.get("usage"), v.get("ladder_size")]
               for k, v in _gd.items()}

    # --- stones: 1:1 with the megas --------------------------------------
    STONES = []
    for p in mons:
        if not p.get("is_mega"):
            continue
        st = Q.stone_for(p)
        STONES.append([st or "", p["name"], p.get("species") or ""])
    STONES.sort(key=lambda r: r[1])

    # --- items, in the four groups the game itself uses -------------------
    # Name, VP price, category, what it does, where it comes from. The effect
    # text was missing before, so the app listed item NAMES with no way to
    # know what any of them did, and the price was only in the shop.
    # the price is the MERGED one - Serebii first, pokebase filling the 20 it
    # prints as "??? VP" - with a note for the items that have no price at all
    # because they are rewards. scripts/build_item_prices.py does the merge and
    # reports any disagreement; there are none today.
    PRICES = (Q.db("item_facts") or {}).get("prices") or {}
    LINKS = Q.db("item_links") or {}
    ITEMS = []
    for i in items:
        if i.get("is_mega_stone"):
            continue
        pr = PRICES.get(i["name"]) or {}
        ITEMS.append([i["name"], pr.get("vp") or i.get("price_vp"),
                      i.get("category") or "Miscellaneous",
                      " ".join((i.get("effect") or "").replace("�", "'").split()),
                      pr.get("note") or i.get("source") or "",
                      pr.get("source") or "",
                      # what this item serves: the sentence, the abilities it
                      # works with, and the moves when there are few enough to
                      # name. Heat Rock -> Sunny Day AND Drought.
                      (LINKS.get("items", {}).get(i["name"]) or {}).get("why") or "",
                      (LINKS.get("items", {}).get(i["name"]) or {}).get("abilities") or [],
                      ((LINKS.get("items", {}).get(i["name"]) or {}).get("moves") or [])
                      if len((LINKS.get("items", {}).get(i["name"]) or {}).get("moves") or []) <= 6 else []])
    ITEMS.sort()

    NAT = {k: [v.get("raises"), v.get("lowers"), v.get("summary")]
           for k, v in nat.items()}

    # same merge for abilities: pokebase wins the nine where it states a
    # number Serebii leaves out (Guard Dog's +1 stage, Sand Veil's 25%)
    ATEXT = (Q.db("text_facts") or {}).get("abilities") or {}
    ABIL = {}
    for a in (abil if isinstance(abil, list) else abil.values()):
        pick = (ATEXT.get(a["name"]) or {}).get("text") or a.get("effect") or ""
        ABIL[a["name"]] = " ".join(pick.replace("�", "'").split())[:400]

    # Heavy Slam, Heat Crash, Low Kick and Grass Knot take their base power
    # from weight, which moves.json stores as 1. Only the forms in the
    # Champions dex are carried; the rest of pokebase's table is dead weight.
    wt = (Q.db("weights") or {}).get("weights", {})
    names = {p["name"] for p in mons} | {p.get("species") for p in mons}
    WEIGHT = {k: v for k, v in wt.items() if k in names}
    # a handful of names differ between the weight table and our dex
    for p in mons:
        if p["name"] not in WEIGHT:
            alt = p["name"].replace("Mega ", "") + "-Mega" if p.get("is_mega") else None
            if alt and alt in wt:
                WEIGHT[p["name"]] = wt[alt]

    # These two take their type from the USER'S FORM, not the move row
    FORM_TYPED = {
        "Raging Bull": {"Tauros-Paldea Combat": "Fighting",
                        "Tauros-Paldea Blaze": "Fire",
                        "Tauros-Paldea Aqua": "Water"},
        "Aura Wheel": {"Morpeko": "Electric", "Morpeko-Hangry": "Dark"},
    }

    # Which ability touches which move, derived from Serebii's move text and
    # cross-checked against Smogon's engine by
    # scripts/build_ability_moves.py. Stored as move-index lists so the blob
    # stays small and the page never has to re-derive anything.
    am = Q.db("ability_moves") or {}
    AB_MOVES = {}
    for ab, rule in (am.get("abilities") or {}).items():
        e = {"side": rule.get("side"), "x": rule.get("x"),
             "why": rule.get("why")}
        # `scope` means the rule covers a whole category and therefore picks
        # out nothing - the app states it once on the ability instead of
        # badging every row with it. The move list is then dead weight on the
        # phone (Guts alone was shipping 213 indices the page never reads), so
        # it is dropped here rather than in data/db/ability_moves.json, where
        # "which moves does Guts cover" is still a fair question to ask.
        if rule.get("scope"):
            e["scope"] = rule["scope"]
            AB_MOVES[ab] = e
            continue
        if rule.get("all"):
            e["all"] = 1
        else:
            e["m"] = sorted(midx[n] for n in (rule.get("moves") or [])
                            if n in midx)
        if ab == "Contrary":
            e["up"] = sorted(midx[n] for n in (rule.get("up") or []) if n in midx)
            e["down"] = sorted(midx[n] for n in (rule.get("down") or [])
                               if n in midx)
            e["why_up"] = rule.get("why_up")
            e["why_down"] = rule.get("why_down")
        AB_MOVES[ab] = e

    # The HOME box can hold Pokemon Champions does not allow - Melmetal and
    # Oricorio are already in it - so its picker cannot be the Champions dex.
    # pokebase's species table is the widest list on hand; anything in it that
    # the Champions dex has never heard of is offered as HOME-only, and the
    # picker also takes a typed name, because no list here is guaranteed
    # complete and HOME is the player's own record.
    # Matched with norm(), never by exact spelling. pokebase writes Indeedee-F
    # where our dex writes Indeedee-Female, and lists Squawkabilly's three
    # extra plumages separately - so an exact-name filter offered all of them
    # as "HOME only, not in the Champions dex" when they ARE in it, under the
    # canonical name. The player found both.
    champ_names = {p["name"] for p in mons} | {p.get("species") for p in mons}
    champ_keys = {Q.norm(n) for n in champ_names if n}
    HOME_ONLY = sorted(n for n in wt
                       if Q.norm(n) not in champ_keys
                       and "-Mega" not in n and "-Gmax" not in n
                       and "-Totem" not in n and "-Starter" not in n)

    # The spellings that DO collapse onto a dex row: Squawkabilly's plumages,
    # Tauros' Paldean breeds written with hyphens, Indeedee-F. Shipped so the
    # app can say "this is the same Pokemon" instead of the player meeting the
    # question twice - these forms change no stat, no move and no ability, so
    # the dex carries one entry on purpose.
    COSMETIC = {}
    canon = {}
    for p in mons:
        canon.setdefault(Q.norm(p["name"]), p["name"])
    for n in wt:
        k = Q.norm(n)
        if k not in canon or n == canon[k]:
            continue
        # a Mega written the other way round ("Abomasnow-Mega") is a spelling,
        # not a form that changes nothing - a Mega changes everything. Only
        # the variants that really are cosmetic belong in this note.
        if "mega" in k.split():
            continue
        COSMETIC.setdefault(canon[k], []).append(n)
    for k in COSMETIC:
        COSMETIC[k] = sorted(set(COSMETIC[k]))

    # Any spelling the rest of the project treats as the same Pokemon has to
    # find that Pokemon's movepool here too, or the page answers "no moves" to
    # a name every other source uses. norm() already knows them; only the page
    # did not, because LEARN_ALIAS was built over dex rows alone and these are
    # by definition not dex rows. "Floette" is the live case: Champions has
    # only the Eternal Flower form, so the dex row is "Floette-Eternal" while
    # pokebase, Pikalytics and every teamlist write the bare name.
    for n in wt:
        if n in LEARN or n in LEARN_ALIAS:
            continue
        hit = canon.get(Q.norm(n))
        if not hit:
            continue
        tgt = hit if hit in LEARN else LEARN_ALIAS.get(hit)
        if tgt:
            LEARN_ALIAS[n] = tgt

    # Multipliers measured against Smogon's engine, plus the two named move
    # families the flag table cannot express.
    # The engine works in 4096ths, so a measured 1.31 is really 5325/4096 and a
    # measured 0.51 is really 2048/4096. Carrying the rounded reading instead
    # costs a point or two per roll, which is exactly the margin a survival
    # benchmark turns on - so each measurement is snapped to the fraction it is
    # clearly reporting, and anything that does not snap cleanly is kept as-is.
    FRACS = [2048, 2732, 3072, 4096, 4505, 4915, 5325, 6144, 8192]

    def snap(v):
        best = min(FRACS, key=lambda f: abs(f / 4096.0 - v))
        return best / 4096.0 if abs(best / 4096.0 - v) <= 0.02 else v

    MODS = {}
    for k, v in (Q.db("modifiers") or {}).items():
        if k.startswith("_"):
            continue
        MODS[k] = {n: (0 if x == 0 else snap(x)) for n, x in v.items()}
    # Adaptability is applied through the STAB multiplier, exactly, so it must
    # not also come through here - that would square it.
    MODS.get("atk_ability", {}).pop("Adaptability", None)
    amv = (Q.db("ability_moves") or {}).get("moves") or {}
    RECOIL = sorted(n for n, p in amv.items() if p.get("recoil"))
    PULSE = sorted(n for n, p in amv.items()
                   if p.get("pulse") or p.get("pulse_smogon"))

    # Our spelling -> the one Smogon's engine answers to. norm() does the work
    # (Mega Glalie <-> Glalie-Mega) and it lives in Python with 44 locked test
    # cases, so the mapping is precomputed here rather than ported to JS.
    # Aegislash is the one form that depends on which side it is on: it attacks
    # as Blade and is hit as Shield.
    import damage as Dm
    roster = json.load(open(os.path.join(
        ROOT, "data", "raw", "smogon_calc", "raw_species.json"),
        encoding="utf-8"))
    SMOGON_NAME, missing = {}, []
    for p_ in mons:
        n = p_["name"]
        try:
            SMOGON_NAME[n] = Dm.smogon_name(n)
        except SystemExit:
            missing.append(n)
    AEGIS = {"attacking": "Aegislash-Blade", "defending": "Aegislash-Shield"}
    if missing:
        print("  %d forms have no name in Smogon's roster: %s"
              % (len(missing), ", ".join(missing[:6])))

    # What this data IS, so the app can state its own vintage instead of the
    # player typing it. The stored `regulation` field said M-B three days into
    # M-C, which is the whole reason it stopped being a field.
    # pokebase ships the regulation list and marks the current one; asking it
    # is better than hardcoding, because the next regulation moves this on its
    # own. The ladder numbers are that regulation's, since fetch_pokebase.py
    # requests no regulation and therefore gets the default - which is the one
    # pokebase calls `defaultLatestRegulationSetSlug`.
    REG, REG_STARTED = None, None
    try:
        raw = open(os.path.join(ROOT, "data", "raw", "pokebase", "pokemon.html"),
                   encoding="utf-8", errors="replace").read()
        cur = re.search(r'defaultLatestRegulationSetSlug\\?":\\?"([a-z\-]+)', raw)
        if cur:
            slug = cur.group(1)
            REG = slug.upper()
            st = re.search(r'\\?"value\\?":\\?"%s\\?",\\?"label\\?":\\?"[^"\\]+\\?",'
                           r'\\?"id\\?":\\?"[^"\\]+\\?",\\?"startDate\\?":\\?"(\d{4}-\d\d-\d\d)'
                           % re.escape(slug), raw)
            if st:
                REG_STARTED = st.group(1)
    except Exception:
        pass
    USAGE_AT = ((Q.meta("usage_pokemon") or {}).get("fetched"))

    # Trimmed to what a screen needs: the quantified sentence, the engine's
    # multipliers, and the numbers found in the text. The probe's raw stage
    # dumps stay in data/db/effects.json for anyone checking the working.
    EFFECTS = {}
    for name, v in ((Q.db("effects") or {}).get("effects") or {}).items():
        x = [[f["when"], f["multiplier"]] for f in v.get("effects") or []
             if f.get("multiplier")]
        t = [[n["as_written"], n["kind"], n["phrase"]]
             for n in v.get("text_numbers") or []]
        if not (x or t or v.get("described")):
            continue
        EFFECTS[name] = {"kind": v.get("kind"), "desc": v.get("described"),
                         "x": x, "t": t}

    # EVERY WORLDS, AS HISTORY. A Worlds is played once under one regulation
    # and then frozen, so this is what the field brought that August and never
    # what is current - the app labels it that way. It rides on the dex rather
    # than getting an asset of its own because it changes once a YEAR and is
    # 9 KB: a separate file would cost a second request forever to save nine
    # kilobytes a night.
    #
    # The three divisions stay apart. They are three metagames off one roster
    # and pooling them is wrong - Incineroar is 41% of Masters teams and 26%
    # of the kids' - so the app tabs between them instead of averaging.
    # --- WHO STOOD ON THE PODIUM, AND WITH WHAT ------------------------
    # The top 8 of every World Championship, per division, with the actual
    # set each Pokemon carried: item, ability, nature and four moves. This is
    # the one thing in the project that is a RESULT rather than a rate - not
    # "how often is this brought" but "this exact set won".
    #
    # IT IS FILED UNDER THE FORM THAT WAS REGISTERED, which is always the
    # BASE one. Measured rather than assumed: of the 16,875 team slots pokedata
    # publishes, exactly ZERO are written as "Mega something". Takuma Yamazaki
    # won 2026 with "Floette [Eternal Flower] @ Floettite", and Floette is the
    # entrant.
    #
    # This was the other way round for an afternoon - the medal went to Mega
    # Floette - and the player corrected it: "creo que deberia ser al reves, la
    # base tener la medalla y por consiguiente por el item se sabe que es
    # mega". He is right twice over. Filing it under the Mega invents an
    # entrant that was never on the sheet, and it makes a search for Floette
    # come back empty about the team that won with one.
    #
    # NOTHING IS LOST, because the stone is right there in the set, and the
    # stone settles it: stone_for() is 1:1 over all 81 Megas, so the Mega and
    # the single ability it gains are both derivable. They are derived HERE
    # rather than left to the reader - "esa se sabe por descarte" is true and
    # is exactly the kind of deduction a database should do for you.
    #
    # And the recorded ability is the BASE one, which is correct and must never
    # be called mislabelled: it is what the Pokemon has until it evolves, and
    # WHEN to evolve is a real decision because that ability is doing something
    # until then.
    #
    # Placement comes from the players list's own `rank`, which is the final
    # standing - NOT a swiss round number. See the note in CLAUDE.md: pokedata
    # numbers the top cut straight on from the last swiss round.
    MEGA_OF_STONE, MEGA_ABIL = {}, {}
    for st, mega, _sp in STONES:
        if st:
            MEGA_OF_STONE[Q.norm(st)] = mega
    for m in mons:
        if m.get("is_mega"):
            MEGA_ABIL[m["name"]] = ", ".join(m.get("abilities") or [])
    # ONE EVENT PER (YEAR, DIVISION). 2023 is the case that forces this:
    # pokedata put that year's Masters teamlists on the Day 1 event and its
    # Seniors and Juniors on the Day 2 one, so both events carry rows for the
    # same championship and reading them straight gave Seniors and Juniors two
    # podiums each. The one with more players is the complete list.
    best_src = {}
    for ev in (Q.meta("worlds_archive") or {}).get("events") or []:
        for div, info in (ev.get("divisions") or {}).items():
            if not info.get("teamlists"):
                continue
            key = (ev["year"], div)
            n = info.get("players") or info.get("teams") or 0
            if n > (best_src.get(key) or (0, None))[0]:
                best_src[key] = (n, ev["tid"])

    PODIUM = {}
    seen_events = []
    for (year, div), (_n, tid) in sorted(best_src.items()):
            t = Q.meta("tournament_%s_%s" % (tid, div))
            if not t:
                continue
            n = 0
            for pl in t.get("players") or []:
                rank = pl.get("rank")
                if not rank or rank > 8:
                    continue
                n += 1
                for slot in pl.get("team") or []:
                    raw = slot.get("pokemon") or ""
                    form = canon.get(Q.norm(raw))
                    if not form:
                        continue
                    row = {
                        "y": year, "d": div, "r": rank,
                        "who": pl.get("player") or "",
                        "rec": pl.get("record") or "",
                        "it": slot.get("item") or "",
                        "ab": slot.get("ability") or "",
                        "na": slot.get("nature") or "",
                        "mv": slot.get("moves") or [],
                    }
                    # the stone says it Mega Evolved, and says into what
                    mega = MEGA_OF_STONE.get(Q.norm(slot.get("item") or ""))
                    if mega:
                        row["mg"] = mega
                        if MEGA_ABIL.get(mega):
                            row["mgab"] = MEGA_ABIL[mega]
                    PODIUM.setdefault(form, []).append(row)
            if n:
                seen_events.append("%s %s %d" % (year, div, n))
    for v in PODIUM.values():
        v.sort(key=lambda r: (-r["y"], r["d"] != "masters", r["r"]))
    print("  worlds podium: %d forms over %s"
          % (len(PODIUM), ", ".join(seen_events)))

    WORLDS = []
    for y in (Q.meta("worlds_archive") or {}).get("years") or []:
        divs = {}
        for dname, d in (y.get("divisions") or {}).items():
            if not d.get("teamlists") or not d.get("top"):
                continue
            divs[dname] = {"n": d.get("teams") or 0,
                           "top": [[t["name"], t["teams"], t["pct"]]
                                   for t in d["top"]]}
        if divs:
            WORLDS.append({"y": y.get("year"), "d": divs})
    WORLDS.sort(key=lambda r: -(r["y"] or 0))

    blob = {"DEX": DEX, "HOME_ONLY": HOME_ONLY, "MODS": MODS,
            "WORLDS": WORLDS, "PODIUM": PODIUM,
            "DEXNO": DEXNO, "BFORMS": BFORMS,
            "REG": REG, "REG_STARTED": REG_STARTED, "USAGE_AT": USAGE_AT,
            "SMOGON_NAME": SMOGON_NAME, "AEGIS": AEGIS,
            "RECOIL": RECOIL, "PULSE": PULSE,
            "MOVES": MOVES, "LEARN": LEARN, "STONES": STONES,
            "ITEMS": ITEMS, "NATURES": NAT, "CHART": chart, "ABIL": ABIL,
            "WEIGHT": WEIGHT, "FORM_TYPED": FORM_TYPED, "AB_MOVES": AB_MOVES,
            # what KIND of ability each one is, for the search filters. The two
            # "moves-*" buckets are the RULES table itself, not a re-reading of
            # the text, so the classification already made cannot drift.
            # which item serves a given move or ability - only the specific
            # ones. Life Orb rides on all 334 attacks and would badge every
            # row with noise, so anything covering more than 8 moves is left
            # out of the reverse index.
            "ITEM_FOR_MOVE": {k: [i for i in v
                                  if len(LINKS["items"][i]["moves"]) <= 8]
                              for k, v in (LINKS.get("by_move") or {}).items()
                              if any(len(LINKS["items"][i]["moves"]) <= 8
                                     for i in v)},
            "ITEM_FOR_ABILITY": LINKS.get("by_ability") or {},
            # the status conditions, with Champions' own rebalance: paralysis
            # is 12.5% here, not 25%, and nothing in the app said so
            "LEARN_ALIAS": LEARN_ALIAS,
            "COSMETIC": COSMETIC,
            "MEGA_OWNER": MEGA_OWNER,
            "STATUSES": (Q.db("statuses") or {}).get("statuses") or {},
            "GTSDIFF": GTSDIFF,
            "AB_CLASS": am.get("classes") or {},
            "AB_CLASS_LABEL": am.get("class_labels") or {},
            # WHAT A THING ACTUALLY DOES, AS A NUMBER. Serebii's item text is
            # qualitative for 197 of the 199 - "slowly but steadily restores
            # the holder's HP" is what Leftovers said on the phone, with the
            # 1/16 nowhere in sight. data/db/effects.json carries the exact
            # multipliers read out of the engine's own modifier stages and the
            # numbers Smogon writes down, each with the sentence it came from.
            # 48 KB trimmed, which is what it costs to stop guessing.
            "EFFECTS": EFFECTS}

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// GENERATED by scripts/build_tracker_data.py - do not edit\n")
        f.write("window.CHAMP = ")
        json.dump(blob, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print("wrote %s  (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))
    print("  %d forms, %d moves, %d learnsets, %d stones, %d items, "
          "%d abilities, %d weights, %d ability rules, %d HOME-only"
          % (len(DEX), len(MOVES), len(LEARN), len(STONES), len(ITEMS),
             len(ABIL), len(WEIGHT), len(AB_MOVES), len(HOME_ONLY)))


if __name__ == "__main__":
    main()
