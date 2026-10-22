import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { Player, TAPS, type Action, type Point } from './play.mts';
import { readyButtons, recognise, type State } from './recognise.mts';
import { decodeFrames } from './stream.mts';

/** Where the charged-move buttons sit: one move's centred, two moves' either side, as `readyButtons` reports them. */
const LEFT: Point = [0.31, 0.889];
const CENTRE: Point = [0.499, 0.889];
const RIGHT: Point = [0.69, 0.889];

/**
 * The actions for a run of states, a frame every 33ms — 30 a second, as the stream sends them — with the one button of
 * a Pokémon with one charged move lit on every `charged` frame.
 */
function play(states: readonly State[], player = new Player(), from = 0): Action[] {
  return states.map((state, i) => player.next(state, from + i * 33, state === 'charged' ? [CENTRE] : []));
}

const taps = (actions: readonly Action[]) => actions.filter((action) => action.kind === 'tap');

const swipes = (actions: readonly Action[]) => actions.flatMap((action) => (action.kind === 'swipe' ? [action] : []));

/** Whether a point lies on the bench's switch buttons, or on any of the charged-move buttons. */
const onBench = ([x, y]: Point) => x > 0.8 && y > 0.53 && y < 0.7;
const onButton = ([x, y]: Point) =>
  [LEFT, CENTRE, RIGHT].some(([bx, by]) => Math.hypot(x - bx, (y - by) * (760 / 360)) < 0.12);

test('swipes through the fight, clear of the bench and the charged-move buttons', () => {
  const actions = swipes(play(Array(10).fill('battle')));

  expect(actions).toHaveLength(10);

  for (const { from, to } of actions) {
    expect([from, to].some(onBench)).toBe(false);
    expect([from, to].some(onButton)).toBe(false);
  }
});

test('throws a charged move once it has held for two frames, and once only', () => {
  const actions = play(Array(20).fill('charged'));

  expect(actions[0]).toEqual({ kind: 'wait' });
  expect(taps(actions)).toEqual([{ kind: 'tap', at: CENTRE, what: 'charged' }]);
});

test('throws again if the button is still lit a second later', () => {
  const actions = play(Array(40).fill('charged'));

  expect(taps(actions)).toHaveLength(2);
});

test('of two charged moves, throws the one that lit first', () => {
  const player = new Player();

  player.next('charged', 0, [RIGHT]);
  const action = player.next('charged', 33, [LEFT, RIGHT]);

  expect(action).toEqual({ kind: 'tap', at: RIGHT, what: 'charged' });
});

test('of two charged moves lit together, throws the left', () => {
  const player = new Player();

  player.next('charged', 0, [LEFT, RIGHT]);
  const action = player.next('charged', 33, [LEFT, RIGHT]);

  expect(action).toEqual({ kind: 'tap', at: LEFT, what: 'charged' });
});

test('fights on while only a weaker move is lit, and throws the best once it lights', () => {
  const player = new Player();

  player.next('charged', 0, [RIGHT], LEFT[0]);
  const held = player.next('charged', 33, [RIGHT], LEFT[0]);

  expect(held.kind).toBe('swipe');
  expect(player.next('charged', 66, [LEFT, RIGHT], LEFT[0])).toEqual({ kind: 'tap', at: LEFT, what: 'charged' });
});

test('forgets when a button lit once it goes out', () => {
  const player = new Player();

  // The right lights, then goes out as it is thrown; later the left lights, then the right again beside it.
  player.next('charged', 0, [RIGHT]);
  player.next('battle', 33, []);
  player.next('charged', 2000, [LEFT]);
  player.next('charged', 2033, [LEFT, RIGHT]);

  expect(player.next('charged', 3100, [LEFT, RIGHT])).toEqual({ kind: 'tap', at: LEFT, what: 'charged' });
});

test('swipes the lower field after a charged move, until the throw plays', () => {
  const player = new Player();
  const fight = swipes(play(Array(4).fill('battle'), player));
  const minigame = swipes(play(['charged', 'charged', ...Array<State>(40).fill('battle')], player, 1000));
  const after = swipes(play(['other', ...Array<State>(4).fill('battle')], player, 3000));

  const lowest = (actions: readonly { from: Point; to: Point }[]) =>
    Math.max(...actions.flatMap(({ from, to }) => [from[1], to[1]]));

  expect(lowest(fight)).toBeLessThan(0.55);
  expect(lowest(minigame)).toBeGreaterThan(0.85);
  expect(lowest(after)).toBeLessThan(0.55);
});

test('swipes nothing for a moment after a charged move is tapped', () => {
  const player = new Player();
  const tapped = play(['charged', 'charged'], player);
  const after = play(Array<State>(30).fill('battle'), player, 66);
  const waited = after.findIndex((action) => action.kind === 'swipe');

  expect(taps(tapped)).toHaveLength(1);
  expect(after.slice(0, waited).every((action) => action.kind === 'wait')).toBe(true);
  expect(66 + waited * 33 - 33).toBeGreaterThanOrEqual(700);
});

test.each([
  ['shield', 3],
  ['switch', 3],
] as const)('answers the %s prompt once it has held for %i frames', (state, frames) => {
  const actions = play(Array(20).fill(state));

  expect(actions.slice(0, frames - 1).every((action) => action.kind === 'wait')).toBe(true);
  expect(taps(actions)).toEqual([{ kind: 'tap', at: TAPS[state], what: state }]);
});

test('leaves a declined shield prompt to run out, and does not swipe at it', () => {
  const player = new Player();
  const actions = Array.from({ length: 20 }, (_, i) => player.next('shield', i * 33, [], undefined, false));

  expect(actions.every((action) => action.kind === 'wait')).toBe(true);
});

test('ignores a prompt that shows for a frame as it slides in', () => {
  expect(taps(play(['battle', 'switch', 'battle', 'battle']))).toEqual([]);
});

test('does nothing on any other screen', () => {
  expect(play(Array(10).fill('other')).every((action) => action.kind === 'wait')).toBe(true);
});

/**
 * A recording does not answer the taps made over it: the button in `charge.h264` stays lit for 38 frames, until the
 * person playing threw it, so a second tap a second after the first is the retry doing its job. What the replay does
 * show is the first tap landing on the button's second lit frame, and none following sooner than a second apart.
 */
test('throws the charged move in a recorded battle as soon as it is ready', async () => {
  const player = new Player();
  const timed: { action: Action; state: State; at: number }[] = [];
  let i = 0;

  for await (const frame of decodeFrames(
    createReadStream(fileURLToPath(new URL('fixtures/charge.h264', import.meta.url))),
  )) {
    const state = recognise(frame);
    const at = i++ * 33;

    timed.push({ action: player.next(state, at, readyButtons(frame)), state, at });
  }

  const tapped = timed.filter(({ action }) => action.kind === 'tap');
  const lit = timed.filter(({ state }) => state === 'charged');

  expect(tapped.map(({ action }) => action)).toContainEqual({ kind: 'tap', at: CENTRE, what: 'charged' });
  expect(tapped[0]?.at).toBe(lit[1]?.at);
  expect(tapped.every(({ at }, n) => n === 0 || at - (tapped[n - 1]?.at ?? 0) >= 1000)).toBe(true);
});
