/**
 * The repository's own GPX dialect, in the one place both halves of the tree can read it from. These rules were
 * spelled twice across the Node/browser boundary with nothing but a comment holding them in step, and had drifted: the
 * validator accepted a one-point `<trk>` that `gpxEntries` then threw on, so a file could pass every check and break
 * the page.
 *
 * `src/gpx.ts` cannot be imported from `scripts/`, being in the browser project, which is why these live here.
 * `tsconfig.shared.json` keeps them environment-agnostic: a `Document` or a `process` is an error in this file.
 */

/**
 * The `pgr` fields an entry may carry, GPX 1.1 having no element for a locality, a country, a variant or an event. A
 * tuple rather than a set, so it is both the type `extText` accepts — a misspelling is a `TS2345` where it used to
 * answer `null` and leave the field quietly missing — and the order the validator's message lists.
 */
export const PGR_FIELDS = ['country', 'city', 'variant', 'event'] as const;

export type PgrField = (typeof PGR_FIELDS)[number];

/**
 * How many `<trkpt>` a `<trk>` needs before there is a line to draw. A track with none is the emptied one gpx.studio
 * writes for a cleared route and is skipped; one with a single point is a defect the schema cannot catch, `trkpt`
 * being `minOccurs="0"`. Both the viewer's reader and the validator weigh a track against this rather than their own.
 */
export const MIN_TRKPTS = 2;

/**
 * The two namespaces a file of ours is written in. Shared because both halves of the tree need the strings themselves
 * and not just the local names — the validator to tell a misspelled `pgr` field from a foreign tool's extension, and
 * `entryGpx` to declare both on the `<gpx>` it writes. Which prefix a file binds `PGR_NS` to is its own affair, every
 * reader here matching on namespace and local name.
 */
export const GPX_NS = 'http://www.topografix.com/GPX/1/1';
export const PGR_NS = 'https://joshuaspence.github.io/pogo-utils/gpx/1';
