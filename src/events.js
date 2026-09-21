/**
 * The events calendar page. Fetches Leek Duck's event feed (through ScrapedDuck's JSON mirror) live in the browser and
 * renders current, upcoming and — on request — recently ended Pokémon GO events. Nothing is built or committed: the
 * feed is the source of truth read directly, the same way the map reads the GPX files rather than a baked-in copy.
 */

const FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';

/**
 * How often to recompute the "starts in…/ends in…" labels against the wall clock, and — every REFETCH_EVERY ticks —
 * pull the feed again. The feed itself carries `cache-control: max-age=300`, so re-fetching more often than that only
 * hits the browser cache.
 */
const TICK_MS = 60_000;
const REFETCH_EVERY = 10;

/**
 * Leek Duck gives times two ways. A naive datetime ("2026-09-21T06:00:00.000", no zone) is a *local* event — 6am
 * wherever you are, the same wall-clock in every timezone — which the browser's Date parses in local time. A datetime
 * with a trailing Z ("…T20:00:00.000Z") is one absolute instant worldwide (e.g. GO Battle League rotations), which Date
 * parses as UTC. Both therefore render correctly through toLocaleString; the distinction only changes the label.
 */
const HAS_ZONE = /[zZ]|[+-]\d{2}:?\d{2}$/;

const els = {
  count: document.getElementById('count'),
  search: document.getElementById('search'),
  category: document.getElementById('category'),
  showPast: document.getElementById('showPast'),
  refresh: document.getElementById('refresh'),
  events: document.getElementById('events'),
};

let events = []; // normalised feed entries, sorted by start
let tick = 0;

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function parseDate(s) {
  if (!s) {
    return null;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
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

function card(ev, now) {
  const status = statusOf(ev, now);

  const link = el('a', `card ${status.kind}`);
  link.href = ev.link;
  link.target = '_blank';
  link.rel = 'noopener';

  if (ev.image) {
    const img = el('img', 'thumb');
    img.src = ev.image;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.remove());
    link.append(img);
  }

  const body = el('div', 'body');
  body.append(el('span', 'badge', ev.heading || ev.eventType));
  body.append(el('h2', null, ev.name));
  body.append(el('p', 'when', timeRange(ev)));

  if (status.at) {
    const verb = status.kind === 'upcoming' ? 'Starts' : status.kind === 'ended' ? 'Ended' : 'Ends';
    body.append(el('p', 'rel', `${verb} ${relative(status.at, now)}`));
  }

  link.append(body);
  return link;
}

function render() {
  const now = new Date();
  const term = els.search.value.trim().toLowerCase();
  const category = els.category.value;
  const showPast = els.showPast.checked;

  const buckets = { active: [], upcoming: [], tbd: [], ended: [] };
  let shown = 0;

  for (const ev of events) {
    if (category && ev.heading !== category) {
      continue;
    }

    if (term && !ev.name.toLowerCase().includes(term)) {
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

  els.count.textContent = shown ? `${shown} event${shown === 1 ? '' : 's'}` : 'No matching events';
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

function fillCategories() {
  const headings = [...new Set(events.map((e) => e.heading).filter(Boolean))].sort();
  const current = els.category.value;
  els.category.replaceChildren(new Option('All categories', ''));

  for (const h of headings) {
    els.category.append(new Option(h, h));
  }

  els.category.value = current;
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
    fillCategories();
    render();
  } catch (err) {
    events = [];
    els.events.replaceChildren();
    els.count.textContent = `Could not load events: ${err.message}`;
  }
}

els.search.addEventListener('input', render);
els.category.addEventListener('change', render);
els.showPast.addEventListener('change', render);
els.refresh.addEventListener('click', load);

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
