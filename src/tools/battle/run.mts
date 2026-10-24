/**
 * Team Leader or GO Battle League battles one after another: `Player` through each battle, read off the stream frame by
 * frame, and `readMenu` between them, read off full screenshots, from the result round to the next USE THIS PARTY.
 *
 * Driven through `Phone` rather than `adb`, so a test can stand a scripted phone in for a real one.
 */

import { type GameData } from '../inventory/game-master.mts';
import { type Image } from '../inventory/png.mts';
import { CAPS, readMenu, type Menu, type Mode } from './menus.mts';
import { readParty, type Icon } from './party.mts';
import { BOTTOM, place } from './layout.mts';
import { Player, SWITCH_CARDS, type Point } from './play.mts';
import { bubbleSwipes, type Colour } from './minigame.mts';
import { readHealth, type Health } from './health.mts';
import { merge, readBanner, readBattle, unseen, type Sighting } from './read.mts';
import { opponentShields, ownShields, readyButtons, recognise } from './recognise.mts';
import { activeOf, bestButton, nextOut, typesOf } from './strategy.mts';
import { wouldFaint } from './damage.mts';
import { type Meta } from './meta.mts';

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
 * at a time — a banner over the HUD, the opponent's charged move — and a screenshot costs one, with OCR on top. The read
 * runs beside the battle rather than holding it up: awaited, it left the battle unplayed for as long as the screenshot
 * and OCR took after every charged move, the loop learning only then that the battle had come back.
 */
const MENU_AFTER_MS = 1_500;

/** How long a menu's tap is given to animate into the next screen before that is screenshot. */
const MENU_SETTLE_MS = 1_500;

/**
 * How many reads in a row GO Battle League's card has to show BATTLE greyed out before the run stops for its reward.
 * One was taken on a Pixel 8 Pro as the Battle tab slid in, 1.5s after the main menu's tap, its BATTLE not yet green:
 * the run stopped with a set there to play. A read a settle later finds it lit, where a reward is waiting it does not.
 */
const NO_BATTLE_READS = 2;

/** How long the Battle tab's scroll takes, in milliseconds: long enough to be a drag rather than a tap. */
const SCROLL_MS = 400;

/**
 * How often the battle's names and move labels are read again, in milliseconds. A read holds the loop up for about
 * 220ms, a fast move's worth, and what it reads changes only when a Pokémon on either side does.
 */
const READ_MS = 3_000;

/**
 * How long after a shield prompt the banner naming the move is looked for, and how often, in milliseconds. The banner
 * follows the move's animation, a shield's included: 2.4s after a prompt for Groudon's Solar Beam, past 3.9s for a
 * Rhyperior's, the wall still up at the last of twelve reads. Read beside the battle rather than holding it up, as the
 * menu is, the battle having often come back by then.
 */
const BANNER_MS = 8_000;
const BANNER_EVERY_MS = 300;

/** Frames kept for a run that gets lost, about the last three seconds of it at one frame in ten. */
const KEPT_FRAMES = 10;

/** A menu read run beside the battle: `done` once its screenshot has been taken and read, or has failed. */
interface Reading {
  done?: { screenshot: Image; menu: Menu } | { error: unknown };
}

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

  /**
   * What GO Battle League's players run in the league being played, which narrows the opponent's charged moves to
   * theirs for shielding and for who goes in. Absent, as in Training, every move its species can hold is allowed for.
   */
  meta?: Meta | null;
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
  { mode, data, icons, colours, meta, count = Infinity }: Options,
  clock: Clock,
  log: (line: string) => void = () => {},
): Promise<number> {
  let player: Player | undefined;
  let battles = 0;
  let battling = false;
  let known = clock.now();
  let otherSince: number | undefined;
  let noBattle = 0;

  // The menu read under way, if any: settled once its screenshot is taken and read, or failed.
  let reading: Reading | undefined;
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
  let ourShields = 2;

  // The league's CP cap, which a CP read over it is a misread of: Training's by its league, GO Battle League's as its
  // party screen states it. `undefined` until known, and then every shield is taken.
  let cap: number | null | undefined = mode.mode === 'training' ? CAPS[mode.league] : undefined;

  // Each side's HP as last read, a bar not drawn on this frame keeping what an earlier one showed. The opponent's is
  // the last one's until a newcomer's bar is drawn, which the camera does on most frames.
  let health: Health = { own: null, opponent: null };

  // The colour of the bubbles the minigame now showing draws, that of the move last thrown, where its type is known.
  let bubbleColour: Colour | undefined;
  let seen: Sighting = unseen();
  let readAt = -Infinity;

  // The charged moves each opponent has been seen to use this battle, by species, off the banner after each prompt.
  let theirMoves = new Map<string, Set<string>>();
  let bannerUntil = -Infinity;
  let bannerAt = -Infinity;
  let bannerReading = false;
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

    // The move just thrown at us, named once it lands, whether or not the shield was taken: the banner is drawn over the
    // battle and over the frames that read as neither, so it is looked for on both.
    if (state === 'shield') {
      bannerUntil = clock.now() + BANNER_MS;
    } else if (
      seen.opponent &&
      !bannerReading &&
      !player.minigame &&
      clock.now() < bannerUntil &&
      clock.now() - bannerAt >= BANNER_EVERY_MS
    ) {
      bannerAt = clock.now();
      bannerReading = true;

      // Kept in the battle's own record, which a read finishing after the next battle has begun leaves alone.
      const { opponent } = seen;
      const moves = theirMoves;

      void readBanner(frame, data, seen)
        .then((move) => {
          if (move) {
            const known = moves.get(opponent) ?? new Set();
            moves.set(opponent, known.add(move));
            bannerUntil = -Infinity;
            log(`${opponent} has ${[...known].join(' and ')}`);
          }
        })
        .catch((error: unknown) => log(`banner not read: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => (bannerReading = false));
    }

    if (state !== 'other') {
      if (!battling) {
        log(`battle ${battles + 1} started`);
        player = new Player(frame);
        seen = unseen();
        readAt = -Infinity;
        fainted = new Set();
        sent = 0;
        theirShields = 2;
        ourShields = 2;
        health = { own: null, opponent: null };
        theirMoves = new Map();
        bannerUntil = -Infinity;
      }

      // Never more than the last count, a shield once spent staying spent: a banner over the HUD reads as one of theirs
      // held, and leaves ours unread.
      if (state === 'battle' || state === 'charged') {
        theirShields = Math.min(theirShields, opponentShields(frame));
        ourShields = Math.min(ourShields, ownShields(frame) ?? ourShields);
      }

      // The Pokémon sent in next has moves of its own, perhaps a name, and its own CP and HP.
      if (state === 'switch') {
        seen = { ...seen, own: null, ownCp: null, moves: new Map() };
        health = { ...health, own: null };
        readAt = -Infinity;
      }

      // Read at the shield prompt as well as through the fight: the prompt hides the HUD, but not the bars.
      if (state !== 'switch' && !player.minigame) {
        const read = readHealth(frame);

        health = { own: read.own ?? health.own, opponent: read.opponent ?? health.opponent };
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

      // Taken only where the opponent's hardest charged move would faint us: a hit we survive is eaten, the shield kept
      // for one we would not. A league whose cap went unread takes every shield, as anything else unknown does.
      const shield =
        ourShields > 0 &&
        (cap === undefined ||
          wouldFaint(
            data,
            { species: own, cp: seen.ownCp },
            { species: seen.opponent, cp: seen.opponentCp },
            health.own,
            cap,
            meta,
            theirMoves.get(seen.opponent ?? ''),
          ));
      const moves = [...seen.moves.values()].join(', ') || '?';
      const throwing = (best !== undefined && seen.moves.get(best)) || 'the first ready';
      const side = (cp: number | null, hp: number | null) =>
        `CP ${cp ?? '?'} at ${hp === null ? '?' : Math.round(hp * 100)}%`;
      const saying = `${own ?? '?'} against ${seen.opponent ?? '?'} (${theirShields} shields): ${moves}, ${bait ? 'baiting with' : 'throwing'} ${throwing}, ${shield ? '' : 'not '}shielding; ${side(seen.ownCp, health.own)} against ${side(seen.opponentCp, health.opponent)}, ${ourShields} of our shields left`;

      if (saying !== said) {
        log(saying);
        said = saying;
      }

      battling = true;
      known = clock.now();
      prompt = state === 'switch' ? prompt : undefined;
      otherSince = undefined;

      // Whatever the read under way finds, it is of a screen the battle has since come back from.
      reading = undefined;

      // The switch prompt's cards are the slots not fainted bar the one out, in party order.
      if (state === 'switch' && !prompt) {
        const out = new Set([...fainted, ...(slot === undefined ? [] : [slot])]);
        const next = nextOut(data, party, out, seen.opponent, meta);
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

    if (clock.now() - otherSince >= MENU_AFTER_MS && !reading) {
      const started: Reading = {};
      const result = battling;
      reading = started;

      void (async () => {
        const screenshot = await phone.screenshot();

        return { screenshot, menu: await readMenu(screenshot, { ...mode, result }) };
      })().then(
        (done) => (started.done = done),
        (error: unknown) => (started.done = { error }),
      );
    }

    const done = reading?.done;

    if (done) {
      reading = undefined;

      if ('error' in done) {
        throw done.error;
      }

      const { screenshot, menu: read } = done;

      // GO Battle League never comes back to the map of itself once a battle has been played: a Poké Ball there is the
      // reward encounter's, which is left for the player rather than tapped.
      const menu = read.screen === 'map' && mode.mode === 'gbl' && battles > 0 ? { screen: 'unknown' as const } : read;

      // Greyed out read after read, not once among others.
      if (menu.screen !== 'no-battle') {
        noBattle = 0;
      }

      if (menu.screen === 'party') {
        party = readParty(screenshot, icons);
        cap = mode.mode === 'training' ? CAPS[mode.league] : menu.cap;
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
      } else if (menu.screen === 'no-battle' && ++noBattle >= NO_BATTLE_READS) {
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
