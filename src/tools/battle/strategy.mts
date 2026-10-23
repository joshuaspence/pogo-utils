/**
 * Which charged move to throw: the one that does the most damage, as power × STAB × type effectiveness. Attack, defense,
 * level and the trainer-battle bonus are the same for both of one Pokémon's moves against one opponent, so they cancel
 * out of the comparison and nothing here needs a stat.
 *
 * Whatever is not known counts as neutral rather than holding anything up: an opponent whose name was not read is hit
 * for 1×, and a Pokémon of ours whose species is not known gets no STAB. A name its forms give different types — a
 * Galarian Moltres is Dark and Flying where a Kantonian one is Fire — counts as whichever of them a move does worst
 * against, the HUD showing only the name.
 *
 * And when to shield, which the prompt does not say: it never names the move coming, so a shield is spent unless every
 * charged move the opponent's species can have is known to be no better than neutral against ours.
 */

import { type GameData } from '../inventory/game-master.mts';
import { BUTTON_XS } from './recognise.mts';

/** What a move sharing a type with the Pokémon using it multiplies its damage by. */
const STAB = 1.2;

/**
 * The charged moves only a shadow (Frustration) or a purified (Return) Pokémon holds, which every species with a shadow
 * form lists. By name, as `GameData` keys every move: the vended copy keeps no template ids.
 */
const SHADOW_AND_PURIFIED = new Set(['Frustration', 'Return']);

/** The types of one form, the one or two of them. */
export type Typing = readonly string[];

/** Every typing a species' forms have, one where they agree, and none where nothing is called that. */
export function typesOf(data: GameData, species: string | null): readonly Typing[] {
  const forms = data.forms.filter((form) => form.species === species && !form.costume);

  return [...new Set(forms.map((form) => [...form.types].sort().join('/')))].map((types) => types.split('/'));
}

/**
 * How hard a move hits, relative to the other moves of the same Pokémon against the same opponent: against the typing
 * it does worst against, either side having several. No typing at all is neutral, without STAB.
 */
export function damage(data: GameData, move: string, own: readonly Typing[], opponent: readonly Typing[]): number {
  const combat = data.combat[move];

  if (!combat) {
    return 0;
  }

  const stab = Math.min(...(own.length > 0 ? own : [[]]).map((types) => (types.includes(combat.type) ? STAB : 1)));
  const worst = Math.min(
    ...(opponent.length > 0 ? opponent : [[]]).map((types) => effectiveness(data, combat.type, types)),
  );

  return combat.power * stab * worst;
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
 * Which slot of the party is out: `sent`, the slot last sent in, or before any faint the lead, a battle opening with
 * it. Passed over for the next not fainted, in party order, where its species cannot hold every charged move read under
 * the buttons, which a misread card would show; a card that was not read cannot be checked, and stands. Undefined where
 * no slot is left that fits.
 */
export function activeOf(
  data: GameData,
  party: readonly (string | null)[],
  fainted: ReadonlySet<number>,
  moves: Iterable<string>,
  sent = 0,
): number | undefined {
  const read = [...moves];

  const fits = (slot: number) => {
    const species = party[slot];

    return (
      species !== undefined &&
      !fainted.has(slot) &&
      (species === null || read.every((move) => chargedMoves(data, species).has(move)))
    );
  };

  return [sent, ...party.keys()].find(fits);
}

/**
 * Which slot to send in after a faint, of those not fainted: first one the opponent cannot hit super effectively, then
 * the one with the hardest hit on it, then the first. Hardest out of every charged move its species can hold, which of
 * them it has being shown only once it is out, bar Frustration and Return: Return's 130 would otherwise tie every
 * species that has a shadow form, few of ours being purified. A card that was not read is neither safe nor known to
 * hit, so it goes in only where nothing named is left, or where it is first and nothing named is safe or hits at all.
 */
export function nextOut(
  data: GameData,
  party: readonly (string | null)[],
  fainted: ReadonlySet<number>,
  opponent: string | null,
): number | undefined {
  const types = typesOf(data, opponent);
  const scored = party.flatMap((species, slot) => {
    if (fainted.has(slot)) {
      return [];
    }

    const safe = species !== null && !shouldShield(data, species, opponent);
    const own = typesOf(data, species);
    const moves = species === null ? [] : [...chargedMoves(data, species)].filter((m) => !SHADOW_AND_PURIFIED.has(m));
    const hits = moves.map((move) => damage(data, move, own, types));
    const hardest = Math.max(0, ...hits);

    return [{ slot, safe, hardest }];
  });

  scored.sort((a, b) => Number(b.safe) - Number(a.safe) || b.hardest - a.hardest || a.slot - b.slot);

  return scored[0]?.slot;
}

/**
 * Whether to take a shield offered against `opponent` while `own` is out: unless both species are known and none of
 * the opponent's charged moves would be super effective against any typing ours could have. Every move its species can
 * hold, legacy and elite ones among them, since which two this one has is never shown.
 */
export function shouldShield(data: GameData, own: string | null, opponent: string | null): boolean {
  const typings = typesOf(data, own);

  if (typings.length === 0 || opponent === null) {
    return true;
  }

  const moves = [...chargedMoves(data, opponent)].flatMap((name) => data.combat[name] ?? []);

  return moves.length === 0 || moves.some((move) => typings.some((types) => effectiveness(data, move.type, types) > 1));
}

/**
 * Which button to throw, by its x, given the move read under each button: the one doing the most damage, or undefined
 * where a button of the pair has no move read under it yet and so could be either. While `bait`, the cheapest instead,
 * to draw a shield the strongest would otherwise be thrown into; the more damaging of two that cost the same.
 */
export function bestButton(
  data: GameData,
  moves: ReadonlyMap<number, string>,
  own: readonly Typing[],
  opponent: readonly Typing[],
  bait = false,
): number | undefined {
  const [left, centre, right] = BUTTON_XS;
  const buttons = moves.has(left) || moves.has(right) ? [left, right] : [centre];
  let best: { x: number; cost: number; damage: number } | undefined;

  for (const x of buttons) {
    const move = moves.get(x);

    if (move === undefined) {
      return undefined;
    }

    const hit = { x, cost: -(data.combat[move]?.energy ?? 0), damage: damage(data, move, own, opponent) };
    const better =
      bait && best?.cost !== hit.cost ? hit.cost < (best?.cost ?? Infinity) : hit.damage > (best?.damage ?? -1);

    if (!best || better) {
      best = hit;
    }
  }

  return best?.x;
}
