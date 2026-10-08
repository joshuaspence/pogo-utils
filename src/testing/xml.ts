/**
 * An XML tree for a test, parsed by `@xmldom/xmldom` rather than a browser's `DOMParser`. The GPX readers ask an
 * `Element` only for things xmldom answers exactly as a browser does, so a test drives the real reader over a real
 * tree under Node. The cast is the one thing the two cannot agree on at the type level: xmldom types `localName` as
 * nullable on every node, so its `Document` is not structurally a DOM `Document`.
 *
 * `parseGpxDocument` is the one reader that cannot come along, which is why the seam in both consumers is a `Document`
 * rather than the file's text: it tells a malformed file by `querySelector('parsererror')`, where xmldom throws.
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

/**
 * The one browser global the readers reach for by name rather than through the tree they are handed: `entryGpx` writes
 * a `<trk>` out with `new XMLSerializer()`, and vitest runs under Node with no DOM. Installed here rather than in a
 * setup file because this module is already every test's door to the XML APIs.
 *
 * xmldom implements the same namespace fixup the specification asks of a browser — a prefix already in scope is not
 * declared again down the subtree — which is the part of `entryGpx`'s output a test can pin.
 */
globalThis.XMLSerializer ??= XMLSerializer as unknown as typeof globalThis.XMLSerializer;

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
}
