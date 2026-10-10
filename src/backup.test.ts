import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { applyBackup, backupName, ownedKeys, parseBackup, rescueName, writeBackup } from './backup.js';
import { KEYS, loadPrefs, persist, type Prefs } from './event-prefs.js';
import { installFakeStorage, type FakeStorage } from './testing/storage.js';

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeStorage();
});

// The zone sweep below installs one, and a zone left behind would silently follow every later test in the file.
afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * The two halves run together, which is what a restore is. Composed here so most cases read as the one step they are
 * about, and the property the split exists for — that judging a file touches nothing — gets a test of its own rather
 * than being implied by all of them.
 */
const restore = (text: string) => applyBackup(parseBackup(text));

/** A reader with every kind of value in play: two sets, the per-view object, the scalar, and a populated `seen`. */
function storePrefs(): Prefs {
  const prefs: Prefs = {
    hiddenTypes: new Set(['Community Day', 'Raid Hour']),
    hiddenByView: { cards: new Set(['Raid Hour']), calendar: new Set() },
    filterScope: 'view',
    dismissed: new Set(['event-a']),
    seen: new Set(['event-b', 'event-c']),
  };

  for (const name of Object.keys(KEYS) as (keyof typeof KEYS)[]) {
    persist(prefs, name);
  }

  return prefs;
}

/**
 * The restore this exists for: a browser cleared, then the file read back. Driven through `persist` and `loadPrefs`
 * rather than against the file's text, because what has to survive is the `Prefs` a reader sees and not a spelling.
 */
test('a cleared browser restores to the preferences it was exported from', () => {
  const was = storePrefs();
  const text = writeBackup();

  storage = installFakeStorage();
  expect(loadPrefs().dismissed).toEqual(new Set());

  restore(text);

  expect(loadPrefs()).toEqual(was);
});

/**
 * `seen` null is a first visit and `seen` empty is a reader who has acknowledged everything, and the two have to stay
 * apart across a round trip — this being the distinction the whole of `event-prefs.ts` is built on, and the one a JSON
 * round trip is most likely to quietly collapse. An absent key and a `null` one both read as a first visit, so the
 * assertion is on what `loadPrefs` answers rather than on which of the two the file carries.
 */
test.for([
  { seen: 'absent', write: () => undefined, reads: null },
  { seen: 'null', write: () => persist({ ...emptyPrefs(), seen: null }, 'seen'), reads: null },
  { seen: 'empty', write: () => persist({ ...emptyPrefs(), seen: new Set<string>() }, 'seen'), reads: new Set() },
  { seen: 'populated', write: () => persist({ ...emptyPrefs(), seen: new Set(['e']) }, 'seen'), reads: new Set(['e']) },
])('a seen set that is $seen round-trips as itself', ({ write, reads }) => {
  write();

  const text = writeBackup();
  storage = installFakeStorage();
  restore(text);

  expect(loadPrefs().seen).toEqual(reads);
});

const emptyPrefs = (): Prefs => ({
  hiddenTypes: new Set(),
  hiddenByView: {},
  filterScope: 'global',
  dismissed: new Set(),
  seen: null,
});

/**
 * `localStorage` is keyed by origin and `joshuaspence.github.io` serves every repository published there, so the store
 * an export reads holds another site's keys too. They are not this app's to carry, and the assertion is that the file
 * says so in both directions: not exported, and not written back.
 */
test('a key belonging to another site on this origin is neither carried nor written', () => {
  storage.setItem('other-project:token', '"secret"');
  persist({ ...emptyPrefs(), dismissed: new Set(['event-a']) }, 'dismissed');

  const text = writeBackup();

  expect(Object.keys(JSON.parse(text))).toEqual(['version', KEYS.dismissed]);

  storage = installFakeStorage();
  storage.setItem('other-project:token', '"mine"');
  restore(JSON.stringify({ 'version': 1, 'other-project:token': 'theirs', [KEYS.dismissed]: ['event-a'] }));

  expect(storage.getItem('other-project:token')).toBe('"mine"');
});

/**
 * Keys the file leaves out are left as they stand. That is what makes a restore faithful only into cleared storage —
 * the browser's own site data, `Reset` reaching the five keys the page names and not a key written through by an
 * import — and what stops a file trimmed by hand from clearing what was trimmed.
 */
test('a key the file omits is left as it was', () => {
  storePrefs();

  restore(JSON.stringify({ version: 1, [KEYS.dismissed]: ['from-file'] }));

  const prefs = loadPrefs();

  expect(prefs.dismissed).toEqual(new Set(['from-file']));
  expect(prefs.hiddenTypes).toEqual(new Set(['Community Day', 'Raid Hour']));
  expect(prefs.seen).toEqual(new Set(['event-b', 'event-c']));
});

/**
 * A key inside the namespace that nothing reads yet is written through rather than dropped, so restoring this year's
 * file into next year's page keeps what that page will be able to use. Dropping it would be a silent loss of exactly
 * the thing a backup is for.
 */
test('a key in the namespace with no reader yet is written through', () => {
  restore(JSON.stringify({ 'version': 1, 'pogo-utils:map:selected': ['a-route'] }));

  expect(storage.getItem('pogo-utils:map:selected')).toBe('["a-route"]');
});

/** Enumerated rather than named, which is the same property from the other end: nothing lists the keys to carry. */
test('ownedKeys answers what is in the namespace and nothing else', () => {
  storage.setItem('other-project:token', '"secret"');
  storage.setItem('pogo-utils:map:selected', '[]');
  persist({ ...emptyPrefs(), dismissed: new Set() }, 'dismissed');

  expect(ownedKeys().sort()).toEqual([KEYS.dismissed, 'pogo-utils:map:selected']);
});

/**
 * A stored value that is not JSON cannot be a field of a JSON file, so it is left out. Nothing is lost: `readJSON`
 * answers null for it, so the key reads as absent from either name. The key beside it still travels, which is what
 * says the one value was skipped rather than the export abandoned.
 */
test('a stored value that is not JSON is left out, and the rest still travel', () => {
  storage.setItem(KEYS.hiddenTypes, '{oh no');
  persist({ ...emptyPrefs(), dismissed: new Set(['event-a']) }, 'dismissed');

  expect(Object.keys(JSON.parse(writeBackup()))).toEqual(['version', KEYS.dismissed]);
});

/**
 * A version refusal is checked by the same file *becoming accepted* once its version alone is corrected, the rest of
 * the file left exactly as it was. That is the strong form, and the one worth having here: a version is read before
 * any key is, so a refusal that was really about the key beside it would look identical from the outside, and the
 * repaired file's own key coming back is what tells the two apart.
 */
test.for([
  { refusing: 'a version this page cannot read', bad: '{"version":2,"pogo-utils:x":1}', matching: /version 2/ },
  { refusing: 'a version as a string', bad: '{"version":"1","pogo-utils:x":1}', matching: /version "1"/ },
  { refusing: 'no version at all', bad: '{"pogo-utils:x":1}', matching: /version absent/ },
])('$refusing is refused, where the same file with its version corrected is not', ({ bad, matching }) => {
  expect(() => restore(bad)).toThrow(matching);

  expect(restore(JSON.stringify({ ...(JSON.parse(bad) as object), version: 1 }))).toEqual(['pogo-utils:x']);
});

/**
 * A file that is not a JSON object at all, refused with the message that names which defect it has. The weaker claim
 * of the two, and said rather than dressed up: there is no "same file corrected" for `null` or `'{oh no'` — no version
 * to put right and no key to come back — so what rules out a reader that simply refuses everything is the table above,
 * plus every accepting case in this file. What these four add is that each defect is reported as itself.
 */
test.for([
  { refusing: 'text that is not JSON', bad: '{oh no', matching: /not readable JSON/ },
  { refusing: 'a JSON array', bad: '[]', matching: /a JSON object/ },
  { refusing: 'JSON null', bad: 'null', matching: /a JSON object/ },
  { refusing: 'a bare string', bad: '"a backup"', matching: /a JSON object/ },
])('$refusing is refused as what it is', ({ bad, matching }) => {
  expect(() => restore(bad)).toThrow(matching);
});

/**
 * Judging a file touches nothing, which is the whole reason the two halves are separate. The page leans on it: it
 * downloads a copy of the current preferences between the two, and must not take one for a file it then turns away.
 */
test('parsing a file writes nothing, acceptable or not', () => {
  storePrefs();

  const before = storage.snapshot();

  expect(parseBackup(JSON.stringify({ version: 1, [KEYS.dismissed]: ['from-file'] }))).toEqual([
    [KEYS.dismissed, ['from-file']],
  ]);
  expect(() => parseBackup('{"version":2}')).toThrow();

  expect(storage.snapshot()).toEqual(before);
});

/** A refusal must not be a partial write: a reader who picks the wrong file keeps what they had. */
test('a refused file leaves storage exactly as it was', () => {
  storePrefs();

  const before = storage.snapshot();

  expect(() => restore(JSON.stringify({ version: 2, [KEYS.dismissed]: ['wrong'] }))).toThrow();
  expect(() => restore('{oh no')).toThrow();

  expect(storage.snapshot()).toEqual(before);
});

/**
 * A reader who exported on a first visit has a file with nothing in it but the version, and reading it back writes
 * nothing rather than being turned away — the version is what says a file is ours, so a file naming no key of ours is
 * one with nothing to say rather than one to refuse. A file of someone else's keys lands here too, harmlessly.
 */
test.for([
  { carrying: 'nothing but a version', text: '{"version":1}' },
  { carrying: "another site's keys only", text: '{"version":1,"other:x":1}' },
])('a backup carrying $carrying writes nothing and does not throw', ({ text }) => {
  storePrefs();

  const before = storage.snapshot();

  expect(restore(text)).toEqual([]);
  expect(storage.snapshot()).toEqual(before);
});

/**
 * Storage that will not answer is reported rather than swallowed. `persist` swallows it on purpose — a filter chip
 * still works for the rest of the session — but the same silence here would hand a reader an empty backup, or tell
 * them a restore had happened when nothing was written.
 */
test('storage that will not answer is reported rather than silently empty', () => {
  storage.throws = true;

  expect(() => writeBackup()).toThrow();
  expect(() => restore(JSON.stringify({ version: 1, [KEYS.dismissed]: [] }))).toThrow();
});

/**
 * The file is indented, because a lossless backup whose point is to be repairable has to be readable in an editor —
 * and `scripts/prune-events.mts` already writes `data/events.json` the same way.
 */
test('the file is indented JSON a reader can open', () => {
  persist({ ...emptyPrefs(), dismissed: new Set(['event-a']) }, 'dismissed');

  expect(writeBackup()).toBe(`{\n  "version": 1,\n  "${KEYS.dismissed}": [\n    "event-a"\n  ]\n}`);
});

/**
 * Dated, because a fixed name makes the browser number successive exports and they stop saying which is which — and
 * the rescue copy is named apart, telling the two apart being the whole of its worth to someone recovering.
 */
test('the two names are dated, and differ from each other', () => {
  const when = new Date('2026-10-09T12:00:00Z');

  expect(backupName(when)).toBe('pogo-utils-backup-2026-10-09.json');
  expect(rescueName(when)).toBe('pogo-utils-backup-before-import-2026-10-09.json');
});

/**
 * The day named is the reader's own, which is a sweep rather than one case because the suite's machine has a zone too:
 * each row's UTC date differs from the day it is dated, so a name read off `toISOString` fails here — where a single
 * instant would only have failed on a machine that happened to sit east or west of the file's author.
 *
 * Both directions are covered on purpose. East of UTC the local day runs ahead of the UTC one, west of it behind, and
 * a `getDate` that had been written as a `getUTCDate` is wrong in opposite directions in the two.
 */
test.for([
  { at: '2026-10-09T22:30:00Z', zone: 'Australia/Sydney', dated: '2026-10-10' },
  { at: '2026-10-09T02:30:00Z', zone: 'America/New_York', dated: '2026-10-08' },
  { at: '2026-10-09T12:00:00Z', zone: 'UTC', dated: '2026-10-09' },
])('an export at $at is dated $dated for a reader in $zone', ({ at, zone, dated }) => {
  vi.stubEnv('TZ', zone);

  expect(backupName(new Date(at))).toBe(`pogo-utils-backup-${dated}.json`);
});

/**
 * A write that fails partway puts back what it found, so the half-written store is a state this cannot reach. The
 * reader near their quota is the one who meets it: `hiddenTypes` from the file and `dismissed` from before it would
 * leave the page drawing from neither, and the status line says the restore failed in either case — so the failure
 * has to be the whole of what happened.
 *
 * The refused key is the *second* of the two written, which is what makes this a rollback rather than a write that
 * never started: the first key has already been set when the throw arrives and has to be walked back. Its earlier
 * value and an absent one are both checked, an absent key put back as empty being a value the file never carried —
 * and for `seen` the difference between the two is a first visit against a reader who has acknowledged everything.
 */
test('a write that fails partway puts back what it found', () => {
  persist({ ...emptyPrefs(), hiddenTypes: new Set(['Community Day']) }, 'hiddenTypes');

  const before = storage.snapshot();

  expect(before[KEYS.seen]).toBeUndefined();

  storage.refusesWritesTo.add(KEYS.seen);

  expect(() =>
    restore(JSON.stringify({ version: 1, [KEYS.hiddenTypes]: ['Raid Hour'], [KEYS.seen]: ['event-a'] })),
  ).toThrow(/quota/);

  expect(storage.snapshot()).toEqual(before);
});
