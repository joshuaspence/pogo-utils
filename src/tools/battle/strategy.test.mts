/**
 * The choice of move against the vended game master, on the pairings the committed footage holds: Kyogre's Hydro Pump
 * and Avalanche, against the Entei and the Salamence it met.
 */

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { type GameData } from '../inventory/game-master.mts';
import { type Meta } from './meta.mts';
import { activeOf, bestButton, chargedOf, damage, nextOut, shouldShield, typesOf } from './strategy.mts';

const DATA = JSON.parse(
  readFileSync(new URL('../inventory/fixtures/game-master.json', import.meta.url), 'utf8'),
) as GameData;

/** A meta in which `species` is run with `chargedMoves` alone. */
const metaOf = (species: string, chargedMoves: string[]): Meta => ({
  cup: 'all',
  cap: 2500,
  movesets: new Map([[species, { fast: '', fastMoves: [], chargedMoves }]]),
});

const KYOGRE = new Map([
  [0.31, 'Hydro Pump'],
  [0.69, 'Avalanche'],
]);

test('a species has every typing its forms have', () => {
  expect(typesOf(DATA, 'Kyogre')).toEqual([['Water']]);
  expect(typesOf(DATA, 'Salamence')).toEqual([['Dragon', 'Flying']]);
  expect(typesOf(DATA, 'Marowak'), 'an Alolan Marowak is Fire and Ghost').toEqual([['Fire', 'Ghost'], ['Ground']]);
  expect(typesOf(DATA, null)).toEqual([]);
});

test('damage is power, times STAB, times what each of the defender’s types makes of it', () => {
  expect(damage(DATA, 'Hydro Pump', [['Water']], [['Fire']])).toBeCloseTo(130 * 1.2 * 1.6);
  expect(damage(DATA, 'Avalanche', [['Water']], [['Dragon', 'Flying']])).toBeCloseTo(90 * 1.6 * 1.6);
  expect(damage(DATA, 'Avalanche', [], []), 'unknowns are neutral').toBe(90);
  expect(damage(DATA, 'Not A Move', [], [])).toBe(0);
  expect(
    damage(DATA, 'Stone Edge', typesOf(DATA, 'Tyranitar'), typesOf(DATA, 'Moltres')),
    'Rock into a Galarian Moltres, Dark and Flying, rather than 2.56× into a Kantonian one',
  ).toBeCloseTo(100 * 1.2 * 1.6);
});

test('the best button is the move that hits hardest against this opponent', () => {
  const kyogre = typesOf(DATA, 'Kyogre');

  expect(bestButton(DATA, KYOGRE, kyogre, typesOf(DATA, 'Entei')), 'Hydro Pump into Entei').toBe(0.31);
  expect(bestButton(DATA, KYOGRE, kyogre, typesOf(DATA, 'Salamence')), 'Avalanche into Salamence').toBe(0.69);
  expect(bestButton(DATA, KYOGRE, [], []), 'Hydro Pump on power alone').toBe(0.31);
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
  expect(shouldShield(DATA, 'Marowak', 'Entei'), 'Solar Beam into a Kantonian Marowak').toBe(true);
});

test('while baiting, the cheapest move is best whatever it hits for', () => {
  const kyogre = typesOf(DATA, 'Kyogre');
  const entei = typesOf(DATA, 'Entei');

  expect(bestButton(DATA, KYOGRE, kyogre, entei), 'Hydro Pump into Entei once its shields are gone').toBe(0.31);
  expect(bestButton(DATA, KYOGRE, kyogre, entei, true), 'Avalanche, 45 to Hydro Pump’s 75, while they are up').toBe(
    0.69,
  );
  expect(bestButton(DATA, new Map([[0.499, 'Hydro Pump']]), kyogre, entei, true), 'one move baits too').toBe(0.499);
});

test.each<[(string | null)[], number[], string, number | undefined, string]>([
  [['Latias', 'Mamoswine', 'Giratina'], [0], 'Glaceon', 1, 'none safe from Glaceon; Mamoswine hits hardest'],
  [['Tyranitar', 'Giratina', 'Kyogre'], [0], 'Salamence', 2, 'Kyogre the one Salamence cannot hit hard'],
  [['Tyranitar', 'Giratina', 'Kyogre'], [0], 'Entei', 2, 'both safe from Entei; Kyogre hits hardest'],
  [['Kyogre', null, 'Giratina'], [0], 'Entei', 2, 'a named safe card ahead of an unread one'],
  [['Tyranitar', 'Kyogre', 'Tyranitar'], [0], 'Moltres', 2, 'Stone Edge into either Moltres beats Hydro Pump'],
  [
    ['Swampert', 'Charizard', 'Mamoswine'],
    [0],
    'Quaquaval',
    2,
    'High Horsepower beats Fire Blast; a purified one’s Return, 130 for either, decides nothing',
  ],
  [['Kyogre', 'Tyranitar', 'Giratina'], [0, 1, 2], 'Entei', undefined, 'nobody left'],
])('after a faint, %o less %o against %s sends in slot %s: %s', (party, fainted, opponent, slot) => {
  expect(nextOut(DATA, party, new Set(fainted), opponent)).toBe(slot);
});

test('no button is best while one of a pair has no move read under it', () => {
  expect(bestButton(DATA, new Map([[0.69, 'Avalanche']]), [], [])).toBe(undefined);
  expect(bestButton(DATA, new Map(), [], [])).toBe(undefined);
  expect(bestButton(DATA, new Map([[0.499, 'Shadow Sneak']]), [], [])).toBe(0.499);
});

test('an opponent’s form is allowed for what its players run, of what it can hold', () => {
  const [alolan, kantonian] = ['Alola', null].map((form) =>
    DATA.forms.find((f) => f.species === 'Marowak' && f.form === form && !f.costume),
  );
  const ranked = ['Bone Club', 'Rock Slide', 'Earthquake', 'Shadow Bone', 'Flame Wheel', 'Shadow Ball', 'Return'];
  const marowak = metaOf('Marowak', ranked).movesets.get('Marowak');

  expect(kantonian && chargedOf(kantonian, marowak), 'Return, which players run').toStrictEqual([
    'Bone Club',
    'Earthquake',
    'Rock Slide',
    'Return',
  ]);
  expect(alolan && chargedOf(alolan, marowak)).toStrictEqual([
    'Bone Club',
    'Shadow Ball',
    'Flame Wheel',
    'Shadow Bone',
    'Return',
  ]);
  expect(kantonian && chargedOf(kantonian), 'without a meta, every move bar Frustration and Return').toStrictEqual([
    'Bone Club',
    'Dig',
    'Earthquake',
    'Rock Slide',
  ]);
  expect(
    kantonian && chargedOf(kantonian, metaOf('Marowak', ['Hydro Pump']).movesets.get('Marowak')),
    'nothing it can hold ranked, so as if unranked',
  ).toStrictEqual(['Bone Club', 'Dig', 'Earthquake', 'Rock Slide']);
});

test('a shield and who goes in allow for only what the opponent’s players run', () => {
  const pulse = metaOf('Glaceon', ['Water Pulse']);
  const party = ['Latias', 'Mamoswine', 'Giratina'];

  expect(shouldShield(DATA, 'Latias', 'Glaceon', pulse), 'Water Pulse into Dragon').toBe(false);
  expect(shouldShield(DATA, 'Latias', 'Glaceon', metaOf('Glaceon', ['Avalanche']))).toBe(true);
  expect(shouldShield(DATA, 'Latias', 'Glaceon', metaOf('Entei', [])), 'a meta without Glaceon').toBe(true);
  expect(nextOut(DATA, party, new Set([0]), 'Glaceon', pulse), 'Giratina takes Water Pulse; Mamoswine does not').toBe(
    2,
  );
});
