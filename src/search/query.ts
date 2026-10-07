/**
 * Turning the builder's state into a search string, and back out of a link. Kept apart from the page so what the string
 * means is readable without the DOM around it — this is the part that has to be right, and it is the part a reader will
 * check against what the game does.
 *
 * The state is everything a chip, a box or a toggle can say: which terms are wanted, which are refused, what was typed
 * in the name box and in the expression box, what the numeric ranges were set to, and whether the string should be
 * compressed on the way out. Nothing here holds a node.
 */

import { expand } from './expression.js';
import { GROUPS, RANGES, TERMS_BY_ID, type Group, type Range } from './terms.js';

/**
 * What one numeric range's two boxes hold. `null` is an empty box rather than a zero, which is the difference between a
 * bound the reader left to the range's own floor and one they asked for.
 */
export interface Bounds {
  from: number | null;
  to: number | null;
}

/** The state above, named. The two sets hold term ids rather than terms, which is what makes a link a lookup. */
export interface State {
  text: string;

  /**
   * What the expression box holds, verbatim. It is the reader's own text rather than anything drawn from `terms.js`, so
   * unlike the two sets it travels as itself — there are no ids to look a written expression up by.
   */
  expression: string;

  include: Set<string>;
  exclude: Set<string>;
  ranges: Map<string, Bounds>;
  optimise: boolean;
}

/** An empty state, which every reader of a link starts from and the Clear button returns to. */
export const emptyState = (): State => ({
  text: '',
  expression: '',
  include: new Set(),
  exclude: new Set(),
  ranges: new Map(),
  optimise: false,
});

/**
 * The names a `text` holds. Commas separate them — `pikachu, eevee` asks for either — and the spaces a reader types
 * around one are theirs rather than part of the name. Exported because the page shows these as chips and has to agree
 * with the string about where one name ends, which a second copy of this split would eventually stop doing.
 *
 * A name is left otherwise alone, since the game matches partial names and a reader typing `char` means it.
 */
export const names = (text: string) =>
  text
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

/** Those names as one clause: rejoined without the spaces, so the game is not handed a name with one in front of it. */
function nameClause(text: string) {
  const chosen = names(text);

  return chosen.length > 0 ? chosen.join(',') : null;
}

/**
 * One group's clause. The wanted terms are joined with the group's own operator, `,` unless the table says otherwise —
 * picking Fire and Water means either, while picking Shiny and Lucky means a Pokémon that is both.
 *
 * The refused ones are negated and AND'd whatever the group joins with, because refusing both means neither. That
 * asymmetry is not a choice — `!fire,!water` would match everything that is not Fire *or* not Water, which is
 * everything.
 *
 * Exported for the optimiser, which weighs a group's choices against the terms they leave out and has to measure both
 * spellings with the writer that is going to produce one of them. It takes the two sets rather than a whole state
 * because they are all it reads, which is what lets a caller hand it a pair it is weighing rather than a state.
 */
export function groupClause(group: Group, state: Pick<State, 'include' | 'exclude'>) {
  const wanted = group.terms.filter((term) => state.include.has(term.id)).map((term) => term.term);
  const refused = group.terms.filter((term) => state.exclude.has(term.id)).map((term) => `!${term.term}`);
  const parts = [];

  if (wanted.length > 0) {
    parts.push(wanted.join(group.join ?? ','));
  }

  return [...parts, ...refused].join('&') || null;
}

/**
 * One numeric range, as `cp100-2000`. A bound left empty is filled from the range's own floor or ceiling rather than
 * written as an open end: `cp3000-` may well be read the way it looks, but `cp3000-5000` cannot be read any other way,
 * and nothing can have a CP above the ceiling anyway. The dex range carries no prefix, since a bare `1-151` is how the
 * game searches dex numbers.
 *
 * Exported for the optimiser, which reads the dex clause back into the span it describes: asking the writer what it
 * wrote is what keeps the two from drifting over which bound an empty box falls back to.
 */
export function rangeClause(range: Range, state: State) {
  const bounds = state.ranges.get(range.id);

  if (!bounds || (bounds.from == null && bounds.to == null)) {
    return null;
  }

  const from = bounds.from ?? range.min ?? 0;
  const to = bounds.to ?? range.max;

  return `${range.prefix}${Math.min(from, to)}-${Math.max(from, to)}`;
}

/**
 * The search string, and whatever is worth saying about it.
 *
 * Clauses are emitted in the order the groups are declared rather than the order they were clicked, so the same set of
 * choices always writes the same string — two readers comparing what they built are comparing the choices rather than
 * the sequence they made them in.
 *
 * The caveat is the one thing the builder cannot fix for you. Pokémon GO's search has no parentheses, so a string that
 * mixes `,` and `&` cannot say which binds tighter, and `fire,water&shiny` is open to being read as either "Fire, or a
 * shiny Water" or "a shiny, and Fire or Water". The builder writes the clauses in a fixed order and says so when the
 * question can arise, which is better than quietly picking a reading on the reader's behalf.
 *
 * An expression contributes clauses here rather than a string of its own, which is what keeps it from being a second
 * tool sharing a page. The game's search is a conjunction of clauses and `expression.js` hands back exactly that, so
 * what a reader writes in brackets is AND'd with their chips and goes through this one composer, this one clause count
 * and this one ambiguity check. Its clauses come last because every clause before them is written from the tables in a
 * fixed order, and the part a reader typed is the part they can already pick out.
 *
 * An expression that does not parse contributes nothing and says why. The string stays the one the rest of the page
 * describes rather than going blank, since a reader half-way through typing a bracket has not stopped meaning what
 * their chips say — but a clause missing is a constraint missing, so what is on show matches *more* than was asked for
 * and the page refuses to copy it.
 */
export function compose(state: State) {
  const expression = expand(state.expression);

  const clauses = [
    nameClause(state.text),
    ...GROUPS.map((group) => groupClause(group, state)),
    ...RANGES.map((range) => rangeClause(range, state)),
    ...expression.clauses,
  ].filter(Boolean);

  const query = clauses.join('&');

  return {
    query,
    ambiguous: query.includes(',') && query.includes('&'),
    clauses: clauses.length,
    error: expression.error,
    mishandled: expression.mishandled,
  };
}

/**
 * The state as a link fragment, and back. Terms travel as their ids rather than as the string itself, so reading a link
 * is a lookup rather than a parse: a fragment names choices the builder can restore exactly, where a search string
 * would have to be taken apart again and could not say which chip a bare `1-151` had come from.
 *
 * A dot separates ids because a comma is what the search string itself uses and a reader who sees the fragment should
 * not have to wonder which one they are looking at.
 *
 * `s=1` is the optimiser being on, so a link arrives showing the string its sender was looking at. It carries only the
 * toggle and never the compression: the choices travel as themselves, and the short string is composed again at the
 * other end from a state that still says `charmander`.
 */
export function toFragment(state: State) {
  const parts = [];

  if (state.text.trim()) {
    parts.push(`t=${encodeURIComponent(state.text.trim())}`);
  }

  // The one part of a link that is not a choice off the tables, so it is encoded rather than listed: `&` separates the
  // fragment's own parts and an expression is mostly made of them.
  if (state.expression.trim()) {
    parts.push(`e=${encodeURIComponent(state.expression.trim())}`);
  }

  if (state.include.size > 0) {
    parts.push(`i=${[...state.include].join('.')}`);
  }

  if (state.exclude.size > 0) {
    parts.push(`x=${[...state.exclude].join('.')}`);
  }

  if (state.optimise) {
    parts.push('s=1');
  }

  for (const [id, { from, to }] of state.ranges) {
    if (from != null || to != null) {
      parts.push(`${id}=${from ?? ''}-${to ?? ''}`);
    }
  }

  return parts.join('&');
}

/**
 * A bound from a link, which is whatever a stranger put there: a number, or nothing at all. `dex=5` splits into one
 * part rather than two, so the missing half arrives as `undefined` and reads as the empty box it is.
 */
function bound(text: string | undefined, range: Range) {
  const value = Number.parseInt(text ?? '', 10);

  if (Number.isNaN(value)) {
    return null;
  }

  return Math.min(Math.max(value, range.min ?? 0), range.max);
}

/**
 * The state a fragment describes. Every part is checked against the tables rather than trusted — an id that names no
 * term and a bound that is not a number are both dropped, so a link that has rotted past a renamed id or been typed by
 * hand restores the parts that still mean something instead of failing whole.
 *
 * The expression is the exception, there being no table to check one against. It arrives as the text it was written as
 * and `expression.js` reads it at the moment the string is composed, so a link carrying nonsense fills the box with
 * that nonsense and says what is wrong with it — which is what the reader would have seen typing the same thing.
 */
export function fromFragment(fragment: string) {
  const state = emptyState();
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const ranges = new Map(RANGES.map((range) => [range.id, range]));

  state.text = params.get('t') ?? '';
  state.expression = params.get('e') ?? '';
  state.optimise = params.get('s') === '1';

  // Keyed by the letter the fragment uses, so the pair travels as an object: an array of two-element arrays is a list
  // of arrays to the checker as much as to a reader, where `Object.entries` of this is a list of pairs to both.
  for (const [key, set] of Object.entries({ i: state.include, x: state.exclude })) {
    for (const id of (params.get(key) ?? '').split('.').filter(Boolean)) {
      if (TERMS_BY_ID.has(id)) {
        set.add(id);
      }
    }
  }

  for (const [id, range] of ranges) {
    const value = params.get(id);

    if (value == null) {
      continue;
    }

    const [from, to] = value.split('-');
    state.ranges.set(id, { from: bound(from, range), to: bound(to, range) });
  }

  // A term cannot be both wanted and refused; the chips cannot produce it, but a hand-edited link can.
  for (const id of state.include) {
    state.exclude.delete(id);
  }

  return state;
}
