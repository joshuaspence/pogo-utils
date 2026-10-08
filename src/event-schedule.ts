/**
 * Where an event sits in time: the feed's two sources merged into one list, each entry's dates parsed, and the
 * placement the three views read off it. None of it needs a DOM, which is what lets a test reach these rules without
 * one — `src/pages/events.tsx` is a page component and so unreachable outside a browser.
 */

import { HAS_ZONE } from './event-feed.js';

import type { FeedEvent } from './types.js';

/**
 * A feed entry with its dates parsed — the only shape the page itself works in. Not `Event`, which would shadow the
 * DOM's own for the whole page module, where the card's acknowledge handler takes a real `MouseEvent`.
 */
export interface ParsedEvent {
  eventID: string;
  name: string;
  heading: string;
  eventType: string;
  link: string;
  image: string;
  start: Date | null;
  end: Date | null;

  /** Whether the feed gave `start` a zone, so the label can say "your local time". */
  startHasZone: boolean;
}

export type StatusKind = 'active' | 'upcoming' | 'tbd' | 'ended';

/**
 * Where an event sits relative to now. A discriminated union rather than one shape with an optional `at`, because the
 * edge a card counts down to is exactly what a dateless event lacks. `tbd` still carries the field as an explicit
 * null, so `status.at` is readable without first ruling that kind out.
 */
export type Status =
  { kind: 'tbd'; at: null } | { kind: 'upcoming' | 'ended'; at: Date } | { kind: 'active'; at: Date | null };

/**
 * The half-open instant interval an event occupies, `[startMs, endMs]`. A tuple rather than a `number[]` so neither
 * end has to answer for a third element, and so `win[0]` stays a `number` — `noUncheckedIndexedAccess` adds
 * `| undefined` to an array's element but not to a tuple index. Not `Window`, for the reason `ParsedEvent` is not
 * `Event`.
 */
export type Span = readonly [number, number];

/** One event placed on a Tracks row. `lane` is written by `packLanes` afterwards: it depends on the whole row. */
export interface TrackItem {
  ev: ParsedEvent;
  startMs: number;
  endMs: number;
  lane: number;
}

export const DAY_MS = 86_400_000;

export function parseDate(s: string | null): Date | null {
  if (!s) {
    return null;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * The largest unit that keeps a relative label's number readable, and that number — whether "in 90 minutes" reads as
 * hours. The wording is Intl's: `relative()` hands this to a `RelativeTimeFormat`.
 */
export function relativeUnit(target: Date, now: Date) {
  const mins = Math.round((target.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(mins);

  if (abs < 60) {
    return { value: mins, unit: 'minute' as const };
  }

  if (abs < 60 * 24) {
    return { value: Math.round(mins / 60), unit: 'hour' as const };
  }

  return { value: Math.round(mins / (60 * 24)), unit: 'day' as const };
}

/**
 * Where an event sits relative to now. `active` covers both a running window and one started with no end.
 *
 * `tbd` is rarely the announced-but-unscheduled event it sounds like. ScrapedDuck reads an event's identity off Leek
 * Duck's list but joins its dates in from a feed that drops them days earlier, so everything under the list's
 * "Recently ended" divider reaches us dateless — on 2026-09-24 the feed's five dateless events were exactly that
 * divider's five. So `tbd` mostly means an event already over, which is why `renderCards` keeps the bucket behind a
 * toggle.
 */
export function statusOf(ev: ParsedEvent, now: Date): Status {
  if (!ev.start && !ev.end) {
    return { kind: 'tbd', at: null };
  }

  if (ev.start && now < ev.start) {
    return { kind: 'upcoming', at: ev.start };
  }

  if (ev.end && now > ev.end) {
    return { kind: 'ended', at: ev.end };
  }

  return { kind: 'active', at: ev.end };
}

/**
 * The instant window an event occupies for the calendar's overlap tests. A start with no end is a single-day marker
 * rather than an open-ended band that would paint every following day; an end with no start is a day at its end date.
 * `start ?? end` is null exactly when both are, so the dateless case needs no guard of its own.
 */
export function windowOf(ev: ParsedEvent): Span | null {
  if (ev.start && ev.end) {
    return [ev.start.getTime(), ev.end.getTime()];
  }

  const day = ev.start ?? ev.end;

  if (day === null) {
    return null;
  }

  const dayStart = startOfDay(day).getTime();
  return [dayStart, dayStart + DAY_MS];
}

export function overlaps(win: Span | null, from: number, to: number) {
  return win !== null && win[0] < to && win[1] > from;
}

/**
 * The columns of one week row an event's window touches, as `[first, last]` inclusive, or null for a week it misses. A
 * window is one contiguous interval, so the columns it covers are contiguous and the pair describes them completely.
 */
export function weekColumns(win: Span | null, weekStart: Date): readonly [number, number] | null {
  let first = -1;
  let last = -1;

  for (let col = 0; col < 7; col += 1) {
    const dayStart = addDays(weekStart, col).getTime();

    if (overlaps(win, dayStart, dayStart + DAY_MS)) {
      first = first === -1 ? col : first;
      last = col;
    }
  }

  return first === -1 ? null : [first, last];
}

/**
 * The class marking an event's type, so CSS can give each its own colour (the `.type-*` rules in `events.css`). Takes
 * the stable `eventType` slug rather than the human `heading`, and is worn by the card, both bars and the filter chip
 * alike, which is what keeps one type reading the same colour in all four.
 */
export function typeClass(eventType: string) {
  return eventType ? ` type-${eventType}` : '';
}

/**
 * Assign each item a `lane` — a sub-row within its track — by greedy interval partitioning: reuse the first lane whose
 * previous bar has ended, otherwise open a new one. Items must arrive sorted by start. Returns the lane count, which
 * sets the track's height so overlapping events stack instead of drawing over each other.
 */
export function packLanes(items: readonly TrackItem[]) {
  const laneEnds: number[] = [];

  for (const it of items) {
    const free = laneEnds.findIndex((end) => end <= it.startMs);
    const lane = free === -1 ? laneEnds.length : free;

    laneEnds[lane] = it.endMs;
    it.lane = lane;
  }

  return laneEnds.length;
}

function normalise(raw: readonly FeedEvent[]): ParsedEvent[] {
  return raw.map((e) => ({
    eventID: e.eventID,
    name: e.name,
    heading: e.heading,
    eventType: e.eventType,
    link: e.link,
    image: e.image,
    start: parseDate(e.start),
    end: parseDate(e.end),
    startHasZone: typeof e.start === 'string' && HAS_ZONE.test(e.start),
  }));
}

/**
 * The two feeds as one list, sorted by start, with this repository's own entries last so one overrides a feed event of
 * the same `eventID` rather than duplicating it. Either side may be empty, which is what lets the page tolerate a dead
 * feed or a missing local file. A dateless event sorts to the end on `Infinity`, where the cards view wants it.
 *
 * The Map is annotated because a bare `new Map()` is a `Map<any, any>` that `set` does not refine, so `normalise`
 * would check nothing at all about what it was handed.
 */
export function mergeEvents(feed: readonly FeedEvent[], local: readonly FeedEvent[]): ParsedEvent[] {
  const byEventId = new Map<string, FeedEvent>();

  for (const e of [...feed, ...local]) {
    byEventId.set(e.eventID, e);
  }

  return normalise([...byEventId.values()]).sort(
    (a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity),
  );
}
