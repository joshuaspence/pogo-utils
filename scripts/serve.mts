/**
 * Serves the built site over HTTP, which is how it is run locally: the pages reach `data/*.gpx` and the events feed
 * through `fetch`, and a browser denies a `file://` document those requests rather than answering them.
 *
 * A handler of its own rather than esbuild's `servedir`, which this replaces. esbuild knows the types of the web
 * assets it bundles and nothing else, and offers no way to extend the table — `ServeOptions` has no field for it, and
 * `onRequest` is handed a request already answered — so `events.ics` came out `text/plain` and the Events page's
 * Subscribe link opened as a text page instead of reaching a calendar client, which made it the one part of that page
 * a local run could not check.
 *
 * Only an extension in `scripts/served-types.mts` is served at all. A file in `dist/` with any other is not part of
 * the site — `scripts/assemble.mts` fails the build over one, against that same table — so 404 is both the true answer
 * and the only one that never has to guess a type.
 *
 * No `fallback` for deep links, because the site wants none: `src/router.ts` reads the route out of the fragment, so
 * `#/map` is a request for `/` and the server is never asked for a path it has no file for.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, relative, resolve } from 'node:path';
import { SERVED_TYPES } from './served-types.mts';

/**
 * What `pnpm build` assembles, and the only servable tree there is: `index.html` names `src/main.css` and
 * `src/main.js`, and the build writes both rather than the checkout keeping them.
 */
const DIST = 'dist';

/** What esbuild's server bound before this, so the URL the README prints and anything bookmarked against it hold. */
const PORT = 8000;

/*
 * A static server has no answer to a missing root but a 404 for every request, which reads as a site that loaded and
 * came up blank. Serving does not build — `pnpm build` is its own step — so an unbuilt or just-cleaned checkout is
 * exactly what this gets pointed at, and the whole of the difference is a sentence naming the command that fixes it.
 */
if (!existsSync(DIST)) {
  console.error(`${DIST}/ does not exist. Run \`pnpm build\` first.`);
  process.exit(1);
}

/** Absolute, because every request is resolved against it and then checked to have stayed inside it. */
const root = resolve(DIST);

const server = createServer((request, response) => {
  /*
   * `new URL` drops a query string but leaves the path percent-encoded, which is what `decodeURIComponent` is for;
   * `resolve` then collapses the `..` segments a path can carry. The result is checked back against the root rather
   * than trusted — a `relative` that climbs is how `/../package.json` and its `%2e%2e` spelling are both refused,
   * while a `..` that stays inside still resolves — and it is the one line here about safety rather than correctness.
   */
  const { pathname } = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  const wanted = decodeURIComponent(pathname);
  const file = resolve(root, `.${wanted.endsWith('/') ? `${wanted}index.html` : wanted}`);
  const escaped = relative(root, file).startsWith('..');

  const type = SERVED_TYPES[extname(file)];
  const stats = statSync(file, { throwIfNoEntry: false });

  if (escaped || type === undefined || !stats?.isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`Not found: ${pathname}\n`);
    return;
  }

  response.writeHead(200, { 'content-type': type });

  /*
   * A body on a HEAD response is a protocol violation, and `curl -sI` is how these headers get compared against the
   * deployed site in the first place.
   */
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(file).pipe(response);
});

server.listen(PORT, () => {
  /*
   * Every IPv4 address rather than the loopback alone, loopback first: a LAN one is how the site is opened on a phone,
   * which is the only way to see it on the kind of device `manifest.json` is written for.
   */
  const addresses = Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((address) => address.family === 'IPv4')
    .sort((left, right) => Number(right.internal) - Number(left.internal))
    .map((address) => `http://${address.address}:${PORT}/`);

  console.log(`Serving ${DIST}/ at ${addresses.join(' ')}`);
});
