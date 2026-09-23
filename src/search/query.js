/**
 * Turning the builder's state into a search string, and back out of a link. Kept apart from the page so what the string
 * means is readable without the DOM around it — this is the part that has to be right, and it is the part a reader will
 * check against what the game does.
 *
 * The state is the three things a chip or a box can say: which terms are wanted, which are refused, what was typed in
 * the name box, and what the numeric ranges were set to. Nothing here holds a node.
 */

import { GROUPS, RANGES, TERMS_BY_ID } from './terms.js';

/** An empty state, which every reader of a link starts from and the Clear button returns to. */
export const emptyState = () => ({ text: '', include: new Set(), exclude: new Set(), ranges: new Map() });

/**
 * The names typed in the box, as one clause. They are split on commas and rejoined rather than passed through, so
 * "pikachu, eevee" — which a reader will type with the space — does not reach the game as a name with a space in front
 * of it. A name is left otherwise alone, since the game matches partial names and a reader typing `char` means it.
 */
function nameClause(text) {
  const names = text
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  return names.length > 0 ? names.join(',') : null;
}

/**
 * One group's clause. The wanted terms are OR'd, because picking Fire and Water means either; the refused ones are each
 * negated and AND'd, because refusing both means neither. That asymmetry is not a choice — `!fire,!water` would match
 * everything that is not Fire *or* not Water, which is everything.
 */
function groupClause(group, state) {
  const wanted = group.terms.filter((term) => state.include.has(term.id)).map((term) => term.term);
  const refused = group.terms.filter((term) => state.exclude.has(term.id)).map((term) => `!${term.term}`);
  const parts = [];

  if (wanted.length > 0) {
    parts.push(wanted.join(','));
  }

  return [...parts, ...refused].join('&') || null;
}

/**
 * One numeric range, as `cp100-2000`. A bound left empty is filled from the range's own floor or ceiling rather than
 * written as an open end: `cp3000-` may well be read the way it looks, but `cp3000-5000` cannot be read any other way,
 * and nothing can have a CP above the ceiling anyway. The dex range carries no prefix, since a bare `1-151` is how the
 * game searches dex numbers.
 */
function rangeClause(range, state) {
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
 */
export function compose(state) {
  const clauses = [
    nameClause(state.text),
    ...GROUPS.map((group) => groupClause(group, state)),
    ...RANGES.map((range) => rangeClause(range, state)),
  ].filter(Boolean);

  const query = clauses.join('&');

  return {
    query,
    ambiguous: query.includes(',') && query.includes('&'),
    clauses: clauses.length,
  };
}

/**
 * The state as a link fragment, and back. Terms travel as their ids rather than as the string itself, so reading a link
 * is a lookup rather than a parse: a fragment names choices the builder can restore exactly, where a search string
 * would have to be taken apart again and could not say which chip a bare `1-151` had come from.
 *
 * A dot separates ids because a comma is what the search string itself uses and a reader who sees the fragment should
 * not have to wonder which one they are looking at.
 */
export function toFragment(state) {
  const parts = [];

  if (state.text.trim()) {
    parts.push(`t=${encodeURIComponent(state.text.trim())}`);
  }

  if (state.include.size > 0) {
    parts.push(`i=${[...state.include].join('.')}`);
  }

  if (state.exclude.size > 0) {
    parts.push(`x=${[...state.exclude].join('.')}`);
  }

  for (const [id, { from, to }] of state.ranges) {
    if (from != null || to != null) {
      parts.push(`${id}=${from ?? ''}-${to ?? ''}`);
    }
  }

  return parts.join('&');
}

/** A bound from a link, which is whatever a stranger put there: a number, or nothing at all. */
function bound(text, range) {
  const value = Number.parseInt(text, 10);

  if (Number.isNaN(value)) {
    return null;
  }

  return Math.min(Math.max(value, range.min ?? 0), range.max);
}

/**
 * The state a fragment describes. Every part is checked against the tables rather than trusted — an id that names no
 * term and a bound that is not a number are both dropped, so a link that has rotted past a renamed id or been typed by
 * hand restores the parts that still mean something instead of failing whole.
 */
export function fromFragment(fragment) {
  const state = emptyState();
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const ranges = new Map(RANGES.map((range) => [range.id, range]));

  state.text = params.get('t') ?? '';

  for (const [key, set] of [
    ['i', state.include],
    ['x', state.exclude],
  ]) {
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
