/**
 * The `build:*` steps against the order `pnpm build` runs them in.
 *
 * `build` names its steps rather than globbing `'build:*'`, because the order is a dependency graph and not a
 * preference: `build:data` writes the one of its two indexes that `build:ics` reads, and `build:assemble` checks what
 * every other step wrote. Naming them costs the one mistake a glob could not make — a step added to `package.json` and
 * left out of the list — and npm-run-all has nothing to report, since a step missing from `build` is not a failure but
 * a step that never runs. The only trace would be whatever it was going to write being absent from `dist/`.
 *
 * The two readings are independent on purpose: the steps come out of `build`'s command string and the scripts out of
 * the object's keys, so a pattern that stopped matching cannot agree with the keys about anything.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

const ROOT = join(import.meta.dirname, '..');

const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/** The steps `build` lists, in the order it runs them. */
const steps = [...(scripts.build ?? '').matchAll(/\bbuild:[\w-]+/g)].map(([name]) => name);

/** Every step `package.json` defines, which is the half the keys answer for. */
const defined = Object.keys(scripts).filter((name) => name.startsWith('build:'));

test('`build` runs every step it defines, once each', () => {
  expect(steps).toHaveLength(defined.length);
  expect(new Set(steps)).toStrictEqual(new Set(defined));
});

test('`build` runs its steps in the order their outputs require', () => {
  // `--parallel` would leave every assertion below describing nothing.
  expect(scripts.build).toContain('--serial');

  // Removes `dist/`, so a step before it has written into an artifact about to be thrown away.
  expect(steps[0]).toBe('build:clean');

  // Reads the finished artifact: every reference a page names, and every stylesheet no page does.
  expect(steps.at(-1)).toBe('build:assemble');

  /*
   * `build:data` writes `data/entries-by-event.json`, which `build:ics` puts into an event's description. Asserting
   * the first index is found as well, because `indexOf` answers `-1` for a step that is absent and `-1` is less than
   * anything.
   */
  const data = steps.indexOf('build:data');

  expect(data).toBeGreaterThanOrEqual(0);
  expect(data).toBeLessThan(steps.indexOf('build:ics'));
});
