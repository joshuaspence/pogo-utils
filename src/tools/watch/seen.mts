/**
 * The spawns already notified, so that the same one on the next poll — and on every poll until it despawns — reaches
 * the phone once. Keyed by `encounter_id`, which is the spawn's own identity rather than anything a query says about
 * it, so two queries matching one spawn are one notification as well.
 *
 * Asking and remembering are separate so that a spawn is remembered only once its notification has gone or been given
 * up on: one ntfy refused is tried again on a later poll rather than lost.
 *
 * Each is forgotten after its despawn rather than kept for the life of the process: a watcher left running for a week
 * would otherwise hold every 100% spawn the world turned up in that week. Forgetting one early would notify it twice,
 * and forgetting it late costs only memory, so the despawn the server gives is the time and nothing is shaved off it.
 */
export class Seen {
  readonly #until = new Map<string, number>();

  has(id: string, now: number): boolean {
    for (const [known, until] of this.#until) {
      if (until <= now) {
        this.#until.delete(known);
      }
    }

    return this.#until.has(id);
  }

  /** Remember `id` until `until`, in epoch milliseconds. */
  remember(id: string, until: number): void {
    this.#until.set(id, until);
  }

  get size(): number {
    return this.#until.size;
  }
}
