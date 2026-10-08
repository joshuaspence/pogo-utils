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

import { CLAUSES, NESTING, expand } from './expression.js';

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

test('a token with nowhere to go is named for what it is, rather than blamed on a bracket', () => {
  // Every parenthesis in `(shiny,lucky)(fire,water)` is paired. What is missing is the operator between the two groups,
  // and a reader expecting one group beside another to mean AND — as several search syntaxes do — was being pointed at
  // a `)` that was perfectly fine and told nothing about the `&`.
  for (const text of ['(shiny,lucky)(fire,water)', '(shiny)lucky', 'shiny!lucky']) {
    expect({ text, error: expand(text).error }).toEqual({ text, error: expect.stringContaining('`&`') });
  }

  expect(expand('(shiny)lucky').error).toContain('`lucky`');
  expect(expand('shiny!lucky').error).toContain('`!`');

  // The stray closing bracket keeps the message that is true of it, which is the case the pair above tells apart.
  expect(expand('shiny)').error).not.toContain('`&`');
});

test('a tree deeper than the limit is refused in words rather than by the stack', () => {
  // A `!` and a `(` each turn through `literal`, so each counts. Ten thousand of either came back as V8's own
  // `Maximum call stack size exceeded`, which was then rendered to the reader as the reason Copy was refused.
  const nested = (count: number) => '('.repeat(count) + 'shiny' + ')'.repeat(count);

  for (const text of ['!'.repeat(NESTING + 1) + 'shiny', nested(NESTING + 1), '!'.repeat(10_000) + 'shiny']) {
    expect(expand(text).error).toContain(String(NESTING));
  }

  // One shy of the limit still reads, so it is not quietly refusing anything a reader could have meant. An even number
  // of negations is none, which is the same cancelling the double negative above is tested on.
  expect(clausesOf('!'.repeat(NESTING) + 'shiny')).toEqual(['shiny']);
  expect(clausesOf(nested(NESTING))).toEqual(['shiny']);
});

test('`|` is refused rather than read as either of the two things it is taken for', () => {
  const { clauses, error } = expand('shiny|lucky');

  expect(clauses).toEqual([]);
  expect(error).toContain('`|`');
});

/** `count` OR'd pairs of terms unique to `group`, which spread to two to the power of `count` clauses between them. */
const pairs = (count: number, group = 0) =>
  Array.from({ length: count }, (_, index) => `(g${group}a${index}&g${group}b${index})`).join(',');

/** The most OR'd pairs that still fit inside the cap, and so the largest building block a test can lay end to end. */
const UNDER = Math.floor(Math.log2(CLAUSES));

test('an expression that spreads past the cap is refused rather than built', () => {
  // Derived from the cap rather than transcribed, so a cap moved either way moves both of these with it.
  expect(expand(pairs(UNDER + 1)).error).toContain(String(CLAUSES));
  expect(clausesOf(pairs(UNDER))).toHaveLength(2 ** UNDER);
});

test('the cap bounds the whole tree rather than the one node it is checked in', () => {
  // An `any` multiplies and an `all` sums, so a check inside the product could only ever bound one group. Two groups
  // each inside the cap are over it between them, and twenty of them spread to 10,240 clauses and half a megabyte of
  // query with nothing said about it.
  const groups = (count: number) => Array.from({ length: count }, (_, group) => `(${pairs(UNDER, group)})`).join('&');

  expect(clausesOf(groups(1))).toHaveLength(2 ** UNDER);

  for (const count of [2, 20]) {
    const { clauses, error } = expand(groups(count));

    expect({ count, clauses, says: error?.includes(String(CLAUSES)) }).toEqual({ count, clauses: [], says: true });
  }
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

test('a negation the composed string does not carry is not named', () => {
  /*
   * The distribution writes a `!1hp` in both of these and then throws away the clause holding it — the first as a
   * clause true of everything, the second as one `shiny` already covers. Naming it anyway put "`!1hp` — the game
   * ignores a negation on an IV term" beside a string with no `!1hp` anywhere in it, which is the opposite of what
   * `search.tsx` says these notes are for: *what is worth warning about is what the string ended up saying*.
   */
  expect(expand('legendary,!(legendary&1hp)')).toEqual({ clauses: [], error: null, mishandled: [] });
  expect(expand('shiny&(shiny,!1hp)')).toEqual({ clauses: ['shiny'], error: null, mishandled: [] });

  // The same term in a clause that does survive is still named, so this has not simply turned the warning off.
  expect(expand('shiny&(lucky,!1hp)').mishandled).toEqual([
    { term: '!1hp', note: expect.stringContaining('ignores a negation') },
  ]);
});
