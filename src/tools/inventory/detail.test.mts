/**
 * What `rescue` takes off a treated CP band and what it turns down — the rule every pass of `wholeCp` is run through,
 * asserted on its own because the corpus cannot isolate it. `screens.test.mts` states the CP each capture ends with,
 * and this rule against three different band readings can all arrive at the same one.
 *
 * The readings quoted below are dumped off the real loop over every fixture, except in the last test, which constructs
 * its inputs: that one is a claim about the rule's whole domain rather than about a capture.
 *
 * What this still cannot pin is *which* treatment earned a rescue. The readings are quoted, so a change that had a
 * cheaper pass start reading `738` would leave this file and all 43 rows green with the third treatment dead. Only a
 * live read per treatment would say, and that wants the band's own crop rather than a second copy of it here.
 */

import { rescue } from './detail.mts';
import { expect, test } from 'vitest';

/** How many digits the longest CP any form can show runs to, which is what `cpDigits` answers off the vended master. */
const LONGEST = 4;

/**
 * `growlithe-nickname.png` is the capture brightness exists for, and its band's three readings at pad 0.35 are the
 * whole case for a third treatment: the two cheaper passes read the line's own `38` back, and only the brightened one
 * finds the digit the line lost. Asserted as the readings rather than as the final CP, that being the part no row says.
 */
test('only the brightened band offers growlithe-nickname its lost digit', () => {
  expect(rescue('P38', '38', LONGEST), 'the plain band has started offering more than the line read').toBeNull();
  expect(rescue('38', '38', LONGEST), 'the near-white band has started offering more than the line read').toBeNull();

  expect(rescue('P738', '38', LONGEST), 'the brightened band no longer rescues the 738 on this screen').toBe('738');
});

/**
 * The acceptance rule's two directions, on the bands that exercise them: `unown-b.png` is extended off the front and
 * `unown-question.png` off the back — the second wrongly, which is the corpus's one misread CP and pinned as a defect.
 */
test('a longer number sharing an end with the line is taken', () => {
  expect(rescue('P487', '48', LONGEST), 'a band extending the line forwards is no longer taken').toBe('487');
  expect(rescue('CP4864', '48', LONGEST), 'a band extending the line backwards is no longer taken').toBe('4864');
});

/**
 * The rule's two refusals, constructed: a number the line only sits inside is a different number rather than more of
 * the same one, and one sharing neither end is a disagreement. Both matter because brightness reads numeric noise
 * unrelated to the CP on three captures, and this is all that stands between that and an answer.
 */
test('a number the line sits inside, or shares no end with, is turned down', () => {
  expect(rescue('1385', '38', LONGEST), 'a number the line only sits inside is being taken as a rescue').toBeNull();
  expect(rescue('999', '38', LONGEST), 'a band sharing neither end is being taken as a rescue').toBeNull();
});

/**
 * Why `wholeCp` turns a four-digit line away before reading any band at all: the rule wants a number longer than the
 * line's and no longer than a CP, so the two meeting leaves nothing satisfiable. Asserted over a domain rather than one
 * reading, that being the claim the guard rests on — and `charizard-gigantamax.png`'s `691605` is what used to be
 * turned down here, after three passes had already been spawned to produce it.
 */
test('a line already as long as a CP admits no rescue whatever', () => {
  expect(rescue('691605', '1605', LONGEST), 'a six-digit run is being taken despite the cap').toBeNull();

  for (const text of ['1605', '16050', '01605', '1605 1605', '', '99999']) {
    expect(rescue(text, '1605', LONGEST), `\`${text}\` is accepted against a line already at the cap`).toBeNull();
  }
});
