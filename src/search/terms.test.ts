/**
 * What the table has to be true of beyond what its types say.
 *
 * A category's `help` is prose in this repository's own convention and `pages/search.js` renders it through `ticked`,
 * which splits on the tick and sets the odd pieces in `<code>`. So a sentence that opens a pair and never closes it
 * leaves its tail code-set on the page, which is the same defect that routing was added to fix from the other side:
 * `the game has no \`gen1\`` had been showing its own ticks since before the canvas. Balanced ticks are an invariant
 * of this table now, and an invariant nothing checks is one the next sentence added here can break quietly.
 *
 * The other two are about names colliding, and both are the kind of fault that leaves the page working: a term and a
 * range sharing an id draws two chips that read each other's pill, and a shortcut naming no range writes no span at
 * all. Neither throws, and neither shows up anywhere but in the one search that quietly stopped meaning what it said.
 */

import { expect, test } from 'vitest';

import { GROUPS, RANGES, SHORTCUTS, TERMS_BY_ID } from './terms.js';

const ticks = (text: string) => [...text].filter((character) => character === '`').length;

test('every help sentence closes the backticks it opens', () => {
  const open = GROUPS.filter((category) => ticks(category.help) % 2 === 1);

  // Whether any of them quotes at all is the other half: this would pass just as quietly over a table of plain prose.
  expect({
    open: open.map((category) => category.id),
    quotes: GROUPS.some((category) => ticks(category.help) > 0),
  }).toEqual({ open: [], quotes: true });
});

test('no range is named the same as a term, and no two terms the same as each other', () => {
  /*
   * `chipState` and `cycle` in `tree.js` find a group's pill for a catalogue entry by its `id` and *not* by its kind,
   * so a term and a range sharing one are two chips each reading the other's pill: pressing the range would turn the
   * term's pill round. Which is a live trap rather than a hypothetical — `dynamax` is a chip and `dynamax{N}` a span,
   * and the range is `dynamaxmoves` for this reason alone.
   *
   * Terms against each other is the same fault one table over, `TERMS_BY_ID` being flat across every group: the four
   * groups that read a type hold eighteen words apiece and only the `id` prefix keeps `fire` from meaning four things.
   */
  const terms = GROUPS.flatMap((category) => category.terms.map((term) => term.id));
  const shared = RANGES.filter((range) => terms.includes(range.id)).map((range) => range.id);

  expect({ shared, duplicated: terms.length - new Set(terms).size, counted: TERMS_BY_ID.size }).toEqual({
    shared: [],
    duplicated: 0,
    counted: terms.length,
  });
});

test('every shortcut stands for a span of a range that exists, within that range', () => {
  /*
   * A shortcut carries the floor rather than the string, so both of its readers derive the span through the writer
   * that composes one. That leaves the floor itself to check: a range this cannot find writes no pill in `parse.js`
   * and no span in the `clauses.js` caveat, and a floor outside the range's own limits is a pill `bounded` moves under
   * whoever made it — the one thing every builder of a span is held to.
   */
  const found = SHORTCUTS.map((one) => {
    const range = RANGES.find((entry) => entry.id === one.range);

    return { phrase: one.phrase, named: range !== undefined, inside: range !== undefined && one.from <= range.max };
  });

  expect({ found, some: SHORTCUTS.length > 0 }).toEqual({
    found: SHORTCUTS.map((one) => ({ phrase: one.phrase, named: true, inside: true })),
    some: true,
  });
});
