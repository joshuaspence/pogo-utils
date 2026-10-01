/**
 * Leaflet by name rather than by member, which is what leaves all thirteen `L.` references and the four `L.Polyline`-
 * style type annotations in this file exactly as the UMD global left them — the import replaces where `L` comes from
 * and nothing about how it is spelled. Its stylesheet is imported beside it because this module is what needs it:
 * esbuild emits the CSS as `app.css` beside `app.js`, which is the path `map.html` links, so the two cannot drift apart
 * any more than the `<script src>` and the bundle can.
 */

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import COUNTRIES from './countries.js';
import { said } from './errors.js';
import { GPX_PATHS } from './generated.js';
import { loadManifest, parseGpxDocument } from './gpx.js';
import { byKey, fmtDist, gpxEntries, routeDistance, type Route, type Waypoint } from './routes.js';
import { byId, el } from './dom.js';

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * zoomSnap: 0 lets fitBounds land on a fractional zoom. Snapping to whole levels rounds down, which can leave the
 * fitted layers filling as little as half the map — a lot of dead space on a narrow phone viewport.
 */
const map = L.map('map', { worldCopyJump: true, zoomSnap: 0 }).setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const listEl = byId('list');
const countEl = byId('count');
const filterEl = byId('filter', HTMLInputElement);
const bannerEl = byId('banner');
const toastEl = byId('toast');

/**
 * A route once the page has it: the file it came from, the layer drawn for it, the row built for it and the distance
 * measured off it. `markers` is the start and end dots, which exist only while the entry is selected.
 *
 * `el` is optional because it is not there when the entry is made — `buildSidebar` runs after every file has been read,
 * and `buildRouteRow` is what assigns it. Read it through `rowOf`, which says so.
 */
type RouteEntry = Route & {
  file: string;
  gpx: string;
  line: L.Polyline;
  markers: L.CircleMarker[] | null;
  distance: number;
  el?: HTMLElement;
};

/**
 * A waypoint once the page has it. No distance and no `markers`: the dot is the entry, so selecting it restyles the one
 * layer rather than adding any.
 */
type CityEntry = Waypoint & { marker: L.CircleMarker; el?: HTMLElement };

const store: RouteEntry[] = [];

const cityStore: CityEntry[] = [];

/**
 * What is selected, as lists rather than one of each: a link from the Events page names an event, not an entry, and an
 * event can have been given several routes and waypoints — all of which are selected together (see focusHashEvent).
 */
const activeRoutes: RouteEntry[] = [];

const activeCities: CityEntry[] = [];

/**
 * Every collapsible group in the sidebar, each with the badge in its own header. Recorded as the groups are built
 * rather than found again by query: `applyFilter` is the only reader, the badge is a span `groupCount` made and this
 * file appended, and `group.querySelector('.country .gcount')` answers `Element | null` about a node already in hand.
 *
 * Countries and continents share the list because they behave alike — both count the rows still showing anywhere
 * beneath them — which is what the two calls to a parameterised `settle` used to say.
 */
const groups: { group: HTMLElement; count: HTMLElement }[] = [];

/**
 * Left `undefined` rather than `null`, because that is what `clearTimeout` already accepts for "no timer". Annotated
 * because nothing else can say so: the only assignment is inside `toast`, and a module-scope `let` takes its type from
 * what is written to it *here* — so inference had it as `any` and neither call was checked.
 */
let toastTimer: number | undefined;

/**
 * The sidebar row an entry was given. Assigned while the sidebar is built, which is after every file has been read and
 * before anything can be selected, so a missing row is a page assembled in the wrong order rather than a case to
 * handle — the reading `byId` takes of a stale id.
 */
function rowOf(entry: RouteEntry | CityEntry): HTMLElement {
  if (!entry.el) {
    throw new Error(`“${entry.name}” has no sidebar row`);
  }

  return entry.el;
}

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

/**
 * Copy text to the clipboard, falling back to `execCommand` for insecure contexts (e.g. served over plain HTTP, where
 * the async Clipboard API is unavailable). Returns a promise that resolves to true on success.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * The restore a button is already waiting on: the timer to cancel and the label it was flashed over. Keyed weakly
 * because a popup's button dies with its popup. `toastTimer` is the same guard for the one toast there is.
 */
const flashes = new WeakMap<HTMLButtonElement, { timer: number; label: string | null }>();

/**
 * Flash a copy button through its outcome — "Copied" or "Failed" — then restore its label a moment later. The
 * button is optional, so a caller with none to flash still shares this path.
 *
 * A second click inside the 1400ms must not read the flashed label as the original, or the restore puts "Copied" back
 * and the button carries it for the rest of the page's life. So the pending flash surrenders both its timer and the
 * label it captured, which every copy button — sidebar row and popup alike — outlives many clicks of.
 */
function flashButton(btn: HTMLButtonElement | null, ok: boolean) {
  if (!btn) {
    return;
  }

  const pending = flashes.get(btn);
  clearTimeout(pending?.timer);
  const label = pending ? pending.label : btn.textContent;
  btn.textContent = ok ? 'Copied' : 'Failed';
  btn.classList.add('done');
  const timer = setTimeout(() => {
    btn.textContent = label;
    btn.classList.remove('done');
    flashes.delete(btn);
  }, 1400);
  flashes.set(btn, { timer, label });
}

async function copyRoute(entry: RouteEntry, btn: HTMLButtonElement) {
  const ok = await copyText(entry.gpx);
  flashButton(btn, ok);
  toast(ok ? `Copied “${entry.name}” GPX to clipboard` : 'Copy failed');
}

/**
 * A file the server would not hand over — a status the fetch rejected on, or a connection that never got there. The
 * banner keeps these apart from the defects gpxEntries throws for: a 503 is a hiccup to reload through, not metadata
 * anyone can go and fix.
 */
class FetchError extends Error {}

/**
 * Read one file: fetch it, parse it, and let `gpxEntries` split it by element. The whole file text is returned
 * alongside, for the copy button to hand over.
 */
async function loadGpxFile(file: string): Promise<{ text: string; routes: Route[]; waypoints: Waypoint[] }> {
  let res;

  try {
    res = await fetch(encodeURI(file));
  } catch (e) {
    throw new FetchError(said(e));
  }

  if (!res.ok) {
    // HTTP/2 sends no reason phrase, so a bare status is all there is to say — trim rather than print a
    // trailing space.
    throw new FetchError(`${res.status} ${res.statusText}`.trim());
  }

  const text = await res.text();
  return { text, ...gpxEntries(parseGpxDocument(text)) };
}

function clearMarkers(entry: RouteEntry) {
  if (entry.markers) {
    entry.markers.forEach((m) => map.removeLayer(m));
    entry.markers = null;
  }
}

/**
 * Build a map popup: a bold title, a detail line, and a copy button. The copy handler is handed the button so it can
 * flash it (see flashButton). Returns the element to bind to a layer.
 */
function buildPopup(
  name: string,
  detail: string,
  copyLabel: string,
  onCopy: (btn: HTMLButtonElement) => void,
): HTMLElement {
  const popup = el('div');
  const title = el('b', null, name);
  const info = el('div', null, detail);
  const btn = el('button', 'popup-copy', copyLabel);
  btn.type = 'button';
  btn.addEventListener('click', () => onCopy(btn));
  popup.append(title, info, btn);
  return popup;
}

/**
 * How an unselected line and dot are drawn. Both the layer's creation and the deselect that returns it here read these,
 * so the two cannot come to disagree about what "not selected" looks like — which matters now that the colour is a
 * decision rather than a constant: an entry added for an event is drawn in --event, and the sidebar row mirrors it (see
 * `.route::before` in styles.css).
 */
function routeStyle(route: Route): L.PolylineOptions {
  return { color: cssVar(route.event ? '--event' : '--track'), weight: 2, opacity: 0.55 };
}

function cityStyle(place: Waypoint): L.CircleMarkerOptions {
  return {
    radius: 5,
    color: '#fff',
    weight: 2,
    fillColor: cssVar(place.event ? '--event' : '--city'),
    fillOpacity: 1,
  };
}

/** Return every selected route and waypoint to its resting style, drop its markers and un-highlight its row. */
function clearSelection() {
  for (const entry of activeRoutes) {
    entry.line.setStyle(routeStyle(entry));
    entry.line.bringToBack();
    clearMarkers(entry);
    rowOf(entry).classList.remove('active');
  }

  for (const c of activeCities) {
    c.marker.setStyle(cityStyle(c));
    rowOf(c).classList.remove('active');
  }

  activeRoutes.length = 0;
  activeCities.length = 0;
}

/**
 * Draw one route as selected — accent line, start and end dots, a popup bound and its row marked — leaving whatever
 * else is selected alone. selectRoute is this plus clearing the rest, which is what a click on a row or a line wants;
 * focusHashEvent calls it once per entry instead, so an event's whole set is selected at once.
 */
function highlightRoute(entry: RouteEntry) {
  activeRoutes.push(entry);
  rowOf(entry).classList.add('active');
  entry.line.setStyle({ color: cssVar('--accent'), weight: 4, opacity: 1 });
  entry.line.bringToFront();

  clearMarkers(entry);

  /**
   * The two ends, read as slots rather than assumed. `loadGpxFile` rejects a `<trk>` with fewer than two usable
   * `<trkpt>`, so neither can miss — but nothing carries that length from there to here, and a route that arrived with
   * no points is the same kind of defect as a row that was never built (see rowOf) rather than a case to draw around.
   */
  const a = entry.latlngs[0],
    b = entry.latlngs[entry.latlngs.length - 1];

  if (!a || !b) {
    throw new Error(`“${entry.name}” has no points to mark`);
  }

  const dot = (at: [number, number], color: string, label: string) =>
    L.circleMarker(at, {
      radius: 6,
      color: '#fff',
      weight: 2,
      fillColor: color,
      fillOpacity: 1,
    }).bindTooltip(label);
  entry.markers = [dot(a, cssVar('--start'), 'Start').addTo(map), dot(b, cssVar('--end'), 'End').addTo(map)];

  const detail = `${entry.country} · ${entry.latlngs.length} points · ${fmtDist(entry.distance)}`;
  entry.line.bindPopup(buildPopup(entry.name, detail, 'Copy GPX', (btn) => copyRoute(entry, btn)));
}

/**
 * Mirrors highlightRoute for a waypoint.
 */
function highlightCity(c: CityEntry) {
  activeCities.push(c);
  rowOf(c).classList.add('active');
  c.marker.setStyle({ radius: 8, fillColor: cssVar('--accent') });
  c.marker.bringToFront();

  c.marker.bindPopup(
    buildPopup(c.name, `${c.country} · ${c.coordStr}`, 'Copy coordinates', (btn) => copyCoords(c, btn)),
  );
}

/**
 * Open the groups above every row given, then scroll the first of them into view. Several rows can be selected at once
 * and only one place can be scrolled to, so the first stands for the rest — which the groups now being open is what
 * makes reachable, rather than leaving the reader to guess which countries to expand.
 */
function revealRows(els: readonly HTMLElement[]) {
  for (const el of els) {
    el.closest('.country-group')?.classList.remove('collapsed');
    el.closest('.continent-group')?.classList.remove('collapsed');
  }

  els[0]?.scrollIntoView({ block: 'nearest' });
}

function selectRoute(entry: RouteEntry, { pan = true }: { pan?: boolean } = {}) {
  clearSelection();
  highlightRoute(entry);

  if (pan) {
    map.fitBounds(entry.line.getBounds(), { padding: [24, 24], maxZoom: 17 });
    entry.line.openPopup();
  }

  revealRows([rowOf(entry)]);
}

function selectCity(c: CityEntry, { pan = true }: { pan?: boolean } = {}) {
  clearSelection();
  highlightCity(c);

  if (pan) {
    map.setView(c.coords, Math.max(map.getZoom(), 12));
    c.marker.openPopup();
  }

  revealRows([rowOf(c)]);
}

async function copyCoords(c: CityEntry, btn: HTMLButtonElement) {
  const ok = await copyText(c.coordStr);
  flashButton(btn, ok);
  toast(ok ? `Copied ${c.name} coordinates to clipboard` : 'Copy failed');
}

/**
 * The name to show for a `<pgr:event>`, which the files record only by `eventID`. data/events.json is where that name
 * lives — the same file validate-gpx.mts checks those IDs against — and it is read once into here.
 */
const eventNames = new Map<string, string>();

/**
 * A fetch that fails leaves the map empty and every entry naming its event by ID. That reads well enough
 * (`pokemon-fossil-museum-chicago-2026`) and the link still goes to the right place, so a missing calendar is not worth
 * withholding a page of routes over.
 */
async function loadEventNames() {
  try {
    const res = await fetch('data/events.json');

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`.trim());
    }

    for (const event of await res.json()) {
      eventNames.set(event.eventID, event.name);
    }
  } catch (e) {
    console.error(`data/events.json: ${said(e)} — entries will name their event by ID`);
  }
}

/**
 * The event an entry was added for, as a link through to it on the Events page. It takes a line of its own rather than
 * another slot at the row's right edge, which is already carrying the distance and the Copy button and has no room for
 * a name beside them. The wrapping span is what pushes it onto that line, so the link's own hit area stays the width of
 * its text; the click is stopped short of the row, which would otherwise select the entry as the page unloads.
 */
function buildEventLine(event: string): HTMLElement {
  const line = el('span', 'eventline');
  const link = el('a', 'event', eventNames.get(event) || event);
  link.href = `events.html#event=${encodeURIComponent(event)}`;
  link.title = 'Show this event on the Events page';
  link.addEventListener('click', (e) => e.stopPropagation());
  line.appendChild(link);
  return line;
}

function buildRouteRow(entry: RouteEntry): HTMLElement {
  const row = el('div', 'route');
  const label = el('span', 'name', entry.name);
  const end = el('span', 'end');
  const meta = el('span', 'meta', fmtDist(entry.distance));
  const copyBtn = el('button', 'copy', 'Copy');
  copyBtn.type = 'button';
  copyBtn.title = 'Copy GPX file contents to clipboard';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyRoute(entry, copyBtn);
  });
  end.append(meta, copyBtn);
  row.append(label, end);

  if (entry.event) {
    row.append(buildEventLine(entry.event));
  }

  row.addEventListener('click', () => selectRoute(entry));
  entry.el = row;
  return row;
}

/**
 * An empty count badge for a group header. `applyFilter` puts the number in and keeps it current, through the span the
 * caller keeps rather than by asking the header for it again.
 */
function groupCount(): HTMLElement {
  return el('span', 'gcount');
}

function buildCityRow(c: CityEntry): HTMLElement {
  const row = el('div', 'route city');
  const label = el('span', 'name', c.name);
  const end = el('span', 'end');
  const copyBtn = el('button', 'copy', 'Copy');
  copyBtn.type = 'button';
  copyBtn.title = 'Copy coordinates to clipboard';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyCoords(c, copyBtn);
  });
  end.append(copyBtn);
  row.append(label, end);

  if (c.event) {
    row.append(buildEventLine(c.event));
  }

  row.addEventListener('click', () => selectCity(c));
  c.el = row;
  return row;
}

/**
 * A row the sidebar is about to build, before the group that will hold it exists. `build` is a thunk rather than the
 * row itself, and that is load-bearing: `buildEventLine` reads `eventNames`, which `init` only awaits *after* every
 * entry has been made, so building a row eagerly would label its event by the raw ID the file carries.
 */
type Row = { name: string; dist: number; build: () => HTMLElement };

/**
 * Render one list grouped by country. Within each country, tracks and waypoints are interleaved and sorted
 * alphabetically by name.
 */
function buildSidebar() {
  countEl.textContent = cityStore.length
    ? `${store.length} tracks \u00b7 ${cityStore.length} waypoints`
    : `${store.length} tracks across ${new Set(store.map((s) => s.country)).size} countries`;

  const byCountry: Record<string, Row[]> = {};

  for (const s of store) {
    (byCountry[s.country] ||= []).push({
      name: s.name,
      dist: s.distance,
      build: () => buildRouteRow(s),
    });
  }

  for (const c of cityStore) {
    (byCountry[c.country] ||= []).push({
      name: c.name,
      dist: 0,
      build: () => buildCityRow(c),
    });
  }

  /**
   * Each continent's countries with their rows already attached, rather than a list of country names to look up in
   * `byCountry` again further down. A key and then an index are two questions nothing joins, so the second answers
   * `Row[] | undefined` however the first went — where the pair `Object.entries` hands over needs no second lookup.
   */
  const byContinent: Record<string, [string, Row[]][]> = {};

  for (const entry of Object.entries(byCountry)) {
    (byContinent[COUNTRIES[entry[0]]?.continent || 'Other'] ||= []).push(entry);
  }

  for (const [continent, countries] of Object.entries(byContinent).sort(byKey)) {
    const cg = el('div', 'continent-group collapsed');
    const chead = el('div', 'continent');
    const cchev = el('span', 'chev', '▾');
    const clabel = el('span', null, continent);
    const ccount = groupCount();
    chead.append(cchev, clabel, ccount);
    chead.addEventListener('click', () => cg.classList.toggle('collapsed'));
    cg.appendChild(chead);
    groups.push({ group: cg, count: ccount });
    const citems = el('div', 'continent-items');

    for (const [country, rows] of countries.sort(byKey)) {
      const group = el('div', 'country-group collapsed');
      const head = el('div', 'country');
      head.dataset.country = country;
      const chev = el('span', 'chev', '▾');
      const label = el('span', null, country);
      const count = groupCount();
      head.append(chev, label, count);
      head.addEventListener('click', () => group.classList.toggle('collapsed'));
      group.appendChild(head);
      groups.push({ group, count });
      const items = el('div', 'country-items');

      for (const row of rows.sort((a, b) => a.name.localeCompare(b.name) || a.dist - b.dist)) {
        items.appendChild(row.build());
      }

      group.appendChild(items);
      citems.appendChild(group);
    }

    cg.appendChild(citems);
    listEl.appendChild(cg);
  }

  applyFilter();
}

filterEl.addEventListener('input', applyFilter);

/**
 * Hide the entries the filter box excludes, then hide the groups left holding nothing; while searching, auto-expand
 * those that do have matches so the results are visible, and with no query collapse everything.
 *
 * Each header's count is written from the same pass, so the number on a collapsed group is what opening it would show
 * rather than what the group held before the reader typed. That is also why buildSidebar() ends by calling this: it
 * leaves the badges empty and lets the one place that counts fill them.
 */
function applyFilter() {
  const q = filterEl.value.trim().toLowerCase();

  /**
   * Matched against the entries rather than against `data-name` and `data-country` written onto their rows. The store
   * already holds both as strings, so stringifying them into the DOM and reading them back was the page asking itself a
   * question it was holding the answer to — and the answer came back `string | undefined`, since a `dataset` cannot
   * promise a key was ever set.
   */
  for (const entry of [...store, ...cityStore]) {
    const hit = !q || entry.name.toLowerCase().includes(q) || entry.country.toLowerCase().includes(q);
    rowOf(entry).classList.toggle('hidden', !hit);
  }

  for (const { group, count } of groups) {
    const shown = group.querySelectorAll('.route:not(.hidden)').length;
    group.classList.toggle('hidden', !shown);
    group.classList.toggle('collapsed', q ? !shown : true);
    count.textContent = String(shown);
  }
}

function showBanner(html: string) {
  bannerEl.innerHTML = html;
  bannerEl.style.display = 'block';
}

/**
 * Name every file that could not be read, and why, under a heading that says what kind of failure it was — the two
 * kinds want opposite things from the reader, so a server that is down must not read as metadata to go and correct.
 * The banner stays up for both: a defect is there to fix, and a file that never arrived is not something the map can
 * show a placeholder for either.
 */
function appendFailures(heading: string, failures: readonly { file: string; reason: string }[]) {
  const head = el('b', null, heading);
  const list = el('ul');

  for (const { file, reason } of failures) {
    console.error(`${file}: ${reason}`);
    const item = el('li');
    const path = el('code', null, file);
    item.append(path, document.createTextNode(` — ${reason}`));
    list.appendChild(item);
  }

  bannerEl.append(head, list);
  bannerEl.style.display = 'block';
}

/**
 * A link from the Events page arrives as `map.html#event=<eventID>`, and this is what lands it on that event's
 * entries — every route and waypoint added for it, not one of them. All of them are selected together: highlighted on
 * the map, their rows marked and the groups above them opened, with the map fitted to the whole set.
 *
 * Nothing is hidden. Filtering the sidebar down to the event would read as the search box having been used, leaving the
 * reader to work out how to get the other 79 rows back; selecting is enough to answer "which ones are they" and leaves
 * the page in a state they already know how to leave.
 *
 * Returns whether it moved the map, which is what lets init() fit everything only when no event claimed the view.
 */
function focusHashEvent() {
  const id = new URLSearchParams(location.hash.slice(1)).get('event');

  if (!id) {
    return false;
  }

  const routes = store.filter((s) => s.event === id);
  const places = cityStore.filter((c) => c.event === id);
  const name = eventNames.get(id) || id;

  // Said out loud rather than silently ignored: the link came from somewhere, so landing nowhere needs explaining.
  if (routes.length === 0 && places.length === 0) {
    toast(`Nothing here was added for “${name}”`);
    return false;
  }

  /**
   * A lone entry is selected exactly as clicking its row would select it, tight fit and popup included. Only a set
   * needs what follows, where no one of them can own the view or be the one the popup names.
   */
  if (routes.length + places.length === 1) {
    const [route] = routes;
    const [place] = places;

    if (route) {
      selectRoute(route);
    } else if (place) {
      selectCity(place);
    }

    return true;
  }

  clearSelection();
  routes.forEach((s) => highlightRoute(s));
  places.forEach((c) => highlightCity(c));
  revealRows([...routes, ...places].map(rowOf));

  /**
   * One fit, not two. Leaflet animates a zoom of fewer than `zoomAnimationThreshold` levels as a CSS transition and
   * applies the move at its end, from the view captured when it began — so selecting an entry with its own pan and then
   * widening to the set landed the wide view and had it silently undone a moment later. Fitting once, here, is the only
   * ordering that cannot be taken away.
   */
  const layers = [...routes.map((s) => s.line), ...places.map((c) => c.marker)];
  map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [24, 24], maxZoom: 16 });

  // No popup: one would name a single entry and so contradict the point of selecting all of them. The count says it.
  toast(`Selected all ${layers.length} entries added for “${name}”`);

  return true;
}

// Also on hashchange, so a link followed from this page — or the back button — lands the same way as a fresh load.
window.addEventListener('hashchange', focusHashEvent);

async function init() {
  const unreachable: { file: string; reason: string }[] = [];

  const rejected: { file: string; reason: string }[] = [];

  const note = (file: string, e: unknown) =>
    (e instanceof FetchError ? unreachable : rejected).push({ file, reason: said(e) });

  /**
   * Nothing can be drawn without the list, and reading it is the page's first fetch — so this is also where opening
   * the page from disk lands.
   */
  let files;

  try {
    files = await loadManifest();
  } catch (e) {
    showBanner(
      `<b>Could not read <code>${GPX_PATHS}</code> — ${said(e)}.</b><br>` +
        'This page reads the route list and the <code>.gpx</code> files over HTTP, ' +
        'so it needs to be served rather than opened directly from disk. Try:<br>' +
        '<code>python3 -m http.server</code> then open ' +
        '<code>http://localhost:8000/</code> — or view it via GitHub Pages.',
    );
    return;
  }

  // Started alongside the GPX files rather than ahead of them: the names are only labels, so every file fetch would
  // otherwise queue behind this one.
  const names = loadEventNames();

  /**
   * One bad file does not hide the others, but it is still reported. Each file's outcome is caught inside its own
   * callback rather than read back out of `Promise.allSettled` by index: the file and what went wrong then travel
   * together, where two arrays joined by number is a pairing nothing can state — `files[i]` answers
   * `string | undefined` however long `results` is, and `res.reason` answers `any`, so the message taken off it was
   * never checked at all.
   *
   * Catching there also attaches the handler as the fetch starts, so no rejection waits on an earlier file for someone
   * to listen; and the loop below still reports in the manifest's order rather than in the order the files finished.
   */
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        return { file, read: await loadGpxFile(file), failure: null };
      } catch (e) {
        return { file, read: null, failure: e };
      }
    }),
  );

  for (const { file, read, failure } of results) {
    if (!read) {
      note(file, failure);
      continue;
    }

    const { text, routes, waypoints } = read;

    for (const route of routes) {
      const line = L.polyline(route.latlngs, routeStyle(route)).addTo(map);
      const entry = {
        ...route,
        file,
        gpx: text,
        line,
        markers: null,
        distance: routeDistance(route.latlngs),
      };
      line.on('click', () => selectRoute(entry, { pan: false }));
      store.push(entry);
    }

    for (const place of waypoints) {
      const marker = L.circleMarker(place.coords, cityStyle(place)).addTo(map);
      marker.bindTooltip(place.name);
      const entry = { ...place, marker };
      marker.on('click', () => selectCity(entry, { pan: false }));
      cityStore.push(entry);
    }
  }

  await names;
  buildSidebar();

  if (unreachable.length) {
    appendFailures(`${unreachable.length} file(s) could not be fetched — try reloading:`, unreachable);
  }

  if (rejected.length) {
    appendFailures(`${rejected.length} file(s) rejected — fix the GPX metadata:`, rejected);
  }

  // Every file listed failed; the banner already names each one, and there is no layer to fit the map to.
  if (store.length === 0 && cityStore.length === 0) {
    return;
  }

  /**
   * One fit or the other, never both. Leaflet animates a zoom of less than `zoomAnimationThreshold` levels as a CSS
   * transition and defers the move itself to its end; `setView` stops a pan but not that, so fitting the world first
   * and the event second left the transition to finish afterwards and restore the world — the event's own view landed
   * and was then silently undone. Ordering cannot fix that, so only fit everything when no event asked for a view.
   */
  if (!focusHashEvent()) {
    const all = L.featureGroup([...store.map((s) => s.line), ...cityStore.map((c) => c.marker)]);
    map.fitBounds(all.getBounds(), { padding: [16, 16] });
  }
}

init();
