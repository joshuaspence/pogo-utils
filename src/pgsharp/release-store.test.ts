import { beforeEach, expect, test, vi } from 'vitest';

import { installFakeStorage, type FakeStorage } from '../testing/storage.js';
import { ACKNOWLEDGED_KEY, ReleaseStore } from './release-store.js';

import type { Release } from './release.js';

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeStorage();
});

const release = (version: string): Release => ({
  version,
  url: `https://dl.pgsharp.com/pgs${version}_0.431.0_XsfbL(arm64).apk`,
});

/** A store over a fresh document: the file as it stands at the time, read once, the way a page load reads it. */
async function visit(current: Release | null) {
  const store = new ReleaseStore(async () => current);

  await store.ensureLoaded();

  return store;
}

test('a first visit shows no notice, the version found becoming the baseline', async () => {
  const store = await visit(release('1.272.2'));

  expect(store.unacknowledged()).toBeNull();
  expect(store.release?.version).toBe('1.272.2');
  expect(JSON.parse(storage.getItem(ACKNOWLEDGED_KEY) ?? 'null')).toBe('1.272.2');
});

test('a version newer than the baseline is a notice on the next load', async () => {
  await visit(release('1.272.2'));

  expect((await visit(release('1.273.0'))).unacknowledged()).toEqual(release('1.273.0'));
});

test('once cleared it stays cleared, until the next version', async () => {
  await visit(release('1.272.2'));

  const store = await visit(release('1.273.0'));
  const listener = vi.fn();

  store.subscribe(listener);
  store.acknowledge();

  expect(store.unacknowledged()).toBeNull();
  expect(listener).toHaveBeenCalledOnce();
  expect((await visit(release('1.273.0'))).unacknowledged()).toBeNull();
  expect((await visit(release('1.274.0'))).unacknowledged()?.version).toBe('1.274.0');
});

test('a release that will not load neither notifies nor settles the baseline', async () => {
  const store = await visit(null);

  expect(store.unacknowledged()).toBeNull();
  expect(storage.getItem(ACKNOWLEDGED_KEY)).toBeNull();

  // So the first release that does load is still a first visit's, and not news.
  expect((await visit(release('1.272.2'))).unacknowledged()).toBeNull();
});

test('the file is read once, however many readers ask', async () => {
  const fetchRelease = vi.fn(async () => release('1.272.2'));
  const store = new ReleaseStore(fetchRelease);

  await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
  await store.ensureLoaded();

  expect(fetchRelease).toHaveBeenCalledOnce();
});

test('storage that will not answer reports nothing rather than failing', async () => {
  storage.throws = true;

  const store = await visit(release('1.272.2'));

  expect(store.unacknowledged()).toBeNull();
  expect(() => store.acknowledge()).not.toThrow();
});

test('storage that takes no writes reports nothing, since the reader could never clear it', async () => {
  storage.refusesWrites = true;

  expect((await visit(release('1.272.2'))).unacknowledged()).toBeNull();
  expect((await visit(release('1.273.0'))).unacknowledged()).toBeNull();
});
