/**
 * The events page's saved choices, in `localStorage` and never the DOM. The distinction the design turns on is that
 * absent is not empty: a key never written means a first visit, where one holding an empty list means a reader who
 * cleared everything. `src/pages/events.tsx` holds the live `prefs` object and re-renders when one changes.
 */

import RECURRING_TYPES from './recurring-types.js';

/** The reader's saved choices, keyed the way `KEYS` is so `persist` can take a name alone. */
export interface Prefs {
  hiddenTypes: Set<string>;
  hiddenByView: Record<string, Set<string>>;

  /** Which set the chips edit: the global one, or the current view's own. */
  filterScope: 'global' | 'view';

  dismissed: Set<string>;

  /** Null is a first visit, where an empty set is a reader who has acknowledged everything — see `settleSeen`. */
  seen: Set<string> | null;
}

/**
 * Types are stored as the *hidden* set rather than the visible one, so a category the feed adds later shows up by
 * default instead of being filtered out by a stale allow-list.
 *
 * One key per set rather than one object, so each carries its own absent-versus-empty distinction and writing one
 * cannot settle another. `hiddenByView` is the exception: there the distinction is per view and survives inside the
 * object, a view with no slot never having been filtered on its own.
 *
 * The `pogo-utils:` prefix is the Pages path segment, since `localStorage` is keyed by origin and
 * `joshuaspence.github.io` serves every repository published there — an unqualified name is not this app's to claim.
 */
export const KEYS = {
  hiddenTypes: 'pogo-utils:events:hidden-types',
  hiddenByView: 'pogo-utils:events:hidden-by-view',
  filterScope: 'pogo-utils:events:filter-scope',
  dismissed: 'pogo-utils:events:dismissed',
  seen: 'pogo-utils:events:seen',
};

/**
 * The unqualified names these five carried before the prefix, which is what a reader who visited between the
 * one-object split and the rename still holds. Spelled out rather than derived by stripping the prefix: what a key
 * used to be called is a fact about the past, and renaming the prefix again must not silently restate it.
 */
const UNPREFIXED_KEYS: Record<keyof typeof KEYS, string> = {
  hiddenTypes: 'events:hidden-types',
  hiddenByView: 'events:hidden-by-view',
  filterScope: 'events:filter-scope',
  dismissed: 'events:dismissed',
  seen: 'events:seen',
};

/** The single object those five replaced, held by a reader whose last visit predates the split. */
const LEGACY_OBJECT_KEY = 'pgo-events:prefs';

/**
 * The sets that object carried. `seen` is deliberately not among them: writing it empty would mark every event new for
 * a reader who has been here for months, where leaving it absent seeds it from the feed — see `settleSeen`.
 */
const LEGACY_SETS: readonly (keyof typeof KEYS)[] = ['hiddenTypes', 'dismissed'];

/**
 * The types hidden on a first visit: the recurring ones, which fire every week and crowd the feed, plus the ones that
 * describe a standing state rather than somewhere to be at a time — Choose Your Path, a GO Battle League rotation, a
 * GO Pass and Twitch Drops. They are `heading`s, the currency of `hiddenTypes`. Once any preference is saved the
 * stored set is authoritative, so turning one of these on sticks.
 *
 * Those extras stay out of `RECURRING_TYPES` because that list also says what the trimmed `events.ics` leaves out,
 * and each is a dated one-off worth keeping in a subscription.
 */
export const DEFAULT_HIDDEN = [...RECURRING_TYPES, 'Choose Your Path', 'GO Battle League', 'GO Pass', 'Twitch Drops'];

/** The same list as a set, for the per-event lookups `isNew` and `settleSeen` do over every event on every render. */
export const RECURRING = new Set(RECURRING_TYPES);

/**
 * One stored value, parsed, or null where the key has never been written or storage cannot be read at all. `unknown`
 * rather than what `JSON.parse` answers, so each reader has to say what it expects before it can use it.
 */
function readJSON(key: string): unknown {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? null : JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * The members of a stored array that are strings, or null where the value is not an array. Filtering is also what
 * narrows: `Array.isArray` alone gets no further than `any[]`, where a `typeof` in a `filter` infers the predicate.
 * Dropping a stray costs nothing — these are compared against `eventID`s and `heading`s.
 */
function stringsOf(value: unknown): string[] | null {
  return Array.isArray(value) ? (value as readonly unknown[]).filter((m) => typeof m === 'string') : null;
}

/** One stored set, or null where its key has never been written. Unreadable storage is the same as never written. */
function readSet(key: string): Set<string> | null {
  const members = stringsOf(readJSON(key));
  return members === null ? null : new Set(members);
}

/**
 * The per-view hidden sets, as far as storage carries them. Left sparse rather than filled out with an empty set per
 * view, because absent is what tells `hiddenFor` to seed a view from the global set.
 */
function readSetsByView(key: string): Record<string, Set<string>> {
  const sets: Record<string, Set<string>> = {};
  const stored = readJSON(key);

  for (const [name, members] of Object.entries(stored === null || typeof stored !== 'object' ? {} : stored)) {
    const strings = stringsOf(members);

    if (strings !== null) {
      sets[name] = new Set(strings);
    }
  }

  return sets;
}

/**
 * Carry a reader's choices onto the names this version reads, from either older shape still out there. Each half
 * catches for itself, so a legacy object that will not parse cannot stop the rename beside it. Order decides a browser
 * holding both — one whose migration failed partway, say: the unqualified keys are the later state, so they go second
 * and win.
 */
function migrateLegacy() {
  carryLegacyObject();
  carryUnprefixedKeys();
}

/**
 * The single object's sets, written under the current names and then dropped. Both are written even where the object
 * carried neither, since an absent key would read as a first visit and hand the defaults back to someone who had
 * unticked them. A value that will not parse is left in place rather than deleted.
 */
function carryLegacyObject() {
  try {
    const stored = localStorage.getItem(LEGACY_OBJECT_KEY);

    if (stored === null) {
      return;
    }

    const parsed: Record<string, unknown> = JSON.parse(stored);

    for (const name of LEGACY_SETS) {
      localStorage.setItem(KEYS[name], JSON.stringify(stringsOf(parsed?.[name]) ?? []));
    }

    localStorage.removeItem(LEGACY_OBJECT_KEY);
  } catch {
    /* Nothing to carry over, or storage is unavailable. */
  }
}

/**
 * Each unqualified key moved under its prefixed name, as the raw string rather than reparsed and rewritten. Copying
 * the bytes is what makes the rename invisible: absent stays absent, empty stays empty, and a value that will not
 * parse arrives to be read exactly as it was read before.
 */
function carryUnprefixedKeys() {
  try {
    for (const [name, unprefixed] of Object.entries(UNPREFIXED_KEYS) as [keyof typeof KEYS, string][]) {
      const stored = localStorage.getItem(unprefixed);

      if (stored !== null) {
        localStorage.setItem(KEYS[name], stored);
        localStorage.removeItem(unprefixed);
      }
    }
  } catch {
    /* Storage is unavailable or full; whatever is left behind is carried on a later visit. */
  }
}

export function loadPrefs(): Prefs {
  migrateLegacy();

  return {
    hiddenTypes: readSet(KEYS.hiddenTypes) ?? new Set(DEFAULT_HIDDEN),
    hiddenByView: readSetsByView(KEYS.hiddenByView),

    // Anything but 'view' is global, so an unwritten or unreadable value lands on the default rather than on a scope
    // no view answers to, which would filter by a set nothing can reach to edit.
    filterScope: readJSON(KEYS.filterScope) === 'view' ? 'view' : 'global',

    dismissed: readSet(KEYS.dismissed) ?? new Set(),

    // Null until the first feed settles it, which is what tells a first visit from a reader who has seen nothing new.
    seen: readSet(KEYS.seen),
  };
}

/** JSON has no Set, so one replacer serialises a bare set and the object of per-view sets alike, as their members. */
const asArrays = (_key: string, value: unknown) => (value instanceof Set ? [...value] : value);

/**
 * Write one preference back, named rather than keyed so a call site cannot pair a key with the wrong value, and one at
 * a time so toggling a type filter does not rewrite the dismissals beside it. `KEYS` and `Prefs` carry the same five
 * names, which makes a name neither of them knows a `TS2345` here rather than an `undefined` key written to storage.
 */
export function persist(prefs: Prefs, name: keyof typeof KEYS) {
  try {
    localStorage.setItem(KEYS[name], JSON.stringify(prefs[name], asArrays));
  } catch {
    /* Storage may be unavailable; the filters still work for the rest of the session. */
  }
}

/**
 * The hidden set the chips are editing, seeded from the global set the first time a view is filtered on its own so
 * switching to per-view filtering keeps what was already hidden. Seeding does not write to storage: a click does, and
 * a seed nothing has clicked says the same as the global set it came from.
 */
export function hiddenFor(prefs: Prefs, view: string) {
  if (prefs.filterScope !== 'view') {
    return prefs.hiddenTypes;
  }

  return (prefs.hiddenByView[view] ??= new Set(prefs.hiddenTypes));
}
