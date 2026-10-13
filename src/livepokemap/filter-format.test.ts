import { expect, test } from 'vitest';

import { FILTER_DEFAULTS, readDisplayFilter } from './filter-format.js';

test('a file is turned away wherever Live PokeMap turns it away', () => {
  const NOT_A_FILTER = 'not a Live PokeMap display filter';

  expect(() => readDisplayFilter('not json at all')).toThrow('not JSON');
  expect(() => readDisplayFilter('null')).toThrow(NOT_A_FILTER);
  expect(() => readDisplayFilter(JSON.stringify({ config: {} }))).toThrow(NOT_A_FILTER);

  // Truthy is not enough — the sentinel is compared with `===`, so a 1 in its place fails the whole file.
  expect(() => readDisplayFilter(JSON.stringify({ _lpm_display_filter: 1, config: {} }))).toThrow(NOT_A_FILTER);
  expect(() => readDisplayFilter(JSON.stringify({ _lpm_display_filter: true }))).toThrow(NOT_A_FILTER);

  // And the floor, so a reader that turns everything away cannot pass the lines above for the wrong reason.
  expect(readDisplayFilter(JSON.stringify({ _lpm_display_filter: true, config: {} }))).toStrictEqual(FILTER_DEFAULTS);
});
