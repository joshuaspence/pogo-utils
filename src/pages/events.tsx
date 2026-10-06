/**
 * The events calendar page. Loads Leek Duck's event list from `data/events-feed.json` — the copy of ScrapedDuck's JSON
 * mirror that `scripts/vend-feed.mts` refreshes hourly — and renders current, upcoming and — on request — recently
 * ended or undated Pokémon GO events. Reading this site's own copy rather than the mirror is what keeps the page and
 * the subscribable calendar feed built from one fetch. A card's `image` is still a `cdn.leekduck.com` URL, the feed
 * carrying it as one, so this moves where the event data comes from rather than everything a visit fetches.
 *
 * Alongside the feed it loads `data/events.json`, a repo-defined list in the same shape, and merges the two: an entry
 * there whose `eventID` matches a feed event overrides it, otherwise it adds one the feed does not carry (an official
 * event Leek Duck has not listed yet, say). Either source failing still renders the other. A third,
 * `data/entries-by-event.json`, says which events have routes here, so a card can link through to them on the map.
 *
 * Three views over the same data: a card list grouped by status, a month grid where every event is a bar spanning the
 * days it covers within each week, and a Tracks timeline laying events out as horizontal bars in fixed category rows (a
 * Gantt chart). The view toggle switches between them; the search box, type filters and dismissals apply to all three.
 */

import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { LOCAL_EVENTS, routeSummary, VENDED_EVENTS } from '../event-feed.js';
import {
  DEFAULT_HIDDEN,
  hiddenFor,
  KEYS,
  loadPrefs,
  persist as persistPref,
  RECURRING,
  type Prefs,
} from '../event-prefs.js';
import {
  addDays,
  DAY_MS,
  mergeEvents,
  overlaps,
  packLanes,
  relativeUnit,
  startOfDay,
  statusOf,
  typeClass,
  weekColumns,
  windowOf,
  type ParsedEvent,
  type StatusKind,
  type TrackItem,
} from '../event-schedule.js';
import { said } from '../errors.js';
import { ENTRIES_BY_EVENT } from '../generated.js';
import { toHash } from '../router.js';

import type { FeedEvent, RouteIndex } from '../types.js';

/** Which of the three views is showing. A page concept, so it stays here rather than beside the schedule. */
type View = 'cards' | 'calendar' | 'tracks';

/**
 * How often to recompute the "starts in…/ends in…" labels against the wall clock, and — every REFETCH_EVERY ticks —
 * pull the feed again. Pages serves `data/events-feed.json` with `cache-control: max-age=600`, so the ten minutes these
 * two multiply to is the soonest a refetch can reach the network at all rather than the browser cache.
 *
 * The copy itself moves at most hourly, so this is for a tab left open all day rather than for catching an
 * announcement.
 */
const TICK_MS = 60_000;
const REFETCH_EVERY = 10;

/**
 * How near an event's start or end has to be for the card's relative label to read as urgent — the `soon` class, which
 * the stylesheet paints in the accent colour rather than the muted grey a distant date gets. A day covers the "today or
 * tonight" window a reader would actually change their plans over.
 */
const SOON_MS = DAY_MS;

/**
 * The largest per-card delay step in the grid's entry animation, in card positions. Past this the cards share the last
 * step instead of stretching the stagger further, so a bucket of sixty does not leave its tail arriving a second and a
 * half late.
 */
const STAGGER_MAX = 14;

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

// Weekday labels for the grid header, taken from a week that starts on a known Sunday (2023-01-01) so they follow the
// user's locale without hard-coding English. The grid itself is Sunday-first.
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(2023, 0, 1 + i)));

function relative(target: Date, now: Date) {
  const { value, unit } = relativeUnit(target, now);

  return relFmt.format(value, unit);
}

/**
 * The cards view's status buckets, in the order they are drawn, with the heading each carries.
 *
 * Rows in an array rather than an object keyed by kind, because the order is the point and an object says it only by
 * insertion. `Object.entries` was also the wrong reader for it: that answers a `string` key whatever the object's own
 * keys are, so `buckets[kind]` could not be one of the four, and the row carrying its own kind is what makes it one.
 */
const GROUPS: readonly { kind: StatusKind; label: string }[] = [
  { kind: 'active', label: 'Happening now' },
  { kind: 'upcoming', label: 'Upcoming' },
  { kind: 'tbd', label: 'Date unknown' },
  { kind: 'ended', label: 'Recently ended' },
];

/**
 * The Tracks view's rows, in display order. Each is keyed by the feed's `eventType` (a stable slug) rather than its
 * `heading`, so the match survives a wording change upstream. GO Battle League and GO Pass are deliberately absent: an
 * event of one of those types has no row here and so never lands on the timeline. The labels are ours where
 * they read better than the feed's — "Events" for `event`, "Spotlight Hour" for `pokemon-spotlight-hour`.
 */
const TRACKS = [
  { type: 'choose-your-path', label: 'Choose Your Path' },
  { type: 'community-day', label: 'Community Day' },
  { type: 'event', label: 'Events' },
  { type: 'max-battles', label: 'Max Battles' },
  { type: 'max-mondays', label: 'Max Mondays' },
  { type: 'raid-battles', label: 'Raid Battles' },
  { type: 'raid-day', label: 'Raid Day' },
  { type: 'raid-hour', label: 'Raid Hour' },
  { type: 'regional-event', label: 'Regional Event' },
  { type: 'research', label: 'Research' },
  { type: 'season', label: 'Season' },
  { type: 'pokemon-spotlight-hour', label: 'Spotlight Hour' },
  { type: 'wild-area', label: 'Wild Area' },
];

/**
 * The three reveals at the foot of the filter panel, each with the label it wears and whether it is only offered to the
 * cards view. A table rather than three names written out, because the imperative page had to pair each flag with the
 * chip that stood for it to avoid asking the document for one — and a chip rendered from this needs no such pairing.
 *
 * Both bucket reveals only mean anything for the cards: the calendar and tracks views show a fixed window regardless,
 * and neither can draw a dateless event in the first place — windowOf() gives it no window to place.
 */
const REVEALS = [
  { name: 'showPast', label: 'Show ended', cardsOnly: true },
  { name: 'showUndated', label: 'Show undated', cardsOnly: true },
  { name: 'showHidden', label: 'Show hidden', cardsOnly: false },
] as const;

type Reveals = Record<(typeof REVEALS)[number]['name'], boolean>;

const NOTHING_REVEALED: Reveals = { showPast: false, showUndated: false, showHidden: false };

// Tracks view geometry. TRACK_DAY_PX is the single source for a day column's width: the bars are positioned in pixels
// from it, and the same value is handed to CSS as the --track-day custom property for the gridline background, so the two
// cannot drift. The timeline runs from a couple of days before today to the latest event end, clamped to a sane span.
const TRACK_DAY_PX = 40;
const TRACK_BAR_H = 22;
const TRACK_LANE_GAP = 4;
const TRACK_LABEL_PX = 132;
const TRACK_LEAD_DAYS = 2;
const TRACK_MIN_DAYS = 30;
const TRACK_MAX_DAYS = 120;

/**
 * A card's picture, which takes itself off the card when it fails to load rather than leaving the browser's broken-image
 * glyph in the corner of it. Its own component so the failure is state rather than a node removing itself from a tree the
 * reconciler believes it still owns.
 */
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  return failed ? null : <img class="thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/**
 * The absolute dates as a line of prose — a range, an open start, an open end, or that there are none.
 *
 * Four branches for four cases rather than three and a fallthrough. The dateless case read first and the end-only one
 * arrived as the default, which is a claim the reader has to reconstruct from the two guards above it; written out, the
 * checker confirms each `format` call has a date rather than taking it on trust.
 */
function timeRange(ev: ParsedEvent) {
  const local = ev.start && !ev.startHasZone ? ' (your local time)' : '';

  if (ev.start && ev.end) {
    return `${dateFmt.format(ev.start)} – ${dateFmt.format(ev.end)}${local}`;
  }

  if (ev.start) {
    return `From ${dateFmt.format(ev.start)}${local}`;
  }

  if (ev.end) {
    return `Until ${dateFmt.format(ev.end)}`;
  }

  return 'Date unknown';
}

/**
 * One feed, checked to be a list. `Response#json` answers `any`, and the `Array.isArray` below is the whole of what
 * says otherwise — it narrows no further than `any[]` and nothing at the type level reads an entry, so the element type
 * is a claim rather than something the throw enforces. What makes it a safe one is what normalise() then does with an
 * entry: every field is either handed to parseDate(), which answers null for anything that is not a date, or rendered as
 * text. So a feed that changed shape draws `undefined` rather than doing something with it.
 */
async function fetchEvents(url: string): Promise<readonly FeedEvent[]> {
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
 * The route and waypoint counts per event. Unchecked, and the return type therefore a claim about a file this
 * repository generates rather than one this function verified — `validate-gpx.mts` is what holds the file and the GPX
 * tree in step. A card tolerates a miss either way: an event the index does not name simply gets no map link.
 */
async function fetchRouteIndex(): Promise<RouteIndex> {
  const res = await fetch(ENTRIES_BY_EVENT);

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  return res.json();
}

export default function EventsPage({ query: fragment }: { query: string }) {
  /**
   * The reader's saved choices, held as the one mutable object the prefs module hands out: `hiddenFor` answers a set the
   * caller is expected to add to and delete from, and the dismissals and the seen set are read and written the same way.
   *
   * So this is a ref and a repaint rather than state. Nothing is gained by copying it on every click — the page always
   * draws from whatever it currently holds — and making it immutable would mean rewriting `event-prefs.ts` and the 259
   * lines of tests over it to port a page. `commit` is the one way it changes: persist, then ask for a repaint.
   */
  const prefs = useRef(loadPrefs()).current;

  const [, painted] = useState(0);
  const repaint = () => painted((count) => count + 1);

  /**
   * Write one preference back and redraw. Named rather than keyed so a call site cannot pair a key with the wrong value;
   * the one `prefs` this page has is the one every call means, so it is bound here rather than spelled at each of them.
   */
  const commit = (name: keyof typeof KEYS) => {
    persistPref(prefs, name);
    repaint();
  };

  /** The feed entries the page is drawing, sorted by start. */
  const [events, setEvents] = useState<readonly ParsedEvent[]>([]);

  /**
   * How many routes and waypoints each event has here, by `eventID`. Empty until the index has loaded, and it stays
   * empty if that fetch fails — see `load`, which tolerates any one of the three sources going missing.
   */
  const [routeIndex, setRouteIndex] = useState<RouteIndex>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Which fetch the events on screen came from, which is what the cards' entry animation is keyed by.
   *
   * A CSS animation runs when its element is mounted, so a new number builds a new grid and plays it while the same
   * number keeps the grid and leaves it alone — where the imperative page rebuilt every card on every render and spent a
   * flag to say which of those renders should animate. That flag is what this replaces.
   *
   * It is not quite the same rule, and the difference is worth naming: a card that newly passes a filter mounts, so it
   * fades in where the old page drew it immediately. A minute's re-render still animates nothing, which is the case the
   * flag existed for — relative labels move every sixty seconds and a twitch each time was the thing to avoid.
   */
  const [generation, setGeneration] = useState(0);

  /** Recomputed every minute, which is what keeps the relative labels honest without anything else being redrawn. */
  const [now, setNow] = useState(() => new Date());

  const [view, setView] = useState<View>('cards');
  const [search, setSearch] = useState('');

  // A session's choices rather than saved preferences; `prefs` is what survives a reload.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reveals, setReveals] = useState<Reveals>(NOTHING_REVEALED);

  /** The first-of-month the calendar view is showing, or the current month until the reader steps off it. */
  const [calMonth, setCalMonth] = useState<Date | null>(null);

  /**
   * An `?event=` the fragment named that has not been applied yet, because the feed it names an event in had not arrived.
   * Held rather than re-read so the arrival is spent once: a ten-minute re-fetch must not re-apply it over whatever the
   * reader has since typed into the search box.
   */
  const pending = useRef<string | null>(null);

  /**
   * Whether an event survives the type-filter, dismissal and search-term filters — the ones that mean "I do not want to
   * see this", so every view honours them. The status reveals are `isRevealed`'s, layered on top of this. A dismissed
   * event stays hidden unless "Show hidden" is on, which mirrors how "Show ended" reveals past events — the choice is a
   * temporary reveal, not a change to the saved dismissal.
   */
  function isVisible(ev: ParsedEvent) {
    if (hiddenFor(prefs, view).has(ev.heading)) {
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
   * over and one the feed gave no date for: neither is something a reader can plan around, and an undated event is more
   * often a gap on the way here than one genuinely waiting on a date.
   *
   * Shared with `newlyVisible` so the new count can only ever be a subset of the total the cards view writes beside it. A
   * header reporting more new events than events contradicts itself, and so does any count at all above "No events to
   * show" — which a search term matching only undated events is enough to produce.
   */
  function isRevealed(ev: ParsedEvent) {
    const kind = statusOf(ev, now).kind;

    return (kind !== 'ended' || reveals.showPast) && (kind !== 'tbd' || reveals.showUndated);
  }

  /**
   * Whether the event has turned up since the reader last acknowledged what was on the page. The feed carries no
   * published date — an entry is `eventID`, `name`, `heading`, `eventType`, `link`, `image`, `start` and `end`, and
   * nothing else — so "new" can only mean "an ID this browser has not recorded seeing", a per-reader fact anyway.
   *
   * A recurring type is never new, whoever is looking and whatever they have ticked. Each occurrence carries its own
   * dated ID — `pokemonspotlighthour2026-09-24` — so a weekly Spotlight Hour arrives unrecognised every week and would
   * mark itself for ever. Coming round on schedule is the whole of what those types do, and a mark that fires on schedule
   * reports nothing. That is why `settleSeen` stores none of them either: no question is left for the set to answer.
   *
   * Nothing is new before the first feed has settled the seen set, so a slow fetch cannot flash badges over every card.
   */
  function isNew(ev: ParsedEvent) {
    return prefs.seen !== null && !RECURRING.has(ev.heading) && !prefs.seen.has(ev.eventID);
  }

  /**
   * Acknowledge one event. The writer paired with `isNew`, and asked only for an event `isNew` has admitted — which it
   * cannot do before `settleSeen` has filled the set, since a null one is the first of its three conditions.
   *
   * So the optional call is that null being unreachable rather than tolerated. There is no branch to write for it:
   * nothing can be new when there is nothing yet to be new against, so the set this would have created has no members to
   * carry.
   */
  function recordSeen(ev: ParsedEvent) {
    prefs.seen?.add(ev.eventID);
  }

  /**
   * The events the reader is being told are new: unacknowledged, and among those their filters admit. Both filters, so
   * the count leaves out everything they have said they do not want — a dismissal, a search term, a hidden type, which
   * after `isNew` has already refused the recurring ones means the rest of DEFAULT_HIDDEN and anything they have unticked
   * since, and the ended and undated buckets they have not revealed.
   */
  const newlyVisible = () => events.filter((ev) => isNew(ev) && isVisible(ev) && isRevealed(ev));

  /**
   * Settle the seen set against the feed, once per fetch.
   *
   * A first visit seeds it with everything on offer rather than marking all of it new: forty badges say no more than none
   * do, and the point of the mark is the difference from what you last looked at, which on a first visit is nothing. IDs
   * the feed has dropped are forgotten, which cannot resurrect a mark because every occurrence carries its own dated ID —
   * `raidhour20260930`, `october-communityday2026` — so a forgotten one never comes round again.
   *
   * The recurring types are left out of both halves, because `isNew` can never mark one: they are a fifth of the feed, so
   * storing them would turn a fifth of the set over every week to answer a question nothing asks. Leaving them out of
   * `ids` is also what drops the ones already stored, since the prune keeps only what `ids` holds.
   *
   * Both halves are skipped when the feed gave us nothing, which `load` tolerates: seeding from an empty feed would mark
   * the whole of the next good one new, and pruning against it would forget every ID the reader had acknowledged.
   */
  function settleSeen(settled: readonly ParsedEvent[]) {
    if (settled.length === 0) {
      return;
    }

    const ids = new Set(settled.filter((ev) => !RECURRING.has(ev.heading)).map((ev) => ev.eventID));

    prefs.seen = prefs.seen === null ? ids : new Set([...prefs.seen].filter((id) => ids.has(id)));
    persistPref(prefs, 'seen');
  }

  /**
   * A link from the Routes page arrives as `#/events?event=<eventID>`, and lands by searching for that event's name.
   * Reusing the search box rather than scrolling to the card leaves the reader somewhere they recognise: the term is
   * visible in the box, and emptying it is how they already know to get the other 59 cards back.
   *
   * The event is always there to find — the linter rejects a `<pgr:event>` naming an ID that data/events.json does not
   * carry, so a chip cannot point at one this page has never heard of.
   */
  function applyPending(against: readonly ParsedEvent[]) {
    const id = pending.current;
    const match = id === null ? undefined : against.find((ev) => ev.eventID === id);

    if (match === undefined) {
      return;
    }

    pending.current = null;

    /**
     * Unhide its type, or a reader with that filter off would follow the link and be shown nothing at all — seven types
     * start hidden. Not persisted: this is for the one arrival, not a standing change to what they chose to see. A card
     * they dismissed individually stays dismissed, which is a decision about that event rather than a blanket rule.
     */
    hiddenFor(prefs, view).delete(match.heading);
    setSearch(match.name);
  }

  async function load() {
    setLoading(true);

    /**
     * Fetch all three sources concurrently and tolerate any failing: a dead feed still shows the repo events, a missing
     * local file still shows the feed, and a missing index costs the cards their link through to the map and nothing
     * else.
     */
    const [feed, local, index] = await Promise.allSettled([
      fetchEvents(VENDED_EVENTS),
      fetchEvents(LOCAL_EVENTS),
      fetchRouteIndex(),
    ]);

    setRouteIndex(index.status === 'fulfilled' ? index.value : {});
    setLoading(false);

    if (feed.status === 'rejected' && local.status === 'rejected') {
      setEvents([]);
      setFailed(said(feed.reason));
      return;
    }

    /**
     * Keyed by eventID with the local pass last, so a repo entry overrides a feed event of the same ID rather than
     * duplicating it — see mergeEvents(), which parses the dates and sorts by start as well.
     */
    const merged = mergeEvents(
      feed.status === 'fulfilled' ? feed.value : [],
      local.status === 'fulfilled' ? local.value : [],
    );

    settleSeen(merged);
    setEvents(merged);
    setFailed(null);
    setGeneration((was) => was + 1);
    applyPending(merged);
  }

  // The first fetch, and the fragment's `?event=` read before it so the arrival is applied as soon as there is a feed to
  // find the event in. A link followed from this page changes only the fragment, so this is also what lands that.
  useEffect(() => {
    pending.current = new URLSearchParams(fragment).get('event');
    applyPending(events);
  }, [fragment]);

  useEffect(() => {
    void load();
  }, []);

  /**
   * Re-render every minute so relative labels stay honest, and re-fetch every tenth minute to catch new events. A tab
   * coming back into view re-renders straight away rather than waiting out the rest of its minute, since a background tab
   * has its timers throttled and its labels are the part a returning reader looks at first. The feed waits for the next
   * re-fetch tick either way.
   */
  useEffect(() => {
    let tick = 0;

    const timer = setInterval(() => {
      tick += 1;

      if (tick % REFETCH_EVERY === 0) {
        void load();
      } else {
        setNow(new Date());
      }
    }, TICK_MS);

    const woken = () => {
      if (!document.hidden) {
        setNow(new Date());
      }
    };

    document.addEventListener('visibilitychange', woken);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', woken);
    };
  }, []);

  /**
   * Switch which hidden-type set the chips edit and the views read. Persisted, unlike the view itself, because the sets
   * it chooses between are: a scope that fell back to global on reload would leave a reader's per-view filtering saved
   * and silently out of force, which is worse than not having offered it.
   */
  function setScope(next: Prefs['filterScope']) {
    prefs.filterScope = next;
    commit('filterScope');
  }

  function toggleType(heading: string) {
    const hidden = hiddenFor(prefs, view);

    if (!hidden.delete(heading)) {
      hidden.add(heading);
    }

    // Whichever set that was. Naming it from the scope rather than from the set means the two cannot disagree about
    // where a click just went, which is the one way a chip could take effect and then not survive a reload.
    commit(prefs.filterScope === 'view' ? 'hiddenByView' : 'hiddenTypes');
  }

  function reset() {
    prefs.hiddenTypes = new Set(DEFAULT_HIDDEN);

    // Emptied rather than filled with the defaults, because an absent set is what hiddenFor(prefs, view) seeds from the
    // global one — so this returns every view to the same set the chips now show, whichever scope a reader comes back in.
    prefs.hiddenByView = {};
    prefs.filterScope = 'global';
    prefs.dismissed.clear();

    // Back to not knowing, which settleSeen() then reads as a first visit and seeds from the feed. Clearing it to empty
    // instead would mark every event on the page new, and a Reset is a return to the defaults, not an announcement.
    prefs.seen = null;

    try {
      for (const key of Object.values(KEYS)) {
        localStorage.removeItem(key);
      }
    } catch {
      /* Nothing to clear if storage is unavailable. */
    }

    // Not stored preferences, so clearing the keys above leaves these as they were — but they are three of the same chips
    // Reset puts back, and a Reset that returns the page to its defaults cannot leave one of them widening it.
    setReveals(NOTHING_REVEALED);
    settleSeen(events);
    repaint();
  }

  /**
   * Acknowledge exactly the events the header just reported, so the number always falls to zero.
   *
   * That population is what the cards view draws, which the other two cannot match: the calendar paints one month at a
   * time, and the tracks only the types TRACKS has a row for, over a bounded window. So the count agrees with the marks
   * on screen in the cards view and in neither of the others, in both directions — a new event in next month is counted
   * before the calendar reaches it, and a new event that has ended is ringed in a past month without being counted. Cards
   * is the one worth making exact, because it is the only view whose own total sits in the same header.
   *
   * Revealing a hidden type months later does therefore surface a batch of marks, which is right — those events genuinely
   * are ones the reader has never been shown, and this clears them in one press. Revealing a recurring one surfaces
   * nothing, since `isNew` refuses those whatever is ticked.
   */
  function markAllSeen() {
    for (const ev of newlyVisible()) {
      recordSeen(ev);
    }

    commit('seen');
  }

  /**
   * The per-type filter chips, from the categories the feed currently carries. A chip is on when its type is not in the
   * hidden set; clicking one updates that set, persists it and redraws.
   *
   * Each chip also wears its type's colour class, which turns the row into the legend for the colour-coded cards and
   * bars. That needs the `eventType` slug the colours are keyed by, while the filters themselves are keyed by the human
   * `heading` — so the pairing is read off the events rather than kept as a second list that could drift out of step
   * with the feed.
   *
   * The entries are sorted rather than the keys, so the slug arrives with its heading. The comparator is spelled out
   * because it is over pairs: a bare `.sort()` would stringify each one whole.
   */
  const slugs = new Map<string, string>();

  for (const ev of events) {
    if (ev.heading && !slugs.has(ev.heading)) {
      slugs.set(ev.heading, ev.eventType);
    }
  }

  const types = [...slugs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const hidden = hiddenFor(prefs, view);
  const newly = newlyVisible().length;

  /**
   * One card. The overlay link covers it, so every other control on it has to be a sibling of that link.
   *
   * A function returning markup rather than a component, which is what the imperative page's `card(ev, now)` was too, and
   * here it is load-bearing rather than a preference. A component declared inside another is a *new function identity* on
   * every render, which the reconciler reads as a different type: it threw away all sixty cards and built them again on
   * every keystroke in the search box and on every minute's tick, re-requesting sixty `cdn.leekduck.com` thumbnails each
   * time. Called directly it contributes no component boundary at all, so the `<article>` keyed below is diffed against
   * the one from the last render, and the thumbnails stay where they are.
   */
  function renderCard(ev: ParsedEvent, index: number) {
    const status = statusOf(ev, now);
    const dismissed = prefs.dismissed.has(ev.eventID);
    const fresh = isNew(ev);
    const here = routeIndex[ev.eventID];
    const summary = here ? routeSummary(here) : null;

    /**
     * Opening the event acknowledges it, so the mark goes with the click. `target="_blank"` leaves the reader on this
     * page, so a card they have just gone and read would otherwise still be announcing itself as new when they come back
     * to this tab — and the one gesture that proves they have seen it is the one that left it marked.
     *
     * `auxclick` as well as `click` because a middle click, which over a list like this is how a reader opens something
     * in a background tab without losing their place, fires only the second of the two.
     */
    const acknowledge = (event: MouseEvent) => {
      // The left and middle buttons are the two that open the link. Chrome reports a right click as an `auxclick` too,
      // and that opens a menu rather than the event.
      if (event.button > 1 || !fresh) {
        return;
      }

      recordSeen(ev);
      commit('seen');
    };

    return (
      <article
        key={ev.eventID}
        class={`card ${status.kind}${dismissed ? ' dismissed' : ''}${typeClass(ev.eventType)}`}
        style={{ '--i': String(Math.min(index, STAGGER_MAX)) }}
      >
        {/*
         * A transparent overlay link makes the whole card open the event's source page while keeping the dismiss button a
         * sibling rather than a child: an anchor may not contain interactive content.
         */}
        <a
          class="card-link"
          href={ev.link}
          target="_blank"
          rel="noopener"
          aria-label={`Open “${ev.name}”`}
          onClick={acknowledge}
          onAuxClick={acknowledge}
        />

        {/*
         * A dismissed card only appears while "Show hidden" is on; there the same corner button restores it rather than
         * dismissing it again.
         */}
        <button
          type="button"
          class="dismiss"
          title={dismissed ? 'Restore this event' : 'Dismiss this event'}
          aria-label={`${dismissed ? 'Restore' : 'Dismiss'} “${ev.name}”`}
          onClick={() => {
            if (dismissed) {
              prefs.dismissed.delete(ev.eventID);
            } else {
              prefs.dismissed.add(ev.eventID);
            }

            commit('dismissed');
          }}
        >
          {dismissed ? '↩' : '×'}
        </button>

        {/*
         * The mark for an event that has appeared since the reader last acknowledged the page, and the button that clears
         * it. A sibling of the overlay link for the same reason the dismiss button is one: that link covers the card and
         * would swallow the click. It takes the opposite corner, so the card's two controls read as a pair — and the left
         * edge is already the status stripe.
         */}
        {fresh && (
          <button
            type="button"
            class="new-mark"
            title="Mark as seen"
            aria-label={`Mark “${ev.name}” as seen`}
            onClick={() => {
              recordSeen(ev);
              commit('seen');
            }}
          >
            New
          </button>
        )}

        {ev.image && <Thumb src={ev.image} />}

        <div class="body">
          <span class="badge">{ev.heading || ev.eventType}</span>
          <h2>{ev.name}</h2>
          <p class="when">{timeRange(ev)}</p>

          {status.at && (
            <p
              class={
                // An event already over is never urgent however recently it ended, so only a pending edge takes the
                // accent.
                status.kind !== 'ended' && status.at.getTime() - now.getTime() < SOON_MS ? 'rel soon' : 'rel'
              }
            >
              {status.kind === 'upcoming' ? 'Starts' : status.kind === 'ended' ? 'Ended' : 'Ends'}{' '}
              {relative(status.at, now)}
            </p>
          )}

          {/*
           * What this repository added for the event, linking through to it on the map. Last, so that the absolute dates
           * and the relative ones stay together above it. The query is what lands the link on the entry rather than on a
           * page of 81 rows. The stylesheet puts the Map tab's own glyph in front, so the destination is named the same
           * way twice; the accessible name says it in words instead.
           */}
          {summary !== null && (
            <a
              class="routes"
              href={toHash('map', `event=${encodeURIComponent(ev.eventID)}`)}
              title="Show on the map"
              aria-label={`Show ${summary} for “${ev.name}” on the map`}
            >
              {summary}
            </a>
          )}
        </div>
      </article>
    );
  }

  /**
   * One week's segment of an event, from a span of one column to all seven. A function rather than a component for the
   * reason `renderCard` is one: declared in here, a component is a fresh type on every render and the whole month is
   * rebuilt rather than diffed.
   */
  function renderCalBar(
    ev: ParsedEvent,
    [first, last]: readonly [number, number],
    { contLeft, contRight }: { contLeft: boolean; contRight: boolean },
  ) {
    const classes = ['cal-bar', statusOf(ev, now).kind];

    if (contLeft) {
      classes.push('cont-left');
    }

    if (contRight) {
      classes.push('cont-right');
    }

    // A ring, not a badge: there is no room for a control in eleven pixels, so a bar says an event is new and the header
    // carries the only way to clear it.
    if (isNew(ev)) {
      classes.push('new');
    }

    return (
      <a
        key={ev.eventID}
        class={classes.join(' ') + typeClass(ev.eventType)}
        style={{ gridColumn: `${first + 1} / span ${last - first + 1}` }}
        href={ev.link}
        target="_blank"
        rel="noopener"
        title={`${ev.name} — ${timeRange(ev)}`}
      >
        <span class="cal-bar-name">{ev.name}</span>
      </a>
    );
  }

  /** The cards view: a bucket per status, each a grid of cards. */
  function cards() {
    const buckets: Record<StatusKind, ParsedEvent[]> = { active: [], upcoming: [], tbd: [], ended: [] };
    let shown = 0;

    for (const ev of events) {
      if (!isVisible(ev) || !isRevealed(ev)) {
        continue;
      }

      buckets[statusOf(ev, now).kind].push(ev);
      shown += 1;
    }

    // Upcoming reads best soonest-first; ended reads best most-recent-first. `events` is already sorted by start, so
    // reversing the ended bucket is enough.
    buckets.ended.reverse();

    const parts = [shown ? `${shown} event${shown === 1 ? '' : 's'}` : 'No events to show'];

    if (buckets.active.length) {
      parts.push(`${buckets.active.length} happening now`);
    }

    if (prefs.dismissed.size) {
      parts.push(`${prefs.dismissed.size} dismissed`);
    }

    return {
      count: parts.join(' · '),
      /**
       * Keyed by the bucket, which an anonymous `<>` cannot be — and a bucket is exactly what comes and goes here, since
       * only the non-empty ones are drawn. Unkeyed, the four are matched by position: a search term that empties
       * "Happening now" slides "Upcoming" into slot nought, whose grid then carries a different key from the one that was
       * there, so the reconciler rebuilds it and throws away every card under it. Measured at 0 of 62 cards reused on one
       * keystroke, each taking its `cdn.leekduck.com` thumbnail with it.
       */
      body: GROUPS.filter(({ kind }) => buckets[kind].length > 0).map(({ kind, label }) => (
        <Fragment key={kind}>
          {/*
           * The bucket's kind rides along on the heading so the stylesheet can pick out the running events; the count
           * saves the reader tallying cards to see how big a bucket is.
           */}
          <h2 class={`group group-${kind}`}>
            {label}
            <span class="gcount">{buckets[kind].length}</span>
          </h2>
          <div key={`g-${kind}-${generation}`} class="grid enter">
            {buckets[kind].map(renderCard)}
          </div>
        </Fragment>
      )),
    };
  }

  /** The calendar view: a month grid where every event is a bar spanning the days it covers within each week. */
  function calendar() {
    const month = calMonth ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const year = month.getFullYear();
    const index = month.getMonth();
    const lead = new Date(year, index, 1).getDay(); // blank days before the 1st (Sunday-first)
    const daysInMonth = new Date(year, index + 1, 0).getDate();
    const weeks = Math.ceil((lead + daysInMonth) / 7);
    const gridStart = new Date(year, index, 1 - lead);
    const todayKey = startOfDay(now).getTime();

    /**
     * Every event the grid can place, resolved once ahead of the week loop. A dateless event has no window and so never
     * reaches the grid at all. `events` is already sorted by start, so the longest-running bars settle at the top of each
     * week and the order down a week reads as the order events begin.
     *
     * One `flatMap` rather than a `map` and a `filter`, because a predicate does not narrow what it filtered: the pair
     * survived the `win !== null` test and stayed `Span | null` regardless, which is two assertions' worth of noise at
     * the two places below that read `win[0]`. Returning no row for an event with no window says the same thing and is
     * checked.
     */
    const placed = events.filter(isVisible).flatMap((ev) => {
      const win = windowOf(ev);

      return win === null ? [] : [{ ev, win }];
    });

    const monthStart = new Date(year, index, 1).getTime();
    const monthEnd = new Date(year, index + 1, 1).getTime();
    const inMonth = placed.filter(({ win }) => overlaps(win, monthStart, monthEnd)).length;

    return {
      count: `${monthFmt.format(month)} · ${inMonth} event${inMonth === 1 ? '' : 's'}`,
      body: (
        <>
          <div class="calbar">
            <button
              type="button"
              class="navbtn"
              aria-label="Previous month"
              onClick={() => setCalMonth(new Date(year, index - 1, 1))}
            >
              ‹
            </button>
            <span class="callabel">{monthFmt.format(month)}</span>
            <button
              type="button"
              class="navbtn"
              aria-label="Next month"
              onClick={() => setCalMonth(new Date(year, index + 1, 1))}
            >
              ›
            </button>
            <button
              type="button"
              class="navbtn"
              onClick={() => setCalMonth(new Date(now.getFullYear(), now.getMonth(), 1))}
            >
              Today
            </button>
          </div>

          <div class="cal">
            <div class="cal-wd-row">
              {WEEKDAYS.map((name) => (
                <div key={name} class="cal-wd">
                  {name}
                </div>
              ))}
            </div>

            {Array.from({ length: weeks }, (_, week) => {
              const weekStart = addDays(gridStart, week * 7);
              const weekStartMs = weekStart.getTime();
              const weekEndMs = addDays(weekStart, 7).getTime();

              return (
                <div key={weekStartMs} class="cal-week">
                  {/* The cells first, so the bars that share their grid area paint over them rather than under. */}
                  <div class="cal-days">
                    {Array.from({ length: 7 }, (_, col) => {
                      const day = addDays(weekStart, col);
                      const classes = ['cal-day'];

                      if (day.getMonth() !== index) {
                        classes.push('other');
                      }

                      // The class is the pill and the tint; `aria-current` is the same fact for a reader who is getting
                      // neither, and is the only thing on the grid that says which day is today rather than a colour.
                      const today = day.getTime() === todayKey;

                      if (today) {
                        classes.push('today');
                      }

                      return (
                        <div key={col} class={classes.join(' ')} aria-current={today ? 'date' : undefined}>
                          <span class="daynum">{day.getDate()}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div class="cal-bars">
                    {placed.flatMap(({ ev, win }) => {
                      const columns = weekColumns(win, weekStart);

                      /**
                       * A segment continues past the week only where the week's own edge is what stopped it. Reaching
                       * column 0 while having begun earlier means it ran in from the row above; anything starting later
                       * than column 0 began inside this week, because it misses the column before.
                       */
                      return columns === null
                        ? []
                        : [
                            renderCalBar(ev, columns, {
                              contLeft: columns[0] === 0 && win[0] < weekStartMs,
                              contRight: columns[1] === 6 && win[1] > weekEndMs,
                            }),
                          ];
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ),
    };
  }

  /** The Tracks view: a Gantt chart, one fixed row per event type. */
  function tracks() {
    const rangeStart = addDays(startOfDay(now), -TRACK_LEAD_DAYS);
    const rangeStartMs = rangeStart.getTime();

    /**
     * The rows this render will draw, one per TRACKS entry, each carrying the events that landed on it. A type with no
     * track (GO Battle League, GO Pass) has no row, so it is dropped; an event ending before the window's left edge is
     * skipped.
     */
    const byType = new Map<string, { type: string; label: string; items: TrackItem[] }>(
      TRACKS.map((track) => [track.type, { ...track, items: [] }]),
    );

    let latestEnd = rangeStartMs + TRACK_MIN_DAYS * DAY_MS;

    // Track types whose filter chip is off, so the whole row can be dropped rather than left as an empty ghost. Keyed by
    // the chip's `heading` state alone — a track emptied by dismissals or a search term keeps its row.
    const filteredTypes = new Set<string>();

    for (const ev of events) {
      const row = byType.get(ev.eventType);

      if (!row) {
        continue;
      }

      if (hidden.has(ev.heading)) {
        filteredTypes.add(ev.eventType);
      }

      if (!isVisible(ev)) {
        continue;
      }

      const win = windowOf(ev);

      if (win === null || win[1] <= rangeStartMs) {
        continue;
      }

      latestEnd = Math.max(latestEnd, win[1]);
      row.items.push({ ev, startMs: win[0], endMs: win[1], lane: 0 });
    }

    const span = Math.min(TRACK_MAX_DAYS, Math.max(TRACK_MIN_DAYS, Math.ceil((latestEnd - rangeStartMs) / DAY_MS)));
    const rangeEndMs = rangeStartMs + span * DAY_MS;
    const width = span * TRACK_DAY_PX;
    const todayX = ((startOfDay(now).getTime() - rangeStartMs) / DAY_MS) * TRACK_DAY_PX;

    let shown = 0;

    const rows = [...byType.values()].flatMap((track) => {
      /**
       * The right edge needs a guard of its own, mirroring the `win[1] <= rangeStartMs` one above: `span` is clamped to
       * TRACK_MAX_DAYS where `latestEnd` is not, so an event starting past `rangeEndMs` clips to a negative width, draws
       * at the 20px minimum somewhere past the lane's own right edge — `.track-lane` sets no `overflow` and
       * `.tracks-scroll` scrolls — and is counted in the tally. Dropped before `packLanes` so it cannot claim a lane and
       * raise the row's height for a bar nobody can see.
       */
      const items = track.items.filter((item) => item.startMs < rangeEndMs).sort((a, b) => a.startMs - b.startMs);

      // A track the filter has switched off drops out entirely. Only when it is also empty, so a type sharing its row
      // with a still-visible heading keeps the row and its visible events.
      if (items.length === 0 && filteredTypes.has(track.type)) {
        return [];
      }

      const lanes = packLanes(items);
      const height = Math.max(1, lanes) * (TRACK_BAR_H + TRACK_LANE_GAP) + TRACK_LANE_GAP;

      shown += items.length;

      return [
        <div key={`l-${track.type}`} class="track-label" style={{ height: `${height}px` }}>
          {track.label}
        </div>,
        <div key={`r-${track.type}`} class="track-lane" style={{ width: `${width}px`, height: `${height}px` }}>
          {items.map((item) => {
            const left = Math.max(item.startMs, rangeStartMs);
            const right = Math.min(item.endMs, rangeEndMs);

            return (
              <a
                key={item.ev.eventID}
                class={`bar ${statusOf(item.ev, now).kind}${isNew(item.ev) ? ' new' : ''}${typeClass(item.ev.eventType)}`}
                href={item.ev.link}
                target="_blank"
                rel="noopener"
                title={`${item.ev.name} — ${timeRange(item.ev)}`}
                style={{
                  left: `${((left - rangeStartMs) / DAY_MS) * TRACK_DAY_PX}px`,
                  width: `${Math.max(TRACK_DAY_PX / 2, ((right - left) / DAY_MS) * TRACK_DAY_PX)}px`,
                  top: `${TRACK_LANE_GAP + item.lane * (TRACK_BAR_H + TRACK_LANE_GAP)}px`,
                  height: `${TRACK_BAR_H}px`,
                }}
              >
                {item.ev.name}
              </a>
            );
          })}
        </div>,
      ];
    });

    return {
      count: shown ? `${shown} event${shown === 1 ? '' : 's'} across the tracks` : 'No events to show',
      body: (
        <div class="tracks">
          <div class="tracks-scroll">
            <div
              class="tracks-inner"
              style={{ 'gridTemplateColumns': `${TRACK_LABEL_PX}px ${width}px`, '--track-day': `${TRACK_DAY_PX}px` }}
            >
              <div class="track-corner">Tracks</div>
              <div class="track-axis" style={{ width: `${width}px` }}>
                {/* One date label per week down the axis; the daily gridline comes from the CSS background. */}
                {Array.from({ length: Math.ceil(span / 7) }, (_, week) => (
                  <span key={week} class="axis-tick" style={{ left: `${week * 7 * TRACK_DAY_PX}px` }}>
                    {dayFmt.format(addDays(rangeStart, week * 7))}
                  </span>
                ))}
              </div>
              {rows}
              <div class="track-today" style={{ left: `${TRACK_LABEL_PX + todayX}px` }} />
            </div>
          </div>
        </div>
      ),
    };
  }

  const drawn = view === 'calendar' ? calendar() : view === 'tracks' ? tracks() : cards();

  const count = failed !== null ? `Could not load events: ${failed}` : loading ? 'Loading events…' : drawn.count;

  return (
    <>
      <header class="page">
        <h1>Pokémon GO Events</h1>
        <p class="sub">{count}</p>

        {/*
         * How many events have appeared since this browser last acknowledged them, and the one control that clears them
         * all. Its own line rather than part of the count because all three views write that one themselves, and this
         * says the same thing in each of them. Hidden until there is a number to report.
         */}
        <p class="sub newly" hidden={newly === 0}>
          <span class="new-count">
            {newly} new event{newly === 1 ? '' : 's'}
          </span>
          <button type="button" class="ghost" title="Stop marking these events as new" onClick={markAllSeen}>
            Mark all as seen
          </button>
        </p>
      </header>

      <section class="controls">
        <div class="viewtoggle" role="group" aria-label="View">
          {(
            [
              ['cards', 'Cards'],
              ['calendar', 'Calendar'],
              ['tracks', 'Tracks'],
            ] as const
          ).map(([name, label]) => (
            <button
              key={name}
              type="button"
              class={view === name ? 'active' : undefined}
              aria-pressed={view === name}
              onClick={() => setView(name)}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="search"
          placeholder="Search events…"
          autocomplete="off"
          value={search}
          onInput={(event) => setSearch(event.currentTarget.value)}
        />
        <button type="button" onClick={() => void load()}>
          Refresh
        </button>
        <button
          type="button"
          class="ghost"
          title="Default every view's type filters, hide ended and undated events, restore dismissals and clear new marks"
          onClick={reset}
        >
          Reset
        </button>

        {/*
         * The handle that discloses the filters, on a row of its own at the foot of the panel. `aria-expanded` carries the
         * state and the title says which way a click goes, so the label stays neutral in both of them and the ellipsis
         * only has to say there is more here; it is a real character rather than CSS content so it survives the stylesheet
         * not loading, and is hidden from the accessibility tree because the label already names it.
         */}
        <button
          type="button"
          class="disclose"
          aria-controls="filters"
          aria-expanded={filtersOpen}
          aria-label="Filters"
          title={`${filtersOpen ? 'Hide' : 'Show'} filters`}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <span class="dots" aria-hidden="true">
            …
          </span>
        </button>
      </section>

      {/*
       * Hidden until the handle above discloses it. Everything in here narrows or widens what the views draw, and none of
       * it is wanted on a first read: the chip row doubles as the colour legend for all three views, and the three
       * reveals below only matter to a reader already looking for something they cannot see.
       */}
      <section class="filters" id="filters" aria-label="Filters" hidden={!filtersOpen}>
        {/*
         * What a chip click applies to, immediately above the chips it governs. The label is a real element and the group
         * takes `aria-labelledby` rather than repeating it in an `aria-label`, so the two cannot drift; the segmented
         * `.viewtoggle` is the same control the view switcher uses, and is here because it names both states at once
         * instead of leaving one of them to be inferred from the other being lit.
         */}
        <div class="scope">
          <span id="scopeLabel">Type filters apply to</span>
          <div class="viewtoggle" role="group" aria-labelledby="scopeLabel">
            {(
              [
                ['global', 'All views'],
                ['view', 'This view'],
              ] as const
            ).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                class={prefs.filterScope === scope ? 'active' : undefined}
                aria-pressed={prefs.filterScope === scope}
                onClick={() => setScope(scope)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/*
         * A `group` rather than a labelled `section`, because it is nested inside one: two regions, one wrapping the
         * other, is a landmark a reader has to step past to reach the chips it holds.
         *
         * The chips are painted from the hidden set in force rather than from their own appearance, which matters because
         * under a per-view scope that set changes with the view: a row still showing the last view's would be a legend
         * for a set no longer being read.
         */}
        <div class="type-filters" role="group" aria-label="Filter by event type">
          {types.map(([heading, eventType]) => (
            <button
              key={heading}
              type="button"
              class={`chip${hidden.has(heading) ? ' off' : ''}${typeClass(eventType)}`}
              aria-pressed={!hidden.has(heading)}
              onClick={() => toggleType(heading)}
            >
              {heading}
            </button>
          ))}
        </div>

        {/*
         * The same chip as a type filter, and toggle buttons for the same reason: `aria-pressed` is what carries on or off
         * to a reader who cannot see the dimming, and a button is the one control that takes it.
         *
         * Last in the panel, and so last in the tab order, because they are the least of what is in it: the chips above
         * are the legend for all three views and get read whether or not they are clicked, where these three only widen a
         * window a reader is unlikely to want widened.
         */}
        <div class="toggles">
          {REVEALS.map(({ name, label, cardsOnly }) => (
            <button
              key={name}
              type="button"
              class={reveals[name] ? 'chip' : 'chip off'}
              aria-pressed={reveals[name]}
              hidden={cardsOnly && view !== 'cards'}
              onClick={() => setReveals((was) => ({ ...was, [name]: !was[name] }))}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <main aria-live="polite">{failed === null && drawn.body}</main>

      <footer>
        <p>
          Event data from{' '}
          <a href="https://leekduck.com/events/" target="_blank" rel="noopener">
            Leek Duck
          </a>{' '}
          via{' '}
          <a href="https://github.com/bigfoott/ScrapedDuck" target="_blank" rel="noopener">
            ScrapedDuck
          </a>
          , copied here every hour, plus events defined in this repository. Times are shown in your device's local
          timezone.
        </p>
        <p>
          <a href="events.ics">Subscribe in your own calendar</a>, without the weekly Spotlight and Raid Hours. In
          Google Calendar, copy the link into <em>Other calendars → From URL</em>.
        </p>
        <p>This site is unofficial. Click an event to open its source page.</p>
      </footer>
    </>
  );
}
