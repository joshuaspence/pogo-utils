/**
 * Which downloads carry `GITHUB_TOKEN`, with `fetch` stubbed to record what it was sent: the host is the point, and
 * the local server `progress.test.mts` answers from cannot be `api.github.com`.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { cached } from './download.mts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** The `Authorization` header `cached` sent for `url`, or null for none. */
async function authorisation(url: string): Promise<string | null> {
  const fetch = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(console, 'error').mockImplementation(() => {});

  await cached(mkdtempSync(join(tmpdir(), 'download-')), 'file', url, true);

  const [[, init]] = fetch.mock.calls as unknown as [[string, RequestInit]];

  return new Headers(init.headers).get('Authorization');
}

test('sends GITHUB_TOKEN to GitHub API', async () => {
  vi.stubEnv('GITHUB_TOKEN', 'secret');

  expect(await authorisation('https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master')).toBe(
    'Bearer secret',
  );
});

test('keeps GITHUB_TOKEN from every other host', async () => {
  vi.stubEnv('GITHUB_TOKEN', 'secret');

  expect(
    await authorisation('https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest.json'),
  ).toBeNull();
});

test('sends nothing without GITHUB_TOKEN', async () => {
  vi.stubEnv('GITHUB_TOKEN', '');

  expect(await authorisation('https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master')).toBeNull();
});
