/**
 * What the Inventory page reads a screenshot with: the WebAssembly Tesseract, the vended game master and the form
 * icons, each fetched the first time a screen is read and held for every read after. The reading itself is
 * `readScreen`, the very function `pnpm inventory parse` prints, so the two cannot answer differently for any reason
 * but the engine.
 *
 * **Nothing read leaves the page.** What is fetched is the model, the game master and the icons, none of which carries
 * anything about the screen; the screenshot and what it reads as stay in memory here, and leave only as a download.
 */

import { GAME_MASTER, TESSERACT_VENDOR } from '../generated.js';
import { ICON_BASE } from '../pokedex/icons.js';
import { signatureOfIcon, signaturesFor, type Signature } from '../tools/inventory/artwork.mts';
import { type Form, type GameData } from '../tools/inventory/game-master.mts';
import { useEngine } from '../tools/inventory/ocr.mts';
import { MODEL, tesseractWasm } from '../tools/inventory/ocr-wasm.mts';
import { decodePng, type Image } from '../tools/inventory/png.mts';
import { showProgress } from '../tools/inventory/progress.mts';
import { readScreen, type Reading } from '../tools/inventory/report.mts';

/**
 * How many workers to read with at most. Each holds its own copy of the model and its own WebAssembly heap, which on a
 * phone is the thing that runs out first, and a screen's reads are a few dozen bands rather than a queue worth eight.
 */
const MAX_WORKERS = 4;

/** Everything a read needs that is the same for every screen. */
interface Kit {
  data: GameData;
  icons: ReadonlyMap<Form, Signature>;
}

let kit: Promise<Kit> | null = null;

/**
 * Why this page cannot read a screenshot, or null where it can. The OCR model is checked against its hash before it
 * reads anything, and the hash is Web Crypto's, which a browser offers only to a secure context — `localhost` and the
 * published site, but not the LAN address `pnpm serve` prints.
 */
export function unreadable(): string | null {
  return window.isSecureContext
    ? null
    : 'Reading a screenshot needs a secure context too: open this page from localhost or the published site.';
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }

  return response;
}

/**
 * The engine installed and the tables loaded, once. A failure is not kept, so the next read tries again rather than
 * answering every later screen with the network as it was the first time.
 *
 * `onModel` hears how far the model's first download has got — 4 MB, and the one wait worth a progress bar.
 */
function prepare(onModel: (fraction: number) => void): Promise<Kit> {
  kit ??= (async () => {
    // The CLI narrates the icons it is about to read, which a page has no terminal for.
    showProgress(false);

    useEngine(
      tesseractWasm({
        langPath: MODEL,
        workers: Math.min(navigator.hardwareConcurrency || 1, MAX_WORKERS),
        workerPath: TESSERACT_VENDOR + 'worker.min.js',
        corePath: TESSERACT_VENDOR,
        cache: true,
        progress: onModel,
      }),
    );

    const data = (await (await fetchOk(GAME_MASTER)).json()) as GameData;
    const icons = await signaturesFor(data, async (form) =>
      signatureOfIcon(decodePng(new Uint8Array(await (await fetchOk(ICON_BASE + form.icon)).arrayBuffer()))),
    );

    return { data, icons };
  })();

  kit.catch(() => {
    kit = null;
  });

  return kit;
}

/** Every reader over one screenshot, as `parse` would read it. */
export async function read(image: Image, onModel: (fraction: number) => void): Promise<Reading> {
  const { data, icons } = await prepare(onModel);

  return readScreen(image, data, icons);
}
