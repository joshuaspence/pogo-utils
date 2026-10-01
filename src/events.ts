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

import { LOCAL_EVENTS, routeSummary, VENDED_EVENTS } from './event-feed.js';
import {
  DEFAULT_HIDDEN,
  hiddenFor,
  KEYS,
  loadPrefs,
  persist as persistPref,
  RECURRING,
  type Prefs,
} from './event-prefs.js';
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
} from './event-schedule.js';
import { said } from './errors.js';
import { ENTRIES_BY_EVENT } from './generated.js';
import { byId, el } from './dom.js';

import type { FeedEvent, RouteIndex } from './types.js';

/** Which of the three views is showing. A page concept, so it stays here rather than beside the schedule. */
type View = 'cards' | 'calendar' | 'tracks';

/**
 * How many routes and waypoints each event has here, by `eventID`, once the index has loaded. Empty until then, and it
 * stays empty if that fetch fails — see load(), which tolerates any one of the three sources going missing.
 */
let routeIndex: RouteIndex = {};

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

const prefs = loadPrefs();

/**
 * Write one preference back, named rather than keyed so a call site cannot pair a key with the wrong value. The one
 * `prefs` this page has is the one every call means, so it is bound here rather than spelled at each of them.
 */
const persist = (name: keyof typeof KEYS) => persistPref(prefs, name);

const els = {
  count: byId('count'),
  newly: byId('newly'),
  newCount: byId('newCount'),
  markSeen: byId('markSeen'),
  search: byId('search', HTMLInputElement),
  filters: byId('filters'),
  typeFilters: byId('typeFilters'),
  discloseFilters: byId('discloseFilters'),
  showPast: byId('showPast'),
  showUndated: byId('showUndated'),
  showHidden: byId('showHidden'),
  scopeGlobal: byId('scopeGlobal'),
  scopeView: byId('scopeView'),
  refresh: byId('refresh'),
  reset: byId('reset'),
  viewCards: byId('viewCards'),
  viewCalendar: byId('viewCalendar'),
  viewTracks: byId('viewTracks'),
  events: byId('events'),
};

/**
 * The feed entries the page is drawing, sorted by start.
 */
let events: ParsedEvent[] = [];
let tick = 0;

// Whether the next render is the one that follows a fetch, which is the only one that plays the cards' entry animation.
// render() also runs every minute to keep the relative labels honest, and animating those would be a twitch.
let entering = false;

let view: View = 'cards';

/**
 * The first-of-month Date the calendar view is showing, set lazily to the current month.
 */
let calMonth: Date | null = null;

let filtersOpen = false; // whether the filter panel is disclosed; a session's choice, not a saved preference

/**
 * Whether each of the three reveals at the foot of the filter panel is on. Held here rather than read back off the
 * chips because a chip says so in two places at once — the `off` class and `aria-pressed` — and a filter that asked
 * either of them would make the appearance the state, so a mismatch between the two would be undetectable. A session's
 * choice like `filtersOpen`; `prefs` is what survives a reload.
 *
 * Each row carries its own chip rather than the name of one. Keyed by element id, the three loops over this object all
 * reached `els` by a computed string — which `noUncheckedIndexedAccess` answers as the union of every field on `els`,
 * and `checkJs` answers with a `TS7053` for having no index signature at all. Holding the element is both narrower and
 * shorter than an assertion at each of them, and it puts the pairing in one place: a fourth reveal is a line here and
 * still needs no loop written for it.
 */
const reveals = {
  showPast: { on: false, chip: els.showPast },
  showUndated: { on: false, chip: els.showUndated },
  showHidden: { on: false, chip: els.showHidden },
};

/**
 * The type chips, each beside the heading it filters, in the order fillTypes() built them — which rebuilds this whole
 * on every fetch, since the row it mirrors is replaced whole too.
 *
 * Held rather than walked back off `els.typeFilters.children`, which answers an `Element` and so carries no `dataset`
 * at all, and whose `dataset.heading` was in any case a copy of a string fillTypes() had in hand. Two lookups in the
 * document for something this module made, where holding it removes the question instead of answering it.
 */
const typeChips: { heading: string; chip: HTMLButtonElement }[] = [];

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
 * Whether an event survives the type-filter, dismissal and search-term filters — the ones that mean "I do not want to
 * see this", so every view honours them. The status reveals are isRevealed()'s, layered on top of this. A dismissed
 * event stays hidden unless "Show hidden" is on, which mirrors how "Show ended" reveals past events — the choice is
 * a temporary reveal, not a change to the saved dismissal.
 */
function isVisible(ev: ParsedEvent) {
  if (hiddenFor(prefs, view).has(ev.heading)) {
    return false;
  }

  if (prefs.dismissed.has(ev.eventID) && !reveals.showHidden.on) {
    return false;
  }

  const term = els.search.value.trim().toLowerCase();
  return !term || ev.name.toLowerCase().includes(term);
}

/**
 * Whether the reader has revealed the status bucket this event falls in. The two opt-in buckets are an event that is
 * over and one the feed gave no date for: neither is something a reader can plan around, and an undated event is more
 * often a gap on the way here than one genuinely waiting on a date.
 *
 * Shared with newlyVisible() so the new count can only ever be a subset of the total the cards view writes beside it. A
 * header reporting more new events than events contradicts itself, and so does any count at all above "No events to
 * show" — which a search term matching only undated events is enough to produce.
 */
function isRevealed(ev: ParsedEvent, now: Date) {
  const kind = statusOf(ev, now).kind;
  return (kind !== 'ended' || reveals.showPast.on) && (kind !== 'tbd' || reveals.showUndated.on);
}

/**
 * Whether the event has turned up since the reader last acknowledged what was on the page. The feed carries no
 * published date — an entry is `eventID`, `name`, `heading`, `eventType`, `link`, `image`, `start` and `end`, and
 * nothing else — so "new" can only mean "an ID this browser has not recorded seeing", a per-reader fact anyway.
 *
 * A recurring type is never new, whoever is looking and whatever they have ticked. Each occurrence carries its own
 * dated ID — `pokemonspotlighthour2026-09-24` — so a weekly Spotlight Hour arrives unrecognised every week and would
 * mark itself for ever. Coming round on schedule is the whole of what those types do, and a mark that fires on schedule
 * reports nothing. That is why settleSeen() stores none of them either: no question is left for the set to answer.
 *
 * Nothing is new before the first feed has settled the seen set, so a slow fetch cannot flash badges over every card.
 */
function isNew(ev: ParsedEvent) {
  return prefs.seen !== null && !RECURRING.has(ev.heading) && !prefs.seen.has(ev.eventID);
}

/**
 * Acknowledge one event. The writer paired with isNew(), and asked only for an event isNew() has admitted — which it
 * cannot do before settleSeen() has filled the set, since a null one is the first of its three conditions.
 *
 * So the optional call is that null being unreachable rather than tolerated. There is no branch to write for it:
 * nothing can be new when there is nothing yet to be new against, so the set this would have created has no members to
 * carry. Named here rather than written out at the three callers because the argument for the `?.` is the same one each
 * time, and a reader meeting it at a click handler cannot see isNew() standing behind it.
 */
function recordSeen(ev: ParsedEvent) {
  prefs.seen?.add(ev.eventID);
}

/**
 * The events the reader is being told are new: unacknowledged, and among those their filters admit. Both filters, so
 * the count leaves out everything they have said they do not want — a dismissal, a search term, a hidden type, which
 * after isNew() has already refused the recurring ones means the rest of DEFAULT_HIDDEN and anything they have unticked
 * since, and the ended and undated buckets they have not revealed.
 *
 * Which is exactly the population the cards view draws, and neither narrower nor wider than what the other two draw:
 * see the Mark all as seen handler.
 */
function newlyVisible(now: Date) {
  return events.filter((ev) => isNew(ev) && isVisible(ev) && isRevealed(ev, now));
}

/**
 * Settle the seen set against the feed, once per fetch.
 *
 * A first visit seeds it with everything on offer rather than marking all of it new: forty badges say no more than none
 * do, and the point of the mark is the difference from what you last looked at, which on a first visit is nothing. IDs
 * the feed has dropped are forgotten, which cannot resurrect a mark because every occurrence carries its own dated ID —
 * `raidhour20260930`, `october-communityday2026` — so a forgotten one never comes round again.
 *
 * The recurring types are left out of both halves, because isNew() can never mark one: they are a fifth of the feed, so
 * storing them would turn a fifth of the set over every week to answer a question nothing asks. Leaving them out of
 * `ids` is also what drops the ones already stored, since the prune keeps only what `ids` holds.
 *
 * Both halves are skipped when the feed gave us nothing, which load() tolerates: seeding from an empty feed would mark
 * the whole of the next good one new, and pruning against it would forget every ID the reader had acknowledged.
 */
function settleSeen() {
  if (!events.length) {
    return;
  }

  const ids = new Set(events.filter((ev) => !RECURRING.has(ev.heading)).map((ev) => ev.eventID));
  prefs.seen = prefs.seen === null ? ids : new Set([...prefs.seen].filter((id) => ids.has(id)));
  persist('seen');
}

function card(ev: ParsedEvent, now: Date) {
  const status = statusOf(ev, now);
  const dismissed = prefs.dismissed.has(ev.eventID);
  const cardEl = el('article', `card ${status.kind}${dismissed ? ' dismissed' : ''}${typeClass(ev.eventType)}`);

  // A transparent overlay link makes the whole card open the event's source page while keeping the dismiss button a
  // sibling rather than a child: an anchor may not contain interactive content.
  const link = el('a', 'card-link');
  link.href = ev.link;
  link.target = '_blank';
  link.rel = 'noopener';
  link.setAttribute('aria-label', `Open “${ev.name}”`);

  /**
   * Opening the event acknowledges it, so the mark goes with the click. `target="_blank"` leaves the reader on this
   * page, so a card they have just gone and read would otherwise still be announcing itself as new when they come back
   * to this tab — and the one gesture that proves they have seen it is the one that left it marked.
   *
   * `auxclick` as well as `click` because a middle click, which over a list like this is how a reader opens something
   * in a background tab without losing their place, fires only the second of the two.
   */
  const acknowledge = (e: MouseEvent) => {
    // The left and middle buttons are the two that open the link. Chrome reports a right click as an `auxclick` too,
    // and that opens a menu rather than the event.
    if (e.button > 1 || !isNew(ev)) {
      return;
    }

    recordSeen(ev);
    persist('seen');
    render();
  };

  link.addEventListener('click', acknowledge);
  link.addEventListener('auxclick', acknowledge);
  cardEl.append(link);

  // A dismissed card only appears while "Show hidden" is on; there the same corner button restores it rather than
  // dismissing it again.
  const dismiss = el('button', 'dismiss', dismissed ? '↩' : '×');
  dismiss.type = 'button';
  dismiss.title = dismissed ? 'Restore this event' : 'Dismiss this event';
  dismiss.setAttribute('aria-label', `${dismissed ? 'Restore' : 'Dismiss'} “${ev.name}”`);

  dismiss.addEventListener('click', () => {
    if (dismissed) {
      prefs.dismissed.delete(ev.eventID);
    } else {
      prefs.dismissed.add(ev.eventID);
    }

    persist('dismissed');
    render();
  });

  cardEl.append(dismiss);

  /**
   * The mark for an event that has appeared since the reader last acknowledged the page, and the button that clears it.
   * A sibling of the overlay link for the same reason the dismiss button is one: that link covers the card and would
   * swallow the click. It takes the opposite corner, so the card's two controls read as a pair — and the left edge is
   * already the status stripe.
   */
  if (isNew(ev)) {
    const mark = el('button', 'new-mark', 'New');
    mark.type = 'button';
    mark.title = 'Mark as seen';
    mark.setAttribute('aria-label', `Mark “${ev.name}” as seen`);

    mark.addEventListener('click', () => {
      recordSeen(ev);
      persist('seen');
      render();
    });

    cardEl.append(mark);
  }

  if (ev.image) {
    const img = el('img', 'thumb');
    img.src = ev.image;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.remove());
    cardEl.append(img);
  }

  const body = el('div', 'body');
  body.append(el('span', 'badge', ev.heading || ev.eventType));
  body.append(el('h2', null, ev.name));
  body.append(el('p', 'when', timeRange(ev)));

  if (status.at) {
    const verb = status.kind === 'upcoming' ? 'Starts' : status.kind === 'ended' ? 'Ended' : 'Ends';

    // An event already over is never urgent however recently it ended, so only a pending edge takes the accent.
    const soon = status.kind !== 'ended' && status.at.getTime() - now.getTime() < SOON_MS;

    body.append(el('p', `rel${soon ? ' soon' : ''}`, `${verb} ${relative(status.at, now)}`));
  }

  /**
   * What this repository added for the event, linking through to it on the map. Last, so that the absolute dates and
   * the relative ones stay together above it. The fragment is what lands the link on the entry rather than on a page of
   * 81 rows. The stylesheet puts the Map tab's own glyph in front, so the destination is named the same way twice; the
   * accessible name says it in words instead.
   */
  const here = routeIndex[ev.eventID];

  if (here) {
    const summary = routeSummary(here);
    const mapLink = el('a', 'routes', summary);
    mapLink.href = `map.html#event=${encodeURIComponent(ev.eventID)}`;
    mapLink.title = 'Show on the map';
    mapLink.setAttribute('aria-label', `Show ${summary} for “${ev.name}” on the map`);
    body.append(mapLink);
  }

  cardEl.append(body);
  return cardEl;
}

function renderCards(now: Date) {
  const buckets: Record<StatusKind, ParsedEvent[]> = { active: [], upcoming: [], tbd: [], ended: [] };
  let shown = 0;

  for (const ev of events) {
    if (!isVisible(ev) || !isRevealed(ev, now)) {
      continue;
    }

    buckets[statusOf(ev, now).kind].push(ev);
    shown += 1;
  }

  // Upcoming reads best soonest-first; ended reads best most-recent-first. `events` is already sorted by start, so
  // reversing the ended bucket is enough.
  buckets.ended.reverse();

  els.events.replaceChildren();

  for (const { kind, label } of GROUPS) {
    const list = buckets[kind];

    if (!list.length) {
      continue;
    }

    // The bucket's kind rides along on the heading so the stylesheet can pick out the running events; the count saves
    // the reader tallying cards to see how big a bucket is.
    const heading = el('h2', `group group-${kind}`, label);
    heading.append(el('span', 'gcount', String(list.length)));
    els.events.append(heading);

    const grid = el('div', `grid${entering ? ' enter' : ''}`);

    for (const [i, ev] of list.entries()) {
      const node = card(ev, now);
      node.style.setProperty('--i', String(Math.min(i, STAGGER_MAX)));
      grid.append(node);
    }

    els.events.append(grid);
  }

  const parts = [shown ? `${shown} event${shown === 1 ? '' : 's'}` : 'No events to show'];

  if (buckets.active.length) {
    parts.push(`${buckets.active.length} happening now`);
  }

  if (prefs.dismissed.size) {
    parts.push(`${prefs.dismissed.size} dismissed`);
  }

  els.count.textContent = parts.join(' · ');
}

/**
 * One week's segment of an event, from a span of one column to all seven. `grid-column` places and stretches it; the
 * rows pack themselves, because `.cal-bars` is a dense grid and CSS's dense auto-placement is the same greedy interval
 * partitioning packLanes() does by hand for the Tracks view — a definite column span dropped into the first row where
 * that span is free.
 *
 * A segment the week's edge cut off is squared off there and marked with an arrow, so a bar reads as running on into the
 * next row rather than as ending on the Saturday.
 *
 * @param columns The inclusive `[first, last]` weekColumns() answered for this week.
 * @param cut Which ends the week's own edge cut off rather than the event.
 */
function calBar(
  ev: ParsedEvent,
  now: Date,
  [first, last]: readonly [number, number],
  { contLeft, contRight }: { contLeft: boolean; contRight: boolean },
) {
  const node = el('a', `cal-bar ${statusOf(ev, now).kind}${typeClass(ev.eventType)}`);
  node.style.gridColumn = `${first + 1} / span ${last - first + 1}`;
  node.classList.toggle('cont-left', contLeft);
  node.classList.toggle('cont-right', contRight);

  // A ring, not a badge: there is no room for a control in eleven pixels, so a bar says an event is new and the header
  // carries the only way to clear it.
  node.classList.toggle('new', isNew(ev));
  node.href = ev.link;
  node.target = '_blank';
  node.rel = 'noopener';
  node.title = `${ev.name} — ${timeRange(ev)}`;
  node.append(el('span', 'cal-bar-name', ev.name));
  return node;
}

function renderCalendar(now: Date) {
  if (!calMonth) {
    calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const lead = new Date(year, month, 1).getDay(); // blank days before the 1st (Sunday-first)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const gridStart = new Date(year, month, 1 - lead);

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
  const visible = events.filter(isVisible).flatMap((ev) => {
    const win = windowOf(ev);
    return win === null ? [] : [{ ev, win }];
  });

  els.events.replaceChildren();

  const bar = el('div', 'calbar');
  const prev = el('button', 'navbtn', '‹');
  const next = el('button', 'navbtn', '›');
  const today = el('button', 'navbtn', 'Today');
  prev.type = next.type = today.type = 'button';
  prev.setAttribute('aria-label', 'Previous month');
  next.setAttribute('aria-label', 'Next month');
  prev.addEventListener('click', () => {
    calMonth = new Date(year, month - 1, 1);
    render();
  });
  next.addEventListener('click', () => {
    calMonth = new Date(year, month + 1, 1);
    render();
  });
  today.addEventListener('click', () => {
    calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    render();
  });
  bar.append(prev, el('span', 'callabel', monthFmt.format(calMonth)), next, today);
  els.events.append(bar);

  const grid = el('div', 'cal');
  const head = el('div', 'cal-wd-row');

  for (const name of WEEKDAYS) {
    head.append(el('div', 'cal-wd', name));
  }

  grid.append(head);

  const todayKey = startOfDay(now).getTime();

  for (let w = 0; w < weeks; w += 1) {
    const weekStart = addDays(gridStart, w * 7);
    const weekStartMs = weekStart.getTime();
    const weekEndMs = addDays(weekStart, 7).getTime();

    const week = el('div', 'cal-week');
    const days = el('div', 'cal-days');

    for (let col = 0; col < 7; col += 1) {
      const day = addDays(weekStart, col);
      const cell = el('div', 'cal-day');

      if (day.getMonth() !== month) {
        cell.classList.add('other');
      }

      // The class is the pill and the tint; `aria-current` is the same fact for a reader who is getting neither, and is
      // the only thing on the grid that says which day is today rather than leaving it to a colour.
      if (day.getTime() === todayKey) {
        cell.classList.add('today');
        cell.setAttribute('aria-current', 'date');
      }

      cell.append(el('span', 'daynum', String(day.getDate())));
      days.append(cell);
    }

    const bars = el('div', 'cal-bars');

    for (const { ev, win } of visible) {
      const cols = weekColumns(win, weekStart);

      if (cols === null) {
        continue;
      }

      /**
       * A segment continues past the week only where the week's own edge is what stopped it. Reaching column 0 while
       * having begun earlier means it ran in from the row above; anything starting later than column 0 began inside
       * this week, because it misses the column before.
       */
      bars.append(
        calBar(ev, now, cols, {
          contLeft: cols[0] === 0 && win[0] < weekStartMs,
          contRight: cols[1] === 6 && win[1] > weekEndMs,
        }),
      );
    }

    // The cells first, so the bars that share their grid area paint over them rather than under.
    week.append(days, bars);
    grid.append(week);
  }

  els.events.append(grid);

  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();
  const inMonth = visible.filter((v) => overlaps(v.win, monthStart, monthEnd)).length;
  els.count.textContent = `${monthFmt.format(calMonth)} · ${inMonth} event${inMonth === 1 ? '' : 's'}`;
}

// Tracks view geometry. TRACK_DAY_PX is the single source for a day column's width: the JS positions bars in pixels
// from it, and hands the same value to CSS as the --track-day custom property for the gridline background, so the two
// cannot drift. The timeline runs from a couple of days before today to the latest event end, clamped to a sane span.
const TRACK_DAY_PX = 40;
const TRACK_BAR_H = 22;
const TRACK_LANE_GAP = 4;
const TRACK_LABEL_PX = 132;
const TRACK_LEAD_DAYS = 2;
const TRACK_MIN_DAYS = 30;
const TRACK_MAX_DAYS = 120;

function renderTracks(now: Date) {
  const rangeStart = addDays(startOfDay(now), -TRACK_LEAD_DAYS);
  const rangeStartMs = rangeStart.getTime();

  /**
   * The rows this render will draw, one per TRACKS entry, each carrying the events that landed on it. A type with no
   * track (GO Battle League, GO Pass) has no row, so it is dropped; an event ending before the window's left edge is
   * skipped.
   *
   * Each row holds its own items rather than a second Map holding them beside TRACKS, so the drawing pass below reads
   * `track.items` instead of looking the row up again — a lookup by a key TRACKS was the source of, which has no answer
   * for a miss and so is a `Map#get` that cannot fail being made to look like one that can.
   */
  const byType = new Map<string, { type: string; label: string; items: TrackItem[] }>(
    TRACKS.map((t) => [t.type, { ...t, items: [] }]),
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

    if (hiddenFor(prefs, view).has(ev.heading)) {
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

  els.events.replaceChildren();

  const inner = el('div', 'tracks-inner');
  inner.style.gridTemplateColumns = `${TRACK_LABEL_PX}px ${width}px`;
  inner.style.setProperty('--track-day', `${TRACK_DAY_PX}px`);

  const corner = el('div', 'track-corner', 'Tracks');
  const axis = el('div', 'track-axis');
  axis.style.width = `${width}px`;

  // One date label per week down the axis; the daily gridline comes from the CSS background, not a node per day.
  for (let d = 0; d < span; d += 7) {
    const tick = el('span', 'axis-tick', dayFmt.format(addDays(rangeStart, d)));
    tick.style.left = `${d * TRACK_DAY_PX}px`;
    axis.append(tick);
  }

  inner.append(corner, axis);

  let shown = 0;

  for (const track of byType.values()) {
    /**
     * The right edge needs a guard of its own, mirroring the `win[1] <= rangeStartMs` one above: `span` is clamped to
     * TRACK_MAX_DAYS where `latestEnd` is not, so an event starting past `rangeEndMs` clips to a negative width, draws
     * at the 20px minimum somewhere past the lane's own right edge — `.track-lane` sets no `overflow` and
     * `.tracks-scroll` scrolls — and is counted in the tally. Dropped before `packLanes` so it cannot claim a lane and
     * raise the row's height for a bar nobody can see.
     */
    const items = track.items.filter((it) => it.startMs < rangeEndMs).sort((a, b) => a.startMs - b.startMs);

    // A track the filter has switched off drops out entirely. Only when it is also empty, so a type sharing its row
    // with a still-visible heading keeps the row and its visible events.
    if (!items.length && filteredTypes.has(track.type)) {
      continue;
    }

    const lanes = packLanes(items);
    const rowH = Math.max(1, lanes) * (TRACK_BAR_H + TRACK_LANE_GAP) + TRACK_LANE_GAP;

    const label = el('div', 'track-label', track.label);
    label.style.height = `${rowH}px`;

    const lane = el('div', 'track-lane');
    lane.style.width = `${width}px`;
    lane.style.height = `${rowH}px`;

    for (const it of items) {
      const left = Math.max(it.startMs, rangeStartMs);
      const right = Math.min(it.endMs, rangeEndMs);

      const bar = el('a', `bar ${statusOf(it.ev, now).kind}${typeClass(it.ev.eventType)}`, it.ev.name);
      bar.classList.toggle('new', isNew(it.ev));
      bar.href = it.ev.link;
      bar.target = '_blank';
      bar.rel = 'noopener';
      bar.title = `${it.ev.name} — ${timeRange(it.ev)}`;
      bar.style.left = `${((left - rangeStartMs) / DAY_MS) * TRACK_DAY_PX}px`;
      bar.style.width = `${Math.max(TRACK_DAY_PX / 2, ((right - left) / DAY_MS) * TRACK_DAY_PX)}px`;
      bar.style.top = `${TRACK_LANE_GAP + it.lane * (TRACK_BAR_H + TRACK_LANE_GAP)}px`;
      bar.style.height = `${TRACK_BAR_H}px`;
      lane.append(bar);
      shown += 1;
    }

    inner.append(label, lane);
  }

  const todayX = ((startOfDay(now).getTime() - rangeStartMs) / DAY_MS) * TRACK_DAY_PX;
  const todayLine = el('div', 'track-today');
  todayLine.style.left = `${TRACK_LABEL_PX + todayX}px`;
  inner.append(todayLine);

  const scroll = el('div', 'tracks-scroll');
  scroll.append(inner);

  const outer = el('div', 'tracks');
  outer.append(scroll);
  els.events.append(outer);

  els.count.textContent = shown ? `${shown} event${shown === 1 ? '' : 's'} across the tracks` : 'No events to show';
}

function render() {
  const now = new Date();

  if (view === 'calendar') {
    renderCalendar(now);
  } else if (view === 'tracks') {
    renderTracks(now);
  } else {
    renderCards(now);
  }

  /**
   * Here rather than in each view's own count line, because all three write that themselves and this says the same
   * thing in every one of them — a calendar or tracks bar can only mark a new event, so the header is where clearing
   * lives.
   */
  const newly = newlyVisible(now).length;
  els.newly.hidden = newly === 0;
  els.newCount.textContent = `${newly} new event${newly === 1 ? '' : 's'}`;

  /**
   * Driven from here rather than from the handle's own click so `filtersOpen` is the only thing that says whether the
   * panel shows. fillTypes() rebuilds the chips on each fetch and would otherwise have to remember the state itself,
   * and the markup's initial `hidden` and `aria-expanded` could drift from it. The label stays neutral because
   * `aria-expanded` announces the state; the title is for the pointer, which gets no such announcement from a glyph.
   */
  els.filters.hidden = !filtersOpen;
  els.discloseFilters.setAttribute('aria-expanded', String(filtersOpen));
  els.discloseFilters.title = `${filtersOpen ? 'Hide' : 'Show'} filters`;

  // Both halves from the one source, for the same reason: the dimming is for the eye and `aria-pressed` for everyone
  // else, so a chip that wrote one without the other would be off to half its readers and on to the rest.
  for (const { on, chip } of Object.values(reveals)) {
    chip.classList.toggle('off', !on);
    chip.setAttribute('aria-pressed', String(on));
  }

  for (const { scope, btn } of [
    { scope: 'global', btn: els.scopeGlobal },
    { scope: 'view', btn: els.scopeView },
  ]) {
    const on = prefs.filterScope === scope;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  /**
   * The type chips are painted here rather than where they are built, so that one pass writes the state of all nineteen
   * controls in the panel and a change of view or of scope repaints the row without rebuilding it. That matters because
   * under a per-view scope the set in force changes with the view, and a row still showing the last view's set would
   * misreport what is filtering the page — the chips would be a legend for a set no longer being read.
   */
  const hidden = hiddenFor(prefs, view);

  for (const { heading, chip } of typeChips) {
    const on = !hidden.has(heading);
    chip.classList.toggle('off', !on);
    chip.setAttribute('aria-pressed', String(on));
  }

  // Spent by whichever view just drew, so the animation plays once per fetch rather than on every minute's re-render.
  entering = false;
}

function setView(next: View) {
  view = next;

  for (const { name, btn } of [
    { name: 'cards', btn: els.viewCards },
    { name: 'calendar', btn: els.viewCalendar },
    { name: 'tracks', btn: els.viewTracks },
  ]) {
    const on = view === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  // Both bucket reveals only mean anything for the cards: the calendar and tracks views show a fixed window regardless,
  // and neither can draw a dateless event in the first place — windowOf() gives it no window to place.
  for (const chip of [els.showPast, els.showUndated]) {
    chip.hidden = view !== 'cards';
  }

  render();
}

/**
 * Switch which hidden-type set the chips edit and the views read. Persisted, unlike the view itself, because the sets
 * it chooses between are: a scope that fell back to global on reload would leave a reader's per-view filtering saved
 * and silently out of force, which is worse than not having offered it. render() does the rest — it repaints the
 * segments, and the chip row along with them.
 */
function setScope(next: Prefs['filterScope']) {
  prefs.filterScope = next;
  persist('filterScope');
  render();
}

/**
 * Rebuild the per-type filter chips from the categories the feed currently carries. A chip is on when its type is not
 * in the hidden set; clicking one updates that set, persists it and re-renders.
 *
 * Each chip also wears its type's colour class, which turns the row into the legend for the colour-coded cards, bars
 * and bars. That needs the `eventType` slug the colours are keyed by, while the filters themselves are keyed by the
 * human `heading` — so the pairing is read off the events rather than kept as a second list that could drift out of
 * step with the feed.
 */
function fillTypes() {
  const slugs = new Map<string, string>();

  for (const e of events) {
    if (e.heading && !slugs.has(e.heading)) {
      slugs.set(e.heading, e.eventType);
    }
  }

  els.typeFilters.replaceChildren();
  typeChips.length = 0;

  // The entries sorted rather than the keys, so the slug arrives with its heading. Going back for it with a `get` was a
  // second lookup nothing joins to the first, and so a `string | undefined` for a key that came out of the same Map.
  // The comparator is spelled out because it is over pairs: a bare `.sort()` would stringify each one whole.
  for (const [heading, eventType] of [...slugs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const chip = el('button', `chip${typeClass(eventType)}`, heading);
    chip.type = 'button';
    typeChips.push({ heading, chip });

    chip.addEventListener('click', () => {
      const hidden = hiddenFor(prefs, view);

      if (hidden.has(heading)) {
        hidden.delete(heading);
      } else {
        hidden.add(heading);
      }

      // Whichever set that was. Naming it from the scope rather than from the set means the two cannot disagree about
      // where a click just went, which is the one way a chip could take effect and then not survive a reload.
      persist(prefs.filterScope === 'view' ? 'hiddenByView' : 'hiddenTypes');
      render();
    });

    els.typeFilters.append(chip);
  }
}

/**
 * One feed, checked to be a list. `Response#json` answers `any`, and the `Array.isArray` below is the whole of what
 * says otherwise — it narrows no further than `any[]` and nothing at the type level reads an entry, so the element type
 * is a claim rather than something the throw enforces. What makes it a safe one is what normalise() then does with an
 * entry: every field is either handed to parseDate(), which answers null for anything that is not a date, or set as
 * text on a node. So a feed that changed shape draws `undefined` rather than doing something with it.
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

async function load() {
  els.count.textContent = 'Loading events…';

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
  routeIndex = index.status === 'fulfilled' ? index.value : {};

  if (feed.status === 'rejected' && local.status === 'rejected') {
    events = [];
    els.events.replaceChildren();
    els.count.textContent = `Could not load events: ${said(feed.reason)}`;
    return;
  }

  /**
   * Keyed by eventID with the local pass last, so a repo entry overrides a feed event of the same ID rather than
   * duplicating it — see mergeEvents(), which parses the dates and sorts by start as well.
   */
  events = mergeEvents(feed.status === 'fulfilled' ? feed.value : [], local.status === 'fulfilled' ? local.value : []);
  settleSeen();
  entering = true;
  fillTypes();
  render();
}

/**
 * A link from the Routes page arrives as `events.html#event=<eventID>`, and lands by searching for that event's name.
 * Reusing the search box rather than scrolling to the card leaves the reader somewhere they recognise: the term is
 * visible in the box, and emptying it is how they already know to get the other 59 cards back.
 *
 * The event is always there to find — the linter rejects a `<pgr:event>` naming an ID that data/events.json does not
 * carry, so a chip cannot point at one this page has never heard of.
 */
function focusHashEvent() {
  const id = new URLSearchParams(location.hash.slice(1)).get('event');
  const match = id && events.find((e) => e.eventID === id);

  if (!match) {
    return;
  }

  /**
   * Unhide its type, or a reader with that filter off would follow the link and be shown nothing at all — seven types
   * start hidden. Not persisted: this is for the one arrival, not a standing change to what they chose to see. A card
   * they dismissed individually stays dismissed, which is a decision about that event rather than a blanket rule.
   */
  hiddenFor(prefs, view).delete(match.heading);

  els.search.value = match.name;
  render();
}

// Also on hashchange, so the back button and a link followed from this page behave like a fresh arrival.
window.addEventListener('hashchange', focusHashEvent);

els.search.addEventListener('input', render);
els.discloseFilters.addEventListener('click', () => {
  filtersOpen = !filtersOpen;
  render();
});

// Bound over the rows rather than three times over, since `reveals` already pairs each flag with its chip and a fourth
// reveal should not need a listener written for it. render() is what puts the new state back on the chip, the same as
// for `filtersOpen`.
for (const reveal of Object.values(reveals)) {
  reveal.chip.addEventListener('click', () => {
    reveal.on = !reveal.on;
    render();
  });
}

els.refresh.addEventListener('click', load);

/**
 * Acknowledge exactly the events the header just reported, so the number always falls to zero.
 *
 * That population is what the cards view draws, which the other two cannot match: the calendar paints one month at a
 * time, and the tracks only the types TRACKS has a row for, over a bounded window. So the count agrees with the marks
 * on screen in the cards view and in neither of the others, in both directions — a new event in next month is counted
 * before the calendar reaches it, and a new event that has ended is ringed in a past month without being counted. Cards
 * is the one worth making exact, because it is the only view whose own total sits in the same header: a number larger
 * than the one beside it reads as a contradiction, where a ring nothing announces reads as a detail.
 *
 * Revealing a hidden type months later does therefore surface a batch of marks, which is right — those events genuinely
 * are ones the reader has never been shown, and this clears them in one press. Revealing a recurring one surfaces
 * nothing, since isNew() refuses those whatever is ticked.
 */
els.markSeen.addEventListener('click', () => {
  for (const ev of newlyVisible(new Date())) {
    recordSeen(ev);
  }

  persist('seen');
  render();
});
els.viewCards.addEventListener('click', () => setView('cards'));
els.viewCalendar.addEventListener('click', () => setView('calendar'));
els.viewTracks.addEventListener('click', () => setView('tracks'));
els.scopeGlobal.addEventListener('click', () => setScope('global'));
els.scopeView.addEventListener('click', () => setScope('view'));

els.reset.addEventListener('click', () => {
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

  // Not a stored preference, so clearing the keys above leaves them as they were — but they are three of the same chips
  // Reset puts back, and a Reset that returns the page to its defaults cannot leave one of them widening it.
  for (const reveal of Object.values(reveals)) {
    reveal.on = false;
  }

  settleSeen();
  fillTypes();
  render();
});

// Re-render every minute so relative labels stay honest, and re-fetch every tenth minute to catch new events. A tab
// coming back into view re-renders straight away rather than waiting out the rest of its minute, since a background tab
// has its timers throttled and its labels are the part a returning reader looks at first. The feed waits for the next
// re-fetch tick either way.
setInterval(() => {
  tick += 1;

  if (tick % REFETCH_EVERY === 0) {
    load();
  } else if (events.length) {
    render();
  }
}, TICK_MS);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    render();
  }
});

// Only the first load lands a fragment: a ten-minute re-fetch calling this would overwrite whatever the reader has
// since typed into the search box.
load().then(focusHashEvent);
