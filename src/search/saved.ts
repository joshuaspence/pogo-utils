/**
 * The searches a reader has kept under a name of their own, in `localStorage` beside the events page's choices and so
 * carried by the same Settings backup, which sweeps the namespace rather than naming keys.
 *
 * A search is kept as its link fragment, the one serialisation of an arrangement the page already reads back from a
 * stranger, so a saved search and a shared link cannot come to mean different things.
 */

import { KEY_PREFIX } from '../event-prefs.js';

export interface Saved {
  name: string;
  fragment: string;
}

export const SAVED_KEY = `${KEY_PREFIX}search:saved`;

const isSaved = (value: unknown): value is Saved =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as Saved).name === 'string' &&
  typeof (value as Saved).fragment === 'string';

/**
 * What is kept, or nothing. Storage is a channel that can hand back anything — a backup edited by hand, or storage that
 * will not answer at all — so an entry of the wrong shape is dropped rather than drawn, and a refusal reads as empty:
 * the page still builds searches without the list.
 */
export function readSaved(): Saved[] {
  try {
    const stored = localStorage.getItem(SAVED_KEY);
    const value: unknown = stored === null ? null : JSON.parse(stored);

    return Array.isArray(value) ? value.filter(isSaved) : [];
  } catch {
    return [];
  }
}

/**
 * The list with one search kept under `name`, taking the place of any already kept under it so a name says one thing.
 * Storage refusing the write is not caught: the reader asked for this one by name, and has to be told it did not stick.
 */
export function keep(list: readonly Saved[], name: string, fragment: string): Saved[] {
  const at = list.findIndex((one) => one.name === name);
  const next = at === -1 ? [...list, { name, fragment }] : list.with(at, { name, fragment });

  localStorage.setItem(SAVED_KEY, JSON.stringify(next));

  return next;
}

/** The list without the search kept under `name`. Thrown on a refusal for the reason `keep` gives. */
export function forget(list: readonly Saved[], name: string): Saved[] {
  const next = list.filter((one) => one.name !== name);

  localStorage.setItem(SAVED_KEY, JSON.stringify(next));

  return next;
}
