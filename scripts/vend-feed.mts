/**
 * Copies Leek Duck's event list into `data/events-feed.json`, from ScrapedDuck's JSON mirror of it.
 *
 * The Events page and `scripts/build-ics.mts` both read that committed copy rather than the mirror, so the page and the
 * calendar are always the same fetch. It is also the feed's only history: ScrapedDuck's `data` branch is a single
 * commit, force-pushed on every scrape.
 *
 * This is the one script that touches the network, which is why it is not a step of `pnpm build` — `pnpm lint:types`
 * *is* `pnpm build`, so folding it in would put somebody else's server in front of every lint. The Vend workflow runs
 * it hourly instead and commits the result when it differs.
 *
 * Nothing here reads the clock, so an unchanged file after a run means the feed has not moved. `vendable()` in
 * `src/event-feed.ts` is what makes that true of a list re-scraped every ten minutes, and what refuses an empty or
 * unkeyed one; this file is the fetch and the write around it.
 */

import { UPSTREAM_URL, vendable, VENDED_EVENTS } from '../src/event-feed.ts';
import { writeFileSync } from 'node:fs';

const res = await fetch(UPSTREAM_URL);

if (!res.ok) {
  throw new Error(`${UPSTREAM_URL}: ${res.status} ${res.statusText}`);
}

const events = vendable(await res.json());

// Two-space and newline-terminated because `prettier --check .` reads this file like any other, `data/` being no part
// of `.prettierignore`. Written by hand rather than left to a formatter run so that the workflow commits what it
// generated.
writeFileSync(VENDED_EVENTS, `${JSON.stringify(events, null, 2)}\n`);
console.log(`${VENDED_EVENTS}: ${events.length} events`);
