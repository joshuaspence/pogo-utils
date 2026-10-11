/**
 * The current PGSharp APK, shared by the two parts that touch it: `scripts/vend-pgsharp.mts` follows `DOWNLOAD_URL`'s
 * redirect and writes where it lands to `VENDED_RELEASE`, and the Integrations page reads that file to put the version
 * on its download button. Vended rather than read in the browser because pgsharp.com sends no CORS headers a page could
 * read the redirect through, and the build reaches no network.
 */

/**
 * PGSharp's own always-current link, which redirects to the versioned APK. The button falls back to it when the vended
 * file cannot be read, so it still downloads something — just without saying which version.
 */
export const DOWNLOAD_URL = 'https://api.pgsharp.com/download';

/** Where `scripts/vend-pgsharp.mts` writes the release, and where the page fetches it from. */
export const VENDED_RELEASE = 'data/pgsharp-release.json';

export interface Release {
  /** PGSharp's own version, the first of the two in the file name: `1.272.2`. */
  readonly version: string;

  /** The versioned APK itself, so the button downloads exactly the release it names. */
  readonly url: string;
}

/**
 * Read the release off the APK URL the download redirects to. The file name is
 * `pgs<PGSharp version>_<Pokémon GO version>_<build>(<ABI>).apk` — `pgs1.272.2_0.431.0_XsfbL(arm64).apk` on
 * 2026-10-11 — and only its first version is PGSharp's. Throws on anything else, so a renamed file fails the vend
 * rather than writing a version that is not one.
 */
export function releaseFromApk(url: string): Release {
  // Matched on the string rather than through a `URL`: the shared project this file is in declares neither the
  // browser's globals nor Node's.
  const version = /\/pgs(\d+(?:\.\d+)+)_[^/?#]*\.apk(?:[?#].*)?$/.exec(decodeURIComponent(url))?.[1];

  if (version === undefined) {
    throw new Error(`${url}: not a PGSharp APK name`);
  }

  return { version, url };
}
