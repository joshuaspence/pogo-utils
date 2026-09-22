/**
 * Reading the GPX files the viewer and the backup builder both consume. `loadManifest` fetches the file list;
 * `parseGpxDocument` and `eachTrack` turn a file into elements to walk; the rest pull an entry's name, locality and
 * country out of a parsed <trk> or <wpt>. Kept in one place so the map and the PGSharp backup agree on what a file says
 * rather than each parsing it their own way.
 */

import { GPX_PATHS } from './generated.js';

export async function loadManifest() {
  const res = await fetch(GPX_PATHS);

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  const files = await res.json();

  if (!Array.isArray(files) || files.some((f) => typeof f !== 'string')) {
    throw new Error('is not a list of paths');
  }

  return files;
}

/**
 * Parse a GPX file's text into a document, rejecting one that is not valid XML. The single place either consumer turns
 * bytes into a tree, so both fail the same way on a malformed file.
 */
export function parseGpxDocument(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');

  if (doc.querySelector('parsererror')) {
    throw new Error('not valid XML');
  }

  return doc;
}

/**
 * The file's drawable <trk> elements paired with their <trkpt> list, skipping the emptied <trk> that gpx.studio writes
 * for a cleared route. Yielding the pair keeps the empty-track skip in one place, so the viewer and the backup builder
 * never disagree about which tracks a file holds. A <trk> that kept a single point is a different thing
 * — a track that cannot be drawn — and is left to each caller to reject.
 */
export function* eachTrack(doc) {
  for (const trk of doc.getElementsByTagName('trk')) {
    const trkpts = trk.getElementsByTagName('trkpt');

    if (trkpts.length === 0) {
      continue;
    }

    yield { trk, trkpts };
  }
}

/**
 * The text of a direct child <tag>, or null. Read from the element itself, not its descendants, so a gpx.studio file's
 * <metadata><author><name> is never mistaken for an entry's name.
 */
function childText(el, tag) {
  for (const child of el.children) {
    if (child.localName === tag && child.textContent && child.textContent.trim()) {
      return child.textContent.trim();
    }
  }

  return null;
}

/**
 * The text of a <pgr:*> field in this element's own <extensions>, or null. GPX 1.1 has no element for a locality, a
 * country or a short/long variant, so each is its own extension field rather than parts packed into one <name>.
 * Matching on local name leaves the prefix a file's own business.
 *
 * Worth knowing when editing: an editor that does not model foreign extensions drops the whole block on export —
 * gpx.studio is one — so a round trip through such a tool loses these fields, and the viewer will say so rather than
 * fall back to the path.
 */
export function extText(el, tag) {
  const ext = [...el.children].find((child) => child.localName === 'extensions');
  return ext ? childText(ext, tag) : null;
}

/**
 * An entry's name with the locality it sits in — "Kings Park, Perth, Western Australia". The country is left out:
 * it is the sidebar's own grouping, and entryName adds it where a favourite needs the whole thing.
 *
 * These readers say what is wrong with the element without naming the file; each caller already knows which file it is
 * reading, and says so once.
 */
export function placeName(el) {
  const name = childText(el, 'name');

  if (!name) {
    throw new Error(`<${el.localName}> has no <name>`);
  }

  const city = extText(el, 'city');
  return city ? `${name}, ${city}` : name;
}

/**
 * The country a <trk> or <wpt> is in. Required: a countryless entry cannot be grouped, flagged or named, and guessing
 * one from the path is the papering over this file format exists to avoid.
 */
export function entryCountry(el) {
  const country = extText(el, 'country');

  if (!country) {
    throw new Error(`<${el.localName}> has no <pgr:country>`);
  }

  return country;
}
