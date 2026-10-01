/**
 * Shapes this repository does not own.
 *
 * Everything internal is declared by the module that owns it. What lands here is the part with no owner: the wire
 * formats, which belong to whoever publishes them and are read by both the browser and the scripts. That is why this
 * file is in the shared project rather than either half — it names nothing a browser has and nothing Node has.
 */

/**
 * One entry of the ScrapedDuck events feed, read from `data/events-feed.json` and `data/events.json` — and, once per
 * hourly vend, from the upstream URL.
 *
 * `start` and `end` are nullable because the feed leaves them null for an event with no announced date. Nothing here is
 * optional: the feed sends all eight keys on every entry, so an absent one means the shape has changed rather than that
 * this event is unusual. `vendable()` in `src/event-feed.ts` is held to these keys by the compiler, so a field added
 * here because a page started reading it fails the build until the vend carries it.
 */
export interface FeedEvent {
  eventID: string;
  name: string;
  eventType: string;
  heading: string;
  link: string;
  image: string;
  start: string | null;
  end: string | null;
}

/** How many routes and waypoints one event contributes, as counted by `scripts/validate-gpx`. */
export interface RouteCounts {
  routes: number;
  waypoints: number;
}

/** `data/entries-by-event.json`, keyed by `FeedEvent.eventID`. */
export type RouteIndex = Record<string, RouteCounts>;
