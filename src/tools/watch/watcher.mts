/**
 * The loop: read what the page reads on load, log in, then one viewport request per refresh interval for as long as it
 * is let run, notifying each spawn a query wants once.
 *
 * One request per interval whatever the number of queries, carrying `widest` of them, because that is what one open
 * tab sends; every query is then matched against the answer here. A failure waits out `Backoff` instead of the
 * interval, and the loop carries on — a watcher meant to run overnight cannot stop at the first 502.
 *
 * The clock and the wait are parameters so that a test can drive the loop without waiting on either.
 */

import { Backoff } from './backoff.mts';
import type { LivePokeMap } from './client.mts';
import { notificationFor, reasonsFor, type Reason } from './message.mts';
import { publish, type Ntfy } from './ntfy.mts';
import { wants, widest, type List, type Query } from './query.mts';
import { Seen } from './seen.mts';
import {
  ApiError,
  refreshInterval,
  toSpawn,
  wireFilter,
  WORLD,
  type GameData,
  type Spawn,
  type ViewportResponse,
} from './wire.mts';
import { setTimeout as delay } from 'node:timers/promises';

/** The longest a failure is waited out: long enough to stop hammering, short enough to be back within the hour. */
export const BACKOFF_CEILING = 15 * 60_000;

/** How long a spawn with no despawn time is remembered, which is longer than any spawn lasts. */
const UNKNOWN_DESPAWN = 60 * 60_000;

export interface WatchOptions {
  client: LivePokeMap;
  ntfy: Ntfy;
  queries: readonly Query[];
  signal: AbortSignal;
  /** Every line worth saying. `debug` is for what only `--verbose` asks to hear. */
  log: (line: string) => void;
  debug?: (line: string) => void;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
}

const sleepFor = async (ms: number, signal: AbortSignal) => {
  try {
    await delay(ms, undefined, { signal });
  } catch {
    // Aborted, which the loop checks for itself.
  }
};

export async function watch(options: WatchOptions): Promise<void> {
  const { client, ntfy, queries, signal, log } = options;
  const debug = options.debug ?? (() => {});
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepFor;

  const [interval, data] = await startup(options);
  const backoff = new Backoff(interval, BACKOFF_CEILING, options.random);
  const seen = new Seen();
  const body = { ...WORLD, display_filters: wireFilter(widest(queries)) };
  let tier: string | undefined;
  let first = true;

  log(
    `Watching the world every ${interval / 1000}s for ${queries.length} ${queries.length === 1 ? 'query' : 'queries'}`,
  );

  while (!signal.aborted) {
    let wait = interval;

    try {
      const answer = await client.viewport(body, signal);

      backoff.succeeded();

      if (answer.span_tier !== tier) {
        tier = answer.span_tier;

        if (tier !== 'perfect') {
          log(`The server answered span tier ${JSON.stringify(tier)}, where the world view expects "perfect"`);
        }
      }

      if (first) {
        first = false;
        log(firstAnswer(answer));
      }

      const matched = match(answer, queries, now());

      debug(
        `${answer.pokemon?.length ?? 0} spawns, ${answer.my_shiny_pokemon?.length ?? 0} shinies, ${matched.length} wanted`,
      );

      for (const { spawn, reasons, by } of matched) {
        if (seen.has(spawn.encounterId, now())) {
          continue;
        }

        const notification = notificationFor(spawn, reasons, data, now());

        try {
          await publish(ntfy, notification, signal);
          seen.remember(spawn.encounterId, spawn.despawnMs ?? now() + UNKNOWN_DESPAWN);
          log(`Notified ${notification.title} at ${spawn.lat},${spawn.lon} (${by.join(', ')})`);
        } catch (error) {
          if (signal.aborted) {
            break;
          }

          log(`Could not notify ${notification.title}: ${(error as Error).message}; trying again next poll`);
        }
      }
    } catch (error) {
      if (signal.aborted) {
        break;
      }

      wait = backoff.failed();
      log(`${(error as Error).message}; trying again in ${Math.round(wait / 1000)}s`);
    }

    await sleep(wait, signal);
  }
}

/**
 * What the page does before its first viewport, each step retried after a wait until it answers. A login the server
 * refuses outright is the one thing that is not retried: a wrong password asked again every few minutes is a locked
 * account, and nobody is there to notice it.
 */
async function startup(options: WatchOptions): Promise<[number, GameData]> {
  const { client, signal, log } = options;
  const sleep = options.sleep ?? sleepFor;
  const backoff = new Backoff(15_000, BACKOFF_CEILING, options.random);

  const attempt = async <T,>(what: string, step: () => Promise<T>): Promise<T> => {
    for (;;) {
      try {
        const answer = await step();

        backoff.succeeded();

        return answer;
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }

        if (what === 'log in' && error instanceof ApiError && [400, 401, 403].includes(error.status)) {
          throw new Error(`Live PokeMap refused the login: ${error.message}`, { cause: error });
        }

        const wait = backoff.failed();

        log(`Could not ${what}: ${(error as Error).message}; trying again in ${Math.round(wait / 1000)}s`);
        await sleep(wait, signal);
      }
    }
  };

  const config = await attempt('read /api/config', () => client.config(signal));
  const data = await attempt('read /api/game_data', () => client.gameData(signal));

  await attempt('log in', () => client.login(signal));
  log('Logged in to Live PokeMap');
  await attempt('load the map', () => client.startup(signal));

  return [refreshInterval(config), data];
}

/**
 * What the account turned out to be able to see, said once. Which lists come back is a matter of its plan rather than of
 * anything sent: Live PokeMap's own pricing gives Pokémon with IVs from Explorer up and "your own shinies" at Premium,
 * and the viewport says which of the second this account has as `shiny_access`. Said rather than assumed, so a query
 * waiting on shinies an account cannot be shown is pointed out on the first poll rather than left to wait.
 */
export function firstAnswer(answer: ViewportResponse): string {
  const counts = `${answer.pokemon?.length ?? 0} spawns and ${answer.my_shiny_pokemon?.length ?? 0} shinies`;

  if (answer.shiny_access === false) {
    return `First poll: ${counts}. This account has no shiny access (Live PokeMap Premium), so no shiny will be notified`;
  }

  return `First poll: ${counts}${answer.shiny_access ? ', with shiny access' : ''}`;
}

interface Match {
  spawn: Spawn;
  reasons: Reason[];
  /** The queries that want it, by name. */
  by: string[];
}

/** Every spawn in either list that a query wants and that has not despawned, once each however many lists hold it. */
export function match(answer: ViewportResponse, queries: readonly Query[], now: number): Match[] {
  const wild = (answer.pokemon ?? []).map(toSpawn);
  const mine = (answer.my_shiny_pokemon ?? []).map(toSpawn);
  const lists: [List, Spawn[]][] = [
    ['pokemon', wild],
    ['my_shiny_pokemon', mine],
  ];
  const shinies = new Set([
    ...(answer.my_shiny_encounters ?? []).map(String),
    ...mine.map((spawn) => spawn.encounterId),
  ]);
  const found = new Map<string, Match>();

  for (const [list, spawns] of lists) {
    for (const spawn of spawns) {
      if (spawn.encounterId === '' || (spawn.despawnMs !== null && spawn.despawnMs <= now)) {
        continue;
      }

      const shiny = spawn.shiny || shinies.has(spawn.encounterId);
      const by = queries.filter((query) => wants(query, spawn, list, shiny)).map((query) => query.name);

      if (by.length === 0) {
        continue;
      }

      const known = found.get(spawn.encounterId);

      if (known) {
        known.by = [...new Set([...known.by, ...by])];
      } else {
        found.set(spawn.encounterId, { spawn, reasons: reasonsFor(spawn, shiny), by });
      }
    }
  }

  return [...found.values()];
}
