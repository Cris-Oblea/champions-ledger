#!/usr/bin/env python3
"""The status conditions, with the numbers Champions actually uses.

    python scripts/build_statuses.py

The fourth thing in this game that carries text and decides battles, after
moves, abilities and items - and the only one that was never in the database.

Serebii has a Champions page for it, and it is a REBALANCE table: it lists only
what Champions changed, old value beside new one. Three things changed, and one
of them matters every game:

    Paralysis  25%   -> 12.5% chance of losing the turn   (Speed still 50%)
    Freeze     20%   -> 25% thaw chance, and only on a turn it tries to move
    Sleep      2-4 turns -> 33.3% to wake on turn 2, 100% on turn 3

Everything else on that page is absent, which is the page saying those are
unchanged. So the rest is filled from the two sources that can be checked
rather than recited:

  * `data/db/modifiers.json` - MEASURED against Smogon's Champions engine by
    scripts/measure_modifiers.py. Burn halving a physical attack is a measured
    x0.5 here, not a remembered one.
  * the move and ability text already merged into data/db/text_facts.json,
    which states rates like "30% chance of poisoning the target".

Anything that is neither measured nor stated by a Champions source is left with
`champions_confirmed: false` and the main-series value in `main_series`, so the
app can show it as what it is - a number from another game, waiting for the
player to confirm it in this one. Nothing here is invented.
"""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import query as Q

PAGE = os.path.join(ROOT, "data", "raw", "pages", "statusconditions.html")
OUT = os.path.join(ROOT, "data", "db", "statuses.json")


def txt(s):
    return " ".join(re.sub(r"<[^>]+>", " ", s).replace("&nbsp;", " ")
                    .replace("�", "'").split())


def serebii_changes():
    """(condition -> {prior, new}) from Serebii's Champions rebalance table."""
    if not os.path.exists(PAGE):
        return {}
    h = io.open(PAGE, encoding="cp1252", errors="replace").read()
    out = {}
    for r in re.findall(r"<tr.*?</tr>", h, re.S):
        cells = [txt(c) for c in re.findall(r"<t[dh].*?</t[dh]>", r, re.S)]
        if len(cells) == 3 and cells[0] and cells[0] != "Condition":
            out[cells[0]] = {"prior": cells[1], "new": cells[2]}
    return out


# What each status does, with where each number comes from. `measured` reads
# from modifiers.json; `serebii` is filled from the rebalance table above;
# `main_series` is the value from the other games, kept only where no Champions
# source states one, and never presented as confirmed.
BASE = {
    "Paralysis": {
        "short": "loses the turn sometimes, and moves at half Speed",
        "speed": {"value": 0.5, "source": "serebii"},
        "skip_turn": {"value": 0.125, "source": "serebii",
                      "was": 0.25, "note": "halved from the main series"},
    },
    "Freeze": {
        "short": "cannot move until it thaws",
        "thaw": {"value": 0.25, "source": "serebii", "was": 0.20,
                 "note": "rolled only on a turn it tries to move"},
    },
    "Sleep": {
        "short": "cannot move; wakes on a fixed schedule now",
        "wake_turn2": {"value": 0.333, "source": "serebii"},
        "wake_turn3": {"value": 1.0, "source": "serebii",
                       "note": "replaces the main series' 2-4 turn roll"},
    },
    "Burn": {
        "short": "physical attacks halved, and chip damage every turn",
        "physical": {"value": 0.5, "source": "measured"},
        "chip": {"value": 1.0 / 16, "source": "main_series"},
    },
    "Poison": {
        "short": "chip damage every turn",
        "chip": {"value": 1.0 / 8, "source": "main_series"},
    },
    "Badly Poisoned": {
        "short": "chip damage that grows every turn",
        "chip": {"value": 1.0 / 16, "source": "main_series",
                 "note": "1/16 the first turn, then 2/16, 3/16..."},
    },
    "Confusion": {
        "short": "may hit itself instead of acting",
        "self_hit": {"value": 0.333, "source": "main_series",
                     "note": "40 BP typeless attack on itself"},
    },
    "Flinch": {
        "short": "loses the turn, but only if the flincher moved first",
        "skip_turn": {"value": 1.0, "source": "main_series"},
    },
}


# ------------------------------------------------- which move causes what ---
# The column this project has gone without twice: the ability audit had to
# leave Insomnia, Limber, Immunity and the rest unruled because nothing said
# which move puts a Pokemon to sleep, and the item links had to leave the
# status berries alone for the same reason.
#
# It is derivable now because build_text_facts.py holds BOTH descriptions, and
# between them the wording is regular. The traps, all real:
#
#   Electric Terrain PREVENTS sleep          -> the COND guard drops it
#   Snore and Sleep Talk REQUIRE it          -> "only if the user is asleep"
#   Venoshock says "poisonous liquid"        -> "poison(s|ed|ing)", never
#                                               "poisonous"
#   Ice Shard "flash-freezes chunks of ice"  -> the status word has to sit
#                                               beside the TARGET, not beside
#                                               the user's flavour
WORD = {
    "Paralysis": r"paraly[sz](?:e|es|ed|ing)\b",
    "Burn": r"burn(?:s|ed|ing)?\b",
    "Poison": r"(?<!badly )poison(?:s|ed|ing)\b",
    "Badly Poisoned": r"badly poison(?:s|ed|ing)?\b",
    "Freeze": r"frozen\b|freez(?:e|es|ing)\b",
    "Sleep": r"asleep\b|to sleep\b|drowsiness\b",
    "Confusion": r"confus(?:e|es|ed|ing|ion)\b",
    "Flinch": r"flinch(?:es|ing)?\b",
}
TARGET = r"the targets?|targets\b|opposing Pok\w+|all other Pok\w+|the foe"
NOT_A_CAUSE = re.compile(
    r"doubled if|if the target is|if the target has|when the target is|"
    r"only if|while asleep|user is asleep|prevent|cannot|protect|cures?|"
    r"heals?|thaw|wake|immune|restore", re.I)


def causes(text, word):
    for s in re.split(r"(?<=[.]) ", text):
        if NOT_A_CAUSE.search(s):
            continue
        for m in re.finditer(word, s, re.I):
            a, b = m.span()
            if re.search(TARGET, s[max(0, a - 40):b + 25], re.I):
                return True
    return False


def status_moves():
    """status -> the useable moves that inflict it."""
    tf = (Q.db("text_facts") or {}).get("moves") or {}
    out = {}
    for st, word in WORD.items():
        hits = []
        for m in Q.db("moves"):
            if not m.get("useable"):
                continue
            r = tf.get(m["name"]) or {}
            t = " | ".join(x for x in (r.get("serebii"), r.get("pokebase")) if x)
            if not t:
                t = " ".join((m.get("effect") or "").split())
            if causes(t, word):
                hits.append(m["name"])
        out[st] = sorted(hits)
    return out


def main():
    changes = serebii_changes()
    mods = Q.db("modifiers") or {}
    burn = (mods.get("status") or {}).get("Burn|physical")
    if burn:
        BASE["Burn"]["physical"]["value"] = round(burn, 3)

    caused = status_moves()
    out = {}
    for name, body in BASE.items():
        row = dict(body)
        row["moves"] = caused.get(name, [])
        row["rebalanced_in_champions"] = name in changes
        if name in changes:
            row["serebii_prior"] = changes[name]["prior"]
            row["serebii_new"] = changes[name]["new"]
        srcs = {v["source"] for k, v in body.items() if isinstance(v, dict)}
        row["champions_confirmed"] = "main_series" not in srcs
        out[name] = row

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"_comment":
                   "Status conditions with their numbers. `source` per value: "
                   "serebii = Champions' own rebalance page, measured = run "
                   "through Smogon's Champions engine, main_series = the other "
                   "games' value, kept only where no Champions source states "
                   "one and never shown as confirmed.",
                   "statuses": out}, f, ensure_ascii=False, indent=1)

    print("%d statuses" % len(out))
    for n, r in out.items():
        bits = []
        for k, v in r.items():
            if isinstance(v, dict) and "value" in v:
                bits.append("%s=%s (%s)" % (k, round(v["value"], 3), v["source"]))
        print("  %-16s %-9s %-44s %d moves cause it" % (n,
              "REBALANCED" if r["rebalanced_in_champions"] else "unchanged",
              ", ".join(bits), len(r["moves"])))
    unconfirmed = [n for n, r in out.items() if not r["champions_confirmed"]]
    print("\n  %d carry a value no Champions source states, so they are marked "
          "unconfirmed\n  and show the main-series number until the player "
          "checks it in game:\n     %s" % (len(unconfirmed), ", ".join(unconfirmed)))
    print("\nwrote %s" % OUT)


if __name__ == "__main__":
    main()
