/**
 * The phone over WebUSB, as a `Transport` for the same `Device` `pnpm inventory` drives through the `adb` binary. Built
 * on [Tango](https://tangoadb.dev/) (`@yume-chan/adb`, MIT), which speaks the ADB protocol from the page itself: the
 * phone is picked through the browser's own device chooser and no `adb` is installed anywhere.
 *
 * The computer has to be authorised on the phone the first time, as it does for `adb`. The key that authorisation is
 * for is made by Web Crypto and kept in this site's IndexedDB, so it is this browser that is trusted rather than the
 * machine — another browser, or this one with its site data cleared, asks again.
 */

import { Adb, AdbDaemonTransport } from '@yume-chan/adb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';

import { type Transport } from '../tools/inventory/adb.mts';

/** As long as `adb-cli.mts` waits on `adb`: far longer than any call here takes, so it fires only on a wedged phone. */
const TIMEOUT_MS = 30_000;

/**
 * Why this page cannot reach a phone, or null where it can. WebUSB needs a secure context, which is `localhost` and the
 * published site but not the LAN address `pnpm serve` prints; and it is a Chromium API, so Firefox and Safari have none.
 */
export function unreachable(): string | null {
  if (!window.isSecureContext) {
    return 'WebUSB needs a secure context: open this page from localhost or the published site rather than a LAN address.';
  }

  if (AdbDaemonWebUsbDeviceManager.BROWSER === undefined) {
    return 'This browser has no WebUSB. Chrome and Edge do, on a computer or on Android.';
  }

  return null;
}

/** A phone this page holds a connection to, with what the chooser called it. */
export interface Phone {
  name: string;
  transport: Transport;
  close(): Promise<void>;
}

/**
 * Offers the browser's device chooser and connects to whatever is picked, or answers null where the chooser was
 * dismissed. Only ADB interfaces are offered, Tango's default filter being the class ADB declares.
 *
 * A phone the `adb` server on this machine already holds cannot be claimed twice, which is the commonest way for this
 * to fail and so is the one said in full.
 */
export async function connect(): Promise<Phone | null> {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;

  if (manager === undefined) {
    throw new Error(unreachable() ?? 'This browser has no WebUSB.');
  }

  const device = await manager.requestDevice();

  if (device === undefined) {
    return null;
  }

  let connection;

  try {
    connection = await device.connect();
  } catch (error) {
    if (error instanceof AdbDaemonWebUsbDevice.DeviceBusyError) {
      throw new Error(
        'the phone is held by another program, usually an adb server on this computer: run `adb kill-server` and try again',
        { cause: error },
      );
    }

    throw error;
  }

  const adb = new Adb(
    await AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore: new AdbWebCredentialStore('pogo-utils'),
    }),
  );

  /**
   * A command's output, given up on after `TIMEOUT_MS` as `adb-cli.mts` gives up on `adb`: a phone that stops answering
   * fails the one call loudly rather than leaving the page waiting on it. The command itself cannot be called back, so
   * what is given up on is the wait, and a phone that wedged is one to reconnect.
   */
  const run = (command: readonly string[]): Promise<Uint8Array> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`${command.join(' ')}: no answer after ${TIMEOUT_MS / 1000}s; is the phone still connected?`),
          ),
        TIMEOUT_MS,
      );
    });

    return Promise.race([output(command), late]).finally(() => clearTimeout(timer));
  };

  /**
   * A command's output, by the shell protocol where the phone has it — Android 7 on — which keeps stderr out of what is
   * answered and says how the command exited. The older protocol interleaves the two, which for a screenshot would put
   * a warning in the middle of a PNG; it is the fallback rather than the rule.
   */
  const output = async (command: readonly string[]): Promise<Uint8Array> => {
    const shell = adb.subprocess.shellProtocol;

    if (shell === undefined) {
      return adb.subprocess.noneProtocol.spawnWait(command);
    }

    const { stdout, stderr, exitCode } = await shell.spawnWait(command);

    if (exitCode !== 0) {
      throw new Error(`${command.join(' ')} exited ${exitCode}: ${new TextDecoder().decode(stderr).trim()}`);
    }

    return stdout;
  };

  return {
    name: device.name || device.serial,
    transport: {
      // Authenticated is what `adb get-state` calls `device`; a phone that refused the key never gets this far.
      state: () => Promise.resolve('device'),
      shell: run,
      screencap: () => run(['screencap', '-p']),
    },
    close: () => adb.close(),
  };
}
