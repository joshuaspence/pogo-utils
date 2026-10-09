import { beforeEach, expect, test } from 'vitest';

import { DEFAULT_HIDDEN, hiddenFor, KEYS, loadPrefs, persist, RECURRING, type Prefs } from './event-prefs.js';
import RECURRING_TYPES from './recurring-types.js';
import { installFakeStorage, type FakeStorage } from './testing/storage.js';

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeStorage();
});

const store = (key: keyof typeof KEYS, value: unknown) => storage.setItem(KEYS[key], JSON.stringify(value));

/**
 * The names themselves, spelled out once. Every other test in this file indexes through `KEYS`, so a rename would
 * leave all of them green while moving the keys out from under readers' browsers — this is the one that would fail.
 */
test('the keys are the names readers hold', () => {
  expect(KEYS).toEqual({
    hiddenTypes: 'pogo-utils:events:hidden-types',
    hiddenByView: 'pogo-utils:events:hidden-by-view',
    filterScope: 'pogo-utils:events:filter-scope',
    dismissed: 'pogo-utils:events:dismissed',
    seen: 'pogo-utils:events:seen',
  });
});

/**
 * The rule those names keep, which the list above only happens to satisfy: each is namespaced to this app, and names a
 * page under that namespace. `localStorage` is keyed by origin and `joshuaspence.github.io` serves every repository
 * published there, so an unqualified key is one another site could be holding too.
 */
test('every key is namespaced to this app, and names a page under it', () => {
  const prefix = 'pogo-utils:';

  for (const key of Object.values(KEYS)) {
    expect(key.startsWith(prefix)).toBe(true);
    expect(key.slice(prefix.length)).toContain(':');
  }
});

/**
 * A first visit, which is the case the whole absent-versus-empty distinction exists for: no key has been written, so
 * the hidden types are the default rather than nothing, and `seen` is null rather than an empty set — null being what
 * tells a first visit from a reader who has acknowledged everything.
 */
test('a first visit gets the defaults, and a null seen set', () => {
  const prefs = loadPrefs();

  expect(prefs.hiddenTypes).toEqual(new Set(DEFAULT_HIDDEN));
  expect(prefs.hiddenByView).toEqual({});
  expect(prefs.filterScope).toBe('global');
  expect(prefs.dismissed).toEqual(new Set());
  expect(prefs.seen).toBeNull();
});

/**
 * The default hides the recurring types plus three that describe a standing state rather than somewhere to be at a
 * time. The recurring half is read off the list the calendar feed shares rather than spelled again, so the two cannot
 * drift — and the three extras are checked to be extras, since the point of keeping them out of `RECURRING_TYPES` is
 * that a subscription still carries them.
 */
test('the default hidden set is the recurring types and three standing states', () => {
  expect(RECURRING_TYPES.every((type) => DEFAULT_HIDDEN.includes(type))).toBe(true);
  expect(DEFAULT_HIDDEN.filter((type) => !RECURRING.has(type))).toEqual([
    'Choose Your Path',
    'GO Battle League',
    'GO Pass',
    'Twitch Drops',
  ]);
});

/**
 * An empty stored set is a reader who cleared everything, and has to survive a reload as such. This is the assertion
 * the one-key-per-set design exists for: in a single object, saving any other set would have decided this one too.
 */
test('an empty stored set is not a first visit', () => {
  store('hiddenTypes', []);
  expect(loadPrefs().hiddenTypes).toEqual(new Set());
});

test('a stored set is read back as its members', () => {
  store('hiddenTypes', ['Community Day', 'Raid Hour']);
  store('dismissed', ['event-a']);

  const prefs = loadPrefs();

  expect(prefs.hiddenTypes).toEqual(new Set(['Community Day', 'Raid Hour']));
  expect(prefs.dismissed).toEqual(new Set(['event-a']));
});

/**
 * Every way a stored value can be unusable lands on the same answer as a missing one, because that is the documented
 * stance: a value we cannot read is a value we do not have. Unparseable JSON, the wrong shape and a store that will not
 * answer at all are the three, and a reader meeting any of them gets the default hidden types rather than an empty set.
 */
test.for([
  { stored: 'not JSON at all', write: (s: FakeStorage) => s.setItem(KEYS.hiddenTypes, '{oh no') },
  { stored: 'an object where a list belongs', write: (s: FakeStorage) => s.setItem(KEYS.hiddenTypes, '{"a":1}') },
  { stored: 'a bare string', write: (s: FakeStorage) => s.setItem(KEYS.hiddenTypes, '"Community Day"') },
  { stored: 'null', write: (s: FakeStorage) => s.setItem(KEYS.hiddenTypes, 'null') },
])('$stored reads as a first visit', ({ write }) => {
  write(storage);
  expect(loadPrefs().hiddenTypes).toEqual(new Set(DEFAULT_HIDDEN));
});

/** Storage that will not answer at all is the same as never written — private mode, or storage disabled. */
test('unreadable storage reads as a first visit rather than throwing', () => {
  storage.throws = true;

  const prefs = loadPrefs();

  expect(prefs.hiddenTypes).toEqual(new Set(DEFAULT_HIDDEN));
  expect(prefs.seen).toBeNull();
});

/**
 * A stray non-string is dropped rather than carried, which costs nothing: these members are compared against `eventID`s
 * and `heading`s, so a number among them is one nothing can ever equal. The strings beside it survive, so this says the
 * bad member was dropped rather than the whole value.
 */
test('a non-string member is dropped and the rest kept', () => {
  storage.setItem(KEYS.dismissed, JSON.stringify(['event-a', 42, null, { id: 'b' }, 'event-c']));
  expect(loadPrefs().dismissed).toEqual(new Set(['event-a', 'event-c']));
});

/** Anything but `'view'` is global, so a scope no view answers to cannot filter by a set nothing can reach to edit. */
test.for([
  { stored: '"view"', reads: 'view' },
  { stored: '"global"', reads: 'global' },
  { stored: '"sideways"', reads: 'global' },
  { stored: '42', reads: 'global' },
])('a stored scope of $stored reads as $reads', ({ stored, reads }) => {
  storage.setItem(KEYS.filterScope, stored);
  expect(loadPrefs().filterScope).toBe(reads);
});

/**
 * The per-view sets are left sparse, because a view with no slot is one that has never been filtered on its own and is
 * seeded from the global set — where filling it in would say every view had had its chips cleared. A slot holding an
 * unusable value is left out for the same reason it would be at the top level.
 */
test('the per-view sets are read sparsely', () => {
  store('hiddenByView', { cards: ['Community Day'], calendar: [], tracks: 'nonsense' });

  expect(loadPrefs().hiddenByView).toEqual({ cards: new Set(['Community Day']), calendar: new Set() });
});

test('a per-view value that is not an object at all reads as no views', () => {
  storage.setItem(KEYS.hiddenByView, '["cards"]');
  expect(loadPrefs().hiddenByView).toEqual({});
});

/**
 * The legacy single object is carried across once and then dropped, so the old shape is known to one function rather
 * than to every read. Both sets are written even where the old object carried neither, because an absent key would read
 * as a first visit and hand the defaults back to a reader who had unticked them.
 */
test('the legacy object is carried across and removed', () => {
  storage.setItem('pgo-events:prefs', JSON.stringify({ hiddenTypes: ['Raid Hour'], dismissed: ['event-a'] }));

  const prefs = loadPrefs();

  expect(prefs.hiddenTypes).toEqual(new Set(['Raid Hour']));
  expect(prefs.dismissed).toEqual(new Set(['event-a']));
  expect(storage.getItem('pgo-events:prefs')).toBeNull();
  expect(storage.snapshot()).toEqual({
    [KEYS.hiddenTypes]: '["Raid Hour"]',
    [KEYS.dismissed]: '["event-a"]',
  });
});

/**
 * A legacy object carrying nothing still writes both keys empty, which is what stops the migration handing the defaults
 * back to a reader who had cleared them. `seen` is deliberately not among them: writing it empty would say a reader of
 * months has seen nothing and mark every event on the page new.
 */
test('a legacy object with nothing in it still settles both keys, and not seen', () => {
  storage.setItem('pgo-events:prefs', JSON.stringify({}));

  const prefs = loadPrefs();

  expect(prefs.hiddenTypes).toEqual(new Set());
  expect(prefs.dismissed).toEqual(new Set());
  expect(prefs.seen).toBeNull();
  expect(storage.getItem(KEYS.seen)).toBeNull();
});

/** A legacy value that will not parse is left in place rather than deleted: the defaults apply meanwhile. */
test('an unparseable legacy object is left alone', () => {
  storage.setItem('pgo-events:prefs', '{oh no');

  expect(loadPrefs().hiddenTypes).toEqual(new Set(DEFAULT_HIDDEN));
  expect(storage.getItem('pgo-events:prefs')).toBe('{oh no');
});

/**
 * The unqualified keys are moved rather than reparsed, so each arrives under its prefixed name byte for byte and the
 * old name is gone — which is what the snapshot says in both directions at once. All five, since `seen` is the one the
 * legacy object's hop deliberately skips and a case covering four would not say that this hop does not.
 */
test('the unprefixed keys are carried across and removed', () => {
  storage.setItem('events:hidden-types', '["Raid Hour"]');
  storage.setItem('events:hidden-by-view', '{"cards":["Community Day"]}');
  storage.setItem('events:filter-scope', '"view"');
  storage.setItem('events:dismissed', '["event-a"]');
  storage.setItem('events:seen', '["event-b"]');

  const prefs = loadPrefs();

  expect(prefs.hiddenTypes).toEqual(new Set(['Raid Hour']));
  expect(prefs.hiddenByView).toEqual({ cards: new Set(['Community Day']) });
  expect(prefs.filterScope).toBe('view');
  expect(prefs.dismissed).toEqual(new Set(['event-a']));
  expect(prefs.seen).toEqual(new Set(['event-b']));

  expect(storage.snapshot()).toEqual({
    [KEYS.hiddenTypes]: '["Raid Hour"]',
    [KEYS.hiddenByView]: '{"cards":["Community Day"]}',
    [KEYS.filterScope]: '"view"',
    [KEYS.dismissed]: '["event-a"]',
    [KEYS.seen]: '["event-b"]',
  });
});

/**
 * An unqualified key that was never written leaves its prefixed name unwritten too. This is the absent-versus-empty
 * distinction surviving the rename, and `seen` is where it bites: arriving with an empty one rather than none would
 * mark every event on the page new for a reader who had been reading it all week.
 */
test('an unprefixed key that was never written stays absent', () => {
  storage.setItem('events:hidden-types', '["Raid Hour"]');

  expect(loadPrefs().seen).toBeNull();
  expect(storage.getItem(KEYS.seen)).toBeNull();
});

/**
 * A value that will not parse is carried across as it stands. It reads as a first visit from either name, so moving it
 * changes nothing a reader sees — but it leaves one key holding it rather than two, which is the point of the rename.
 */
test('an unparseable unprefixed value is carried across as it stands', () => {
  storage.setItem('events:hidden-types', '{oh no');

  expect(loadPrefs().hiddenTypes).toEqual(new Set(DEFAULT_HIDDEN));
  expect(storage.snapshot()).toEqual({ [KEYS.hiddenTypes]: '{oh no' });
});

/**
 * A browser can hold both older shapes at once — a legacy migration that failed partway leaves the object behind — and
 * the unqualified keys are the later state, so they are what survives where the two disagree.
 */
test('the unprefixed keys win over a legacy object holding both', () => {
  storage.setItem('pgo-events:prefs', JSON.stringify({ hiddenTypes: ['Raid Hour'], dismissed: ['from-object'] }));
  storage.setItem('events:dismissed', '["from-key"]');

  const prefs = loadPrefs();

  expect(prefs.dismissed).toEqual(new Set(['from-key']));
  expect(prefs.hiddenTypes).toEqual(new Set(['Raid Hour']));
  expect(storage.getItem('pgo-events:prefs')).toBeNull();
});

/**
 * The two halves catch for themselves, so a legacy object that will not parse — which is left in place by design —
 * cannot stop the rename beside it. One `try` around both would lose the second hop to the first one's throw.
 */
test('an unparseable legacy object does not block the rename', () => {
  storage.setItem('pgo-events:prefs', '{oh no');
  storage.setItem('events:dismissed', '["event-a"]');

  expect(loadPrefs().dismissed).toEqual(new Set(['event-a']));
  expect(storage.getItem('events:dismissed')).toBeNull();
  expect(storage.getItem('pgo-events:prefs')).toBe('{oh no');
});

const prefsFor = (over: Partial<Prefs>): Prefs => ({
  hiddenTypes: new Set(),
  hiddenByView: {},
  filterScope: 'global',
  dismissed: new Set(),
  seen: null,
  ...over,
});

/** JSON has no Set, so one replacer writes a bare set and the object of per-view sets alike, as their members. */
test('persist writes a set as its members, and the per-view object as sets of them', () => {
  const prefs = prefsFor({
    hiddenTypes: new Set(['Community Day']),
    hiddenByView: { cards: new Set(['Raid Hour']) },
  });

  persist(prefs, 'hiddenTypes');
  persist(prefs, 'hiddenByView');

  expect(storage.snapshot()).toEqual({
    [KEYS.hiddenTypes]: '["Community Day"]',
    [KEYS.hiddenByView]: '{"cards":["Raid Hour"]}',
  });
});

/** One key at a time, so toggling a type filter cannot rewrite the dismissals beside it. */
test('persist writes the one key it was named', () => {
  const prefs = prefsFor({ hiddenTypes: new Set(['Community Day']), dismissed: new Set(['event-a']) });

  persist(prefs, 'hiddenTypes');

  expect(Object.keys(storage.snapshot())).toEqual([KEYS.hiddenTypes]);
});

/** A write a browser refuses is survivable: the filters still work for the rest of the session. */
test('persist tolerates storage it cannot write to', () => {
  storage.throws = true;
  expect(() => persist(prefsFor({}), 'hiddenTypes')).not.toThrow();
});

/** A null `seen` round-trips as a null, not as an empty set, which is what keeps a first visit a first visit. */
test('a written seen set round-trips, and a null one stays absent', () => {
  persist(prefsFor({ seen: null }), 'seen');
  expect(storage.getItem(KEYS.seen)).toBe('null');
  expect(loadPrefs().seen).toBeNull();

  persist(prefsFor({ seen: new Set() }), 'seen');
  expect(loadPrefs().seen).toEqual(new Set());
});

test('hiddenFor answers the global set where the scope is global', () => {
  const prefs = prefsFor({ filterScope: 'global', hiddenTypes: new Set(['Community Day']) });

  expect(hiddenFor(prefs, 'cards')).toBe(prefs.hiddenTypes);
  expect(prefs.hiddenByView).toEqual({});
});

/**
 * A view filtered on its own for the first time is seeded from the global set, so flipping the scope toggle changes
 * nothing on screen until a chip is clicked — a control that rearranged the page the moment it was touched would read
 * as a bug. The seed is a copy rather than the same set, which is what lets the two then diverge.
 */
test('hiddenFor seeds a view from the global set, as a copy', () => {
  const prefs = prefsFor({ filterScope: 'view', hiddenTypes: new Set(['Community Day']) });
  const forCards = hiddenFor(prefs, 'cards');

  expect(forCards).toEqual(new Set(['Community Day']));
  expect(forCards).not.toBe(prefs.hiddenTypes);

  forCards.add('Raid Hour');
  expect(prefs.hiddenTypes).toEqual(new Set(['Community Day']));
  expect(hiddenFor(prefs, 'calendar')).toEqual(new Set(['Community Day']));
});

/** A view that has been filtered keeps what it holds rather than being re-seeded on every read. */
test('hiddenFor returns the same set for a view it has already seeded', () => {
  const prefs = prefsFor({ filterScope: 'view', hiddenTypes: new Set(['Community Day']) });

  expect(hiddenFor(prefs, 'cards')).toBe(hiddenFor(prefs, 'cards'));
});

/** An empty stored set for a view is a view whose chips are all on, so it is not re-seeded from the global set. */
test('hiddenFor leaves a stored empty set empty', () => {
  const prefs = prefsFor({
    filterScope: 'view',
    hiddenTypes: new Set(['Community Day']),
    hiddenByView: { cards: new Set() },
  });

  expect(hiddenFor(prefs, 'cards')).toEqual(new Set());
});
