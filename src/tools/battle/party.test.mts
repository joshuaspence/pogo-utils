/**
 * The committed party screens against the icons of their own species and of the two species nearest each card out of
 * all 1,215 form icons: Minior and Flittle beside Latias, Hippowdon and Seismitoad beside Mamoswine, Hariyama and Crustle
 * beside Giratina, Landorus and Primeape beside Zeraora, Gastly and Tapu Bulu beside Gyarados. A card that matches its
 * own species ahead of those matches it ahead of the rest of the game.
 *
 * Two more off a Pixel 8 Pro, out of all 1,312: Golem, Electrode and Pangoro beside three Gengars, two in their witch's
 * hat; Meowth and Nidorina beside Absol, Spinarak and Joltik beside a Stunfisk nicknamed `89% MS/MW/D`, Crocalor and
 * Gastrodon beside Wartortle. Its cards sit 5 px above where the Pixel 4 XL's fractions alone put them, where all six
 * were declined, Stunfisk's nearest there being Durant.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { type GameData } from '../inventory/game-master.mts';
import { decodePng } from '../inventory/png.mts';
import { readParty, silhouetteOfIcon } from './party.mts';

const DATA = JSON.parse(
  readFileSync(new URL('../inventory/fixtures/game-master.json', import.meta.url), 'utf8'),
) as GameData;

const png = (path: string) => decodePng(readFileSync(new URL(path, import.meta.url)));

const ICONS = readdirSync(new URL('fixtures/icons/', import.meta.url)).map((icon) => ({
  species: DATA.forms.find((form) => form.icon === icon)?.species ?? icon,
  silhouette: silhouetteOfIcon(png(`fixtures/icons/${icon}`)),
}));

test.each([
  ['menu-party', ['Latias', 'Mamoswine', 'Giratina']],
  ['menu-party-full', ['Zeraora', 'Latias', 'Gyarados']],
  ['menu-pixel8-party-gengar', ['Gengar', 'Gengar', 'Gengar']],
  ['menu-pixel8-party', ['Absol', 'Stunfisk', 'Wartortle']],
])('%s holds %o', (name, party) => {
  expect(readParty(png(`fixtures/${name}.png`), ICONS)).toEqual(party);
});

/**
 * Without its own species, a card's nearest few others score within 0.04 of each other: Hippowdon at 0.687 and
 * Seismitoad at 0.676 against Mamoswine's card, Hariyama at 0.692 and Crustle at 0.660 against Giratina's.
 */
test('a card no species is clearly nearest is declined rather than guessed', () => {
  const others = ICONS.filter(({ species }) => ['Hippowdon', 'Seismitoad', 'Hariyama', 'Crustle'].includes(species));

  expect(readParty(png('fixtures/menu-party.png'), others).slice(1)).toEqual([null, null]);
});
