/**
 * The decoder and the hand-over between recordings, fed H.264 that `ffmpeg` makes up on the spot rather than a phone.
 * Each clip is one flat colour, so which recording a frame came from is a question of its first pixel.
 */

import { rgb } from '../inventory/png.mts';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect, test } from 'vitest';
import { decodeFrames, Screen, STREAM_SIZE, type Recording } from './stream.mts';

const { width, height } = STREAM_SIZE;

/**
 * `seconds` of `colour` at 30 frames a second, as raw H.264 on stdout, the way `screenrecord` sends it. `zerolatency`
 * because the phone's encoder sends each frame as it is made, where x264's lookahead held the first back 1.8s — longer
 * than a test waits for the hand-over, so the first clip had ended on its own before the second took over.
 */
const clip = (colour: string, seconds: number): Recording =>
  spawn(
    'ffmpeg',
    [
      ...['-loglevel', 'error', '-re', '-f', 'lavfi', '-i', `color=${colour}:size=${width}x${height}:rate=30`],
      ...[
        '-t',
        String(seconds),
        '-c:v',
        'libx264',
        '-tune',
        'zerolatency',
        '-pix_fmt',
        'yuv420p',
        '-f',
        'h264',
        'pipe:1',
      ],
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

test('decodes every frame of a stream at the stream size', async () => {
  const frames = [];

  for await (const frame of decodeFrames(clip('red', 1).stdout)) {
    frames.push(frame);
  }

  expect(frames).toHaveLength(30);
  expect(frames.every((frame) => frame.width === width && frame.height === height)).toBe(true);

  const [first] = frames;
  const [r, g, b] = first ? rgb(first, 10, 10) : [0, 0, 0];
  expect(r).toBeGreaterThan(200);
  expect(g + b).toBeLessThan(40);
});

test('hands the screen to the next recording without going back to the last', async () => {
  const recordings: Recording[] = [];
  const colours = ['red', 'blue'];

  const screen = new Screen(() => {
    const recording = clip(colours[recordings.length] ?? 'blue', 3);
    recordings.push(recording);
    return recording;
  }, 1000);

  try {
    expect(rgb((await screen.first()).image, 10, 10)[0]).toBeGreaterThan(200);

    await sleep(1800);

    const latest = screen.latest();

    expect(latest && rgb(latest.image, 10, 10)[2]).toBeGreaterThan(200);
    expect(recordings[0]?.killed).toBe(true);
  } finally {
    screen.close();
  }
});

test('fails when a recording ends without a later one taking over', async () => {
  const screen = new Screen(() =>
    spawn('sh', ['-c', 'echo "Unable to get output buffers" >&2'], { stdio: ['ignore', 'pipe', 'pipe'] }),
  );

  try {
    await expect(screen.first(5000)).rejects.toThrow(/screen recording ended: Unable to get output buffers/);
  } finally {
    screen.close();
  }
});

test('reports an ffmpeg it cannot find rather than throwing', async () => {
  const path = process.env.PATH;
  const h264 = clip('red', 1).stdout;

  // `spawn` reads `PATH` when it is called, so emptying it around the first step is what hides `ffmpeg` from the
  // decoder alone, the clip above having already found it.
  process.env.PATH = '';

  try {
    const frames = decodeFrames(h264);

    await expect(frames.next()).rejects.toThrow('ffmpeg failed: spawn ffmpeg ENOENT');
  } finally {
    process.env.PATH = path;
  }
});

test('stops a recording that has started but not yet taken over when closed', async () => {
  const recordings: Recording[] = [];

  // The second never sends a frame, so it is still waiting to take over when the screen closes.
  const screen = new Screen(() => {
    const recording =
      recordings.length === 0 ? clip('red', 5) : spawn('sleep', ['30'], { stdio: ['ignore', 'pipe', 'pipe'] });
    recordings.push(recording);
    return recording;
  }, 500);

  await screen.first();
  await sleep(700);
  screen.close();

  // At least the one that never took over, and as many more as a slow first frame let start: a fixed count failed every
  // time six copies of this file ran at once, a third recording having started before the close.
  expect(recordings.length).toBeGreaterThanOrEqual(2);
  expect(recordings.every((recording) => recording.killed)).toBe(true);
});

test('fails with the reason when a recording cannot start', async () => {
  const screen = new Screen(() => spawn('no-such-recorder', [], { stdio: ['ignore', 'pipe', 'pipe'] }));

  try {
    await expect(screen.first(5000)).rejects.toThrow(/screen recording ended: spawn no-such-recorder ENOENT/);
  } finally {
    screen.close();
  }
});
