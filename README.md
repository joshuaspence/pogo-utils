# Pokémon GO Utilities

A collection of GPX walking tracks and teleport waypoints for Pokémon GO, browsable on an interactive map.

**➡️ [Open the map](https://joshuaspence.github.io/pogo-utils/)**

Tracks (`<trk>`) and waypoints (`<wpt>`) are stored as `*.gpx` files under [`data/`](data), grouped by country — the
files themselves are the source of truth. The viewer ([`index.html`](index.html), whose CSS and JavaScript live under
[`src/`](src)) reads them directly, so to run it locally serve the repository over HTTP (the files are loaded via
`fetch`):

```sh
python3 -m http.server
# then open http://localhost:8000/
```

Static hosting cannot list a directory, so the viewer is handed the paths in [`gpx.json`](gpx.json). That file is
generated rather than kept by hand — regenerate it after adding or removing a `.gpx`:

```sh
git ls-files -z '*.gpx' | tr '\0' '\n' | jq --raw-input --slurp 'split("\n") | map(select(length > 0))' > gpx.json
```

Nothing but the paths comes from it. Each listed file is read for what it holds: a `<trk>` becomes a track and a `<wpt>`
becomes a waypoint, so which directory a file sits in decides nothing.

## File format

Each entry keeps its place name in `<name>` and everything else in separate fields, so nothing has to be split back out
of a label:

```xml
<trk>
  <name>Westfalenpark</name>
  <extensions>
    <pgr:city>Dortmund, North Rhine-Westphalia</pgr:city>
    <pgr:country>Germany</pgr:country>
    <pgr:variant>long</pgr:variant>
  </extensions>
</trk>
```

GPX 1.1 has no element for a locality, a country or a short/long variant, so those three live in the `pgr` namespace
declared on `<gpx>`. `<pgr:city>` is the locality the place sits in, including its region — it is absent when the name
is itself the place (`Melbourne`, `Boston, MA`). `<pgr:variant>` is `short`/`long`, and only for routes that come as a
pair. `<name>` and `<pgr:country>` are required; the viewer names any file missing either instead of guessing from the
path.

Every file is real GPX 1.1 and is checked against the schema on each push, using the copy of it vendored at
[`resources/gpx.xsd`](resources/gpx.xsd). That check, and the HTML, CSS and JavaScript linters, run together:

```sh
pnpm install
pnpm lint
```

The schema pass reaches the GPX itself, not the `pgr` fields: GPX declares `<extensions>` as any element from another
namespace, processed leniently, so a misspelled `<pgr:contry>` sails through it. A second pass closes that gap by
reading each file the way the viewer does — every `<trk>` and `<wpt>` must carry a non-empty `<pgr:country>`, a
`<pgr:variant>` is only ever `short` or `long`, and a `pgr` element with no matching field (that `<pgr:contry>`) is
reported as the typo it is.

One caveat: an editor that does not model foreign extensions drops the whole `<extensions>` block when it exports.
gpx.studio is one, so a route re-exported from there comes back without its city, country and variant, and needs them
added again.

## Import into PGSharp

The **PGSharp backup** page ([`pgsharp.html`](pgsharp.html), reached from the top tab bar) builds a _partial_
`PGSData.dat` containing only every route and waypoint here — plus, if ticked, a fixed control layout (floating control,
fast-snipe buttons, cooldown indicator, nearby radar) and the nearby feed's filter list (`Shiny Hunting` and `100%`). No
existing backup is needed: click **Generate & download**, then import the file into PGSharp to add them as favourites.
Because the file holds only those keys, importing it leaves the rest of your PGSharp profile as it was. Everything runs
in the browser. The favourite encoding is a client-side port of [`pgsedit`](https://github.com/joshuaspence/pgsedit).

Every favourite is named with its country's flag in front — `🇳🇱 Amsterdam, Netherlands`, `🇯🇵 Ueno Park, Tokyo, Japan` —
matching PGSharp's own hot places (`🇺🇸 Pier 39, California, USA`). The favourite format has no icon field, so the flag
is simply part of the name; it is derived from the `<pgr:country>`, and a country the viewer has no code for stops the
build rather than importing unflagged. Both lists still sort by the name itself, so a flag never moves an entry.

Each waypoint also carries the IANA timezone its coordinates fall in (`Europe/Madrid`), read from the boundary data in
[`tz-lookup`](https://github.com/darkskyapp/tz-lookup) — a zone name belongs to a polygon, so no offset calculation can
stand in for it. Routes have no timezone field, matching PGSharp. If that script does not load, the backup is written
without timezones and the page says how many were left out; PGSharp accepts entries either way.
