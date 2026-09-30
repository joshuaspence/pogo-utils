/**
 * On-screen controls, taken verbatim from a known-good backup. Each checkbox includes one entry's keys in the
 * synthesized backup: a control's x/y are fixed Java Floats, and a filter from filters.js is the JSON string
 * PGSharp stores. The values are not user-editable. The floating control and both fast-snipe buttons sit in one row
 * along the bottom of the screen, so they share a Y. Dragging each into place by hand left them a pixel or so apart
 * (the floating control was higher still, at 535.75); naming the row's Y once keeps them level.
 */
import FEED_FILTERS from './filters.js';
import SCAN_CONFIG from './scan-config.js';

const CONTROL_ROW_Y = 785.09375;
const SNIPE2 = {
  x: 916.2529296875,
  y: CONTROL_ROW_Y,
};

/**
 * Keyed by the checkbox's DOM id, so each control appears once and its ticked state is a direct lookup. Iteration order
 * is preserved (these ids are non-integer string keys), and it decides the order the keys land in the backup, so the
 * entries stay in the order PGSharp wrote them.
 *
 * `satisfies` rather than an annotation, because this table is read both ways: `backup.ts` iterates it with
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
