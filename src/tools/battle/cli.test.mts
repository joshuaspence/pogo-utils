/**
 * `scripts/battle.mts` driven as a subprocess, which is the one way a test reaches it: nothing imports it, and importing
 * it would run it. Only what is refused before a phone is asked for, so nothing here needs `adb` or a device.
 */

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../scripts/battle.mts', import.meta.url));

/** The script's exit code and output, a non-zero exit being an answer here rather than a failure. */
async function battle(...args: string[]) {
  try {
    const { stdout, stderr } = await promisify(execFile)('node', [SCRIPT, ...args]);

    return { code: 0, stdout, stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };

    return { code, stdout, stderr };
  }
}

test('help prints the usage out of the header', async () => {
  const { code, stdout } = await battle('help');

  expect(code).toBe(0);
  expect(stdout).toContain('pnpm battle record [--seconds N] [--serial SERIAL] OUT');
});

test('refuses a flag it does not know', async () => {
  const { code, stderr } = await battle('record', '--seconds=5', '--verbose', 'out.h264');

  expect(code).toBe(1);
  expect(stderr).toContain("Unknown option '--verbose'");
});

test.each([['0'], ['181'], ['2.5'], ['ten']])('refuses --seconds %s', async (seconds) => {
  const { code, stderr } = await battle('record', '--seconds', seconds, 'out.h264');

  expect(code).toBe(1);
  expect(stderr).toContain('--seconds takes a whole number from 1 to 180');
});

test('refuses a recording with nowhere to go', async () => {
  const { code, stderr } = await battle('record');

  expect(code).toBe(1);
  expect(stderr).toContain('record takes one OUT file');
});
