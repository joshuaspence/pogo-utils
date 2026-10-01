/**
 * An XML tree for a test, parsed by `@xmldom/xmldom` rather than by a browser's `DOMParser`.
 *
 * The GPX readers take an `Element` and ask it for `localName`, `children`, `textContent` and `getAttribute`, all of
 * which xmldom answers exactly as a browser does — so a test drives the real reader over a real tree under Node rather
 * than over a hand-built stand-in. The cast is the one thing the two implementations cannot agree on at the type level:
 * xmldom types `localName` as nullable on every node rather than narrowing it on an `Element`, so its `Document` is not
 * structurally a DOM `Document` however alike the two behave here.
 *
 * `parseGpxDocument` is the one reader that cannot come along, which is why the seam in both consumers is a `Document`
 * rather than the file's text: it tells a malformed file by `querySelector('parsererror')`, a browser convention xmldom
 * does not implement at all — it throws a `ParseError` from `parseFromString` instead.
 */

import { DOMParser } from '@xmldom/xmldom';

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
}
