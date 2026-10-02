/**
 * The control on the sweep itself, which is the one thing the swept tests cannot report. A `testEveryZone` that failed
 * to change the zone would run four green cases in whatever zone the machine is in, which reads exactly like a sweep.
 * So each case asserts the offset the zone it was handed actually has.
 *
 * It asserts the offset rather than `Intl.DateTimeFormat().resolvedOptions().timeZone`, which answers ICU's own
 * spelling and so reads `Asia/Katmandu`, without the `h`, for the entry `ZONES` names `Asia/Kathmandu`. A name
 * comparison would fail on the one zone that is there for its odd offset, which is the trap this way round avoids.
 */
import { expect, test } from 'vitest';

import { testEveryZone, ZONES, type Zone } from './zones.js';

/**
 * Minutes *behind* UTC, which is the sign `getTimezoneOffset` uses — positive west of Greenwich. January and July
 * because a zone that changes its clocks reads differently in the two whichever hemisphere it is in, so the pair says
 * both what the zone is and whether it moves.
 *
 * `Record<Zone, …>` rather than an index signature, so a zone added to `ZONES` with no reading written here is a
 * `TS2741` rather than a case that asserts nothing.
 */
const OFFSETS: Record<Zone, readonly [number, number]> = {
  'America/New_York': [300, 240],
  'Asia/Kathmandu': [-345, -345],
  'Australia/Sydney': [-660, -600],
  'UTC': [0, 0],
};

/**
 * Taking the stub out of `testEveryZone` fails three of these four and not all four, and the survivor is not a gap: it
 * is whichever entry the machine is already in, which here is `Australia/Sydney`. A control cannot single out the zone
 * it would have run in anyway, so read a green case against a red file as naming the reader's own zone.
 */
testEveryZone('the sweep puts the test in the zone it names', (zone) => {
  const january = new Date(2026, 0, 1).getTimezoneOffset();
  const july = new Date(2026, 6, 1).getTimezoneOffset();

  expect([january, july]).toEqual(OFFSETS[zone]);
});

/**
 * What the list is for, as against what each entry of it reads. Four distinct readings is what makes it a sweep, and at
 * least one zone that moves its clocks is the entry the measurement proved load-bearing rather than belt-and-braces.
 *
 * Reaching either takes a coordinated edit, which is the point: two zones sharing an offset — `Europe/London` beside
 * `Europe/Dublin`, say — pass every case above and fail the first line here.
 */
test('the four zones are four different readings, and one of them changes its clocks', () => {
  const readings = ZONES.map((zone) => OFFSETS[zone]);

  expect(new Set(readings.map(([january, july]) => `${january}:${july}`)).size).toBe(ZONES.length);
  expect(readings.filter(([january, july]) => january !== july).length).toBeGreaterThan(0);
});
