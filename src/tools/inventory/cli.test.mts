/**
 * The command line itself, driven as a subprocess. `scripts/inventory.mts` is the one part of the scanner no test
 * reaches — nothing imports it, so the whole suite passes a script that cannot start, a `parseArgs` that rejects a flag
 * the usage block advertises, and a usage block the script can no longer find in its own source.
 *
 * It is driven rather than imported because importing it runs it: `parseArgs` and the command dispatch are both at the
 * top level, so a test that loaded the module would parse Vitest's own argv and then try to drive a phone. A subprocess
 * is also the interface a person uses, which is the one worth pinning.
 *
 * Nothing here reaches the network or a phone. `reads` builds the cache the readers would otherwise download, and
 * `parse` is the one command that needs neither `adb` nor a device. Tesseract it does need, exactly as the capture
 * readers beside it do.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const run = promisify(execFile);

const SCRIPT = fileURLToPath(new URL('../../../scripts/inventory.mts', import.meta.url));
const SOURCE = readFileSync(SCRIPT, 'utf8');
const CAPTURE = fileURLToPath(new URL('fixtures/overworld.png', import.meta.url));

/** One printed line of the OCR dump: a box at a position, then whatever was read out of it. */
const DUMP = /^ {2}\d+,\d+ \d+×\d+ +/;

const dumpRows = (text: string) => text.split('\n').filter((line) => DUMP.test(line));

/**
 * A working directory holding the cache the scanner would otherwise download, so a run reaches no network at all. The
 * scanner's `CACHE` is relative, which is the whole of why this works: the directory a subprocess runs in decides where
 * its cache is, and no flag or stub is needed to move it.
 *
 * Only the CP multipliers have to be there. `loadGameData` throws without one for every level and reads an empty form
 * list and an empty string table without complaint, which is also why a run against this prints an empty stderr: no
 * form means no icon to read, so nothing is fetched and nothing is reported. The multipliers are arbitrary values over
 * more levels than the game has, and safe to be both: no assertion below reads a number derived from them, and
 * over-supplying is what keeps this from pinning the scanner's own highest level.
 */
function reads(): string {
  const dir = mkdtempSync(join(tmpdir(), 'inventory-cli-'));
  const cache = join(dir, '.cache', 'inventory');
  const levels = Array.from({ length: 100 }, (_, i) => 0.1 + i / 100);

  mkdirSync(cache, { recursive: true });
  writeFileSync(
    join(cache, 'game-master.json'),
    JSON.stringify([{ templateId: 'PLAYER_LEVEL_SETTINGS', data: { playerLevel: { cpMultiplier: levels } } }]),
  );
  writeFileSync(join(cache, 'english.json'), JSON.stringify({ data: [] }));
  writeFileSync(join(cache, 'icons.json'), JSON.stringify({ tree: [] }));

  return dir;
}

/**
 * The flags the script accepts, read off its own `parseArgs` call. Read from the source because there is nowhere else
 * to read them from — the options are a literal inside a top-level call, so a test cannot import them without running
 * the script — and the anchors below are what stop a pattern that has stopped matching from passing this vacuously.
 */
const FLAGS = [...SOURCE.matchAll(/^ {4}'([a-z-]+)': \{ type:/gm)].map(([, flag]) => flag as string);

test('the flags read off `parseArgs` are the flags, not an empty list', () => {
  expect(
    FLAGS,
    'the pattern over `parseArgs` has stopped matching, so every claim about flags below is vacuous',
  ).toEqual(expect.arrayContaining(['out', 'scroll', 'verbose']));
});

/**
 * That `help` answers at all, which is less obvious than it looks: the synopsis is cut out of the script's own source
 * with a regular expression, and `?.[0]` on a miss makes `console.error(undefined)` print the word `undefined` and exit
 * 0 regardless. So a usage block reworded past that pattern breaks the help text and reports success, and this is what
 * tells the difference.
 */
test('`help` prints the synopsis and exits 0', async () => {
  const { stdout, stderr } = await run(process.execPath, [SCRIPT, 'help']);

  expect(stderr).toContain('pnpm inventory scan');
  expect(stderr).toContain('pnpm inventory snap');
  expect(stderr).toContain('pnpm inventory parse');
  expect(stdout).toBe('');
});

/**
 * Every flag the script accepts is in the synopsis `help` prints. The synopsis comes from running `help` rather than
 * from matching the source again here, so this pins the text a person is shown rather than a second guess at where it
 * lives.
 *
 * Which command each flag is listed under is not checked, and cannot usefully be: `parseArgs` takes one flat set of
 * options and every command ignores the ones that do not concern it, so nothing in the code says where a flag belongs.
 * `--refresh` is the one this first caught, accepted by all three commands and named by none of them.
 */
test('`help` lists every flag `parseArgs` accepts', async () => {
  const { stderr } = await run(process.execPath, [SCRIPT, 'help']);
  const undocumented = FLAGS.filter((flag) => !stderr.includes(`--${flag}`));

  expect(undocumented, 'these flags are accepted but the synopsis never mentions them').toStrictEqual([]);
});

/** A flag the synopsis advertises has to be one `parseArgs` takes, which is the same drift seen from the other side. */
test('every flag the synopsis advertises is accepted', async () => {
  const { stderr } = await run(process.execPath, [SCRIPT, 'help']);
  const advertised = [...stderr.matchAll(/--([a-z-]+)/g)].map(([, flag]) => flag as string);
  const unknown = [...new Set(advertised)].filter((flag) => !FLAGS.includes(flag));

  expect(unknown, 'the synopsis offers these flags and `parseArgs` would reject them').toStrictEqual([]);
});

/**
 * A command the script does not know is a failure rather than a silent no-op, and it says what the commands are. The
 * exit code is the half that matters: `help` and a typo print the same text, and only the status tells a script which
 * of the two happened.
 */
test('an unknown command prints the usage and fails', async () => {
  const failure = await run(process.execPath, [SCRIPT, 'scna']).catch((error: unknown) => error);

  expect(failure).toMatchObject({ code: 1 });
  expect((failure as { stderr: string }).stderr).toContain('pnpm inventory scan');
});

/** `parse` with no file named is the same: the guard on it is a length, and a missing argument must not read as one. */
test('`parse` with no file prints the usage and fails', async () => {
  const failure = await run(process.execPath, [SCRIPT, 'parse']).catch((error: unknown) => error);

  expect(failure).toMatchObject({ code: 1 });
  expect((failure as { stderr: string }).stderr).toContain('pnpm inventory parse');
});

/**
 * The dump of what OCR read is printed only for `--verbose`, and the rest of the report is the same either way.
 *
 * Asserted as the whole of the output rather than as the dump alone, because the claim worth holding is that the flag
 * adds lines and changes nothing: the fields below the dump are what a person reads a report for, and a gate that
 * reordered or dropped one of them would satisfy any count of dump rows. `fixtures/overworld.png` is the map, so the
 * report under the dump is every field empty — which makes the dump the overwhelming majority of the output and this
 * the capture the flag matters most on.
 */
test('the OCR dump is printed only with `--verbose`', async () => {
  const cwd = reads();
  const [quiet, loud] = await Promise.all([
    run(process.execPath, [SCRIPT, 'parse', CAPTURE], { cwd }),
    run(process.execPath, [SCRIPT, 'parse', '--verbose', CAPTURE], { cwd }),
  ]);

  expect(dumpRows(quiet.stdout), 'the dump was printed without the flag asking for it').toStrictEqual([]);
  expect(dumpRows(loud.stdout).length, '`--verbose` printed no dump at all').toBeGreaterThan(0);
  expect(
    loud.stdout.split('\n').filter((line) => !DUMP.test(line)),
    '`--verbose` changed the report rather than only adding the dump',
  ).toStrictEqual(quiet.stdout.split('\n'));
  // Nothing was downloaded, which is what says the seeded cache was read rather than merely present.
  expect(quiet.stderr).toBe('');
  expect(loud.stderr).toBe('');
});
