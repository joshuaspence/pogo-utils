/**
 * The Tesseract a test of the readers runs under: the CLI, unless `INVENTORY_OCR=wasm` asks for the WebAssembly build
 * the Inventory page reads with. The corpus is the same corpus either way, so running it both ways is what holds the
 * page to the CLI's answers — a reading that moves under one engine fails the same row it would under the other.
 *
 * The WebAssembly build is handed the CLI's own model rather than a download, so a test reaches no network, and the
 * model is checked against the one the page fetches first: the two engines are comparable only where they hold the
 * same file.
 */

import { tesseractCli } from './ocr-cli.mts';
import { useEngine } from './ocr.mts';
import { MODEL_SHA256, tesseractWasm } from './ocr-wasm.mts';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

/** Where the CLI keeps its models, as it says itself, which follows `TESSDATA_PREFIX` the way a read would. */
function tessdata(): string {
  const listing = execFileSync('tesseract', ['--list-langs'], { encoding: 'utf8' });
  const dir = /"([^"]+)"/.exec(listing)?.[1];

  if (dir === undefined) {
    throw new Error(`could not find the Tesseract models in: ${listing}`);
  }

  return dir;
}

/** Installs the engine the environment asks for, and answers what to call once the file's reads are done. */
export function useTestEngine(): () => Promise<void> {
  if (process.env['INVENTORY_OCR'] !== 'wasm') {
    useEngine(tesseractCli);

    return () => Promise.resolve();
  }

  const langPath = tessdata();
  const model = join(langPath, 'eng.traineddata');
  const sha = createHash('sha256').update(readFileSync(model)).digest('hex');

  if (sha !== MODEL_SHA256) {
    throw new Error(
      `${model} is not tessdata_fast 4.1.0's (sha256 ${sha}), so it is not the model the page reads with`,
    );
  }

  const engine = tesseractWasm({ langPath, workers: availableParallelism(), cache: false });
  useEngine(engine);

  return () => engine.terminate();
}
