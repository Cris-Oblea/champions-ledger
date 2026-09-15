#!/usr/bin/env python3
"""What each Pokemon actually runs on the ladder, per Pokemon.

    python scripts/fetch_pokebase_splits.py            # every Pokemon with usage
    python scripts/fetch_pokebase_splits.py --limit 5  # a sample, for checking
    python scripts/fetch_pokebase_splits.py --force    # ignore what is stored

The global tables answer "how much is Sucker Punch used" across the whole
ladder. This answers the question a build actually asks: of the people running
KINGAMBIT, what do THEY run - which moves, which item, which ability, which
nature, which SP spread, and beside whom.

    Moves      Sucker Punch 99.1%   Kowtow Cleave 97.6%
    Items      Chople Berry 37.6%   Black Glasses 24.6%
    Abilities  Defiant 94%          Supreme Overlord 5.9%
    Natures    Adamant 86.9%        Brave 10.4%
    Spreads    32 HP / 32 Atk / 2 SpD  13.8%

WHY POKEBASE AND NOT PIKALYTICS. Pikalytics has the same shape of data and is
stamped 2026-05 with its ladder code still on season 3 - the player's call
(2026-09-15): one month to update or it stops being a source. pokebase is the
live M-C ladder, which is the one being played.

THE RAW HTML IS NOT CACHED, and that is deliberate. Each page is 1.3 MB of
Next.js markup and there are 321 of them: 427 MB, more than twice the entire
existing raw cache, to keep bytes that are re-derivable and that nothing else
reads. Only the extract is stored, which is a few hundred KB.

IT RUNS WEEKLY, not nightly, for the same reason the Smogon analyses do: six
minutes and 427 MB of someone else's bandwidth for numbers that drift slowly.
refresh.py --deep pulls it.
"""
import argparse, io, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "data", "meta")
OUT = os.path.join(META, "usage_splits.json")
BASE = "https://pokebase.app/pokemon-champions/pokemon/"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")

# Where one section stops and the next begins. The page renders them in this
# order and the headings are the only reliable boundary - the markup between
# them changes with every Next.js build, the words do not.
HEADINGS = ["Stat Spreads", "Abilities", "Natures", "Items", "Moves",
            "Common Teammates", "Popular Pokemon", "Type effectiveness",
            "Available Moves"]


def flatten(html):
    """Tags to pipes. The numbers live between them, and walking tokens
    survives a markup change that any structural parse would not."""
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S)
    t = re.sub(r"<[^>]+>", "|", t)
    t = re.sub(r"\|+", "|", t)
    t = re.sub(r"[ \t\r\n]+", " ", t)
    return [x.strip() for x in t.split("|")]


def pairs_after(tokens, label, stop):
    """(name, percent) pairs between one heading and the next."""
    # EVERY occurrence, not the first. The page uses "Abilities" twice - once
    # for the dex block, which carries no percentages, and once for usage -
    # and taking the first returned an empty list for every Pokemon.
    best = []
    for i, tok0 in enumerate(tokens):
        if tok0 != label:
            continue
        out, k = [], i + 1
        while k < len(tokens) - 1:
            tok = tokens[k]
            if tok in stop:
                break
            nxt = tokens[k + 1]
            after = tokens[k + 2] if k + 2 < len(tokens) else ""
            if tok and re.fullmatch(r"\d+(?:\.\d+)?", nxt) and after == "%":
                out.append({"name": tok, "percent": float(nxt)})
                k += 3
                continue
            k += 1
        if len(out) > len(best):
            best = out
    return best


def spreads(html):
    """The SP spreads, from the aria-labels the page writes for a screen
    reader: "HP 32, ATK 32, Sp. Def 2, 13.8 percent". Those are meant to be
    read as words, so they are the most stable thing on the page."""
    keys = {"HP": "hp", "ATK": "atk", "DEF": "def", "SPA": "spa",
            "SP. ATK": "spa", "SPD": "spe", "SP. DEF": "spd"}
    out = []
    for lab in re.findall(r'aria-label="([^"]*?percent)"', html):
        if "," not in lab or not re.search(r"\b(HP|ATK|DEF|SPD|Sp\.)", lab):
            continue
        sp, pct = {}, None
        for part in lab.split(","):
            part = part.strip()
            m = re.fullmatch(r"([\d.]+) percent", part)
            if m:
                pct = float(m.group(1))
                continue
            m = re.fullmatch(r"([A-Za-z. ]+?) (\d+)", part)
            if m:
                k = keys.get(m.group(1).strip().upper())
                if k:
                    sp[k] = int(m.group(2))
        if sp and pct is not None:
            row = {"sp": sp, "percent": pct}
            if row not in out:
                out.append(row)
    return out


def natures(html):
    """Adamant 86.9%, not "+Atk / -Sp. Atk 86.9%".

    The token walk finds the percentage beside the nature's EFFECT, because
    that is what sits next to it in the markup, and the name is two elements
    away. The aria-label carries both in one string - "Adamant, +Atk / -Sp.
    Atk, 86.9 percent" - so it is read from there instead.
    """
    out = []
    for lab in re.findall(r'aria-label="([^"]*?percent)"', html):
        parts = [x.strip() for x in lab.split(",")]
        if len(parts) < 2:
            continue
        m = re.fullmatch(r"([\d.]+) percent", parts[-1])
        if not m or not re.fullmatch(r"[A-Z][a-z]+", parts[0]):
            continue
        row = {"name": parts[0], "effect": parts[1] if len(parts) > 2 else "",
               "percent": float(m.group(1))}
        if row not in out:
            out.append(row)
    return out


def teammates(tokens):
    """Ranked, not measured - the page gives an order and no number."""
    try:
        i = tokens.index("Common Teammates")
    except ValueError:
        return []
    out, k = [], i + 1
    while k < len(tokens) - 1 and len(out) < 8:
        if tokens[k] in HEADINGS:
            break
        if re.fullmatch(r"\d{1,2}", tokens[k]) and tokens[k + 1]:
            name = tokens[k + 1]
            if name not in HEADINGS and not re.fullmatch(r"[\d.%]+", name):
                out.append(name)
            k += 2
            continue
        k += 1
    return out


def parse(html):
    tokens = flatten(html)
    stop = set(HEADINGS)
    got = {
        "moves": pairs_after(tokens, "Moves", stop),
        "items": pairs_after(tokens, "Items", stop),
        # the dex lists abilities too, under the same word - the usage one is
        # the block that carries percentages, which is what pairs_after finds
        "abilities": pairs_after(tokens, "Abilities", stop),
        "natures": natures(html),
        "spreads": spreads(html),
        "teammates": teammates(tokens),
    }
    return got


def fetch(slug, timeout=60):
    req = urllib.request.Request(BASE + slug, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if attempt == 2:
                print("  FAILED %s -> %s" % (slug, e))
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    usage = json.load(io.open(os.path.join(META, "usage_pokemon.json"),
                              encoding="utf-8"))
    rows = usage.get("rows") or []
    if a.limit:
        rows = rows[:a.limit]

    have = {}
    if os.path.exists(OUT) and not a.force:
        try:
            have = (json.load(io.open(OUT, encoding="utf-8"))
                    .get("pokemon") or {})
        except (OSError, ValueError):
            have = {}

    out, n = dict(have), 0
    for r in rows:
        slug, name = r.get("slug"), r.get("name")
        if not slug or not name:
            continue
        if name in out and not a.force:
            continue
        html = fetch(slug)
        if not html:
            continue
        got = parse(html)
        if any(got.values()):
            out[name] = got
        n += 1
        if n % 25 == 0:
            print("  %d fetched" % n, flush=True)
        time.sleep(0.25)

    blob = {"source": "pokebase.app per-Pokemon pages",
            "note": ("What each Pokemon's own players run, from the live "
                     "ladder. The raw pages are not cached: 1.3 MB each and "
                     "321 of them."),
            "fetched": time.strftime("%Y-%m-%d"),
            "count": len(out), "pokemon": out}
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(blob, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print("wrote %s  (%d Pokemon, %d new)" % (OUT, len(out), n))
    return 0


if __name__ == "__main__":
    sys.exit(main())
