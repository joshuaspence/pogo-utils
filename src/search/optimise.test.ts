/**
 * `optimise` is where a test is worth the most here: its every answer is a value rather than a rendering, and it is the
 * one module a reader is asked to trust on a mass transfer. Each case below is a defect it would have caught rather
 * than a line it covers — a reduction taken where the two readings of a partial name disagree, a family written as the
 * species it was reached through, an empty intersection written as an empty clause, a rewrite never reported, a group
 * whose every term was refused written as the empty clause that matches all of them.
 *
 * Every case is built on the real dex and the real tables, which is what makes it worth asserting against and why each
 * test pins the shape of the data its case needs before asserting any behaviour. A fragment that reaches three species
 * today and one tomorrow is a test that has quietly stopped being about anything, and that reads exactly like a pass.
 */

import { expect, test } from 'vitest';

import POKEMON from '../pokemon/pokedex.js';
import { GENERATIONS } from '../pokemon/generations.js';
import { GROUPS, RANGES } from './terms.js';
import { compose, emptyState, type Bounds, type State } from './query.js';
import { optimise } from './optimise.js';

/** A state as the builder would have it, with only the parts a test is about spelled out. */
const state = (parts: Partial<State>): State => ({ ...emptyState(), ...parts });

/** Every species as the name a search sees, which is what both readings of a partial name are tested against. */
const NAMES = Object.values(POKEMON).map((species) => String(species).toLowerCase());

/**
 * How many species a fragment reaches under each reading of a partial name — matching anywhere, and matching from the
 * start. A reduction is refused wherever the two disagree, so these two numbers are the whole precondition of a name
 * test: pin them, and a dex that has moved says so here instead of leaving the case silently unreachable.
 */
const reach = (fragment: string) => ({
  contains: NAMES.filter((name) => name.includes(fragment)).length,
  begins: NAMES.filter((name) => name.startsWith(fragment)).length,
});

/**
 * One generation's bounds, so a test can pin the spans the literals it asserts were derived from. It throws on a
 * generation the table does not carry rather than narrowing, since a missing one is a precondition gone rather than a
 * failure of anything below.
 */
function generation(number: number) {
  const found = GENERATIONS.find((entry) => entry.number === number);

  if (!found) {
    throw new Error(`\`generations.js\` carries no generation ${number}`);
  }

  return [found.first, found.last];
}

/**
 * One group, so a test can pin the terms and the two facts the literals it asserts were derived from. It throws on a
 * group the table does not carry for the same reason `generation` does: a missing one is the case gone rather than a
 * failure of anything below.
 */
function group(id: string) {
  const found = GROUPS.find((entry) => entry.id === id);

  if (!found) {
    throw new Error(`\`terms.js\` carries no \`${id}\` group`);
  }

  return found;
}

/** Every term of a group chosen, which is the state each reduction over a whole group is measured from. */
const all = (id: string) => group(id).terms.map((term) => term.id);

test('a name the two readings of a partial name disagree on keeps its name', () => {
  // Three species carry `saur` and none begins with it, so the fragment reaches them under one reading and nothing
  // under the other. Refusing it is what makes every reduction that is taken true whichever reading the game uses.
  expect(reach('saur')).toEqual({ contains: 3, begins: 0 });

  const { state: short, rewrites, lossy } = optimise(state({ text: 'saur' }));

  expect(short.text).toBe('saur');
  expect(rewrites).toEqual([]);
  expect(lossy).toBe(false);
});

test('a fragment reaching an underscored name under one reading alone is refused too', () => {
  // `MR_MIME` contains the fragment where `MIME_JR` begins it, so the two sets differ by one and cannot be equal.
  expect(reach('mime')).toEqual({ contains: 2, begins: 1 });

  expect(optimise(state({ text: 'mime' })).state.text).toBe('mime');
});

test('a name the dex cannot spell keeps its name, however unambiguously it reaches one species', () => {
  // Each reaches one species under both readings, so the check the two tests above exist for passes here and the
  // spellable gate is the only thing left that can refuse them. That is what makes this case about that gate.
  //
  // Only that one species, too: of the 25 prefixes the three names have, not one reaches a spellable species as well,
  // so the `every` in that gate reads like `some` until a fourth such name shares a prefix with a spellable one.
  expect([reach('farfetchd'), reach('sirfetchd'), reach('flabebe')]).toEqual([
    { contains: 1, begins: 1 },
    { contains: 1, begins: 1 },
    { contains: 1, begins: 1 },
  ]);

  // An underscore stands in for the punctuation it replaced, so `mime` reaches `MR_MIME` much as the game reads it. A
  // dropped apostrophe or accent leaves no such mark: `Farfetch'd` is `FARFETCHD` here, and a reader who types that
  // into the game finds nothing at all. So `83` would turn a search that matches nothing into one that matches a
  // species, which is the one direction a reduction must never take — every other spelling it writes already worked.
  expect([Number(POKEMON.FARFETCHD), Number(POKEMON.SIRFETCHD), Number(POKEMON.FLABEBE)]).toEqual([83, 865, 669]);

  const kept = ['farfetchd', 'sirfetchd', 'flabebe'];

  // Each would otherwise go to its number rather than to a fragment: `farf`, `sirf` and `flab` are the shortest leading
  // fragments reaching one species each, and four characters is longer than all three of the numbers above.
  expect(kept.map((name) => optimise(state({ text: name })).state.text)).toEqual(kept);

  const { rewrites, lossy } = optimise(state({ text: 'farfetchd' }));

  // A rewrite reported for a name that kept it would show the reader a substitution that did not happen, and the caveat
  // belongs to the reduction rather than to the attempt: nothing here became a number, so nothing here is lossy.
  expect([rewrites, lossy]).toEqual([[], false]);
});

test('a name that reaches one species is written as its dex number, and says it was', () => {
  expect(reach('charmander')).toEqual({ contains: 1, begins: 1 });

  // `charm` still reaches Charmeleon, so the shortest fragment reaching Charmander alone is the six-character
  // `charma` — against the one character `4` costs, which is what makes the number the shorter of the two spellings
  // rather than a preference for numbers.
  expect(reach('charm')).toEqual({ contains: 2, begins: 2 });

  const { state: short, rewrites, lossy } = optimise(state({ text: 'charmander' }));

  expect(short.text).toBe('4');

  // A reader who cannot see why `charmander` became `4` has been handed a string to trust with no way to check it.
  expect(rewrites).toEqual([['charmander', '4']]);

  // A name matches nicknames where a dex number matches the species alone, so this is the one reduction that is not an
  // equivalence and the only one the page has to caveat.
  expect(lossy).toBe(true);
});

test('a family keeps a name however short the species goes, because the family is not known', () => {
  expect(reach('charma')).toEqual({ contains: 1, begins: 1 });

  const { state: short, rewrites, lossy } = optimise(state({ text: '+charmander' }));

  // `+charma` is the same family reached a shorter way, which is sound; `+4` would be a family written as the one
  // species it was reached through, and nothing in this repository knows which species share one.
  expect(short.text).toBe('+charma');
  expect(rewrites).toEqual([['+charmander', '+charma']]);
  expect(lossy).toBe(false);
});

test('a name another name begins says nothing the shorter one has not', () => {
  // `char` reaches Charjabug and Charcadet as well, and Chimchar and Pecharunt under the other reading, so it is
  // itself refused a reduction — which is what leaves a name rather than a number on this side of the coverage check.
  expect(reach('char')).toEqual({ contains: 7, begins: 5 });

  const { state: short, rewrites } = optimise(state({ text: 'char, charmander' }));

  expect(short.text).toBe('char');
  expect(rewrites).toEqual([['charmander', 'char']]);
});

test('two generations collapse into the one span they describe', () => {
  // The literals below are these bounds, and they are adjacent: there is no dex number between 151 and 152, so the two
  // spans are one rather than two that happen to touch.
  expect([...generation(1), ...generation(2)]).toEqual([1, 151, 152, 251]);

  const { state: short } = optimise(state({ include: new Set(['gen1', 'gen2']) }));

  expect(short.include.has('gen1')).toBe(false);
  expect(short.ranges.get('dex')).toEqual({ from: 1, to: 251 });
  expect(compose(short).query).toBe('1-251');
});

test('a name that became a number is intersected with the generation it sits inside', () => {
  expect(generation(1)).toEqual([1, 151]);

  const { state: short, lossy } = optimise(state({ text: 'charmander', include: new Set(['gen1']) }));

  // Charmander is in Gen 1, so saying both says `4` and the generation has earned no clause of its own.
  expect(compose(short).query).toBe('4');
  expect(lossy).toBe(true);
});

test('spans that cannot overlap stay separate clauses rather than becoming an empty one', () => {
  expect(generation(1)).toEqual([1, 151]);

  const chosen = state({
    include: new Set(['gen1']),
    ranges: new Map<string, Bounds>([['dex', { from: 200, to: 300 }]]),
  });
  const { state: short } = optimise(chosen);

  // Their intersection is empty, and writing it would turn a search that finds nothing into one that finds everything.
  // So both survive as they were and the query goes on matching nothing, which is what was asked for.
  expect(compose(short).query).toBe('1-151&200-300');
  expect(compose(short).clauses).toBe(2);
});

test('a span covering the whole dex earns no clause at all', () => {
  const dex = RANGES.find((range) => range.id === 'dex');

  expect([dex?.min, dex?.max]).toEqual([1, 1025]);

  const { state: short } = optimise(state({ ranges: new Map<string, Bounds>([['dex', { from: 1, to: 1025 }]]) }));

  expect(short.ranges.has('dex')).toBe(false);
  expect(compose(short).query).toBe('');
});

test('a name that reaches no species is passed through untouched', () => {
  expect(reach('sparky')).toEqual({ contains: 0, begins: 0 });

  const { state: short, rewrites, lossy } = optimise(state({ text: 'sparky' }));

  expect(short.text).toBe('sparky');
  expect(rewrites).toEqual([]);
  expect(lossy).toBe(false);
});

test('several spans beside a name are left where the chips put them', () => {
  // Gen 1 and Gen 3 do not touch, so they stay two spans however they are written.
  expect([...generation(1), ...generation(3)]).toEqual([1, 151, 252, 386]);

  const { state: short } = optimise(state({ text: 'saur', include: new Set(['gen1', 'gen3']) }));

  // The two spans have nowhere to go: a dex box holds one span, and in the text beside a name they would be OR'd where
  // they have to be AND'd. So the chips keep them and the name keeps the shortening it was due, which here is none.
  expect(short.include.has('gen1')).toBe(true);
  expect(compose(short).query).toBe('saur&1-151,252-386');
});

test('several spans with no name to share the text take it', () => {
  expect([...generation(1), ...generation(3)]).toEqual([1, 151, 252, 386]);

  const { state: short } = optimise(state({ include: new Set(['gen1', 'gen3']) }));

  expect(short.include.has('gen1')).toBe(false);
  expect(short.ranges.has('dex')).toBe(false);
  expect(compose(short).query).toBe('1-151,252-386');
});

test('a refusal beside a choice in an exclusive group says nothing the choice has not', () => {
  // The two are one group, and the group says at most one of them is ever true. That is the whole of what the
  // reduction stands on: purifying a Shadow Pokémon is what makes it Purified, so Shadow has ruled Purified out.
  expect([group('rocket').exclusive, group('rocket').terms.map((term) => term.term)]).toEqual([
    true,
    ['shadow', 'purified'],
  ]);

  const chosen = state({ include: new Set(['shadow']), exclude: new Set(['purified']) });

  expect(compose(chosen).query).toBe('shadow&!purified');

  const { state: short } = optimise(chosen);

  expect(compose(short).query).toBe('shadow');
  expect(short.exclude.has('purified')).toBe(false);
});

test('the rarity group is exclusive because no species in the dex carries two of the three', () => {
  expect(group('rarity').terms.map((term) => term.term)).toEqual(['legendary', 'mythical', 'ultrabeast']);

  // What `exclusive` claims of the group, asserted against the dex it is a claim about rather than against the help
  // text that says the same thing. A species gaining a second marker says so here. The maximum is also the vacuity
  // check: markers that stopped being readable would read as zero rather than as one.
  const carried = Object.values(POKEMON).map(
    (species) => [species.legendary, species.mythical, species.ultraBeast].filter(Boolean).length,
  );

  expect(Math.max(...carried)).toBe(1);

  const { state: short } = optimise(state({ include: new Set(['legendary']), exclude: new Set(['mythical']) }));

  expect(compose(short).query).toBe('legendary');
});

test('every term of an exhaustive group at once earns no clause', () => {
  const appraisal = group('appraisal');

  expect([appraisal.exclusive, appraisal.exhaustive, appraisal.terms.map((term) => term.term)]).toEqual([
    true,
    true,
    ['0*', '1*', '2*', '3*', '4*'],
  ]);

  const chosen = state({ include: new Set(all('appraisal')) });

  expect(compose(chosen).query).toBe('0*,1*,2*,3*,4*');

  // Everything has a star rating, so asking for any of the five asks for nothing. The page declines a string this
  // short on its own — `current` in `search.tsx` reads empty as a broken page rather than as a shorter search — so
  // what a reader sees of this is the clause disappearing from beside the others.
  expect(compose(optimise(chosen).state).query).toBe('');
});

test('a group that reduced to nothing leaves the clauses around it alone', () => {
  const chosen = state({ text: 'charmander', include: new Set(all('appraisal')) });

  expect(compose(chosen).query).toBe('charmander&0*,1*,2*,3*,4*');

  // The name goes to its dex number as it would have anyway, and the appraisal clause that was AND'd with it is gone
  // — which also takes the mixed `,` and `&` the caveat was for.
  expect(compose(optimise(chosen).state)).toMatchObject({ query: '4', ambiguous: false });
});

test('all but one of an exhaustive, exclusive group is the one left out', () => {
  const chosen = state({ include: new Set(['star0', 'star1', 'star2', 'star3']) });

  expect(compose(chosen).query).toBe('0*,1*,2*,3*');

  const { state: short } = optimise(chosen);

  // Exactly one star rating is true of a Pokémon, so the four chosen and the one left out are the same search, and
  // three characters beats eleven.
  expect(compose(short).query).toBe('!4*');
  expect([[...short.include], [...short.exclude]]).toEqual([[], ['star4']]);
});

test('all but one refused is the one left over, which is that arithmetic the other way round', () => {
  const chosen = state({ exclude: new Set(['star0', 'star1', 'star2', 'star3']) });

  expect(compose(chosen).query).toBe('!0*&!1*&!2*&!3*');

  const { state: short } = optimise(chosen);

  expect(compose(short).query).toBe('4*');
  expect([[...short.include], [...short.exclude]]).toEqual([['star4'], []]);
});

test('the shorter of the two spellings wins, so a choice that is already shortest is left alone', () => {
  const chosen = state({ include: new Set(['star3', 'star4']) });

  // `!0*&!1*&!2*` says the same thing in eleven characters, so taking the complement regardless of what it costs is
  // the defect this case is about.
  expect(compose(optimise(chosen).state).query).toBe('3*,4*');
});

test('a group whose every term is refused keeps them, rather than writing the clause that matches them all', () => {
  const chosen = state({ exclude: new Set(all('appraisal')) });

  expect(compose(chosen).query).toBe('!0*&!1*&!2*&!3*&!4*');

  // Nothing has no star rating, so this matches nothing — and an empty allowed set written as an empty clause would
  // turn it into the search that matches everything, the same trap the empty intersection of two spans is kept from.
  expect(compose(optimise(chosen).state).query).toBe('!0*&!1*&!2*&!3*&!4*');
});

test('an exhaustive group that is not also exclusive reduces only as a whole', () => {
  const type = group('type');

  expect([type.exclusive, type.exhaustive, type.terms.length]).toEqual([undefined, true, 18]);

  // Every species has a type, so all eighteen at once says nothing.
  expect(compose(optimise(state({ include: new Set(all('type')) })).state).query).toBe('');

  // One short of all eighteen says something quite different from the one left out, though: Gyarados is Flying as
  // well as Water, so it is among the seventeen types that are not Water and is still not `!water`.
  const most = state({ include: new Set(all('type').slice(0, -1)) });
  const { state: short } = optimise(most);

  expect([short.include, short.exclude]).toEqual([most.include, new Set()]);
});
