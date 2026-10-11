/**
 * Writes the current PGSharp release into `data/pgsharp-release.json`, read off where PGSharp's download link
 * redirects. The Integrations page reads that committed copy to name the version on its download button.
 *
 * Follows the redirects by hand rather than letting `fetch` do it, so the run stops at the APK's URL and never
 * downloads the APK. pgsharp.com refuses requests that look automated, hence the browser's user agent.
 *
 * The clock is read only for a release not seen before, so an unchanged file after a run still means PGSharp has not
 * released.
 */

import type { VendedRelease } from '../src/pgsharp/release.js';
import { DOWNLOAD_URL, releaseFromApk, VENDED_RELEASE } from '../src/pgsharp/release.ts';
import { readFileSync, writeFileSync } from 'node:fs';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

let url = DOWNLOAD_URL;

for (let hops = 0; !new URL(url).pathname.endsWith('.apk'); hops++) {
  if (hops === 5) {
    throw new Error(`${DOWNLOAD_URL}: no APK after ${hops} redirects`);
  }

  const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': USER_AGENT } });
  const location = res.headers.get('location');

  if (res.status < 300 || res.status >= 400 || location === null) {
    throw new Error(`${url}: ${res.status} ${res.statusText}, not a redirect`);
  }

  url = new URL(location, url).href;
}

const release = releaseFromApk(url);
const previous: Partial<VendedRelease> = JSON.parse(readFileSync(VENDED_RELEASE, 'utf8'));
const vended: VendedRelease = {
  ...release,
  firstSeen: previous.url === release.url && previous.firstSeen ? previous.firstSeen : new Date().toISOString(),
};

// Two-space and newline-terminated for `prettier --check .`, as `vend-feed.mts` explains.
writeFileSync(VENDED_RELEASE, `${JSON.stringify(vended, null, 2)}\n`);
console.log(`${VENDED_RELEASE}: PGSharp ${release.version}`);
