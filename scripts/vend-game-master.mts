/**
 * Writes `scripts/inventory/fixtures/game-master.json`, the game master `screens.test.mts` reads the forms, moves, type
 * names and CP multipliers out of.
 *
 * It exists because a test of a reader must not reach the network, and the two files upstream are 23 MB for the 0.85 MB
 * of them anything here consults — the same division the hue signatures in that file already have, where a scan
 * downloads an icon and the test records what it read off one. `loadGameData` caches for a week, so even a committed
 * cache would have the suite fetching again every eighth day.
 *
 * Nothing here reads the clock, so the output is a pure function of those two files and `git diff --quiet` after a run
 * answers exactly "has the game master moved?". A field naming the day it was vended would cost that and buy nothing
 * the commit does not already say.
 *
 * The whole of what `loadGameData` answers is written, unpruned. Dropping the per-form move pools would take it from
 * 0.85 MB to 0.35 MB and is the one cut worth naming and refusing: it is what the swap from a hand-written table was
 * measured against, and `parseMoves` is the one reader this corpus cannot yet assert, so the pools are what a capture
 * of a scrolled screen would need the day one is committed.
 *
 * Re-vending is a reviewed commit rather than a refresh: the counts the test pins will move when upstream releases a
 * species, and a form arriving that shares a dex, types and stamina with one of the 64 captures really does change what
 * `identify` answers. That is the pipeline reporting rather than the suite breaking, and the diff is where you see it.
 */

import { CACHE, loadGameData } from './inventory/game-master.mts';
import { writeFileSync } from 'node:fs';
import prettier from 'prettier';

const OUTPUT = 'scripts/inventory/fixtures/game-master.json';

const data = await loadGameData(CACHE, process.argv.includes('--refresh'));

// Formatted here rather than by a `prettier --write` chained after this in `package.json`, so that running the script
// on its own cannot leave the tree failing `lint:prettier` — and through Prettier's own config resolution rather than a
// width written down twice, which is also what keeps the 30,000-line diff of a re-vend readable.
const options = await prettier.resolveConfig(OUTPUT);

writeFileSync(OUTPUT, await prettier.format(JSON.stringify(data), { ...options, filepath: OUTPUT }));

console.error(
  `${OUTPUT}: ${data.forms.length} forms over ${data.species.length} species, ${data.moves.length} moves, ` +
    `${data.types.length} types, ${data.cpm.length} levels`,
);
