/**
 * Drops the events in `data/events.json` that are over everywhere, and every `<pgr:event>` naming one. The two go
 * together because `scripts/validate-gpx.mts` rejects a `<pgr:event>` whose ID the file no longer has; the entry
 * itself stays, as a place that stands on its own.
 *
 * Unlike the vend this reads the clock, so it is not a step of `pnpm build` either: a build would then depend on when
 * it ran. The Prune workflow runs it daily and commits the result when it differs.
 */

import { ended, LOCAL_EVENTS } from '../src/event-feed.ts';
import type { FeedEvent } from '../src/types.js';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const now = new Date();
const events: FeedEvent[] = JSON.parse(readFileSync(LOCAL_EVENTS, 'utf8'));
const gone = new Set(events.filter((event) => ended(event, now)).map((event) => event.eventID));

if (gone.size === 0) {
  console.log(`${LOCAL_EVENTS}: nothing has ended`);
  process.exit(0);
}

const kept = events.filter((event) => !gone.has(event.eventID));

// Written the way `scripts/vend-feed.mts` writes its copy, for the same reason: it is already what `prettier` would.
writeFileSync(LOCAL_EVENTS, `${JSON.stringify(kept, null, 2)}\n`);
console.log(`${LOCAL_EVENTS}: removed ${[...gone].join(', ')}`);

const files = execFileSync('git', ['ls-files', '-z', '*.gpx'], { encoding: 'utf8' }).split('\0').filter(Boolean);

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/^[ \t]*<pgr:event>([^<]*)<\/pgr:event>\n/gm, (line, id) => (gone.has(id) ? '' : line));

  if (after !== before) {
    writeFileSync(file, after);
    console.log(`${file}: removed its <pgr:event> for an ended event`);
  }
}
