/**
 * A backup of what this app has stored in `localStorage`, read and written as one file. A transport over the
 * `pogo-utils:` namespace and nothing more: it narrows no value, because what a value may be is known to whoever owns
 * the key rather than here — `loadPrefs` already treats storage as a channel that can hand it anything, so a file with
 * a right key name and a wrong value lands in storage and is dropped on the next read, which was handled and tested
 * before this module existed.
 *
 * The namespace is the allowlist. One list decides both what an export carries and which fields an import recognises,
 * rather than two that can come to disagree — and it is what keeps an export off the keys of the other site on this
 * origin, `localStorage` being keyed by origin and not by path.
 */

import { said } from './errors.js';

/**
 * The namespace every key this app owns sits under — `KEYS` in `event-prefs.ts` says why it is the Pages path segment.
 * A field in a backup file is a storage key where it starts with this, and metadata where it does not.
 */
export const KEY_PREFIX = 'pogo-utils:';

/** The one field that is not a storage key, which is why it carries no prefix. */
const VERSION_FIELD = 'version';

/**
 * What a file this code writes says it is, and the only value it will read. Refused rather than read as best it can:
 * a version is the one signal that a key may have come to mean something different, which is the case a lenient
 * reader gets wrong. Adding a key does not bump it — the version says how to read a file, not what is in it.
 */
const VERSION = 1;

/** A backup's date in its name, so successive exports do not land as `… (1).json` and stop saying which is which. */
const dated = (when: Date) => when.toISOString().slice(0, 10);

/** What an export downloads as. */
export const backupName = (when: Date) => `pogo-utils-backup-${dated(when)}.json`;

/**
 * What the copy taken before an import downloads as. Named apart from a deliberate export, because telling the two
 * apart is the whole of its worth to someone recovering from having imported the wrong file.
 */
export const rescueName = (when: Date) => `pogo-utils-backup-before-import-${dated(when)}.json`;

/**
 * The keys this app owns, in whatever order storage lists them. Enumerated rather than named, so a key some later page
 * persists is carried without this module ever learning what it is called.
 */
export function ownedKeys(): string[] {
  const keys: string[] = [];

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);

    if (key !== null && key.startsWith(KEY_PREFIX)) {
      keys.push(key);
    }
  }

  return keys;
}

/**
 * This app's stored keys as the text of a backup file, indented so it can be read and repaired in an editor.
 *
 * Values are parsed and re-emitted rather than carried as strings, which is what makes the file JSON rather than JSON
 * holding JSON. A value that will not parse therefore cannot travel and is left out — which loses nothing, `readJSON`
 * already answering null for one, so the key reads as absent either way.
 *
 * Storage that will not answer is not caught here. Every reader in `event-prefs.ts` swallows that on purpose, because
 * a filter chip still works for the rest of the session; an export that quietly produced an empty backup would be the
 * same silence where it does real harm.
 */
export function writeBackup(): string {
  const fields: Record<string, unknown> = { [VERSION_FIELD]: VERSION };

  for (const key of ownedKeys()) {
    const stored = localStorage.getItem(key);

    if (stored === null) {
      continue;
    }

    try {
      fields[key] = JSON.parse(stored);
    } catch {
      /* Not JSON, so it cannot be a field of one; it reads as absent from either name. */
    }
  }

  return JSON.stringify(fields, null, 2);
}

/**
 * A backup file's fields, or a refusal naming which of the three it is. Three messages rather than one because they
 * ask different things of a reader: a readable file, a file from this site, or a newer page to read it with.
 */
function fieldsOf(text: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`that file is not readable JSON: ${said(e)}`, { cause: e });
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('that file is not a backup: a backup is a JSON object');
  }

  const fields = parsed as Record<string, unknown>;

  // Quoted through `JSON.stringify` rather than interpolated bare: this came out of a file, and a version reading
  // `1` and one reading `"1"` are a refusal a reader has to be able to tell apart.
  if (fields[VERSION_FIELD] !== VERSION) {
    const found = JSON.stringify(fields[VERSION_FIELD]) ?? 'absent';
    throw new Error(`that backup is version ${found}, and this page reads version ${VERSION}`);
  }

  return fields;
}

/**
 * The keys a backup file carries, or a refusal. Separate from `applyBackup` so that nothing a caller does between the
 * two can be undone by a refusal arriving after it: a file is judged whole before storage is touched at all, which is
 * what lets the page take its own copy in between and not take one for a file it is about to turn away.
 *
 * A file carrying no keys is an empty answer rather than a refusal. The version field is what says a file is ours, so
 * a reader who exported on a first visit has a legitimately empty backup — refusing that would turn the one export
 * nobody can reconstruct into the one that cannot be read back.
 */
export function parseBackup(text: string): [string, unknown][] {
  return Object.entries(fieldsOf(text)).filter(([field]) => field.startsWith(KEY_PREFIX));
}

/**
 * Write what `parseBackup` answered into storage, giving back the keys written so a caller can say how much arrived.
 *
 * Keys the file leaves out are left as they stand rather than cleared, so a restore is faithful into cleared storage —
 * which is the loss this exists for — and `Reset` beside it is how to get there. The same choice is what stops a file
 * someone has trimmed by hand from clearing whatever they trimmed.
 */
export function applyBackup(owned: readonly [string, unknown][]): string[] {
  for (const [key, value] of owned) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  return owned.map(([key]) => key);
}
