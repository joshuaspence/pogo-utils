/**
 * The repository's GPX files as the two Node-side readers see them: which files there are, how to parse one, where its
 * `<pgr:event>` references are and how to cut one out. `validate-gpx.mts` refuses a reference naming an `eventID`
 * `data/events.json` does not have and `prune-events.mts` deletes the references whose event it just removed, so a
 * reference the pruner cannot see is one the validator then refuses — failing every later Pages deploy until someone
 * edits the file by hand. Both read references through `eventRefs` so one reading cannot disagree with itself.
 *
 * An `.mts` beside `gpx.ts` because this reaches `node:child_process` and `@xmldom/xmldom`, where `gpx.ts` is handed
 * one file over `fetch` and never lists the repository.
 */

import { PGR_NS } from './gpx-dialect.ts';
import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** A `<pgr:event>` and the `eventID` it names. */
export type EventRef = { element: Element; eventID: string };

/**
 * Every GPX file in the repository, with its contents. `git ls-files` rather than a walk of `data/`, so an untracked
 * file is neither checked nor pruned, and it sorts its own output — which is what lets `GPX_PATHS` be written from
 * this list and still give the same bytes on two runs.
 */
export function gpxSources() {
  const files = execFileSync('git', ['ls-files', '-z', '*.gpx'], { encoding: 'utf8' }).split('\0').filter(Boolean);

  return files.map((fileName) => ({ fileName, contents: readFileSync(fileName, 'utf8') }));
}

/**
 * `contents` as a document, throwing on a file that is not well-formed. xmldom hands a fatal error to this handler and
 * returns a document regardless, so without the throw a malformed file reads as an empty one — to the pruner, a file
 * with no references to cut rather than one it could not read.
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
 * Every `<pgr:event>` in `doc`, with the `eventID` it names. Matched on namespace and local name rather than a `pgr:`
 * prefix, which a file binds as it likes, and trimmed because both callers weigh it against an `eventID` read out of
 * JSON. The whole document rather than the entries the viewer reads: a reference anywhere in the file is one the
 * validator can refuse, so it is one the pruner has to find.
 */
export function eventRefs(doc: Document): EventRef[] {
  return Array.from(doc.getElementsByTagNameNS(PGR_NS, 'event')).map((element) => ({
    element,
    eventID: element.textContent?.trim() ?? '',
  }));
}

/**
 * `contents` with every element of `elements` cut out, each taking the whitespace that indented it where it had a line
 * to itself.
 *
 * Spliced out of the source text rather than written back through `XMLSerializer`, which does not round-trip a file
 * here: it collapses the newline between the two `xmlns` attributes every `<gpx>` root in `data/` carries, so taking
 * one line out of one file would reformat all of them.
 *
 * Applied back to front, so cutting the earlier of two elements cannot move the offsets of the later.
 */
export function cutElements(contents: string, elements: readonly Element[]) {
  const spans = elements.map((element) => spanOf(contents, element)).sort(([a], [b]) => b - a);

  return spans.reduce((text, [from, to]) => text.slice(0, from) + text.slice(to), contents);
}

/**
 * The half-open range of `contents` that `element` occupies, widened to the whole line where nothing else shares one.
 *
 * Every step refuses rather than guesses, because the failure it guards is silent: a span that over-runs deletes
 * whatever followed, the result can still be well-formed XML, and this is committed to `master` unattended.
 */
function spanOf(contents: string, element: Element): [number, number] {
  const { lineNumber, columnNumber, tagName } = element;

  // Truthiness rather than a null test, which is what narrows away the `undefined` xmldom also types these as. Both
  // are 1-based, so a `0` is as absent as the other two.
  if (!lineNumber || !columnNumber) {
    throw new Error(`<${tagName}> was parsed without a position, so there is nothing to cut`);
  }

  const lineStart = startOfLine(contents, lineNumber);
  const start = (lineStart ?? 0) + columnNumber - 1;

  /*
   * That the start tag really is at the offset reconstructed for it. The parser reports a line and a column rather
   * than an offset, so this file counts line terminators the way the parser counted them — and a disagreement about
   * what ends a line would otherwise splice through unrelated content.
   */
  if (lineStart === null || !contents.startsWith(`<${tagName}`, start)) {
    throw new Error(`<${tagName}> is not at ${lineNumber}:${columnNumber} where the parser put it — refusing to cut`);
  }

  return wholeLine(contents, start, endOf(contents, tagName, start));
}

/**
 * The offset line `lineNumber` starts at, 1-based, or `null` where the file has no such line. XML ends a line with
 * `\n`, `\r\n` or a bare `\r` alike (production 2.11), where `split('\n')` sees only the first two — and the parser
 * reporting positions here counts all three.
 */
function startOfLine(contents: string, lineNumber: number) {
  const breaks = /\r\n|[\n\r]/g;
  let offset = 0;

  for (let line = 1; line < lineNumber; line++) {
    const next = breaks.exec(contents);

    if (next === null) {
      return null;
    }

    offset = next.index + next[0].length;
  }

  return offset;
}

/**
 * The offset just past `tagName`'s own end tag, given the `start` of its start tag.
 *
 * Found from the element's own extent rather than by searching for the literal `</tagName>`, which `indexOf` would
 * answer with the first occurrence anywhere after `start`. Whitespace is legal before the `>` of an end tag
 * (production 42), so `</pgr:event >` is this element's end and the literal is not, and a comment child may carry the
 * literal itself. Either way the span runs past the element and the result can still be well-formed.
 *
 * A `<` cannot appear in text or in an attribute value, so the first one after the start tag opens this element's end
 * tag, a child element, a comment or CDATA. Only the end tag is an extent this can read; the rest throw.
 */
function endOf(contents: string, tagName: string, start: number) {
  const startTagEnd = contents.indexOf('>', start);

  if (startTagEnd === -1) {
    throw new Error(`<${tagName}> has an unterminated start tag — refusing to cut`);
  }

  // `<x/>` holds nothing and ends where its start tag does.
  if (contents[startTagEnd - 1] === '/') {
    return startTagEnd + 1;
  }

  const close = contents.indexOf('<', startTagEnd + 1);
  const endTag = close === -1 ? null : /^<\/([^\s/>]+)[ \t\r\n]*>/.exec(contents.slice(close));

  if (endTag === null || endTag[1] !== tagName) {
    const found = close === -1 ? 'the end of the file' : JSON.stringify(contents.slice(close, close + 24));

    throw new Error(`<${tagName}> is followed by ${found}, not by its own end tag — refusing to cut`);
  }

  return close + endTag[0].length;
}

/**
 * `[start, end)` widened to the whole line where only whitespace shares it, so the cut leaves behind neither a blank
 * line nor one of trailing spaces — nothing formats these files afterwards. An element inline among siblings keeps its
 * line and loses only itself, which a whole-line cut would get wrong by taking a `<pgr:country>` with it.
 */
function wholeLine(contents: string, start: number, end: number): [number, number] {
  let from = start;
  let to = end;

  while (from > 0 && (contents[from - 1] === ' ' || contents[from - 1] === '\t')) {
    from--;
  }

  while (contents[to] === ' ' || contents[to] === '\t') {
    to++;
  }

  // Against the three terminators rather than `\n`, for the reason `startOfLine` counts them: on a CRLF file the `\r`
  // has to fall inside the span, not survive as a line of its own.
  const opensLine = from === 0 || contents[from - 1] === '\n' || contents[from - 1] === '\r';
  const closesLine = /^(?:\r\n|[\n\r])/.exec(contents.slice(to));

  return opensLine && closesLine ? [from, to + closesLine[0].length] : [start, end];
}
