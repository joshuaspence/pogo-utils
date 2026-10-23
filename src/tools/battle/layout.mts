/**
 * Where the game draws something on a phone of any shape, out of where it drew it on the Pixel 4 XL every position here
 * was measured on. The game sizes what it draws by the screen's width and pins each piece at a fraction of the height,
 * its anchor: 0 for the top edge, 1 for the foot, 0.5 for the middle, and anywhere between for a piece inside a panel
 * that stretches with the screen. So a piece is `anchor` of the height plus a fixed number of widths from it, and a
 * position measured on one shape answers for every other once its anchor is known.
 *
 * An anchor is measured, not guessed: from where one piece sits on two shapes, `(f₂ - f₁ k) / (1 - k)`, with `k` as
 * `down` takes it. Measured that way on a Pixel 8 Pro at 1008×2244 against the Pixel 4 XL: the HUD and its names at 0,
 * the charged-move buttons, their labels, the shield prompt, the map's Poké Ball and the round button at the foot at 1,
 * the leader's BATTLE at 0.507, USE THIS PARTY at 0.90, and the party's cards at 0.69. Measured means by the reader
 * that uses it, at the pixel: the cards' anchor judged by eye, as their own height, was 5 px out, which took a card's
 * outline from leading the next species by 0.10 or more to under the margin it is held to.
 *
 * Across needs nothing of this: a fraction of the width is the same fraction on every shape.
 */

/** The anchors most pieces have, the top edge and the foot. */
export const TOP = 0;
export const BOTTOM = 1;

/** The Pixel 4 XL's height over its width: 3040 / 1440. */
const MEASURED = 3040 / 1440;

export interface Size {
  width: number;
  height: number;
}

/**
 * How many of `screen`'s heights one of the Pixel 4 XL's spans, the width being the same: 1 on one, under 1 on a taller
 * screen such as the Pixel 8 Pro's, and over 1 on a squatter one.
 */
const spans = ({ width, height }: Size) => (MEASURED * width) / height;

/** The fraction of `screen`'s height a piece pinned at `anchor` sits at, where the Pixel 4 XL drew it at `y`. */
export function down(y: number, anchor: number, screen: Size): number {
  return anchor + (y - anchor) * spans(screen);
}

/** Where on `screen` a point the Pixel 4 XL drew at `[x, y]` is, pinned at `anchor`, as fractions of it. */
export function place([x, y]: readonly [number, number], anchor: number, screen: Size): [number, number] {
  return [x, down(y, anchor, screen)];
}

/** A distance down the Pixel 4 XL's screen, as a fraction of its height, as one of `screen`'s. */
export function tall(dy: number, screen: Size): number {
  return dy * spans(screen);
}
