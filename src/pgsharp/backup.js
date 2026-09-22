/**
 * Building a PGSharp backup from the repository's GPX files, ported from the pgsedit tool. PGSData.dat is a serialized
 * java.util.HashMap<String,Object>; two of its favourite keys hold JSON — "hlfavor" is Points (one coordinate each,
 * from <wpt>) and "hlfavorRoute" is Routes (a whole path, from <trk>). This synthesizes a partial backup from scratch,
 * holding only those two keys plus whichever controls and filters are ticked, and serializes it with the codec in
 * java-serialization.js — nothing is read from an existing backup, so importing it leaves the rest of the profile be.
 */

import COUNTRIES from '../countries.js';
import { eachTrack, entryCountry, extText, loadManifest, parseGpxDocument, placeName } from '../gpx.js';
import { JavaSer } from '../java-serialization.js';
import { CONTROL_RESETS } from './controls.js';

const POINTS_KEY = 'hlfavor';
const ROUTES_KEY = 'hlfavorRoute';
/**
 * Third element of every stored route point, and the neutral playback state of a route that has not been walked — both
 * copied from PGSharp's own output.
 */
const ROUTE_POINT_FLAG = 65536;
const ROUTE_MODE = 2;
const newRouteState = () => ({
  direction: 1,
  nextNodePos: 0,
  preNodePos: -1,
  loopcount: 0,
  lat: 0,
  lng: 0,
});

/**
 * Gson's JSON spelling: no spaces, forward slashes escaped. Points escape non-ASCII as \uXXXX (what "hlfavor"
 * contains); Routes write it literally ("São Paulo") — the two keys differ, so they don't share an encoder. A flag is
 * escaped per UTF-16 code unit either way, matching hot places for Points and leaving the Route stream to write the
 * surrogates as Java's modified UTF-8 does.
 */
const escSlashes = (s) => s.replace(/\//g, '\\/');
const asciiEscape = (s) => s.replace(/[\u0080-\uFFFF]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

function encodePoints(entries) {
  const arr = entries.map((e) => {
    const o = { name: e.name, lat: e.lat, lng: e.lng };

    if (e.tz) {
      o.tz = e.tz;
    }

    return o;
  });
  return escSlashes(asciiEscape(JSON.stringify(arr)));
}

function encodeRoutes(entries) {
  const arr = entries.map((e) => ({
    points: e.points,
    mode: e.mode ?? ROUTE_MODE,
    state: e.state || newRouteState(),
    name: e.name,
  }));
  return escSlashes(JSON.stringify(arr));
}

/**
 * A favourite's whole name — the sidebar's "<name>, <locality>" plus the country and, for one of a short/long pair, the
 * variant: "Kings Park, Perth, Western Australia, Australia (long)". PGSharp lists and deletes favourites by name, so
 * this is the only identity a favourite has, which is why every part of it comes from the file rather than the path —
 * this mirrors pgsedit's entry_name.
 */
function entryName(el) {
  const label = `${placeName(el)}, ${entryCountry(el)}`;
  const variant = extText(el, 'variant');
  return variant ? `${label} (${variant})` : label;
}

/**
 * A subdivision flag is a black flag, the region and subdivision letters as tag characters (ASCII shifted into the tag
 * block), then the cancel tag.
 */
const REGIONAL_INDICATOR_A = 0x1f1e6,
  TAG_BLOCK = 0xe0000,
  CANCEL_TAG = 0xe007f;
const BLACK_FLAG = '\u{1F3F4}';

/**
 * The emoji flag for a country, derived from its alpha-2 code in COUNTRIES.
 *
 * PGSharp's own hot places carry a country flag at the front of the name — "🇺🇸 Pier 39, California, USA" — in the
 * same {name,lat,lng,tz} schema our waypoints use. The format has no icon field, so the flag is simply the first
 * characters of the name, and both favourite kinds here follow that convention.
 *
 * The country comes from a <pgr:country>, so it must have an entry in COUNTRIES; one that does not errors rather than
 * importing without a flag.
 */
function countryFlag(country) {
  const code = COUNTRIES[country]?.code;

  if (!code) {
    throw new Error(`no flag for "${country}" — add it to COUNTRIES`);
  }

  if (code.includes('-')) {
    const tags = [...code.replace('-', '').toLowerCase()].map((c) => String.fromCodePoint(TAG_BLOCK + c.charCodeAt(0)));
    return BLACK_FLAG + tags.join('') + String.fromCodePoint(CANCEL_TAG);
  }

  return [...code].map((c) => String.fromCodePoint(REGIONAL_INDICATOR_A + c.charCodeAt(0) - 65)).join('');
}

// A favourite's name with its country's flag in front.
function flaggedName(el) {
  return `${countryFlag(entryCountry(el))} ${entryName(el)}`;
}

function coord(el) {
  const lat = parseFloat(el.getAttribute('lat'));
  const lng = parseFloat(el.getAttribute('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`<${el.localName}> has an unparseable coordinate`);
  }

  return [lat, lng];
}

/**
 * Split one GPX file into Points and Routes by element, not by filename: a <wpt> is one coordinate (a Point), a <trk>
 * is a path (a Route keeping all of its <trkpt>). A file may hold either or both. Mirrors pgsedit's parse_gpx — an
 * empty <trk> is skipped (gpx.studio writes one for a cleared track) rather than treated as a route. Both kinds are
 * flagged, so the two lists read alike in the app even though PGSharp shows them on separate tabs.
 */
function parseGpxFavourites(text) {
  const doc = parseGpxDocument(text);

  const points = [],
    routes = [];

  for (const wpt of doc.getElementsByTagName('wpt')) {
    const [lat, lng] = coord(wpt);
    points.push({ name: flaggedName(wpt), lat, lng });
  }

  for (const { trk, trkpts } of eachTrack(doc)) {
    const pts = [];

    for (const p of trkpts) {
      const [lat, lng] = coord(p);
      pts.push([lat, lng, ROUTE_POINT_FLAG]);
    }

    routes.push({ name: flaggedName(trk), points: pts, mode: ROUTE_MODE, state: newRouteState() });
  }

  return { points, routes };
}

/**
 * Build the favourite lists by re-parsing every GPX file, so the result is decided by each file's own elements and
 * metadata rather than by how the map viewer happened to load them. Every file is fetched and parsed before the backup
 * is touched, so a bad or nameless file aborts with a clear message instead of writing a half-built backup. The readers
 * name the element at fault; the file is added here, where it is known, so a failure reads as "England/West End,
 * London.gpx: <trk> has no <pgr:country>".
 */
async function buildRepoFavourites() {
  /**
   * Read the list again rather than reuse what the map loaded, so a backup is built from every file the repository has,
   * not only the ones that drew.
   */
  let files;

  try {
    files = await loadManifest();
  } catch (e) {
    throw new Error(`gpx.json: ${e.message}`, { cause: e });
  }

  const texts = await Promise.all(
    files.map(async (file) => {
      const res = await fetch(encodeURI(file));

      if (!res.ok) {
        throw new Error(`${file}: ${res.status} ${res.statusText}`);
      }

      return [file, await res.text()];
    }),
  );
  const points = [],
    routes = [];

  for (const [file, text] of texts) {
    let parsed;

    try {
      parsed = parseGpxFavourites(text);
    } catch (e) {
      throw new Error(`${file}: ${e.message}`, { cause: e });
    }

    points.push(...parsed.points);
    routes.push(...parsed.routes);
  }

  return { points, routes };
}

/**
 * Fill in each Point's IANA timezone from its coordinates, mirroring pgsedit's apply_timezones. The name is a property
 * of a boundary polygon rather than anything a formula can derive from a coordinate — Melbourne and Sydney share a UTC
 * offset but not a zone name, and Missouri is America/Chicago, not America/New_York — so it comes from the boundary
 * data tz-lookup carries. Routes have no tz field, so nothing is looked up for them. A point whose zone cannot be found
 * is left without one, which is how a missing script or an unlocatable coordinate looks; the count is returned so the
 * caller can say so once rather than per point. PGSharp accepts entries with no tz.
 */
function applyTimezones(points) {
  let unknown = 0;

  for (const p of points) {
    let tz = null;

    if (typeof tzlookup === 'function') {
      try {
        tz = tzlookup(p.lat, p.lng);
      } catch {
        tz = null;
      }
    }

    if (tz) {
      p.tz = tz;
    } else {
      unknown++;
    }
  }

  return unknown;
}

// Names must be unique within a kind (PGSharp lists and deletes by name), so drop any repeated name, keeping the first.
function dedupeByName(entries) {
  const seen = new Set();
  const out = [];
  let dropped = 0;

  for (const e of entries) {
    if (seen.has(e.name)) {
      dropped++;
      continue;
    }

    seen.add(e.name);
    out.push(e);
  }

  return { out, dropped };
}

/**
 * Order favourites the way pgsedit's `reorder` does: fold accents (decompose with NFKD, then drop the combining marks)
 * and case, so "São Paulo" files under S rather than after every ASCII name. A tie on the folded key falls back to the
 * exact spelling, so names differing only by accent still order deterministically. Each kind is sorted within itself,
 * as PGSharp lists them separately. A favourite's leading flag is decoration rather than part of how the list reads, so
 * it is folded out too — otherwise every place would sort by its country's regional-indicator code instead of by name.
 */
const sortKey = (name) =>
  (name || '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

function byName(a, b) {
  const ka = sortKey(a.name),
    kb = sortKey(b.name);

  if (ka !== kb) {
    return ka < kb ? -1 : 1;
  }

  if (a.name !== b.name) {
    return a.name < b.name ? -1 : 1;
  }

  return 0;
}

const backupRunEl = document.getElementById('backupRun');
const backupStatusEl = document.getElementById('backupStatus');

function backupStatus(msg, kind) {
  backupStatusEl.textContent = msg;
  backupStatusEl.className = 'status' + (kind ? ' ' + kind : '');
}

/**
 * The options, read off the same object the click handler looks them up in rather than a second list of ids here — add a
 * control to CONTROL_RESETS and it is counted without touching this.
 */
const optEls = Object.keys(CONTROL_RESETS).map((id) => document.getElementById(id));
const optTallyEl = document.getElementById('optTally');

/**
 * Say on the summary how many options the button will write, so collapsing the list leaves a number behind rather than a
 * label that gives no sign anything under it is ticked.
 */
function updateTally() {
  const on = optEls.filter((el) => el.checked).length;
  optTallyEl.textContent = on ? `${on} of ${optEls.length}` : 'none';
  optTallyEl.classList.toggle('off', !on);
}

for (const el of optEls) {
  el.addEventListener('change', updateTally);
}

updateTally();

/**
 * The five options above nudge one button back to a known position; this one hands PGSharp a whole filter list, which it
 * takes in place of the profile's own rather than alongside it. That is the only entry here that can lose the reader
 * something they set up, so it says so — with the count parsed back out of the value that will actually be written, so
 * adding a filter to filters.js cannot leave a stale number in the markup.
 */
const feedCount = JSON.parse(CONTROL_RESETS.resetFeeds.hlfeeds).length;
document.getElementById('feedNote').textContent =
  `Replaces every feed filter in the profile with these ${feedCount} rather than adding to them.`;

function downloadBytes(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Synthesize a partial PGSData.dat from scratch — a HashMap holding only the keys we set (the favourites, plus
 * whichever controls and filters are ticked). Nothing is read from an existing backup; every other preference is
 * omitted, so importing this leaves the rest of the profile as PGSharp had it.
 */
backupRunEl.addEventListener('click', async () => {
  backupRunEl.disabled = true;
  backupStatus('Building backup…');

  try {
    const repo = await buildRepoFavourites();
    const notes = [];

    /**
     * Names must be unique within a kind (PGSharp lists and deletes by name), so drop any repeat, then alphabetise
     * within each kind like `reorder`.
     */
    const p = dedupeByName(repo.points);
    const r = dedupeByName(repo.routes);
    const points = p.out,
      routes = r.out;

    if (p.dropped) {
      notes.push(`${p.dropped} duplicate waypoint name(s) skipped`);
    }

    if (r.dropped) {
      notes.push(`${r.dropped} duplicate route name(s) skipped`);
    }

    points.sort(byName);
    routes.sort(byName);

    const noTz = applyTimezones(points);

    if (noTz) {
      notes.push(`${noTz} waypoint(s) without a timezone`);
    }

    const root = new Map();
    root.set(POINTS_KEY, encodePoints(points));
    root.set(ROUTES_KEY, encodeRoutes(routes));

    /**
     * Include whichever controls are ticked, set to fixed values. A number is written as a Java Float; a string (a
     * filter, the radar's or the feed list's) as-is.
     */
    let controls = 0;

    for (const [id, keys] of Object.entries(CONTROL_RESETS)) {
      if (!document.getElementById(id).checked) {
        continue;
      }

      for (const [k, v] of Object.entries(keys)) {
        root.set(k, typeof v === 'string' ? v : JavaSer.box('F', v));
      }

      controls++;
    }

    if (controls) {
      notes.push(`${controls} control(s)`);
    }

    const outBytes = JavaSer.dumps(root);
    JavaSer.loads(outBytes); // re-parse our own output before offering it

    downloadBytes(outBytes, 'PGSData.dat');
    const detail = notes.length ? ` (${notes.join('; ')})` : '';
    backupStatus(
      `Built a partial backup — ${points.length} waypoint(s) and ${routes.length} route(s)${detail}. ` +
        'Import it into PGSharp.',
      'ok',
    );
  } catch (e) {
    backupStatus(`Failed to build backup: ${e.message}`, 'err');
  } finally {
    backupRunEl.disabled = false;
  }
});
