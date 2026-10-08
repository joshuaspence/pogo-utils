/**
 * What `assembled` answers and what it refuses, which is the one reader that returns a triple no pass read and so the
 * one whose refusals are worth as much as its answers.
 *
 * `screens.test.mts` cannot state them. It reaches `assembled` on two of its 43 captures, and on `dialga-origin.png`
 * the combination that checks out is the one the first pass read anyway — so the row is satisfied either way and
 * nothing there distinguishes an assembly from the fallback. Two of the three ways this can answer are unreachable
 * over that corpus altogether: no capture puts two combinations in play, and the single-digit percentage below is a
 * screen nobody has captured.
 *
 * The readings are quoted off the real loop, dumped out of `readOverlay` over every fixture, rather than invented. What
 * keeps them from going stale as transcription is the corpus itself: a treatment that starts reading those bands
 * differently moves the triple `articuno-galar.png`'s row denies, and `screens.test.mts` fails there.
 */

import { assembled } from './overlay.mts';
import { expect, test } from 'vitest';

/**
 * The two captures the real loop reaches, as the readings it hands this. `articuno-galar.png` is the case the feature
 * exists for — attack 10 or 12, stamina 13 or 3, and only `12/4/13` coming to the `64` the second pass printed.
 *
 * `dialga-origin.png` is the one the corpus cannot speak for: the second pass loses the stamina alone, so the only
 * combination that checks out is the first pass's own `10/13/13` and the answer is the fallback's. Asserted anyway,
 * because "the fallback would have done" is a fact about these two readings rather than about the code — a change that
 * started answering something else here would pass every row in the corpus.
 */
test('the two captures the corpus reaches assemble to what their screens read', () => {
  expect(
    assembled([
      { iv: { attack: 10, defense: 4, stamina: 13 }, before: '20 ' },
      { iv: { attack: 12, defense: 4, stamina: 3 }, before: '120 164 ' },
    ]),
    'the triple no pass read on `articuno-galar.png` is no longer the one the percentage picks out',
  ).toStrictEqual({ attack: 12, defense: 4, stamina: 13 });

  expect(
    assembled([
      { iv: { attack: 10, defense: 13, stamina: 13 }, before: 'L251 ' },
      { iv: { attack: 10, defense: 13, stamina: 1 }, before: '/ 25 180 ' },
    ]),
    '`dialga-origin.png` assembles to something other than the triple its first pass read',
  ).toStrictEqual({ attack: 10, defense: 13, stamina: 13 });
});

/**
 * Nothing where nothing checks out, which is the common case and the one that leaves `readOverlay` standing on its
 * fallback. Both are readings the loop really hands this: `rotom-wash.png`'s two passes agree on `13/3/1` and neither
 * prints a percentage that comes to it, and `burmy-plant.png` offers a single pass whose `45` is no percentage of
 * `14/15/15`.
 */
test('nothing is assembled where no combination checks out', () => {
  expect(
    assembled([
      { iv: { attack: 13, defense: 3, stamina: 1 }, before: 'L12 3/ ' },
      { iv: { attack: 13, defense: 3, stamina: 1 }, before: 'L12 13/ ' },
    ]),
  ).toBeNull();

  expect(assembled([{ iv: { attack: 14, defense: 15, stamina: 15 }, before: '45 ' }])).toBeNull();

  // And with no reading at all, which is every capture whose band reads as no possible triple — `readOverlay` asks
  // this before it knows whether it has anything to fall back on.
  expect(assembled([])).toBeNull();
});

/**
 * Nothing where more than one combination checks out, which is the abstention the corpus cannot reach: no capture in it
 * puts two triples in play with a percentage apiece. These are `articuno-galar.png`'s own readings with a percentage
 * printed on both passes, disagreeing — `160` confirming the `10/4/13` near-white read and `164` the `12/4/13` it did
 * not. Two is a guess between them rather than a reading, so this answers nothing and the fallback stands.
 */
test('nothing is assembled where more than one combination checks out', () => {
  expect(
    assembled([
      { iv: { attack: 10, defense: 4, stamina: 13 }, before: '160 ' },
      { iv: { attack: 12, defense: 4, stamina: 3 }, before: '164 ' },
    ]),
  ).toBeNull();
});

/**
 * A percentage of one digit confirms nothing, which is what stops this inventing a triple off a run that is no
 * percentage at all. Both readings here are ordinary: a level of 20 ends in the `0` that a triple summing to 0 comes
 * to, and `182` ends in the `2` that one summing to 1 does, and either run is longer than that single digit — so
 * without the two-digit floor `0/0/0` is uniquely "confirmed" and displaces the `0/4/13` the first pass actually read.
 *
 * Both a level run and a plain one, because that is what separates the floor from guarding on `lastIsLevel`: the `L`
 * rules out the first of these and says nothing about the second.
 */
test('a percentage of one digit assembles nothing', () => {
  expect(
    assembled([
      { iv: { attack: 0, defense: 4, stamina: 13 }, before: 'L20 ' },
      { iv: { attack: 12, defense: 0, stamina: 0 }, before: '182 ' },
    ]),
    'a level of 20 confirmed a triple summing to 0, which no pass read',
  ).toBeNull();

  expect(
    assembled([
      { iv: { attack: 0, defense: 4, stamina: 13 }, before: '180 ' },
      { iv: { attack: 12, defense: 0, stamina: 0 }, before: '182 ' },
    ]),
    'a run of `180` confirmed a triple summing to 0, which no pass read',
  ).toBeNull();
});
