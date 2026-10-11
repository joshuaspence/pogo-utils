/**
 * The command end to end, run as a subprocess the way a person runs it, against stand-ins for Live PokeMap and ntfy on
 * the loopback interface. What is asserted is what #189 asks of it: every request it sends and in what order, that
 * none of them writes, one viewport per poll whatever the number of queries, a login again when the token is refused,
 * one notification per spawn however many polls carry it, and no secret in anything it prints.
 *
 * Real time rather than a fake clock, the command being a separate process: the server's refresh is asked as 1 second
 * and the command holds it to the page's floor of 5, so three polls take ten seconds. A refused poll's backoff is
 * driven in-process below instead, where the wait can be recorded rather than sat through.
 */

import { LivePokeMap } from './client.mts';
import { parseQuery } from './query.mts';
import { watch } from './watcher.mts';
import type { ViewportResponse, WireSpawn } from './wire.mts';
import { spawn as run } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../scripts/watch.mts', import.meta.url));
const fixturePath = (name: string) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const fixture = (name: string) => readFileSync(fixturePath(name), 'utf8');

const PASSWORD = 'correct horse battery staple';
const TOKENS = ['eyJ.first-token.sig', 'eyJ.second-token.sig'];

interface Seen {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: unknown;
  at: number;
}

/** A server answering with `answer`, recording every request it was sent. */
async function standIn(answer: (request: Seen, response: ServerResponse) => void) {
  const requests: Seen[] = [];
  const server: Server = createServer((request, response) => {
    let text = '';

    request.on('data', (chunk) => (text += chunk));
    request.on('end', () => {
      const seen = {
        method: request.method ?? '',
        path: request.url ?? '',
        headers: request.headers,
        body: text ? JSON.parse(text) : undefined,
        at: Date.now(),
      };

      requests.push(seen);
      answer(seen, response);
    });
  });

  await new Promise<void>((listening) => void server.listen(0, '127.0.0.1', listening));

  return {
    requests,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((closed) => server.close(closed)),
  };
}

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};

/** The fixture with its spawns live for ten minutes, and `extra` added to the 100% list. */
function viewport(extra: WireSpawn[] = []): ViewportResponse {
  const answer = JSON.parse(fixture('viewport.json')) as ViewportResponse;
  const live = (spawn: WireSpawn) => ({ ...spawn, despawn_ms: Date.now() + 10 * 60_000 });

  return {
    ...answer,
    pokemon: [...(answer.pokemon ?? []), ...extra].map(live),
    my_shiny_pokemon: answer.my_shiny_pokemon?.map(live),
  };
}

const LARVITAR: WireSpawn = {
  encounter_id: '9100000000000000006',
  dex_id: 246,
  pokemon_name: 'Larvitar',
  lat: 1.283,
  lon: 103.86,
  cp: 671,
  level: 27,
  iv_attack: 15,
  iv_defense: 15,
  iv_stamina: 15,
  iv_percent: 100,
};

test('the command polls once per interval, logs in again when refused, writes nothing and notifies each spawn once', async () => {
  let logins = 0;
  let viewports = 0;

  const map = await standIn((request, response) => {
    const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');

    switch (`${request.method} ${request.path}`) {
      case 'GET /api/config':
        return json(response, 200, { ...JSON.parse(fixture('config.json')), viewport_refresh_seconds: 1 });
      case 'GET /api/game_data':
        return json(response, 200, JSON.parse(fixture('game-data.json')));
      case 'POST /api/auth/login':
        return json(response, 200, { token: TOKENS[logins++], user: { username: 'watcher' } });
      case 'GET /api/auth/me':
      case 'GET /api/session/status':
        return json(response, 200, { success: true, data: {} });
      case 'POST /api/map/viewport':
        viewports += 1;

        // The second poll finds the first token expired; the third poll turns up one spawn more.
        if (token !== TOKENS[logins - 1] || (viewports === 2 && logins === 1)) {
          return json(response, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Token expired' } });
        }

        return json(response, 200, viewport(viewports >= 4 ? [LARVITAR] : []));
      default:
        return json(response, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
  });
  const ntfy = await standIn((_request, response) => json(response, 200, { id: 'x' }));

  const child = run(process.execPath, [SCRIPT, fixturePath('shiny-hunt.json'), fixturePath('xxl.json')], {
    env: {
      ...process.env,
      LPM_BASE_URL: map.url,
      LPM_USERNAME: 'watcher',
      LPM_PASSWORD: PASSWORD,
      NTFY_SERVER: ntfy.url,
      NTFY_TOPIC: 'secret-topic-name',
      TZ: 'UTC',
    },
  });

  let output = '';

  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  const exited = new Promise<number | null>((done) => child.on('exit', done));

  try {
    // Four viewport requests: the first poll, the refused second and its retry, and the third poll.
    for (let waited = 0; viewports < 4 || ntfy.requests.length < 5; waited += 100) {
      expect(waited, `still waiting on the polls; it printed:\n${output}`).toBeLessThan(30_000);
      await new Promise((tick) => setTimeout(tick, 100));
    }

    child.kill('SIGINT');
    expect(await exited, output).toBe(0);
  } finally {
    child.kill('SIGKILL');
    await map.close();
    await ntfy.close();
  }

  expect(map.requests.map((request) => `${request.method} ${request.path}`)).toStrictEqual([
    'GET /api/config',
    'GET /api/game_data',
    'POST /api/auth/login',
    'GET /api/auth/me',
    'GET /api/session/status',
    'POST /api/map/viewport',
    'POST /api/map/viewport',
    'POST /api/auth/login',
    'POST /api/map/viewport',
    'POST /api/map/viewport',
  ]);

  // A refused token is answered at once — a login and the same viewport again — rather than at the next poll.
  const [refused = 0, again = Infinity, retried = Infinity] = map.requests.slice(6, 9).map((request) => request.at);

  expect(again - refused).toBeLessThan(1000);
  expect(retried - refused).toBeLessThan(1000);

  // The login carries the credentials the environment gave it, and nothing after it does.
  expect(map.requests[2]?.body).toStrictEqual({ username: 'watcher', password: PASSWORD });

  // Each request reads as the page's, and each after a login carries that login's token.
  for (const request of map.requests) {
    expect(request.headers['user-agent']).toMatch(/Chrome\//);
    expect(request.headers['sec-fetch-site']).toBe('same-origin');
  }

  expect(map.requests.slice(3, 7).map((request) => request.headers.authorization)).toStrictEqual(
    Array(4).fill(`Bearer ${TOKENS[0]}`),
  );
  expect(map.requests.slice(8).map((request) => request.headers.authorization)).toStrictEqual(
    Array(2).fill(`Bearer ${TOKENS[1]}`),
  );

  // One viewport for two queries, of the whole world, wide enough for both.
  const body = map.requests[5]?.body as { display_filters: Record<string, unknown> } & Record<string, unknown>;

  expect(body).toMatchObject({ min_lat: -85, max_lat: 85, min_lon: -180, max_lon: 180, zoom: 0 });
  expect(body.display_filters).toMatchObject({
    species_filter_mode: 'allowlist',
    species_filter_list: [1, 19, 129],
    always_show_perfect: true,
    show_my_shinies: true,
  });

  // Four spawns on the first poll, none again on the next two, and the one the third poll added.
  const sent = ntfy.requests.map((request) => request.body as { topic: string; title: string; message: string });

  expect(sent.map((notification) => notification.title)).toStrictEqual([
    '100% Dratini',
    '100% XXL Magikarp',
    'Shiny 100% Rattata (Alola)',
    'Shiny Bulbasaur',
    '100% Larvitar',
  ]);
  expect(new Set(sent.map((notification) => notification.topic))).toStrictEqual(new Set(['secret-topic-name']));
  expect(sent[0]?.message).toMatch(
    /^IV 15\/15\/15 \(100%\) · CP 1009 · L30\nDespawns \d\d:\d\d \(10 min left\)\n35\.658581,139\.745433$/,
  );

  // Nothing secret is printed: not the password, not either token, not the topic.
  for (const secret of [PASSWORD, ...TOKENS, 'secret-topic-name']) {
    expect(output).not.toContain(secret);
  }

  expect(output).toContain('shiny-hunt.json also asks for spawns from 0% to 99% IV');
  expect(output).toContain('First poll: 3 spawns and 2 shinies, with shiny access');
}, 60_000);

test('a refused or failed poll waits out a growing backoff rather than the interval, and carries on', async () => {
  let viewports = 0;

  const map = await standIn((request, response) => {
    switch (`${request.method} ${request.path}`) {
      case 'POST /api/auth/login':
        return json(response, 200, { token: 't' });
      case 'POST /api/map/viewport':
        viewports += 1;

        if (viewports <= 3) {
          return json(response, viewports === 2 ? 429 : 502, {
            success: false,
            error: { code: viewports === 2 ? 'RATE_LIMITED' : 'BRIDGE_ERROR', message: 'Try later' },
          });
        }

        return json(response, 200, { span_tier: 'perfect', pokemon: [], my_shiny_pokemon: [] });
      default:
        return json(response, 200, {});
    }
  });

  const controller = new AbortController();
  const waits: number[] = [];
  const lines: string[] = [];

  try {
    await watch({
      client: new LivePokeMap(map.url, { username: 'u', password: 'p' }),
      ntfy: { server: 'http://127.0.0.1:9', topic: 't' },
      queries: [parseQuery('shiny-hunt.json', fixture('shiny-hunt.json'))],
      signal: controller.signal,
      log: (line) => lines.push(line),
      random: () => 0.5,
      sleep: async (ms) => {
        waits.push(ms);

        if (waits.length === 5) {
          controller.abort();
        }
      },
    });
  } finally {
    await map.close();
  }

  // Three failures, doubling from twice the interval, then back to the interval once it answers.
  expect(waits).toStrictEqual([30_000, 60_000, 120_000, 15_000, 15_000]);
  expect(lines.filter((line) => line.includes('trying again'))).toHaveLength(3);
});

test('a login the server refuses is not retried', async () => {
  const map = await standIn((request, response) =>
    request.path === '/api/auth/login'
      ? json(response, 401, {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
        })
      : json(response, 200, {}),
  );

  try {
    await expect(
      watch({
        client: new LivePokeMap(map.url, { username: 'u', password: 'p' }),
        ntfy: { server: 'http://127.0.0.1:9', topic: 't' },
        queries: [parseQuery('shiny-hunt.json', fixture('shiny-hunt.json'))],
        signal: new AbortController().signal,
        log: () => {},
        sleep: async () => {},
      }),
    ).rejects.toThrow('Live PokeMap refused the login');
  } finally {
    await map.close();
  }

  expect(map.requests.filter((request) => request.path === '/api/auth/login')).toHaveLength(1);
});

/**
 * A 200 that is not JSON — a Cloudflare challenge, a maintenance page — is a failure to wait out like any other, not an
 * answer: at start it would otherwise reach `refreshInterval` as `null` and end the command outside every retry.
 */
test('a 200 that is not JSON is retried at start rather than taken for an answer', async () => {
  let configs = 0;

  const map = await standIn((request, response) => {
    if (request.path === '/api/config' && ++configs === 1) {
      response.writeHead(200, { 'Content-Type': 'text/html' });

      return response.end('<html>Just a moment...</html>');
    }

    return request.path === '/api/auth/login' ? json(response, 200, { token: 't' }) : json(response, 200, {});
  });

  const controller = new AbortController();
  const lines: string[] = [];
  let waits = 0;

  try {
    await watch({
      client: new LivePokeMap(map.url, { username: 'u', password: 'p' }),
      ntfy: { server: 'http://127.0.0.1:9', topic: 't' },
      queries: [parseQuery('shiny-hunt.json', fixture('shiny-hunt.json'))],
      signal: controller.signal,
      log: (line) => lines.push(line),
      random: () => 0.5,
      // The first wait is the retry at start, the second the interval after a first poll that start reached.
      sleep: async () => {
        if (++waits === 2) {
          controller.abort();
        }
      },
    });
  } finally {
    await map.close();
  }

  expect(waits).toBe(2);
  expect(configs).toBe(2);
  expect(lines[0]).toBe(
    'Could not read /api/config: GET /api/config: 200 with a body that is not JSON; trying again in 30s',
  );
});

/**
 * A refusal hours in — a password changed while it ran — stops the watcher as one at start does. A 401 on a poll is
 * answered with a login, and that login refused is not sent again: retried at the backoff's pace it would be the same
 * bad credentials every fifteen minutes, all night.
 */
test('a re-login refused partway through a run stops the watcher rather than retrying it', async () => {
  let logins = 0;

  const map = await standIn((request, response) => {
    switch (`${request.method} ${request.path}`) {
      case 'POST /api/auth/login':
        logins += 1;

        return logins === 1
          ? json(response, 200, { token: 't' })
          : json(response, 401, {
              success: false,
              error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
            });
      case 'POST /api/map/viewport':
        return json(response, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Token expired' } });
      default:
        return json(response, 200, {});
    }
  });

  const controller = new AbortController();
  let waits = 0;

  try {
    await expect(
      watch({
        client: new LivePokeMap(map.url, { username: 'u', password: 'p' }),
        ntfy: { server: 'http://127.0.0.1:9', topic: 't' },
        queries: [parseQuery('shiny-hunt.json', fixture('shiny-hunt.json'))],
        signal: controller.signal,
        log: () => {},
        sleep: async () => {
          // A safety net, so that a regression fails here rather than hanging the suite.
          if (++waits > 5) {
            controller.abort();
          }
        },
      }),
    ).rejects.toThrow('Live PokeMap refused the login');
  } finally {
    await map.close();
  }

  expect(logins).toBe(2);
});

test('the command refuses to start without its credentials or a query', async () => {
  const start = (args: string[], env: Record<string, string>) =>
    new Promise<[number | null, string]>((done) => {
      const child = run(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH ?? '', ...env } });
      let output = '';

      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('exit', (code) => done([code, output]));
    });

  const [noQuery] = await start([], { LPM_USERNAME: 'u', LPM_PASSWORD: 'p', NTFY_TOPIC: 't' });
  const [noTopic, said] = await start([fixturePath('shiny-hunt.json')], { LPM_USERNAME: 'u', LPM_PASSWORD: 'p' });
  const [notFilter, why] = await start([fixturePath('config.json')], {
    LPM_USERNAME: 'u',
    LPM_PASSWORD: 'p',
    NTFY_TOPIC: 't',
  });

  expect(noQuery).toBe(1);
  expect([noTopic, said]).toStrictEqual([1, expect.stringContaining('NTFY_TOPIC is not set')]);
  expect([notFilter, why]).toStrictEqual([
    1,
    expect.stringContaining('config.json: not a Live PokeMap display filter'),
  ]);
});
