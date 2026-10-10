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
 *
 * `Partial`, so a key added after the rename declares no earlier name at all. An exhaustive `Record` would make a
 * sixth key a `tsc` error here until it invented one, and the next load would claim that `events:*` name off the
 * shared origin — the harm the prefix exists to prevent, arriving through the type meant to help.
 */
const UNPREFIXED_KEYS: Partial<Record<keyof typeof KEYS, string>> = {
  hiddenTypes: 'events:hidden-types',
  hiddenByView: 'events:hidden-by-view',
  filterScope: 'events:filter-scope',
  dismissed: 'events:dismissed',
  seen: 'events:seen',
};

/**
 * When this app stops touching those names. Reading one, and removing it, claims a name off an origin
 * `joshuaspence.github.io` shares with every repository published there — deliberate, since that is where a reader's
 * own choices are sitting, but worth it only while someone still holds them. They were current for eight days, so the
 * population needing the hop only shrinks from here.
 *
 * A date rather than a one-shot sentinel because a sentinel has to be written, and a store too full to accept that
 * write is exactly the store whose hop would then run forever.
 */
const UNPREFIXED_UNTIL = Date.parse('2027-01-01T00:00:00Z');

/** The single object those five replaced, held by a reader whose last visit predates the split. */
const LEGACY_OBJECT_KEY = 'pgo-events:prefs';

/**
 * The sets that object carried. `seen` is deliberately not among them: writing it empty would mark every event new for
 * a reader who has been here for months, where leaving it absent seeds it from the feed — see `settleSeen`.
 *
 * `as const satisfies` rather than an annotation, so that exclusion is the compiler's and not this comment's.
 * Annotated, `(typeof LEGACY_SETS)[number]` widened back to all five names and `legacySet('seen')` typechecked
 * cleanly — the rule stated above, reachable by anyone who read it, agreed with it and wired up the fallback anyway.
 */
const LEGACY_SETS = ['hiddenTypes', 'dismissed'] as const satisfies readonly (keyof typeof KEYS)[];

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

/** One stored value as it stands, or null where the key has never been written or storage cannot be read at all. */
function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * One stored value, parsed, or null where the key has never been written or storage cannot be read at all. `unknown`
 * rather than what `JSON.parse` answers, so each reader has to say what it expects before it can use it.
 */
function readJSON(key: string): unknown {
  const stored = readRaw(key);

  try {
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
 * Carry a reader's choices onto the names this version reads, from either older shape still out there. Each hop
 * catches for itself and fills only a name nothing has filled yet, so a prefixed value already in place outlives both.
 * The unqualified keys go first, being the later of the two older shapes.
 */
function migrateLegacy() {
  carryUnprefixedKeys();
  carryLegacyObject();
}

/**
 * Each unqualified key copied under its prefixed name and the old one dropped, as the raw string rather than reparsed
 * and rewritten. Copying the bytes is what makes the rename invisible: absent stays absent, empty stays empty, and a
 * value that will not parse arrives to be read exactly as it was read before.
 *
 * The *value* a name the prefix already holds is kept, that being the later one — an earlier pass that stopped partway
 * is how a stale unqualified key comes to sit beside a fresh one. The old *name* is vacated either way: it has lost
 * the precedence contest, and vacating the shared origin is what this hop is for.
 *
 * One `try` per key rather than one around the loop, because the five differ in size by an order of magnitude. A
 * store with room for `filterScope` but not `hiddenByView` would otherwise abandon every key after the refusal, and
 * past `UNPREFIXED_UNTIL` nothing comes back for them.
 */
function carryUnprefixedKeys() {
  if (Date.now() >= UNPREFIXED_UNTIL) {
    return;
  }

  for (const [name, unprefixed] of Object.entries(UNPREFIXED_KEYS) as [keyof typeof KEYS, string][]) {
    try {
      const stored = localStorage.getItem(unprefixed);

      if (stored === null) {
        continue;
      }

      if (localStorage.getItem(KEYS[name]) === null) {
        localStorage.setItem(KEYS[name], stored);
      }

      localStorage.removeItem(unprefixed);
    } catch {
      /* This one stays where it is, and `keyFor` reads it there until a later visit can move it. */
    }
  }
}

/**
 * The single object's sets, written under the current names and then dropped. A name already filled is left as it is;
 * the rest are written even where the object carried neither, since an absent key would read as a first visit and hand
 * the defaults back to someone who had unticked them. A value that will not parse is left in place rather than
 * deleted.
 */
function carryLegacyObject() {
  try {
    const stored = localStorage.getItem(LEGACY_OBJECT_KEY);

    if (stored === null) {
      return;
    }

    const parsed: Record<string, unknown> = JSON.parse(stored);

    for (const name of LEGACY_SETS) {
      if (localStorage.getItem(KEYS[name]) === null) {
        localStorage.setItem(KEYS[name], JSON.stringify(stringsOf(parsed?.[name]) ?? []));
      }
    }

    localStorage.removeItem(LEGACY_OBJECT_KEY);
  } catch {
    /* Nothing to carry over, or the write was refused; `legacySet` reads the object where it stands meanwhile. */
  }
}

/**
 * Which name to read one preference from: its own, or the unqualified name it used to have where the value is still
 * sitting there. `carryUnprefixedKeys` normally moves it, but `localStorage` quota is per origin and this app shares
 * one, so a store a sibling has filled refuses that write for good rather than for this visit. Reading through is what
 * keeps a reader's saved choices visible instead of handing back the defaults they had unticked.
 */
function keyFor(name: keyof typeof KEYS): string {
  const unprefixed = UNPREFIXED_KEYS[name];

  if (unprefixed === undefined || Date.now() >= UNPREFIXED_UNTIL) {
    return KEYS[name];
  }

  return readRaw(KEYS[name]) === null ? unprefixed : KEYS[name];
}

/**
 * One set as the legacy object still carries it, for a reader whose last visit predates the split and whose store
 * refused `carryLegacyObject`'s write. The same read-through `keyFor` does, one shape older — a set nested in an
 * object cannot be named by a key, so it needs its own reader rather than another candidate name.
 *
 * Empty rather than null where the object parses without this set, matching what `carryLegacyObject` writes: the
 * object is proof of an earlier visit, so a missing set is one the reader cleared, not a first visit.
 */
function legacySet(name: (typeof LEGACY_SETS)[number]): Set<string> | null {
  const stored = readJSON(LEGACY_OBJECT_KEY);

  if (stored === null || typeof stored !== 'object') {
    return null;
  }

  return new Set(stringsOf((stored as Record<string, unknown>)[name]) ?? []);
}

export function loadPrefs(): Prefs {
  migrateLegacy();

  return {
    hiddenTypes: readSet(keyFor('hiddenTypes')) ?? legacySet('hiddenTypes') ?? new Set(DEFAULT_HIDDEN),
    hiddenByView: readSetsByView(keyFor('hiddenByView')),

    // Anything but 'view' is global, so an unwritten or unreadable value lands on the default rather than on a scope
    // no view answers to, which would filter by a set nothing can reach to edit.
    filterScope: readJSON(keyFor('filterScope')) === 'view' ? 'view' : 'global',

    dismissed: readSet(keyFor('dismissed')) ?? legacySet('dismissed') ?? new Set(),

    // Null until the first feed settles it, which is what tells a first visit from a reader who has seen nothing new.
    // No legacy fallback, and `legacySet` will not take `seen` to give it one — see `LEGACY_SETS`.
    seen: readSet(keyFor('seen')),
  };
}

/**
 * Every name a preference can be sitting under, removed, so that a Reset lands on a genuine first visit. `KEYS` stopped
 * being that set the moment reads began falling through: a page clearing those five alone leaves an `events:*` value to
 * be read straight back, and on a store that refused one write the next hop then carries the dismissal the reader had
 * just cleared up under the prefixed name. The legacy object goes too, for the same reason — it is a source reads
 * reach, so leaving it is leaving a Reset to be undone.
 *
 * Here rather than at the call site because `UNPREFIXED_KEYS` and the window are this module's, and a page enumerating
 * its own copy of the key set is a copy that falls out of step with this file.
 */
export function clearPrefs() {
  const older = Date.now() < UNPREFIXED_UNTIL ? Object.values(UNPREFIXED_KEYS) : [];

  for (const key of [...Object.values(KEYS), ...older, LEGACY_OBJECT_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Storage is unavailable, so there is nothing stored to clear. */
    }
  }
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
