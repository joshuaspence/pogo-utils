/**
 * The gate on progress, where `cli.test.mts` cannot reach it.
 *
 * That file drives `--verbose` end to end, but only as far as `iconsFor`: the cache it seeds is in date, so no run
 * there takes `cached`'s download path, and neither the `Downloading` line nor the warning printed under a failed
 * download is held by anything. Both are reached here against a server on the loopback interface, which is hermetic in
 * the way upstream is not, and is also the only way to fail a download on demand. A `file:` URL will not stand in for
 * one: Node's `fetch` answers `TypeError: fetch failed`, caused by `Error: not implemented... yet...`.
 */

import { cached } from './game-master.mts';
import { showProgress } from './progress.mts';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

/** How the server answers the next request, set by whichever test is running. */
let answer: (response: ServerResponse) => void = (response) => response.end();
let base = '';

const server = createServer((_request, response) => answer(response));

beforeAll(async () => {
  await new Promise<void>((listening) => void server.listen(0, '127.0.0.1', listening));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  await new Promise((closed) => server.close(closed));
});

/** A cache of its own per test, so that one test's download is never another's copy from before. */
const cacheDir = () => mkdtempSync(join(tmpdir(), 'inventory-progress-'));

/** What `body` answered, and every line it printed to stderr while answering. */
async function stderrOf<T>(body: () => Promise<T>): Promise<[T, string[]]> {
  const said = vi.spyOn(console, 'error').mockImplementation(() => {});

  try {
    return [await body(), said.mock.calls.map((call) => String(call[0]))];
  } finally {
    said.mockRestore();
  }
}

/**
 * A module nobody has spoken to narrates, which is the half of the default that has no caller to hold it:
 * `scripts/vend-game-master.mts` parses no arguments and so never calls `showProgress`, and under the other default its
 * three downloads were the whole of its output and all of it silent.
 *
 * Imported afresh rather than read off the instance the tests below set, so that this is the module's own starting
 * state rather than whatever ran last.
 */
test('progress is narrated until a caller asks for quiet', async () => {
  vi.resetModules();

  const fresh = await import('./progress.mts');
  const [, said] = await stderrOf(async () => fresh.progress('Downloading something'));

  expect(said).toStrictEqual(['Downloading something']);
});

/** The line `--verbose` is for: what a cold run is waiting on, named before it waits. */
test('`cached` names the download it is about to make, and only where progress was asked for', async () => {
  answer = (response) => response.end('{}');

  const url = `${base}latest.json`;
  const loud = cacheDir();
  const quiet = cacheDir();

  try {
    showProgress(true);
    expect((await stderrOf(() => cached(loud, 'latest.json', url, false)))[1]).toStrictEqual([`Downloading ${url}`]);

    showProgress(false);
    expect((await stderrOf(() => cached(quiet, 'latest.json', url, false)))[1]).toStrictEqual([]);
  } finally {
    rmSync(loud, { recursive: true });
    rmSync(quiet, { recursive: true });
  }
});

/**
 * The warning under a failed download names what went stale on a quiet run too, which is the split `progress.mts`
 * claims: progress is gated and a degraded answer is not. It was written as a continuation of the `Downloading` line
 * above it — two spaces, no subject — so gating that line left `fetch failed; using the copy from before` with nothing
 * to say which of the three files, or which of ~153 icons, it was about.
 *
 * Back-dated by hand rather than by `cached`'s own `WEEK`, which it does not export: eight days is past any week.
 */
test('a stale copy read because the download failed names the file, quietly or not', async () => {
  answer = (response) => {
    response.statusCode = 503;
    response.end();
  };

  const dir = cacheDir();
  const url = `${base}PIKACHU.png`;
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  writeFileSync(join(dir, 'PIKACHU.png'), 'the copy from before');
  utimesSync(join(dir, 'PIKACHU.png'), eightDaysAgo, eightDaysAgo);

  try {
    showProgress(false);

    const [bytes, said] = await stderrOf(() => cached(dir, 'PIKACHU.png', url, false));

    expect(String(bytes), 'the copy from before was not read, so the warning below is about something else').toBe(
      'the copy from before',
    );
    expect(said).toStrictEqual([`  ${url}: 503 Service Unavailable; using the copy from before`]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
