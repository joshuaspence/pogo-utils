/**
 * On-screen controls, taken verbatim from a known-good backup. Each checkbox includes one entry's keys in the
 * synthesized backup, and the values are not user-editable. The floating control and both fast-snipe buttons sit in
 * one row along the bottom of the screen, so naming the row's Y once keeps them level — dragging each into place by
 * hand left them a pixel or so apart.
 */
import FEED_FILTERS from './filters.js';
import SCAN_CONFIG from './scan-config.js';

const CONTROL_ROW_Y = 785.09375;
const SNIPE2 = {
  x: 916.2529296875,
  y: CONTROL_ROW_Y,
};

/**
 * Keyed by the control, so each appears once and its ticked state is a direct lookup. Iteration order is preserved
 * (these keys are non-integer strings), and it decides the order the keys land in the backup, so the entries stay in the
 * order PGSharp wrote them.
 *
 * `satisfies` rather than an annotation, because this table is read both ways: `pgsdata.ts` iterates it with
 * `Object.entries` and also names `CONTROL_RESETS.resetFeeds.hlfeeds` in source. An index signature serves the first
 * and throws the second away, measured at two errors on that line for nothing the shape check does not already catch,
 * where `satisfies` checks the shape and hands back the inferred keys. What it rejects is a value that is neither a
 * Java Float nor a filter string, which the codec's writer otherwise catches no earlier than run time.
 */
export const CONTROL_RESETS = {
  resetIcon: {
    iconX: 0.0,
    iconY: CONTROL_ROW_Y,
  },

  resetSnipe1: {
    hlfastsnipex: 816.33203125,
    hlfastsnipey: CONTROL_ROW_Y,
  },

  resetSnipe2: {
    hlfastsnipe2x: SNIPE2.x,
    hlfastsnipe2y: SNIPE2.y,
  },

  resetCdpos: {
    hlcdposx: 0.0,
    hlcdposy: 306.25,
  },

  // The radar button shares fast-snipe button 2's position; hlscan is its filter, serialized to the string PGSharp stores.
  resetScan: {
    hlscanx: SNIPE2.x,
    hlscany: SNIPE2.y,
    hlscan: JSON.stringify(SCAN_CONFIG),
  },

  /**
   * The feed's filter list has no on-screen position of its own, so it ticks separately from the radar button above —
   * including it replaces whatever filters the profile already has.
   */
  resetFeeds: {
    hlfeeds: JSON.stringify(FEED_FILTERS),
  },
} satisfies Record<string, Record<string, number | string>>;

export type Control = keyof typeof CONTROL_RESETS;

/**
 * What the page calls each control. Beside the table rather than in the markup that renders it, which is where these
 * lived while the page was hand-written HTML: a `Record` over the table's own keys makes a control added without a label
 * a type error, where a second list in a second file goes out of step in silence — a new checkbox rendering blank, or a
 * label left behind pointing at a control that no longer exists.
 */
export const CONTROL_LABELS: Record<Control, string> = {
  resetIcon: 'Floating control',
  resetSnipe1: 'Fast-snipe button',
  resetSnipe2: 'Second fast-snipe button',
  resetCdpos: 'Cooldown indicator',
  resetScan: 'Nearby radar',
  resetFeeds: 'Nearby feed filters',
};

/** The controls in the order the table lists them, which is the order the page draws them in. */
export const CONTROLS = Object.keys(CONTROL_RESETS) as Control[];
