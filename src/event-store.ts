/**
 * The events the reader has not acknowledged, held where every tab can reach them: the merged feed, the one live
 * `Prefs` object, and the filters the Events page's cards view is drawing under.
 *
 * Shared because two things now read the same answer. The New mark on a card and the notification in the top bar are
 * one fact — an event this browser has not recorded seeing — and the seen set under `pogo-utils:events:seen` is the
 * only record of it. With one `Prefs` object between them, clearing either is clearing both, and the count in the top
 * bar is `newlyVisible` over the same events and filters as the cards view's own header rather than a second reckoning
 * of it.
 *
 * Worked out once when the document loads, from the same two files the Events page reads. Nothing here is on a timer:
 * the Events page keeps its own ten-minute refetch, and that refetch lands here too.
 */

import { useEffect, useState } from 'preact/hooks';

import { LOCAL_EVENTS, VENDED_EVENTS } from './event-feed.js';
import { hiddenFor, loadPrefs, persist, RECURRING, type KEYS, type Prefs } from './event-prefs.js';
import { mergeEvents, statusOf, type ParsedEvent } from './event-schedule.js';
import { said } from './errors.js';

import type { FeedEvent } from './types.js';

/** The three reveals at the foot of the Events page's filter panel, which are a session's rather than saved. */
export interface Reveals {
  showPast: boolean;
  showUndated: boolean;
  showHidden: boolean;
}

export const NOTHING_REVEALED: Readonly<Reveals> = { showPast: false, showUndated: false, showHidden: false };

/**
 * What the cards view is drawing under beyond the saved type filters: the reveals, the search term and the minute it
 * last read the clock. The Events page publishes its own while it is open; every other tab has none of the three, and
 * reads as nothing revealed, nothing typed and the time it asks.
 */
export interface CardsFilter {
  reveals: Reveals;
  search: string;
  now: Date;
}

/**
 * Whether the event has turned up since the reader last acknowledged what was on the page. The feed carries no
 * published date, so "new" can only mean "an ID this browser has not recorded seeing".
 *
 * A recurring type is never new. Each occurrence carries its own dated ID — `pokemonspotlighthour2026-09-24` — so a
 * weekly Spotlight Hour arrives unrecognised every week and would mark itself for ever, reporting nothing. Hence
 * `settleSeen` storing none of them either.
 *
 * Nothing is new before the first feed has settled the seen set, so a slow fetch cannot flash badges over every card.
 */
export function isNew(prefs: Prefs, ev: ParsedEvent) {
  return prefs.seen !== null && !RECURRING.has(ev.heading) && !prefs.seen.has(ev.eventID);
}

/**
 * Whether an event survives the type-filter, dismissal and search-term filters — the ones meaning "I do not want to
 * see this", so every view honours them. "Show hidden" reveals a dismissal the way "Show ended" reveals a past event: a
 * temporary reveal rather than a change to what was saved. The status reveals are `isRevealed`'s.
 */
export function admits(
  ev: ParsedEvent,
  prefs: Prefs,
  hidden: ReadonlySet<string>,
  { reveals, search }: Pick<CardsFilter, 'reveals' | 'search'>,
) {
  if (hidden.has(ev.heading)) {
    return false;
  }

  if (prefs.dismissed.has(ev.eventID) && !reveals.showHidden) {
    return false;
  }

  const term = search.trim().toLowerCase();

  return !term || ev.name.toLowerCase().includes(term);
}

/**
 * Whether the reader has revealed the status bucket this event falls in. The two opt-in buckets are an event that is
 * over and one the feed gave no date for, neither being something to plan around.
 *
 * Shared with `newlyVisible` so the new count can only be a subset of the total beside it: a header reporting more new
 * events than events contradicts itself, as does any count at all above "No events to show".
 */
export function isRevealed(ev: ParsedEvent, { reveals, now }: Pick<CardsFilter, 'reveals' | 'now'>) {
  const kind = statusOf(ev, now).kind;

  return (kind !== 'ended' || reveals.showPast) && (kind !== 'tbd' || reveals.showUndated);
}

/**
 * The events the reader is being told are new: unacknowledged, and among those the ones the cards view would draw.
 * Always the cards view's type filters, whichever view is open, because that is the view whose own total sits beside
 * the count and the one whose marks **Mark all as seen** clears — the calendar paints one month and the tracks only the
 * types with a row, so neither could be matched exactly.
 */
export function newlyVisible(events: readonly ParsedEvent[], prefs: Prefs, filter: CardsFilter) {
  const hidden = hiddenFor(prefs, 'cards');

  return events.filter((ev) => isNew(prefs, ev) && admits(ev, prefs, hidden, filter) && isRevealed(ev, filter));
}

/**
 * Settle the seen set against the feed, once per fetch.
 *
 * A first visit seeds it with everything on offer rather than marking all of it new, the mark being the difference from
 * what you last looked at. IDs the feed has dropped are forgotten, which cannot resurrect a mark because every
 * occurrence carries its own dated ID.
 *
 * The recurring types are left out of both halves, `isNew` never marking one: they are a fifth of the feed, so storing
 * them would turn a fifth of the set over every week to answer a question nothing asks. Leaving them out of `ids` is
 * also what drops the ones already stored, the prune keeping only what `ids` holds.
 *
 * Both halves are skipped when the feed gave us nothing: seeding from an empty feed would mark the whole of the next
 * good one new, and pruning against it would forget every ID the reader had acknowledged.
 */
export function settleSeen(prefs: Prefs, settled: readonly ParsedEvent[]) {
  if (settled.length === 0) {
    return;
  }

  const ids = new Set(settled.filter((ev) => !RECURRING.has(ev.heading)).map((ev) => ev.eventID));

  prefs.seen = prefs.seen === null ? ids : new Set([...prefs.seen].filter((id) => ids.has(id)));
  persist(prefs, 'seen');
}

/**
 * One feed, checked to be a list. `Array.isArray` narrows no further than `any[]`, so the element type is a claim
 * rather than something the throw enforces. What makes it a safe one is `normalise`: every field is either handed to
 * `parseDate`, which answers null for anything that is not a date, handed to `webLink`, which answers undefined for
 * anything that is not a web URL, or rendered as text — so a feed that changed shape draws `undefined` rather than
 * doing something with it.
 */
export async function fetchEvents(url: string): Promise<readonly FeedEvent[]> {
  const res = await fetch(url, { cache: 'default' });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  const raw: unknown = await res.json();

  if (!Array.isArray(raw)) {
    throw new Error('not a list of events');
  }

  return raw;
}

/**
 * The feed, the preferences and the cards view's filters, and who to tell when any of them moves.
 *
 * A class rather than module state so a test can start from nothing; the document has the one instance below.
 */
export class EventStore {
  /**
   * The feed entries, merged and sorted by start. Empty until a load finds either file; a later load that finds neither
   * leaves the last ones in place.
   */
  events: readonly ParsedEvent[] = [];

  /** True from the start, since the shell asks for the feed as the document loads, until that load is over. */
  loading = true;

  /** Why the last load found nothing, or null when it found at least one of the two files. */
  failed: string | null = null;

  /** How many loads have landed, which is what the cards' entry animation is keyed by. */
  generation = 0;

  /**
   * How many imports have written over storage this document. The import lives in the top bar's settings rather than
   * on the Events page, so this is how that page learns one has landed and drops the session reveals it holds itself.
   */
  restores = 0;

  readonly #fetchList: (url: string) => Promise<readonly FeedEvent[]>;
  readonly #listeners = new Set<() => void>();
  #prefs: Prefs | null = null;
  #filter: CardsFilter | null = null;
  #inflight: Promise<void> | null = null;

  constructor(fetchList = fetchEvents) {
    this.#fetchList = fetchList;
  }

  /**
   * The one live `Prefs` object, read from storage the first time anything asks. One object rather than a copy per
   * reader, because the Events page and the top bar both write through it: two copies would each persist their own
   * idea of the seen set over the other's.
   */
  get prefs(): Prefs {
    return (this.#prefs ??= loadPrefs());
  }

  /**
   * Read the preferences back from storage into the same object, rather than swapping it, so a holder of the old
   * reference sees the new values. What an import calls after writing, and what the Events page calls as it opens and
   * closes: it unhides a type in memory to land a `?event=` link, deliberately without saving it, and that must not
   * outlive the page into the count every other tab shows.
   */
  reloadPrefs(): Prefs {
    return Object.assign(this.prefs, loadPrefs());
  }

  /** What the cards view is drawing under: the Events page's own while it is open, nothing revealed otherwise. */
  get filter(): CardsFilter {
    return this.#filter ?? { reveals: NOTHING_REVEALED, search: '', now: new Date() };
  }

  /** The Events page's filters while it is open, and null as it closes, which puts every other tab back on none. */
  publish(filter: CardsFilter | null) {
    this.#filter = filter;
    this.emit();
  }

  /** The events every tab reports as new, which is the same list the Events page marks. */
  newlyVisible() {
    return newlyVisible(this.events, this.prefs, this.filter);
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Tell everyone reading the store that it has changed. Every writer below calls it, and so does a page that has
   * written to `prefs` directly.
   */
  emit() {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /**
   * Write one preference back and tell every reader. Named rather than keyed so a call site cannot pair a key with the
   * wrong value.
   */
  commit(name: keyof typeof KEYS) {
    persist(this.prefs, name);
    this.emit();
  }

  /**
   * Record these events as seen, in one write. Asked only for events `isNew` admitted — which it cannot do before
   * `settleSeen` has filled the set, a null one being the first of its three conditions. So the optional call is that
   * null being unreachable rather than tolerated.
   */
  acknowledge(events: Iterable<Pick<ParsedEvent, 'eventID'>>) {
    for (const ev of events) {
      this.prefs.seen?.add(ev.eventID);
    }

    this.commit('seen');
  }

  /**
   * Re-read the preferences an import has just written and settle them against the feed, as one change: `settleSeen`
   * reads an absent `seen` as a first visit, and a file that left it out must not mark every event new.
   */
  restored() {
    this.reloadPrefs();
    this.restores += 1;
    this.settle();
  }

  /** Settle the seen set against the events already loaded, for a Reset or an import that has just emptied it. */
  settle() {
    settleSeen(this.prefs, this.events);
    this.emit();
  }

  /**
   * Fetch both files and merge them, tolerating either failing: a dead feed still shows the repo events, and a missing
   * local file still shows the feed. A load already in flight is the one handed back, so the shell and the Events page
   * opening together fetch once.
   */
  load(): Promise<void> {
    this.#inflight ??= this.#fetch().finally(() => {
      this.#inflight = null;
    });

    return this.#inflight;
  }

  /** The feed once per document: a load in flight or already landed answers, and only a failed one is tried again. */
  ensureLoaded(): Promise<void> {
    return this.#inflight ?? (this.generation > 0 ? Promise.resolve() : this.load());
  }

  async #fetch() {
    this.loading = true;
    this.emit();

    const [feed, local] = await Promise.allSettled([this.#fetchList(VENDED_EVENTS), this.#fetchList(LOCAL_EVENTS)]);

    this.loading = false;

    /*
     * The events already loaded are kept rather than emptied. Every tab's notifications read them, so a refetch that
     * fails — offline, say — would otherwise drop each tab's count to nothing, which reads as "nothing new" rather
     * than as a failure. The Events page says the load failed and draws none of them meanwhile.
     */
    if (feed.status === 'rejected' && local.status === 'rejected') {
      this.failed = said(feed.reason);
      this.emit();
      return;
    }

    // Local last, so a repo entry overrides a feed event of the same ID rather than duplicating it. `mergeEvents`
    // parses the dates and sorts by start as well.
    const merged = mergeEvents(
      feed.status === 'fulfilled' ? feed.value : [],
      local.status === 'fulfilled' ? local.value : [],
    );

    settleSeen(this.prefs, merged);
    this.events = merged;
    this.failed = null;
    this.generation += 1;
    this.emit();
  }
}

/** The document's store, which the shell's top bar and the Events page share. */
export const eventStore = new EventStore();

/** The store, with the calling component redrawn whenever it changes. */
export function useEventStore() {
  const [, redraw] = useState(0);

  useEffect(() => eventStore.subscribe(() => redraw((count) => count + 1)), []);

  return eventStore;
}
