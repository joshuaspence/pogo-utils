/**
 * Shapes this repository does not own, and globals that arrive from a CDN rather than an import.
 *
 * Everything internal is declared as a `@typedef` in the module that owns it. What lands here is the part with no
 * owner: the wire formats, which belong to whoever publishes them and are read by both the browser and the scripts, and
 * the two globals, which have no import to hang a type off.
 */

/**
 * One entry of the ScrapedDuck events feed, read from `data/events.json` and from the upstream URL.
 *
 * `start` and `end` are nullable because the feed leaves them null for an event with no announced date. Nothing here is
 * optional: the feed sends all eight keys on every entry, so an absent one means the shape has changed rather than that
 * this event is unusual.
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

/** `entries-by-event.json`, keyed by `FeedEvent.eventID`. */
export type RouteIndex = Record<string, RouteCounts>;

declare global {
  /**
   * tz-lookup, loaded by a `defer`red `<script>` in `pgsharp.html`. Possibly undefined is the point rather than
   * pedantry: the tag may not have run yet, which is why `src/pgsharp/backup.js` guards on `typeof`.
   *
   * Leaflet's `L` is not declared here. `@types/leaflet` already provides it as a UMD global, reached via
   * `allowUmdGlobalAccess` in `tsconfig.json`, and declaring it by hand shadows that namespace instead of complementing
   * it.
   */
  const tzlookup: ((lat: number, lon: number) => string) | undefined;
}
