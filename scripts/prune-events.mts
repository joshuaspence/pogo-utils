/**
 * Drops the events in `data/events.json` that are over everywhere, and every `<pgr:event>` naming one. The two go
 * together because `scripts/validate-gpx.mts` refuses a `<pgr:event>` whose ID the file no longer has; the entry
 * itself stays, as a place that stands on its own.
 *
 * Which events those are is `prunable`'s to say, the answer turning on how the two lists merge: an entry the vended
 * feed also carries is left where it is, that being an override rather than the only copy.
 *
 * References are read through `eventRefs` and cut through `cutElements`, which is why this agrees with the validator
 * about what a reference is — a form the two read differently is an event removed here and then refused there. The
 * Prune workflow re-runs `pnpm lint:xml` over what this wrote before it commits.
 *
 * Unlike the vend this reads the clock, so it is no step of `pnpm build`, which would then depend on when it ran.
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

/**
 * Every GPX edit computed before anything is written, which is what makes the run all-or-nothing. The two writes have
 * to agree — `validate-gpx.mts` refuses a reference whose event is gone — so writing `data/events.json` first and then
 * throwing in here left exactly the tree the build rejects, under a log line that said `removed …` as though it had
 * worked. CI discarded that, the failed step running before the commit; whoever ran `pnpm prune:events` by hand, which
 * the README documents, was left holding it.
 */
const edits = gpxSources().flatMap(({ fileName, contents }) => {
  const cut = eventRefs(parseGpx(contents))
    .filter(({ eventID }) => gone.has(eventID))
    .map(({ element }) => element);

  return cut.length === 0 ? [] : [{ cut: cut.length, fileName, pruned: cutElements(contents, cut) }];
});

// Written the way `scripts/vend-feed.mts` writes its copy, for the same reason: it is already what `prettier` would.
writeFileSync(LOCAL_EVENTS, `${JSON.stringify(kept, null, 2)}\n`);
console.log(`${LOCAL_EVENTS}: removed ${[...gone].join(', ')}`);

for (const { cut, fileName, pruned } of edits) {
  writeFileSync(fileName, pruned);
  console.log(`${fileName}: removed ${cut} <pgr:event> naming an event that has ended`);
}
