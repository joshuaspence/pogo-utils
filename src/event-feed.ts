/**
 * What the event feed *is*, for the four parts that read it: where it comes from, where it is kept, what is kept of it,
 * how to tell one of its times from the other, when one of its events is over and how a route count is written out.
 *
 * `scripts/vend-feed.mts` copies the upstream list into `VENDED_EVENTS`; `src/events.ts` merges that copy with this
 * repository's own list live in the browser and `scripts/build-ics.mts` does the same merge ahead of time, because a
 * calendar app fetches a URL and cannot run the page's JavaScript; `scripts/prune-events.mts` drops the entries of that
 * own list which `prunable` says are over. Four consumers of one feed, so these belong in the shared project for the
 * reason `recurring-types.ts` gives: one spelling is what stops the page and the feed drifting into disagreeing.
 * `routeSummary` had been kept in step by hand, which is a comment where this is a check.
 */

import type { FeedEvent, RouteCounts } from './types.js';

/**
 * ScrapedDuck's JSON mirror of Leek Duck, which only `scripts/vend-feed.mts` fetches. No browser reaches it, so the
 * page and the calendar read one copy rather than two fetches that can disagree. A card's `image` still points at
 * `cdn.leekduck.com`, that being the URL the feed itself carries — it is the event *data* this governs, not everything
 * a visit fetches.
 */
export const UPSTREAM_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';

/**
 * The copy of the upstream list this repository keeps, which both the page and the calendar start from. Committed
 * rather than fetched per visit for two reasons: it is what holds the two in step, and `git log -p` over it is the
 * history ScrapedDuck does not keep — its `data` branch is a single commit, force-pushed on every scrape.
 */
export const VENDED_EVENTS = 'data/events-feed.json';

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
 * Whether an event is over everywhere by `now`, which is what lets `scripts/prune-events.mts` drop it. A naive end is a
 * wall clock every timezone reaches in turn, so it has passed everywhere only once it has passed at UTC−12, the last
 * zone to get there — which is what reading one *as* `-12:00` says, rather than reading it as UTC and adding the twelve
 * hours back. An event with no announced end has not ended, however long ago it started.
 */
export function ended({ end }: Pick<FeedEvent, 'end'>, now: Date) {
  if (!end) {
    return false;
  }

  const over = Date.parse(HAS_ZONE.test(end) ? end : `${end}-12:00`);

  /**
   * An unreadable `end` is refused rather than read as "not over", which is what a `NaN` compares as and would keep
   * the entry for good with nothing to say why. A date with no time reaches this: `"end": "2026-12-31"` is the natural
   * thing to hand-write for an all-day event, carries no zone, and `2026-12-31-12:00` is not a datetime `Date.parse`
   * will take — where `${end}Z` happened to parse it as midnight, which was the wrong end of the day anyway.
   */
  if (Number.isNaN(over)) {
    throw new Error(`end "${end}" is not a datetime — expected one like "2026-12-31T23:59:59.000" or "…Z"`);
  }

  return over < now.getTime();
}

/**
 * Which of `local`'s `eventID`s `scripts/prune-events.mts` may drop: the ones that are over everywhere by `now` *and*
 * that removing would actually remove.
 *
 * The second half is the one a reading of `ended` alone gets wrong. `local` *overrides* a feed entry of the same ID
 * rather than being the only source of one — see `mergeEvents` — so dropping an entry `vended` also carries does not
 * remove the event, it uncovers upstream's copy. That copy is usually the worse of the two by then: ScrapedDuck joins
 * an event's dates in from a feed that drops it days before the event list does, so what surfaces is the same event as
 * an undated card with no route count. Leaving the local entry in place is the only way to keep the better one.
 */
export function prunable(
  local: readonly Pick<FeedEvent, 'end' | 'eventID'>[],
  vended: readonly Pick<FeedEvent, 'eventID'>[],
  now: Date,
) {
  const carried = new Set(vended.map((event) => event.eventID));

  return new Set(
    local.filter((event) => ended(event, now) && !carried.has(event.eventID)).map((event) => event.eventID),
  );
}

/**
 * Orders two strings by code unit rather than through `localeCompare`, which is what both the files this repository
 * writes from the feed are sorted by. Collation varies with the ICU build, so a runner on a different Node would
 * reorder a committed file having changed nothing in it.
 */
export const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The feed as this repository keeps it: every event cut down to the fields it reads, ordered by `eventID`.
 *
 * Both of those exist to keep the committed copy quiet. ScrapedDuck re-scrapes every ten minutes, so a reworded
 * `extraData` blurb or a rehosted image would otherwise be a diff saying nothing, and the upstream order is its own
 * affair. What is left changes only when an event appears, is renamed, moves or loses its dates — which is what makes
 * `git log -p data/events-feed.json` readable and the vend commit conditional.
 *
 * Throwing rather than writing what it was given is the other half. An empty list is what a broken scrape looks like,
 * and writing one would take every Leek Duck event off the page and out of the calendar until the next good run; an
 * event with no `eventID` has nothing for either merge to key on. The previous copy is committed, so a refusal here
 * leaves the pages serving what they already held.
 */
export function vendable(raw: unknown): FeedEvent[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('not a non-empty list of events');
  }

  const events = raw.map((ev: FeedEvent): FeedEvent => {
    if (typeof ev?.eventID !== 'string' || !ev.eventID) {
      throw new Error(`an event without an eventID: ${JSON.stringify(ev)}`);
    }

    /*
     * Written out key by key rather than picked through a list of names, because the return annotation is then what
     * requires all eight: a field added to `FeedEvent` because a page started reading it fails to compile here until it
     * is carried, where a names array would go on dropping it silently. The order is `data/events.json`'s, so the two
     * event files read alike.
     */
    return {
      eventID: ev.eventID,
      name: ev.name,
      eventType: ev.eventType,
      heading: ev.heading,
      link: ev.link,
      image: ev.image,
      start: ev.start,
      end: ev.end,
    };
  });

  return events.sort((a, b) => byCodeUnit(a.eventID, b.eventID));
}

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
