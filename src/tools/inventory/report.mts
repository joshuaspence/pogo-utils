/**
 * Everything each reader makes of one screenshot, and whether it is a capture a scan could have used. Shared by
 * `pnpm inventory parse` and `snap` and by the Inventory page, so that a PNG dropped on the page reads exactly as
 * `parse` reads the same file: one function rather than two copies that would drift, the way the CLI's `storage` is one
 * walk for `scan` and `snap --search`.
 */

import { signatureOf, type Signature } from './artwork.mts';
import { parseDetail, readLines, type Detail } from './detail.mts';
import { type Form, type GameData } from './game-master.mts';
import { identify, type Identity } from './identify.mts';
import { parseMoves, type Moves } from './moves.mts';
import { type Line } from './ocr.mts';
import { findOverlay, readOverlay, type Overlay, type OverlayBox } from './overlay.mts';
import { screenIn, type Image } from './png.mts';

/** What every reader made of one screenshot, with the lines OCR handed them for anyone asking why. */
export interface Reading {
  /** The lines read off the screen, which every reader but the moves was given. */
  lines: Line[];
  /** The lines read off the whole stitch, which the moves were read off; the same array where there was no stitch. */
  whole: Line[];
  detail: Detail;
  moves: Moves;
  box: OverlayBox | null;
  overlay: Overlay | null;
  identity: Identity;
}

/**
 * The artwork a screenshot shows, for the forms whose numbers are identical. PGSharp's overlay is drawn over the
 * artwork, so where its box was found that is the floor to start below — a fraction written down instead would be one
 * phone's.
 */
export function artworkIn(image: Image, box: OverlayBox | null, icons: ReadonlyMap<Form, Signature>) {
  const signature = signatureOf(image, box ? box.y + box.height : undefined);

  return signature ? { signature, icons } : undefined;
}

/**
 * Every reader over one screenshot.
 *
 * **A stitch is read twice, because the readers do not want the same image.** Every one but `parseMoves` is anchored
 * on a fraction of the height and so needs the screen the stitch records, which `screenIn` crops to; `parseMoves`
 * anchors on `GYMS & RAIDS` and wants the whole thing. Measured on the corpus the two disagree in both directions —
 * `ho-oh.png` answers `tags: []` whole against `['Shiny', 'Lucky Me']` cropped, and two captures answer no move at all
 * cropped against the right pair whole.
 *
 * So one pass each, which costs a second Tesseract run on a stitch and nothing on a screen: `screenIn` hands back the
 * very image it was given where there is no `Viewport`, and that identity is what `===` tests here.
 *
 * `configured` is a box for the overlay taken on trust rather than found, which is what `--config` gives the CLI.
 */
export async function readScreen(
  image: Image,
  data: GameData,
  icons: ReadonlyMap<Form, Signature>,
  configured?: OverlayBox,
): Promise<Reading> {
  const screen = screenIn(image);
  const lines = await readLines(screen);
  const whole = screen === image ? lines : await readLines(image);
  const detail = await parseDetail(lines, data, screen);
  const found = configured
    ? { box: configured, overlay: await readOverlay(screen, configured) }
    : await findOverlay(screen);
  const box = found?.box ?? null;
  const overlay = found?.overlay ?? null;
  const identity = identify(data, detail, overlay, artworkIn(screen, box, icons));
  const moves = await parseMoves(whole, data, identity.form, image);

  return { lines, whole, detail, moves, box, overlay, identity };
}

/**
 * Whether a screen is a detail screen, which is its HP having read: the one field every detail screen states and the
 * map, the storage grid and a Pokédex entry all lack. Asked of a `Detail` rather than of a screen so that a caller
 * holding one already does not pay a second Tesseract run, and so that `snap` refuses on the test `toStorage` navigates
 * by rather than on a second notion of the same thing.
 */
export const isDetail = (detail: Detail) => detail.hp !== null;

/**
 * Why a scan could not have used this screen, or nothing where it could: what `snap` refuses a capture over, and what
 * the Inventory page says rather than printing a page of nulls.
 *
 * A configured `overlay` is taken on trust and so can never be missing, which would leave the check vacuous for anyone
 * who sets one — hence the third case, where the box is known and nothing read inside it.
 */
export function refusals({ detail, box, overlay }: Pick<Reading, 'detail' | 'box' | 'overlay'>): string[] {
  return [
    !isDetail(detail) && 'its HP did not read, so a scan could not have used this screen',
    box === null && "PGSharp's overlay was not found on it",
    box !== null && overlay === null && "PGSharp's overlay was found but nothing read inside it",
  ].filter((why): why is string => why !== false);
}

/** What the overlay blocks say where there is nothing to show, worded once for the CLI and the page alike. */
export const NO_BOX = 'not found; is PGSharp running, and is a Pokémon open?';
export const NO_OVERLAY = 'nothing read';

/**
 * The identity as `report` prints it. Every form carries its whole move pool, which prints as a column of `[Object]`
 * and buries everything worth reading; the names are what a person tuning this wants to see anyway. The forms in
 * `alternatives` and `unseparated` too, which the page prints to any depth where the CLI's `console.log` stops at two.
 */
export const printable = (identity: Identity) => {
  const named = (form: Form) => ({ ...form, moves: form.moves.map((m) => m.name).join(', ') });

  return {
    ...identity,
    form: identity.form && named(identity.form),
    alternatives: identity.alternatives.map(named),
    unseparated: identity.unseparated.map(named),
  };
};
