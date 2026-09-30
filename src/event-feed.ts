/**
 * What the event feed *is*, for the two halves that read it: where it lives, how to tell one of its times from the
 * other, and how a route count is written out.
 *
 * `src/events.ts` merges the upstream feed with this repository's own list live in the browser and
 * `scripts/build-ics.mts` does the same merge ahead of time, because a calendar app fetches a URL and cannot run the
 * page's JavaScript. Two consumers of one feed, so these belong in the shared project for the reason
 * `recurring-types.ts` gives: one spelling is what stops the page and the feed drifting into disagreeing.
 * `routeSummary` had been kept in step by hand, which is a comment where this is a check.
 */

import type { RouteCounts } from './types.js';

/** ScrapedDuck's JSON mirror of Leek Duck, which is the feed both consumers start from. */
export const FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';

/**
 * This repository's own events, in the feed's shape, overriding a feed entry of the same `eventID`. One spelling covers
 * both kinds of consumer for the reason `generated.ts` states: a page resolves a relative URL against its own and the
 * pages sit at the repository root, which is also where a script is run from.
 */
export const LOCAL_EVENTS = 'data/events.json';

/**
 * Whether a feed datetime carries a zone, which is the one distinction neither consumer may lose. A naive datetime
 * ("2026-09-21T06:00:00.000") is a *local* event — 6am wherever you are, the same wall clock in every timezone — where
 * one that carries a zone ("…T20:00:00.000Z") is a single instant worldwide, a GO Battle League rotation say. The page
 * reads the difference to label a time "your local time"; the calendar writes the first as a floating `DATE-TIME` and
 * the second as UTC.
 *
 * Tested against the feed's own string rather than through a `Date`, because a `Date` built from a naive datetime is
 * anchored to whichever timezone the machine happens to be in — so a calendar built on a CI runner would move every
 * local event by the offset between there and here.
 */
export const HAS_ZONE = /[zZ]|[+-]\d{2}:?\d{2}$/;

/**
 * "2 routes · 1 waypoint" — each kind the event has, pluralised. A kind it has none of is left out rather than written
 * as a zero, so an event with only a waypoint does not advertise the routes it lacks. A card and a VEVENT description
 * carry the same line, which is why it is one function rather than three lines twice.
 */
export function routeSummary({ routes, waypoints }: RouteCounts) {
  const parts = [];

  if (routes) {
    parts.push(`${routes} route${routes === 1 ? '' : 's'}`);
  }

  if (waypoints) {
    parts.push(`${waypoints} waypoint${waypoints === 1 ? '' : 's'}`);
  }

  return parts.join(' · ');
}
