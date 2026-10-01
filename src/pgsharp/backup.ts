/**
 * Building a PGSharp backup from the repository's GPX files, ported from the pgsedit tool. PGSData.dat is a serialized
 * java.util.HashMap<String,Object>; two of its favourite keys hold JSON — "hlfavor" is Points (one coordinate each,
 * from <wpt>) and "hlfavorRoute" is Routes (a whole path, from <trk>). This synthesizes a partial backup from scratch,
 * holding only those two keys plus whichever controls and filters are ticked, and serializes it with the codec in
 * java-serialization.js — nothing is read from an existing backup, so importing it leaves the rest of the profile be.
 */

import { said } from '../errors.js';
import { GPX_PATHS } from '../generated.js';
import { loadManifest, parseGpxDocument } from '../gpx.js';
import { JavaSer } from '../java-serialization.js';
import { CONTROL_RESETS } from './controls.js';
import {
  applyTimezones,
  byName,
  dedupeByName,
  encodePoints,
  encodeRoutes,
  gpxFavourites,
  POINTS_KEY,
  ROUTES_KEY,
  type Point,
  type Route,
} from './favourites.js';
import { byId } from '../dom.js';

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
    throw new Error(`${GPX_PATHS}: ${said(e)}`, { cause: e });
  }

  const texts = await Promise.all(
    files.map(async (file): Promise<[string, string]> => {
      const res = await fetch(encodeURI(file));

      if (!res.ok) {
        throw new Error(`${file}: ${res.status} ${res.statusText}`);
      }

      return [file, await res.text()];
    }),
  );

  const points: Point[] = [];

  const routes: Route[] = [];

  for (const [file, text] of texts) {
    let parsed;

    try {
      parsed = gpxFavourites(parseGpxDocument(text));
    } catch (e) {
      throw new Error(`${file}: ${said(e)}`, { cause: e });
    }

    points.push(...parsed.points);
    routes.push(...parsed.routes);
  }

  return { points, routes };
}

const backupRunEl = byId('backupRun', HTMLButtonElement);
const backupStatusEl = byId('backupStatus');

function backupStatus(msg: string, kind?: string) {
  backupStatusEl.textContent = msg;
  backupStatusEl.className = 'status' + (kind ? ' ' + kind : '');
}

/**
 * The options, read off the same object the click handler looks them up in rather than a second list of ids here — add a
 * control to CONTROL_RESETS and it is counted without touching this.
 */
const optEls = Object.keys(CONTROL_RESETS).map((id) => byId(id, HTMLInputElement));
const optTallyEl = byId('optTally');

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
byId('feedNote').textContent =
  `Replaces every feed filter in the profile with these ${feedCount} rather than adding to them.`;

/**
 * `Uint8Array` takes a type argument for the buffer behind it and defaults it to the wide `ArrayBufferLike`, so naming
 * the buffer is what lets the view be a `BlobPart` — a `SharedArrayBuffer` cannot be one. `dumps` builds its answer
 * with `Uint8Array.from`, which is an `ArrayBuffer` already, so the bare annotation is weaker than inference rather
 * than stronger.
 */
function downloadBytes(bytes: Uint8Array<ArrayBuffer>, name: string) {
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
      if (!byId(id, HTMLInputElement).checked) {
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
    backupStatus(`Failed to build backup: ${said(e)}`, 'err');
  } finally {
    backupRunEl.disabled = false;
  }
});
