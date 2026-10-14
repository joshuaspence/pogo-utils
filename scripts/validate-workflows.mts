/**
 * Checks every workflow in `.github/workflows/` is one GitHub will start, by the rules in `src/workflow-checks.mts`.
 *
 * The files are found by reading the directory rather than from a list, so a workflow added tomorrow is checked
 * without anybody remembering to say so. Both extensions are read, GitHub accepting either.
 */

import { workflowProblems } from '../src/workflow-checks.mts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.github/workflows';

const files = readdirSync(DIR)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort()
  .map((name) => join(DIR, name));

if (files.length === 0) {
  console.error(`No workflows found in ${DIR}. Run this from the repository root.`);
  process.exit(1);
}

const problems = files.flatMap((file) => workflowProblems(file, readFileSync(file, 'utf8')));

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }

  process.exit(1);
}

console.log(`${files.length} workflows give every job a runner.`);
