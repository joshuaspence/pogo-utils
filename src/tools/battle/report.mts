/**
 * What `run` tells of itself: each `event` something done once, as a tap or a battle's start, and its `status`, how the
 * run and the battle stand, sent again on every frame. `plain` writes them as lines, for a log or a pipe; `live` takes
 * over a terminal, laid out in fixed parts.
 */

/** One side of the battle as last read, `null` for what has not been. */
export interface Side {
  species: string | null;
  cp: number | null;
  hp: number | null;
  shields: number;
}

/** The battle under way, or the last one played, and what is to be done in it. */
export interface Fight {
  own: Side;
  opponent: Side;

  /** Our charged moves' names, read under their buttons. */
  moves: readonly string[];

  /** The charged move to be thrown, or `undefined` for whichever lights first. */
  throwing: string | undefined;
  bait: boolean;
  shield: boolean;

  /** The opponent's energy as counted off our bar, and the fast move it is counted by, where it can be counted. */
  energy?: { energy: number; fast: string };
}

export interface Status {
  /** Battles finished, and how many are to be. */
  battles: number;
  count: number;

  /** What the screen was last recognised as: a battle's state, a menu, or `other`. */
  screen: string;

  /** How long nothing may still go unrecognised before the run stops, in milliseconds, and how long in all. */
  lostIn: number;
  lostAfter: number;
  fight: Fight | undefined;
}

export interface Reporter {
  /** Something done once: by one `side`, or by the run where none is given, as a battle's start or a menu's tap. */
  event(line: string, side?: 'own' | 'opponent'): void;
  status(status: Status): void;
}

/** The status's battle as one line, the one `--verbose` has always written. */
export function describe({ own, opponent, moves, throwing, bait, shield, energy }: Fight): string {
  const side = ({ cp, hp }: Side) => `CP ${cp ?? '?'} at ${hp === null ? '?' : Math.round(hp * 100)}%`;
  const counted = energy ? `; their energy ${energyOf(energy)}` : '';

  return `${own.species ?? '?'} against ${opponent.species ?? '?'} (${opponent.shields} shields): ${moves.join(', ') || '?'}, ${bait ? 'baiting with' : 'throwing'} ${throwing ?? 'the first ready'}, ${shield ? '' : 'not '}shielding; ${side(own)} against ${side(opponent)}, ${own.shields} of our shields left${counted}`;
}

/** The opponent's energy as counted, `40 by Counter`. */
const energyOf = ({ energy, fast }: NonNullable<Fight['energy']>) => `${energy} by ${fast}`;

/** Each event as a line, and the battle's line again each time it changes. */
export function plain(write: (line: string) => void): Reporter {
  let said = '';

  return {
    event: (line) => write(line),
    status({ fight }) {
      const saying = fight && describe(fight);

      if (saying && saying !== said) {
        write(saying);
        said = saying;
      }
    },
  };
}

/** How long the HP bar is drawn at most, in characters: shorter where its column is narrower. */
const BAR = 20;

/** How long nothing must go unrecognised before the panel counts down to the run's stopping, in milliseconds. */
const QUIET_MS = 1_000;

/** What goes between the two sides' columns. */
const DIVIDER = ' │ ';

/** `text` cut to `width` characters, and padded out to it where `pad`. */
function fit(text: string, width: number, pad = true): string {
  const kept = [...text].slice(0, Math.max(0, width));

  return kept.join('') + (pad ? ' '.repeat(Math.max(0, width - kept.length)) : '');
}

/** How wide each side's column is in a line `width` wide: ours at the left, the opponent's at the right. */
const columnOf = (width: number) => Math.floor((width - DIVIDER.length) / 2);

/** Ours and the opponent's laid side by side in a line `width` wide, each cut to its column. */
function beside(own: string, opponent: string, width: number): string {
  const column = columnOf(width);

  return `${fit(own, column)}${DIVIDER}${fit(opponent, width - column - DIVIDER.length, false)}`.trimEnd();
}

/** A rule across a line `width` wide, met where the columns divide by `join`: `┬` above them, `┼` between, `┴` below. */
export function rule(width: number, join = '┼'): string {
  const column = columnOf(width);

  return `${'─'.repeat(column)}─${join}─${'─'.repeat(Math.max(0, width - column - DIVIDER.length))}`;
}

/** How the run stands, for the line above the table. */
export function summary(status: Status | undefined): string {
  const { battles, count, screen, lostIn, lostAfter } = status ?? {};
  const finished = `${battles ?? 0}${count === undefined || count === Infinity ? '' : ` of ${count}`} finished`;
  const quiet = lostIn !== undefined && lostAfter !== undefined && lostAfter - lostIn >= QUIET_MS;
  const lost = quiet ? `, stopping in ${Math.ceil(Math.max(0, lostIn) / 1000)}s` : '';

  return `${finished}; ${screen ?? 'starting'}${lost}`;
}

/** How many lines the panel is, whatever is known. */
const PANEL_ROWS = 5;

/**
 * The battle as the panel's lines, `width` wide, ours at the left and theirs at the right. Always `PANEL_ROWS` of them,
 * each thing on its own whatever is known, so nothing on the screen moves as more of it is: the lines of a battle not
 * yet begun are left empty.
 */
export function panel(fight: Fight | undefined, width: number): string {
  if (!fight) {
    return [beside('no battle yet', '', width), ...Array<string>(PANEL_ROWS - 1).fill(beside('', '', width))].join(
      '\n',
    );
  }

  // How strong each side is sits at its column's right, the same width whatever is known, `100% │ ●● │ CP 2495`, and
  // the name gets what is left of the line; the HP bar has the line under them to itself, set at the right too.
  const column = columnOf(width);
  const long = Math.max(0, Math.min(BAR, column));

  const name = ({ species, cp, hp, shields }: Side) => {
    const percent = hp === null ? '  ?' : `${Math.round(hp * 100)}`.padStart(3);
    const strength = `${percent}% │ ${'●'.repeat(shields)}${'○'.repeat(2 - shields)} │ CP ${`${cp ?? '?'}`.padStart(4)}`;

    return (fit(species ?? '?', column - strength.length - 1) + ' ' + strength).slice(-column);
  };

  const health = ({ hp }: Side) => {
    const filled = hp === null ? 0 : Math.round(hp * long);

    return (hp === null ? '?'.repeat(long) : '█'.repeat(filled) + '░'.repeat(long - filled)).padStart(column);
  };

  return [
    beside(name(fight.own), name(fight.opponent), width),
    beside(health(fight.own), health(fight.opponent), width),
    beside(fight.moves.join(', ') || '?', fight.energy ? `energy ${energyOf(fight.energy)}` : '', width),
    beside(`${fight.bait ? 'baiting with' : 'throwing'} ${fight.throwing ?? 'the first ready'}`, '', width),
    beside(fight.shield ? 'shielding' : 'not shielding', '', width),
  ].join('\n');
}

/** How often the screen may be redrawn, in milliseconds: a status comes with every frame, 30 a second. */
const DRAW_MS = 100;

/** Events kept of each kind: more than any terminal is tall. */
const KEPT_EVENTS = 1_000;

/** How many lines the run's own events are given at the foot of the screen: a way round the menus is seven. */
const RUN_ROWS = 8;

/** Entering the alternate screen with the cursor hidden, and leaving it with the cursor shown again. */
const ENTER = '\x1b[?1049h\x1b[?25l';
const LEAVE = '\x1b[?25h\x1b[?1049l';

/** A redraw from the top left, framed as one update so the terminal shows it whole rather than half drawn. */
const BEGIN = '\x1b[?2026h\x1b[H';
const END = '\x1b[J\x1b[?2026l';
const CLEAR_LINE = '\x1b[K';

/** Drawn faint, for what is told outside the two sides' table. */
const faded = (line: string) => `\x1b[2m${line}\x1b[22m`;

/** The last `rows` of `lines`, and `blank` lines after them to make up `rows` while there are fewer. */
function last(lines: readonly string[], rows: number, blank: string): string[] {
  const kept = lines.slice(-rows);

  return [...kept, ...Array<string>(Math.max(0, rows - kept.length)).fill(blank)];
}

/**
 * `stream`, a terminal, taken over whole and kept in fixed parts, so nothing moves as the run goes on: how the run
 * stands at the top, then a table of the two sides, ours at the left and theirs at the right, of the panel above and
 * what each side did below it, then the run's own events at the foot. What is outside the table is drawn faint, as
 * less to watch. Redrawn as anything changes, or the terminal is resized, but no more than every `DRAW_MS`; every line
 * is cut to the terminal's width, as one wrapped would push the rest down. `done` gives the terminal back and writes
 * the last screen into it, so a run that stopped can still be read once it has.
 */
export function live(stream: NodeJS.WriteStream): Reporter & { done(): void } {
  const sides: { line: string; side: 'own' | 'opponent' }[] = [];
  const runs: string[] = [];
  let latest: Status | undefined;
  let entered = false;
  let finished = false;
  let drawnAt = -Infinity;
  let pending: NodeJS.Timeout | undefined;

  // The screen's `rows` lines, each cut to the width and faint where it is outside the table.
  const screen = (rows: number) => {
    const width = stream.columns;
    const cut = (line: string) => [...line].slice(0, width).join('');

    // What the sides did fills what the summary and a blank line, the table's rules and panel, and a blank line and
    // the run's events leave.
    const logged = Math.max(1, rows - (2 + 3 + PANEL_ROWS + 1 + RUN_ROWS));
    const done = sides.map(({ line, side }) => (side === 'own' ? beside(line, '', width) : beside('', line, width)));

    return [
      faded(cut(summary(latest))),
      '',
      rule(width, '┬'),
      ...panel(latest?.fight, width).split('\n').map(cut),
      rule(width),
      ...last(done, logged, beside('', '', width)).map(cut),
      rule(width, '┴'),
      '',
      ...last(runs, RUN_ROWS, '').map((line) => (line ? faded(cut(line)) : line)),
    ].slice(0, rows);
  };

  const draw = () => {
    clearTimeout(pending);
    pending = undefined;
    drawnAt = Date.now();

    if (finished) {
      return;
    }

    // Taken over only once there is something to draw, so whatever is written before the run begins stays readable.
    if (!entered) {
      stream.write(ENTER);
      entered = true;
    }

    stream.write(
      BEGIN +
        screen(stream.rows)
          .map((line) => line + CLEAR_LINE)
          .join('\r\n') +
        END,
    );
  };

  const request = () => {
    const wait = drawnAt + DRAW_MS - Date.now();

    if (wait <= 0) {
      draw();
    } else {
      pending ??= setTimeout(draw, wait).unref();
    }
  };

  stream.on('resize', draw);

  return {
    event(line, side) {
      if (side) {
        sides.push({ line, side });
        sides.splice(0, sides.length - KEPT_EVENTS);
      } else {
        runs.push(line);
        runs.splice(0, runs.length - KEPT_EVENTS);
      }

      request();
    },
    status(status) {
      latest = status;
      request();
    },
    done() {
      clearTimeout(pending);
      stream.off('resize', draw);

      if (entered && !finished) {
        stream.write(`${LEAVE}${screen(stream.rows - 1).join('\n')}\n`);
      }

      finished = true;
    },
  };
}
