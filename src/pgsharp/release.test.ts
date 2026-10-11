/**
 * The version on the download button is read out of an APK file name nobody here controls, so these pin the one shape
 * seen so far and that anything else is refused rather than half-read.
 */

import { expect, test } from 'vitest';

import { releaseFromApk } from './release.js';

test('the PGSharp version is the first of the two in the file name, not the Pokémon GO one', () => {
  const url = 'https://dl.pgsharp.com/pgs1.272.2_0.431.0_XsfbL(arm64).apk';

  expect(releaseFromApk(url)).toEqual({ version: '1.272.2', url });
});

test('a percent-encoded file name reads the same as a plain one', () => {
  expect(releaseFromApk('https://dl.pgsharp.com/pgs1.272.2_0.431.0_XsfbL%28arm64%29.apk').version).toBe('1.272.2');
});

test('a URL that is not a PGSharp APK is refused rather than given a version', () => {
  expect(() => releaseFromApk('https://www.pgsharp.com/')).toThrow('not a PGSharp APK name');
  expect(() => releaseFromApk('https://dl.pgsharp.com/pgs1.272.2_0.431.0_XsfbL(arm64).zip')).toThrow();
});
