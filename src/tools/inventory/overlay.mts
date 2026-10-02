/**
 * PGSharp's overlay, which states the level and the three IVs outright where the game's own CP does not survive OCR.
 * Two jobs: finding the box, by sweeping isolated bands for the one thing nothing else on the screen carries — three
 * small numbers separated by slashes — and reading what is inside it.
 *
 * Nothing here imports a sibling. `OVERLAY_LUMINANCE` and `OVERLAY_CHROMA` are exported because `detail.mts` isolates
 * the CP band against the same near-white thresholds.
 */

import { type IVs } from './game-master.mts';
import { ocr, ocrLine, type Line } from './ocr.mts';
import { brighten, crop, isolate, scale, type Image } from './png.mts';
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
 * How much to upscale the isolated overlay before reading it, in the order to try. 2 first because that is what the IVs
 * were measured against — at 1× Tesseract read `14/18/12` for `14/13/12`, and at 3× and 4× it starts taking the level's
 * small-caps `L` for a `1`.
 *
 * 3 is a fallback and not a replacement, for the one thing 2× loses: the slashes. `deerling-autumn.png` reads
 * `15 141512` at 2× for a perfectly legible `L15 ɪᴠ 14/15/12`, and `meloetta-aria.png` reads `13/1512` — one separator
 * gone and one surviving. No separators means no triple, which means no overlay found at all on a screen that plainly
 * carries one. Both read correctly at 3×. Trying 2× first is what keeps the `L` where it already reads, and the level
 * being a shortlist the HP filters is what makes the 3× read's own `L` worth having anyway.
 */
const OVERLAY_SCALES = [2, 3];

/**
 * How bright a channel has to be for `brighten` to keep it. Low enough to hold the IV percentage, whose colour is what
 * a chroma limit exists to drop.
 */
const OVERLAY_BRIGHTNESS = 120;

/**
 * A second brightness floor, for a band this one leaves blank. `basculin-blue.png` reads nothing whatever at 120 — at
 * any scale — so its near-white pass went unchallenged and its `8` stood as the `3` that treatment makes of it. At 180
 * the same band reads `5135 8/3/5`, and the percentage behind it settles the matter without anything having to guess:
 * `8/3/5` is 35%, which is the `35` inside that `135`.
 *
 * A third floor rather than a replacement, measured the same way the second one was: 120 is what reads
 * `genesect-normal.png` and the Nidoran pair, and raising it loses them. Nothing here is a free parameter — a floor is
 * only worth adding where some band is legible at it and blank at every floor already tried.
 */
const OVERLAY_BRIGHTNESS_HIGH = 180;

/**
 * The three ways to turn an overlay band into black on white, in the order to try. None wins outright, which is why all
 * three are here and why the percentage below arbitrates between them.
 *
 * Near-white first, because that is what every reading was measured against. What it costs is the thin strokes: the
 * chroma ceiling clips the anti-aliased edge of a leading `1`, so `articuno-galar.png` reads `2/4/13` for `12/4/13`,
 * `xurkitree.png` loses its attack entirely at `/2/14`, and `cherrim-overcast.png` yields nothing at any band at all.
 * Brightness alone reads all three correctly — and misses `genesect-normal.png`, `nidoran-female.png` and
 * `nidoran-male.png`, which near-white reads. So it is a second opinion rather than a replacement.
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
 * believe where two of them read different triples and both are possible. `articuno-galar.png` is the case: near-white
 * says `2/4/13`, which would be 42%, and brightness says `12/4/13` and prints `64`.
 *
 * Searched for in the text ahead of the triple rather than as a whole word, since it runs into the digits beside it —
 * `xurkitree.png`'s `82` arrives as `182`, the `1` being the first digit of an attack of 11.
 */
function confirmed(before: string, iv: IVs): boolean {
  return before.includes(String(Math.floor(((iv.attack + iv.defense + iv.stamina) / 45) * 100)));
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
 * are both
 * noise out of the artwork, and rejecting them is what lets the numeric pass run at all: `O` for `0` and `A` for `4` is
 * exactly the confusion a letters-only alphabet invites, and it answered a plausible-looking suffix for a Spinda whose
 * real label is `04`.
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
 * character — what the box had when it was only ever meant to hold the numbers — the letter comes back on 20 of the 24
 * and cannot be told from the level's own `L`; from three up all 24 that have an overlay read a closed bracket, and the
 * letters are identical at 3, 4, 5, 8 and 13. Going further costs readings: the no-suffix corpus reads 18 of its 26
 * overlays at 3, 4 and 5 and only 16 at 6 and beyond, losing a Buzzwole's `13/15/11` and a Hisuian Decidueye's
 * `11/15/14` — which is the IVs, not the suffix, so it would read as the overlay simply not being there. Five is the
 * most generous reach that costs none of them, and the 24 Unown triples are identical at every reach including the old.
 */
const OVERLAY_SUFFIX_CHARACTERS = 5;

/**
 * How much wider than the triple's box to read the bracketed form out of, as a fraction of that box's width. The box
 * `tighten` hands back is sized for the digits, and PGSharp appends the form to the right of them, so the crop that
 * makes the IVs legible is the one that cuts the suffix off — measured, `unown-m.png` and `unown-exclamation.png` both
 * read their bracket out of the untightened band and neither out of the tightened box.
 */
const OVERLAY_SUFFIX_REACH = 0.5;

/** Level 51 is a best buddy's; nothing the overlay can be saying is higher. */
const MAX_LEVEL = 51;

/** A filled star measured 19.4% gold and an outline 0.00%, so anywhere between them will do. */

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
/**
 * The text of an isolated overlay crop upscaled by `factor`, or null where it holds no IV triple. The whitelist is what
 * stops the isolated artwork either side of the text being read as glyphs that split a number in two.
 */
async function tripled(band: Image, factor: number): Promise<string | null> {
  const text = (await legible(scale(band, factor), OVERLAY_ALPHABET))?.text ?? '';

  return TRIPLE.test(text) ? text : null;
}

/**
 * One band read as a line, where a band Tesseract cannot read at all counts as a band with nothing on it.
 *
 * Tesseract dies on some images rather than reporting that it found nothing, and it is the image and not the machine: the
 * near-white treatment of `keldeo-resolute.png`'s band at y=356 kills it every time, at 1412×134. The sweep passes over
 * forty bands a capture and tolerates every other kind of empty one, so letting this kind end the whole read meant one
 * band of one capture failing that capture — and, through a memoised reading, three later tests that only wanted to
 * look at it. A crash here is nothing to go on, which is what every other unreadable band is too.
 */
async function legible(image: Image, alphabet?: string): Promise<Line | null> {
  try {
    return await ocrLine(image, alphabet);
  } catch (error) {
    console.error(`  a band could not be read (${error instanceof Error ? error.message : String(error)})`);

    return null;
  }
}

/** Every treatment and scale, in the order to try them: the cheapest first, so a rescue costs only what it rescues. */
const OVERLAY_PASSES = OVERLAY_TREATMENTS.flatMap((treat) => OVERLAY_SCALES.map((factor) => ({ treat, factor })));

/**
 * What the sweep tries, which is deliberately less than `OVERLAY_PASSES`. Finding the band and reading it are different
 * jobs: the sweep runs its passes over some forty bands a capture where `readOverlay` runs them over one box, so a pass
 * added here costs forty Tesseract processes and a pass added there costs one. Both treatments at the first scale is
 * enough to find every overlay in the corpus, and the scales that rescue a *reading* are left to `readOverlay`.
 */
const OVERLAY_SWEEPS = OVERLAY_TREATMENTS.map((treat) => ({ treat, factor: OVERLAY_SCALES[0] ?? 2 }));

export async function findOverlay(image: Image): Promise<OverlayBox | null> {
  const height = Math.round(image.height * OVERLAY_BAND);
  const step = Math.max(1, Math.round(height / 3));
  const width = Math.round(image.width * OVERLAY_SPAN);
  const left = Math.round((image.width - width) / 2);

  // A whole sweep per pass rather than every pass per band, which matters only for the clock: the overlay is found by
  // the first pass on all but a handful, and trying them all at every band cost the suite 60% more wall time to rescue
  // those few.
  for (const { treat, factor } of OVERLAY_SWEEPS) {
    for (let top = Math.round(image.height * OVERLAY_FROM); top < image.height * OVERLAY_TO; top += step) {
      const band = treat(crop(image, left, top, width, height));
      const line = await tripled(band, factor);

      if (line === null) {
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

      // `tighten` improves on the band where it can, and has to be checked rather than trusted: it derives the box from
      // the `top` Tesseract reports for a sparse line, which can sit a character-width above the glyphs — 434 against a
      // true 460 on `eevee-background.png` — so the box comes out straddling the text instead of covering it, and the
      // read that follows gets the bottom half of a row of digits. Keeping only a box that still yields a reading is
      // the same rule the sweep above applies to the band, one step further in: measured over the corpus, 14 of the 15
      // captures this used to answer nothing for read on the band.
      const tightened = await tighten(image, found);

      return tightened && (await readOverlay(image, tightened)) ? tightened : found;
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
  const raw = crop(
    image,
    box.x * image.width,
    box.y * image.height,
    box.width * image.width,
    box.height * image.height,
  );

  // Every treatment and scale, keeping the first whose percentage confirms its own triple, and falling back on the
  // first that read a possible one at all. Without that arbitration the order alone decides, and the first pass is
  // wrong about `articuno-galar.png` in a way nothing downstream could notice: `2/4/13` is a perfectly possible triple.
  let fallback: { iv: IVs; before: string } | null = null;
  let chosen: { iv: IVs; before: string } | null = null;

  for (const { treat, factor } of OVERLAY_PASSES) {
    const region = scale(treat(raw), factor);
    const text = (await legible(region, OVERLAY_ALPHABET))?.text ?? '';
    const triple = TRIPLE.exec(text);

    if (!triple) {
      continue;
    }

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

  const { iv, before } = reading;

  const suffixIn = async (crop: Image, alphabet: string) =>
    [...((await legible(crop, alphabet))?.text.matchAll(FORM_SUFFIX) ?? [])].at(-1)?.[1]?.trim() ?? null;

  // Both alphabets always run and a two-digit answer wins, because only one of them could have produced it: the letters
  // alphabet holds no digits, so it can only ever say "letter", and it says one about Spinda's `(04)` either way — `OA`
  // where both characters survive and a shape-valid `O` where the `4` does not. Reading the digits is the only thing
  // that can tell a real `04` from a letter, and nothing but Spinda is labelled numerically, so a two-digit read is not
  // a close call to arbitrate. Everything else is the letters alphabet's to answer.
  //
  // Off the first pass always, and deliberately not off whichever pass the triple came from: the two are separate
  // readings of separate parts of the line, and each wants its own treatment. `unown-m.png`'s IVs are only right under
  // brightness and its `(M)` only under near-white, so following the triple traded one for the other — and widening the
  // bracket to every pass is worse again, since the 3× read invents a shape-valid suffix on `basculin-blue.png`, which
  // carries none. One pass for the bracket is what was measured and is what the corpus bears out.
  //
  // Out of a wider crop than the triple, though, because the two want opposite things of the box. `tighten` narrows it
  // onto the digits, which is what makes the IVs read — and the suffix is appended to the *right* of those digits, so
  // the same narrowing clips it off: `unown-m.png` and `unown-exclamation.png` both lose their bracket to a box the
  // triple needs. Half the box's width to the right is enough to reach it on both, and `crop` clamps what runs off the
  // screen.
  const shaped = (suffix: string | null) => (suffix !== null && SUFFIX_SHAPE.test(suffix) ? suffix : null);
  const first = OVERLAY_PASSES[0];
  const wide = crop(
    image,
    box.x * image.width,
    box.y * image.height,
    box.width * image.width * (1 + OVERLAY_SUFFIX_REACH),
    box.height * image.height,
  );
  const bracket = first ? scale(first.treat(wide), first.factor) : wide;
  const lettered = shaped(await suffixIn(bracket, OVERLAY_FORM_ALPHABET));
  const numeric = shaped(await suffixIn(bracket, OVERLAY_NUMERIC_ALPHABET));

  return {
    levels: levelsIn(before),
    iv,
    form: (numeric !== null && /^\d{2}$/.test(numeric) ? numeric : null) ?? lettered ?? numeric,
  };
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
