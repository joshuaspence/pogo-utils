/**
 * Assembles `dist/` into the tree GitHub Pages serves.
 *
 * `tsc` writes the modules and nothing else, so everything a page fetches that the compiler does not produce is copied
 * here: the markup, the stylesheets that sit beside the modules in `src/`, and the files the pages read at run time.
 * Positions are preserved rather than flattened, because a page resolves `src/theme.css` against its own URL and the
 * markup is not rewritten.
 *
 * An allowlist rather than everything-minus-exclusions, because the two fail in opposite directions. A missing
 * exclusion publishes something nobody audited and says nothing about it; a missing inclusion is a 404 on one page, and
 * the check at the end turns that into a failed build instead of something found by opening the site.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

const DIST = 'dist';

/**
 * What the site serves that the compiler does not write, relative to the repository root. An entry ending `*.ext` takes
 * every matching file in that one directory; anything else is copied as it stands, recursively where it is a directory.
 */
const PUBLISHED = [
  '*.html',
  'favicon.svg',
  'events.ics',
  'entries-by-event.json',
  'gpx-paths.json',
  'data',
  'src/*.css',
];

/** Copies one path into the artifact, at the same position it occupies in the repository. */
function publish(path: string): void {
  const to = join(DIST, path);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(path, to, { recursive: true });
}

let copied = 0;

for (const entry of PUBLISHED) {
  const star = entry.indexOf('*');

  if (star < 0) {
    publish(entry);
    copied += 1;
    continue;
  }

  const dir = entry.slice(0, star).replace(/\/$/, '') || '.';
  const ext = entry.slice(star + 1);

  for (const name of readdirSync(dir)) {
    if (name.endsWith(ext)) {
      publish(dir === '.' ? name : `${dir}/${name}`);
      copied += 1;
    }
  }
}

/** Every kind of file the site serves. Anything else reaching the artifact is something nobody meant to publish. */
const SERVED = ['.css', '.gpx', '.html', '.ics', '.js', '.json', '.svg'];

/**
 * The other direction, and the one the allowlist above cannot see: it says what is copied in, not what ends up here.
 * `tsc` writes into `dist/` as well, and it writes more than the modules — `tsBuildInfoFile` defaults to a path derived
 * from `outDir`, which landed the build cache at `dist/tsconfig.tsbuildinfo` and deployed it. Naming that file is the
 * fix; this is what says so, since the default is one `outDir` edit away from coming back.
 */
const unexpected = readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && !SERVED.includes(extname(entry.name)))
  .map((entry) => join(entry.parentPath, entry.name));

if (unexpected.length > 0) {
  throw new Error(`In the artifact and not served:\n  ${unexpected.join('\n  ')}`);
}

/**
 * Every local path the markup names has to be in the artifact. This is what makes the list above safe to maintain by
 * hand: the pages are the authority on what the site needs, so a stylesheet or a module missing from `dist/` fails the
 * build rather than waiting to be noticed. Reading the copies rather than the originals also checks the copying itself.
 */
const pages = readdirSync(DIST).filter((name) => name.endsWith('.html'));
const missing: string[] = [];

for (const page of pages) {
  for (const [, ref] of readFileSync(join(DIST, page), 'utf8').matchAll(/(?:src|href)="([^"]+)"/g)) {
    // Anything not fetched from this origin by path: a CDN module, an outbound link, a fragment, an inline data URL.
    if (ref === undefined || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) {
      continue;
    }

    // As written in an `href`, so percent-encoded: `Melbourne%20Zoo.gpx` names a file with a space in it.
    const path = decodeURIComponent(ref.split(/[?#]/)[0] ?? '');

    if (!existsSync(join(DIST, path))) {
      missing.push(`${page} names ${ref}`);
    }
  }
}

if (missing.length > 0) {
  throw new Error(`Not in the artifact:\n  ${missing.join('\n  ')}`);
}

console.log(`${copied} path(s) copied into ${DIST}/ beside the compiler's output.`);
console.log(`Every local reference across ${pages.length} page(s) resolves inside the artifact.`);
