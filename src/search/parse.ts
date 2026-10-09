/**
 * A typed search read back into an arrangement.
 *
 * This is the inverse of `clauses.js`, and the reason it exists is that the inverse is the easy direction: a reader can
 * write the search they mean with brackets in it, and the page can put the pills where the brackets say and let the
 * composer write out something the game will take. `(pikachu&shiny),(pumpkaboo&xxl)` arrives as two groups inside an
 * `any` and leaves as the four clauses the game needs.
 *
 * What it is *not* is a second composer. Nothing here writes a string; it writes a tree, the canvas draws it, and the
 * one composer takes it from there. So a typed query is an import rather than another way to ask the same question —
 * the pills land on the canvas and can be dragged about afterwards like any others.
 *
 * **The operators are the game's own, and both sources agree on them now.** Niantic's list groups `|` with `&` as an
 * AND, and the community phrase list says it outright: "`&` or `|` — AND combination", "`,` or `;` or `:` — OR
 * combination". An earlier text box here refused `|` for want of a second source, `pkgosearch.com` reading it as an
 * OR; two lists against one converter is enough to stop refusing it.
 *
 * A negation is carried down rather than kept as a node, which is De Morgan's law applied while reading: a negated
 * `all` is an `any` of negated parts. That is not a convenience but the whole of why this fits — `tree.js` keeps
 * negation on the pills and has no negated group, so a tree whose only negations are on its leaves is the only kind
 * the canvas can draw.
 */

import { bounded, GROUPS, RANGES, SPAN } from './terms.js';
import { group, NESTING, type Junction, type Leaf, type Node } from './tree.js';

/** The punctuation, and what each piece of it is. Everything else is part of a term. */
const PUNCTUATION: Record<string, Token['kind']> = {
  '&': 'all',
  '|': 'all',
  ',': 'any',
  ';': 'any',
  ':': 'any',
  '!': 'not',
  '(': 'open',
  ')': 'close',
};

interface Token {
  kind: Junction | 'not' | 'open' | 'close' | 'term';
  text: string;
}

/** Every catalogue term by the text the game reads it as, which is what a reader will have typed. */
const IDS_BY_TERM = new Map(GROUPS.flatMap((category) => category.terms).map((term) => [term.term, term.id]));

/** What a typed query came to, for the page to put on the canvas or to complain about. */
export interface Read {
  tree: Node | null;
  error: string | null;
}

/**
 * The pill a word becomes.
 *
 * A catalogue term is tried first, so `shiny` arrives as the Status pill rather than as a name that happens to read
 * the same — which matters because the chip above it then shows as required, and the pill carries its category's
 * colour. It beats the ranges too, which is the one place the two overlap: `1-151` is both the Gen 1 term and a dex
 * span, and the two write the same thing, so the pill that says *Gen 1* is the better of the two to draw.
 *
 * Anything left is a name, which is what the game does with it: a word it does not know is matched against the names
 * and nicknames in storage.
 */
function pill(text: string, negated: boolean): Leaf {
  const term = IDS_BY_TERM.get(text.toLowerCase());

  if (term !== undefined) {
    return { kind: 'term', id: term, negated };
  }

  for (const range of RANGES) {
    const tail =
      range.prefix === '' ? text : text.toLowerCase().startsWith(range.prefix) ? text.slice(range.prefix.length) : null;
    const [, low, dash, high] = (tail === null ? null : SPAN.exec(tail)) ?? [];

    // A match with neither bound is not a span: `cp` alone, and the `-` the dex range sees in any text holding one.
    if (low === undefined && high === undefined) {
      continue;
    }

    /*
     * Bounded on the way in, so a typed span is a pill the number boxes could have made. A digit run of 22 or more is
     * a float `String` writes in exponential form, and `1e+21` went into the search box as the term it is not.
     *
     * An end the dash leaves open stays open rather than being filled from the range, which is what lets the writer
     * put the same string back: a `cp3000-` read as `cp3000-5000` would come out spelled the other way. Without a
     * dash there is no open end to leave — a bare `{phrase}{N}` is the one value, which is both bounds at once.
     */
    const from = low === undefined ? null : bounded(Number(low), range);
    const to = high === undefined ? (dash === undefined ? from : null) : bounded(Number(high), range);
    const turned = from !== null && to !== null && from > to;

    return { kind: 'range', id: range.id, from: turned ? to : from, to: turned ? from : to, negated };
  }

  return { kind: 'name', text, negated };
}

/**
 * The query in pieces. A term is whatever sits between two bits of punctuation, trimmed — and kept in the reader's own
 * case, since the game is case-insensitive and a nickname they typed with capitals should read back as theirs.
 */
function tokenise(text: string): Token[] {
  const found: Token[] = [];
  let word = '';

  const end = () => {
    const term = word.trim();

    word = '';

    if (term) {
      found.push({ kind: 'term', text: term });
    }
  };

  for (const character of text) {
    const kind = PUNCTUATION[character];

    if (kind) {
      end();
      found.push({ kind, text: character });
    } else {
      word += character;
    }
  }

  end();

  return found;
}

/**
 * The tree the tokens describe, read with a comma binding tighter than an ampersand — which is the game's own rule,
 * its phrase list resolving the ambiguity "by always considering `,`s nested inside `&`s".
 *
 * A junction is only built where there are two parts to join, so nothing downstream reads a group of one.
 */
function parse(all: readonly Token[]): Node {
  let at = 0;

  const next = () => all[at];

  function conjunction(negated: boolean, depth: number): Node {
    const first = disjunction(negated, depth);
    const parts = [first];

    while (next()?.kind === 'all') {
      at += 1;
      parts.push(disjunction(negated, depth));
    }

    return parts.length === 1 ? first : group(negated ? 'any' : 'all', parts);
  }

  function disjunction(negated: boolean, depth: number): Node {
    const first = literal(negated, depth);
    const parts = [first];

    while (next()?.kind === 'any') {
      at += 1;
      parts.push(literal(negated, depth));
    }

    return parts.length === 1 ? first : group(negated ? 'all' : 'any', parts);
  }

  function literal(negated: boolean, depth: number): Node {
    const token = next();

    if (!token) {
      throw new Error('The query stops where a term was expected');
    }

    if (depth > NESTING) {
      throw new Error(`That nests more than ${NESTING} deep — there is no search in there to read`);
    }

    at += 1;

    if (token.kind === 'not') {
      return literal(!negated, depth + 1);
    }

    if (token.kind === 'open') {
      const inside = conjunction(negated, depth + 1);

      if (next()?.kind !== 'close') {
        throw new Error('A `(` is never closed');
      }

      at += 1;

      return inside;
    }

    if (token.kind !== 'term') {
      throw new Error(`\`${token.text}\` needs a term in front of it`);
    }

    return pill(token.text, negated);
  }

  const node = conjunction(false, 0);
  const over = next();

  /*
   * Whatever is left is something the grammar had nowhere to put, and it is not always a stray bracket. Every
   * parenthesis in `(shiny,lucky)(fire,water)` is paired: what is missing is the operator between the two groups, and
   * a reader who expected one group beside another to mean AND — as several search syntaxes do — is owed that rather
   * than a complaint about a `)` that was perfectly fine.
   */
  if (over) {
    throw new Error(
      over.kind === 'close'
        ? 'A `)` has no `(` to close'
        : `An \`&\` or a \`,\` is missing in front of \`${over.text}\``,
    );
  }

  return node;
}

/**
 * The arrangement a typed query describes, or why it describes none.
 *
 * An empty box is neither: there is nothing to put on the canvas and nothing wrong with that, so both come back null
 * and the page does nothing.
 *
 * The root is a group whatever arrives, the canvas having to have something to draw — a query that is one term is
 * wrapped in the `all` that an arrangement of one pill would have been.
 */
export function read(text: string): Read {
  if (text.trim() === '') {
    return { tree: null, error: null };
  }

  try {
    const node = parse(tokenise(text));

    return { tree: node.kind === 'group' ? node : group('all', [node]), error: null };
  } catch (cause) {
    return { tree: null, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
