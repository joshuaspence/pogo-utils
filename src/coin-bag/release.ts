/**
 * The current Pokémon GO Coin Bag release, shared by the two parts that touch it: `scripts/vend-coin-bag.mts` follows
 * `LATEST_URL`'s redirect and writes the release page it lands on to `VENDED_RELEASE`, and the Integrations page reads
 * that file to put the version on its download buttons. Vended rather than read in the browser, as PGSharp's is: the
 * redirect is github.com's, which sends no CORS headers, and the API that would answer a page directly allows an
 * address sixty unauthenticated requests an hour.
 *
 * The Coin Bag emulates the Nintendo Switch's Bluetooth side of Pokémon GO's connection, so the game sends it
 * postcards. It comes as a web app, an Android APK and an unsigned iOS IPA; each release carries both builds under the
 * same names, which is what lets one version stand for all three links.
 */

import type { Release } from '../release.js';

/** The repository, as it is written in every URL here. */
export const REPO_URL = 'https://github.com/na-ji/pokemon-go-coin-bag';

/** The web app, which has no versions to follow: GitHub Pages serves whatever the repository last pushed. */
export const WEB_APP_URL = 'https://na-ji.github.io/pokemon-go-coin-bag/';

/**
 * GitHub's own always-current link, which redirects to the latest release's page. The panel falls back to it when the
 * vended file cannot be read, so it still leads somewhere — just without saying which version.
 */
export const LATEST_URL = `${REPO_URL}/releases/latest`;

/** Where `scripts/vend-coin-bag.mts` writes the release, and where the page fetches it from. */
export const VENDED_RELEASE = 'data/coin-bag-release.json';

/** The asset names the repository's release workflow uploads, the same in every release. */
export const APK_ASSET = 'app-release.apk';
export const IPA_ASSET = 'CoinBag.ipa';

const TAG_PREFIX = `${REPO_URL}/releases/tag/`;

/**
 * Read the release off the page `LATEST_URL` redirects to, `…/releases/tag/r9` on 2026-10-15. The tags are `r` and a
 * counter the release workflow raises by one each time, so anything else fails the vend rather than writing a version
 * that is not one.
 *
 * Throws too on a page anywhere but this repository's releases. The URL becomes a link on this site that installs an
 * app, so a redirect that strayed is refused rather than published — and the download links are built from the version
 * alone, so a tag that passes cannot point them anywhere else either.
 */
export function releaseFromTagPage(url: string): Release {
  if (!url.startsWith(TAG_PREFIX)) {
    throw new Error(`${url}: not a release of ${REPO_URL}`);
  }

  const version = /^(r\d+)$/.exec(url.slice(TAG_PREFIX.length))?.[1];

  if (version === undefined) {
    throw new Error(`${url}: not a Coin Bag release tag`);
  }

  return { version, url };
}

/** One of `release`'s two builds, downloaded directly rather than through its page. */
export function assetUrl(release: Release, asset: typeof APK_ASSET | typeof IPA_ASSET) {
  return `${REPO_URL}/releases/download/${release.version}/${asset}`;
}
