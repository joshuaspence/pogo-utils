/**
 * A query is a Live PokeMap display filter — the `{"_lpm_display_filter": true, "config": {…}}` file its Export writes
 * and `src/livepokemap/display-filter.ts` produces — and a spawn is wanted by it where the map would draw that spawn
 * under that filter. The test is the page's own, transcribed below as `shows`, and run here on every spawn rather than
 * trusted to the server, which applies the filter differently to each list it answers with.
 *
 * Seen from the whole world, the viewport answers with two lists. `pokemon` holds every 100% IV spawn with the species
 * list _not_ applied, and `my_shiny_pokemon` shinies that _are_ on it. So:
 *
 * - An entry of `pokemon` is wanted where `shows` passes it, which is what the map does with it.
 * - An entry of `my_shiny_pokemon` is wanted where the query's species filter admits it. The map would also want
 *   `showMyShinies` on before it drew one, and an imported filter has it off unless it says otherwise — including the
 *   shiny hunt the Integrations page copies, which names a species list and nothing else. A watcher exists for the
 *   shinies the hunt names, so the list a query was written to name is what decides.
 *
 * Anything else a filter asks for — a 90% spawn, an XXL below 100%, a PvP rank — the world view cannot hold at all,
 * and `blindSpots` says so at start-up rather than leaving the query to wait silently.
 */

import { FILTER_DEFAULTS, XXL, XXS, type FilterConfig, type Spawn } from './wire.mts';

export interface Query {
  /** The file it was read from, for messages. */
  name: string;
  config: FilterConfig;
}

/**
 * A display filter's text as a query, validated the way Live PokeMap validates it on import —
 *
 * ```js
 * let a = JSON.parse(e);
 * if (!a || !0 !== a._lpm_display_filter || !a.config) return !1;
 * ```
 *
 * — and spread over the defaults, as the importer spreads it. Each field is also checked to be of the type the
 * defaults give it, which the importer does not do: there, a wrong type is a filter that draws oddly, and here it
 * would be a watcher that never fires.
 */
export function parseQuery(name: string, text: string): Query {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${name}: not JSON (${(error as Error).message})`, { cause: error });
  }

  const file = parsed as { _lpm_display_filter?: unknown; config?: unknown } | null;

  if (!file || file._lpm_display_filter !== true || !file.config || typeof file.config !== 'object') {
    throw new Error(`${name}: not a Live PokeMap display filter (no "_lpm_display_filter": true and "config")`);
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
      throw new Error(
        `${name}: config.${key} is ${JSON.stringify(value)}, where Live PokeMap expects a ${kind(fallback)}`,
      );
    }

    (config as unknown as Record<string, unknown>)[key] = value;
  }

  if (!['off', 'blocklist', 'allowlist'].includes(config.speciesFilterMode)) {
    throw new Error(`${name}: config.speciesFilterMode is ${JSON.stringify(config.speciesFilterMode)}`);
  }

  return { name, config };
}

const kind = (value: unknown) => (Array.isArray(value) ? 'list of dex numbers' : typeof value);

/**
 * Whether the map draws `spawn` under `filter`, transcribed from the page with `isRare` left out:
 *
 * ```js
 * function h(e,t,a){
 *   if(t.showAll&&0===t.minIV&&100===t.maxIV&&0===t.minLevel&&50===t.maxLevel&&!t.filterXXS&&!t.filterXXL
 *      &&"off"===t.speciesFilterMode&&!t.showPvpGreatLeague&&!t.showPvpUltraLeague&&!t.showPvpLittleLeague)return!0;
 *   if(null==e.ivPercent)return t.showAll&&0===t.minIV&&100===t.maxIV;
 *   let s=e.ivPercent;
 *   if(s>=100&&t.alwaysShowPerfect||0===s&&t.alwaysShowZero||t.alwaysShowRare&&a?.(e.dexId)
 *      ||t.alwaysShowSize&&null!=e.size&&(1===e.size||5===e.size))return!0;
 *   if("blocklist"===t.speciesFilterMode&&t.speciesFilterList.includes(e.dexId)
 *      ||"allowlist"===t.speciesFilterMode&&!t.speciesFilterList.includes(e.dexId))return!1;
 *   if(t.showPvpGreatLeague&&null!=e.pvpGreatRank&&e.pvpGreatRank<=t.pvpMaxRank||…)return!0;
 *   if(s<t.minIV||s>t.maxIV||null!=e.level&&(t.minLevel>0&&e.level<t.minLevel||t.maxLevel<50&&e.level>t.maxLevel))
 *     return!1;
 *   if(t.filterXXS||t.filterXXL){let a=1===e.size,s=5===e.size;if(!(t.filterXXS&&a)&&!(t.filterXXL&&s))return!1}
 *   return!0}
 * ```
 *
 * `a` is the rarity table the page fetches from an endpoint of its own, and the PvP ranks are never in the world
 * view's lists, so both are dropped; `blindSpots` names them for a query that asks for either.
 */
export function shows(spawn: Spawn, filter: FilterConfig): boolean {
  if (
    filter.showAll &&
    filter.minIV === 0 &&
    filter.maxIV === 100 &&
    filter.minLevel === 0 &&
    filter.maxLevel === 50 &&
    !filter.filterXXS &&
    !filter.filterXXL &&
    filter.speciesFilterMode === 'off' &&
    !filter.showPvpGreatLeague &&
    !filter.showPvpUltraLeague &&
    !filter.showPvpLittleLeague
  ) {
    return true;
  }

  const iv = spawn.ivPercent;

  if (iv === null) {
    return filter.showAll && filter.minIV === 0 && filter.maxIV === 100;
  }

  if (
    (iv >= 100 && filter.alwaysShowPerfect) ||
    (iv === 0 && filter.alwaysShowZero) ||
    (filter.alwaysShowSize && (spawn.size === XXS || spawn.size === XXL))
  ) {
    return true;
  }

  if (!admits(filter, spawn.dexId)) {
    return false;
  }

  if (
    iv < filter.minIV ||
    iv > filter.maxIV ||
    (spawn.level !== null &&
      ((filter.minLevel > 0 && spawn.level < filter.minLevel) ||
        (filter.maxLevel < 50 && spawn.level > filter.maxLevel)))
  ) {
    return false;
  }

  if (filter.filterXXS || filter.filterXXL) {
    return (filter.filterXXS && spawn.size === XXS) || (filter.filterXXL && spawn.size === XXL);
  }

  return true;
}

/** Whether the species filter lets `dex` through, the one clause of `shows` that names a species. */
export function admits(filter: FilterConfig, dex: number): boolean {
  switch (filter.speciesFilterMode) {
    case 'allowlist':
      return filter.speciesFilterList.includes(dex);
    case 'blocklist':
      return !filter.speciesFilterList.includes(dex);
    default:
      return true;
  }
}

/** Which of the two lists a spawn arrived in. */
export type List = 'pokemon' | 'my_shiny_pokemon';

/**
 * Whether `query` wants `spawn`, seen in `list`. `shiny` is whether it is known to be shiny by any route — its own
 * flag, its encounter among `my_shiny_encounters`, or its appearing in `my_shiny_pokemon` at all.
 *
 * `shinyOnly` holds back a non-shiny spawn only where `showMyShinies` is also on, which is what the page does
 * (`!(s.shinyOnly&&eo)||t.shiny||…`, `eo` being `showMyShinies` with shiny access).
 */
export function wants(query: Query, spawn: Spawn, list: List, shiny: boolean): boolean {
  const { config } = query;

  if (spawn.dexId <= 0) {
    return false;
  }

  if (list === 'my_shiny_pokemon') {
    return admits(config, spawn.dexId);
  }

  return shows(spawn, config) && (!(config.shinyOnly && config.showMyShinies) || shiny);
}

/**
 * What a query asks for that the world view cannot show it, as phrases for one start-up line — empty where everything
 * it wants is something the two lists can hold.
 *
 * At the world's span the server answers only the 100% spawns and the account's shinies: `/api/config` gives the span
 * each kind is served to as `span_perfect_km: 20000`, `span_size_km: 50`, `span_zero_km: 100` and `span_all_km: 10`.
 * So everything but those two is out of sight, and this lists which of those things the filter would have drawn.
 */
export function blindSpots(filter: FilterConfig): string[] {
  const missing: string[] = [];
  const shinyOnly = filter.shinyOnly && filter.showMyShinies;

  if (shinyOnly) {
    return missing;
  }

  if (filter.showAll) {
    missing.push('every spawn ("Show All")');
  } else if (filter.minIV < 100 && filter.maxIV >= filter.minIV) {
    const sizes = [filter.filterXXL && 'XXL', filter.filterXXS && 'XXS'].filter(Boolean).join(' and ');

    missing.push(`${sizes ? `${sizes} ` : ''}spawns from ${filter.minIV}% to 99% IV`);
  }

  if (filter.alwaysShowZero) {
    missing.push('0% spawns');
  }

  if (filter.alwaysShowSize) {
    missing.push('XXL and XXS spawns below 100%');
  }

  if (filter.alwaysShowRare) {
    missing.push('rare species');
  }

  if (filter.showPvpGreatLeague || filter.showPvpUltraLeague || filter.showPvpLittleLeague) {
    missing.push('PvP ranks');
  }

  return missing;
}

/**
 * One filter wide enough for every query, sent with the one viewport request a poll makes. The server narrows its
 * shiny list by the species list it is sent, so the union has to admit every species any query admits; everything
 * else is matched locally, so the rest only has to be no narrower than any query.
 */
export function widest(queries: readonly Query[]): FilterConfig {
  const configs = queries.map((query) => query.config);
  const any = (pick: (config: FilterConfig) => boolean) => configs.some(pick);
  const every = (pick: (config: FilterConfig) => boolean) => configs.every(pick);

  const allowlists = configs.filter((config) => config.speciesFilterMode === 'allowlist');
  const allowlistOnly = allowlists.length === configs.length;

  return {
    showAll: any((config) => config.showAll),
    minIV: Math.min(...configs.map((config) => config.minIV)),
    maxIV: Math.max(...configs.map((config) => config.maxIV)),
    alwaysShowPerfect: any((config) => config.alwaysShowPerfect),
    alwaysShowZero: any((config) => config.alwaysShowZero),
    alwaysShowRare: any((config) => config.alwaysShowRare),
    alwaysShowSize: any((config) => config.alwaysShowSize),
    // Narrowing, so set only where every query narrows — and then to every size any of them keeps.
    filterXXS: every((config) => config.filterXXS || config.filterXXL) && any((config) => config.filterXXS),
    filterXXL: every((config) => config.filterXXS || config.filterXXL) && any((config) => config.filterXXL),
    minLevel: Math.min(...configs.map((config) => config.minLevel)),
    maxLevel: Math.max(...configs.map((config) => config.maxLevel)),
    speciesFilterMode: allowlistOnly ? 'allowlist' : 'off',
    speciesFilterList: allowlistOnly
      ? [...new Set(allowlists.flatMap((config) => config.speciesFilterList))].sort((a, b) => a - b)
      : [],
    showPvpGreatLeague: any((config) => config.showPvpGreatLeague),
    showPvpUltraLeague: any((config) => config.showPvpUltraLeague),
    showPvpLittleLeague: any((config) => config.showPvpLittleLeague),
    pvpMaxRank: Math.max(...configs.map((config) => config.pvpMaxRank)),
    // On whatever the queries say: the shiny list is what a watcher is for, and the server may hold it back without.
    showMyShinies: true,
    shinyOnly: every((config) => config.shinyOnly && config.showMyShinies),
  };
}
