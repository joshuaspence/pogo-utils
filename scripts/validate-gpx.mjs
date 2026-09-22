/**
 * Checks the GPX files in the repository are in order: that each one is well-formed and really is GPX 1.1 against the
 * schema (resources/gpx.xsd); that its `pgr` extension fields are the ones the viewer reads and that its country is
 * one the viewer knows (src/countries.js); and that gpx.json still lists exactly the files the viewer should fetch.
 *
 * The schema is vendored rather than fetched. GPX 1.1 has not moved since 2004 and the file is 26 KB, so there is
 * nothing to gain by making this check depend on a twenty-year-old site staying up.
 */

import COUNTRIES from '../src/countries.js';
import { DOMParser } from '@xmldom/xmldom';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateXML } from 'xmllint-wasm';

const files = execFileSync('git', ['ls-files', '-z', '*.gpx'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const sources = files.map((fileName) => ({ fileName, contents: readFileSync(fileName, 'utf8') }));
const problems = [];

if (files.length === 0) {
  console.error('No GPX files found. Run this from the repository root.');
  process.exit(1);
}

const { valid, errors } = await validateXML({
  xml: sources,
  schema: [readFileSync('resources/gpx.xsd', 'utf8')],
});

if (valid) {
  console.log(`${files.length} files validate against GPX 1.1.`);
} else {
  /**
   * A malformed file reports the offending source line with no position to hang it on, so the location is printed
   * only when there is one.
   */
  for (const { loc, message } of errors) {
    problems.push(loc ? `${loc.fileName}:${loc.lineNumber}: ${message}` : message);
  }
}

/**
 * The `pgr` fields the viewer reads, matched by local name. An element that is in the `pgr` namespace but is not one
 * of these is a misspelling the viewer would silently ignore, leaving a countryless entry the banner then complains
 * about — the very failure this pass moves forward to here.
 */
const PGR_NS = 'https://joshuaspence.github.io/pogo-utils/gpx/1';
const PGR_FIELDS = new Set(['country', 'city', 'variant', 'event']);
const VARIANTS = new Set(['short', 'long']);

// Spelled out of PGR_FIELDS rather than beside it, so adding a field cannot leave the message naming the old set.
const PGR_EXPECTED = [...PGR_FIELDS].join(', ').replace(/, (?=[^,]*$)/, ' or ');

/**
 * The events an entry may point at, by `eventID` (data/events.json). An entry naming an event that is not there is the
 * same silent failure as a country missing from COUNTRIES: nothing downstream reads the field yet, so a typo or an
 * event renamed out from under it would sit in the file unnoticed.
 */
const EVENT_IDS = new Set(JSON.parse(readFileSync('data/events.json', 'utf8')).map((event) => event.eventID));

/**
 * The element children of `el`, in document order. `childNodes` carries the whitespace between tags too, so the
 * text nodes are filtered out (nodeType 1 is an element).
 */
const elementChildren = (el) => Array.from(el.childNodes).filter((node) => node.nodeType === 1);

// Report against the file, at the element's own line where there is one, matching the schema pass's `file:line:` form.
const report = (fileName, el, message) =>
  problems.push(el?.lineNumber ? `${fileName}:${el.lineNumber}: ${message}` : `${fileName}: ${message}`);

const beforePgr = problems.length;
let entryCount = 0;

for (const { fileName, contents } of sources) {
  let doc;

  try {
    doc = new DOMParser({
      onError: (level, msg) => {
        if (level === 'fatalError') {
          throw new Error(msg);
        }
      },
    }).parseFromString(contents, 'application/xml');
  } catch {
    // Not well-formed — the schema pass above has already said so; there is nothing this pass can add.
    continue;
  }

  /**
   * A `<trk>` and a `<wpt>` are the two things the viewer turns into entries, and each must name its country. An
   * emptied `<trk>` (no `<trkpt>`) is what a cleared track looks like on export; the viewer skips it, so its `pgr`
   * fields are not required and nothing is checked for it here.
   */
  const entries = [
    ...Array.from(doc.getElementsByTagName('trk')).filter((trk) => trk.getElementsByTagName('trkpt').length > 0),
    ...Array.from(doc.getElementsByTagName('wpt')),
  ];

  for (const entry of entries) {
    entryCount++;
    const ext = elementChildren(entry).find((child) => child.localName === 'extensions');
    const counts = {};

    for (const field of ext ? elementChildren(ext) : []) {
      const name = field.localName;

      /**
       * A `pgr`-namespace element the viewer has no field for is a misspelling. A foreign element from another tool
       * is not ours to judge — the viewer leaves it be, and so does this.
       */
      if (field.namespaceURI === PGR_NS && !PGR_FIELDS.has(name)) {
        report(fileName, field, `<${field.tagName}> is not a pgr field — expected ${PGR_EXPECTED}`);
        continue;
      }

      if (!PGR_FIELDS.has(name)) {
        continue;
      }

      counts[name] = (counts[name] || 0) + 1;
      const text = field.textContent.trim();

      if (!text) {
        report(fileName, field, `<${field.tagName}> is empty`);
      } else if (name === 'variant' && !VARIANTS.has(text)) {
        report(fileName, field, `<${field.tagName}> is "${text}" — expected short or long`);
      } else if (name === 'event' && !EVENT_IDS.has(text)) {
        report(fileName, field, `<${field.tagName}> is "${text}" — not an eventID in data/events.json`);
      } else if (name === 'country' && !Object.hasOwn(COUNTRIES, text)) {
        /**
         * The viewer groups by continent and flags each favourite from this table (src/countries.js); a country missing
         * from it has no continent and no flag, so the backup build throws rather than importing it. Catch it here.
         */
        report(fileName, field, `<${field.tagName}> is "${text}" — not a country in COUNTRIES (src/countries.js)`);
      }
    }

    /**
     * Each field is one value, not a list: a second `<pgr:country>` is a silent contradiction, since the viewer keeps
     * only the first and ignores the rest.
     */
    for (const name of PGR_FIELDS) {
      if (counts[name] > 1) {
        report(fileName, ext, `<${entry.localName}> has ${counts[name]} <pgr:${name}> fields — expected one`);
      }
    }

    if (!counts.country) {
      report(fileName, entry, `<${entry.localName}> has no <pgr:country>`);
    }
  }
}

if (problems.length === beforePgr) {
  console.log(`${entryCount} entries carry the pgr fields the viewer needs.`);
}

/**
 * Static hosting cannot list a directory, so the viewer is handed its paths in `gpx.json`. Nothing else notices
 * when that file falls out of step with the repository, and the failure is silent in the worst way: a route that
 * is perfectly good GPX, and that this script has just validated, simply never appears on the map.
 */
const listed = JSON.parse(readFileSync('gpx.json', 'utf8'));
const unlisted = files.filter((file) => !listed.includes(file));
const phantom = listed.filter((file) => !files.includes(file));

for (const file of unlisted) {
  problems.push(`${file}: tracked but missing from gpx.json — the map will not show it`);
}

for (const file of phantom) {
  problems.push(`${file}: listed in gpx.json but not tracked — the map will fail to fetch it`);
}

if (unlisted.length || phantom.length) {
  problems.push('Regenerate it with the command in the README.');
} else {
  console.log(`gpx.json lists all ${listed.length} files.`);
}

if (problems.length === 0) {
  process.exit(0);
}

for (const problem of problems) {
  console.error(problem);
}

process.exit(1);
