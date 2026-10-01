/**
 * The two values a page and a calendar both read, and the two defects that follow from reading them differently. A
 * naive datetime misread as carrying a zone moves a local event by whatever offset the machine building the calendar
 * happens to sit at, and a route line that writes the kinds an event has none of advertises routes it does not have.
 *
 * The zone cases are written out rather than read from `data/events.json`, which does carry both kinds — this file is
 * compiled by the browser project, where `resolveJsonModule` is unset and `node:fs` is the import the empty `types`
 * exists to keep out. The feed's own two shapes are in the module's comment either way, and the cases that discriminate
 * the pattern are near-misses the real feed cannot produce.
 */

import { expect, test } from 'vitest';

import { HAS_ZONE, routeSummary } from './event-feed.js';

/** A naive feed datetime, as `dancing-in-the-moonlight-2026` carries it: 10am wherever the reader is. */
const NAIVE = '2026-09-23T10:00:00.000';

/** The same feed's other shape, as `citysafari-brisbane-2026` carries it: one instant worldwide. */
const ZONED = '2026-05-22T14:00:00.000Z';

test('a naive datetime carries no zone, which is the distinction neither consumer may lose', () => {
  // These are the two shapes the feed actually emits, and the whole of what the page labels "your local time" and the
  // calendar writes as a floating `DATE-TIME` rather than as UTC.
  expect(HAS_ZONE.test(NAIVE)).toBe(false);
  expect(HAS_ZONE.test(ZONED)).toBe(true);
});

test('every spelling of a zone the feed could use is read as one', () => {
  // A false negative here is the cheaper of the two failures but not a cheap one: a GO Battle League rotation written
  // as floating happens at the named wall clock in every timezone rather than at the single instant it has.
  expect(HAS_ZONE.test('2026-05-22T14:00:00.000z')).toBe(true);
  expect(HAS_ZONE.test('2026-05-22T14:00:00.000+10:00')).toBe(true);
  expect(HAS_ZONE.test('2026-05-22T14:00:00.000+1000')).toBe(true);
  expect(HAS_ZONE.test('2026-05-22T14:00:00.000-05:00')).toBe(true);
});

test('a string that is not a datetime at all reads as naive rather than as zoned', () => {
  // `2026-09-21` is the near-miss: it ends in a hyphen and four digits, which is the shape of an offset, and only the
  // digit counts keep it out. A date read as zoned is the expensive direction — the event stops being 10am where the
  // reader is and becomes 10am where the build ran.
  //
  // What no case here can show is the `$` on the offset alternative. The only `-` in an ISO datetime are the two date
  // separators, and each is followed by exactly two digits and then a `-`, a `T` or the end — never by two more digits
  // nor by a colon and two digits — so the pattern cannot match inside the date part at all, anchored or not. The two
  // readings disagree on one shape only, `…+10:00[Australia/Sydney]`, which this feed does not emit and on which the
  // unanchored reading is the right one. So that is a break unreachable here rather than one a wider corpus would
  // catch.
  expect(HAS_ZONE.test('2026-09-21')).toBe(false);
  expect(HAS_ZONE.test('2026-09-21T06:00')).toBe(false);
  expect(HAS_ZONE.test('')).toBe(false);
});

test('a Date cannot say whether a zone was there, and the gap is the machine it was built on', () => {
  // Which is why the pattern reads the feed's string. Both parse, so neither the value nor a `NaN` reports the
  // difference; what separates them is the offset wherever this runs, so a calendar built on a CI runner is out by
  // exactly that for every local event.
  expect([Number.isNaN(Date.parse(NAIVE)), Number.isNaN(Date.parse(ZONED))]).toEqual([false, false]);

  // Subtracted this way round rather than by negating the offset, which is what keeps the assertion true on a runner
  // that is itself UTC: there the offset is `0` and `-0 * 60_000` is `-0`, a different number to `Object.is` from the
  // `+0` the left-hand side gives.
  expect(Date.parse(NAIVE) - Date.parse(`${NAIVE}Z`)).toBe(new Date(NAIVE).getTimezoneOffset() * 60_000);
});

test('each kind the event has is pluralised, and a kind it has none of is left out', () => {
  expect(routeSummary({ routes: 1, waypoints: 1 })).toBe('1 route · 1 waypoint');
  expect(routeSummary({ routes: 2, waypoints: 3 })).toBe('2 routes · 3 waypoints');

  // A zero written out is a card advertising what the event does not have, and the guard is a truthiness test rather
  // than a comparison, so this is the case that says which of the two it is.
  expect(routeSummary({ routes: 1, waypoints: 0 })).toBe('1 route');
  expect(routeSummary({ routes: 0, waypoints: 1 })).toBe('1 waypoint');
});

test('an event with nothing to count writes nothing rather than an empty separator', () => {
  // The caller puts this line on a card and in a VEVENT description, so what it writes for nothing has to be falsy
  // rather than a lone `·` with a space either side.
  expect(routeSummary({ routes: 0, waypoints: 0 })).toBe('');
});

test('the counts are written routes first, joined by the separator both consumers share', () => {
  // Splitting on the separator pins the order and the separator in the one expression: a middle dot, U+00B7, and not
  // the full stop or hyphen a second spelling of this line would have reached for.
  expect(routeSummary({ routes: 2, waypoints: 1 }).split(' · ')).toEqual(['2 routes', '1 waypoint']);
});
