/**
 * Just enough PNG to read what `adb exec-out screencap -p` hands back and to write a crop of it back out for Tesseract.
 * A dependency would do the same, but the whole of what is needed is an 8-bit, non-interlaced image in one of the four
 * colour types a phone produces, and Node's zlib already carries the inflate, the deflate and the CRC.
 */

import { crc32, deflateSync, inflateSync } from 'node:zlib';

/** An image as four bytes a pixel, red, green, blue and alpha, row after row. */
export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bytes per pixel for each colour type this reads: greyscale, RGB, greyscale with alpha and RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** Why a screenshot cannot be read, with where to look, since a damaged one is far likelier than a damaged codec. */
const refuse = (why: string): Error =>
  new Error(`${why} (did the screenshot fail? run \`adb exec-out screencap -p\` by hand to see)`);

/**
 * Refuses rather than guesses: a cut-off or damaged `screencap` stream would otherwise decode to an image of the right
 * size with garbage rows in it, and a scan reading those would record nonsense rather than stop.
 */
export function decodePng(bytes: Buffer): Image {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw refuse('not a PNG');
  }

  let width = 0;
  let height = 0;
  let channels = 0;
  let ended = false;
  const idat: Buffer[] = [];

  for (let at = 8; at < bytes.length && !ended;) {
    if (at + 12 > bytes.length || at + 12 + bytes.readUInt32BE(at) > bytes.length) {
      throw refuse('truncated PNG');
    }

    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);

    if (bytes.readUInt32BE(at + 8 + length) !== crc32(bytes.subarray(at + 4, at + 8 + length))) {
      throw refuse(`corrupt PNG: the ${type} chunk fails its CRC`);
    }

    at += 12 + length;

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      channels = CHANNELS[colour ?? -1] ?? 0;

      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(`unsupported PNG: bit depth ${depth}, colour type ${colour}, interlace ${interlace}`);
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      ended = true;
    }
  }

  if (channels === 0) {
    throw refuse('not a PNG: there is no IHDR chunk');
  } else if (!ended) {
    throw refuse('truncated PNG');
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);

  if (raw.length < (stride + 1) * height) {
    throw refuse(`corrupt PNG: ${raw.length} bytes of pixels where ${width}×${height} needs ${(stride + 1) * height}`);
  }

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = y * stride;

    if (filter > 4) {
      throw refuse(`corrupt PNG: row ${y} has filter ${filter}`);
    }

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? (pixels[row + x - channels] ?? 0) : 0;
      const b = y > 0 ? (pixels[row - stride + x] ?? 0) : 0;
      const c = x >= channels && y > 0 ? (pixels[row - stride + x - channels] ?? 0) : 0;
      const value = line[x] ?? 0;
      let predicted = 0;

      if (filter === 1) {
        predicted = a;
      } else if (filter === 2) {
        predicted = b;
      } else if (filter === 3) {
        predicted = (a + b) >> 1;
      } else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }

      pixels[row + x] = (value + predicted) & 0xff;
    }
  }

  if (channels === 4) {
    return { width, height, data: pixels };
  }

  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const src = i * channels;
    const grey = channels < 3;
    data[i * 4] = pixels[src] ?? 0;
    data[i * 4 + 1] = pixels[grey ? src : src + 1] ?? 0;
    data[i * 4 + 2] = pixels[grey ? src : src + 2] ?? 0;
    data[i * 4 + 3] = channels === 2 ? (pixels[src + 1] ?? 255) : 255;
  }

  return { width, height, data };
}

export function encodePng(image: Image): Buffer {
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);

  for (let y = 0; y < image.height; y++) {
    raw.set(image.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header.set([8, 6, 0, 0, 0], 8);

  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND')]);
}

function chunk(type: string, body = Buffer.alloc(0)): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);

  return out;
}

/** The pixel at a point, as `[r, g, b]`. Outside the image is black rather than a throw, so a scan can overrun. */
export function rgb(image: Image, x: number, y: number): [number, number, number] {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return [0, 0, 0];
  }

  const i = (Math.floor(y) * image.width + Math.floor(x)) * 4;

  return [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0];
}

/**
 * The part of a rectangle that lies inside an image, optionally inverted — white text on a sky reads badly. A
 * rectangle running off an edge is trimmed to it rather than slid back inside, and one wholly outside is an empty
 * image, so a band placed by a fraction of the screen can overrun without picking up pixels it never asked for.
 */
export function crop(image: Image, left: number, top: number, width: number, height: number, invert = false): Image {
  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const w = Math.max(0, Math.min(image.width, Math.floor(left) + Math.floor(width)) - x0);
  const h = Math.max(0, Math.min(image.height, Math.floor(top) + Math.floor(height)) - y0);
  const data = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * image.width + x0) * 4;
    data.set(image.data.subarray(src, src + w * 4), y * w * 4);
  }

  if (invert) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - (data[i] ?? 0);
      data[i + 1] = 255 - (data[i + 1] ?? 0);
      data[i + 2] = 255 - (data[i + 2] ?? 0);
    }
  }

  return { width: w, height: h, data };
}

/**
 * A nearest-neighbour enlargement. Tesseract reads small text better with more pixels under it, but only up to a
 * point: measured over twelve overlay captures, 2x turned `14/18/12` into the `14/13/12` it really was, where 3x and
 * 4x started reading the `L` of the level as a `1`.
 */
export function scale(image: Image, factor: number): Image {
  const w = image.width * factor;
  const h = image.height * factor;
  const data = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (Math.floor(y / factor) * image.width + Math.floor(x / factor)) * 4;
      data.set(image.data.subarray(src, src + 4), (y * w + x) * 4);
    }
  }

  return { width: w, height: h, data };
}

/**
 * Bright, unsaturated pixels as black on white, which is the pairing Tesseract reads best. Both bounds earn their
 * place on PGSharp's overlay: the luminance floor drops the dark box the text sits on, and the chroma ceiling drops
 * the IV percentage, which shares the line and is coloured by how good the Pokemon is — magenta at 93, cyan at 86,
 * green at 75. Dropping it is the point rather than a cost, since it is derivable from the three IVs beside it and
 * its colour is what made it the one field that would not threshold.
 */
export function isolate(image: Image, minLuminance: number, maxChroma: number): Image {
  const data = new Uint8Array(image.data.length);

  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i] ?? 0;
    const g = image.data[i + 1] ?? 0;
    const b = image.data[i + 2] ?? 0;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const value = luminance >= minLuminance && chroma <= maxChroma ? 0 : 255;

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  return { width: image.width, height: image.height, data };
}

/**
 * How much of a horizontal band differs between two screenshots, as a fraction of the pixels in it. Only the red
 * channel is compared, which is four times less work and answers the same question.
 *
 * The band matters more than the threshold. Through one swipe the game's panel measured 31%, then 6.2%, then 0.54%
 * and stayed near it, where the artwork above never fell below 4% at all because the Pokémon is animated, and the
 * status bar ticks with the clock. So a caller watching for a screen to stop moving watches the panel and nothing
 * else, and compares against a figure between those two — not against zero, which never arrives.
 */
/**
 * Black where a channel reaches `min` and white elsewhere, which is `isolate` without the colour test. What that buys
 * is the overlay: its IV percentage is colour-coded by quality — magenta at 93, cyan at 86, green at 75 — so a chroma
 * limit deletes it, and the same limit clips the anti-aliased edge of a thin white `1` beside it. Measured on five
 * captures, the near-white treatment reads `2/4/13` where this reads `12/4/13`.
 */
export function brighten(image: Image, min: number): Image {
  const data = new Uint8Array(image.data.length);

  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.max(image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0) >= min ? 0 : 255;

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  return { width: image.width, height: image.height, data };
}

export function difference(a: Image, b: Image, from: number, to: number): number {
  if (a.width !== b.width || a.height !== b.height) {
    return 1;
  }

  const first = Math.max(0, Math.round(a.height * from));
  const last = Math.min(a.height, Math.round(a.height * to));
  let differing = 0;

  for (let y = first; y < last; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;

      if (Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) > 8) {
        differing++;
      }
    }
  }

  return differing / Math.max(1, (last - first) * a.width);
}
