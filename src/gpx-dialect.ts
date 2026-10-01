/**
 * The repository's own GPX dialect, in the one place both halves of the tree can read it from. The `pgr` extension
 * fields and the number of points a `<trk>` needs to be drawable are rules the viewer applies and
 * `scripts/validate-gpx.mts` checks ahead of it, so each was spelled twice on opposite sides of the Node/browser
 * boundary with nothing but a comment holding the two in step — and they had already drifted: the validator accepted a
 * one-point `<trk>` that `gpxEntries` then threw on, so a file could pass every check and break the page.
 *
 * `src/gpx.ts` cannot be imported from `scripts/`, being in the browser project and reaching for `DOMParser` and
 * `fetch`, which is why these facts live here rather than beside the reader that first needed them.
 * `tsconfig.shared.json` is what keeps them environment-agnostic: a `Document` or a `process` is an error in this file.
 */

/**
 * The `pgr` fields an entry may carry. GPX 1.1 has no element for a locality, a country, a short/long variant or an
 * event, so each is its own extension field rather than parts packed into one `<name>`. A tuple rather than a set so
 * that it is both the type `extText` accepts — a misspelling is a `TS2345` where it used to answer `null` and leave the
 * field quietly missing — and the order the validator's message lists.
 */
export const PGR_FIELDS = ['country', 'city', 'variant', 'event'] as const;

export type PgrField = (typeof PGR_FIELDS)[number];

/**
 * How many `<trkpt>` a `<trk>` needs before there is a line to draw. A track with none is the emptied one gpx.studio
 * writes for a cleared route and is skipped as an entry; a track with one is a defect the schema cannot catch, `trkpt`
 * being `minOccurs="0"` in `resources/gpx.xsd`. Both the viewer's reader and the validator weigh a track against this
 * rather than against a 2 of their own.
 */
export const MIN_TRKPTS = 2;
