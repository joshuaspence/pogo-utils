/**
 * The phone, driven over ADB. Everything a scan asks of it is eight methods over one `Transport`, which is the only
 * part that differs between the CLI and the Inventory page: `adb-cli.mts` runs the `adb` binary, and
 * `src/inventory/webusb.ts` speaks the protocol over WebUSB from the page.
 */

import { decodePng, type Image } from './png.mts';

/**
 * How a `Device` reaches the phone: its state as `adb get-state` names it, a shell command's output, and a screenshot's
 * PNG. The screenshot is its own method because it is the one binary answer, and a transport has to keep it clear of
 * anything written to stderr — the CLI by `exec-out`, the page by the shell protocol.
 */
export interface Transport {
  state(): Promise<string>;
  shell(args: readonly string[]): Promise<Uint8Array>;
  screencap(): Promise<Uint8Array>;
}

/**
 * Whether `type` would send this rather than refuse it: a space, and the characters a storage search is made of —
 * `<` and `>` among them for the type-effectiveness searches, and `.` for Mr. Mime. `type` single-quotes the text, so
 * none of them reaches the shell as anything but itself; a `'` would end the quote, and is refused with the rest.
 * Exported so a caller can refuse a term before it has driven the phone to the box it meant to type into, `type`
 * throwing there leaving storage open with the keyboard up.
 */
export const typeable = (text: string) => /^[\w&,!@#*+<>.-]*$/.test(text.replaceAll(' ', ''));

export class Device {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /** Fails with a readable message when there is no device, or more than one and no `--serial`. */
  async check(): Promise<void> {
    const state = (await this.#transport.state()).trim();

    if (state !== 'device') {
      throw new Error(`adb reports the phone as "${state}"; is USB debugging on and the computer authorised?`);
    }
  }

  async screenshot(): Promise<Image> {
    return decodePng(await this.#transport.screencap());
  }

  async tap([x, y]: readonly [number, number]): Promise<void> {
    await this.#shell('input', 'tap', String(Math.round(x)), String(Math.round(y)));
  }

  async swipe(from: readonly [number, number], to: readonly [number, number], ms = 300): Promise<void> {
    await this.#shell('input', 'swipe', ...[...from, ...to, ms].map((n) => String(Math.round(n))));
  }

  /** Typed into whatever has focus. `input text` takes `%s` for a space and nothing else survives the shell. */
  async type(text: string): Promise<void> {
    if (!typeable(text)) {
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
    const dump = new TextDecoder().decode(await this.#shell('dumpsys', 'window', 'displays'));

    return /mCurrentFocus=Window\{\S+ \S+ ([\w.]+)\//.exec(dump)?.[1] ?? null;
  }

  #shell(...args: string[]): Promise<Uint8Array> {
    return this.#transport.shell(args);
  }
}

export const KEY = { BACK: 4, ENTER: 66, DEL: 67, MOVE_END: 123 } as const;
