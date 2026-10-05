/**
 * Writes `src/tools/inventory/fixtures/game-master.json`, the game master `game-master.test.mts` reads the forms, moves,
 * type names and CP multipliers out of.
 *
 * It exists because a test of a reader must not reach the network, and the two files upstream are 23 MB for the 0.85 MB
 * of them anything here consults. `loadGameData` caches for a week, so even a committed cache would have the suite
 * fetching again every eighth day.
 *
 * Nothing here reads the clock, so the output is a pure function of the three things `loadGameData` downloads — the
 * game master, the string table and the icon index — and `git diff --quiet` after a run answers exactly "has the game
 * master moved?". That holds only if all three are upstream's as of now, so they go into an empty directory rather
 * than `CACHE`: every one is downloaded on the spot, and a download that fails throws for want of an older copy to fall
 * back on. A field naming the day it was vended would cost that and buy nothing the commit does not already say.
 *
 * The whole of what `loadGameData` answers is written, unpruned. Dropping the per-form move pools would take it from
 * 0.85 MB to 0.35 MB and is the one cut worth naming and refusing: a move read off the screen is matched against its
 * form's pool, so the pools are what a test of reading one needs.
 *
 * Re-vending is a reviewed commit rather than a refresh: the counts the test pins will move when upstream releases a
 * species, and a form arriving that shares a dex, types and stamina with one already here really does change which
 * forms an HP can tell apart. That is the pipeline reporting rather than the suite breaking, and the diff is where you
 * see it.
 */

import { loadGameData } from '../src/tools/inventory/game-master.mts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import prettier from 'prettier';

const OUTPUT = 'src/tools/inventory/fixtures/game-master.json';

const dir = mkdtempSync(join(tmpdir(), 'game-master-'));
const data = await loadGameData(dir).finally(() => rmSync(dir, { recursive: true }));

// `loadGameData` does without the icon index rather than failing when it cannot be read, which is right for a scan and
// would vend every form's `icon` as null here.
if (data.forms.every((form) => form.icon === null)) {
  throw new Error('the icon index could not be read, so no form has an icon');
}

// Formatted here rather than by a `prettier --write` chained after this in `package.json`, so that running the script
// on its own cannot leave the tree failing `lint:prettier` — and through Prettier's own config resolution rather than a
// width written down twice, which is also what keeps the 30,000-line diff of a re-vend readable.
const options = await prettier.resolveConfig(OUTPUT);

writeFileSync(OUTPUT, await prettier.format(JSON.stringify(data), { ...options, filepath: OUTPUT }));

console.error(
  `${OUTPUT}: ${data.forms.length} forms over ${data.species.length} species, ${data.moves.length} moves, ` +
    `${data.types.length} types, ${data.cpm.length} levels`,
);
