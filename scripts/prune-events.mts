/**
 * Drops the events in `data/events.json` that are over everywhere, and every `<pgr:event>` naming one. The two go
 * together because `scripts/validate-gpx.mts` refuses a `<pgr:event>` whose ID the file no longer has; the entry itself
 * stays, as a place that stands on its own.
 *
 * Which events those are is `prunable`'s to say rather than this file's, because the answer turns on how the two lists
 * merge: an entry the vended feed also carries is left where it is however long over it is, that being an override
 * rather than the only copy.
 *
 * References are read through `eventRefs` and cut through `cutElements`, which is the whole of why this agrees with the
 * validator about what a reference is: a form the two read differently is an event removed here that is then refused
 * there, and `pnpm build` runs the validator. The Prune workflow re-runs `pnpm lint:xml` over what this wrote before it
 * commits, so a disagreement fails that run rather than every deploy after it.
 *
 * Unlike the vend this reads the clock, so it is not a step of `pnpm build` either: a build would then depend on when
 * it ran. The workflow runs it daily and commits the result when it differs.
 */

import { LOCAL_EVENTS, prunable, VENDED_EVENTS } from '../src/event-feed.ts';
import { cutElements, eventRefs, gpxSources, parseGpx } from '../src/gpx-source.mts';
import type { FeedEvent } from '../src/types.js';
import { readFileSync, writeFileSync } from 'node:fs';

const events: FeedEvent[] = JSON.parse(readFileSync(LOCAL_EVENTS, 'utf8'));
const vended: FeedEvent[] = JSON.parse(readFileSync(VENDED_EVENTS, 'utf8'));

const gone = prunable(events, vended, new Date());

if (gone.size === 0) {
  console.log(`${LOCAL_EVENTS}: nothing has ended that removing would remove`);
  process.exit(0);
}

const kept = events.filter((event) => !gone.has(event.eventID));

// Written the way `scripts/vend-feed.mts` writes its copy, for the same reason: it is already what `prettier` would.
writeFileSync(LOCAL_EVENTS, `${JSON.stringify(kept, null, 2)}\n`);
console.log(`${LOCAL_EVENTS}: removed ${[...gone].join(', ')}`);

for (const { fileName, contents } of gpxSources()) {
  const cut = eventRefs(parseGpx(contents))
    .filter(({ eventID }) => gone.has(eventID))
    .map(({ element }) => element);

  if (cut.length === 0) {
    continue;
  }

  writeFileSync(fileName, cutElements(contents, cut));
  console.log(`${fileName}: removed ${cut.length} <pgr:event> naming an event that has ended`);
}
