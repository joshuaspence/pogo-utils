/**
 * Whether the clauses say what the brackets said.
 *
 * That is the one thing worth proving here, and pinning output strings barely touches it: `(a&b),(c&d)` has a right
 * answer four clauses long, and a reader comparing it against a literal in a test file is checking a transcription
 * rather than the arithmetic. So the cases below are built as *trees*, written out two ways — as a fully bracketed
 * string for `expand` and as a predicate the test evaluates itself — and the two are compared over every assignment of
 * the terms in them. One assertion then covers De Morgan, the distribution, the absorption and the clause that asks
 * nothing, and it goes on covering them when any of those is rewritten.
 *
 * `show` brackets every part it writes, which is deliberate: the oracle is then true whichever way the game binds, so
 * the comparison is about the conversion alone. The precedence this file reads an *unbracketed* string with is its own
 * claim and gets its own tests, below the truth tables.
 *
 * Nothing here is derived from `terms.js`, the expression box taking the reader's own text rather than a choice off a
 * table. Real terms are used all the same, since a case that reads as a search is a case worth checking.
 */

import { expect, test } from 'vitest';

import { CLAUSES, expand } from './expression.js';

/** A search as the test means it, before either of the two ways of writing it below. */
type Tree = string | { all: readonly Tree[] } | { any: readonly Tree[] } | { not: Tree };

/**
 * The tree as an expression, with every part in brackets of its own. Over-bracketing is what keeps this honest: a
 * writer that leaned on a precedence would be asking `expand` to agree with it about the thing under test.
 */
function show(tree: Tree): string {
  if (typeof tree === 'string') {
    return tree;
  }

  if ('not' in tree) {
    return `!(${show(tree.not)})`;
  }

  const parts = 'all' in tree ? tree.all : tree.any;

  return parts.map((part) => `(${show(part)})`).join('all' in tree ? '&' : ',');
}

/** The tree as the question it asks of one Pokémon, which is the set of terms that are true of it. */
function holds(tree: Tree, on: ReadonlySet<string>): boolean {
  if (typeof tree === 'string') {
    return on.has(tree);
  }

  if ('not' in tree) {
    return !holds(tree.not, on);
  }

  return 'all' in tree ? tree.all.every((part) => holds(part, on)) : tree.any.some((part) => holds(part, on));
}

/**
 * The same question asked of the clauses, read the way the game reads them: every clause has to be satisfied, and a
 * clause is satisfied by any one of its alternatives. No clauses at all is a search for everything, which is what the
 * `.every` of an empty list says and what a bracket that asked nothing reduces to.
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

/** The clauses `expand` makes of a tree, having refused to make any being a failure rather than an answer. */
function clausesOf(expression: string) {
  const { clauses, error } = expand(expression);

  expect(error).toBeNull();

  return clauses;
}

/** The whole of the comparison: the tree and its clauses answer alike for every Pokémon either can tell apart. */
function agrees(tree: Tree, terms: readonly string[]) {
  const clauses = clausesOf(show(tree));

  for (const on of assignments(terms)) {
    expect({ on: [...on].sort(), holds: matches(clauses, on) }).toEqual({
      on: [...on].sort(),
      holds: holds(tree, on),
    });
  }
}

test('an OR of two bracketed ANDs asks what the brackets asked', () => {
  // The example `pkgosearch.com` leads with, and the search the chips on this page cannot say between them at all.
  agrees({ any: [{ all: ['pikachu', 'shiny'] }, { all: ['pumpkaboo', 'xxl'] }] }, [
    'pikachu',
    'shiny',
    'pumpkaboo',
    'xxl',
  ]);
});

test('a negated bracket of alternatives asks what the brackets asked', () => {
  agrees({ all: ['legendary', { not: { any: ['shiny', 'lucky'] } }] }, ['legendary', 'shiny', 'lucky']);
});

/*
 * De Morgan cuts both ways and each way is its own line of the parser, so each wants a case of its own. A negated `all`
 * is only reached where nothing has already cancelled the `!` — nested inside another negation, the flag is turned over
 * twice and the ampersand below it is read unnegated, which is how this went untested the first time round.
 */

test('a negated bracket of requirements asks what the brackets asked', () => {
  agrees({ all: ['legendary', { not: { all: ['shiny', 'lucky'] } }] }, ['legendary', 'shiny', 'lucky']);
});

test('negations nested three deep ask what the brackets asked', () => {
  agrees({ not: { any: [{ not: { all: ['shadow', 'star4'] } }, 'costume'] } }, ['shadow', 'star4', 'costume']);
});

test('an OR of three ANDs asks what the brackets asked', () => {
  agrees(
    {
      any: [
        { all: ['fire', 'shiny'] },
        { all: ['water', { not: 'shiny' }] },
        { all: ['grass', { any: ['xxs', 'xxl'] }] },
      ],
    },
    ['fire', 'water', 'grass', 'shiny', 'xxs', 'xxl'],
  );
});

test('an AND of ORs is already what the game takes and comes back saying the same thing', () => {
  agrees({ all: [{ any: ['fire', 'water'] }, { any: ['shiny', 'lucky'] }] }, ['fire', 'water', 'shiny', 'lucky']);
});

test('a term beside its own negation asks what the brackets asked, either way round', () => {
  agrees({ all: ['shiny', { not: 'shiny' }] }, ['shiny']);
  agrees({ any: ['shiny', { not: 'shiny' }] }, ['shiny']);
});

test('a term repeated in several brackets asks what the brackets asked', () => {
  agrees({ any: [{ all: ['shiny', 'fire'] }, { all: ['shiny', 'water'] }] }, ['shiny', 'fire', 'water']);
});

test('a clause true of everything earns no clause', () => {
  // `(a&b),(!a&c)` spreads to four clauses, and `a,!a` is one of them: every Pokémon is shiny or is not.
  expect(clausesOf('(shiny&fire),(!shiny&water)')).not.toContain('shiny,!shiny');
});

test('a clause offering everything another offers earns no clause of its own', () => {
  expect(clausesOf('shiny&(shiny,lucky)')).toEqual(['shiny']);
  expect(clausesOf('(fire,water)&(water,fire)')).toEqual(['fire,water']);
});

test('a term repeated within one clause is one alternative', () => {
  expect(clausesOf('(fire,water),(fire,grass)')).toEqual(['fire,water,grass']);
});

/*
 * The precedence below is this file's own claim rather than something the game will confirm, and it is the claim
 * `query.js` already makes by writing `fire,water&shiny` for a shiny that is Fire or Water. These pin the two to each
 * other: a comma binds tighter, so an unbracketed string arrives as clauses and leaves as the same ones.
 */

test('a comma binds tighter than an ampersand', () => {
  expect(clausesOf('shiny&fire,water')).toEqual(['shiny', 'fire,water']);
  expect(clausesOf('(shiny&fire),water')).toEqual(['shiny,water', 'fire,water']);
});

test('a string the builder itself writes comes back as the clauses it was', () => {
  expect(clausesOf('pikachu&shiny&lucky&fire,water&1-151')).toEqual([
    'pikachu',
    'shiny',
    'lucky',
    'fire,water',
    '1-151',
  ]);
});

test('brackets that change nothing change nothing', () => {
  expect(clausesOf('((shiny))&(((fire,water)))')).toEqual(['shiny', 'fire,water']);
});

test("the game's other two OR separators are read as the comma they stand for", () => {
  expect(clausesOf('fire:water;grass')).toEqual(['fire,water,grass']);
});

test('a term keeps the punctuation the game reads it by', () => {
  expect(clausesOf('4*&@special&+charmander&1-151&#&!xxs')).toEqual([
    '4*',
    '@special',
    '+charmander',
    '1-151',
    '#',
    '!xxs',
  ]);
});

test('a term is trimmed and lowercased, as the game reads it and the chips write it', () => {
  expect(clausesOf('(  Pikachu  &  SHINY  ) , Eevee')).toEqual(['pikachu,eevee', 'shiny,eevee']);
});

test('the clauses keep the order they were written in', () => {
  expect(clausesOf('lucky&shiny&costume')).toEqual(['lucky', 'shiny', 'costume']);
  expect(clausesOf('costume&shiny&lucky')).toEqual(['costume', 'shiny', 'lucky']);
});

test('an empty box is no expression rather than a broken one', () => {
  for (const text of ['', '   ', '\n']) {
    expect(expand(text)).toEqual({ clauses: [], error: null, mishandled: [] });
  }
});

/*
 * What is refused. Each of these would otherwise contribute no clause and say nothing about it, which writes a broader
 * search than was asked for — the direction that costs a shiny its candy when the string reaches a mass transfer.
 */

test('an expression that does not parse is refused rather than dropped', () => {
  for (const text of ['(shiny', 'shiny)', 'shiny&', '&shiny', 'shiny,,lucky', '!', '()']) {
    const { clauses, error } = expand(text);

    expect({ text, clauses, broken: error !== null }).toEqual({ text, clauses: [], broken: true });
  }
});

test('an unclosed bracket and an unopened one are told apart', () => {
  expect(expand('(shiny').error).toContain('`(`');
  expect(expand('shiny)').error).toContain('`)`');
});

test('`|` is refused rather than read as either of the two things it is taken for', () => {
  const { clauses, error } = expand('shiny|lucky');

  expect(clauses).toEqual([]);
  expect(error).toContain('`|`');
});

test('an expression that spreads past the cap is refused rather than built', () => {
  // The smallest number of OR'd pairs whose product is past the cap, so a cap moved either way moves these two with it.
  const over = Math.floor(Math.log2(CLAUSES)) + 1;
  const pairs = (count: number) => Array.from({ length: count }, (_, index) => `(a${index}&b${index})`).join(',');

  expect(expand(pairs(over)).error).toContain(String(CLAUSES));
  expect(clausesOf(pairs(over - 1))).toHaveLength(2 ** (over - 1));
});

/*
 * The terms the game mishandles behind a `!`. They matter here and not elsewhere on the page because this is the only
 * thing that writes one the reader never typed: `!(1hp,shiny)` is where `!1hp` comes from.
 */

test('a negation the game ignores is named, however the number was spelled', () => {
  for (const term of ['1hp', '4attack', '3-defense', '-1attack', '0-2hp']) {
    expect(expand(`!(${term},shiny)`).mishandled).toEqual([
      { term: `!${term}`, note: expect.stringContaining('ignores a negation') },
    ]);
  }
});

test('a negated mega level is named for answering with less than it was asked for', () => {
  expect(expand('!(mega2,shiny)').mishandled).toEqual([
    { term: '!mega2', note: expect.stringContaining('Mega Evolve') },
  ]);
});

test('the same term is named once however many clauses it reached', () => {
  expect(expand('!(1hp,shiny),!(1hp,lucky)').mishandled).toEqual([
    { term: '!1hp', note: expect.stringContaining('ignores a negation') },
  ]);
});

test('a term the game reads properly is not named, negated or otherwise', () => {
  for (const text of ['1hp&shiny', '!shiny&1hp', '!hp100-500', '!megaevolve', '!attack', '!5hp', '!1spd']) {
    expect({ text, mishandled: expand(text).mishandled }).toEqual({ text, mishandled: [] });
  }
});

test('a negation turned over twice is no negation and is not named', () => {
  expect(expand('!(!1hp)').mishandled).toEqual([]);
  expect(clausesOf('!(!1hp)')).toEqual(['1hp']);
});
