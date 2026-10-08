/**
 * PGSharp's overlay, which states the level and the three IVs outright where the game's own CP does not survive OCR.
 * Two jobs: finding the box, by sweeping isolated bands for the one thing nothing else on the screen carries — three
 * small numbers separated by slashes — and reading what is inside it.
 *
 * `OVERLAY_LUMINANCE` and `OVERLAY_CHROMA` are exported because the detail screen's CP is the same near-white text and
 * is isolated against the same thresholds.
 */

import { type IVs } from './game-master.mts';
import { ocr, ocrLine } from './ocr.mts';
import { brighten, crop, isolate, scale, type Image } from './png.mts';
import { availableParallelism } from 'node:os';

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
  /**
   * What PGSharp appends in brackets after the IVs, as read — `L` for an Unown, and nothing at all for most Pokémon.
   * Matching it to a form of the species is `identify`'s job, since only it knows which species this is.
   */
  form: string | null;
}

/** Only these survive the whitelist: the level's `L`, the digits and the slashes between the three IVs. */
const OVERLAY_ALPHABET = 'L0123456789/ ';

/**
 * How much to upscale the isolated overlay before reading it. 2 because that is what the IVs were measured against — at
 * 1× Tesseract read `14/18/12` for `14/13/12`, and at 3× and 4× it starts taking the level's small-caps `L` for a `1`.
 *
 * What 2× loses is sometimes the slashes, and no separators means no triple: brightened to 180, `cherrim-sunshine.png`
 * reads `3100773`. A second scale is not what recovers them, because another treatment at 2× already does — 120 reads
 * the same band as `L31 153 10/7/7` — and no capture in the corpus needs a scale besides this one.
 */
const OVERLAY_SCALE = 2;

/**
 * How bright a channel has to be for `brighten` to keep it. Low enough to hold the IV percentage, whose colour is what
 * a chroma limit exists to drop.
 */
const OVERLAY_BRIGHTNESS = 120;

/**
 * A second brightness floor, for a band this one leaves blank. `basculin-blue.png` reads nothing whatever at 120, so
 * its near-white pass would go unchallenged and its `8` stand as the `3` that treatment makes of it. At 180 the same
 * band reads `5135 8/3/5`, and the percentage behind it settles the matter without anything having to guess: `8/3/5` is
 * 35%, which is the `35` inside that `135`.
 *
 * A third floor rather than a replacement: without 120, near-white and 180 between them read `articuno-galar.png`,
 * `charizard-gigantamax.png`, `dialga-altered.png` and `xurkitree.png` wrongly. Nothing here is a free parameter — a
 * floor is only worth adding where some band is legible at it and illegible at every floor already tried.
 */
const OVERLAY_BRIGHTNESS_HIGH = 180;

/**
 * The three ways to turn an overlay band into black on white, in the order to try. None wins outright, which is why all
 * three are here and why the percentage below arbitrates between them.
 *
 * Near-white first, because that is what every reading was measured against. What it costs is the thin strokes: the
 * chroma ceiling clips the anti-aliased edge of a leading `1`, so `articuno-galar.png` reads `10/4/13` for its
 * `12/4/13`. Brightness is a second opinion rather than a replacement — it misses `unown-question.png`, whose level,
 * percentage and IVs run together at 120 as `657412/1001`, and which near-white reads.
 *
 * The two captures that used to stand beside Articuno here, `xurkitree.png` at `/2/14` and `cherrim-overcast.png`
 * yielding nothing, both read correctly under near-white on the corpus as retaken: `L201 11/12/14` and `L18 13/15/9`.
 * They are recorded as gone rather than quietly dropped, because what they were evidence for is the cost of going
 * near-white first, and one capture is thinner evidence than three.
 *
 * Order is what makes adding one safe. The loop keeps the first reading the percentage confirms and falls back on the
 * first that read a possible triple at all, so a pass appended here cannot displace a confirmed answer and cannot
 * change which reading is the fallback. It can only turn an unconfirmed fallback into a confirmed reading, which is the
 * one direction this arbitration was built to move in.
 */
const OVERLAY_TREATMENTS = [
  (band: Image) => isolate(band, OVERLAY_LUMINANCE, OVERLAY_CHROMA),
  (band: Image) => brighten(band, OVERLAY_BRIGHTNESS),
  (band: Image) => brighten(band, OVERLAY_BRIGHTNESS_HIGH),
];

/**
 * Whether the IV percentage PGSharp prints beside the triple agrees with it. It is `floor((a + d + s) / 45 * 100)`, so
 * it is redundant — and redundancy is exactly what makes it a checksum, which is what settles which treatment to
 * believe where two of them read different triples and both are possible. `deoxys-attack.png` is the live case:
 * near-white says `20 14/13/14` with no percentage to check it by, and brightness at 180 says `00 9114/13/14`, whose
 * `91` is what 14/13/14 comes to — so the second is believed and the first is not.
 *
 * `articuno-galar.png` used to be the case quoted here and is now the shape of what this *cannot* settle: near-white
 * says `10/4/13`, brightness at 180 says `12/4/ 3` and prints the right `164`, and neither triple comes to the
 * percentage beside it. So nothing is confirmed, the fallback stands, and the row pins the near-white answer.
 *
 * It is the end of the last run of digits ahead of the triple rather than a whole word, since it runs into what is
 * beside it — `xurkitree.png`'s `82` arrives as `182`, and `burmy-plant.png`'s level and percentage as one `015197`.
 * And that run must not be the level alone, because a treatment that drops the coloured percentage leaves the level as
 * the last run, and a level of 20 would otherwise confirm any triple summing to 9 — with or without a stray digit of
 * artwork ahead of it, so it is the `L` that says which run is the level rather than how many runs there are. Where the
 * `L` reads as a `1` that cannot be told apart: `120` is a level of 20 alone as readily as a level of 1 and a
 * percentage of 20. Nor can a one-digit percentage inside a two-digit level, the 2% inside `L22`.
 */
function confirmed(before: string, iv: IVs): boolean {
  const percentage = String(Math.floor(((iv.attack + iv.defense + iv.stamina) / 45) * 100));
  const runs = before.match(/\d+/g) ?? [];
  const last = runs.at(-1) ?? '';
  const lastIsLevel = /L\d+\D*$/.test(before);

  return last.endsWith(percentage) && (last.length > percentage.length || (runs.length > 1 && !lastIsLevel));
}

/**
 * The alphabet the bracketed form is read with, which is deliberately not the one above widened: a whitelist is what
 * stops a stray glyph splitting a number in two, and the letters a form needs are precisely the glyphs a digit is
 * confused with — `O` for `0`, `S` for `5`, `B` for `8`. Two reads of the same crop therefore cost one more Tesseract
 * call and leave the level and the IVs coming out of exactly the alphabet they were measured against.
 *
 * `[` and `\\` are in it because PGSharp draws them: it indexes the species' forms from `A`, so the game's 27th and
 * 28th Unown come out as `'A'.charCodeAt(0) + 26` and `+ 27`, which are `[` and `\\`. Without them
 * `unown-question.png`'s `(\\)` reads as `(X)` — a **real** Unown form, so the answer came back confidently wrong
 * rather than merely absent.
 *
 * Digits are read on a second pass rather than added here, which is measured rather than assumed. Over 24 Unown the
 * letters come back identical with them and without, and over 18 Pokémon that carry no suffix at all a single pass with
 * digits invents one — `(251)` out of the artwork on a Decidueye — where the pass without them reads nothing on all 18.
 * Spinda is the species that needs them, its forms being `00` to `19`, and what separates it from that false positive
 * is the length: exactly two digits where the artwork gave three. So `SUFFIX_SHAPE` is the narrow claim, not the
 * alphabet.
 */
const OVERLAY_FORM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ()!?[\\ ';

/** The same widened to digits, for the one species the game labels numerically. */
const OVERLAY_NUMERIC_ALPHABET = OVERLAY_FORM_ALPHABET + '0123456789';

/**
 * What a suffix PGSharp drew can look like, which is the guard the two passes below need rather than an alphabet. Every
 * form it labels is either one character — Unown's 26 letters, or the `[` and `\\` below for the other two — or
 * Spinda's two digits. Nothing it draws is two letters, so `basculin-blue.png`'s `(SV)` and `spinda-04.png`'s `(OA)`
 * are both noise out of the artwork, and rejecting them is what lets the numeric pass run at all: `O` for `0` and `A`
 * for `4` is exactly the confusion a letters-only alphabet invites, and it answered a plausible-looking suffix for a
 * Spinda whose real label is `04`.
 */
const SUFFIX_SHAPE = /^(?:[A-Z[\\]|\d{2})$/;

/**
 * The last bracketed run on the line, since the suffix is appended and a stray bracket lands among the digits ahead of
 * it — one capture read `L17 1V33 177(7 (L)`, where the first group is noise and the last is the form.
 */
const FORM_SUFFIX = /\(([^()]{1,20})\)/g;

/** Bright enough to be the overlay's white text, and flat enough in colour not to be its IV percentage. */
export const OVERLAY_LUMINANCE = 150;
export const OVERLAY_CHROMA = 55;

const TRIPLE = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/;

/** The same pattern anchored, so `tripleIn` can ask it *at* an offset rather than from one. Derived, not retyped. */
const TRIPLE_AT = new RegExp(TRIPLE.source, 'y');

/**
 * Where the three IVs are on a line of overlay text: the **last** triple on it rather than the first.
 *
 * PGSharp draws the level and the percentage ahead of the IVs, and a percentage whose second digit reads as a slash
 * opens a triple of its own. `rotom-wash.png`'s band reads `L12 3/ 13/3/1` — its `ɪᴠ37` came out as `3/` — so
 * `3/ 13/3` matches ahead of the `13/3/1` the screen shows, and the first match is a triple of the percentage's tail
 * and the first two IVs. Taking the last instead reads the screen.
 *
 * The longest of those ending together, which is the other half: `articuno-galar.png`'s `10/4/ 13` and the `0/4/ 13`
 * inside it end at the same place, and the one that starts earlier is the one with the whole leading digit.
 *
 * Scanned from every offset rather than with `matchAll`, which steps past each match and so cannot see one that starts
 * inside it — and a stray digit ahead of a real triple is exactly that case.
 */
function tripleIn(text: string): RegExpExecArray | null {
  let best: RegExpExecArray | null = null;
  const endOf = (match: RegExpExecArray) => match.index + match[0].length;

  for (let at = 0; at < text.length; at++) {
    TRIPLE_AT.lastIndex = at;
    const match = TRIPLE_AT.exec(text);

    if (match && (best === null || endOf(match) > endOf(best))) {
      best = match;
    }
  }

  return best;
}

/**
 * How far left of the three IVs the box reaches, in characters, which is what it is measured in. `L25 IV86 14/13/12`
 * is eighteen, and the generosity beyond that is not spare: the em it is multiplied by is estimated from whatever
 * line was recognised, often the triple alone, and a short triple under-estimates it. At 19 a box tightened on one
 * Pokémon clipped the `L31` off the next while keeping its IVs — which reads as a success, so nothing widened the box
 * and the level was simply lost. Measured per phone over 62 screens, 19 reads 49 of 50 levels and 30 reads all of
 * them, with no reading gained or lost elsewhere.
 */
const OVERLAY_CHARACTERS = 30;

/**
 * How far right of them it reaches, in the same characters, for the form PGSharp appends there. Unlike the reach the
 * other way this one is bounded on both sides, because the level and the IVs come out of the same crop: too short
 * clips the suffix, and too long drags the artwork beyond it into a band `ocrLine` reads whole.
 *
 * Both bounds are measured rather than reasoned about, over 24 Unown and 26 Pokémon PGSharp appends nothing to. At one
 * character, which is all the numbers need, the letter comes back on 20 of the 24 and cannot be told from the level's
 * own `L`; from three up all 24 that have an overlay read a closed bracket, and the letters are identical at 3, 4, 5, 8
 * and 13. Going further costs readings: the no-suffix corpus reads 18 of its 26 overlays at 3, 4 and 5 and only 16 at 6
 * and beyond, losing a Buzzwole's `13/15/11` and a Hisuian Decidueye's `11/15/14` — which is the IVs, not the suffix,
 * so it would read as the overlay simply not being there. Five is the most generous reach that costs none of them, and
 * the 24 Unown triples are identical at every reach including one.
 */
const OVERLAY_SUFFIX_CHARACTERS = 5;

/**
 * How much wider than the triple's box to read the bracketed form out of, as a fraction of that box's width. The box
 * `tighten` hands back already reaches `OVERLAY_SUFFIX_CHARACTERS` past the IVs, which is as far as the IVs' own read
 * can go without losing them, and that is not always far enough for the bracket: `unown-m.png` reads `(MN` out of the
 * tightened box, with no closing bracket and so no form. The suffix is read out of its own crop with its own alphabet,
 * so reaching further for it costs the IVs nothing, and half the box again reads `(M)`.
 */
const OVERLAY_SUFFIX_REACH = 0.5;

/**
 * What the bracketed suffix is isolated against, which is not what the triple is. A `[` is a thin upright with two
 * short serifs and the near-white floor the digits want clips it away entirely: `unown-exclamation.png` reads an empty
 * `()` at 150/55 and reads `[` at 120/40, while `unown-b.png` and `unown-question.png` answer `B` and `\\` under
 * either.
 */
const SUFFIX_LUMINANCE = 120;
const SUFFIX_CHROMA = 40;

/** Level 51 is a best buddy's; nothing the overlay can be saying is higher. */
const MAX_LEVEL = 51;

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
 * The text of an isolated overlay crop, upscaled, or null where it holds no IV triple. The whitelist is what stops the
 * isolated artwork either side of the text being read as glyphs that split a number in two.
 */
async function tripled(band: Image): Promise<string | null> {
  const text = (await ocrLine(scale(band, OVERLAY_SCALE), OVERLAY_ALPHABET)) ?? '';

  return TRIPLE.test(text) ? text : null;
}

/** How many bands of a sweep to read at once: one Tesseract process per core. */
const SWEEP_BATCH = availableParallelism();

/**
 * Where the overlay sits and what it says, found by the one thing nothing else on the screen carries: three small
 * numbers separated by slashes. This is the expensive half and it only has to work once — a caller finds the box on
 * whichever Pokémon it first succeeds on and reads every later one straight out of it, which is what keeps this
 * independent of the phone. PGSharp draws the overlay itself rather than leaving it to Unity, so the box does not move
 * between species; what it does do is move between devices, which is why this is found rather than configured.
 *
 * Found by sweeping narrow bands down the upper screen, isolating each and reading it, rather than by looking for the
 * triple among the lines a whole-screen read produces: that finds the box on nine of twelve captures from one phone and
 * on none at all from another, where the text sits across the boundary of the inverted crop `readLines` makes and is
 * too low in contrast against the artwork for the sparse pass either side of it. Isolating first is what makes the
 * line legible, and a band is small enough that the rest of the screen cannot drown it. Each band is read as a line
 * rather than sparsely, which is what a band is by construction and is not a detail: the same band holding `L1 IV48
 * 5/2/15` reads as `r '` sparse, because sparse mode takes the isolated blocks either side for pictures.
 */
export async function findOverlay(image: Image): Promise<{ box: OverlayBox; overlay: Overlay } | null> {
  const height = Math.round(image.height * OVERLAY_BAND);
  const step = Math.max(1, Math.round(height / 3));
  const width = Math.round(image.width * OVERLAY_SPAN);
  const left = Math.round((image.width - width) / 2);
  const tops: number[] = [];

  for (let top = Math.round(image.height * OVERLAY_FROM); top < image.height * OVERLAY_TO; top += step) {
    tops.push(top);
  }

  // A whole sweep per pass rather than every pass per band, which matters only for the clock: the overlay is found by
  // the first pass on all but a handful, and trying them all at every band cost the suite 60% more wall time to rescue
  // those few.
  //
  // Within a pass, a core's worth of bands at a time: `ocr.mts` holds each Tesseract process to one thread so that
  // reads can run side by side. The bands of a batch are still taken top first, so the answer is the one a band-by-band
  // sweep gives, and stopping at the batch holding a match wastes no more than the rest of that batch.
  for (const treat of OVERLAY_TREATMENTS) {
    for (let at = 0; at < tops.length; at += SWEEP_BATCH) {
      const batch = tops.slice(at, at + SWEEP_BATCH);
      const lines = await Promise.all(batch.map((top) => tripled(treat(crop(image, left, top, width, height)))));

      for (const [i, top] of batch.entries()) {
        if (lines[i] === null) {
          continue;
        }

        // The band itself, which is already the right shape: as wide as the sweep, and tall enough to hold the line it
        // was just read out of. Sizing a box from that line instead does not work, because reading a band as one line
        // is exactly what makes its width meaningless — everything in the band comes back as one box, which on one
        // capture spanned 626 pixels against a true 329 and on another sat 250 to the right of the text. So the band is
        // the floor, and `tighten` improves on it where it can.
        const found = within({
          x: left / image.width,
          y: top / image.height,
          width: width / image.width,
          height: height / image.height,
        });

        // `tighten` improves on the band where it can, and has to be checked rather than trusted: it derives the box
        // from the `top` Tesseract reports for a sparse line, which can sit a character-width above the glyphs — 434
        // against a true 460 on `eevee-background.png` — so the box comes out straddling the text instead of covering
        // it, and the read that follows gets the bottom half of a row of digits.
        //
        // The band is checked the same way, because matching `TRIPLE` is not reading an overlay: it admits an IV of 48,
        // and a band whose line is only half inside it reads one. `readOverlay` is what decides, so a band it declines
        // is passed over for the next rather than returned to a caller that would read nothing out of it.
        const tightened = await tighten(image, found);

        for (const box of tightened ? [tightened, found] : [found]) {
          const overlay = await readOverlay(image, box);

          if (overlay) {
            return { box, overlay };
          }
        }
      }
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
  const region = scale(isolate(cropBox(image, box), OVERLAY_LUMINANCE, OVERLAY_CHROMA), OVERLAY_SCALE);
  const inner = (await ocr(region)).find((l) => TRIPLE.test(l.text));

  if (!inner) {
    return null;
  }

  return boxAround(
    {
      ...inner,
      left: box.x * image.width + inner.left / OVERLAY_SCALE,
      top: box.y * image.height + inner.top / OVERLAY_SCALE,
      width: inner.width / OVERLAY_SCALE,
    },
    image,
  );
}

/**
 * The box around a line the overlay was recognised in. It is sized from the width of one character rather than from
 * the height Tesseract reports, because that height is not trustworthy: measured over twelve captures the same overlay
 * came back 25, 28, 49 and 54 pixels tall as the row was merged with whatever fragment of the artwork sat beside it,
 * and padding a 54 by half of itself reaches far enough into the picture to undo the whole point of cropping.
 * Character width does not wander — 270/17, 264/17 and 130/8 across those captures are within a pixel of each other.
 * It is anchored one character past the three IVs, since the part that goes missing is always the left: where only the
 * triple is legible the level and the percentage ahead of it are still there to be read. It reaches further right than
 * that anchor only because PGSharp appends the form there, and a box holding the whole overlay is the honest thing for
 * `--config` to take and for `snap` to print.
 */
function boxAround(line: { left: number; top: number; width: number; text: string }, image: Image): OverlayBox {
  const em = line.width / Math.max(1, line.text.length);
  const anchor = line.left + line.width + em;
  const left = anchor - OVERLAY_CHARACTERS * em;
  const right = anchor + OVERLAY_SUFFIX_CHARACTERS * em;

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

/** The pixels a box covers, reaching `reach` of its width further right. */
function cropBox(image: Image, box: OverlayBox, reach = 0): Image {
  return crop(
    image,
    box.x * image.width,
    box.y * image.height,
    box.width * image.width * (1 + reach),
    box.height * image.height,
  );
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
 *
 * The bracketed form beside them is read as a second pass over the same isolated crop, with its own alphabet. That is
 * the whole reason this costs two Tesseract calls rather than one: see `OVERLAY_FORM_ALPHABET`.
 */
export async function readOverlay(image: Image, box: OverlayBox): Promise<Overlay | null> {
  const raw = cropBox(image, box);

  // Every treatment, keeping the first whose percentage confirms its own triple, and falling back on the first that
  // read a possible one at all. Without that arbitration the order alone decides, and the first pass is wrong about
  // `articuno-galar.png` in a way nothing downstream could notice: `10/4/13` is a perfectly possible triple.
  let fallback: { iv: IVs; before: string } | null = null;
  let chosen: { iv: IVs; before: string } | null = null;

  // The text ahead of the triple from *every* treatment, which is where the level shortlist comes from. The triple and
  // the level are separate readings of separate parts of one line — the same argument the bracket below makes — and the
  // arbitration that gets the triple right was taking the level from whichever pass won it. `deoxys-attack.png` reads
  // `20 14/13/14` under the first treatment and `00 9114/13/14` under the third, and the third is the one whose
  // percentage confirms its triple, so the level 20 the first pass had read plainly was thrown away with it.
  //
  // Kept whatever the triple turns out to be, so a treatment whose triple is impossible still offers its level:
  // `burmy-plant.png` reads `L151 44/15/15`, where 44 is no IV and `L151` is the `L15` on the screen with the `IV`
  // label's upright run into it.
  const ahead: string[] = [];

  for (const treat of OVERLAY_TREATMENTS) {
    const text = (await ocrLine(scale(treat(raw), OVERLAY_SCALE), OVERLAY_ALPHABET)) ?? '';
    const triple = tripleIn(text);

    if (!triple) {
      continue;
    }

    ahead.push(text.slice(0, triple.index));

    const [attack, defense, stamina] = triple.slice(1).map(Number) as [number, number, number];

    if ([attack, defense, stamina].some((v) => v > 15)) {
      continue;
    }

    const reading = { iv: { attack, defense, stamina }, before: text.slice(0, triple.index) };
    fallback ??= reading;

    if (confirmed(reading.before, reading.iv)) {
      chosen = reading;
      break;
    }
  }

  const reading = chosen ?? fallback;

  if (!reading) {
    return null;
  }

  const { iv } = reading;

  const suffixIn = async (crop: Image, alphabet: string) =>
    [...((await ocrLine(crop, alphabet))?.matchAll(FORM_SUFFIX) ?? [])].at(-1)?.[1]?.trim() ?? null;

  // Both alphabets always run and a two-digit answer wins, because only one of them could have produced it: the letters
  // alphabet holds no digits, so it can only ever say "letter", and it says one about Spinda's `(04)` either way — `OA`
  // where both characters survive and a shape-valid `O` where the `4` does not. Reading the digits is the only thing
  // that can tell a real `04` from a letter, and nothing but Spinda is labelled numerically, so a two-digit read is not
  // a close call to arbitrate. Everything else is the letters alphabet's to answer.
  //
  // Off the first pass always, and deliberately not off whichever pass the triple came from: the two are separate
  // readings of separate parts of the line, and each wants its own treatment. `unown-m.png`'s IVs are only right under
  // brightness and its `(M)` only under near-white, so following the triple would trade one for the other. One pass for
  // the bracket is what was measured and is what the corpus bears out.
  //
  // Out of a wider crop than the triple, though: see `OVERLAY_SUFFIX_REACH`. `crop` clamps what runs off the screen.
  //
  // And under its own thresholds, which is the same argument once more: a lower floor and a tighter chroma than the
  // triple's keeps the thin upright of a `[`. `unown-exclamation.png`'s bracket reads empty at 150/55 and reads `[` at
  // 120/40, where `unown-b.png` and `unown-question.png` answer `B` and `\` under either.
  //
  // Thresholds rather than a vote, because a vote cannot work here. Swept over 72 treatments and scales, that
  // capture's bracket reads `N` eighteen times, `T` seven, `[` six and `I` four — and `N` and `I` are both real Unown
  // forms, so the plurality answer is confidently wrong. There is no majority to take; there is only a treatment that
  // is right.
  const shaped = (suffix: string | null) => (suffix !== null && SUFFIX_SHAPE.test(suffix) ? suffix : null);
  const bracket = scale(
    isolate(cropBox(image, box, OVERLAY_SUFFIX_REACH), SUFFIX_LUMINANCE, SUFFIX_CHROMA),
    OVERLAY_SCALE,
  );
  const [lettered, numeric] = await Promise.all([
    suffixIn(bracket, OVERLAY_FORM_ALPHABET).then(shaped),
    suffixIn(bracket, OVERLAY_NUMERIC_ALPHABET).then(shaped),
  ]);

  return {
    // Unioned per text rather than over the texts joined, so that `levelsIn`'s pair spanning two runs stays inside one
    // reading: a digit the first treatment ended on and a digit the third began with were never neighbours on a screen.
    levels: [...new Set(ahead.flatMap(levelsIn))],
    iv,
    form: numeric !== null && /^\d{2}$/.test(numeric) ? numeric : lettered,
  };
}

/**
 * Every level the digits ahead of the IVs could be: each one and two digit piece of every run of them, since which end
 * of a run carries the stray `1` is exactly what cannot be told from the text. Every run rather than the first, though
 * the percentage behind the level only adds noise, because the artwork ahead of the level can add more: a band wide
 * enough to find the overlay on one phone is wide enough to read a stray `4` to the left of it, which as the only
 * candidate would disagree with an HP that is perfectly clear. Being generous is safe here: this is a shortlist for the
 * HP to choose from, not an answer.
 */
function levelsIn(text: string): number[] {
  const levels = new Set<number>();
  const runs = [...text.matchAll(/\d+/g)].map(([digits]) => digits);

  const offer = (piece: string) => {
    const level = Number(piece);

    if (level >= 1 && level <= MAX_LEVEL) {
      levels.add(level);
    }
  };

  for (const digits of runs) {
    for (let at = 0; at < digits.length; at++) {
      for (const length of [1, 2]) {
        const piece = digits.slice(at, at + length);

        if (piece.length === length) {
          offer(piece);
        }
      }
    }
  }

  // And a pair spanning two neighbouring runs, because a space Tesseract put between digits is not a boundary the
  // screen drew. `pikachu-witch-hat.png`'s overlay is `L27 ɪᴠ51`, read as runs of `2`, `7` and `51`, so `27` was
  // offered by nothing at all and the HP was left choosing between the 26.5 and 27 it admits — the one capture whose
  // level stayed ambiguous. The same generosity one step further, and the HP still arbitrates rather than this
  // deciding anything.
  for (const [i, run] of runs.entries()) {
    const next = runs[i + 1];

    if (next !== undefined) {
      offer((run.at(-1) ?? '') + (next.at(0) ?? ''));
    }
  }

  return [...levels];
}
