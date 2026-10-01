/**
 * A link out and a link back in. `toFragment` and `fromFragment` are the pair worth testing together, because a
 * fragment is the one thing here a stranger writes: every case below is either a defect that trusts it — a bound past
 * the box that could have produced it, an id no table carries, a term arriving both wanted and refused — or one that
 * loses a choice on the way out, which reads on the page as a reader having made a different one.
 *
 * `compose` and `rangeClause` are asserted where they say what a restored state *means*. A round trip giving back the
 * wrong state and one giving back a state that composes the wrong string are the same bug to whoever followed the
 * link, and only the second of them is visible.
 *
 * Every expectation is derived from `terms.js` and pinned against it first, for the reason `optimise.test.ts` gives: a
 * renamed id or a moved ceiling leaves a test asserting nothing, and that reads exactly like a pass.
 */

import { expect, test } from 'vitest';

import { GROUPS, RANGES, TERMS_BY_ID, type Group, type Range } from './terms.js';
import { compose, emptyState, fromFragment, names, rangeClause, toFragment, type Bounds, type State } from './query.js';

/** A state as the builder would have it, with only the parts a test is about spelled out. */
const state = (parts: Partial<State>): State => ({ ...emptyState(), ...parts });

/** One group by id. It throws rather than defaulting, a group gone being a precondition gone rather than a failure. */
function group(id: string): Group {
  const found = GROUPS.find((entry) => entry.id === id);

  if (!found) {
    throw new Error(`\`terms.js\` carries no ${id} group`);
  }

  return found;
}

/** One numeric range by id, so a test pins the floor and ceiling its literals were derived from. */
function range(id: string): Range {
  const found = RANGES.find((entry) => entry.id === id);

  if (!found) {
    throw new Error(`\`terms.js\` carries no ${id} range`);
  }

  return found;
}

/** What the writer puts in the search string for one range's two boxes, which is the half the game reads. */
const clause = (id: string, bounds: Bounds) => rangeClause(range(id), state({ ranges: new Map([[id, bounds]]) }));

/** The round trip as the page makes it: write the link, then read it back the way the browser hands it over. */
const roundTrip = (chosen: State) => fromFragment(`#${toFragment(chosen)}`);

test('every choice a chip, a box or a toggle can make survives the round trip', () => {
  const chosen = state({
    text: 'pikachu, eevee',
    include: new Set(['shiny', 'fire']),
    exclude: new Set(['lucky']),
    ranges: new Map<string, Bounds>([
      ['dex', { from: 1, to: 151 }],
      ['cp', { from: null, to: 1500 }],
    ]),
    optimise: true,
  });

  // Every id above names a real term, which is what makes the drop two tests below load-bearing rather than something
  // this case quietly relies on: a fragment is checked against the tables, so a test built on a renamed id would be
  // asserting that renaming works.
  expect([...chosen.include, ...chosen.exclude].filter((id) => !TERMS_BY_ID.has(id))).toEqual([]);

  expect(roundTrip(chosen)).toEqual(chosen);

  // The toggle travels as the one value that means it, so a link saying anything else arrives with the optimiser off
  // rather than on by accident.
  expect(fromFragment('s=1').optimise).toBe(true);
  expect(fromFragment('s=true').optimise).toBe(false);
});

test('a link arrives with its hash, which is not part of the first key', () => {
  // `location.hash` carries the `#`, so a reader following a link hands this the whole of it. Keeping it makes the
  // first key `#t`, which names nothing and is dropped — an empty name box out of a link that carried one.
  expect(fromFragment('#t=pikachu').text).toBe('pikachu');
  expect(fromFragment('t=pikachu').text).toBe('pikachu');
  expect(new URLSearchParams('#t=pikachu').get('t')).toBe(null);
});

test('a character the fragment uses for itself travels escaped rather than as itself', () => {
  // `+charmander` is this repository's own family syntax and `+` is the one character a form reader turns into a space;
  // `,` separates the names within the box and `&` separates the fragment's own parts. `encodeURIComponent` escapes all
  // of them where `encodeURI` leaves the last two, so the two controls are what that reading would have produced.
  expect(toFragment(state({ text: '+charmander' }))).toBe('t=%2Bcharmander');
  expect(toFragment(state({ text: 'pikachu, eevee' }))).toBe('t=pikachu%2C%20eevee');

  expect(roundTrip(state({ text: '+charmander' })).text).toBe('+charmander');
  expect(roundTrip(state({ text: 'pikachu, eevee' })).text).toBe('pikachu, eevee');

  expect(new URLSearchParams('t=+charmander').get('t')).toBe(' charmander');
  expect(new URLSearchParams('t=pikachu, eevee&x=lucky').get('t')).toBe('pikachu, eevee');
});

test('the name box is carried trimmed, and whitespace alone is carried not at all', () => {
  // The spaces a reader types around a name are theirs rather than part of it, which is already what the game is handed
  // — so the fragment agrees, and a link cannot restore a state that composes differently from the one that wrote it.
  expect(names('   ')).toEqual([]);

  expect(toFragment(state({ text: '  pikachu  ' }))).toBe('t=pikachu');
  expect(toFragment(state({ text: '   ' }))).toBe('');
  expect(roundTrip(state({ text: '  pikachu  ' })).text).toBe('pikachu');
});

test('an id that names nothing is dropped rather than restored as a choice no chip can show', () => {
  expect(TERMS_BY_ID.has('shiny')).toBe(true);
  expect(TERMS_BY_ID.has('sparkly')).toBe(false);

  const restored = fromFragment('i=shiny.sparkly&nope=1-5');

  // `groupClause` walks each group's own terms and `fromFragment` each range in the table, so an id neither carries
  // would compose nothing and show nowhere — while `toFragment` wrote it out again, so a link that had rotted past a
  // rename would go on carrying its own rot.
  expect(restored.include).toEqual(new Set(['shiny']));
  expect(restored.ranges.size).toBe(0);
});

test('a term cannot arrive both wanted and refused', () => {
  // The chips cannot produce it; a hand-edited link can. It matters because `status` AND's what it is given, so the
  // pair composes a search for a shiny that is not shiny — which matches nothing and says nothing about why.
  expect(group('status').join).toBe('&');
  expect(compose(state({ include: new Set(['shiny']), exclude: new Set(['shiny']) })).query).toBe('shiny&!shiny');

  const restored = fromFragment('i=shiny&x=shiny.lucky');

  expect([restored.include, restored.exclude]).toEqual([new Set(['shiny']), new Set(['lucky'])]);
  expect(compose(restored).query).toBe('shiny&!lucky');
});

test('a bound from a stranger is clamped to the box it claims to have come from', () => {
  expect([range('dex').min, range('dex').max]).toEqual([1, 1025]);
  expect([range('year').min, range('year').max]).toEqual([2016, 2030]);

  // An unclamped bound hands the game a span the boxes could never have made — `0-9999` out of a builder whose dex box
  // stops at 1025 — and the page then shows boxes that disagree with the string beneath them.
  expect(fromFragment('dex=0-9999').ranges.get('dex')).toEqual({ from: 1, to: 1025 });
  expect(fromFragment('year=1999-2020').ranges.get('year')).toEqual({ from: 2016, to: 2020 });
});

test('a bound that is not a number is the empty box it looks like', () => {
  // `dex=-151` is a `to` with no `from`, so it splits into an empty part and a number rather than into a negative one.
  expect(fromFragment('dex=-151').ranges.get('dex')).toEqual({ from: null, to: 151 });
  expect(fromFragment('dex=x-y').ranges.get('dex')).toEqual({ from: null, to: null });

  // Which the writer then fills from the table, so a half-filled link composes what the half-filled boxes would.
  expect(compose(fromFragment('dex=-151')).query).toBe('1-151');
});

test('a range with both boxes empty is carried by neither the link nor the query', () => {
  const empty = state({ ranges: new Map<string, Bounds>([['dex', { from: null, to: null }]]) });

  expect(toFragment(empty)).toBe('');
  expect(compose(empty).query).toBe('');

  // So the round trip normalises here rather than being an identity, and this is the only place it does: the state
  // holding the entry and the state without it write the same two strings, which is what the fragment carries.
  expect(fromFragment('dex=x-y').ranges.has('dex')).toBe(true);
  expect(roundTrip(fromFragment('dex=x-y')).ranges.has('dex')).toBe(false);
});

test('an empty box is filled from the table rather than written as an open end', () => {
  expect(range('cp').max).toBe(5000);
  expect([range('dex').prefix, range('dex').min]).toEqual(['', 1]);

  // `cp3000-` may well be read the way it looks, where `cp3000-5000` cannot be read any other way and nothing has a CP
  // above the ceiling anyway. The dex carries no prefix, a bare span being how the game searches dex numbers.
  expect(clause('cp', { from: 3000, to: null })).toBe('cp3000-5000');
  expect(clause('dex', { from: null, to: 151 })).toBe('1-151');
});

test('a pair of bounds the wrong way round is written the way it reads', () => {
  // A reader can type the higher number into the lower box, and `cp2000-100` is a search that matches nothing out of
  // two numbers that describe a span perfectly well.
  expect(clause('cp', { from: 2000, to: 100 })).toBe('cp100-2000');
});

test('the string is the choices rather than the order they were clicked in', () => {
  const first = state({ include: new Set(['water', 'fire', 'shiny']) });
  const second = state({ include: new Set(['shiny', 'fire', 'water']) });

  // Two readers comparing what they built are then comparing the choices, so the clauses follow the tables: status
  // before type, and the types in the order every type chart has shown them since 1999.
  expect(compose(first).query).toBe('shiny&fire,water');
  expect(compose(second).query).toBe(compose(first).query);

  // The link is the other way round and carries insertion order, which is why it is read back through the tables
  // rather than compared as a string: these two differ and restore to the same state.
  expect(toFragment(first)).toBe('i=water.fire.shiny');
  expect(toFragment(second)).not.toBe(toFragment(first));
  expect(roundTrip(second)).toEqual(roundTrip(first));
});

test('the caveat is earned by mixing the two operators and by nothing else', () => {
  // `status` AND's and `type` OR's, which is what lets one group produce each half of the mix.
  expect([group('status').join, group('type').join]).toEqual(['&', undefined]);

  // The game has no parentheses, so `shiny&fire,water` is open to being read either way round and the builder says so
  // rather than quietly picking one. A string carrying only one of the two operators cannot raise the question.
  expect(compose(state({ include: new Set(['shiny', 'fire', 'water']) })).ambiguous).toBe(true);
  expect(compose(state({ include: new Set(['fire', 'water']) })).ambiguous).toBe(false);

  const both = compose(state({ include: new Set(['shiny', 'lucky']) }));

  expect([both.query, both.ambiguous]).toEqual(['shiny&lucky', false]);
});
