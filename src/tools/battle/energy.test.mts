/**
 * The opponent's energy counted off our bar, on a Great League Medicham against our Registeel: Psycho Cut takes 2 of
 * Registeel's 132 HP a hit and gains 9, Counter takes 6 and gains 6, so the size of the steps says which it has.
 */

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { type GameData } from '../inventory/game-master.mts';
import { Energy, type Matchup } from './energy.mts';
import { type Meta } from './meta.mts';

const DATA = JSON.parse(
  readFileSync(new URL('../inventory/fixtures/game-master.json', import.meta.url), 'utf8'),
) as GameData;

const MATCHUP: Matchup = {
  own: { species: 'Registeel', cp: 1497 },
  opponent: { species: 'Medicham', cp: 1497 },
  cap: 1500,
};

const PSYCHO_CUT = 2 / 132;
const COUNTER = 6 / 132;

/** Our bar read every `every` ms through `hits` seconds, a hit taking `step` off it each second, from `from`. */
function fight(energy: Energy, { from = 1, step, hits, start = 0, every = 100 }: Fight, matchup = MATCHUP): number {
  let hp = from;
  let at = start;

  for (let hit = 0; hit < hits; hit++) {
    for (let t = 0; t < 1000; t += every) {
      energy.read(at + t, hp, matchup);
    }

    hp -= step;
    at += 1000;
  }

  energy.read(at, hp, matchup);

  return hp;
}

interface Fight {
  from?: number;
  step: number;
  hits: number;
  start?: number;
  every?: number;
}

test('nothing has landed yet: no energy, counted by the fast move gaining it fastest', () => {
  const energy = new Energy(DATA);

  energy.read(0, 1, MATCHUP);

  expect(energy.estimate(MATCHUP)).toStrictEqual({ energy: 0, fast: 'Psycho Cut', gain: 9 });
});

test('or by the one PvPoke recommends, where it ranks the species', () => {
  const meta: Meta = {
    cup: 'all',
    cap: 1500,
    movesets: new Map([['Medicham', { fast: 'Counter', fastMoves: ['Psycho Cut', 'Counter'], chargedMoves: [] }]]),
  };
  const energy = new Energy(DATA, meta);

  energy.read(0, 1, MATCHUP);

  expect(energy.estimate(MATCHUP)?.fast).toBe('Counter');
});

test.each([
  ['Psycho Cut', PSYCHO_CUT, 9, 63],
  ['Counter', COUNTER, 6, 42],
])('seven hits of %s are told by their size and gain %s each', (fast, step, gain, total) => {
  const energy = new Energy(DATA);

  fight(energy, { step, hits: 7 });

  expect(energy.estimate(MATCHUP)).toStrictEqual({ energy: total, fast, gain });
});

test('hits run together between readings are counted by the step measured before them', () => {
  const energy = new Energy(DATA);
  const hp = fight(energy, { step: COUNTER, hits: 3 });

  // Four more, two between each reading: no clean step among them, but the HP they took is four of the three's.
  energy.read(5000, hp - 2 * COUNTER, MATCHUP);
  energy.read(7000, hp - 4 * COUNTER, MATCHUP);

  expect(energy.estimate(MATCHUP)?.energy).toBe(42);
});

test('no more than a full bar of energy, however many hits land', () => {
  const energy = new Energy(DATA);

  fight(energy, { step: PSYCHO_CUT, hits: 15 });

  expect(energy.estimate(MATCHUP)?.energy).toBe(100);
});

test('what is lost across a pause is no fast move’s', () => {
  const energy = new Energy(DATA);
  const hp = fight(energy, { step: COUNTER, hits: 2 });

  energy.pause();
  energy.read(5000, hp - 0.4, MATCHUP);
  energy.read(5100, hp - 0.4, MATCHUP);

  expect(energy.estimate(MATCHUP)?.energy).toBe(12);
});

test('a throw spends the cheapest charged move it is allowed for, from what it had', () => {
  const energy = new Energy(DATA);
  const hp = fight(energy, { step: PSYCHO_CUT, hits: 10 });

  // 90, less Power-Up Punch's 35, the cheapest of Ice Punch, Psychic, Dynamic Punch and Power-Up Punch.
  energy.threw(MATCHUP);
  expect(energy.estimate(MATCHUP)?.energy).toBe(55);

  fight(energy, { from: hp, step: PSYCHO_CUT, hits: 2, start: 20_000 });
  expect(energy.estimate(MATCHUP)?.energy).toBe(73);
});

test('its energy is kept while it is out, and a drop across our switch is not a hit', () => {
  const energy = new Energy(DATA);
  const azumarill: Matchup = { ...MATCHUP, own: { species: 'Azumarill', cp: 1499 } };

  fight(energy, { step: COUNTER, hits: 3 });
  energy.read(4000, 0.8, azumarill);
  energy.read(4100, 0.8, azumarill);

  expect(energy.estimate(azumarill)?.energy).toBe(18);
  expect(energy.estimate({ ...MATCHUP, opponent: { species: 'Registeel', cp: 1497 } })?.energy, 'a newcomer').toBe(0);
});

test('nothing is counted for an opponent not named, nor HP lost that nothing says how many hits held', () => {
  const energy = new Energy(DATA);
  const unnamed: Matchup = { ...MATCHUP, opponent: { species: null, cp: 1497 } };
  const uncapped: Matchup = { ...MATCHUP, opponent: { species: 'Medicham', cp: null }, cap: null };

  energy.read(0, 1, unnamed);
  expect(energy.estimate(unnamed)).toBe(null);

  // Read 2.5s apart, so no clean step, and with Medicham's CP unread and no cap to take it as, no build to say what a
  // hit takes.
  energy.read(0, 1, uncapped);
  energy.read(2500, 0.9, uncapped);
  expect(energy.estimate(uncapped)).toBe(null);
});

test('the banner settles what a throw cost: the move named rather than the cheapest', () => {
  const energy = new Energy(DATA);
  const hp = fight(energy, { step: PSYCHO_CUT, hits: 10 });

  energy.threw(MATCHUP);
  fight(energy, { from: hp, step: PSYCHO_CUT, hits: 2, start: 20_000 });

  // 90 less Dynamic Punch's 45 rather than Power-Up Punch's 35, and the two hits since.
  energy.named('Medicham', 'Dynamic Punch');
  expect(energy.estimate(MATCHUP)?.energy).toBe(63);

  energy.named('Medicham', 'Psychic');
  expect(energy.estimate(MATCHUP)?.energy, 'a throw is settled once').toBe(63);
});

test('a move named that cost more than was counted leaves nothing: the count was short', () => {
  const energy = new Energy(DATA);

  fight(energy, { step: PSYCHO_CUT, hits: 4 });
  energy.threw(MATCHUP);
  energy.named('Medicham', 'Psychic');

  expect(energy.estimate(MATCHUP)?.energy).toBe(0);
});

test('once both of its moves have been seen, a throw is the cheaper of them', () => {
  const energy = new Energy(DATA);

  fight(energy, { step: PSYCHO_CUT, hits: 10 });
  energy.threw(MATCHUP, new Set(['Ice Punch', 'Psychic']));

  expect(energy.estimate(MATCHUP)?.energy, '90 less Ice Punch’s 40').toBe(50);
});

test('an opponent CP unread is counted as the cap', () => {
  const unread: Matchup = { ...MATCHUP, opponent: { species: 'Medicham', cp: null } };
  const atCap: Matchup = { ...MATCHUP, opponent: { species: 'Medicham', cp: 1500 } };

  const estimate = (matchup: Matchup) => {
    const energy = new Energy(DATA);

    // Read 2.5s apart, so no clean step: what a hit takes is the model's, built at the cap.
    energy.read(0, 1, matchup);
    energy.read(2500, 0.9, matchup);

    return energy.estimate(matchup);
  };

  expect(estimate(unread)).not.toBe(null);
  expect(estimate(unread)).toStrictEqual(estimate(atCap));
});

test('steps measured before a CP was read do not stop later ones from telling the fast move', () => {
  const energy = new Energy(DATA);
  const unread: Matchup = { ...MATCHUP, opponent: { species: 'Medicham', cp: null } };

  // Counter's steps with Medicham's CP not yet read, which no build can check, and then with it read.
  const hp = fight(energy, { step: COUNTER, hits: 3 }, unread);
  fight(energy, { from: hp, step: COUNTER, hits: 3, start: 5000 });

  expect(energy.estimate(MATCHUP)?.fast).toBe('Counter');
});
