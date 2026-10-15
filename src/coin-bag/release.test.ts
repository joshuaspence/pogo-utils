/**
 * The version on the download buttons is read out of a redirect nobody here controls, so these pin the one shape seen
 * so far and that anything else is refused rather than half-read.
 */

import { expect, test } from 'vitest';

import { APK_ASSET, assetUrl, IPA_ASSET, releaseFromTagPage } from './release.js';

const page = 'https://github.com/na-ji/pokemon-go-coin-bag/releases/tag/r9';

test('the version is the tag the latest release redirects to', () => {
  expect(releaseFromTagPage(page)).toEqual({ version: 'r9', url: page });
});

test('both builds download from that release by their fixed names', () => {
  const release = releaseFromTagPage(page);

  expect(assetUrl(release, APK_ASSET)).toBe(
    'https://github.com/na-ji/pokemon-go-coin-bag/releases/download/r9/app-release.apk',
  );
  expect(assetUrl(release, IPA_ASSET)).toBe(
    'https://github.com/na-ji/pokemon-go-coin-bag/releases/download/r9/CoinBag.ipa',
  );
});

test('a tag that is not the release counter is refused rather than given a version', () => {
  for (const url of [
    'https://github.com/na-ji/pokemon-go-coin-bag/releases/tag/',
    'https://github.com/na-ji/pokemon-go-coin-bag/releases/tag/v1.0',
    'https://github.com/na-ji/pokemon-go-coin-bag/releases/tag/r9/../../../../evil/repo',
    'https://github.com/na-ji/pokemon-go-coin-bag/releases/tag/r9?x=1',
  ]) {
    expect(() => releaseFromTagPage(url), url).toThrow('not a Coin Bag release tag');
  }
});

test('a release anywhere but this repository is refused', () => {
  for (const url of [
    'https://github.com/na-ji/pokemon-go-coin-bag/releases',
    'https://github.com/someone-else/pokemon-go-coin-bag/releases/tag/r9',
    'http://github.com/na-ji/pokemon-go-coin-bag/releases/tag/r9',
    'https://github.com.example.com/na-ji/pokemon-go-coin-bag/releases/tag/r9',
  ]) {
    expect(() => releaseFromTagPage(url), url).toThrow('not a release of https://github.com/na-ji/pokemon-go-coin-bag');
  }
});
