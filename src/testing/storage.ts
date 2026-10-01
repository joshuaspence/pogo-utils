/**
 * A `localStorage` for a test: the three members the preference readers use, over a Map, plus the one thing the real API
 * does that a Map does not — `throws` makes every call raise, which is what a browser in private mode or with storage
 * disabled does and is the case every reader has a `catch` for.
 *
 * Installed as the global rather than injected, because `localStorage` being a global is the thing under test: the
 * readers treat an unreadable store exactly as they treat a key that was never written, and a parameter would let a
 * test reach a state the page cannot.
 */
export class FakeStorage {
  readonly #entries = new Map<string, string>();

  throws = false;

  getItem(key: string) {
    this.#check();
    return this.#entries.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.#check();
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
