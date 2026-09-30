/**
 * Reads text off a screenshot with the Tesseract CLI, which has to be installed separately (`brew install tesseract`,
 * `apt install tesseract-ocr`). Pokémon GO is drawn by Unity, so there is no view hierarchy to ask: `uiautomator dump`
 * sees one opaque surface, and the pixels are all there is.
 *
 * Everything downstream works from where text sits rather than from fixed coordinates. The game lays itself out
 * differently on every aspect ratio, and "the line above the HP" holds on all of them where "y = 1180" holds on one.
 */

import { encodePng, type Image } from './png.mts';
import { spawn } from 'node:child_process';

/** One line of text as Tesseract grouped it, in the screenshot's own pixels. */
export interface Line {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Lines of text in an image. `offset` moves the boxes back into the coordinates of the screenshot a crop came from, so
 * a caller can OCR a region and still tap what it found.
 *
 * Page segmentation mode 11, "sparse text", because a game screen is labels scattered over artwork rather than a page
 * of paragraphs, and the default mode drops a lone number like a CP rather than guessing at a column around it.
 */
export async function ocr(image: Image, offset = { x: 0, y: 0 }): Promise<Line[]> {
  return group(await run('tesseract', ['stdin', 'stdout', '--psm', '11', 'tsv'], encodePng(image)), offset);
}

/**
 * One line of text from an image cropped down to hold nothing else. Page segmentation mode 7 tells Tesseract the whole
 * image is that one line, which is the opposite of the sparse mode above and the right answer whenever a caller has
 * already narrowed the picture to something it knows the shape of. The difference is not small: a band of a screen
 * holding `L1 IV48 5/2/15` over a bright background reads as `r '` sparse and as `L1 1V48 5/2/15` as a line, because
 * sparse mode takes the blocks either side of it for pictures rather than for the margins they are.
 *
 * `whitelist` narrows the alphabet to the characters the line can contain, which is what stops a stray glyph splitting
 * a number in two. The box comes back as well as the text, so a caller sweeping for something can also say where it
 * found it.
 */
export async function ocrLine(image: Image, whitelist?: string): Promise<Line | null> {
  const options = whitelist === undefined ? [] : ['-c', `tessedit_char_whitelist=${whitelist}`];
  const tsv = await run('tesseract', ['stdin', 'stdout', '--psm', '7', ...options, 'tsv'], encodePng(image));
  const [line] = group(tsv, { x: 0, y: 0 });

  return line ?? null;
}

/** Lowercase with accents and punctuation gone, so `POKéMON`, `Pokémon` and `pokemon` compare equal. */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The first line whose folded text matches, top to bottom. */
export function findLine(lines: readonly Line[], pattern: RegExp): Line | undefined {
  return lines.find((line) => pattern.test(fold(line.text)));
}

export function centre(line: Line): [number, number] {
  return [line.left + line.width / 2, line.top + line.height / 2];
}

/** Tesseract's TSV rows grouped into lines, in the coordinates of whatever the crop came from. */
function group(tsv: string, offset: { x: number; y: number }): Line[] {
  const lines = new Map<string, { words: string[]; left: number; top: number; right: number; bottom: number }>();

  for (const row of tsv.split('\n').slice(1)) {
    const cells = row.split('\t');
    const text = cells[11]?.trim();

    if (cells[0] !== '5' || !text) {
      continue;
    }

    const [left, top, width, height] = cells.slice(6, 10).map(Number) as [number, number, number, number];
    const key = cells.slice(1, 5).join('.');
    const line = lines.get(key);

    if (line) {
      line.words.push(text);
      line.left = Math.min(line.left, left);
      line.top = Math.min(line.top, top);
      line.right = Math.max(line.right, left + width);
      line.bottom = Math.max(line.bottom, top + height);
    } else {
      lines.set(key, { words: [text], left, top, right: left + width, bottom: top + height });
    }
  }

  return [...lines.values()]
    .map((l) => ({
      text: l.words.join(' '),
      left: l.left + offset.x,
      top: l.top + offset.y,
      width: l.right - l.left,
      height: l.bottom - l.top,
    }))
    .sort((a, b) => a.top - b.top || a.left - b.left);
}

function run(command: string, args: string[], input: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => err.push(b));
    child.on('error', (e) =>
      reject(new Error(`could not run ${command} (${e.message}); install Tesseract and put it on PATH`)),
    );
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(out).toString('utf8'))
        : reject(new Error(`${command} exited ${code}: ${Buffer.concat(err).toString('utf8').trim()}`)),
    );
    child.stdin.end(input);
  });
}
