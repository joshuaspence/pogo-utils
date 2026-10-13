/**
 * The parts of `pnpm inventory scan` that need no phone: the arguments it takes, the CSV it writes and the keys that
 * decide whether a flag search and the full pass saw the same Pokémon. A wrong key is a flag lost from a row or set on
 * the wrong one, and nothing on a phone screen says which.
 */

import { type Detail } from './detail.mts';
import { type Overlay } from './overlay.mts';
import { count, csv, FLAGS, keyOf, looseKeyOf, Marks, parseFlags } from './scan.mts';
import { CLEAR_KEYS } from './storage.mts';
import { expect, test } from 'vitest';

/** A detail screen read with a 50 HP Pikachu's measurements, and whatever else a test says. */
function detail(fields: Partial<Detail> = {}): Detail {
  return {
    cp: null,
    cps: [],
    name: 'Pikachu',
    hp: 50,
    weight: 6.1,
    height: 0.41,
    types: ['Electric'],
    gender: null,
    favourite: false,
    size: null,
    tags: [],
    ...fields,
  };
}

const overlay = (attack: number, defense: number, stamina: number): Overlay => ({
  levels: [20],
  iv: { attack, defense, stamina },
  form: null,
});

test('a screen without its HP has no key, however much else was read', () => {
  expect(keyOf(detail({ hp: null }), overlay(15, 15, 15))).toBeNull();
});

test('a name read with different case and accents keys the same', () => {
  expect(keyOf(detail({ name: 'POKéMON' }), null)).toBe(keyOf(detail({ name: 'pokemon' }), null));
});

test.for([
  ['the HP', detail({ hp: 51 }), overlay(15, 15, 15)],
  ['the weight', detail({ weight: 6.2 }), overlay(15, 15, 15)],
  ['the height', detail({ height: 0.42 }), overlay(15, 15, 15)],
  ['the IVs', detail(), overlay(15, 15, 14)],
  ['an overlay not read', detail(), null],
] as const)('two Pokémon differing only in %s key apart', ([, other, ivs]) => {
  const key = keyOf(detail(), overlay(15, 15, 15));

  expect(keyOf(other, ivs)).not.toBe(key);
  expect(looseKeyOf(other, ivs)).not.toBe(looseKeyOf(detail(), overlay(15, 15, 15)));
});

test('the loose key leaves out the name, which the exact key holds', () => {
  const read = detail({ name: 'Pikachu' });
  const misread = detail({ name: 'Pikachv' });

  expect(keyOf(read, null)).not.toBe(keyOf(misread, null));
  expect(looseKeyOf(read, null)).toBe(looseKeyOf(misread, null));
});

test('a marked Pokémon marks one row, not every row after it', () => {
  const marks = new Marks();

  marks.add(detail(), overlay(15, 15, 15));

  expect(marks.size).toBe(1);
  expect(marks.take(detail(), overlay(15, 15, 15))).toBe(true);
  expect(marks.take(detail(), overlay(15, 15, 15)), 'the one mark was used twice').toBe(false);
});

test('twins the search found twice are both marked, and a third is not', () => {
  const marks = new Marks();

  marks.add(detail(), null);
  marks.add(detail(), null);

  expect(marks.size).toBe(2);
  expect([marks.take(detail(), null), marks.take(detail(), null), marks.take(detail(), null)]).toStrictEqual([
    true,
    true,
    false,
  ]);
});

test('a name read two ways across the passes still finds its mark', () => {
  const marks = new Marks();

  marks.add(detail({ name: 'Sparky' }), overlay(10, 11, 12));

  expect(marks.take(detail({ name: 'Sparkv' }), overlay(10, 11, 12))).toBe(true);
});

test('a screen with no key is neither marked nor matched', () => {
  const marks = new Marks();

  marks.add(detail({ hp: null }), null);

  expect(marks.size).toBe(0);
  expect(marks.take(detail({ hp: null }), null)).toBe(false);
});

test('a Pokémon the search did not find is not marked', () => {
  const marks = new Marks();

  marks.add(detail(), overlay(15, 15, 15));

  expect(marks.take(detail(), overlay(0, 15, 15))).toBe(false);
  expect(marks.take(detail(), overlay(15, 15, 15)), 'the miss used up the mark').toBe(true);
});

test.for([
  [null, ''],
  [12.5, '12.5'],
  ['Pikachu', 'Pikachu'],
  ['Trade, maybe', '"Trade, maybe"'],
  ['say "hi"', '"say ""hi"""'],
  ['two\nlines', '"two\nlines"'],
] as const)('%j is written to the CSV as %j', ([value, written]) => {
  expect(csv(value)).toBe(written);
});

test('the flags named are the flags searched, and an empty name is no flag', () => {
  expect(parseFlags('shiny,lucky')).toStrictEqual(['shiny', 'lucky']);
  expect(parseFlags('shiny,,shadow,')).toStrictEqual(['shiny', 'shadow']);
  expect(parseFlags('')).toStrictEqual([]);
});

test('a flag that is not a search is refused, naming the ones that are', () => {
  expect(() => parseFlags('shiny,sparkly')).toThrow(
    'unknown flag sparkly; the choices are shiny, lucky, costume, shadow, purified',
  );
});

test('a count left out is the fallback, and a whole number is itself', () => {
  expect(count('limit', undefined, Infinity)).toBe(Infinity);
  expect(count('skip', '0', 5)).toBe(0);
  expect(count('limit', '12', Infinity)).toBe(12);
});

test.for(['-1', '1.5', 'ten', 'NaN', 'Infinity'])('a count of %j is refused rather than run with', (value) => {
  expect(() => count('limit', value, Infinity)).toThrow(`--limit takes a whole number, not ${value}`);
});

/**
 * That the clear is longer than every search the scan sends. A flag is typed into the box as it stands — `search(flag)`
 * — so `FLAGS` is the list of terms the scan sends, and they are short enough that this passes today with room to
 * spare. The point is that it fails the moment a longer one is added, where before nothing related the two numbers.
 */
test('the clear is longer than every search the scan sends', () => {
  for (const term of FLAGS) {
    expect(term.length, `the scan sends ${JSON.stringify(term)}, which the clear cannot remove`).toBeLessThanOrEqual(
      CLEAR_KEYS,
    );
  }
});
