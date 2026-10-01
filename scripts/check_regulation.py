#!/usr/bin/env python3
"""Which regulation is live, and is the database still built for it?

    python scripts/check_regulation.py            # ask the sources, report
    python scripts/check_regulation.py --json     # the same, for a script
    python scripts/check_regulation.py --record   # write what is live as ours

WHY THIS EXISTS. A regulation is the one event that can quietly wreck the
database. `fetch_serebii.py` skips any page already cached, and the attackdex
is where forms and LEARNSETS come from - so a plain nightly run picks up the
new Pokedex pages and silently keeps every stale attackdex one, leaving the new
species with no movepool and no way to be found by `--learner`. The recipe for
doing it properly is `refresh.py --regulation`, which re-fetches every Serebii
page on top of the cache, and until this check a human had to know to type it.

Nothing about that was automatic, which meant "the database is always current"
was true on every day except the one day it mattered.

THE SIGNAL IS EXPLICIT AND MACHINE-READABLE. pokebase's dex page ships
`defaultLatestRegulationSetSlug":"m-c"` in its own page data - not scraped
prose, the value the site itself uses to decide what to show. That is what M-C
was confirmed with on 2026-09-12, and build_docs.py already prints the
regulation from it.

TWO SOURCES, BECAUSE THEY MOVE AT DIFFERENT TIMES. On M-C day Serebii was fully
updated while pokebase's usage was still empty; the reverse can happen just as
easily. Clearing Serebii's cache before Serebii has published the new
regulation would re-download several hundred pages to get the same data back,
so this asks Serebii too: its own Ranked Battle page lists the regulations it
knows about. Only when BOTH agree is the recipe worth running.

Exit codes, so a caller can branch without parsing prose:

    0   the database is built for the regulation that is live
    10  a new regulation, and Serebii has published it - run the recipe
    11  a new regulation, but Serebii has not caught up - wait, do not clear
    2   could not tell (no network, a page that changed shape)
"""
import argparse
import json
import os
import re
import sys

import net
from paths import ROOT

RECORD = os.path.join(ROOT, "data", "db", "regulation.json")
POKEBASE = "https://pokebase.app/pokemon-champions/pokemon"
SEREBII = "https://www.serebii.net/pokemonchampions/rankedbattle.shtml"


def get(url):
    return net.get(url, timeout=90).decode("utf-8", "replace")


def live_slug(html):
    """What pokebase says is the latest regulation set, e.g. "m-c".

    The quoting varies with how the page data is embedded - sometimes plain,
    sometimes backslash-escaped inside a JSON string - so the pattern allows
    either rather than assuming one.
    """
    m = re.search(r'defaultLatestRegulationSetSlug\\?"\s*:\s*\\?"([^"\\]{1,24})',
                  html)
    return m.group(1).strip().lower() if m else None


def serebii_regulations(html):
    """Every regulation Serebii's Ranked Battle page names, lower-cased.

    DELIBERATELY NOT "M-x". Champions is on its M series today and nothing says
    the next one is M-D rather than N-A, "Regulation 2" or something with no
    hyphen at all - the letters are Game Freak's to choose, and an automation
    that only recognises one shape stops working silently the day they change
    it. This takes a short token of letters, digits and hyphens after the word,
    and normalises it the way the pokebase slug is written.
    """
    return {m.strip().lower().replace(" ", "-")
            for m in re.findall(
                r"Regulation\s+([A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})?)",
                html)}


def recorded():
    try:
        return json.load(open(RECORD, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def record(slug, note=""):
    """Write what the database is built for.

    Deliberately a file in data/db/ rather than a note in prose: it sits beside
    the data it describes, it is committed with that data by the same nightly
    run, and a rebuild that fails the gate never commits either. Prose would
    have been a second copy of a fact, and this repo has been bitten by that
    more than once.
    """
    os.makedirs(os.path.dirname(RECORD), exist_ok=True)
    body = {"slug": slug, "label": slug.upper(),
            "source": "pokebase defaultLatestRegulationSetSlug", "note": note}
    with open(RECORD, "w", encoding="utf-8", newline="\n") as f:
        json.dump(body, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return body


def look():
    """(status, live slug, ours, what Serebii knows)."""
    try:
        live = live_slug(get(POKEBASE))
    except net.ERRORS as e:
        return "unknown", None, recorded().get("slug"), ("pokebase: %s" % e)
    if not live:
        return "unknown", None, recorded().get("slug"), "pokebase page changed shape"
    ours = recorded().get("slug")
    if ours == live:
        return "current", live, ours, ""
    try:
        known = serebii_regulations(get(SEREBII))
    except net.ERRORS as e:
        return "waiting", live, ours, ("serebii: %s" % e)
    # FAIL TOWARDS ACTING. If Serebii names no regulation at all - the page
    # changed shape, or they write it some way this does not recognise - that
    # is not evidence the regulation is missing, and treating it as "wait"
    # would disable the automation silently, which is the failure this whole
    # mechanism exists to prevent. The cost of being wrong the other way is one
    # unnecessary sweep.
    if not known:
        return "ready", live, ours, \
               "Serebii names no regulation this recognises - acting anyway"
    return ("ready" if live in known else "waiting"), live, ours, \
           "Serebii lists " + ", ".join(sorted(known))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--record", action="store_true",
                    help="write the live regulation as the one we are built for")
    a = ap.parse_args()

    status, live, ours, why = look()
    if a.record and live:
        record(live, why)
        status = "current"
        ours = live

    if a.json:
        print(json.dumps({"status": status, "live": live, "ours": ours,
                          "why": why}))
    else:
        if status == "current":
            print("regulation %s - the database is built for it"
                  % (live or "?").upper())
        elif status == "ready":
            print("NEW REGULATION: %s is live, the database is built for %s."
                  % (live.upper(), (ours or "nothing").upper()))
            print("  %s" % why)
            print("  run: python scripts/refresh.py --regulation")
        elif status == "waiting":
            print("NEW REGULATION: %s is live, the database is built for %s - "
                  "but Serebii has not published it yet."
                  % (live.upper(), (ours or "nothing").upper()))
            print("  %s" % why)
            print("  clearing its cache now would re-download the same pages, "
                  "so this waits.")
        else:
            print("could not tell which regulation is live: %s" % why)
    return {"current": 0, "ready": 10, "waiting": 11}.get(status, 2)


if __name__ == "__main__":
    sys.exit(main())
