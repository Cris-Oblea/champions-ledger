// What the page finds on window before any part runs: the payloads the build
// writes as one assignment each (tracker/*.js), the config, and supabase-js.
// The payloads are `any` until their shapes are typed where they are unpacked.
interface Window {
  CHAMP: any;                       // tracker/data.js, the dex
  CHAMP_SPLITS: any;                // tracker/splits.js, pokebase's usage splits
  CHAMP_ANALYSIS?: Record<string, any>;  // tracker/analysis.js, loaded on demand
  CHAMP_OUTSIDE?: Record<string, any>;   // tracker/outsidedex.js, loaded on demand
  CHAMP_ANALYSIS_URL: string;       // '' in the single-file build
  CHAMP_OUTSIDE_URL: string;
  CHAMP_BUILD?: string;             // when the page was built
  CHAMP_CONFIG?: {supabase?: {url: string, key: string}};
  SMOGON: any;                      // tracker/engine.bundle.js, Smogon's calc
  supabase?: typeof import("@supabase/supabase-js");
}
