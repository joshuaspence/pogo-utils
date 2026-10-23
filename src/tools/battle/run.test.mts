/**
 * The whole loop against a scripted phone: recorded frames of each screen, moved on by a tap in the right place and by
 * nothing else, under a clock that only advances when the run waits or the phone works. A tap anywhere a screen does not
 * answer leaves it where it is, which is how a wrong tap shows: the run stalls, and ends `Lost`.
 */

import { type GameData } from '../inventory/game-master.mts';
import { decodePng, type Image } from '../inventory/png.mts';
import { useEngine } from '../inventory/ocr.mts';
import { tesseractCli } from '../inventory/ocr-cli.mts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, test } from 'vitest';
import { typeColour } from './minigame.mts';
import { silhouetteOfIcon } from './party.mts';
import { type Point } from './play.mts';
import { Lost, LOST_MS, run, type Clock, type Phone } from './run.mts';

/**
 * OCR under way, which the scripted clock waits on rather than passing: real Tesseract takes real milliseconds, which the
 * run's loop, no longer awaiting the menu it reads, would otherwise spend as seconds of scripted time.
 */
const reading = new Set<Promise<string>>();

beforeAll(() =>
  useEngine({
    tsv: (...args) => {
      const read = tesseractCli.tsv(...args);
      reading.add(read);
      void read.finally(() => reading.delete(read)).catch(() => {});

      return read;
    },
  }),
);

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

/** The bubble colours of the types `minigame.test.mts` has icons for, by the game master's type names. */
const COLOURS = Object.fromEntries(
  DATA.types.flatMap((type) => {
    const name = `types/POKEMON_TYPE_${type.toUpperCase()}`;

    return existsSync(fileURLToPath(new URL(`fixtures/${name}.png`, import.meta.url)))
      ? [[type, typeColour(fixture(name))]]
      : [];
  }),
);

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

function scripted(
  scenes: Record<string, Scene>,
  start: string,
): { phone: Phone; clock: Clock; taps: string[]; strokes: { scene: string; from: Point; to: Point; at: number }[] } {
  let time = 0;
  let current = start;
  let entered = 0;
  let swiped = 0;
  const taps: string[] = [];
  const strokes: { scene: string; from: Point; to: Point; at: number }[] = [];

  // Screenshots taken and not yet handed back: a second's work each, which passes on the run's clock rather than
  // holding it, as a real screenshot does while the stream goes on.
  const developing: { due: number; deliver: () => void }[] = [];

  const advance = (ms: number) => {
    time += ms;

    for (const shot of developing.filter(({ due }) => due <= time)) {
      developing.splice(developing.indexOf(shot), 1);
      shot.deliver();
    }
  };

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
      const { frame, screenshot } = scene();

      return new Promise((resolve) =>
        developing.push({ due: time + 1000, deliver: () => resolve(screenshot ?? frame) }),
      );
    },
    tap: ([x, y]) => {
      advance(30);
      const { tap } = scene();
      taps.push(current);

      if (tap && Math.abs(tap.at[0] - x) < 0.05 && Math.abs(tap.at[1] - y) < 0.04) {
        go(tap.to);
      }

      return Promise.resolve();
    },
    swipe: (from, to, ms) => {
      strokes.push({ scene: current, from, to, at: time });
      advance(ms + 30);
      const { swipes } = scene();

      if (swipes && ++swiped >= swipes.count) {
        go(swipes.to);
      }

      return Promise.resolve();
    },
  };

  const clock: Clock = {
    now: () => time,
    sleep: async (ms) => {
      while (reading.size > 0) {
        await Promise.allSettled([...reading]);
      }

      advance(ms);
    },
  };

  return { phone, clock, taps, strokes };
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

  const battles = await run(
    phone,
    {
      mode: { mode: 'training', leader: 'blanche', league: 'ultra' },
      data: DATA,
      icons: ICONS,
      colours: COLOURS,
      count: 1,
    },
    clock,
  );

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

  expect(
    await run(
      phone,
      {
        mode: { mode: 'training', leader: 'blanche', league: 'ultra' },
        data: DATA,
        icons: ICONS,
        colours: COLOURS,
        count: 1,
      },
      clock,
    ),
  ).toBe(1);
  expect(taps.slice(0, 3)).toEqual(['map', 'main', 'training']);
});

/**
 * GO Battle League from the map: its card's BATTLE at the top of the Battle tab, the welcome before a set, the league,
 * the recommended party, and an opponent found for longer than `LOST_MS`, then NEXT BATTLE on the result, back to the
 * league.
 */
function league(): Record<string, Scene> {
  return {
    ...battleAndBack(),
    map: { frame: fixture('menu-map'), tap: { at: [0.5, 0.932], to: 'main' } },
    main: { frame: fixture('menu-main'), tap: { at: [0.777, 0.5975], to: 'tab' } },
    tab: { frame: fixture('menu-gbl-battle-tab'), tap: { at: [0.3, 0.843], to: 'welcome' } },
    welcome: { frame: fixture('menu-gbl-welcome'), tap: { at: [0.3, 0.895], to: 'league' } },
    league: { frame: fixture('menu-gbl-league'), tap: { at: [0.54, 0.43], to: 'party' } },
    party: { frame: fixture('menu-gbl-party'), tap: { at: [0.5, 0.87], to: 'matching' } },
    matching: { frame: fixture('menu-gbl-matchmaking'), lasts: { ms: LOST_MS * 2, to: 'fight' } },
    result: { frame: fixture('menu-gbl-result'), tap: { at: [0.5, 0.854], to: 'league' } },
  };
}

const GBL = { mode: 'gbl', league: 'ultra' } as const;

test('plays GO Battle League battles from the map, waiting out matchmaking', async () => {
  const { phone, clock, taps } = scripted(league(), 'map');

  expect(await run(phone, { mode: GBL, data: DATA, icons: ICONS, colours: COLOURS, count: 2 }, clock)).toBe(2);
  expect(taps).toEqual([
    ...['map', 'main', 'tab', 'welcome', 'league', 'party', 'charged', 'result'],
    ...['league', 'party', 'charged', 'result'],
  ]);
});

// The reward encounter's Poké Ball is left alone: GO Battle League does not come back to the map of itself.
test('taps no Poké Ball once a GO Battle League battle has been played', async () => {
  const { phone, clock, taps } = scripted(
    { ...league(), result: { frame: fixture('menu-gbl-result'), tap: { at: [0.5, 0.854], to: 'map' } } },
    'tab',
  );

  await expect(
    run(phone, { mode: GBL, data: DATA, icons: ICONS, colours: COLOURS, count: 2 }, clock),
  ).rejects.toBeInstanceOf(Lost);
  expect(taps.filter((scene) => scene === 'map')).toEqual([]);
});

test('stops at the end of a GO Battle League set, leaving its reward to be collected', async () => {
  const { phone, clock, taps } = scripted(
    {
      ...league(),
      result: { frame: fixture('menu-gbl-result-last'), tap: { at: [0.5, 0.935], to: 'collect' } },
      collect: { frame: fixture('menu-gbl-collect') },
    },
    'party',
  );

  expect(await run(phone, { mode: GBL, data: DATA, icons: ICONS, colours: COLOURS, count: 3 }, clock)).toBe(1);
  expect(taps).toEqual(['party', 'charged', 'result']);
});

/**
 * Zeraora leads and faints to Glaceon. Of Latias and Gyarados, Glaceon hits Latias super effectively and not Gyarados,
 * so Gyarados goes in, off the prompt's second card. The first tap does not land, and the retap a second later goes to
 * the same card: decided again, with Gyarados already taken to be out, it went to Latias's. A retap that misses runs on
 * into a screen nothing recognises, so a regression ends `Lost` rather than tapping at the prompt for ever.
 */
test('retaps the card it chose when the first tap on the switch prompt does not land', async () => {
  const { phone, clock, taps } = scripted(
    {
      ...battleAndBack(),
      party: { frame: fixture('menu-party-full'), tap: { at: [0.5, 0.87], to: 'loading' } },
      fight: { frame: fixture('battle-latias'), swipes: { count: 10, to: 'fainted' } },
      fainted: { frame: fixture('switch-glaceon'), lasts: { ms: 600, to: 'again' } },
      again: {
        frame: fixture('switch-glaceon'),
        tap: { at: [0.67, 0.87], to: 'next' },
        lasts: { ms: 3000, to: 'stuck' },
      },
      stuck: { frame: fixture('other-loss') },
      next: { frame: fixture('battle-minigame-mamoswine'), swipes: { count: 10, to: 'won' } },
    },
    'party',
  );
  const lines: string[] = [];

  expect(
    await run(
      phone,
      {
        mode: { mode: 'training', leader: 'blanche', league: 'ultra' },
        data: DATA,
        icons: ICONS,
        colours: COLOURS,
        count: 1,
      },
      clock,
      (line) => lines.push(line),
    ),
  ).toBe(1);
  expect(taps.filter((scene) => scene === 'fainted' || scene === 'again')).toEqual(['fainted', 'again']);
  expect(lines).toContain('sending in Gyarados');
});

/**
 * An opponent's charged move takes the battle off the screen for 2.2s: long enough for a menu read to start, its
 * screenshot due a second later at 3.5s. The battle is back at 3.2s, and is played from then, not from when the read
 * is done — which, awaited, held the fast moves up after every charged move.
 */
test('plays on as soon as the battle is back, without waiting for a menu read', async () => {
  const { phone, clock, strokes } = scripted(
    {
      fight: { frame: fixture('battle-deoxys'), lasts: { ms: 1000, to: 'pause' } },
      pause: { frame: fixture('other-vs-fade'), lasts: { ms: 2200, to: 'back' } },
      back: { frame: fixture('battle-deoxys'), lasts: { ms: 1000, to: 'gone' } },
      gone: { frame: fixture('other-white') },
    },
    'fight',
  );

  await expect(
    run(
      phone,
      { mode: { mode: 'training', leader: 'blanche', league: 'ultra' }, data: DATA, icons: ICONS, colours: COLOURS },
      clock,
    ),
  ).rejects.toBeInstanceOf(Lost);

  const resumed = strokes.find(({ scene }) => scene === 'back');

  expect(resumed?.at).toBeGreaterThanOrEqual(3200);
  expect(resumed?.at).toBeLessThan(3400);
});

test('stops on a Battle tab whose Training card never shows, rather than scroll it for ever', async () => {
  const { phone, clock, taps } = scripted(
    {
      main: { frame: fixture('menu-main'), tap: { at: [0.777, 0.5975], to: 'tab' } },
      tab: { frame: fixture('menu-battle-league') },
    },
    'main',
  );

  const lost = await run(
    phone,
    { mode: { mode: 'training', leader: 'blanche', league: 'ultra' }, data: DATA, icons: ICONS, colours: COLOURS },
    clock,
  ).catch((error: unknown) => error);

  expect(lost).toBeInstanceOf(Lost);
  expect(taps).toEqual(['main']);
});

/**
 * Shadow Sneak thrown, its minigame's Ghost bubbles are swiped through rather than swept across in rows: every swipe in
 * it crosses the bubble low in the middle of `battle-minigame-giratina`.
 */
test('aims the minigame’s swipes at its bubbles', async () => {
  // Straight to Shadow Sneak's frame: the usual fight is Deoxys's, whose Zap Cannon would be read as the move thrown.
  const { phone, clock, strokes } = scripted(
    {
      ...battleAndBack(),
      fight: { frame: fixture('charged-shadow-sneak'), tap: { at: [0.499, 0.889], to: 'minigame' } },
    },
    'fight',
  );

  expect(
    await run(
      phone,
      {
        mode: { mode: 'training', leader: 'blanche', league: 'ultra' },
        data: DATA,
        icons: ICONS,
        colours: COLOURS,
        count: 1,
      },
      clock,
    ),
  ).toBe(1);

  const minigame = strokes.filter(({ scene }) => scene === 'minigame');

  expect(minigame.length).toBeGreaterThan(0);

  for (const { from, to } of minigame) {
    expect([from[1], to[1]].every((y) => y > 0.78 && y < 0.86)).toBe(true);
    expect(Math.min(from[0], to[0])).toBeLessThan(0.45);
    expect(Math.max(from[0], to[0])).toBeGreaterThan(0.45);
  }
});

test('carries on into the next battle until the count is reached', async () => {
  const { phone, clock, taps } = scripted(battleAndBack(), 'training');

  expect(
    await run(
      phone,
      {
        mode: { mode: 'training', leader: 'blanche', league: 'ultra' },
        data: DATA,
        icons: ICONS,
        colours: COLOURS,
        count: 2,
      },
      clock,
    ),
  ).toBe(2);
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

  expect(
    await run(
      phone,
      {
        mode: { mode: 'training', leader: 'blanche', league: 'ultra' },
        data: DATA,
        icons: ICONS,
        colours: COLOURS,
        count: 1,
      },
      clock,
    ),
  ).toBe(1);
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

  await run(
    phone,
    {
      mode: { mode: 'training', leader: 'blanche', league: 'ultra' },
      data: DATA,
      icons: ICONS,
      colours: COLOURS,
      count: 1,
    },
    clock,
    (line) => lines.push(line),
  );

  const named = new Set(lines.filter((line) => line.includes(' against ')).map((line) => line.split(':')[0]));

  expect([...named]).toEqual(['Latias against Glaceon (2 shields)', 'Mamoswine against Glaceon (2 shields)']);
});

/**
 * A shield prompt is tapped while we have a shield left, and left to run out once both are spent: tapped, it would be
 * a tap at a prompt with nothing behind it. Latias leads with both shields up; Charizard has spent both.
 */
test.each([
  ['battle-latias', ['prompt']],
  ['battle-shields-spent', []],
])('after %s, the shield prompt is tapped in %j', async (fight, tapped) => {
  const { phone, clock, taps } = scripted(
    {
      ...battleAndBack(),
      fight: { frame: fixture(fight), swipes: { count: 10, to: 'prompt' } },
      prompt: { frame: fixture('shield-glaceon'), tap: { at: [0.5, 0.82], to: 'won' }, lasts: { ms: 3000, to: 'won' } },
    },
    'fight',
  );

  await run(
    phone,
    {
      mode: { mode: 'training', leader: 'blanche', league: 'ultra' },
      data: DATA,
      icons: ICONS,
      colours: COLOURS,
      count: 1,
    },
    clock,
  );

  expect(taps.filter((scene) => scene === 'prompt')).toEqual(tapped);
});

/** What is read of each side through a battle: its CP off the HUD, its HP off its bar and how many shields we have. */
test('says each side’s CP and HP, and how many shields we have left', async () => {
  const { phone, clock } = scripted(
    {
      ...battleAndBack(),
      fight: { frame: fixture('battle-one-shield'), swipes: { count: 10, to: 'prompt' } },
      prompt: { frame: fixture('shield-low'), lasts: { ms: 3000, to: 'won' } },
    },
    'fight',
  );
  const lines: string[] = [];

  await run(
    phone,
    {
      mode: { mode: 'training', leader: 'blanche', league: 'ultra' },
      data: DATA,
      icons: ICONS,
      colours: COLOURS,
      count: 1,
    },
    clock,
    (line) => lines.push(line),
  );

  const read = lines.filter((line) => line.includes(' against ')).map((line) => line.split('; ')[1]);

  expect(read).toContain('CP 2495 at 74% against CP 2497 at 51%, 1 of our shields left');
  expect(read.at(-1)).toBe('CP 2495 at 9% against CP 2497 at 6%, 1 of our shields left');
});

test('stops, keeping its last frames, where nothing is recognised', async () => {
  const { phone, clock, taps } = scripted({ stuck: { frame: fixture('other-loss') } }, 'stuck');

  const lost = await run(
    phone,
    { mode: { mode: 'training', leader: 'blanche', league: 'ultra' }, data: DATA, icons: ICONS, colours: COLOURS },
    clock,
  ).catch((error: unknown) => error);

  expect(lost).toBeInstanceOf(Lost);
  expect((lost as Lost).frames.length).toBeGreaterThan(0);
  expect(clock.now()).toBeGreaterThan(LOST_MS);
  expect(taps).toEqual([]);
});
