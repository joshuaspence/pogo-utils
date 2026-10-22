/**
 * The choice of move against the vended game master, on the pairings the committed footage holds: Kyogre's Hydro Pump
 * and Avalanche, against the Entei and the Salamence it met.
 */

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { type GameData } from '../inventory/game-master.mts';
import { activeOf, bestButton, damage, shouldShield, typesOf } from './strategy.mts';

const DATA = JSON.parse(
  readFileSync(new URL('../inventory/fixtures/game-master.json', import.meta.url), 'utf8'),
) as GameData;

const KYOGRE = new Map([
  [0.31, 'Hydro Pump'],
  [0.69, 'Avalanche'],
]);

test('a species has the types its forms agree on', () => {
  expect(typesOf(DATA, 'Kyogre')).toEqual(['Water']);
  expect(typesOf(DATA, 'Salamence')).toEqual(['Dragon', 'Flying']);
  expect(typesOf(DATA, 'Marowak'), 'an Alolan Marowak is Fire and Ghost').toBe(null);
  expect(typesOf(DATA, null)).toBe(null);
});

test('damage is power, times STAB, times what each of the defender’s types makes of it', () => {
  expect(damage(DATA, 'Hydro Pump', ['Water'], ['Fire'])).toBeCloseTo(130 * 1.2 * 1.6);
  expect(damage(DATA, 'Avalanche', ['Water'], ['Dragon', 'Flying'])).toBeCloseTo(90 * 1.6 * 1.6);
  expect(damage(DATA, 'Avalanche', null, null), 'unknowns are neutral').toBe(90);
  expect(damage(DATA, 'Not A Move', null, null)).toBe(0);
});

test('the best button is the move that hits hardest against this opponent', () => {
  const kyogre = typesOf(DATA, 'Kyogre');

  expect(bestButton(DATA, KYOGRE, kyogre, typesOf(DATA, 'Entei')), 'Hydro Pump into Entei').toBe(0.31);
  expect(bestButton(DATA, KYOGRE, kyogre, typesOf(DATA, 'Salamence')), 'Avalanche into Salamence').toBe(0.69);
  expect(bestButton(DATA, KYOGRE, null, null), 'Hydro Pump on power alone').toBe(0.31);
});

test('the slot out is the first not fainted whose species can hold the moves read', () => {
  const party = ['Latias', 'Mamoswine', 'Giratina'];
  const none = new Set<number>();

  expect(activeOf(DATA, party, none, []), 'the lead, before anything is read').toBe(0);
  expect(activeOf(DATA, party, new Set([0]), []), 'the first of the rest after a faint').toBe(1);
  expect(activeOf(DATA, party, none, ['Avalanche']), 'Latias cannot hold Avalanche; Mamoswine can').toBe(1);
  expect(activeOf(DATA, party, none, ['Shadow Sneak'])).toBe(2);
  expect(activeOf(DATA, [null, 'Mamoswine'], none, ['Shadow Sneak']), 'an unread card cannot be ruled out').toBe(0);
  expect(activeOf(DATA, party, none, ['Hydro Pump']), 'none of them').toBe(undefined);
  expect(activeOf(DATA, party, new Set([0, 1, 2]), [])).toBe(undefined);
  expect(activeOf(DATA, [], none, []), 'a run started mid-battle, past the party screen').toBe(undefined);
});

test('a shield is taken unless none of the opponent’s charged moves is super effective', () => {
  expect(shouldShield(DATA, 'Latias', 'Glaceon'), 'Avalanche into Dragon').toBe(true);
  expect(shouldShield(DATA, 'Giratina', 'Sneasel'), 'Foul Play into Ghost').toBe(true);
  expect(shouldShield(DATA, 'Kyogre', 'Entei'), 'nothing of Entei’s beats Water').toBe(false);
  expect(shouldShield(DATA, 'Latias', 'Entei')).toBe(false);
  expect(shouldShield(DATA, null, 'Entei'), 'our species unknown').toBe(true);
  expect(shouldShield(DATA, 'Kyogre', null), 'theirs unknown').toBe(true);
  expect(shouldShield(DATA, 'Marowak', 'Entei'), 'our types unknown, its forms disagreeing').toBe(true);
});

test('no button is best while one of a pair has no move read under it', () => {
  expect(bestButton(DATA, new Map([[0.69, 'Avalanche']]), null, null)).toBe(undefined);
  expect(bestButton(DATA, new Map(), null, null)).toBe(undefined);
  expect(bestButton(DATA, new Map([[0.499, 'Shadow Sneak']]), null, null)).toBe(0.499);
});
