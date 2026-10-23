/**
 * The meta against a slice of PvPoke at pvpoke/pvpoke@38f7032: its formats whole, and of Great League's rankings the
 * four Marowak, Medicham, Registeel and Galarian Stunfisk, with the species and moves they name out of its game master.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { type GameData } from '../inventory/game-master.mts';
import { formatOf, loadMeta, movesetsOf, type PvPokeData, type Ranking } from './meta.mts';

const DATA = JSON.parse(
  readFileSync(new URL('../inventory/fixtures/game-master.json', import.meta.url), 'utf8'),
) as GameData;

const PVPOKE = JSON.parse(readFileSync(new URL('fixtures/pvpoke.json', import.meta.url), 'utf8')) as PvPokeData & {
  rankings: Ranking[];
};

afterEach(() => {
  vi.restoreAllMocks();
});

test.each<[string, { cup: string; cp: number } | null, string]>([
  ['great', { cup: 'all', cp: 1500 }, 'an open league by its name'],
  ['ultra league', { cup: 'all', cp: 2500 }, 'or its title'],
  ['m', { cup: 'all', cp: 10000 }, 'or the start of it, as `--league` takes it'],
  ['fantasy', { cup: 'fantasy', cp: 1500 }, 'a cup by the start of its title'],
  ['Fantasy Cup: Great League Edition', { cup: 'fantasy', cp: 1500 }, 'or by a title holding all of its own'],
  ['master league: mega', { cup: 'mega', cp: 10000 }, 'in any order: PvPoke’s Mega Master League'],
  ['little cup', { cup: 'little', cp: 500 }, 'Little Cup, rather than an open Little League'],
  ['great league remix', { cup: 'all', cp: 1500 }, 'a cup PvPoke does not list, by its league'],
  ['retro cup', null, 'nothing to go on'],
  ['', null, 'nothing at all'],
])('%j is ranked as %o: %s', (league, format) => {
  expect(formatOf(league, PVPOKE.formats)).toStrictEqual(format);
});

test('a species allows for every move PvPoke’s simulations use at least a fifth as often as the most used', () => {
  const movesets = movesetsOf(DATA, PVPOKE.rankings, PVPOKE);

  expect(movesets.get('Medicham')).toStrictEqual({
    fast: 'Psycho Cut',
    fastMoves: ['Psycho Cut', 'Counter'],
    chargedMoves: ['Dynamic Punch', 'Ice Punch', 'Psychic', 'Power-Up Punch'],
  });
  expect(movesets.get('Registeel')?.fast, 'PvPoke’s Lock On is the game’s Lock-On').toBe('Lock-On');
  expect(movesets.get('Stunfisk')?.chargedMoves, 'Galarian Stunfisk is what the HUD calls Stunfisk').toStrictEqual([
    'Rock Slide',
    'Earthquake',
    'Muddy Water',
    'Flash Cannon',
  ]);
});

test('the forms of a species are one moveset, recommended by the one ranked highest', () => {
  const marowak = movesetsOf(DATA, PVPOKE.rankings, PVPOKE).get('Marowak');

  expect(marowak?.fast, 'the Kantonian, ranked above the Alolan’s Fire Spin').toBe('Mud-Slap');
  expect(marowak?.fastMoves).toStrictEqual(['Mud-Slap', 'Rock Smash', 'Hex', 'Fire Spin']);
  expect(marowak?.chargedMoves, 'the Kantonian’s Return at 19.5% left out, the Alolan’s at 25.7% kept').toStrictEqual([
    'Bone Club',
    'Rock Slide',
    'Earthquake',
    'Shadow Bone',
    'Flame Wheel',
    'Shadow Ball',
    'Return',
  ]);
});

test('a variant is the move the screen prints, and what the game master lacks goes without', () => {
  const rankings: Ranking[] = [
    {
      speciesId: 'registeel',
      moves: {
        fastMoves: [{ moveId: 'HIDDEN_POWER_BUG', uses: 10 }],
        chargedMoves: [
          { moveId: 'FLASH_CANNON', uses: 10 },
          { moveId: 'NOT_A_MOVE', uses: 10 },
        ],
      },
      moveset: ['HIDDEN_POWER_BUG', 'FLASH_CANNON', 'NOT_A_MOVE'],
    },
    { speciesId: 'not_a_species', moves: { fastMoves: [], chargedMoves: [] }, moveset: ['LOCK_ON'] },
  ];
  const pvpoke = { ...PVPOKE, moves: [...PVPOKE.moves, { moveId: 'NOT_A_MOVE', name: 'Not A Move' }] };

  expect([...movesetsOf(DATA, rankings, pvpoke)]).toStrictEqual([
    ['Registeel', { fast: 'Hidden Power', fastMoves: ['Hidden Power'], chargedMoves: ['Flash Cannon'] }],
  ]);
});

test('the meta is read from the cache, as the league’s rankings and PvPoke’s game master', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'meta-'));

  try {
    writeFileSync(join(dir, 'pvpoke-gamemaster.json'), JSON.stringify(PVPOKE));
    writeFileSync(join(dir, 'pvpoke-fantasy-1500.json'), JSON.stringify(PVPOKE.rankings));
    writeFileSync(join(dir, 'pvpoke-all-10000.json'), JSON.stringify(PVPOKE.rankings));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const fantasy = await loadMeta(dir, DATA, 'fantasy cup');

    expect(fantasy && { cup: fantasy.cup, cap: fantasy.cap, species: [...fantasy.movesets.keys()] }).toStrictEqual({
      cup: 'fantasy',
      cap: 1500,
      species: ['Marowak', 'Medicham', 'Registeel', 'Stunfisk'],
    });
    expect((await loadMeta(dir, DATA, 'master'))?.cap, 'Master League has no cap').toBe(null);
    expect(await loadMeta(dir, DATA, 'retro cup'), 'every move allowed for').toBe(null);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('PvPoke ranks nothing called retro cup'));
  } finally {
    rmSync(dir, { recursive: true });
  }
});
