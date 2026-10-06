/**
 * The fragment the whole site is now addressed by, and the two things about it that fail silently.
 *
 * The round trip is the contract every page depends on without being able to see it. A page hands the router a query
 * string built by its own `toFragment`, and is handed one back to give its own `fromFragment` — so a splitter that ate a
 * character, or a formatter that emitted one the splitter reads as a boundary, loses filter state rather than failing:
 * the page renders, with controls set to something nobody asked for. `search/query.js` and `pokedex/state.js` both drop
 * the parts of a fragment they do not recognise by design, which is exactly what makes the loss quiet.
 *
 * The other is the query surviving an unrecognised page name. `q` is a text filter on the Pokédex and nothing at all on
 * the Events page, so carrying one across a fallback is how a typo'd link arrives somewhere real with foreign state
 * attached.
 */

import { expect, test } from 'vitest';

import { HOME, PAGES, fromHash, isPage, pageOf, toHash, type Page } from './router.js';

/** The shapes the pages actually produce, rather than invented ones: a `.`-joined set, a `-` range, a `?` inside a value. */
const QUERIES = [
  '',
  'q=pika',
  'n=25',
  'q=pika&g=1&a=in&f=shiny.hunt-xxl&n=25',
  't=a?b',
  'cp=10-100',
  'event=GO%20Fest%202026',
  't=%23legendary&i=shiny.xxl&x=costume',
];

test('a route survives the trip out to a fragment and back, for every page and every query a page emits', () => {
  for (const { name } of PAGES) {
    for (const query of QUERIES) {
      // The assertion is the whole route rather than the query alone, since a splitter that mistook part of the page
      // name for the query would round-trip the query correctly and land on the wrong page.
      expect(fromHash(toHash(name, query)), `${name} with ${query || '(no query)'}`).toEqual({ page: name, query });
    }
  }
});

test('a fragment naming no page lands home with nothing carried over from it', () => {
  // The page half is the obvious assertion; the query half is the one worth writing. `q` filters the Pokédex and means
  // nothing on the Events page, so a fallback that kept it would open the home page holding a foreign page's state.
  expect(fromHash('#/pokdex?q=pika')).toEqual({ page: HOME, query: '' });
  expect(fromHash('#/?q=pika')).toEqual({ page: HOME, query: '' });

  // Every form of "nowhere in particular", including the two old shapes still in the wild: a bare fragment, and the
  // `#event=<id>` the published calendar feed and the old cross-page links used before any of this had a page prefix.
  for (const hash of ['', '#', '#/', '#event=GO-Fest', '#t=legendary', '#//map']) {
    expect(fromHash(hash), hash || '(empty)').toEqual({ page: HOME, query: '' });
  }
});

test('a page with no state of its own is addressed without a trailing question mark', () => {
  // Not cosmetic: the tab bar links `toHash(name)` and the browser shows the result, so a stray `?` is in every URL a
  // reader copies out of the address bar after clicking a tab.
  expect(toHash('map')).toBe('#/map');
  expect(toHash('map', '')).toBe('#/map');
  expect(toHash('map', 'event=x')).toBe('#/map?event=x');
});

test('the tab table names five distinct pages, since a duplicate silently hides one of them', () => {
  const names = PAGES.map(({ name }) => name);

  // Two rows with one name would draw two tabs, both linking the same fragment, and leave the second page unreachable —
  // a nav bar that looks right and is missing a page.
  expect(new Set(names).size).toBe(names.length);

  // `isPage` and the table have to agree in both directions, being the validation and the thing validated.
  expect(names.every(isPage)).toBe(true);
  expect(isPage('pokdex')).toBe(false);
  expect(isPage('')).toBe(false);

  // Every row carries the two strings the shell reads off it, a title for the document and a label for the tab.
  for (const name of names) {
    expect(pageOf(name).title, name).not.toBe('');
    expect(pageOf(name).label, name).not.toBe('');
  }

  // The home page is one of them, which nothing else here would catch: `HOME` is annotated `Page`, so a value that is
  // not one fails to compile — but a `PAGES` edit that removed the home row leaves this file compiling and the site
  // falling back to a page that no longer exists.
  expect(names).toContain(HOME satisfies Page);
});
