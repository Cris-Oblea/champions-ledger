# How Pokemon are obtained, and the player's box

**How Pokemon are actually obtained (player, 2026-08-29; model corrected
2026-08-31) — this bounds every suggestion.** The plannable pool is exactly what
is in the ledger (`scripts/ledger.py`): the permanent box plus the rental list.

**The Encounter is the game's one source of new Pokemon** — a gacha offering 10
random species. **Rental and permanent are not two paths; they are the two ways
to take a Pokemon out of that same Encounter**: rent it for 0 VP, or buy it
outright for 2500 VP. A rental already taken can still be converted later for
the same 2500 VP or with a permanence ticket. Rentals expire and **cannot be
trained**, which is why the player deliberately takes Encounter Pokemon as
rentals — it keeps VP free to keep rolling — and buys them later. Getting a
specific species out of the gacha is luck, not a plan, so never propose a
Pokemon the player does not own, and always say whether it is already permanent
or a rental that costs 2500 VP.

**Pokemon HOME is the exception, and it is not new.** HOME has always been a
route into Champions; nothing about the game changed. What changed is that the
player can use it — they have **no Switch**, and only recently found that
Pokemon caught in **Pokemon GO** can be sent to HOME and on into Champions. A
Pokemon arriving this way is **permanent**: trainable at once, no VP, no ticket,
and it never touches the rental list (Sableye, 2026-08-31). This is the **only
route that delivers a chosen species on purpose**, so "they don't own it" is not
the same as "unobtainable" — ask rather than ruling it out. Mega Stones for
species not in the box stay dead weight until that species actually arrives.

**A rental cannot be trained (player, 2026-08-29).** Moves, nature, ability and
SP can only be changed on a Pokemon you own permanently, so a rental is locked
to whatever default set it ships with. This is why the app never tags a
build on a rental as trained and warns "rental - cannot train" on it: it is a
rule, not a choice. It also reframes what making one permanent
buys - it unlocks *building* that Pokemon, so the reason to spend on one is
wanting to give it a set, not its raw usage number. Never propose a trained
spread, a bespoke moveset or a nature for a Pokemon that is still a rental.

**A rental CAN hold a Mega Stone and Mega Evolve (player, 2026-08-29).** Being a
rental only blocks *training*, never the stone. In practice the player still
rates a rental Mega as not worth fielding, because it is stuck with the default
moveset it ships with - the stone raises the stats, not the set.

**Why the box is full of rentals (player, 2026-08-29).** It is deliberate, not
indecision: taking an Encounter Pokemon as a rental costs 0 VP, which keeps VP
free to keep rolling the gacha. They are bought later, when VP allows. So do not
read a long rental list as clutter, and do not push to convert one before the
player raises the subject - the holding pattern is the plan.

The player plays in **English** and wants all files, data and docs in English.

## Player context

**Box occupancy and what they own live in the LEDGER, and
`scripts/ledger.py` reads it.** Do not restate those numbers here, or the two
copies drift apart - which is exactly what happened to the file that used to
hold them. `python scripts/query.py owned` prints the box and
warns when `box_used` no longer matches the lists.

What the file cannot record:

- **Do not volunteer what to release.** They manage the box themselves, and
  releasing only matters once it is actually full. Report that space is tight
  if it is; do not turn it into a recommendation.
- Rentals go before permanents when they do free a slot, unless a permanent has
  stopped earning its place.
- Training costs VP, so **the VP price is part of any build recommendation**.
  Observed in-game 2026-08-29: **SP change 5 VP, move 250 VP, nature 500 VP,
  ability 500 VP**.
  Serebii's training page still shows the launch prices (2 / 100 / 200 / 400)
  and is **wrong**; `scripts/ledger.py` is the source of truth for costs. Retuning
  a full set is expensive: four moves alone is 1000 VP, over three ranked wins.
