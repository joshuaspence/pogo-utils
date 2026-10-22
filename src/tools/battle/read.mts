/**
 * What a battle's text says: the two names along the top, ours and the opponent's, and the charged move printed under
 * each button. Our name is the species unless the Pokémon has a nickname, and the opponent's always is.
 *
 * Read off a stream frame, 360 wide, by cropping each band and scaling it up for Tesseract. Measured on the committed
 * frames, each name and each move comes out whole, lit buttons and unlit alike, where OCR of the whole frame drops
 * most of them into the artwork around them. About 220ms for both bands, so it is done every few seconds rather than
 * every frame.
 */

import { closest, type GameData } from '../inventory/game-master.mts';
import { centre, ocr, type Line } from '../inventory/ocr.mts';
import { crop, scale, type Image } from '../inventory/png.mts';
import { BUTTON_XS } from './recognise.mts';

export interface Sighting {
  /** Our species, or null where a nickname stands in its place. */
  own: string | null;
  opponent: string | null;

  /** The move under each button whose label was read, by the button's x. */
  moves: Map<number, string>;
}

/** Fractions of the screen: the HUD's line of names, and the labels beneath the buttons, lit or not. */
const NAMES = { top: 0.066, bottom: 0.09 } as const;
const LABELS = { left: 0.05, right: 0.95, top: 0.925, bottom: 0.985 } as const;

/**
 * How far a label's centre may sit from a button's and still be its label. Two buttons' labels are 0.38 apart, and a
 * long name centred under one spans about 0.15 either side.
 */
const LABEL_REACH = 0.12;

const band = (image: Image, box: { left?: number; right?: number; top: number; bottom: number }, factor: number) => {
  const left = Math.round((box.left ?? 0) * image.width);
  const top = Math.round(box.top * image.height);
  const width = Math.round((box.right ?? 1) * image.width) - left;
  const height = Math.round(box.bottom * image.height) - top;

  return { image: scale(crop(image, left, top, width, height), factor), left, width, factor };
};

/** Where a line's centre falls across the screen, as a fraction of its width. */
const across = (line: Line, { left, factor }: { left: number; factor: number }, image: Image) =>
  (left + centre(line)[0] / factor) / image.width;

export async function readBattle(
  image: Image,
  data: GameData,
  read: (image: Image) => Promise<Line[]> = ocr,
): Promise<Sighting> {
  const names = band(image, NAMES, 2);
  const labels = band(image, LABELS, 3);
  const charged = data.moves.filter((move) => !move.fast && move.name in data.combat).map((move) => move.name);
  const sighting: Sighting = { own: null, opponent: null, moves: new Map() };

  // The names share their line with each side's CP, which matches no species and so drops out here.
  for (const line of await read(names.image)) {
    const species = closest(line.text, data.species, (name) => name);
    const side = across(line, names, image) < 0.5 ? 'own' : 'opponent';

    if (species) {
      sighting[side] ??= species;
    }
  }

  // Beneath each move is how effective it is, which matches no move and so drops out here.
  for (const line of await read(labels.image)) {
    const move = closest(line.text, charged, (name) => name);
    const x = across(line, labels, image);
    const button = BUTTON_XS.find((bx) => Math.abs(bx - x) <= LABEL_REACH);

    if (move && button !== undefined) {
      sighting.moves.set(button, move);
    }
  }

  return sighting;
}

/**
 * What is known after another read: what it read, and what earlier reads did that it did not. A Pokémon has either the
 * one centred button or the pair, so a label read under one layout drops any left from the other, which a label read
 * once off a frame mid-transition would otherwise hold against the pair for the rest of the Pokémon's turn out.
 */
export function merge(seen: Sighting, read: Sighting): Sighting {
  const centre = BUTTON_XS[1];
  const layout = read.moves.size > 0 ? read.moves.has(centre) : undefined;
  const kept = [...seen.moves].filter(([x]) => layout === undefined || (x === centre) === layout);

  return {
    own: read.own ?? seen.own,
    opponent: read.opponent ?? seen.opponent,
    moves: new Map([...kept, ...read.moves]),
  };
}
