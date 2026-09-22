/**
 * Checks the GPX files in the repository are in order: that each one is well-formed and really is GPX 1.1 against the
 * schema (resources/gpx.xsd); that its `pgr` extension fields are the ones the viewer reads and that its country is one
 * the viewer knows, with nothing in that table the files never name (src/countries.js); and that gpx-paths.json and
 * entries-by-event.json, the two files that tell the pages what the repository holds, still agree with it. `--write`
 * regenerates the latter, which is derived from the same pass.
 *
 * The schema is vendored rather than fetched. GPX 1.1 has not moved since 2004 and the file is 26 KB, so there is
 * nothing to gain by making this check depend on a twenty-year-old site staying up.
 */

import COUNTRIES from '../src/countries.js';
import { ENTRIES_BY_EVENT, GPX_PATHS } from '../src/generated.js';
import { DOMParser } from '@xmldom/xmldom';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { validateXML } from 'xmllint-wasm';

// `--write` regenerates the event index rather than checking it, the way `prettier --write` is to `prettier --check`.
const writeIndex = process.argv.includes('--write');

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

/**
 * How many routes and waypoints each event has, by `eventID`. Filled as the entries are walked below rather than by a
 * second pass, so what gets written to entries-by-event.json cannot describe a file differently from the checks that
 * just validated it.
 */
const eventIndex = new Map();

// Which countries the files actually name, for the reverse check on COUNTRIES below.
const usedCountries = new Set();

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
    let eventId = null;

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

      if (name === 'event' && text) {
        eventId = text;
      }

      if (name === 'country' && text) {
        usedCountries.add(text);
      }

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

    /**
     * Tally the entry against its event, splitting the two kinds by element the way the viewer does — the events page
     * counts routes and waypoints separately, so an index that merged them could not label a card.
     */
    if (eventId) {
      const tally = eventIndex.get(eventId) || { routes: 0, waypoints: 0 };
      tally[entry.localName === 'trk' ? 'routes' : 'waypoints'] += 1;
      eventIndex.set(eventId, tally);
    }
  }
}

if (problems.length === beforePgr) {
  console.log(`${entryCount} entries carry the pgr fields the viewer needs.`);
}

/**
 * The other direction of the COUNTRIES check above: an entry in that table no file names. Nothing reaches it except
 * through a `<pgr:country>` read out of a file, so such an entry is unreachable — a leftover from a route since
 * removed, or one added for a route that never arrived. Either way the table says it is the countries in use.
 */
const unusedCountries = Object.keys(COUNTRIES).filter((country) => !usedCountries.has(country));

for (const country of unusedCountries) {
  problems.push(`src/countries.js: "${country}" is in COUNTRIES but no file names it — remove it, or add its route`);
}

if (unusedCountries.length === 0) {
  console.log(`src/countries.js lists exactly the ${Object.keys(COUNTRIES).length} countries in use.`);
}

/**
 * Static hosting cannot list a directory, so the viewer is handed its paths in GPX_PATHS. Nothing else notices when
 * that file falls out of step with the repository, and the failure is silent in the worst way: a route that is
 * perfectly good GPX, and that this script has just validated, simply never appears on the map.
 */
const listed = JSON.parse(readFileSync(GPX_PATHS, 'utf8'));
const unlisted = files.filter((file) => !listed.includes(file));
const phantom = listed.filter((file) => !files.includes(file));

for (const file of unlisted) {
  problems.push(`${file}: tracked but missing from ${GPX_PATHS} — the map will not show it`);
}

for (const file of phantom) {
  problems.push(`${file}: listed in ${GPX_PATHS} but not tracked — the map will fail to fetch it`);
}

if (unlisted.length || phantom.length) {
  problems.push('Regenerate it with the command in the README.');
} else {
  console.log(`${GPX_PATHS} lists all ${listed.length} files.`);
}

/**
 * The events page links through to an event's routes, and the only record of which event an entry belongs to is a
 * `<pgr:event>` inside a GPX file. Finding that would cost the page a fetch of every one of them to learn that a
 * handful carry an event at all, so the association is precomputed here into ENTRIES_BY_EVENT — the same bargain
 * GPX_PATHS strikes, and it falls out of step the same silent way, hence the same check.
 *
 * Keys are sorted so that two runs over the same repository produce the same bytes, and the file is only written once
 * everything above has passed: an index naming an event that does not exist would be worse than a stale one.
 */
const sorted = [...eventIndex].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const expected = `${JSON.stringify(Object.fromEntries(sorted), null, 2)}\n`;

if (writeIndex && problems.length) {
  problems.push(`Refusing to write ${ENTRIES_BY_EVENT} from files that do not validate.`);
} else if (writeIndex) {
  writeFileSync(ENTRIES_BY_EVENT, expected);
  console.log(`Wrote ${ENTRIES_BY_EVENT} — ${eventIndex.size} event(s) with entries.`);
} else if (readFileSync(ENTRIES_BY_EVENT, 'utf8') !== expected) {
  problems.push(
    `${ENTRIES_BY_EVENT}: out of step with the <pgr:event> fields — regenerate it with \`pnpm lint:xml:fix\`.`,
  );
} else {
  console.log(`${ENTRIES_BY_EVENT} lists ${eventIndex.size} event(s) with entries.`);
}

if (problems.length === 0) {
  process.exit(0);
}

for (const problem of problems) {
  console.error(problem);
}

process.exit(1);
