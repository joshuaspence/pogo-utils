/**
 * The detail screen's own text, scrolled to the top: the CP above the artwork, the name or nickname, the HP, the
 * weight, the height and the two type labels. Every field is located by what sits beside it rather than by a
 * coordinate, which is what holds across phones of different resolutions.
 *
 * Two imports are reuses that one file hid. `parseDetail` fills the same `Detail` from `badges.mts`'s pixel readers, so
 * the two halves of that record are assembled here; and `wholeCp` isolates the CP band against the overlay's near-white
 * thresholds, the CP being white text over artwork exactly as PGSharp's digits are.
 */

import { closest, cpOf, type GameData } from './game-master.mts';
import { fold, ocr, ocrLine, type Line } from './ocr.mts';
import { crop, isolate, scale, type Image } from './png.mts';
import { genderOf, isFavourite, sizeOf, tagsOn, type Gender, type Size } from './badges.mts';
import { OVERLAY_CHROMA, OVERLAY_LUMINANCE } from './overlay.mts';
export interface Detail {
  /** What OCR made of the CP, which is usually nothing; `Identity.cp` is the one to believe. */
  cp: number | null;
  /**
   * What the CP region reads where no line carrying the label was recognised at all, which is where `cp` is null and
   * something is on the screen regardless. Not a reading to be trusted — measured over the captures that reach it, it
   * is right 19 times and wrong 3 — so it is never `cp` and never reaches the CSV. `identify` may use it to narrow, and
   * only where its own arithmetic reproduces one of these exactly, which is a test the three wrong reads fail: `19464`,
   * `540` and `5141` are no form's CP at any level.
   */
  cps: number[];
  name: string | null;
  hp: number | null;
  weight: number | null;
  height: number | null;
  types: string[];
  /** Null where the species has no gender rather than where the symbol was not read; see `genderOf`. */
  gender: Gender | null;
  favourite: boolean;
  /** Null for the two ordinary bands in the middle, which wear no badge at all. */
  size: Size | null;
  /** The text of each tag chip under the HP, as read; matching them to the tags that exist is the caller's job. */
  tags: string[];
}

/** Everything OCR read off an image: the whole of it, then the top fifth again inverted, where the CP is white. */
export async function readLines(image: Image): Promise<Line[]> {
  const top = Math.round(image.height / 5);
  const [all, sky] = await Promise.all([ocr(image), ocr(crop(image, 0, 0, image.width, top, true))]);

  return [...all, ...sky].sort((a, b) => a.top - b.top || a.left - b.left);
}

export async function parseDetail(lines: readonly Line[], data: GameData, image: Image): Promise<Detail> {
  // The small `CP` beside the number is often read with a stray letter after it (`cPe518`), as `GP`, or — the one that
  // cost a capture its whole form — as `ce`. `deoxys-attack.png`'s line reads `ce1441`, with the digits perfectly
  // right and the label's `P` taken for an `e`, so the pattern rejected the one line on the screen that had the CP in
  // it. Both halves of the label are a glyph OCR gets wrong, so both are a pair rather than a letter.
  //
  // What it admits is 14 captures, 11 of them reading the CP exactly — and the other three mattered, so widening this
  // alone is not the change. `articuno-kanto.png` read `170` for 1705, `genesect-burn.png` `189` for 1891 and
  // `growlithe-nickname.png` `38` for 738, each a digit short, and `wholeCp` recovers all three only once it is given
  // more than one pad to crop at. The two go together: the label says which line, and the band says the whole number.
  const cpPattern = /\b[cg][pe]\s?[a-z]?\s?(\d{2,5})\b/;
  const cpLine = lines.find((l) => l.top < image.height / 4 && cpPattern.test(fold(l.text)));
  const read = cpLine ? (cpPattern.exec(fold(cpLine.text))?.[1] ?? null) : null;
  const cp = cpLine && read !== null ? Number((await wholeCp(image, cpLine, read, cpDigits(data))) ?? read) : null;

  // `97 / 97 HP` or `HP 97/97`; the second number is the maximum, which is the one CP and level determine.
  const hpPattern = /(?:hp\s*)?(\d{1,4})\s*\/\s*(\d{1,4})(?:\s*hp)?/i;
  const hpLine = lines.find((l) => /hp/i.test(l.text) && hpPattern.test(l.text));
  const hp = hpLine ? Number(hpPattern.exec(hpLine.text)?.[2]) : null;

  // The name is the nearest line above the HP bar; a nickname reads here as readily as a species does, and a player can
  // set one that is no words at all. Three letters alone was the test, which is what a species has and `96%` has not,
  // so on the two captures nicknamed that the search walked hundreds of pixels back up the screen to the nearest line
  // that did — PGSharp's own overlay, giving `aals15` and `ee JEN`. Two digits is the other way to be readable.
  //
  // Two characters of *anything* is too loose, and the measurement says why rather than the guess: the name sits 117 to
  // 173 pixels above the HP across the corpus, and what sits nearer than that is the bar's own furniture, read as `os`
  // or `oy` on five captures at a gap of 57 to 62. Two letters admits those and they win for being nearest. Neither
  // three letters nor two digits does, and the far wrong answers stay beaten by distance — `96%` at a gap of 173
  // against `aals/15 +` at 618.
  const nameLine = hpLine
    ? lines
        .filter((l) => l.top + l.height <= hpLine.top + 4 && l !== cpLine && /\p{L}{3}|\p{N}{2}/u.test(l.text))
        .filter((l) => !cpPattern.test(fold(l.text)))
        .at(-1)
    : undefined;
  let name = nameLine ? sanitise(nameLine.text) : null;

  // The name again, off its own band, where what the pass found is no species. A rescue in the sense `wholeCp` is one:
  // taken only where the band itself names a species, so it can turn a missed name into the name and never one species
  // into another. `articuno-kanto.png` is the whole of why — no name line is detected there at all, so the nearest
  // three letters above the HP are a fragment of the artwork 487 pixels up, read as `ate` and filed as a nickname.
  //
  // Both halves of that guard are load-bearing, and `ho-oh.png` is what shows the second: its band reads `LUCKY
  // POKEMON`, the green line the game draws under a lucky Pokémon's nickname, which `closest` rejects as no species.
  // Without it the rescue would replace a real nickname with that. Measured over the corpus, 57 captures name a
  // species and never reach this, four do, and of those one is rescued and three keep the nickname they had.
  if (hpLine && (name === null || closest(name, data.species, (s) => s) === null)) {
    name = (await named(image, hpLine, data.species)) ?? name;
  }

  const number = (pattern: RegExp) => {
    const line = lines.find((l) => pattern.test(l.text));
    const value = line ? pattern.exec(line.text)?.[1] : undefined;
    return value === undefined ? null : Number(value.replace(',', '.'));
  };

  const row = lines.find((l) => measurement(l.text));
  // The size badge sits over the height in particular, so that line is found on its own rather than taken from the row
  // the two share — which is the weight as often as not, since they are read as separate lines at the same height.
  const heightLine = lines.find((l) => HEIGHT.test(l.text));
  let weight = number(WEIGHT);
  let height = number(HEIGHT);

  if (row) {
    weight ??= await measured(image, row, 0);
    height ??= await measured(image, row, 1 - MEASURE_WIDTH);
  }

  const size = heightLine ? await sizeOf(image, heightLine) : null;

  // A badged height is suspect where an unbadged one is not, because the pill's tail descends into the digits it is
  // drawn over: `spoink.png` renders `1.1m` and the whole-screen pass reads `1.4m`, the tail closing the second `1`
  // into a `4`. Reading that line on its own answers `1.1m`, which is the same thing that rescues every other field
  // here — a line read knows it is looking at a line, where the sparse pass is hunting small text among artwork.
  //
  // Gated on the badge rather than run on every capture, though the measurement says either would be safe: over the 59
  // captures that state a height, the cropped read agrees with 58, fixes `spoink.png` and breaks none. Six wear a
  // badge, so this is six more OCR passes rather than 59. `xurkitree.png` is the control, wearing the same gold `XXL`
  // and reading correctly either way because there the tail lands in the gap above its `8`.
  if (size !== null && heightLine) {
    height = (await remeasured(image, heightLine)) ?? height;
  }

  return {
    cp,
    cps: cpLine ? [] : await cpsIn(image),
    name,
    hp,
    weight,
    height,
    types: await typesOf(lines, data, image),
    gender: hpLine ? genderOf(image, hpLine) : null,
    favourite: isFavourite(image),
    size,
    tags: hpLine && row ? await tagsOn(image, hpLine, row) : [],
  };
}

/**
 * Every number the CP region reads where no line carrying the label was found to anchor on, which `wholeCp` needs and
 * these captures cannot give it. `deoxys-normal.png`, `deoxys-speed.png` and `dialga-origin.png` are the reason: each
 * states a CP that separates its form from the others sharing its stamina, and each reads nothing the pattern accepts —
 * `cpe1//2`, nothing at all, and `cp2`.
 *
 * Unanchored, so unreliable, and it is handed over as candidates rather than as an answer for exactly that reason:
 * over the 27 captures that reach it this read is right 19 times, wrong 3 and silent 5. What makes the wrong three
 * harmless is that `identify` keeps a candidate only where the arithmetic reproduces one of these numbers, and
 * `19464`, `540` and `5141` are no form's CP at any level — where a plurality vote over 102 treatments, which was
 * measured first, picks the wrong number on 6 of 20 and loses `keldeo-resolute.png`'s own CP 19 votes to 13.
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
 * The CP again, out of a band round the line the whole-screen pass found, where that pass lost a digit off the front of
 * it. White over the artwork is the hardest text on the screen, and the loss is one-sided: `castform-snowy.png` reads
 * `46` for 746, `shellos-east.png` `84` for 784, `unown-b.png` `48` for 487 and `deoxys-defense.png` `15` for 1569.
 *
 * Accepted only where the band's number **begins or ends with** the line's and is longer, which is what makes this a
 * rescue rather than a second opinion: it says the band found more of the same number, not a different one, so a band
 * that misreads outright is rejected for disagreeing. Where the digits are lost is the front or the back, never the
 * middle, and no longer than a CP can be — so a `15` is not rescued into a `2150` or a five-digit `15691`. The line's
 * own answer has to stand otherwise — `castform-sunny.png` reads `979` on the line and nothing at all out of any
 * treatment of its band.
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
 * search the whole screen for, and a bare `\d\s*(kg|m)` is not: `09:00` in the status bar reads as `0900 M © Os` and
 * PGSharp's overlay separates three IVs the same way a measurement separates its decimals, so `L16 ɪᴠ53 m 0/7 (B`
 * offers a `53 m`. Both sit above the panel and both matched, which put the size band 52 pixels off the top of the
 * screen on `fixtures/xxl-male.png`'s sibling capture and reported no badge over a gold `XXL`.
 *
 * They are separate because the two are read as separate lines at the same height — `0.97kg` at x 131 and `0.15m` at
 * x 759 — so a caller wanting one of them in particular cannot take it from whichever the row happened to be.
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
 * The name read off the band between the artwork and the HP bar, and answered only where it is a species' name — which
 * is what makes this safe to prefer over what the whole-screen pass found. The band is measured in the HP's own height
 * rather than in a fraction of the screen, since that is what holds across phones: the name sits 117 to 173 pixels
 * above the HP across the corpus, against an HP line Tesseract reports as 37 to 45 tall, so five of those covers it.
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
 * A height read off its own line, for when the whole-screen pass read one the size badge had corrupted rather than
 * missing it. Anchored on the line Tesseract already found rather than on a fraction of the screen, and reaching a
 * character's height either side of it so that a leading digit cannot be clipped — the failure
 * `OVERLAY_SUFFIX_CHARACTERS` is there to prevent, one reader along.
 *
 * `m` is required here where `measured` takes a bare decimal, because this is only ever asked about a height and the
 * crop is wide enough to catch the weight's own digits at the other end of the row.
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
  const text = (await ocrLine(scale(band, 2), MEASURE_ALPHABET)) ?? '';
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

  // A type name matched across whatever spaces Tesseract put inside it, but only where it begins at a word boundary.
  // An exact word match loses a name the reader split: the type band of both Nidoran captures reads `IT POISO N`, where
  // neither `poiso` nor `n` is a type and the pair plainly is — and those two were the only captures in the corpus with
  // no type read at all, so `identify` had nothing to narrow by. The word boundary is what keeps this from being a free
  // substring search, since `WEIGH TICE` would otherwise invent an `ice` out of the label beside them. No type name
  // prefixes another, so the first that fits a given start is the only one that can.
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
 * Where the CP sits when no line carrying its label was recognised, as fractions of the screen — the one place here
 * that has no anchor to measure from, because what would anchor it is the label the pass failed to read. It is inside
 * the top fifth `readLines` already inverts for this text, so it is the region that pass covers rather than a new claim
 * about a phone, and the numbers come from where the label-bearing lines on the captures that do read one are found:
 * top 123 and 127 of 2244, against a band spanning 0.055 to 0.09.
 */
const CP_SWEEP = { x: 0.3, y: 0.055, width: 0.4, height: 0.035 };

/**
 * How far round the line the CP band reaches, in that line's own heights, in the order to try. Two rather than one
 * because neither suits every capture and the acceptance rule below makes trying both safe.
 *
 * 0.4 is what the four rescues in `wholeCp`'s docblock were measured at, and 0.6 is what reaches a digit lost off the
 * *back*: swept over 26 treatments and scales, `articuno-kanto.png` reads `170` for 1705 at every pad to 0.35 and
 * `1705` only at 0.6, and `genesect-burn.png` reads `189` for 1891 the same way, the treatment making no difference to
 * either. Widening the single pad instead was tried and regresses `deoxys-defense.png`, whose own rescue needs the
 * tighter crop — so this is a list, like the treatments it multiplies, and the first reading that contains the line's
 * own wins.
 */
const CP_PADS = [0.35, 0.4, 0.6];
