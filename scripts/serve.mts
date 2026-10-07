/**
 * Serves the built site over HTTP, which is how it is run locally: the pages reach `data/*.gpx` and the events feed
 * through `fetch`, and a browser denies a `file://` document those requests rather than answering them.
 *
 * esbuild rather than a server written out here, because it is already a dependency for `scripts/bundle.mts` and
 * already does what a static host does — the content type each extension wants, and a 404 for everything absent. Its
 * CLI would have fitted on the `package.json` line that runs this, but `--servedir` stops the moment stdin closes and
 * exits 0 on the way out, so a `pnpm serve` whose input was not a terminal would look like it had served and finished.
 * A context held open here cannot end that way.
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
 * came up blank. `pnpm serve` builds before it gets here, so that cannot happen on the documented path; checked anyway,
 * it also holds for this script run on its own.
 */
if (!existsSync(DIST)) {
  console.error(`${DIST}/ does not exist. Run \`pnpm serve\`, which builds before serving, or \`pnpm build\` first.`);
  process.exit(1);
}

const ctx = await context({});
const { hosts, port } = await ctx.serve({ servedir: DIST });

console.log(`Serving ${DIST}/ at ${hosts.map((host) => `http://${host}:${port}/`).join(' ')}`);
