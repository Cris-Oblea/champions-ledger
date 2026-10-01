"""Where the repo keeps things, for every script in scripts/.

Each script used to work out the repo root from its own __file__ - the same
line in 45 files - and then build data/raw, data/db and data/meta from it, so
moving a folder meant finding every copy. They import these instead. The root
is found from this file, never from the working directory, so a script runs
the same from the repo root, from scripts/, or from a CI checkout.

    data/raw   what the fetchers downloaded, as downloaded (not committed)
    data/db    the database build_db.py makes from it
    data/meta  everything else read off the sources - usage, tournaments,
               Smogon's analyses, speed tiers, the GTS findings
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
DB = os.path.join(ROOT, "data", "db")
META = os.path.join(ROOT, "data", "meta")

# The caches more than one script reads, so each is spelt once.
POKEBASE = os.path.join(RAW, "pokebase")        # fetch_pokebase.py's pages
SMOGON_CALC = os.path.join(RAW, "smogon_calc")  # Smogon's calculator source
POKEAPI_CSV = os.path.join(RAW, "pokeapi_csv")  # PokeAPI's tables, pinned
TOURNAMENTS = os.path.join(RAW, "tournaments")  # pokedata's responses
