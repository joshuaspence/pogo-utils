import { Writable } from 'node:stream';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { live, panel, plain, rule, summary, type Fight, type Status } from './report.mts';

const FIGHT: Fight = {
  own: { species: 'Charizard', cp: 2495, hp: 0.74, shields: 1 },
  opponent: { species: 'Magmar', cp: 1826, hp: 0.5, shields: 2 },
  moves: ['Blast Burn', 'Dragon Claw'],
  throwing: 'Dragon Claw',
  bait: true,
  shield: false,
};

const STATUS: Status = { battles: 1, count: 3, screen: 'battle', lostIn: 20_000, lostAfter: 20_000, fight: FIGHT };

/** A line of the table with nothing in either column, 80 wide. */
const EMPTY = `${' '.repeat(38)} │`;

test('draws ours at the left and the opponent at the right', () => {
  expect(panel(FIGHT, 80).split('\n')).toEqual([
    'Charizard                      CP 2495 │ Magmar                         CP 1826',
    '███████████████░░░░░  74%  ●○          │ ██████████░░░░░░░░░░  50%  ●●',
    'Blast Burn, Dragon Claw                │',
    'baiting with Dragon Claw               │',
    'not shielding                          │',
  ]);
  expect(rule(80)).toBe(`${'─'.repeat(39)}┼${'─'.repeat(40)}`);
  expect(rule(80, '┬')).toBe(`${'─'.repeat(39)}┬${'─'.repeat(40)}`);
});

test('shortens the bars to fit a narrower terminal', () => {
  expect(panel(FIGHT, 50).split('\n').slice(0, 2)).toEqual([
    'Charizard       CP 2495 │ Magmar          CP 1826',
    '██████████░░░░  74%  ●○ │ ███████░░░░░░░  50%  ●●',
  ]);
});

test('marks what has not been read, each thing still in its place', () => {
  const unread = { species: null, cp: null, hp: null, shields: 2 };

  expect(panel({ ...FIGHT, own: unread, moves: [], throwing: undefined }, 80).split('\n')).toEqual([
    '?                                 CP ? │ Magmar                         CP 1826',
    '????????????????????   ?%  ●●          │ ██████████░░░░░░░░░░  50%  ●●',
    '?                                      │',
    'baiting with the first ready           │',
    'not shielding                          │',
  ]);
});

test('keeps every line of the panel before a battle', () => {
  expect(panel(undefined, 80).split('\n')).toEqual([`${'no battle yet'.padEnd(38)} │`, EMPTY, EMPTY, EMPTY, EMPTY]);
});

test('says how the run stands, counting down to its stopping once nothing has been recognised for a second', () => {
  expect(summary(STATUS)).toBe('1 of 3 finished; battle');
  expect(summary({ ...STATUS, count: Infinity, screen: 'party' })).toBe('1 finished; party');
  expect(summary(undefined)).toBe('0 finished; starting');
  expect(summary({ ...STATUS, screen: 'other', lostIn: 19_500 })).toBe('1 of 3 finished; other');
  expect(summary({ ...STATUS, screen: 'other', lostIn: 12_300 })).toBe('1 of 3 finished; other, stopping in 13s');
});

test('writes the battle as a line each time it changes, and each event', () => {
  const lines: string[] = [];
  const report = plain((line) => lines.push(line));

  report.status(STATUS);
  report.status({ ...STATUS, screen: 'charged' });
  report.event('threw Dragon Claw', 'own');
  report.status({ ...STATUS, fight: { ...FIGHT, shield: true } });
  report.status({ ...STATUS, fight: undefined });

  expect(lines).toEqual([
    'Charizard against Magmar (2 shields): Blast Burn, Dragon Claw, baiting with Dragon Claw, not shielding; CP 2495 at 74% against CP 1826 at 50%, 1 of our shields left',
    'threw Dragon Claw',
    'Charizard against Magmar (2 shields): Blast Burn, Dragon Claw, baiting with Dragon Claw, shielding; CP 2495 at 74% against CP 1826 at 50%, 1 of our shields left',
  ]);
});

/** A terminal `columns` wide and `rows` tall that keeps everything written to it. */
function terminal(columns = 80, rows = 24) {
  let written = '';
  const stream = Object.assign(
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        written += chunk.toString();
        done();
      },
    }),
    { isTTY: true, columns, rows },
  ) as unknown as NodeJS.WriteStream;

  // The screen as the last redraw left it, a line to each row.
  const shown = () => {
    const last = written.split('\x1b[?2026h\x1b[H').at(-1) ?? '';

    return (last.split('\x1b[J')[0] ?? '').replaceAll('\x1b[K', '').split('\r\n');
  };

  return { stream, written: () => written, shown };
}

const faded = (line: string) => `\x1b[2m${line}\x1b[22m`;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('keeps the terminal in fixed parts: the run, the two sides and what each did, then the run’s own events', () => {
  const { stream, written, shown } = terminal(80, 24);
  const report = live(stream);

  report.status(STATUS);
  report.event('party: Charizard, Gyarados, Mamoswine');
  report.event('battle 2 started');
  report.event('threw Dragon Claw', 'own');
  report.event('Magmar threw a charged move', 'opponent');
  report.event('tap shield', 'own');
  vi.advanceTimersByTime(100);

  expect(written().startsWith('\x1b[?1049h')).toBe(true);
  expect(shown()).toEqual([
    faded('1 of 3 finished; battle'),
    '',
    rule(80, '┬'),
    ...panel(FIGHT, 80).split('\n'),
    rule(80),
    'threw Dragon Claw                      │',
    '                                       │ Magmar threw a charged move',
    'tap shield                             │',
    EMPTY,
    EMPTY,
    rule(80, '┴'),
    '',
    faded('party: Charizard, Gyarados, Mamoswine'),
    faded('battle 2 started'),
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
});

test('keeps each part where it is from the first draw, whether or not a status or event has come', () => {
  const { stream, shown } = terminal(80, 24);
  const report = live(stream);

  report.event('map: tap');

  const before = shown();

  vi.advanceTimersByTime(100);
  report.status(STATUS);
  vi.advanceTimersByTime(100);
  report.event('threw Dragon Claw', 'own');

  expect(before).toHaveLength(24);
  expect(shown()).toHaveLength(24);

  for (const screen of [before, shown()]) {
    expect(screen.indexOf(rule(80))).toBe(8);
    expect(screen.indexOf(rule(80, '┴'))).toBe(14);
    expect(screen[16]).toBe(faded('map: tap'));
  }
});

test('gives the run’s events at the foot their last eight, and what the sides did the rest of the height', () => {
  const { stream, shown } = terminal(80, 30);
  const report = live(stream);

  report.status(STATUS);
  Array.from({ length: 20 }, (_, i) => report.event(`tap ${i}`));
  Array.from({ length: 20 }, (_, i) => report.event(`tap shield ${i}`, 'own'));
  vi.advanceTimersByTime(100);

  expect(shown().slice(9, 20)).toEqual(Array.from({ length: 11 }, (_, i) => `tap shield ${i + 9}`.padEnd(38) + ' │'));
  expect(shown().slice(22)).toEqual(Array.from({ length: 8 }, (_, i) => faded(`tap ${i + 12}`)));
});

test('cuts each line to the width of the terminal, so none wraps', () => {
  const { stream, shown } = terminal(20, 24);
  const report = live(stream);

  report.status(STATUS);
  report.event('party: Charizard, Gyarados, Mamoswine');
  report.event('Magmar threw a charged move', 'opponent');
  vi.advanceTimersByTime(100);

  const unfaded = (line: string) => line.replace('\x1b[2m', '').replace('\x1b[22m', '');

  expect(shown().every((line) => [...unfaded(line)].length <= 20)).toBe(true);
  expect(shown()[3]).toBe(' CP 2495 │  CP 1826');
  expect(shown()[9]).toBe('         │ Magmar th');
  expect(shown()[16]).toBe(faded('party: Charizard, Gy'));
});

test('redraws at most every 100ms, drawing the last status it was sent', () => {
  const { stream, written } = terminal();
  const report = live(stream);

  report.status(STATUS);
  report.status({ ...STATUS, screen: 'charged' });
  report.status({ ...STATUS, screen: 'switch' });

  expect(written()).toContain('1 of 3 finished; battle');
  expect(written()).not.toMatch(/charged|switch/);

  vi.advanceTimersByTime(100);

  expect(written()).not.toContain('charged');
  expect(written()).toContain('switch');
});

test('gives the terminal back when done, writing the last screen into it a line short, for the prompt', () => {
  const { stream, written } = terminal(80, 24);
  const report = live(stream);

  report.status(STATUS);
  report.event('tap shield', 'own');
  report.status({ ...STATUS, battles: 2 });
  report.done();

  const left = written().split('\x1b[?25h\x1b[?1049l');

  expect(left).toHaveLength(2);

  const lines = left[1]?.split('\n') ?? [];

  expect(lines).toHaveLength(24);
  expect(lines.slice(0, 10)).toEqual([
    faded('2 of 3 finished; battle'),
    '',
    rule(80, '┬'),
    ...panel(FIGHT, 80).split('\n'),
    rule(80),
    'tap shield                             │',
  ]);

  report.status(STATUS);
  report.done();
  vi.advanceTimersByTime(100);

  expect(written().split('\x1b[?25h\x1b[?1049l')).toHaveLength(2);
});
