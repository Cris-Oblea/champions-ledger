# Gallade's Imprison as the enabler for Mega Glalie's Explosion

**The player's idea, 2026-09-08.** Verified against the database rather than
accepted; the core claim is exactly right and the coverage is large.

## The claim, checked

**Gallade is the ONLY Pokemon in Champions that learns Imprison + Protect +
Wide Guard — 1 of 308 forms.** Confirmed against `data/db/learnsets.json`.

Imprison matters because of what it actually does. Serebii only says "the user
gains the Sealing Off status"; `smogon_basics` gives the mechanic:

> **No foe can use any move known by the user.**

So Gallade carrying Protect and Wide Guard means **no opponent can use Protect or
Wide Guard** — the two moves that blank Explosion. The moves must really be in
Gallade's set for the seal to apply, which forces three of its four slots:
**Imprison / Protect / Wide Guard / free**.

## How much of the field it actually closes

Measured over the 394 Worlds Masters teams that list a full moveset:

| | Teams | Share |
|---|---|---|
| Only protection is Protect and/or Wide Guard — **fully sealed** | **288** | **73.1%** |
| Carry something Gallade cannot seal | 106 | 26.9% |
| No protective move at all | 0 | 0.0% |

**Every single team has something.** The plan takes the field from "essentially
nobody can be Exploded" to "**73% cannot stop it**."

What leaks, and it is one move above all:

| Move | Teams | Share |
|---|---|---|
| **Detect** | 86 | **21.8%** |
| Baneful Bunker | 32 | 8.1% |
| Spiky Shield | 8 | 2.0% |
| King's Shield | 1 | 0.3% |

**Gallade does not learn Detect**, so this hole cannot be closed by adding it to
the set — the fourth slot is free but Detect is not an option. It learns
Protect, Wide Guard and Quick Guard, and that is the whole protective list.

**Damp turns out to be a non-issue.** It has 3 carriers in the format and the
most used, Bellibolt, sits at 0.4% ladder. The old worry that lumped "Wide Guard,
Detect or Damp" together was overweighting Damp badly; the real problem was
always Detect.

## Two things that follow

- **This job does not need Mega Gallade.** Imprison, Protect and Wide Guard are
  all base-form moves, so **Galladite (2000 VP) is not required** — which leaves
  the team's Mega slot free for Glalie, and Glalitite is already owned. Mega
  Gallade trades Sharpness for Inner Focus and gains Atk 125→165, Spe 80→110;
  none of that serves this role.
- **The setup cost went UP, not down.** Imprison only holds while Gallade is on
  the field, so the line needs Gallade alive *and* Glalie alive on the same turn,
  after Glalie has Mega Evolved. That is the objection recorded in CLAUDE.md
  against this plan in the first place — "two turns setting up a one-shot nuke" —
  and adding a second required body makes it heavier, not lighter.

## Status

**Not a re-proposal.** CLAUDE.md records that the player built and tested Mega
Glalie Explosion on 2026-08-31 and dismissed it as "un chiste", and that verdict
stands on its own evidence. What is new is that the *specific* reason recorded
for the failure — protective moves turning it off — is now measurable, and
Gallade removes three quarters of it. Whether that is enough is a question for
the game, not the calculator, and it is the player's call. Do not cite this file
as grounds to re-propose the plan unsolicited.

---

# Full SP re-measurement, 2026-09-08 — Steadfast fixed, Kasib vs Coba

Re-run at the player's request with **Steadfast** as the settled ability. Two
things had to be corrected first.

**1. `--allies-fainted` does NOT drive Last Respects.** It only feeds Supreme
Overlord; the script says so itself, and the damage is identical at every value.
Every Last Respects number quoted earlier in this project was therefore the
**50 BP, zero-fainted** case — the weakest one. The real powers were computed
through `calc(override_power=...)`: Serebii gives **+50 BP per fainted party
member**, so 50 / 100 / 150 / 200.

**2. Colbur Berry cannot work on Gallade.** Every resist berry requires a
**super-effective** hit, and Dark is **x1** on Psychic/Fighting (x2 Psychic,
x0.5 Fighting). It would never trigger. Justified still fires on any Dark move,
but the player's read is right: an opponent with Flying, Ghost or Fairy available
will not attack into a neutral type.

## The matrix (KO category; 8 spreads tested, differences noted)

| Threat | **Kasib** | **Coba** |
|---|---|---|
| Last Respects 50 BP | 4HKO | 2HKO |
| Last Respects 100 BP | **2HKO** | **OHKO** |
| Last Respects 150 BP | OHKO 4-81% (2HKO at 32 Def) | OHKO |
| Last Respects 200 BP | OHKO | OHKO |
| Gholdengo Shadow Ball | 3HKO | 2HKO |
| **Staraptor Brave Bird** | **OHKO on every spread** | **2HKO** |
| Aerodactyl Dual Wingbeat | OHKO 24-76% | 3HKO |
| Pelipper Hurricane | 2HKO | 3HKO |
| Floette Light of Ruin | **OHKO** | **OHKO** |
| Floette Moonblast | 2HKO at SpD>=18 | 2HKO at SpD>=18 |
| Sylveon Hyper Voice | 5+HKO | 5+HKO |
| Incineroar Flare Blitz | 2HKO | 2HKO |

## Verdict: COBA BERRY

Ghost is the more common threat type (46.2% of Worlds teams carry a lethal Ghost
attack, against 39.6% for Flying), so Kasib looks right on prevalence — and it is
wrong, for two reasons the matrix makes plain.

- **Brave Bird cannot be survived any other way.** It OHKOes at **32 HP / 32 Def
  with no berry** (114-135%). Coba is the only answer that exists. Kasib leaves
  it a guaranteed OHKO on all eight spreads, and Dual Wingbeat a coin flip too.
- **Last Respects is weakest exactly when this plan runs.** It is 50 BP while
  nobody has fainted, and the Imprison line resolves on turns 1-2 — before
  anything dies. At 50 BP, Coba already gives a **2HKO**. Its scaling only bites
  after Explosion has killed things, by which point the plan has resolved.
  Kasib buys safety in the late game this team never reaches.

**Residual that neither berry fixes: Floette's Light of Ruin, a guaranteed OHKO
through both, on 27.3% of Worlds teams.** There is no spread that survives it.

**Neither Coba nor Kasib is owned.**

## The spread

**8 HP / 16 Def / 26 SpD / 16 Spe — exactly 66 SP, neutral nature.**

- **16 Def** is the threshold that makes Last Respects (50 BP) a 2HKO and removes
  Flare Blitz's 56% OHKO. Below 16 both leak; above 16 nothing further flips.
- **26 SpD** clears the Floette Moonblast line — at SpD under 18 it is a 32%
  OHKO, at 18+ it is a clean 2HKO. The extra points past 18 buy the Charizard
  Heat Wave 3HKO.
- **16 Spe** is the Steadfast sweet spot, see below.
- **Attack 0 on purpose.** Close Combat with zero investment is already a
  guaranteed OHKO on Kingambit (160-192%), the most used Pokemon in the format at
  52.7%. 32 Atk only takes it to 194-233% — the same corpse.
- **Neutral nature.** Impish and Careful were both measured and flip nothing.
  Save the 500 VP.

## Steadfast and Speed

Base 80. One proc is +1 stage, x1.5. Against 267 Pokemon with real ladder usage
at max-neutral speed:

| SP Spe | Speed | After proc | Beats normally | **Beats after the proc** |
|---|---|---|---|---|
| 0 | 100 | 150 | 3.0% | 58.3% |
| 8 | 108 | 162 | 10.8% | 77.4% |
| **16** | **116** | **174** | 25.7% | **92.3%** |
| 24 | 124 | 186 | 36.6% | 97.1% |
| 32 | 132 | 198 | 43.5% | 98.8% |

**16 SP is the knee.** 24 adds 4.8 points and 32 only 1.7 more — not worth the
defensive points they cost.

The proc is reliable rather than lucky: **Fake Out is on 59.2% of Worlds Masters
teams**, priority +3 and a guaranteed flinch. The move that breaks the turn-1
Imprison is the same move that turns Gallade on.
