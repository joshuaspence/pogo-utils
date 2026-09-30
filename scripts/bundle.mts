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

  // Otherwise every non-ASCII character in a string literal is written as a `\u` escape. The pages are UTF-8 and say
  // so, and `✓`, `✨` and the type glyphs are more readable in the output as themselves.
  charset: 'utf8',

  metafile: true,
});

const modules = new Set(Object.values(result.metafile.outputs).flatMap((output) => Object.keys(output.inputs)));

console.log(`${entryPoints.length} page(s) bundled into ${OUT}/ from ${modules.size} module(s).`);
