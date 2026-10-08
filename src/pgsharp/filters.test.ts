/**
 * What PGSharp's nearby feed is told to look for. Each object becomes one JSON string inside the backup, so the field
 * *order* is as much the contract as the values, `JSON.stringify` writing keys in insertion order. That makes the
 * spreads load-bearing, and nothing about getting it wrong surfaces as an error: the backup writes, the device reads
 * it, and a feed goes quiet.
 *
 * The species lists fail the same way round — a filter naming a species the wild never turns up is a feed that will
 * never alert, indistinguishable from one simply waiting. So these weigh every filter rather than sampling.
 */

import { expect, test } from 'vitest';

import FILTERS from './filters.js';
import SHINY_POKEMON from '../filters/shiny.js';
import type Pokemon from '../pokemon/pokemon.js';

/** One filter by the name PGSharp shows it under. It throws rather than narrowing: a feed gone is a precondition. */
function feed(name: string) {
  const found = FILTERS.find((filter) => filter.name === name);

  if (!found) {
    throw new Error(`\`filters.js\` writes no filter named ${name}`);
  }

  return found;
}

/** Every entry of one filter keyed by the dex number PGSharp stores it as, which is the only key the backup carries. */
const byDex = (pokemons: readonly Pokemon[]) => new Map(pokemons.map((pokemon) => [Number(pokemon), pokemon]));

test('every filter writes the same fields in the same order, which is the order PGSharp wrote them in', () => {
  // One order for all six, because each is re-emitted as a single JSON string and `JSON.stringify` follows insertion
  // order. A field appended rather than overridden would move nothing visible on the page and hand the device a string
  // it did not write — so this is the assertion the spreads in that module exist to satisfy.
  const fields = [
    'attrMode',
    'checkAll',
    'distance',
    'form',
    'gender',
    'level',
    'lvmax',
    'maxatk',
    'maxdef',
    'maxIV',
    'maxsta',
    'minatk',
    'mindef',
    'minIV',
    'minsta',
    'notif',
    'onlyShiny',
    'priority',
    'size',
    'name',
    'pokemons',
  ];

  expect(FILTERS.map((filter) => Object.keys(filter))).toEqual(FILTERS.map(() => fields));
});

test("an override sets a field's value without moving it, which is why the base declares all of them", () => {
  const hundred = feed('100%');

  // `100%` overrides four of the base's fields, and each has to stay where the base put it. Reading the index off the
  // object rather than off the list above is what makes this about position rather than about my own literal.
  expect(Object.keys(hundred).indexOf('distance')).toBe(2);
  expect([hundred.distance, hundred.minIV, hundred.notif, hundred.priority]).toEqual([10, 100, true, 0]);

  // `onlyShiny` is the field that proves the rule, declared false in the base for no reason but this: the three shiny
  // feeds set it true, and had it been declared only there it would have appended itself past `size` in half the file.
  expect(Object.keys(hundred).indexOf('onlyShiny')).toBe(16);
  expect(FILTERS.filter((filter) => filter.onlyShiny).map((filter) => filter.name)).toEqual([
    'Shiny Hunting',
    'Shiny Hunting (Hisuian)',
    'Regional Shiny Hunting',
  ]);
});

test('no filter names something the nearby feed could never show, and none of them is empty', () => {
  // The feed reports wild spawns, so a species not in the game or one the wild never turns up is a line PGSharp cannot
  // alert on. Weighed over every entry of every filter, since one such species is one quiet row rather than a failure.
  const impossible = FILTERS.flatMap((filter) =>
    filter.pokemons.filter((pokemon) => !pokemon.released || !pokemon.spawns).map((pokemon) => String(pokemon)),
  );

  expect(impossible).toEqual([]);

  // A filter whose every species was dropped is the worst of them: a feed watching for nothing, written into a backup
  // that loads cleanly and alerts never. There is no count here that would not move with the lists, so this is the
  // assertion that holds — the same reading `pnpm test` takes of a glob matching no files.
  expect(FILTERS.filter((filter) => filter.pokemons.length === 0).map((filter) => filter.name)).toEqual([]);
});

test('a dex number is named once however many of its forms a list asks for', () => {
  // A form is a Pokemon of its own carrying its species' dex number, and that number is all PGSharp stores. Unown is
  // the extreme: the shiny list names its letters one by one and every one of them is 201, so a list written for a
  // reader is a list with one number repeated for the device.
  const unown = [...SHINY_POKEMON].filter((pokemon) => Number(pokemon) === 201);

  expect(unown.length).toBeGreaterThan(1);
  expect(feed('Shiny Hunting').pokemons.filter((pokemon) => Number(pokemon) === 201)).toHaveLength(1);

  // And no filter repeats any number, which is the whole of what the collapse is for.
  const repeated = FILTERS.flatMap((filter) =>
    filter.pokemons.length === byDex(filter.pokemons).size ? [] : [filter.name],
  );

  expect(repeated).toEqual([]);

  // The collapse running *after* the predicates is not reachable from here, and not through the flag predicates at all:
  // no dex number in any of the four lists has its first entry failing one of those a later entry passes. What reaches
  // it is `filterRegional`, and the last test in this file is where that ordering is held.
});

test('a region is read off the variant as data rather than off the adjective on its name', () => {
  const hisuian = feed('Shiny Hunting (Hisuian)');

  // Two species reach this feed, and `filterRegion(HISUI)` is what finds them: the question is which region a variant
  // carries, not whether its name begins with a word. `form: 3` is PGSharp's own code for the Hisuian form, and it is
  // the one shiny feed that sets it — the other two leave the base's 0, meaning any form.
  expect(hisuian.pokemons.map((pokemon) => String(pokemon))).toEqual(['Hisuian VOLTORB', 'Hisuian ELECTRODE']);
  expect([hisuian.form, feed('Shiny Hunting').form, feed('Regional Shiny Hunting').form]).toEqual([3, 0, 0]);

  // Which of the two readings is used cannot be shown here, and that is derivable rather than a gap: `HISUI` is the
  // string `Hisuian`, and a variant writes its region as the first word of its name, so reading the name and reading
  // the region agree on every entry in the dex. What the data could separate them with is a region whose adjective is
  // not its own name — so this is one to re-derive if `pokedex.js` ever spells one that way.
  expect(hisuian.pokemons.every((pokemon) => String(pokemon).startsWith('Hisuian'))).toBe(true);
});

test('the shiny feeds keep different forms at a shared dex, so they share predicates and not a list', () => {
  const plain = byDex(feed('Shiny Hunting').pokemons);
  const regional = feed('Regional Shiny Hunting').pokemons;

  // Every number the Regional feed names is in the plain feed too, so a Regional feed built by filtering the plain
  // feed's finished list would look entirely reasonable — same numbers, fewer of them.
  expect(regional.filter((pokemon) => !plain.has(Number(pokemon)))).toEqual([]);

  // And at four of them the plain feed's collapse kept a form that is not regional, so that build would drop all four:
  // the regional form it needed had already lost the dex number to a plainer one. Hence each feed filtering
  // `SHINY_POKEMON` afresh and collapsing last. A fifth pair appearing here is a new regional shiny worth reading.
  const diverged = regional.filter((pokemon) => plain.get(Number(pokemon)) !== pokemon);

  expect(diverged.map((pokemon) => [String(pokemon), String(plain.get(Number(pokemon)))])).toEqual([
    ['BASCULIN (BLUE_STRIPED)', 'BASCULIN (WHITE_STRIPED)'],
    ['FLABEBE (BLUE_FLOWER)', 'FLABEBE (WHITE_FLOWER)'],
    ['FLOETTE (BLUE_FLOWER)', 'FLOETTE (WHITE_FLOWER)'],
    ['FLORGES (BLUE_FLOWER)', 'FLORGES (WHITE_FLOWER)'],
  ]);
  expect(diverged.map((pokemon) => plain.get(Number(pokemon))?.regional)).toEqual([false, false, false, false]);
});
