import { expect, test } from 'vitest';

import { MAX_WIDTH, overlong, width } from './line-length.mts';

const long = (prefix = '') => prefix + 'x'.repeat(MAX_WIDTH + 1 - prefix.length);
const lines = (...each: string[]) => each.join('\n');

test('a line is measured in characters, so an em-dash counts once rather than as its three bytes', () => {
  expect(width('a — b')).toBe(5);
  expect(width('é')).toBe(1);
  expect(overlong('a.ts', `// ${'—'.repeat(MAX_WIDTH - 3)}`)).toEqual([]);
  expect(overlong('a.ts', `// ${'—'.repeat(MAX_WIDTH - 2)}`)).toEqual([{ line: 1, width: MAX_WIDTH + 1 }]);
});

test('a line at the limit passes and one past it fails, comment or code alike', () => {
  expect(overlong('a.ts', 'x'.repeat(MAX_WIDTH))).toEqual([]);
  expect(overlong('a.css', lines('a {}', long(' * ')))).toEqual([{ line: 2, width: MAX_WIDTH + 1 }]);
});

test('a Markdown table row is exempt, but only in Markdown and not inside a code block', () => {
  expect(overlong('a.md', long('| '))).toEqual([]);
  expect(overlong('a.ts', long('| '))).toHaveLength(1);
  expect(overlong('a.md', lines('```', long('| '), '```'))).toHaveLength(1);
});

test('a heredoc body is exempt in a workflow, up to the word that closes it', () => {
  const run = lines('run: |', '  cat <<EOT', `  ${long()}`, '  EOT', `  ${long()}`);

  expect(overlong('a.yaml', run)).toEqual([{ line: 5, width: MAX_WIDTH + 3 }]);
  expect(overlong('a.sh', lines('cat <<EOT', long(), 'EOT', long()))).toEqual([{ line: 4, width: MAX_WIDTH + 1 }]);
});

test('a heredoc is looked for only where shell is written, and ends with the block it was opened in', () => {
  expect(overlong('a.ts', lines('const a = b <<EOT;', long()))).toHaveLength(1);
  expect(overlong('a.md', lines('Pipe it in with `cat <<EOF`.', long()))).toHaveLength(1);
  expect(overlong('a.md', lines('```ts', 'a <<EOF', long(), '```'))).toHaveLength(1);
  expect(overlong('a.yaml', lines('name: cat <<EOF', long()))).toHaveLength(1);

  expect(overlong('a.md', lines('```sh', 'cat <<EOF', long(), '```', long()))).toEqual([
    { line: 5, width: MAX_WIDTH + 1 },
  ]);
  expect(overlong('a.yaml', lines('  - run: |', '      cat <<EOF', `      ${long()}`, '  - name: b', long()))).toEqual([
    { line: 5, width: MAX_WIDTH + 1 },
  ]);
});

test('a JSON line holding one string is exempt, in a JSON file or a Markdown json block', () => {
  const string = `  "image": "${long()}",`;

  expect(overlong('a.json', string)).toEqual([]);
  expect(overlong('a.json', `  "a": [${long()}]`)).toHaveLength(1);
  expect(overlong('a.md', lines('```json', string, '```'))).toEqual([]);
  expect(overlong('a.md', lines('```sh', string, '```'))).toHaveLength(1);
});

test('the ignore markers exempt the next line or a region, and only as a comment opening its line', () => {
  expect(overlong('a.ts', lines('// line-length-ignore-next-line: a URL', long(), long()))).toEqual([
    { line: 3, width: MAX_WIDTH + 1 },
  ]);
  expect(
    overlong(
      'a.md',
      lines('<!-- line-length-ignore-start -->', long(), long(), '<!-- line-length-ignore-end -->', long()),
    ),
  ).toEqual([{ line: 5, width: MAX_WIDTH + 1 }]);
  expect(overlong('a.ts', lines(' * `line-length-ignore-next-line`', long()))).toHaveLength(1);
  expect(overlong('a.ts', lines("f('// line-length-ignore-next-line');", long()))).toHaveLength(1);
  expect(overlong('a.ts', lines("f('/* line-length-ignore-start */');", long()))).toHaveLength(1);
});
