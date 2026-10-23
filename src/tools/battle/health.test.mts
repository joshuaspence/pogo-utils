/**
 * Each side's HP read off committed frames, against the fill's length measured by hand on the bar's middle row as a
 * share of the distance from its start to the outline at its right. `shield-low`, `battle-one-shield` and
 * `battle-shields-spent` are screenshots of a GO Battle League run scaled down to the stream's 360 wide; the rest are
 * stream frames.
 */

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { decodePng } from '../inventory/png.mts';
import { readHealth } from './health.mts';

const read = (name: string) => readHealth(decodePng(readFileSync(new URL(`fixtures/${name}.png`, import.meta.url))));

const within = (read: number | null, expected: number) => read !== null && Math.abs(read - expected) <= 0.05;

test.each([
  // At a shield prompt, which is where the HP left is wanted: yellow, green and both sides red.
  ['shield-glaceon', 0.31, 0.59],
  ['shield-sneasel', 0.78, 0.99],
  ['shield-pixel8', 0.8, 0.91],
  ['shield-low', 0.09, 0.06],

  // Latias's cyan ring over both bars, and the opponent's yellow above Entei.
  ['battle-latias', 0.53, 0.77],
  ['battle-crunch-entei', 0.63, 0.28],
  ['battle-one-shield', 0.74, 0.51],

  // The opponent's red at 4 pixels, behind its orange trail.
  ['charged-shadow-sneak', 0.59, 0.04],
  ['charged-two-right', 0.67, 0.42],
])('%s: %f of ours left and %f of theirs', (name, own, opponent) => {
  const health = read(name);

  expect(within(health.own, own), `ours read ${health.own}`).toBe(true);
  expect(within(health.opponent, opponent), `theirs read ${health.opponent}`).toBe(true);
});

/**
 * Frames whose bars are not there to read, or not told whose: the minigame draws none, the camera on our Charizard
 * leaves both off the screen, and the shield going up centres ours where neither side's bar starts.
 */
test.each(['battle-minigame-kyogre-great', 'battle-minigame-mewtwo', 'battle-shields-spent', 'battle-shield-going-up'])(
  '%s: reads neither',
  (name) => {
    expect(read(name)).toEqual({ own: null, opponent: null });
  },
);

test('a bar whose left end is hidden goes unread rather than read short', () => {
  // The favourites star sits over our bar's left end, and the outline there that a bar is told by.
  const health = read('battle-night');

  expect(health.own).toBeNull();
  expect(within(health.opponent, 0.99)).toBe(true);
});
