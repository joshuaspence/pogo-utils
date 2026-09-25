/**
 * The events calendar page. Fetches Leek Duck's event feed (through ScrapedDuck's JSON mirror) live in the browser and
 * renders current, upcoming and — on request — recently ended or undated Pokémon GO events. The feed is read directly,
 * the same way the map reads the GPX files rather than a baked-in copy.
 *
 * Alongside the feed it loads `data/events.json`, a repo-defined list in the same shape, and merges the two: an entry
 * there whose `eventID` matches a feed event overrides it, otherwise it adds one the feed does not carry (an official
 * event Leek Duck has not listed yet, say). Either source failing still renders the other. A third,
 * `entries-by-event.json`, says which events have routes here, so a card can link through to them on the map.
 *
 * Three views over the same data: a card list grouped by status, a month grid where every event is a bar spanning the
 * days it covers within each week, and a Tracks timeline laying events out as horizontal bars in fixed category rows (a
 * Gantt chart). The view toggle switches between them; the search box, type filters and dismissals apply to all three.
 */

import { ENTRIES_BY_EVENT } from './generated.js';
import RECURRING_TYPES from './recurring-types.js';

const FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';
const LOCAL_URL = 'data/events.json';

// How many routes and waypoints each event has here, by `eventID`, once the index has loaded. Empty until then, and it
// stays empty if that fetch fails — see load(), which tolerates any one of the three sources going missing.
let routeIndex = {};

/**
 * How often to recompute the "starts in…/ends in…" labels against the wall clock, and — every REFETCH_EVERY ticks —
 * pull the feed again. The feed itself carries `cache-control: max-age=300`, so re-fetching more often than that only
 * hits the browser cache.
 */
const TICK_MS = 60_000;
const REFETCH_EVERY = 10;

const DAY_MS = 86_400_000;

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

/**
 * Leek Duck gives times two ways. A naive datetime ("2026-09-21T06:00:00.000", no zone) is a *local* event — 6am
 * wherever you are, the same wall-clock in every timezone — which the browser's Date parses in local time. A datetime
 * with a trailing Z ("…T20:00:00.000Z") is one absolute instant worldwide (e.g. GO Battle League rotations), which Date
 * parses as UTC. Both therefore render correctly through toLocaleString; the distinction only changes the label.
 */
const HAS_ZONE = /[zZ]|[+-]\d{2}:?\d{2}$/;

/**
 * The type filters and per-event dismissals persist in localStorage so a reader's choices survive a reload. Types are
 * stored as the *hidden* set rather than the visible one, so a category the feed adds later shows up by default instead
 * of being silently filtered out by a stale allow-list. The Reset control clears every key.
 *
 * One key per set rather than one object holding all of them, so each carries its own absent-versus-empty distinction
 * and writing one cannot decide another. `hiddenTypes` needs that: absent means a first visit and so DEFAULT_HIDDEN,
 * where empty means a reader who unticked everything, and in a shared object saving any one set would settle that
 * question for all of them.
 *
 * The property names are the ones `prefs` uses, which is what lets persist() take a name alone.
 */
const KEYS = {
  hiddenTypes: 'events:hidden-types',
  dismissed: 'events:dismissed',
  seen: 'events:seen',
};

/**
 * The single object these keys replaced, read once to carry an existing reader's choices across — see migrateLegacy().
 *
 * It keeps the `pgo-` prefix the others have dropped because this one is not ours to name: it is the key sitting in
 * readers' browsers already, and spelling it any other way finds nothing and silently discards their choices.
 */
const LEGACY_KEY = 'pgo-events:prefs';

/**
 * The sets that object carried, and so all migrateLegacy() can bring across. `seen` is deliberately not among them: it
 * has no legacy value, and writing it empty would say a reader who has been here for months has seen nothing, marking
 * every event on the page new. Left absent instead, it seeds from the feed like a first visit — see settleSeen().
 */
const LEGACY_SETS = ['hiddenTypes', 'dismissed'];

/**
 * The types hidden on a first visit, so the default view leads with the events a reader is more likely to plan around:
 * the recurring ones, which fire every week and crowd the feed, plus three that describe a standing state rather than
 * somewhere to be at a time — a GO Battle League rotation, a GO Pass and Choose Your Path. They are `heading`s, the
 * currency of `hiddenTypes`, so the type checkboxes read them as off. Once any preference is saved the stored hidden set
 * is authoritative, so unticking one of these sticks; Reset returns to this default rather than to an empty set.
 *
 * The three extras stay out of RECURRING_TYPES because that list also says which types the trimmed calendar feed
 * (events.ics) leaves out, and each of these is a dated one-off worth keeping in a subscription.
 */
const DEFAULT_HIDDEN = [...RECURRING_TYPES, 'Choose Your Path', 'GO Battle League', 'GO Pass'];

// The same list as a set, for the per-event lookups isNew() and settleSeen() do over every event on every render.
const RECURRING = new Set(RECURRING_TYPES);

/**
 * One stored set, or null where its key has never been written. Null rather than an empty set because the two mean
 * different things to `hiddenTypes`, and unreadable storage (private mode, disabled) is the same as never written.
 */
function readSet(key) {
  try {
    const stored = localStorage.getItem(key);
    const parsed = stored === null ? null : JSON.parse(stored);
    return Array.isArray(parsed) ? new Set(parsed) : null;
  } catch {
    return null;
  }
}

/**
 * Carry a reader's choices over from the single object the separate keys replaced, then drop it, so the old shape is
 * known to this one function rather than to every read. Both sets are written even when empty, because an absent key
 * would otherwise read as a first visit and hand back the default hidden types to someone who had unticked them.
 *
 * A value that will not parse is left in place rather than deleted: it is data we could not read, and the defaults
 * apply meanwhile exactly as they would for a first visit.
 */
function migrateLegacy() {
  try {
    const stored = localStorage.getItem(LEGACY_KEY);

    if (stored === null) {
      return;
    }

    const parsed = JSON.parse(stored);

    for (const name of LEGACY_SETS) {
      localStorage.setItem(KEYS[name], JSON.stringify(Array.isArray(parsed?.[name]) ? parsed[name] : []));
    }

    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* Nothing to carry over, or storage is unavailable. */
  }
}

function loadPrefs() {
  migrateLegacy();

  return {
    hiddenTypes: readSet(KEYS.hiddenTypes) ?? new Set(DEFAULT_HIDDEN),
    dismissed: readSet(KEYS.dismissed) ?? new Set(),

    // Null until the first feed settles it, which is what tells a first visit from a reader who has seen nothing new.
    seen: readSet(KEYS.seen),
  };
}

const prefs = loadPrefs();

/**
 * Write one set back, named rather than keyed so a call site cannot pair a key with the wrong set, and one at a time so
 * ticking a type filter does not rewrite the dismissals beside it.
 */
function persist(name) {
  try {
    localStorage.setItem(KEYS[name], JSON.stringify([...prefs[name]]));
  } catch {
    /* Storage may be unavailable; the filters still work for the rest of the session. */
  }
}

const els = {
  count: document.getElementById('count'),
  newly: document.getElementById('newly'),
  newCount: document.getElementById('newCount'),
  markSeen: document.getElementById('markSeen'),
  search: document.getElementById('search'),
  typeFilters: document.getElementById('typeFilters'),
  showPast: document.getElementById('showPast'),
  showUndated: document.getElementById('showUndated'),
  showHidden: document.getElementById('showHidden'),
  refresh: document.getElementById('refresh'),
  reset: document.getElementById('reset'),
  viewCards: document.getElementById('viewCards'),
  viewCalendar: document.getElementById('viewCalendar'),
  viewTracks: document.getElementById('viewTracks'),
  events: document.getElementById('events'),
};

let events = []; // normalised feed entries, sorted by start
let tick = 0;

// Whether the next render is the one that follows a fetch, which is the only one that plays the cards' entry animation.
// render() also runs every minute to keep the relative labels honest, and animating those would be a twitch.
let entering = false;
let view = 'cards'; // 'cards' | 'calendar' | 'tracks'
let calMonth = null; // first-of-month Date the calendar view is showing; set lazily to the current month

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

function parseDate(s) {
  if (!s) {
    return null;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * A coarse "in 3 days"/"5 hours ago", picking the largest unit that keeps the number readable. Intl handles the
 * wording and pluralisation for the user's locale.
 */
function relative(target, now) {
  const mins = Math.round((target - now) / 60_000);
  const abs = Math.abs(mins);

  if (abs < 60) {
    return relFmt.format(mins, 'minute');
  }

  if (abs < 60 * 24) {
    return relFmt.format(Math.round(mins / 60), 'hour');
  }

  return relFmt.format(Math.round(mins / (60 * 24)), 'day');
}

/**
 * Where an event sits relative to now. `active` covers both a running window and one that has started with no end.
 * `tbd` is an event the feed carries with no date at all, both `start` and `end` null.
 *
 * That is rarely the announced-but-unscheduled event it sounds like. ScrapedDuck reads an event's identity off Leek
 * Duck's event list but joins its dates in from `leekduck.com/feeds/events.json`, and that feed drops an event days
 * before the list page does, so everything under the list's "Recently ended" divider reaches us dateless. On 2026-09-24
 * the feed's five dateless events were exactly that divider's five, among them
 * `gbl-twilight-trails_great-league_ultra-league-mega-edition_willpower-cup-great-league-edition`, which Leek Duck's own
 * page dates 15 to 22 September. So `tbd` mostly means an event already over whose dates went missing on the way here —
 * which is why renderCards() keeps the bucket behind a toggle rather than showing it by default.
 */
function statusOf(ev, now) {
  if (!ev.start && !ev.end) {
    return { kind: 'tbd' };
  }

  if (ev.start && now < ev.start) {
    return { kind: 'upcoming', at: ev.start };
  }

  if (ev.end && now > ev.end) {
    return { kind: 'ended', at: ev.end };
  }

  return { kind: 'active', at: ev.end };
}

/**
 * The instant window an event occupies for the calendar's overlap tests. A dated event is [start, end]; a start with no
 * end is a single-day marker on its start date rather than an open-ended band that would paint every following day; an
 * end with no start is a single day at its end date. A dateless event has no window and never lands on the grid.
 */
function windowOf(ev) {
  if (!ev.start && !ev.end) {
    return null;
  }

  if (ev.start && ev.end) {
    return [ev.start.getTime(), ev.end.getTime()];
  }

  const dayStart = startOfDay(ev.start ?? ev.end).getTime();
  return [dayStart, dayStart + DAY_MS];
}

function overlaps(win, from, to) {
  return win !== null && win[0] < to && win[1] > from;
}

/**
 * The columns of one week row an event's window touches, as `[first, last]` inclusive, or null for a week it misses
 * entirely. A window is one contiguous interval, so the columns it covers are contiguous too and the pair describes them
 * completely. A single-day event yields a one-column span and needs no special case.
 */
function weekColumns(win, weekStart) {
  let first = -1;
  let last = -1;

  for (let col = 0; col < 7; col += 1) {
    const dayStart = addDays(weekStart, col).getTime();

    if (overlaps(win, dayStart, dayStart + DAY_MS)) {
      first = first === -1 ? col : first;
      last = col;
    }
  }

  return first === -1 ? null : [first, last];
}

const GROUPS = {
  active: 'Happening now',
  upcoming: 'Upcoming',
  tbd: 'Date unknown',
  ended: 'Recently ended',
};

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
 * The class marking an event's type, so CSS can give each type its own colour (see the `.type-*` rules in events.css).
 * Takes the stable `eventType` slug like the Tracks rows, not the human `heading`. Empty for a feed entry missing the
 * field, in which case the colour consumers fall back to their default. Worn by the card, the calendar bar, the
 * timeline bar and the filter chip alike, which is what keeps one type reading the same colour in all four.
 */
function typeClass(eventType) {
  return eventType ? ` type-${eventType}` : '';
}

function el(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text != null) {
    node.textContent = text;
  }

  return node;
}

function timeRange(ev) {
  if (!ev.start && !ev.end) {
    return 'Date unknown';
  }

  const local = ev.start && !ev.startHasZone ? ' (your local time)' : '';

  if (ev.start && ev.end) {
    return `${dateFmt.format(ev.start)} – ${dateFmt.format(ev.end)}${local}`;
  }

  if (ev.start) {
    return `From ${dateFmt.format(ev.start)}${local}`;
  }

  return `Until ${dateFmt.format(ev.end)}`;
}

/**
 * Whether an event survives the type-filter, dismissal and search-term filters — the ones that mean "I do not want to
 * see this", so every view honours them. The status reveals are isRevealed()'s, layered on top of this. A dismissed
 * event stays hidden unless "Show hidden" is ticked, which mirrors how "Show ended" reveals past events — the choice is
 * a temporary reveal, not a change to the saved dismissal.
 */
function isVisible(ev) {
  if (prefs.hiddenTypes.has(ev.heading)) {
    return false;
  }

  if (prefs.dismissed.has(ev.eventID) && !els.showHidden.checked) {
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
function isRevealed(ev, now) {
  const kind = statusOf(ev, now).kind;
  return (kind !== 'ended' || els.showPast.checked) && (kind !== 'tbd' || els.showUndated.checked);
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
function isNew(ev) {
  return prefs.seen !== null && !RECURRING.has(ev.heading) && !prefs.seen.has(ev.eventID);
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
function newlyVisible(now) {
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

/**
 * "2 routes · 1 waypoint" — each kind the event has, pluralised. A kind it has none of is left out rather than written
 * as a zero, so an event with only a waypoint does not advertise the routes it lacks.
 */
function routeSummary({ routes, waypoints }) {
  const parts = [];

  if (routes) {
    parts.push(`${routes} route${routes === 1 ? '' : 's'}`);
  }

  if (waypoints) {
    parts.push(`${waypoints} waypoint${waypoints === 1 ? '' : 's'}`);
  }

  return parts.join(' · ');
}

function card(ev, now) {
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
  const acknowledge = (e) => {
    // The left and middle buttons are the two that open the link. Chrome reports a right click as an `auxclick` too,
    // and that opens a menu rather than the event.
    if (e.button > 1 || !isNew(ev)) {
      return;
    }

    prefs.seen.add(ev.eventID);
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
      prefs.seen.add(ev.eventID);
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
    const soon = status.kind !== 'ended' && status.at - now < SOON_MS;

    body.append(el('p', `rel${soon ? ' soon' : ''}`, `${verb} ${relative(status.at, now)}`));
  }

  /**
   * What this repository added for the event, linking through to it on the map. Last, so that the absolute dates and the
   * relative ones stay together above it. The fragment is what lands the link on the entry rather than on a page of 81
   * rows. The stylesheet puts the Routes tab's own glyph in front, so the destination is named the same way twice; the
   * accessible name says it in words instead.
   */
  const here = routeIndex[ev.eventID];

  if (here) {
    const summary = routeSummary(here);
    const mapLink = el('a', 'routes', summary);
    mapLink.href = `routes.html#event=${encodeURIComponent(ev.eventID)}`;
    mapLink.title = 'Show on the Routes map';
    mapLink.setAttribute('aria-label', `Show ${summary} for “${ev.name}” on the Routes map`);
    body.append(mapLink);
  }

  cardEl.append(body);
  return cardEl;
}

function renderCards(now) {
  const buckets = { active: [], upcoming: [], tbd: [], ended: [] };
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

  for (const [kind, label] of Object.entries(GROUPS)) {
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
 */
function calBar(ev, now, [first, last], { contLeft, contRight }) {
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

function renderCalendar(now) {
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
   */
  const visible = events
    .filter(isVisible)
    .map((ev) => ({ ev, win: windowOf(ev) }))
    .filter(({ win }) => win !== null);

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
       * having begun earlier means it ran in from the row above; anything starting later than column 0 began inside this
       * week, because it misses the column before.
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

/**
 * Assign each item a `lane` — a sub-row within its track — by greedy interval partitioning: reuse the first lane whose
 * previous bar has already ended, otherwise open a new one. Items must arrive sorted by start. Returns the lane count,
 * which sets the track row's height so overlapping events stack instead of drawing over each other.
 */
function packLanes(items) {
  const laneEnds = [];

  for (const it of items) {
    const free = laneEnds.findIndex((end) => end <= it.startMs);
    const lane = free === -1 ? laneEnds.length : free;

    laneEnds[lane] = it.endMs;
    it.lane = lane;
  }

  return laneEnds.length;
}

function renderTracks(now) {
  const rangeStart = addDays(startOfDay(now), -TRACK_LEAD_DAYS);
  const rangeStartMs = rangeStart.getTime();

  // Bucket visible, dated events by eventType. A type with no track (GO Battle League, GO Pass) has no bucket, so it
  // is dropped; an event ending before the window's left edge is skipped.
  const byType = new Map(TRACKS.map((t) => [t.type, []]));
  let latestEnd = rangeStartMs + TRACK_MIN_DAYS * DAY_MS;

  // Track types whose filter checkbox is unticked, so the whole row can be dropped rather than left as an empty ghost.
  // Keyed by the checkbox's `heading` state alone — a track emptied by dismissals or a search term keeps its row.
  const filteredTypes = new Set();

  for (const ev of events) {
    const bucket = byType.get(ev.eventType);

    if (!bucket) {
      continue;
    }

    if (prefs.hiddenTypes.has(ev.heading)) {
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
    bucket.push({ ev, startMs: win[0], endMs: win[1], lane: 0 });
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

  for (const track of TRACKS) {
    const items = byType.get(track.type).sort((a, b) => a.startMs - b.startMs);

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

  // Spent by whichever view just drew, so the animation plays once per fetch rather than on every minute's re-render.
  entering = false;
}

function setView(next) {
  view = next;

  for (const [name, btn] of [
    ['cards', els.viewCards],
    ['calendar', els.viewCalendar],
    ['tracks', els.viewTracks],
  ]) {
    const on = view === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  // Both bucket reveals only mean anything for the cards: the calendar and tracks views show a fixed window regardless,
  // and neither can draw a dateless event in the first place — windowOf() gives it no window to place.
  for (const box of [els.showPast, els.showUndated]) {
    box.closest('.toggle').hidden = view !== 'cards';
  }

  render();
}

function normalise(raw) {
  return raw.map((e) => ({
    eventID: e.eventID,
    name: e.name,
    heading: e.heading,
    eventType: e.eventType,
    link: e.link,
    image: e.image,
    start: parseDate(e.start),
    end: parseDate(e.end),
    startHasZone: typeof e.start === 'string' && HAS_ZONE.test(e.start),
  }));
}

/**
 * Rebuild the per-type visibility checkboxes from the categories the feed currently carries. A box is checked when its
 * type is not in the hidden set; toggling one updates that set, persists it and re-renders.
 *
 * Each chip also wears its type's colour class, which turns the row into the legend for the colour-coded cards, bars
 * and bars. That needs the `eventType` slug the colours are keyed by, while the filters themselves are keyed by the
 * human `heading` — so the pairing is read off the events rather than kept as a second list that could drift out of step
 * with the feed.
 */
function fillTypes() {
  const slugs = new Map();

  for (const e of events) {
    if (e.heading && !slugs.has(e.heading)) {
      slugs.set(e.heading, e.eventType);
    }
  }

  els.typeFilters.replaceChildren();

  for (const heading of [...slugs.keys()].sort()) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !prefs.hiddenTypes.has(heading);

    const chip = el('label', `type-chip${typeClass(slugs.get(heading))}`);

    if (!box.checked) {
      chip.classList.add('off');
    }

    box.addEventListener('change', () => {
      if (box.checked) {
        prefs.hiddenTypes.delete(heading);
      } else {
        prefs.hiddenTypes.add(heading);
      }

      chip.classList.toggle('off', !box.checked);
      persist('hiddenTypes');
      render();
    });

    chip.append(box, document.createTextNode(` ${heading}`));
    els.typeFilters.append(chip);
  }
}

async function fetchEvents(url) {
  const res = await fetch(url, { cache: 'default' });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  const raw = await res.json();

  if (!Array.isArray(raw)) {
    throw new Error('not a list of events');
  }

  return raw;
}

async function fetchRouteIndex() {
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
   * local file still shows the feed, and a missing index costs the cards their link through to the map and nothing else.
   */
  const [feed, local, index] = await Promise.allSettled([
    fetchEvents(FEED_URL),
    fetchEvents(LOCAL_URL),
    fetchRouteIndex(),
  ]);
  routeIndex = index.status === 'fulfilled' ? index.value : {};

  if (feed.status === 'rejected' && local.status === 'rejected') {
    events = [];
    els.events.replaceChildren();
    els.count.textContent = `Could not load events: ${feed.reason.message}`;
    return;
  }

  // Key by eventID with the local pass last, so a repo entry overrides a feed event of the same ID rather than
  // duplicating it.
  const byId = new Map();

  for (const e of feed.status === 'fulfilled' ? feed.value : []) {
    byId.set(e.eventID, e);
  }

  for (const e of local.status === 'fulfilled' ? local.value : []) {
    byId.set(e.eventID, e);
  }

  events = normalise([...byId.values()]).sort(
    (a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity),
  );
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
  prefs.hiddenTypes.delete(match.heading);
  fillTypes();

  els.search.value = match.name;
  render();
}

// Also on hashchange, so the back button and a link followed from this page behave like a fresh arrival.
window.addEventListener('hashchange', focusHashEvent);

els.search.addEventListener('input', render);
els.showPast.addEventListener('change', render);
els.showUndated.addEventListener('change', render);
els.showHidden.addEventListener('change', render);
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
    prefs.seen.add(ev.eventID);
  }

  persist('seen');
  render();
});
els.viewCards.addEventListener('click', () => setView('cards'));
els.viewCalendar.addEventListener('click', () => setView('calendar'));
els.viewTracks.addEventListener('click', () => setView('tracks'));

els.reset.addEventListener('click', () => {
  prefs.hiddenTypes = new Set(DEFAULT_HIDDEN);
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

  settleSeen();
  fillTypes();
  render();
});

// Re-render every minute so relative labels stay honest, and re-fetch every tenth minute to catch new events. Also
// re-fetch when the tab regains focus after being hidden a while, which is the common "come back to it" case.
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

// Only the first load lands a fragment: a ten-minute re-fetch calling this would overwrite whatever the reader has since
// typed into the search box.
load().then(focusHashEvent);
