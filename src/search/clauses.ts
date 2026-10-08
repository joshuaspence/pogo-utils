/**
 * The query tree, written out as the clauses the game reads.
 *
 * Pokémon GO's search box takes no brackets. What it takes is clauses separated by `&`, each a list of alternatives
 * separated by `,`, `:` or `;`, each alternative a term or a term behind a `!`. Niantic's own list documents exactly
 * that much — "Use & or | to combine searches for Pokémon matching multiple criteria", "Use , : or ; to search for
 * Pokémon from multiple criteria", "Use ! before your search to search for all Pokémon except those that match your
 * search" — and mentions no grouping of any kind, while the fullest community reference there is sends a reader after
 * "more complex searches involving parentheses" away to a converter.
 *
 * That shape is conjunctive normal form, and every boolean expression has one. So the canvas can let a reader arrange
 * the search they actually mean and this writes it back out as something the box will take: two pills in an `any`
 * inside an `all` beside two more comes out as four clauses, and not one of the four is a search anybody would have
 * thought to write.
 *
 * Which leaves the precedence, and it is the one assumption under all of this. A clause list joined with `&` only
 * means what the canvas said if a comma binds tighter than an ampersand: `fire,water&shiny` has to read as a shiny
 * that is Fire or Water rather than as Fire or a shiny Water. Niantic's list documents both operators and never
 * combines them in an example, and the fullest community reference carries a note that searches "do not take priority
 * over each other" against a thread that could not be read — so this is stated here rather than proved, and it is the
 * reading the page has taken since it only had chips.
 *
 * The page used to warn about it whenever a string mixed the two. It no longer does: the fixed builder mixed them now
 * and then, where an arrangement holding any `any` at all mixes them, so the warning would never be off.
 *
 * What it costs is characters, since an `any` multiplies where an `all` adds. That is the normal form's nature rather
 * than a shortcoming — `(a&b),(c&d)` really is four clauses in a language with no brackets.
 *
 * Nothing here pushes a negation anywhere, because `tree.js` keeps negation on the pills: the tree arrives in negation
 * normal form and De Morgan is the reader's own doing, a negated `all` being the `any` of negated pills they built
 * instead.
 */

import { isGroup, leafText, type Leaf, type Node } from './tree.js';

/**
 * As many clauses as the distribution is let reach. A query ORing a dozen pairs is 4096 clauses out of 24 pills, and
 * one ORing a dozen triples is 531441. The number bounds the whole tree rather than judging the length — a thousand
 * clauses is already a string no search box will show the end of, and the character count under the output box is what
 * says so to the reader. This is here so that a pathological query comes back at all, rather than locking the tab up
 * building a megabyte nobody can use.
 *
 * `size` is what enforces it, and the *whole tree* is the point. A check inside the distribution can only ever bound
 * the node it sits in: guarding an `any`'s product left twenty `all`-joined groups of nine OR'd pairs — each group
 * inside the cap — summing to 10,240 clauses and half a megabyte of query with nothing reported, because an `all` lays
 * its parts' clauses end to end and no one of them was over.
 *
 * Exported so the test can work out the smallest tree that reaches it rather than carrying a copy of the number: a cap
 * raised past a transcribed one leaves the test asserting nothing, and that reads exactly like a pass.
 */
export const CLAUSES = 1000;

/**
 * The terms whose negation the game gets wrong, as the fullest community reference records them, each written to match
 * however its number was spelled — the game reads `4hp`, `3-defense` and `-1attack` alike, and takes a bare `mega` as
 * `mega0-`.
 *
 * The reference's capture has the game ignoring the negation on an IV term outright: `!1hp` is `1hp`, so the clause
 * asks for the Pokémon it was meant to rule out and looks entirely right doing it. A negated mega level has its own —
 * it answers only with species that can Mega Evolve, rather than with everything else.
 *
 * Neither is this page's doing. The catalogue offers no IV term, so one arrives only as a name a reader typed and then
 * negated themselves, and nothing between here and the string manufactures a negation — the pills carry their own and
 * the reductions below only ever drop things. They are named anyway because this page's output ends up in a mass
 * transfer, and a term that means its own opposite is worth a sentence however it got there.
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

/** One term the game mishandles behind its `!`, written as the reader will see it, and what the game does instead. */
export interface Mishandled {
  term: string;
  note: string;
}

/** What a query comes to, said in clauses the page can hand to the game. */
export interface Written {
  /** Each a comma-separated list of alternatives, for the page to join with `&`. */
  clauses: readonly string[];

  /** Why nothing came back, in words for the reader under the box rather than for a log. */
  error: string | null;

  /** The negations the game is known to get wrong, each named once however many clauses it ended up in. */
  mishandled: readonly Mishandled[];
}

/**
 * How many clauses the tree would spread to, which is the same arithmetic `spread` performs and none of the
 * allocation: a pill is one, an `all` is the sum of its parts and an `any` is their product.
 *
 * Counted rather than measured as it is built, so the cap is a precondition `written` can check before anything is
 * allocated instead of a limit the distribution runs into part-way through. Every running total is clamped at one past
 * the cap, so nothing here can overflow however deep or wide the tree: past that point the exact figure is of no
 * interest to anyone, only that it is over.
 *
 * A pill with nothing to write is nought clauses, which falls out of both sums: it drops out of an `all` that holds it
 * and zeroes the `any` that does, and nought clauses is the search for everything. An empty group is the same thing by
 * the same arithmetic — the sum of no parts is nought, and the product of none is one, so an empty `any` would be a
 * clause of nothing at all, which is why it is read as the unfinished group it is.
 */
export function size(node: Node): number {
  if (!isGroup(node)) {
    return leafText(node) === null ? 0 : 1;
  }

  if (node.parts.length === 0) {
    return 0;
  }

  const sum = node.junction === 'all';

  return node.parts.reduce(
    (total, part) => Math.min(sum ? total + size(part) : total * size(part), CLAUSES + 1),
    sum ? 0 : 1,
  );
}

/**
 * The tree as clauses, which is the distribution and the walk over it in one function. A pill is a clause of itself
 * and an `all` is its parts' clauses laid end to end. An `any` is the one product in here: a clause per way of taking
 * one clause from each part, since every clause written by any one part has to be satisfied for that part to be.
 *
 * A part that wrote no clauses makes its `any` write none either, the product of nothing being nothing — which is the
 * right answer, an unfinished pill beside two alternatives leaving a group that asks for nothing in particular.
 */
function spread(node: Node): Leaf[][] {
  if (!isGroup(node)) {
    return leafText(node) === null ? [] : [[node]];
  }

  // A group with nothing in it is one the reader has just made, and asks nothing until a pill lands in it. Left to the
  // arithmetic below an empty `any` would seed a clause offering no alternatives at all, which nothing can write.
  if (node.parts.length === 0) {
    return [];
  }

  if (node.junction === 'all') {
    return node.parts.flatMap(spread);
  }

  return node.parts
    .map(spread)
    .reduce<Leaf[][]>((left, right) => left.flatMap((one) => right.map((two) => [...one, ...two])), [[]]);
}

/** The pill as the game writes it, which is also the text two of them are compared by. Never null in a clause. */
const written = (leaf: Leaf) => leafText(leaf) ?? '';

/** The same text the other way round, for the pair that leaves a clause asking nothing. */
const opposite = (text: string) => (text.startsWith('!') ? text.slice(1) : `!${text}`);

/**
 * One clause's pills with nothing redundant left in them, or null where the clause has earned no place at all. A term
 * repeated in it is one alternative, and a term beside its own negation leaves the clause true of everything — every
 * Pokémon either is Fire or is not — so that clause goes rather than being written. Distribution produces both on its
 * own: an `any` of `all[a,b]` and `all[!a,c]` spreads to four clauses of which `a,!a` is one.
 *
 * Pills rather than their text, so that what each surviving clause is made of is still known further down. Only the
 * last step writes anything.
 */
function clause(leaves: readonly Leaf[]): Leaf[] | null {
  const offered = new Set<string>();
  const unique: Leaf[] = [];

  for (const leaf of leaves) {
    const text = written(leaf);

    if (!offered.has(text)) {
      offered.add(text);
      unique.push(leaf);
    }
  }

  return [...offered].some((text) => offered.has(opposite(text))) ? null : unique;
}

/**
 * The clauses with the ones asking nothing of their own taken out. A clause holding every alternative another holds
 * asks no more than that other already does, so it adds nothing beside it: `shiny` AND `shiny,lucky` is `shiny`, and
 * two clauses offering the same alternatives are one clause. The earlier of an equal pair is the one kept, so the
 * string follows the order the pills were arranged in.
 *
 * Each clause's alternatives are written once, up front, rather than spread out of their set inside the comparison:
 * this is a pair of nested loops over as many clauses as the cap allows, so an array built per comparison is an
 * allocation per pair of clauses rather than one per clause.
 *
 * A length test ahead of the subset test would be the obvious thrift and is not here. Distribution gives every clause
 * out of one `any` node the same length, one pill per part, so on anything this actually receives the test would never
 * fire — no mutation of it could be made to fail a test, and alternating runs over the 512-clause case put it inside
 * the noise. A branch that cannot be held by a test and cannot be shown to pay is worth less than the line.
 */
function absorbed(all: readonly (readonly Leaf[])[]) {
  const clauses = all.map((leaves) => {
    const texts = leaves.map(written);

    return { leaves, texts, offered: new Set(texts) };
  });

  return clauses
    .filter((mine, index) =>
      clauses.every((other, at) => {
        if (at === index || !other.texts.every((text) => mine.offered.has(text))) {
          return true;
        }

        // An equal pair subsumes both ways round, so the tie is broken on which of the two was arranged first.
        return other.texts.length === mine.texts.length && index < at;
      }),
    )
    .map((mine) => mine.leaves);
}

/** The negated terms the game gets wrong, each named once however many of the clauses it reached. */
function mishandling(clauses: readonly (readonly Leaf[])[]): Mishandled[] {
  const negated = new Set(
    clauses
      .flat()
      .filter((leaf) => leaf.negated)
      .map((leaf) => written(leaf).slice(1)),
  );

  return [...negated].flatMap((term) => {
    const found = MISHANDLED.find((entry) => entry.pattern.test(term));

    return found ? [{ term: `!${term}`, note: found.note }] : [];
  });
}

/**
 * The clauses a query comes to, and whatever is worth saying about it. An empty canvas is a query for everything rather
 * than a broken one, that being the state the page spends most of its life in.
 *
 * The clauses keep the order the pills were arranged in. Nothing is sorted, because the arrangement is the reader's
 * own and a string they can still recognise is a string they can check.
 *
 * The negations are read off the clauses that survived rather than off everything the distribution produced. A clause
 * dropped for asking nothing takes its pills with it, so a query can spread a `!1hp` and then write no clause holding
 * one — naming it would have named a term the string does not contain, which is the one thing the page says these
 * notes are for.
 */
export function clausesOf(node: Node): Written {
  if (size(node) > CLAUSES) {
    return {
      clauses: [],
      error: `That spreads past ${CLAUSES} clauses, which is longer than any search box will take`,
      mishandled: [],
    };
  }

  const kept = absorbed(
    spread(node)
      .map(clause)
      .filter((one) => one !== null),
  );

  return {
    clauses: kept.map((leaves) => leaves.map(written).join(',')),
    error: null,
    mishandled: mishandling(kept),
  };
}
