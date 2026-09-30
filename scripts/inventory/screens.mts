/**
 * The three screens a scan reads, and what each one says. Everything here is a pure function of a screenshot, so a
 * screenshot saved by `pnpm inventory snap` can be read again with `pnpm inventory parse` after a change, with no phone
 * attached — which is how these are meant to be tuned when a game update moves something.
 *
 * - The **detail** screen, scrolled to the top: CP, name or nickname, HP, weight, types and height.
 * - The same screen **scrolled down**: the fast move and one or two charged moves.
 * - **PGSharp's overlay** on the detail screen, which states the level and the three IVs outright.
 */

import { closest, levelsOf, type Form, type GameData, type IVs } from './game-master.mts';
import { fold, ocr, ocrLine, type Line } from './ocr.mts';
import { crop, isolate, scale, type Image } from './png.mts';

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

/** Where PGSharp draws its overlay, as fractions of the screen's width and height. */
export interface OverlayBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Overlay {
  /** Null where the box was read but the level was not; the arithmetic in `identify` is what settles it either way. */
  level: number | null;
  iv: IVs;
}

/** Only these survive the whitelist: the level's `L`, the digits and the slashes between the three IVs. */
const OVERLAY_ALPHABET = 'L0123456789/ ';

/** Bright enough to be the overlay's white text, and flat enough in colour not to be its IV percentage. */
const OVERLAY_LUMINANCE = 150;
const OVERLAY_CHROMA = 55;

const TRIPLE = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/;

/** `L25 IV86 14/13/12` and a character's slack, which is what the box is measured in. */
const OVERLAY_CHARACTERS = 19;

/**
 * Where the overlay sits, found by the one thing nothing else on the screen carries: three small numbers separated by
 * slashes. This is the expensive half and it only has to work once — a caller finds the box on whichever Pokemon it
 * first succeeds on and reads every later one straight out of it, which is what keeps this independent of the phone.
 * PGSharp draws the overlay itself rather than leaving it to Unity, so the box does not move between species; what it
 * does do is move between devices, which is why this is found rather than configured.
 */
export function findOverlay(lines: readonly Line[], image: Image): OverlayBox | null {
  const line = lines.find((l) => l.top < image.height / 2 && TRIPLE.test(l.text));

  if (!line) {
    return null;
  }

  // The box is sized from the width of one character rather than from the height Tesseract reports, because that
  // height is not trustworthy: measured over twelve captures the same overlay came back 25, 28, 49 and 54 pixels tall
  // as the row was merged with whatever fragment of the artwork sat beside it, and padding a 54 by half of itself
  // reaches far enough into the picture to undo the whole point of cropping. Character width does not wander — 270/17,
  // 264/17 and 130/8 across those same captures are all within a pixel of each other.
  const em = line.width / Math.max(1, line.text.length);

  // Anchored on the right edge and extended left, since the part that goes missing is always the left: where only the
  // three IVs are legible the level and the percentage before them are still there to be read, just not by this pass.
  const right = line.left + line.width + em;
  const left = right - OVERLAY_CHARACTERS * em;

  return {
    x: left / image.width,
    y: (line.top - em * 0.7) / image.height,
    width: (right - left) / image.width,
    height: (em * 3) / image.height,
  };
}

/**
 * The level and the three IVs, read out of a box already found. Isolating the white text and doubling it is what makes
 * this reliable: measured over twelve captures the three IVs came out right in all twelve, where the same screens read
 * whole gave three. The level is a guess by comparison, at ten of twelve — the `IV` label beside it OCRs as a `1` and
 * runs into the digits — so it is offered rather than asserted, and `identify` keeps it only if the HP agrees.
 */
export async function readOverlay(image: Image, box: OverlayBox): Promise<Overlay | null> {
  const region = crop(
    image,
    box.x * image.width,
    box.y * image.height,
    box.width * image.width,
    box.height * image.height,
  );
  const text = await ocrLine(scale(isolate(region, OVERLAY_LUMINANCE, OVERLAY_CHROMA), 2), OVERLAY_ALPHABET);
  const triple = TRIPLE.exec(text);

  if (!triple) {
    return null;
  }

  const [attack, defense, stamina] = triple.slice(1).map(Number) as [number, number, number];

  if ([attack, defense, stamina].some((v) => v > 15)) {
    return null;
  }

  const level = /L\s*(\d{1,2})/.exec(text.slice(0, triple.index));

  return { level: level ? Number(level[1]) : null, iv: { attack, defense, stamina } };
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
 * types narrow them further, and the overlay's IVs against the HP settle the rest — which is also what identifies a
 * Pokémon whose nickname has hidden its species. Costumes share their base form's stats, so they are folded into it
 * here and left to the `costume` search to report.
 *
 * The overlay's level is taken as a proposal rather than as a fact. It is the one field of the three that OCR gets
 * wrong with any regularity, because the `IV` label beside it reads as a `1` and runs into the digits, so it is kept
 * only where the HP agrees that the Pokémon can be that level and reported as a disagreement where it does not.
 */
export function identify(data: GameData, detail: Detail, overlay: Overlay | null): Identity {
  const notes: string[] = [];
  const iv = overlay?.iv ?? null;
  const species = detail.name ? closest(detail.name, data.species, (s) => s) : null;
  const nickname = detail.name && !species ? detail.name : null;
  const fits = (f: Form) =>
    (detail.types.length === 0 || sameTypes(f.types, detail.types)) &&
    (iv === null || detail.hp === null || levelsOf(data, f, iv, detail.hp).length > 0);

  let candidates = data.forms.filter((f) => f.species === species && fits(f));

  if (candidates.length === 0 && iv !== null && detail.hp !== null && detail.types.length > 0) {
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
  const consistent = form && iv && detail.hp !== null ? levelsOf(data, form, iv, detail.hp) : [];
  const stated = overlay?.level ?? null;
  const levels = stated !== null && consistent.includes(stated) ? [stated] : consistent;

  if (nickname && iv === null) {
    notes.push('a nickname hides the species, and only the IVs can say what it is');
  } else if (distinct.length === 0 && (species || nickname)) {
    notes.push('no form fits the HP, IVs and types read');
  } else if (alternatives.length > 0) {
    notes.push(`could also be ${alternatives.map(label).join(', ')}`);
  }

  if (stated !== null && consistent.length > 0 && !consistent.includes(stated)) {
    notes.push(`the overlay read level ${stated}, which this HP cannot be`);
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
