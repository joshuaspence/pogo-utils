/**
 * A `localStorage` for a test: the members the preference readers and the backup transport use, over a Map, plus two
 * ways to fail — `throws`, which makes every call raise as a browser in private mode does, and `refusesWrites`, which
 * raises on `setItem` alone while reads still answer. The two are not interchangeable: quota is per origin, so a store
 * another site on the origin has filled is one this app can read for good but never write, and a reader whose
 * preferences are only readable is the case a migration that moves rather than reads through would lose.
 *
 * Installed as the global rather than injected, because `localStorage` being a global is the thing under test: a
 * parameter would let a test reach a state the page cannot.
 */
export class FakeStorage {
  readonly #entries = new Map<string, string>();

  throws = false;

  refusesWrites = false;

  /**
   * The same refusal for named keys alone, which is what a store with room for a short value but not a long one does.
   * Mutable so a test can free the space again, the interesting states being the ones a single refusal leaves behind.
   */
  readonly refusesWritesTo = new Set<string>();

  /** With `key`, what lets a reader enumerate the store rather than name what it is looking for. */
  get length() {
    this.#check();
    return this.#entries.size;
  }

  /** The name at this position, or null past the end, which is what the real one answers. */
  key(index: number) {
    this.#check();
    return [...this.#entries.keys()][index] ?? null;
  }

  getItem(key: string) {
    this.#check();
    return this.#entries.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.#check();

    if (this.refusesWrites || this.refusesWritesTo.has(key)) {
      throw new DOMException('the quota has been exceeded', 'QuotaExceededError');
    }

    this.#entries.set(key, String(value));
  }

  removeItem(key: string) {
    this.#check();
    this.#entries.delete(key);
  }

  /** What the store holds, for an assertion about what was written rather than about what reads back. */
  snapshot() {
    return Object.fromEntries(this.#entries);
  }

  #check() {
    if (this.throws) {
      throw new DOMException('storage is unavailable', 'SecurityError');
    }
  }
}

/**
 * Put a fresh one in place of the global and answer it. A test calls this in a `beforeEach`, so no case can see what
 * another wrote — the readers' whole subject being what an absent key means.
 */
export function installFakeStorage() {
  const storage = new FakeStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  return storage;
}
