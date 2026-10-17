/**
 * The saved favourites as storage holds them: what a load trusts, what a save replaces, and the refusal a reader has to
 * be told about. The fragment itself is `query.test.js`'s, so the round trip here is only the one that proves a
 * favourite is that fragment and nothing of its own.
 */

import { beforeEach, expect, test } from 'vitest';

import { installFakeStorage, type FakeStorage } from '../testing/storage.js';
import { FAVOURITES_KEY, loadFavourites, storeFavourites, withFavourite, withoutFavourite } from './favourites.js';
import { compose, fromFragment, presetTree, toFragment } from './query.js';
import { PRESETS } from './terms.js';

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeStorage();
});

const shiny = { label: 'Shinies', fragment: 'q=A1_Tshiny' };
const lucky = { label: 'Luckies', fragment: 'q=A1_Tlucky' };

test('nothing saved, and storage that will not answer, both read as no favourites', () => {
  expect(loadFavourites()).toEqual([]);

  storage.throws = true;

  expect(loadFavourites()).toEqual([]);
});

test('a save is what the next load reads, under the namespace a backup sweeps', () => {
  expect(storeFavourites([shiny, lucky])).toBe(true);
  expect(loadFavourites()).toEqual([shiny, lucky]);
  expect(FAVOURITES_KEY.startsWith('pogo-utils:')).toBe(true);
});

test('a refused write says so rather than passing for a save', () => {
  storage.refusesWrites = true;

  expect(storeFavourites([shiny])).toBe(false);
  expect(loadFavourites()).toEqual([]);
});

test('whatever storage holds that is not a favourite is dropped', () => {
  storage.setItem(
    FAVOURITES_KEY,
    JSON.stringify([shiny, null, 'q=A0', { label: 'no fragment' }, { fragment: 'q=A0' }]),
  );

  expect(loadFavourites()).toEqual([shiny]);

  storage.setItem(FAVOURITES_KEY, '{"label":"not a list"}');

  expect(loadFavourites()).toEqual([]);

  storage.setItem(FAVOURITES_KEY, 'not json');

  expect(loadFavourites()).toEqual([]);
});

test('saving under a name already taken replaces that favourite where it stands', () => {
  const brighter = { label: 'Shinies', fragment: 'q=A2_Tshiny_Tlucky' };

  expect(withFavourite([shiny, lucky], brighter)).toEqual([brighter, lucky]);
  expect(withFavourite([lucky], shiny)).toEqual([lucky, shiny]);
});

test('removing a favourite leaves the rest in order', () => {
  expect(withoutFavourite([shiny, lucky], 'Shinies')).toEqual([lucky]);
  expect(withoutFavourite([shiny, lucky], 'Nothing by that name')).toEqual([shiny, lucky]);
});

test('a favourite saved from an arrangement composes the string that arrangement did', () => {
  for (const preset of PRESETS) {
    const tree = presetTree(preset);
    const fragment = toFragment({ tree, optimise: false });

    storeFavourites([{ label: preset.label, fragment }]);

    const [loaded] = loadFavourites();

    expect(compose({ tree: fromFragment(loaded?.fragment ?? '').tree, optimise: false }).query).toBe(
      compose({ tree, optimise: false }).query,
    );
  }
});
