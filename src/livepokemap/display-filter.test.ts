import { expect, test } from 'vitest';

import SHINY_POKEMON from '../filters/shiny.js';
import { displayFilterText, shinyHuntFilter, FILE_NAME } from './display-filter.js';

/**
 * Live PokeMap's own validation, transcribed from the function that reads this format in
 * `play.livepokemap.com/_next/static/chunks/0211aa2db0c7372e.js`:
 *
 * ```js
 * let a = JSON.parse(e);
 * if (!a || !0 !== a._lpm_display_filter || !a.config) return !1;
 * ```
 *
 * Said here rather than in the module, because what it guards is this repository's output matching a third party's
 * reader — a question only a test asks.
 */
function accepted(text: string) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }

  return Boolean(parsed) && parsed._lpm_display_filter === true && Boolean(parsed.config);
}

test('the transcribed reader turns away what Live PokeMap turns away', () => {
  // Otherwise every assertion below passes for the wrong reason: a reader that accepts anything cannot report a file
  // this builds wrong.
  expect(accepted('not json at all')).toBe(false);
  expect(accepted('null')).toBe(false);
  expect(accepted(JSON.stringify({ config: {} }))).toBe(false);

  // Truthy is not enough — the sentinel is compared with `===`, so a 1 in its place fails the whole file.
  expect(accepted(JSON.stringify({ _lpm_display_filter: 1, config: {} }))).toBe(false);
  expect(accepted(JSON.stringify({ _lpm_display_filter: true }))).toBe(false);
  expect(accepted(JSON.stringify({ _lpm_display_filter: true, config: {} }))).toBe(true);
});

test('the shiny hunt is written as a file Live PokeMap will read', () => {
  expect(accepted(displayFilterText(shinyHuntFilter()))).toBe(true);
  expect(FILE_NAME.endsWith('.json')).toBe(true);
});

test('the allowlist is the shiny hunt narrowed to what the wild turns up', () => {
  const { config } = shinyHuntFilter();

  /*
   * The rule spelled out, rather than asked of `SHINY_HUNTING_FILTERS` the way the module asks it. Reaching for the
   * same list would assert only that the module calls what it calls; writing the three flags out means a change to
   * that list has to be meant.
   */
  const wanted = [
    ...new Set(
      [...SHINY_POKEMON].filter((pokemon) => pokemon.released && pokemon.spawns && pokemon.shinyEligible).map(Number),
    ),
  ];

  expect(config.speciesFilterList).toEqual(wanted);

  // A floor that does not go through the narrowing at all, so an empty answer on both sides cannot read as agreement.
  expect(SHINY_POKEMON.size).toBeGreaterThan(0);
  expect(config.speciesFilterList.length).toBeGreaterThan(0);
});

test('the allowlist holds one whole dex number per species', () => {
  const list = shinyHuntFilter().config.speciesFilterList;

  // A form serializes to the dex number of the species it belongs to, so a list naming several names it several times.
  expect(new Set(list).size).toBe(list.length);
  expect(list.every((dex) => Number.isInteger(dex) && dex > 0)).toBe(true);
});

test('the config says only what this collection has an opinion about', () => {
  /*
   * Pinned as a list because the importer spreads `config` over Live PokeMap's defaults rather than over the reader's
   * own values: a field added here stops being theirs to set, and `shinyOnly` in particular would hide every species
   * the hunt is for.
   */
  expect(Object.keys(shinyHuntFilter().config)).toEqual(['speciesFilterMode', 'speciesFilterList']);
  expect(shinyHuntFilter().config.speciesFilterMode).toBe('allowlist');
});

test('the clock is the only thing that moves between two exports', () => {
  const at = new Date('2026-01-02T03:04:05.678Z');

  expect(shinyHuntFilter(at).exported_at).toBe('2026-01-02T03:04:05.678Z');

  // Which is what lets the file be diffed against the last one: given the same instant, the bytes are the same.
  expect(displayFilterText(shinyHuntFilter(at))).toBe(displayFilterText(shinyHuntFilter(at)));
});
