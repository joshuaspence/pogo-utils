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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
 * All three files are load-bearing, and that is measured rather than reasoned about — seeded with `game-master.json`
 * alone, a `parse` run prints two `Downloading` lines and goes out for the icon index and the string table. Only
 * `game-master.json`'s *contents* matter: `loadGameData` throws without a CP multiplier for every level, where an empty
 * icon index and an empty string table it takes in its stride.
 *
 * That emptiness is also what lets the stderr below be asserted at all. No form means no icon to read, so nothing is
 * fetched and nothing is reported, and an empty stderr is then exactly the claim that the seeded cache was read rather
 * than merely present.
 *
 * The multipliers themselves are arbitrary values over more levels than the game has, and safe to be both: no assertion
 * here reads a number derived from them, and over-supplying keeps this from pinning the scanner's highest level.
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
 * The `options` block of the script's own `parseArgs` call, and the flag names declared in it.
 *
 * Read off the source because there is nowhere else to read them from: the options are a literal inside a top-level
 * call, so a test cannot import them without running the script. Matched as the block first and the keys within it
 * second, rather than as whole option lines — a pattern wanting `{ type:` on the key's own line stops seeing any option
 * `prettier` has wrapped, which is one added property away, and any that declares a `short` alias before its type.
 *
 * That mode of failure is the one to design against, because a check that inspects its own source fails *open*: a flag
 * that drops out of this list is a flag the two comparisons below then agree about, and a shorter list of things to
 * check passes more easily. So it is cross-checked against a count that does not read the names at all.
 */
const OPTIONS = /\n {2}options: \{\n([\s\S]*?)\n {2}\},\n/.exec(SOURCE)?.[1] ?? '';
const FLAGS = [...OPTIONS.matchAll(/^ {4}'([a-z-]+)':/gm)].map(([, flag]) => flag as string);

/**
 * Every top-level entry of that block, counted without reading its name, so that a key written in a form the name
 * pattern does not recognise makes the two disagree. A line opening with `}` is a wrapped option's own close rather
 * than an entry of its own.
 */
const ENTRIES = OPTIONS.split('\n').filter((line) => /^ {4}[^\s}]/.test(line)).length;

test('the flags are read off `parseArgs` whole, not some readable subset of it', () => {
  expect(OPTIONS, 'the `options` block was not found, so every claim about flags below is vacuous').not.toBe('');
  expect(FLAGS.length, 'an option is declared in a form the flag pattern cannot read').toBe(ENTRIES);
  expect(FLAGS).toEqual(expect.arrayContaining(['out', 'scroll', 'refresh', 'verbose']));
});

/**
 * Which flags the script says each command acts on, read off its `HONOURED` table. Captured per entry across newlines
 * rather than a line at a time, so a list `prettier` has wrapped — the `scan` one is four characters from it — still
 * reads whole, which is the same trap as the options block above.
 */
const HONOURED = new Map(
  [...SOURCE.matchAll(/^ {2}(scan|snap|parse): \[([\s\S]*?)\],$/gm)].map(([, command, list]) => [
    command as string,
    new Set([...(list ?? '').matchAll(/'([a-z-]+)'/g)].map(([, flag]) => flag as string)),
  ]),
);

/**
 * The flags the synopsis offers each command, parsed once out of one `help` run. Split on the command lines rather than
 * read whole, which is what makes the comparison per command rather than a flat set — and a flat set was the hole here
 * before: `--serial` sat on the `scan` line alone while `snap` honoured it, and nothing could say so.
 */
const ADVERTISED = run(process.execPath, [SCRIPT, 'help']).then(
  ({ stderr }) =>
    new Map(
      stderr
        .split(/^ {2}pnpm inventory /m)
        .slice(1)
        .map((chunk) => {
          // A continuation of the command above is indented past it; a line sitting at the margin is prose beneath the
          // synopsis, and the flags it names in passing are not an offer to the last command listed.
          const lines = chunk.split('\n').filter((line) => !/^ {2}\S/.test(line));

          return [
            /^([a-z]+)/.exec(chunk)?.[1] ?? '',
            new Set([...lines.join('\n').matchAll(/--([a-z-]+)/g)].map(([, flag]) => flag as string)),
          ];
        }),
    ),
);

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
 * That `HONOURED` names every flag `parseArgs` accepts and invents none, which is the invariant the table exists to
 * hold: a flag in neither list is one no command acts on, and a flag in the table but not the options is one no command
 * could be given.
 *
 * It is also what keeps the two patterns above honest. Both read this file's source, and a source reader that stops
 * matching returns *less* — so the comparisons below would agree about a shrinking set and pass. Here the union has to
 * come out equal to the options block, which a half-read table cannot do.
 */
test('`HONOURED` accounts for every flag `parseArgs` accepts, and no others', () => {
  expect([...HONOURED.keys()].sort(), 'the `HONOURED` table did not read whole').toStrictEqual([
    'parse',
    'scan',
    'snap',
  ]);
  expect([...new Set([...HONOURED.values()].flatMap((flags) => [...flags]))].sort()).toStrictEqual([...FLAGS].sort());
});

/**
 * Each command's synopsis line lists exactly the flags that command acts on. Compared as sets per command, because both
 * weaker forms have already let real drift through: a substring search is prefix-blind, so `--out` read as documented
 * the moment `--output` was, and a flat set over the whole synopsis could not see `--serial` sitting on the `scan` line
 * while `snap` honoured it too.
 */
test('the synopsis lists each command the flags it acts on, and only those', async () => {
  const advertised = await ADVERTISED;

  for (const [command, honoured] of HONOURED) {
    const offered = advertised.get(command) ?? new Set<string>();

    expect([...honoured].sort(), `the ${command} synopsis disagrees with what ${command} acts on`).toStrictEqual(
      [...offered].sort(),
    );
  }
});

/**
 * A flag a command does not act on is refused rather than ignored. `parse --out inventory.csv` wrote no CSV and said
 * nothing, which is the failure worth closing: a flag that reads as accepted and does nothing is worse than one
 * rejected, because the run looks like it worked.
 */
test('a flag its command does not act on is refused, not ignored', async () => {
  // Seeded even though the refusal comes before any reading, so that this stays off the network in the case that
  // matters: with the refusal gone, the run goes on to `parse` the capture for real.
  const cwd = reads();

  try {
    const failure = await run(process.execPath, [SCRIPT, 'parse', '--out', 'x.csv', CAPTURE], { cwd }).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({ code: 1 });
    expect((failure as { stderr: string }).stderr).toContain('parse does not act on --out');
    // The usage goes with the complaint, since the list the flag was not on is what answers it.
    expect((failure as { stderr: string }).stderr).toContain('pnpm inventory parse');
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

// That the gate is not simply refusing everything is held by the `--verbose` test below, which runs `parse --verbose`
// to completion and asserts an empty stderr — a flag `parse` does act on, getting past this and leaving nothing behind.

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

  try {
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
  } finally {
    rmSync(cwd, { recursive: true });
  }
});
