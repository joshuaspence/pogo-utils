/**
 * Builds the iCalendar feed the Events page links to, holding what that page shows by default, writing it into the
 * `dist/` the rest of `pnpm build` is assembling rather than into the checkout.
 *
 * It exists because a calendar subscription is a URL a calendar app fetches by itself. Google Calendar cannot run
 * events.html's JavaScript, so the merge the browser does — data/events-feed.json, the copy of Leek Duck's list that
 * scripts/vend-feed.mts keeps, overridden by data/events.json where an `eventID` is in both — has to be done ahead of
 * time and the result published as a static file. data/entries-by-event.json puts the same "2 routes · 1 waypoint" line
 * into an event's description as it puts on its card.
 *
 * Nothing here reads the clock, and nothing here touches the network either: fetching the feed is vend-feed.mts's job,
 * which is what lets this be a step of `pnpm build` beside the rest and a local run give exactly the file a deploy
 * would. The output is a pure function of those three files, so a build that finds the event data unmoved publishes the
 * bytes a subscriber already holds. A `DTSTAMP` is required all the same, so each event's is derived from its own
 * start.
 */

import { byCodeUnit, HAS_ZONE, LOCAL_EVENTS, routeSummary, VENDED_EVENTS } from '../src/event-feed.ts';
import { ENTRIES_BY_EVENT, EVENTS_FEED } from '../src/generated.ts';
import RECURRING_TYPES from '../src/recurring-types.ts';
import type { FeedEvent, RouteIndex } from '../src/types.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the pages are served from. A calendar app shows an event's description far away from this site, so the links
 * inside one have to be absolute — this is the only place that spelling is kept.
 */
const SITE = 'https://joshuaspence.github.io/pogo-utils';

/**
 * The artifact this writes into, which `scripts/assemble.mts` spells for itself. The feed is produced here rather than
 * copied in because nothing in the checkout holds one: it is derived from three files that are, so there is no second
 * copy to keep in step and nothing to publish from the allowlist.
 *
 * Made below rather than taken for granted. `tsconfig.json` has no `outDir`, emitting declarations alone, so the only
 * thing that creates `dist/` is esbuild in `scripts/bundle.mts` — which left `pnpm build:ics` on its own failing on an
 * `ENOENT` for a directory the step before it happened to make.
 */
const DIST = 'dist';

// A UID has to be unique across every calendar its reader subscribes to, so the stable `eventID` is qualified by us.
const UID_DOMAIN = 'pogo-utils.joshuaspence.github.io';

/**
 * How often a subscriber should come back. Both spellings are given: `REFRESH-INTERVAL` is the standard one (RFC 7986)
 * and `X-PUBLISHED-TTL` is what Outlook reads. Either way it is a hint — Google Calendar polls on its own schedule,
 * which is usually slower.
 */
const REFRESH = 'PT6H';

const RECURRING = new Set(RECURRING_TYPES);

const FEED = {
  file: join(DIST, EVENTS_FEED),
  name: 'Pokémon GO Events',
  description: 'Current and upcoming Pokémon GO events, without the weekly hourly-cadence ones.',
};

/**
 * A feed datetime's calendar fields, read off the string so that a zoneless one can be written out as iCalendar's
 * floating time — a DATE-TIME with neither a `TZID` nor a trailing `Z` — without a `Date` anchoring it to whichever
 * timezone this happens to run in. `HAS_ZONE` in `src/event-feed.ts` is what says which of the two a value is.
 */
const PARTS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

function icsDate(raw: string | null): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const parts = PARTS.exec(raw);

  if (!parts) {
    return null;
  }

  if (!HAS_ZONE.test(raw)) {
    const [, year, month, day, hour, minute, second] = parts;
    return `${year}${month}${day}T${hour}${minute}${second}`;
  }

  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

// `DTSTAMP` is a UTC timestamp whatever the event is. A floating time has no instant to convert, so its digits are
// taken as they stand — the value only has to be stable, and this one is.
const utcStamp = (value: string) => (value.endsWith('Z') ? value : `${value}Z`);

// The characters a TEXT value cannot carry as themselves. A line break is any of the three spellings, since a lone CR
// would otherwise reach `fold()` below and be dropped rather than kept as the break it is. URI values (`URL:`) have no
// escaping of this kind at all, which is why the strip that backs this up lives on the line rather than on the value.
const escape = (text: string) => text.replace(/([\\;,])/g, '\\$1').replace(/\r\n|[\r\n]/g, '\\n');

/**
 * A UTF-8 continuation byte, the second and later octet of a multi-byte character. Reading past the end of the buffer
 * gives `undefined`, which is not one — a subscript is `number | undefined` under `noUncheckedIndexedAccess` however
 * carefully the caller bounds it.
 */
const isContinuation = (byte: number | undefined) => byte !== undefined && (byte & 0xc0) === 0x80;

/**
 * Every control character RFC 5545 forbids a content line to carry. A CR or an LF *ends* the line, so text after one in
 * a value the feed supplied is read as a property of its own — a `SUMMARY:`, an `ATTENDEE:`, a whole `BEGIN:VALARM` —
 * and the rest are illegal outright. `\p{Cc}` is that set exactly: C0, DEL and C1.
 */
const CONTROL = /\p{Cc}/gu;

/**
 * RFC 5545 caps a content line at 75 *octets*, continuing it with CRLF and a leading space. Octets, and these names
 * carry é and · — so the length is measured over the UTF-8 encoding, and a split is walked back off any continuation
 * byte rather than cutting a character in half.
 *
 * The strip is here rather than beside each property because this is the last function every line passes through, and
 * `escape()` only covers the TEXT ones: `UID:` and `URL:` interpolate the feed's `eventID` and `link` as they stand,
 * neither has any escaping to reach for, and the feed is somebody else's file that the deploy publishes unread.
 * Split on an octet count, this function would otherwise carry a line break straight through.
 */
function fold(raw: string): string {
  const line = raw.replace(CONTROL, '');
  const bytes = Buffer.from(line, 'utf8');

  if (bytes.length <= 75) {
    return line;
  }

  const pieces = [];
  let start = 0;

  // The first line may use all 75; a continuation spends one of them on its leading space.
  for (let limit = 75; start < bytes.length; limit = 74) {
    let end = Math.min(start + limit, bytes.length);

    while (end < bytes.length && isContinuation(bytes[end])) {
      end -= 1;
    }

    pieces.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }

  return pieces.join('\r\n ');
}

function vevent(ev: FeedEvent, index: RouteIndex): string[] {
  const start = icsDate(ev.start);
  const end = icsDate(ev.end);

  /**
   * A VEVENT must have a `DTSTART`, and the feed can leave either end of the window null. An event with only one of
   * them becomes a point in time at whichever it has — the same reading events.html gives it, where a start with no
   * end is a marker on its start date rather than a band running forever. One with neither is filtered out before it
   * reaches here, so the throw states that caller's obligation rather than writing `DTSTART:null` into the feed.
   */
  const from = start ?? end;

  if (!from) {
    throw new Error(`${ev.eventID}: no date to put on a calendar`);
  }

  const lines = [`UID:${ev.eventID}@${UID_DOMAIN}`, `DTSTAMP:${utcStamp(from)}`, `DTSTART:${from}`];

  if (start && end) {
    lines.push(`DTEND:${end}`);
  }

  lines.push(`SUMMARY:${escape(ev.name)}`);

  const description = [ev.heading];
  const here = index[ev.eventID];

  if (here) {
    description.push(`${routeSummary(here)} here: ${SITE}/#/map?event=${encodeURIComponent(ev.eventID)}`);
  }

  if (ev.link) {
    description.push(ev.link);
  }

  lines.push(`DESCRIPTION:${escape(description.filter(Boolean).join('\n'))}`);

  if (ev.link) {
    lines.push(`URL:${ev.link}`);
  }

  if (ev.heading) {
    lines.push(`CATEGORIES:${escape(ev.heading)}`);
  }

  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
}

function calendar({ name, description }: typeof FEED, events: FeedEvent[], index: RouteIndex): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//joshuaspence//pogo-utils//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
    `X-WR-CALDESC:${escape(description)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`,
    `X-PUBLISHED-TTL:${REFRESH}`,
    ...events.flatMap((ev) => vevent(ev, index)),
    'END:VCALENDAR',
  ];

  // iCalendar lines end CRLF, including the last one, and nothing between here and a subscriber rewrites them: the
  // feed goes straight into the artifact rather than through a checkout where git could normalise it.
  return lines.map(fold).join('\r\n') + '\r\n';
}

const feed: FeedEvent[] = JSON.parse(readFileSync(VENDED_EVENTS, 'utf8'));
const local: FeedEvent[] = JSON.parse(readFileSync(LOCAL_EVENTS, 'utf8'));
const index: RouteIndex = JSON.parse(readFileSync(ENTRIES_BY_EVENT, 'utf8'));

// Keyed by eventID with the local pass last, so a repo entry overrides a feed event of the same ID rather than
// duplicating it — the merge src/events.ts does, in the same order.
const byId = new Map<string, FeedEvent>();

for (const ev of [...feed, ...local]) {
  byId.set(ev.eventID, ev);
}

/**
 * An event with no date at all ("date unknown" on the events page) has nothing to put on a calendar, whether its dates
 * are still unannounced or went missing between Leek Duck and us. Sorted by start so the file reads in order and a diff
 * between two runs stays local to what moved.
 *
 * The comparison is over the raw strings rather than through a `Date`, because a zoned time and a floating one have no
 * shared instant to sort by. `byCodeUnit` is why it is not `localeCompare`; the eventID breaks a tie so the order is
 * total.
 */
const dated = [...byId.values()]
  .filter((ev) => icsDate(ev.start) ?? icsDate(ev.end))
  .sort((a, b) => byCodeUnit(a.start ?? '', b.start ?? '') || byCodeUnit(a.eventID, b.eventID));

const events = dated.filter((ev) => !RECURRING.has(ev.heading));

mkdirSync(DIST, { recursive: true });
writeFileSync(FEED.file, calendar(FEED, events, index));
console.log(`${FEED.file}: ${events.length} events`);
