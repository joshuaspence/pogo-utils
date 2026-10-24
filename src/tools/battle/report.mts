/**
 * What `run` tells of itself: each `event` something done once, as a tap or a battle's start, and its `status`, how the
 * run and the battle stand, sent again on every frame. `plain` writes them as lines, for a log or a pipe; `live` takes
 * over a terminal, the status a panel pinned to its top and the events scrolling up below it.
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
export function describe({ own, opponent, moves, throwing, bait, shield }: Fight): string {
  const side = ({ cp, hp }: Side) => `CP ${cp ?? '?'} at ${hp === null ? '?' : Math.round(hp * 100)}%`;

  return `${own.species ?? '?'} against ${opponent.species ?? '?'} (${opponent.shields} shields): ${moves.join(', ') || '?'}, ${bait ? 'baiting with' : 'throwing'} ${throwing ?? 'the first ready'}, ${shield ? '' : 'not '}shielding; ${side(own)} against ${side(opponent)}, ${own.shields} of our shields left`;
}

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

/** The rule under the panel, crossed where the columns divide. */
export function rule(width: number): string {
  const column = columnOf(width);

  return `${'─'.repeat(column)}─┼─${'─'.repeat(Math.max(0, width - column - DIVIDER.length))}`;
}

/** The status as the panel's lines, `width` wide: the run across the top, then ours at the left and theirs at the right. */
export function panel({ battles, count, screen, lostIn, lostAfter, fight }: Status, width: number): string {
  const finished = `${battles}${count === Infinity ? '' : ` of ${count}`} finished`;
  const lost = lostAfter - lostIn >= QUIET_MS ? `, stopping in ${Math.ceil(Math.max(0, lostIn) / 1000)}s` : '';
  const head = `${finished}; ${screen}${lost}`;

  if (!fight) {
    return `${head}\nno battle yet`;
  }

  // Room beside the bar for its percentage and the shields, ` 100%  ●●`.
  const long = Math.max(0, Math.min(BAR, columnOf(width) - 9));
  const name = ({ species, cp }: Side) => `${species ?? '?'}  CP ${cp ?? '?'}`;

  const health = ({ hp, shields }: Side) => {
    const filled = hp === null ? 0 : Math.round(hp * long);
    const bar = hp === null ? '?'.repeat(long) : '█'.repeat(filled) + '░'.repeat(long - filled);
    const percent = hp === null ? '  ?' : `${Math.round(hp * 100)}`.padStart(3);

    return `${bar} ${percent}%  ${'●'.repeat(shields)}${'○'.repeat(2 - shields)}`;
  };

  return [
    head,
    beside(name(fight.own), name(fight.opponent), width),
    beside(health(fight.own), health(fight.opponent), width),
    beside(fight.moves.join(', ') || '?', '', width),
    beside(`${fight.bait ? 'baiting with' : 'throwing'} ${fight.throwing ?? 'the first ready'}`, '', width),
    beside(fight.shield ? 'shielding' : 'not shielding', '', width),
  ].join('\n');
}

/** How often the screen may be redrawn, in milliseconds: a status comes with every frame, 30 a second. */
const DRAW_MS = 100;

/** Events kept for the log under the panel: more than any terminal is tall. */
const KEPT_EVENTS = 1_000;

/** Entering the alternate screen with the cursor hidden, and leaving it with the cursor shown again. */
const ENTER = '\x1b[?1049h\x1b[?25l';
const LEAVE = '\x1b[?25h\x1b[?1049l';

/** A redraw from the top left, framed as one update so the terminal shows it whole rather than half drawn. */
const BEGIN = '\x1b[?2026h\x1b[H';
const END = '\x1b[J\x1b[?2026l';
const CLEAR_LINE = '\x1b[K';

/**
 * The status as a panel pinned to the top of `stream`, a terminal taken over whole, and the latest events filling the
 * rest of it below a rule, each side's in its column and the run's across both. Redrawn as either changes, or the
 * terminal is resized, but no more than every `DRAW_MS`; every line is cut to the terminal's width, as one wrapped would
 * push the rest down. `done` gives the terminal back and writes the last screen into it, so a run that stopped can
 * still be read once it has.
 */
export function live(stream: NodeJS.WriteStream): Reporter & { done(): void } {
  const events: { line: string; side?: 'own' | 'opponent' | undefined }[] = [];
  let latest: Status | undefined;
  let entered = false;
  let finished = false;
  let drawnAt = -Infinity;
  let pending: NodeJS.Timeout | undefined;

  // The panel, the rule and as many of the latest events as fit under them, `rows` lines in all.
  const screen = (rows: number) => {
    const width = stream.columns;
    const top = latest ? [...panel(latest, width).split('\n'), rule(width)] : [];
    const shown = events.slice(-Math.max(1, rows - top.length));

    return [
      ...top,
      ...shown.map(({ line, side }) =>
        side === undefined ? line : side === 'own' ? beside(line, '', width) : beside('', line, width),
      ),
    ];
  };

  const cut = (line: string) => [...line].slice(0, stream.columns).join('');

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

    const rows = screen(stream.rows).slice(0, stream.rows);

    stream.write(BEGIN + rows.map((line) => cut(line) + CLEAR_LINE).join('\r\n') + END);
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
      events.push({ line, side });
      events.splice(0, events.length - KEPT_EVENTS);
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
