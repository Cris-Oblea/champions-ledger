// The types every part shares, declared globally so a JSDoc names them with
// no import: the payloads the page finds on window, the rows data.js unpacks
// them into, and the ledger's records as store.js hands them to S.

type Stat = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
/** A Stat Point spread: only the stats that got some. */
type SpSpread = Partial<Record<Stat, number>>;

/* ------------------------------------------------- the dex payload (CHAMP) */
/** window.CHAMP, written by build_tracker_data.py. Positional rows keep it
 *  small; data.js is the one reader of the positions. Every field the page
 *  reads is declared here, so a field nobody declared is an error. */
interface Champ {
  /** [name, species, types, base stats, is Mega (0/1), abilities, dex no] */
  DEX: [string, string, string[], number[], number, string[], number][];
  /** [name, type, cat, bp, acc, pp, priority, target, spread, hits ally,
   *   [min, max] hits, high crit, flags, effect text] */
  MOVES: [string, string, "P" | "S" | "T", number, number | null, number,
          number, string, number, number, [number, number] | null, number,
          string, string][];
  /** [stone, Mega, species] */
  STONES: [string, string, string][];
  /** [raised, lowered, description]; a neutral nature raises nothing */
  NATURES: Record<string, [Stat | null, Stat | null, string]>;
  /** attacking type -> defending type -> multiplier */
  CHART: Record<string, Record<string, number>>;
  /** form or species -> indices into MOVES */
  LEARN: Record<string, number[]>;
  LEARN_ALIAS?: Record<string, string>;
  DEXNO?: Record<string, number>;
  BFORMS?: Record<string, {by: string,
    f: Record<string, {t?: string[], b?: number[], sp?: number}>}>;
  /** move -> form -> the type it has for that form */
  FORM_TYPED?: Record<string, Record<string, string>>;
  HOME_DEX?: Record<string, {t?: string[], b?: number[], ab?: string[],
    approx?: string, f?: OutsideForm[]}>;
  MEGA_OWNER?: Record<string, string[]>;
  PODIUM?: Record<string, PodiumSet[]>;
  /** type -> its colours, whether the official badge has two tones, whether
   *  the colour is the official one, and its ink's contrast */
  TYPE_COLORS?: Record<string, {top: string, bottom?: string, ink?: string,
    two_tone?: boolean, official?: boolean, contrast?: number}>;
  ITEMS?: ItemRow[];
  /** [score, demand, supply, rank, how, usage %, ladder size] */
  GTSDIFF?: Record<string, [number, number, number, number | null, string,
                            number | null, number]>;
  /** a species the GTS refuses, as the player confirmed it in game */
  GTSBLOCK?: Record<string, {confirmed: string, note: string}>;
  MYTHICAL?: string[];
  /** ability -> Champions' description */
  ABIL: Record<string, string>;
  /** ability -> the moves it changes (scripts/build_ability_moves.py) */
  AB_MOVES?: Record<string, AbilityMoves>;
  /** move -> the items made for it ("for") or that answer it ("against") */
  ITEM_FOR_MOVE?: Record<string, [string, "for" | "against"][]>;
  /** item, ability or move -> Smogon's sentence and its chips [text, why] */
  EFFECTS?: Record<string, {kind: string, desc?: string, c?: [string, string][]}>;
  /** dex name -> the other spellings that mean the same Pokemon */
  COSMETIC?: Record<string, string[]>;
  /** name -> sprite file id: a number, or "493-ice" for a form */
  SPRITE_ID?: Record<string, SpriteId>;
  /** base -> form -> the sprite one dex row cannot give (female Meowstic) */
  FORM_SPRITE?: Record<string, Record<string, SpriteId>>;
  /** sprite set (n, s, p, ps) -> the ids missing from it */
  SPRITE_GAPS?: Record<string, SpriteId[]>;
  /** the species HOME holds that Champions does not */
  HOME_ONLY?: string[];
  /** the calculator's menus: menu -> the names it offers */
  MODS?: Record<string, string[]>;
  /** every Worlds, newest first: year, and per division its team count
   *  and [name, teams, % of teams] */
  WORLDS?: {y: number, d: Record<string, {n: number,
    top: [string, number, number][]}>}[];
  /** the regulation, the day it started, the day usage was read */
  REG?: string;
  REG_STARTED?: string;
  USAGE_AT?: string;
  /** dex name -> the name Smogon's engine knows it by */
  SMOGON_NAME?: Record<string, string>;
  /** the form Aegislash is in when attacking and when defending */
  AEGIS?: {attacking: string, defending: string};
  /** ability -> the items made for it */
  ITEM_FOR_ABILITY?: Record<string, string[]>;
  /** ability -> its class, and each class's label */
  AB_CLASS?: Record<string, string>;
  AB_CLASS_LABEL?: Record<string, string>;
  /** status -> what it does in Champions, measured or sourced */
  STATUSES?: Record<string, StatusRule>;
}

type SpriteId = number | string;

/** [name, VP (null: not sold), category, text, where it comes from, whose
 *  text, why it matters, abilities it is for, moves it is for] */
type ItemRow = [string, number | null, string, string, string, string, string,
                string[], string[]];

/** One number a status applies, and where it came from. */
interface StatusFact { value: number; source: string; was?: number; note?: string; }
interface StatusRule {
  short: string;
  moves?: string[];
  rebalanced_in_champions?: boolean;
  champions_confirmed?: boolean;
  serebii_prior?: string;
  serebii_new?: string;
  speed?: StatusFact; skip_turn?: StatusFact; thaw?: StatusFact;
  wake_turn2?: StatusFact; wake_turn3?: StatusFact; physical?: StatusFact;
  chip?: StatusFact; self_hit?: StatusFact;
}

/** What one ability does to moves. `m`, `up`, `down`, `stop` and `ally` are
 *  indices into MOVES; ui/moves.js explains each field. */
interface AbilityMoves {
  side: "off" | "def";
  m?: number[]; all?: number; up?: number[]; down?: number[];
  x?: number | null; why?: string | null; why_up?: string; why_down?: string;
  scope?: string; stop?: number[]; ally?: number[];
}

/** A form of a species Champions does not have, from HOME_DEX. `mega` is the
 *  stone's letter on a Mega ("" or "X"), absent on a battle form. */
interface OutsideForm {
  n: string; t?: string[]; b?: number[]; ab?: string[]; sp?: number;
  mega?: string; k?: string; by?: string;
}

/** One Worlds top-8 set: year, division, rank, player, record, item,
 *  ability, nature, moves. */
interface PodiumSet {
  y: number; d: string; r: number; who: string; rec: string;
  it?: string; ab?: string; na?: string; mv?: string[];
  /** the Mega its stone made, and that Mega's ability */
  mg?: string; mgab?: string;
}

/** One Smogon VGC analysis (tracker/analysis.js), and a set inside it. */
interface SmogonAnalysis {
  format: string; outdated?: boolean; credits?: string[]; overview?: string;
  sets?: SmogonSet[];
}
interface SmogonSet {
  name?: string; ability?: string[]; nature?: string[]; item?: string[];
  /** each slot is one move or its alternatives */
  moves?: (string | string[])[];
  sp?: SpSpread[]; why?: string;
}

/** tracker/outsidedex.js: what the app knows of species Champions lacks. */
interface OutsideDex {
  /** species -> the moves it learns */
  m?: Record<string, string[]>;
  /** move -> [type, cat, bp, acc, pp, text]; a move with no text omits it */
  mv?: Record<string, [string, "P" | "S" | "T", number, number | null, number, string?]>;
  /** ability -> its main-series description */
  ab?: Record<string, string>;
}

/** A section of pokebase's per-Pokemon usage: "m" moves, "i" items, "a"
 *  abilities, "n" natures, "t" teammates. */
type UsageSection = "m" | "i" | "a" | "n" | "t";
/** One Pokemon's usage: each section's [what, %] rows, highest first, and
 *  "s", the spreads, each [hp, atk, def, spa, spd, spe, %]. */
type SplitTable = Partial<Record<UsageSection, [string, number][]>> & {s?: number[][]};

/* ----------------------------------------------------- the rows data.js makes */
/** A Pokemon as every card draws it: a dex row, a Mega, a battle form or a
 *  row for a species Champions does not have - one shape for all four. */
interface DexRow {
  name: string;
  species: string;
  types: string[];
  /** base stats, in STAT_KEYS order */
  b: number[];
  ab: string[];
  mega?: boolean;
  dex?: number;
  /** a row from outside Champions (main-series numbers), for display only */
  outside?: boolean;
  approx?: string | null;
  forms?: OutsideForm[] | null;
  /** a battle form: its label, the ability that makes it, its sprite */
  battle?: string;
  by?: string;
  sp?: number;
  /** an outside Mega's stone letter */
  sfx?: string;
}

interface Move {
  /** index in C.MOVES, -1 for a move the page does not ship */
  i: number;
  name: string;
  type: string;
  /** P physical, S special, T status */
  cat: "P" | "S" | "T";
  bp: number;
  acc: number | null;
  pp: number;
  pri: number;
  target: string;
  spread: boolean;
  hitsAlly: boolean;
  hits: [number, number] | null;
  crit: boolean;
  f: string;
  text: string;
  sec?: boolean;
  notInChampions?: boolean;
}

/** A sheet's or an editor's body. A builder may hang its own state on it,
 *  under a `_` name, and resetHost (core/dom.js) clears every one of them
 *  before the next builder runs. */
interface SheetBody extends HTMLElement {
  /** ui/pokemon.js: the base form's box, where its abilities go */
  _basePanel?: HTMLElement;
  /** tabs/box.js, the add sheet: the copy's switches and how it came */
  _marks?: {shiny: boolean, trained: boolean};
  _mode?: {v: string | null};
}

/* ------------------------------------------------- the ledger, as S holds it */
type BoxLocation = "champions" | "home";
type Origin = "home" | "champions" | "unknown";

interface BoxRow {
  name: string;
  location: BoxLocation;
  status: "permanent" | "rental";
  origin: Origin;
  note: string;
  shiny: boolean;
  trained: boolean;
  order: number;
  updated: string;
  /** its id, set by whoever listed it (the record does not carry it) */
  _id?: string;
}

/** A box row as the lists hand it out: with its id, which boxRows() sets. */
type ListedBox = BoxRow & { _id: string };
/** A trade as the GTS lists hand it out: with its id. */
type ListedTrade = Trade & { _id: string };

interface Build {
  pokemon: string;
  /** the box row running it; null for an idea */
  box_id: string | null;
  mega: string | null;
  ability: string | null;
  mega_ability: string | null;
  nature: string | null;
  stat_points: SpSpread;
  moves: string[];
  role: string;
  rationale: string;
  extra: Record<string, unknown>;
  updated: string;
}

/** One of a team's six slots: the build it points at, and the item it holds
 *  (the Item Clause puts the item on the slot, never on the build). */
interface TeamSlot {
  build_id?: string;
  item?: string;
  /** his one line on why this slot holds this item */
  why?: string;
}

interface Team {
  name: string;
  slots: TeamSlot[];
  notes: Record<string, string>;
  updated: string;
}

/** One trade, from the deposit to the close. Anything that is not a column
 *  is what the trade measured, spread back onto the record. */
interface Trade {
  offered: string;
  requested: string;
  offeredId: string | null;
  deposited: string | null;
  depositedAt: string | null;
  closed: string | true | null;
  closedAt: string | null;
  note: string;
  status: "TRADED" | "PENDING";
  updated?: string;
  _id?: string;
  /* what the trade measured, written when it closes (tabs/gts.js closeTrade) */
  days?: number | null;
  tookMs?: number | null;
  gaveShiny?: boolean;
  gaveBst?: number;
  gaveValue?: number;
  gotBst?: number;
  /** the ladder rank of what was asked for, when the offer went up */
  rankAtDeposit?: number | null;
  /** a trade logged after the fact, from memory */
  backfilled?: boolean;
  /** anything else a trade measures lands in the row's jsonb: no migration */
  [measured: string]: unknown;
}

/** An owned stone or item: the row existing is the fact. */
interface Owned { updated: string; }

interface Trainer { box_capacity?: number; updated?: string; [setting: string]: unknown; }

type Table = "box" | "builds" | "teams" | "stones" | "items" | "gts" | "meta";

interface Ledger {
  sb: import("@supabase/supabase-js").SupabaseClient;
  uid: string;
  /** the database rows of each table, by id */
  cache: Partial<Record<Table, Record<string, any>>>;
}

/** S: the ledger loaded into the page, one map per table, plus the
 *  connection, whether the box has loaded, and the screen showing. */
interface AppState {
  box: Record<string, BoxRow>;
  builds: Record<string, Build>;
  teams: Record<string, Team>;
  stones: Record<string, Owned>;
  items: Record<string, Owned>;
  gts: Record<string, Trade>;
  meta: {trainer?: Trainer};
  db: Ledger | null;
  ready: boolean;
  tab: string;
}

/* ------------------------------------------- Smogon's engine, as the page uses it
   tracker/engine.bundle.js is Smogon's vendored calculator, compiled JS with no
   types of its own, so this names only what tabs/damage.js calls on it. */
/** What one side hands the engine: Stat Points as evs, stages as boosts. */
interface EngineSide {
  evs: Partial<Record<Stat, number>>; boosts: Partial<Record<Stat, number>>;
  nature?: string; ability?: string; item?: string; status?: string; curHP?: number;
}
interface EnginePokemon { maxHP(): number; curHP(): number; }
/** A calculation: one roll list, or one per hit for a multi-hit move. */
interface EngineResult {
  damage: number | number[] | number[][];
  desc(): string;
  koChanceText?(): string;
}
interface SmogonEngine {
  gen: unknown;
  Pokemon: new (gen: unknown, name: string, side: EngineSide) => EnginePokemon;
  Move: new (gen: unknown, name: string, opts: {isCrit: boolean}) => object;
  Field: new (field: object) => object;
  calculate(gen: unknown, attacker: EnginePokemon, defender: EnginePokemon,
            move: object, field: object): EngineResult;
}

/** What the page finds on window before any part runs. */
interface Window {
  CHAMP: Champ;                     // tracker/data.js, the dex
  /** tracker/splits.js: the tournaments it covers, when, per Pokemon */
  CHAMP_SPLITS?: {r?: string, f?: string, p?: Record<string, SplitTable>};
  CHAMP_ANALYSIS?: Record<string, SmogonAnalysis[]>;  // tracker/analysis.js, on demand
  CHAMP_OUTSIDE?: OutsideDex;       // tracker/outsidedex.js, loaded on demand
  CHAMP_ANALYSIS_URL: string;       // '' in the single-file build
  CHAMP_OUTSIDE_URL: string;
  CHAMP_BUILD?: string;             // when the page was built
  CHAMP_CONFIG?: {supabase?: {url: string, key: string}};
  SMOGON?: SmogonEngine;            // tracker/engine.bundle.js, Smogon's calc
  supabase?: typeof import("@supabase/supabase-js");
}
