/**
 * The damage model against the vended game master, on the pairing that asked for it: a CP 2495 Charizard of ours
 * against a CP 1826 Magmar in Ultra League.
 */

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { cpOf, multiplierOf, type Form, type GameData } from '../inventory/game-master.mts';
import { buildsOf, hit, rankOne, wouldFaint } from './damage.mts';
import { type Meta } from './meta.mts';

const DATA = JSON.parse(
  readFileSync(new URL('../inventory/fixtures/game-master.json', import.meta.url), 'utf8'),
) as GameData;

const ULTRA = 2500;
const CHARIZARD = { species: 'Charizard', cp: 2495 };
const MAGMAR = { species: 'Magmar', cp: 1826 };

function formOf(species: string): Form {
  const form = DATA.forms.find((f) => f.species === species && !f.costume);

  if (!form) {
    throw new Error(`no ${species}`);
  }

  return form;
}

test('a Great League Azumarill at its rank-1 CP is the published rank-1 build', () => {
  // DittoBase's Azumarill PvP page (dittobase.com/pokemon-go/pokedex/azumarill/pvp) gives Great League rank 1 as
  // 0/15/15 at level 45.5, CP 1499: attack 91.59, defense 136.57, HP 196, stat product 2,451,821.
  const build = rankOne(DATA, formOf('Azumarill'), 1499);

  expect(build).toMatchObject({ iv: { attack: 0, defense: 15, stamina: 15 }, level: 45.5, hp: 196 });
  expect(build?.attack).toBeCloseTo(91.59, 2);
  expect(build?.defense).toBeCloseTo(136.57, 2);
  expect(Math.round((build?.attack ?? 0) * (build?.defense ?? 0) * (build?.hp ?? 0))).toBe(2451821);
});

test('a CP read is matched exactly where some spread shows it, rank 1 among those', () => {
  const azumarill = formOf('Azumarill');
  const build = rankOne(DATA, azumarill, 1500);

  expect(build?.iv, 'rank 1 shows 1499, so a 1500 is something weaker').not.toEqual({
    attack: 0,
    defense: 15,
    stamina: 15,
  });
  expect(build && cpOf(azumarill, build.iv, multiplierOf(DATA, build.level) ?? 0)).toBe(1500);
  expect(rankOne(DATA, azumarill, 9), 'below the floor of 10').toBe(null);
});

test('every form of a species is built, none where the read cannot be one', () => {
  expect(buildsOf(DATA, CHARIZARD, ULTRA).map(({ form }) => form.form)).toEqual(['Copy 2019', null]);
  expect(buildsOf(DATA, { species: 'Charizard', cp: 2501 }, ULTRA), 'over the cap is a misread').toEqual([]);
  expect(buildsOf(DATA, { species: 'Charizard', cp: 2501 }, null), 'Master League has none').toHaveLength(2);
  expect(buildsOf(DATA, { species: 'Charizard', cp: null }, ULTRA)).toEqual([]);
  expect(buildsOf(DATA, { species: null, cp: 2495 }, ULTRA)).toEqual([]);
});

test('Magmar’s Fire Blast takes 71 of a CP 2495 Charizard’s 149 HP', () => {
  const [charizard] = buildsOf(DATA, CHARIZARD, ULTRA);
  const [magmar] = buildsOf(DATA, MAGMAR, ULTRA);
  const fireBlast = DATA.combat['Fire Blast'];

  // Magmar 1/15/15 at level 28.5 has attack 147.626; Charizard 0/15/9 at 35.5 defense 143.723 and 149 HP. Fire Blast
  // is 140 power with STAB, and Fire into Fire and Flying is 0.625 × 1:
  // floor(0.5 × 140 × 147.626 / 143.723 × 1.2 × 0.625 × 1.3) + 1 = floor(70.10) + 1 = 71.
  expect(magmar?.build).toMatchObject({ iv: { attack: 1, defense: 15, stamina: 15 }, level: 28.5 });
  expect(charizard?.build).toMatchObject({ iv: { attack: 0, defense: 15, stamina: 9 }, level: 35.5, hp: 149 });
  expect(magmar && charizard && fireBlast && hit(DATA, fireBlast, magmar, charizard)).toBe(71);
});

test.each<[number, boolean, string]>([
  [0.3, true, 'Fire Blast’s 71 is more than the 45 left'],
  [0.5, true, '71 is past nine tenths of the 74 left'],
  [0.6, false, 'nor 71 of 89'],
  [0.9, false, 'still less of 134'],
])('a CP 2495 Charizard at %s HP would faint to a CP 1826 Magmar: %s, %s', (hp, faints) => {
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, hp, ULTRA)).toBe(faints);
});

test('Frustration and Return are left out, which only a shadow or a purified Magmar has', () => {
  // Return, 130 power and neutral on Charizard without STAB, would take floor(0.5 × 130 × 147.626 / 143.723 × 1.3) + 1
  // = 87, past nine tenths of the 89 HP left at 0.6.
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, 0.6, ULTRA)).toBe(false);
});

/** A meta in which `species` is run with `chargedMoves` alone. */
const metaOf = (species: string, chargedMoves: string[]): Meta => ({
  cup: 'all',
  cap: 2500,
  movesets: new Map([[species, { fast: '', fastMoves: [], chargedMoves }]]),
});

test('in a league PvPoke ranks, only the charged moves the opponent’s players run are allowed for', () => {
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, 0.5, ULTRA, metaOf('Magmar', ['Fire Punch'])), 'not Fire Blast').toBe(
    false,
  );
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, 0.2, ULTRA, metaOf('Magmar', ['Fire Punch'])), 'Fire Punch').toBe(true);
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, 0.6, ULTRA, metaOf('Magmar', ['Return'])), 'Return, run').toBe(true);
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, 0.5, ULTRA, metaOf('Charizard', [])), 'Magmar unranked').toBe(true);
});

test('only the charged moves the opponent can afford are allowed for, where its energy is counted', () => {
  // At 50%, Fire Blast's 71 of the 74 left faints; Flamethrower, Scorching Sands and Fire Punch do not.
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, 0.5, ULTRA, null, 60), 'short of Fire Blast’s 80').toBe(false);
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, 0.5, ULTRA, null, 80)).toBe(true);
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, 0.5, ULTRA, null, 10), 'too little for anything: the count is short').toBe(
    true,
  );
});

test('anything unknown counts as fainting', () => {
  expect(wouldFaint(DATA, { species: null, cp: 2495 }, MAGMAR, 0.9, ULTRA), 'our species').toBe(true);
  expect(wouldFaint(DATA, CHARIZARD, { species: null, cp: 1826 }, 0.9, ULTRA), 'theirs').toBe(true);
  expect(wouldFaint(DATA, { species: 'Charizard', cp: null }, MAGMAR, 0.9, ULTRA), 'our CP').toBe(true);
  expect(wouldFaint(DATA, CHARIZARD, { species: 'Magmar', cp: null }, 0.9, ULTRA), 'theirs').toBe(true);
  expect(wouldFaint(DATA, CHARIZARD, { species: 'Magmar', cp: 2826 }, 0.9, ULTRA), 'over the cap').toBe(true);
  expect(wouldFaint(DATA, CHARIZARD, MAGMAR, null, ULTRA), 'the HP left').toBe(true);
  expect(wouldFaint(DATA, CHARIZARD, { species: 'Not A Pokémon', cp: 1826 }, 0.9, ULTRA)).toBe(true);
});
