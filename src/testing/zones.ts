/**
 * The zone sweep, as a test rather than as a CI matrix. `testEveryZone` runs one body once in each of four timezones,
 * so a date reading that happens to hold at one offset fails for whoever wrote it rather than on whichever runner is in
 * a different zone — and the suite checks more than one reading of a zone however `pnpm test` was invoked.
 *
 * `vi.stubEnv` rather than `process.env` directly, because `process` is not a name this half of the tree has: `types`
 * is `[]` in `tsconfig.json` to keep Node's globals out of a module a browser could import, so a bare `process` is a
 * `TS2591` here. Vitest's own API is typed through its package's `exports` and sets the same `process.env.TZ`, which
 * Node re-reads on the next `Date` operation.
 */
import { test, vi } from 'vitest';

/**
 * Four zones, because each answers something the others cannot. `UTC` for a zero offset, which is the only place a
 * negated `-0` is a different number to `Object.is` than the `+0` a subtraction gives. `America/New_York` and
 * `Australia/Sydney` because a zone that changes its clocks is the only kind that can tell a calendar day from a fixed
 * 86,400,000ms span, and two hemispheres put the change on opposite sides of the year. `Asia/Kathmandu` for an offset
 * that is not a whole number of hours.
 *
 * Nothing in the suite singles Kathmandu out today — no module does arithmetic on hours, and arithmetic on instants
 * preserves a constant offset however odd it is — so that entry guards an assumption rather than a demonstrated
 * failure. `zones.test.ts` pins what each of the four reads, which is what says the list is four readings and not one
 * repeated.
 */
export const ZONES = ['America/New_York', 'Asia/Kathmandu', 'Australia/Sydney', 'UTC'] as const;

export type Zone = (typeof ZONES)[number];

/**
 * One test per zone, named for the zone it runs in and handed it. Build every date the body needs inside it: a fixture
 * at module scope is built once, as the file is imported, in whatever zone the machine is in, so reading one from a
 * swept body weighs an answer in one zone against a date from another.
 *
 * The `finally` is load-bearing, and that same fixture is why. An env stub is not undone between tests without
 * `unstubEnvs`, so dropping the restore leaves every later test in the file reading the last zone swept — which is 2
 * failed in `event-schedule.test.ts`, both of them `weekColumns` cases weighing a `WEEK_START` built at import against
 * columns counted in `UTC`. A sweep that leaks is read as a bug in whatever it leaked into.
 */
export function testEveryZone(name: string, body: (zone: Zone) => void) {
  test.for(ZONES)(`${name} (%s)`, (zone) => {
    vi.stubEnv('TZ', zone);

    try {
      body(zone);
    } finally {
      vi.unstubAllEnvs();
    }
  });
}
