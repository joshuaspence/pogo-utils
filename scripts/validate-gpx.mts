/**
 * Checks the GPX files in the repository are in order: that each one is well-formed and really is GPX 1.1 against the
 * schema (resources/gpx.xsd), and that its `pgr` extension fields are the ones the viewer reads and its country is one
 * the viewer knows, with nothing in that table the files never name (src/countries.ts). Then the two requirements the
 * viewer adds on top of the schema: every entry names itself, and every track has points enough to draw.
 *
 * `--write` adds the two files that tell the pages what the repository holds, data/gpx-paths.json and
 * data/entries-by-event.json, each derived from the same pass that just checked the files rather than from a reading of
 * its own. Neither is in version control, so there is nothing to compare one against and nothing to keep in step: the
 * flag is which caller wants them rather than a mode. `pnpm build` is that caller, and `pnpm lint:xml` is the checks on
 * their own — which is what keeps a parallel `pnpm lint` from putting two writers on one file, `lint:types` being the
 * build.
 *
 * The schema is vendored rather than fetched. GPX 1.1 has not moved since 2004 and the file is 26 KB, so there is
 * nothing to gain by making this check depend on a twenty-year-old site staying up.
 */

import COUNTRIES from '../src/countries.ts';
import { ENTRIES_BY_EVENT, GPX_PATHS } from '../src/generated.ts';
import { MIN_TRKPTS, PGR_FIELDS } from '../src/gpx-dialect.ts';
import type { FeedEvent, RouteCounts } from '../src/types.js';
import { DOMParser, Node, type Document, type Element } from '@xmldom/xmldom';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { validateXML } from 'xmllint-wasm';

// `--write` generates the two indexes beside the checks rather than instead of them: what it writes is what passed.
const writeIndex = process.argv.includes('--write');

const files = execFileSync('git', ['ls-files', '-z', '*.gpx'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const sources = files.map((fileName) => ({ fileName, contents: readFileSync(fileName, 'utf8') }));
const problems: string[] = [];

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
 * An element in the `pgr` namespace that is not one of the fields `src/gpx-dialect.ts` names is a misspelling the
 * viewer would silently ignore, leaving a countryless entry the banner then complains about — the very failure this
 * pass moves forward to here. The namespace itself is this pass's own business: the viewer matches on local name alone,
 * leaving the prefix a file's affair, so there is nothing to share.
 */
const PGR_NS = 'https://joshuaspence.github.io/pogo-utils/gpx/1';

/**
 * A `Set` over the shared tuple rather than a second list beside it. `has` takes a `string`, where the tuple's own
 * `includes` would reject one — the field names being literal types is what types `extText` next door.
 */
const PGR_FIELD_NAMES = new Set<string>(PGR_FIELDS);

const VARIANTS = new Set(['short', 'long']);

// Spelled out of PGR_FIELDS rather than beside it, so adding a field cannot leave the message naming the old set.
const PGR_EXPECTED = [...PGR_FIELDS].join(', ').replace(/, (?=[^,]*$)/, ' or ');

const EVENTS: FeedEvent[] = JSON.parse(readFileSync('data/events.json', 'utf8'));

/**
 * The events an entry may point at, by `eventID` (data/events.json). An entry naming an event that is not there is the
 * same silent failure as a country missing from COUNTRIES: nothing downstream reads the field yet, so a typo or an
 * event renamed out from under it would sit in the file unnoticed.
 */
const EVENT_IDS = new Set(EVENTS.map((event) => event.eventID));

/**
 * The element children of `el`, in document order. `childNodes` carries the whitespace between tags too, so the text
 * nodes are filtered out.
 */
const elementChildren = (el: Element): Element[] =>
  Array.from(el.childNodes).filter((node): node is Element => node.nodeType === Node.ELEMENT_NODE);

// Report against the file, at the element's own line where there is one, matching the schema pass's `file:line:` form.
const report = (fileName: string, el: Element | undefined, message: string) =>
  problems.push(el?.lineNumber ? `${fileName}:${el.lineNumber}: ${message}` : `${fileName}: ${message}`);

const beforePgr = problems.length;
let entryCount = 0;

/**
 * How many routes and waypoints each event has, by `eventID`. Filled as the entries are walked below rather than by a
 * second pass, so what gets written to data/entries-by-event.json cannot describe a file differently from the checks
 * that just validated it.
 */
const eventIndex = new Map<string, RouteCounts>();

// Which countries the files actually name, for the reverse check on COUNTRIES below.
const usedCountries = new Set<string>();

for (const { fileName, contents } of sources) {
  let doc: Document;

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

  const tracks = Array.from(doc.getElementsByTagName('trk')).map((trk) => ({
    trk,
    points: trk.getElementsByTagName('trkpt').length,
  }));

  /**
   * A `<trk>` and a `<wpt>` are the two things the viewer turns into entries, and each must name its country. An
   * emptied `<trk>` (no `<trkpt>`) is what a cleared track looks like on export; `eachTrack` skips it, so its `pgr`
   * fields are not required and nothing is checked for it here.
   */
  const kept = tracks.filter(({ points }) => points > 0);
  const entries = [...kept.map(({ trk }) => trk), ...Array.from(doc.getElementsByTagName('wpt'))];

  /**
   * A `<trk>` that kept a single point is a track there is no line to draw between, and `gpxEntries` throws on it. The
   * schema cannot say so — `trkpt` is `minOccurs="0"` — so without this the file passed every check, went into both
   * generated indexes and broke the Routes page when someone opened it.
   */
  for (const { trk, points } of kept) {
    if (points < MIN_TRKPTS) {
      report(fileName, trk, `<trk> has ${points} <trkpt> — expected at least ${MIN_TRKPTS}`);
    }
  }

  /**
   * A file with neither is the other half of that gap: `gpxEntries` throws rather than drawing an empty map, and the
   * file reaches the viewer because GPX_PATHS is every `.gpx` in the repository. A cleared track is this case, its
   * `<trk>` having been dropped as an entry above.
   */
  if (entries.length === 0) {
    report(fileName, undefined, 'has no <trk> or <wpt>');
  }

  for (const entry of entries) {
    entryCount++;
    const ext = elementChildren(entry).find((child) => child.localName === 'extensions');
    const counts: Record<string, number> = {};
    let eventId = null;

    for (const field of ext ? elementChildren(ext) : []) {
      /**
       * xmldom types `localName` as nullable on every node rather than narrowing it on `Element`, though an element
       * always has one. `''` stands in because it is in no branch below, exactly as `null` would be.
       */
      const name = field.localName ?? '';

      /**
       * A `pgr`-namespace element the viewer has no field for is a misspelling. A foreign element from another tool
       * is not ours to judge — the viewer leaves it be, and so does this.
       */
      if (field.namespaceURI === PGR_NS && !PGR_FIELD_NAMES.has(name)) {
        report(fileName, field, `<${field.tagName}> is not a pgr field — expected ${PGR_EXPECTED}`);
        continue;
      }

      if (!PGR_FIELD_NAMES.has(name)) {
        continue;
      }

      counts[name] = (counts[name] || 0) + 1;
      const text = field.textContent?.trim() ?? '';

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
         * The viewer groups by continent and flags each favourite from this table (src/countries.ts); a country missing
         * from it has no continent and no flag, so the backup build throws rather than importing it. Catch it here.
         */
        report(fileName, field, `<${field.tagName}> is "${text}" — not a country in COUNTRIES (src/countries.ts)`);
      }
    }

    /**
     * Each field is one value, not a list: a second `<pgr:country>` is a silent contradiction, since the viewer keeps
     * only the first and ignores the rest.
     */
    for (const name of PGR_FIELDS) {
      const seen = counts[name] ?? 0;

      if (seen > 1) {
        report(fileName, ext, `<${entry.localName}> has ${seen} <pgr:${name}> fields — expected one`);
      }
    }

    if (!counts.country) {
      report(fileName, entry, `<${entry.localName}> has no <pgr:country>`);
    }

    /**
     * The other two things the viewer refuses an entry for, each valid GPX 1.1 and so invisible to the schema pass
     * above: `placeName` wants a direct-child `<name>` with text in it, and `gpxEntries` wants a `<trk>` it can draw,
     * which takes two points. Neither refusal is a skip — both throw, which rejects the whole file, so one nameless
     * waypoint takes every route beside it off the map.
     */
    if (!elementChildren(entry).some((child) => child.localName === 'name' && child.textContent?.trim())) {
      report(fileName, entry, `<${entry.localName}> has no <name>`);
    }

    if (entry.localName === 'trk' && entry.getElementsByTagName('trkpt').length < 2) {
      report(fileName, entry, '<trk> has fewer than two <trkpt> — too few to draw');
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
  problems.push(`src/countries.ts: "${country}" is in COUNTRIES but no file names it — remove it, or add its route`);
}

if (unusedCountries.length === 0) {
  console.log(`src/countries.ts lists exactly the ${Object.keys(COUNTRIES).length} countries in use.`);
}

/**
 * Static hosting cannot list a directory, so the viewer is handed its paths in GPX_PATHS. Derived from the same
 * `git ls-files` this pass walked, which is the whole of why it cannot fall out of step: what the map is told the
 * repository holds and what it was just checked for are one query, where a file kept by hand could drop a route that is
 * perfectly good GPX and leave nothing to say so but its absence from the map.
 *
 * `git ls-files` sorts its own output, so two runs over the same repository produce the same bytes and a deploy that
 * found nothing new serves a file a browser can keep. Unlike ENTRIES_BY_EVENT the content comes from git rather than
 * from inside the files, so nothing above can make it wrong and the write is not gated on the validation passing.
 */
if (writeIndex) {
  writeFileSync(GPX_PATHS, `${JSON.stringify(files, null, 2)}\n`);
  console.log(`Wrote ${GPX_PATHS} — ${files.length} files.`);
}

/**
 * The events page links through to an event's routes, and the only record of which event an entry belongs to is a
 * `<pgr:event>` inside a GPX file. Finding that would cost the page a fetch of every one of them to learn that a
 * handful carry an event at all, so the association is precomputed here into ENTRIES_BY_EVENT — the same bargain
 * GPX_PATHS strikes, out of the tally the walk above kept rather than a reading of its own.
 *
 * Keys are sorted so that two runs over the same repository produce the same bytes, and the file is written only once
 * everything above has passed: an index naming an event that does not exist would be worse than none. The refusal is a
 * problem rather than a silence because nothing downstream would notice the gap — `scripts/assemble.mts` copies `data/`
 * whole, so a file that was never written is simply not in the artifact, and the Events page 404s for it.
 */
if (writeIndex && problems.length) {
  problems.push(`Refusing to write ${ENTRIES_BY_EVENT} from files that do not validate.`);
} else if (writeIndex) {
  const sorted = [...eventIndex].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  writeFileSync(ENTRIES_BY_EVENT, `${JSON.stringify(Object.fromEntries(sorted), null, 2)}\n`);
  console.log(`Wrote ${ENTRIES_BY_EVENT} — ${eventIndex.size} event(s) with entries.`);
}

if (problems.length === 0) {
  process.exit(0);
}

for (const problem of problems) {
  console.error(problem);
}

process.exit(1);
