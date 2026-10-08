/**
 * Which page the fragment names, and the query string that page reads its own state out of. One document is served, so
 * the fragment carries both halves of where a reader is: `#/pokedex?q=pika&n=25`. Splitting it here is what lets each
 * page keep the state module it already had, taking a query string with no opinion about which page it is on.
 *
 * The fragment rather than a path because GitHub Pages has no rewrites: a path would need every deep link served by
 * `404.html`, which answers HTTP 404 while rendering the page — fine in a browser, a dead link to a crawler.
 */

/**
 * Every page, with what the tab bar calls it and what the document is titled while it is open, in tab order.
 *
 * `satisfies` rather than an annotation so `PAGES[n].name` stays the union of the five literals rather than widening to
 * `string`: that union is `Page`, and it is what makes a misspelt page a type error at every use below.
 */
export const PAGES = [
  { name: 'events', label: 'Events', icon: '📅', title: 'Pokémon GO Events' },
  { name: 'map', label: 'Map', icon: '🗺️', title: 'Pokémon GO Routes' },
  { name: 'search', label: 'Search', icon: '🔎', title: 'Pokémon GO Search Strings' },
  { name: 'pokedex', label: 'Pokédex', icon: '📖', title: 'Pokémon GO Pokédex' },
  { name: 'integrations', label: 'Integrations', icon: '🔌', title: 'Pokémon GO Integrations' },
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
 * The route a fragment describes. An unrecognised page name drops the query with it rather than handing the home page
 * a state written for somewhere else — `q` means something on the Pokédex it does not mean on the Events page.
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
 * Writes a page's own state into the address bar without navigating. `replaceState` rather than assigning
 * `location.hash`, so typing in a filter does not fill the Back button with every keystroke. It also fires no
 * `hashchange`, which stops the shell reading back a fragment it has just written and re-rendering the page.
 */
export const replaceQuery = (page: Page, query: string) => history.replaceState(null, '', toHash(page, query));
