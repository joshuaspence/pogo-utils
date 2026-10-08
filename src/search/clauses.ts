/**
 * The query tree, written out as the clauses the game reads.
 *
 * Pokémon GO's search box takes no brackets. What it takes is clauses separated by `&`, each a list of alternatives
 * separated by `,`, `:` or `;`, each alternative a term or a term behind a `!` — which is all Niantic's own list
 * documents, mentioning no grouping of any kind.
 *
 * That shape is conjunctive normal form, and every boolean expression has one. So the canvas can let a reader arrange
 * the search they actually mean and this writes it back out as something the box will take: two pills in an `any`
 * inside an `all` beside two more comes out as four clauses, not one of which anybody would have thought to write.
 *
 * **The precedence is the one assumption under all of this, and it is documented.** A clause list joined with `&`
 * only means what the canvas said if a comma binds tighter than an ampersand — `fire,water&shiny` has to read as a
 * shiny that is Fire or Water. The community reference cited below for two negation bugs says so in its storage table:
 * "Ambiguity is resolved by always considering `,`s nested inside `&`s", with `meowth,alola&vulpix,galar` as the
 * example. Niantic's own list never combines the two operators, so the community one is what settles it.
 *
 * That reference also notes that searches "do not take priority over each other", which is about its *Pokédex* table —
 * a different box with its own phrase list. This file read that as doubt about the line above for a while: a claim from
 * a three-table reference is worth nothing until you know which search it is a claim about.
 *
 * What the form costs is characters, an `any` multiplying where an `all` adds, which is its nature rather than a
 * shortcoming: `(a&b),(c&d)` really is four clauses in a language with no brackets.
 *
 * Nothing here pushes a negation anywhere, `tree.js` keeping negation on the pills: the tree arrives in negation
 * normal form and De Morgan is the reader's own doing.
 */

import { group, isGroup, leafText, type Leaf, type Node } from './tree.js';

/**
 * As many clauses as the distribution is let reach. A query ORing a dozen pairs is 4096 clauses out of 24 pills, and
 * one ORing a dozen triples is 531441. The number bounds the whole tree rather than judging the length — a thousand
 * clauses is already a string no search box will show the end of, and the character count under the output box is what
 * says so to the reader. This is here so that a pathological query comes back at all, rather than locking the tab up
 * building a megabyte nobody can use.
 *
 * `size` is what enforces it, and the *whole tree* is the point. A check inside the distribution can only bound the
 * node it sits in: guarding an `any`'s product left twenty `all`-joined groups of nine OR'd pairs — each inside the
 * cap — summing to 10,240 clauses and half a megabyte of query with nothing reported.
 *
 * Exported so the test can work out the smallest tree that reaches it rather than carrying a copy of the number.
 */
export const CLAUSES = 1000;

/**
 * The terms whose negation the game gets wrong, as the fullest community reference records them, each written to match
 * however its number was spelled — the game reads `4hp`, `3-defense` and `-1attack` alike, and takes a bare `mega` as
 * `mega0-`.
 *
 * The reference's capture has the game ignoring the negation on an IV term outright: `!1hp` is `1hp`, so the clause
 * asks for the Pokémon it was meant to rule out and looks entirely right doing it. A negated mega level answers only
 * with species that can Mega Evolve, rather than with everything else.
 *
 * Neither is this page's doing — nothing between here and the string manufactures a negation. They are named because
 * this page's output ends up in a mass transfer, where a term that means its own opposite is worth a sentence.
 */
/*
 * Nothing here reorders a clause for `+{name}`, and the same reference argues it should: its storage table records
 * that a family shorthand "returns no results if put before `@` or `#`". Taken at face value that condemns
 * `+charmander&@special`, which this page writes whenever a family pill is placed ahead of an Exclusive-move one — and
 * which the factoring above writes unprompted. A pass putting every `+` after every `@` and `#` was written and then
 * taken out again: typed into the game, both that and the spaced `+charmander & @special` return what they should.
 *
 * The note is older than the build it was read against. A line from a reference that would cost something to act on is
 * worth checking against the game first; one that costs nothing — like the two below, which are notes beside a string
 * — is worth acting on without.
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
 * A node said as one string, so two parts of a junction can be compared for asking the same thing. Structural rather
 * than canonical: the parts are not sorted, so `all(a, b)` and `all(b, a)` are two keys. Sorting them was in the first
 * draft and bought only recognising two differently-ordered subgroups as one shared part — which, measured, writes the
 * same clauses one intermediate clause later, and which no mutation could be made to fail a test over.
 *
 * The junction is in the key and has to be: without it `all(a, b)` and `any(a, b)` read as one shared part, and the
 * search narrows from `s and (a or b)` to `s and a and b`.
 */
function key(node: Node): string {
  return isGroup(node) ? `${node.junction}(${node.parts.map(key).join('|')})` : (leafText(node) ?? '');
}

/** What a part of a junction asks for, as keys: an `all`'s own parts, or the part itself where it is not one. */
const asks = (node: Node) => new Set((isGroup(node) && node.junction === 'all' ? node.parts : [node]).map(key));

/**
 * A pill every part of an `any` asks for, lifted out of it: `any(all(s, a), all(s, b))` is `all(s, any(a, b))` — the
 * same search said as a sum where it was said as a product.
 *
 * This decides whether a realistic arrangement can be written at all. *A shiny Fire, or a shiny Water, or a shiny
 * Grass* is a natural thing to place, one `any` holding an `all` per type, and it spreads to two to the power of
 * however many types are named: 64 clauses at six, past the cap at ten, where the answer is `shiny` and one clause of
 * types. Dropping those clauses afterwards cannot help, the cap being reached while they are built.
 *
 * Here rather than in `optimise.js` because it is not optional: that toggle is for reductions a reader might want
 * undone, where this changes only how much work the distribution is. `clauses.test.js` holds it to the same clauses
 * either way, over a sweep of arrangements with something in common between their parts.
 *
 * A part asking for *nothing but* what is shared needs no case of its own — it is left an `all` of nothing, which the
 * arithmetic below reads as the search for everything, and an `any` holding everything is everything. The branch that
 * noticed was another no mutation could kill.
 */
function factored(node: Node): Node {
  if (!isGroup(node)) {
    return node;
  }

  const parts = node.parts.map(factored);

  if (node.junction !== 'any' || parts.length < 2) {
    return { ...node, parts };
  }

  const sets = parts.map(asks);
  const [first] = sets;
  const shared = first === undefined ? [] : [...first].filter((text) => sets.every((one) => one.has(text)));

  if (shared.length === 0) {
    return { ...node, parts };
  }

  const within = (part: Node) => (isGroup(part) && part.junction === 'all' ? part.parts : [part]);
  const lifted = within(parts[0] ?? node).filter((part) => shared.includes(key(part)));
  const left = parts.map((part) => within(part).filter((one) => !shared.includes(key(one))));

  // Each remainder is wrapped whatever its length: an `all` of one part spreads to exactly what that part does, and an
  // `all` of none is the search for everything, which is what a part asking only for the shared pills has become.
  return group('all', [
    ...lifted,
    factored(
      group(
        'any',
        left.map((rest) => group('all', rest)),
      ),
    ),
  ]);
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
 * out of one `any` node the same length, so on anything this receives the test would never fire — no mutation of it
 * could be made to fail, and runs over the 512-clause case put it inside the noise.
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
  // Factored before it is measured, the point of factoring being to bring the measurement under the cap.
  const tree = factored(node);

  if (size(tree) > CLAUSES) {
    return {
      clauses: [],
      error: `That spreads past ${CLAUSES} clauses, which is longer than any search box will take`,
      mishandled: [],
    };
  }

  const kept = absorbed(
    spread(tree)
      .map(clause)
      .filter((one) => one !== null),
  );

  return {
    clauses: kept.map((leaves) => leaves.map(written).join(',')),
    error: null,
    mishandled: mishandling(kept),
  };
}
