/**
 * The spawns already notified, so that the same one on the next poll — and on every poll until it despawns — reaches
 * the phone once. Keyed by `encounter_id`, which is the spawn's own identity rather than anything a query says about it,
 * so two queries matching one spawn are one notification as well.
 *
 * Each is forgotten after its despawn rather than kept for the life of the process: a watcher left running for a week
 * would otherwise hold every 100% spawn the world turned up in that week. Forgetting one early would notify it twice,
 * and forgetting it late costs only memory, so the despawn the server gives is the time and nothing is shaved off it.
 */
export class Seen {
  readonly #until = new Map<string, number>();

  /** True the first time `id` is offered and false after, until `despawnMs` has passed. */
  first(id: string, despawnMs: number, now: number): boolean {
    this.#forget(now);

    if (this.#until.has(id)) {
      return false;
    }

    this.#until.set(id, despawnMs);

    return true;
  }

  get size(): number {
    return this.#until.size;
  }

  #forget(now: number): void {
    for (const [id, until] of this.#until) {
      if (until <= now) {
        this.#until.delete(id);
      }
    }
  }
}
