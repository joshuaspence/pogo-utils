/**
 * The repository's GPX files as the two Node-side readers of them see it: which files there are, how to parse one,
 * where its `<pgr:event>` references are and how to cut one out. `scripts/validate-gpx.mts` refuses a reference naming
 * an `eventID` that `data/events.json` does not have, and `scripts/prune-events.mts` deletes the references whose event
 * it has just removed — so a reference the pruner cannot see is one the validator then refuses, and `pnpm build` runs
 * the validator, which makes that mismatch every later Pages deploy failing until someone edits the file by hand. Both
 * read references through `eventRefs` for that reason: one reading cannot disagree with itself.
 *
 * An `.mts` beside `gpx.ts` and `gpx-dialect.ts` rather than a third spelling in `scripts/`, which is the same division
 * `src/tools/inventory` is under: this reaches `node:child_process` and `@xmldom/xmldom`, where `gpx.ts` is handed one
 * file over `fetch` and never lists the repository at all.
 */

import { PGR_NS } from './gpx-dialect.ts';
import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** A `<pgr:event>` and the `eventID` it names. */
export type EventRef = { element: Element; eventID: string };

/**
 * Every GPX file in the repository, with its contents. `git ls-files` rather than a walk of `data/`, so an untracked
 * file is neither checked nor pruned, and it sorts its own output — which is what lets `GPX_PATHS` be written from this
 * list and still give the same bytes on two runs.
 */
export function gpxSources() {
  const files = execFileSync('git', ['ls-files', '-z', '*.gpx'], { encoding: 'utf8' }).split('\0').filter(Boolean);

  return files.map((fileName) => ({ fileName, contents: readFileSync(fileName, 'utf8') }));
}

/**
 * `contents` as a document, throwing on a file that is not well-formed. xmldom hands a fatal error to this handler and
 * then returns a document regardless, so without the throw a malformed file reads as an empty one — for the pruner, a
 * file with no references to cut rather than a file it could not read.
 */
export function parseGpx(contents: string) {
  return new DOMParser({
    onError: (level, msg) => {
      if (level === 'fatalError') {
        throw new Error(msg);
      }
    },
  }).parseFromString(contents, 'application/xml');
}

/**
 * Every `<pgr:event>` in `doc`, with the `eventID` it names. Matched on namespace and local name rather than on a
 * `pgr:` prefix, which a file binds as it likes, and trimmed because what both callers weigh it against is an `eventID`
 * read out of JSON. The whole document rather than the `<trk>` and `<wpt>` entries the viewer reads: a reference
 * anywhere in the file is one the validator can refuse, so it is one the pruner has to find.
 */
export function eventRefs(doc: Document): EventRef[] {
  return Array.from(doc.getElementsByTagNameNS(PGR_NS, 'event')).map((element) => ({
    element,
    eventID: element.textContent?.trim() ?? '',
  }));
}

/**
 * `contents` with every element of `elements` cut out, each taking the whitespace that indented it where it had a line
 * to itself — a cut that left that behind would write a line of trailing spaces, and nothing formats these files.
 *
 * Spliced out of the source text rather than written back through `XMLSerializer`, which does not round-trip a file
 * here: it collapses the newline between the two `xmlns` attributes every `<gpx>` root in `data/` is written with, so
 * serializing to take one line out of one file would reformat all of them. The parser still says what is cut and where,
 * each element reporting its start tag's position, so this stays the single reading `eventRefs` gives.
 *
 * Applied back to front, so cutting the earlier of two elements in a file cannot move the offsets of the later.
 */
export function cutElements(contents: string, elements: readonly Element[]) {
  const spans = elements.map((element) => spanOf(contents, element)).sort(([a], [b]) => b - a);

  return spans.reduce((text, [from, to]) => text.slice(0, from) + text.slice(to), contents);
}

/**
 * The half-open range of `contents` that `element` occupies, widened to the whole line where nothing else shares one.
 * That widening is what makes the cut independent of how the file is written: an element inline among others loses only
 * itself, one on its own line loses the line, and a `\r` sits inside the span either way.
 *
 * `lineNumber` and `columnNumber` are 1-based and point at the `<` of the start tag. The end is found by searching for
 * the literal closing tag, which cannot be confused with content because a `<` in XML text is an error — it has to be
 * written `&lt;`. A self-closing element has no closing tag to find and throws rather than cutting the wrong range; one
 * is unreachable from the pruner, whose every element holds an `eventID`, and a failed run beats a mangled file.
 */
function spanOf(contents: string, element: Element): [number, number] {
  const { lineNumber, columnNumber, tagName } = element;

  // Truthiness rather than a null test, which is what narrows away the `undefined` xmldom also types these as. Both are
  // 1-based, so a `0` is as absent as the other two.
  if (!lineNumber || !columnNumber) {
    throw new Error(`<${tagName}> was parsed without a position, so there is nothing to cut`);
  }

  // `split` with a limit keeps the first `lineNumber - 1` lines, whose lengths plus their newlines are the offset of
  // this one. A `\r` stays on the end of the preceding line, so a CRLF file counts the same as an LF one.
  const start = contents.split('\n', lineNumber - 1).reduce((n, line) => n + line.length + 1, 0) + columnNumber - 1;
  const close = contents.indexOf(`</${tagName}>`, start);

  if (close === -1) {
    throw new Error(`<${tagName}> at ${lineNumber}:${columnNumber} has no closing tag, so its end cannot be found`);
  }

  const end = close + `</${tagName}>`.length;
  const lineStart = contents.lastIndexOf('\n', start) + 1;
  const lineEnd = contents.indexOf('\n', end);
  const alone = !contents.slice(lineStart, start).trim() && lineEnd !== -1 && !contents.slice(end, lineEnd).trim();

  return alone ? [lineStart, lineEnd + 1] : [start, end];
}
