# Answering with query.py

## Answer with the tool, not from the file dumps

`scripts/query.py` already joins the sources. Prefer it over reading JSON:

```bash
python scripts/query.py brief Ceruledge           # dossier: every source at once
python scripts/query.py moves --flag sound
python scripts/query.py moves --priority + --used
python scripts/query.py counter-priority
python scripts/query.py moves --flag bullet --learners
python scripts/query.py pokemon Garchomp          # includes Smogon's writeup
python scripts/query.py ability Bulletproof
python scripts/query.py usage --top 30
python scripts/query.py speed --min 100
python scripts/query.py worlds --usage --top 64
python scripts/query.py worlds --usage --division all   # the three divisions
python scripts/query.py owned
python scripts/query.py types Garchomp        # defensive profile
python scripts/query.py types "grass dragon"  # or a bare type combo
python scripts/query.py resist ice fairy --owned   # who covers a shared hole
python scripts/query.py nature Brave          # what a nature raises/lowers
python scripts/query.py move Taunt            # Serebii's text AND Smogon's
python scripts/damage.py --selftest
python scripts/damage.py "Mega Glalie" Explosion Kingambit --atk-sp 32 --nature adamant
```

**`query.py move` exists because reading one rules source is not enough.**
Serebii names a status without defining it ("gains the Sealing Off status") and
`data/db/smogon_basics.json` — a second local source, easy to forget — gives the
mechanic ("No foe can use any move known by the user") and durations Serebii
omits (Taunt: 3 turns). Missing that produced two wrong answers. The command
prints both, and Smogon's FULL description beside them - `dump-move`, the text
its dex page prints, stored in `data/db/smogon_text.json` (with every ability
and item beside it) and shipped to the app as the one description of each.

`resist` takes any number of attacking types and lists what takes them all at
x0.5 or better, flagging what is owned and what already has a build. It is the
tool for "my core dies to X and Y, what covers it".

The type chart and the 25 natures live in `data/db/typechart.json` and
`data/db/natures.json`, built by `scripts/build_typechart.py` from Smogon's
`dump-basics` and **cross-checked against Serebii's per-Pokemon Weakness tables
- 3402 matchups over 189 Pokemon, no disagreement**. Champions uses the
standard chart; that is now verified, not assumed.

The typical question is a chain — "what does ability X block → who learns those
moves → which of them are actually used → do I own any". `--learners` and the
`You` column are built for exactly that.
