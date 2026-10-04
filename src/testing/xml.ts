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

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

/**
 * The one browser global the readers reach for by name rather than through the tree they are handed: `entryGpx` writes
 * a `<trk>` back out with `new XMLSerializer()`, and vitest runs these tests under Node with no DOM at all. Installed
 * here rather than in a setup file because this module is already every test's door to the XML APIs, so importing
 * `parseXml` — which a test parsing a tree to serialize does anyway — is what brings it.
 *
 * xmldom implements the same namespace fixup the specification asks of a browser: a prefix already declared in scope is
 * not declared again down the subtree, which is the part of `entryGpx`'s output a test can actually pin.
 */
globalThis.XMLSerializer ??= XMLSerializer as unknown as typeof globalThis.XMLSerializer;

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
}
