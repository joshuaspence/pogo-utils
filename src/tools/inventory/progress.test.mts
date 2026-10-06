/**
 * What `cached` says while downloading, which `cli.test.mts` cannot reach: the cache it seeds is in date, so no run
 * there takes the download path at all.
 *
 * Reached here against a server on the loopback interface, which is hermetic in the way upstream is not and is also the
 * only way to fail a download on demand. A `file:` URL will not stand in for one: Node's `fetch` answers
 * `TypeError: fetch failed`, caused by `Error: not implemented... yet...`.
 *
 * Both lines below are outside the `--verbose` gate, and each for its own reason — the `Downloading` one because the
 * week's grace above it already decides the only runs it prints on, the warning because a degraded answer is worth
 * saying however quietly the run was asked to go about it. So these are the assertions that would notice either being
 * swept into `progress`, which is what `progress.mts` sets out and nothing else holds.
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
 * A module nobody has spoken to narrates, which is the half of the default no caller is left to hold: every consumer of
 * `iconsFor` today goes through `scripts/inventory.mts`, which always calls `showProgress`, so the one that would
 * notice this is the one not written yet. Rounded this way it inherits the louder half.
 *
 * Imported afresh rather than read off the instance the tests below set, so that this is the module's own starting
 * state rather than whatever ran last.
 */
test('progress is narrated until a caller asks for quiet', async () => {
  vi.resetModules();

  const fresh = await import('./progress.mts');
  const [, said] = await stderrOf(async () => fresh.progress('Reading 3 form icons'));

  expect(said).toStrictEqual(['Reading 3 form icons']);
});

/**
 * The one line a cold run is waiting on, which prints whether or not progress was asked for. It is reached only past
 * the week's grace, so it never lands on the warm run `--verbose` was added to quieten, and `showProgress(false)` must
 * not take it: that would silence a first `pnpm inventory snap` for the minutes it spends on 153 icons.
 */
test('`cached` names the download it is about to make, quietly or not', async () => {
  answer = (response) => response.end('{}');

  const url = `${base}latest.json`;
  const loud = cacheDir();
  const quiet = cacheDir();

  try {
    showProgress(true);
    expect((await stderrOf(() => cached(loud, 'latest.json', url, false)))[1]).toStrictEqual([`Downloading ${url}`]);

    showProgress(false);
    expect((await stderrOf(() => cached(quiet, 'latest.json', url, false)))[1]).toStrictEqual([`Downloading ${url}`]);
  } finally {
    rmSync(loud, { recursive: true });
    rmSync(quiet, { recursive: true });
  }
});

/**
 * The warm run is the one the gate is for, and the week's grace is what makes it quiet: a copy already in date is read
 * without a word, so there is nothing for `--verbose` to hold back. This is the assertion that would fail if the guard
 * above the `Downloading` line were ever loosened, leaving it to a flag instead.
 */
test('`cached` says nothing where the copy it has is in date', async () => {
  answer = (response) => response.end('{}');

  const url = `${base}latest.json`;
  const dir = cacheDir();

  try {
    showProgress(true);
    await cached(dir, 'latest.json', url, false);

    expect((await stderrOf(() => cached(dir, 'latest.json', url, false)))[1]).toStrictEqual([]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

/**
 * The warning under a failed download names what went stale on a quiet run too, which is the split `progress.mts`
 * claims: progress is held back and a degraded answer is not.
 *
 * It names the URL rather than reading as a continuation of the line above, which is why the assertion takes both lines
 * and the whole of each: `iconsFor` keeps 16 downloads in flight, so a bare `fetch failed; using the copy from before`
 * could sit under any of 16 `Downloading` lines and name none of them. Under `showProgress(false)`, which is what makes
 * this the quiet run, both print anyway.
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
    expect(said).toStrictEqual([`Downloading ${url}`, `  ${url}: 503 Service Unavailable; using the copy from before`]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
