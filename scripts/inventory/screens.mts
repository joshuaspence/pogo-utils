/**
 * The three screens a scan reads, and what each one says. Everything here is a pure function of a screenshot, so a
 * screenshot saved by `pnpm inventory snap` can be read again with `pnpm inventory parse` after a change, with no phone
 * attached — which is how these are meant to be tuned when a game update moves something.
 *
 * - The **detail** screen, scrolled to the top: CP, name or nickname, HP, weight, types and height.
 * - The same screen **scrolled down**: the fast move and one or two charged moves.
 * - **Appraisal**: three bars, Attack, Defense and HP, each out of 15.
 */

import { closest, levelsOf, type Form, type GameData, type IVs } from './game-master.mts';
import { findLine, fold, ocr, type Line } from './ocr.mts';
import { crop, rgb, type Image } from './png.mts';

export interface Detail {
  cp: number | null;
  name: string | null;
  hp: number | null;
  weightKg: number | null;
  heightM: number | null;
  types: string[];
}

export interface Moves {
  fast: string | null;
  charged: string[];
}

/**
 * How an appraisal bar's pixels are told apart. `fill` is the orange (red at 15) of the part that is earned, which is
 * the only saturated colour on the panel; `track` is the grey of the part that is not.
 */
export interface BarColours {
  fillSaturation: number;
  trackSaturation: number;
  trackMin: number;
  trackMax: number;
}

export const DEFAULT_BAR_COLOURS: BarColours = {
  fillSaturation: 60,
  trackSaturation: 25,
  trackMin: 170,
  trackMax: 240,
};

/** Everything OCR read off an image: the whole of it, then the top fifth again inverted, where the CP is white. */
export async function readLines(image: Image): Promise<Line[]> {
  const top = Math.round(image.height / 5);
  const [all, sky] = await Promise.all([ocr(image), ocr(crop(image, 0, 0, image.width, top, true))]);

  return [...all, ...sky].sort((a, b) => a.top - b.top || a.left - b.left);
}

export function parseDetail(lines: readonly Line[], data: GameData, image: Image): Detail {
  // The small `CP` beside the number is often read with a stray letter after it (`cPe518`) or as `GP`.
  const cpPattern = /\b[cg]p\s?[a-z]?\s?(\d{2,5})\b/;
  const cpLine = lines.find((l) => l.top < image.height / 4 && cpPattern.test(fold(l.text)));
  const cp = cpLine ? Number(cpPattern.exec(fold(cpLine.text))?.[1]) : null;

  // `97 / 97 HP` or `HP 97/97`; the second number is the maximum, which is the one CP and level determine.
  const hpPattern = /(?:hp\s*)?(\d{1,4})\s*\/\s*(\d{1,4})(?:\s*hp)?/i;
  const hpLine = lines.find((l) => /hp/i.test(l.text) && hpPattern.test(l.text));
  const hp = hpLine ? Number(hpPattern.exec(hpLine.text)?.[2]) : null;

  // The name is the nearest line of words above the HP bar. A nickname reads here as readily as a species does.
  const nameLine = hpLine
    ? lines
        .filter((l) => l.top + l.height <= hpLine.top + 4 && l !== cpLine && /\p{L}{3}/u.test(l.text))
        .filter((l) => !/\bcp\s?\d/.test(fold(l.text)))
        .at(-1)
    : undefined;
  const name = nameLine ? nameLine.text.replace(/[^\p{L}\p{N} .'♀♂:-]/gu, '').trim() || null : null;

  const number = (pattern: RegExp) => {
    const line = lines.find((l) => pattern.test(l.text));
    const value = line ? pattern.exec(line.text)?.[1] : undefined;
    return value === undefined ? null : Number(value.replace(',', '.'));
  };

  const typeNames = new Map(data.types.map((t) => [fold(t), t]));
  const typeLine = lines.find((l) => {
    const words = fold(l.text).split(' ').filter(Boolean);
    return words.length > 0 && words.length <= 2 && words.every((w) => typeNames.has(w));
  });

  return {
    cp,
    name,
    hp,
    weightKg: number(/(\d+(?:[.,]\d+)?)\s*kg\b/i),
    heightM: number(/(\d+(?:[.,]\d+)?)\s*m\b/i),
    types: typeLine
      ? fold(typeLine.text)
          .split(' ')
          .map((w) => typeNames.get(w) ?? w)
      : [],
  };
}

/**
 * The moves, read as whichever lines are near enough to a move's name, in the order they sit: the fast move first and
 * the charged moves beneath it. Anything level with or above the weight and height is left out, since that row holds
 * the types and a type can also be a move — Psychic is both — and above it is the name, which a nickname can make look
 * like one. How far the scroll went varies, so when neither row is still on screen every line is a candidate.
 */
export function parseMoves(lines: readonly Line[], data: GameData): Moves {
  const anchors = lines.filter((l) => /\d\s*(kg|m)\b/i.test(l.text) || /\d\s*\/\s*\d/.test(l.text));
  const floor = Math.max(-Infinity, ...anchors.map((l) => l.top + l.height));
  const found = lines
    .filter((l) => l.top > floor)
    .map((l) => closest(l.text.replace(/[\d]+/g, ''), data.moves, (m) => m.name, 0.2))
    .filter((m) => m !== null);

  return {
    fast: found.find((m) => m.fast)?.name ?? null,
    charged: found
      .filter((m) => !m.fast)
      .slice(0, 2)
      .map((m) => m.name),
  };
}

export function isAppraisal(lines: readonly Line[]): boolean {
  return findLine(lines, /^attack$/) !== undefined && findLine(lines, /^defen[cs]e$/) !== undefined;
}

/**
 * The three IVs, read off the length of each bar's fill against the length of the bar. The labels find the bars —
 * each bar sits directly under its word — and the pixels do the rest, so a screen of any size reads the same way.
 */
export function parseAppraisal(lines: readonly Line[], image: Image, colours = DEFAULT_BAR_COLOURS): IVs | null {
  const attack = findLine(lines, /^attack$/);
  const defense = findLine(lines, /^defen[cs]e$/);
  const stamina = defense ? lines.find((l) => fold(l.text) === 'hp' && l.top > defense.top) : undefined;

  if (!attack || !defense || !stamina) {
    return null;
  }

  const [a = null, d = null, s = null] = [attack, defense, stamina].map((label) => bar(image, label, colours));

  return a === null || d === null || s === null ? null : { attack: a, defense: d, stamina: s };
}

function bar(image: Image, label: Line, colours: BarColours): number | null {
  const kind = (x: number, y: number): 'fill' | 'track' | null => {
    const [r, g, b] = rgb(image, x, y);
    const max = Math.max(r, g, b);
    const saturation = max - Math.min(r, g, b);

    if (saturation >= colours.fillSaturation) {
      return 'fill';
    }

    return saturation <= colours.trackSaturation && max >= colours.trackMin && max <= colours.trackMax ? 'track' : null;
  };

  // The bar is split into segments by gaps a few pixels wide, so a run tolerates a short break without ending.
  const gap = Math.max(3, Math.round(image.width * 0.012));
  const from = Math.max(0, label.left - label.height);
  let best: { start: number; end: number; lastFill: number } | null = null;

  for (let y = label.top + label.height; y < label.top + label.height * 4 && y < image.height; y++) {
    let start = -1;
    let end = -1;
    let lastFill = -1;
    let misses = 0;

    for (let x = from; x < image.width; x++) {
      const k = kind(x, y);

      if (k === null) {
        if (start >= 0 && ++misses > gap) {
          break;
        }

        continue;
      }

      if (start < 0) {
        // A bar starts at or near its label's left edge; something further right is a different thing.
        if (x > label.left + label.height * 2) {
          break;
        }

        start = x;
      }

      misses = 0;
      end = x;

      if (k === 'fill') {
        lastFill = x;
      }
    }

    if (start >= 0 && (!best || end - start > best.end - best.start)) {
      best = { start, end, lastFill };
    }
  }

  // A bar is most of the panel's width; anything much shorter is a stray row of text, not a bar.
  if (!best || best.end - best.start < image.width * 0.25) {
    return null;
  }

  return best.lastFill < best.start
    ? 0
    : Math.round((15 * (best.lastFill - best.start + 1)) / (best.end - best.start + 1));
}

export interface Identity {
  form: Form | null;
  /** Other forms the numbers fit equally well, when they cannot be told apart. */
  alternatives: Form[];
  levels: number[];
  nickname: string | null;
  notes: string[];
}

/**
 * Which species and form this is, and at what level. The name narrows the candidates when it is a species' name, the
 * types narrow them further, and the IVs, CP and HP settle the rest — which is also what identifies a Pokémon whose
 * nickname has hidden its species. Costumes share their base form's stats, so they are folded into it here and left to
 * the `costume` search to report.
 */
export function identify(data: GameData, detail: Detail, iv: IVs | null): Identity {
  const notes: string[] = [];
  const species = detail.name ? closest(detail.name, data.species, (s) => s) : null;
  const nickname = detail.name && !species ? detail.name : null;
  const fits = (f: Form) =>
    (detail.types.length === 0 || sameTypes(f.types, detail.types)) &&
    (iv === null || detail.cp === null || levelsOf(data, f, iv, detail.cp, detail.hp).length > 0);

  let candidates = data.forms.filter((f) => f.species === species && fits(f));

  if (candidates.length === 0 && iv !== null && detail.cp !== null && detail.types.length > 0) {
    if (species) {
      notes.push(`the numbers do not fit any form of ${species}; searched every species`);
    }

    candidates = data.forms.filter(fits);
  }

  // Costumes repeat their base form's stats and types exactly, so they are the same answer twice.
  const distinct: Form[] = [];

  for (const f of [...candidates].sort(
    (a, b) => Number(a.costume) - Number(b.costume) || a.form.length - b.form.length,
  )) {
    if (!distinct.some((d) => d.dex === f.dex && sameStats(d, f) && sameTypes(d.types, f.types))) {
      distinct.push(f);
    }
  }

  const [form = null, ...alternatives] = distinct;
  const levels = form && iv && detail.cp !== null ? levelsOf(data, form, iv, detail.cp, detail.hp) : [];

  if (nickname && iv === null) {
    notes.push('a nickname hides the species, and only the IVs can say what it is');
  } else if (distinct.length === 0 && (species || nickname)) {
    notes.push('no form fits the CP, HP, IVs and types read');
  } else if (alternatives.length > 0) {
    notes.push(`could also be ${alternatives.map(label).join(', ')}`);
  }

  if (levels.length > 1) {
    notes.push(`level ambiguous: ${levels.join(' or ')}`);
  }

  return { form, alternatives, levels, nickname, notes };
}

export function label(f: Form): string {
  return f.form ? `${f.species} (${f.form})` : f.species;
}

function sameTypes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t) => b.includes(t));
}

function sameStats(a: Form, b: Form): boolean {
  return a.attack === b.attack && a.defense === b.defense && a.stamina === b.stamina;
}
