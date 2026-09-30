/**
 * The two files this repository generates for its pages to read, by name. Static hosting cannot list a directory, so
 * each hands a page something it could otherwise only learn by fetching every GPX file: `GPX_PATHS` is the list of
 * those files, `ENTRIES_BY_EVENT` the `<pgr:event>` associations inside them, counted per event.
 *
 * Named here because seven places read them — the map, the events page, the PGSharp builder, the validator that writes
 * one of them and the calendar generator that reads it. Renaming the pair once already broke that last one, which
 * spelled the old name in a script `npm run lint` does not run: the build was dead for a commit and nothing said so.
 *
 * Neither name needs a second spelling for the two kinds of consumer that share it. A page resolves a relative URL
 * against its own, and the pages sit at the repository root — which is also where a script is run from.
 */

export const GPX_PATHS = 'gpx-paths.json';
export const ENTRIES_BY_EVENT = 'entries-by-event.json';
