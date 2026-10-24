/**
 * Which part of a battle a frame shows, out of colour samples alone: cheap enough to ask of every frame at 30 a second,
 * which OCR is not. Every position is a fraction of a Pixel 4 XL's frame, placed on a frame of any size or shape by its
 * anchor as `layout.mts` places it, and every threshold was measured on 935 frames of Team Leader battles recorded off
 * a Pixel 4 XL — quoted beside it, so that a threshold that stops working can be checked against what it was set from.
 *
 * Screens that are not a battle — the result, the menus between battles, the fades — are all `other`, for a caller to
 * read with OCR once the screen has settled.
 */

import { chroma, luminance, rgb, type Image } from '../inventory/png.mts';
import { BOTTOM, down, TOP } from './layout.mts';

/**
 * - `battle`: the fight, with no charged move ready, or an animation within it — the charged-move minigame among them.
 * - `charged`: the fight, with a charged move ready to throw.
 * - `shield`: the prompt offering a Protect Shield against an incoming charged move.
 * - `switch`: the prompt choosing the next Pokémon after one has fainted.
 * - `other`: anything else.
 */
export type State = 'battle' | 'charged' | 'shield' | 'switch' | 'other';

type Box = readonly [left: number, top: number, right: number, bottom: number];

/** The mean colour of a box given as fractions of the frame. */
type Colour = [r: number, g: number, b: number];

/** Where a box pinned at `anchor` runs down `image`, in pixels, out of where the Pixel 4 XL drew it. */
const rows = (image: Image, top: number, bottom: number, anchor: number) =>
  [down(top, anchor, image), down(bottom, anchor, image)].map((y) => Math.round(y * image.height)) as [number, number];

function* pixels(image: Image, [left, top, right, bottom]: Box, anchor: number): Generator<Colour> {
  const [from, to] = rows(image, top, bottom, anchor);

  for (let y = from; y < to; y++) {
    for (let x = Math.round(left * image.width); x < Math.round(right * image.width); x++) {
      yield rgb(image, x, y);
    }
  }
}

function mean(image: Image, box: Box, anchor: number): Colour {
  let [r, g, b, n] = [0, 0, 0, 0];

  for (const [red, green, blue] of pixels(image, box, anchor)) {
    r += red;
    g += green;
    b += blue;
    n++;
  }

  n = Math.max(n, 1);

  return [r / n, g / n, b / n];
}

/** Each channel's median over a box: the colour of whatever covers most of it, deaf to what covers the rest. */
function median(image: Image, box: Box, anchor: number): Colour {
  const channels: [number[], number[], number[]] = [[], [], []];

  for (const colour of pixels(image, box, anchor)) {
    colour.forEach((level, i) => channels[i]?.push(level));
  }

  return channels.map((levels) => levels.sort((a, b) => a - b)[levels.length >> 1] ?? 0) as Colour;
}

const near = (colour: Colour, target: Colour, within: number) =>
  colour.every((channel, i) => Math.abs(channel - (target[i] ?? 0)) <= within);

/**
 * Strips of the two panels across the top of a battle, beside each player's CP, and the line above them that holds
 * each side's name and CP.
 *
 * The panels are white at about 80% opacity, so each takes a fifth of its colour from what is behind it: 244/251/251
 * under cloud, 229/244/252 under a deep blue sky and 207/216/230 under a night one, which a 19/59/140 gap between them
 * predicts. So no channel falls below 195 and the chroma stays under 52 — a fifth of the most anything behind could
 * have. Not always a sky: a Galarian Moltres's magenta wing behind ours drew it to 237/215/230 and 251/210/225 on a
 * Pixel 8 Pro, redder than blue. Held to blue at least as strong as red, the battle read as `other` for seconds at a
 * time while it flew.
 *
 * That is a range bare sky falls in too: the sky the shield prompt leaves where it hides them measured 210/238/250. The
 * names are what tell the two apart. Their slate-grey text, and the blur the encoder gives it, is 13–18% of their line
 * wherever the panels are drawn across 27,000 recorded frames, counting anything darker than the panel can be; a day
 * sky's prompt has none, and a night sky's no more than 7% where its strips fail anyway. A dark screen is dark all
 * over, hence the ceiling.
 *
 * The sky between the panels is the rest of the test, and is what two near misses fail. The map's notifications are a
 * bar straight across the top, and `96% found a Candy!` measured 249/253/243 in the right strip and 204/214/209 in the
 * gap — no sky there, its blue under its green. The fade into a battle failed the same way, 211/231/227 in the gap.
 * Sky, and the grey countdown that sits on it during a prompt, never has less blue than green.
 *
 * The panels' colours are each channel's median along a strip rather than its mean, because the strips clip the tops of
 * each side's Poké Balls, and the right one the opponent's shields. A mean takes their colour in — three red balls drew
 * the left strip to 249/245/243 over bright white cloud, where its median is the panel's own 251/254/252 — and the
 * limits above are of a panel, not of a panel and whatever is drawn on it. What is saturated or darker than a panel can
 * be is no more than 8% of a strip on any committed frame, so the median never sees it, however many balls are left.
 */
const HUD: readonly Box[] = [
  [0.03, 0.085, 0.2, 0.095],
  [0.62, 0.085, 0.8, 0.095],
];
const HUD_NAMES: readonly Box[] = [
  [0.03, 0.07, 0.4, 0.086],
  [0.6, 0.07, 0.97, 0.086],
];
const HUD_GAP: Box = [0.44, 0.085, 0.56, 0.095];
const TEXT = { dark: 180, least: 0.08, most: 0.3 } as const;

const panel = (colour: Colour) => Math.min(...colour) >= 195 && chroma(...colour) <= 52;

/** The share of a box darker than `TEXT.dark`. */
function darkIn(image: Image, box: Box): number {
  let [dark, n] = [0, 0];

  for (const colour of pixels(image, box, TOP)) {
    dark += luminance(...colour) < TEXT.dark ? 1 : 0;
    n++;
  }

  return dark / Math.max(n, 1);
}

function showsHud(image: Image): boolean {
  const [, green, blue] = mean(image, HUD_GAP, TOP);

  return (
    blue >= green &&
    HUD.every((box) => panel(median(image, box, TOP))) &&
    HUD_NAMES.every((box) => {
      const text = darkIn(image, box);
      return text >= TEXT.least && text <= TEXT.most;
    })
  );
}

/**
 * The Protect Shield itself, centred under the prompt: 226/159/240 in every frame of it. The shield going up once it
 * is taken is the same pink, and what tells the two apart is the HUD, which the prompt hides and the shield does not.
 * The prompt's own panel would not do: it is translucent, and measured 77 by luminance over a bright field against 95
 * for the shield going up.
 */
const SHIELD: Box = [0.46, 0.8, 0.54, 0.84];
const SHIELD_PINK: Colour = [226, 159, 240];

/**
 * Three places on the switch prompt's panel, which is one flat slate — 35/44/58 at each, to within a level — where
 * a fight shows the field and the shield prompt shows the shield.
 */
const SWITCH_PANEL: readonly Box[] = [
  [0.45, 0.72, 0.55, 0.74],
  [0.46, 0.8, 0.54, 0.84],
  [0.08, 0.92, 0.14, 0.95],
];
const SLATE: Colour = [35, 44, 58];

/**
 * The charged-move buttons, as the circles their rims trace: one move's centred at 179.5,676 of 360×760, and two moves'
 * either side of it at the same height, all with a radius of 34. A button with a move ready wears a white rim, and one
 * without wears none: 32 points around the circle were white at 88–100% of them for a ready button, at none for an
 * unready one, and at no more than 44% through the minigame's bubbles.
 *
 * A ring is the rest of the test, white inside and outside it being what a ready button is not. Kyogre's belly is a
 * white patch across the centred button's place, and read as a ready button through its whole minigame on the rim alone
 * — white at every point, but white too at every point inside it and outside it, where a ready button measured no more
 * than 16% within and 13% beyond.
 */
export const BUTTON_XS = [0.31, 0.499, 0.69] as const;
const BUTTON = { y: 0.889, radius: 0.094 } as const;
const RIM_POINTS = 32;
const RIM_READY = 0.6;
const AROUND_RIM = 0.3;

/** The fraction of a circle that is white, each point looked for a pixel or two inside the radius, the rim's width. */
function white(image: Image, cx: number, cy: number, radius: number): number {
  let hits = 0;

  for (let k = 0; k < RIM_POINTS; k++) {
    const angle = (2 * Math.PI * k) / RIM_POINTS;

    const hit = [0, 1, 2].some((inset) => {
      const r = radius - inset * (image.width / 360);
      const colour = rgb(image, cx + r * Math.cos(angle), cy + r * Math.sin(angle));

      return luminance(...colour) > 215 && chroma(...colour) < 40;
    });

    if (hit) {
      hits++;
    }
  }

  return hits / RIM_POINTS;
}

/**
 * Where a charged move is ready to throw, as the centre of each lit button, left to right: none, one, or both of two.
 * Only meaningful on a frame `recognise` reads as a battle.
 */
export function readyButtons(image: Image): [x: number, y: number][] {
  const y = down(BUTTON.y, BOTTOM, image);
  const cy = y * image.height;
  const radius = BUTTON.radius * image.width;

  return BUTTON_XS.filter((x) => {
    const cx = x * image.width;

    return (
      white(image, cx, cy, radius) >= RIM_READY &&
      white(image, cx, cy, radius * 0.6) <= AROUND_RIM &&
      white(image, cx, cy, radius * 1.35) <= AROUND_RIM
    );
  }).map((x) => [x, y]);
}

/**
 * The opponent's two shields along the top, as small boxes at the centre of each hexagon. One still held is pink,
 * measured 223–233/159–167/235–248 on the committed frames, under day and night skies alike; one spent is a dark
 * purple, 108–116/79–82/113–123, and the left goes first.
 */
const OPPONENT_SHIELDS: readonly Box[] = [0.718, 0.764].map((x) => [x - 0.006, 0.096, x + 0.006, 0.102] as const);
const SPENT: Colour = [111, 81, 118];

/**
 * How many shields the opponent has left, out of the two each side starts with. A hexagon that reads as neither colour
 * — under a banner, say — counts as one still held, as costing a bait at worst where the other way round would throw
 * the strongest move into a shield.
 */
export function opponentShields(image: Image): number {
  return OPPONENT_SHIELDS.filter((box) => !near(mean(image, box, TOP), SPENT, 25)).length;
}

/**
 * Our two shields, at the left of the HUD where the opponent's are at its right, and the right of them going first.
 * The same two colours, measured on the committed frames and on 92 frames of two GO Battle League runs that read as a
 * battle: 214–234/156–165/230–245 held and 107–112/78–83/112–121 spent.
 */
const OWN_SHIELDS: readonly Box[] = [0.236, 0.281].map((x) => [x - 0.006, 0.096, x + 0.006, 0.102] as const);
const HELD: Colour = [224, 161, 238];

/**
 * How many shields we have left, or null where a hexagon reads as neither colour rather than a guess either way, unlike
 * the opponent's: what this answers is whether a shield prompt can be taken at all.
 */
export function ownShields(image: Image): number | null {
  const colours = OWN_SHIELDS.map((box) => mean(image, box, TOP));

  if (!colours.every((colour) => near(colour, HELD, 20) || near(colour, SPENT, 25))) {
    return null;
  }

  return colours.filter((colour) => near(colour, HELD, 20)).length;
}

export function recognise(image: Image): State {
  if (SWITCH_PANEL.every((box) => near(mean(image, box, BOTTOM), SLATE, 12))) {
    return 'switch';
  }

  const hud = showsHud(image);

  if (!hud && near(mean(image, SHIELD, BOTTOM), SHIELD_PINK, 25)) {
    return 'shield';
  }

  if (!hud) {
    return 'other';
  }

  return readyButtons(image).length > 0 ? 'charged' : 'battle';
}
