/**
 * The screens between one Team Leader battle and the next, and where to tap on each to get from the result of one to
 * the start of the next: the result's ✓, the leader on the Battle tab, BATTLE under the leader's speech, the league,
 * then USE THIS PARTY on the game's recommended party. Training has no rematch, so this is the way round every time.
 *
 * Colour wherever it settles the question, being far cheaper than OCR and, on the game's own lettering, far surer: the
 * leaders' portraits, the two green buttons and the teal one at the foot of the screen. OCR for the league alone, whose
 * three lines are the one place the screen is plain text. Positions are fractions of the screen, and colours were
 * measured on recorded frames of each screen and on a full-size screenshot.
 */

import { fold, ocr, type Line } from '../inventory/ocr.mts';
import { rgb, type Image } from '../inventory/png.mts';
import { type Point } from './play.mts';

export const LEADERS = ['blanche', 'candela', 'spark'] as const;
export type Leader = (typeof LEADERS)[number];

export const LEAGUES = ['great', 'ultra', 'master'] as const;
export type League = (typeof LEAGUES)[number];

export type Menu = { screen: 'training' | 'intro' | 'league' | 'party' | 'result'; tap: Point } | { screen: 'unknown' };

/**
 * The leaders' portraits on the Battle tab, found by colour rather than by name: OCR read the names under them as
 * `Blar I`, `indela` and `par!` off a full-size screenshot, and the `TRAINING` heading over them as `RAINI`. The card
 * moves with however the tab is scrolled, so it is looked for down the screen, as the row where Blanche's pale blue
 * backdrop — 184–196/235/246–249 — sits beside Candela's pink one — 224–237/156–165/163–169 — each sampled a little
 * left of the portrait's centre. Spark's is no help, the sample landing on her face or hair as often as her backdrop.
 */
const LEADER_X: Record<Leader, number> = { blanche: 0.26, candela: 0.5, spark: 0.74 };
const BLANCHE_BLUE = [190, 235, 247];
const CANDELA_PINK = [230, 160, 166];

/** How far below the backdrop's first row the portraits are tapped, near their centres. */
const PORTRAIT_BELOW = 0.02;

/** Where on the screen the training card is looked for, as fractions of its height. */
const PORTRAIT_SEARCH = { from: 0.15, to: 0.95, step: 0.004 };

/**
 * BATTLE under the leader's speech, and USE THIS PARTY under the recommended party: the same green button, shaded from
 * yellowish on the left to teal on the right and lighter or darker with the capture. Measured from 103/207/144 to
 * 172/216/155 across recorded frames and full-size screenshots, so it is told by its shape — green well above red and
 * blue, blue in a narrow band — rather than held to one colour, which a screenshot of the party button missed by 28.
 */
const BATTLE: Point = [0.5, 0.733];
const USE_PARTY: Point = [0.5, 0.87];

/** Whether the button is under `[x, y]`, sampled there and a little left of it, clear of the label. */
function green(image: Image, [x, y]: Point): boolean {
  return [x - 0.08, x].some((sx) => {
    const [r, g, b] = rgb(image, sx * image.width, y * image.height);

    return g >= 195 && g - r >= 25 && g - b >= 35 && r >= 90 && b >= 130 && b <= 175;
  });
}

/**
 * The round button at the foot of the screen: ✓ on the result, ✗ on the Battle tab and under the leader's speech. The ✗
 * closes the menu, so this is only ever tapped where nothing else has claimed the screen.
 *
 * Its teal is translucent, and only its red follows what is behind it: 27/132/146 over the result's forest and Blanche's
 * mountains, 64/131/146 over Spark's lit city. So green and blue are held to the teal, and red only kept low.
 */
const FOOT: Point = [0.5, 0.935];

function teal(image: Image): boolean {
  const [r, g, b] = rgb(image, FOOT[0] * image.width, FOOT[1] * image.height);

  return r < 100 && Math.abs(g - 132) <= 15 && Math.abs(b - 146) <= 15;
}

const centre = (line: Line, image: Image): Point => [
  (line.left + line.width / 2) / image.width,
  (line.top + line.height / 2) / image.height,
];

const matches = (image: Image, x: number, y: number, colour: readonly number[]) =>
  rgb(image, x * image.width, y * image.height).every((c, i) => Math.abs(c - (colour[i] ?? 0)) <= 20);

/** The first row, down the screen, where Blanche's backdrop sits beside Candela's; `undefined` off the Battle tab. */
function portraits(image: Image): number | undefined {
  for (let y = PORTRAIT_SEARCH.from; y < PORTRAIT_SEARCH.to; y += PORTRAIT_SEARCH.step) {
    if (
      matches(image, LEADER_X.blanche - 0.025, y, BLANCHE_BLUE) &&
      matches(image, LEADER_X.candela - 0.025, y, CANDELA_PINK)
    ) {
      return y;
    }
  }

  return undefined;
}

/**
 * Which screen `image` is, and where to tap on it for `leader` in the `league`. `read` is the OCR, which is only asked
 * for where colour cannot answer.
 *
 * `result` says whether a battle has ended with its ✓ not yet tapped, which is the only time the teal button at the foot
 * is read as the result's. Anywhere else it is the ✗ that closes the menu, and a Battle tab whose portraits were not
 * found would otherwise have been taken for the result and closed.
 */
export async function readMenu(
  image: Image,
  { leader, league, result }: { leader: Leader; league: League; result: boolean },
  read: (image: Image) => Promise<Line[]> = ocr,
): Promise<Menu> {
  if (green(image, BATTLE) && teal(image)) {
    return { screen: 'intro', tap: BATTLE };
  }

  if (green(image, USE_PARTY)) {
    return { screen: 'party', tap: USE_PARTY };
  }

  const row = portraits(image);

  if (row !== undefined) {
    return { screen: 'training', tap: [LEADER_X[leader], row + PORTRAIT_BELOW] };
  }

  const lines = await read(image);
  const leagues = lines.filter((line) => /^(great|ultra|master) league$/.test(fold(line.text)));
  const chosen = leagues.find((line) => fold(line.text) === `${league} league`);

  if (leagues.length >= 2 && chosen) {
    return { screen: 'league', tap: centre(chosen, image) };
  }

  if (result && teal(image)) {
    return { screen: 'result', tap: FOOT };
  }

  return { screen: 'unknown' };
}
