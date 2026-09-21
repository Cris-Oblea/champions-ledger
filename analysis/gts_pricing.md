# What a GTS trade actually costs — measured on 61 of his own

The app prices a GTS chip by **BST tier**, which is the player's own rule, and
recommends asks inside two bands around it. He asked whether that is right
(2026-09-21):

> "Los cambios en gts son por dos razones, por el ladder de % de uso y por la
> rareza de tener el pokemon."

This is that study. The data is his `gts` table: **61 closed trades** with both
a deposit and a close timestamp, 51 of them with a Champions dex row on both
sides so the BST is known.

It is his own ledger and nothing else. No source publishes what a Champions GTS
trade is worth, which is exactly why the pricing rule was a rule of thumb.

## The headline

**BST sets what you can ask for. Demand sets how long it sits.** They are two
different axes and the app had been treating the first as if it explained both.

## 1. The band is right, and its ceiling was slightly tight

Each chip is priced at `reach` — its best BST, which for a Mega-capable species
is the Mega's, plus the shiny and ladder premiums — and the suggester looks for
asks in `[value − 70, reach + N]`.

| | of 51 |
|---|---|
| landed inside the band | 46 |
| landed **above** `reach + 20` | **5** |
| landed **below** the floor | **0** |

The five above:

| gave | its reach | got | over reach | closed in |
|---|---|---|---|---|
| Indeedee 475 | 475 | Rillaboom 530 | +55 | 14.8h |
| Indeedee-Female 475 | 475 | Glimmora 525 | +50 | 14.2h |
| Beedrill 395 | 495 | Hippowdon 525 | +30 | 6.8h |
| Hatterene 510 | 510 | Typhlosion-Hisui 534 | +24 | 5.1h |
| Pidgeot 479 | 579 | Tyranitar 600 | +21 | 14.0h |

So the ceiling moved from **+20 to +60**, which covers all five with nothing to
spare. The floor stays at −70: in 51 trades nothing ever landed below it, and
asking for less than you could is how an offer clears the same day.

**The Mega rule is doing its job.** The raw gap between what went out and what
came back tops out at **+130** (Beedrill 395 → Hippowdon 525), which looks like
the band is wildly wrong — until Beedrill is priced at its Mega's 495, where the
same trade is +30. That is the rule working, not failing.

## 2. Usage does not buy BST

If the ladder priced these trades, giving away something more popular than what
you asked for should come back with more BST.

    r(usage given − usage asked, BST gained) = +0.04   (n = 46)

Zero. Whatever the ladder is doing here, it is not setting the exchange rate.

## 3. Usage buys *speed* — weakly, but it is the only thing that does

Against the log of hours-to-close:

| | r | n |
|---|---|---|
| ladder rank of what he asked for | **−0.26** | 59 |
| BST gap (asked − offered) | +0.24 | 51 |
| BST of what he asked for | +0.24 | 60 |
| ladder usage % of what he asked for | −0.12 | 59 |
| ladder usage % of what he gave | −0.14 | 46 |

Rank runs the way the player said: a **lower rank number is a more-played
Pokemon**, and the negative correlation means asking for one of those makes the
offer sit *longer*. Asking for more BST also makes it sit longer, by about the
same amount.

These are weak — at n≈60, r≈0.25 is around the edge of meaning anything — so
none of them is worth turning into a number on screen. What they are worth is
the shape, and the extremes show it much better than the coefficient does:

| gave | usage | got | usage | BST | closed in |
|---|---|---|---|---|---|
| Garchomp 600 | 13.3% | Basculegion 530 | **23.4%** | **−70** | **0.1h** |
| Tinkaton 506 | 0.2% | Palafin 457 | 0.3% | −49 | **47.8h** |

He gave up 70 BST for the most-played Pokemon on the ladder and it was taken in
**six minutes**. He gave up 49 BST for something nobody plays and it sat for
**two days**. The BST gap says the second was the better deal; the clock says
the opposite, and the clock is measuring what the other side actually wanted.

## 4. Rarity could not be tested, and that is the honest gap

The only rarity number in the building is `supply` in
`data/meta/gts_difficulty.json`, and **260 of the 264 species sit at 2**,
because 2 is what a species gets when nothing has been declared about it. There
is nothing to correlate against. The player made the same point from the other
side — "es difícil que pongas que algunos son fáciles en go, porque sigue
siendo difícil obtener algunos" — and every claim derived from that score has
been removed from the app.

Testing it properly needs a rarity signal that is measured rather than
declared. The obvious candidate is his own HOME arrivals: what he has actually
managed to catch, and how long it took him. The `box` table carries only
`updated_at`, so the arrival dates are not reliably there yet — recording an
arrival date is what would make the second half of his hypothesis testable.

## What changed because of this

- `chipBand`'s ceiling: `reach + 20` → `reach + 60`.
- Nothing else. The floor, the two bands and the Mega-reach pricing all survive
  contact with 51 trades, and the demand signal is too weak to spend a number
  on.
