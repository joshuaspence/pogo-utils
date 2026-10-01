/**
 * Where the dex divides. Two pages read this table and read it differently: the search builder renders a generation as
 * the `1-151` the game's search box takes, so it reads both bounds, and the Pokédex compares a dex number against them
 * to label a card. A bound that is wrong is therefore a search quietly returning the wrong species, or a card filed
 * under the wrong generation — and neither says anything.
 *
 * `entries.test.ts` and `optimise.test.ts` already reach this table through their own consumers. What neither of them
 * pins is that the nine spans cover the dex without a gap or an overlap, which is the property both readings stand on.
 */

import { expect, test } from 'vitest';

import POKEMON from './pokedex.js';
import { GENERATIONS } from './generations.js';

test('the generations tile the dex: no gap, no overlap, none of them empty', () => {
  // Each generation begins one past the end of the one before, so every dex number falls in exactly one span. A gap is
  // invisible to anything reading `last` alone, which would file the missing numbers under the next generation; but the
  // builder reads `first` to write the span, so the same gap becomes a search that silently drops species.
  expect(GENERATIONS.map(({ first }) => first)).toEqual([1, ...GENERATIONS.slice(0, -1).map(({ last }) => last + 1)]);
  expect(GENERATIONS[0]?.first).toBe(1);

  // And none of them is inverted, which would render as a `494-386` the game's search box accepts and matches nothing
  // with. The assertion above already reaches a single row edited on its own, since moving one `last` moves the `first`
  // the next row is checked against; what this adds is the pair edited together, where the chain stays consistent and
  // the span is backwards anyway.
  expect(GENERATIONS.filter(({ first, last }) => first > last)).toEqual([]);

  // Numbered 1 to 9 in order, which is what lets a consumer read the table as a list rather than looking a number up.
  expect(GENERATIONS.map(({ number }) => number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('the last generation ends where the dex itself ends, which is the one bound that moves', () => {
  // Derived from `pokedex.js` rather than transcribed, because 1025 being the largest number in this table says only
  // that I typed it twice. A generation extended here without the species arriving leaves the builder writing a span
  // naming dex numbers nothing holds, and a species added there without this moving leaves it in no generation at all.
  expect(GENERATIONS.at(-1)?.last).toBe(Object.keys(POKEMON).length);
  expect(Object.keys(POKEMON)).toHaveLength(1025);
});
