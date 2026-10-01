/**
 * The two files this repository generates for its pages to read, by name. Static hosting cannot list a directory, so
 * each hands a page something it could otherwise only learn by fetching every GPX file: `GPX_PATHS` is the list of
 * those files, `ENTRIES_BY_EVENT` the `<pgr:event>` associations inside them, counted per event.
 *
 * Named here because seven places read them — the map, the events page, the PGSharp builder, the validator that writes
 * both and the calendar generator that reads one. Renaming the pair once already broke that last one, which spelled the
 * old name in a script `npm run lint` does not run: the build was dead for a commit and nothing said so.
 *
 * Neither name needs a second spelling for the two kinds of consumer that share it. A page resolves a relative URL
 * against its own, and the pages sit at the repository root — which is also where a script is run from, so one relative
 * path serves both however deep it goes.
 *
 * Both sit in `data/` beside the events they describe, which is what `scripts/assemble.mts` publishes them under: that
 * directory is already copied whole, so neither wants an entry of its own in the allowlist.
 */

export const GPX_PATHS = 'data/gpx-paths.json';
export const ENTRIES_BY_EVENT = 'data/entries-by-event.json';
