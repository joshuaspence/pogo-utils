/**
 * Builds the iCalendar feed the Events page links to, into the `dist/` the rest of `pnpm build` is assembling.
 *
 * It exists because a calendar subscription is a URL a calendar app fetches by itself: Google Calendar cannot run the
 * Events page's JavaScript, so the merge the browser does has to be done ahead of time and published as a static file.
 *
 * **Nothing here reads the clock, and nothing touches the network.** Fetching the feed is `vend-feed.mts`'s job, which
 * is what lets this be a step of `pnpm build` and a local run give exactly the file a deploy would. The output is a
 * pure function of three committed files, so a build that finds the event data unmoved publishes the bytes a
 * subscriber already holds — and a `DTSTAMP` is required all the same, so each event's is derived from its own start.
 */

import { LOCAL_EVENTS, VENDED_EVENTS } from '../src/event-feed.ts';
import { ENTRIES_BY_EVENT } from '../src/generated.ts';
import type { FeedEvent, RouteIndex } from '../src/types.js';
import { calendar, calendarEvents, DIST, FEED } from './ics.mts';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const feed: FeedEvent[] = JSON.parse(readFileSync(VENDED_EVENTS, 'utf8'));
const local: FeedEvent[] = JSON.parse(readFileSync(LOCAL_EVENTS, 'utf8'));
const index: RouteIndex = JSON.parse(readFileSync(ENTRIES_BY_EVENT, 'utf8'));
const events = calendarEvents(feed, local);

mkdirSync(DIST, { recursive: true });
writeFileSync(FEED.file, calendar(FEED, events, index));
console.log(`${FEED.file}: ${events.length} events`);
