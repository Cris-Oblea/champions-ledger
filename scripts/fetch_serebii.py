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
import hashlib, os, re, sys, time, threading, queue

from serebii_text import read

BASE = "https://www.serebii.net"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")

STATIC_PAGES = [
    "pokemon", "moves", "updatedattacks", "items", "training", "rankedbattle",
    "newabilities", "megaabilities", "statusconditions", "transferonly",
    "giftpokemon", "battlepass", "recruit", "patch", "onlinecompetitions",
]

try:
    import urllib.request as _u
except ImportError:
    sys.exit("python3 required")


# What a forced sweep actually changed. A regulation is a PATCH - M-B added
# species, moves, abilities and items and removed nothing; M-C added more and
# took two moves off Archaludon - so the interesting output of a re-fetch is
# not "1148 pages downloaded" but "these 37 pages are different". The old bytes
# are compared before being overwritten, which is only possible because a
# forced fetch no longer deletes the cache first.
CHANGED = []


def get(url, dest, force=False):
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
    req = _u.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with _u.urlopen(req, timeout=45) as r:
                body = r.read()
            if len(body) < 2000:
                raise ValueError("respuesta demasiado corta")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            # Written only once the body is in hand, so a failed sweep leaves
            # the previous page in place rather than a hole. Deleting the cache
            # up front - which is what --regulation used to do - meant a
            # Serebii outage halfway through left the database with no
            # movepools and nothing to fall back on.
            with open(dest, "wb") as f:
                f.write(body)
            if before is not None and \
                    hashlib.sha256(body).hexdigest() != before:
                CHANGED.append(os.path.basename(dest))
            return True, False
        except Exception as e:
            if attempt == 2:
                print("  FAILED %s -> %s" % (url, e))
                return False, False
            time.sleep(1.5 * (attempt + 1))
    return False, False


def fetch_many(items, workers=5, pause=0.12, force=False):
    """items: list of (url, dest). Fetches with modest concurrency."""
    q = queue.Queue()
    for it in items:
        q.put(it)
    stats = {"ok": 0, "cached": 0, "fail": 0}
    lock = threading.Lock()
    total = len(items)

    def worker():
        while True:
            try:
                url, dest = q.get_nowait()
            except queue.Empty:
                return
            ok, cached = get(url, dest, force=force)
            with lock:
                if not ok:
                    stats["fail"] += 1
                elif cached:
                    stats["cached"] += 1
                else:
                    stats["ok"] += 1
                done = stats["ok"] + stats["cached"] + stats["fail"]
                if done % 25 == 0 or done == total:
                    print("  %d/%d (new=%d cached=%d failed=%d)"
                          % (done, total, stats["ok"], stats["cached"], stats["fail"]), flush=True)
            if not cached:
                time.sleep(pause)
            q.task_done()

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return stats


# Set from the command line. A regulation sweep re-fetches every page ON TOP
# of the cache instead of deleting it first; an ordinary run still skips
# whatever is already there, because Serebii's pages are rules and rules only
# move on a regulation.
FORCE = False


def cmd_list():
    print("[1/4] Available Pokemon list")
    get(BASE + "/pokemonchampions/pokemon.shtml",
        os.path.join(RAW, "pages", "pokemon.html"), force=True)


def cmd_pages():
    print("[2/4] Rules and mechanics pages")
    items = [(BASE + "/pokemonchampions/%s.shtml" % p,
              os.path.join(RAW, "pages", "%s.html" % p)) for p in STATIC_PAGES]
    fetch_many(items, force=FORCE, workers=3)


def slugs_from_list():
    p = os.path.join(RAW, "pages", "pokemon.html")
    if not os.path.exists(p):
        cmd_list()
    s = read(p)
    return sorted(set(re.findall(r'/pokedex-champions/([a-z0-9\-\'\.]+)/', s)))


def cmd_pokedex():
    slugs = slugs_from_list()
    print("[3/4] Pokemon pages: %d" % len(slugs))
    items = [(BASE + "/pokedex-champions/%s/" % s,
              os.path.join(RAW, "pokedex", "%s.html" % s)) for s in slugs]
    fetch_many(items, force=FORCE)


def move_slugs():
    p = os.path.join(RAW, "pages", "attackdex_index.html")
    get(BASE + "/attackdex-champions/", p, force=FORCE)
    s = read(p)
    found = set(re.findall(r'/attackdex-champions/([a-z0-9\-\'\.]+)\.shtml', s))
    # type/category index pages are not moves
    skip = {"normal", "fire", "water", "electric", "grass", "ice", "fighting",
            "poison", "ground", "flying", "psychict", "bug", "rock", "ghost",
            "dragon", "dark", "steel", "fairy", "physical", "special", "other",
            "status"}
    return sorted(found - skip)


def cmd_attackdex():
    slugs = move_slugs()
    print("[4/4] Move pages: %d" % len(slugs))
    items = [(BASE + "/attackdex-champions/%s.shtml" % s,
              os.path.join(RAW, "attackdex", "%s.html" % s)) for s in slugs]
    fetch_many(items, force=FORCE)


if __name__ == "__main__":
    argv = [a for a in sys.argv[1:] if a != "--force"]
    FORCE = "--force" in sys.argv
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
