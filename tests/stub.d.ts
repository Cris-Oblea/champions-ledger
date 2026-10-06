// What the harness's stubbed ledger leaves on window (harness.js stub()) for
// the tests that assert what the app sent. A row is as the app wrote it, so
// its columns depend on the table: the database boundary, typed as loosely
// here as in tracker/src/core/store.js.
interface Window {
  /** every insert and upsert, in order */
  __WROTE: {op: "insert" | "upsert", table: string, row: Record<string, any>}[];
  /** every delete, as the column and value it matched */
  __DELETED: {table: string, col: string, id: string}[];
  /** the tables the stub serves */
  __DB: Record<string, Record<string, any>[]>;
  /** ids a table holds that this device never loaded, per table */
  __TAKEN: Record<string, string[]>;
}
