/**
 * What an event *is* once the page has it, and where it sits in time: the feed's two sources merged into one list, each
 * entry's dates parsed, and the placement every one of the three views reads off it.
 *
 * `src/events.ts` is a page entry point and so unreachable outside a browser, where none of this needs one — a status,
 * an instant window, the columns of a week a bar covers and the lane it stacks in are all answers about dates. They sit
 * here beside `event-feed.ts` for the reason that file gives: a rule the page applies to the feed is worth being able
 * to check without a DOM around it.
 */

import { HAS_ZONE } from './event-feed.js';

import type { FeedEvent } from './types.js';

/**
 * A feed entry with its dates parsed — what every function below takes, and the only shape the page itself works in.
 * Named for what normalise() does to a `FeedEvent` rather than for the dates it carries, since a `tbd` event has none.
 *
 * `Event` would have been the obvious name and is the one to avoid: a type of that name shadows the DOM's own
 * `Event` for the whole of the page module, and the card's acknowledge handler takes a real `MouseEvent`.
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
 * Where an event sits relative to now — see statusOf(). A discriminated union rather than one shape with an optional
 * `at`, because the edge a card counts down to is exactly what a dateless event does not have: `tbd` carries no
 * instant, and `active` carries one only where the event has an announced end.
 *
 * `tbd` still carries the field, as an explicit null. Omitting it makes `status.at` unreadable without first ruling
 * that kind out, which is a test the card does not otherwise need — where a null says the same thing to the reader and
 * leaves the two pending kinds guaranteeing a `Date` all the same, which is the whole of what the union is for.
 */
export type Status =
  { kind: 'tbd'; at: null } | { kind: 'upcoming' | 'ended'; at: Date } | { kind: 'active'; at: Date | null };

/**
 * The half-open instant interval an event occupies, `[startMs, endMs]` — see windowOf(). A tuple rather than a
 * `number[]`, so the two ends are named by position and neither `overlaps()` nor `calBar()` has to answer for a third
 * element that cannot arrive. It is also what keeps `win[0]` a `number`: `noUncheckedIndexedAccess` adds `| undefined`
 * to an array's element but not to a tuple index the type already knows is there.
 *
 * Not `Window`, which is the DOM's own and would be shadowed for the whole module — the same trap `ParsedEvent` avoids.
 */
export type Span = readonly [number, number];

/**
 * One event placed on a Tracks row: the span it occupies, and the sub-row packLanes() has put it in.
 *
 * `lane` starts at 0 and is written afterwards rather than being part of the value, because which lane an event belongs
 * in is not a fact about the event — it depends on every other event on the same track, so nothing can know it until
 * the row is complete and sorted.
 */
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
 * The largest unit that keeps a relative label's number readable, and that number. Separated from the wording because
 * the wording is Intl's and the arithmetic is ours: `relative()` in the page hands this straight to a
 * `RelativeTimeFormat`, which handles pluralisation and the reader's locale, and this is the half that decides whether
 * "in 90 minutes" reads as hours.
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
 * Where an event sits relative to now. `active` covers both a running window and one that has started with no end.
 * `tbd` is an event the feed carries with no date at all, both `start` and `end` null.
 *
 * That is rarely the announced-but-unscheduled event it sounds like. ScrapedDuck reads an event's identity off Leek
 * Duck's event list but joins its dates in from `leekduck.com/feeds/events.json`, and that feed drops an event days
 * before the list page does, so everything under the list's "Recently ended" divider reaches us dateless. On 2026-09-24
 * the feed's five dateless events were exactly that divider's five, among them `gbl-twilight-trails_great-league_ultra-
 * league-mega-edition_willpower-cup-great-league-edition`, which Leek Duck's own page dates 15 to 22 September. So
 * `tbd` mostly means an event already over whose dates went missing on the way here — which is why renderCards() keeps
 * the bucket behind a toggle rather than showing it by default.
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
 * The instant window an event occupies for the calendar's overlap tests. A dated event is [start, end]; a start with no
 * end is a single-day marker on its start date rather than an open-ended band that would paint every following day; an
 * end with no start is a single day at its end date. A dateless event has no window and never lands on the grid.
 *
 * The dateless case is the `day === null` below rather than a guard of its own, because `start ?? end` is null exactly
 * when both are and one test therefore does the work of two. Guarding first left `start ?? end` as `Date | null` all
 * the same — nothing ties the earlier test to this expression — so the shorter form is also the one that needs no
 * assertion.
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
 * The columns of one week row an event's window touches, as `[first, last]` inclusive, or null for a week it misses
 * entirely. A window is one contiguous interval, so the columns it covers are contiguous too and the pair describes
 * them completely. A single-day event yields a one-column span and needs no special case.
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
 * The class marking an event's type, so CSS can give each type its own colour (see the `.type-*` rules in events.css).
 * Takes the stable `eventType` slug like the Tracks rows, not the human `heading`. Empty for a feed entry missing the
 * field, in which case the colour consumers fall back to their default. Worn by the card, the calendar bar, the
 * timeline bar and the filter chip alike, which is what keeps one type reading the same colour in all four.
 */
export function typeClass(eventType: string) {
  return eventType ? ` type-${eventType}` : '';
}

/**
 * Assign each item a `lane` — a sub-row within its track — by greedy interval partitioning: reuse the first lane whose
 * previous bar has already ended, otherwise open a new one. Items must arrive sorted by start. Returns the lane count,
 * which sets the track row's height so overlapping events stack instead of drawing over each other.
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
 * The two feeds as one list, sorted by start, with this repository's own entries last so one of them overrides a feed
 * event of the same `eventID` rather than duplicating it. Either side may be empty, which is what lets the page
 * tolerate a dead feed or a missing local file and still draw the other.
 *
 * A dateless event sorts to the end rather than to the front, which is where the cards view's own bucket order wants
 * it: `Infinity` for a missing start, so the comparison is between two numbers however many of them are missing.
 *
 * The Map is annotated because a bare `new Map()` is a `Map<any, any>` that a `set` does not refine, so `[...values()]`
 * would be an `any[]` and normalise() would check nothing at all about what it was handed — the claim its return type
 * makes rests on that line.
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
