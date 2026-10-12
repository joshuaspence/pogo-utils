/**
 * The house style's 120-character width, as a check. `prettier --check` holds code and Markdown prose to it but not the
 * text inside a comment, which it never reflows — so before this, an over-long comment was invisible to the only width
 * check the repository had, and 114 of them had built up under `src/` by the time anybody measured.
 *
 * Measured in characters, not bytes or UTF-16 units: an em-dash is one column and three bytes, and the comments here
 * are full of them. A character is a grapheme, so an accented letter written as two code points still counts once.
 *
 * Some lines are exempt because they have nowhere to wrap, or because wrapping them would change what they say:
 *
 * - A Markdown table row, which the house style exempts; Prettier pads every row to the widest cell.
 * - A heredoc body, which is posted verbatim — a comment body renders its own line breaks, so a hard-wrapped one
 *   arrives at the pull request broken mid-sentence.
 * - A JSON line that is a single string, with or without its key, in a `.json` file or a Markdown `json` code block:
 *   JSON has no way to continue a string onto the next line, so an image URL or a `package.json` script is as long as
 *   it is.
 * - Anything between a `line-length-ignore-start` marker and a `line-length-ignore-end`, or on the line after a
 *   `line-length-ignore-next-line`, each a comment on a line of its own in whatever syntax the file has. The marker
 *   wants a reason beside it, the way an `eslint-disable` does.
 */

export const MAX_WIDTH = 120;

/** The extensions this checks. Not `.gpx` or `.xsd`, whose lines are data and a vendored schema rather than writing. */
export const CHECKED = /\.(css|html|js|json|md|mjs|mts|py|sh|ts|tsx|ya?ml)$/;

/**
 * Tracked files that would otherwise match `CHECKED` but are not anybody's writing: the lockfile pnpm generates, and
 * the feed `pnpm vend:events` copies in from ScrapedDuck as it finds it.
 */
export const IGNORED = new Set(['data/events-feed.json', 'pnpm-lock.yaml']);

export type Overlong = { line: number; width: number };

const segmenter = new Intl.Segmenter();

/** `text`'s width in characters. ASCII is the common case, and there a character is a UTF-16 unit. */
export function width(text: string) {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7f]*$/.test(text) ? text.length : [...segmenter.segment(text)].length;
}

/**
 * A heredoc's opening, `<<EOT`, `<<-EOT`, `<<'EOT'` or `<<"EOT"` but not a `<<<` here-string, capturing the word that
 * closes it. Looked for only where shell is written — a `.sh` file, a workflow's `run:` block, a Markdown code block
 * labelled as shell — since elsewhere `<<` is a shift in TypeScript or prose quoting a command, and taking one of those
 * for a heredoc would exempt every line until one happened to read `EOF`.
 */
const HEREDOC = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_]\w*)\1/;

/** The Markdown code block languages that hold shell. */
const SHELL_FENCES = new Set(['bash', 'console', 'sh', 'shell', 'zsh']);

/** A YAML `run:` key opening a block scalar, alone or as a sequence item. */
const RUN = /^\s*(?:-\s+)?run:\s*[|>]/;

/**
 * An ignore marker, which has to open a comment that opens its line — `//`, `/*`, `#` or `<!--` and then
 * `line-length-ignore-start`, `line-length-ignore-end` or `line-length-ignore-next-line` — so that a comment talking
 * about one, as this one does, or a string holding one, as the tests do, is not taken for it. Opening the line is also
 * what keeps a line to one marker, so a start and an end cannot sit together with only the first of them read.
 */
const MARKER = /^\s*(?:\/\/|\/\*|#|<!--)\s*line-length-ignore-(start|end|next-line)\b/;

/** A JSON line that is one string, perhaps after its key and perhaps before a comma. */
const JSON_STRING = /^\s*(?:"(?:[^"\\]|\\.)*"\s*:\s*)?"(?:[^"\\]|\\.)*",?$/;

/** A Markdown code fence, capturing its language. */
const FENCE = /^\s*(?:```|~~~)\s*(\w*)/;

/** The lines of `text` wider than `MAX_WIDTH` and not exempt, 1-indexed, for a file named `fileName`. */
export function overlong(fileName: string, text: string): Overlong[] {
  const markdown = fileName.endsWith('.md');
  const yaml = /\.ya?ml$/.test(fileName);
  const found: Overlong[] = [];

  /** The language of the Markdown code block this is in, `''` for one that names none, or undefined outside one. */
  let fence: string | undefined;
  /** The indentation of the `run:` key whose block this is in, or undefined outside one. */
  let run: number | undefined;
  let heredoc: string | undefined;
  let ignoring = false;
  let ignoreNext = false;

  for (const [index, line] of text.split('\n').entries()) {
    const indent = line.search(/\S/);
    const closesFence = markdown && fence !== undefined && FENCE.test(line);
    const leavesRun = run !== undefined && indent !== -1 && indent <= run;

    // A heredoc ends with the block it was written in at the latest, so one whose closing word never comes cannot
    // exempt the rest of the file.
    if (closesFence || leavesRun) {
      heredoc = undefined;
    }

    if (leavesRun) {
      run = undefined;
    }

    const shell =
      fileName.endsWith('.sh') || (markdown && SHELL_FENCES.has(fence ?? '')) || (yaml && run !== undefined);
    const json = fileName.endsWith('.json') || fence === 'json' || fence === 'jsonc';
    const exempt =
      ignoring ||
      ignoreNext ||
      heredoc !== undefined ||
      (markdown && fence === undefined && /^\s*\|/.test(line)) ||
      (json && JSON_STRING.test(line));

    ignoreNext = false;

    const opened = markdown && fence === undefined ? FENCE.exec(line) : null;
    const marker = MARKER.exec(line)?.[1];

    if (heredoc !== undefined) {
      if (line.trim() === heredoc) {
        heredoc = undefined;
      }
    } else if (closesFence) {
      fence = undefined;
    } else if (opened) {
      fence = opened[1] ?? '';
    } else if (marker === 'start') {
      ignoring = true;
    } else if (marker === 'end') {
      ignoring = false;
    } else if (marker === 'next-line') {
      ignoreNext = true;
    } else if (shell && !ignoring) {
      heredoc = HEREDOC.exec(line)?.[2];
    }

    if (yaml && run === undefined && RUN.test(line)) {
      run = indent;
    }

    if (!exempt && line.length > MAX_WIDTH) {
      const measured = width(line);

      if (measured > MAX_WIDTH) {
        found.push({ line: index + 1, width: measured });
      }
    }
  }

  return found;
}
