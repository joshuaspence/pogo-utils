/**
 * What each kind of file the site publishes is served as, and — by being that list of kinds — what the artifact check
 * in `scripts/assemble.mts` holds `dist/` to. One table rather than two: a local server needs a type for everything
 * `dist/` can hold, and the artifact check needs to know what `dist/` can hold, which is one list asked for twice. A
 * new kind of file is therefore a single entry here, and cannot arrive with the build allowing it and the server
 * having no type for it.
 *
 * The values are the headers GitHub Pages answers with, read off the deployed site with `curl -sI` rather than decided
 * here, so a local run and the deployment can differ on a header only where this table has gone stale. That is the
 * whole of the reason `.js` carries Pages' older `application/javascript` rather than the `text/javascript` that has
 * since replaced it, and why `.ics` and `.gpx` have no `charset` where the other text types do — the point is to
 * predict the deployment, not to improve on it. (Both are UTF-8 regardless: iCalendar defines no other encoding, and
 * an XML declaration carries its own.)
 *
 * `Record<string, string>` rather than the literal keys, because the lookup is by an `extname` of whatever was asked
 * for; `noUncheckedIndexedAccess` is what then makes the miss a `string | undefined` the caller has to answer for.
 */
export const SERVED_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gpx': 'application/gpx+xml',
  '.html': 'text/html; charset=utf-8',
  '.ics': 'text/calendar',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
