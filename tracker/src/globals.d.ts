// The types every part shares, declared globally so a JSDoc names them with
// no import: the payloads the page finds on window, the rows data.js unpacks
// them into, and the ledger's records as store.js hands them to S.

type Stat = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
/** A Stat Point spread: only the stats that got some. */
type SpSpread = Partial<Record<Stat, number>>;

/* ------------------------------------------------- the dex payload (CHAMP) */
/** window.CHAMP, written by build_tracker_data.py. Positional rows keep it
 *  small; data.js is the one reader of the positions. A field core/ does not
 *  read yet is `any` until a layer that reads it is typed. */
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
  TYPE_COLORS?: Record<string, {top: string, bottom?: string, ink?: string}>;
  /** [name, VP, category, text, ...] */
  ITEMS?: [string, number, string, string, ...any[]][];
  /** [score, demand, supply, rank, how, usage %, ladder size] */
  GTSDIFF?: Record<string, [number, number, number, number | null, string,
                            number | null, number]>;
  GTSBLOCK?: Record<string, unknown>;
  MYTHICAL?: string[];
  [field: string]: any;
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
}

/** pokebase's per-Pokemon usage: section ("m" moves, "i" items, "a"
 *  abilities, "n" natures, "t" teammates...) -> [what, %] rows, highest first. */
type SplitTable = Record<string, [string, number][]>;

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
  extra: Record<string, any>;
  updated: string;
}

/** One of a team's six slots: the build it points at, and the item it holds
 *  (the Item Clause puts the item on the slot, never on the build). */
interface TeamSlot {
  build_id?: string;
  item?: string;
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
  [measured: string]: any;
}

/** An owned stone or item: the row existing is the fact. */
interface Owned { updated: string; }

interface Trainer { box_capacity?: number; [setting: string]: any; }

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

/** What the page finds on window before any part runs. */
interface Window {
  CHAMP: Champ;                     // tracker/data.js, the dex
  CHAMP_SPLITS?: {r?: string, p?: Record<string, SplitTable>, [k: string]: any};
  CHAMP_ANALYSIS?: Record<string, any>;  // tracker/analysis.js, loaded on demand
  CHAMP_OUTSIDE?: Record<string, any>;   // tracker/outsidedex.js, loaded on demand
  CHAMP_ANALYSIS_URL: string;       // '' in the single-file build
  CHAMP_OUTSIDE_URL: string;
  CHAMP_BUILD?: string;             // when the page was built
  CHAMP_CONFIG?: {supabase?: {url: string, key: string}};
  SMOGON: any;                      // tracker/engine.bundle.js, Smogon's calc
  supabase?: typeof import("@supabase/supabase-js");
}
