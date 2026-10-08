/**
 * Checks `SERVED_TYPES` against the headers the deployed site answers with, which is the one claim that table makes
 * and the one thing `src/serve.test.mts` cannot see: that test asserts the server honours the table, and reads the
 * same table to do it, so a value that has drifted away from Pages passes it either way.
 *
 * Out of `pnpm lint` deliberately. `pnpm lint:types` *is* `pnpm build`, which `README.md` keeps free of the network on
 * purpose, and a check that asks somebody else's server does not belong in front of every lint. This is for when the
 * table is edited, or when a header looks wrong locally.
 *
 * One request per extension rather than per file, a type being answered by extension; `HEAD`, because only the header
 * is wanted and the GPX files are the larger part of the site.
 */

import { SERVED_TYPES } from './served-types.mts';

/** Where the site is published. The one thing here not derived from the table. */
const SITE = 'https://joshuaspence.github.io/pogo-utils/';

/**
 * A published file per extension, by hand because nothing maps an extension back to a deployed path: the build knows
 * what it copied into `dist/`, not what is still live. Checked for completeness against the table below rather than
 * trusted, so a new entry there fails this until it is given a path — the same reason `src/serve.test.mts` asserts its
 * own fixtures cover every key.
 */
const SAMPLES: Record<string, string> = {
  '.css': 'src/main.css',
  '.gpx': 'data/Australia.gpx',
  '.html': 'index.html',
  '.ics': 'events.ics',
  '.js': 'src/main.js',
  '.json': 'manifest.json',
  '.png': 'icons/192.png',
  '.svg': 'favicon.svg',
};

const problems: string[] = [];

for (const [extension, expected] of Object.entries(SERVED_TYPES)) {
  const sample = SAMPLES[extension];

  if (sample === undefined) {
    problems.push(`${extension} has no sample path to check. Add one beside the others.`);
    continue;
  }

  const response = await fetch(new URL(sample, SITE), { method: 'HEAD' });
  const actual = response.headers.get('content-type');

  if (!response.ok) {
    problems.push(`${extension}: ${sample} answered HTTP ${response.status}.`);
  } else if (actual !== expected) {
    problems.push(`${extension}: ${sample} is ${actual}, where the table says ${expected}.`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`${Object.keys(SERVED_TYPES).length} content type(s) match what ${SITE} answers with.`);
