/**
 * The ids the stylesheets select on, against the ids the markup actually renders. A page is a component, so an id is
 * written in a `.tsx` rather than in the markup `html-validate` reads, and a rule whose selector matches nothing is an
 * error to nobody: the build succeeds, the page renders, and the only sign is that something looks wrong.
 *
 * It has happened once. Porting the search builder replaced `<code id="query">` with a ref and took
 * `.output code#query` with it, which carried the `user-select: all` the Copy button's clipboard fallback depends on.
 *
 * Ids only, deliberately: every one a stylesheet selects is a literal in some component, where classes are built from
 * data in a dozen places and asking the same question of them would answer with noise.
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

/**
 * Every class name a sheet paints, split by whether the rule narrowed it to one kind of element.
 *
 * `bare` is a rule whose last simple selector is that one class and nothing else, so it paints anything wearing the
 * class. `tagged` is one that put an element type in front of it — `button.ghost` — which is a rule saying *this* kind
 * of element wears the class and something else does too.
 *
 * A second class narrows just as well as a tag does, so `.card.active` is neither: it cannot reach a button, and a
 * sheet pairing it with `.viewtoggle button.active` is not ambiguous about anything.
 */
function paintedClasses(css: string) {
  const bare = new Set<string>();
  const tagged = new Set<string>();
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, ' ');

  for (const [, , selector] of stripped.matchAll(/(^|[}{;])\s*([^{}@][^{}]*?)\s*[{]/g)) {
    for (const part of (selector ?? '').split(',')) {
      const last =
        part
          .trim()
          .split(/[\s>+~]+/)
          .at(-1) ?? '';
      const found = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)+)/.exec(last);
      const name = found?.[2]?.split('.').at(-1);

      if (!found || name === undefined) {
        continue;
      }

      if (found[1]) {
        tagged.add(name);
      } else if ((found[2]?.match(/\./g) ?? []).length === 1) {
        bare.add(name);
      }
    }
  }

  return { bare, tagged };
}

test('no stylesheet gives one class name to two kinds of element', () => {
  /*
   * The other half of the problem the wrapper comment in `search.css` describes. That one is five sheets in one
   * document meaning different things by `.chip`; this one is a single sheet doing it, which the wrapper cannot help
   * with and which is quieter — a bare rule and a tagged rule mostly set the same properties, so the tagged one wins
   * and nothing looks wrong until the bare rule holds a property the other does not.
   *
   * It has happened once. The pill that follows the pointer on the Search page was called `.ghost`, which that sheet
   * already gives to the Clear button beside the string. `.output button.ghost` outranked it on every colour the two
   * shared, so the only declaration that leaked was the one the bare rule held alone — and Clear went
   * `position: fixed` and climbed into the Copy button.
   */
  const shared: string[] = [];

  for (const sheet of sources('.css')) {
    const { bare, tagged } = paintedClasses(readFileSync(sheet, 'utf8'));

    for (const name of bare) {
      if (tagged.has(name)) {
        shared.push(`${sheet.slice(ROOT.length + 1)} paints .${name} both bare and behind an element`);
      }
    }
  }

  // Named rather than counted, so a failure says which word has been given two jobs and in which sheet.
  expect(shared.sort()).toEqual([]);
});

/**
 * The page names a sheet scopes itself to, out of its `body[data-page='…']` wrappers. Comments are stripped first for the
 * reason `selectedIds` does it: the wrapper is discussed in prose in most of these sheets.
 */
function scopedPages(css: string) {
  const pages = new Set<string>();
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

  for (const [, page] of bare.matchAll(/\[data-page=['"]([^'"]*)['"]\]/g)) {
    if (page !== undefined) {
      pages.add(page);
    }
  }

  return pages;
}

/**
 * The page names the router's table holds, read out of `router.ts` as text. It cannot be imported: this project is the
 * Node half and carries no DOM lib, where `router.ts` reaches `history` — which is why `scripts/tsconfig.json` claims
 * this file as one that reads a repository file off disk rather than importing one.
 *
 * A regex over source can stop matching and report nothing rather than fail, so both ways it can come up empty throw
 * instead: a table it could not find at all, and a row whose name it missed.
 */
function routerPages() {
  const table = /export const PAGES = \[([\s\S]*?)\] as const/.exec(readFileSync(join(STYLES, 'router.ts'), 'utf8'));
  const rows = table?.[1];

  if (rows === undefined) {
    throw new Error('src/router.ts: found no `export const PAGES = [...] as const` to read the page names out of');
  }

  const names = new Set([...rows.matchAll(/\bname: '([^']+)'/g)].map(([, name]) => name));

  /*
   * Counted a second time by something that is not the name, because a name pattern that had gone stale would answer
   * with a short set rather than an error, and every sheet would then look like it scoped to a page nobody has.
   */
  const titled = [...rows.matchAll(/\btitle: '/g)].length;

  if (titled === 0 || names.size !== titled) {
    throw new Error(`src/router.ts: read ${names.size} page name(s) out of ${titled} row(s)`);
  }

  return names;
}

test('every page a stylesheet scopes itself to is one the router has', () => {
  /*
   * `data-page` is written onto the body from `PAGES`, so a sheet scoping to a name that table no longer holds paints
   * nothing at all. Neither check above would notice: the rules parse, the ids still resolve, the page renders — and
   * every class in the sheet is simply unstyled.
   *
   * Renaming a page is what reaches this. The router entry, the chunk table and the stylesheet import are all checked by
   * `tsc`; the attribute value in the sheet is a string on both ends and was checked by nothing.
   */
  const named = routerPages();

  const orphaned: string[] = [];

  for (const sheet of sources('.css')) {
    for (const page of scopedPages(readFileSync(sheet, 'utf8'))) {
      if (!named.has(page)) {
        orphaned.push(`${sheet.slice(ROOT.length + 1)} scopes to [data-page='${page}']`);
      }
    }
  }

  // Named rather than counted, so a failure says which sheet has stopped reaching its page, and which page it wanted.
  expect(orphaned.sort()).toEqual([]);
});

test('the page check can tell a scoped sheet from an unscoped one', () => {
  // The same reason the other two have one: a selector regex that matched nothing would report no orphans however many
  // there were.
  expect(scopedPages("body[data-page='search'] { .chip { color: red } }")).toEqual(new Set(['search']));
  expect(scopedPages('body[data-page="map"] .sidebar { color: red }')).toEqual(new Set(['map']));

  // An unscoped sheet names no page, and a wrapper quoted in prose is not one either.
  expect(scopedPages('.backup { color: red }')).toEqual(new Set());
  expect(scopedPages("/* body[data-page='gone'] */ .backup { color: red }")).toEqual(new Set());

  // And that the router's real table is what the check reads it against, rather than a pattern matching nothing.
  const pages = routerPages();

  expect([pages.has('events'), pages.has('integrations'), pages.has('pgsharp')]).toEqual([true, true, false]);
});

test('the class check can tell a shared name from a narrowed one', () => {
  // The same reason the id check has one of these: a selector regex that matched nothing would report no collisions
  // however many there were.
  const collides = paintedClasses('.ghost { position: fixed } .output button.ghost { color: red }');

  expect([collides.bare.has('ghost'), collides.tagged.has('ghost')]).toEqual([true, true]);

  // A second class narrows a rule as well as a tag does, so this pair is not ambiguous and must not be reported.
  const narrowed = paintedClasses('.card.active { color: red } .viewtoggle button.active { color: blue }');

  expect([narrowed.bare.has('active'), narrowed.tagged.has('active')]).toEqual([false, true]);

  // A descendant is not a narrowing of this kind — a base rule and a contextual override are ordinary CSS — so the
  // pair that is looked for is a tag against a bare class and nothing else.
  const nested = paintedClasses('.pill { color: red } .parts .pill { color: blue }');

  expect([nested.bare.has('pill'), nested.tagged.has('pill')]).toEqual([true, false]);
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
