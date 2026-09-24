/**
 * Builds `events.ics`, the iCalendar feed the Events page links to, holding what that page shows by default.
 *
 * It exists because a calendar subscription is a URL a calendar app fetches by itself. Google Calendar cannot run
 * events.html's JavaScript, so the merge the browser does live — ScrapedDuck's mirror of Leek Duck, overridden by
 * data/events.json where an `eventID` is in both — has to be done ahead of time and the result committed as a static
 * file. entries-by-event.json puts the same "2 routes · 1 waypoint" line into an event's description as it puts on its
 * card.
 *
 * Nothing here reads the clock. The output is a pure function of those three inputs, so after a run `git diff --quiet`
 * answers exactly "has the event data moved?" — which is how the workflow decides whether there is anything to commit,
 * rather than pushing a fresh set of timestamps every six hours. A `DTSTAMP` is required all the same, so each event's
 * is derived from its own start.
 *
 * A failed fetch of the feed aborts rather than writing the handful of events data/events.json holds on its own: these
 * files are committed, and a run that cannot see the feed has nothing better to say than what is already there.
 */

import { ENTRIES_BY_EVENT } from '../src/generated.js';
import RECURRING_TYPES from '../src/recurring-types.js';
import { readFileSync, writeFileSync } from 'node:fs';

const FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';
const LOCAL_PATH = 'data/events.json';

/**
 * Where the pages are served from. A calendar app shows an event's description far away from this site, so the links
 * inside one have to be absolute — this is the only place that spelling is kept.
 */
const SITE = 'https://joshuaspence.github.io/pogo-utils';

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
  file: 'events.ics',
  name: 'Pokémon GO Events',
  description: 'Current and upcoming Pokémon GO events, without the weekly hourly-cadence ones.',
};

/**
 * Leek Duck gives times two ways, and the distinction is the one thing a static file must not lose. A naive datetime
 * ("2026-09-21T06:00:00.000") is a *local* event — 6am wherever you are — which is exactly iCalendar's floating time,
 * a DATE-TIME with neither a `TZID` nor a trailing `Z`. A datetime that carries a zone ("…T20:00:00.000Z") is one
 * instant worldwide, written as UTC.
 *
 * Both are read out of the feed's own string rather than through a `Date`, because a `Date` built from a naive
 * datetime is anchored to whichever timezone the machine running this happens to be in — so a feed built on a CI
 * runner would move every local event by the offset between there and here.
 */
const HAS_ZONE = /[zZ]|[+-]\d{2}:?\d{2}$/;
const PARTS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

function icsDate(raw) {
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
const utcStamp = (value) => (value.endsWith('Z') ? value : `${value}Z`);

// The characters a TEXT value cannot carry as themselves. URI values (`URL:`) are not escaped this way.
const escape = (text) =>
  String(text)
    .replace(/([\\;,])/g, '\\$1')
    .replace(/\r?\n/g, '\\n');

/**
 * RFC 5545 caps a content line at 75 *octets*, continuing it with CRLF and a leading space. Octets, and these names
 * carry é and · — so the length is measured over the UTF-8 encoding, and a split is walked back off any continuation
 * byte (`10xxxxxx`) rather than cutting a character in half.
 */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');

  if (bytes.length <= 75) {
    return line;
  }

  const pieces = [];
  let start = 0;

  // The first line may use all 75; a continuation spends one of them on its leading space.
  for (let limit = 75; start < bytes.length; limit = 74) {
    let end = Math.min(start + limit, bytes.length);

    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end -= 1;
    }

    pieces.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }

  return pieces.join('\r\n ');
}

/**
 * "2 routes · 1 waypoint" — the same summary the card carries, each kind the event has and none it does not. Kept in
 * step with routeSummary() in src/events.js by hand; it is three lines and the two outputs are read side by side.
 */
function routeSummary({ routes, waypoints }) {
  const parts = [];

  if (routes) {
    parts.push(`${routes} route${routes === 1 ? '' : 's'}`);
  }

  if (waypoints) {
    parts.push(`${waypoints} waypoint${waypoints === 1 ? '' : 's'}`);
  }

  return parts.join(' · ');
}

function vevent(ev, index) {
  const start = icsDate(ev.start);
  const end = icsDate(ev.end);

  /**
   * A VEVENT must have a `DTSTART`, and the feed can leave either end of the window null. An event with only one of
   * them becomes a point in time at whichever it has — the same reading events.html gives it, where a start with no
   * end is a marker on its start date rather than a band running forever.
   */
  const from = start ?? end;
  const lines = [`UID:${ev.eventID}@${UID_DOMAIN}`, `DTSTAMP:${utcStamp(from)}`, `DTSTART:${from}`];

  if (start && end) {
    lines.push(`DTEND:${end}`);
  }

  lines.push(`SUMMARY:${escape(ev.name)}`);

  const description = [ev.heading];
  const here = index[ev.eventID];

  if (here) {
    description.push(`${routeSummary(here)} here: ${SITE}/routes.html#event=${encodeURIComponent(ev.eventID)}`);
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

function calendar({ name, description }, events, index) {
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

  // iCalendar lines end CRLF, including the last one. .gitattributes keeps git from normalising them away.
  return lines.map(fold).join('\r\n') + '\r\n';
}

async function fetchFeed(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`${url}: ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();

  if (!Array.isArray(raw)) {
    throw new Error(`${url}: not a list of events`);
  }

  return raw;
}

const feed = await fetchFeed(FEED_URL);
const local = JSON.parse(readFileSync(LOCAL_PATH, 'utf8'));
const index = JSON.parse(readFileSync(ENTRIES_BY_EVENT, 'utf8'));

// Keyed by eventID with the local pass last, so a repo entry overrides a feed event of the same ID rather than
// duplicating it — the merge src/events.js does, in the same order.
const byId = new Map();

for (const ev of [...feed, ...local]) {
  byId.set(ev.eventID, ev);
}

/**
 * An event with no date at all ("date unknown" on the events page) has nothing to put on a calendar, whether its dates
 * are still unannounced or went missing between Leek Duck and us. Sorted by start so the file reads in order and a diff
 * between two runs stays local to what moved.
 *
 * The comparison is over the raw strings, by code unit rather than through localeCompare: a zoned time and a floating
 * one have no shared instant to sort by, and collation varies with the ICU build, which would churn the committed
 * files whenever a runner's Node changed. The eventID breaks a tie so the order is total.
 */
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const dated = [...byId.values()]
  .filter((ev) => icsDate(ev.start) ?? icsDate(ev.end))
  .sort((a, b) => order(a.start ?? '', b.start ?? '') || order(a.eventID, b.eventID));

const events = dated.filter((ev) => !RECURRING.has(ev.heading));

writeFileSync(FEED.file, calendar(FEED, events, index));
console.log(`${FEED.file}: ${events.length} events`);
