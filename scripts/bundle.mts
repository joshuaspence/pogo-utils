/**
 * Bundles the module graph the markup names into the files it already points at.
 *
 * `tsc` emitted a file per module, so a page fetched its whole graph a request at a time — 15 for the PGSharp backup and
 * 11 for the Pokédex, every one of them a round trip before the next import was even known about. esbuild resolves the
 * graph here instead, which is the whole of the change: the same bytes, a fraction of the requests.
 *
 * `splitting` is what keeps one document from costing what five used to. The shell reaches each page through `import()`,
 * which esbuild treats as a split point, so Leaflet and the Java serialization codec stay in the chunks of the two pages
 * that want them instead of landing in the bundle every reader fetches. It also deduplicates what the pages share, which
 * the per-page builds could not: `pokemon/pokedex.ts` and the filter tables were in four bundles at once, 100,286 bytes
 * of the 455,917 the five came to.
 *
 * Nothing about the markup changes, and that is not a coincidence. `outbase` reproduces the source tree's shape under
 * `outdir`, so `src/main.tsx` lands at `dist/src/main.js` — the path `index.html` was already pointing at — and the entry
 * point is read off that very tag rather than listed here, so the two cannot drift apart. `scripts/assemble.mts` runs
 * after this and checks it, since its link integrity pass wants every local `src=` to resolve inside the artifact.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';

const OUT = 'dist/src';

/**
 * The entry points, taken from the markup rather than transcribed. A `<script type="module">` is what makes a module an
 * entry point, so the markup is the authority on the list.
 *
 * The tag names the file the browser will fetch, which is the same `.js` specifier convention every import inside `src/`
 * follows, so the extension has to be mapped back to the source's. Both are tried rather than assuming one: a page
 * component is `.tsx` and a module with no markup in it is `.ts`, and which of the two an entry point happens to be is
 * not something the markup can say or should have to.
 */
const entryPoints: string[] = [];

for (const page of readdirSync('.').filter((name) => name.endsWith('.html'))) {
  for (const [, module] of readFileSync(page, 'utf8').matchAll(/<script type="module" src="(src\/[^"]+)\.js">/g)) {
    if (module === undefined) {
      continue;
    }

    const source = [`${module}.tsx`, `${module}.ts`].find((path) => existsSync(path));

    if (source === undefined) {
      throw new Error(`${page} names ${module}.js, which is neither ${module}.tsx nor ${module}.ts`);
    }

    entryPoints.push(source);
  }
}

// A pattern matching nothing would bundle nothing and exit 0, leaving `assemble.mts` to report the page's missing module
// as if the markup were at fault.
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

  /*
   * One chunk per `import()` in `src/shell.tsx`, plus a shared chunk for what more than one page reaches. Only legal with
   * `format: 'esm'`, which is what the tags already say, and the reason the shell imports its pages dynamically at all:
   * without this the five would be inlined into `main.js` and every reader would fetch all of them.
   */
  splitting: true,

  // The pair `tsconfig.json` sets for the checker, named again because this is the half that does the transform —
  // esbuild reads neither setting from there. `automatic` is the same modern transform `react-jsx` selects, so no module
  // imports Preact to write JSX.
  jsx: 'automatic',
  jsxImportSource: 'preact',

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
