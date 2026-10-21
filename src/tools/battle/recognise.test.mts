/**
 * The recogniser against frames of real Team Leader battles, recorded off a Pixel 4 XL and scaled to the stream's
 * 360×760. Each still is named for the state it shows, so the expectation is the name's first word; among them are
 * the near misses that set the thresholds — the map's notification, the fade into a battle, the shield going up —
 * which is what keeps a loosened threshold from passing unnoticed.
 *
 * `charge.h264` is five seconds of one battle re-encoded at the stream's size, run through the decoder a battle runs
 * on rather than a still: a fight, a charged move coming ready, and its throw — the button going dark for a third of a
 * second before the screen gives way to the throw, 12 frames that half-second samples of the same footage stepped over.
 */

import { decodePng } from '../inventory/png.mts';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { recognise, type State } from './recognise.mts';
import { decodeFrames } from './stream.mts';

const FIXTURES = fileURLToPath(new URL('fixtures/', import.meta.url));

const stills = readdirSync(FIXTURES).filter((name) => name.endsWith('.png'));

test.each(stills)('%s', (name) => {
  const expected = name.split('-')[0];

  expect(recognise(decodePng(readFileSync(FIXTURES + name)))).toBe(expected);
});

test('covers every state', () => {
  const states: State[] = ['battle', 'charged', 'shield', 'switch', 'other'];

  expect(new Set(stills.map((name) => name.split('-')[0]))).toEqual(new Set(states));
});

test('follows a charged move coming ready and being thrown through the decoder', async () => {
  const runs: State[] = [];

  for await (const frame of decodeFrames(createReadStream(FIXTURES + 'charge.h264'))) {
    const state = recognise(frame);

    if (runs.at(-1) !== state) {
      runs.push(state);
    }
  }

  expect(runs).toEqual(['battle', 'charged', 'battle', 'other']);
});
