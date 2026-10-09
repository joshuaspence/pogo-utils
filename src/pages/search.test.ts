/**
 * What the Search page has to be true of without a DOM around it.
 *
 * The page's own prose convention is the one thing here that is a claim about a string rather than about a render.
 * `help` in `terms.js` is prose this repository authors, and `terms.test.js` holds it to balanced ticks; a refusal from
 * `parse.js` quotes a token the reader typed, which no table can hold. So this is the other half of that invariant,
 * taken from the side the page does not get to author.
 *
 * A span pill's boxes are the other thing here, and the one with a reader at the far end of it: what a box shows and
 * what the tree takes from it are two answers rather than one, which `boxText` carries and the keystrokes below walk.
 */

import { expect, test } from 'vitest';

import { read } from '../search/parse.js';
import { RANGES, type Range } from '../search/terms.js';
import { boxText, readBound, spans } from './search.js';

/**
 * Both halves of what `spans` promises, for any message at all: an odd number of pieces, so the last one is prose and
 * every `<code>` the sentence opened is one it closed; and a join on the tick that gives the message back, so nothing
 * has been dropped or merged away on the way.
 */
const faithful = (message: string) => ({
  message,
  prose: spans(message).length % 2 === 1,
  joined: spans(message).join('`'),
});

const kept = (message: string) => ({ message, prose: true, joined: message });

/** One range from the table, so a test pins the floor and ceiling its literals were derived from. */
function range(id: string) {
  const found = RANGES.find((entry) => entry.id === id);

  if (!found) {
    throw new Error(`\`terms.js\` carries no ${id} range`);
  }

  return found;
}

/**
 * A number typed into one of a span pill's boxes, a digit at a time: what the box shows while the caret is in it, what
 * the tree took from the last keystroke, and what the box shows once the caret has left.
 *
 * Each digit lands at the end of whatever the box is showing, which is where a controlled box just rewritten puts the
 * caret. What this cannot hold is that the page hands the digits in only for the box the caret is in — the render is
 * what does that, and a browser is where it was checked.
 */
function typing(digits: string, which: Range) {
  const path = [0];
  let text = '';
  let bound: number | null = null;

  for (const digit of digits) {
    text = boxText({ path, edge: 'from', text }, path, 'from', bound) + digit;
    bound = readBound(text, which);
  }

  return {
    shown: boxText({ path, edge: 'from', text }, path, 'from', bound),
    bound,
    left: boxText(null, path, 'from', bound),
  };
}

test('a box takes the digits of a bound its own floor is wider than', () => {
  const year = range('year');
  const cp = range('cp');

  expect([year.min, year.max]).toEqual([2016, 2030]);
  expect([cp.min ?? 0, cp.max]).toEqual([0, 5000]);

  /*
   * Every prefix of a year is below the floor, which is what a box showing its own clamp could not survive: `2`
   * clamped up to 2016, the clamp landed in the box with the caret behind it, `20160` clamped down to the ceiling,
   * and every further digit stayed there. 2016 and 2030 were the only two years the boxes could reach.
   */
  expect(typing('2019', year)).toEqual({ shown: '2019', bound: 2019, left: '2019' });

  // The clamp is still what the tree takes, and what the box shows as soon as the caret leaves it.
  expect(typing('20', year)).toEqual({ shown: '20', bound: 2016, left: '2016' });

  // The ceiling never had the same trouble: no prefix of a number inside a range is above it, only the number itself.
  expect(typing('600', cp)).toEqual({ shown: '600', bound: 600, left: '600' });
  expect(typing('6000', cp)).toEqual({ shown: '6000', bound: 5000, left: '5000' });
});

test('the digits stay in the box they were typed into', () => {
  const typed = { path: [0], edge: 'from', text: '20' } as const;

  expect(boxText(typed, [0], 'from', 2019)).toBe('20');

  // The pill beside it and this pill's other end are both boxes the caret is not in, so both show the bound.
  expect(boxText(typed, [1], 'from', 2019)).toBe('2019');
  expect(boxText(typed, [0], 'to', 2019)).toBe('2019');

  // A bound the reader has not filled in is an empty box rather than the floor, which the placeholder says instead.
  expect(boxText(null, [0], 'from', null)).toBe('');
});

test('a sentence is split on its backtick pairs', () => {
  expect(spans('the game has no `gen1`')).toEqual(['the game has no ', 'gen1', '']);
  expect(spans('`a` and `b`')).toEqual(['', 'a', ' and ', 'b', '']);
  expect(spans('no ticks at all')).toEqual(['no ticks at all']);
});

test('an unpaired tick leaves the sentence prose rather than opening a span it cannot close', () => {
  for (const message of ['a`b', '`', '``', 'a `b` c', 'a `b` c`', '`a`b`c`', '']) {
    expect(faithful(message)).toEqual(kept(message));
  }
});

test('a refusal quoting a tick the reader typed keeps it, and keeps the rest of the sentence prose', () => {
  /*
   * The reachable case: a name holding a tick, the box splitting on commas and leaving everything else alone, so the
   * token this refusal quotes is the reader's own text. Seven ticks cannot be paired — before this, the stray one
   * vanished off the page and the tail of the refusal was handed to `<code>`.
   */
  const refusal = read('(shiny)`a').error ?? '';

  expect([...refusal].filter((character) => character === '`')).toHaveLength(7);
  expect(faithful(refusal)).toEqual(kept(refusal));

  // The tick is still there to be read, in the prose at the end rather than swallowed as a delimiter.
  expect(spans(refusal).at(-1)).toBe('a`');
});
