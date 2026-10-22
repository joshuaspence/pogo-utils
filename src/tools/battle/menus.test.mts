/**
 * The menu reader against each screen between two recorded Team Leader battles, at the recording's 720×1520 — a live run
 * reads full-size screenshots, which OCR reads at least as well. Tesseract has to be installed, as for the inventory
 * readers. The Battle tab's QR code is painted over in its fixture, being tied to the account it was recorded on.
 */

import { decodePng } from '../inventory/png.mts';
import { useEngine } from '../inventory/ocr.mts';
import { tesseractCli } from '../inventory/ocr-cli.mts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, test, vi } from 'vitest';
import { readMenu, type Menu } from './menus.mts';

beforeAll(() => useEngine(tesseractCli));

const fixture = (name: string) =>
  decodePng(readFileSync(fileURLToPath(new URL(`fixtures/${name}.png`, import.meta.url))));

const near = (menu: Menu, x: number, y: number) =>
  'tap' in menu && Math.abs(menu.tap[0] - x) < 0.04 && Math.abs(menu.tap[1] - y) < 0.03;

// `menu-training-full` is a full-size screenshot, the kind a run reads, off which OCR read none of the leaders' names.
test.each([
  ['menu-training', 'blanche', 0.26],
  ['menu-training', 'candela', 0.5],
  ['menu-training', 'spark', 0.74],
  ['menu-training-full', 'blanche', 0.26],
  ['menu-training-full', 'candela', 0.5],
  ['menu-training-full', 'spark', 0.74],
] as const)("taps %s's %s portrait on the Battle tab, without reading the screen", async (name, leader, x) => {
  const read = vi.fn();
  const menu = await readMenu(fixture(name), { leader, league: 'ultra', result: false }, read);

  expect(menu.screen).toBe('training');
  expect(near(menu, x, 0.8)).toBe(true);
  expect(read).not.toHaveBeenCalled();
});

// Blanche's off a recording, over daylight; Spark's a full-size screenshot over a lit city, which shows through the ✗.
test.each(['menu-intro', 'menu-intro-spark'])('taps BATTLE on %s without reading the screen', async (name) => {
  const read = vi.fn();
  const menu = await readMenu(fixture(name), { leader: 'spark', league: 'ultra', result: false }, read);

  expect(menu).toEqual({ screen: 'intro', tap: [0.5, 0.733] });
  expect(read).not.toHaveBeenCalled();
});

test.each([
  ['great', 0.43],
  ['ultra', 0.58],
  ['master', 0.74],
] as const)('taps %s league', async (league, y) => {
  const menu = await readMenu(fixture('menu-league'), { leader: 'blanche', league, result: false });

  expect(menu.screen).toBe('league');
  expect(near(menu, 0.55, y)).toBe(true);
});

// The recording's button and the full-size screenshot's differ by 28 in red, which one colour to within 20 missed.
test.each(['menu-party', 'menu-party-full'])('taps USE THIS PARTY on %s without reading the screen', async (name) => {
  const read = vi.fn();
  const menu = await readMenu(fixture(name), { leader: 'blanche', league: 'ultra', result: false }, read);

  expect(menu).toEqual({ screen: 'party', tap: [0.5, 0.87] });
  expect(read).not.toHaveBeenCalled();
});

test('taps the ✓ on the result once a battle has ended', async () => {
  expect(await readMenu(fixture('menu-result'), { leader: 'blanche', league: 'ultra', result: true })).toEqual({
    screen: 'result',
    tap: [0.5, 0.935],
  });
});

test('leaves the teal button alone when no result is due', async () => {
  expect(await readMenu(fixture('menu-result'), { leader: 'blanche', league: 'ultra', result: false })).toEqual({
    screen: 'unknown',
  });
});

test('still finds the leader with a result due', async () => {
  const menu = await readMenu(fixture('menu-training'), { leader: 'blanche', league: 'ultra', result: true });

  expect(menu.screen).toBe('training');
});

/**
 * The way in from the map, off full-size screenshots: the Poké Ball, then BATTLE on the main menu under its label, then
 * the Battle tab, which opens on GO Battle League and is scrolled down to the Training card. The map's grass and GO
 * Battle League's BATTLE both pass the green buttons' colour test, and a tap on the latter enters a GO Battle League
 * match; neither is ever read as either button, with a result due or not. The map's friend-gift banner is painted over.
 */
test.each([
  ['menu-map', { screen: 'map', tap: [0.5, 0.932] }],
  [
    'menu-battle-league',
    {
      screen: 'battle-tab',
      swipe: [
        [0.5, 0.75],
        [0.5, 0.35],
      ],
    },
  ],
] as const)('finds the way in on %s', async (name, expected) => {
  for (const result of [false, true]) {
    expect(await readMenu(fixture(name), { leader: 'candela', league: 'master', result })).toEqual(expected);
  }
});

test('taps BATTLE on the main menu, under its label', async () => {
  const menu = await readMenu(fixture('menu-main'), { leader: 'candela', league: 'master', result: false });

  expect(menu.screen).toBe('main');
  expect(near(menu, 0.777, 0.5975)).toBe(true);
});

test.each(['menu-unknown-medal', 'menu-unknown-loss'])('waits on %s, before the ✓ has appeared', async (name) => {
  expect(await readMenu(fixture(name), { leader: 'blanche', league: 'ultra', result: true })).toEqual({
    screen: 'unknown',
  });
});
