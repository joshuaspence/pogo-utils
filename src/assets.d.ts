/**
 * A stylesheet imported for its effect rather than for a value, which TypeScript has no other way to accept: a `.css`
 * file is not a module it can resolve, so `import 'leaflet/dist/leaflet.css'` is a `TS2307` without this. The wildcard
 * declares what such an import means — nothing, to the type system — and leaves what it *does* to `scripts/bundle.mts`,
 * which is the half that emits the CSS.
 *
 * Browser-side rather than shared, for the reason the disjoint projects exist: an ambient declaration reaches every
 * project that reads it, and `scripts/` has no business importing a stylesheet. No import or export at the top level
 * here, which is what keeps this a script whose declarations are ambient rather than a module whose are not.
 */

declare module '*.css';
