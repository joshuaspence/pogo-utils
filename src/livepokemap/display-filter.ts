/**
 * The Live PokeMap display filter this collection's shiny hunt makes.
 *
 * Live PokeMap has two separate import formats and only this one can carry a species list. Its settings file — the
 * `{_version: 1, settings: {…}}` one its own Config export writes — honours a seven-key allowlist of UI preferences and
 * silently drops everything else, so a hunt list cannot be expressed in it at all. Display filters round-trip instead
 * as the JSON below, sentinel and all, pasted into its import box — which is why the page copies this to the clipboard
 * rather than offering a file: that format has no picker.
 *
 * Only the shiny hunt is written. XXL, XXS and 100% are thresholds rather than lists — `filterXXL`, `filterXXS` and
 * `minIV` say them without naming a species, and Live PokeMap surfaces all three unconditionally anyway, its
 * `alwaysShowSize` and `alwaysShowPerfect` defaulting on. Which species still want a shiny is the one thing it cannot
 * work out for itself.
 */

import { species, SHINY_HUNTING_FILTERS } from '../filters/narrow.js';
import SHINY_POKEMON from '../filters/shiny.js';

/**
 * `true` exactly: the importer compares it with `===`, so a truthy stand-in is rejected along with the whole file.
 * There is no `_version` here — unlike the settings format, this one is validated by the sentinel and nothing else.
 */
const SENTINEL = true;

export interface DisplayFilter {
  _lpm_display_filter: typeof SENTINEL;

  /**
   * Only the two fields this repository has an opinion about. The importer spreads `config` over Live PokeMap's own
   * defaults rather than over the reader's current values, so every field left out here returns to its default — which
   * is why writing the other seventeen would mean asserting values this collection knows nothing about, and why the
   * page says plainly that importing replaces the lot.
   *
   * `shinyOnly` is deliberately absent, which is safe only because its default is `false` — `shinyOnly:!1` in the
   * defaults object of `chunks/0211aa2db0c7372e.js`. It shows only spawns already known to be shiny, which a scanner
   * cannot know of a wild encounter before something checks it, so a `true` here would hide the species being hunted.
   *
   * `speciesFilterMode` takes `off`, `blocklist` or `allowlist`: the mode switch in `chunks/f024cc8ca4c101c1.js`
   * renders its three buttons from `["off","blocklist","allowlist"].map(…)`. `speciesFilterList` is read as numbers —
   * the same chunk hands it to the picker grid as `selectedDexIds`, which builds it with `n.add(entry.dex)`.
   */
  config: {
    speciesFilterMode: 'allowlist';
    speciesFilterList: number[];
  };

  exported_at: string;
}

/**
 * The clock is a parameter so the artifact is reproducible under test. Live PokeMap writes `exported_at` and never
 * reads it back, so nothing turns on its value — only on two exports of the same hunt being comparable.
 */
export function shinyHuntFilter(now = new Date()): DisplayFilter {
  return {
    _lpm_display_filter: SENTINEL,
    config: {
      speciesFilterMode: 'allowlist',
      speciesFilterList: species(SHINY_POKEMON, ...SHINY_HUNTING_FILTERS).map(Number),
    },
    exported_at: now.toISOString(),
  };
}

/** Indented two, as Live PokeMap's own export is: this goes to a clipboard and may well be looked at on the way. */
export const displayFilterText = (filter: DisplayFilter) => JSON.stringify(filter, null, 2);
