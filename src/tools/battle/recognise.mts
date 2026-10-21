/**
 * Which part of a battle a frame shows, out of colour samples alone: cheap enough to ask of every frame at 30 a second,
 * which OCR is not. Every position is a fraction of the frame, so a frame at any size of the phone's shape answers the
 * same, and every threshold was measured on 935 frames of Team Leader battles recorded off a Pixel 4 XL — quoted beside
 * it, so that a threshold that stops working can be checked against what it was set from.
 *
 * Screens that are not a battle — the result, the menus between battles, the fades — are all `other`, for a caller to
 * read with OCR once the screen has settled.
 */

import { chroma, luminance, rgb, type Image } from '../inventory/png.mts';

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

function mean(image: Image, [left, top, right, bottom]: Box): Colour {
  let [r, g, b, n] = [0, 0, 0, 0];

  for (let y = Math.round(top * image.height); y < Math.round(bottom * image.height); y++) {
    for (let x = Math.round(left * image.width); x < Math.round(right * image.width); x++) {
      const [red, green, blue] = rgb(image, x, y);
      r += red;
      g += green;
      b += blue;
      n++;
    }
  }

  n = Math.max(n, 1);

  return [r / n, g / n, b / n];
}

const near = (colour: Colour, target: Colour, within: number) =>
  colour.every((channel, i) => Math.abs(channel - (target[i] ?? 0)) <= within);

/**
 * Strips of the two panels across the top of a battle, beside each player's CP. They are white but not opaque, so
 * over sky they read blue-white — 237/246/251 at the bluest — and across every battle frame recorded they measured
 * 236–251 by luminance for all but a few, with a chroma of 16 at most, and never more than a rounding error redder than
 * blue: a neutral strip reads 244/243/243 or 246/244/244. Where they
 * are hidden — the shield prompt, some banners — the same strips show the sky itself, bluer than that (210/239/250).
 *
 * The sky between them is the rest of the test, and is what the two near misses fail. The map's notifications are a
 * bar straight across the top, and `96% found a Candy!` measured 225/233/224 in the right strip and 204/214/209 in the
 * gap — no sky there, its blue under its green — after a battle a looser test had passed, which would have had the map
 * swiped at. The fade into a battle failed the same way, 211/231/227 in the gap. Sky, and the grey countdown that sits
 * on it during a prompt, never has less blue than green.
 */
const HUD: readonly Box[] = [
  [0.03, 0.085, 0.2, 0.095],
  [0.62, 0.085, 0.8, 0.095],
];
const HUD_GAP: Box = [0.44, 0.085, 0.56, 0.095];

const panel = (colour: Colour) => {
  const light = luminance(...colour);

  return light >= 236 && light <= 251 && colour[2] >= colour[0] - 4 && chroma(...colour) <= 16;
};

function showsHud(image: Image): boolean {
  const [, green, blue] = mean(image, HUD_GAP);

  return HUD.every((box) => panel(mean(image, box))) && blue >= green;
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
const BUTTON_XS = [0.31, 0.499, 0.69] as const;
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
  const cy = BUTTON.y * image.height;
  const radius = BUTTON.radius * image.width;

  return BUTTON_XS.filter((x) => {
    const cx = x * image.width;

    return (
      white(image, cx, cy, radius) >= RIM_READY &&
      white(image, cx, cy, radius * 0.6) <= AROUND_RIM &&
      white(image, cx, cy, radius * 1.35) <= AROUND_RIM
    );
  }).map((x) => [x, BUTTON.y]);
}

export function recognise(image: Image): State {
  if (SWITCH_PANEL.every((box) => near(mean(image, box), SLATE, 12))) {
    return 'switch';
  }

  const hud = showsHud(image);

  if (!hud && near(mean(image, SHIELD), SHIELD_PINK, 25)) {
    return 'shield';
  }

  if (!hud) {
    return 'other';
  }

  return readyButtons(image).length > 0 ? 'charged' : 'battle';
}
