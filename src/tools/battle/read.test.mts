/**
 * The names and move labels read off committed stream frames by the real Tesseract, each expectation being what the
 * frame shows. Our own name is a nickname in every one of them, so `own` is null throughout.
 */

import { readFileSync } from 'node:fs';
import { beforeAll, expect, test } from 'vitest';
import { type GameData } from '../inventory/game-master.mts';
import { tesseractCli } from '../inventory/ocr-cli.mts';
import { useEngine } from '../inventory/ocr.mts';
import { decodePng } from '../inventory/png.mts';
import { merge, readBattle } from './read.mts';

beforeAll(() => useEngine(tesseractCli));

const DATA = JSON.parse(
  readFileSync(new URL('../inventory/fixtures/game-master.json', import.meta.url), 'utf8'),
) as GameData;

const read = async (name: string) => {
  const sighting = await readBattle(decodePng(readFileSync(new URL(`fixtures/${name}.png`, import.meta.url))), DATA);

  return { ...sighting, moves: Object.fromEntries(sighting.moves) };
};

test.each([
  ['battle-two-unlit', 'Salamence', { 0.31: 'Hydro Pump', 0.69: 'Avalanche' }],
  ['charged-two-both', 'Entei', { 0.31: 'Hydro Pump', 0.69: 'Avalanche' }],
  ['charged-two-right', 'Entei', { 0.31: 'Hydro Pump', 0.69: 'Avalanche' }],
  ['battle-deoxys', 'Sneasel', { 0.499: 'Zap Cannon' }],
  ['charged-avalanche', 'Empoleon', { 0.499: 'Avalanche' }],
  ['charged-shadow-sneak', 'Mamoswine', { 0.499: 'Shadow Sneak' }],

  // Crunch's line runs on to x 0.89 behind Tyranitar, its centre nearer the right button than its own.
  ['battle-crunch-entei', 'Entei', { 0.499: 'Crunch' }],
  ['battle-crunch-salamence', 'Salamence', { 0.499: 'Crunch' }],
])('%s: against %s, with %o', async (name, opponent, moves) => {
  expect(await read(name)).toEqual({ own: null, opponent, moves });
});

test('a frame with no labels reads none, rather than reading its artwork as moves', async () => {
  expect(await read('battle-minigame-kyogre-great')).toEqual({ own: null, opponent: 'Entei', moves: {} });
  expect(await read('shield-glaceon')).toEqual({ own: null, opponent: null, moves: {} });
});

test('a read keeps what earlier reads found, bar labels of the other layout', () => {
  const seen = { own: null, opponent: 'Entei', moves: new Map([[0.499, 'Crunch']]) };

  expect(merge(seen, { own: null, opponent: null, moves: new Map([[0.31, 'Crunch']]) })).toEqual({
    own: null,
    opponent: 'Entei',
    moves: new Map([[0.31, 'Crunch']]),
  });
  expect(merge(seen, { own: null, opponent: 'Moltres', moves: new Map() }).moves, 'a read of no labels').toEqual(
    seen.moves,
  );
});
