/**
 * The `adb` binary as a `Transport`, which is how `pnpm inventory` reaches the phone. Each call is a fresh `adb` process
 * rather than a held shell, which costs a few tens of milliseconds against animations that take most of a second and
 * means a dropped USB connection fails one call loudly instead of leaving a shell writing into nothing.
 */

import { type Transport } from './adb.mts';
import { execFile } from 'node:child_process';

/**
 * Far longer than any call here takes, so it only fires on a device or `adb` server that has wedged — an `offline`
 * phone, a stalled USB link — which would otherwise hang the scan rather than fail the one call.
 */
const TIMEOUT_MS = 30_000;

/** The phone `serial` names, or the only one plugged in where it names none. */
export function adbCli(serial?: string): Transport {
  const prefix = serial ? ['-s', serial] : [];

  const adb = (args: readonly string[]): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      execFile(
        'adb',
        [...prefix, ...args],
        { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, timeout: TIMEOUT_MS },
        (error, stdout, stderr) => {
          if (error) {
            const detail = error.killed
              ? `no answer after ${TIMEOUT_MS / 1000}s; is the phone still connected?`
              : stderr.toString().trim() || error.message;
            reject(new Error(`adb ${args.join(' ')}: ${detail}`));
          } else {
            resolve(stdout);
          }
        },
      );
    });

  return {
    state: async () => (await adb(['get-state'])).toString(),
    shell: (args) => adb(['shell', ...args]),
    screencap: () => adb(['exec-out', 'screencap', '-p']),
  };
}
