/**
 * The events calendar page. Fetches Leek Duck's event feed (through ScrapedDuck's JSON mirror) live in the browser and
 * renders current, upcoming and — on request — recently ended Pokémon GO events. Nothing is built or committed: the
 * feed is the source of truth read directly, the same way the map reads the GPX files rather than a baked-in copy.
 *
 * Two views over the same data: a card list grouped by status, and a month grid where each event shows on every day it
 * covers. The view toggle switches between them; the search box, type filters and dismissals apply to both.
 */

const FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';

/**
 * How often to recompute the "starts in…/ends in…" labels against the wall clock, and — every REFETCH_EVERY ticks —
 * pull the feed again. The feed itself carries `cache-control: max-age=300`, so re-fetching more often than that only
 * hits the browser cache.
 */
const TICK_MS = 60_000;
const REFETCH_EVERY = 10;

const DAY_MS = 86_400_000;

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
 * of being silently filtered out by a stale allow-list. The Reset control clears the whole key.
 */
const STORE_KEY = 'pgo-events:prefs';

function loadPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');

    return {
      hiddenTypes: new Set(Array.isArray(parsed.hiddenTypes) ? parsed.hiddenTypes : []),
      dismissed: new Set(Array.isArray(parsed.dismissed) ? parsed.dismissed : []),
    };
  } catch {
    /* Unreadable or unavailable storage (private mode, disabled): start from a clean slate. */
    return { hiddenTypes: new Set(), dismissed: new Set() };
  }
}

const prefs = loadPrefs();

function persist() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ hiddenTypes: [...prefs.hiddenTypes], dismissed: [...prefs.dismissed] }),
    );
  } catch {
    /* Storage may be unavailable; the filters still work for the rest of the session. */
  }
}

const els = {
  count: document.getElementById('count'),
  search: document.getElementById('search'),
  typeFilters: document.getElementById('typeFilters'),
  showPast: document.getElementById('showPast'),
  showHidden: document.getElementById('showHidden'),
  refresh: document.getElementById('refresh'),
  reset: document.getElementById('reset'),
  viewCards: document.getElementById('viewCards'),
  viewCalendar: document.getElementById('viewCalendar'),
  events: document.getElementById('events'),
};

let events = []; // normalised feed entries, sorted by start
let tick = 0;
let view = 'cards'; // 'cards' | 'calendar'
let calMonth = null; // first-of-month Date the calendar view is showing; set lazily to the current month

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

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
 * `tbd` is an announced event with no date yet — the feed leaves both `start` and `end` null for these.
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

const GROUPS = {
  active: 'Happening now',
  upcoming: 'Upcoming',
  tbd: 'Date to be announced',
  ended: 'Recently ended',
};

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
    return 'Date to be announced';
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
 * Whether an event survives the type-filter, dismissal and search-term filters. Shared by both views; the card view
 * layers status/showPast filtering on top. A dismissed event stays hidden unless "Show hidden" is ticked, which mirrors
 * how "Show ended" reveals past events — the choice is a temporary reveal, not a change to the saved dismissal.
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

function card(ev, now) {
  const status = statusOf(ev, now);
  const dismissed = prefs.dismissed.has(ev.eventID);
  const cardEl = el('article', `card ${status.kind}${dismissed ? ' dismissed' : ''}`);

  // A transparent overlay link makes the whole card open Leek Duck while keeping the dismiss button a sibling rather
  // than a child: an anchor may not contain interactive content.
  const link = el('a', 'card-link');
  link.href = ev.link;
  link.target = '_blank';
  link.rel = 'noopener';
  link.setAttribute('aria-label', `Open “${ev.name}” on Leek Duck`);
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

    persist();
    render();
  });

  cardEl.append(dismiss);

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
    body.append(el('p', 'rel', `${verb} ${relative(status.at, now)}`));
  }

  cardEl.append(body);
  return cardEl;
}

function renderCards(now) {
  const showPast = els.showPast.checked;
  const buckets = { active: [], upcoming: [], tbd: [], ended: [] };
  let shown = 0;

  for (const ev of events) {
    if (!isVisible(ev)) {
      continue;
    }

    const kind = statusOf(ev, now).kind;

    if (kind === 'ended' && !showPast) {
      continue;
    }

    buckets[kind].push(ev);
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

    els.events.append(el('h2', 'group', label));
    const grid = el('div', 'grid');

    for (const ev of list) {
      grid.append(card(ev, now));
    }

    els.events.append(grid);
  }

  const suffix = prefs.dismissed.size ? ` · ${prefs.dismissed.size} dismissed` : '';
  els.count.textContent = shown ? `${shown} event${shown === 1 ? '' : 's'}${suffix}` : `No events to show${suffix}`;
}

function pill(ev, now) {
  const node = el('a', `pill ${statusOf(ev, now).kind}`, ev.name);
  node.href = ev.link;
  node.target = '_blank';
  node.rel = 'noopener';
  node.title = `${ev.name} — ${timeRange(ev)}`;
  return node;
}

// Up to this many pills per day before the rest collapse into a "+N more" line, so a crowded day cannot blow out the
// row height.
const PILLS_PER_DAY = 4;

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

  const visible = events.filter(isVisible).map((ev) => ({ ev, win: windowOf(ev) }));

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

  for (const name of WEEKDAYS) {
    grid.append(el('div', 'cal-wd', name));
  }

  const todayKey = startOfDay(now).getTime();

  for (let i = 0; i < weeks * 7; i += 1) {
    const day = addDays(gridStart, i);
    const dayStart = day.getTime();
    const cell = el('div', 'cal-day');

    if (day.getMonth() !== month) {
      cell.classList.add('other');
    }

    if (dayStart === todayKey) {
      cell.classList.add('today');
    }

    cell.append(el('span', 'daynum', String(day.getDate())));

    const onDay = visible.filter((v) => overlaps(v.win, dayStart, dayStart + DAY_MS));

    for (const { ev } of onDay.slice(0, PILLS_PER_DAY)) {
      cell.append(pill(ev, now));
    }

    if (onDay.length > PILLS_PER_DAY) {
      cell.append(el('span', 'more', `+${onDay.length - PILLS_PER_DAY} more`));
    }

    grid.append(cell);
  }

  els.events.append(grid);

  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();
  const inMonth = visible.filter((v) => overlaps(v.win, monthStart, monthEnd)).length;
  els.count.textContent = `${monthFmt.format(calMonth)} · ${inMonth} event${inMonth === 1 ? '' : 's'}`;
}

function render() {
  const now = new Date();

  if (view === 'calendar') {
    renderCalendar(now);
  } else {
    renderCards(now);
  }
}

function setView(next) {
  view = next;
  const calendar = view === 'calendar';
  els.viewCards.classList.toggle('active', !calendar);
  els.viewCalendar.classList.toggle('active', calendar);
  els.viewCards.setAttribute('aria-pressed', String(!calendar));
  els.viewCalendar.setAttribute('aria-pressed', String(calendar));

  // "Show ended" only means anything for the card buckets; the calendar shows a whole month regardless.
  els.showPast.closest('.toggle').hidden = calendar;

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
 */
function fillTypes() {
  const headings = [...new Set(events.map((e) => e.heading).filter(Boolean))].sort();
  els.typeFilters.replaceChildren();

  for (const heading of headings) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !prefs.hiddenTypes.has(heading);

    const chip = el('label', 'type-chip');

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
      persist();
      render();
    });

    chip.append(box, document.createTextNode(` ${heading}`));
    els.typeFilters.append(chip);
  }
}

async function load() {
  els.count.textContent = 'Loading events…';

  try {
    const res = await fetch(FEED_URL, { cache: 'default' });

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }

    const raw = await res.json();

    if (!Array.isArray(raw)) {
      throw new Error('feed is not a list of events');
    }

    events = normalise(raw).sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity));
    fillTypes();
    render();
  } catch (err) {
    events = [];
    els.events.replaceChildren();
    els.count.textContent = `Could not load events: ${err.message}`;
  }
}

els.search.addEventListener('input', render);
els.showPast.addEventListener('change', render);
els.showHidden.addEventListener('change', render);
els.refresh.addEventListener('click', load);
els.viewCards.addEventListener('click', () => setView('cards'));
els.viewCalendar.addEventListener('click', () => setView('calendar'));

els.reset.addEventListener('click', () => {
  prefs.hiddenTypes.clear();
  prefs.dismissed.clear();

  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* Nothing to clear if storage is unavailable. */
  }

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

load();
