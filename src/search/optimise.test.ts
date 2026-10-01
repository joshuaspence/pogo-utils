/**
 * `optimise` is where a test is worth the most here: its every answer is a value rather than a rendering, and it is the
 * one module a reader is asked to trust on a mass transfer. Each case below is a defect it would have caught rather
 * than a line it covers — a reduction taken where the two readings of a partial name disagree, a family written as the
 * species it was reached through, an empty intersection written as an empty clause, a rewrite never reported.
 *
 * Every case is built on the real dex and the real tables, which is what makes it worth asserting against and why each
 * test pins the shape of the data its case needs before asserting any behaviour. A fragment that reaches three species
 * today and one tomorrow is a test that has quietly stopped being about anything, and that reads exactly like a pass.
 */

import { expect, test } from 'vitest';

import POKEMON from '../pokemon/pokedex.js';
import { GENERATIONS } from '../pokemon/generations.js';
import { RANGES } from './terms.js';
import { compose, emptyState, type Bounds, type State } from './query.js';
import { optimise } from './optimise.js';

/** A state as the builder would have it, with only the parts a test is about spelled out. */
const state = (parts: Partial<State>): State => ({ ...emptyState(), ...parts });

/** Every species as the name a search sees, which is what both readings of a partial name are tested against. */
const NAMES = Object.values(POKEMON).map((species) => String(species).toLowerCase());

/**
 * How many species a fragment reaches under each reading of a partial name — matching anywhere, and matching from the
 * start. A reduction is refused wherever the two disagree, so these two numbers are the whole precondition of a name
 * test: pin them, and a dex that has moved says so here instead of leaving the case silently unreachable.
 */
const reach = (fragment: string) => ({
  contains: NAMES.filter((name) => name.includes(fragment)).length,
  begins: NAMES.filter((name) => name.startsWith(fragment)).length,
});

/**
 * One generation's bounds, so a test can pin the spans the literals it asserts were derived from. It throws on a
 * generation the table does not carry rather than narrowing, since a missing one is a precondition gone rather than a
 * failure of anything below.
 */
function generation(number: number) {
  const found = GENERATIONS.find((entry) => entry.number === number);

  if (!found) {
    throw new Error(`\`generations.js\` carries no generation ${number}`);
  }

  return [found.first, found.last];
}

test('a name the two readings of a partial name disagree on keeps its name', () => {
  // Three species carry `saur` and none begins with it, so the fragment reaches them under one reading and nothing
  // under the other. Refusing it is what makes every reduction that is taken true whichever reading the game uses.
  expect(reach('saur')).toEqual({ contains: 3, begins: 0 });

  const { state: short, rewrites, lossy } = optimise(state({ text: 'saur' }));

  expect(short.text).toBe('saur');
  expect(rewrites).toEqual([]);
  expect(lossy).toBe(false);
});

test('a fragment reaching an underscored name under one reading alone is refused too', () => {
  // `MR_MIME` contains the fragment where `MIME_JR` begins it, so the two sets differ by one and cannot be equal.
  expect(reach('mime')).toEqual({ contains: 2, begins: 1 });

  expect(optimise(state({ text: 'mime' })).state.text).toBe('mime');
});

test('a name that reaches one species is written as its dex number, and says it was', () => {
  expect(reach('charmander')).toEqual({ contains: 1, begins: 1 });

  // `charm` still reaches Charmeleon, so the shortest fragment reaching Charmander alone is the six-character
  // `charma` — against the one character `4` costs, which is what makes the number the shorter of the two spellings
  // rather than a preference for numbers.
  expect(reach('charm')).toEqual({ contains: 2, begins: 2 });

  const { state: short, rewrites, lossy } = optimise(state({ text: 'charmander' }));

  expect(short.text).toBe('4');

  // A reader who cannot see why `charmander` became `4` has been handed a string to trust with no way to check it.
  expect(rewrites).toEqual([['charmander', '4']]);

  // A name matches nicknames where a dex number matches the species alone, so this is the one reduction that is not an
  // equivalence and the only one the page has to caveat.
  expect(lossy).toBe(true);
});

test('a family keeps a name however short the species goes, because the family is not known', () => {
  expect(reach('charma')).toEqual({ contains: 1, begins: 1 });

  const { state: short, rewrites, lossy } = optimise(state({ text: '+charmander' }));

  // `+charma` is the same family reached a shorter way, which is sound; `+4` would be a family written as the one
  // species it was reached through, and nothing in this repository knows which species share one.
  expect(short.text).toBe('+charma');
  expect(rewrites).toEqual([['+charmander', '+charma']]);
  expect(lossy).toBe(false);
});

test('a name another name begins says nothing the shorter one has not', () => {
  // `char` reaches Charjabug and Charcadet as well, and Chimchar and Pecharunt under the other reading, so it is
  // itself refused a reduction — which is what leaves a name rather than a number on this side of the coverage check.
  expect(reach('char')).toEqual({ contains: 7, begins: 5 });

  const { state: short, rewrites } = optimise(state({ text: 'char, charmander' }));

  expect(short.text).toBe('char');
  expect(rewrites).toEqual([['charmander', 'char']]);
});

test('two generations collapse into the one span they describe', () => {
  // The literals below are these bounds, and they are adjacent: there is no dex number between 151 and 152, so the two
  // spans are one rather than two that happen to touch.
  expect([...generation(1), ...generation(2)]).toEqual([1, 151, 152, 251]);

  const { state: short } = optimise(state({ include: new Set(['gen1', 'gen2']) }));

  expect(short.include.has('gen1')).toBe(false);
  expect(short.ranges.get('dex')).toEqual({ from: 1, to: 251 });
  expect(compose(short).query).toBe('1-251');
});

test('a name that became a number is intersected with the generation it sits inside', () => {
  expect(generation(1)).toEqual([1, 151]);

  const { state: short, lossy } = optimise(state({ text: 'charmander', include: new Set(['gen1']) }));

  // Charmander is in Gen 1, so saying both says `4` and the generation has earned no clause of its own.
  expect(compose(short).query).toBe('4');
  expect(lossy).toBe(true);
});

test('spans that cannot overlap stay separate clauses rather than becoming an empty one', () => {
  expect(generation(1)).toEqual([1, 151]);

  const chosen = state({
    include: new Set(['gen1']),
    ranges: new Map<string, Bounds>([['dex', { from: 200, to: 300 }]]),
  });
  const { state: short } = optimise(chosen);

  // Their intersection is empty, and writing it would turn a search that finds nothing into one that finds everything.
  // So both survive as they were and the query goes on matching nothing, which is what was asked for.
  expect(compose(short).query).toBe('1-151&200-300');
  expect(compose(short).clauses).toBe(2);
});

test('a span covering the whole dex earns no clause at all', () => {
  const dex = RANGES.find((range) => range.id === 'dex');

  expect([dex?.min, dex?.max]).toEqual([1, 1025]);

  const { state: short } = optimise(state({ ranges: new Map<string, Bounds>([['dex', { from: 1, to: 1025 }]]) }));

  expect(short.ranges.has('dex')).toBe(false);
  expect(compose(short).query).toBe('');
});

test('a name that reaches no species is passed through untouched', () => {
  expect(reach('sparky')).toEqual({ contains: 0, begins: 0 });

  const { state: short, rewrites, lossy } = optimise(state({ text: 'sparky' }));

  expect(short.text).toBe('sparky');
  expect(rewrites).toEqual([]);
  expect(lossy).toBe(false);
});

test('several spans beside a name are left where the chips put them', () => {
  // Gen 1 and Gen 3 do not touch, so they stay two spans however they are written.
  expect([...generation(1), ...generation(3)]).toEqual([1, 151, 252, 386]);

  const { state: short } = optimise(state({ text: 'saur', include: new Set(['gen1', 'gen3']) }));

  // The two spans have nowhere to go: a dex box holds one span, and in the text beside a name they would be OR'd where
  // they have to be AND'd. So the chips keep them and the name keeps the shortening it was due, which here is none.
  expect(short.include.has('gen1')).toBe(true);
  expect(compose(short).query).toBe('saur&1-151,252-386');
});

test('several spans with no name to share the text take it', () => {
  expect([...generation(1), ...generation(3)]).toEqual([1, 151, 252, 386]);

  const { state: short } = optimise(state({ include: new Set(['gen1', 'gen3']) }));

  expect(short.include.has('gen1')).toBe(false);
  expect(short.ranges.has('dex')).toBe(false);
  expect(compose(short).query).toBe('1-151,252-386');
});
