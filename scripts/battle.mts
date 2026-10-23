/**
 * Plays Pokémon GO's trainer battles on an Android phone over `adb`, watching the screen as H.264 from `screenrecord`
 * rather than screenshot by screenshot — a screenshot takes longer than a turn. Team Leader training is what it is built
 * against: a battle with nothing at stake, which is where its timing and its reading of the screen are tuned. GO Battle
 * League plays the same battles against other trainers, with the game's Recommended Battle Party.
 *
 * Usage, from the repository root, with the phone plugged in, USB debugging on and Pokémon GO in English:
 *
 *   pnpm battle run --leader blanche|candela|spark --league great|ultra|master [--count N] [--serial SERIAL]
 *                   [--keep-frames DIR] [--verbose]
 *   pnpm battle run --mode gbl --league LEAGUE [--count N] [--serial SERIAL] [--keep-frames DIR] [--verbose]
 *                       play Team Leader or GO Battle League battles one after another, from the map or anywhere
 *                       between the result of one battle and the start of the next, until `N` have finished or
 *                       Ctrl-C; stops, saving its last frames to `DIR`, where nothing on screen has been recognised
 *                       for 20s. GO Battle League stops at the end of a set with a reward to collect, the
 *                       encounter among them, which is left to be caught by hand.
 *                       `LEAGUE` is how the title of one league on now starts, as `ultra` or `fantasy cup`
 *   pnpm battle record [--seconds N] [--serial SERIAL] OUT
 *                       save `N` seconds (30 unless given, at most 180) of the screen to `OUT` as the raw H.264
 *                       a battle decodes, which is what the recognition fixtures are cut from
 *   A flag handed to a command whose line omits it is refused rather than ignored — see `HONOURED`.
 *
 * Automating input breaks Niantic's terms of service, and unlike `pnpm inventory` this does not only read: it taps
 * through battles. Run it on an account whose loss you would accept.
 */

import { ICON_BASE, POGO_ASSETS } from '../src/pokedex/icons.ts';
import { LEADERS, LEAGUES, type Mode } from '../src/tools/battle/menus.mts';
import { typeColour, type Colour } from '../src/tools/battle/minigame.mts';
import { silhouetteOfIcon, type Icon } from '../src/tools/battle/party.mts';
import { Lost, run, type Phone } from '../src/tools/battle/run.mts';
import { RECORD_LIMIT_S, Screen, screenrecord, streamSize } from '../src/tools/battle/stream.mts';
import { adbCli } from '../src/tools/inventory/adb-cli.mts';
import { Device } from '../src/tools/inventory/adb.mts';
import { CACHE, cachedAs, loadGameData } from '../src/tools/inventory/download.mts';
import { type GameData } from '../src/tools/inventory/game-master.mts';
import { tesseractCli } from '../src/tools/inventory/ocr-cli.mts';
import { useEngine } from '../src/tools/inventory/ocr.mts';
import { decodePng, encodePng } from '../src/tools/inventory/png.mts';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'mode': { type: 'string', default: 'training' },
    'leader': { type: 'string' },
    'league': { type: 'string' },
    'count': { type: 'string' },
    'keep-frames': { type: 'string' },
    'verbose': { type: 'boolean', default: false },
    'seconds': { type: 'string', default: '30' },
    'serial': { type: 'string' },
  },
});

const [command = 'help', ...rest] = positionals;

/** The synopsis out of this file's own header, as `inventory.mts` reads its own. */
const USAGE = readFileSync(new URL(import.meta.url), 'utf8')
  .match(/Usage[^]*?\n \*\n[^]*?\n \*\n/)?.[0]
  .replace(/^ \* ?/gm, '');

/** Which flags each command acts on, for the reason `inventory.mts` gives beside its own. */
const HONOURED: Record<string, readonly string[]> = {
  run: ['mode', 'leader', 'league', 'count', 'serial', 'keep-frames', 'verbose'],
  record: ['seconds', 'serial'],
};

const passed = process.argv.slice(2).flatMap((arg) => /^--([a-z-]+)/.exec(arg)?.[1] ?? []);
const honoured = Object.hasOwn(HONOURED, command) ? HONOURED[command] : undefined;
const ignored = honoured ? passed.filter((flag) => !honoured.includes(flag)) : [];

/** Fails with the usage rather than driving the phone, for anything a command cannot take. */
function fail(message: string): never {
  console.error(`${message}\n`);
  console.error(USAGE);
  process.exit(1);
}

if (ignored.length > 0) {
  fail(`${command} does not act on ${ignored.map((flag) => `--${flag}`).join(', ')}`);
}

/**
 * The colour each type's minigame bubbles are drawn in, out of the game's own icon for the type: 18 small files, cached
 * beside the form icons. A type whose icon cannot be had is swiped at in rows, as before the bubbles were aimed at.
 */
async function bubbleColours(data: GameData): Promise<Record<string, Colour>> {
  const read = await Promise.all(
    data.types.map(async (type) => {
      const file = `POKEMON_TYPE_${type.toUpperCase()}.png`;

      try {
        const icon = await cachedAs(join(CACHE, 'types'), file, `${POGO_ASSETS}Images/Types/${file}`, false, decodePng);

        return [[type, typeColour(icon)] as const];
      } catch {
        return [];
      }
    }),
  );

  return Object.fromEntries(read.flat());
}

/**
 * Every form's outline, which the party screen is read against: each icon the game draws, some 1,300 files and 40 MB
 * on the first run, cached beside the ones `pnpm inventory` keeps. One that cannot be had leaves its form unmatched
 * rather than stopping the run.
 */
async function silhouettes(data: GameData): Promise<Icon[]> {
  const icons = [...new Map(data.forms.flatMap((form) => (form.icon ? [[form.icon, form.species]] : []))).entries()];
  const read: Icon[] = [];
  let missing = 0;

  for (let at = 0; at < icons.length; at += 16) {
    const batch = icons.slice(at, at + 16).map(async ([icon, species]) => {
      try {
        const silhouette = await cachedAs(join(CACHE, 'icons'), icon, ICON_BASE + icon, false, (bytes) =>
          silhouetteOfIcon(decodePng(bytes)),
        );
        read.push({ species, silhouette });
      } catch {
        missing++;
      }
    });

    await Promise.all(batch);
  }

  if (missing > 0) {
    console.error(`${missing} of ${icons.length} form icons could not be had; those forms go unmatched`);
  }

  // None at all is every party read against nothing. Where no form even names an icon, it is the listing of the artwork
  // that failed, which `loadGameData` reports and carries on from: `pnpm inventory` loses only its narrowing by artwork.
  if (read.length === 0) {
    throw new Error('no form icon could be had, so no party could be read');
  }

  return read;
}

function oneOf<T extends string>(name: string, value: string | undefined, allowed: readonly T[]): T {
  const found = allowed.find((option) => option === value);

  return found ?? fail(`--${name} takes one of ${allowed.join(', ')}`);
}

if (command === 'run') {
  if (rest.length > 0) {
    fail('run takes no arguments beyond its flags');
  }

  const mode: Mode =
    oneOf('mode', options.mode, ['training', 'gbl']) === 'training'
      ? {
          mode: 'training',
          leader: oneOf('leader', options.leader, LEADERS),
          league: oneOf('league', options.league, LEAGUES),
        }
      : {
          mode: 'gbl',
          league: options.league?.trim() || fail('--mode gbl takes --league, as `ultra` or `fantasy cup`'),
        };

  if (mode.mode === 'gbl' && options.leader !== undefined) {
    fail('--leader is for training; GO Battle League has no leader');
  }

  const count = options.count === undefined ? Infinity : Number(options.count);

  if (count !== Infinity && (!Number.isInteger(count) || count < 1)) {
    fail('--count takes a whole number of battles, 1 or more');
  }

  const transport = adbCli(options.serial);
  const device = new Device(transport);
  await device.check();
  useEngine(tesseractCli);

  // Which move does the most damage, out of the game master `pnpm inventory` downloads and caches for a week.
  const data = await loadGameData(CACHE);
  const icons = await silhouettes(data);
  const colours = await bubbleColours(data);

  // Awake for as long as it runs: a screen gone dark mid-battle reads as nothing recognised and ends the run. The
  // setting is read first and put back as found on every way out, `restore` and the Ctrl-C handler in place before it
  // is changed, and checked to be the number Android stores, since it goes back through the shell.
  const awake = new TextDecoder().decode(
    await transport.shell(['settings', 'get', 'global', 'stay_on_while_plugged_in']),
  );
  const before = /^\d+$/.test(awake.trim()) ? awake.trim() : '0';
  const restore = () => transport.shell(['settings', 'put', 'global', 'stay_on_while_plugged_in', before]);
  let screen: Screen | undefined;

  process.once('SIGINT', () => {
    screen?.close();
    void restore().finally(() => process.exit(130));
  });

  const say = options.verbose ? (line: string) => console.error(line) : undefined;

  try {
    await transport.shell(['svc', 'power', 'stayon', 'usb']);

    // A screenshot for the screen's size, which every tap is a fraction of and the stream takes its shape from.
    const shot = await device.screenshot();
    const at = ([x, y]: readonly [number, number]): [number, number] => [x * shot.width, y * shot.height];
    const size = streamSize(shot);
    const recording = new Screen(() => screenrecord(options.serial, size), size);
    screen = recording;

    const phone: Phone = {
      frame: () => recording.latest()?.image,
      screenshot: () => device.screenshot(),
      tap: (point) => device.tap(at(point)),
      swipe: (from, to, ms) => device.swipe(at(from), at(to), ms),
    };

    await recording.first();
    const battles = await run(
      phone,
      { mode, data, icons, colours, count },
      { now: () => performance.now(), sleep },
      say,
    );
    console.log(`${battles} battle${battles === 1 ? '' : 's'} finished`);

    if (battles < count) {
      console.log('GO Battle League has no battle to offer until its reward is collected');
    }
  } catch (error) {
    process.exitCode = 1;
    console.error(error instanceof Error ? error.message : String(error));

    const dir = options['keep-frames'];

    if (error instanceof Lost && dir) {
      mkdirSync(dir, { recursive: true });
      error.frames.forEach((frame, i) =>
        writeFileSync(join(dir, `${String(i).padStart(2, '0')}.png`), encodePng(frame)),
      );
      console.error(`kept the last ${error.frames.length} frames in ${dir}`);
    }
  } finally {
    screen?.close();
    await restore();
  }
} else if (command === 'record') {
  const [out, ...extra] = rest;
  const seconds = Number(options.seconds);

  if (out === undefined || extra.length > 0) {
    fail('record takes one OUT file');
  }

  // `screenrecord` caps a recording rather than refusing a longer one, which would save less than was asked for.
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > RECORD_LIMIT_S) {
    fail(`--seconds takes a whole number from 1 to ${RECORD_LIMIT_S}, screenrecord's own limit`);
  }

  // The size `screenrecord` records at, an override where one is set and the screen's own otherwise, for the stream's
  // shape: what a battle would decode.
  let sizes: string;

  try {
    sizes = new TextDecoder().decode(await adbCli(options.serial).shell(['wm', 'size']));
  } catch (error) {
    console.error(`could not read the screen's size: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const [, width, height] = /Override size: (\d+)x(\d+)/.exec(sizes) ?? /Physical size: (\d+)x(\d+)/.exec(sizes) ?? [];

  if (!width || !height) {
    console.error(`wm size answered ${JSON.stringify(sizes.trim())} rather than the screen's size`);
    process.exit(1);
  }

  const recording = screenrecord(options.serial, streamSize({ width: Number(width), height: Number(height) }), seconds);
  let stderr = '';
  recording.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

  // `error` rather than `close` where `adb` could not start, which with no listener would be an uncaught exception.
  const exited = new Promise<number | null>((resolve) => {
    recording.once('close', resolve);
    recording.once('error', (error) => {
      stderr ||= error.message;
      resolve(null);
    });
  });

  console.error(`recording ${seconds}s to ${out}`);

  // An OUT that cannot be written fails here, with `adb` still recording into a pipe nobody reads, which would keep the
  // script alive until `--seconds` ran out.
  try {
    await pipeline(recording.stdout, createWriteStream(out));
  } catch (error) {
    recording.kill();
    console.error(`could not write ${out}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

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
