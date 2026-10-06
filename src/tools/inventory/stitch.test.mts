/**
 * What the stitcher does to frames it is handed, built here rather than captured: the whole of a scroll capture is a
 * pure function of a list of images, so a test of it needs no phone and no screenshots.
 *
 * **Every case starts from a tall image and cuts frames out of it**, which is what makes the assertion the strong one
 * — the stitch has to reproduce the source it was sliced from, pixel for pixel, rather than merely come back the right
 * size. A test that asserted dimensions would pass on an image assembled at entirely the wrong offsets.
 *
 * The fixed furniture is in every fixture here on purpose. A status bar that ticks, an overlay drawn over the app and
 * the game's own floating buttons are what a naive concatenation repeats once per frame, and they are also what makes
 * a whole-screen correlation answer zero — so a band that excludes them is the thing under test as much as the
 * stitching is.
 */

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { offsetBetween, stitch, SCROLL_STEP, type Band } from './stitch.mts';
import { decodePng, rgb, type Image } from './png.mts';

const BAND: Band = { from: 0.2, to: 0.9 };
const WIDTH = 120;
const FRAME = 400;

const blank = (width: number, height: number): Image => ({
  width,
  height,
  data: new Uint8Array(width * height * 4),
});

/**
 * A deterministic hash, because the obvious thing does not work: a row painted `(37 * y + 3 * x) % 256` repeats every
 * 256 rows, and `profile` and `pixelCost` read the red channel alone, so the difference between two frames becomes a
 * function of the shift and nothing else — deep minima at shifts that line nothing up, a scroll of 100 reading as 190.
 * Real screen content is not periodic like that, but a fixture has to be built not to be.
 */
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;

  return h ^ (h >>> 16);
};

/** A pixel whose value is a function of where it is, so a row placed wrongly reads as the wrong number. */
const paint = (image: Image, y: number, seed: number) => {
  for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4;
    const h = hash(x, seed);
    image.data[i] = h & 255;
    image.data[i + 1] = (h >>> 8) & 255;
    image.data[i + 2] = (h >>> 16) & 255;
    image.data[i + 3] = 255;
  }
};

/** The content a screen would scroll through, each row distinguishable from every other. */
const content = (height: number): Image => {
  const image = blank(WIDTH, height);

  for (let y = 0; y < height; y++) {
    paint(image, y, y + 1000);
  }

  return image;
};

/**
 * One frame of a scroll: the band filled from `source` starting at `scrolled`, with furniture above and below that is
 * identical on every frame. The furniture is what a correlation over the whole frame would lock on to.
 */
const frameAt = (source: Image, scrolled: number): Image => {
  const image = blank(WIDTH, FRAME);
  const top = Math.round(FRAME * BAND.from);
  const bottom = Math.round(FRAME * BAND.to);

  for (let y = 0; y < top; y++) {
    paint(image, y, 7);
  }

  for (let y = top; y < bottom; y++) {
    const from = scrolled + (y - top);
    image.data.set(source.data.subarray(from * WIDTH * 4, (from + 1) * WIDTH * 4), y * WIDTH * 4);
  }

  for (let y = bottom; y < FRAME; y++) {
    paint(image, y, 9);
  }

  return image;
};

test('the shift between two frames is the number of pixels the content moved', () => {
  const source = content(2000);

  for (const shift of [1, 17, 100, 193]) {
    expect(offsetBetween(frameAt(source, 0), frameAt(source, shift), BAND), `a scroll of ${shift}`).toBe(shift);
  }
});

/**
 * A screen that did not move, which is how a scroll says it has reached the end. It answers **zero** rather than null,
 * and the difference is the point: zero is a measurement — the content is where it was — where null is this reader
 * saying it cannot tell. A capture stops on either, but only one of them is a fact about the screen.
 *
 * It might be expected to be refused, identical frames seeming to score alike everywhere. They do not: a shift of zero
 * scores exactly nought and everything else scores the full width of the content, so it stands out further than any
 * real scroll does.
 */
test('two identical frames have not moved, which is a shift of zero', () => {
  const frame = frameAt(content(2000), 40);

  expect(offsetBetween(frame, frame, BAND)).toBe(0);
});

/**
 * Content with nothing in it to line up, which is the failure mode a real screen has and a hashed fixture does not: a
 * band of flat colour matches itself at every shift equally well, so no candidate stands out and the honest answer is
 * that this cannot be told. A reader that picked the least-bad of an indistinguishable field would assemble a capture
 * of something that was never on the screen.
 */
test('a band with nothing to line up on is refused', () => {
  const flat = blank(WIDTH, 2000);
  flat.data.fill(200);

  expect(offsetBetween(frameAt(flat, 0), frameAt(flat, 60), BAND)).toBe(null);
});

/**
 * Frames sharing too little of the band to be sure. A scroll that moved most of a screen leaves a sliver to correlate,
 * and the least-bad candidate of a bad field is a guess — so this refuses rather than answering it.
 */
test('frames that barely overlap are refused rather than guessed at', () => {
  const source = content(2000);
  const band = Math.round(FRAME * BAND.to) - Math.round(FRAME * BAND.from);

  expect(offsetBetween(frameAt(source, 0), frameAt(source, band), BAND), 'no overlap at all').toBe(null);
  expect(offsetBetween(frameAt(source, 0), frameAt(source, band - 10), BAND), 'ten rows of overlap').toBe(null);
});

test('frames of different sizes cannot be lined up', () => {
  expect(offsetBetween(blank(WIDTH, FRAME), blank(WIDTH + 1, FRAME), BAND)).toBe(null);
});

/** The shifts between each consecutive pair, as a capture measures them while it scrolls. */
const offsetsOf = (frames: readonly Image[]) =>
  frames.slice(1).map((frame, i) => offsetBetween(frames[i] as Image, frame, BAND));

/**
 * The round trip, and the assertion the rest of this file exists to set up: frames cut from a tall image at known
 * offsets must be measured at those offsets and stitch back into exactly the rows they were cut from, with the
 * furniture appearing once.
 */
test('frames cut from a tall image stitch back into it', () => {
  const source = content(2000);
  const shifts = [150, 150, 150];
  const frames = shifts.reduce<number[]>((at, s) => [...at, (at.at(-1) ?? 0) + s], [0]).map((s) => frameAt(source, s));

  expect(offsetsOf(frames)).toStrictEqual(shifts);

  const image = stitch(frames, shifts, BAND);

  const top = Math.round(FRAME * BAND.from);
  const bottom = Math.round(FRAME * BAND.to);
  expect(image.height, 'the stitch is not as tall as the rows it was given').toBe(
    FRAME + shifts.reduce((a, b) => a + b, 0),
  );

  // The scrolled content, row for row against the image the frames were cut from.
  const wrong: string[] = [];

  for (let y = 0; y < bottom - top + shifts.reduce((a, b) => a + b, 0); y++) {
    for (const x of [0, 37, WIDTH - 1]) {
      const got = rgb(image, x, top + y);
      const want = rgb(source, x, y);

      if (got.join() !== want.join()) {
        wrong.push(`row ${y} column ${x}: ${got.join()} is not ${want.join()}`);
      }
    }
  }

  expect(wrong.slice(0, 5), 'the stitched content is not the content it was cut from').toStrictEqual([]);
});

/**
 * That the furniture appears once rather than once per frame, which is the failure a concatenation would have and the
 * one that is invisible in a height check — four frames concatenated are exactly as tall as this when the shifts
 * happen to be the band's height.
 */
test('the fixed furniture is taken once, from the first frame and the last', () => {
  const source = content(2000);
  const frames = [0, 120, 240].map((s) => frameAt(source, s));
  const image = stitch(frames, [120, 120], BAND);
  const top = Math.round(FRAME * BAND.from);
  const bottom = Math.round(FRAME * BAND.to);

  // Above the band: the status bar, once, and immediately against the scrolled content rather than repeated.
  expect(rgb(image, 10, 0), 'the row above the band is not the furniture').toStrictEqual(
    rgb(frames[0] as Image, 10, 0),
  );
  expect(rgb(image, 10, top - 1)).toStrictEqual(rgb(frames[0] as Image, 10, top - 1));
  expect(rgb(image, 10, top), 'the band does not start where the furniture ends').toStrictEqual(rgb(source, 10, 0));

  // Below it: the floating buttons, once, at the very bottom.
  const tail = image.height - (FRAME - bottom);
  expect(rgb(image, 10, tail)).toStrictEqual(rgb(frames[2] as Image, 10, bottom));
  expect(rgb(image, 10, image.height - 1)).toStrictEqual(rgb(frames[2] as Image, 10, FRAME - 1));

  // And the row before the furniture is still content, which is what says it was not appended early.
  expect(rgb(image, 10, tail - 1), 'the furniture starts before the content ends').toStrictEqual(
    rgb(source, 10, bottom - top + 240 - 1),
  );
});

test('stitching nothing, or frames without a shift between each pair, is a mistake', () => {
  const frame = frameAt(content(2000), 0);

  expect(() => stitch([], [], BAND)).toThrow(/no frames/);
  expect(() => stitch([frame, frame], [], BAND)).toThrow(/2 frames and 0 shifts/);
});

/**
 * The band a detail screen actually scrolls in, and two captures of real ones — which is the half the built fixtures
 * above cannot reach, because what they lack is a **layout**. Every detail screen has the same panel, the same rows of
 * labels and the same buttons, and that is enough for one screen's row summaries to line up against another's.
 *
 * `pikachu.png` against `smoliv.png` is that case: their summaries line up at a shift of 114, which would be two
 * Pokémon assembled into one image. It is refused by how **close** the match is rather than by how far it stands out —
 * a true scroll costs 0.00 where these two cost 19.12 at their best, the band being 70% flat panel grey.
 */
const SCREEN: Band = { from: 0.34, to: 0.95 };
const capture = (file: string) => decodePng(readFileSync(new URL(`fixtures/${file}`, import.meta.url)));

/** A real capture with its band slid up, which is what a scroll does while the status bar and overlay stay put. */
const slid = (image: Image, by: number): Image => {
  const out: Image = { width: image.width, height: image.height, data: new Uint8Array(image.data) };
  const stride = image.width * 4;
  const top = Math.round(image.height * SCREEN.from);
  const bottom = Math.round(image.height * SCREEN.to);

  for (let y = top; y < bottom; y++) {
    const from = Math.min(image.height - 1, y + by);
    out.data.set(image.data.subarray(from * stride, (from + 1) * stride), y * stride);
  }

  return out;
};

test('a real capture slid by a known amount reads back as that amount', () => {
  const screen = capture('pikachu.png');

  for (const by of [7, 60, 300, 700]) {
    expect(offsetBetween(screen, slid(screen, by), SCREEN), `slid ${by}`).toBe(by);
  }
});

/**
 * How far one step of a scroll capture may move and still be lined up, on a real screen. Half the band is what the
 * capture drags, and it reads back exactly; the scan's single swipe to the moves, half the whole screen, is past what
 * `offsetBetween` looks for at all, which is why a capture does not use it.
 */
test('the step a scroll capture drags is within reach, and the single swipe to the moves is not', () => {
  const screen = capture('pikachu.png');
  const band = Math.round(screen.height * SCREEN.to) - Math.round(screen.height * SCREEN.from);
  const step = Math.round(band * SCROLL_STEP);

  expect(offsetBetween(screen, slid(screen, step), SCREEN), 'a step').toBe(step);
  expect(offsetBetween(screen, slid(screen, Math.round(screen.height / 2)), SCREEN), 'the swipe').toBe(null);
});

test('two different detail screens are refused rather than lined up', () => {
  expect(
    offsetBetween(capture('pikachu.png'), capture('smoliv.png'), SCREEN),
    'two Pokémon were lined up into one image',
  ).toBe(null);
});

/**
 * Two captures of the same species and layout, differing only in a glyph and some numbers. They have not scrolled, so
 * zero is the right answer — and it is what stops a walk that wandered onto another Pokémon from being stitched as a
 * scroll, the capture ending at the last frame that moved.
 */
test('two captures that share a screen but have not scrolled answer zero', () => {
  expect(offsetBetween(capture('unown-b.png'), capture('unown-m.png'), SCREEN)).toBe(0);
});
