/**
 * What to do about each frame of a battle, given which state `recognise` read it as. Swipe for fast moves, throw the
 * charged move the caller names the moment it is ready — or, where it names none, whichever is ready first — take a
 * shield offered unless the caller says not to, and send in whoever comes first. Which move is worth throwing and
 * which shield worth taking is `strategy.mts`'s to say.
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
 * Where each prompt is answered, measured on the footage at 360×760: the Protect Shield under its prompt, and the first
 * of the switch prompt's two cards. When one Pokémon is left the card is centred instead and this misses it, which
 * costs nothing — the game sends that one in when its countdown runs out. A charged move is thrown wherever its lit
 * button was found, there being one or two of them.
 */
export const TAPS = {
  shield: [0.5, 0.82],
  switch: [0.33, 0.87],
} as const satisfies Record<string, Point>;

/**
 * The fight's swipe, across the middle of the field and back. It stays clear of what a touch there would press instead:
 * the bench's switch buttons down the right edge, at x > 0.8 between y 0.53 and 0.70, and the charged-move buttons
 * along the bottom.
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

  /** When each lit charged-move button lit, by its x, for as long as it stays lit. */
  readonly #lit = new Map<number, number>();

  /** Whether the charged-move minigame is being swiped at, which nothing else should hold up. */
  get minigame(): boolean {
    return this.#minigame;
  }

  /**
   * What to do about a frame read as `state`, at `now` milliseconds. `ready` is where the frame's lit charged-move
   * buttons are, as `readyButtons` finds them. `best` is the x of the button worth throwing: while another is lit and it
   * is not, the fight goes on, the energy kept for it. Without one, of two the one that lit first is thrown, and the
   * left where they lit together. `shield` is whether a shield offered is taken: declined, the prompt is left to run
   * out.
   */
  next(state: State, now: number, ready: readonly Point[] = [], best?: number, shield = true): Action {
    this.#streak = state === this.#state ? this.#streak + 1 : 1;
    this.#state = state;

    for (const x of this.#lit.keys()) {
      if (!ready.some(([rx]) => rx === x)) {
        this.#lit.delete(x);
      }
    }

    for (const [x] of ready) {
      if (!this.#lit.has(x)) {
        this.#lit.set(x, now);
      }
    }

    // A charged move thrown is the minigame next, inside frames that read as `battle` throughout, and over once the
    // throw itself plays, which does not.
    if (state !== 'battle' && state !== 'charged') {
      this.#minigame = false;
    }

    const throwable = best === undefined ? ready : ready.filter(([x]) => x === best);

    if (state === 'battle' || (state === 'charged' && throwable.length === 0)) {
      if (this.#tapped?.state === 'charged' && now - this.#tapped.at < HOLD_MS) {
        return { kind: 'wait' };
      }

      const swipes = this.#minigame ? MINIGAME : FIGHT;
      const swipe = swipes[this.#swipes++ % swipes.length];

      return swipe ? { kind: 'swipe', from: swipe[0], to: swipe[1], ms: SWIPE_MS } : { kind: 'wait' };
    }

    if (state === 'other' || (state === 'shield' && !shield) || this.#streak < (SETTLE[state] ?? 0)) {
      return { kind: 'wait' };
    }

    if (this.#tapped?.state === state && now - this.#tapped.at < RETAP_MS) {
      return { kind: 'wait' };
    }

    if (state !== 'charged') {
      this.#tapped = { state, at: now };

      return { kind: 'tap', at: TAPS[state], what: state };
    }

    const first = [...throwable].sort(([a], [b]) => (this.#lit.get(a) ?? now) - (this.#lit.get(b) ?? now) || a - b)[0];

    if (!first) {
      return { kind: 'wait' };
    }

    this.#tapped = { state, at: now };
    this.#minigame = true;

    return { kind: 'tap', at: first, what: state };
  }
}
