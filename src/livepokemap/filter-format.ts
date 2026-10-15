/**
 * Live PokeMap's display filter format, as both halves of this repository read it: `display-filter.ts` writes one for
 * the Integrations page to copy, and the watcher in `src/tools/watch/` reads one back as a query. Shared so that the
 * two cannot drift — a field renamed here is renamed for the writer and the reader at once, and the writer's output is
 * tested against the very check the watcher runs.
 */

/**
 * `true` exactly: the importer compares it with `===`, so a truthy stand-in is rejected along with the whole file.
 * There is no `_version` here — unlike the settings format, this one is validated by the sentinel and nothing else.
 */
export const SENTINEL = true;

/**
 * The species filter's modes, as the mode switch in `chunks/f024cc8ca4c101c1.js` renders its three buttons:
 * `["off","blocklist","allowlist"].map(…)`.
 */
export const SPECIES_FILTER_MODES = ['off', 'blocklist', 'allowlist'] as const;

/** The display filter as the page holds it, with every field it defaults (`M` beside `lpm_display_filters`). */
export interface FilterConfig {
  showAll: boolean;
  minIV: number;
  maxIV: number;
  alwaysShowPerfect: boolean;
  alwaysShowZero: boolean;
  alwaysShowRare: boolean;
  alwaysShowSize: boolean;
  filterXXS: boolean;
  filterXXL: boolean;
  minLevel: number;
  maxLevel: number;
  speciesFilterMode: (typeof SPECIES_FILTER_MODES)[number];
  showPvpGreatLeague: boolean;
  showPvpUltraLeague: boolean;
  showPvpLittleLeague: boolean;
  pvpMaxRank: number;
  showMyShinies: boolean;
  shinyOnly: boolean;

  /**
   * Read as numbers: the same chunk hands it to the picker grid as `selectedDexIds`, which builds it with
   * `n.add(entry.dex)`.
   */
  speciesFilterList: number[];
}

/**
 * Transcribed from the page:
 *
 * ```js
 * M={showAll:!1,minIV:0,maxIV:100,alwaysShowPerfect:!0,alwaysShowZero:!0,alwaysShowRare:!0,alwaysShowSize:!0,
 *    filterXXS:!1,filterXXL:!1,minLevel:0,maxLevel:50,speciesFilterMode:"off",speciesFilterList:[],
 *    showPvpGreatLeague:!1,showPvpUltraLeague:!1,showPvpLittleLeague:!1,pvpMaxRank:10,showMyShinies:!1,
 *    shinyOnly:!1,activePreset:null}
 * ```
 *
 * An imported filter is spread over these rather than over anything the reader had, which is why `readDisplayFilter`
 * reads one the same way: a field it leaves out is this value, exactly as it would be on the map.
 */
export const FILTER_DEFAULTS: Readonly<FilterConfig> = Object.freeze({
  showAll: false,
  minIV: 0,
  maxIV: 100,
  alwaysShowPerfect: true,
  alwaysShowZero: true,
  alwaysShowRare: true,
  alwaysShowSize: true,
  filterXXS: false,
  filterXXL: false,
  minLevel: 0,
  maxLevel: 50,
  speciesFilterMode: 'off',
  speciesFilterList: [],
  showPvpGreatLeague: false,
  showPvpUltraLeague: false,
  showPvpLittleLeague: false,
  pvpMaxRank: 10,
  showMyShinies: false,
  shinyOnly: false,
});

/**
 * A display filter's text as the config it sets, validated the way Live PokeMap validates it on import in
 * `chunks/0211aa2db0c7372e.js` —
 *
 * ```js
 * let a = JSON.parse(e);
 * if (!a || !0 !== a._lpm_display_filter || !a.config) return !1;
 * ```
 *
 * — and spread over the defaults, as the importer spreads it. Each field is also checked to be of the type the
 * defaults give it, which the importer does not do: there, a wrong type is a filter that draws oddly, and to the
 * watcher it would be a query that never fires.
 */
export function readDisplayFilter(text: string): FilterConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`not JSON (${(error as Error).message})`, { cause: error });
  }

  const file = parsed as { _lpm_display_filter?: unknown; config?: unknown } | null;

  if (!file || file._lpm_display_filter !== SENTINEL || !file.config || typeof file.config !== 'object') {
    throw new Error('not a Live PokeMap display filter (no "_lpm_display_filter": true and "config")');
  }

  const config: FilterConfig = { ...FILTER_DEFAULTS, speciesFilterList: [] };
  const given = file.config as Record<string, unknown>;

  for (const [key, fallback] of Object.entries(FILTER_DEFAULTS) as [keyof FilterConfig, unknown][]) {
    if (!Object.hasOwn(given, key)) {
      continue;
    }

    const value = given[key];
    const fits = Array.isArray(fallback)
      ? Array.isArray(value) && value.every((dex) => Number.isInteger(dex))
      : typeof value === typeof fallback;

    if (!fits) {
      throw new Error(`config.${key} is ${JSON.stringify(value)}, where Live PokeMap expects a ${kind(fallback)}`);
    }

    (config as unknown as Record<string, unknown>)[key] = value;
  }

  if (!(SPECIES_FILTER_MODES as readonly string[]).includes(config.speciesFilterMode)) {
    throw new Error(`config.speciesFilterMode is ${JSON.stringify(config.speciesFilterMode)}`);
  }

  return config;
}

const kind = (value: unknown) => (Array.isArray(value) ? 'list of dex numbers' : typeof value);
