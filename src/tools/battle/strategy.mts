/**
 * Which charged move to throw: the one that does the most damage, as power × STAB × type effectiveness. Attack, defense,
 * level and the trainer-battle bonus are the same for both of one Pokémon's moves against one opponent, so they cancel
 * out of the comparison and nothing here needs a stat.
 *
 * Whatever is not known counts as neutral rather than holding anything up: an opponent whose name was not read is hit
 * for 1×, and a Pokémon of ours whose species is not known gets no STAB.
 *
 * And when to shield, which the prompt does not say: it never names the move coming, so a shield is spent unless every
 * charged move the opponent's species can have is known to be no better than neutral against ours.
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

  return combat.power * stab * effectiveness(data, combat.type, opponent ?? []);
}

/** What a move of `type` multiplies its damage by against a Pokémon of the `defender`'s types. */
function effectiveness(data: GameData, type: string, defender: readonly string[]): number {
  return defender.reduce((product, against) => product * (data.effectiveness[type]?.[against] ?? 1), 1);
}

/** Every charged move any form of a species can hold, by name. */
function chargedMoves(data: GameData, species: string): Set<string> {
  const forms = data.forms.filter((form) => form.species === species);

  return new Set(forms.flatMap((form) => form.moves.filter((move) => !move.fast).map((move) => move.name)));
}

/**
 * Which of the party is out, given the charged moves read under its buttons: the one member whose species can hold
 * them all, or null where none or several can, or no move has been read. A nickname hides the species from the HUD and
 * not from this.
 */
export function activeOf(data: GameData, party: readonly (string | null)[], moves: Iterable<string>): string | null {
  const read = [...moves];
  const fits = new Set(
    party.filter(
      (species): species is string => species !== null && read.every((move) => chargedMoves(data, species).has(move)),
    ),
  );
  const [only] = fits;

  return read.length > 0 && fits.size === 1 && only !== undefined ? only : null;
}

/**
 * Whether to take a shield offered against `opponent` while `own` is out: unless both species are known and none of
 * the opponent's charged moves would be super effective. Every move its species can hold, legacy and elite ones
 * among them, since which two this one has is never shown.
 */
export function shouldShield(data: GameData, own: string | null, opponent: string | null): boolean {
  const types = typesOf(data, own);

  if (types === null || opponent === null) {
    return true;
  }

  const moves = [...chargedMoves(data, opponent)].flatMap((name) => data.combat[name] ?? []);

  return moves.length === 0 || moves.some((move) => effectiveness(data, move.type, types) > 1);
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
