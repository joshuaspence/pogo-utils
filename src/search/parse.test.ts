/**
 * A typed query read back into an arrangement.
 *
 * Two things are worth proving and they pull in opposite directions. One is that what a reader types means what they
 * meant — checked against a truth table, since a parse that quietly reads `a&b,c` the other way round is a wrong
 * search rather than a broken one. The other is that the page can read its *own* output: a string this page wrote,
 * pasted back in, must lay out as pills that compose the same string, or the two halves disagree about the one
 * language they share.
 *
 * The second is a sweep rather than a handful of cases, because it is the kind of agreement that holds for the shapes
 * someone thought of.
 */

import { expect, test } from 'vitest';

import { clausesOf } from './clauses.js';
import { read } from './parse.js';
import { GROUPS, RANGES, TERMS_BY_ID } from './terms.js';
import { group, isGroup, leafText, NESTING, type Leaf, type Node } from './tree.js';

const yes = (id: string): Leaf => ({ kind: 'term', id, negated: false });
const no = (id: string): Leaf => ({ kind: 'term', id, negated: true });
const named = (text: string): Leaf => ({ kind: 'name', text, negated: false });
const all = (...parts: Node[]) => group('all', parts);
const any = (...parts: Node[]) => group('any', parts);

/** A tree said in the shape a failure can be read in. */
const shape = (node: Node): unknown =>
  isGroup(node) ? { [node.junction]: node.parts.map(shape) } : (leafText(node) ?? '…');

/** The tree a query describes, having described none being a failure rather than an answer. */
function treeFor(text: string): Node {
  const { tree, error } = read(text);

  expect({ text, error }).toEqual({ text, error: null });

  if (tree === null) {
    throw new Error(`\`${text}\` read as nothing`);
  }

  return tree;
}

/** What a typed query composes to, which is the whole point of typing one. */
const stringFor = (text: string) => clausesOf(treeFor(text)).clauses.join('&');

/** The question a tree asks of one Pokémon, for the truth tables below. */
function holds(node: Node, on: ReadonlySet<string>): boolean {
  if (!isGroup(node)) {
    return node.kind === 'term' ? on.has(node.id) !== node.negated : on.has(leafText(node) ?? '') !== node.negated;
  }

  if (node.parts.length === 0) {
    return true;
  }

  return node.junction === 'all'
    ? node.parts.every((part) => holds(part, on))
    : node.parts.some((part) => holds(part, on));
}

/** Every set of terms that could be true of one Pokémon. */
function* assignments(terms: readonly string[]) {
  for (let bits = 0; bits < 2 ** terms.length; bits += 1) {
    yield new Set(terms.filter((_, index) => (bits >> index) % 2 === 1));
  }
}

/** The typed query and the arrangement it is meant to describe answer alike for every Pokémon either can tell apart. */
function means(text: string, meant: Node, terms: readonly string[]) {
  const tree = treeFor(text);

  for (const on of assignments(terms)) {
    expect({ text, on: [...on].sort(), holds: holds(tree, on) }).toEqual({
      text,
      on: [...on].sort(),
      holds: holds(meant, on),
    });
  }
}

test('the search the brackets describe is the search that lands on the canvas', () => {
  // The one this is for: a shiny Pikachu or an XXL Pumpkaboo, which the canvas can hold and the game cannot be told.
  means(
    '(pikachu&shiny),(pumpkaboo&xxl)',
    any(all(named('pikachu'), yes('shiny')), all(named('pumpkaboo'), yes('xxl'))),
    ['pikachu', 'shiny', 'pumpkaboo', 'xxl'],
  );

  expect(stringFor('(pikachu&shiny),(pumpkaboo&xxl)')).toBe('pikachu,pumpkaboo&pikachu,xxl&shiny,pumpkaboo&shiny,xxl');
});

test('a comma binds tighter than an ampersand, which is the game’s own rule', () => {
  /*
   * The phrase list resolves it "by always considering `,`s nested inside `&`s". Reading it the other way round would
   * be a wrong search rather than a broken one, so this is the assertion that catches a parser written to the habits
   * of every other language instead.
   */
  means('shiny&fire,water', all(yes('shiny'), any(yes('fire'), yes('water'))), ['shiny', 'fire', 'water']);
  means('(shiny&fire),water', any(all(yes('shiny'), yes('fire')), yes('water')), ['shiny', 'fire', 'water']);

  expect(stringFor('shiny&fire,water')).toBe('shiny&fire,water');
});

test('every spelling of the two operators is read the way the game reads it', () => {
  // "`&` or `|` — AND combination", "`,` or `;` or `:` — OR combination". An earlier text box here refused `|`.
  for (const text of ['shiny&lucky', 'shiny|lucky']) {
    expect(stringFor(text)).toBe('shiny&lucky');
  }

  for (const text of ['fire,water', 'fire;water', 'fire:water']) {
    expect(stringFor(text)).toBe('fire,water');
  }
});

test('a negation is pushed onto the pills, which is the only shape the canvas can draw', () => {
  // `tree.js` has no negated group, so a negated bracket has to arrive as the other junction with its pills turned.
  expect(shape(treeFor('!(shiny,lucky)'))).toEqual({ all: ['!shiny', '!lucky'] });
  expect(shape(treeFor('!(shiny&lucky)'))).toEqual({ any: ['!shiny', '!lucky'] });
  expect(shape(treeFor('!!shiny'))).toEqual({ all: ['shiny'] });

  means('legendary&!(shiny,lucky)', all(yes('legendary'), all(no('shiny'), no('lucky'))), [
    'legendary',
    'shiny',
    'lucky',
  ]);
});

test('a word the catalogue knows arrives as its own pill rather than as a name', () => {
  // Which is what makes the chip above it light up, and what gives the pill its category's colour.
  expect(TERMS_BY_ID.get('shiny')?.term).toBe('shiny');
  expect(TERMS_BY_ID.get('star4')?.term).toBe('4*');

  const tree = treeFor('shiny&4*&pikachu');

  expect(isGroup(tree) && tree.parts.map((part) => (isGroup(part) ? 'group' : part.kind))).toEqual([
    'term',
    'term',
    'name',
  ]);

  // Case is the game's to ignore, so a term is matched either way — and a name keeps the case it was typed in.
  expect(shape(treeFor('SHINY&Pikachu'))).toEqual({ all: ['shiny', 'Pikachu'] });
});

test('a span arrives as the range pill it is', () => {
  const cp = RANGES.find((range) => range.id === 'cp');

  expect(cp?.prefix).toBe('cp');

  const tree = treeFor('cp1500-3000');

  expect(isGroup(tree) && tree.parts[0]).toEqual({ kind: 'range', id: 'cp', from: 1500, to: 3000, negated: false });
  expect(stringFor('cp1500-3000')).toBe('cp1500-3000');

  // One number is a span whose ends meet, which is how the game reads a bare `{phrase}{N}`.
  const one = treeFor('hp100');

  expect(isGroup(one) && one.parts[0]).toEqual({ kind: 'range', id: 'hp', from: 100, to: 100, negated: false });

  /*
   * An open end arrives as the empty box it is, rather than as the limit the table could have filled it with. That is
   * the reading the round trip below needs — a `cp3000-` read as `cp3000-5000` would compose back spelled the other
   * way — and it is also what the reader sees, the box staying empty for them to fill.
   *
   * The dash is what makes an end open, so a bare number is still both bounds: `hp100` above, not `hp100-`.
   */
  const pills = Object.fromEntries(
    ['cp3000-', 'cp-1500', '-151'].map((text) => {
      const tree = treeFor(text);

      return [text, isGroup(tree) ? tree.parts[0] : null];
    }),
  );

  expect(pills).toEqual({
    'cp3000-': { kind: 'range', id: 'cp', from: 3000, to: null, negated: false },
    'cp-1500': { kind: 'range', id: 'cp', from: null, to: 1500, negated: false },

    // The dex's own prefix is empty, so a leading dash is the whole of what marks this one as a span at all.
    '-151': { kind: 'range', id: 'dex', from: null, to: 151, negated: false },
  });
});

test('a bare span that a generation chip already spells arrives as that chip', () => {
  // `1-151` is both the Gen 1 term and a dex span, and the two write the same string — so the pill that says *Gen 1*
  // is the better of the two to draw. Anything the table does not spell falls through to the dex range.
  const gen1 = GROUPS.find((one) => one.id === 'generation')?.terms[0];

  expect(gen1?.term).toBe('1-151');

  const asTerm = treeFor('1-151');

  expect(isGroup(asTerm) && asTerm.parts[0]).toEqual({ kind: 'term', id: gen1?.id, negated: false });

  const asRange = treeFor('1-100');

  expect(isGroup(asRange) && asRange.parts[0]).toEqual({ kind: 'range', id: 'dex', from: 1, to: 100, negated: false });
});

test('a typed span is bounded by the range, so it is a pill the number boxes could have made', () => {
  /*
   * The bounds reach a `<input type="number" max="…">` and a link the page writes, so a pill outside the range's limits
   * is one the rest of the page cannot hold — and the value then moves under the reader, `cp99999` composing itself and
   * its own link reading back as `cp5000`. The last row is the sharp one: `Number` on a long enough digit run is a
   * float, and `1e+21` went into the search box as a term the game cannot read at all.
   */
  for (const [typed, written] of [
    ['cp99999', 'cp5000'],
    ['cp0-99999', 'cp0-5000'],
    ['2020', '1025'],
    ['year5', 'year2016'],
    ['1000000000000000000000', '1025'],
  ] as const) {
    expect({ typed, written: stringFor(typed), again: stringFor(stringFor(typed)) }).toEqual({
      typed,
      written,
      again: written,
    });
  }
});

test('a family shorthand and a tag stay the text the game reads', () => {
  expect(stringFor('+charmander&@special&#')).toBe('+charmander&@special&#');
  expect(stringFor('!#')).toBe('!#');
});

test('an empty box is nothing to put on the canvas and nothing wrong', () => {
  for (const text of ['', '   ', '\n']) {
    expect(read(text)).toEqual({ tree: null, error: null });
  }
});

test('a query that does not parse is refused, and says which thing is wrong', () => {
  for (const text of ['(shiny', 'shiny)', 'shiny&', '&shiny', 'shiny,,lucky', '!', '()']) {
    const { tree, error } = read(text);

    expect({ text, tree, broken: error !== null }).toEqual({ text, tree: null, broken: true });
  }

  expect(read('(shiny').error).toContain('`(`');
  expect(read('shiny)').error).toContain('`)`');

  // Every parenthesis in this one is paired; what is missing is the operator between the two groups.
  expect(read('(shiny,lucky)(fire,water)').error).toContain('`&`');
  expect(read(`${'('.repeat(NESTING + 1)}shiny`).error).toContain(String(NESTING));
});

/**
 * Every tree of up to `size` nodes over a few pills and both junctions, for the round trip below.
 *
 * One of the names carries punctuation, because a name is the one pill whose text a reader writes: the box splits on
 * commas and leaves the rest alone, so a dot and a space are as ordinary in one as a letter. What none of them carries
 * is the game's own punctuation, which is the boundary the test after the sweep draws.
 *
 * All three shapes of span are here. An open end is the one that writes a character the reader below also reads as
 * punctuation, so it is the shape where the two halves are most easily made to disagree: a bound filled in on the way
 * in comes back out spelled the other way round, and the fixed point is what catches that.
 */
function* trees(size: number): Generator<Node> {
  if (size <= 1) {
    yield yes('shiny');
    yield no('lucky');
    yield named('pikachu');
    yield named('Mr. Mime');
    yield { kind: 'range', id: 'cp', from: 1500, to: 3000, negated: false };
    yield { kind: 'range', id: 'cp', from: 3000, to: null, negated: false };
    yield { kind: 'range', id: 'hp', from: null, to: 100, negated: false };
    return;
  }

  for (const junction of ['all', 'any'] as const) {
    for (const one of trees(size - 1)) {
      for (const two of trees(1)) {
        yield group(junction, [one, two]);
      }
    }
  }
}

test('every string this page writes out of readable pills, it reads back into the same string', () => {
  /*
   * The agreement that matters: the composer and the reader share one language, so a reader who copies the page's own
   * output and pastes it back gets the search they had. It is also the honest test of the precedence — the composer
   * writes on the assumption a comma binds tighter, and the reader would have to make the same assumption to agree.
   *
   * *Readable* pills is the whole of the qualification, and the test below is what it means: these are the pills a
   * typed query can hand back, so the property is a fixed point rather than a promise about every tree the canvas can
   * hold.
   */
  let swept = 0;

  for (const tree of trees(4)) {
    const written = clausesOf(tree).clauses.join('&');

    if (written === '') {
      continue;
    }

    expect({ written, again: stringFor(written) }).toEqual({ written, again: written });
    swept += 1;
  }

  // Derived from the generator's shape rather than transcribed, and exact rather than a floor: a tree of four nodes is
  // either junction over a tree of three and a pill, and every pill here writes something, so `8 * pills⁴` is the whole
  // sweep. A generator that quietly stopped yielding would otherwise read as a pass.
  expect(swept).toBe(8 * [...trees(1)].length ** 4);
});

test('a name holding the page’s own punctuation is where the round trip stops, and it says so', () => {
  /*
   * The name box splits on commas and leaves the rest alone, so a reader can put anything else in a name — including
   * the characters this page gives a meaning the game does not have. The game has no brackets at all, so `Mr. Mime
   * (shiny)` is a perfectly good name to send it and a string this reader cannot take back; `|` is the game's own
   * second spelling of `&`, so a name holding one comes back as the two pills it asks for.
   *
   * Which is why the sweep above is over the pills a typed query returns: none of them holds any of this, and the
   * property is false of the ones that do rather than merely untested. A refusal a reader can act on is the answer
   * here — the alternative is a quoting syntax the game would not read.
   */
  const trip = (text: string) => {
    const written = clausesOf(all(named(text))).clauses.join('&');
    const { tree, error } = read(written);

    return { written, again: tree === null ? error : clausesOf(tree).clauses.join('&') };
  };

  for (const text of ['Mr. Mime', 'Farfetch’d', "Farfetch'd", 'a=b', 'a*b', '4 star', '+charmander']) {
    expect(trip(text)).toEqual({ written: text, again: text });
  }

  expect(trip('Mr. Mime (shiny)').again).toContain('`&`');
  expect(trip('!!!').again).toContain('where a term was expected');
  expect(trip('a|b')).toEqual({ written: 'a|b', again: 'a&b' });
  expect(trip('a;b')).toEqual({ written: 'a;b', again: 'a,b' });
});
