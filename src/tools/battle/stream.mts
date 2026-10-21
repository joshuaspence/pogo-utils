/**
 * The phone's screen as a live picture, which is what a battle needs and a screenshot cannot give: `adb exec-out
 * screencap` takes 0.8–1.9s a frame on a Pixel 4 XL, against a PvP turn of 0.5s. `screenrecord` sends H.264 instead,
 * 30 frames a second, and `ffmpeg` decodes it here into the same `Image` the inventory readers take.
 *
 * `decodeFrames` is the half that knows nothing of the phone, so a test can hand it a recording off disk and exercise
 * the very decoder a battle runs on. `Screen` is the half that does: it keeps one recording going after another and
 * answers the latest frame.
 */

import { type Image } from '../inventory/png.mts';
import { spawn, type ChildProcess } from 'node:child_process';
import { type Readable } from 'node:stream';

/**
 * A quarter of the Pixel 4 XL's 1440×3040 each way, and so its exact shape. Colour samples need no more, and the frames
 * `ffmpeg` hands back are a quarter of what `screenrecord`'s 720×1520 would be — 33 MB a second rather than 131. The
 * screens read by OCR are still, and take a full screenshot instead.
 */
export const STREAM_SIZE = { width: 360, height: 760 } as const;

/**
 * Enough for the picture at `STREAM_SIZE`, against `screenrecord`'s default of 20 Mbps, which made 6 MB of four
 * seconds. Nothing here watches for detail a lower rate would blur; the cost of a higher one is USB and decoding time.
 */
const BIT_RATE = 2_000_000;

/** The longest `screenrecord` will record for, in seconds; it refuses a `--time-limit` past it. */
export const RECORD_LIMIT_S = 180;

/**
 * When the next recording starts, in milliseconds after the last. Short of `RECORD_LIMIT_S` by enough for it to have
 * sent its first frame before the old one stops — two at once were measured both running whole.
 */
const SEGMENT_MS = (RECORD_LIMIT_S - 10) * 1000;

/** A process writing H.264 to its stdout, and why it stopped to its stderr. */
export type Recording = ChildProcess & { stdout: Readable; stderr: Readable };

/** `adb` addressed at one phone, or at the only one plugged in. */
const adbArgs = (serial: string | undefined, ...args: string[]) => [...(serial ? ['-s', serial] : []), ...args];

/**
 * `screenrecord` writing H.264 to its stdout, for `seconds`. Its stdout carries nothing else — `exec-out` keeps stderr
 * apart, where `shell` would merge it — so whatever arrives decodes.
 */
export function screenrecord(serial: string | undefined, seconds = RECORD_LIMIT_S): Recording {
  const { width, height } = STREAM_SIZE;

  return spawn(
    'adb',
    adbArgs(
      serial,
      'exec-out',
      'screenrecord',
      '--output-format=h264',
      `--size=${width}x${height}`,
      `--bit-rate=${BIT_RATE}`,
      `--time-limit=${seconds}`,
      '-',
    ),
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/**
 * Each frame of an H.264 stream as it is decoded, ending with the stream. The flags are for latency: by default
 * `ffmpeg` probes a few seconds of input before it decodes any, and frame threading holds frames back to decode them
 * side by side, either of which puts the picture behind the battle it shows. `-fflags nobuffer` is the one that reads as
 * if it belongs with them and does not: it dropped 28 of the first 30 frames of a recording off the phone.
 */
export async function* decodeFrames(h264: Readable, { width, height } = STREAM_SIZE): AsyncGenerator<Image> {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      ...['-loglevel', 'error', '-flags', 'low_delay', '-probesize', '32', '-threads', '1'],
      ...['-f', 'h264', '-i', 'pipe:0'],
      ...['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, 'pipe:1'],
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  let stderr = '';
  ffmpeg.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

  const exited = new Promise<number | null>((resolve, reject) => {
    ffmpeg.once('error', reject);
    ffmpeg.once('close', resolve);
  });

  // Ended rather than piped through `pipe`'s own `end`, so that a source destroyed mid-stream — a recording `Screen`
  // has stopped — still lets `ffmpeg` flush what it has and exit, rather than leaving it waiting on a stdin nobody ends.
  h264.on('error', () => ffmpeg.stdin.end());
  h264.on('close', () => ffmpeg.stdin.end());
  ffmpeg.stdin.on('error', () => {});
  h264.pipe(ffmpeg.stdin);

  const size = width * height * 4;
  let pending: Buffer = Buffer.alloc(0);

  try {
    for await (const chunk of ffmpeg.stdout as AsyncIterable<Buffer>) {
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);

      while (pending.length >= size) {
        yield { width, height, data: new Uint8Array(pending.subarray(0, size)) };
        pending = pending.subarray(size);
      }
    }
  } finally {
    ffmpeg.kill();
  }

  const code = await exited;

  // A signal is `null`, and is `ffmpeg` being stopped rather than failing.
  if (code !== 0 && code !== null) {
    throw new Error(`ffmpeg exited ${code}: ${stderr.trim() || 'no output'}`);
  }
}

/** The latest frame and when it arrived, by `performance.now()`. */
export interface Frame {
  image: Image;
  at: number;
}

/**
 * The phone's screen, kept current. One recording runs at a time but for the moment the next takes over, which starts
 * `SEGMENT_MS` after the last and stops it on its first frame, so a battle longer than `RECORD_LIMIT_S` — a Team Leader
 * fight can run to four minutes — is watched without a gap.
 *
 * `latest` is the frame most recently decoded, and can be old: `screenrecord` encodes a frame only when the screen has
 * changed, so a screen standing still sends nothing. A caller asks whether what it shows has changed, not how long
 * since a frame came.
 */
export class Screen {
  readonly #record: () => Recording;
  readonly #segmentMs: number;
  #latest: Frame | undefined;
  #failure: Error | undefined;
  #current: ChildProcess | undefined;
  #timer: NodeJS.Timeout | undefined;
  #closed = false;

  /** How many recordings have started, and which of them is the one `latest` answers from. */
  #started = 0;
  #live = 0;

  /** `record` is `screenrecord` in a battle, and anything else that writes H.264 to its stdout in a test. */
  constructor(record: () => Recording, segmentMs = SEGMENT_MS) {
    this.#record = record;
    this.#segmentMs = segmentMs;
    this.#start();
  }

  /** The most recent frame, or `undefined` before the first. Throws once a recording has failed. */
  latest(): Frame | undefined {
    if (this.#failure) {
      throw this.#failure;
    }

    return this.#latest;
  }

  /** The first frame, which a recording that will not start never sends. */
  async first(timeoutMs = 10_000): Promise<Frame> {
    const until = performance.now() + timeoutMs;

    while (performance.now() < until) {
      const frame = this.latest();

      if (frame) {
        return frame;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`no frame from the phone in ${timeoutMs / 1000}s`);
  }

  close(): void {
    this.#closed = true;
    clearTimeout(this.#timer);
    this.#current?.kill();
  }

  #start(): void {
    const recording = this.#record();
    const generation = ++this.#started;
    let stderr = '';

    recording.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    this.#timer = setTimeout(() => this.#start(), this.#segmentMs);

    // Taking over only ever forwards, by `generation`: the old recording goes on sending frames for as long as its kill
    // takes, and one of those must not hand the screen back to it.
    const decoded = (async () => {
      for await (const image of decodeFrames(recording.stdout)) {
        if (generation > this.#live) {
          this.#current?.kill();
          this.#current = recording;
          this.#live = generation;
        }

        if (generation === this.#live) {
          this.#latest = { image, at: performance.now() };
        }
      }
    })();

    // A recording ending on its own is a failure unless a later one took over from it: the phone unplugged, `adb`
    // gone, or `screenrecord` refusing, which it does with exit 0 and the reason on stderr. The first recording counts
    // as live from the start, so one that never sends a frame fails too. Its own stderr is the reason before `ffmpeg`'s,
    // which for a recording that sent nothing only says that there was nothing to decode.
    decoded
      .catch((error: unknown) => error)
      .then((error) => {
        if (!this.#closed && generation >= this.#live) {
          const reason = stderr.trim() || (error instanceof Error ? error.message : 'it stopped sending frames');
          this.#failure = new Error(`screen recording ended: ${reason}`);
          this.close();
        }
      });

    if (!this.#current) {
      this.#current = recording;
      this.#live = generation;
    }
  }
}
