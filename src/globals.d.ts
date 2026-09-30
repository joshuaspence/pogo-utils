/**
 * Globals that arrive from a CDN `<script>` rather than from an import, so there is nothing to hang a type off.
 *
 * Browser-side rather than shared, which is the whole reason this is a file of its own: an ambient declaration reaches
 * every project that reads it, so putting a browser global in the shared project would hand it to `scripts/` as well
 * and defeat the disjoint libs. No import or export here on purpose — that is what makes this a script rather than a
 * module, and so what puts these declarations in the global scope without a `declare global` to wrap them.
 */

/**
 * tz-lookup, loaded by a `defer`red `<script>` in `pgsharp.html`. Possibly undefined is the point rather than pedantry:
 * the tag may not have run yet, which is why `src/pgsharp/backup.ts` guards on `typeof`.
 *
 * Leaflet's `L` is not declared here. `@types/leaflet` already provides it as a UMD global, reached via
 * `allowUmdGlobalAccess` in `tsconfig.json`, and declaring it by hand shadows that namespace instead of complementing
 * it.
 */
declare const tzlookup: ((lat: number, lon: number) => string) | undefined;
