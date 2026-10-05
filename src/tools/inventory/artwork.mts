/**
 * Telling two forms apart by the artwork, for the ones the numbers cannot reach.
 *
 * HP is a function of `stamina` alone, so two forms sharing their types and all three base stats are identical in every
 * field the detail screen states — Deerling's four seasons are `115/100/155 Normal+Grass` to the last point, and so are
 * Burmy's three, Basculin's three, Genesect's five, Cherrim's two, Keldeo's two and Shellos' two. `identify` folds them
 * to one and answers it with no alternatives and no notes, which is a wrong answer that flags nothing.
 *
 * The artwork is the only thing left, and the game draws each such form its own: `game-master.mts` resolves a form to
 * the file `pogo_assets` holds it under, by name and against that directory's own listing. So the question is whether
 * a capture's artwork can be matched against those icons, and the answer is a qualified yes — qualified by abstention
 * rather than by accuracy, because a reader that is wrong and says nothing is the expensive kind.
 *
 * **The backdrop is the whole problem, not the colours.** A hue histogram over a fixed box scores 8 of 17 captures,
 * because the game blurs an arbitrary scene behind the model and will put a photograph there: `deerling-spring.png`
 * stands on orange bokeh against which a pink Deerling is some 15% of the frame, and the naive match called it Winter.
 * Bounding the subject by the panel below it and by sharpness takes that to 12 of 17 and fixes all four Deerling.
 *
 * **A backdrop is not always blurred, which is what the largest component is for.** `shellos-west.png` is a pink
 * Shellos on flat teal with crisp bubbles drawn over it, so growing the mask from those edges floods it with the one
 * colour that is also East Sea's. Keeping only the largest connected run does not raise the hit rate at all — still 12
 * of 17 — and is the change that matters anyway, because it takes that capture from a confidently wrong answer to an
 * abstention.
 *
 * **Judge it on the margin.** At `MARGIN` the match answers 8 of those 17 and is right on all 8, and five of the ones
 * it declines are captures whose nearest icon is the wrong one — so the margin is what stands between it and being
 * confidently wrong five times. An abstention costs nothing and fixes nothing: `identify`'s fold still collapses the
 * rivals silently, so a declined call is exactly as wrong as it was before and no louder. Genesect is unreachable this
 * way rather than merely missed — its five forms are one robot with a differently-coloured drive cassette a few pixels
 * across, so every margin lands between 0.015 and 0.020.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Form, type GameData } from './game-master.mts';
import { decodePng, rgb, type Image } from './png.mts';

/** Where the game's own form icons live, named by dex and form as `game-master.mts` resolves them against its index. */
const ICONS = 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/';

/** How long a cached icon is good for. Artwork changes with a game update, not with a session. */
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** How many hue bins a signature holds. Coarse on purpose: the model is lit and posed, where the icon is flat art. */
const BINS = 12;

/**
 * How saturated and how bright a pixel has to be to carry form information. Below these it is the game's own furniture,
 * a shadow or the panel — and the white UI falling out here for free is why the arc, the CP, the star and PGSharp's own
 * overlay need no excluding by position.
 */
const SATURATION = 0.35;
const VALUE = 0.2;

/** The flat grey the game draws its panel in, which is what the artwork stands on and where it stops. */
const PANEL = 224;
const PANEL_TOLERANCE = 12;

/** How much of a row has to be panel for that row to be the top of it, and where to look for it. */
const PANEL_FILL = 0.9;
const PANEL_FROM = 0.25;
const PANEL_TO = 0.6;

/** The artwork's top where no overlay was found to put a floor under it, and how much of the width to take. */
const ARTWORK_FROM = 0.215;
const ARTWORK_SPAN = { from: 0.28, to: 0.72 };

/**
 * How far apart two luminances have to be, and over how many pixels, for the gap to be an edge of the model rather than
 * the gradient of a blurred scene. Then how far to grow those edges, which is what takes in the flat interior they
 * bound — a body's own colour has no gradient in it at all, so edges alone would sample the outline and nothing else.
 */
const EDGE = 28;
const EDGE_RADIUS = 2;
const GROW = 6;

/**
 * How much closer the nearest form has to be than the runner-up before the answer is worth having. Measured over 17
 * captures: at 0.30 the match answers 8 and is right on all 8, where taking the nearest regardless is right on 12 of 17
 * and wrong with conviction on one — `shellos-west.png` at a margin of 0.211, and 0.407 before the largest-component
 * step. Abstaining is cheap and being confidently wrong is not, so this is set above the worst of those rather than to
 * maximise the hit rate.
 */
export const MARGIN = 0.3;

/**
 * How many pixels have to carry a hue before the signature is worth comparing. Sampling alone moves a twelve-bin
 * histogram of a thousand pixels by about 0.08 from the colours they were drawn from, and one of a hundred by about
 * 0.27, which is most of `MARGIN`: a few stray pixels would lead by a margin they had not earned. The fewest any
 * capture is answered on is `burmy-trash.png`'s 4,115.
 */
const COUNTED = 1000;

/** A normalised hue histogram. Comparable between a capture and an icon, which is the only thing the two share. */
export type Signature = readonly number[];

/** The first row of the game's own panel, which bounds the artwork below. */
function panelTop(image: Image): number {
  const from = Math.round(image.width * 0.2);
  const to = Math.round(image.width * 0.8);
  const wanted = ((to - from) / 4) * PANEL_FILL;

  for (let y = Math.round(image.height * PANEL_FROM); y < image.height * PANEL_TO; y++) {
    let flat = 0;

    for (let x = from; x < to; x += 4) {
      const [r, g, b] = rgb(image, x, y);

      if (
        Math.abs(r - PANEL) <= PANEL_TOLERANCE &&
        Math.abs(g - PANEL) <= PANEL_TOLERANCE &&
        Math.abs(b - PANEL) <= PANEL_TOLERANCE
      ) {
        flat++;
      }
    }

    if (flat > wanted) {
      return y;
    }
  }

  return Math.round(image.height * 0.34);
}

/** Hue in turns, saturation and value, which is what separates a body's colour from the lighting on it. */
function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  let hue = 0;

  if (span !== 0) {
    if (max === r) {
      hue = ((g - b) / span + 6) % 6;
    } else if (max === g) {
      hue = (b - r) / span + 2;
    } else {
      hue = (r - g) / span + 4;
    }
  }

  return [hue / 6, max === 0 ? 0 : span / max, max / 255];
}

/** The histogram of a list of pixels, and how many of them carried any hue at all. */
function histogram(pixels: Iterable<[number, number, number]>): { signature: Signature; counted: number } {
  const bins = new Array<number>(BINS).fill(0);
  let counted = 0;

  for (const [r, g, b] of pixels) {
    const [hue, saturation, value] = hsv(r, g, b);

    if (saturation < SATURATION || value < VALUE) {
      continue;
    }

    const bin = Math.min(BINS - 1, Math.floor(hue * BINS));
    bins[bin] = (bins[bin] ?? 0) + 1;
    counted++;
  }

  return { signature: bins.map((n) => n / (counted || 1)), counted };
}

/** Grown by `radius` in both directions, done as two passes since a square structuring element separates. */
function grow(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const across = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) {
        continue;
      }

      for (let d = -radius; d <= radius; d++) {
        const nx = x + d;

        if (nx >= 0 && nx < width) {
          across[y * width + nx] = 1;
        }
      }
    }
  }

  const out = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!across[y * width + x]) {
        continue;
      }

      for (let d = -radius; d <= radius; d++) {
        const ny = y + d;

        if (ny >= 0 && ny < height) {
          out[ny * width + x] = 1;
        }
      }
    }
  }

  return out;
}

/**
 * The biggest connected run of the mask, which is the subject rather than the scenery. The Pokémon is one large
 * component where a backdrop's own detail — bubbles, leaves, bokeh edges — is many small ones.
 */
function largest(mask: Uint8Array, width: number, height: number): Uint8Array {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  let best: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) {
      continue;
    }

    const blob: number[] = [];
    seen[start] = 1;
    stack.push(start);

    for (let p = stack.pop(); p !== undefined; p = stack.pop()) {
      blob.push(p);
      const x = p % width;
      const y = (p - x) / width;

      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          continue;
        }

        const q = ny * width + nx;

        if (mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }

    if (blob.length > best.length) {
      best = blob;
    }
  }

  const out = new Uint8Array(mask.length);

  for (const p of best) {
    out[p] = 1;
  }

  return out;
}

/**
 * The signature of the Pokémon on a detail screen, or null where too little of it was found to mean anything.
 *
 * `from` is where the artwork starts, as a fraction of the height — PGSharp's overlay sits over the artwork and its own
 * box is the floor to use where one was found, since a fraction written down here would be one phone's.
 */
export function signatureOf(image: Image, from = ARTWORK_FROM): Signature | null {
  const left = Math.round(image.width * ARTWORK_SPAN.from);
  const right = Math.round(image.width * ARTWORK_SPAN.to);
  const top = Math.round(image.height * from);
  const bottom = panelTop(image);
  const width = right - left;
  const height = bottom - top;

  if (width < 1 || height < 1) {
    return null;
  }

  // Read once rather than per neighbour, since each pixel is compared against four others.
  const luminance = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = ((top + y) * image.width + left + x) * 4;
      luminance[y * width + x] =
        0.2126 * (image.data[i] ?? 0) + 0.7152 * (image.data[i + 1] ?? 0) + 0.0722 * (image.data[i + 2] ?? 0);
    }
  }

  const edges = new Uint8Array(width * height);

  // Neighbours are read inside the crop only. Above it is PGSharp's box and below it the panel, so a neighbour read
  // across either border finds the border itself, and a full-width edge there grows into a band of backdrop.
  for (let y = EDGE_RADIUS; y < height - EDGE_RADIUS; y++) {
    for (let x = EDGE_RADIUS; x < width - EDGE_RADIUS; x++) {
      const p = y * width + x;
      const here = luminance[p] ?? 0;
      const gap = Math.max(
        Math.abs(here - (luminance[p - EDGE_RADIUS] ?? 0)),
        Math.abs(here - (luminance[p + EDGE_RADIUS] ?? 0)),
        Math.abs(here - (luminance[p - EDGE_RADIUS * width] ?? 0)),
        Math.abs(here - (luminance[p + EDGE_RADIUS * width] ?? 0)),
      );

      if (gap >= EDGE) {
        edges[p] = 1;
      }
    }
  }

  const mask = largest(grow(edges, width, height, GROW), width, height);
  const pixels: [number, number, number][] = [];

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      if (mask[(y - top) * width + (x - left)]) {
        pixels.push(rgb(image, x, y));
      }
    }
  }

  const { signature, counted } = histogram(pixels);

  return counted < COUNTED ? null : signature;
}

/** The signature of one of the game's own form icons, which is flat art over transparency. */
export function signatureOfIcon(image: Image): Signature {
  const pixels: [number, number, number][] = [];

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) >= 128) {
        pixels.push(rgb(image, x, y));
      }
    }
  }

  return histogram(pixels).signature;
}

/** How far apart two signatures are, as the sum of the differences per bin. 0 is identical and 2 shares no hue. */
export function distance(a: Signature, b: Signature): number {
  let total = 0;

  for (let i = 0; i < BINS; i++) {
    total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }

  return total;
}

/**
 * Whichever reference the signature is nearest, or null where nothing is near enough *ahead of the rest* to be worth
 * answering. The margin is the whole of the contract: a list of one is answered outright, and anything closer than
 * `margin` to its runner-up is declined rather than guessed at.
 */
export function nearest<T>(signature: Signature, references: ReadonlyMap<T, Signature>, margin = MARGIN): T | null {
  const ranked = [...references].map(([key, reference]) => ({ key, gap: distance(signature, reference) }));

  ranked.sort((a, b) => a.gap - b.gap);

  const [best, runner] = ranked;

  if (!best) {
    return null;
  }

  return runner === undefined || runner.gap - best.gap >= margin ? best.key : null;
}

/** A form the index found artwork for, which is what `iconsFor` needs and what `ambiguous` has already checked. */
export type Drawn = Form & { icon: string };

/**
 * What the numbers leave ambiguous, split by whether the artwork can reach it: the groups of two or more forms
 * identical in dex, types and all three stats, partitioned on whether **every** member has an icon. A group short of
 * one can never be narrowed — `identify` declines to choose between forms it cannot all see — so its icons would be
 * downloaded for nothing, and naming it once is the whole of what can be said about it.
 *
 * Measured over a real game master: 52 groups hold 237 forms, and 41 of those groups have an icon for every member.
 * The other 11 are short of 72 icons between them, Scatterbug, Spewpa and Minior having none at all and Spinda nine of
 * twenty — nine being what the game has released.
 */
export function ambiguous(data: GameData): { drawn: Drawn[]; short: Form[][] } {
  const groups = new Map<string, Form[]>();

  for (const form of data.forms) {
    if (form.costume) {
      continue;
    }

    const key = `${form.dex}|${[...form.types].sort().join('+')}|${form.attack}|${form.defense}|${form.stamina}`;
    const group = groups.get(key) ?? [];
    group.push(form);
    groups.set(key, group);
  }

  const drawn: Drawn[] = [];
  const short: Form[][] = [];

  for (const family of groups.values()) {
    if (family.length < 2) {
      continue;
    }

    // The narrowing is what carries the icon's name into `iconsFor`, so the gate is a length rather than an `every`:
    // the same walk cannot both prove a family complete and hand back forms the type says are drawn.
    const complete = family.filter((f): f is Drawn => f.icon !== null);

    if (complete.length === family.length) {
      drawn.push(...complete);
    } else {
      short.push(family);
    }
  }

  return { drawn, short };
}

async function iconBytes(dir: string, name: string, refresh: boolean): Promise<Buffer | null> {
  const path = join(dir, name);

  if (!refresh && existsSync(path) && Date.now() - statSync(path).mtimeMs < WEEK) {
    return readFileSync(path);
  }

  let bytes: Buffer;

  try {
    const response = await fetch(ICONS + name);

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    // An icon is an improvement rather than a prerequisite, so a missing one costs an abstention and not a scan — and
    // that holds as much for a network that is down, where `fetch` throws, as for a 404.
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`  ${name}: ${reason}; forms sharing its numbers stay ambiguous`);

    return existsSync(path) ? readFileSync(path) : null;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(path, bytes);

  return bytes;
}

/**
 * A signature per form for every form the artwork could settle, downloading the icons once and caching them beside the
 * game master. 153 files of some 8 KB on a real game master, so this is a one-off of about a megabyte.
 */
export async function iconsFor(dir: string, data: GameData, refresh = false): Promise<Map<Form, Signature>> {
  const { drawn, short } = ambiguous(data);
  const signatures = new Map<Form, Signature>();

  if (drawn.length > 0) {
    console.error(`Reading ${drawn.length} form icons`);
  }

  // Per family and ahead of the download, since the index already said so: a family short of one icon is one the game
  // draws no artwork for, and reporting it per missing form would be the same sentence 72 times a scan.
  if (short.length > 0) {
    const named = short.map((family) => `${family[0]?.species ?? '?'} (${family.length})`);
    console.error(`  no icon for every form of ${short.length} families, which stay ambiguous: ${named.join(', ')}`);
  }

  for (const form of drawn) {
    const bytes = await iconBytes(join(dir, 'icons'), form.icon, refresh);

    if (bytes === null) {
      continue;
    }

    try {
      signatures.set(form, signatureOfIcon(decodePng(bytes)));
    } catch (error) {
      // A truncated download or a page served in place of the image is the same abstention as a 404.
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`  ${form.icon}: ${reason}; forms sharing its numbers stay ambiguous`);
    }
  }

  return signatures;
}
