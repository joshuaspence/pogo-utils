/**
 * Where `down` puts what the Pixel 4 XL drew, checked against where a Pixel 8 Pro at 1008×2244 drew the same pieces,
 * measured on its screenshots to the pixel.
 */

import { expect, test } from 'vitest';
import { BOTTOM, down, tall, TOP } from './layout.mts';

const PIXEL_4_XL = { width: 1440, height: 3040 };
const PIXEL_8_PRO = { width: 1008, height: 2244 };

test('leaves the Pixel 4 XL as it was measured', () => {
  expect(down(0.733, 0.5, PIXEL_4_XL)).toBeCloseTo(0.733, 12);
  expect(tall(0.02, PIXEL_4_XL)).toBeCloseTo(0.02, 12);
});

test.each([
  // The leader's BATTLE, its green run from row 1557 to 1681.
  ['the leader’s BATTLE', 0.7332, 0.5, 1619 / 2244],

  // USE THIS PARTY, from row 1887 to 2021.
  ['USE THIS PARTY', 0.8694, 0.9, 1954 / 2244],

  // The map's Poké Ball, red from about row 2042 and white to about 2159, sampled every 11 rows.
  ['the Poké Ball', 0.932, BOTTOM, 2100 / 2244],
])('puts %s where a Pixel 8 Pro draws it', (_, measured, anchor, drawn) => {
  expect(Math.abs(down(measured, anchor, PIXEL_8_PRO) - drawn) * PIXEL_8_PRO.height).toBeLessThan(8);
});

test('keeps a piece pinned to the top as many widths down', () => {
  const widths = (y: number, { width, height }: typeof PIXEL_4_XL) => (y * height) / width;

  expect(widths(down(0.085, TOP, PIXEL_8_PRO), PIXEL_8_PRO)).toBeCloseTo(widths(0.085, PIXEL_4_XL), 12);
});
