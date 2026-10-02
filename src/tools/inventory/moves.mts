/**
 * The detail screen scrolled down: the fast move and one or two charged moves. Each row is matched against the pool its
 * form can actually learn, which is a median of seven moves rather than all 328 — the single largest thing that can be
 * done for the reading, since a small pool affords slack a large one cannot.
 *
 * The region is bounded above by the `GYMS & RAIDS` tab and below by the catch details. `measurement` comes from
 * `detail.mts` because the weight-and-height row is the floor, and that row is the detail screen's to recognise.
 */

import { closest, type Form, type GameData, type Move } from './game-master.mts';
import { fold, ocrLine, type Line } from './ocr.mts';
import { crop, scale, type Image } from './png.mts';
import { measurement } from './detail.mts';
export interface Moves {
  fast: string | null;
  charged: string[];
}

/**
 * The moves, read out of the rows beneath the `GYMS & RAIDS` tabs. That tab row is the anchor because it is the one
 * thing that sits immediately above the moves and nothing else does — found on all fifty screens of a corpus — where
 * the weight and height it used to be measured from are most of a screen away and leave everything between them in
 * play. Bounding the region below matters as much: `CAUGHT IN THE WILD` and the rest are ordinary prose that a fuzzy
 * match will happily take for a short move, and reading down into them produced a `Rest` and a `Fly` that neither
 * Pokémon could learn.
 *
 * Each row is matched against the moves that form can actually hold before the whole list is considered, which is a
 * choice among a median of seven rather than among 328 and so affords far more slack: `oO Tackle`, where the type
 * icon has come through as two letters, is two edits from `Tackle` and was rejected outright against the full list.
 * A row that still does not match is cropped and read again on its own, and that rescue answers only to the pool,
 * since it is the reading least worth trusting against everything.
 *
 * Measured over fifty screens from two phones: 45 of 50 fast moves and 45 charged before, 50 and 50 after, with
 * nothing read that its Pokémon could not learn, for half a rescue read per screen.
 */
export async function parseMoves(
  lines: readonly Line[],
  data: GameData,
  form: Form | null,
  image: Image,
): Promise<Moves> {
  const pool = form?.moves ?? [];
  const found: Move[] = [];

  for (const row of moveRows(lines)) {
    const move = moveIn(row.text, pool, data.moves) ?? (await moveUnder(image, row, pool));

    if (move) {
      found.push(move);
    }
  }

  return {
    fast: found.find((m) => m.fast)?.name ?? null,
    charged: found
      .filter((m) => !m.fast)
      .slice(0, 2)
      .map((m) => m.name),
  };
}

/** The lines that can be a move: under the tabs, above the catch details, and carrying letters rather than a power. */
function moveRows(lines: readonly Line[]): Line[] {
  const tab = lines.find((l) => MOVE_TAB.test(fold(l.text)));
  // Without the tabs, fall back on the weight and height, which are at least above the moves. The HP has to be named
  // rather than matched as a pair of numbers around a slash, since `30/09/2026` in the catch details is one too, and
  // sits *below* the moves — measured, that alone lost every move of a live scan.
  const above = lines.filter((l) => measurement(l.text) || (/\d\s*\/\s*\d/.test(l.text) && /hp/i.test(l.text)));
  const floor = tab ? tab.top + tab.height : Math.max(-Infinity, ...above.map((l) => l.top + l.height));
  const rows: Line[] = [];

  for (const line of [...lines].filter((l) => l.top > floor).sort((a, b) => a.top - b.top)) {
    if (BELOW_MOVES.test(fold(line.text))) {
      break;
    }

    if (line.text.replace(/[^A-Za-z]/g, '').length >= 3) {
      rows.push(line);
    }
  }

  return rows.slice(0, MOVE_ROWS);
}

/**
 * The move a row names. A charged move is followed by its energy bar, which comes through as a couple of short
 * nonsense tokens — `© Energy Ball ay Ay` — and four characters of them is enough to put the row past the slack. So
 * the whole row is tried first and short trailing tokens dropped one at a time only while nothing has matched:
 * longest-first is what stops `Aqua Jet` being shortened to `Aqua`, which matches nothing at all.
 */
function moveIn(text: string, pool: readonly Move[], all: readonly Move[]): Move | null {
  let words = text.replace(/\d+/g, '').split(/\s+/).filter(Boolean);

  for (;;) {
    const joined = words.join(' ');
    const move =
      (pool.length > 0 ? closest(joined, pool, (m) => m.name, POOL_SLACK) : null) ??
      (all.length > 0 ? closest(joined, all, (m) => m.name, MOVE_SLACK) : null);
    const last = words.at(-1);

    if (move !== null || last === undefined || last.length > MOVE_NOISE) {
      return move;
    }

    words = words.slice(0, -1);
  }
}

/** A row read again on its own, doubled, for the rows the whole-screen pass only half caught — `t Breath` for `Frost
 * Breath`, where the icon and the first letters were lost. Only the pool is offered, since a rescue read is the least
 * trustworthy text on the screen and the whole list would take almost anything. */
async function moveUnder(image: Image, row: Line, pool: readonly Move[]): Promise<Move | null> {
  if (pool.length === 0) {
    return null;
  }

  const band = crop(image, 0, row.top - row.height * 0.3, image.width * MOVE_WIDTH, row.height * 1.6);

  return moveIn((await ocrLine(scale(band, 2), MOVE_ALPHABET))?.text ?? '', pool, []);
}

/** How far a row may be from a move's name, and how short a trailing token has to be to be an energy bar. */
const MOVE_SLACK = 0.2;
const MOVE_NOISE = 3;

/** A form's own pool is a median of seven moves against 328, so a row may be much further from one of those. */
const POOL_SLACK = 0.45;

/** The tabs directly above the moves, and the first of whatever follows them. */
const MOVE_TAB = /\b(gyms|raids|trainer battles)\b/;
const BELOW_MOVES = /\b(new attack|caught|hatched|traded|swap buddies|transfer|appraise)\b/;

/** Three rows of moves and a little slack; and how much of the width a name can occupy, short of its power. */
const MOVE_ROWS = 6;
const MOVE_WIDTH = 0.62;

/** Move names are words, with a hyphen in a few — `Lock-On`, `Power-Up Punch` — and nothing else. */
const MOVE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-' ";
