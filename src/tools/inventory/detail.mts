/**
 * The detail screen's own text, scrolled to the top. Every field is located by what sits beside it rather than by a
 * coordinate, which is what holds across phones of different resolutions.
 *
 * `parseDetail` fills one `Detail` from these text readers and `badges.mts`'s pixel readers. `wholeCp` isolates the CP
 * band against the overlay's near-white thresholds, the CP being white text over artwork as PGSharp's digits are.
 */

import { closest, cpOf, type GameData } from './game-master.mts';
import { fold, ocr, ocrLine, type Line } from './ocr.mts';
import { crop, isolate, scale, type Image } from './png.mts';
import { genderOf, isFavourite, sizeOf, tagsOn, type Gender, type Size } from './badges.mts';
import { OVERLAY_CHROMA, OVERLAY_LUMINANCE } from './overlay.mts';
export interface Detail {
  /** What OCR made of the CP, which is white over the artwork and read on about half the captures. */
  cp: number | null;
  /**
   * What the CP region reads where no line carrying the label was recognised at all. Not to be trusted — right 14
   * times and wrong twice over the captures that reach it — so never `cp`. It is for narrowing a choice of forms, and
   * only where the arithmetic reproduces one exactly, a test both wrong reads fail.
   */
  cps: number[];
  name: string | null;
  hp: number | null;
  weight: number | null;
  height: number | null;
  types: string[];
  /**
   * Null where the species has no gender, and where there was no HP line to find the symbol beside. A null `hp` beside
   * it says which.
   */
  gender: Gender | null;
  favourite: boolean;
  /** Null for the two ordinary bands in the middle, which wear no badge at all. */
  size: Size | null;
  /**
   * The text of each tag chip under the HP, as read; matching them to the tags that exist is the caller's job. Empty
   * where no chip is drawn, and where the HP or the measurement row the chips sit between was not read.
   */
  tags: string[];
}

/** Everything OCR read off an image: the whole of it, then the top fifth again inverted, where the CP is white. */
export async function readLines(image: Image): Promise<Line[]> {
  const top = Math.round(image.height / 5);
  const [all, sky] = await Promise.all([ocr(image), ocr(crop(image, 0, 0, image.width, top, true))]);

  return [...all, ...sky].sort((a, b) => a.top - b.top || a.left - b.left);
}

/**
 * The small `CP` beside the number is often read with a stray letter after it (`cPe518`), as `GP`, or — the one that
 * cost a capture its whole form — as `ce`: `deoxys-attack.png` reads `ce1441`, digits perfectly right and the `P`
 * taken for an `e`. Both halves of the label are a glyph OCR gets wrong, so both are a pair rather than a letter.
 *
 * It admits 23 captures, 18 reading the CP exactly, and `wholeCp` recovers the other five. The two go together: the
 * label says which line, the band says the whole number.
 */
export const CP_LABEL = /\b[cg][pe]\s?[a-z]?\s?(\d{2,5})\b/;

export async function parseDetail(lines: readonly Line[], data: GameData, image: Image): Promise<Detail> {
  const cpLine = lines.find((l) => l.top < image.height / 4 && CP_LABEL.test(fold(l.text)));
  const read = cpLine ? (CP_LABEL.exec(fold(cpLine.text))?.[1] ?? null) : null;
  const whole = cpLine && read !== null ? wholeCp(image, cpLine, read, cpDigits(data)) : null;

  // `97 / 97 HP` or `HP 97/97`; the second number is the maximum, which is the one CP and level determine.
  const hpPattern = /(?:hp\s*)?(\d{1,4})\s*\/\s*(\d{1,4})(?:\s*hp)?/i;
  const hpLine = lines.find((l) => /hp/i.test(l.text) && hpPattern.test(l.text));
  const hp = hpLine ? Number(hpPattern.exec(hpLine.text)?.[2]) : null;

  // The nearest line above the HP bar; a nickname reads here as readily as a species, and a player can set one that is
  // no words at all. Three letters or two digits, measured rather than guessed: the name sits 117 to 173 pixels above
  // the HP across the corpus, and what sits nearer is the bar's own furniture, read as `os` or `oy` on five captures
  // at a gap of 57 to 62. Two characters of anything admits those and they win for being nearest.
  const nameLine = hpLine
    ? lines
        .filter((l) => l.top + l.height <= hpLine.top + 4 && l !== cpLine && /\p{L}{3}|\p{N}{2}/u.test(l.text))
        .filter((l) => !CP_LABEL.test(fold(l.text)))
        .at(-1)
    : undefined;
  const name = nameLine ? sanitise(nameLine.text) : null;

  // The name again off its own band, where what the pass found is no species. Taken only where the band itself names
  // one, so it can turn a missed name into the name and never one species into another: `articuno-kanto.png` detects
  // no name line at all and files a fragment of artwork 487 pixels up as a nickname, where `ho-oh.png`'s band reads
  // the green `LUCKY POKEMON` line, which `closest` rejects. Over the corpus three captures reach this, one is rescued
  // and two keep the nickname they have.
  const rescued =
    hpLine && (name === null || closest(name, data.species, (s) => s) === null)
      ? named(image, hpLine, data.species)
      : null;

  const number = (pattern: RegExp) => {
    const line = lines.find((l) => pattern.test(l.text));
    const value = line ? pattern.exec(line.text)?.[1] : undefined;
    return value === undefined ? null : Number(value.replace(',', '.'));
  };

  const row = lines.find((l) => measurement(l.text));
  // The size badge sits over the height in particular, so that line is found on its own rather than taken from the row
  // the two share — which is the weight as often as not.
  const heightLine = lines.find((l) => HEIGHT.test(l.text));
  const weight = number(WEIGHT) ?? (row ? measured(image, row, 0) : null);
  const height = number(HEIGHT) ?? (row ? measured(image, row, 1 - MEASURE_WIDTH) : null);

  // A badged height is suspect where an unbadged one is not, the pill's tail descending into the digits it is drawn
  // over: `spoink.png` renders `1.1m` and the whole-screen pass reads `1.4m`. Reading that line on its own answers
  // `1.1m`.
  //
  // Gated on the badge rather than run on every capture, though either would be safe — the cropped read agrees with
  // all 43 heights. Five wear a badge, so this is five more OCR passes rather than 43.
  const badged = heightLine
    ? sizeOf(image, heightLine).then(async (size) => ({
        size,
        height: size === null ? null : await remeasured(image, heightLine),
      }))
    : null;

  // None of these reads waits on another, and `ocr.mts` holds each Tesseract process to one thread so they can run
  // side by side — a screen reaching every rescue is a dozen reads.
  const [cpWhole, nameRescued, weightRead, heightRead, sized, cps, types, tags] = await Promise.all([
    whole,
    rescued,
    weight,
    height,
    badged,
    cpLine ? [] : cpsIn(image),
    typesOf(lines, data, image),
    hpLine && row ? tagsOn(image, hpLine, row) : [],
  ]);

  return {
    cp: read === null ? null : Number(cpWhole ?? read),
    cps,
    name: nameRescued ?? name,
    hp,
    weight: weightRead,
    height: sized?.height ?? heightRead,
    types,
    gender: hpLine ? genderOf(image, hpLine) : null,
    favourite: isFavourite(image),
    size: sized?.size ?? null,
    tags,
  };
}

/**
 * Every number the CP region reads where no line carrying the label was found to anchor on. Three Deoxys and Dialga
 * captures are the reason: each states a CP that separates its form from the others sharing its stamina, and each
 * reads nothing the pattern accepts.
 *
 * Unanchored and so unreliable — right 14 times, wrong twice and silent 4 over the 20 captures that reach it — which
 * is why these are candidates rather than an answer. A candidate is kept only where the arithmetic reproduces it, and
 * `19464` is no CP an Articuno can show.
 */
async function cpsIn(image: Image): Promise<number[]> {
  const band = crop(
    image,
    image.width * CP_SWEEP.x,
    image.height * CP_SWEEP.y,
    image.width * CP_SWEEP.width,
    image.height * CP_SWEEP.height,
  );
  const text = (await ocrLine(scale(band, 2), CP_ALPHABET)) ?? '';

  return [...text.matchAll(/\d{3,5}/g)].map(([digits]) => Number(digits));
}

/**
 * The CP again, out of a band round the line the whole-screen pass found, where that pass lost a digit or two off one
 * end. White over the artwork is the hardest text on the screen: five captures read `46` for 746, `38` for 738, `48`
 * for 487, `15` for 1569 and `170` for 1705.
 *
 * Accepted only where the band's number **begins or ends with** the line's and is longer, which makes this a rescue
 * rather than a second opinion: it says the band found more of the same number, so a band that misreads outright is
 * rejected for disagreeing. Bounded by a CP's own length, so a `15` is not rescued into a five-digit `15691`.
 */
async function wholeCp(image: Image, line: Line, read: string, longest: number): Promise<string | null> {
  for (const reach of CP_PADS) {
    const pad = Math.round(line.height * reach);
    const band = crop(image, line.left - pad, line.top - pad, line.width + pad * 2, line.height + pad * 2);

    for (const treat of [(b: Image) => b, (b: Image) => isolate(b, OVERLAY_LUMINANCE, OVERLAY_CHROMA)]) {
      const text = (await ocrLine(scale(treat(band), 2), CP_ALPHABET)) ?? '';

      for (const digits of text.match(/\d+/g) ?? []) {
        if (
          digits.length > read.length &&
          digits.length <= longest &&
          (digits.startsWith(read) || digits.endsWith(read))
        ) {
          return digits;
        }
      }
    }
  }

  return null;
}

/** Only what a weight or a height is written with; the `g` of `kg` is dropped often enough not to be relied on. */
const MEASURE_ALPHABET = '0123456789.,kgm ';

/** How far above the HP the name band reaches, in the HP line's own heights, and how much of the width it omits. */
const NAME_RISE = 5;
const NAME_INSET = 0.1;
const NAME_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ♀♂.'-";
const MEASURE_WIDTH = 0.38;

/**
 * A weight and a height, which the game always writes with a decimal point. Requiring one is what makes these safe to
 * search the whole screen for, where a bare `\d\s*(kg|m)` is not: the status bar's `09:00` reads as `0900 M © Os` and
 * PGSharp's overlay offers a `53 m`. Both sit above the panel, so a bare pattern puts the size band off the top of the
 * screen and reports no badge over a gold `XXL`.
 *
 * Separate because the two are read as separate lines at the same height — `0.97kg` at x 131 and `0.15m` at x 759 — so
 * a caller wanting one cannot take it from whichever the row happened to be.
 */
const WEIGHT = /(\d+[.,]\d+)\s*kg\b/i;
export const HEIGHT = /(\d+[.,]\d+)\s*m\b/i;

export const measurement = (text: string) => WEIGHT.test(text) || HEIGHT.test(text);

/**
 * What a name may be made of after OCR. `%` is here because it is a character a nickname can be made of, and stripping
 * it left `96` for `96%`; the gender signs because two species' own names carry one.
 */
const sanitise = (text: string) => text.replace(/[^\p{L}\p{N} .'%♀♂:-]/gu, '').trim() || null;

/**
 * The name read off the band between the artwork and the HP bar, answered only where it is a species' name, which is
 * what makes it safe to prefer over the whole-screen pass. Measured in the HP's own height rather than a fraction of
 * the screen, since that is what holds across phones: the name sits 117 to 173 pixels above an HP line Tesseract
 * reports as 37 to 45 tall, so five of those covers it.
 */
async function named(image: Image, hp: Line, species: readonly string[]): Promise<string | null> {
  const band = crop(
    image,
    image.width * NAME_INSET,
    hp.top - hp.height * NAME_RISE,
    image.width * (1 - NAME_INSET * 2),
    hp.height * NAME_RISE,
  );
  const text = sanitise((await ocrLine(scale(band, 2), NAME_ALPHABET)) ?? '');

  return text !== null && closest(text, species, (s) => s) !== null ? text : null;
}

/**
 * A height read off its own line, for when the whole-screen pass read one the size badge had corrupted. Anchored on
 * the line Tesseract already found and reaching a character's height either side so a leading digit cannot be clipped.
 *
 * `m` is required here where `measured` takes a bare decimal, this being only ever asked about a height and the crop
 * wide enough to catch the weight's digits at the other end of the row.
 */
async function remeasured(image: Image, line: Line): Promise<number | null> {
  const band = crop(
    image,
    line.left - line.height,
    line.top - line.height * 0.4,
    line.width + line.height * 2,
    line.height * 1.8,
  );
  const text = (await ocrLine(scale(band, 2), MEASURE_ALPHABET)) ?? '';
  const value = HEIGHT.exec(text)?.[1];

  return value === undefined ? null : Number(value.replace(',', '.'));
}

/**
 * The weight or the height read off its own end of the row they share, for when the whole-screen pass missed it. The
 * number rather than the unit, the unit being the part that goes: a Cyndaquil's `5.42kg` came back `5.42k`. A decimal
 * point is what makes a bare number safe to take, every weight and height carrying one where stray artwork digits do
 * not.
 */
async function measured(image: Image, row: Line, from: number): Promise<number | null> {
  const band = crop(
    image,
    image.width * from,
    row.top - row.height * 0.25,
    image.width * MEASURE_WIDTH,
    row.height * 1.5,
  );
  const text = (await ocrLine(scale(band, 2), MEASURE_ALPHABET)) ?? '';
  const value = /(\d+[.,]\d+)/.exec(text)?.[1];

  return value === undefined ? null : Number(value.replace(',', '.'));
}

/** Only letters and the slash between two types; the row also holds `WEIGHT` and `HEIGHT`, which are letters too. */
const TYPE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ/ ';

/**
 * The types, read off the row of labels under the weight rather than out of the whole-screen pass. That row is small
 * grey capitals and the sparse pass mangles it, measuring **6 of 25** on real screens; found by the weight and read on
 * its own at double size it measured **24 of 25**, and recovers the second type where the pass had been reporting
 * `ice` for a Pokémon that is `Ice / Flying`.
 *
 * Worth more than one column: the types are what narrow a species' candidates to a form.
 */
async function typesOf(lines: readonly Line[], data: GameData, image: Image): Promise<string[]> {
  const names = new Map(data.types.map((t) => [fold(t), t]));

  // Matched across whatever spaces Tesseract put inside a name, but only where it begins at a word boundary. An exact
  // word match loses a name the reader split, as `IT POISO N` is; the boundary is what keeps this from being a free
  // substring search, `WEIGH TICE` otherwise inventing an `ice`. No type name prefixes another, so the first that fits
  // a given start is the only one that can.
  const found = (text: string) => {
    const words = fold(text).split(' ').filter(Boolean);

    return words.flatMap((_, i) => {
      const rest = words.slice(i).join('');
      const key = [...names.keys()].find((k) => rest.startsWith(k));

      return key === undefined ? [] : [names.get(key) as string];
    });
  };

  // Either of the pair will do, since the weight and the height sit on one row and the labels on the row beneath it —
  // and taking only the weight lost a Cyndaquil whose `0.44m` read perfectly and whose `kg` did not.
  const beside = lines.find((l) => measurement(l.text));

  if (beside) {
    // Generous, because the band is measured in the anchor's own height and the two anchors disagree: `0.44m` came
    // back 45 tall where `5.42kg` beside it came back 58, and a band sized off the shorter ended six pixels into the
    // labels and lost a Cyndaquil's `FIRE`. The alphabet keeps the digits above out of it.
    const band = crop(
      image,
      image.width * 0.25,
      beside.top + beside.height * 0.8,
      image.width * 0.5,
      beside.height * 2,
    );
    const read = found((await ocrLine(scale(band, 2), TYPE_ALPHABET)) ?? '');

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

const CP_ALPHABET = 'CP0123456789 ';

/** How many digits the highest CP any form can show runs to: perfect IVs at the highest level there is. */
const cpDigits = (data: GameData) => {
  const [, top = 0] = data.cpm.at(-1) ?? [];
  const best = { attack: 15, defense: 15, stamina: 15 };

  return String(Math.max(...data.forms.map((form) => cpOf(form, best, top)))).length;
};

/**
 * Where the CP sits when no line carrying its label was recognised — the one place here with no anchor to measure
 * from, what would anchor it being the label the pass failed to read. Inside the top fifth `readLines` already inverts
 * for this text, and the numbers come from where the label-bearing lines are found on the captures that do read one:
 * top 123 and 127 of 2244, against a band spanning 0.055 to 0.09.
 */
const CP_SWEEP = { x: 0.3, y: 0.055, width: 0.4, height: 0.035 };

/**
 * How far round the line the CP band reaches, in that line's own heights, in the order to try. Two because neither
 * suits every capture, and `wholeCp`'s acceptance rule makes trying both safe: 0.35 is what four of the five rescues
 * read at, where `articuno-kanto.png` needs 0.6 to reach a digit lost off the back. A single wider pad will not do,
 * `deoxys-defense.png` reading `1569` at 0.35 and losing it at 0.6.
 */
const CP_PADS = [0.35, 0.6];
