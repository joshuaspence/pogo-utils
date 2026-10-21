/**
 * Team Leader battles one after another: `Player` through each battle, read off the stream frame by frame, and
 * `readMenu` between them, read off full screenshots, from the result's ✓ round to the next USE THIS PARTY.
 *
 * Driven through `Phone` rather than `adb`, so a test can stand a scripted phone in for a real one.
 */

import { type Image } from '../inventory/png.mts';
import { readMenu, type League, type Leader } from './menus.mts';
import { Player, type Point } from './play.mts';
import { readyButtons, recognise } from './recognise.mts';

export interface Phone {
  /** The latest frame of the stream, or `undefined` before the first. */
  frame(): Image | undefined;
  screenshot(): Promise<Image>;
  tap(at: Point): Promise<void>;
  swipe(from: Point, to: Point, ms: number): Promise<void>;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/**
 * How long nothing may be recognised before the run stops, in milliseconds. Twice the 10s first planned, because a
 * recorded battle's end ran 10s from its last frame to the ✓ that can be tapped — `YOU WIN!`, the stardust, a medal's
 * ring — with nothing on screen that is either a battle or a menu.
 */
export const LOST_MS = 20_000;

/**
 * How long a screen must read as `other` before it is screenshot as a menu. A battle shows `other` for a second or two
 * at a time — a banner over the HUD, the opponent's charged move — and a screenshot costs one, with OCR on top.
 */
const MENU_AFTER_MS = 1_500;

/** How long a menu's tap is given to animate into the next screen before that is screenshot. */
const MENU_SETTLE_MS = 1_500;

/** Frames kept for a run that gets lost, about the last three seconds of it at one frame in ten. */
const KEPT_FRAMES = 10;

export class Lost extends Error {
  readonly frames: readonly Image[];

  constructor(frames: readonly Image[]) {
    super(`nothing recognised for ${LOST_MS / 1000}s; stopped rather than tap at a screen it does not know`);
    this.frames = frames;
  }
}

/**
 * Plays `count` battles, or until stopped, starting from anywhere between the result of one and the start of the next —
 * the Battle tab, typically. Answers how many battles finished. Throws `Lost` with the last few frames when nothing has
 * been recognised for `LOST_MS`.
 */
export async function run(
  phone: Phone,
  { leader, league, count = Infinity }: { leader: Leader; league: League; count?: number },
  clock: Clock,
  log: (line: string) => void = () => {},
): Promise<number> {
  let player = new Player();
  let battles = 0;
  let battling = false;
  let known = clock.now();
  let otherSince: number | undefined;
  let frames = 0;
  const kept: Image[] = [];

  while (battles < count) {
    const frame = phone.frame();

    if (!frame) {
      await clock.sleep(20);
      continue;
    }

    if (frames++ % 10 === 0 && kept.at(-1) !== frame) {
      kept.push(frame);
      kept.splice(0, kept.length - KEPT_FRAMES);
    }

    const state = recognise(frame);

    if (state !== 'other') {
      if (!battling) {
        log(`battle ${battles + 1} started`);
        player = new Player();
      }

      battling = true;
      known = clock.now();
      otherSince = undefined;

      const action = player.next(state, clock.now(), state === 'charged' ? readyButtons(frame) : []);

      if (action.kind === 'swipe') {
        await phone.swipe(action.from, action.to, action.ms);
      } else if (action.kind === 'tap') {
        log(`tap ${action.what}`);
        await phone.tap(action.at);
      } else {
        await clock.sleep(20);
      }

      continue;
    }

    player.next(state, clock.now());
    otherSince ??= clock.now();

    if (clock.now() - otherSince >= MENU_AFTER_MS) {
      const menu = await readMenu(await phone.screenshot(), { leader, league, result: battling });

      if (menu.screen !== 'unknown') {
        log(`${menu.screen}: tap`);
        await phone.tap(menu.tap);
        known = clock.now();

        if (menu.screen === 'result') {
          battles++;
          battling = false;
          log(`battle ${battles} finished`);
        }

        await clock.sleep(MENU_SETTLE_MS);
        continue;
      }
    }

    if (clock.now() - known > LOST_MS) {
      throw new Lost(kept);
    }

    await clock.sleep(50);
  }

  return battles;
}
