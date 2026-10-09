/**
 * The detail screen's own text, scrolled to the top. Every field is located by what sits beside it rather than by a
 * coordinate, which is what holds across phones of different resolutions.
 *
 * `parseDetail` fills one `Detail` from these text readers and `badges.mts`'s pixel readers. `wholeCp` re-reads the CP
 * band under three treatments, the CP being white text over artwork as PGSharp's digits are.
 */

import { closest, cpOf, type GameData } from './game-master.mts';
import { fold, ocr, ocrLine, type Line } from './ocr.mts';
import { brighten, crop, isolate, scale, type Image } from './png.mts';
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
 * It admits 23 captures, 20 reading the CP exactly off the line; of the other three `wholeCp` recovers two and
 * overshoots one. The two go together: the label says which line, the band says the whole number.
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
 * Unanchored and so unreliable — the CP the screen prints is among the candidates on 15 of the 20 captures that reach
 * it, missing from the only one `meloetta-aria.png` offers and absent altogether on four — which is why these are
 * candidates rather than an answer. A candidate is kept only where the arithmetic reproduces it, and `19464` is no CP
 * an Articuno can show.
 *
 * The band is treated the three ways the anchored band is, which is what reaches the last two of those 15. Plain alone
 * finds 13: `castform-rainy.png`'s 832 comes of the near-white pass and `castform-sunny.png`'s 979 of the brightened
 * one. The first of those needs it — offered nothing, the capture answers Inteleon on a CP of 1512 and stands four
 * alternatives.
 *
 * An extra read costs little here where in `wholeCp` it can be taken as the answer, nothing surviving that the
 * arithmetic does not reproduce: `deoxys-normal.png` offers `172` beside its 1772 and `ho-oh.png` `238` beside its
 * 2738, and both are dropped without a row moving. The three go together, so what they cost is one read's latency
 * rather than three.
 */
async function cpsIn(image: Image): Promise<number[]> {
  const band = crop(
    image,
    image.width * CP_SWEEP.x,
    image.height * CP_SWEEP.y,
    image.width * CP_SWEEP.width,
    image.height * CP_SWEEP.height,
  );
  const texts = await Promise.all(CP_TREATMENTS.map((treat) => ocrLine(scale(treat(band), 2), CP_ALPHABET)));
  const digits = texts.flatMap((text) => [...(text ?? '').matchAll(/\d{3,5}/g)].map(([run]) => Number(run)));

  return [...new Set(digits)];
}

/**
 * The CP again, out of a band round the line the whole-screen pass found, where that pass lost a digit or two off one
 * end. White over the artwork is the hardest text on the screen. All 23 captures with a label line reach this and three
 * are changed by it: `38` for 738 and `48` for 487 are recovered, where `48` for 486 is overshot into `4864`. The 746,
 * 1569 and 1705 once named here are still what their rows state, with no label line left on the stitch for this to
 * anchor on.
 *
 * A line already as long as a CP goes cannot be extended by anything, so no band of it is read at all: `rescue` wants a
 * number longer than the line's and no longer than `longest`, which is unsatisfiable once the two are equal. That is
 * eight of the 23 and 48 passes — the corpus costs 81 where three treatments unguarded cost 129 and two cost 89.
 */
async function wholeCp(image: Image, line: Line, read: string, longest: number): Promise<string | null> {
  if (read.length >= longest) {
    return null;
  }

  for (const reach of CP_PADS) {
    const pad = Math.round(line.height * reach);
    const band = crop(image, line.left - pad, line.top - pad, line.width + pad * 2, line.height + pad * 2);

    for (const treat of CP_TREATMENTS) {
      const whole = rescue((await ocrLine(scale(treat(band), 2), CP_ALPHABET)) ?? '', read, longest);

      if (whole !== null) {
        return whole;
      }
    }
  }

  return null;
}

/**
 * What a treated band's text offers the line's own reading, or null where it offers nothing. Taken only where the
 * band's number **begins or ends with** the line's and is longer, which makes this a rescue rather than a second
 * opinion: it says the band found more of the same number, so a band that misreads outright is turned down for
 * disagreeing. Bounded by a CP's own length, so a `15` is not rescued into a five-digit `15691`.
 *
 * Exported because nothing else states what it takes: `screens.test.mts` asserts the CP each capture ends with, which
 * this rule arrives at from any of several band readings. `detail.test.mts` pins the rule itself.
 */
export function rescue(text: string, read: string, longest: number): string | null {
  for (const digits of text.match(/\d+/g) ?? []) {
    if (digits.length > read.length && digits.length <= longest && (digits.startsWith(read) || digits.endsWith(read))) {
      return digits;
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
 * How far round the line the CP band reaches, in that line's own heights, in the order to try. 0.35 is what both
 * rescues read at. 0.6 earns nothing measurable: it spends 38 of the corpus's 81 passes and accepts once, on the one CP
 * the corpus reads wrongly — `unown-question.png`'s `4864` against the 486 on its screen.
 *
 * It was added for `articuno-kanto.png`, which needed it for a digit lost off the back, against `deoxys-defense.png`
 * reading `1569` at 0.35 and losing it at 0.6. Neither capture reaches `wholeCp` any more, no label line being found on
 * either, so that evidence is spent rather than standing, and by the floor standard `overlay.mts` sets this does not
 * earn its place: nothing is legible at 0.6 and illegible at 0.35. Dropping it would not fix the row it changes, only
 * take it to the `48` its line reads, so that is a change of its own.
 */
const CP_PADS = [0.35, 0.6];

/**
 * The ways to turn the CP band into something readable, in the order to try. None wins outright, and what bounds the
 * risk of trying each is `wholeCp`'s acceptance rule — which turns down a *different* number, not a longer wrong one:
 * `unown-question.png`'s `4864` is exactly that, and is taken.
 *
 * Brightness is here for `growlithe-nickname.png`, which neither of the others reaches: at pad 0.35 its band reads `38`
 * plain and near-white and `738` brightened. Going last decides nothing the corpus can show, the loop returning on the
 * first acceptance so that a second is never read, and it is no protection for a line already read right — a pass
 * reading that number back is the same length, so the rule turns it down and the loop carries on. It costs 26 of the
 * corpus's 81 passes, and what bounds its noise is the four-digit cap, which `wholeCp` now applies before any band is
 * read rather than after three.
 */
const CP_TREATMENTS = [
  (band: Image) => band,
  (band: Image) => isolate(band, OVERLAY_LUMINANCE, OVERLAY_CHROMA),
  (band: Image) => brighten(band, CP_BRIGHTNESS),
];

/**
 * How bright a channel has to be for the CP band's brightening to keep it. `brighten` keeps a pixel where a channel
 * reaches the floor, so raising the floor keeps strictly less: ink on `growlithe-nickname.png`'s band falls from 14.8%
 * at 100 to 9.6% at 200, and what 180 and 200 lose is the `7` itself, its strokes falling under the floor.
 *
 * 120 is not the middle of a window. Swept in fives over that band the digit comes back at 100, 105, 110, 120, 125 and
 * 130 and is lost at 115 and from 135 up — a jagged region with a failure five units below the value chosen, which is a
 * fit to OCR's noise rather than to the artwork. A Tesseract bump or a retaken capture can flip the single read this
 * treatment exists for, and the CP map in `screens.test.mts` is what would fail.
 *
 * Its own number rather than `overlay.mts`'s private `OVERLAY_BRIGHTNESS`, also 120, which is set low enough to hold
 * the overlay's colour-coded IV percentage — a glyph this band has none of, where this floor answers to the artwork.
 */
const CP_BRIGHTNESS = 120;
