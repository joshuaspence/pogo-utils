import { Writable } from 'node:stream';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { live, panel, plain, rule, type Fight, type Status } from './report.mts';

const FIGHT: Fight = {
  own: { species: 'Charizard', cp: 2495, hp: 0.74, shields: 1 },
  opponent: { species: 'Magmar', cp: 1826, hp: 0.5, shields: 2 },
  moves: ['Blast Burn', 'Dragon Claw'],
  throwing: 'Dragon Claw',
  bait: true,
  shield: false,
};

const STATUS: Status = { battles: 1, count: 3, screen: 'battle', lostIn: 20_000, lostAfter: 20_000, fight: FIGHT };

test('draws the run across the top, then ours at the left and the opponent at the right', () => {
  expect(panel(STATUS, 80).split('\n')).toEqual([
    '1 of 3 finished; battle',
    'Charizard  CP 2495                     │ Magmar  CP 1826',
    '███████████████░░░░░  74%  ●○          │ ██████████░░░░░░░░░░  50%  ●●',
    'Blast Burn, Dragon Claw                │',
    'baiting with Dragon Claw               │',
    'not shielding                          │',
  ]);
  expect(rule(80)).toBe(`${'─'.repeat(39)}┼${'─'.repeat(40)}`);
});

test('shortens the bars to fit a narrower terminal', () => {
  expect(panel(STATUS, 50).split('\n').slice(1, 3)).toEqual([
    'Charizard  CP 2495      │ Magmar  CP 1826',
    '██████████░░░░  74%  ●○ │ ███████░░░░░░░  50%  ●●',
  ]);
});

test('marks what has not been read, and a run with no battle yet', () => {
  const unread = { species: null, cp: null, hp: null, shields: 2 };

  expect(
    panel({ ...STATUS, fight: { ...FIGHT, own: unread, moves: [], throwing: undefined } }, 80).split('\n'),
  ).toEqual([
    '1 of 3 finished; battle',
    '?  CP ?                                │ Magmar  CP 1826',
    '????????????????????   ?%  ●●          │ ██████████░░░░░░░░░░  50%  ●●',
    '?                                      │',
    'baiting with the first ready           │',
    'not shielding                          │',
  ]);
  expect(panel({ ...STATUS, count: Infinity, screen: 'party', fight: undefined }, 80)).toBe(
    '1 finished; party\nno battle yet',
  );
});

test('counts down to the run stopping once nothing has been recognised for a second', () => {
  expect(panel({ ...STATUS, screen: 'other', lostIn: 19_500 }, 80).split('\n')[0]).toBe('1 of 3 finished; other');
  expect(panel({ ...STATUS, screen: 'other', lostIn: 12_300 }, 80).split('\n')[0]).toBe(
    '1 of 3 finished; other, stopping in 13s',
  );
});

test('writes the battle as a line each time it changes, and each event', () => {
  const lines: string[] = [];
  const report = plain((line) => lines.push(line));

  report.status(STATUS);
  report.status({ ...STATUS, screen: 'charged' });
  report.event('tap charged');
  report.status({ ...STATUS, fight: { ...FIGHT, shield: true } });
  report.status({ ...STATUS, fight: undefined });

  expect(lines).toEqual([
    'Charizard against Magmar (2 shields): Blast Burn, Dragon Claw, baiting with Dragon Claw, not shielding; CP 2495 at 74% against CP 1826 at 50%, 1 of our shields left',
    'tap charged',
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

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('takes the terminal over, the panel at the top and the latest events under it, each in its column', () => {
  const { stream, written, shown } = terminal(80, 11);
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
    ...panel(STATUS, 80).split('\n'),
    rule(80),
    'battle 2 started',
    'threw Dragon Claw                      │',
    '                                       │ Magmar threw a charged move',
    'tap shield                             │',
  ]);
});

test('cuts each line to the width of the terminal, so none wraps', () => {
  const { stream, shown } = terminal(20, 24);
  const report = live(stream);

  report.status(STATUS);
  report.event('party: Charizard, Gyarados, Mamoswine');
  report.event('Magmar threw a charged move', 'opponent');
  vi.advanceTimersByTime(100);

  expect(shown().every((line) => [...line].length <= 20)).toBe(true);
  expect(shown().slice(1, 2)).toEqual(['Charizar │ Magmar  C']);
  expect(shown().slice(-2)).toEqual(['party: Charizard, Gy', '         │ Magmar th']);
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

test('gives the terminal back when done, writing the last screen into it', () => {
  const { stream, written } = terminal(80, 24);
  const report = live(stream);

  report.status(STATUS);
  report.event('tap shield', 'own');
  report.status({ ...STATUS, battles: 2 });
  report.done();

  const left = written().split('\x1b[?25h\x1b[?1049l');

  expect(left).toHaveLength(2);
  expect(left[1]).toBe(
    `${panel({ ...STATUS, battles: 2 }, 80)}\n${rule(80)}\ntap shield                             │\n`,
  );

  report.status(STATUS);
  report.done();
  vi.advanceTimersByTime(100);

  expect(written().split('\x1b[?25h\x1b[?1049l')).toHaveLength(2);
});
