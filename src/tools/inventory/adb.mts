/**
 * The phone, driven over `adb`. Each call is a fresh `adb` process rather than a held shell, which costs a few tens of
 * milliseconds against animations that take most of a second and means a dropped USB connection fails one call loudly
 * instead of leaving a shell writing into nothing.
 */

import { decodePng, type Image } from './png.mts';
import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

export { sleep };

export class Device {
  readonly #prefix: string[];

  constructor(serial?: string) {
    this.#prefix = serial ? ['-s', serial] : [];
  }

  /** Fails with a readable message when there is no device, or more than one and no `--serial`. */
  async check(): Promise<void> {
    const state = (await this.#adb(['get-state'])).toString().trim();

    if (state !== 'device') {
      throw new Error(`adb reports the phone as "${state}"; is USB debugging on and the computer authorised?`);
    }
  }

  async screenshot(): Promise<Image> {
    return decodePng(await this.#adb(['exec-out', 'screencap', '-p']));
  }

  async tap([x, y]: readonly [number, number]): Promise<void> {
    await this.#shell('input', 'tap', String(Math.round(x)), String(Math.round(y)));
  }

  async swipe(from: readonly [number, number], to: readonly [number, number], ms = 300): Promise<void> {
    await this.#shell('input', 'swipe', ...[...from, ...to].map((n) => String(Math.round(n))), String(ms));
  }

  /** Typed into whatever has focus. `input text` takes `%s` for a space and nothing else survives the shell. */
  async type(text: string): Promise<void> {
    if (!/^[\w&,!@#*-]*$/.test(text.replaceAll(' ', ''))) {
      throw new Error(`refusing to type ${JSON.stringify(text)}: only search-term characters are passed to the shell`);
    }

    await this.#shell('input', 'text', `'${text.replaceAll(' ', '%s')}'`);
  }

  async key(...codes: number[]): Promise<void> {
    await this.#shell('input', 'keyevent', ...codes.map(String));
  }

  async launch(pkg: string): Promise<void> {
    await this.#shell('monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1');
  }

  /**
   * The package of the window that has focus, which is how a caller can tell whether the app it wants is in front
   * without launching it to find out. `dumpsys window displays` is the cheapest place to read it — 23 KB and 33ms
   * against 72 KB for `dumpsys window` and 76 KB for `dumpsys activity activities`, all three carrying the same single
   * `mCurrentFocus` line.
   *
   * A system window belongs to no package and so reads as null rather than as a name:
   * `Window{6b23334 u0 NotificationShade}` is what a phone reports once its screen has been off, against
   * `Window{81ff99a u0 com.example/.MainActivity}` for an app. Null therefore means no app is in front, which is the
   * question callers have — and not that the phone is locked, which this cannot answer: the keyguard fields in the same
   * dump read `isKeyguardShowing=false` over exactly that window.
   */
  async focused(): Promise<string | null> {
    const dump = (await this.#shell('dumpsys', 'window', 'displays')).toString();

    return /mCurrentFocus=Window\{\S+ \S+ ([\w.]+)\//.exec(dump)?.[1] ?? null;
  }

  #shell(...args: string[]): Promise<Buffer> {
    return this.#adb(['shell', ...args]);
  }

  #adb(args: string[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      execFile(
        'adb',
        [...this.#prefix, ...args],
        { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const detail = stderr.toString().trim() || error.message;
            reject(new Error(`adb ${args.join(' ')}: ${detail}`));
          } else {
            resolve(stdout);
          }
        },
      );
    });
  }
}

export const KEY = { BACK: 4, ENTER: 66, DEL: 67, MOVE_END: 123 } as const;
