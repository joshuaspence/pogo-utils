/**
 * What a `<pgr:event>` reference is, and what cutting one does to the file around it. These are the two halves of one
 * agreement: `scripts/validate-gpx.mts` refuses a reference naming an event `data/events.json` does not have and
 * `scripts/prune-events.mts` cuts the references of the events it just removed, so a form one reads and the other does
 * not is an event pruned here and refused there — which, `pnpm build` running the validator, is every Pages deploy
 * failing until the file is edited by hand.
 *
 * The forms below are the ones a line-matching reader gets wrong and a parser does not: an element inline among its
 * siblings, whitespace around the ID, CRLF endings and a prefix other than `pgr`. None is in `data/` today, which is
 * exactly why they are written out here rather than read from it — a corpus test can only pin the one shape the corpus
 * happens to be in, and the corpus case at the end says what that shape is.
 */

import { cutElements, eventRefs, gpxSources, parseGpx } from './gpx-source.mts';
import { expect, test } from 'vitest';

/**
 * A document around `body`, with both namespaces on the root. The `\n` before `xmlns:pgr` is how every file in `data/`
 * is written and is load-bearing for the corpus case below: `XMLSerializer` collapses it, so a reader that wrote back
 * through one would reformat the root of every file it touched.
 */
const gpx = (body: string) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx xmlns="http://www.topografix.com/GPX/1/1"',
    '     xmlns:pgr="https://joshuaspence.github.io/pogo-utils/gpx/1" version="1.1" creator="test">',
    body,
    '</gpx>',
    '',
  ].join('\n');

/** The IDs `eventRefs` reads out of `contents`, which is what the two callers compare against `data/events.json`. */
const idsIn = (contents: string) => eventRefs(parseGpx(contents)).map(({ eventID }) => eventID);

/** `contents` with every reference cut, which is what the pruner does to a file whose events have all ended. */
const cutAll = (contents: string) =>
  cutElements(
    contents,
    eventRefs(parseGpx(contents)).map(({ element }) => element),
  );

test('a reference is read by namespace and local name, not by the prefix a file happens to bind', () => {
  // The prefix is the file's own affair — `PGR_NS` is what identifies the field — so a file using `x:` carries the same
  // reference. A reader matching the literal `<pgr:event>` finds nothing here and prunes nothing out of it.
  const bound = gpx(
    '  <metadata><x:event xmlns:x="https://joshuaspence.github.io/pogo-utils/gpx/1">a-2026</x:event></metadata>',
  );

  expect(idsIn(bound)).toEqual(['a-2026']);
});

test('the ID is trimmed, so a reference written across lines names the same event', () => {
  // `data/events.json` holds the ID with no padding, so an untrimmed reading would compare `'\n      a-2026\n    '`
  // against `'a-2026'` and conclude the event was never referenced.
  expect(idsIn(gpx('  <metadata><pgr:event>\n      a-2026\n    </pgr:event></metadata>'))).toEqual(['a-2026']);
});

test('a reference outside a <trk> or <wpt> is still a reference', () => {
  // The validator's entry walk never visits `<metadata>`, but the pruner cuts whatever `eventRefs` returns. Reading the
  // whole document is what keeps the broader of the two from being the one that writes.
  expect(idsIn(gpx('  <metadata><pgr:event>a-2026</pgr:event></metadata>'))).toEqual(['a-2026']);
});

test('an element on a line of its own takes the line with it, leaving no trailing whitespace', () => {
  // The indentation is part of what is cut. Left behind it joins the following newline into a line of spaces, and
  // nothing formats these files afterwards — `prettier` does not read them.
  const before = gpx('  <wpt>\n    <extensions>\n      <pgr:event>a-2026</pgr:event>\n    </extensions>\n  </wpt>');
  const after = cutAll(before);

  expect(after).toBe(gpx('  <wpt>\n    <extensions>\n    </extensions>\n  </wpt>'));
  expect(after.split('\n').filter((line) => line !== line.trimEnd())).toEqual([]);
});

test('an element sharing its line loses only itself', () => {
  // The case a whole-line cut would get wrong in the expensive direction: taking the line would take the country with
  // it, and a countryless entry is one the viewer throws on rather than draws.
  const before = gpx('  <wpt><pgr:country>Australia</pgr:country><pgr:event>a-2026</pgr:event></wpt>');

  expect(cutAll(before)).toBe(gpx('  <wpt><pgr:country>Australia</pgr:country></wpt>'));
});

test('a CRLF file keeps its endings, and the cut line takes its own carriage return', () => {
  // A line-matching reader anchored on `</pgr:event>\n` never matches here, so the reference survives the prune and the
  // validator then refuses it. Asserted on the exact bytes, because a stray `\r` left mid-file is the other failure.
  const before = gpx('  <wpt>\n    <pgr:event>a-2026</pgr:event>\n  </wpt>').replaceAll('\n', '\r\n');
  const after = cutAll(before);

  expect(after).toBe(gpx('  <wpt>\n  </wpt>').replaceAll('\n', '\r\n'));
  expect(after).not.toContain('\r\r');
});

test('two references in one file are both cut, the earlier not having moved the later', () => {
  // `cutElements` splices by offset, so cutting front to back would leave the second span pointing past where its
  // element now is — which lands the cut inside whatever followed it.
  const before = gpx('  <wpt>\n    <pgr:event>a-2026</pgr:event>\n    <pgr:event>b-2026</pgr:event>\n  </wpt>');

  expect(idsIn(before)).toEqual(['a-2026', 'b-2026']);
  expect(cutAll(before)).toBe(gpx('  <wpt>\n  </wpt>'));
});

test('cutting every reference in the corpus removes whole lines and touches nothing else', () => {
  const sources = gpxSources();
  let cut = 0;

  for (const { fileName, contents } of sources) {
    const refs = eventRefs(parseGpx(contents));
    cut += refs.length;

    const before = contents.split('\n');
    const after = cutAll(contents).split('\n');

    /*
     * Two readings of the same removal, so neither alone is the test. The count comes from the parser and knows
     * nothing about how a line is written; the filter is a line match over the data and would also pass on a file the
     * serializer had reflowed around the cut. Together they say the output is the input's lines minus exactly the
     * reference lines — the assertion `XMLSerializer` fails, collapsing the root's `xmlns` onto one line in every file.
     *
     * The filter is a claim about how `data/` is written today: every reference there sits on a line of its own. The
     * cases above are what cover the forms it is not.
     */
    expect(after.length, fileName).toBe(before.length - refs.length);
    expect(after, fileName).toEqual(before.filter((line) => !line.includes('<pgr:event>')));
  }

  // Without this the loop above passes on a corpus with no references at all, which is the shape it would silently
  // degrade to as events are pruned.
  expect(sources.length).toBeGreaterThan(0);
  expect(cut).toBeGreaterThan(0);
});
