import { expect, test } from 'vitest';

import SHINY_POKEMON from '../filters/shiny.js';
import { HUNTS } from '../pokedex/entries.js';
import { displayFilterText, shinyHuntFilter } from './display-filter.js';

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

test('the shiny hunt is written as text Live PokeMap will read', () => {
  expect(accepted(displayFilterText(shinyHuntFilter()))).toBe(true);
});

test('the allowlist is the shiny hunt narrowed to what the wild turns up', () => {
  const { config } = shinyHuntFilter();

  /*
   * The rule spelled out, rather than asked of `SHINY_HUNTING_FILTERS` the way the module asks it. Reaching for the
   * same list would assert only that the module calls what it calls; writing the three flags out means a change to that
   * list has to be meant.
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

  /*
   * Two exports at *different* instants, since comparing one instant against itself is `f(x)` against `f(x)` on a pure
   * function and can never go red. What is being pinned is that the timestamp is the whole of the difference — which is
   * what lets one export be diffed against the last.
   */
  const later = new Date('2026-03-04T05:06:07.890Z');
  const lines = (date: Date) => displayFilterText(shinyHuntFilter(date)).split('\n');
  const differing = lines(at)
    .map((line, at) => [line, lines(later)[at]])
    .filter(([before, after]) => before !== after);

  expect(differing).toEqual([
    ['  "exported_at": "2026-01-02T03:04:05.678Z"', '  "exported_at": "2026-03-04T05:06:07.890Z"'],
  ]);
});

test('the allowlist is the very list the Pokédex badges as a watched shiny hunt', () => {
  /*
   * `pokedex/entries.ts` writes the narrowing a third time, as `feedable(p) && p.shinyEligible` rather than as this
   * module's predicate list. Until that duplicate is collapsed, this is what stops the two drifting: add a predicate to
   * `SHINY_HUNTING_FILTERS` and the export would quietly drop species the page keeps badging as watched.
   */
  const hunt = HUNTS.find((entry) => entry.id === 'shiny');
  const watched = [...new Set([...(hunt?.members ?? [])].filter((pokemon) => hunt?.watched(pokemon)).map(Number))];

  expect(watched.length).toBeGreaterThan(0);
  expect(shinyHuntFilter().config.speciesFilterList).toEqual(watched);
});
