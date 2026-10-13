/**
 * The decisions `pnpm inventory scan` makes that need no phone: which arguments it takes, how a row is written and
 * whether two passes saw the same Pokémon. Here rather than in `scripts/inventory.mts` so the suite can import them,
 * that script parsing `process.argv` and driving a phone at its top level.
 */

import { type Detail } from './detail.mts';
import { fold } from './ocr.mts';
import { type Overlay } from './overlay.mts';

/** The searches that answer the yes-or-no columns, each column named for the game's own search term. */
export const FLAGS = ['shiny', 'lucky', 'costume', 'shadow', 'purified'] as const;

export type Flag = (typeof FLAGS)[number];

export function parseFlags(list: string): Flag[] {
  const names = list.split(',').filter(Boolean);
  const unknown = names.filter((n) => !(FLAGS as readonly string[]).includes(n));

  if (unknown.length > 0) {
    throw new Error(`unknown flag ${unknown.join(', ')}; the choices are ${FLAGS.join(', ')}`);
  }

  return names as Flag[];
}

/** A count option, checked here rather than left to turn into a `NaN` that quietly writes nothing after a long run. */
export function count(option: string, value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const n = Number(value);

  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--${option} takes a whole number, not ${value}`);
  }

  return n;
}

export function csv(value: string | number | null): string {
  const text = value === null ? '' : String(value);

  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * What identifies one Pokémon across two passes. CP is not part of it: it is white over the artwork and the reading
 * OCR misses most, so requiring it would make screens unreadable and stop a walk after three. The overlay's IVs
 * discriminate better — HP, weight, height and 15/15/15 together are shared by almost nothing — and HP alone is what a
 * key needs to exist at all.
 */
export function keyOf(detail: Detail, overlay: Overlay | null): string | null {
  if (detail.hp === null) {
    return null;
  }

  return `${fold(detail.name ?? '')}|${looseKeyOf(detail, overlay)}`;
}

/** The same without the name, so a nickname read differently in two passes still matches. */
export function looseKeyOf(detail: Detail, overlay: Overlay | null): string {
  const iv = overlay ? `${overlay.iv.attack}/${overlay.iv.defense}/${overlay.iv.stamina}` : '';

  return [detail.hp, detail.weight, detail.height, iv].join('|');
}

/**
 * The Pokémon a flag search found, held as a multiset of keys so that each one marks exactly one row of the full pass.
 * A looser key without the name is kept beside it, since a name is the field OCR is likeliest to read two ways.
 */
export class Marks {
  readonly #exact = new Map<string, number>();
  readonly #loose = new Map<string, number>();
  size = 0;

  add(detail: Detail, overlay: Overlay | null) {
    const key = keyOf(detail, overlay);

    if (key) {
      bump(this.#exact, key, 1);
      bump(this.#loose, looseKeyOf(detail, overlay), 1);
      this.size++;
    }
  }

  /** Whether this Pokémon was in the search, using up the match so a twin is not marked by the same entry. */
  take(detail: Detail, overlay: Overlay | null): boolean {
    const key = keyOf(detail, overlay);
    const loose = looseKeyOf(detail, overlay);

    if (key && (this.#exact.get(key) ?? 0) > 0) {
      bump(this.#exact, key, -1);
      bump(this.#loose, loose, -1);
      return true;
    }

    if (key && (this.#loose.get(loose) ?? 0) > 0) {
      bump(this.#loose, loose, -1);
      return true;
    }

    return false;
  }
}

function bump(map: Map<string, number>, key: string, by: number) {
  map.set(key, (map.get(key) ?? 0) + by);
}
