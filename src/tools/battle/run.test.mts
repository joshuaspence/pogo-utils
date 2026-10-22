/**
 * The whole loop against a scripted phone: recorded frames of each screen, moved on by a tap in the right place and by
 * nothing else, under a clock that only advances when the run waits or the phone works. A tap anywhere a screen does not
 * answer leaves it where it is, which is how a wrong tap shows: the run stalls, and ends `Lost`.
 */

import { type GameData } from '../inventory/game-master.mts';
import { decodePng, type Image } from '../inventory/png.mts';
import { useEngine } from '../inventory/ocr.mts';
import { tesseractCli } from '../inventory/ocr-cli.mts';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, test } from 'vitest';
import { silhouetteOfIcon } from './party.mts';
import { type Point } from './play.mts';
import { Lost, LOST_MS, run, type Clock, type Phone } from './run.mts';

beforeAll(() => useEngine(tesseractCli));

const DATA = JSON.parse(
  readFileSync(new URL('../inventory/fixtures/game-master.json', import.meta.url), 'utf8'),
) as GameData;

const fixture = (name: string) =>
  decodePng(readFileSync(fileURLToPath(new URL(`fixtures/${name}.png`, import.meta.url))));

/** The icons `party.test.mts` reads the party screens against. */
const ICONS = readdirSync(new URL('fixtures/icons/', import.meta.url)).map((icon) => ({
  species: DATA.forms.find((form) => form.icon === icon)?.species ?? icon,
  silhouette: silhouetteOfIcon(fixture(`icons/${icon.replace(/[.]png$/, '')}`)),
}));

interface Scene {
  frame: Image;
  screenshot?: Image;

  /** Where a tap moves the phone on from here, and to which scene. */
  tap?: { at: Point; to: string };

  /** How many swipes move the phone on from here, and to which scene. */
  swipes?: { count: number; to: string };

  /** How long the scene lasts on its own before moving on, in milliseconds. */
  lasts?: { ms: number; to: string };
}

function scripted(scenes: Record<string, Scene>, start: string): { phone: Phone; clock: Clock; taps: string[] } {
  let time = 0;
  let current = start;
  let entered = 0;
  let swiped = 0;
  const taps: string[] = [];

  const go = (to: string) => {
    current = to;
    entered = time;
    swiped = 0;
  };

  const scene = () => {
    const now = scenes[current];

    if (!now) {
      throw new Error(`no scene ${current}`);
    }

    if (now.lasts && time - entered >= now.lasts.ms) {
      go(now.lasts.to);
      return scene();
    }

    return now;
  };

  const phone: Phone = {
    frame: () => scene().frame,
    screenshot: () => {
      time += 1000;
      const { frame, screenshot } = scene();
      return Promise.resolve(screenshot ?? frame);
    },
    tap: ([x, y]) => {
      time += 30;
      const { tap } = scene();
      taps.push(current);

      if (tap && Math.abs(tap.at[0] - x) < 0.05 && Math.abs(tap.at[1] - y) < 0.04) {
        go(tap.to);
      }

      return Promise.resolve();
    },
    swipe: (_from, _to, ms) => {
      time += ms + 30;
      const { swipes } = scene();

      if (swipes && ++swiped >= swipes.count) {
        go(swipes.to);
      }

      return Promise.resolve();
    },
  };

  const clock: Clock = {
    now: () => time,
    sleep: (ms) => {
      time += ms;
      return Promise.resolve();
    },
  };

  return { phone, clock, taps };
}

/** One battle and the way back round to the next, as recorded against Blanche in the Ultra League. */
function battleAndBack(): Record<string, Scene> {
  const menu = (name: string, tap: Scene['tap'], lasts?: Scene['lasts']): Scene => ({
    frame: fixture(name),
    ...(tap && { tap }),
    ...(lasts && { lasts }),
  });

  return {
    training: menu('menu-training', { at: [0.26, 0.8], to: 'intro' }),
    intro: menu('menu-intro', { at: [0.5, 0.733], to: 'league' }),
    league: menu('menu-league', { at: [0.55, 0.58], to: 'party' }),
    party: menu('menu-party', { at: [0.5, 0.87], to: 'loading' }),
    loading: { frame: fixture('other-vs-fade'), lasts: { ms: 4000, to: 'fight' } },
    fight: { frame: fixture('battle-deoxys'), swipes: { count: 30, to: 'charged' } },
    charged: { frame: fixture('charged-shadow-sneak'), tap: { at: [0.499, 0.889], to: 'minigame' } },
    minigame: { frame: fixture('battle-minigame-giratina'), swipes: { count: 40, to: 'won' } },
    won: { frame: fixture('other-win'), screenshot: fixture('menu-unknown-medal'), lasts: { ms: 8000, to: 'result' } },
    result: menu('menu-result', { at: [0.5, 0.935], to: 'training' }),
  };
}

test('plays a battle from the Battle tab and taps its way back round', async () => {
  const { phone, clock, taps } = scripted(battleAndBack(), 'training');

  const battles = await run(phone, { leader: 'blanche', league: 'ultra', data: DATA, icons: ICONS, count: 1 }, clock);

  expect(battles).toBe(1);
  expect(taps).toEqual(['training', 'intro', 'league', 'party', 'charged', 'result']);
});

/** The map's Poké Ball, BATTLE on the main menu, and the Battle tab scrolled from GO Battle League to Training. */
test('finds its way to the leader from the map', async () => {
  const { phone, clock, taps } = scripted(
    {
      ...battleAndBack(),
      map: { frame: fixture('menu-map'), tap: { at: [0.5, 0.932], to: 'main' } },
      main: { frame: fixture('menu-main'), tap: { at: [0.777, 0.5975], to: 'tab' } },
      tab: { frame: fixture('menu-battle-league'), swipes: { count: 1, to: 'training' } },
    },
    'map',
  );

  expect(await run(phone, { leader: 'blanche', league: 'ultra', data: DATA, icons: ICONS, count: 1 }, clock)).toBe(1);
  expect(taps.slice(0, 3)).toEqual(['map', 'main', 'training']);
});

test('stops on a Battle tab whose Training card never shows, rather than scroll it for ever', async () => {
  const { phone, clock, taps } = scripted(
    {
      main: { frame: fixture('menu-main'), tap: { at: [0.777, 0.5975], to: 'tab' } },
      tab: { frame: fixture('menu-battle-league') },
    },
    'main',
  );

  const lost = await run(phone, { leader: 'blanche', league: 'ultra', data: DATA, icons: ICONS }, clock).catch(
    (error: unknown) => error,
  );

  expect(lost).toBeInstanceOf(Lost);
  expect(taps).toEqual(['main']);
});

test('carries on into the next battle until the count is reached', async () => {
  const { phone, clock, taps } = scripted(battleAndBack(), 'training');

  expect(await run(phone, { leader: 'blanche', league: 'ultra', data: DATA, icons: ICONS, count: 2 }, clock)).toBe(2);
  expect(taps.filter((scene) => scene === 'result')).toHaveLength(2);
});

/**
 * Kyogre against Entei, with Avalanche lit and Hydro Pump not, and both of Entei's shields up: Avalanche costs 45 to
 * Hydro Pump's 75, so it goes now to draw a shield, where with the shields gone the fight would carry on until Hydro
 * Pump lit — `strategy.test.mts` holds that half.
 */
test('baits with the cheaper move while the opponent has shields', async () => {
  const { phone, clock, taps } = scripted(
    {
      ...battleAndBack(),
      fight: {
        frame: fixture('charged-two-right'),
        tap: { at: [0.69, 0.889], to: 'minigame' },
        swipes: { count: 10, to: 'training' },
      },
    },
    'fight',
  );

  expect(await run(phone, { leader: 'blanche', league: 'ultra', data: DATA, icons: ICONS, count: 1 }, clock)).toBe(1);
  expect(taps).toEqual(['fight', 'result']);
});

/**
 * Latias leads, from the party screen, and faints to Glaceon; the switch prompt's first card sends in Mamoswine, the
 * next of the party. No frame here shows a move label or our species, so the party is all that names either.
 */
test('names the lead from the party, and the next of it after a faint', async () => {
  const { phone, clock } = scripted(
    {
      ...battleAndBack(),
      fight: { frame: fixture('battle-latias'), swipes: { count: 10, to: 'fainted' } },
      fainted: { frame: fixture('switch-glaceon'), tap: { at: [0.33, 0.87], to: 'next' } },
      next: { frame: fixture('battle-minigame-mamoswine'), swipes: { count: 10, to: 'won' } },
    },
    'party',
  );
  const lines: string[] = [];

  await run(phone, { leader: 'blanche', league: 'ultra', data: DATA, icons: ICONS, count: 1 }, clock, (line) =>
    lines.push(line),
  );

  const named = lines.filter((line) => line.includes(' against ')).map((line) => line.split(':')[0]);

  expect(named).toEqual(['Latias against Glaceon (2 shields)', 'Mamoswine against Glaceon (2 shields)']);
});

test('stops, keeping its last frames, where nothing is recognised', async () => {
  const { phone, clock, taps } = scripted({ stuck: { frame: fixture('other-loss') } }, 'stuck');

  const lost = await run(phone, { leader: 'blanche', league: 'ultra', data: DATA, icons: ICONS }, clock).catch(
    (error: unknown) => error,
  );

  expect(lost).toBeInstanceOf(Lost);
  expect((lost as Lost).frames.length).toBeGreaterThan(0);
  expect(clock.now()).toBeGreaterThan(LOST_MS);
  expect(taps).toEqual([]);
});
