/**
 * The edits a drag makes, and what a pill writes.
 *
 * A path is an index into the tree *as it was*, which makes `move` the one operation here that can invalidate its own
 * argument: taking a pill out shifts every sibling after it along, so a destination below the same parent means
 * something different by the time the pill arrives. That is the bug these are mostly about — it cannot be seen on
 * screen, because the pill does land in a group and the group it lands in is a real one.
 *
 * `leafText` is asserted against `terms.js` rather than against literals, for the reason `optimise.test.ts` gives: a
 * renamed id or a moved ceiling leaves a test asserting nothing, and that reads exactly like a pass.
 */

import { expect, test } from 'vitest';

import { RANGES, TERMS_BY_ID } from './terms.js';
import {
  append,
  chipState,
  cycle,
  emptyTree,
  group,
  isGroup,
  leafLabel,
  leafText,
  move,
  nodeAt,
  update,
  type Leaf,
  type Node,
  type Path,
} from './tree.js';

const yes = (id: string): Leaf => ({ kind: 'term', id, negated: false });
const named = (text: string): Leaf => ({ kind: 'name', text, negated: false });
const all = (...parts: Node[]) => group('all', parts);
const any = (...parts: Node[]) => group('any', parts);

/** One range from the table, so a test pins the floor and ceiling its literals were derived from. */
function range(id: string) {
  const found = RANGES.find((entry) => entry.id === id);

  if (!found) {
    throw new Error(`\`terms.js\` carries no ${id} range`);
  }

  return found;
}

/** A tree said in the shape a failure can be read in: every pill as its text, every group as its junction. */
function shape(node: Node): unknown {
  return isGroup(node) ? { [node.junction]: node.parts.map(shape) } : (leafText(node) ?? '…');
}

test('a pill writes the term the table gives it, and a name writes itself', () => {
  const shiny = TERMS_BY_ID.get('shiny');
  const star = TERMS_BY_ID.get('star4');

  expect([shiny?.term, star?.term]).toEqual(['shiny', '4*']);

  expect(leafText(yes('shiny'))).toBe('shiny');
  expect(leafText({ kind: 'term', id: 'star4', negated: true })).toBe('!4*');
  expect(leafText(named('pikachu'))).toBe('pikachu');
  expect(leafText({ kind: 'name', text: '  +charmander  ', negated: false })).toBe('+charmander');
});

test('a pill with nothing to write yet writes nothing', () => {
  // Each of these is a pill a reader can see on the canvas, and none of them is something to tell the game about.
  expect(leafText({ kind: 'range', id: 'cp', from: null, to: null, negated: false })).toBeNull();
  expect(leafText({ kind: 'name', text: '   ', negated: false })).toBeNull();

  // An id no table carries is the one case that is a fault rather than an unfinished pill, and answers the same way.
  expect(TERMS_BY_ID.has('sparkly')).toBe(false);
  expect(leafText(yes('sparkly'))).toBeNull();
  expect(leafText({ kind: 'range', id: 'nope', from: 1, to: 2, negated: false })).toBeNull();
});

test('a span pill leaves an empty bound open rather than filling it from its own range', () => {
  /*
   * The floor and the ceiling are asserted first so the strings below are known to be *omitting* a bound the table
   * could have supplied rather than agreeing with one by accident — filling them is what wrote `cp3000-5000` and
   * `1-151`. The dex carries no prefix, a bare span being how the game searches dex numbers, so its open low end is
   * the bare leading dash the phrase list gives as its own example of the form.
   */
  expect(range('cp').max).toBe(5000);
  expect([range('dex').prefix, range('dex').min]).toEqual(['', 1]);

  expect(leafText({ kind: 'range', id: 'cp', from: 3000, to: null, negated: false })).toBe('cp3000-');
  expect(leafText({ kind: 'range', id: 'dex', from: null, to: 151, negated: false })).toBe('-151');

  // Both boxes filled is the closed span it always was, including when the reader types the higher number into the
  // lower box, and a span whose ends meet is the one number it holds.
  expect(leafText({ kind: 'range', id: 'cp', from: 100, to: 2000, negated: false })).toBe('cp100-2000');
  expect(leafText({ kind: 'range', id: 'cp', from: 2000, to: 100, negated: false })).toBe('cp100-2000');
  expect(leafText({ kind: 'range', id: 'cp', from: 100, to: 100, negated: false })).toBe('cp100');

  /*
   * The one case the preference for a spelling that cannot be read another way still reaches. "If `{M}` is 0, the
   * search is treated as `{phrase}{N}-` instead", so a `-0` is at risk of being read as the *other* open end — every
   * HP rather than none, which is as wrong as an answer gets. Nothing sits below nought in any of these ranges, so
   * that span is the single value and the bare form says so and nothing else.
   */
  expect(leafText({ kind: 'range', id: 'hp', from: null, to: 0, negated: false })).toBe('hp0');
  expect(leafText({ kind: 'range', id: 'hp', from: 0, to: null, negated: false })).toBe('hp0-');
});

test('a pill says the label its chip said, so the canvas and the catalogue agree', () => {
  expect(leafLabel(yes('star4'))).toBe(TERMS_BY_ID.get('star4')?.label);
  expect(leafLabel(named('pikachu'))).toBe('pikachu');
  expect(leafLabel({ kind: 'range', id: 'cp', from: null, to: null, negated: false })).toBe(range('cp').label);
});

test('a path names the node it leads to, and nothing where it leads nowhere', () => {
  const tree = all(yes('shiny'), any(yes('fire'), yes('water')));

  expect(nodeAt(tree, [])).toBe(tree);
  expect(nodeAt(tree, [0])).toEqual(yes('shiny'));
  expect(nodeAt(tree, [1, 1])).toEqual(yes('water'));

  // A link can carry a path the tree does not have, and a drag can finish over a group that has just been removed.
  expect(nodeAt(tree, [9])).toBeNull();
  expect(nodeAt(tree, [0, 0])).toBeNull();
});

test('an edit rebuilds only the spine down to what it changed', () => {
  const inner = any(yes('fire'), yes('water'));
  const tree = all(yes('shiny'), inner, yes('lucky'));
  const changed = update(tree, [1, 0], (node) => ({ ...(node as Leaf), negated: true }));

  expect(shape(changed)).toEqual({ all: ['shiny', { any: ['!fire', 'water'] }, 'lucky'] });

  // Everything off the spine is the node it already was, which is what lets a render decide what to redraw by
  // identity rather than by comparing two trees.
  expect(isGroup(changed) && changed.parts[0]).toBe(tree.parts[0]);
  expect(isGroup(changed) && changed.parts[2]).toBe(tree.parts[2]);
  expect(isGroup(changed) && changed.parts[1]).not.toBe(inner);
});

test('an edit answering null takes the node out', () => {
  const tree = all(yes('shiny'), yes('lucky'), yes('costume'));

  expect(shape(update(tree, [1], () => null))).toEqual({ all: ['shiny', 'costume'] });

  // The root is the one node that cannot go: the canvas has to have something to draw, and an empty root group is how
  // a query says nothing.
  expect(shape(update(tree, [], () => null))).toEqual(shape(tree));
});

test('a pill is appended to the group a path names, and nowhere else', () => {
  const tree = all(yes('shiny'), any(yes('fire')));

  expect(shape(append(tree, [1], yes('water')))).toEqual({ all: ['shiny', { any: ['fire', 'water'] }] });
  expect(shape(append(tree, [], yes('lucky')))).toEqual({ all: ['shiny', { any: ['fire'] }, 'lucky'] });

  // A path naming a pill rather than a group is a drop on something that cannot hold anything, and changes nothing.
  expect(shape(append(tree, [0], yes('lucky')))).toEqual(shape(tree));
});

test('a chip pressed three times leaves the group as it found it', () => {
  // The three-state toggle the chips had before the canvas: absent, required, ruled out, gone.
  const once = cycle(all(), [], yes('shiny'));
  const twice = cycle(once, [], yes('shiny'));
  const thrice = cycle(twice, [], yes('shiny'));

  expect([shape(once), shape(twice), shape(thrice)]).toEqual([{ all: ['shiny'] }, { all: ['!shiny'] }, { all: [] }]);
  expect([chipState(once, [], 'shiny'), chipState(twice, [], 'shiny'), chipState(thrice, [], 'shiny')]).toEqual([
    'in',
    'out',
    'off',
  ]);

  // Nothing else in the group is disturbed on the way round, and the pill keeps the place it was put in.
  const beside = all(yes('lucky'), yes('shiny'), yes('costume'));

  expect(shape(cycle(beside, [], yes('shiny')))).toEqual({ all: ['lucky', '!shiny', 'costume'] });
  expect(shape(cycle(cycle(beside, [], yes('shiny')), [], yes('shiny')))).toEqual({ all: ['lucky', 'costume'] });
});

test('a chip reads the group being filled and no other', () => {
  /*
   * The scope is what the canvas changed about the chips. A query built in the root alone — where a reader spends most
   * of their time — behaves exactly as the fixed builder did; the same term in two groups is a search worth having,
   * and a press on one group's chip must not reach into the other.
   */
  const tree = all(yes('shiny'), any(yes('shiny'), yes('fire')));

  expect([chipState(tree, [], 'shiny'), chipState(tree, [1], 'shiny')]).toEqual(['in', 'in']);
  expect(chipState(tree, [1], 'lucky')).toBe('off');

  expect(shape(cycle(tree, [1], yes('shiny')))).toEqual({ all: ['shiny', { any: ['!shiny', 'fire'] }] });
  expect(shape(cycle(tree, [], yes('shiny')))).toEqual({ all: ['!shiny', { any: ['shiny', 'fire'] }] });

  // A path naming a pill rather than a group has no group to read, so a press on it changes nothing.
  expect(shape(cycle(tree, [0], yes('lucky')))).toEqual(shape(tree));
});

test('a span chip cycles on its range rather than on its bounds', () => {
  // The same entry however many times it is pressed, which is what makes a cycle possible at all — where a filled
  // span and an empty one would be two different pills if the bounds were part of the question.
  const filled: Leaf = { kind: 'range', id: 'cp', from: 1500, to: null, negated: false };
  const tree = all(filled);

  expect(chipState(tree, [], 'cp')).toBe('in');
  expect(shape(cycle(tree, [], { kind: 'range', id: 'cp', from: null, to: null, negated: false }))).toEqual({
    all: ['!cp1500-'],
  });

  // A different range is a different chip, so it lands beside rather than reading the first one.
  expect(shape(cycle(tree, [], { kind: 'range', id: 'hp', from: null, to: null, negated: false }))).toEqual({
    all: ['cp1500-', '…'],
  });
});

test('a name has no chip and no cycle, but does not land twice in one group', () => {
  /*
   * Two names are two searches, so a name never turns round the way a chip does. The same name twice is one pill's
   * worth of search, and `Enter` is easy to press twice without meaning anything by it.
   *
   * This pins `cycle`'s own contract and nothing about the page, which is worth saying because for a while it was the
   * only thing holding the behaviour: the name box committed through `append` instead, so typing `pikachu` and
   * pressing `Enter` twice really did compose `pikachu&pikachu` while this test sat green. A contract no caller uses
   * is a contract that proves nothing, and the caller is `takeName` in `search.tsx`.
   */
  const tree = all(named('pikachu'));

  expect(shape(cycle(tree, [], named('pikachu')))).toEqual({ all: ['pikachu'] });
  expect(shape(cycle(tree, [], named('eevee')))).toEqual({ all: ['pikachu', 'eevee'] });

  // In another group it is another search, so it is not a duplicate at all.
  const split = all(named('pikachu'), any());

  expect(shape(cycle(split, [1], named('pikachu')))).toEqual({ all: ['pikachu', { any: ['pikachu'] }] });
});

test('a pill moved into another group arrives there', () => {
  const tree = all(yes('shiny'), any(yes('fire')));

  expect(shape(move(tree, [0], [1]))).toEqual({ all: [{ any: ['fire', 'shiny'] }] });
  expect(shape(move(tree, [1, 0], []))).toEqual({ all: ['shiny', { any: [] }, 'fire'] });
});

test('a move corrects its destination for the hole the pill leaves behind', () => {
  /*
   * This is the case that cannot be seen on screen. Taking `shiny` out of the root shifts the two groups after it down
   * one, so the path `[2]` that named the second group before the move names nothing of the sort afterwards — without
   * the correction the pill lands in the *first* group, which is a real group holding real pills, and the only sign is
   * a string that is not the one the reader built.
   */
  const tree = all(yes('shiny'), any(yes('fire')), any(yes('water')));

  expect(shape(move(tree, [0], [2]))).toEqual({ all: [{ any: ['fire'] }, { any: ['water', 'shiny'] }] });

  // A destination *before* the pill taken out does not shift, so it must not be corrected either.
  const other = all(any(yes('fire')), yes('shiny'), any(yes('water')));

  expect(shape(move(other, [1], [0]))).toEqual({ all: [{ any: ['fire', 'shiny'] }, { any: ['water'] }] });
});

test('a group cannot be moved inside itself', () => {
  const tree = all(any(yes('fire'), all(yes('water'))));

  // A drop that would describe no tree at all: the group would have to contain the thing containing it.
  expect(shape(move(tree, [0], [0]))).toEqual(shape(tree));
  expect(shape(move(tree, [0], [0, 1]))).toEqual(shape(tree));

  // And the root has nowhere to go, having no parent to be taken out of.
  expect(shape(move(tree, [], [0]))).toEqual(shape(tree));
});

test('a group moves with everything in it', () => {
  const tree = all(any(yes('fire'), yes('water')), all(yes('shiny')));

  expect(shape(move(tree, [0], [1]))).toEqual({ all: [{ all: ['shiny', { any: ['fire', 'water'] }] }] });
});

test('an empty tree is a group with nothing in it, joined the way the game joins its clauses', () => {
  const tree = emptyTree();

  expect([tree.junction, tree.parts.length]).toEqual(['all', 0]);

  // The root being `all` is what makes two pills dropped straight into it mean both, which is the game's own string.
  expect(shape(append(append(tree, [], yes('shiny')), [], yes('lucky')))).toEqual({ all: ['shiny', 'lucky'] });
});

/** Every path in a tree, deepest last, for the sweep below. */
function* paths(node: Node, path: Path = []): Generator<Path> {
  yield path;

  if (isGroup(node)) {
    for (const [index, part] of node.parts.entries()) {
      yield* paths(part, [...path, index]);
    }
  }
}

test('every move within one tree leaves a tree, and leaves the pill in the group it was aimed at', () => {
  /*
   * The sweep rather than a handful of cases, because the index arithmetic in `move` is the kind that is right for the
   * examples someone thought of. Every source and every destination in one tree is 13 × 13, which is cheap and
   * exhaustive — and the invariant is the one a reader would notice: the pill is where it was put, and nothing else
   * has gone missing.
   */
  const tree = all(yes('shiny'), any(yes('fire'), all(yes('water'))), yes('lucky'), any(yes('xxl')));
  const pills = (node: Node) => [...paths(node)].filter((path) => !isGroup(nodeAt(node, path) ?? node)).length;

  for (const from of [...paths(tree)]) {
    for (const to of [...paths(tree)]) {
      const node = nodeAt(tree, from);
      const into = nodeAt(tree, to);

      if (node === null || into === null || !isGroup(into)) {
        continue;
      }

      /*
       * The destination is marked rather than looked up again afterwards, because `to` is an index into the tree as it
       * *was*: the first draft of this checked `nodeAt(moved, to)` and so asked the same wrong question the bug asks.
       * A mark appended to the destination travels with it whatever its index becomes, and appending is always at the
       * end so it shifts nothing.
       */
      const mark = `mark-${from.join('.')}-${to.join('.')}`;
      const marked = append(tree, to, named(mark));
      const moved = move(marked, from, to);

      // Nothing is lost and nothing is duplicated, whether the move happened or was refused.
      expect({ from, to, pills: pills(moved) }).toEqual({ from, to, pills: pills(marked) });

      // Stated from what a move *means* rather than from how `move` decides: the root has no parent to leave, and a
      // group cannot end up inside itself. Those are the only two arrangements no tree describes.
      const inside = to.length >= from.length && from.every((index, at) => to[at] === index);

      if (from.length === 0 || inside) {
        expect({ from, to, shape: shape(moved) }).toEqual({ from, to, shape: shape(marked) });
        continue;
      }

      const landed = [...paths(moved)]
        .map((path) => nodeAt(moved, path))
        .filter((part) => part !== null)
        .find((part) => isGroup(part) && part.parts.some((one) => shape(one) === mark));

      // Compared as text, because a group's shape is an object and `===` on two of those asks about identity: the
      // first draft compared references, so every move of a *group* passed without being looked at.
      const said = JSON.stringify(shape(node));

      expect({
        from,
        to,
        holds:
          landed !== undefined && isGroup(landed) && landed.parts.some((part) => JSON.stringify(shape(part)) === said),
      }).toEqual({ from, to, holds: true });
    }
  }
});
