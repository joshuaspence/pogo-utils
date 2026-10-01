/**
 * What a GPX file says to the Routes page, and how far a track goes.
 *
 * `src/app.ts` holds the Leaflet map and the sidebar and so cannot be reached outside a browser; none of this needs
 * one. The shapes are the viewer's rather than the format's — a `<trk>` becomes something with a `latlngs` Leaflet will
 * draw, where the backup builder's `gpxFavourites` turns the same element into a list of triples PGSharp stores — which
 * is why the two readers are separate and both sit on the primitives in `gpx.ts`.
 */

import { eachTrack, entryCoords, entryCountry, extText, placeName } from './gpx.js';

/**
 * A drawable track as the file gives it. `latlngs` is a list of *pairs* rather than a list of lists, because that is
 * what Leaflet means by a `LatLngExpression`: an unannotated `[lat, lon]` literal infers `number[]`, which `L.polyline`
 * rejects, where a `[number, number]` tuple is accepted.
 */
export interface Route {
  latlngs: [number, number][];
  name: string;
  country: string;
  variant: string;
  event: string;
}

/**
 * One place to stand. `coordStr` is the file's own lat/lon text rather than the parsed pair restringified, so what the
 * copy button hands over is exactly what the file said.
 */
export interface Waypoint {
  name: string;
  country: string;
  event: string;
  coords: [number, number];
  coordStr: string;
}

/** Metres between two coordinates over a spherical earth, which is what a walking route wants. */
export function haversine(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6371000,
    toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]),
    dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * The walked length of a track, summed over consecutive pairs. The previous point is carried rather than read back out
 * of the list by `i - 1`: an index and the length test above it are two questions nothing joins, where holding the
 * point the loop has just had is one.
 *
 * The pairs are `readonly` as well as the list, matching `haversine` beside it: this only reads them, and a mutable
 * element type rejected a caller holding an `as const` pair for no reason it could act on. `Route#latlngs` is mutable
 * because Leaflet wants it so, and a mutable tuple is assignable here.
 */
export function routeDistance(latlngs: readonly (readonly [number, number])[]): number {
  let d = 0;
  let previous;

  for (const at of latlngs) {
    if (previous) {
      d += haversine(previous, at);
    }

    previous = at;
  }

  return d;
}

/** Metres as a reader reads them: two decimals of a kilometre past a kilometre, whole metres below it. */
export function fmtDist(m: number): string {
  return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
}

/**
 * Two keyed pairs in the order `Array#sort` with no comparator would have put their keys in. Both levels of the sidebar
 * were sorted that way before each key started travelling beside its value, and this is that comparison written out
 * rather than a different one — `<` over two distinct strings is exactly what the default does.
 */
export function byKey(a: readonly [string, unknown], b: readonly [string, unknown]): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

/**
 * One file's routes and waypoints, split by element rather than by where it sits: a `<trk>` is a path to walk, a
 * `<wpt>` is one place to stand, and a file may hold either or both.
 *
 * Name, locality, country, variant and event all come from the file's own metadata; an entry missing what it needs is
 * rejected rather than guessed at, so the gap shows up in the banner instead of quietly reading back the path. Variant
 * and event stay optional — empty for a route with no short/long counterpart and for a place that stands on its own.
 *
 * It takes the parsed tree rather than the file's text for the reason `gpxFavourites` does: `DOMParser` and the
 * `parsererror` it answers a malformed file with are the one part a browser is genuinely needed for, so `loadGpxFile`
 * fetches and parses and this reads.
 */
export function gpxEntries(doc: Document): { routes: Route[]; waypoints: Waypoint[] } {
  const routes: Route[] = [];

  for (const { trk, trkpts } of eachTrack(doc)) {
    const latlngs = [...trkpts].map((p) => entryCoords(p).coords);

    if (latlngs.length < 2) {
      throw new Error('<trk> has fewer than two usable <trkpt>');
    }

    routes.push({
      latlngs,
      name: placeName(trk),
      country: entryCountry(trk),
      variant: extText(trk, 'variant') || '',
      event: extText(trk, 'event') || '',
    });
  }

  const waypoints: Waypoint[] = [];

  for (const w of doc.getElementsByTagName('wpt')) {
    waypoints.push({
      country: entryCountry(w),
      name: placeName(w),
      ...entryCoords(w),
      event: extText(w, 'event') || '',
    });
  }

  // A listed file holding neither is a defect too: something is in data/gpx-paths.json that has nothing to show.
  if (routes.length === 0 && waypoints.length === 0) {
    throw new Error('has no <trk> or <wpt>');
  }

  return { routes, waypoints };
}
