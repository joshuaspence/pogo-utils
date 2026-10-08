/**
 * What the table has to be true of beyond what its types say.
 *
 * A category's `help` is prose in this repository's own convention and `pages/search.js` renders it through `ticked`,
 * which splits on the tick and sets the odd pieces in `<code>`. So a sentence that opens a pair and never closes it
 * leaves its tail code-set on the page, which is the same defect that routing was added to fix from the other side:
 * `the game has no \`gen1\`` had been showing its own ticks since before the canvas. Balanced ticks are an invariant
 * of this table now, and an invariant nothing checks is one the next sentence added here can break quietly.
 */

import { expect, test } from 'vitest';

import { GROUPS } from './terms.js';

const ticks = (text: string) => [...text].filter((character) => character === '`').length;

test('every help sentence closes the backticks it opens', () => {
  const open = GROUPS.filter((category) => ticks(category.help) % 2 === 1);

  // Whether any of them quotes at all is the other half: this would pass just as quietly over a table of plain prose.
  expect({
    open: open.map((category) => category.id),
    quotes: GROUPS.some((category) => ticks(category.help) > 0),
  }).toEqual({ open: [], quotes: true });
});
