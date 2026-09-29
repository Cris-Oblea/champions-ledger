---
paths:
  - "tracker/**"
  - "tests/**"
  - "scripts/effect_chips.py"
  - "scripts/check_app.js"
  - "scripts/measure_modifiers.py"
  - "scripts/probe_modifiers.js"
  - "scripts/preview.py"
  - "scripts/build_{tracker_data,tracker_page,ability_moves,engine_bundle,analysis_data,gts_difficulty,type_colors}.py"
---

# The app: builds, descriptions, tags and the page's structure

**No description is shown twice, and no tag repeats one (player, 2026-09-27:
"los tags deben ser informacion util, no algo que entorpezca").** A chip beside
a description survives only if the description does not state its number in
any unit (`effect_chips.py` rule 6) - today none survives, and the numbers are
marked in colour inside the sentence instead (`numText()` in the app). Smogon's
one-line summary is not shown where the full text is, and an ability note does
not repeat its rule's `why` under the description.

**An ability tag on a move is read from the MOVE USER's side (player,
2026-09-27: "hay que tener conocimiento de la perspectiva de una
habilidad!").** Red is an ability that stops the move when an opponent holds
it; green is one that only ever helps you - Telepathy stops an ally's move and
nobody else's. An immunity against anyone (Levitate, Volt Absorb) stays red
only: "si yo tiro earthquake y me switchean a un pokemon con levitate no le
hago nada". `build_ability_moves.STOP_WHOSE` is where each side is decided.

## A build is its own thing now (player, 2026-09-13)

**This REVERSES the rule of 2026-09-10** ("a build is not a plan for a species,
it is the set THIS Pokemon is carrying, so it lives and dies with the box row
of the same id"). Recorded as a deliberate change, not as if the old rule never
existed - it is still why `buildLink()` distinguishes an orphan.

What he wants instead:

- **Several builds for one species.** Three different Farigiraf, and which one
  is run is decided in game, or per team. So the build id is its own key
  (`farigiraf`, `farigiraf-2`, ...) and the link lives in a nullable `box_id`.
- **A build for a Pokemon he does not own.** "Que esa idea no se perdiese en el
  tiempo por no poder guardarla." The app saves it and says it cannot be
  trained or brought until one arrives. The species picker therefore offers the
  whole dex, not just the box.

Four states, and only two are faults:

| `box_id` | state | meaning |
|---|---|---|
| a row in the Champions box | `active` | the set it is actually running |
| a row parked in HOME | `parked` | kept, inactive - nothing trains in HOME |
| a row that no longer exists | `orphan` | worth flagging |
| null | `unbound` | an idea. Not a fault |

**Releasing a Pokemon now UNBINDS its builds instead of deleting them.** The old
reason - the ledger filling with sets for Pokemon that no longer exist - died
with the model: an idea is a first-class state now.

**Never fall back from a missing `box_id` to the build id.** An idea build for
Farigiraf gets the id `farigiraf`, and a fallback would silently marry it to a
box row of the same name.

**The app is twelve ES modules, not one file.** `tracker/src/` holds
`01-data.js` through `13-boot.js` (there is no `10`), plus `style.css` and `markup.html`, and
`scripts/build_tracker_page.py` links them with esbuild at build time into
`tracker/index.template.html`'s shell, then splits the result into
`tracker/dist/`. **Edit the part, never `index.template.html` (a 23-line shell
of markers), never `dist/` and never `tracker/src/_*.js` (all generated).**
Load order is whatever the imports say, with one fixed point: the generated
`_entry.js` imports `13-boot.js` FIRST, and `check_order()` asserts it on every
build. The file-number order that concatenation used to impose no longer
matters. `tracker/README.md` has the full write-up.

`node scripts/check_app.js` reads the parts back as one program, which is the
check the split needs: a name two parts each declare, or one uses without
importing, is invisible in either file alone. It runs inside the gate.

**The tracker's damage tab runs Smogon's engine itself** (bundled by
`scripts/build_engine_bundle.py`), so it is exact rather than close. Do not
hand-port the modifier chain again: it runs in four buckets with a rounding
step between each, and a one-point drift can flip a KO count. After
`fetch_smogon_calc.py` reports upstream moved, `refresh.py` rebuilds the bundle
and the page inherits the same fix Smogon shipped.

**Which ability touches which move is derived, not written** -
`scripts/build_ability_moves.py --audit` classifies all 215 abilities and
prints the ones it has no rule for. Sheer Force comes from Smogon's
`secondaries` field, not from Serebii's text: Serebii records a guaranteed
on-hit effect (Icy Wind, Rock Tomb, Snarl) with no rate at all.

**Combat multipliers are measured, never recited** -
`scripts/measure_modifiers.py` runs each one through the engine with and
without it. Anything that measures x1.00 gets checked against the format before
being called unmodelled; most such cases turned out not to exist in Champions.

**Test by sweeping, not by sampling.** `tests/sweeptest.js` puts all 340 forms
through the engine as attacker and defender. A 16-case sample shipped a Mega
naming bug because no sampled case used a Mega.
