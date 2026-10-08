/**
 * What the page composes, and a link out and back in.
 *
 * A fragment is the one thing here a stranger writes, so most of this is about what arrives: a token that names no
 * term, an arity claiming more parts than there are, a nesting deeper than the stack would survive. The round trip
 * itself is swept rather than sampled — the encoding is a token stream with no brackets to match, which is exactly the
 * kind of thing that is right for the trees someone thought of.
 */

import { expect, test } from 'vitest';

import { compose, emptyState, fromFragment, nameFragment, names, presetTree, toFragment, type State } from './query.js';
import { group, isGroup, leafText, NESTING, nodeAt, type Leaf, type Node } from './tree.js';
import { PRESETS, RANGES, TERMS_BY_ID } from './terms.js';

const yes = (id: string): Leaf => ({ kind: 'term', id, negated: false });
const no = (id: string): Leaf => ({ kind: 'term', id, negated: true });
const named = (text: string): Leaf => ({ kind: 'name', text, negated: false });
const all = (...parts: Node[]) => group('all', parts);
const any = (...parts: Node[]) => group('any', parts);

/** A state as the page would have it, with only the part a test is about spelled out. */
const state = (tree: Node, optimise = false): State => ({ ...emptyState(), tree, optimise });

/** The round trip as the page makes it: write the link, then read it back the way the browser hands it over. */
const roundTrip = (chosen: State) => fromFragment(`#${toFragment(chosen)}`);

/** A tree said in the shape a failure can be read in. */
const shape = (node: Node): unknown =>
  isGroup(node) ? { [node.junction]: node.parts.map(shape) } : (leafText(node) ?? '…');

test('the clauses of the tree, joined, are the string', () => {
  // One `&` between clauses and nothing else: the game's search is a conjunction, and an arrangement in this form is
  // a list of its terms.
  expect(compose(state(all(yes('shiny')))).query).toBe('shiny');
  expect(compose(state(all(yes('shiny'), yes('lucky')))).query).toBe('shiny&lucky');
  expect(compose(state(all(yes('shiny'), any(yes('fire'), yes('water'))))).query).toBe('shiny&fire,water');

  const spread = compose(state(any(all(named('pikachu'), yes('shiny')), all(named('pumpkaboo'), yes('xxl')))));

  // The search the earlier fixed builder could not say at all, as the four clauses the game will take for it.
  expect(spread.query).toBe('pikachu,pumpkaboo&pikachu,xxl&shiny,pumpkaboo&shiny,xxl');
  expect(spread.clauses).toBe(4);
});

test('an empty canvas composes nothing at all', () => {
  expect(compose(emptyState()).query).toBe('');
  expect(compose(state(all(any(), all()))).query).toBe('');
});

test('a comma binds tighter than an ampersand, which is the one thing the string is read against', () => {
  /*
   * Stated rather than proved — Niantic's list never combines the two operators in an example — and the page no longer
   * warns about it, a warning that would be on for every arrangement holding an `any` being furniture. So it is pinned
   * here instead: an `any` nested in the root composes one clause of alternatives, and that is only the search the
   * canvas drew if the comma binds first.
   */
  expect(compose(state(all(yes('shiny'), any(yes('fire'), yes('water'))))).query).toBe('shiny&fire,water');
  expect(compose(state(all(yes('shiny'), yes('lucky')))).query).toBe('shiny&lucky');
  expect(compose(state(any(yes('fire'), yes('water')))).query).toBe('fire,water');
});

test('a query too wide to write says so and composes nothing', () => {
  const wide = any(...Array.from({ length: 11 }, (_, at) => all(named(`a${at}`), named(`b${at}`))));
  const broken = compose(state(wide));

  expect(broken.query).toBe('');
  expect(broken.error).not.toBeNull();
  expect(compose(state(all(yes('shiny')))).error).toBeNull();
});

test('the one preset is everything it names, ruled out', () => {
  const [preset] = PRESETS;

  if (!preset) {
    throw new Error('`terms.js` carries no presets');
  }

  expect(preset.exclude?.length).toBeGreaterThan(0);

  // Every id it names is a real term, which is what makes the string below the preset's own doing rather than a typo's.
  expect((preset.exclude ?? []).filter((id) => !TERMS_BY_ID.has(id))).toEqual([]);

  const tree = presetTree(preset);

  expect(isGroup(tree) && tree.junction).toBe('all');
  expect(
    compose(state(tree))
      .query.split('&')
      .every((clause) => clause.startsWith('!')),
  ).toBe(true);
});

test("the Pokédex's link into this page arrives as the one name it asked for", () => {
  /*
   * `pokedex.tsx` offers *Search for it* and *Search its family*, and it used to build `t=` by hand — the key the name
   * box had. A fragment spelled at the call site goes on saying so after the page it points at has stopped reading it,
   * and the only sign would have been a link that opens an empty canvas. So it goes through `nameFragment`, and this
   * is that link followed.
   */
  for (const text of ['charmander', '+charmander', "farfetch'd", 'mr. mime']) {
    const arrived = fromFragment(`#${nameFragment(text)}`);

    expect({ text, shape: shape(arrived.tree), query: compose(arrived).query }).toEqual({
      text,
      shape: { all: [text] },
      query: text,
    });
  }
});

test('names are split on the comma a reader types, and trimmed', () => {
  expect(names('pikachu, eevee , snorlax')).toEqual(['pikachu', 'eevee', 'snorlax']);
  expect(names('   ')).toEqual([]);
  expect(names('+charmander')).toEqual(['+charmander']);
});

/*
 * The link. A fragment carries the arrangement as a token stream, a group writing how it joins and how many parts it
 * has, so reading one is a descent with a counter rather than a story about unbalanced brackets.
 */

test('an arrangement survives the round trip', () => {
  const chosen = state(
    all(
      yes('shiny'),
      no('lucky'),
      any(named('pikachu'), named('+charmander')),
      { kind: 'range', id: 'cp', from: 1500, to: null, negated: false },
      any(all(yes('fire'), { kind: 'range', id: 'dex', from: 1, to: 151, negated: true })),
    ),
    true,
  );

  expect(roundTrip(chosen)).toEqual(chosen);

  // The toggle travels as the one value that means it, so a link saying anything else arrives with it off rather than
  // on by accident.
  expect(fromFragment('s=1').optimise).toBe(true);
  expect(fromFragment('s=true').optimise).toBe(false);
});

test('a link arrives with its hash, which is not part of the first key', () => {
  // `location.hash` carries the `#`, so a reader following a link hands this the whole of it.
  expect(shape(fromFragment('#q=A1_Tshiny').tree)).toEqual({ all: ['shiny'] });
  expect(shape(fromFragment('q=A1_Tshiny').tree)).toEqual({ all: ['shiny'] });
  expect(new URLSearchParams('#q=A1_Tshiny').get('q')).toBe(null);
});

test('a name carries the characters the token stream uses for itself', () => {
  // `_` separates the tokens and `encodeURIComponent` leaves it alone, so a nickname holding one would otherwise end
  // its token early and the rest of the name would read as a pill of its own. `#` is both the game's "has any tag"
  // and the character a fragment begins with, and `&` separates the fragment's own parts.
  for (const text of ['my_shiny', 'a_b_c', '#', 'tag&more', 'half%', 'é 50%_x']) {
    const chosen = state(all(named(text)));

    expect({ text, back: roundTrip(chosen).tree }).toEqual({ text, back: chosen.tree });
  }
});

test('an empty arrangement is carried by no key at all', () => {
  expect(toFragment(emptyState())).toBe('');
  expect(toFragment(state(emptyTreeLike()))).toBe('');
  expect(shape(fromFragment('').tree)).toEqual({ all: [] });
});

/** An empty root, written out the long way so the test does not lean on `emptyState` for both halves. */
const emptyTreeLike = () => group('all', []);

test('a token that names nothing is dropped, and the parts after it are not shifted', () => {
  expect(TERMS_BY_ID.has('shiny')).toBe(true);
  expect(TERMS_BY_ID.has('sparkly')).toBe(false);

  // A group always consumes the parts it declared, dropped or not, so one bad pill cannot take the next one with it.
  expect(shape(fromFragment('q=A3_Tshiny_Tsparkly_Tlucky').tree)).toEqual({ all: ['shiny', 'lucky'] });
  expect(shape(fromFragment('q=A2_Tsparkly_Tlucky').tree)).toEqual({ all: ['lucky'] });
  expect(shape(fromFragment('q=A2_Rnope.1.2_Tlucky').tree)).toEqual({ all: ['lucky'] });
  expect(shape(fromFragment('q=A2_Zwhat_Tlucky').tree)).toEqual({ all: ['lucky'] });
});

test('a bound from a stranger is clamped to the pill that could have produced it', () => {
  const dex = RANGES.find((range) => range.id === 'dex');
  const year = RANGES.find((range) => range.id === 'year');

  expect([dex?.min, dex?.max]).toEqual([1, 1025]);
  expect([year?.min, year?.max]).toEqual([2016, 2030]);

  // An unclamped bound hands the game a span no pill could have made — `0-9999` out of a dex box that stops at 1025.
  expect(nodeAt(fromFragment('q=A1_Rdex.0.9999').tree, [0])).toEqual({
    kind: 'range',
    id: 'dex',
    from: 1,
    to: 1025,
    negated: false,
  });

  expect(nodeAt(fromFragment('q=A1_Ryear.1999.2020').tree, [0])).toEqual({
    kind: 'range',
    id: 'year',
    from: 2016,
    to: 2020,
    negated: false,
  });

  // A bound that is not a number is the empty box it looks like, which the writer then fills from the table.
  expect(shape(fromFragment('q=A1_Rdex..151').tree)).toEqual({ all: ['1-151'] });
  expect(shape(fromFragment('q=A1_Rdex.x.y').tree)).toEqual({ all: ['…'] });
});

test('an arity claiming more parts than there are is a short tree rather than a hang', () => {
  // Clamped to the tokens actually left, so a link claiming a billion parts reads the two it has and stops.
  expect(shape(fromFragment('q=A99999999_Tshiny_Tlucky').tree)).toEqual({ all: ['shiny', 'lucky'] });
  expect(shape(fromFragment('q=A2_Tshiny').tree)).toEqual({ all: ['shiny'] });
  expect(shape(fromFragment('q=Ax_Tshiny').tree)).toEqual({ all: [] });
});

test('a link nested deeper than the limit is refused on the way down rather than by the stack', () => {
  /*
   * The reader recurses once per group, so a link claiming ten thousand of them would exhaust the stack before
   * anything could refuse it — which is why the depth is checked before descending rather than measured afterwards.
   * The canvas cannot reach this: a reader would be pressing *add a group* sixty-odd times into its own last group.
   */
  const deep = (count: number) => `q=${Array.from({ length: count }, () => 'A1').join('_')}_Tshiny`;

  const depth = (node: Node): number => (isGroup(node) && node.parts[0] ? 1 + depth(node.parts[0]) : 0);

  expect(depth(fromFragment(deep(NESTING)).tree)).toBe(NESTING);
  expect(depth(fromFragment(deep(10_000)).tree)).toBeLessThanOrEqual(NESTING);
  expect(compose(fromFragment(deep(10_000))).error).toBeNull();
});

/** Every tree of up to `size` nodes over two pills and both junctions, which is enough shapes to sweep. */
function* trees(size: number): Generator<Node> {
  if (size <= 1) {
    yield yes('shiny');
    yield no('lucky');
    yield named('pika_chu');
    yield { kind: 'range', id: 'cp', from: 100, to: null, negated: false };
    return;
  }

  for (const junction of ['all', 'any'] as const) {
    for (const one of trees(size - 1)) {
      yield group(junction, [one]);

      for (const two of trees(1)) {
        yield group(junction, [one, two]);
      }
    }
  }
}

test('every arrangement this writes, it reads back', () => {
  // The sweep rather than a handful, because the encoding is a flat token stream: an arity read one short or one long
  // puts the rest of the tree in the wrong place, and the result is still a tree.
  let swept = 0;

  for (const tree of trees(3)) {
    const chosen = state(group('all', [tree]));

    expect({ shape: shape(roundTrip(chosen).tree), query: compose(roundTrip(chosen)).query }).toEqual({
      shape: shape(chosen.tree),
      query: compose(chosen).query,
    });

    swept += 1;
  }

  // Enough shapes that the sweep is a sweep, pinned so a generator that stopped generating would be caught.
  expect(swept).toBeGreaterThan(200);
});
