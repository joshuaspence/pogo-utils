/**
 * Turning the canvas's arrangement into a search string, and back out of a link. Kept apart from the page so what the
 * string means is readable without the DOM around it — this is the part that has to be right, and it is the part a
 * reader will check against what the game does.
 *
 * The state is the tree and one toggle. Everything a pill, a group, a name or a bound can say lives in the tree, which
 * is why there is no longer a set of wanted ids, a set of refused ones, a map of bounds and a box of text beside each
 * other: those were four descriptions of one fixed arrangement, and the arrangement is now the reader's.
 *
 * Nothing here holds a node of the document.
 */

import { clausesOf } from './clauses.js';
import { emptyTree, group, isGroup, type Leaf, type Node } from './tree.js';
import { RANGES, TERMS_BY_ID, type Preset } from './terms.js';

/** The state above, named. */
export interface State {
  tree: Node;
  optimise: boolean;
}

/** An empty state, which every reader of a link starts from and the Clear button returns to. */
export const emptyState = (): State => ({ tree: emptyTree(), optimise: false });

/**
 * How deep a link may nest. The canvas cannot realistically reach it — a reader would be clicking *add a group* sixty
 * times into its own last group — so this is about what a stranger can put in a fragment: the reader below recurses
 * once per group, and a link claiming ten thousand of them would exhaust the stack before anything could refuse it.
 * Hence the depth is checked on the way down rather than measured afterwards.
 */
export const NESTING = 64;

/**
 * The names a pasted string holds. Commas separate them, and the spaces a reader types around one are theirs rather
 * than part of the name. Exported because the page turns each into a pill of its own, so a pasted `pikachu, eevee`
 * arrives as two.
 *
 * A name is left otherwise alone, since the game matches partial names and a reader typing `char` means it.
 */
export const names = (text: string) =>
  text
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

/**
 * The search string, and whatever is worth saying about it.
 *
 * The caveat is the one thing the builder cannot fix for you. Pokémon GO's search has no parentheses, so a string that
 * mixes `,` and `&` cannot say which binds tighter, and `fire,water&shiny` is open to being read as either "Fire, or a
 * shiny Water" or "a shiny, and Fire or Water". The page says so when the question can arise, which is better than
 * quietly picking a reading on the reader's behalf — and it arises more often now, an arrangement being able to ask
 * for things the earlier fixed one could not.
 */
export function compose(state: State) {
  const { clauses, error, mishandled } = clausesOf(state.tree);
  const query = clauses.join('&');

  return {
    query,
    ambiguous: query.includes(',') && query.includes('&'),
    clauses: clauses.length,
    error,
    mishandled,
  };
}

/**
 * A link into the Search page asking for one name, which is what the Pokédex offers for a species and for its family.
 *
 * Built by writing a state out rather than by spelling the fragment, so the one place that knows the encoding is the
 * writer below: the Pokédex's link was `t=` while the name box was a box, and a fragment hand-made at the call site is
 * a fragment that goes on saying so after the page it points at has stopped reading it.
 */
export const nameFragment = (text: string) =>
  toFragment({ ...emptyState(), tree: group('all', [{ kind: 'name', text, negated: false }]) });

/** The tree a preset describes: everything it names, ruled out, which is the one preset there is. */
export const presetTree = (preset: Preset): Node =>
  group(
    'all',
    (preset.exclude ?? []).map((id): Leaf => ({ kind: 'term', id, negated: true })),
  );

/**
 * A name as a token carries it. `encodeURIComponent` leaves `_` alone and `_` is what separates the tokens below, so
 * that one is escaped by hand on top — a nickname holding one would otherwise end the token early and the rest of the
 * name would read as a pill of its own.
 *
 * Which only holds because the whole stream is escaped again on its way into the fragment. `URLSearchParams` decodes
 * the value it hands back, so a `%5F` written straight into the link arrives as the `_` it was standing in for and the
 * name is split anyway: `my_shiny` came back as `my`. Escaping the stream means the reader below is handed the stream
 * as it was written, `%5F` and all.
 */
const encodeName = (text: string) => encodeURIComponent(text).replaceAll('_', '%5F');

/**
 * The tree as tokens. A group writes how it joins and *how many parts it has*, rather than opening and closing a
 * bracket: an arity needs no matching, so the reader below is a descent with a counter where a bracketed form would
 * want a stack and a story about what an unbalanced link means.
 *
 * Every character used here — the letters, the digits, `!`, `.` and the `_` between tokens — is one a fragment carries
 * as itself, so only a name is escaped and a link stays legible. No range id or term id holds a `.`, which is what
 * lets a range write its two bounds without one.
 */
function tokens(node: Node): string[] {
  if (isGroup(node)) {
    return [`${node.junction === 'all' ? 'A' : 'O'}${node.parts.length}`, ...node.parts.flatMap(tokens)];
  }

  const not = node.negated ? '!' : '';

  if (node.kind === 'term') {
    return [`T${not}${node.id}`];
  }

  if (node.kind === 'name') {
    return [`N${not}${encodeName(node.text)}`];
  }

  return [`R${not}${node.id}.${node.from ?? ''}.${node.to ?? ''}`];
}

/**
 * The state as a link fragment, and back.
 *
 * `s=1` is the optimiser being on, so a link arrives showing the string its sender was looking at. It carries only the
 * toggle and never the compression: the arrangement travels as itself, and the short string is composed again at the
 * other end from a tree that still says `charmander`.
 */
export function toFragment(state: State) {
  const parts = [];
  const written = tokens(state.tree);

  // An empty root group is a query that says nothing, and a link saying nothing is better off saying it with no key.
  if (written.length > 1) {
    parts.push(`q=${encodeURIComponent(written.join('_'))}`);
  }

  if (state.optimise) {
    parts.push('s=1');
  }

  return parts.join('&');
}

/** A bound from a link, which is whatever a stranger put there: a number inside the range's limits, or nothing. */
function bound(text: string | undefined, id: string) {
  const range = RANGES.find((entry) => entry.id === id);
  const value = Number.parseInt(text ?? '', 10);

  if (!range || Number.isNaN(value)) {
    return null;
  }

  return Math.min(Math.max(value, range.min ?? 0), range.max);
}

/**
 * One node from the tokens, or null where the token describes nothing the tables carry. A dropped pill is the same
 * answer the earlier fragment reader gave an id that named no term: a link that has rotted past a rename restores the
 * pills that still mean something rather than failing whole.
 *
 * A group always consumes the parts it declared, dropped or not, so one bad pill cannot shift everything after it. The
 * count is clamped to the tokens actually left, so a link claiming a billion parts is a short tree rather than a hang.
 */
function read(all: readonly string[], at: { index: number }, depth: number): Node | null {
  const token = all[at.index];

  at.index += 1;

  if (token === undefined) {
    return null;
  }

  const kind = token[0];
  const rest = token.slice(1);
  const negated = rest.startsWith('!');
  const body = negated ? rest.slice(1) : rest;

  if (kind === 'A' || kind === 'O') {
    const declared = Number.parseInt(rest, 10);
    const count = Number.isNaN(declared) ? 0 : Math.max(0, Math.min(declared, all.length - at.index));

    // Checked before descending rather than after, the descent itself being what a deep link would exhaust.
    if (depth >= NESTING) {
      at.index += count;

      return null;
    }

    const parts = Array.from({ length: count }, () => read(all, at, depth + 1)).filter((part) => part !== null);

    return group(kind === 'A' ? 'all' : 'any', parts);
  }

  if (kind === 'T') {
    return TERMS_BY_ID.has(body) ? { kind: 'term', id: body, negated } : null;
  }

  if (kind === 'N') {
    const text = decodeName(body);

    return text ? { kind: 'name', text, negated } : null;
  }

  if (kind === 'R') {
    const [id, from, to] = body.split('.');

    return id !== undefined && RANGES.some((range) => range.id === id)
      ? { kind: 'range', id, from: bound(from, id), to: bound(to, id), negated }
      : null;
  }

  return null;
}

/** A name back out of a fragment. A stranger can write a `%` that decodes to nothing, which reads as no pill at all. */
function decodeName(body: string) {
  try {
    return decodeURIComponent(body).trim();
  } catch {
    return '';
  }
}

/**
 * The state a fragment describes. Every part is checked against the tables rather than trusted, so a link that has
 * rotted past a renamed id or been typed by hand restores what still means something instead of failing whole.
 *
 * The root is a group whatever arrives, the canvas having to have something to draw. A fragment this wrote always
 * names one; a hand-made one naming a single pill is wrapped rather than thrown away.
 */
export function fromFragment(fragment: string) {
  const state = emptyState();
  const params = new URLSearchParams(fragment.replace(/^#/, ''));

  state.optimise = params.get('s') === '1';

  const written = params.get('q');

  if (written) {
    const root = read(written.split('_'), { index: 0 }, 0);

    state.tree = root === null ? emptyTree() : isGroup(root) ? root : group('all', [root]);
  }

  return state;
}
