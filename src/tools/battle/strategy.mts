/**
 * Which charged move to throw: the one that does the most damage, as power × STAB × type effectiveness. Attack, defense,
 * level and the trainer-battle bonus are the same for both of one Pokémon's moves against one opponent, so they cancel
 * out of the comparison and nothing here needs a stat.
 *
 * Whatever is not known counts as neutral rather than holding anything up: an opponent whose name was not read is hit
 * for 1×, and a nicknamed Pokémon of ours, whose species the HUD does not show, gets no STAB.
 */

import { type GameData } from '../inventory/game-master.mts';
import { BUTTON_XS } from './recognise.mts';

/** What a move sharing a type with the Pokémon using it multiplies its damage by. */
const STAB = 1.2;

/**
 * A species' types, or null where its forms disagree — an Alolan Marowak and a Kantonian one share a name and nothing
 * else the HUD shows — or where nothing is called that.
 */
export function typesOf(data: GameData, species: string | null): readonly string[] | null {
  const forms = data.forms.filter((form) => form.species === species && !form.costume);
  const types = new Set(forms.map((form) => [...form.types].sort().join('/')));
  const [only] = types;

  return types.size === 1 && only !== undefined ? only.split('/') : null;
}

/** How hard a move hits, relative to the other moves of the same Pokémon against the same opponent. */
export function damage(
  data: GameData,
  move: string,
  own: readonly string[] | null,
  opponent: readonly string[] | null,
): number {
  const combat = data.combat[move];

  if (!combat) {
    return 0;
  }

  const stab = own?.includes(combat.type) ? STAB : 1;
  const effectiveness = (opponent ?? []).reduce(
    (product, type) => product * (data.effectiveness[combat.type]?.[type] ?? 1),
    1,
  );

  return combat.power * stab * effectiveness;
}

/**
 * Which button to throw, by its x, given the move read under each button: the one doing the most damage, or undefined
 * where a button of the pair has no move read under it yet and so could be either.
 */
export function bestButton(
  data: GameData,
  moves: ReadonlyMap<number, string>,
  own: readonly string[] | null,
  opponent: readonly string[] | null,
): number | undefined {
  const [left, centre, right] = BUTTON_XS;
  const buttons = moves.has(left) || moves.has(right) ? [left, right] : [centre];
  let best: { x: number; damage: number } | undefined;

  for (const x of buttons) {
    const move = moves.get(x);

    if (move === undefined) {
      return undefined;
    }

    const hit = damage(data, move, own, opponent);

    if (!best || hit > best.damage) {
      best = { x, damage: hit };
    }
  }

  return best?.x;
}
