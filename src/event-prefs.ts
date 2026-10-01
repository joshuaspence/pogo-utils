/**
 * The events page's saved choices: what is stored, how a stored value that cannot be used is treated, and what a first
 * visit gets instead.
 *
 * All of it is about `localStorage` and none of it about the DOM, which is what lets a test reach the distinction the
 * whole design turns on — absent is not empty. A key that has never been written means a first visit and so the default
 * hidden types; one holding an empty list means a reader who cleared everything. `src/events.ts` holds the live `prefs`
 * object and is what re-renders when one changes.
 */

import RECURRING_TYPES from './recurring-types.js';

/**
 * The reader's saved choices, keyed the way KEYS is so persist() can take a name alone.
 *
 * `seen` is nullable and the nullability is load-bearing: null is a first visit, where an empty set is a reader who has
 * acknowledged everything — see settleSeen().
 */
export interface Prefs {
  hiddenTypes: Set<string>;
  hiddenByView: Record<string, Set<string>>;

  /** Which set the chips edit: the global one, or the current view's own. */
  filterScope: 'global' | 'view';

  dismissed: Set<string>;
  seen: Set<string> | null;
}

/**
 * The type filters and per-event dismissals persist in localStorage so a reader's choices survive a reload. Types are
 * stored as the *hidden* set rather than the visible one, so a category the feed adds later shows up by default instead
 * of being silently filtered out by a stale allow-list. The Reset control clears every key.
 *
 * One key per set rather than one object holding all of them, so each carries its own absent-versus-empty distinction
 * and writing one cannot decide another. `hiddenTypes` needs that: absent means a first visit and so DEFAULT_HIDDEN,
 * where empty means a reader who cleared everything, and in a shared object saving any one set would settle that
 * question for all of them.
 *
 * `hiddenByView` is the exception and holds one set per view, because there the distinction is per view and survives
 * inside the object: a view with no slot has never been filtered on its own and is seeded from the global set, where
 * one with an empty array is a view whose chips are all on. Three keys would say the same thing and leave the set of
 * views spelled out in the key names.
 *
 * The property names are the ones `prefs` uses, which is what lets persist() take a name alone.
 */
export const KEYS = {
  hiddenTypes: 'events:hidden-types',
  hiddenByView: 'events:hidden-by-view',
  filterScope: 'events:filter-scope',
  dismissed: 'events:dismissed',
  seen: 'events:seen',
};

/**
 * The single object these keys replaced, read once to carry an existing reader's choices across — see migrateLegacy().
 *
 * It keeps the `pgo-` prefix the others have dropped because this one is not ours to name: it is the key sitting in
 * readers' browsers already, and spelling it any other way finds nothing and silently discards their choices.
 */
const LEGACY_KEY = 'pgo-events:prefs';

/**
 * The sets that object carried, and so all migrateLegacy() can bring across. `seen` is deliberately not among them: it
 * has no legacy value, and writing it empty would say a reader who has been here for months has seen nothing, marking
 * every event on the page new. Left absent instead, it seeds from the feed like a first visit — see settleSeen().
 */
const LEGACY_SETS: readonly (keyof typeof KEYS)[] = ['hiddenTypes', 'dismissed'];

/**
 * The types hidden on a first visit, so the default view leads with the events a reader is more likely to plan around:
 * the recurring ones, which fire every week and crowd the feed, plus three that describe a standing state rather than
 * somewhere to be at a time — a GO Battle League rotation, a GO Pass and Choose Your Path. They are `heading`s, the
 * currency of `hiddenTypes`, so the type chips draw them dimmed. Once any preference is saved the stored hidden set is
 * authoritative, so turning one of these on sticks; Reset returns to this default rather than to an empty set.
 *
 * The three extras stay out of RECURRING_TYPES because that list also says which types the trimmed calendar feed
 * (events.ics) leaves out, and each of these is a dated one-off worth keeping in a subscription.
 */
export const DEFAULT_HIDDEN = [...RECURRING_TYPES, 'Choose Your Path', 'GO Battle League', 'GO Pass'];

/** The same list as a set, for the per-event lookups isNew() and settleSeen() do over every event on every render. */
export const RECURRING = new Set(RECURRING_TYPES);

/**
 * One stored value, parsed, or null where the key has never been written or storage cannot be read at all. The three
 * readers below share this because they differ only in the shape they expect back, and each of them treats a value it
 * cannot use the same way it treats a missing one: the default applies.
 *
 * `unknown` rather than what `JSON.parse` answers, so that each reader has to say what it expects before it can use it
 * — which is what those readers were already doing at run time.
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
 * The members of a stored array that are strings, or null where the value is not an array at all. Filtering rather than
 * trusting is the documented stance one level up — a value we cannot use is treated as a missing one — and it is also
 * what narrows: `Array.isArray` alone gets no further than `any[]`, where a `typeof` in a `filter` infers the
 * predicate.
 *
 * A stray non-string could only come from a store someone else has written, and dropping it costs nothing: these are
 * compared against `eventID`s and `heading`s, so a number among them is a member nothing can ever equal.
 */
function stringsOf(value: unknown): string[] | null {
  return Array.isArray(value) ? (value as readonly unknown[]).filter((m) => typeof m === 'string') : null;
}

/**
 * One stored set, or null where its key has never been written. Null rather than an empty set because the two mean
 * different things to `hiddenTypes`, and unreadable storage (private mode, disabled) is the same as never written.
 */
function readSet(key: string): Set<string> | null {
  const members = stringsOf(readJSON(key));
  return members === null ? null : new Set(members);
}

/**
 * The per-view hidden sets, as far as storage carries them, which may be none of them. Left sparse rather than filled
 * out with an empty set per view, because absent is what tells hiddenFor() to seed a view from the global set — filling
 * them would say instead that every view has had its chips cleared.
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
 * Carry a reader's choices over from the single object the separate keys replaced, then drop it, so the old shape is
 * known to this one function rather than to every read. Both sets are written even when empty, because an absent key
 * would otherwise read as a first visit and hand back the default hidden types to someone who had unticked them.
 *
 * A value that will not parse is left in place rather than deleted: it is data we could not read, and the defaults
 * apply meanwhile exactly as they would for a first visit.
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

    // Anything but 'view' is global, so a value that was never written or that we cannot make sense of lands on the
    // default rather than on a scope no view answers to, which would filter by a set nothing can reach to edit.
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
 * a time so toggling a type filter does not rewrite the dismissals beside it.
 *
 * `KEYS` and `Prefs` carry the same five names, which is what makes one argument enough — and what makes a name neither
 * of them knows a `TS2345` here rather than an `undefined` key written to storage.
 */
export function persist(prefs: Prefs, name: keyof typeof KEYS) {
  try {
    localStorage.setItem(KEYS[name], JSON.stringify(prefs[name], asArrays));
  } catch {
    /* Storage may be unavailable; the filters still work for the rest of the session. */
  }
}

/**
 * The hidden set the chips are editing: the global one, or this view's own — seeded from the global set the first time a
 * view is filtered on its own, so switching to per-view filtering keeps what was already hidden rather than reading as a
 * bug. Seeding does not write to storage: a click does, and a seed nothing has clicked says the same as the global set
 * it came from.
 */
export function hiddenFor(prefs: Prefs, view: string) {
  if (prefs.filterScope !== 'view') {
    return prefs.hiddenTypes;
  }

  return (prefs.hiddenByView[view] ??= new Set(prefs.hiddenTypes));
}
