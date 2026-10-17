import { beforeEach, expect, test } from 'vitest';

import { installFakeStorage, type FakeStorage } from '../testing/storage.js';
import { forget, keep, readSaved, SAVED_KEY } from './saved.js';

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeStorage();
});

/** Spelled out once, since a rename would move every reader's saved searches out from under them. */
test('the key is the name readers hold', () => {
  expect(SAVED_KEY).toBe('pogo-utils:search:saved');
});

test('a search kept is read back', () => {
  keep([], 'Hundos', 'q=4*');

  expect(readSaved()).toEqual([{ name: 'Hundos', fragment: 'q=4*' }]);
});

test('a name kept again replaces the search in its place', () => {
  const list = keep(keep(keep([], 'One', 'q=a'), 'Two', 'q=b'), 'One', 'q=c');

  expect(list).toEqual([
    { name: 'One', fragment: 'q=c' },
    { name: 'Two', fragment: 'q=b' },
  ]);
  expect(readSaved()).toEqual(list);
});

test('a search forgotten is gone from storage too', () => {
  forget(keep(keep([], 'One', 'q=a'), 'Two', 'q=b'), 'One');

  expect(readSaved()).toEqual([{ name: 'Two', fragment: 'q=b' }]);
});

test('entries of the wrong shape are dropped', () => {
  storage.setItem(SAVED_KEY, JSON.stringify([{ name: 'Fine', fragment: '' }, { name: 3 }, 'q=a', null]));

  expect(readSaved()).toEqual([{ name: 'Fine', fragment: '' }]);
});

test('storage that will not answer reads as nothing saved', () => {
  storage.setItem(SAVED_KEY, 'not json');
  expect(readSaved()).toEqual([]);

  storage.throws = true;
  expect(readSaved()).toEqual([]);
});

test('a refused write is thrown rather than swallowed', () => {
  storage.refusesWrites = true;

  expect(() => keep([], 'Hundos', 'q=4*')).toThrow();
  expect(() => forget([{ name: 'Hundos', fragment: 'q=4*' }], 'Hundos')).toThrow();
});
