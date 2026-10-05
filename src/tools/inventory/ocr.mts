/**
 * Reads text off a screenshot with the Tesseract CLI, which has to be installed separately (`brew install tesseract`,
 * `apt install tesseract-ocr`) at 4.1 or later, since earlier releases' LSTM engine ignores the whitelist `ocrLine`
 * narrows a read with. Pokémon GO is drawn by Unity, so there is no view hierarchy to ask: `uiautomator dump` sees one
 * opaque surface, and the pixels are all there is.
 *
 * Downstream, readers anchor on where text sits wherever the screen offers something to anchor on, rather than on fixed
 * coordinates. The game lays itself out differently on every aspect ratio, and "the line above the HP" holds on all of
 * them where "y = 1180" holds on one. The screen fractions that remain, with nothing to anchor them, are the ones to
 * recalibrate for a new device.
 */

import { encodePng, type Image } from './png.mts';
import { execFile } from 'node:child_process';

/** One line of text as Tesseract grouped it, in the pixels of the image it was read from. */
export interface Line {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Lines of text in an image.
 *
 * Page segmentation mode 11, "sparse text", because a game screen is labels scattered over artwork rather than a page
 * of paragraphs.
 */
export async function ocr(image: Image): Promise<Line[]> {
  return group(await tesseract(image, 11));
}

/**
 * One line of text from an image cropped down to hold nothing else. Page segmentation mode 7 tells Tesseract the whole
 * image is that one line, which is the opposite of the sparse mode above and the right answer whenever a caller has
 * already narrowed the picture to something it knows the shape of. The difference is not small: a band of a screen
 * holding `L1 IV48 5/2/15` over a bright background reads as `r '` sparse and as `L1 1V48 5/2/15` as a line, because
 * sparse mode takes the blocks either side of it for pictures rather than for the margins they are.
 *
 * `whitelist` narrows the alphabet to the characters the line can contain, which is what stops a stray glyph splitting
 * a number in two.
 */
export async function ocrLine(image: Image, whitelist?: string): Promise<string | null> {
  const options = whitelist === undefined ? [] : ['-c', `tessedit_char_whitelist=${whitelist}`];
  const [line] = group(await tesseract(image, 7, ...options));

  return line?.text ?? null;
}

/**
 * Lowercase with accents and punctuation gone, so `POKéMON`, `Pokémon` and `pokemon` compare equal. `+` stays, since it
 * is all that tells `Aeroblast`, `Aeroblast+` and `Aeroblast++` apart.
 */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

/** The first line whose folded text matches, top to bottom. */
export function findLine(lines: readonly Line[], pattern: RegExp): Line | undefined {
  return lines.find((line) => pattern.test(fold(line.text)));
}

export function centre(line: Line): [number, number] {
  return [line.left + line.width / 2, line.top + line.height / 2];
}

interface Word {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Tesseract's TSV rows grouped into lines.
 *
 * Words are put in order left to right, and one repeating the word before it and lying mostly over it is dropped, since
 * sparse mode sometimes reads a word twice: `smoliv.png`'s move otherwise reads `© Energy Ball am Ball`, the second
 * `Ball` four pixels right of the first.
 *
 * The box is every word's, glyphs included, so a button read alongside the text as `©` or `=)` stretches it: on
 * `no-pgsharp.png` the line holding `Bubble` starts 74 pixels above the word and runs 119 tall. It is left that way
 * because the readers that pad a box to crop around it are measured against these boxes, and a line's top or height is
 * no more than a rough place to look.
 */
function group(tsv: string): Line[] {
  const lines = new Map<string, Word[]>();

  for (const row of tsv.split('\n').slice(1)) {
    const cells = row.split('\t');
    const text = cells[11]?.trim();

    if (cells[0] !== '5' || !text) {
      continue;
    }

    const [left, top, width, height] = cells.slice(6, 10).map(Number) as [number, number, number, number];
    const key = cells.slice(1, 5).join('.');
    lines.set(key, [...(lines.get(key) ?? []), { text, left, top, right: left + width, bottom: top + height }]);
  }

  return [...lines.values()]
    .map((words) => {
      const kept: Word[] = [];

      for (const word of words.sort((a, b) => a.left - b.left)) {
        const last = kept.at(-1);

        if (!last || last.text !== word.text || last.right - word.left <= (word.right - word.left) / 2) {
          kept.push(word);
        }
      }

      const left = Math.min(...kept.map((w) => w.left));
      const top = Math.min(...kept.map((w) => w.top));

      return {
        text: kept.map((w) => w.text).join(' '),
        left,
        top,
        width: Math.max(...kept.map((w) => w.right)) - left,
        height: Math.max(...kept.map((w) => w.bottom)) - top,
      };
    })
    .sort((a, b) => a.top - b.top || a.left - b.left);
}

/**
 * Tesseract's TSV for an image, in page segmentation mode `psm`.
 *
 * TSV is asked for with `tessedit_create_tsv` rather than the `tsv` config file, which a `TESSDATA_PREFIX` pointing at
 * a models-only download lacks, and without which Tesseract writes plain text and still exits 0. OpenMP is held to one
 * thread, as `man tesseract` advises, because callers run reads side by side and each one's threads spin-wait against
 * the others': pinned to four cores, a pair of full-screen reads took a median 12 seconds against 0.3.
 *
 * A floating-point exception counts as reading nothing, because it is the image rather than the machine that causes it:
 * Tesseract 5.3.4 dies of one every time on some whitelisted bands, such as `pikachu-ash-hat.png`'s at y=400 brightened
 * and read for a CP.
 *
 * An empty image reads as nothing without asking, since a crop wholly off the edge is one and libpng refuses a PNG
 * with no width or height as `Invalid IHDR data` — which would fail a scan over a band that held no text anyway.
 */
function tesseract(image: Image, psm: number, ...options: string[]): Promise<string> {
  if (image.width === 0 || image.height === 0) {
    return Promise.resolve('');
  }

  return new Promise((resolve, reject) => {
    const child = execFile(
      'tesseract',
      ['stdin', 'stdout', '--psm', String(psm), '-c', 'tessedit_create_tsv=1', ...options],
      { env: { ...process.env, OMP_THREAD_LIMIT: '1' } },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
        } else if (error.signal === 'SIGFPE') {
          resolve('');
        } else if (typeof error.code === 'string') {
          const hint = error.code === 'ENOENT' ? '; install Tesseract and put it on PATH' : '';
          reject(new Error(`could not run tesseract (${error.message})${hint}`));
        } else {
          const status = error.signal ? `killed by ${error.signal}` : `exited ${error.code}`;
          reject(new Error(`tesseract ${status}: ${stderr.trim()}`));
        }
      },
    );

    // A Tesseract that fails before reading its input closes the pipe under a PNG too big to buffer, and the EPIPE
    // would otherwise be an unhandled error that kills Node before the exit status above can say what went wrong.
    child.stdin?.on('error', () => {});
    child.stdin?.end(encodePng(image));
  });
}
