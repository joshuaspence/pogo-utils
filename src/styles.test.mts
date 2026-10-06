/**
 * The ids the stylesheets select on, against the ids the markup actually renders.
 *
 * This is the one kind of CSS mistake the move onto one document made easy and nothing else here can see. A page is a
 * component now, so an element's id is written in a `.tsx` file rather than in the markup `html-validate` reads, and a
 * stylesheet rule whose selector matches nothing is not an error to anybody: the build succeeds, the page renders, and the
 * only sign is that something looks wrong.
 *
 * It has already happened once. Porting the search builder replaced `<code id="query">` with a ref, because the script no
 * longer needed to find the element by id — and took `.output code#query` with it, which was carrying the mono face, the
 * bordered box, the `white-space: pre` and the `user-select: all` that the Copy button's clipboard fallback depends on.
 *
 * Ids only, deliberately. Every id a stylesheet here selects is written out as a literal in some component, so the check
 * is exact rather than a heuristic; classes are built from data in a dozen places (`typeClass`, the chip tables, the
 * status kinds) and asking the same question of them would answer with noise.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const STYLES = join(ROOT, 'src');

/** Every file under `src/`, recursively, whose name ends `ext`. */
const sources = (ext: string) =>
  readdirSync(STYLES, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => join(entry.parentPath, entry.name));

/**
 * The ids a stylesheet selects on, read out of selector text rather than out of the file whole: `#fff` is a colour and
 * `#1a1d25` is another, and both live in declarations. Taking only what sits before a `{` leaves the selectors.
 */
function selectedIds(css: string) {
  const ids = new Set<string>();
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

  for (const [, , selector] of bare.matchAll(/(^|[}])\s*([^{}@][^{}]*?)\s*[{]/g)) {
    for (const [, id] of (selector ?? '').matchAll(/#([A-Za-z_][\w-]*)/g)) {
      if (id !== undefined) {
        ids.add(id);
      }
    }
  }

  return ids;
}

test('every id a stylesheet selects on is one the markup renders', () => {
  /**
   * Where an id can be written: a component, or the one document. A literal `id="…"` in either, since that is the form
   * every id these stylesheets name is written in — a computed one would need the check loosened, and none is.
   */
  const markup = [...sources('.tsx'), join(ROOT, 'index.html')].map((path) => readFileSync(path, 'utf8')).join('\n');
  const rendered = new Set([...markup.matchAll(/\bid="([^"{}]+)"/g)].map(([, id]) => id));

  const orphaned: string[] = [];

  for (const sheet of sources('.css')) {
    for (const id of selectedIds(readFileSync(sheet, 'utf8'))) {
      if (!rendered.has(id)) {
        orphaned.push(`${sheet.slice(ROOT.length + 1)} selects #${id}`);
      }
    }
  }

  // Named rather than counted, so a failure says which rule has stopped reaching anything and in which sheet.
  expect(orphaned).toEqual([]);
});

test('the check can tell a missing id from a present one', () => {
  // Otherwise the assertion above passes on an empty set for the wrong reason — a selector regex that matched nothing
  // would report no orphans however many there were, which is exactly how this bug went unnoticed in the first place.
  expect(selectedIds('.output code#query { color: red }')).toEqual(new Set(['query']));
  expect(selectedIds('#sidebar header { padding: 0 }')).toEqual(new Set(['sidebar']));

  // A colour is not an id, and neither is one inside a declaration.
  expect(selectedIds('body { color: #fff; background: #1a1d25 }')).toEqual(new Set());

  // More than one in a list, and more than one in a selector.
  expect(selectedIds('#a .x, #b .y { color: red }')).toEqual(new Set(['a', 'b']));
});
