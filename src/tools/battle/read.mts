/**
 * What a battle's text says: the two names along the top, ours and the opponent's, the CP beside each, and the charged
 * move printed under each button. Our name is the species unless the Pokémon has a nickname, the opponent's always.
 *
 * Read off a stream frame, 360 wide, by cropping each band and scaling it up for Tesseract. Measured on the committed
 * frames, each name and each move comes out whole, lit buttons and unlit alike, where OCR of the whole frame drops
 * most of them into the artwork around them. About 220ms for both bands, so it is done every few seconds rather than
 * every frame.
 */

import { closest, type GameData } from '../inventory/game-master.mts';
import { centre, ocr, type Line } from '../inventory/ocr.mts';
import { crop, scale, type Image } from '../inventory/png.mts';
import { BOTTOM, down, TOP } from './layout.mts';
import { BUTTON_XS } from './recognise.mts';

export interface Sighting {
  /** Our species, or null where a nickname stands in its place. */
  own: string | null;
  opponent: string | null;

  /** Each side's CP, or null where it was not read. */
  ownCp: number | null;
  opponentCp: number | null;

  /** The move under each button whose label was read, by the button's x. */
  moves: Map<number, string>;
}

/** A sighting of nothing yet, which a battle starts from. */
export const unseen = (): Sighting => ({ own: null, opponent: null, ownCp: null, opponentCp: null, moves: new Map() });

/**
 * Fractions of a Pixel 4 XL's screen: the HUD's line of names, pinned to the top, and the labels beneath the buttons,
 * lit or not, pinned to the foot.
 */
const NAMES = { top: 0.066, bottom: 0.09 } as const;
const LABELS = { left: 0.05, right: 0.95, top: 0.925, bottom: 0.985 } as const;

/**
 * How far a label's centre may sit from a button's and still be its label. Two buttons' labels are 0.38 apart, and a
 * long name centred under one spans about 0.15 either side.
 */
const LABEL_REACH = 0.12;

/**
 * A CP as the HUD prints it, `CP 2495`, which OCR can run into the names beside it or into the other side's CP when the
 * sky between the panels is dark: `cP 4139 ne CP 4163` at night. Read off the names' band of the committed frames, it
 * gave 52 of the 60 CPs right; three were one digit out, 4143 for 4163 twice and 1397 for 1387, and five were missing.
 */
const CP = /c\s*p\s*(\d{2,4})\b/gi;

/**
 * How wide a label's letter is, as a fraction of the screen's width: 0.019 to 0.023 across Hydro Pump, Avalanche,
 * Shadow Sneak and Crunch on the committed frames. A label's line can run on past it, OCR taking in whatever is drawn
 * to its right — Crunch's from 0.42 to 0.89 behind a Tyranitar, its centre then nearer the right button than its own —
 * so the left edge, which held at 0.42 to 0.46, is what places it, with the name's own width.
 */
const LETTER = 0.022;

const band = (
  image: Image,
  box: { left?: number; right?: number; top: number; bottom: number },
  anchor: number,
  factor: number,
) => {
  const left = Math.round((box.left ?? 0) * image.width);
  const top = Math.round(down(box.top, anchor, image) * image.height);
  const width = Math.round((box.right ?? 1) * image.width) - left;
  const height = Math.round(down(box.bottom, anchor, image) * image.height) - top;

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
  const names = band(image, NAMES, TOP, 2);
  const labels = band(image, LABELS, BOTTOM, 3);
  const charged = data.moves.filter((move) => !move.fast && move.name in data.combat).map((move) => move.name);
  const sighting = unseen();

  // The names share their line with each side's CP, which matches no species and so drops out of the names here. Each
  // CP is placed by where it starts in its line, a line that runs both together holding ours first.
  for (const line of await read(names.image)) {
    const species = closest(line.text, data.species, (name) => name);
    const side = across(line, names, image) < 0.5 ? 'own' : 'opponent';

    if (species) {
      sighting[side] ??= species;
    }

    for (const match of line.text.matchAll(CP)) {
      const at =
        (names.left + (line.left + (match.index / line.text.length) * line.width) / names.factor) / image.width;

      sighting[at < 0.5 ? 'ownCp' : 'opponentCp'] ??= Number(match[1]);
    }
  }

  // Beneath each move is how effective it is, which matches no move and so drops out here.
  for (const line of await read(labels.image)) {
    const move = closest(line.text, charged, (name) => name);

    if (!move) {
      continue;
    }

    const left = (labels.left + line.left / labels.factor) / image.width;
    const width = Math.min(line.width / labels.factor / image.width, move.length * LETTER);
    const x = left + width / 2;
    const [button] = BUTTON_XS.filter((bx) => Math.abs(bx - x) <= LABEL_REACH).sort(
      (a, b) => Math.abs(a - x) - Math.abs(b - x),
    );

    if (button !== undefined) {
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
    ownCp: read.ownCp ?? seen.ownCp,
    opponentCp: read.opponentCp ?? seen.opponentCp,
    moves: new Map([...kept, ...read.moves]),
  };
}
