/**
 * What to do about each frame of a battle, given which state `recognise` read it as: the basic strategy, with no notion
 * of energy, types or the opponent. Swipe for fast moves, throw a charged move the moment one is ready, take every
 * shield offered and send in whoever comes first.
 *
 * Pure, so that every rule here is tested without a phone: `next` takes the state and the time and answers an action,
 * which the caller performs. Positions are fractions of the screen, as everywhere else the phone is driven.
 *
 * Measured on a supervised battle against Candela, which the strategy won: a swipe's touch fires a fast move just as a
 * tap does, so one action serves both the fight and the charged-move minigame, whose bubbles a swipe pops on the way
 * through.
 */

import { type State } from './recognise.mts';

export type Point = readonly [x: number, y: number];

export type Action =
  | { kind: 'swipe'; from: Point; to: Point; ms: number }
  | { kind: 'tap'; at: Point; what: 'charged' | 'shield' | 'switch' }
  | { kind: 'wait' };

/**
 * Where each prompt is answered, measured on the footage at 360×760: the charged-move button's centre, the Protect
 * Shield under its prompt, and the first of the switch prompt's two cards. When one Pokémon is left the card is centred
 * instead and this misses it, which costs nothing — the game sends that one in when its countdown runs out.
 */
export const TAPS = {
  charged: [0.499, 0.889],
  shield: [0.5, 0.82],
  switch: [0.33, 0.87],
} as const satisfies Record<string, Point>;

/**
 * The fight's swipe, across the middle of the field and back. It stays clear of what a touch there would press instead:
 * the bench's switch buttons down the right edge, at x > 0.8 between y 0.53 and 0.70, and the charged-move button at the
 * bottom.
 */
const FIGHT: readonly (readonly [Point, Point])[] = [
  [
    [0.15, 0.42],
    [0.7, 0.5],
  ],
  [
    [0.7, 0.5],
    [0.15, 0.42],
  ],
];

/**
 * The minigame's swipes, row after row across the lower two thirds and back. Its bubbles are wherever the move puts
 * them — Shadow Sneak's in the middle, Psychic's between y 0.55 and 0.95 — and the fight's one band reached only
 * `NICE!` against Psychic's. Nothing is pressed by accident here: the minigame draws neither the bench nor the button.
 */
const MINIGAME: readonly (readonly [Point, Point])[] = [0.4, 0.52, 0.64, 0.76, 0.88].flatMap((y, row) => {
  const ends: [Point, Point] = [
    [0.05, y],
    [0.95, y + 0.04],
  ];

  return [row % 2 === 0 ? ends : ([ends[1], ends[0]] as [Point, Point])];
});

/** How long one swipe takes, in milliseconds: short, so a fast move fires about six times a second. */
const SWIPE_MS = 80;

/**
 * Consecutive frames a state has to hold before a tap answers it. A prompt sliding in or out matches for a frame or two
 * on its own — two such frames turned up in 6,364 of a recorded battle — and a charged move is answered sooner because
 * it does not animate in.
 */
const SETTLE: Partial<Record<State, number>> = { charged: 2, shield: 3, switch: 3 };

/**
 * How long a tap is given to take before the same state is answered again, in milliseconds. The button stays lit for a
 * few frames after a charged move is thrown, and the prototype tapped it five times over 200ms where once would do.
 */
const RETAP_MS = 1000;

/**
 * How long nothing is swiped after a charged move is tapped, in milliseconds. A swipe straight after the tap looked to
 * cost the throw: in one recorded battle 20 taps threw about 8 moves, the button going dark for a few frames after each
 * tap — read as `battle`, and so swiped at — and then lighting again with nothing thrown. The minigame's bubbles take
 * longer than this to arrive, behind `Get Ready!`, so nothing is lost by waiting.
 */
const HOLD_MS = 700;

export class Player {
  #state: State | undefined;
  #streak = 0;
  #minigame = false;
  #tapped: { state: State; at: number } | undefined;
  #swipes = 0;

  /** What to do about a frame read as `state`, at `now` milliseconds. */
  next(state: State, now: number): Action {
    this.#streak = state === this.#state ? this.#streak + 1 : 1;
    this.#state = state;

    // A charged move thrown is the minigame next, inside frames that read as `battle` throughout, and over once the
    // throw itself plays, which does not.
    if (state !== 'battle' && state !== 'charged') {
      this.#minigame = false;
    }

    if (state === 'battle') {
      if (this.#tapped?.state === 'charged' && now - this.#tapped.at < HOLD_MS) {
        return { kind: 'wait' };
      }

      const swipes = this.#minigame ? MINIGAME : FIGHT;
      const swipe = swipes[this.#swipes++ % swipes.length];

      return swipe ? { kind: 'swipe', from: swipe[0], to: swipe[1], ms: SWIPE_MS } : { kind: 'wait' };
    }

    if (state === 'other' || this.#streak < (SETTLE[state] ?? 0)) {
      return { kind: 'wait' };
    }

    if (this.#tapped?.state === state && now - this.#tapped.at < RETAP_MS) {
      return { kind: 'wait' };
    }

    this.#tapped = { state, at: now };

    if (state === 'charged') {
      this.#minigame = true;
    }

    return { kind: 'tap', at: TAPS[state], what: state };
  }
}
