/**
 * The three functions the search box and the Pokédex both read a name through, so a defect here is the same defect on
 * two pages. They close the gap between a constant and the name a game displays, and every way of getting that wrong
 * is quiet: a species shown under a name nobody recognises, or one a reader can see and cannot type.
 *
 * `fold` is worth the most, both consumers only ever asking whether a folded name contains a folded query — so a
 * character it keeps that no keyboard writes is a species unreachable from the search box on a page that renders
 * perfectly, which is why these are built around the whole dex rather than samples.
 */

import { expect, test } from 'vitest';

import POKEMON from './pokedex.js';
import { fold, formNameOf, nameOf } from './names.js';

/** Every constant `pokedex.js` binds, which is the whole input domain `nameOf` has. */
const CONSTANTS = Object.keys(POKEMON);

/** Every form name hung off a variant at any depth, which is the whole input domain `formNameOf` has. */
const FORMS = (() => {
  const found = new Set<string>();

  const walk = (pokemon: (typeof POKEMON)[keyof typeof POKEMON]) => {
    for (const variant of pokemon.variants) {
      if (variant.form !== null) {
        found.add(variant.form);
      }

      walk(variant.pokemon);
    }
  };

  for (const constant of CONSTANTS) {
    walk(POKEMON[constant as keyof typeof POKEMON]);
  }

  return [...found];
})();

test('every name in the dex folds to something a keyboard can actually write', () => {
  // This is the contract both consumers stand on rather than a property of any one name, so it is asserted over all
  // 1,025 at once: a single character surviving the fold is one species that cannot be found by typing, on a page that
  // shows it correctly and offers no hint that the search will never reach it.
  expect(CONSTANTS.filter((constant) => !/^[a-z0-9]+$/.test(fold(nameOf(constant))))).toEqual([]);
  expect(CONSTANTS).toHaveLength(1025);

  // The punctuation `SPELLINGS` exists to restore is therefore punctuation the fold takes straight back off, which is
  // what makes adding a spelling safe: the name gets better and what a reader types does not change.
  expect(['HO_OH', 'MR_MIME', 'TYPE_NULL', 'PORYGON_Z'].map((name) => fold(nameOf(name)))).toEqual([
    'hooh',
    'mrmime',
    'typenull',
    'porygonz',
  ]);
});

test('an accent is decomposed before the strip, not kept because it is a letter', () => {
  // `é` is a letter, so the character class alone keeps it and `Flabébé` stays unsearchable from an ordinary keyboard.
  // What removes it is `NFD` splitting it into an `e` and a combining acute, which is a mark rather than a letter.
  expect(fold('Flabébé')).toBe('flabebe');
  expect('Flabébé'.toLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, '')).toBe('flabébé');

  // A digit survives where the symbol beside it does not, which is what `\p{Number}` is in the class for.
  expect(fold(formNameOf('TEN_PERCENT_FORME'))).toBe('10forme');

  // What no name can show is the class being Unicode-aware rather than `[^a-z0-9]`. Decomposition and lower-casing run
  // first, so nothing reaching the class is outside ASCII and the two agree on all 1,025 — a difference held by the
  // choice of class rather than by the data, and it would take a name in a script this dex does not carry to see.
  const ascii = (name: string) =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]/g, '');

  expect(CONSTANTS.filter((constant) => fold(nameOf(constant)) !== ascii(nameOf(constant)))).toEqual([]);
});

test('a separator folds away rather than becoming a space, because a hyphen is typed both ways', () => {
  // One fold has to answer both readings of `Porygon-Z`, and only the dropping one does: a space would make `porygonz`
  // miss, where dropping it leaves `porygon z` to fold to the same thing the typed query does.
  expect([fold('Porygon-Z'), fold('porygonz'), fold('porygon z')]).toEqual(['porygonz', 'porygonz', 'porygonz']);
  expect([fold('Ho-Oh'), fold('ho oh'), fold('hooh')]).toEqual(['hooh', 'hooh', 'hooh']);
});

test('two species can fold to one search, and the two Nidoran are that pair', () => {
  // The symbols are what tell them apart and the fold drops both, so `nidoran` is one query reaching two species —
  // which is how the game behaves and a thing no consumer may assume away by treating a folded name as a key.
  expect([fold(nameOf('NIDORAN_F')), fold(nameOf('NIDORAN_M'))]).toEqual(['nidoran', 'nidoran']);

  const folded = CONSTANTS.map((constant) => fold(nameOf(constant)));
  const collided = CONSTANTS.filter((constant, at) => folded.indexOf(folded[at] ?? '') !== at);

  // And they are the only pair, so a second collision appearing is a rename worth looking at rather than business as
  // usual — this assertion is what would say so.
  expect(collided).toEqual(['NIDORAN_M']);
});

test('a form that is nothing but punctuation folds to nothing, which is a limit rather than a bug', () => {
  // Unown `!` and `?` are named by the characters themselves, so there is no query that reaches them: both consumers
  // test containment, and the empty string is contained by everything rather than finding anything. Asserted so that
  // the limit is visible and so a later change to `fold` cannot quietly turn these two into matches for every query.
  expect(FORMS.filter((form) => fold(formNameOf(form)) === '')).toEqual(['EXCLAMATION_MARK', 'QUESTION_MARK']);
  expect([formNameOf('EXCLAMATION_MARK'), formNameOf('QUESTION_MARK')]).toEqual(['!', '?']);

  // Every other form does fold to something typeable, so this is two names and not a class of them.
  expect(FORMS.filter((form) => !/^[a-z0-9]*$/.test(fold(formNameOf(form))))).toEqual([]);
  expect(FORMS.length).toBeGreaterThan(200);
});

test('a constant the tables do not speak for is titled from its own words', () => {
  // The fallback is the ordinary case rather than the exception — eighteen species are spelled out and the rest read
  // this way — so it has to be right for a constant nobody has looked at.
  expect(nameOf('IRON_HANDS')).toBe('Iron Hands');
  expect(formNameOf('COMBAT_BREED')).toBe('Combat Breed');

  // An underscore becomes a space and every word is capitalised, which `join('')` or a single capital would each lose.
  expect(nameOf('GREAT_TUSK')).toBe('Great Tusk');

  // `charAt` is used rather than an index read, which differ only on an empty segment: a constant spelled `A__B` would
  // get a stray space from one and throw on the other. None of the 1,240 names here has one, so that is a choice held
  // by this assertion rather than by anything the compiler or the data would say.
  expect([...CONSTANTS, ...FORMS].filter((name) => name.split('_').includes(''))).toEqual([]);
});

test('a spelling in the table wins over the rule, and the two tables are not one', () => {
  // `Ho Oh` is what the rule gives and `Ho-Oh` is what the game shows, so the lookup is the whole of the difference.
  expect(nameOf('HO_OH')).toBe('Ho-Oh');
  expect(nameOf('MR_MIME')).toBe('Mr. Mime');
  expect(nameOf('TYPE_NULL')).toBe('Type: Null');

  // Each table speaks for its own half, and reading the other would be silent for every name but these: a form key put
  // through `nameOf` titles rather than resolving, and a species key through `formNameOf` does the same.
  expect([nameOf('EXCLAMATION_MARK'), formNameOf('EXCLAMATION_MARK')]).toEqual(['Exclamation Mark', '!']);
  expect([nameOf('HO_OH'), formNameOf('HO_OH')]).toEqual(['Ho-Oh', 'Ho Oh']);

  // The forms the games write with a lower-case `of`, which is the one thing the rule cannot know: it capitalises every
  // segment alike, so `Hero Of Many Battles` is what it writes and the table is what corrects it.
  expect([nameOf('HERO_OF_MANY_BATTLES'), formNameOf('HERO_OF_MANY_BATTLES')]).toEqual([
    'Hero Of Many Battles',
    'Hero of Many Battles',
  ]);
});
