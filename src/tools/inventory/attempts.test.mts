/**
 * What `bestOf` reads and what it keeps, which is the decision `scripts/inventory.mts` makes about every Pokémon it
 * walks past and the one part of that walk no other test reaches: `cli.test.mts` drives the script as a subprocess,
 * and the only command there that needs no phone is `parse`, which reads a file once and retries nothing.
 *
 * So the scan's half of the contract is asserted here, against answers scripted as the fault counts a reading comes
 * out with — a screen read whole counting nought, and each thing wrong with it counting one. What a *reading's* count
 * is made of belongs with the scan, and which captures come out above nought is pinned over the real corpus in
 * `screens.test.mts`. This is the behaviour those two leave unstated: that a count above nought is read again, that a
 * count of nought is not, and which of several answers comes back.
 *
 * `read` records the attempts it was handed throughout, so that how many times it was called is asserted alongside what
 * came back. An answer alone cannot say it: `bestOf` returning the clean answer is also what a reader called once and
 * lucky would produce.
 */

import { bestOf } from './attempts.mts';
import { expect, test } from 'vitest';

/** How many faults each attempt's answer comes out with, in order, and the attempt numbers `read` was handed. */
function reader(...counts: readonly number[]) {
  const asked: number[] = [];

  return {
    asked,

    // The answer is its own count wrapped in an object, so that `toBe` below is an identity test: two attempts of one
    // quality are the same number and `toBe` on the number alone could not say which of them came back.
    read: (attempt: number) => {
      asked.push(attempt);

      return Promise.resolve({ faults: counts[attempt] ?? 0 });
    },
  };
}

const faults = (answer: { faults: number }) => answer.faults;

test('an answer nothing counts against is taken at once', async () => {
  const { asked, read } = reader(0, 0, 0);

  expect(await bestOf(3, faults, read)).toStrictEqual({ faults: 0 });
  expect(asked, 'a faultless answer was read again, which costs a screenshot and an OCR run for nothing').toStrictEqual(
    [0],
  );
});

/**
 * The retry itself: a reading with something counting against it is read again, and the clean second look is what comes
 * back. This is the whole point of the loop — the first answer is the one the scan used to write into a row, notes and
 * all, while it still had the phone on that Pokémon.
 */
test('a faulty answer is read again, and the clean second look is what comes back', async () => {
  const { asked, read } = reader(1, 0);

  expect(await bestOf(3, faults, read)).toStrictEqual({ faults: 0 });

  // Two, not three: the clean answer stops the loop as surely as a clean first one does, so a Pokémon that reads
  // whole on the second look costs one extra read rather than the whole ration.
  expect(asked).toStrictEqual([0, 1]);
});

/**
 * And the half a retry is easy to leave out. A second look can come back worse than the first — on a detail screen,
 * one whose HP goes unread has no key at all, and three keyless readings in a row stop the pass — so the answer kept
 * is the one with least counting against it rather than whichever the last attempt produced.
 */
test('the best of the attempts comes back, not the last', async () => {
  const { asked, read } = reader(2, 1, 3);
  const answer = await bestOf(3, faults, read);

  expect(answer).toStrictEqual({ faults: 1 });
  expect(asked, 'the ration was not spent, so the answer returned was not the best available').toStrictEqual([0, 1, 2]);
});

/**
 * Equals go to the last, which is what leaves the ordinary run — every attempt as doubtful as the one before — handing
 * back exactly what it always did. The scan carries the attempt's screenshot out with its reading and hands it to the
 * scroll capture as that capture's first frame, so the freshest of equals is the one that costs nothing.
 */
test('the last of equal answers comes back', async () => {
  const { read } = reader(1, 1, 1);
  const answers: { faults: number }[] = [];
  const kept = await bestOf(3, faults, async (attempt) => {
    const answer = await read(attempt);
    answers.push(answer);

    return answer;
  });

  expect(kept).toBe(answers[2]);
});

test('the ration bounds the reads where no attempt is clean', async () => {
  const { asked, read } = reader(1, 1, 1, 1, 1);

  expect(await bestOf(3, faults, read)).toStrictEqual({ faults: 1 });
  expect(asked).toStrictEqual([0, 1, 2]);
});

/**
 * A ration of nought or less still reads once, which is the one input that could hang this rather than answer wrongly:
 * the loop has no answer to give until `read` has produced one, so there is nothing for it to return early. Asserted
 * because a caller computing its ration — `READ_ATTEMPTS` less what a pass has spent, say — can arrive here with one.
 */
test.for([0, -1])('a ration of %i still reads once', async (tries) => {
  const { asked, read } = reader(1);

  expect(await bestOf(tries, faults, read)).toStrictEqual({ faults: 1 });
  expect(asked).toStrictEqual([0]);
});
