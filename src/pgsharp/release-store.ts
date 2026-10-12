/**
 * The vended PGSharp release, held where every tab can reach it, and the one version this browser has acknowledged.
 *
 * Two things read the release: the Integrations page names it on its download button, and the top bar's notifications
 * report it when it is newer than what the reader last cleared. One load between them, so a reader opening Integrations
 * fetches the file once rather than once per reader of it.
 *
 * The acknowledged version is stored under `ACKNOWLEDGED_KEY`, and the design turns on the same distinction
 * `event-prefs.ts` draws: absent is not the same as a version. A key never written is a first visit, and the release
 * found then becomes the baseline rather than news — the reasoning `settleSeen` applies to the events. After that, any
 * other version is a notice until it is cleared, whether PGSharp moved forward or (rarely) back.
 *
 * Nothing here is on a timer either. The file is read once per document, and a new release reaches a reader the next
 * time they load the page after the Vend workflow commits it.
 */

import { useEffect, useState } from 'preact/hooks';

import { said } from '../errors.js';
import { KEY_PREFIX } from '../event-prefs.js';
import { releaseFromApk, VENDED_RELEASE, type Release } from './release.js';

/**
 * Under `KEY_PREFIX`, so `src/backup.ts`'s sweep carries it. Stored as a JSON string rather than the bare version,
 * since a backup carries values it can parse and leaves out the rest.
 */
export const ACKNOWLEDGED_KEY = `${KEY_PREFIX}pgsharp:acknowledged`;

/**
 * The release `scripts/vend-pgsharp.mts` last wrote, its URL put through the same `releaseFromApk` the vend did, so
 * whatever links to it links to `dl.pgsharp.com` or to nothing read here. A miss of any kind is null rather than a
 * failure: the button falls back to PGSharp's unversioned link, and the notifications report nothing.
 */
export async function fetchRelease(): Promise<Release | null> {
  try {
    const res = await fetch(VENDED_RELEASE, { cache: 'default' });

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }

    const raw: Partial<Release> = await res.json();

    if (typeof raw.url !== 'string') {
      throw new Error('no url');
    }

    return releaseFromApk(raw.url);
  } catch (e) {
    console.error(`${VENDED_RELEASE}: ${said(e)} — no PGSharp version to show`);
    return null;
  }
}

/**
 * The stored version, or null where none is stored or storage will not answer. Read through on every call rather than
 * cached, so an import that has just written the key is what the next render sees without being told.
 */
function readAcknowledged(): string | null {
  try {
    const stored = localStorage.getItem(ACKNOWLEDGED_KEY);
    const value: unknown = stored === null ? null : JSON.parse(stored);

    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Store the version. A refusal is swallowed, as `event-prefs.ts` swallows one: the notice then comes back on the next
 * load, which is the cost of a store that cannot be written rather than something to fail the page over.
 */
function writeAcknowledged(version: string) {
  try {
    localStorage.setItem(ACKNOWLEDGED_KEY, JSON.stringify(version));
  } catch {
    // See above.
  }
}

/**
 * The release, and who to tell when it lands or is acknowledged. A class rather than module state so a test can start
 * from nothing; the document has the one instance below.
 */
export class ReleaseStore {
  /** Null until a load lands, and after one that found nothing it could trust. */
  release: Release | null = null;

  readonly #fetchRelease: () => Promise<Release | null>;
  readonly #listeners = new Set<() => void>();
  #loaded: Promise<void> | null = null;

  constructor(fetch = fetchRelease) {
    this.#fetchRelease = fetch;
  }

  /** The file once per document, whichever reader asks first; the rest are handed the same load. */
  ensureLoaded(): Promise<void> {
    return (this.#loaded ??= this.#load());
  }

  /**
   * The release, while it is one the reader has not acknowledged. Null before it loads, on a first visit (which the
   * load has already settled into the baseline) and once it has been cleared.
   *
   * Null too with no version stored at all, which after a load means storage that would not take the baseline. That
   * reader cannot clear a notice either, so showing one would show it on every visit for good.
   */
  unacknowledged(): Release | null {
    const release = this.release;
    const acknowledged = readAcknowledged();

    return release !== null && acknowledged !== null && acknowledged !== release.version ? release : null;
  }

  /** Acknowledge the release on offer, which clears its notice until the next version. */
  acknowledge() {
    if (this.release !== null) {
      writeAcknowledged(this.release.version);
      this.emit();
    }
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  emit() {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  async #load() {
    const release = await this.#fetchRelease();

    // A first visit: what is current now is the baseline, not news. Settled only from a release that loaded, so a
    // failed fetch cannot leave the key unset in a way that later reads as anything but a first visit.
    if (release !== null && readAcknowledged() === null) {
      writeAcknowledged(release.version);
    }

    this.release = release;
    this.emit();
  }
}

/** The document's store, which the top bar and the Integrations page share. */
export const releaseStore = new ReleaseStore();

/** The store, with the calling component redrawn whenever it changes. */
export function useReleaseStore() {
  const [, redraw] = useState(0);

  useEffect(() => releaseStore.subscribe(() => redraw((count) => count + 1)), []);

  return releaseStore;
}
