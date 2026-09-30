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
  'manifest.json',

  // The glob rather than the directory, which would take `icons/maskable.svg` with it: that file is the source the
  // maskable PNG is rendered from and nothing fetches it, so copying it in is the one thing an allowlist is for.
  'icons/*.png',

  'events.ics',
  'entries-by-event.json',
  'gpx-paths.json',
  'data',
  'src/*.css',
];

/**
 * Copies one path into the artifact, at the same position it occupies in the repository.
 *
 * Refusing to land on something already there is what keeps two producers out of one directory. `scripts/bundle.mts`
 * writes `dist/src/app.css` from the stylesheet `src/app.ts` imports, and this runs afterwards over `src/*.css` — so a
 * repository file of that name would overwrite the bundler's output, take Leaflet's rules off the map page and report a
 * build that succeeded. The clash is not specific to that pair: anything the compiler or the bundler emits is fair game
 * for a name in `PUBLISHED`, and the copy is the half that happens second and says nothing.
 */
function publish(path: string): void {
  const to = join(DIST, path);

  if (existsSync(to)) {
    throw new Error(`${path} would overwrite ${to}, which the build already wrote`);
  }

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
const SERVED = ['.css', '.gpx', '.html', '.ics', '.js', '.json', '.png', '.svg'];

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
 * Every local path the markup and the manifest name has to be in the artifact. This is what makes the list above safe
 * to maintain by hand: the pages are the authority on what the site needs, so a stylesheet or a module missing from
 * `dist/` fails the build rather than waiting to be noticed. Reading the copies rather than the originals also checks
 * the copying itself.
 */
const missing: string[] = [];
let checked = 0;

/**
 * Records `ref` unless it names a file in the artifact. Relative paths resolve against the directory of the file that
 * named them rather than against `DIST`, which is what lets one function serve both a page and a manifest: the two are
 * resolved against different bases in the specification, and only share one while everything sits at the root.
 */
function mustResolve(from: string, ref: string): void {
  // Anything not fetched from this origin by path: a CDN module, an outbound link, a fragment, an inline data URL.
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) {
    return;
  }

  // As written in an `href`, so percent-encoded: `Melbourne%20Zoo.gpx` names a file with a space in it.
  const path = decodeURIComponent(ref.split(/[?#]/)[0] ?? '');
  checked += 1;

  if (!existsSync(join(DIST, dirname(from), path))) {
    missing.push(`${from} names ${ref}`);
  }
}

/**
 * Every string under a `src`, `url` or `start_url` member of a manifest, at whatever depth. A walk rather than the
 * three members this manifest happens to use, because the specification carries more of them — `screenshots`, and a
 * `shortcuts` entry's own `icons` — and one nobody thought to name here would go unchecked without saying so. It errs
 * towards asking about a member that turns out not to be a path, which fails a build rather than passing one.
 */
function* refsOf(value: unknown): Generator<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      yield* refsOf(item);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [member, held] of Object.entries(value)) {
      if (typeof held !== 'string') {
        yield* refsOf(held);
      } else if (member === 'src' || member === 'url' || member === 'start_url') {
        yield held;
      }
    }
  }
}

const pages = readdirSync(DIST).filter((name) => name.endsWith('.html'));

/** Deduplicated, because every page links the same manifest and its icons want reporting once rather than six times. */
const manifests = new Set<string>();

for (const page of pages) {
  const markup = readFileSync(join(DIST, page), 'utf8');

  for (const [, ref] of markup.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (ref !== undefined) {
      mustResolve(page, ref);
    }
  }

  /*
   * Which manifest to read comes from the markup rather than from a constant beside `PUBLISHED`, for the same reason
   * the paths above do: the pages are the authority on what the site needs. Renaming the manifest therefore moves this
   * check with it, where a name written here would quietly stop reading anything. Matching the whole tag and then
   * asking it for its `href` keeps the two attributes in either order.
   */
  for (const [tag] of markup.matchAll(/<link[^>]*\brel="manifest"[^>]*>/g)) {
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1];

    if (href !== undefined) {
      manifests.add(href);
    }
  }
}

/*
 * The icons and the shortcut targets, which no page names and the scan above therefore cannot see. Left unchecked these
 * fail where nothing is watching: a launcher that cannot fetch an icon draws a letter tile, and a shortcut to a page
 * that moved opens a 404 from someone's home screen rather than from the site.
 */
for (const manifest of manifests) {
  const parsed: unknown = JSON.parse(readFileSync(join(DIST, manifest), 'utf8'));

  for (const ref of refsOf(parsed)) {
    mustResolve(manifest, ref);
  }
}

if (missing.length > 0) {
  throw new Error(`Not in the artifact:\n  ${missing.join('\n  ')}`);
}

console.log(`${copied} path(s) copied into ${DIST}/ beside the compiler's output.`);
console.log(
  `${checked} local reference(s) across ${pages.length} page(s) and ${manifests.size} manifest(s) resolve inside it.`,
);
