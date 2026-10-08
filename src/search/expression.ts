/**
 * Brackets, written out into the string the game reads.
 *
 * Pokémon GO's search box takes none. What it takes is clauses separated by `&`, each a list of alternatives separated
 * by `,`, `:` or `;`, each alternative a term or a term behind a `!`. Niantic's own list documents exactly that much —
 * "Use & or | to combine searches for Pokémon matching multiple criteria", "Use , : or ; to search for Pokémon from
 * multiple criteria", "Use ! before your search to search for all Pokémon except those that match your search" — and
 * mentions no grouping of any kind, while the fullest community reference there is sends a reader after "more complex
 * searches involving parentheses" away to a converter.
 *
 * That shape is conjunctive normal form, and every boolean expression has one. So a reader can write the search they
 * actually mean and have it written back out as something the box will take: `(pikachu&shiny),(pumpkaboo&xxl)` comes
 * out as four clauses, and not one of the four is a search anybody would have thought to write.
 *
 * Which leaves the precedence, and the page has already answered it. `query.js` writes `fire,water&shiny` for a shiny
 * that is Fire or Water, which is only that search if a comma binds tighter than an ampersand, and the caveat under the
 * output box says the string cannot prove which does. An expression is read the same way round and its clauses go to
 * the same composer, so the reading here and the warning that comes with it are the page's existing ones rather than a
 * second claim made in this file.
 *
 * Two things are refused rather than guessed at.
 *
 * - **`|`.** Niantic's list groups it with `&` as an AND, where `pkgosearch.com` tokenises it as an OR. A character
 *   whose two readings are opposites is worth refusing, for the reason `optimise.js` refuses a name fragment the two
 *   readings of the game's matching disagree about: taken either way, half the readers pasting one get the other search
 *   and nothing tells them so.
 * - **An expression that does not parse.** A bracket never closed is not a clause to drop quietly, because dropping it
 *   writes a *broader* search than was asked for and this page's output ends up in a mass transfer.
 *
 * What it costs is characters, since writing `any` out multiplies where writing `all` adds. That is the normal form's
 * nature rather than a shortcoming here — `(a&b),(c&d)` really is four clauses in a language with no brackets.
 * `optimise.js` is no help with them either, its reductions being about the dex and this knowing nothing about which
 * term is which.
 */

import { said } from '../errors.js';

/**
 * As many clauses as the distribution is let reach. An expression ORing a dozen pairs is 4096 clauses out of 24 terms,
 * and one ORing a dozen triples is 531441. The number bounds the whole tree rather than judging the length — a thousand
 * clauses is already a string no search box will show the end of, and the character count under the output box is what
 * says so to the reader. This is here so that a pathological expression comes back at all, rather than locking the tab
 * up building a megabyte nobody can use.
 *
 * `size` is what enforces it, and the *whole tree* is the point. A check inside the distribution can only ever bound
 * the node it sits in: guarding an `any`'s product left twenty `&`-joined groups of nine OR'd pairs — each group inside
 * the cap — summing to 10,240 clauses and half a megabyte of query with nothing reported, because an `all` lays its
 * parts' clauses end to end and no one of them was over.
 *
 * Exported so the test can work out the smallest expression that reaches it rather than carrying a copy of the number:
 * a cap raised past a transcribed one leaves the test asserting nothing, and that reads exactly like a pass.
 */
export const CLAUSES = 1000;

/**
 * How deep one expression may nest. `literal` recurses through every `!` and every `(`, so without this
 * `!`×10,000 and `(`×10,000 both came back as `Maximum call stack size exceeded` — a V8 string, rendered to the reader
 * as the reason Copy is refused, where every other refusal here is written for them.
 *
 * It is a separate limit because `CLAUSES` cannot stand in for it: `!!!!!shiny` is one clause however many negations
 * are stacked on it, so no bound on the output reaches a tree that is merely deep. Sixty-four is past anything written
 * by hand — `(a&(b,(c&d)))` is four — and far short of the few hundred frames that would trouble the stack.
 */
export const NESTING = 64;

/** The punctuation, and what each piece of it is. Everything else is part of a term. */
const PUNCTUATION: Record<string, Token['kind']> = {
  '&': 'all',
  ',': 'any',
  ':': 'any',
  ';': 'any',
  '!': 'not',
  '(': 'open',
  ')': 'close',
};

/**
 * The terms whose negation the game gets wrong, as the fullest community reference records them, each written to match
 * however its number was spelled — the game reads `4hp`, `3-defense` and `-1attack` alike, and takes a bare `mega` as
 * `mega0-`.
 *
 * These are here because pushing a `!` inside a bracket is the one place this file writes a term nobody typed.
 * `!(1hp,shiny)` is `!1hp&!shiny`, and the reference's capture has the game ignoring that negation outright — `!1hp` is
 * `1hp` — so the clause asks for the Pokémon it was meant to rule out, and looks entirely right doing it. A reader who
 * typed `!1hp` themselves has the same problem but can at least see the term they typed.
 *
 * They are named and not refused, which is this page's habit with a string it cannot vouch for: the caveat under the
 * output box and the optimiser's list of substitutions both say what was done and leave the reader to judge it.
 */
const MISHANDLED = [
  {
    pattern: /^(?:[0-4]|[0-4]-[0-4]?|-[0-4])(?:attack|defense|hp)$/,
    note: 'the game ignores a negation on an IV term, so this asks for the Pokémon it means to rule out',
  },
  {
    pattern: /^mega(?:[0-3]|[0-3]-[0-3]?|-[0-3])?$/,
    note: 'a negated mega level answers only with species that can Mega Evolve, rather than with everything else',
  },
];

interface Token {
  kind: 'all' | 'any' | 'not' | 'open' | 'close' | 'term';
  text: string;
}

/** One term and whether a `!` reached it: the leaves of a parsed expression, and the parts of a written clause. */
interface Literal {
  kind: 'literal';
  term: string;
  negated: boolean;
}

/** Several of them joined. `all` is what an `&` asks for and `any` what a comma does. */
interface Junction {
  kind: 'all' | 'any';
  parts: readonly Node[];
}

type Node = Literal | Junction;

/** One term the game mishandles behind its `!`, written as the reader will see it, and what the game does instead. */
export interface Mishandled {
  term: string;
  note: string;
}

/** What the expression box holds, said in clauses the composer can hand to the game. */
export interface Expansion {
  /** Each a comma-separated list of alternatives, for the composer to AND with everything else on the page. */
  clauses: readonly string[];

  /** Why nothing came back, in words for the reader under the box rather than for a log. */
  error: string | null;

  /** The negations the game is known to get wrong, each named once however many clauses it ended up in. */
  mishandled: readonly Mishandled[];
}

/**
 * The expression in pieces. A term is whatever sits between two bits of punctuation, trimmed and lowercased because
 * that is what the game reads and the shape `terms.js` keeps every term in already. Nothing else is taken out of one,
 * so the `*` of `4*`, the `@` of `@special` and the `-` of `1-151` all travel inside a term.
 */
function tokenise(text: string): Token[] {
  const found: Token[] = [];
  let word = '';

  const end = () => {
    const term = word.trim().toLowerCase();

    word = '';

    if (term) {
      found.push({ kind: 'term', text: term });
    }
  };

  for (const character of text) {
    if (character === '|') {
      throw new Error('`|` is an `&` to Niantic and a `,` to other tools — write whichever of the two you meant');
    }

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
 * The tree the tokens describe, read with a comma binding tighter than an ampersand.
 *
 * A `!` is carried down rather than kept as a node of its own, which is De Morgan's law applied while reading instead
 * of as a pass over the tree afterwards: a negated `all` is an `any` of negated parts, so flipping the junction on the
 * way past leaves a tree whose only negations are on its leaves. `!!shiny` falls out of the same thing, the flag having
 * been turned over twice.
 *
 * A junction is only built where there are two parts to join, so nothing below has to read a junction of one.
 *
 * `depth` travels beside the negation and counts every nesting, a `!` as much as a `(`, each of the two being a turn
 * through `literal` and so a turn through the stack.
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

    return parts.length === 1 ? first : { kind: negated ? 'any' : 'all', parts };
  }

  function disjunction(negated: boolean, depth: number): Node {
    const first = literal(negated, depth);
    const parts = [first];

    while (next()?.kind === 'any') {
      at += 1;
      parts.push(literal(negated, depth));
    }

    return parts.length === 1 ? first : { kind: negated ? 'all' : 'any', parts };
  }

  function literal(negated: boolean, depth: number): Node {
    const token = next();

    if (!token) {
      throw new Error('The expression stops where a term was expected');
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

    return { kind: 'literal', term: token.text, negated };
  }

  const node = conjunction(false, 0);
  const over = next();

  /*
   * Whatever is left is something the grammar above had nowhere to put, and it is not always a stray bracket. Every
   * parenthesis in `(shiny,lucky)(fire,water)` is paired: what is missing is the operator between the two groups. So a
   * reader who expected one group beside another to mean AND, as several search syntaxes do, was being pointed at a `)`
   * that was perfectly fine and told nothing at all about the `&`.
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
 * How many clauses the tree below would spread to, which is the same arithmetic `spread` performs and none of the
 * allocation: a literal is one, an `all` is the sum of its parts and an `any` is their product.
 *
 * Counted rather than measured as it is built, so the cap is a precondition `expand` can check before anything is
 * allocated instead of a limit the distribution runs into part-way through. Every running total is clamped at one past
 * the cap, so nothing here can overflow however deep or wide the tree: past that point the exact figure is of no
 * interest to anyone, only that it is over.
 */
function size(node: Node): number {
  if (node.kind === 'literal') {
    return 1;
  }

  const sum = node.kind === 'all';

  return node.parts.reduce(
    (total, part) => Math.min(sum ? total + size(part) : total * size(part), CLAUSES + 1),
    sum ? 0 : 1,
  );
}

/**
 * The tree as clauses, which is the distribution and the walk over it in one function. A literal is a clause of itself
 * and an `all` is its parts' clauses laid end to end. An `any` is the one product in here: a clause per way of taking
 * one clause from each part, since every clause written by any one part has to be satisfied for that part to be.
 */
function spread(node: Node): Literal[][] {
  if (node.kind === 'literal') {
    return [[node]];
  }

  if (node.kind === 'all') {
    return node.parts.flatMap(spread);
  }

  return node.parts.map(spread).reduce((left, right) => left.flatMap((one) => right.map((two) => [...one, ...two])));
}

/** A literal as the game writes it, which is also the text two of them are compared by. */
const written = (one: Literal) => (one.negated ? `!${one.term}` : one.term);

/** The same literal the other way round, for the pair that leaves a clause asking nothing. */
const opposite = (text: string) => (text.startsWith('!') ? text.slice(1) : `!${text}`);

/**
 * One clause's literals with nothing redundant left in them, or null where the clause has earned no place at all. A
 * term repeated in it is one alternative, and a term beside its own negation leaves the clause true of everything —
 * every Pokémon either is Fire or is not — so that clause goes rather than being written. Distribution produces both on
 * its own: `(a&b),(!a&c)` spreads to four clauses of which `a,!a` is one.
 *
 * Literals rather than their text, so that what each surviving clause is made of is still known further down. Only the
 * last step writes anything.
 */
function clause(literals: readonly Literal[]): Literal[] | null {
  const offered = new Set<string>();
  const unique: Literal[] = [];

  for (const one of literals) {
    const text = written(one);

    if (!offered.has(text)) {
      offered.add(text);
      unique.push(one);
    }
  }

  return [...offered].some((text) => offered.has(opposite(text))) ? null : unique;
}

/**
 * The clauses with the ones asking nothing of their own taken out. A clause holding every alternative another holds
 * asks no more than that other already does, so it adds nothing beside it: `shiny` AND `shiny,lucky` is `shiny`, and
 * two clauses offering the same alternatives are one clause. The earlier of an equal pair is the one kept, so the
 * string follows the order it was written in.
 *
 * Each clause's alternatives are written once, up front, rather than spread out of their set inside the comparison:
 * this is a pair of nested loops over as many clauses as the cap allows, so an array built per comparison is an
 * allocation per pair of clauses rather than one per clause.
 *
 * A length test ahead of the subset test would be the obvious thrift and is not here. Distribution gives every clause
 * out of one `any` node the same length, one literal per part, so on anything this actually receives the test would
 * never fire — no mutation of it could be made to fail a test, and alternating runs over the 512-clause case put it
 * inside the noise. A branch that cannot be held by a test and cannot be shown to pay is worth less than the line.
 */
function absorbed(all: readonly (readonly Literal[])[]) {
  const clauses = all.map((literals) => {
    const texts = literals.map(written);

    return { literals, texts, offered: new Set(texts) };
  });

  return clauses
    .filter((mine, index) =>
      clauses.every((other, at) => {
        if (at === index || !other.texts.every((text) => mine.offered.has(text))) {
          return true;
        }

        // An equal pair subsumes both ways round, so the tie is broken on which of the two was written first.
        return other.texts.length === mine.texts.length && index < at;
      }),
    )
    .map((mine) => mine.literals);
}

/** The negated terms the game gets wrong, each named once however many of the clauses it reached. */
function mishandling(clauses: readonly (readonly Literal[])[]): Mishandled[] {
  const negated = new Set(
    clauses
      .flat()
      .filter((one) => one.negated)
      .map((one) => one.term),
  );

  return [...negated].flatMap((term) => {
    const found = MISHANDLED.find((entry) => entry.pattern.test(term));

    return found ? [{ term: `!${term}`, note: found.note }] : [];
  });
}

/**
 * The clauses an expression asks for, and whatever is worth saying about it. An empty box is no expression rather than
 * a broken one, that being the state the page spends most of its life in.
 *
 * The clauses keep the order they were written in. Nothing is sorted, because an expression is the reader's own text
 * and a string they can still recognise is a string they can check — where the fixed order `query.js` imposes is for
 * choices made by clicking, which arrive in whatever sequence the clicking happened to take.
 *
 * The negations are read off the clauses that survived rather than off everything the distribution produced. A clause
 * dropped for asking nothing takes its terms with it, so `legendary,!(legendary&1hp)` spreads a `!1hp` and then writes
 * no clause at all — warning about it would have named a term the string does not contain, which is the one thing the
 * page says these notes are for.
 */
export function expand(text: string): Expansion {
  if (text.trim() === '') {
    return { clauses: [], error: null, mishandled: [] };
  }

  try {
    const tree = parse(tokenise(text));

    if (size(tree) > CLAUSES) {
      throw new Error(`That spreads past ${CLAUSES} clauses, which is longer than any search box will take`);
    }

    const kept = absorbed(
      spread(tree)
        .map(clause)
        .filter((one) => one !== null),
    );

    return {
      clauses: kept.map((literals) => literals.map(written).join(',')),
      error: null,
      mishandled: mishandling(kept),
    };
  } catch (cause) {
    return { clauses: [], error: said(cause), mishandled: [] };
  }
}
