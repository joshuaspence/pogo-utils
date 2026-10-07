/**
 * The two lines `iconsFor` narrates to stderr before it has anything to report — the icons it is about to read, and the
 * families no artwork can settle — which a run can ask it to go without.
 *
 * Narrated unless asked otherwise, so that quiet is something a caller chooses rather than something it gets by
 * forgetting to choose: a consumer that never calls `showProgress` goes on narrating, where the other way round it
 * would fall silent with nothing to say it had been asked to. It also puts the mutation worth catching on the loud
 * side, a `showProgress` moved below `iconsFor` leaking the preamble into a quiet run — which an assertion can see —
 * rather than dropping it from a `--verbose` one.
 *
 * Set once rather than added to `iconsFor`'s signature, because whether a run narrates itself is a property of its
 * output rather than of any one call: as a parameter it would sit beside the `refresh` already there, leaving two
 * booleans to tell apart at each of three call sites.
 *
 * This covers that preamble and nothing else, so it is narrower than a general rule about what `--verbose` holds back.
 * Three things sit outside it deliberately:
 *
 * - A report of something gone wrong is not progress. A stale copy read because the download failed, an icon index that
 *   could not be had, an icon that 404s — each still prints, an answer that came out degraded being worth saying
 *   however quietly the run was asked to go about it.
 * - `cached`'s `Downloading` line gates itself on the week's grace it sits behind, printing on the cold or stale run
 *   and never on the warm one. Holding it back would have bought nothing on the run this gate is for while silencing
 *   the one with minutes to account for.
 * - `scan` narrates its own launch and its per-flag counts from `scripts/inventory.mts` whatever it was asked for. So
 *   `scan --verbose` is not the difference between a quiet scan and a loud one, only between one that names the icons
 *   it reads first and one that does not.
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
