/**
 * What Live PokeMap sends and expects, read off the bundle `play.livepokemap.com` serves. Every field name here is the
 * page's own, cited to the function that reads or writes it, so that a rename upstream can be found by searching the
 * new bundle for the old name. The chunk file names change with every deploy; the function bodies quoted do not.
 *
 * The request wrapper every API call goes through (`f` in the chunk exporting `fetchViewportData`):
 *
 * ```js
 * let r={"Content-Type":"application/json",...n?.headers||{}};
 * if(i&&(r.Authorization=`Bearer ${i}`), …
 * let c=await fetch(`${t()}${e}`,{...n,headers:r});401===c.status&&s();
 * …if(a&&!1===a.success&&a.error)throw new g(a.error,c.status);
 * return a&&!0===a.success&&void 0!==a.data?a.data:a
 * ```
 *
 * So a body is either the answer itself or `{success: true, data}`, and a failure is `{success: false, error: {code,
 * message}}` — `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}` for a viewport
 * asked without a token, which is what `unwrap` below takes apart.
 */

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
  speciesFilterMode: 'off' | 'blocklist' | 'allowlist';
  speciesFilterList: number[];
  showPvpGreatLeague: boolean;
  showPvpUltraLeague: boolean;
  showPvpLittleLeague: boolean;
  pvpMaxRank: number;
  showMyShinies: boolean;
  shinyOnly: boolean;
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
 * An imported filter is spread over these rather than over anything the reader had, which is why a query file is
 * read the same way: a field it leaves out is this value, exactly as it would be on the map.
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
 * The filter as the viewport request carries it, in the page's own order:
 *
 * ```js
 * c={show_all:o.showAll,min_iv:o.minIV,max_iv:o.maxIV,min_level:o.minLevel,max_level:o.maxLevel,
 *    always_show_perfect:o.alwaysShowPerfect,always_show_zero:o.alwaysShowZero,always_show_rare:o.alwaysShowRare,
 *    always_show_size:o.alwaysShowSize,filter_xxs:o.filterXXS,filter_xxl:o.filterXXL,
 *    species_filter_mode:o.speciesFilterMode,species_filter_list:o.speciesFilterList,
 *    show_pvp_great:o.showPvpGreatLeague,show_pvp_ultra:o.showPvpUltraLeague,show_pvp_little:o.showPvpLittleLeague,
 *    pvp_max_rank:o.pvpMaxRank,show_my_shinies:o.showMyShinies,shiny_only:o.shinyOnly}
 * ```
 */
export function wireFilter(config: FilterConfig) {
  return {
    show_all: config.showAll,
    min_iv: config.minIV,
    max_iv: config.maxIV,
    min_level: config.minLevel,
    max_level: config.maxLevel,
    always_show_perfect: config.alwaysShowPerfect,
    always_show_zero: config.alwaysShowZero,
    always_show_rare: config.alwaysShowRare,
    always_show_size: config.alwaysShowSize,
    filter_xxs: config.filterXXS,
    filter_xxl: config.filterXXL,
    species_filter_mode: config.speciesFilterMode,
    species_filter_list: config.speciesFilterList,
    show_pvp_great: config.showPvpGreatLeague,
    show_pvp_ultra: config.showPvpUltraLeague,
    show_pvp_little: config.showPvpLittleLeague,
    pvp_max_rank: config.pvpMaxRank,
    show_my_shinies: config.showMyShinies,
    shiny_only: config.shinyOnly,
  };
}

/**
 * The body of `POST /api/map/viewport`, as `fetchViewportData` builds it:
 *
 * ```js
 * let c={min_lat:e,max_lat:n,min_lon:t,max_lon:a,zoom:i};return r&&(c.display_filters=r),s&&(c.event=!0),
 *   f("/api/map/viewport",{method:"POST",body:JSON.stringify(c),signal:o})
 * ```
 *
 * `event` is sent only in event mode, which a watcher has no view of, so it is never sent.
 */
export interface ViewportRequest {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  zoom: number;
  display_filters: ReturnType<typeof wireFilter>;
}

/**
 * The world, as the viewport of a map zoomed all the way out. **Not checked against a capture**: the bounds a real tab
 * sends depend on its window and on the 30% the page pads them by (`wx(e,.3)`), so the HAR in #189 is what to compare
 * these with. What they need to be is wide enough that the server answers with `span_tier: "perfect"`, whose span
 * `/api/config` gives as `span_perfect_km: 20000` — half the Earth's circumference, which any viewport spanning the
 * whole map clears.
 */
export const WORLD = Object.freeze({ min_lat: -85, max_lat: 85, min_lon: -180, max_lon: 180, zoom: 0 });

/** One spawn as the viewport answers it, the fields `wd` reads; anything else on the entry is ignored. */
export interface WireSpawn {
  encounter_id?: string | number;
  dex_id?: number;
  pokemon_name?: string;
  source?: string;
  lat?: number;
  lon?: number;
  form?: number;
  costume?: number;
  gender?: number;
  despawn_ms?: number;
  cp?: number | null;
  level?: number | null;
  iv_attack?: number | null;
  iv_defense?: number | null;
  iv_stamina?: number | null;
  iv_percent?: number | null;
  size?: number | null;
  shiny?: boolean;
}

/** The parts of the viewport's answer this reads, both lists optional as the page treats them (`e.pokemon||[]`). */
export interface ViewportResponse {
  span_tier?: string;
  pokemon?: WireSpawn[];
  my_shiny_pokemon?: WireSpawn[];
  my_shiny_encounters?: (string | number)[];
  shiny_access?: boolean;
  /** Read by the page as `setShinyReady(!0===e.shiny_ready)`, and what its `shinyOnly` gate turns on. */
  shiny_ready?: boolean;
}

/** `/api/config`, unauthenticated, of which this reads one field. */
export interface ClientConfig {
  viewport_refresh_seconds?: number;
}

/**
 * The poll interval in milliseconds, as the page derives it:
 *
 * ```js
 * o=1e3*Math.max(r?.viewport_refresh_seconds??15,5)
 * ```
 *
 * Fifteen seconds when the server says nothing, and never under five whatever it says.
 */
export const refreshInterval = (config: ClientConfig): number =>
  1000 * Math.max(config.viewport_refresh_seconds ?? 15, 5);

/**
 * `/api/game_data`, unauthenticated, of which this reads the names: `pokemon_names` by dex number, and each species'
 * `forms` by form number. The page loads it once at start (`fetchGameData`) and names a spawn with it, which is where a
 * notification's names come from too.
 */
export interface GameData {
  pokemon_names?: Record<string, string>;
  pokemon?: Record<string, { name?: string; default_form_id?: number; forms?: Record<string, { name?: string }> }>;
}

/** Size as the game numbers it: the detail card writes `1===e.size?"XXS":2===e.size?"XS":4===e.size?"XL":"XXL"`. */
export const XXS = 1;
export const XXL = 5;

/** A spawn with its fields made definite, as `wd` makes them. */
export interface Spawn {
  encounterId: string;
  dexId: number;
  name: string;
  form: number;
  lat: number;
  lon: number;
  despawnMs: number | null;
  cp: number | null;
  level: number | null;
  iv: { attack: number; defense: number; stamina: number } | null;
  ivPercent: number | null;
  size: number | null;
  shiny: boolean;
}

/**
 * The fields of `wd`, without its defaulting of missing IVs to 0 on an encountered spawn: a notification saying 0/0/0
 * of a Pokémon nobody read is worse than one saying nothing.
 */
export function toSpawn(wire: WireSpawn): Spawn {
  const number = (value: number | null | undefined) => (value === null || value === undefined ? null : Number(value));
  const [attack, defense, stamina] = [number(wire.iv_attack), number(wire.iv_defense), number(wire.iv_stamina)];

  return {
    encounterId: String(wire.encounter_id ?? ''),
    dexId: Number(wire.dex_id ?? 0),
    name: String(wire.pokemon_name ?? ''),
    form: Number(wire.form ?? 0),
    lat: Number(wire.lat ?? 0),
    lon: Number(wire.lon ?? 0),
    despawnMs: wire.despawn_ms ? Number(wire.despawn_ms) : null,
    cp: number(wire.cp),
    level: number(wire.level),
    iv: attack === null || defense === null || stamina === null ? null : { attack, defense, stamina },
    ivPercent: number(wire.iv_percent),
    size: number(wire.size),
    shiny: wire.shiny === true,
  };
}

/** A failure the server explained, with the HTTP status it came under. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** A body the way the request wrapper above hands it on: the `data` of a success, or an `ApiError` of a failure. */
export function unwrap(body: unknown, status: number, ok: boolean): unknown {
  const envelope = (body ?? {}) as { success?: boolean; data?: unknown; error?: { code?: string; message?: string } };

  if (envelope.success === false && envelope.error) {
    throw new ApiError(envelope.error.message ?? `Request failed: ${status}`, status, envelope.error.code);
  }

  if (!ok) {
    throw new ApiError(`Request failed: ${status}`, status);
  }

  return envelope.success === true && envelope.data !== undefined ? envelope.data : body;
}
