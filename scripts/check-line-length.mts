/**
 * Fails on any line in the repository wider than the house style's 120 characters, listing each as `file:line`. What
 * counts as a character, and which lines are exempt, is `src/line-length.mts`'s to say; this is the part that finds the
 * files.
 *
 * `git ls-files` rather than a walk of the tree, for the reason `gpxSources` gives: an untracked file — a build, a
 * worktree, a scratch copy — is nobody's to hold to the style yet.
 */

import { CHECKED, IGNORED, MAX_WIDTH, overlong } from '../src/line-length.mts';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((fileName) => CHECKED.test(fileName) && !IGNORED.has(fileName));

let failures = 0;

for (const fileName of files) {
  for (const { line, width } of overlong(fileName, readFileSync(fileName, 'utf8'))) {
    console.error(`${fileName}:${line}: ${width} characters, over ${MAX_WIDTH}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`${failures} line(s) over ${MAX_WIDTH} characters in ${files.length} files`);
  process.exit(1);
}

console.log(`${files.length} files, no line over ${MAX_WIDTH} characters`);
