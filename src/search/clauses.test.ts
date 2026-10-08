/**
 * Whether the clauses say what the arrangement said.
 *
 * That is the one thing worth proving here, and pinning output strings barely touches it: an `any` of two `all`s has a
 * right answer four clauses long, and a reader comparing it against a literal in a test file is checking a
 * transcription rather than the arithmetic. So each case is built as the tree the canvas would hold, read twice — once
 * through `clausesOf`, and once as a predicate this file evaluates itself — and the two are compared over every
 * assignment of the terms in them. One assertion then covers the distribution, the absorption, the clause that asks
 * nothing and the pill that has nothing to say, and it goes on covering them when any of those is rewritten.
 *
 * The tree is the input, so there is no parser between the test and the thing under test and no spelling to agree
 * about. What `tree.js` keeps negation on the pills buys here is that nothing has to be put into negation normal form
 * first: a case is already in it.
 *
 * Nothing is derived from `terms.js` except the terms themselves, since what the arithmetic does is true of any pill.
 * Real ones are used all the same, a case that reads as a search being a case worth checking.
 */

import { expect, test } from 'vitest';

import { CLAUSES, clausesOf } from './clauses.js';
import { group, type Leaf, type Node } from './tree.js';

/** A required pill, which is what a chip dragged off the catalogue becomes. */
const yes = (id: string): Leaf => ({ kind: 'term', id, negated: false });

/** The same pill turned round, which is one press on its face. */
const no = (id: string): Leaf => ({ kind: 'term', id, negated: true });

const all = (...parts: Node[]) => group('all', parts);
const any = (...parts: Node[]) => group('any', parts);

/**
 * The question a tree asks of one Pokémon, which is the set of terms that are true of it. A group with nothing in it
 * asks nothing, and so does a pill with nothing written in it yet — both of which read as true here, since a search
 * for everything is what no constraint means. A name is one of the terms as much as a chip is, the game drawing no
 * distinction between a word the catalogue owns and the same word typed in; a span is the one kind no case here asks
 * about.
 */
function holds(node: Node, on: ReadonlySet<string>): boolean {
  if (node.kind !== 'group') {
    const asked = node.kind === 'term' ? node.id : node.kind === 'name' ? node.text.trim() : '';

    return asked === '' || on.has(asked) !== node.negated;
  }

  if (node.parts.length === 0) {
    return true;
  }

  return node.junction === 'all'
    ? node.parts.every((part) => holds(part, on))
    : node.parts.some((part) => holds(part, on));
}

/**
 * The same question asked of the clauses, read the way the game reads them: every clause has to be satisfied, and a
 * clause is satisfied by any one of its alternatives. No clauses at all is a search for everything, which is what the
 * `.every` of an empty list says and what a group that asked nothing reduces to.
 */
const matches = (clauses: readonly string[], on: ReadonlySet<string>) =>
  clauses.every((clause) =>
    clause.split(',').some((text) => (text.startsWith('!') ? !on.has(text.slice(1)) : on.has(text))),
  );

/** Every set of terms that could be true of one Pokémon, which is every subset of the ones a case mentions. */
function* assignments(terms: readonly string[]) {
  for (let bits = 0; bits < 2 ** terms.length; bits += 1) {
    yield new Set(terms.filter((_, index) => (bits >> index) % 2 === 1));
  }
}

/** The clauses a tree comes to, having refused to come to any being a failure rather than an answer. */
function clausesFor(node: Node) {
  const { clauses, error } = clausesOf(node);

  expect(error).toBeNull();

  return clauses;
}

/** A name pill, which writes whatever the reader typed and so needs nothing from the term table. */
const named = (text: string, negated = true): Leaf => ({ kind: 'name', text, negated });

/** The whole of the comparison: the tree and its clauses answer alike for every Pokémon either can tell apart. */
function agrees(node: Node, terms: readonly string[]) {
  const clauses = clausesFor(node);

  for (const on of assignments(terms)) {
    expect({ on: [...on].sort(), holds: matches(clauses, on) }).toEqual({
      on: [...on].sort(),
      holds: holds(node, on),
    });
  }
}

test('an any of two alls asks what the arrangement asked', () => {
  // The search the earlier fixed builder could not say at all: a shiny Pikachu or an XXL Pumpkaboo.
  agrees(any(all(yes('shiny'), yes('fire')), all(yes('xxl'), yes('water'))), ['shiny', 'fire', 'xxl', 'water']);
});

test('an all of anys is already what the game takes and comes back saying the same thing', () => {
  agrees(all(any(yes('fire'), yes('water')), any(yes('shiny'), yes('lucky'))), ['fire', 'water', 'shiny', 'lucky']);
});

test('a ruled-out pill inside an any asks what the arrangement asked', () => {
  agrees(any(no('shiny'), yes('lucky')), ['shiny', 'lucky']);
  agrees(all(no('shiny'), yes('lucky')), ['shiny', 'lucky']);
});

test('three groups deep asks what the arrangement asked', () => {
  agrees(all(yes('legendary'), any(all(yes('fire'), no('shiny')), any(yes('xxs'), yes('xxl')), yes('lucky'))), [
    'legendary',
    'fire',
    'shiny',
    'xxs',
    'xxl',
    'lucky',
  ]);
});

test('a pill beside its own negation asks what the arrangement asked, either way round', () => {
  agrees(all(yes('shiny'), no('shiny')), ['shiny']);
  agrees(any(yes('shiny'), no('shiny')), ['shiny']);
});

test('a pill repeated across several groups asks what the arrangement asked', () => {
  agrees(any(all(yes('shiny'), yes('fire')), all(yes('shiny'), yes('water'))), ['shiny', 'fire', 'water']);
});

test('a group with nothing in it asks nothing, wherever it is', () => {
  agrees(all(yes('shiny'), all()), ['shiny']);
  agrees(all(yes('shiny'), any()), ['shiny']);
  agrees(any(yes('shiny'), all()), ['shiny']);

  // An `any` holding an empty group is a group one of whose parts asks nothing, so the whole of it asks nothing.
  expect(clausesFor(any(yes('shiny'), any()))).toEqual([]);
});

test('a pill with nothing written in it yet asks nothing, wherever it is', () => {
  // A span pill is added before it is filled, which is a pill the reader can see and the game cannot be told about.
  const pending: Leaf = { kind: 'range', id: 'cp', from: null, to: null, negated: false };

  expect(clausesFor(all(yes('shiny'), pending))).toEqual(['shiny']);
  expect(clausesFor(any(yes('shiny'), pending))).toEqual([]);

  // A term pill naming nothing in the table is the same answer: a link that rotted past a rename drops the pill it can
  // no longer spell rather than writing a term the game will not match.
  expect(clausesFor(all(yes('shiny'), yes('sparkly')))).toEqual(['shiny']);
});

test('a clause true of everything earns no clause', () => {
  // `(a&b),(!a&c)` spreads to four clauses, and `a,!a` is one of them: every Pokémon is shiny or is not.
  expect(clausesFor(any(all(yes('shiny'), yes('fire')), all(no('shiny'), yes('water'))))).not.toContain('shiny,!shiny');
});

test('a clause offering everything another offers earns no clause of its own', () => {
  expect(clausesFor(all(yes('shiny'), any(yes('shiny'), yes('lucky'))))).toEqual(['shiny']);
  expect(clausesFor(all(any(yes('fire'), yes('water')), any(yes('water'), yes('fire'))))).toEqual(['fire,water']);
});

test('a pill repeated within one clause is one alternative', () => {
  expect(clausesFor(any(any(yes('fire'), yes('water')), any(yes('fire'), yes('grass'))))).toEqual(['fire,water,grass']);
});

test('the clauses keep the order the pills were arranged in', () => {
  expect(clausesFor(all(yes('lucky'), yes('shiny'), yes('costume')))).toEqual(['lucky', 'shiny', 'costume']);
  expect(clausesFor(all(yes('costume'), yes('shiny'), yes('lucky')))).toEqual(['costume', 'shiny', 'lucky']);

  // Including a pill lifted out of an `any`, which takes the place of the first pill the parts did not share rather
  // than the front of the string: a shared pill arranged last is written last.
  expect(clausesFor(any(all(yes('shiny'), yes('fire')), all(yes('shiny'), yes('water'))))).toEqual([
    'shiny',
    'fire,water',
  ]);
  expect(clausesFor(any(all(yes('fire'), yes('shiny')), all(yes('water'), yes('shiny'))))).toEqual([
    'fire,water',
    'shiny',
  ]);
});

test('an empty canvas is a query for everything rather than a broken one', () => {
  expect(clausesOf(all())).toEqual({ clauses: [], error: null, mishandled: [] });
});

/**
 * `count` OR'd pairs of pills unique to `at`, which spread to two to the power of `count` clauses between them.
 *
 * Name pills rather than term pills, because a term pill is written through `terms.js` and an id that table does not
 * carry writes nothing at all — the first draft of this made two hundred pending pills and no clauses, which is a
 * perfectly good answer to a question it was not asking.
 */
const pairs = (count: number, at = 0) =>
  any(
    ...Array.from({ length: count }, (_, index) =>
      all(named(`g${at}a${index}`, false), named(`g${at}b${index}`, false)),
    ),
  );

/** The most OR'd pairs that still fit inside the cap, and so the largest building block a test can lay end to end. */
const UNDER = Math.floor(Math.log2(CLAUSES));

/*
 * A pill shared by every part of an `any` is lifted out of it before the distribution, which is what decides whether
 * a realistic arrangement can be written at all. The truth tables above already cover whether it is *sound* — several
 * of them hold arrangements with a shared pill. What is left to pin is the arithmetic it saves, the shapes it has to
 * leave alone, and that it never changes the answer.
 */

test('a pill every part of an any asks for is written once rather than in every clause', () => {
  // *A shiny Fire, or a shiny Water, or a shiny Grass* — one `any` holding an `all` per type. Said as a product this
  // is two to the power of the types named; said as a sum it is `shiny` and one clause of types.
  const shinyTypes = (count: number) =>
    any(...Array.from({ length: count }, (_, at) => all(yes('shiny'), named(`t${at}`, false))));

  expect(clausesFor(shinyTypes(3))).toEqual(['shiny', 't0,t1,t2']);
  expect(clausesFor(shinyTypes(6))).toEqual(['shiny', 't0,t1,t2,t3,t4,t5']);

  // Ten spread to 1024 clauses unfactored, which is past the cap: the string could not be written at all before.
  expect(clausesFor(shinyTypes(10))).toEqual(['shiny', 't0,t1,t2,t3,t4,t5,t6,t7,t8,t9']);
  expect(clausesFor(shinyTypes(40))).toHaveLength(2);
});

test('a part asking for nothing beyond what is shared is the whole of what the any asks', () => {
  // `any(shiny, all(shiny, fire))` is `shiny`: every other part is shiny and then some.
  expect(clausesFor(any(yes('shiny'), all(yes('shiny'), yes('fire'))))).toEqual(['shiny']);
  expect(clausesFor(any(all(yes('shiny'), yes('lucky')), all(yes('shiny'), yes('lucky'), yes('fire'))))).toEqual([
    'shiny',
    'lucky',
  ]);
});

test('two groups over the same pills are not the same shared part', () => {
  /*
   * `all(a, b)` and `any(a, b)` hold the same pills and ask opposite questions, so what a part asks has to carry the
   * junction as well as the pills. Without it both subgroups below read as one shared part, one of them is lifted and
   * the other thrown away, and the search narrows from `s and (a or b)` to `s and a and b` — a wrong answer rather
   * than a missed reduction, which is why this is a test and not a measurement.
   */
  const tree = any(
    all(yes('shiny'), all(yes('fire'), yes('water'))),
    all(yes('shiny'), any(yes('fire'), yes('water'))),
  );

  agrees(tree, ['shiny', 'fire', 'water']);
  expect(clausesFor(tree)).toEqual(['shiny', 'fire,water']);
});

test('a name that spells a group is not that group', () => {
  /*
   * What a part asks for is compared as text, so a leaf and a group have to be told apart by more than what they say.
   * A reader can type `all(shiny|lucky)` into the name box — only commas are split there, and a shared `#q=` fragment
   * carries arbitrary text too — and that is exactly how `key` spells the subgroup beside it. Read as one shared part,
   * the name is lifted and the subgroup thrown away: `shiny&lucky` stops being asked of the second branch and the
   * literal text is demanded of both instead, which is a different search rather than a missed reduction.
   */
  const spelled = named('all(shiny|lucky)', false);
  const tree = any(all(spelled, yes('fire')), all(all(yes('shiny'), yes('lucky')), yes('water')));

  agrees(tree, ['all(shiny|lucky)', 'shiny', 'lucky', 'fire', 'water']);
  expect(clausesFor(tree)).toEqual([
    'all(shiny|lucky),shiny',
    'all(shiny|lucky),lucky',
    'all(shiny|lucky),water',
    'fire,shiny',
    'fire,lucky',
    'fire,water',
  ]);
});

test('an any with nothing in common is left as the product it is', () => {
  // Nothing to lift, so these are the clauses they always were. That the cap still refuses an `any` this wide is the
  // two tests below, over the OR'd pairs of distinct pills `pairs` builds for exactly that.
  expect(clausesFor(any(all(yes('shiny'), yes('fire')), all(yes('lucky'), yes('water'))))).toEqual([
    'shiny,lucky',
    'shiny,water',
    'fire,lucky',
    'fire,water',
  ]);
});

test('factoring never changes the answer, over every arrangement the sweep can build', () => {
  /*
   * The gate for the whole idea. Factoring rewrites the tree before it is distributed, so what it has to be held to is
   * that the search is the one that was arranged — checked against the truth table, the one oracle here that knows
   * nothing about how either side is computed.
   */
  const pills = [yes('shiny'), yes('lucky'), yes('fire'), no('shiny')];
  const terms = ['shiny', 'lucky', 'fire'];
  let swept = 0;

  for (const one of pills) {
    for (const two of pills) {
      for (const three of pills) {
        for (const four of pills) {
          // Shapes with something in common between the parts, which is what factoring reaches for.
          for (const tree of [
            any(all(one, two), all(three, four)),
            any(all(one, two), all(one, three), all(one, four)),
            all(one, any(all(two, three), all(two, four))),
            any(one, all(two, three), all(two, four)),
            any(all(one, any(two, three)), all(one, four)),
          ]) {
            agrees(tree, terms);
            swept += 1;
          }
        }
      }
    }
  }

  expect(swept).toBe(pills.length ** 4 * 5);
});

test('an arrangement that spreads past the cap is refused rather than built', () => {
  // Derived from the cap rather than transcribed, so a cap moved either way moves both of these with it.
  expect(clausesOf(pairs(UNDER + 1)).error).toContain(String(CLAUSES));
  expect(clausesFor(pairs(UNDER))).toHaveLength(2 ** UNDER);
});

test('the cap bounds the whole tree rather than the one node it is checked in', () => {
  // An `any` multiplies and an `all` sums, so a check inside the product could only ever bound one group. Two groups
  // each inside the cap are over it between them, and twenty of them spread to 10,240 clauses and half a megabyte of
  // query with nothing said about it.
  const groups = (count: number) => all(...Array.from({ length: count }, (_, at) => pairs(UNDER, at)));

  expect(clausesFor(groups(1))).toHaveLength(2 ** UNDER);

  for (const count of [2, 20]) {
    const { clauses, error } = clausesOf(groups(count));

    expect({ count, clauses, says: error?.includes(String(CLAUSES)) }).toEqual({ count, clauses: [], says: true });
  }
});

/*
 * The terms the game mishandles behind a `!`. Nothing between the canvas and the string manufactures a negation — the
 * pills carry their own and the reductions only ever drop things — so one of these arrives only as a name a reader
 * typed and turned round themselves. They are named anyway, this page's output ending up in a mass transfer.
 */

test('a negation the game ignores is named, however the number was spelled', () => {
  for (const term of ['1hp', '4attack', '3-defense', '-1attack', '0-2hp']) {
    expect(clausesOf(all(named(term), yes('shiny'))).mishandled).toEqual([
      { term: `!${term}`, note: expect.stringContaining('ignores a negation') },
    ]);
  }
});

test('a negated mega level is named for answering with less than it was asked for', () => {
  expect(clausesOf(all(named('mega2'), yes('shiny'))).mishandled).toEqual([
    { term: '!mega2', note: expect.stringContaining('Mega Evolve') },
  ]);
});

test('the same term is named once however many clauses it reached', () => {
  expect(clausesOf(any(all(named('1hp'), yes('shiny')), all(named('1hp'), yes('lucky')))).mishandled).toEqual([
    { term: '!1hp', note: expect.stringContaining('ignores a negation') },
  ]);
});

test('a term the game reads properly is not named, negated or otherwise', () => {
  const cases: Node[] = [
    all(named('1hp', false), yes('shiny')),
    all(no('shiny'), named('1hp', false)),
    all(named('hp100-500')),
    all(no('megaevolve')),
    all(named('attack')),
    all(named('5hp')),
    all(named('1spd')),
  ];

  for (const [at, node] of cases.entries()) {
    expect({ at, mishandled: clausesOf(node).mishandled }).toEqual({ at, mishandled: [] });
  }
});

test('a negation the composed string does not carry is not named', () => {
  /*
   * The distribution writes a `!1hp` in both of these and then throws away the clause holding it — the first as a
   * clause true of everything, the second as one `shiny` already covers. Naming it anyway put "`!1hp` — the game
   * ignores a negation on an IV term" beside a string with no `!1hp` anywhere in it, which is the opposite of what the
   * page says these notes are for.
   */
  // `1hp , (!1hp & legendary)` spreads to `1hp,!1hp` and `1hp,legendary`; the first is true of everything and goes,
  // and with it the only clause that held the negation.
  expect(clausesOf(any(named('1hp', false), all(named('1hp'), yes('legendary'))))).toEqual({
    clauses: ['1hp,legendary'],
    error: null,
    mishandled: [],
  });

  expect(clausesOf(all(yes('shiny'), any(yes('shiny'), named('1hp'))))).toEqual({
    clauses: ['shiny'],
    error: null,
    mishandled: [],
  });

  // The same term in a clause that does survive is still named, so this has not simply turned the warning off.
  expect(clausesOf(all(yes('shiny'), any(yes('lucky'), named('1hp')))).mishandled).toEqual([
    { term: '!1hp', note: expect.stringContaining('ignores a negation') },
  ]);
});
