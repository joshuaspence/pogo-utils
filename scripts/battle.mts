/**
 * Plays Pokémon GO's trainer battles on an Android phone over `adb`, watching the screen as H.264 from `screenrecord`
 * rather than screenshot by screenshot — a screenshot takes longer than a turn. Team Leader training is what it is built
 * against: a battle with nothing at stake, which is where its timing and its reading of the screen are tuned.
 *
 * Usage, from the repository root, with the phone plugged in, USB debugging on and Pokémon GO in English:
 *
 *   pnpm battle record [--seconds N] [--serial SERIAL] OUT
 *                       save `N` seconds (30 unless given, at most 180) of the screen to `OUT` as the raw H.264
 *                       a battle decodes, which is what the recognition fixtures are cut from
 *
 * Automating input breaks Niantic's terms of service, and unlike `pnpm inventory` this does not only read: it taps
 * through battles. Run it on an account whose loss you would accept.
 */

import { RECORD_LIMIT_S, screenrecord } from '../src/tools/battle/stream.mts';
import { createWriteStream, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seconds: { type: 'string', default: '30' },
    serial: { type: 'string' },
  },
});

const [command = 'help', ...rest] = positionals;

/** The synopsis out of this file's own header, as `inventory.mts` reads its own. */
const USAGE = readFileSync(new URL(import.meta.url), 'utf8')
  .match(/Usage[^]*?\n \*\n[^]*?\n \*\n/)?.[0]
  .replace(/^ \* ?/gm, '');

/** Fails with the usage rather than recording, for anything `record` cannot take. */
function fail(message: string): never {
  console.error(`${message}\n`);
  console.error(USAGE);
  process.exit(1);
}

if (command === 'record') {
  const [out, ...extra] = rest;
  const seconds = Number(options.seconds);

  if (out === undefined || extra.length > 0) {
    fail('record takes one OUT file');
  }

  // `screenrecord` caps a recording rather than refusing a longer one, which would save less than was asked for.
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > RECORD_LIMIT_S) {
    fail(`--seconds takes a whole number from 1 to ${RECORD_LIMIT_S}, screenrecord's own limit`);
  }

  const recording = screenrecord(options.serial, seconds);
  let stderr = '';
  recording.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

  const exited = new Promise<number | null>((resolve) => recording.once('close', resolve));

  console.error(`recording ${seconds}s to ${out}`);
  await pipeline(recording.stdout, createWriteStream(out));

  const code = await exited;

  // `screenrecord` refuses with exit 0 and its reason on stderr, so an empty file is the failure to look for too.
  if (code !== 0 || readFileSync(out).length === 0) {
    console.error(`screenrecord failed: ${stderr.trim() || `exit ${code}, nothing recorded`}`);
    process.exit(1);
  }
} else {
  console.log(USAGE);
  process.exit(command === 'help' ? 0 : 1);
}
