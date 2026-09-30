/**
 * Bundles each page's module graph into the one file its markup already names.
 *
 * `tsc` emitted a file per module, so a page fetched its whole graph a request at a time — 15 for `pgsharp.html` and 11
 * for `pokedex.html`, every one of them a round trip before the next import was even known about. esbuild resolves the
 * graph here instead and writes one file per page, which is the whole of the change: the same bytes per page, one
 * request for them.
 *
 * Nothing about the markup changes, and that is not a coincidence. `outbase` reproduces the source tree's shape under
 * `outdir`, so `src/pgsharp/backup.ts` lands at `dist/src/pgsharp/backup.js` — the path `pgsharp.html` was already
 * pointing at — and the entry points are read off those very tags rather than listed here, so the two cannot drift
 * apart. `scripts/assemble.mts` runs after this and checks it, since its link integrity pass wants every local `src=`
 * to resolve inside the artifact.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';

const OUT = 'dist/src';

/**
 * The entry points, taken from the pages rather than transcribed. A `<script type="module">` is what makes a module an
 * entry point, so the markup is the authority on the list — and `.js` becomes `.ts` because the tag names the file the
 * browser will fetch, which is the same specifier convention every import inside `src/` follows.
 */
const entryPoints: string[] = [];

for (const page of readdirSync('.').filter((name) => name.endsWith('.html'))) {
  for (const [, module] of readFileSync(page, 'utf8').matchAll(/<script type="module" src="(src\/[^"]+)\.js">/g)) {
    if (module !== undefined) {
      entryPoints.push(`${module}.ts`);
    }
  }
}

// A pattern matching nothing would bundle nothing and exit 0, leaving `assemble.mts` to report five pages' worth of
// missing modules as if the markup were at fault.
if (entryPoints.length === 0) {
  throw new Error('No page names a module: the `<script type="module">` tags are not the shape this expects.');
}

const result = await build({
  entryPoints,
  outdir: OUT,
  outbase: 'src',
  bundle: true,

  // What the tags already say: `type="module"`, so the output is a module and top-level `await` stays legal.
  format: 'esm',

  // Kept in step with `target` in `tsconfig.json` by hand, because this is the half that now decides it — `tsc` emits
  // declarations only, so its own `target` reaches nothing but the default lib set.
  target: 'es2023',
  platform: 'browser',

  /*
   * Leaflet's `main` is its *unminified* build, `dist/leaflet-src.js`, where the CDN tag this replaces named the
   * minified `dist/leaflet.js` — 450,229 bytes for a script that was 147,552 — so minifying is what keeps importing
   * the package by name from costing `map.html` more bytes than the two requests it saves. It earns its place on the
   * other four pages as well, none of which imports anything: the artifact holds 471,248 bytes against the 677,786
   * the live site serves for the same five pages, and 152,199 against 181,033 gzipped.
   */
  minify: true,

  // Otherwise every non-ASCII character in a string literal is written as a six-character `\u` escape — identical
  // JavaScript for 315 measured bytes more, since `✓` is three of them in UTF-8. String literals are all that is left
  // to escape once minification has taken the prose out: 112 such characters, where the unminified output carries 192.
  // The pages are UTF-8 and say so.
  charset: 'utf8',

  /*
   * An imported stylesheet's own `url()`s have to go somewhere, and copying the file is the only one of esbuild's
   * answers that keeps a PNG a PNG — `dataurl` would inline 3KB of base64 into the CSS for images this page never
   * requests. The hash is what makes them safe to serve from `dist/src/` beside the modules: `leaflet.css` names
   * `images/layers.png` relative to itself, and flattening two directories into one is how two files called
   * `layers.png` would collide silently. Its fourth `url()` needs no loader at all, `url(#default#VML)` being a
   * fragment rather than a file, which esbuild passes through instead of failing to resolve.
   */
  loader: { '.png': 'file' },
  assetNames: '[name]-[hash]',

  metafile: true,
});

const modules = new Set(Object.values(result.metafile.outputs).flatMap((output) => Object.keys(output.inputs)));

console.log(`${entryPoints.length} page(s) bundled into ${OUT}/ from ${modules.size} module(s).`);
