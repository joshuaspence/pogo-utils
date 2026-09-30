/**
 * The three screens a scan reads, and what each one says. Everything here is a pure function of a screenshot, so a
 * screenshot saved by `pnpm inventory snap` can be read again with `pnpm inventory parse` after a change, with no phone
 * attached — which is how these are meant to be tuned when a game update moves something.
 *
 * - The **detail** screen, scrolled to the top: CP, name or nickname, HP, weight, types and height.
 * - The same screen **scrolled down**: the fast move and one or two charged moves.
 * - **PGSharp's overlay** on the detail screen, which states the level and the three IVs outright.
 */

import {
  closest,
  cpOf,
  levelsOf,
  multiplierOf,
  type Form,
  type GameData,
  type IVs,
  type Move,
} from './game-master.mts';
import { fold, ocr, ocrLine, type Line } from './ocr.mts';
import { crop, isolate, scale, type Image } from './png.mts';

export interface Detail {
  /** What OCR made of the CP, which is usually nothing; `Identity.cp` is the one to believe. */
  cp: number | null;
  name: string | null;
  hp: number | null;
  weightKg: number | null;
  heightM: number | null;
  types: string[];
  /** Null where the species has no gender rather than where the symbol was not read; see `genderOf`. */
  gender: Gender | null;
  favourite: boolean;
  /** Null for the ordinary sizes, which wear no badge at all. */
  size: Size | null;
  /** The text of each tag chip under the HP, as read; matching them to the tags that exist is the caller's job. */
  tags: string[];
}

export type Gender = 'male' | 'female';
export type Size = 'XXL' | 'XXS';

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

export async function parseDetail(lines: readonly Line[], data: GameData, image: Image): Promise<Detail> {
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

  const row = lines.find((l) => /\d\s*(kg|m)\b/i.test(l.text));
  let weightKg = number(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  let heightM = number(/(\d+(?:[.,]\d+)?)\s*m\b/i);

  if (row) {
    weightKg ??= await measured(image, row, 0);
    heightM ??= await measured(image, row, 1 - MEASURE_WIDTH);
  }

  return {
    cp,
    name,
    hp,
    weightKg,
    heightM,
    types: await typesOf(lines, data, image),
    gender: hpLine ? genderOf(image, hpLine) : null,
    favourite: isFavourite(image),
    size: row ? await sizeOf(image, row) : null,
    tags: hpLine && row ? await tagsOn(image, hpLine, row) : [],
  };
}

/** Where the warm gold is in a region, and how much of it there is; the game fills a star and a size badge with it. */
function goldIn(image: Image): { left: number; top: number; width: number; height: number; fraction: number } {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  let gold = 0;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i] ?? 0;
      const g = image.data[i + 1] ?? 0;
      const b = image.data[i + 2] ?? 0;

      if (r >= 180 && g >= 110 && g <= 235 && b <= 130 && r - b >= 90) {
        gold++;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
    fraction: gold / (image.width * image.height),
  };
}

/**
 * `XXL`, `XXS`, or null for the ordinary sizes, which wear no badge. The badge is white on a gold pill above the
 * height, and the gold is what finds it: isolating the white text over the band it sits in turns the panel around it
 * black as well, since the panel is white too, and hands Tesseract a black page with one white island in it. Cropping
 * to the gold first makes the pill the whole page, where the text really is dark on light and reads at once.
 *
 * The gold also serves as the cheap test, since most Pokémon have no badge and can be answered without an OCR at all.
 * It is not sufficient on its own — a tall narrow patch of gold in one capture's artwork passed it — so the text still
 * has to say `XXL` or `XXS`, which that patch did not.
 */
async function sizeOf(image: Image, row: Line): Promise<Size | null> {
  const band = crop(image, image.width * 0.55, row.top - image.height * 0.04, image.width * 0.45, image.height * 0.04);
  const pill = goldIn(band);

  if (pill.fraction < SIZE_GOLD) {
    return null;
  }

  const badge = crop(band, pill.left, pill.top, pill.width, pill.height);
  const text = fold((await ocrLine(scale(isolate(badge, 200, 70), 3), SIZE_ALPHABET))?.text ?? '');

  return text.includes('xxl') ? 'XXL' : text.includes('xxs') ? 'XXS' : null;
}

/**
 * Whether the star at the top right is filled. A favourite's star is solid gold and an ordinary one is a white outline
 * with the artwork showing through it, so this is the one flag on the screen that colour alone settles: measured over
 * eighteen captures from two phones, 19.4% of that corner was gold on the one favourite and 0.00% on every other.
 *
 * The star is the game's own furniture rather than PGSharp's, so it scales with the screen and a fraction holds where
 * one for the overlay did not — 0.900, 0.074 of one phone against 0.903, 0.080 of the other.
 */
function isFavourite(image: Image): boolean {
  const star = crop(image, image.width * 0.86, image.height * 0.05, image.width * 0.1, image.height * 0.06);

  return goldIn(star).fraction >= FAVOURITE_GOLD;
}

/**
 * Male, female, or null for a species that has no gender. The symbol sits to the right of the HP bar and is the only
 * ink in that corner of the panel, so it is found by where the HP is rather than by a fraction of the screen.
 *
 * Colour cannot tell the two apart — both are drawn in the same pale blue-grey — so the shape does it. A male's arrow
 * leaves the circle up and to the right and a female's stem hangs below it, which makes the female's ink taller than
 * it is wide and the male's square. Measured on two phones at different resolutions, the ratio is 1.51 against 0.99
 * and 1.51 against 1.00, so the same threshold serves both; every one of the seven Xerneas captures reports no symbol
 * at all, which is right, since Xerneas has no gender.
 */
function genderOf(image: Image, hp: Line): Gender | null {
  const region = crop(image, image.width * 0.78, hp.top - hp.height * 4, image.width * 0.15, hp.height * 6);
  let left = region.width;
  let right = -1;
  let top = region.height;
  let bottom = -1;
  let ink = 0;

  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const i = (y * region.width + x) * 4;
      const r = region.data[i] ?? 0;
      const g = region.data[i + 1] ?? 0;
      const b = region.data[i + 2] ?? 0;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (luminance < GENDER_INK_MAX && Math.max(r, g, b) - Math.min(r, g, b) < GENDER_INK_CHROMA) {
        ink++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (ink < region.width * region.height * GENDER_INK_MIN) {
    return null;
  }

  return (bottom - top + 1) / Math.max(1, right - left + 1) >= GENDER_TALL ? 'female' : 'male';
}

/** A tag chip is the only coloured thing on the panel, and it is drawn between the HP and the weight. */
const TAG_CHROMA = 45;
const TAG_PANEL = { from: 0.12, width: 0.76 };

/**
 * A chip is a solid pill, so most of its own box is coloured, and it stands about a thirtieth of the screen tall.
 * Measured against a real one at 97 pixels on a 3040 screen, and against the strays that are not chips at 26 to 28.
 */
const TAG_FILL = 0.5;
const TAG_HEIGHT = 0.025;

/**
 * How much of the gap between the HP and the weight to look in. Not all of it: the type icons sit at the top of the
 * weight row and are coloured too, and a Pokémon whose types are colourful — a Woobat against a Normal-type Glameow —
 * has them in the same columns as its chip, which makes one run of the two and drops its fill from 86% to 34%.
 */
const TAG_BAND = 0.45;

/**
 * The tags a Pokémon carries, read off the chips the game draws under its HP. They are white on a coloured pill, so
 * the colour is what finds them — the panel around is white and so is the text — and each chip is cropped on its own
 * by the columns it occupies, since a Pokémon can carry several and reading the row whole would run their names
 * together.
 *
 * It answers what it read rather than what the tag is called: a caller that knows the names can match against them,
 * which is worth doing, since `Trade to 0xNULL` comes back as `Trade toOxNULL` and only agrees once folded.
 */
async function tagsOn(image: Image, hp: Line, row: Line): Promise<string[]> {
  const top = hp.top + hp.height;

  if (row.top <= top) {
    return [];
  }

  const band = crop(
    image,
    image.width * TAG_PANEL.from,
    top,
    image.width * TAG_PANEL.width,
    (row.top - top) * TAG_BAND,
  );
  const found: string[] = [];

  for (const chip of chipsIn(band, image.height * TAG_HEIGHT)) {
    const text = (await ocrLine(scale(isolate(crop(band, chip.left, chip.top, chip.width, chip.height), 200, 70), 2)))
      ?.text;

    if (text) {
      found.push(
        text
          .replace(/[^\p{L}\p{N} .'-]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
  }

  return found.filter(Boolean);
}

/** The coloured runs of columns in a band, one per chip, with the rows each of them actually occupies. */
function chipsIn(band: Image, tallest: number): { left: number; top: number; width: number; height: number }[] {
  const coloured = (x: number, y: number) => {
    const i = (y * band.width + x) * 4;
    const r = band.data[i] ?? 0;
    const g = band.data[i + 1] ?? 0;
    const b = band.data[i + 2] ?? 0;

    return Math.max(r, g, b) - Math.min(r, g, b) >= TAG_CHROMA;
  };

  const filled: boolean[] = [];

  for (let x = 0; x < band.width; x++) {
    filled[x] = false;

    for (let y = 0; y < band.height && !filled[x]; y++) {
      filled[x] = coloured(x, y);
    }
  }

  const chips: { left: number; top: number; width: number; height: number }[] = [];
  let start = -1;

  for (let x = 0; x <= band.width; x++) {
    if (filled[x]) {
      start = start < 0 ? x : start;
      continue;
    }

    if (start < 0) {
      continue;
    }

    let top = band.height;
    let bottom = -1;
    let n = 0;

    for (let y = 0; y < band.height; y++) {
      for (let cx = start; cx < x; cx++) {
        if (coloured(cx, y)) {
          n++;
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }

    const height = bottom - top + 1;
    const width = x - start;

    if (height >= tallest && n >= width * height * TAG_FILL) {
      chips.push({ left: start, top, width, height });
    }

    start = -1;
  }

  return chips;
}

/** Only what a weight or a height is written with; the `g` of `kg` is dropped often enough not to be relied on. */
const MEASURE_ALPHABET = '0123456789.,kgm ';
const MEASURE_WIDTH = 0.38;

/**
 * The weight or the height read off its own end of the row they share, for when the whole-screen pass missed it. The
 * number rather than the unit is what is matched, because the unit is the part that goes: a Cyndaquil's `5.42kg` came
 * back as `5.42k` and was rejected for want of a `g`. A decimal point is what makes a bare number safe to take — every
 * weight and height the game shows carries one, and the stray digits this crop picks up out of the artwork do not.
 */
async function measured(image: Image, row: Line, from: number): Promise<number | null> {
  const band = crop(
    image,
    image.width * from,
    row.top - row.height * 0.25,
    image.width * MEASURE_WIDTH,
    row.height * 1.5,
  );
  const text = (await ocrLine(scale(band, 2), MEASURE_ALPHABET))?.text ?? '';
  const value = /(\d+[.,]\d+)/.exec(text)?.[1];

  return value === undefined ? null : Number(value.replace(',', '.'));
}

/** Only letters and the slash between two types; the row also holds `WEIGHT` and `HEIGHT`, which are letters too. */
const TYPE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ/ ';

/**
 * The types, read off the row of labels under the weight rather than out of the whole-screen pass. That row is small
 * grey capitals and the sparse pass mangles it — `WEIGHT` comes back as `EI` and a `T`, and the type between them
 * usually not at all, which measured **6 of 25** on a corpus of real screens. Found by the weight and read on its own
 * at double size it measured **24 of 25**, and it recovers the second type as well, where the whole-screen pass had
 * been reporting `ice` for a Pokémon that is `Ice / Flying`.
 *
 * This is worth more than one column: `identify` narrows its candidates by type, so a missing pair is the difference
 * between naming a form and answering `could also be Meganium, Sunkern, Treecko, …`.
 */
async function typesOf(lines: readonly Line[], data: GameData, image: Image): Promise<string[]> {
  const names = new Map(data.types.map((t) => [fold(t), t]));
  const found = (text: string) =>
    fold(text)
      .split(' ')
      .filter((w) => names.has(w))
      .map((w) => names.get(w) ?? w);
  // Either of the pair will do, since the weight and the height sit on one row and the labels on the row beneath it —
  // and taking only the weight lost a Cyndaquil whose `0.44m` read perfectly and whose `kg` did not.
  const beside = lines.find((l) => /\d\s*(kg|m)\b/i.test(l.text));

  if (beside) {
    // Generous, because the band is measured in the anchor's own height and the two anchors do not report the same
    // one: `0.44m` came back 45 tall where `5.42kg` beside it came back 58, and a band sized off the shorter of them
    // ended six pixels into the labels and lost a Cyndaquil's `FIRE`. The alphabet keeps the digits above out of it.
    const band = crop(
      image,
      image.width * 0.25,
      beside.top + beside.height * 0.8,
      image.width * 0.5,
      beside.height * 2,
    );
    const read = found((await ocrLine(scale(band, 2), TYPE_ALPHABET))?.text ?? '');

    if (read.length > 0) {
      return read;
    }
  }

  // Where neither was read there is nothing to find the row by, so fall back on the whole-screen pass.
  const line = lines.find((l) => {
    const words = fold(l.text).split(' ').filter(Boolean);

    return words.length > 0 && words.length <= 2 && words.every((w) => names.has(w));
  });

  return line ? found(line.text) : [];
}

/**
 * The moves, read out of the rows beneath the `GYMS & RAIDS` tabs. That tab row is the anchor because it is the one
 * thing that sits immediately above the moves and nothing else does — found on all fifty screens of a corpus — where
 * the weight and height it used to be measured from are most of a screen away and leave everything between them in
 * play. Bounding the region below matters as much: `CAUGHT IN THE WILD` and the rest are ordinary prose that a fuzzy
 * match will happily take for a short move, and reading down into them produced a `Rest` and a `Fly` that neither
 * Pokémon could learn.
 *
 * Each row is matched against the moves that form can actually hold before the whole list is considered, which is a
 * choice among a median of seven rather than among 328 and so affords far more slack: `oO Tackle`, where the type
 * icon has come through as two letters, is two edits from `Tackle` and was rejected outright against the full list.
 * A row that still does not match is cropped and read again on its own, and that rescue answers only to the pool,
 * since it is the reading least worth trusting against everything.
 *
 * Measured over fifty screens from two phones: 45 of 50 fast moves and 45 charged before, 50 and 50 after, with
 * nothing read that its Pokémon could not learn, for half a rescue read per screen.
 */
export async function parseMoves(
  lines: readonly Line[],
  data: GameData,
  form: Form | null,
  image: Image,
): Promise<Moves> {
  const pool = form?.moves ?? [];
  const found: Move[] = [];

  for (const row of moveRows(lines)) {
    const move = moveIn(row.text, pool, data.moves) ?? (await moveUnder(image, row, pool));

    if (move) {
      found.push(move);
    }
  }

  return {
    fast: found.find((m) => m.fast)?.name ?? null,
    charged: found
      .filter((m) => !m.fast)
      .slice(0, 2)
      .map((m) => m.name),
  };
}

/** The lines that can be a move: under the tabs, above the catch details, and carrying letters rather than a power. */
function moveRows(lines: readonly Line[]): Line[] {
  const tab = lines.find((l) => MOVE_TAB.test(fold(l.text)));
  // Without the tabs, fall back on the weight and height, which are at least above the moves. The HP has to be named
  // rather than matched as a pair of numbers around a slash, since `30/09/2026` in the catch details is one too, and
  // sits *below* the moves — measured, that alone lost every move of a live scan.
  const above = lines.filter(
    (l) => /\d\s*(kg|m)\b/i.test(l.text) || (/\d\s*\/\s*\d/.test(l.text) && /hp/i.test(l.text)),
  );
  const floor = tab ? tab.top + tab.height : Math.max(-Infinity, ...above.map((l) => l.top + l.height));
  const rows: Line[] = [];

  for (const line of [...lines].filter((l) => l.top > floor).sort((a, b) => a.top - b.top)) {
    if (BELOW_MOVES.test(fold(line.text))) {
      break;
    }

    if (line.text.replace(/[^A-Za-z]/g, '').length >= 3) {
      rows.push(line);
    }
  }

  return rows.slice(0, MOVE_ROWS);
}

/**
 * The move a row names. A charged move is followed by its energy bar, which comes through as a couple of short
 * nonsense tokens — `© Energy Ball ay Ay` — and four characters of them is enough to put the row past the slack. So
 * the whole row is tried first and short trailing tokens dropped one at a time only while nothing has matched:
 * longest-first is what stops `Aqua Jet` being shortened to `Aqua`, which matches nothing at all.
 */
function moveIn(text: string, pool: readonly Move[], all: readonly Move[]): Move | null {
  let words = text.replace(/\d+/g, '').split(/\s+/).filter(Boolean);

  for (;;) {
    const joined = words.join(' ');
    const move =
      (pool.length > 0 ? closest(joined, pool, (m) => m.name, POOL_SLACK) : null) ??
      (all.length > 0 ? closest(joined, all, (m) => m.name, MOVE_SLACK) : null);
    const last = words.at(-1);

    if (move !== null || last === undefined || last.length > MOVE_NOISE) {
      return move;
    }

    words = words.slice(0, -1);
  }
}

/** A row read again on its own, doubled, for the rows the whole-screen pass only half caught — `t Breath` for `Frost
 * Breath`, where the icon and the first letters were lost. Only the pool is offered, since a rescue read is the least
 * trustworthy text on the screen and the whole list would take almost anything. */
async function moveUnder(image: Image, row: Line, pool: readonly Move[]): Promise<Move | null> {
  if (pool.length === 0) {
    return null;
  }

  const band = crop(image, 0, row.top - row.height * 0.3, image.width * MOVE_WIDTH, row.height * 1.6);

  return moveIn((await ocrLine(scale(band, 2), MOVE_ALPHABET))?.text ?? '', pool, []);
}

/** Where PGSharp draws its overlay, as fractions of the screen's width and height. */

export interface OverlayBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Overlay {
  /**
   * Every level the overlay's digits could be saying, rather than one. The small-caps `L` reads as an `L` on one
   * phone and a `1` on another, and the `IV` label after the level reads as another `1`, so `151` is `L15` followed
   * by that stray or a stray followed by `51` and nothing in the string says which. Offering both and letting the HP
   * choose settles it, and settles the HP's own ambiguity in the same step — `identify` does the intersecting.
   */
  levels: number[];
  iv: IVs;
}

/** Only these survive the whitelist: the level's `L`, the digits and the slashes between the three IVs. */
const OVERLAY_ALPHABET = 'L0123456789/ ';

/** Bright enough to be the overlay's white text, and flat enough in colour not to be its IV percentage. */
const OVERLAY_LUMINANCE = 150;
const OVERLAY_CHROMA = 55;

const TRIPLE = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/;

/**
 * How far left of the three IVs the box reaches, in characters, which is what it is measured in. `L25 IV86 14/13/12`
 * is eighteen, and the generosity beyond that is not spare: the em it is multiplied by is estimated from whatever
 * line was recognised, often the triple alone, and a short triple under-estimates it. At 19 a box tightened on one
 * Pokémon clipped the `L31` off the next while keeping its IVs — which reads as a success, so nothing widened the box
 * and the level was simply lost. Measured per phone over 62 screens, 19 reads 49 of 50 levels and 30 reads all of
 * them, with no reading gained or lost elsewhere.
 */
const OVERLAY_CHARACTERS = 30;

/** How far a row may be from a move's name, and how short a trailing token has to be to be an energy bar. */
const MOVE_SLACK = 0.2;
const MOVE_NOISE = 3;

/** A form's own pool is a median of seven moves against 328, so a row may be much further from one of those. */
const POOL_SLACK = 0.45;

/** The tabs directly above the moves, and the first of whatever follows them. */
const MOVE_TAB = /\b(gyms|raids|trainer battles)\b/;
const BELOW_MOVES = /\b(new attack|caught|hatched|traded|swap buddies|transfer|appraise)\b/;

/** Three rows of moves and a little slack; and how much of the width a name can occupy, short of its power. */
const MOVE_ROWS = 6;
const MOVE_WIDTH = 0.62;

/** Move names are words, with a hyphen in a few — `Lock-On`, `Power-Up Punch` — and nothing else. */
const MOVE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-' ";

/** Level 51 is a best buddy's; nothing the overlay can be saying is higher. */
const MAX_LEVEL = 51;

/** A filled star measured 19.4% gold and an outline 0.00%, so anywhere between them will do. */
const FAVOURITE_GOLD = 0.02;

/** The size badge's pill, and the only three letters it can spell. */
const SIZE_GOLD = 0.01;
const SIZE_ALPHABET = 'XSL';

/** The gender symbol against the white panel behind it, and how tall its ink has to be to be a female's. */
const GENDER_INK_MAX = 235;
const GENDER_INK_CHROMA = 45;
const GENDER_INK_MIN = 0.01;
const GENDER_TALL = 1.25;

/**
 * Where the overlay sits, found by the one thing nothing else on the screen carries: three small numbers separated by
 * slashes. This is the expensive half and it only has to work once — a caller finds the box on whichever Pokemon it
 * first succeeds on and reads every later one straight out of it, which is what keeps this independent of the phone.
 * PGSharp draws the overlay itself rather than leaving it to Unity, so the box does not move between species; what it
 * does do is move between devices, which is why this is found rather than configured.
 */
/** How far down the screen the overlay can sit, and how tall a band to sweep, as fractions of the screen's height. */
const OVERLAY_FROM = 0.08;
const OVERLAY_TO = 0.45;
const OVERLAY_BAND = 0.03;

/**
 * How much of the width to sweep, centred. PGSharp centres the overlay — measured at 718 and 720 against a screen
 * centre of 720 on one phone and 501 against 504 on another — and the widest of those boxes is 38% of its screen, so
 * this is generous. What it buys is leaving out whatever sits along the edges, the movable PGSharp toolbar in
 * particular, which is otherwise read as part of the same line.
 */
const OVERLAY_SPAN = 0.7;

/**
 * Where the overlay sits, found by sweeping narrow bands down the upper screen, isolating each and reading it. The
 * obvious cheaper thing — looking for the triple among the lines a whole-screen read already produced — was tried and
 * dropped: it found the box on nine of twelve captures from one phone and on none at all from another, where the text
 * sat across the boundary of the inverted crop `readLines` makes and was too low in contrast against the artwork for
 * the sparse pass either side of it. Isolating first is what makes the line legible, and a band is small enough that
 * the rest of the screen cannot drown it. Each band is read as a line rather than sparsely, which is what a band is by
 * construction and is not a detail: the same band holding `L1 IV48 5/2/15` reads as `r '` sparse, because sparse mode
 * takes the isolated blocks either side for pictures. A sweep costs a second or two and is only ever paid once.
 */
export async function findOverlay(image: Image): Promise<OverlayBox | null> {
  const height = Math.round(image.height * OVERLAY_BAND);
  const step = Math.max(1, Math.round(height / 3));
  const width = Math.round(image.width * OVERLAY_SPAN);
  const left = Math.round((image.width - width) / 2);

  for (let top = Math.round(image.height * OVERLAY_FROM); top < image.height * OVERLAY_TO; top += step) {
    const band = isolate(crop(image, left, top, width, height), OVERLAY_LUMINANCE, OVERLAY_CHROMA);
    const line = await ocrLine(scale(band, 2));

    if (line && TRIPLE.test(line.text)) {
      // The band itself, which is already the right shape: as wide as the sweep, and tall enough to hold the line it
      // was just read out of. Sizing a box from that line instead does not work, because reading a band as one line
      // is exactly what makes its width meaningless — everything in the band comes back as one box, which on one
      // capture spanned 626 pixels against a true 329 and on another sat 250 to the right of the text. So the band is
      // the floor, and `tighten` improves on it where it can.
      const band = within({
        x: left / image.width,
        y: top / image.height,
        width: width / image.width,
        height: height / image.height,
      });

      return (await tighten(image, band)) ?? band;
    }
  }

  return null;
}

/**
 * A second look at the band the sweep matched, measured from the three IVs alone. A band is a good enough crop to read
 * from — ten of twelve captures on one phone and both on another — but a tight box is better, twelve of twelve, and a
 * crop is small enough for the sparse mode to pick the triple out where it could not in the band it came from.
 *
 * Answers null where the sparse pass finds nothing, which is not a failure and must not be treated as one: the band it
 * was handed already contains the text, and on the second phone this null is the difference between reading the
 * overlay and reading nothing at all.
 */
async function tighten(image: Image, box: OverlayBox): Promise<OverlayBox | null> {
  const left = box.x * image.width;
  const top = box.y * image.height;
  const region = crop(image, left, top, box.width * image.width, box.height * image.height);
  const inner = (await ocr(scale(isolate(region, OVERLAY_LUMINANCE, OVERLAY_CHROMA), 2))).find((l) =>
    TRIPLE.test(l.text),
  );

  return inner
    ? boxAround({ ...inner, left: left + inner.left / 2, top: top + inner.top / 2, width: inner.width / 2 }, image)
    : null;
}

/**
 * The box around a line the overlay was recognised in. It is sized from the width of one character rather than from
 * the height Tesseract reports, because that height is not trustworthy: measured over twelve captures the same overlay
 * came back 25, 28, 49 and 54 pixels tall as the row was merged with whatever fragment of the artwork sat beside it,
 * and padding a 54 by half of itself reaches far enough into the picture to undo the whole point of cropping.
 * Character width does not wander — 270/17, 264/17 and 130/8 across those captures are within a pixel of each other.
 * It is anchored on the right edge and extended left, since the part that goes missing is always the left: where only
 * the three IVs are legible the level and the percentage ahead of them are still there to be read.
 */
function boxAround(line: { left: number; top: number; width: number; text: string }, image: Image): OverlayBox {
  const em = line.width / Math.max(1, line.text.length);
  const right = line.left + line.width + em;
  const left = right - OVERLAY_CHARACTERS * em;

  return within({
    x: left / image.width,
    y: (line.top - em * 0.7) / image.height,
    width: (right - left) / image.width,
    height: (em * 3) / image.height,
  });
}

/**
 * A box kept inside the screen. `crop` clamps anyway, so this changes no reading — but a box is also what `--config`
 * takes and what `snap` prints for someone to copy, and a reach of thirty characters off an em measured on the three
 * IVs alone, which are all wide digits and slashes, comes out past the left edge often enough to be worth not
 * reporting as `x: -0.17`.
 */
function within(box: OverlayBox): OverlayBox {
  const x = Math.max(0, Math.min(1, box.x));
  const y = Math.max(0, Math.min(1, box.y));

  return { x, y, width: Math.min(1 - x, box.width + box.x - x), height: Math.min(1 - y, box.height + box.y - y) };
}

/** The smallest box covering both, so a box that clipped one Pokémon's line grows rather than flips between them. */
export function widen(a: OverlayBox, b: OverlayBox): OverlayBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);

  return within({
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  });
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
  const line = await ocrLine(scale(isolate(region, OVERLAY_LUMINANCE, OVERLAY_CHROMA), 2), OVERLAY_ALPHABET);
  const text = line?.text ?? '';
  const triple = TRIPLE.exec(text);

  if (!triple) {
    return null;
  }

  const [attack, defense, stamina] = triple.slice(1).map(Number) as [number, number, number];

  if ([attack, defense, stamina].some((v) => v > 15)) {
    return null;
  }

  return { levels: levelsIn(text.slice(0, triple.index)), iv: { attack, defense, stamina } };
}

/**
 * Every level the digits ahead of the IVs could be: each one and two digit piece of every run of them, since which end
 * of a run carries the stray `1` is exactly what cannot be told from the text. Restricting this to the first run was
 * tried, on the reasoning that the percentage behind the level only adds noise, and it is the artwork ahead of the
 * level that adds more — a band wide enough to find the overlay on one phone is wide enough to read a stray `4` to the
 * left of it, which was then the only candidate and disagreed with an HP that was perfectly clear. Being generous is
 * safe here: this is a shortlist for the HP to choose from, not an answer.
 */
function levelsIn(text: string): number[] {
  const levels = new Set<number>();

  for (const [digits] of text.matchAll(/\d+/g)) {
    for (let at = 0; at < digits.length; at++) {
      for (const length of [1, 2]) {
        const piece = digits.slice(at, at + length);
        const level = Number(piece);

        if (piece.length === length && level >= 1 && level <= MAX_LEVEL) {
          levels.add(level);
        }
      }
    }
  }

  return [...levels];
}

export interface Identity {
  form: Form | null;
  /**
   * The CP this form at these IVs shows at this level, worked out rather than read. Null where the level is still
   * ambiguous, since two levels are two CPs and guessing between them would be worse than saying nothing.
   */
  cp: number | null;
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
  const stated = overlay?.levels ?? [];
  const agreed = consistent.filter((l) => stated.includes(l));
  const levels = agreed.length > 0 ? agreed : consistent;

  if (nickname && iv === null) {
    notes.push('a nickname hides the species, and only the IVs can say what it is');
  } else if (distinct.length === 0 && (species || nickname)) {
    notes.push('no form fits the HP, IVs and types read');
  } else if (alternatives.length > 0) {
    notes.push(`could also be ${alternatives.map(label).join(', ')}`);
  }

  if (stated.length > 0 && consistent.length > 0 && agreed.length === 0) {
    notes.push(`the overlay reads as level ${stated.join(' or ')}, none of which this HP can be`);
  }

  if (levels.length > 1) {
    notes.push(`level ambiguous: ${levels.join(' or ')}`);
  }

  const settled = levels.length === 1 ? (levels[0] ?? null) : null;
  const multiplier = settled === null ? null : multiplierOf(data, settled);
  const cp = form && iv && multiplier !== null ? cpOf(form, iv, multiplier) : null;

  // Where OCR did read the CP it is worth saying so, since the two disagreeing means the level or the form is wrong
  // rather than that the arithmetic is: CP is a pure function of the three things above it.
  if (cp !== null && detail.cp !== null && cp !== detail.cp) {
    notes.push(`the screen reads CP ${detail.cp}, where this form at this level is ${cp}`);
  }

  return { form, cp, alternatives, levels, nickname, notes };
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
