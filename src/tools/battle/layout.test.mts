/**
 * Where `down` puts a piece, checked against where a Pixel 8 Pro at 1008×2244 and a Pixel 4 XL at 1440×3040 drew it,
 * measured on their screenshots to the pixel.
 */

import { expect, test } from 'vitest';
import { BOTTOM, down, TOP } from './layout.mts';

const PIXEL_8_PRO = { width: 1008, height: 2244 };
const PIXEL_4_XL = { width: 1440, height: 3040 };

test.each([
  // The leader's BATTLE, its green run from row 1557 to 1681 on the Pixel 8 Pro.
  ['the leader’s BATTLE', 0.4923, 0.5, 1619 / 2244, 0.7332],

  // USE THIS PARTY, from row 1887 to 2021.
  ['USE THIS PARTY', -0.0646, 0.9, 1954 / 2244, 0.8694],

  // The map's Poké Ball, red from about row 2042 and white to about 2159, sampled every 11 rows.
  ['the Poké Ball', -0.1436, BOTTOM, 2100 / 2244, 0.932],
])('puts %s where each phone draws it', (_, widths, anchor, pixel8Pro, pixel4Xl) => {
  expect(Math.abs(down(widths, anchor, PIXEL_8_PRO) - pixel8Pro) * PIXEL_8_PRO.height).toBeLessThan(8);
  expect(Math.abs(down(widths, anchor, PIXEL_4_XL) - pixel4Xl) * PIXEL_4_XL.height).toBeLessThan(8);
});

test.each([PIXEL_8_PRO, PIXEL_4_XL])('keeps a piece pinned to the top as many widths down', (phone) => {
  expect((down(0.18, TOP, phone) * phone.height) / phone.width).toBeCloseTo(0.18, 12);
});
