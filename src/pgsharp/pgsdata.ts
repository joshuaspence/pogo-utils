/**
 * The PGSData.dat a backup *is*: the favourite lists and whichever controls are ticked, composed into the serialized
 * `java.util.HashMap` PGSharp imports.
 *
 * `favourites.ts` says what each list holds and `java-serialization.ts` says how a map becomes bytes; this is the one
 * place that joins them, and the join is where the contract lives. Which key gets which encoder, whether the timezones
 * are filled in before or after the sort, and what order the control keys land in are all decisions neither of those
 * two modules can make — and each of them is a backup PGSharp reads wrongly rather than refuses, so none of them
 * surfaces as an error.
 *
 * It was the body of `backup.ts`'s click handler, which is a page entry point and so reachable only by opening the
 * page: both halves could sit fully tested while nothing checked that they were wired together the right way round.
 */

import { said } from '../errors.js';
import { JavaSer } from '../java-serialization.js';
import { CONTROL_RESETS } from './controls.js';
import {
  applyTimezones,
  byName,
  dedupeByName,
  encodePoints,
  encodeRoutes,
  POINTS_KEY,
  ROUTES_KEY,
  type Point,
  type Route,
} from './favourites.js';

/** The two lists as `gpxFavourites` builds them, before anything has been dropped, ordered or timezoned. */
export interface RepoFavourites {
  points: Point[];
  routes: Route[];
}

/**
 * What a build amounts to: the bytes to hand over, how many of each kind survived, and the caveats worth saying out
 * loud. `notes` is a list rather than a sentence so that `backupSummary` is what decides how they read — and so a test
 * can ask which caveats fired rather than matching prose.
 */
export interface Backup {
  bytes: Uint8Array<ArrayBuffer>;
  points: number;
  routes: number;
  notes: string[];
}

/**
 * What `dumps` accepts, named off the function because the types in that module are declared inside the IIFE that is
 * its body and it therefore exports none of them. The root map is annotated through it rather than left to inference,
 * since a bare `new Map()` is a `Map<any, any>` that a `set` does not refine — which would make every value put in it
 * unchecked on the way to the one call whose argument type is the whole of what this module is for.
 */
type JavaValue = Parameters<typeof JavaSer.dumps>[0];

/**
 * Synthesize a partial PGSData.dat from scratch — a HashMap holding only the keys we set. Nothing is read from an
 * existing backup; every other preference is omitted, so importing this leaves the rest of the profile as PGSharp had
 * it.
 *
 * One of the four steps is ordered and the other three are free, which is worth saying because the free ones look like
 * they would not be. `encodePoints` has to run after `applyTimezones`, the `tz` the one writes being a field the other
 * emits — reversed, every favourite lands in PGSharp without a timezone, which it accepts in silence.
 *
 * The dedupe reads as though it had to precede the sort, since it keeps the *first* of a repeated name and a sort would
 * seem to decide which that is. It does not: `byName` answers 0 for two identical names and `Array#sort` has been
 * required to be stable since ES2019, so a tie cannot be reordered and either order keeps the entry the manifest listed
 * first. Measured both ways rather than assumed. `applyTimezones` is free of the sort for its own reason — it writes
 * onto each point it is handed, so the order they arrive in reaches nothing. Only the points are timezoned at all,
 * routes having no `tz` field.
 *
 * `ticked` is the ids of the controls to include rather than the controls themselves, so this does the `CONTROL_RESETS`
 * lookup and the page only reads a checkbox. Iteration is over that table and not over `ticked`, which is what makes
 * the key order the one PGSharp wrote whatever order the reader clicked in.
 */
export function buildBackup(repo: RepoFavourites, ticked: ReadonlySet<string>): Backup {
  const notes: string[] = [];

  const p = dedupeByName(repo.points);
  const r = dedupeByName(repo.routes);
  const points = p.out,
    routes = r.out;

  if (p.dropped) {
    notes.push(`${p.dropped} duplicate waypoint name(s) skipped`);
  }

  if (r.dropped) {
    notes.push(`${r.dropped} duplicate route name(s) skipped`);
  }

  points.sort(byName);
  routes.sort(byName);

  const noTz = applyTimezones(points);

  if (noTz) {
    notes.push(`${noTz} waypoint(s) without a timezone`);
  }

  const root = new Map<string, JavaValue>();
  root.set(POINTS_KEY, encodePoints(points));
  root.set(ROUTES_KEY, encodeRoutes(routes));

  /**
   * Include whichever controls are ticked, set to fixed values. A number is written as a Java Float; a string (a
   * filter, the radar's or the feed list's) as-is.
   */
  let controls = 0;

  for (const [id, keys] of Object.entries(CONTROL_RESETS)) {
    if (!ticked.has(id)) {
      continue;
    }

    for (const [k, v] of Object.entries(keys)) {
      root.set(k, typeof v === 'string' ? v : JavaSer.box('F', v));
    }

    controls++;
  }

  if (controls) {
    notes.push(`${controls} control(s)`);
  }

  const bytes = JavaSer.dumps(root);

  /**
   * Re-parse our own output before offering it, so a stream this codec cannot read back is a failed build rather than a
   * file a reader imports and PGSharp rejects. It is the one check that reaches the handle table, back-references being
   * positional: a value written at the wrong size shifts every handle after it and surfaces as some later object being
   * read as the wrong one.
   */
  try {
    JavaSer.loads(bytes);
  } catch (e) {
    throw new Error(`the backup this built cannot be read back: ${said(e)}`, { cause: e });
  }

  return { bytes, points: points.length, routes: routes.length, notes };
}

/**
 * What the page says once a build has finished. The caveats are bracketed only when there are any, so a clean build
 * reads as a sentence rather than as one trailing an empty pair of parentheses — which is the whole reason this is
 * assembled somewhere a test can see it.
 */
export function backupSummary({ points, routes, notes }: Omit<Backup, 'bytes'>) {
  const detail = notes.length ? ` (${notes.join('; ')})` : '';

  return `Built a partial backup — ${points} waypoint(s) and ${routes} route(s)${detail}. ` + 'Import it into PGSharp.';
}
