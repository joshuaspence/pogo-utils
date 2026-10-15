/**
 * The current PGSharp APK, shared by the two parts that touch it: `scripts/vend-pgsharp.mts` follows `DOWNLOAD_URL`'s
 * redirect and writes where it lands to `VENDED_RELEASE`, and the Integrations page reads that file to put the version
 * on its download button. Vended rather than read in the browser because pgsharp.com sends no CORS headers a page could
 * read the redirect through, and the build reaches no network.
 */

import type { Release } from '../release.js';

/**
 * PGSharp's own always-current link, which redirects to the versioned APK. The button falls back to it when the vended
 * file cannot be read, so it still downloads something — just without saying which version.
 */
export const DOWNLOAD_URL = 'https://api.pgsharp.com/download';

/** Where `scripts/vend-pgsharp.mts` writes the release, and where the page fetches it from. */
export const VENDED_RELEASE = 'data/pgsharp-release.json';

/** Where PGSharp serves its APKs, and so the only place the download button may send a reader. */
const APK_ORIGIN = 'https://dl.pgsharp.com/';

/**
 * Read the release off the APK URL the download redirects to. The file name is
 * `pgs<PGSharp version>_<Pokémon GO version>_<build>(<ABI>).apk` — `pgs1.272.2_0.431.0_XsfbL(arm64).apk` on
 * 2026-10-11 — and only its first version is PGSharp's. Throws on anything else, so a renamed file fails the vend
 * rather than writing a version that is not one.
 *
 * Throws too on an APK anywhere but `APK_ORIGIN`. The URL becomes a link on this site that installs an app, so a
 * redirect that strayed, by misconfiguration or compromise, is refused rather than published. Checked on the URL as
 * given, before any decoding, since that is the string a browser will follow.
 */
export function releaseFromApk(url: string): Release {
  if (!url.startsWith(APK_ORIGIN)) {
    throw new Error(`${url}: not served from ${APK_ORIGIN}`);
  }

  // Matched on the string rather than through a `URL`: the shared project this file is in declares neither the
  // browser's globals nor Node's.
  const file = url.slice(APK_ORIGIN.length).replace(/[?#].*$/, '');
  const version = /^pgs(\d+(?:\.\d+)+)_[^/]*\.apk$/.exec(decodeURIComponent(file))?.[1];

  if (version === undefined) {
    throw new Error(`${url}: not a PGSharp APK name`);
  }

  return { version, url };
}
