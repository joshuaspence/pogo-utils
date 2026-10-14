/**
 * Which workflows `scripts/validate-workflows.mts` turns down, and why. Written out rather than read from
 * `.github/workflows/`, which holds only files that pass.
 */

import { workflowProblems } from './workflow-checks.mts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const problemsIn = (lines: string[]) => workflowProblems('w.yaml', [...lines, ''].join('\n'));

test('a job with a runner passes', () => {
  expect(problemsIn(['on: push', 'jobs:', '  build:', "    runs-on: 'ubuntu-latest'", '    steps: []'])).toEqual([]);
});

test('a job with no `runs-on` is named, with its file and line', () => {
  expect(problemsIn(['on: push', 'jobs:', '  ok:', '    runs-on: x', '  bad:', '    steps: []'])).toEqual([
    'w.yaml:5: job "bad" has no `runs-on` — every job must name its runner',
  ]);
});

test('a `container` does not stand in for `runs-on`', () => {
  expect(problemsIn(['on: push', 'jobs:', '  claude:', "    container: 'node:24'", '    steps: []'])).toEqual([
    'w.yaml:3: job "claude" has no `runs-on` — every job must name its runner',
  ]);
});

test('a job calling a reusable workflow takes its runner from it, and may not name one', () => {
  expect(problemsIn(['on: push', 'jobs:', '  call:', '    uses: ./.github/workflows/x.yaml'])).toEqual([]);
  expect(problemsIn(['on: push', 'jobs:', '  call:', '    uses: ./x.yaml', '    runs-on: x'])).toEqual([
    'w.yaml:3: job "call" calls a reusable workflow, which may not set `runs-on`',
  ]);
});

test('a workflow with no `on` or no jobs is turned down', () => {
  expect(problemsIn(['jobs:', '  a:', '    runs-on: x'])).toEqual([
    'w.yaml:1: no `on` — a workflow must name the events that run it',
  ]);
  expect(problemsIn(['on: push'])).toEqual(['w.yaml:1: no `jobs` — a workflow must define at least one job']);
  expect(problemsIn(['on: push', 'jobs: {}'])).toHaveLength(1);
});

test('a file that is not YAML is reported rather than read', () => {
  expect(problemsIn(['on: push', 'jobs:', '  a: [unclosed'])[0]).toMatch(/^w\.yaml:\d+: /);
  expect(problemsIn(['- a list'])).toEqual(['w.yaml: a workflow is a mapping of keys, and this is not one']);
});

/*
 * The repository's own workflows, each with one job's `runs-on` taken out. A pass that only ever saw them whole could
 * be green for want of reading them at all; this proves it reads every job in every file the directory holds.
 */
test('removing `runs-on` from any job in the repository turns the pass red', () => {
  const dir = join(import.meta.dirname, '../.github/workflows');
  const names = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));

  expect(names.length).toBeGreaterThan(0);

  let removed = 0;

  for (const name of names) {
    const lines = readFileSync(join(dir, name), 'utf8').split('\n');

    expect(workflowProblems(name, lines.join('\n'))).toEqual([]);

    lines.forEach((line, index) => {
      if (/^ {4}runs-on:/.test(line)) {
        const without = lines.filter((_, i) => i !== index).join('\n');

        expect(workflowProblems(name, without)).toEqual([expect.stringContaining('has no `runs-on`')]);
        removed++;
      }
    });
  }

  expect(removed).toBeGreaterThanOrEqual(names.length);
});
