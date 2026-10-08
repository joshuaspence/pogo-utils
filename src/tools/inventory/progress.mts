/**
 * The two lines `iconsFor` narrates to stderr before it has anything to report, which a run can ask it to go without.
 *
 * Narrated unless asked otherwise, so quiet is something a caller chooses rather than gets by forgetting to choose. It
 * also puts the mutation worth catching on the loud side: a `showProgress` moved below `iconsFor` leaks the preamble
 * into a quiet run, which an assertion can see, rather than dropping it from a `--verbose` one.
 *
 * Set once rather than added to `iconsFor`'s signature, whether a run narrates itself being a property of its output
 * rather than of any one call.
 *
 * This covers that preamble and nothing else. A report of something gone wrong is not progress and still prints; so
 * does `cached`'s `Downloading` line, which gates itself on the week's grace; and `scan` narrates its own launch and
 * per-flag counts whatever it was asked for.
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
