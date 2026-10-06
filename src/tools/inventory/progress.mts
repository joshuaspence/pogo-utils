/**
 * The progress a long run narrates to stderr, which a caller can ask it to go without.
 *
 * Narrated unless asked otherwise, so that quiet is something a caller chooses rather than something it gets by
 * forgetting to choose. `scripts/vend-game-master.mts` is why round that way: it parses no arguments, so it has no
 * `--verbose` to ask with, and it downloads 23 MB into an empty directory, so its `Downloading` lines are the whole of
 * its output over the minutes it runs — beside `pnpm vend`'s other half, where silence reads as a hung job. Defaulting
 * to silence would have made it the one consumer the gate was wrong for, and the next one wrong the same way.
 *
 * Set once rather than threaded down `cached`, `cachedJson`, `iconIndex`, `loadGameData` and `iconsFor`: whether a run
 * narrates itself is a property of its output and not of any one call. Only `cached` and `iconsFor` print, so a flag
 * passed through those five signatures would be a parameter the other three carry solely to hand on, beside the
 * `refresh` all five already take — and `cached(dir, file, url, true, false)` names neither of its booleans.
 *
 * Progress is not the same thing as a report of something gone wrong, and only progress is quietened here. A stale copy
 * read because the download failed, an icon index that could not be had, an icon that 404s — each still prints, an
 * answer that came out degraded being worth saying however quietly the run was asked to go about it. The test is
 * whether the line would print on a run where everything worked: those are the ones a second run has already seen.
 */

let narrating = true;

/** Whether progress is printed from here on. `scripts/inventory.mts` takes this off `--verbose`. */
export function showProgress(wanted: boolean): void {
  narrating = wanted;
}

/** One line of progress, printed only where it was asked for. */
export function progress(message: string): void {
  if (narrating) {
    console.error(message);
  }
}
