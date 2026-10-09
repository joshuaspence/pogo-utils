/**
 * Writes the table the Pokédex page reads a species' picture out of: the icon to ask `pogo_assets` for, where the dex
 * number alone does not derive it.
 *
 * Read from the committed game master rather than from PokeMiners' directory listing, so the build stays off the
 * network and the names cannot disagree with the ones the inventory tool matches a screenshot against. That file
 * already records, per form, whether the game has artwork for it and what it is called.
 *
 * Only the exceptions are written. Most of the dex is `pm{dex}.icon.png`, which `ordinaryIcon` derives, and a row
 * repeating it would be a copy of a value nothing needs copied.
 */

import { ordinaryIcon, type Icons } from '../src/pokedex/icons.ts';
import type { GameData } from '../src/tools/inventory/game-master.mts';
import { POKEMON_ICONS } from '../src/generated.ts';
import { readFileSync, writeFileSync } from 'node:fs';

const MASTER = 'src/tools/inventory/fixtures/game-master.json';

const data: GameData = JSON.parse(readFileSync(MASTER, 'utf8'));

/** Every form the game master holds, by the species it belongs to, in the order that file lists them. */
const forms = new Map<number, GameData['forms']>();

for (const form of data.forms) {
  forms.set(form.dex, [...(forms.get(form.dex) ?? []), form]);
}

/**
 * The picture that stands for a species. Its ordinary form where it has one, and otherwise the first plain form that
 * has artwork — which is the game's own default for a species that is only ever a form: Unown's A, Spinda's pattern 00,
 * Burmy's plant cloak. A costume is never it, Pikachu having 70 of them and no reason to be shown in a party hat.
 */
function iconOf(dex: number): string | null {
  const plain = (forms.get(dex) ?? []).filter(({ costume, icon }) => !costume && icon !== null);

  return (plain.find(({ form }) => form === '') ?? plain[0])?.icon ?? null;
}

const icons: Record<string, string | null> = {};

let rendered = 0;

/*
 * Every number up to the last the game master knows, rather than only the ones it holds a form for. Basculegion has no
 * form in that file at all, and skipping it would leave the page deriving `pm902.icon.png` — a name `pogo_assets` does
 * not hold either, so the card would show no picture rather than falling back to the pixel sprite.
 */
const last = Math.max(...forms.keys());

for (let dex = 1; dex <= last; dex++) {
  const icon = iconOf(dex);

  if (icon !== null) {
    rendered += 1;
  }

  if (icon !== ordinaryIcon(dex)) {
    icons[dex] = icon;
  }
}

/*
 * A reader that had stopped recognising the fixture's shape would answer `null` for every species and write a table
 * saying the game has no artwork at all — which looks like a successful build and silently returns the page to pixel
 * sprites. Counted against the forms read rather than against a number written down here, so the floor holds as
 * upstream releases species.
 */
if (rendered < last / 2) {
  throw new Error(`${MASTER}: only ${rendered} of ${last} species have an icon, so the fixture is unreadable`);
}

writeFileSync(POKEMON_ICONS, JSON.stringify(icons satisfies Icons));

console.error(
  `${POKEMON_ICONS}: ${rendered} of ${last} species draw the game's own render, and ` +
    `${Object.values(icons).filter((icon) => icon === null).length} fall back to a pixel sprite`,
);
