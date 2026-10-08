/**
 * The files this repository generates for something outside it to read, by name. Static hosting cannot list a
 * directory, so the first two hand a page what it could otherwise only learn by fetching every GPX file, and
 * `EVENTS_FEED` is the iCalendar feed a calendar app subscribes to.
 *
 * Named here because eight places read them. Renaming the pair once already broke the calendar generator, which
 * spelled the old name in a script `pnpm lint` does not run: the build was dead for a commit and nothing said so.
 *
 * One relative path serves both kinds of consumer — a page resolves one against its own URL, and the pages sit at the
 * repository root, which is also where a script is run from.
 */

export const GPX_PATHS = 'data/gpx-paths.json';
export const ENTRIES_BY_EVENT = 'data/entries-by-event.json';
export const EVENTS_FEED = 'events.ics';
