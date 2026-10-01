import { expect, test } from 'vitest';

import { eachTrack, entryCoords, entryCountry, extText, placeName } from './gpx.js';
import { parseXml } from './testing/xml.js';

const gpx = (body: string) =>
  parseXml(
    '<gpx xmlns="http://www.topografix.com/GPX/1/1" ' +
      `xmlns:pgr="https://joshuaspence.github.io/pogo-utils/gpx/1">${body}</gpx>`,
  );

/** The first element of a tag, which every case below reads one of. */
const first = (doc: Document, tag: string) => {
  const el = doc.getElementsByTagName(tag)[0];

  if (!el) {
    throw new Error(`the fixture has no <${tag}>`);
  }

  return el;
};

/**
 * The direct-child rule, which is the whole reason these readers do not use `querySelector`. A gpx.studio file carries
 * `<metadata><author><name>` above the entries, and a `<trkpt>` may carry extensions of its own — so a reader walking
 * descendants would hand a track the author's name or a point's variant. Both decoys sit in this one tree, the author's
 * name first in document order so a descendant search would find it before the track's own.
 */
test('a name and an extension field are read from the element itself, not its descendants', () => {
  const doc = gpx(
    '<metadata><author><name>gpx.studio</name></author></metadata>' +
      '<trk><name>Tan Track</name>' +
      '<extensions><pgr:city>Melbourne</pgr:city><pgr:country>Australia</pgr:country></extensions>' +
      '<trkseg>' +
      '<trkpt lat="-37.8" lon="144.97"><extensions><pgr:variant>short</pgr:variant></extensions></trkpt>' +
      '<trkpt lat="-37.81" lon="144.98"/>' +
      '</trkseg></trk>',
  );
  const trk = first(doc, 'trk');

  expect(placeName(trk)).toBe('Tan Track, Melbourne');
  expect(extText(trk, 'variant')).toBeNull();
});

/** The country is the sidebar's own grouping, so `placeName` leaves it out and each caller adds it where it needs it. */
test('placeName pairs the name with its locality and stops there', () => {
  const doc = gpx(
    '<wpt lat="1" lon="2"><name>Kings Park</name>' +
      '<extensions><pgr:city>Perth, Western Australia</pgr:city><pgr:country>Australia</pgr:country>' +
      '</extensions></wpt>',
  );

  expect(placeName(first(doc, 'wpt'))).toBe('Kings Park, Perth, Western Australia');
});

test('placeName falls back to the bare name where there is no locality', () => {
  const doc = gpx('<wpt lat="1" lon="2"><name>Lone Place</name></wpt>');
  expect(placeName(first(doc, 'wpt'))).toBe('Lone Place');
});

/**
 * Whitespace-only is absent rather than a name, so an editor writing `<name>\n  </name>` cannot give an entry a name
 * made of a newline for PGSharp to list and delete favourites by.
 *
 * What this cannot single out is the blank test inside `childText`, and nothing can: every reader above it treats `''`
 * and `null` alike — `placeName` and `entryCountry` throw on a falsy value, `extText`'s callers fall back on one — so
 * dropping that test leaves a blank field reaching exactly the same branch by a different route. It earns its place by
 * making the `string | null` return mean absent, not by changing an answer any caller here can see.
 */
test('a blank name is no name', () => {
  const doc = gpx('<wpt lat="1" lon="2"><name>  \n  </name></wpt>');
  expect(() => placeName(first(doc, 'wpt'))).toThrow('<wpt> has no <name>');
});

/** The name is trimmed, so an indented file and a compact one give the same favourite. */
test('a name is trimmed', () => {
  const doc = gpx('<wpt lat="1" lon="2"><name>\n    Kings Park\n  </name></wpt>');
  expect(placeName(first(doc, 'wpt'))).toBe('Kings Park');
});

/** The element names itself in every message, so a caller only has to add the file. */
test('entryCountry refuses an entry it cannot group, flag or name', () => {
  const doc = gpx('<trk><name>Nowhere</name><extensions><pgr:city>Perth</pgr:city></extensions></trk>');
  expect(() => entryCountry(first(doc, 'trk'))).toThrow('<trk> has no <pgr:country>');
});

/** An entry with no `<extensions>` at all is the same absence as one whose extensions lack the field. */
test('extText answers null for an element with no extensions block', () => {
  const doc = gpx('<wpt lat="1" lon="2"><name>Bare</name></wpt>');
  expect(extText(first(doc, 'wpt'), 'country')).toBeNull();
});

/**
 * `coordStr` is the file's own text rather than the parsed pair printed back, which is what lets the copy button hand
 * over exactly what the file said — trailing zeroes and all, where `${lat},${lng}` would have dropped them.
 */
test('entryCoords keeps the file’s own spelling beside the parsed pair', () => {
  const doc = gpx('<wpt lat="-37.78410" lon="144.95120"><name>Zoo</name></wpt>');

  expect(entryCoords(first(doc, 'wpt'))).toEqual({
    coords: [-37.7841, 144.9512],
    coordStr: '-37.78410,144.95120',
  });
});

/**
 * `parseFloat` would read "east" as `NaN` and "1e" as `1`, and either would place a point in the sea rather than fail.
 * A missing attribute reads the same way as an unparseable one, since `getAttribute` answers null and `?? ''` parses to
 * `NaN` — so there is one message for both.
 */
test.for([
  { fault: 'an unparseable longitude', attrs: 'lat="1" lon="east"', says: '<wpt> at 1,east' },
  { fault: 'a missing latitude', attrs: 'lon="2"', says: '<wpt> at null,2' },
  { fault: 'an infinite coordinate', attrs: 'lat="1" lon="Infinity"', says: '<wpt> at 1,Infinity' },
])('entryCoords refuses $fault', ({ attrs, says }) => {
  const doc = gpx(`<wpt ${attrs}><name>Nowhere</name></wpt>`);
  expect(() => entryCoords(first(doc, 'wpt'))).toThrow(`${says} has an unparseable coordinate`);
});

/**
 * The emptied `<trk>` gpx.studio writes for a cleared route is skipped here so that both consumers skip it alike. A
 * `<trk>` that kept a single point is a different thing and is yielded — it is a track that cannot be *drawn*, which is
 * the viewer's rule rather than the format's, so `loadGpxFile` is what rejects it.
 */
test('eachTrack skips an emptied track and yields a single-point one', () => {
  const doc = gpx(
    '<trk><name>Cleared</name></trk>' +
      '<trk><name>One Point</name><trkseg><trkpt lat="1" lon="2"/></trkseg></trk>' +
      '<trk><name>Drawable</name><trkseg><trkpt lat="1" lon="2"/><trkpt lat="3" lon="4"/></trkseg></trk>',
  );
  const tracks = [...eachTrack(doc)];

  expect(tracks.map(({ trk }) => placeName(trk))).toEqual(['One Point', 'Drawable']);
  expect(tracks.map(({ trkpts }) => trkpts.length)).toEqual([1, 2]);
});

/** Every `<trkpt>` the track holds, across however many `<trkseg>` the file split them into. */
test('eachTrack pairs a track with its points from every segment', () => {
  const doc = gpx(
    '<trk><name>Split</name>' +
      '<trkseg><trkpt lat="1" lon="2"/></trkseg>' +
      '<trkseg><trkpt lat="3" lon="4"/><trkpt lat="5" lon="6"/></trkseg></trk>',
  );
  const [track] = [...eachTrack(doc)];

  expect([...(track?.trkpts ?? [])].map((p) => entryCoords(p).coords)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
  ]);
});
