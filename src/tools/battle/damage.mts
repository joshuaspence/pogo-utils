/**
 * How much a charged move takes off in a trainer battle, in HP, and so whether the one coming would faint us: what
 * `strategy.mts` never needs, its comparisons being between one Pokémon's own moves, where every stat cancels.
 *
 * The HUD shows each side's species and CP and nothing else that damage depends on: not the IVs, not the level and
 * not which charged moves the opponent has. So the moves are the worst its forms can hold, and the IVs are the ones a
 * player would have picked for a league — the rank-1 spread, whose attack × defense × HP is the highest the CP allows.
 */

import { cpOf, type CombatMove, type Form, type GameData, type IVs } from '../inventory/game-master.mts';
import { effectiveness, SHADOW_AND_PURIFIED, STAB } from './strategy.mts';

/**
 * What a charged move's damage is multiplied by in a trainer battle and not in a raid: the game master's
 * `COMBAT_SETTINGS.chargeAttackBonusMultiplier`, which `download.mts` does not keep.
 */
const PVP_BONUS = 1.3;

/**
 * How much of what is left a hit must take to count as fainting. Short of all of it, since the HP left is read off a
 * bar and the opponent's build is a guess, and a shield spent a hit early costs less than a Pokémon lost.
 */
const FAINTS = 0.9;

/** A form at one level with one IV spread, and the stats that follow: attack and defense unrounded, HP as shown. */
export interface Build {
  iv: IVs;
  level: number;
  attack: number;
  defense: number;
  hp: number;
}

/** One form of a species as it is assumed to be built. */
export interface Battler {
  form: Form;
  build: Build;
}

/** One side as the HUD shows it, either half of which may not have been read. */
export interface Side {
  species: string | null;
  cp: number | null;
}

const BUILDS = new WeakMap<Form, Map<number, Build | null>>();

/**
 * The rank-1 build of a form showing `cp`: of every IV spread at the highest level it stays at or under `cp`, the one
 * with the greatest attack × defense × HP, as PvPoke's `generateIVCombinations` ranks them; null where nothing is that
 * low. Every level the table holds, 51 being a best buddy's.
 *
 * Rank 1 for the CP read rather than for the league's cap, since a Pokémon well under the cap — a CP 1826 Magmar in
 * Ultra League — was not built to it, and the cap's spread levelled down to 1826 is one chosen for a CP it does not
 * have. This asks the cap's question of the CP actually shown instead, and the answers agree wherever the read is the
 * cap's own rank-1 CP. A spread that shows exactly `cp` at some level beats a stronger one that only fits under it,
 * since the read rules the latter out; where none does, as a misread may leave it, the strongest under it stands.
 *
 * Once per form and CP, the 4096 spreads being worth searching once but not every frame.
 */
export function rankOne(data: GameData, form: Form, cp: number): Build | null {
  const cached = BUILDS.get(form) ?? new Map<number, Build | null>();
  BUILDS.set(form, cached);

  if (cached.has(cp)) {
    return cached.get(cp) ?? null;
  }

  let best: { build: Build; exact: boolean; product: number } | null = null;

  for (let attack = 0; attack <= 15; attack++) {
    for (let defense = 0; defense <= 15; defense++) {
      for (let stamina = 0; stamina <= 15; stamina++) {
        const iv = { attack, defense, stamina };
        const fit = data.cpm.findLast(([, m]) => cpOf(form, iv, m) <= cp);

        if (!fit) {
          continue;
        }

        const [level, m] = fit;
        const build = {
          iv,
          level,
          attack: (form.attack + attack) * m,
          defense: (form.defense + defense) * m,
          hp: Math.max(10, Math.floor((form.stamina + stamina) * m)),
        };
        const exact = cpOf(form, iv, m) === cp;
        const product = build.attack * build.defense * build.hp;

        if (!best || (exact && !best.exact) || (exact === best.exact && product > best.product)) {
          best = { build, exact, product };
        }
      }
    }
  }

  cached.set(cp, best?.build ?? null);

  return best?.build ?? null;
}

/**
 * Every form a species could be, as `typesOf` takes them, each built rank 1 for the CP read. None where the species or
 * the CP is unknown, or where the CP is over the league's cap and so misread; no cap is Master League's.
 */
export function buildsOf(data: GameData, side: Side, cap: number | null): Battler[] {
  const { species, cp } = side;

  if (cp === null || (cap !== null && cp > cap)) {
    return [];
  }

  return data.forms
    .filter((form) => form.species === species && !form.costume)
    .flatMap((form) => {
      const build = rankOne(data, form, cp);

      return build ? [{ form, build }] : [];
    });
}

/**
 * The HP a charged move takes, `floor(0.5 × power × attack / defense × STAB × effectiveness × 1.3) + 1`, which is
 * PvPoke's `DamageCalculator.damage` (pvpoke/pvpoke@415436c, `src/js/battle/DamageCalculator.js`), its
 * `DamageMultiplier.BONUS` of 1.3 and `STAB` of 1.2 being the game master's `chargeAttackBonusMultiplier` and
 * `sameTypeAttackBonusMultiplier`. The game holds them as float32, PvPoke's BONUS being 1.2999999523…, which can move a
 * hit by 1 HP where it lands on a whole number; nothing `FAINTS` decides is that close.
 *
 * Neither side counts as a shadow, which nothing read yet tells apart: a shadow opponent hits a fifth harder than this
 * (`shadowPokemonAttackBonusMultiplier`), and a shadow of ours takes a fifth more.
 */
export function hit(data: GameData, move: CombatMove, attacker: Battler, defender: Battler): number {
  const stab = attacker.form.types.includes(move.type) ? STAB : 1;
  const ratio = attacker.build.attack / defender.build.defense;

  return (
    Math.floor(0.5 * move.power * ratio * stab * effectiveness(data, move.type, defender.form.types) * PVP_BONUS) + 1
  );
}

/**
 * Whether the opponent's hardest charged move would take at least `FAINTS` of the HP we have left, `hp` being the
 * fraction of our maximum the bar shows. Hardest of every charged move any of its forms can hold, bar Frustration and
 * Return as `nextOut` has it, against whichever of our forms it hurts most. Anything not known — either species or CP,
 * a CP over `cap`, the HP left or a move of theirs — counts as fainting, a shield being the safe side to err on.
 */
export function wouldFaint(data: GameData, own: Side, opponent: Side, hp: number | null, cap: number | null): boolean {
  const ours = buildsOf(data, own, cap);
  const theirs = buildsOf(data, opponent, cap);

  if (hp === null || ours.length === 0 || theirs.length === 0) {
    return true;
  }

  return theirs.some((attacker) => {
    const charged = attacker.form.moves.filter((move) => !move.fast && !SHADOW_AND_PURIFIED.has(move.name));
    const moves = charged.flatMap((move) => data.combat[move.name] ?? []);

    return (
      moves.length === 0 ||
      ours.some((defender) =>
        moves.some((move) => hit(data, move, attacker, defender) >= FAINTS * hp * defender.build.hp),
      )
    );
  });
}
