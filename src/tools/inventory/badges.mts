/**
 * What the detail screen states in pixels rather than in words: the size pill over the height, the favourite's star,
 * the gender symbol beside the HP and the account's own tag chips. The seam with `detail.mts` is the method rather than
 * the subject: each of these is found by colour or by shape, and only then cropped and handed to OCR, where that module
 * reads text the game wrote as text. Three of the four need no OCR at all. `parseDetail` calls them, filling one
 * `Detail` from both halves.
 */

import { fold, ocrLine, type Line } from './ocr.mts';
import { chroma, crop, isolate, luminance, rgb, scale, type Image } from './png.mts';
export type Gender = 'male' | 'female';

/** The four bands the game records, each of which `src/search/terms.ts` has a search for. */
export type Size = 'XXL' | 'XL' | 'XS' | 'XXS';

interface Patch {
  left: number;
  top: number;
  width: number;
  height: number;
  fraction: number;
}

/** Where the pixels a predicate accepts are in a region, and how much of it they cover. */
function patchIn(image: Image, matches: (r: number, g: number, b: number) => boolean): Patch {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  let found = 0;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (matches(...rgb(image, x, y))) {
        found++;
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
    fraction: found / (image.width * image.height),
  };
}

/**
 * Where the pixels a predicate accepts are, leaving out any row or column that holds only one of them. That is a
 * patch's extent without a stray pixel beside it, where `patchIn`'s box reaches every one — and the size pill has to be
 * cropped to the pill alone, since one stray coloured pixel at the far corner of its band would take in the white
 * panel, which isolating the badge's white text then turns black. A proportion of the busiest row will not do: the
 * pill's tail narrows to two or three pixels a row, and cutting it off cuts the bottom off the `XXS` above it.
 */
function extentOf(image: Image, matches: (r: number, g: number, b: number) => boolean): Omit<Patch, 'fraction'> {
  const rows = new Array<number>(image.height).fill(0);
  const columns = new Array<number>(image.width).fill(0);

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (matches(...rgb(image, x, y))) {
        rows[y] = (rows[y] ?? 0) + 1;
        columns[x] = (columns[x] ?? 0) + 1;
      }
    }
  }

  const span = (counts: number[]) => {
    const first = counts.findIndex((n) => n > 1);

    return [first, counts.findLastIndex((n) => n > 1) - first + 1] as const;
  };

  const [left, width] = span(columns);
  const [top, height] = span(rows);

  return { left, top, width, height };
}

/** The warm gold the game fills a favourite's star with. */
const gold = (r: number, g: number, b: number) => r >= 180 && g >= 110 && g <= 235 && b <= 130 && r - b >= 90;

/** Any hue at all, against a panel that is neutral grey. What the size badge's pill needs, since its hue varies. */
const coloured = (r: number, g: number, b: number) => chroma(r, g, b) >= SIZE_CHROMA;

/**
 * One of the four size badges, or null for the two ordinary bands in the middle, which wear none. It is white on a
 * coloured pill drawn directly over the height, and two things about finding it are worth stating, because the obvious
 * answer to each does not work.
 *
 * **Anchor it on the height, not on the row the height shares with the weight.** The pill sits above the height alone,
 * and a band taken from a fraction of the screen's width instead reaches past the right edge of the panel into the page
 * behind it, which is saturated navy and swamps anything the pill contributes. The height's own line bounds it.
 *
 * **Find it by saturation, not by hue.** The pill is gold where the measurement beside it is also a personal record and
 * teal where it is not: `xurkitree.png`'s is rgb(188,157,56) over a gold `TALLEST`, and `smoliv.png`'s rgb(109,184,182)
 * over a plain `HEIGHT`, with its gold `LIGHTEST` over on the weight. So a gold test answers only for a Pokémon that
 * happens to be the tallest or shortest of its species: two of the five badged captures here.
 *
 * Cropping to the pill is what makes the text legible at all: isolating the white text over the whole band turns the
 * panel around it black too, since the panel is white as well, and hands Tesseract a black page with one white island
 * in it. Cropping first makes the pill the whole page, where the text really is dark on light.
 *
 * The saturation is the cheap test as well, since most Pokémon wear no badge and can be answered with no OCR at all. It
 * is not sufficient alone — the band is cropped from the screen, artwork and all, and artwork can be any colour — so
 * the text still has to spell one of the four.
 */
export async function sizeOf(image: Image, height: Line): Promise<Size | null> {
  const band = crop(
    image,
    height.left - height.height,
    height.top - height.height * SIZE_RISE,
    height.width * SIZE_SPAN + height.height,
    height.height * SIZE_RISE,
  );

  if (patchIn(band, coloured).fraction < SIZE_FILL) {
    return null;
  }

  const pill = extentOf(band, coloured);
  const badge = crop(band, pill.left, pill.top, pill.width, pill.height);
  const text = fold((await ocrLine(scale(isolate(badge, 200, 70), 3), SIZE_ALPHABET)) ?? '');

  return SIZES.find((size) => text.includes(size.toLowerCase())) ?? null;
}

/**
 * Whether the star at the top right is filled. A favourite's star is solid gold and an ordinary one is a white outline
 * with the artwork showing through it, so this is the one flag on the screen that colour alone settles: measured over
 * eighteen captures from two phones, 19.4% of that corner was gold on the one favourite and 0.00% on every other.
 *
 * The star is the game's own furniture rather than PGSharp's, so it scales with the screen and a fraction holds where
 * one for the overlay did not — 0.900, 0.074 of one phone against 0.903, 0.080 of the other.
 */
export function isFavourite(image: Image): boolean {
  const star = crop(image, image.width * 0.86, image.height * 0.05, image.width * 0.1, image.height * 0.06);

  return patchIn(star, gold).fraction >= FAVOURITE_GOLD;
}

/**
 * Male, female, or null for a species that has no gender. The symbol sits to the right of the HP bar and is the only
 * ink in that corner of the panel, so it is found by where the HP is rather than by a fraction of the screen.
 *
 * Colour cannot tell the two apart — both are drawn in the same pale blue-grey — so the shape does it. A male's arrow
 * leaves the circle up and to the right and a female's stem hangs below it, which makes the female's ink taller than it
 * is wide and the male's square. Measured on two phones at different resolutions, the ratio is 1.51 against 0.99 and
 * 1.51 against 1.00, so the same threshold serves both. All 16 captures here of a species with no gender, from Articuno
 * to Xurkitree, report no symbol at all.
 *
 * What the ink is darker *than* is the panel itself, read off the region rather than written down here. Nine tenths of
 * the region is panel by construction, so its commonest luminance is the panel's, and the symbol is a clear 49 below it
 * — 175 against 224 on every capture that has one. A level written down instead does not hold: at 235 the panel is
 * itself ink, which makes the region its own silhouette and the answer the shape of the crop. Since the crop is sized
 * from `hp.height`, and Tesseract reports that as anything from 20 to 37 for the same text, the gender would then be
 * decided by how tall OCR thought the HP was, and a Pokémon with no gender given one.
 */
export function genderOf(image: Image, hp: Line): Gender | null {
  const region = crop(image, image.width * 0.78, hp.top - hp.height * 4, image.width * 0.15, hp.height * 6);
  const histogram = new Map<number, number>();

  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const level = Math.round(luminance(...rgb(region, x, y)));
      histogram.set(level, (histogram.get(level) ?? 0) + 1);
    }
  }

  const panel = [...histogram].reduce((most, level) => (level[1] > most[1] ? level : most), [0, 0])[0];
  const symbol = patchIn(
    region,
    (r, g, b) => luminance(r, g, b) < panel - GENDER_INK_BELOW && chroma(r, g, b) < GENDER_INK_CHROMA,
  );

  if (symbol.fraction < GENDER_INK_MIN) {
    return null;
  }

  return symbol.height / Math.max(1, symbol.width) >= GENDER_TALL ? 'female' : 'male';
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
 * The tags a Pokémon carries, read off the chips the game draws under its HP. They are white on a coloured pill, so
 * the colour is what finds them — the panel around is white and so is the text — and each chip is cropped on its own
 * by the columns it occupies, since a Pokémon can carry several and reading the row whole would run their names
 * together.
 *
 * It answers what it read rather than what the tag is called: a caller that knows the names can match against them,
 * which is worth doing, since `Trade to 0xNULL` comes back as `Trade toOxNULL` and only agrees once folded.
 */
export async function tagsOn(image: Image, hp: Line, row: Line): Promise<string[]> {
  const top = hp.top + hp.height;

  if (row.top <= top) {
    return [];
  }

  const gap = crop(image, image.width * TAG_PANEL.from, top, image.width * TAG_PANEL.width, row.top - top);
  const floor = aboveTypes(gap);

  if (floor < 1) {
    return [];
  }

  const band = crop(gap, 0, 0, gap.width, floor);
  const found: string[] = [];

  for (const chip of chipsIn(band, image.height * TAG_HEIGHT)) {
    const text = await ocrLine(scale(isolate(crop(band, chip.left, chip.top, chip.width, chip.height), 200, 70), 2));

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

/** Whether any pixel of a row carries a hue, against a panel that is neutral grey. */
function rowColoured(band: Image, y: number): boolean {
  for (let x = 0; x < band.width; x++) {
    if (chroma(...rgb(band, x, y)) >= TAG_CHROMA) {
      return true;
    }
  }

  return false;
}

/**
 * How much of the gap between the HP and the weight the chips can be in, which the gap itself says. The type icons sit
 * level with the weight row, so they always reach the bottom of the gap where a chip row never does: on `ho-oh.png` the
 * two chips occupy rows 44-110 of 220 and the icons rows 201-219, with 90 blank rows between, and on a capture carrying
 * no chip the one coloured run, where there is one, is the icons alone. So the bottom-most run of coloured rows is the
 * icons, and everything above where it starts is the chips' own band — where that run reaches the bottom row, since a
 * grey icon contributes no run at all.
 *
 * Deriving it is what makes it right rather than nearly right, because the two obvious fractions are both wrong and
 * neither says so. 0.45 of the gap clips `ho-oh.png`'s chips to 55 rows against a true 67 — below the 56.1 a chip has
 * to stand to be counted one — so both are discarded by 1.1 pixels, and the screen reports no tags with two plainly on
 * it. The whole gap is no answer either: it merges each chip with the icons beneath it into a single run of columns and
 * drops its fill from 0.86 to 0.31, which reads as no chip just the same.
 */
function aboveTypes(gap: Image): number {
  let floor = gap.height;

  // Only a run that reaches the bottom row is the icons. A Normal type's icon is grey and colours nothing, so on
  // `snorlax-purified.png` the lowest coloured run is its `Perfect` chip at rows 33-99 of 208, and taking whatever run
  // is lowest would cut the chip away as though it were the icons. Over the 45 captures with a gap to read, every icon
  // run ends on the gap's last row exactly, six have no coloured run at all, and that chip is the only run that does
  // not.
  while (floor > 0 && rowColoured(gap, floor - 1)) {
    floor--;
  }

  return floor;
}

/** The coloured runs of columns in a band, one per chip, with the rows each of them actually occupies. */
function chipsIn(band: Image, tallest: number): { left: number; top: number; width: number; height: number }[] {
  const coloured = (x: number, y: number) => chroma(...rgb(band, x, y)) >= TAG_CHROMA;

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

/**
 * Measured over the 49 committed captures: 40 are exactly 0, the five favourites run 18.18% to 26.49%, and three land
 * between 0.36% and 1.34% with no filled star. `spinda-04.png` is why this is not 0.02 — a warm bokeh background puts
 * **15.34%** in that corner behind a white-outline star, which is a false positive at any threshold below it. So this
 * is a discriminator rather than headroom, and the margin is thin on both sides: 1.2 points under the lowest real
 * favourite and 1.7 over the worst non-favourite.
 */
const FAVOURITE_GOLD = 0.17;

/**
 * The size badge's pill, as a band over the height: how far above the height's own top to reach and how far past its
 * right, both in the height's own height. The pill is a little under two line-heights tall and the text beside it runs
 * half again as wide as `0.15m` does, which is where 1.9 and 1.6 come from.
 *
 * `SIZE_CHROMA` is what separates the pill from the panel it sits on: the panel is neutral rgb(224,224,224) and both
 * hues the pill takes are far from it — gold rgb(188,157,56) at 132 and teal rgb(109,184,182) at 75 — so anything over
 * 60 catches either without catching the panel's own antialiasing. `SIZE_FILL` only has to beat the stray coloured
 * pixel; a real pill is several per cent of the band.
 */
const SIZE_RISE = 1.9;
const SIZE_SPAN = 1.6;
const SIZE_CHROMA = 60;
const SIZE_FILL = 0.01;

/**
 * The only three letters a badge can spell, and the four words it spells with them. Longest first, so an `XXL` is not
 * answered by the `XL` inside it.
 */
const SIZE_ALPHABET = 'XSL';
const SIZES = ['XXL', 'XXS', 'XL', 'XS'] as const satisfies readonly Size[];

/**
 * The gender symbol against the white panel behind it: how far below the panel's own level its ink has to fall, how
 * neutral it has to stay, how much of the region it has to cover and how tall it has to be to be a female's.
 */
const GENDER_INK_BELOW = 20;
const GENDER_INK_CHROMA = 45;
const GENDER_INK_MIN = 0.01;
const GENDER_TALL = 1.25;
