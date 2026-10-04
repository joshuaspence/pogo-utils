/**
 * What the codec does with images it builds itself, which is the whole of what a test of it needs: every function here
 * is a pure transformation of a pixel buffer, so there is no phone, no screenshot and no Tesseract anywhere below.
 *
 * The round trip is the one that matters. `encodePng` writes colour type 6 and filter 0 on every row, and `decodePng`
 * reads the four colour types a phone produces through the four filters PNG defines, so encoding and decoding back
 * exercises only the narrowest path either way. A fixture encoded elsewhere is what would reach the rest, and the
 * captures that do that arrive with the readers rather than here.
 */

import { crc32, deflateSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { brighten, crop, decodePng, difference, encodePng, isolate, rgb, scale, type Image } from './png.mts';

/** An image whose every pixel is a function of its position, so a transposition or an off-by-one shows up as a value. */
const ramp = (width: number, height: number): Image => {
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set([x * 10, y * 10, x + y, 255], (y * width + x) * 4);
    }
  }

  return { width, height, data };
};

test('an image survives being encoded and decoded byte for byte', () => {
  const image = ramp(7, 5);
  const back = decodePng(encodePng(image));

  expect([back.width, back.height]).toStrictEqual([7, 5]);
  expect([...back.data]).toStrictEqual([...image.data]);
});

test('a zero-byte image is not a PNG, and nor is one whose signature is broken', () => {
  expect(() => decodePng(Buffer.alloc(0))).toThrow(/not a PNG/);
  expect(() => decodePng(encodePng(ramp(2, 2)).subarray(1))).toThrow(/not a PNG/);
});

/**
 * Cut through a chunk header, through the IHDR, through the IDAT and at a chunk boundary just short of IEND — the last
 * being the one only the missing IEND gives away, since every chunk before it is whole.
 */
test('a PNG cut off anywhere after its signature is refused as truncated', () => {
  const valid = encodePng(ramp(3, 3));

  for (const length of [10, 20, 40, valid.length - 13, valid.length - 12, valid.length - 1]) {
    expect(() => decodePng(valid.subarray(0, length)), `cut at ${length}`).toThrow(/truncated PNG/);
  }
});

test('a PNG with no IHDR chunk is refused rather than read as an empty image', () => {
  // The IHDR is the 25 bytes after the signature: length, type, 13 bytes of header and a CRC.
  const valid = encodePng(ramp(2, 2));

  expect(() => decodePng(Buffer.concat([valid.subarray(0, 8), valid.subarray(33)]))).toThrow(/no IHDR/);
});

test('a byte damaged inside a chunk is caught by its CRC', () => {
  const bytes = Buffer.from(encodePng(ramp(2, 2)));
  bytes[45] = (bytes[45] ?? 0) ^ 0xff;

  expect(() => decodePng(bytes)).toThrow(/IDAT chunk fails its CRC/);
});

/** A PNG around `raw` as its inflated pixel stream, with honest CRCs, so only the stream itself is wrong. */
const withPixels = (raw: number[]): Buffer => {
  const valid = encodePng(ramp(2, 2));
  const body = deflateSync(Buffer.from(raw));
  const idat = Buffer.alloc(12 + body.length);
  idat.writeUInt32BE(body.length, 0);
  idat.write('IDAT', 4, 'latin1');
  body.copy(idat, 8);
  idat.writeUInt32BE(crc32(idat.subarray(4, 8 + body.length)), 8 + body.length);

  return Buffer.concat([valid.subarray(0, 33), idat, valid.subarray(-12)]);
};

test('a pixel stream that is short or names an unknown filter is refused rather than filled in', () => {
  const row = (filter: number) => [filter, ...new Array<number>(8).fill(128)];

  expect(decodePng(withPixels([...row(0), ...row(4)])).data, 'the helper builds a readable PNG').toHaveLength(16);
  expect(() => decodePng(withPixels(row(0)))).toThrow(/9 bytes of pixels where 2×2 needs 18/);
  expect(() => decodePng(withPixels([...row(0), ...row(5)]))).toThrow(/row 1 has filter 5/);
});

/**
 * The header is checked before the pixels, so an image this cannot read is refused rather than mis-read. Written by
 * hand because `encodePng` emits 8-bit RGBA and nothing else, so there is no way to produce one of these from it.
 */
test('a bit depth or an interlace this does not read is refused by name', () => {
  const valid = encodePng(ramp(2, 2));

  for (const [offset, value, what] of [
    [24, 16, 'bit depth 16'],
    [25, 3, 'colour type 3'],
    [28, 1, 'interlace 1'],
  ] as [number, number, string][]) {
    const bytes = Buffer.from(valid);
    bytes[offset] = value;
    bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);

    expect(() => decodePng(bytes), `${what} is read rather than refused`).toThrow(/unsupported PNG/);
  }
});

test('a pixel reads as its three channels, and outside the image as black', () => {
  const image = ramp(4, 3);

  expect(rgb(image, 0, 0)).toStrictEqual([0, 0, 0]);
  expect(rgb(image, 3, 2)).toStrictEqual([30, 20, 5]);

  for (const [x, y] of [
    [-1, 0],
    [0, -1],
    [4, 0],
    [0, 3],
  ] as [number, number][]) {
    expect(rgb(image, x, y), `${x},${y} is outside the image and is not black`).toStrictEqual([0, 0, 0]);
  }
});

test('a crop takes the rectangle asked for, and clamps one that runs off the edge', () => {
  const image = ramp(6, 6);
  const middle = crop(image, 2, 1, 3, 2);

  expect([middle.width, middle.height]).toStrictEqual([3, 2]);
  expect(rgb(middle, 0, 0)).toStrictEqual(rgb(image, 2, 1));
  expect(rgb(middle, 2, 1)).toStrictEqual(rgb(image, 4, 2));

  // A scan sweeping bands runs off the bottom by design, so this clamps rather than throwing.
  const over = crop(image, 4, 4, 10, 10);
  expect([over.width, over.height]).toStrictEqual([2, 2]);
  expect(rgb(over, 0, 0)).toStrictEqual(rgb(image, 4, 4));
});

test('a crop off the top or left edge is trimmed rather than slid back inside', () => {
  const image = ramp(6, 6);
  const corner = crop(image, -2, -1, 3, 3);

  expect([corner.width, corner.height], 'only column 0 and rows 0–1 overlap').toStrictEqual([1, 2]);
  expect(rgb(corner, 0, 0)).toStrictEqual(rgb(image, 0, 0));
  expect(rgb(corner, 0, 1)).toStrictEqual(rgb(image, 0, 1));
});

test('a crop wholly outside the image is empty, rather than the pixels of the next row', () => {
  const image = ramp(4, 2);

  for (const [left, top] of [
    [4, 0],
    [5, 0],
    [0, 2],
    [-3, 0],
  ] as [number, number][]) {
    const outside = crop(image, left, top, 2, 1);

    expect(outside.width * outside.height, `${left},${top} overlaps nothing and is not empty`).toBe(0);
    expect(outside.data).toHaveLength(0);
  }
});

test('an inverted crop is the same rectangle with every channel turned round', () => {
  const image = ramp(4, 4);
  const plain = crop(image, 0, 0, 2, 2);
  const inverted = crop(image, 0, 0, 2, 2, true);

  expect([inverted.width, inverted.height]).toStrictEqual([2, 2]);

  for (const [x, y] of [
    [0, 0],
    [1, 1],
  ] as [number, number][]) {
    expect(rgb(inverted, x, y)).toStrictEqual(rgb(plain, x, y).map((c) => 255 - c));
  }
});

test('a scale repeats each pixel, nearest neighbour and no blending', () => {
  const image = ramp(3, 2);
  const bigger = scale(image, 2);

  expect([bigger.width, bigger.height]).toStrictEqual([6, 4]);

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 6; x++) {
      expect(rgb(bigger, x, y), `${x},${y} is not the pixel it was enlarged from`).toStrictEqual(
        rgb(image, Math.floor(x / 2), Math.floor(y / 2)),
      );
    }
  }
});

/**
 * Both bounds of `isolate`, which is what the overlay needs and what a plain luminance threshold cannot give: the floor
 * drops the dark box the text sits on, and the ceiling drops the IV percentage, which is coloured by how good the
 * Pokémon is. Black is the ink here and white the page, which is the pairing Tesseract reads best.
 */
test('isolate keeps a pixel only where it is both bright enough and grey enough', () => {
  // Cyan rather than the magenta the overlay draws at 93, because magenta's luminance is 72.6 and so fails the floor
  // before the ceiling is ever reached — an assertion that would pass with the colour test deleted. Cyan is 200.8,
  // which is the IV percentage at 86 and the one that genuinely needs the chroma half.
  const pixels: [number, number, number][] = [
    [255, 255, 255],
    [40, 40, 40],
    [0, 255, 255],
  ];
  const data = new Uint8Array(pixels.length * 4);
  pixels.forEach((p, i) => data.set([...p, 255], i * 4));

  const out = isolate({ width: pixels.length, height: 1, data }, 150, 55);

  expect(rgb(out, 0, 0), 'white is bright and grey, so it is ink').toStrictEqual([0, 0, 0]);
  expect(rgb(out, 1, 0), 'dark grey fails the luminance floor').toStrictEqual([255, 255, 255]);
  expect(rgb(out, 2, 0), 'cyan is bright enough and fails the chroma ceiling').toStrictEqual([255, 255, 255]);
});

test('brighten is the same test without the colour half, so it keeps what isolate drops', () => {
  // The same cyan, which is the pair of tests saying something neither says alone: `isolate` deletes it for being
  // coloured and `brighten` keeps it for being bright, which is why the overlay is read both ways. Cyan rather than
  // magenta because the brightest channel has to be one that is **not** red — against a red-only test magenta's 255
  // passes either way, and the thing being asserted is that all three channels are looked at.
  const data = new Uint8Array(8);
  data.set([0, 255, 255, 255], 0);
  data.set([40, 40, 40, 255], 4);

  const out = brighten({ width: 2, height: 1, data }, 150);

  expect(rgb(out, 0, 0), 'cyan reaches the floor on its brightest channel').toStrictEqual([0, 0, 0]);
  expect(rgb(out, 1, 0)).toStrictEqual([255, 255, 255]);
});

/**
 * The band is what `difference` is about rather than the threshold: a caller watches the game's own panel for a screen
 * to settle, because the artwork above it holds an animated Pokémon that never stops and the status bar ticks with the
 * clock. So a change outside the band has to read as no change at all.
 */
test('difference answers over the band it is given and ignores the rest of the frame', () => {
  const a = ramp(10, 10);
  const b = { ...a, data: new Uint8Array(a.data) };

  for (let x = 0; x < 10; x++) {
    b.data[(2 * 10 + x) * 4] = 255;
  }

  expect(difference(a, b, 0.2, 0.3), 'the whole of this band is the row that changed').toBe(1);
  expect(difference(a, b, 0.5, 1), 'the row that changed is not in this band').toBe(0);
  expect(difference(a, b, 0, 1), 'one row of ten').toBeCloseTo(0.1, 10);
  expect(difference(a, a, 0, 1), 'a frame against itself').toBe(0);
});

test('two images of different sizes differ completely rather than throwing', () => {
  expect(difference(ramp(4, 4), ramp(5, 4), 0, 1)).toBe(1);
});
