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

export function decodePng(bytes: Buffer): Image {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG (did the screenshot fail? run `adb exec-out screencap -p` by hand to see)');
  }

  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];

  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
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
      break;
    }
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = y * stride;

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

/** A rectangle out of an image, clamped to its edges, optionally inverted — white text on a sky reads badly. */
export function crop(image: Image, left: number, top: number, width: number, height: number, invert = false): Image {
  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const w = Math.max(1, Math.min(image.width - x0, Math.floor(width)));
  const h = Math.max(1, Math.min(image.height - y0, Math.floor(height)));
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
