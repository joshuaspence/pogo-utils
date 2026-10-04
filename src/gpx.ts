/**
 * Reading the GPX files the viewer and the backup builder both consume. `loadManifest` fetches the file list;
 * `parseGpxDocument` and `eachTrack` turn a file into elements to walk; the rest pull an entry's name, locality,
 * country and coordinates out of a parsed <trk> or <wpt>. Kept in one place so the map and the PGSharp backup agree on
 * what a file says rather than each parsing it their own way.
 *
 * `entryGpx` is the one writer, and the only thing here that puts XML back out: a stored file holds a whole country, so
 * handing one entry to the clipboard means writing a file for it rather than passing the one it was read from along.
 */

import { GPX_PATHS } from './generated.js';
import { GPX_NS, PGR_NS, type PgrField } from './gpx-dialect.js';

/** What a file of ours names as its writer, which is now also what `entryGpx` writes. */
const CREATOR = 'https://github.com/joshuaspence/pogo-utils';

/**
 * Where an `xmlns:` declaration lives, so that `setAttributeNS` writes a declaration the serializer reads as one rather
 * than an attribute that merely looks like it.
 */
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

/**
 * The file list, checked to be one. `Response#json` answers `any`, and the guard below is the whole of what says
 * otherwise — `Array.isArray` narrows no further than `any[]` and nothing at the type level reads the `some`, so the
 * return type is a claim this function's own throw enforces rather than one the checker verified.
 */
export async function loadManifest(): Promise<readonly string[]> {
  const res = await fetch(GPX_PATHS);

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  const files: unknown = await res.json();

  if (!Array.isArray(files) || files.some((f) => typeof f !== 'string')) {
    throw new Error('is not a list of paths');
  }

  return files;
}

/**
 * Parse a GPX file's text into a document, rejecting one that is not valid XML. The single place either consumer turns
 * bytes into a tree, so both fail the same way on a malformed file.
 */
export function parseGpxDocument(text: string): Document {
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
export function* eachTrack(doc: Document): Generator<{ trk: Element; trkpts: HTMLCollectionOf<Element> }> {
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
function childText(el: Element, tag: string): string | null {
  for (const child of el.children) {
    if (child.localName === tag && child.textContent && child.textContent.trim()) {
      return child.textContent.trim();
    }
  }

  return null;
}

/**
 * The text of a <pgr:*> field in this element's own <extensions>, or null. Which fields there are is PGR_FIELDS, shared
 * with the validator, and `tag` is typed by it rather than left a string: a misspelling answered null, which every
 * caller here reads as the file not carrying the field. Matching on local name leaves the prefix a file's own business.
 *
 * Worth knowing when editing: an editor that does not model foreign extensions drops the whole block on export —
 * gpx.studio is one — so a round trip through such a tool loses these fields, and the viewer will say so rather than
 * fall back to the path.
 */
export function extText(el: Element, tag: PgrField): string | null {
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
export function placeName(el: Element): string {
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
export function entryCountry(el: Element): string {
  const country = extText(el, 'country');

  if (!country) {
    throw new Error(`<${el.localName}> has no <pgr:country>`);
  }

  return country;
}

/**
 * Where a <trkpt> or a <wpt> says it is. One reader for both tags, because they are one format, and the element names
 * itself in the message so the caller only has to add the file. `coords` is a tuple rather than a list, so
 * destructuring it gives two numbers rather than two `number | undefined`; `coordStr` is the file's own text for the
 * pair, kept so a consumer can hand over exactly what the file said rather than the parsed numbers printed back.
 */
export function entryCoords(el: Element): { coords: [number, number]; coordStr: string } {
  const latStr = el.getAttribute('lat'),
    lonStr = el.getAttribute('lon');
  const lat = parseFloat(latStr ?? ''),
    lon = parseFloat(lonStr ?? '');

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`<${el.localName}> at ${latStr},${lonStr} has an unparseable coordinate`);
  }

  return { coords: [lat, lon], coordStr: `${latStr},${lonStr}` };
}

/**
 * One `<trk>` or `<wpt>` as a GPX file of its own — what the Copy button hands over.
 *
 * The stored files hold a whole country each, and copying one meant copying all of it — every entry in
 * `data/United States.gpx` for the one row that was clicked, under a toast naming only that row. So the element is
 * lifted into a `<gpx>` of its own instead. Its own text nodes come with it, which is why the result is indented like
 * the file it came from rather than run together on one line.
 *
 * Built from the entry's own `ownerDocument` rather than from `document`, and the entry is cloned rather than moved, so
 * this neither needs a page nor disturbs the tree the viewer is drawing from. The two namespaces are declared on the
 * `<gpx>` so that the serializer finds both in scope and does not repeat them down the subtree — `pgr` explicitly, GPX
 * itself by the element being in that namespace.
 */
export function entryGpx(el: Element): string {
  const doc = el.ownerDocument;
  const gpx = doc.createElementNS(GPX_NS, 'gpx');

  gpx.setAttributeNS(XMLNS_NS, 'xmlns:pgr', PGR_NS);
  gpx.setAttribute('version', '1.1');
  gpx.setAttribute('creator', CREATOR);
  gpx.appendChild(doc.createTextNode('\n  '));
  gpx.appendChild(el.cloneNode(true));
  gpx.appendChild(doc.createTextNode('\n'));

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(gpx)}\n`;
}
