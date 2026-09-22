import COUNTRIES from './countries.js';
import { eachTrack, entryCountry, extText, loadManifest, parseGpxDocument, placeName } from './gpx.js';

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/**
 * zoomSnap: 0 lets fitBounds land on a fractional zoom. Snapping to whole levels rounds down, which can leave the
 * fitted layers filling as little as half the map — a lot of dead space on a narrow phone viewport.
 */
const map = L.map('map', { worldCopyJump: true, zoomSnap: 0 }).setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const listEl = document.getElementById('list');
const countEl = document.getElementById('count');
const filterEl = document.getElementById('filter');
const bannerEl = document.getElementById('banner');
const toastEl = document.getElementById('toast');

const store = []; // { name, country, variant, event, file, gpx, latlngs, line, el, markers, distance }
const cityStore = []; // { name, country, event, coords:[lat,lon], coordStr, marker, el }
let active = null;
let activeCity = null;
let toastTimer = null;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

/**
 * Copy text to the clipboard, falling back to `execCommand` for insecure contexts (e.g. served over plain HTTP, where
 * the async Clipboard API is unavailable). Returns a promise that resolves to true on success.
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

async function copyRoute(entry, btn) {
  const ok = await copyText(entry.gpx);
  flashButton(btn, ok);
  toast(ok ? `Copied “${entry.name}” GPX to clipboard` : 'Copy failed');
}

function haversine(a, b) {
  const R = 6371000,
    toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]),
    dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function routeDistance(latlngs) {
  let d = 0;

  for (let i = 1; i < latlngs.length; i++) {
    d += haversine(latlngs[i - 1], latlngs[i]);
  }

  return d;
}

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
 * Read one file, splitting it into routes and waypoints by element rather than by where it sits: a <trk> is a path to
 * walk, a <wpt> is one place to stand, and a file may hold either or both. This is how the backup writer has always
 * read these files (see parseGpxFavourites), so the two now agree about what a file contains instead of the viewer
 * being told separately.
 *
 * Name, locality, country, variant and event all come from the file's own metadata; an entry missing what it needs is
 * rejected rather than guessed at, so the gap shows up in the banner instead of quietly reading back the path. Variant
 * and event stay optional — empty for a route with no short/long counterpart and for a place that stands on its own. The
 * whole file text is returned once, for the copy button to hand over.
 */
async function loadGpxFile(file) {
  let res;

  try {
    res = await fetch(encodeURI(file));
  } catch (e) {
    throw new FetchError(e.message);
  }

  if (!res.ok) {
    // HTTP/2 sends no reason phrase, so a bare status is all there is to say — trim rather than print a
    // trailing space.
    throw new FetchError(`${res.status} ${res.statusText}`.trim());
  }

  const text = await res.text();
  const doc = parseGpxDocument(text);

  const routes = [];

  for (const { trk, trkpts } of eachTrack(doc)) {
    const latlngs = [];

    for (const p of trkpts) {
      const latStr = p.getAttribute('lat'),
        lonStr = p.getAttribute('lon');
      const lat = parseFloat(latStr),
        lon = parseFloat(lonStr);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error(`<trkpt> at ${latStr},${lonStr} has an unparseable coordinate`);
      }

      latlngs.push([lat, lon]);
    }

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

  // coordStr preserves the file's exact lat/lon text for copying.
  const waypoints = [];

  for (const w of doc.getElementsByTagName('wpt')) {
    const latStr = w.getAttribute('lat'),
      lonStr = w.getAttribute('lon');
    const lat = parseFloat(latStr),
      lon = parseFloat(lonStr);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`<wpt> at ${latStr},${lonStr} has an unparseable coordinate`);
    }

    waypoints.push({
      country: entryCountry(w),
      name: placeName(w),
      coords: [lat, lon],
      coordStr: `${latStr},${lonStr}`,
      event: extText(w, 'event') || '',
    });
  }

  // A listed file holding neither is a defect too: something is in gpx.json that has nothing to show.
  if (routes.length === 0 && waypoints.length === 0) {
    throw new Error('has no <trk> or <wpt>');
  }

  return { text, routes, waypoints };
}

function clearMarkers(entry) {
  if (entry.markers) {
    entry.markers.forEach((m) => map.removeLayer(m));
    entry.markers = null;
  }
}

/**
 * Build a map popup: a bold title, a detail line, and a copy button. The copy handler is handed the button so it can
 * flash it (see flashButton). Returns the element to bind to a layer.
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
 */
function routeStyle(route) {
  return { color: cssVar(route.event ? '--event' : '--track'), weight: 2, opacity: 0.55 };
}

function cityStyle(place) {
  return {
    radius: 5,
    color: '#fff',
    weight: 2,
    fillColor: cssVar(place.event ? '--event' : '--city'),
    fillOpacity: 1,
  };
}

/**
 * Return the active route to its resting style, drop its start/end markers and un-highlight its row. Mirrors
 * deselectCity, so selecting either kind can clear the other with a single call.
 */
function deselectRoute() {
  if (!active) {
    return;
  }

  active.line.setStyle(routeStyle(active));
  active.line.bringToBack();
  clearMarkers(active);
  active.el.classList.remove('active');
  active = null;
}

function selectRoute(entry, { pan = true } = {}) {
  deselectCity();
  deselectRoute();
  active = entry;
  entry.el.classList.add('active');
  entry.line.setStyle({ color: cssVar('--accent'), weight: 4, opacity: 1 });
  entry.line.bringToFront();

  clearMarkers(entry);
  const a = entry.latlngs[0],
    b = entry.latlngs[entry.latlngs.length - 1];
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

  if (pan) {
    map.fitBounds(entry.line.getBounds(), { padding: [24, 24], maxZoom: 17 });
    entry.line.openPopup();
  }

  entry.el.closest('.country-group')?.classList.remove('collapsed');
  entry.el.closest('.continent-group')?.classList.remove('collapsed');
  entry.el.scrollIntoView({ block: 'nearest' });
}

function deselectCity() {
  if (!activeCity) {
    return;
  }

  activeCity.marker.setStyle(cityStyle(activeCity));
  activeCity.el.classList.remove('active');
  activeCity = null;
}

function selectCity(c, { pan = true } = {}) {
  // Clear any active route selection so only one thing is highlighted.
  deselectRoute();
  deselectCity();
  activeCity = c;
  c.el.classList.add('active');
  c.marker.setStyle({ radius: 8, fillColor: cssVar('--accent') });
  c.marker.bringToFront();

  c.marker.bindPopup(
    buildPopup(c.name, `${c.country} · ${c.coordStr}`, 'Copy coordinates', (btn) => copyCoords(c, btn)),
  );

  if (pan) {
    map.setView(c.coords, Math.max(map.getZoom(), 12));
    c.marker.openPopup();
  }

  c.el.closest('.country-group')?.classList.remove('collapsed');
  c.el.closest('.continent-group')?.classList.remove('collapsed');
  c.el.scrollIntoView({ block: 'nearest' });
}

async function copyCoords(c, btn) {
  const ok = await copyText(c.coordStr);
  flashButton(btn, ok);
  toast(ok ? `Copied ${c.name} coordinates to clipboard` : 'Copy failed');
}

/**
 * The name to show for a `<pgr:event>`, which the files record only by `eventID`. data/events.json is where that name
 * lives — the same file validate-gpx.mjs checks those IDs against — and it is read once into here.
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
    console.error(`data/events.json: ${e.message} — entries will name their event by ID`);
  }
}

/**
 * The event an entry was added for, as a link through to it on the Events page. It takes a line of its own rather than
 * another slot at the row's right edge, which is already carrying the distance and the Copy button and has no room for a
 * name beside them. The wrapping span is what pushes it onto that line, so the link's own hit area stays the width of
 * its text; the click is stopped short of the row, which would otherwise select the entry as the page unloads.
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

function buildRouteRow(entry) {
  const el = document.createElement('div');
  el.className = 'route';
  el.dataset.country = entry.country;
  el.dataset.name = entry.name.toLowerCase();
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

/** An empty count badge for a group header. `applyFilter` puts the number in and keeps it current. */
function groupCount() {
  const el = document.createElement('span');
  el.className = 'gcount';
  return el;
}

function buildCityRow(c, country) {
  const el = document.createElement('div');
  el.className = 'route city';
  el.dataset.country = country;
  el.dataset.name = c.name.toLowerCase();
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
 * Render one list grouped by country. Within each country, tracks and waypoints are interleaved and sorted
 * alphabetically by name.
 */
function buildSidebar() {
  countEl.textContent = cityStore.length
    ? `${store.length} tracks \u00b7 ${cityStore.length} waypoints`
    : `${store.length} tracks across ${new Set(store.map((s) => s.country)).size} countries`;

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
      build: () => buildCityRow(c, c.country),
    });
  }

  const byContinent = {};

  for (const country of Object.keys(byCountry)) {
    (byContinent[COUNTRIES[country]?.continent || 'Other'] ||= []).push(country);
  }

  for (const continent of Object.keys(byContinent).sort()) {
    const cg = document.createElement('div');
    cg.className = 'continent-group collapsed';
    const chead = document.createElement('div');
    chead.className = 'continent';
    const cchev = document.createElement('span');
    cchev.className = 'chev';
    cchev.textContent = '▾';
    const clabel = document.createElement('span');
    clabel.textContent = continent;
    chead.append(cchev, clabel, groupCount());
    chead.addEventListener('click', () => cg.classList.toggle('collapsed'));
    cg.appendChild(chead);
    const citems = document.createElement('div');
    citems.className = 'continent-items';

    for (const country of byContinent[continent].sort()) {
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
      head.append(chev, label, groupCount());
      head.addEventListener('click', () => group.classList.toggle('collapsed'));
      group.appendChild(head);
      const items = document.createElement('div');
      items.className = 'country-items';

      for (const item of byCountry[country].sort((a, b) => a.name.localeCompare(b.name) || a.dist - b.dist)) {
        items.appendChild(item.build());
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

  for (const el of document.querySelectorAll('.route')) {
    const hit = !q || el.dataset.name.includes(q) || el.dataset.country.toLowerCase().includes(q);
    el.classList.toggle('hidden', !hit);
  }

  /* A country group and a continent group behave alike — both count the rows still showing anywhere beneath them — so
     one pass serves for either level of the tree. */
  const settle = (groupClass, headClass) => {
    for (const group of document.querySelectorAll(groupClass)) {
      const shown = group.querySelectorAll('.route:not(.hidden)').length;
      group.classList.toggle('hidden', !shown);
      group.classList.toggle('collapsed', q ? !shown : true);
      group.querySelector(`${headClass} .gcount`).textContent = String(shown);
    }
  };

  settle('.country-group', '.country');
  settle('.continent-group', '.continent');
}

function showBanner(html) {
  bannerEl.innerHTML = html;
  bannerEl.style.display = 'block';
}

/**
 * Name every file that could not be read, and why, under a heading that says what kind of failure it was — the two
 * kinds want opposite things from the reader, so a server that is down must not read as metadata to go and correct.
 * The banner stays up for both: a defect is there to fix, and a file that never arrived is not something the map can
 * show a placeholder for either.
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
 * A link from the Events page arrives as `routes.html#event=<eventID>`, and this is what lands it on the right entry:
 * the first of that event's entries is selected exactly as clicking its row would — expanding the groups above it,
 * scrolling it into view and fitting the map — and the view is then widened to the rest of them.
 *
 * Nothing is hidden. Filtering the sidebar down to the event would read as the search box having been used, leaving the
 * reader to work out how to get the other 79 rows back; selecting is enough to answer "which one is it" and leaves the
 * page in a state they already know how to leave.
 */
function focusHashEvent() {
  const id = new URLSearchParams(location.hash.slice(1)).get('event');

  if (!id) {
    return;
  }

  const routes = store.filter((s) => s.event === id);
  const places = cityStore.filter((c) => c.event === id);

  // Said out loud rather than silently ignored: the link came from somewhere, so landing nowhere needs explaining.
  if (routes.length === 0 && places.length === 0) {
    toast(`Nothing here was added for “${eventNames.get(id) || id}”`);
    return;
  }

  if (routes.length) {
    selectRoute(routes[0]);
  } else {
    selectCity(places[0]);
  }

  const layers = [...routes.map((s) => s.line), ...places.map((c) => c.marker)];

  // An event with more than one entry: widen from the one just selected to the whole set, so none of it is off screen.
  if (layers.length > 1) {
    map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [24, 24], maxZoom: 16 });
  }
}

// Also on hashchange, so a link followed from this page — or the back button — lands the same way as a fresh load.
window.addEventListener('hashchange', focusHashEvent);

async function init() {
  const unreachable = [];
  const rejected = [];
  const note = (file, e) => (e instanceof FetchError ? unreachable : rejected).push({ file, reason: e.message });

  /**
   * Nothing can be drawn without the list, and reading it is the page's first fetch — so this is also where opening
   * the page from disk lands.
   */
  let files;

  try {
    files = await loadManifest();
  } catch (e) {
    showBanner(
      `<b>Could not read <code>gpx.json</code> — ${e.message}.</b><br>` +
        'This page reads the route list and the <code>.gpx</code> files over HTTP, ' +
        'so it needs to be served rather than opened directly from disk. Try:<br>' +
        '<code>python3 -m http.server</code> then open ' +
        '<code>http://localhost:8000/</code> — or view it via GitHub Pages.',
    );
    return;
  }

  // Started alongside the GPX files rather than ahead of them: the names are labels, and 59 fetches need not queue
  // behind one.
  const names = loadEventNames();

  // One bad file does not hide the others, but it is still reported.
  const results = await Promise.allSettled(files.map((file) => loadGpxFile(file)));
  results.forEach((res, i) => {
    const file = files[i];

    if (res.status === 'rejected') {
      note(file, res.reason);
      return;
    }

    const { text, routes, waypoints } = res.value;

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
  });

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

  const all = L.featureGroup([...store.map((s) => s.line), ...cityStore.map((c) => c.marker)]);
  map.fitBounds(all.getBounds(), { padding: [16, 16] });

  // Last, so that the fit to everything above does not immediately undo the fit to one event.
  focusHashEvent();
}

init();
