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
 */
export const KEYS = {
  hiddenTypes: 'events:hidden-types',
  hiddenByView: 'events:hidden-by-view',
  filterScope: 'events:filter-scope',
  dismissed: 'events:dismissed',
  seen: 'events:seen',
};

/**
 * The single object these keys replaced — see `migrateLegacy`. It keeps the `pgo-` prefix the others have dropped
 * because this one is not ours to name: it is the key already sitting in readers' browsers.
 */
const LEGACY_KEY = 'pgo-events:prefs';

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
 * Carry a reader's choices over from the single object the separate keys replaced, then drop it. Both sets are written
 * even when empty, since an absent key would read as a first visit and hand the defaults back to someone who had
 * unticked them. A value that will not parse is left in place rather than deleted.
 */
function migrateLegacy() {
  try {
    const stored = localStorage.getItem(LEGACY_KEY);

    if (stored === null) {
      return;
    }

    const parsed: Record<string, unknown> = JSON.parse(stored);

    for (const name of LEGACY_SETS) {
      localStorage.setItem(KEYS[name], JSON.stringify(stringsOf(parsed?.[name]) ?? []));
    }

    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* Nothing to carry over, or storage is unavailable. */
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
