/**
 * Serves the built site over HTTP, which is how it is run locally: the pages reach `data/*.gpx` and the events feed
 * through `fetch`, and a browser denies a `file://` document those requests rather than answering them.
 *
 * esbuild rather than a server written out here, because it is already a dependency for `scripts/bundle.mts` and
 * answers a request the way a static host does — a 404 for what is absent, and a content type for the web assets it
 * knows. It does not know them all, and the gap is load-bearing for one link: `events.ics` is served `text/plain`
 * where Pages sends `text/calendar`, so the Events page's Subscribe link opens as a text page here rather than
 * reaching a calendar client. Nothing overrides that from this side — `ServeOptions` carries no MIME field and
 * `onRequest` only observes a request already answered. `.gpx` goes the other way, served `text/xml` where the
 * `mimetypes` table a Python server reads has no answer for it at all.
 *
 * Through the JS API rather than the `--servedir` CLI, which would have fitted on the `package.json` line that runs
 * this and needed no file of its own: that one stops the moment stdin closes and exits 0 on the way out, so a
 * `pnpm serve` whose input was not a terminal would look like it had served and finished. A context held open here
 * cannot end that way.
 *
 * No `fallback` is configured because the site wants none: `src/router.ts` reads the route out of the fragment, so a
 * deep link is still a request for `/` and the server is never asked for a path it has no file for.
 */

import { context } from 'esbuild';
import { existsSync } from 'node:fs';

/**
 * What `pnpm build` assembles, and the only servable tree there is: `index.html` names `src/main.css` and
 * `src/main.js`, and the build writes both rather than the checkout keeping them.
 */
const DIST = 'dist';

/*
 * A static server has no answer to a missing root but a 404 for every request, which reads as a site that loaded and
 * came up blank. Serving does not build — `pnpm build` is its own step — so an unbuilt or just-cleaned checkout is
 * exactly what this gets pointed at, and the whole of the difference is a sentence naming the command that fixes it.
 */
if (!existsSync(DIST)) {
  console.error(`${DIST}/ does not exist. Run \`pnpm build\` first.`);
  process.exit(1);
}

const ctx = await context({});
const { hosts, port } = await ctx.serve({ servedir: DIST });

console.log(`Serving ${DIST}/ at ${hosts.map((host) => `http://${host}:${port}/`).join(' ')}`);
