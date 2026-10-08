/**
 * The Integrations page: handing this collection's own data to the third-party tools that will take it, a panel each.
 *
 * The PGSharp panel builds a backup from the repository's GPX files, ported from pgsedit. PGSData.dat is a serialized
 * `java.util.HashMap<String,Object>` whose two favourite keys hold JSON: `hlfavor` is Points, from `<wpt>`, and
 * `hlfavorRoute` is Routes, from `<trk>`. This synthesizes a partial backup from scratch, so importing it leaves the
 * rest of the profile be. The Live PokeMap panel writes a display filter off the shiny hunt list; `livepokemap/` says
 * why that is the only one of the four hunts worth sending.
 *
 * The Java codec is the weight on this page and nothing else uses it, which is why it is reached through `import()`.
 * The display filter rides the same chunk — it is a few hundred bytes of JSON and splitting it again would buy nothing.
 */

import { useState } from 'preact/hooks';

import { said } from '../errors.js';
import { GPX_PATHS } from '../generated.js';
import { loadManifest, parseGpxDocument } from '../gpx.js';
import { displayFilterText, shinyHuntFilter, FILE_NAME } from '../livepokemap/display-filter.js';
import { CONTROLS, CONTROL_LABELS, CONTROL_RESETS, type Control } from '../pgsharp/controls.js';
import { gpxFavourites, type Point, type Route } from '../pgsharp/favourites.js';
import { backupSummary, buildBackup } from '../pgsharp/pgsdata.js';

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

/**
 * `Uint8Array` takes a type argument for the buffer behind it and defaults it to the wide `ArrayBufferLike`, so naming
 * the buffer is what lets the view be a `BlobPart` — a `SharedArrayBuffer` cannot be one. `dumps` builds its answer
 * with `Uint8Array.from`, which is an `ArrayBuffer` already, so the bare annotation is weaker than inference rather
 * than stronger.
 */
function downloadBytes(bytes: Uint8Array<ArrayBuffer>, name: string, type = 'application/octet-stream') {
  const blob = new Blob([bytes], { type });
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
 * The count is parsed back out of the value that will actually be written, so adding a filter to `filters.js` cannot
 * leave a stale number on the page. The five controls above this one nudge a button back to a known position; this is
 * the only entry that can lose the reader something they set up, which is why it is the only one that says so.
 */
const FEED_COUNT = JSON.parse(CONTROL_RESETS.resetFeeds.hlfeeds).length;

/** What the last press of the button came to, and whether it is a failure the status line should colour red. */
interface Status {
  message: string;
  kind?: 'ok' | 'err';
}

export default function IntegrationsPage() {
  const [ticked, setTicked] = useState<ReadonlySet<Control>>(() => new Set(CONTROLS));
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Status | null>(null);

  /**
   * Write the display filter. No fetching and no parsing, so unlike the backup there is nothing to wait for — but
   * `species` throws on a list holding something `pokemon.js` does not define, which is worth saying rather than
   * swallowing. The count comes off the list that was actually written, as the backup's summary does.
   */
  function runFilter() {
    try {
      const filter = shinyHuntFilter();

      downloadBytes(new TextEncoder().encode(displayFilterText(filter)), FILE_NAME, 'application/json');
      setFilterStatus({
        message: `Wrote ${filter.config.speciesFilterList.length} species to ${FILE_NAME}.`,
        kind: 'ok',
      });
    } catch (e) {
      setFilterStatus({ message: `Failed to build the filter: ${said(e)}`, kind: 'err' });
    }
  }

  /**
   * Build the file and hand it over. Everything between the favourites and the bytes is `buildBackup`'s, so what is left
   * here is the three things only a page can do: read which boxes are ticked, offer the result as a download, and say
   * how it went.
   */
  async function run() {
    setRunning(true);
    setStatus({ message: 'Building backup…' });

    try {
      const repo = await buildRepoFavourites();
      const backup = buildBackup(repo, ticked);

      downloadBytes(backup.bytes, 'PGSData.dat');
      setStatus({ message: backupSummary(backup), kind: 'ok' });
    } catch (e) {
      setStatus({ message: `Failed to build backup: ${said(e)}`, kind: 'err' });
    } finally {
      setRunning(false);
    }
  }

  const toggle = (control: Control) =>
    setTicked((was) => {
      const next = new Set(was);

      if (!next.delete(control)) {
        next.add(control);
      }

      return next;
    });

  return (
    <>
      <header class="page">
        <h1>Integrations</h1>
      </header>

      <main class="backup">
        <div class="body">
          <h2>PGSharp backup</h2>

          <p>
            Build a partial PGSharp backup holding every route and waypoint in this collection, plus whichever options
            below are ticked — nothing else. Importing it overwrites exactly those and leaves the rest of your PGSharp
            settings as they were. Everything runs in your browser.
          </p>

          <details class="subgroup" open>
            {/*
             * Say how many options the button will write, so collapsing the list leaves a number behind rather than a
             * label that gives no sign anything under it is ticked.
             */}
            <summary>
              Include controls &amp; filters
              <span class={ticked.size > 0 ? 'tally' : 'tally off'}>
                {ticked.size > 0 ? `${ticked.size} of ${CONTROLS.length}` : 'none'}
              </span>
            </summary>

            <div class="group">
              {/*
               * The input sits inside its label, so neither needs an id — which is the whole of what the ids in the
               * hand-written markup were for, since the script found each checkbox by one to read its `checked`.
               */}
              {CONTROLS.map((control) => (
                <label key={control} class="opt">
                  <input type="checkbox" checked={ticked.has(control)} onChange={() => toggle(control)} />{' '}
                  {CONTROL_LABELS[control]}
                </label>
              ))}

              <p class="note">
                Replaces every feed filter in the profile with these {FEED_COUNT} rather than adding to them.
              </p>
            </div>
          </details>

          <button class="run" type="button" disabled={running} onClick={run}>
            Generate &amp; download
          </button>

          <div class={status?.kind ? `status ${status.kind}` : 'status'}>{status?.message ?? ''}</div>
        </div>

        <div class="body">
          <h2>Live PokeMap display filters</h2>

          <p>
            Build a Live PokeMap display filter that allowlists every species still wanted for a shiny — the same list
            the backup above hands PGSharp, narrowed to what the wild turns up. XXL, XXS and 100% are not here: they are
            thresholds rather than lists, and Live PokeMap shows all three without being told which species to watch.
          </p>

          <p class="note">
            Importing replaces your Live PokeMap display filters entirely — anything not set here, your IV and level
            bounds among it, goes back to its default. Open the file and paste its contents into Live PokeMap&apos;s own
            filter import; it reads the text rather than the file.
          </p>

          <button class="run" type="button" onClick={runFilter}>
            Generate &amp; download
          </button>

          <div class={filterStatus?.kind ? `status ${filterStatus.kind}` : 'status'}>{filterStatus?.message ?? ''}</div>
        </div>
      </main>
    </>
  );
}
