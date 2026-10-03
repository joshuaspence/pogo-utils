/**
 * The helpers callers find text with, and what `ocr` does when Tesseract cannot start. Reading real captures is left to
 * the readers that have them; `findLine` and `centre` have no reader below the CLI, so they are pinned here.
 */

import { centre, findLine, fold, ocr, type Line } from './ocr.mts';
import { expect, test } from 'vitest';

const line = (text: string, left = 0, top = 0): Line => ({ text, left, top, width: 100, height: 20 });

test('a pattern is matched against folded text, so it is written in lowercase and without punctuation', () => {
  const lines = [line('Pokémon'), line('CP 1,234'), line('Search')];

  expect(findLine(lines, /^search\b/)?.text).toBe('Search');
  expect(findLine(lines, /\bcp \d/)?.text).toBe('CP 1,234');
  expect(findLine(lines, /pokemon/)?.text).toBe('Pokémon');
  expect(findLine(lines, /Search/), 'a pattern with capitals can never match').toBeUndefined();
});

test('the first match is the one returned', () => {
  expect(findLine([line('eggs', 0, 10), line('eggs', 0, 20)], /eggs/)?.top).toBe(10);
});

test('a centre is the middle of the box', () => {
  expect(centre({ text: '', left: 10, top: 20, width: 30, height: 40 })).toStrictEqual([25, 40]);
});

test('a move keeps its pluses through a fold', () => {
  expect(fold('Aeroblast++')).toBe('aeroblast++');
  expect(fold('Aeroblast')).not.toBe(fold('Aeroblast+'));
});

/**
 * A Tesseract that cannot load its model exits before it reads its input, and an image bigger than a pipe holds then
 * fails to write. Without a guard on stdin that EPIPE is an unhandled error that kills the whole process rather than a
 * rejection the caller can catch, so the image here is noise: incompressible, it encodes to far more than 64 KiB.
 */
test('a Tesseract that fails to start is a rejection naming why, however large the image', async () => {
  const data = new Uint8Array(400 * 400 * 4).map(() => Math.floor(Math.random() * 256));
  const previous = process.env['TESSDATA_PREFIX'];
  process.env['TESSDATA_PREFIX'] = '/nonexistent';

  try {
    await expect(ocr({ width: 400, height: 400, data })).rejects.toThrow(/tesseract exited 1: .*eng/s);
  } finally {
    if (previous === undefined) {
      delete process.env['TESSDATA_PREFIX'];
    } else {
      process.env['TESSDATA_PREFIX'] = previous;
    }
  }
});
