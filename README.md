# Champions Ledger

A **box, build and team manager** for Pokemon Champions - and nothing else.
Two halves that share one database:

- **A phone app** — the box, the builds, the Mega Stones, a damage calculator
  that runs Smogon's own engine, and a searchable dex of every legal form.
- **A cross-source database** — Champions data pulled from five sources,
  joined, cross-checked, and queryable from the command line.

Champions is its own game. A restricted roster, a reduced item pool, rebalanced
moves, **Stat Points instead of EVs**, and training that costs money. Numbers
from Scarlet/Violet are wrong here often enough to matter, so nothing from
another entry is mixed in anywhere. Format is **VGC**: doubles, bring 6 / pick 4.

---

## What the data describes right now

<!-- VINTAGE:START -->
Regulation **M-C**. Ladder usage fetched 2026-09-26, from 337 Pokemon.
Tournament data is Worlds 2026, played under M-B - that is history, not stale.
<!-- VINTAGE:END -->

---

## The app

Built from this repo and deployed to Cloudflare. It is single-user and behind a
login; the data lives in Supabase under Row Level Security, so an anonymous
request returns nothing.

| Tab | What it answers |
|---|---|
| **Champs / HOME** | What is in each box, what came from where, and what can still leave the game |
| **Builds** | Every set written, and the **Teams** made of them — six slots, the item each holds, and the clauses checked. Every move, ability, nature and spread carries what this Pokemon's own players run |
| **Damage Calc.** | Real damage rolls, running Smogon's Champions engine in the page |
| **Find** | "Who learns Imprison *and* Wide Guard *and* Protect" — filters that stack, and sorting by any stat turns the same list into that stat's tier order, either way up. A **Worlds medal** on anything that finished top 8, with the exact set it played — filed under the form that was registered, and the stone says which Mega it became. Plus **Worlds**: what the field actually brought, per championship |
| **Items** | Every item, what it does, what it costs, and which move or ability it serves |
| **GTS** | Open trades, what a chip is worth, and what it can realistically fetch |
| **Profile** | Box capacity, and everything else derived so it cannot go stale |

On a phone it is one column and a bottom tab bar. On a desktop it spreads:
the controls sit beside the answer in a sticky sidebar instead of on top of
it, results come back as a grid of cards that wear their Pokemon's type, and
the column grows to 1560px rather than staying at the 820 it was drawn for.
Every question the app asks - deleting a build, releasing a Pokemon, closing a
trade - is asked in its own dialog rather than the browser's.

The type colours are **Pokemon's own**, not an approximation. All eighteen used
to be hand-written and darkened so white text would sit on them, which made
every one of them wrong - Fire read `#C8501E` against the real `#FD7D24`.
`scripts/build_type_colors.py` reads them out of pokemon.com's stylesheet, and
each type brings three facts rather than one: its colour, its **second** colour
where it has one (Dragon, Flying and Ground are officially two-toned), and the
ink its name is written in - eight of the eighteen are written in black, which
is what lets the app keep the true colour instead of darkening it. A card's
band and hover ring carry all of them: a Dragon/Flying wears four colours,
halved by type.

**A Pokemon looks the same wherever it appears** - in the box, in a build, in a
team slot, in a trade, in a search result or in a Worlds ranking. One card: a
band of its type across the top, two of them for a dual type, then every fact
in a cell of its own with the label under the value - BST, the ability, and the
six base stats - so two cards can be read against each other down the column
instead of as six numbers with six words between them. Nothing is trimmed to
fit: a long ability list wraps rather than ending in an ellipsis.

**Wherever** now includes every picker that opens inside a sheet - adding a
Pokemon to the box, choosing what to ask for in a trade, picking the attacker
in the calculator, choosing a species for a build, filling a team slot. Those
were bare rows with a name and a BST while the screen behind them showed the
full card, because each had been written on the day its screen was built and
every improvement since was made by copying the best card into one more place.
There is one implementation now - `pokeCard()` - and each screen passes in its
own extras: a ladder chip, an item cell, the reason a suggestion is in range.
The sheet and the stones tab share its middle, `pokeFacts()`, so the box that
opens when you tap a card says the same things in the same order as the card
that opened it.

**And no line on a card ever wraps to a second line.** That took one word of
CSS and a measurement to find: flex breaks a line on each item's CONTENT width
before it shrinks anything, so an ability box that could have narrowed to fit
beside BST jumped to a row of its own and left BST using a fifth of it. The
median card wanted 230px of boxes and the worst 363, against 186 beside a
corner sprite - 284 of 341 lines wrapped. The boxes shrink now and their text
wraps inside them, which is what a card is allowed to do; 264 forms were
re-measured at five widths from a 320px phone to a 1536px desktop, and nothing
breaks or overflows.

**A build card shows only the build.** It is one Pokemon in one configuration,
so it draws that form and the one ability it runs - not the species' other
options, and not a Mega line the set does not use.

**And a species with ONE ability never chose it.** Aegislash is Stance Change,
Clawitzer is Mega Launcher, and every one of the 81 Megas is a single line, so
the build carries that ability whether or not anyone ever touched the control -
on the card, on the move rows it boosts, and in the calculator. Where the
species really does offer two or three, the choice stays open, the editor says
so, and nothing fills it in.

**One fact, one chip, and the chip says what its number governs.** An item, an
ability or a move carries its numbers as chips beside Smogon's sentence, and
they are worked out once — in `scripts/effect_chips.py`, never on the phone —
because deciding them needs things a screen does not have. The engine is probed
through a physical and a special vehicle, so the same multiplier comes back
twice; it works in 4096ths, so Life Orb's is 5324/4096 and not 1.3; and Smogon's
sentence usually states it as well. Black Glasses used to read `x1.2  x1.2
1.2x`. It reads **`x1.2 damage dealt`** now: measurements collapsed by the value
and the quantity they multiply, rounded to what the engine means, a text number
dropped where the engine already measured it, and the last one dropped entirely
when the sentence holds only that one number — Aerilate's `1.2x` beside "have
1.2× power" was the same three characters twice. What survives is labelled from
the words either side of it in the sentence, so Overgrow reads `x1.5 offensive
stat` and `at 1/3 max HP` rather than `1.5x` and `1/3`. `effect_chips.py
--audit` lists the two numbers whose subject it still cannot name, so the gaps
are counted rather than quietly wrong. The exact 4096ths stays in
`data/db/effects.json` and in each chip's tooltip.

**A Mega lives on its base Pokemon's row.** The search listed all 345 forms,
81 of which are Megas — a fifth of every page was a Pokemon you cannot own,
because a Mega only exists mid-battle and only while a stone is held. It is not
a thing you store, so it is not a thing you browse: it is a fact *about* the
Pokemon you store. **264 rows instead of 345**, and three things survive the
fold, because without them it would cost more than it saves.

*The query.* A filter matches the base **or any of its Megas**, and the card
says which — searching Fighting still finds Staraptor, whose Mega is
Fighting/Flying, and the card is tagged `as Mega Staraptor` rather than looking
like a bug. *The rank.* The sort reads the value the Pokemon can **reach**:
highest across the line going down, lowest going up, since a Mega that raises
Speed does not help a Trick Room list. That is why Absol, Garchomp and Lucario
head a descending Speed sort — all three reach 151. *And only what changes.* A
stat cell gains a second line where the stone moves it, and the types appear
again only when the stone really swaps them.

**Each Mega is named by its own colour**, and the same ink runs through every
place that names it: the caption under its sprite, the key on a stat delta, the
arrow before its typing and the label on its ability box. X is blue, Y red and
Z green — the games' own — and a plain Mega keeps the app's purple. Four work
in an 8.5px caption because they never all meet: a species carries either an
X/Y pair or a plain Mega with a Z. **There is no "Mega M":** Champions writes
`Mega`, `Mega X`, `Mega Y` and `Mega Z`, so the unlettered one is labelled with
the word rather than an invented letter.

**A stone is not the only thing a Pokemon turns into.** Three of them change
stats or typing in the middle of the battle, off an ability rather than an
item, and they are drawn exactly the way a Mega is — sprite in the strip, its
own ink, a second number under every stat it moves, an arrow when the typing
changes. Stance Change gives Aegislash 140 Attack the moment it attacks, Zero
to Hero takes Palafin from 70 to 160, and Forecast retypes Castform to Fire,
Water or Ice with the weather. They wear an amber that is none of the four
Mega inks, because one is a decision you make at team preview and the other
just happens. There are exactly three, and a test says so: a regulation
adding a fourth fails the gate rather than shipping a card that omits it.

**Every form gets a row in a stat cell, in the same order**, with a blank where
it changes nothing — so row two is the same Pokemon in all six cells and a
table can be read across as well as down. A form that moves *nothing at all*
gets no row anywhere, because the blank buys alignment and there is nothing to
align: Castform's three weather forms are 70 across the board.

The card carries the **whole line at native size**, base first and then what it
becomes, which is why a card is never narrower than 300px: three sprites are
294 and nothing shrinks them.

On the sheet, **each form is a box and they are all the same box** — the base
one too. Picture and facts, the six stats, the abilities explained, and what
damages it; a Mega adds the sentence naming what the stone moved, and gets its
own damage table when the typing changes, since Mega Ampharos picks up a
Dragon's weaknesses. A battle form gets the same box under its own heading,
naming the ability instead of the stone — and Castform's three earn three
damage tables, which is the whole of what Forecast does. Nothing is said in two boxes: a sheet is a stack of
Pokemon rather than a stack of topics.

**HOME holds three questions, so it has three panes.** What is parked there,
what is out on the GTS, and what is still missing from the dex — one scroll
would have opened the checklist under a 170-row box. The bar was measured at
its limit with seven tabs, so it is a segmented control rather than an eighth.

**The dex checklist is an order of attack, not a list of holes.** Champions'
own route in is a gacha — ten random species, take one — so the dex is
finished through Pokemon GO into HOME, and through the GTS for what GO cannot
give. It lists what is **in neither box**, easiest to get first; one copy per
species is the target, and extra copies are a later question, so nothing there
asks for a second of anything. A species already in HOME is **done** even when
a copy is also welded into the Champions box. Megas are not on it at all: a
Mega is not caught, it is a stone on something you own.

**The GTS pane recommends trades by reading the HOME box.** Every Pokemon in
HOME that the keep-one rule allows you to put up — a duplicate past the first
copy, or a species Champions cannot use — is asked what it could fetch, using
the same two price bands the deposit screen uses one chip at a time. The asks
that would **free a Champions slot** are marked and ranked first: a species you
hold only in the Champions box is welded there, because an Encounter Pokemon
can only leave by being released, so a HOME copy of one is worth more than the
dead Mega Stone the suggester used to rank top.

**What counts as a duplicate is an origin question.** A copy only counts if it
could be the one you keep — in HOME, or in the Champions box and able to be
parked back there. A rental or an Encounter buy of the same species is welded
into the game and can never come back out, so it does not make the HOME copy
expendable. Getting this wrong offered a singleton as trade material and would
have lost the species.

**What you ask for is always playable; what you offer usually should not be.**
The two sides of a trade are not the same question. An ask that Champions
cannot use buys a HOME row and nothing else, so the suggester never proposes
one. The *chip*, though, is best spent on something you could never field: a
Pokemon in HOME that Champions cannot use costs nothing playable to give away,
so those lead the list, carry a tag saying why, and have a filter of their own.

**And it will not recommend a chip the GTS refuses to hold.** Melmetal is in
HOME, is unplayable in Champions, and was top of the list — and HOME's GTS will
not take it. `data/meta/gts_blocked.json` is that list, and it records who
confirmed each entry and when, because none of the five sources covers HOME's
own rules and there is nothing to check it against.

Melmetal is also a **Mythical**, which makes "the GTS refuses Mythicals" the
obvious reading of one data point — and one data point is not a rule. So the
other Mythicals are **ranked last and tagged**, never dropped: a wrong guess
that hides a chip is worse than one that warns about it. It matters beyond one
Pokemon, because Champions has **zero** Mythicals and zero Legendaries, so
every one that ever reaches HOME lands in exactly the pile this list puts
first — and thirteen of the twenty-three can be caught in GO. Which species
carry the flag is read off PokeAPI at the pinned commit, never typed out.

**Nothing on it claims a species is easy in Pokemon GO.** It did, from a
declared supply score — and 260 of the 264 sit at the default of 2, so the
claim was mostly a guess wearing a number. What is there instead is the only
measured evidence in the building: the closed trades. How many have cleared,
how long half of them took, and how much BST came back against what went
out — per species where the record is long enough to mean anything.

**And no sprite is ever drawn with `image-rendering: pixelated`.** It looks
like it should do nothing at native size, and on a 1x display it does — but a
1.25 device-pixel ratio draws 96 CSS px into 120 real ones, and `pixelated`
makes that a nearest-neighbour upscale with hard square edges. That is what
"se ven pixelados" was.

**A filter chip has three states, not two.** A tap includes, the next rules
out, the third clears — so **"Trick Room, but nothing Psychic"** is one query
instead of an impossible one: 46 Pokemon learn it, 27 are Psychic, and ruling
that out leaves 19. It is in the **Find tab's type filter**, which is where the
question gets asked, and in the move filters as well. An excluded chip is struck through with a minus
rather than shaded, because it has to read as the opposite of the chip beside
it. And the **category** group picks one at a time: a move has exactly one of
Physical, Special and Status, so two of them included could only ever mean
"either", which is what ruling out the third already says.

**The phone's Back button navigates the app instead of leaving it.** Nothing
here touched history before — the page loads once and every screen after is a
hidden `<section>` — so the browser's only entry *was* the page, and on Android
Back minimised it. Every layer that opens now spends one history entry, and
Back undoes them topmost first: the confirm dialog, then an open sheet, then an
editor, then the tab before it, and only when none of those are left does it
leave. Verified in Edge on a clean tab, including the last part: an app that
cannot be left would be worse than the bug.

**Choosing which Pokemon a build is for is a search, not a scroll.** It was a
`<select>` of 264 forms in one alphabetical run with no way to look inside it.
It is a field you tap now, opening the same kind of sheet the GTS and the
calculator use: a search box that matches the **name, either type, or the dex
number**, the app's usual sorts, and the same card as everywhere else. The
whole dex stays on offer — a set for a Pokemon that has not arrived yet is an
idea worth keeping — so "in your boxes" is a filter and never a limit.

**And that goes for every list, not just that one.** A search box only existed
where somebody remembered to paste one in, so the screen where a team is
actually assembled — the slot picker, which lists every build in the ledger —
had none at all. There is one helper now, and it is what every list uses, so
the next list cannot be born without one. Where it was worth more than a text
match the list also got chips: the slot picker filters by **where the build is**
(ready today, parked in HOME, not owned yet), by the **roles that exist** in the
ledger and by the **type the build plays as**, Mega included, which is the
question a sixth slot is really asking. The item picker filters by category and
by what you own. Every box carries a clear button, because a filter you cannot
empty in one tap is a filter you stop using.

**The Species Clause is enforced where the choice is made.** The item picker
already greyed out anything another slot held; the build picker accepted a
second Farigiraf and reported it as illegal underneath afterwards. It greys it
out now, sorts it to the bottom and writes the reason on the row. Both clauses
are measurements — 0 of the 642 Worlds teams with a full list repeats a species,
0 of the 636 with a full item list repeats an item — so neither is a preference
to be argued with at save time.

**A tag on a move row is not neutral.** Heat Rock on Sunny Day is a reason to
run the move; **Aspear Berry on Ice Beam is the reason it will not work** — the
target thaws and the freeze was the whole point. Both read as the same grey
chip, so the row said "these items are related" and left which way to be worked
out. Each link now carries the side it plays on, decided in
`build_item_links.py` from the reason the link was made for, and the ones that
answer the move are drawn in red.

**And what turns a move off is on the row too.** A defensive ability badges
nothing as a rule — the alternative is all 67 of them, and Fire Lash would
carry 32 grey chips. But the narrow class that makes a move do **nothing** is
worth seeing: Zap Cannon comes back **Bulletproof, Lightning Rod, Motor Drive,
Volt Absorb**, and Boomburst **Soundproof, Telepathy**. Which abilities those
are is derived in `build_ability_moves.py`, in two groups — one that stops the
move whatever it was, and one that stops the thing the move *does*, which only
counts as a block on a status move. So Will-O-Wisp is blocked by Thermal
Exchange and Fire Lash is not, because Big Pecks only eats its Defence drop and
that is not the move being stopped.

**The calculator carries two of everything, so every millimetre it spends is
spent twice** — and it was measured against pokebase's, in a real browser at
three widths, rather than guessed at. Its stat rows run at a 43px pitch and
ours at 44, so the rows were never the difference. Three things were: a global
`min-height:42px` held every control 10px taller than it needed to be (it is a
touch target, and stays everywhere else); each of the field's eight groups put
its **label on a line of its own**, so eight lines were pure heading and the
column reached 747px — which, since the grid stretches all three columns to the
tallest, was holding the attacker and the defender open at 370; and Ability,
Item, Nature and Status stacked full-width instead of sitting beside the stats.
A fourth came from Smogon's calculator: its caption sits **beside** its control
rather than above it, so four fields cost two lines instead of four. Its selects
are 19px tall and its rows 16px, which is desktop-only density a phone-first app
cannot copy — but that one idea is portable, and the control keeps a height a
thumb can hit.

Fixed, the calculator is **904px instead of 1100** at 1526, **1275 instead of
1704** at 820 and **2208 instead of 2864** on a phone, with the field column
alone going from 747px to 374.

One change was made, measured as a 107px saving, and then **taken back out after
looking at it**: running the dropdowns beside the stats rather than above them.
A side is 360px wide at three columns, so each half is 169 and the SP number box
came out **22 pixels** wide — and no viewport fixes that, since even 1920 leaves
about 220. A stat editor you cannot read is not worth 107px. The number box is
sized for a number now (70px) and the space goes to the computed stat, which is
the half you read.

Nothing was removed, and `itemstest` asserts the structure that produced it —
all 32 field buttons still there, every group label inside its row, the six stat
rows intact with all four parts, and the side **not** split. The **status dictionary is folded**: seven entries you read once, which
were sitting open under the controls and pushing the number the screen exists
for further up the scroll. It stays on this screen, because that is where a
status gets applied and where its multiplier is read, and it is drawn the first
time it is opened rather than on every redraw.

**Every row in a Worlds ranking has a Pokemon behind it.** A Worlds list is
history, and **53 of the names across the four championships are not in the
Champions dex** — the 2025 field was full of Calyrex, Koraidon and Flutter Mane.
Each of those drew a bare name with no types, no stats, no BST and no sheet.
They all have one now, off the same PokeAPI tables the HOME cards use, and
`fetch_home_dex.py` walks the teamlists as well as the weight table so the two
sources of "a name the app can draw" can never disagree. Floette was a second
case on top of that — it *is* in Champions, as **Floette-Eternal**, the only
one the game has — so name resolution follows the alias table before giving up.

**The dex is complete; Champions is the part of it that is switched on.**
That framing is the player's (2026-09-19) and it is the right one: the game
rebalances a Pokemon *when it adds it*, so until then there is nothing of ours
to contradict, and knowing what Flutter Mane would bring is how you judge
whether you want it. So the app carries **every** species, **every** move and
**every** ability, and the *not in Champions* tag is what says a thing cannot
be played yet.

Three parts fill that in for the 933 species the game has not added: their
**movepools**, the **move rows** the app does not ship, and the **ability text**
Champions has no entry for. Only the last is main-series — the moves were ours
all along. `data/db/moves.json` holds 901 moves of which 512 are useable, and
388 of the other 389 carry a full Champions row; they were never missing, just
not sent to the phone, because the pickers draw from that list and a build made
of a disabled move would be an illegal build the app helped write. They are
shown here, marked. 503 KB, so it is its own hashed asset, fetched the first
time one of those sheets is opened and never otherwise.

**A GTS box is a shortlist, so it is filtered like one.** What may go into one
is settled by two rules rather than taste — only a **duplicate** (the Species
Clause means a second copy can never share a team with the first) or a species
**Champions cannot use** — and both were left to be found by eye down a hundred
rows. They are two toggles now, beside a sort that defaults to **dex order**,
which is the order HOME itself lists in and therefore how one screen gets
checked against the other. The rows carry the same card as every other list:
type band, the picture in the copy's own colours, BST, the ability and the six
stats, instead of a BST and a Speed. An offer shows both sides the same way.
And a chip Champions has never heard of now has a **price**, so it gets
recommendations — `chipValue` read the Champions dex, found nothing, and
returned no price at all, which meant the one kind of Pokemon the rules say to
trade was the one kind the app would not advise on.

**One Pokemon sheet, three doors.** Opening a Pokemon from the Champions box,
from HOME or from a search result used to give three different sheets: the
search view had the abilities, the Worlds sets and the whole movepool, the box
had the Mega line, the type chart and Smogon's write-up, and neither had the
other half — so which door you came through decided what you were allowed to
know about the same Pokemon. It is one sheet now, drawn in two halves with a
gap in the middle: **identity** (picture, types, BST, the six stats, the other
spellings of the name, what it becomes mid-battle), then whatever that door
owns, then **reference** (the Mega line and what the stone costs as well as
adds, what damages it, its abilities and how much of its own movepool each one
touches, the top-8 sets it won with, its movepool under the same filters the
build editor uses, and what Smogon wrote). Only ownership may sit in that gap —
origin, shiny, trained, and the note — and it sits there rather than at the
bottom because an edit belongs under the name it applies to, not below two
hundred rows of movepool. `ledgertest` holds all three to it: the box may add
those and nothing else.

**A shiny is a different picture.** Both sprite sets carry one, so a copy
recorded as shiny wears its own colours on its card and on its sheet. Only
where a specific copy is in hand — the search view draws the species, not his
copy of it.

**Two sources inside one site can disagree, so the ability lists are crossed
too.** A form's abilities come from the **attackdex**, because that is the only
place each form gets a row of its own — and Serebii's attackdex row for
Lycanroc-Midnight lists Keen Eye and Vital Spirit and stops, while its **Pokedex
page** lists all three and links `/abilitydex/noguard.shtml`. **No Guard was
missing from the database entirely**, found in game by the player. `build_db.py`
completes a short form row from the page now — it only ever adds — and
`scripts/audit_abilities.py` crosses all 264 forms against PokeAPI at the pin so
the next one speaks up instead of sitting there. One known difference is
recorded with its reason rather than silenced: Serebii writes *Compoundeyes* as
one word and our whole database does too.

**A HOME Pokemon Champions has never heard of is still a card.** HOME holds
species the game does not have, and those rows used to be a name and a "not in
the Champions dex" tag with nothing else - no types, no BST, no stats, no
ability - which is no help at all on the one screen where you decide what to
keep. `scripts/fetch_home_dex.py` fills them in for 920 species from PokeAPI's
own tables, read at a pinned commit. The tag stays, and the card says plainly
that these are main-series numbers: Champions publishes none for them, so there
is nothing of ours to contradict - and nothing of theirs is ever used for a
species Champions does have, where the move rebalance makes PokeAPI wrong (81%
of its PP values and 16 of its base powers disagree with Champions).

**The explanation does not stand in front of the answer.** Each screen opens
with the one sentence that says what it is; the rest of the intro sits behind a
link that states how many words are in it. Nothing is deleted and nothing is
guessed at - the text is one tap away and still in the page - but Builds now
reaches its first build in 181px instead of 220, and HOME in 161 instead of 199.

**The movepools finally have a second opinion.** Every other number here is
crossed against something - the damage formula against Smogon's engine, the type
chart against Serebii's own weakness tables, the item prices against pokebase -
but a movepool came from one parse of one page, and when that parse went wrong
it went wrong silently. PokeAPI tracks Champions as its own version group, so
`scripts/audit_learnsets.py` pairs 235 of them against an independent read:
~14,600 move-species pairs, **seven disagreements, and Serebii backed this
project on all seven**. It never rewrites anything - when the two disagree,
Serebii decides - and each known disagreement records which Serebii page
settled it, so only a NEW one speaks up.

**Every card carries its Pokemon's sprite**, fetched from a CDN at a pinned
commit and never copied into this repository - those are Nintendo and Game Freak
images, PokeAPI licenses its own sprites repo NOASSERTION for exactly that
reason, and this repo is public. Only the id ships. The pixel set rather than
the artwork, measured: 1.3 KB against 139 KB for the HOME render and 153 KB for
the official one, and a screen of 159 cards would be 22 MB of those. A sprite is
also the one thing PokeAPI has that is safe for the species Champions DOES have
- a picture is not rebalanced.

`python scripts/preview.py` puts three viewports side by side in a browser -
desktop, laptop and phone - each in its own iframe so the media queries are
real, with the cache cleared first and the app's own overlap check on a button.

Its source is thirteen ES modules under `tracker/src/`, each one a tab or the
thing the tabs share, saying what it exports and importing what it needs. The
build links them into the single script the browser is handed, plus a sourcemap
so a stack trace still names the file a person edits. **Edit a part, never
`tracker/index.html`** - that file is generated.

---

## What is in the database

<!-- COUNTS:START -->
| File | Rows | What it holds |
|---|---|---|
| `data/db/pokemon.json` | 345 | Every playable form: types, base stats, abilities, and the 81 Megas |
| `data/db/moves.json` | 901 (512 useable) | Champions move data, 15 flags, and who learns it |
| `data/db/abilities.json` | 215 | Champions ability text and every carrier |
| `data/db/items.json` | 199 | Items and Mega Stones with their VP price |
| `data/db/learnsets.json` | 264 | Reverse index: Pokemon to movepool |
| `data/db/ability_moves.json` | 140 | Which ability changes which move, derived from the move text |
| `data/db/effects.json` | 390 | What an item or ability multiplies, exactly, read out of the engine |
| `data/db/typechart.json` | 18 | The type chart, cross-checked on 3402 matchups |
| `data/meta/usage_pokemon.json` | 337 | Ladder usage per Pokemon |
| `data/meta/usage_moves.json` | 755 | Ladder usage per move |
| `data/meta/speed_tiers.json` | 89 | Base Speed to real Speed at every investment |
| `data/meta/smogon_analyses.json` | 358 | Smogon's written VGC analyses |
<!-- COUNTS:END -->

That table is **generated** by `scripts/build_docs.py` and checked on every
build. See [Keeping this file honest](#keeping-this-file-honest).

---

## Asking it things

```bash
python scripts/query.py brief Ceruledge        # a dossier, every source at once
python scripts/query.py pokemon Garchomp       # the card, plus Smogon's write-up
python scripts/query.py moves --flag sound     # every sound move
python scripts/query.py counter-priority       # what shuts priority down
python scripts/query.py resist ice fairy --owned   # who covers a shared hole
python scripts/query.py usage --top 30         # the ladder
python scripts/query.py worlds --usage --division all   # Masters / Seniors / Juniors
python scripts/query.py owned                  # your box against the meta

python scripts/damage.py "Mega Glalie" Explosion Kingambit --atk-sp 32
python scripts/damage.py --selftest            # the formula, against Smogon's engine
```

Every command takes `-h`.

---

## The five sources, and what each is for

| Source | Good for | Not for |
|---|---|---|
| **Serebii** | Rules and mechanics. What exists, what it does, exact Champions numbers | Anything about what people play |
| **pokedata.ovh** | Official tournament teamlists — what actually wins, all three age divisions | Current usage: a finished event keeps the format it was played in |
| **pokebase.app** | Live ladder usage, and the per-Pokemon splits: every move, item, ability, nature, SP spread and teammate the people running that Pokemon actually brought | Rules text |
| **Pikalytics** | Win rates, top SP spreads, and 2-/3-Pokemon cores | What is popular — its data lags |
| **Smogon's calculator** | Damage arithmetic and ability behaviour. The only *executable* source | Per-Pokemon data: it inherits from Scarlet/Violet and the leaks show |

Ladder usage and tournament usage disagree, and that is signal rather than
error. Anything quoted here says which one it came from.

**A percentage always says what it is a share OF.** pokebase's per-Pokemon
pages publish two different datasets under the same headings — tournament
teamlists for the current regulation, and the ladder season — and they do not
measure the same thing. Worse, within one of them the move column is divided by
move SLOTS while every other column is divided by SETS, so no move can ever
reach 50% and "24.6% Fake Out" means nearly every Rillaboom runs it. The app
carries one dataset, labels it, and scales its emphasis against that Pokemon's
own top row rather than against a fixed threshold; `build_splits_data.py
--check` asserts the shape of every column on every Pokemon, and the gate runs
it. A source that quietly changes a denominator is the failure this catches.

---

## How it stays current, without anyone remembering

```
05:07  GitHub Actions refreshes every source, rebuilds, runs the gate, and
       opens a pull request with whatever moved. The pull request is gated
       again on its own, merges itself when green - and the merge is what
       deploys. A refresh that fails the gate leaves the pull request open
       and deploys nothing.

       05:07 is when it is ASKED, not when it runs. GitHub delays scheduled
       workflows on shared runners when the queue is busy - measured here at
       four to seven hours late, three days running - so the job asks three
       times (05:07, 08:07, 11:07 local) and the first attempt GitHub honours
       does the work. The others see the day's refresh already succeeded and
       stop in seconds. Nothing on GitHub's side can make it punctual; this
       makes it reliably once a day.

       A REGULATION is the one event that can quietly wreck the database, and
       it is detected rather than remembered. pokebase publishes which
       regulation is current as a value in its own page data; the refresh asks
       for it before fetching anything, compares it with
       data/db/regulation.json - what the database was BUILT for - and if they
       differ it runs the regulation recipe instead of a plain refresh:
       every Serebii page is re-fetched ON TOP of the cache and the run ends
       with the list of pages that came back different - the patch note for
       that regulation. It asks Serebii too, and waits if Serebii has not
       published it yet. The pull request that night says
       REGULATION in its title.
```

<!-- GATE:START -->
**The gate** is 34 checks, and nothing reaches the phone without
passing all of them:

- a **shrink guard** — if a rebuild comes back with fewer forms, moves or
  learnsets than the last good one, a source broke and the run stops
- **nine Python audits** — the damage formula against Smogon's engine, name
  matching across all five sources, every derived index resolving, every form
  still accounted for, the README's own numbers, and that no SQL migration is
  still waiting to be applied
- **one source check** — the app is linked from thirteen ES modules, so a name
  two of them both declare, or one of them uses without importing,
  is read for once rather than clicked
- **twenty-three browser tests** — run against the built page, because no Python
  check can see a template regression
<!-- GATE:END -->

### The ledger is backed up

Supabase holds the whole ledger and the free plan takes no backups of its own,
so the repo does it. `scripts/backup_ledger.py` snapshots every table to a
timestamped JSON **outside the working tree** - this repo is public and a
snapshot is the ledger in plaintext.

```bash
python scripts/backup_ledger.py                 # take one
python scripts/backup_ledger.py --list          # what exists
python scripts/backup_ledger.py --verify        # file intact? DB moved since?
python scripts/backup_ledger.py --restore FILE  # dry run: what would change
```

It runs on its own in two places: **every local gate run** takes one before it
does anything else, and a nightly GitHub Action pushes one to a **separate
private repo**. Nothing in that chain expires - it pushes with a deploy key
instead of a token, and reads the database with a connection string instead of
an access token - because a job that runs unattended at four in the morning
fails by stopping quietly, months before anyone looks.

Restore is a dry run unless given `--confirm`, and both halves of it - putting
a deleted row back, and removing one the snapshot does not have - are tested
end to end rather than assumed. Two gate checks watch it: one fails if the
newest snapshot is more than three days old, and one fails if the dry run can
no longer tell a changed row from an unchanged one, because a backup system
that has quietly stopped looks exactly like one that is working.

`main` is protected: pull requests only, gate must be green, and that is
enforced for admins too. A local `pre-push` hook runs the same checks before a
push leaves the machine.

```bash
python scripts/migrate.py                 # apply any pending SQL migration
python scripts/daily.py --install-hooks   # once per clone
python scripts/daily.py --no-refresh      # gate what is built, then publish
python scripts/refresh.py                 # the full source refresh
python scripts/refresh.py --regulation    # ...when a new regulation drops
```

---

## Champions rules worth knowing

- **Stat Points replace EVs**: 66 total, at most 32 in one stat. Verified
  against every published spread.
- **Training costs VP**: 5 per Stat Point, 250 a move, 500 a nature, 500 an
  ability. A Mega Stone is 2000; keeping a rental is 2500.
- **Item Clause** — no two Pokemon on a team may hold the same item. Measured:
  0 of 636 Worlds teams repeat one. So an item is a **team-level** decision,
  not part of an individual build.
- **Species Clause** — no two Pokemon on a team may be the same species, and
  not even the same *form*. Measured across 642 Worlds teams.
- **Mega Evolution** — a team may carry several stones, and most Worlds teams
  did, but **only one Pokemon may Mega Evolve per battle**. The second stone is
  matchup flexibility at team preview.
- **A Mega can change stats, typing and ability**, in any combination, so a
  species is judged on its Mega line rather than its base row.
- **No Terastallization**, and no Legendaries or Mythicals.

---

## Layout

```
scripts/     fetchers, the database build, the query CLI, the damage calculator
data/db/     the built database - the thing everything else reads
data/meta/   usage, tournaments, speed tiers, written analyses
tracker/     the app: a shell, its ES modules under src/, and a generated data blob
<!-- TESTS:START -->
tests/       twenty-three browser tests, run against the BUILT page
<!-- TESTS:END -->
analysis/    write-ups: the Smogon engine, regulation M-C, GTS pricing, the roadmap
CLAUDE.md    the rules this project works by, including everything learned the hard way
```

---

## Keeping this file honest

Every number above is **generated** from the data and verified on every build:
`scripts/build_docs.py --check` runs inside the gate, so a README that has
drifted blocks the deploy exactly like a failing test.

This exists because by 2026-09-13 the README claimed 308 forms against a real
345, named a regulation two versions old, and told the reader to hand-edit a
file the app had replaced. None of that was wrong when it was written. **A
number typed into prose is a promise to come back and retype it**, and the only
promises this repo keeps are the ones a machine checks.

So: when a change lands, the counts follow on their own. The prose is hand-
written, and anything that changes what the app *is* belongs here in the same
pull request that changes it.

---

## If you found this

It is one person's tool, kept in the open rather than published as a product.
There is no support, no roadmap you can file against, and it assumes a box,
a ledger and a Cloudflare account that are not yours. Read it, borrow from it,
but do not expect it to run for you out of the box.

**Licence.** The CODE is MIT — see [LICENSE](LICENSE), and [NOTICE](NOTICE)
for what it does not reach. The contents of `data/`
are not covered and cannot be: they are derived from public community sources
(Serebii, pokebase.app, Pikalytics, Smogon, pokedata.ovh) and describe a game
owned by someone else. They are here to make one player's own box searchable,
not to be redistributed as a dataset.

Pokemon and all respective names are trademarks of Nintendo, Creatures Inc. and
GAME FREAK Inc. This is an unaffiliated fan project; nothing in it is sold or
advertised.
