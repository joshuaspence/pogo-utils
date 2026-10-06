/**
 * Which page the fragment names, and the query string that page reads its own state out of.
 *
 * One document is served now, so the fragment carries both halves of where a reader is: `#/pokedex?q=pika&n=25` is the
 * Pokédex with a filter typed and a species open. Splitting it in two here is what let every page keep the state module
 * it already had — `pokedex/state.js` and `search/query.js` take a query string and have no opinion about which page
 * they are on, so each is handed the half after the `?` and is unchanged by the move onto one document.
 *
 * The fragment rather than a path because GitHub Pages has no rewrites. A path would need every deep link served by
 * `404.html`, which answers HTTP 404 while rendering the page — fine in a browser, a dead link to a crawler or any
 * cache that reads the status line.
 */

/**
 * Every page, with what the tab bar calls it and what the document is titled while it is open. One table because the
 * five pages used to carry a copy of this list each, as a `<nav>` block per document, and keeping five copies of five
 * links in step by hand is what the move onto one document is able to stop. The order is the order the tabs appear in.
 *
 * `satisfies` rather than an annotation so `PAGES[n].name` stays the union of the five literals rather than widening to
 * `string`: that union is `Page`, and it is what makes a missing or misspelt page a type error at every use below.
 */
export const PAGES = [
  { name: 'events', label: 'Events', icon: '📅', title: 'Pokémon GO Events' },
  { name: 'map', label: 'Map', icon: '🗺️', title: 'Pokémon GO Routes' },
  { name: 'search', label: 'Search', icon: '🔎', title: 'Pokémon GO Search Strings' },
  { name: 'pokedex', label: 'Pokédex', icon: '📖', title: 'Pokémon GO Pokédex' },
  { name: 'pgsharp', label: 'PGSharp', icon: '💾', title: 'PGSharp backup' },
] as const satisfies readonly { name: string; label: string; icon: string; title: string }[];

export type Page = (typeof PAGES)[number]['name'];

/** Where a reader with no fragment lands, and where one naming a page that does not exist is sent. */
export const HOME: Page = 'events';

/** A page and the state it was left in, which together are the whole of what a link to this site carries. */
export interface Route {
  page: Page;
  query: string;
}

/**
 * Whether this names one of the five. A reader's URL is the input, so the names are checked against the table rather
 * than trusted — the same reading every `fromFragment` in `src/` gives the parts of a fragment it does not recognise.
 */
export const isPage = (value: string): value is Page => PAGES.some((page) => page.name === value);

export const pageOf = (name: Page) => PAGES.find((page) => page.name === name) ?? PAGES[0];

/**
 * The route a fragment describes. An unrecognised page name drops the query with it rather than handing the home page a
 * state written for somewhere else: `#/pokdex?q=pika` is a typo for the Pokédex, and `q` means something there that it
 * does not mean on the Events page it would otherwise open with.
 */
export function fromHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const cut = path.indexOf('?');
  const name = cut < 0 ? path : path.slice(0, cut);

  if (!isPage(name)) {
    return { page: HOME, query: '' };
  }

  return { page: name, query: cut < 0 ? '' : path.slice(cut + 1) };
}

/**
 * The fragment for a route, which is what every link and every `replaceState` in the app is built from. A page with no
 * state of its own gets no `?`, so a tab arrived at by clicking reads `#/map` rather than `#/map?`.
 */
export const toHash = (page: Page, query = '') => (query ? `#/${page}?${query}` : `#/${page}`);

/**
 * Writes a page's own state into the address bar without navigating.
 *
 * `replaceState` rather than assigning `location.hash`, which the pages chose for themselves before any of this: a
 * builder being adjusted is one page in one state, not a sequence of pages, so typing in a filter should not fill the
 * Back button with every keystroke. It also fires no `hashchange`, which is what stops the shell from reading back a
 * fragment it has just written and re-rendering the page that wrote it.
 */
export const replaceQuery = (page: Page, query: string) => history.replaceState(null, '', toHash(page, query));
