/**
 * Team Leader or GO Battle League battles one after another: `Player` through each battle, read off the stream frame by
 * frame, and `readMenu` between them, read off full screenshots, from the result round to the next USE THIS PARTY.
 *
 * Driven through `Phone` rather than `adb`, so a test can stand a scripted phone in for a real one.
 */

import { type GameData } from '../inventory/game-master.mts';
import { type Image } from '../inventory/png.mts';
import { readMenu, type Mode } from './menus.mts';
import { readParty, type Icon } from './party.mts';
import { BOTTOM, place } from './layout.mts';
import { Player, SWITCH_CARDS, type Point } from './play.mts';
import { bubbleSwipes, type Colour } from './minigame.mts';
import { merge, readBattle, type Sighting } from './read.mts';
import { opponentShields, readyButtons, recognise } from './recognise.mts';
import { activeOf, bestButton, nextOut, shouldShield, typesOf } from './strategy.mts';

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

/** How long the Battle tab's scroll takes, in milliseconds: long enough to be a drag rather than a tap. */
const SCROLL_MS = 400;

/**
 * How often the battle's names and move labels are read again, in milliseconds. A read holds the loop up for about
 * 220ms, a fast move's worth, and what it reads changes only when a Pokémon on either side does.
 */
const READ_MS = 3_000;

/** Frames kept for a run that gets lost, about the last three seconds of it at one frame in ten. */
const KEPT_FRAMES = 10;

export class Lost extends Error {
  readonly frames: readonly Image[];

  constructor(frames: readonly Image[]) {
    super(`nothing recognised for ${LOST_MS / 1000}s; stopped rather than tap at a screen it does not know`);
    this.frames = frames;
  }
}

export interface Options {
  mode: Mode;
  data: GameData;

  /** Every form's silhouette with its species, which the party screen's cards are read against. */
  icons: readonly Icon[];

  /** The colour each type's minigame bubbles are drawn in, by type name, as `typeColour` reads the type's icon. */
  colours: Readonly<Record<string, Colour>>;
  count?: number;
}

/**
 * Plays `count` battles, or until stopped, starting from the map or anywhere between the result of one battle and the
 * start of the next. Answers how many battles finished, fewer than `count` where GO Battle League has no battle to
 * offer until its reward is collected by hand. Throws `Lost` with the last few frames when nothing has been
 * recognised for `LOST_MS`.
 */
export async function run(
  phone: Phone,
  { mode, data, icons, colours, count = Infinity }: Options,
  clock: Clock,
  log: (line: string) => void = () => {},
): Promise<number> {
  let player: Player | undefined;
  let battles = 0;
  let battling = false;
  let known = clock.now();
  let otherSince: number | undefined;
  let frames = 0;
  const kept: Image[] = [];
  let party: (string | null)[] = [];
  let fainted = new Set<number>();
  let sent = 0;

  // What the switch prompt showing was decided to be answered with, once, on its first frame: who fainted and who goes
  // in. Decided again on a later frame, the first tap having moved `sent`, a retap would go to another card.
  let prompt:
    { fainted: number | undefined; next: number | undefined; card: Point | undefined; answered: boolean } | undefined;
  let theirShields = 2;

  // The colour of the bubbles the minigame now showing draws, that of the move last thrown, where its type is known.
  let bubbleColour: Colour | undefined;
  let seen: Sighting = { own: null, opponent: null, moves: new Map() };
  let readAt = -Infinity;
  let said = '';

  while (battles < count) {
    const frame = phone.frame();

    if (!frame) {
      await clock.sleep(20);
      continue;
    }

    // Made for the frames' size, which every frame of a run shares, and made again for each battle.
    player ??= new Player(frame);

    if (frames++ % 10 === 0 && kept.at(-1) !== frame) {
      kept.push(frame);
      kept.splice(0, kept.length - KEPT_FRAMES);
    }

    const state = recognise(frame);

    if (state !== 'other') {
      if (!battling) {
        log(`battle ${battles + 1} started`);
        player = new Player(frame);
        seen = { own: null, opponent: null, moves: new Map() };
        readAt = -Infinity;
        fainted = new Set();
        sent = 0;
        theirShields = 2;
      }

      // Never more than the last count, a shield once spent staying spent: a banner over the HUD reads as one held.
      if (state === 'battle' || state === 'charged') {
        theirShields = Math.min(theirShields, opponentShields(frame));
      }

      // The Pokémon sent in next has moves of its own, and perhaps a name.
      if (state === 'switch') {
        seen = { ...seen, own: null, moves: new Map() };
        readAt = -Infinity;
      }

      if ((state === 'battle' || state === 'charged') && !player.minigame && clock.now() - readAt >= READ_MS) {
        readAt = clock.now();
        seen = merge(seen, await readBattle(frame, data));
      }

      // A nickname in the HUD leaves the species to the party: whichever slot is out.
      const slot = activeOf(data, party, fainted, seen.moves.values(), sent);
      const own = seen.own ?? (slot === undefined ? null : (party[slot] ?? null));
      const bait = theirShields > 0;
      const best = bestButton(data, seen.moves, typesOf(data, own), typesOf(data, seen.opponent), bait);
      const shield = shouldShield(data, own, seen.opponent);
      const moves = [...seen.moves.values()].join(', ') || '?';
      const throwing = (best !== undefined && seen.moves.get(best)) || 'the first ready';
      const saying = `${own ?? '?'} against ${seen.opponent ?? '?'} (${theirShields} shields): ${moves}, ${bait ? 'baiting with' : 'throwing'} ${throwing}, ${shield ? '' : 'not '}shielding`;

      if (saying !== said) {
        log(saying);
        said = saying;
      }

      battling = true;
      known = clock.now();
      prompt = state === 'switch' ? prompt : undefined;
      otherSince = undefined;

      // The switch prompt's cards are the slots not fainted bar the one out, in party order.
      if (state === 'switch' && !prompt) {
        const out = new Set([...fainted, ...(slot === undefined ? [] : [slot])]);
        const next = nextOut(data, party, out, seen.opponent);
        const measured =
          next === undefined ? undefined : SWITCH_CARDS[[...party.keys()].filter((i) => !out.has(i)).indexOf(next)];
        const card = measured && place(measured, BOTTOM, frame);

        prompt = { fainted: slot, next, card, answered: false };
      }

      const ready = state === 'charged' ? readyButtons(frame) : [];
      const card = prompt?.card;
      const bubbles = player.minigame && bubbleColour ? bubbleSwipes(frame, bubbleColour) : undefined;
      const action = player.next(state, clock.now(), {
        ready,
        best,
        shield,
        ...(card && { card }),
        ...(bubbles && { bubbles }),
      });

      if (action.kind === 'swipe') {
        await phone.swipe(action.from, action.to, action.ms);
      } else if (action.kind === 'tap') {
        log(`tap ${action.what}`);
        await phone.tap(action.at);

        if (action.what === 'charged') {
          const type = data.combat[seen.moves.get(action.at[0]) ?? '']?.type;
          bubbleColour = type === undefined ? undefined : colours[type];
        }

        // Once a prompt: a retap, a second later, is the same answer to it.
        if (action.what === 'switch' && prompt && !prompt.answered) {
          prompt.answered = true;

          if (prompt.fainted !== undefined) {
            fainted.add(prompt.fainted);
          }

          if (prompt.next !== undefined) {
            sent = prompt.next;
            log(`sending in ${party[prompt.next] ?? '?'}`);
          }
        }
      } else {
        await clock.sleep(20);
      }

      continue;
    }

    player.next(state, clock.now());
    otherSince ??= clock.now();

    if (clock.now() - otherSince >= MENU_AFTER_MS) {
      const screenshot = await phone.screenshot();
      const read = await readMenu(screenshot, { ...mode, result: battling });

      // GO Battle League never comes back to the map of itself once a battle has been played: a Poké Ball there is the
      // reward encounter's, which is left for the player rather than tapped.
      const menu = read.screen === 'map' && mode.mode === 'gbl' && battles > 0 ? { screen: 'unknown' as const } : read;

      if (menu.screen === 'party') {
        party = readParty(screenshot, icons);
        log(`party: ${party.map((species) => species ?? '?').join(', ')}`);
      }

      // A scroll is not progress: a tab already at its foot whose portraits go unmatched would be scrolled for ever, so
      // the scrolls count towards `LOST_MS` from the tap that opened the tab. Matchmaking is: it is waited out, however
      // long GO Battle League takes to find an opponent.
      if ('swipe' in menu) {
        if (clock.now() - known > LOST_MS) {
          throw new Lost(kept);
        }

        log(`${menu.screen}: scroll`);
        await phone.swipe(...menu.swipe, SCROLL_MS);
      } else if (menu.screen === 'matchmaking') {
        known = clock.now();
      } else if (menu.screen === 'no-battle') {
        log('no-battle: a reward to collect');
        return battles;
      } else if ('tap' in menu) {
        log(`${menu.screen}: tap`);
        await phone.tap(menu.tap);
        known = clock.now();
      }

      if (menu.screen !== 'unknown') {
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
