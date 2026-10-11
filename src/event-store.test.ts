import { beforeEach, expect, test, vi } from 'vitest';

import { KEYS } from './event-prefs.js';
import { EventStore, NOTHING_REVEALED } from './event-store.js';
import { installFakeStorage, type FakeStorage } from './testing/storage.js';

import type { FeedEvent } from './types.js';

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeStorage();
});

/** A feed entry, upcoming unless the case says otherwise, so the default reveals let it through. */
const feedEvent = (eventID: string, over: Partial<FeedEvent> = {}): FeedEvent => ({
  eventID,
  name: `Event ${eventID}`,
  eventType: 'event',
  heading: 'Events',
  link: 'https://example.invalid/',
  image: '',
  start: '2099-01-01T10:00:00.000',
  end: '2099-01-02T10:00:00.000',
  ...over,
});

/**
 * A store whose fetch answers whatever `feed` holds at the time, with the local file empty, so a case can load once,
 * change the feed and load again — the way a reader comes back to find an event added.
 */
function storeOver(initial: FeedEvent[]) {
  const source = { feed: initial };
  const fetchList = vi.fn(async (url: string) => (url.endsWith('events-feed.json') ? source.feed : []));

  return { store: new EventStore(fetchList), source, fetchList };
}

const ids = (store: EventStore) => store.newlyVisible().map((ev) => ev.eventID);

test('a first visit has nothing new, the seen set starting from the whole feed', async () => {
  const { store } = storeOver([feedEvent('a'), feedEvent('b')]);

  await store.load();

  expect(ids(store)).toEqual([]);
  expect(JSON.parse(storage.getItem(KEYS.seen) ?? 'null')).toEqual(['a', 'b']);
});

test('an event this browser has not seen is new, on any tab', async () => {
  const { store, source } = storeOver([feedEvent('a')]);

  await store.load();
  source.feed = [feedEvent('a'), feedEvent('b')];
  await store.load();

  expect(ids(store)).toEqual(['b']);
});

test('a recurring type is never new', async () => {
  const { store, source } = storeOver([feedEvent('a')]);

  await store.load();
  source.feed = [feedEvent('a'), feedEvent('raidhour', { heading: 'Raid Hour', eventType: 'raid-hour' })];
  await store.load();

  expect(ids(store)).toEqual([]);
});

test("only what the cards view's type filters and reveals let through is new", async () => {
  const { store, source } = storeOver([feedEvent('a')]);

  await store.load();
  source.feed = [
    feedEvent('a'),
    feedEvent('hidden', { heading: 'GO Pass', eventType: 'go-pass' }),
    feedEvent('dismissed'),
    feedEvent('over', { start: '2000-01-01T10:00:00.000', end: '2000-01-02T10:00:00.000' }),
    feedEvent('undated', { start: null, end: null }),
  ];
  await store.load();
  store.prefs.dismissed.add('dismissed');

  expect(ids(store)).toEqual([]);

  store.publish({ reveals: { showPast: true, showUndated: true, showHidden: true }, search: '', now: new Date() });

  expect(ids(store).sort()).toEqual(['dismissed', 'over', 'undated']);
});

test("the cards view's own type filters are the ones counted, whichever view is open", async () => {
  const { store, source } = storeOver([feedEvent('a')]);

  await store.load();
  source.feed = [feedEvent('a'), feedEvent('b')];
  await store.load();

  store.prefs.filterScope = 'view';
  store.prefs.hiddenByView['calendar'] = new Set(['Events']);
  expect(ids(store)).toEqual(['b']);

  store.prefs.hiddenByView['cards'] = new Set(['Events']);
  expect(ids(store)).toEqual([]);
});

test('the Events page search narrows the list while it is open, and closing the page lifts it', async () => {
  const { store, source } = storeOver([feedEvent('a')]);

  await store.load();
  source.feed = [feedEvent('a'), feedEvent('b'), feedEvent('c')];
  await store.load();

  store.publish({ reveals: NOTHING_REVEALED, search: 'Event c', now: new Date() });
  expect(ids(store)).toEqual(['c']);

  store.publish(null);
  expect(ids(store)).toEqual(['b', 'c']);
});

test('acknowledging clears the notification through the one seen set, and tells every reader', async () => {
  const { store, source } = storeOver([feedEvent('a')]);

  await store.load();
  source.feed = [feedEvent('a'), feedEvent('b'), feedEvent('c')];
  await store.load();

  const listener = vi.fn();
  store.subscribe(listener);
  store.acknowledge([{ eventID: 'b' }]);

  expect(ids(store)).toEqual(['c']);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(JSON.parse(storage.getItem(KEYS.seen) ?? 'null')).toEqual(['a', 'b']);

  // A second store reading the same storage, as the next page load would, agrees.
  const { store: next } = storeOver(source.feed);
  await next.load();
  expect(ids(next)).toEqual(['c']);
});

test('the shell and the Events page opening together fetch once', async () => {
  const { store, fetchList } = storeOver([feedEvent('a')]);

  await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
  await store.ensureLoaded();

  // One call per file.
  expect(fetchList).toHaveBeenCalledTimes(2);

  await store.load();
  expect(fetchList).toHaveBeenCalledTimes(4);
});

test('reloading the preferences keeps the object every reader holds', () => {
  const store = new EventStore(async () => []);
  const held = store.prefs;

  held.hiddenTypes.delete('Season');
  store.reloadPrefs();

  expect(store.prefs).toBe(held);
  expect(held.hiddenTypes.has('Season')).toBe(true);
});
