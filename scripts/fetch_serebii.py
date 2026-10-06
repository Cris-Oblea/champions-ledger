"""Download and cache the Pokemon Champions pages from Serebii.

Single source: the serebii.net sections /pokedex-champions/,
/attackdex-champions/ and /pokemonchampions/. No data from any other Pokemon
game is mixed in.

Usage:
    python scripts/fetch_serebii.py list      # the available-Pokemon list
    python scripts/fetch_serebii.py pages     # rules / items / mechanics pages
    python scripts/fetch_serebii.py pokedex   # one page per Pokemon
    python scripts/fetch_serebii.py attackdex # one page per move
    python scripts/fetch_serebii.py all
"""
import hashlib
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import net
from paths import RAW
from serebii_text import read

BASE = "https://www.serebii.net"

STATIC_PAGES = [
    "pokemon", "moves", "updatedattacks", "items", "training", "rankedbattle",
    "newabilities", "megaabilities", "statusconditions", "transferonly",
    "giftpokemon", "battlepass", "recruit", "patch", "onlinecompetitions",
]

# What a forced sweep actually changed. A regulation is a PATCH - M-B added
# species, moves, abilities and items and removed nothing; M-C added more and
# took two moves off Archaludon - so the interesting output of a re-fetch is
# not "1148 pages downloaded" but "these 37 pages are different". The old bytes
# are compared before being overwritten, which is only possible because a
# forced fetch no longer deletes the cache first.
CHANGED: list[str] = []


def get(url: str, dest: str, force: bool = False) -> tuple[bool, bool]:
    """Fetch url into dest unless already cached. Returns (ok, was_cached)."""
    if os.path.exists(dest) and os.path.getsize(dest) > 2000 and not force:
        return True, True
    before = None
    if force and os.path.exists(dest):
        try:
            with open(dest, "rb") as f:
                before = hashlib.sha256(f.read()).hexdigest()
        except OSError:
            before = None
    try:
        body = net.get(url, timeout=45, min_size=2000)
    except net.ERRORS as e:
        print("  FAILED %s -> %s" % (url, e))
        return False, False
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    # Written only once the body is in hand, so a failed sweep leaves the
    # previous page in place rather than a hole. Deleting the cache up front -
    # which is what --regulation used to do - meant a Serebii outage halfway
    # through left the database with no movepools and nothing to fall back on.
    with open(dest, "wb") as f:
        f.write(body)
    if before is not None and hashlib.sha256(body).hexdigest() != before:
        CHANGED.append(os.path.basename(dest))
    return True, False


def fetch_many(items: list[tuple[str, str]], workers: int = 5,
               force: bool = False) -> None:
    """items: list of (url, dest). Fetches with modest concurrency; a worker
    that went to the network waits 0.12 s before its next page, so the
    pool never hammers Serebii. Progress is counted here, in one thread."""
    def one(item: tuple[str, str]) -> tuple[bool, bool]:
        """Fetch one page, pausing a moment after a real download."""
        ok, cached = get(*item, force=force)
        if not cached:
            time.sleep(0.12)
        return ok, cached

    stats = {"ok": 0, "cached": 0, "fail": 0}
    with ThreadPoolExecutor(workers) as pool:
        futures = [pool.submit(one, it) for it in items]
        for done, f in enumerate(as_completed(futures), 1):
            ok, cached = f.result()
            stats["fail" if not ok else "cached" if cached else "ok"] += 1
            if done % 25 == 0 or done == len(items):
                print("  %d/%d (new=%d cached=%d failed=%d)"
                      % (done, len(items), stats["ok"], stats["cached"],
                         stats["fail"]), flush=True)


# Set from the command line. A regulation sweep re-fetches every page ON TOP
# of the cache instead of deleting it first; an ordinary run still skips
# whatever is already there, because Serebii's pages are rules and rules only
# move on a regulation.
FORCE = "--force" in sys.argv


def cmd_list() -> None:
    """Step 1: the list of Pokemon available in Champions (always re-fetched).
    """
    print("[1/4] Available Pokemon list")
    get(BASE + "/pokemonchampions/pokemon.shtml",
        os.path.join(RAW, "pages", "pokemon.html"), force=True)


def cmd_pages() -> None:
    """Step 2: the rules and mechanics pages."""
    print("[2/4] Rules and mechanics pages")
    items = [(BASE + "/pokemonchampions/%s.shtml" % p,
              os.path.join(RAW, "pages", "%s.html" % p)) for p in STATIC_PAGES]
    fetch_many(items, force=FORCE, workers=3)


def slugs_from_list() -> list[str]:
    """Every Pokemon page the list links to."""
    p = os.path.join(RAW, "pages", "pokemon.html")
    if not os.path.exists(p):
        cmd_list()
    s = read(p)
    return sorted(set(re.findall(r'/pokedex-champions/([a-z0-9\-\'\.]+)/', s)))


def cmd_pokedex() -> None:
    """Step 3: one page per Pokemon."""
    slugs = slugs_from_list()
    print("[3/4] Pokemon pages: %d" % len(slugs))
    items = [(BASE + "/pokedex-champions/%s/" % s,
              os.path.join(RAW, "pokedex", "%s.html" % s)) for s in slugs]
    fetch_many(items, force=FORCE)


def move_slugs() -> list[str]:
    """Every move page the attackdex index links to, minus the index pages for
    types and categories.
    """
    p = os.path.join(RAW, "pages", "attackdex_index.html")
    get(BASE + "/attackdex-champions/", p, force=FORCE)
    s = read(p)
    found = set(re.findall(r'/attackdex-champions/([a-z0-9\-\'\.]+)\.shtml', s))
    # type/category index pages are not moves. "psychic" is deliberately NOT
    # here: psychic.shtml is the MOVE Psychic.
    skip = {"normal", "fire", "water", "electric", "grass", "ice", "fighting",
            "poison", "ground", "flying", "bug", "rock", "ghost",
            "dragon", "dark", "steel", "fairy", "physical", "special", "other",
            "status"}
    return sorted(found - skip)


def cmd_attackdex() -> None:
    """Step 4: one page per move."""
    slugs = move_slugs()
    print("[4/4] Move pages: %d" % len(slugs))
    items = [(BASE + "/attackdex-champions/%s.shtml" % s,
              os.path.join(RAW, "attackdex", "%s.html" % s)) for s in slugs]
    fetch_many(items, force=FORCE)


if __name__ == "__main__":
    argv = [a for a in sys.argv[1:] if a != "--force"]
    what = argv[0] if argv else "all"
    t0 = time.time()
    if what in ("list", "all"):
        cmd_list()
    if what in ("pages", "all"):
        cmd_pages()
    if what in ("pokedex", "all"):
        cmd_pokedex()
    if what in ("attackdex", "all"):
        cmd_attackdex()
    print("Done in %.1f s" % (time.time() - t0))
    # THE PATCH NOTE. On an ordinary run nothing is forced, so this is empty.
    # On a regulation sweep it is the answer to "what did this regulation
    # actually touch" - which pages came back different - and it is only
    # knowable because the old bytes were still there to compare against.
    if FORCE:
        if CHANGED:
            print("%d page(s) changed:" % len(CHANGED))
            for n in sorted(CHANGED)[:40]:
                print("   " + n)
            if len(CHANGED) > 40:
                print("   ... and %d more" % (len(CHANGED) - 40))
        else:
            print("no page came back different - nothing upstream moved")
