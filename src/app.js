import COUNTRIES from './countries.js';
import { GPX_PATHS } from './generated.js';
import { eachTrack, entryCountry, extText, loadManifest, parseGpxDocument, placeName } from './gpx.js';
import { byId } from './dom.js';

/** @param {string} name */
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * What a caught value has to say. `catch` binds `unknown`, and a `throw` is not obliged to have thrown an `Error` — so
 * the three places here that report a failure ask rather than assume, and a thrown string reads as itself instead of
 * `undefined`.
 *
 * @param {unknown} e
 */
const said = (e) => (e instanceof Error ? e.message : String(e));

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
 * A drawable track as the file gives it. `latlngs` is a list of *pairs* rather than a list of lists, because that is
 * what Leaflet means by a `LatLngExpression`: an unannotated `[lat, lon]` literal infers `number[]`, which `L.polyline`
 * rejects, where a `[number, number]` tuple is accepted.
 *
 * @typedef {object} Route
 * @property {[number, number][]} latlngs
 * @property {string} name
 * @property {string} country
 * @property {string} variant
 * @property {string} event
 */

/**
 * One place to stand. `coordStr` is the file's own lat/lon text rather than the parsed pair restringified, so what the
 * copy button hands over is exactly what the file said.
 *
 * @typedef {object} Waypoint
 * @property {string} name
 * @property {string} country
 * @property {string} event
 * @property {[number, number]} coords
 * @property {string} coordStr
 */

/**
 * A route once the page has it: the file it came from, the layer drawn for it, the row built for it and the distance
 * measured off it. `markers` is the start and end dots, which exist only while the entry is selected.
 *
 * `el` is optional because it is not there when the entry is made — `buildSidebar` runs after every file has been read,
 * and `buildRouteRow` is what assigns it. Read it through `rowOf`, which says so.
 *
 * @typedef {Route & {
 *   file: string,
 *   gpx: string,
 *   line: L.Polyline,
 *   markers: L.CircleMarker[] | null,
 *   distance: number,
 *   el?: HTMLElement,
 * }} RouteEntry
 */

/**
 * A waypoint once the page has it. No distance and no `markers`: the dot is the entry, so selecting it restyles the one
 * layer rather than adding any.
 *
 * @typedef {Waypoint & {marker: L.CircleMarker, el?: HTMLElement}} CityEntry
 */

/** @type {RouteEntry[]} */
const store = [];

/** @type {CityEntry[]} */
const cityStore = [];

/**
 * What is selected, as lists rather than one of each: a link from the Events page names an event, not an entry, and an
 * event can have been given several routes and waypoints — all of which are selected together (see focusHashEvent).
 *
 * @type {RouteEntry[]}
 */
const activeRoutes = [];

/** @type {CityEntry[]} */
const activeCities = [];

/**
 * Every collapsible group in the sidebar, each with the badge in its own header. Recorded as the groups are built
 * rather than found again by query: `applyFilter` is the only reader, the badge is a span `groupCount` made and this
 * file appended, and `group.querySelector('.country .gcount')` answers `Element | null` about a node already in hand.
 *
 * Countries and continents share the list because they behave alike — both count the rows still showing anywhere
 * beneath them — which is what the two calls to a parameterised `settle` used to say.
 *
 * @type {{group: HTMLElement, count: HTMLElement}[]}
 */
const groups = [];

/**
 * Left `undefined` rather than `null`, because that is what `clearTimeout` already accepts for "no timer". Annotated
 * because nothing else can say so: the only assignment is inside `toast`, and a module-scope `let` takes its type from
 * what is written to it *here* — so inference had it as `any` and neither call was checked.
 *
 * @type {number | undefined}
 */
let toastTimer;

/**
 * The sidebar row an entry was given. Assigned while the sidebar is built, which is after every file has been read and
 * before anything can be selected, so a missing row is a page assembled in the wrong order rather than a case to
 * handle — the reading `byId` takes of a stale id.
 *
 * @param {RouteEntry | CityEntry} entry
 * @returns {HTMLElement}
 */
function rowOf(entry) {
  if (!entry.el) {
    throw new Error(`“${entry.name}” has no sidebar row`);
  }

  return entry.el;
}

/** @param {string} msg */
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

/**
 * Copy text to the clipboard, falling back to `execCommand` for insecure contexts (e.g. served over plain HTTP, where
 * the async Clipboard API is unavailable). Returns a promise that resolves to true on success.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyText(text) {
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
 * Flash a copy button through its outcome — "Copied" or "Failed" — then restore its label a moment later. The
 * button is optional, so a caller with none to flash still shares this path.
 *
 * @param {HTMLButtonElement | null} btn
 * @param {boolean} ok
 */
function flashButton(btn, ok) {
  if (!btn) {
    return;
  }

  const original = btn.textContent;
  btn.textContent = ok ? 'Copied' : 'Failed';
  btn.classList.add('done');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('done');
  }, 1400);
}

/**
 * @param {RouteEntry} entry
 * @param {HTMLButtonElement} btn
 */
async function copyRoute(entry, btn) {
  const ok = await copyText(entry.gpx);
  flashButton(btn, ok);
  toast(ok ? `Copied “${entry.name}” GPX to clipboard` : 'Copy failed');
}

/**
 * @param {readonly [number, number]} a
 * @param {readonly [number, number]} b
 * @returns {number}
 */
function haversine(a, b) {
  const R = 6371000,
    toRad = (/** @type {number} */ d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]),
    dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * The walked length of a track, summed over consecutive pairs. The previous point is carried rather than read back out
 * of the list by `i - 1`: an index and the length test above it are two questions nothing joins, where holding the
 * point the loop has just had is one.
 *
 * @param {readonly [number, number][]} latlngs
 * @returns {number}
 */
function routeDistance(latlngs) {
  let d = 0;
  let previous;

  for (const at of latlngs) {
    if (previous) {
      d += haversine(previous, at);
    }

    previous = at;
  }

  return d;
}

/**
 * @param {number} m
 * @returns {string}
 */
function fmtDist(m) {
  return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
}

/**
 * A file the server would not hand over — a status the fetch rejected on, or a connection that never got there. The
 * banner keeps these apart from the defects loadGpxFile throws for below: a 503 is a hiccup to reload through, not
 * metadata anyone can go and fix.
 */
class FetchError extends Error {}

/**
 * Where a `<trkpt>` or a `<wpt>` says it is. `coordStr` is the file's own text for the pair, kept so the copy button
 * hands over exactly what the file said rather than the parsed numbers printed back.
 *
 * One reader for both tags, because they are one format: `getAttribute` answers `string | null`, which is what made the
 * `<trkpt>` pair an error as soon as `eachTrack` started yielding an `Element` — twenty lines above a `<wpt>` pair that
 * was already erroring for the same reason. The element names itself in the message, so each keeps the wording it had.
 *
 * @param {Element} el
 * @returns {{coords: [number, number], coordStr: string}}
 */
function coordsOf(el) {
  const latStr = el.getAttribute('lat'),
    lonStr = el.getAttribute('lon');
  const lat = parseFloat(latStr ?? ''),
    lon = parseFloat(lonStr ?? '');

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`<${el.localName}> at ${latStr},${lonStr} has an unparseable coordinate`);
  }

  return { coords: [lat, lon], coordStr: `${latStr},${lonStr}` };
}

/**
 * Read one file, splitting it into routes and waypoints by element rather than by where it sits: a <trk> is a path to
 * walk, a <wpt> is one place to stand, and a file may hold either or both. This is how the backup writer has always
 * read these files (see parseGpxFavourites), so the two now agree about what a file contains instead of the viewer
 * being told separately.
 *
 * Name, locality, country, variant and event all come from the file's own metadata; an entry missing what it needs is
 * rejected rather than guessed at, so the gap shows up in the banner instead of quietly reading back the path. Variant
 * and event stay optional — empty for a route with no short/long counterpart and for a place that stands on its own. The
 * whole file text is returned once, for the copy button to hand over.
 *
 * @param {string} file
 * @returns {Promise<{text: string, routes: Route[], waypoints: Waypoint[]}>}
 */
async function loadGpxFile(file) {
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
  const doc = parseGpxDocument(text);

  /** @type {Route[]} */
  const routes = [];

  for (const { trk, trkpts } of eachTrack(doc)) {
    const latlngs = [...trkpts].map((p) => coordsOf(p).coords);

    if (latlngs.length < 2) {
      throw new Error('<trk> has fewer than two usable <trkpt>');
    }

    routes.push({
      latlngs,
      name: placeName(trk),
      country: entryCountry(trk),
      variant: extText(trk, 'variant') || '',
      event: extText(trk, 'event') || '',
    });
  }

  /** @type {Waypoint[]} */
  const waypoints = [];

  for (const w of doc.getElementsByTagName('wpt')) {
    waypoints.push({
      country: entryCountry(w),
      name: placeName(w),
      ...coordsOf(w),
      event: extText(w, 'event') || '',
    });
  }

  // A listed file holding neither is a defect too: something is in gpx-paths.json that has nothing to show.
  if (routes.length === 0 && waypoints.length === 0) {
    throw new Error('has no <trk> or <wpt>');
  }

  return { text, routes, waypoints };
}

/** @param {RouteEntry} entry */
function clearMarkers(entry) {
  if (entry.markers) {
    entry.markers.forEach((m) => map.removeLayer(m));
    entry.markers = null;
  }
}

/**
 * Build a map popup: a bold title, a detail line, and a copy button. The copy handler is handed the button so it can
 * flash it (see flashButton). Returns the element to bind to a layer.
 *
 * @param {string} name
 * @param {string} detail
 * @param {string} copyLabel
 * @param {(btn: HTMLButtonElement) => void} onCopy
 * @returns {HTMLElement}
 */
function buildPopup(name, detail, copyLabel, onCopy) {
  const popup = document.createElement('div');
  const title = document.createElement('b');
  title.textContent = name;
  const info = document.createElement('div');
  info.textContent = detail;
  const btn = document.createElement('button');
  btn.className = 'popup-copy';
  btn.type = 'button';
  btn.textContent = copyLabel;
  btn.addEventListener('click', () => onCopy(btn));
  popup.append(title, info, btn);
  return popup;
}

/**
 * How an unselected line and dot are drawn. Both the layer's creation and the deselect that returns it here read these,
 * so the two cannot come to disagree about what "not selected" looks like — which matters now that the colour is a
 * decision rather than a constant: an entry added for an event is drawn in --event, and the sidebar row mirrors it (see
 * `.route::before` in styles.css).
 *
 * @param {Route} route
 * @returns {L.PolylineOptions}
 */
function routeStyle(route) {
  return { color: cssVar(route.event ? '--event' : '--track'), weight: 2, opacity: 0.55 };
}

/**
 * @param {Waypoint} place
 * @returns {L.CircleMarkerOptions}
 */
function cityStyle(place) {
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
 * Draw one route as selected — accent line, start and end dots, a popup bound and its row marked — leaving whatever else
 * is selected alone. selectRoute is this plus clearing the rest, which is what a click on a row or a line wants;
 * focusHashEvent calls it once per entry instead, so an event's whole set is selected at once.
 *
 * @param {RouteEntry} entry
 */
function highlightRoute(entry) {
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

  /**
   * @param {[number, number]} at
   * @param {string} color
   * @param {string} label
   */
  const dot = (at, color, label) =>
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
 *
 * @param {CityEntry} c
 */
function highlightCity(c) {
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
 *
 * @param {readonly HTMLElement[]} els
 */
function revealRows(els) {
  for (const el of els) {
    el.closest('.country-group')?.classList.remove('collapsed');
    el.closest('.continent-group')?.classList.remove('collapsed');
  }

  els[0]?.scrollIntoView({ block: 'nearest' });
}

/**
 * @param {RouteEntry} entry
 * @param {{pan?: boolean}} [options]
 */
function selectRoute(entry, { pan = true } = {}) {
  clearSelection();
  highlightRoute(entry);

  if (pan) {
    map.fitBounds(entry.line.getBounds(), { padding: [24, 24], maxZoom: 17 });
    entry.line.openPopup();
  }

  revealRows([rowOf(entry)]);
}

/**
 * @param {CityEntry} c
 * @param {{pan?: boolean}} [options]
 */
function selectCity(c, { pan = true } = {}) {
  clearSelection();
  highlightCity(c);

  if (pan) {
    map.setView(c.coords, Math.max(map.getZoom(), 12));
    c.marker.openPopup();
  }

  revealRows([rowOf(c)]);
}

/**
 * @param {CityEntry} c
 * @param {HTMLButtonElement} btn
 */
async function copyCoords(c, btn) {
  const ok = await copyText(c.coordStr);
  flashButton(btn, ok);
  toast(ok ? `Copied ${c.name} coordinates to clipboard` : 'Copy failed');
}

/**
 * The name to show for a `<pgr:event>`, which the files record only by `eventID`. data/events.json is where that name
 * lives — the same file validate-gpx.mts checks those IDs against — and it is read once into here.
 *
 * @type {Map<string, string>}
 */
const eventNames = new Map();

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
 * another slot at the row's right edge, which is already carrying the distance and the Copy button and has no room for a
 * name beside them. The wrapping span is what pushes it onto that line, so the link's own hit area stays the width of
 * its text; the click is stopped short of the row, which would otherwise select the entry as the page unloads.
 *
 * @param {string} event
 * @returns {HTMLElement}
 */
function buildEventLine(event) {
  const line = document.createElement('span');
  line.className = 'eventline';
  const link = document.createElement('a');
  link.className = 'event';
  link.href = `events.html#event=${encodeURIComponent(event)}`;
  link.textContent = eventNames.get(event) || event;
  link.title = 'Show this event on the Events page';
  link.addEventListener('click', (e) => e.stopPropagation());
  line.appendChild(link);
  return line;
}

/**
 * @param {RouteEntry} entry
 * @returns {HTMLElement}
 */
function buildRouteRow(entry) {
  const el = document.createElement('div');
  el.className = 'route';
  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = entry.name;
  const end = document.createElement('span');
  end.className = 'end';
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = fmtDist(entry.distance);
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy';
  copyBtn.title = 'Copy GPX file contents to clipboard';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyRoute(entry, copyBtn);
  });
  end.append(meta, copyBtn);
  el.append(label, end);

  if (entry.event) {
    el.append(buildEventLine(entry.event));
  }

  el.addEventListener('click', () => selectRoute(entry));
  entry.el = el;
  return el;
}

/**
 * An empty count badge for a group header. `applyFilter` puts the number in and keeps it current, through the span the
 * caller keeps rather than by asking the header for it again.
 *
 * @returns {HTMLElement}
 */
function groupCount() {
  const el = document.createElement('span');
  el.className = 'gcount';
  return el;
}

/**
 * @param {CityEntry} c
 * @returns {HTMLElement}
 */
function buildCityRow(c) {
  const el = document.createElement('div');
  el.className = 'route city';
  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = c.name;
  const end = document.createElement('span');
  end.className = 'end';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy';
  copyBtn.title = 'Copy coordinates to clipboard';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyCoords(c, copyBtn);
  });
  end.append(copyBtn);
  el.append(label, end);

  if (c.event) {
    el.append(buildEventLine(c.event));
  }

  el.addEventListener('click', () => selectCity(c));
  c.el = el;
  return el;
}

/**
 * A row the sidebar is about to build, before the group that will hold it exists. `build` is a thunk rather than the
 * row itself, and that is load-bearing: `buildEventLine` reads `eventNames`, which `init` only awaits *after* every
 * entry has been made, so building a row eagerly would label its event by the raw ID the file carries.
 *
 * @typedef {{name: string, dist: number, build: () => HTMLElement}} Row
 */

/**
 * Two keyed pairs in the order `Array#sort` with no comparator would have put their keys in. Both levels of the sidebar
 * were sorted that way before each key started travelling beside its value, and this is that comparison written out
 * rather than a different one — `<` over two distinct strings is exactly what the default does.
 *
 * @param {readonly [string, unknown]} a
 * @param {readonly [string, unknown]} b
 * @returns {number}
 */
function byKey(a, b) {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

/**
 * Render one list grouped by country. Within each country, tracks and waypoints are interleaved and sorted
 * alphabetically by name.
 */
function buildSidebar() {
  countEl.textContent = cityStore.length
    ? `${store.length} tracks \u00b7 ${cityStore.length} waypoints`
    : `${store.length} tracks across ${new Set(store.map((s) => s.country)).size} countries`;

  /** @type {Record<string, Row[]>} */
  const byCountry = {};

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
   *
   * @type {Record<string, [string, Row[]][]>}
   */
  const byContinent = {};

  for (const entry of Object.entries(byCountry)) {
    (byContinent[COUNTRIES[entry[0]]?.continent || 'Other'] ||= []).push(entry);
  }

  for (const [continent, countries] of Object.entries(byContinent).sort(byKey)) {
    const cg = document.createElement('div');
    cg.className = 'continent-group collapsed';
    const chead = document.createElement('div');
    chead.className = 'continent';
    const cchev = document.createElement('span');
    cchev.className = 'chev';
    cchev.textContent = '▾';
    const clabel = document.createElement('span');
    clabel.textContent = continent;
    const ccount = groupCount();
    chead.append(cchev, clabel, ccount);
    chead.addEventListener('click', () => cg.classList.toggle('collapsed'));
    cg.appendChild(chead);
    groups.push({ group: cg, count: ccount });
    const citems = document.createElement('div');
    citems.className = 'continent-items';

    for (const [country, rows] of countries.sort(byKey)) {
      const group = document.createElement('div');
      group.className = 'country-group collapsed';
      const head = document.createElement('div');
      head.className = 'country';
      head.dataset.country = country;
      const chev = document.createElement('span');
      chev.className = 'chev';
      chev.textContent = '▾';
      const label = document.createElement('span');
      label.textContent = country;
      const count = groupCount();
      head.append(chev, label, count);
      head.addEventListener('click', () => group.classList.toggle('collapsed'));
      group.appendChild(head);
      groups.push({ group, count });
      const items = document.createElement('div');
      items.className = 'country-items';

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

/** @param {string} html */
function showBanner(html) {
  bannerEl.innerHTML = html;
  bannerEl.style.display = 'block';
}

/**
 * Name every file that could not be read, and why, under a heading that says what kind of failure it was — the two
 * kinds want opposite things from the reader, so a server that is down must not read as metadata to go and correct.
 * The banner stays up for both: a defect is there to fix, and a file that never arrived is not something the map can
 * show a placeholder for either.
 *
 * @param {string} heading
 * @param {readonly {file: string, reason: string}[]} failures
 */
function appendFailures(heading, failures) {
  const head = document.createElement('b');
  head.textContent = heading;
  const list = document.createElement('ul');

  for (const { file, reason } of failures) {
    console.error(`${file}: ${reason}`);
    const item = document.createElement('li');
    const path = document.createElement('code');
    path.textContent = file;
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
   * A lone entry is selected exactly as clicking its row would select it, tight fit and popup included. Only a set needs
   * what follows, where no one of them can own the view or be the one the popup names.
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
  /** @type {{file: string, reason: string}[]} */
  const unreachable = [];

  /** @type {{file: string, reason: string}[]} */
  const rejected = [];

  /**
   * @param {string} file
   * @param {unknown} e
   */
  const note = (file, e) => (e instanceof FetchError ? unreachable : rejected).push({ file, reason: said(e) });

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
