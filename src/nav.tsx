/**
 * The top tab bar, rendered from the one page table rather than written out per page.
 *
 * This is the duplication the move onto a single document was able to delete: the same five links were a `<nav>` block in
 * each of the five documents, each block marking a different tab `aria-current` by hand, so adding a page meant six
 * edits and getting one wrong showed as two current tabs or none.
 */

import { PAGES, toHash, type Page } from './router.js';

/**
 * A tab links the page's bare fragment, so clicking one opens that page in its default state rather than carrying the
 * query across. Nothing else would make sense: a `q` typed into the Pokédex filter means nothing on the Map.
 *
 * `aria-current` is derived from which page is open, which is what it is for — a reader on a screen reader is told which
 * tab they are on, and the stylesheet draws the same fact from the same attribute rather than from a second class.
 */
export function Nav({ current }: { current: Page }) {
  return (
    <nav class="topnav">
      {PAGES.map(({ name, label, icon }) => (
        <a key={name} class="tab" href={toHash(name)} aria-current={name === current ? 'page' : undefined}>
          <span class="ico" aria-hidden="true">
            {icon}
          </span>{' '}
          {label}
        </a>
      ))}
    </nav>
  );
}
