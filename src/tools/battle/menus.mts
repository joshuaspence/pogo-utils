/**
 * The screens between one Team Leader battle and the next, and where to tap on each to get from the result of one to
 * the start of the next: the result's ✓, the leader on the Battle tab, BATTLE under the leader's speech, the league,
 * then USE THIS PARTY on the game's recommended party. Training has no rematch, so this is the way round every time.
 * And the way in from the map: the Poké Ball, BATTLE on the main menu, and the Battle tab scrolled down from GO Battle
 * League, where it opens, to the Training card.
 *
 * Colour wherever it settles the question, being far cheaper than OCR and, on the game's own lettering, far surer: the
 * leaders' portraits, the two green buttons, the teal one at the foot of the screen and the map's Poké Ball. OCR for
 * the rest, which are told by words in plain capitals: the league's three lines, the main menu's labels and the Battle
 * tab's header. Positions are fractions of a Pixel 4 XL's screen, placed on another shape by their anchors as
 * `layout.mts` places them, and colours were measured on recorded frames of each screen and on full-size screenshots.
 */

import { fold, ocr, type Line } from '../inventory/ocr.mts';
import { rgb, type Image } from '../inventory/png.mts';
import { BOTTOM, down, place, tall, TOP } from './layout.mts';
import { type Point } from './play.mts';

export const LEADERS = ['blanche', 'candela', 'spark'] as const;
export type Leader = (typeof LEADERS)[number];

export const LEAGUES = ['great', 'ultra', 'master'] as const;
export type League = (typeof LEAGUES)[number];

export type Menu =
  | { screen: 'map' | 'main' | 'training' | 'intro' | 'league' | 'party' | 'result'; tap: Point }
  | { screen: 'battle-tab'; swipe: readonly [Point, Point] }
  | { screen: 'unknown' };

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

/**
 * Where the two buttons are pinned. BATTLE was measured at 0.507 of the height, which is the middle to well within a
 * pixel. USE THIS PARTY was measured at 0.90: it sits on the party's panel, which stretches with the screen from where
 * its top is pinned, 0.565 down, to its foot.
 */
const BATTLE_ANCHOR = 0.5;
const USE_PARTY_ANCHOR = 0.9;

/** Whether the button is under `[x, y]`, sampled there and a little left of it, clear of the label. */
function green(image: Image, [x, y]: Point): boolean {
  return [x - 0.08, x].some((sx) => {
    const [r, g, b] = rgb(image, sx * image.width, y * image.height);

    return g >= 195 && g - r >= 25 && g - b >= 35 && r >= 90 && b >= 130 && b <= 175;
  });
}

/**
 * Whether the row a button is on runs across a white card either side of it, at x 0.1 and 0.9. The colour alone does
 * not tell the two screens' buttons from others of the same green: the Battle tab draws GO Battle League's BATTLE in
 * it, inside a white card, and the map's grass passes it. So USE THIS PARTY is the one on a white panel, and BATTLE
 * under the leader's speech the one over the artwork — where GO Battle League's, at whatever height the tab is scrolled
 * to, is neither: on a card, above the ✗.
 *
 * Measured either side, on each fixture's button row: 248–249/252–254/237–240 on `menu-party` and `menu-party-full`,
 * from 4/6/6 to 92/73/57 on `menu-intro` and `menu-intro-spark`, 255/255/255 on `menu-unknown-battle-league`, and
 * 142/199/173 and 228/238/234 on `menu-unknown-map`.
 */
function panel(image: Image, y: number): boolean {
  return [0.1, 0.9].every((x) => {
    const [r, g, b] = rgb(image, x * image.width, y * image.height);

    return Math.min(r, g, b) >= 230 && Math.max(r, g, b) - Math.min(r, g, b) <= 16;
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

/**
 * How far above `FOOT` a tap is clear of the ✗, which floats over whatever the Battle tab has scrolled beneath it: a
 * Training card one scroll from its foot on a taller screen than the Pixel 4 XL's put Candela's portrait under it.
 */
const CLEAR_OF_FOOT = 0.04;

function teal(image: Image): boolean {
  const [r, g, b] = rgb(image, FOOT[0] * image.width, down(FOOT[1], BOTTOM, image) * image.height);

  return r < 100 && Math.abs(g - 132) <= 15 && Math.abs(b - 146) <= 15;
}

/**
 * The map's Poké Ball, which opens the main menu: its red top and white bottom either side of the grey centre, measured
 * at 235/76/78 and 255/56/69 above and 253–255 all three below on two maps. Nothing else is drawn red there.
 */
const BALL: Point = [0.5, 0.932];

function pokeBall(image: Image): boolean {
  const [x, y] = place(BALL, BOTTOM, image);
  const [r, g, b] = rgb(image, x * image.width, (y - tall(0.02, image)) * image.height);
  const below = rgb(image, x * image.width, (y + tall(0.023, image)) * image.height);

  return r >= 200 && g <= 110 && b <= 110 && below.every((c) => c >= 240);
}

/** How far below its label the main menu's BATTLE is tapped, at the centre of its circle. */
const LABEL_ABOVE = 0.06;

/**
 * The Battle tab's scroll, up its middle: from GO Battle League, where it opens, towards the Training card at its foot.
 * Slow enough to be a drag rather than a tap on whatever it starts over, and short of the ✗.
 */
const SCROLL: readonly [Point, Point] = [
  [0.5, 0.75],
  [0.5, 0.35],
];

/**
 * The Battle tab's header, BATTLE and PARTY, in the band at the top of the screen. Either word will do, OCR having read
 * only BATTLE off a Pixel 8 Pro's, the unselected PARTY being grey on the teal; nothing else draws BATTLE that high, the
 * main menu's being halfway down and the leader's BATTLE three quarters.
 */
const HEADER = 0.1;

/**
 * The main menu's other labels, any two of which beside BATTLE make it the main menu: OCR has missed ITEMS where
 * PGSharp's toolbar was open down the screen's left edge, and the Battle tab draws none of them.
 */
const MAIN_LABELS = ['pokedex', 'pokemon', 'shop', 'items'];

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
  const fight = place(BATTLE, BATTLE_ANCHOR, image);
  const party = place(USE_PARTY, USE_PARTY_ANCHOR, image);
  const foot = place(FOOT, BOTTOM, image);

  if (green(image, fight) && teal(image) && !panel(image, fight[1])) {
    return { screen: 'intro', tap: fight };
  }

  if (green(image, party) && panel(image, party[1]) && !teal(image)) {
    return { screen: 'party', tap: party };
  }

  if (pokeBall(image)) {
    return { screen: 'map', tap: place(BALL, BOTTOM, image) };
  }

  const row = portraits(image);
  const portrait = row === undefined ? undefined : row + tall(PORTRAIT_BELOW, image);

  // A card found under the ✗ is scrolled up clear of it rather than tapped, which would close the menu.
  if (portrait !== undefined && portrait > foot[1] - tall(CLEAR_OF_FOOT, image)) {
    return { screen: 'battle-tab', swipe: SCROLL };
  }

  if (portrait !== undefined) {
    return { screen: 'training', tap: [LEADER_X[leader], portrait] };
  }

  const lines = await read(image);
  const leagues = lines.filter((line) => /^(great|ultra|master) league$/.test(fold(line.text)));
  const chosen = leagues.find((line) => fold(line.text) === `${league} league`);

  if (leagues.length >= 2 && chosen) {
    return { screen: 'league', tap: centre(chosen, image) };
  }

  const words = (word: string) => lines.filter((line) => fold(line.text) === word);
  const [battle] = words('battle');

  if (battle && MAIN_LABELS.filter((label) => words(label).length > 0).length >= 2) {
    const [x, y] = centre(battle, image);

    return { screen: 'main', tap: [x, y + tall(LABEL_ABOVE, image)] };
  }

  if ([...words('battle'), ...words('party')].some((line) => centre(line, image)[1] < down(HEADER, TOP, image))) {
    return { screen: 'battle-tab', swipe: SCROLL };
  }

  if (result && teal(image)) {
    return { screen: 'result', tap: foot };
  }

  return { screen: 'unknown' };
}
