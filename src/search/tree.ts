/**
 * The query the canvas holds: pills in nested groups, each group asking for all of its parts or any of them.
 *
 * This is the page's whole state, where the earlier builder had a fixed shape — a name box, then one clause per
 * category, then one per numeric range, all AND'd. That shape is a tree too, just one the reader could not edit, and
 * the three things it could not say are the three worth having: an *either* spanning two categories, a category
 * appearing twice, and a bracket inside a bracket.
 *
 * **Negation is on the pill and nowhere else, and that is enough.** A group is `all` or `any` with no third state,
 * because De Morgan says a negated group is the other junction with its parts negated: `!(a&b)` is `!a,!b` and
 * `!(a,b)` is `!a&!b`. So a reader building `Any[!a, !b]` has written the first of those directly, every boolean
 * function is still reachable, and nothing here has to push a negation inwards — the tree is in negation normal form
 * the moment it is built. `clauses.js` is the whole of what happens to it afterwards.
 *
 * **A pill that asks nothing yet asks nothing.** A range pill with neither bound filled is one the reader has added
 * and not finished, and `leafText` answers null for it. `clauses.js` turns that into no clauses at all, which is the
 * same thing it does with a clause true of everything — so an unfinished pill drops out of an `all` and takes its
 * whole `any` with it, each of which is what the arithmetic says and what a reader would expect to see.
 *
 * Paths rather than ids are how the canvas names a node: `[2, 0]` is the first part of the third part of the root.
 * They are what a render already knows and what a drop target already is, so nothing has to mint an identity or keep
 * one in step with the tree it describes. The cost is that an edit has to rebuild the spine down to the node it
 * changes, which is `update` below, and that a path goes stale the moment something before it moves — hence `move`
 * adjusting its destination rather than callers being trusted to.
 */

import { RANGES, TERMS_BY_ID } from './terms.js';

/** Which way a group joins its parts. `all` is the game's `&` and `any` its comma. */
export type Junction = 'all' | 'any';

/**
 * One pill. The three kinds are the three things in the catalogue that write differently: a term is a word the table
 * owns, a name is whatever the reader typed, and a range is a span written from its own prefix.
 */
export type Leaf =
  | { kind: 'term'; id: string; negated: boolean }
  | { kind: 'name'; text: string; negated: boolean }
  | { kind: 'range'; id: string; from: number | null; to: number | null; negated: boolean };

/** Several nodes, joined. */
export interface Group {
  kind: 'group';
  junction: Junction;
  parts: readonly Node[];
}

export type Node = Leaf | Group;

/** Where a node is: the index to take at each level, from the root down. The root itself is the empty path. */
export type Path = readonly number[];

/** Whether a node holds others, which is the one question the canvas and the path edits below both keep asking. */
export const isGroup = (node: Node): node is Group => node.kind === 'group';

/**
 * An empty query, which is what the Clear button returns to and what a link that says nothing restores. The root is
 * `all` because the game's own string is a conjunction of clauses: a reader adding two pills to it means both.
 */
export const emptyTree = (): Group => ({ kind: 'group', junction: 'all', parts: [] });

/** A group holding these parts, for the presets and for a reader creating one. */
export const group = (junction: Junction, parts: readonly Node[] = []): Group => ({
  kind: 'group',
  junction,
  parts,
});

/** Every numeric range by id, for the writer below — the same lookup `TERMS_BY_ID` is for a term. */
const RANGES_BY_ID = new Map(RANGES.map((range) => [range.id, range]));

/**
 * What one pill writes into a clause, or null where it has nothing to write yet.
 *
 * Null is not a failure. A range with neither bound is a pill the reader has added and not filled, and a name that is
 * blank is the same; both ask nothing, and `clauses.js` reads that as the search for everything it is. A term whose id
 * names nothing in the table is the one case that is a fault, and it answers null too — a link that rotted past a
 * rename drops the pill it can no longer spell rather than writing a term the game will not match.
 *
 * A bound left empty is filled from the range's own floor or ceiling rather than written as an open end, which is the
 * reading the earlier `rangeClause` took and the reason it gave: `cp3000-` may well be read the way it looks, where
 * `cp3000-5000` cannot be read any other way and nothing has a CP above the ceiling anyway.
 */
export function leafText(leaf: Leaf): string | null {
  const written = text(leaf);

  return written === null ? null : leaf.negated ? `!${written}` : written;
}

function text(leaf: Leaf): string | null {
  if (leaf.kind === 'term') {
    return TERMS_BY_ID.get(leaf.id)?.term ?? null;
  }

  if (leaf.kind === 'name') {
    return leaf.text.trim() || null;
  }

  const range = RANGES_BY_ID.get(leaf.id);

  if (!range || (leaf.from == null && leaf.to == null)) {
    return null;
  }

  const from = leaf.from ?? range.min ?? 0;
  const to = leaf.to ?? range.max;
  const low = Math.min(from, to);
  const high = Math.max(from, to);

  // A span whose ends meet is the one number it holds, which is how the game reads a bare `{phrase}{N}` and two
  // characters shorter than saying it twice. The optimiser's dex collapse reaches this often — `charmander` inside
  // Gen 1 is one species, and `4-4` is a clumsy way to write `4`.
  return low === high ? `${range.prefix}${low}` : `${range.prefix}${low}-${high}`;
}

/** What a pill calls itself on screen, which is the chip's label for a term and the text itself for the other two. */
export function leafLabel(leaf: Leaf): string {
  if (leaf.kind === 'term') {
    return TERMS_BY_ID.get(leaf.id)?.label ?? leaf.id;
  }

  if (leaf.kind === 'name') {
    return leaf.text;
  }

  return RANGES_BY_ID.get(leaf.id)?.label ?? leaf.id;
}

/** The node a path names, or null where the path leads nowhere — a link's doing rather than the canvas's. */
export function nodeAt(root: Node, path: Path): Node | null {
  let node: Node | null = root;

  for (const index of path) {
    if (node === null || !isGroup(node)) {
      return null;
    }

    node = node.parts[index] ?? null;
  }

  return node;
}

/**
 * The tree with one node changed, or taken out where `change` answers null. The spine down to it is rebuilt and
 * everything else is the node it already was, which is what lets a render decide what to redraw by identity.
 *
 * Changing the root is `update(root, [], …)`, and taking the root out is refused: the canvas has to have something to
 * draw, and an empty root group is how a query says nothing.
 */
export function update(root: Node, path: Path, change: (node: Node) => Node | null): Node {
  if (path.length === 0) {
    return change(root) ?? root;
  }

  const [index, ...rest] = path;

  if (index === undefined || !isGroup(root) || root.parts[index] === undefined) {
    return root;
  }

  const changed = rest.length === 0 ? change(root.parts[index]) : update(root.parts[index], rest, change);
  const parts = changed === null ? root.parts.toSpliced(index, 1) : root.parts.with(index, changed);

  return { ...root, parts };
}

/** The tree with a node added to the end of the group at `path`. A path naming anything else leaves it alone. */
export const append = (root: Node, path: Path, node: Node): Node =>
  update(root, path, (into) => (isGroup(into) ? { ...into, parts: [...into.parts, node] } : into));

/** Which of three states a group puts a catalogue chip in: not in it, required, or ruled out. */
export type ChipState = 'off' | 'in' | 'out';

/**
 * The first pill in this group naming the same catalogue entry, with the index it sits at. A name is never one of
 * these: two names are two different searches, where a term or a range is the same entry however many times it is
 * pressed, which is the whole of what makes the cycle below possible.
 */
function entryAt(into: Group, id: string) {
  const at = into.parts.findIndex((part) => !isGroup(part) && part.kind !== 'name' && part.id === id);
  const found = at < 0 ? null : into.parts[at];

  return found === undefined || found === null || isGroup(found) || found.kind === 'name' ? null : { at, pill: found };
}

/** What the group at `path` says about a catalogue entry, which is what that entry's chip wears. */
export function chipState(root: Node, path: Path, id: string): ChipState {
  const into = nodeAt(root, path);
  const found = into !== null && isGroup(into) ? entryAt(into, id) : null;

  return found === null ? 'off' : found.pill.negated ? 'out' : 'in';
}

/**
 * One press of a catalogue chip, on the group being filled: absent becomes required, required becomes ruled out, and
 * ruled out goes. Three presses leave the group as they found it.
 *
 * The chips were a three-state toggle before the canvas and they are one again. What changed is the scope: a press
 * reads the group it is filling rather than the whole query, which for a query built in the root alone — the state a
 * reader spends most of their time in — is the behaviour the fixed builder had. The same term in *two* groups is a
 * search worth having and is still reachable, by dragging a second copy somewhere else.
 *
 * The third press taking a span pill's bounds with it is deliberate rather than overlooked. A chip pressed three times
 * is three deliberate presses with the pill in sight the whole way, and `✕` is the same loss in one.
 */
export function cycle(root: Node, path: Path, leaf: Leaf): Node {
  const into = nodeAt(root, path);

  if (into === null || !isGroup(into)) {
    return root;
  }

  // A name has no chip and no cycle; what it has is a box, and the same name twice is one pill's worth of search.
  if (leaf.kind === 'name') {
    const already = into.parts.some((part) => !isGroup(part) && part.kind === 'name' && part.text === leaf.text);

    return already ? root : append(root, path, leaf);
  }

  const found = entryAt(into, leaf.id);

  if (found === null) {
    return append(root, path, leaf);
  }

  return update(root, [...path, found.at], () => (found.pill.negated ? null : { ...found.pill, negated: true }));
}

/** Whether `inside` is `outside` or sits within it, which is the move a drop onto a group's own pill would ask for. */
const within = (inside: Path, outside: Path) =>
  inside.length >= outside.length && outside.every((index, at) => inside[at] === index);

/**
 * The tree with the node at `from` moved to the end of the group at `to`.
 *
 * Taking the node out shifts every sibling after it along, so a destination below the same parent is corrected for
 * that here rather than by whoever called: a path is an index into the tree as it was, and this is the one operation
 * that invalidates one. A move into the node's own subtree is refused, there being no tree that would describe it.
 */
export function move(root: Node, from: Path, to: Path): Node {
  const node = nodeAt(root, from);

  if (node === null || from.length === 0 || within(to, from)) {
    return root;
  }

  const parent = from.slice(0, -1);
  const index = from[from.length - 1] ?? 0;
  const shifted =
    within(to, parent) && to.length > parent.length && (to[parent.length] ?? 0) > index
      ? to.with(parent.length, (to[parent.length] ?? 0) - 1)
      : to;

  return append(
    update(root, from, () => null),
    shifted,
    node,
  );
}
