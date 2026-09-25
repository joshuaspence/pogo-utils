# Pokémon GO Utilities

A collection of small, self-contained browser tools for Pokémon GO, served as static files on GitHub Pages and reached
from a shared top tab bar:

- **Events** — a calendar of current and upcoming in-game events, also published as a calendar subscription.
- **Map** — an interactive map of GPX walking tracks and teleport waypoints.
- **Search** — a builder for the strings the game's own Pokémon search box takes.
- **PGSharp** — a backup builder that loads those routes into PGSharp as favourites.

**➡️ [Open the site](https://joshuaspence.github.io/pogo-utils/)**

Tracks (`<trk>`) and waypoints (`<wpt>`) are stored as `*.gpx` files under [`data/`](data), grouped by country — the
files themselves are the source of truth. The map viewer ([`map.html`](map.html), whose CSS and JavaScript live under
[`src/`](src)) reads them directly, so to run it locally serve the repository over HTTP (the files are loaded via
`fetch`):

```sh
python3 -m http.server
# then open http://localhost:8000/map.html
```

Static hosting cannot list a directory, so the viewer is handed the paths in [`gpx-paths.json`](gpx-paths.json). That
file is generated rather than kept by hand — regenerate it after adding or removing a `.gpx`:

```sh
git ls-files -z '*.gpx' | tr '\0' '\n' | jq --raw-input --slurp 'split("\n") | map(select(length > 0))' > gpx-paths.json
```

Nothing but the paths comes from it. Each listed file is read for what it holds: a `<trk>` becomes a track and a `<wpt>`
becomes a waypoint, so which directory a file sits in decides nothing.

[`entries-by-event.json`](entries-by-event.json) is generated for the same kind of reason. The Events page links through
to an event's routes, and the only record of which event an entry belongs to is a `<pgr:event>` inside a GPX file —
finding those would cost the page a fetch of every one of them. It maps each `eventID` to how many routes and waypoints
it has, and is written by the same script that validates the files, so a stale index fails `pnpm lint` instead of
quietly mislabelling a card:

```sh
pnpm lint:xml:fix
```

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

GPX 1.1 has no element for a locality, a country, a short/long variant or an event, so those four live in the `pgr`
namespace declared on `<gpx>`. `<pgr:city>` is the locality the place sits in, including its region — it is absent when
the name is itself the place (`Melbourne`, `Boston, MA`). `<pgr:variant>` is `short`/`long`, and only for routes that
come as a pair. `<pgr:event>` names the event the entry was added for, by the `eventID` it has in
[`data/events.json`](data/events.json), and is absent for a place that stands on its own. `<name>` and `<pgr:country>`
are required; the viewer names any file missing either instead of guessing from the path.

Every file is real GPX 1.1 and is checked against the schema on each push, using the copy of it vendored at
[`resources/gpx.xsd`](resources/gpx.xsd). That check, and the HTML, CSS and JavaScript linters, run together:

```sh
pnpm install
pnpm lint
```

The schema pass reaches the GPX itself, not the `pgr` fields: GPX declares `<extensions>` as any element from another
namespace, processed leniently, so a misspelled `<pgr:contry>` sails through it. A second pass closes that gap by
reading each file the way the viewer does — every `<trk>` and `<wpt>` must carry a non-empty `<pgr:country>`, a
`<pgr:variant>` is only ever `short` or `long`, a `<pgr:event>` must name an `eventID` that
[`data/events.json`](data/events.json) actually has, and a `pgr` element with no matching field (that `<pgr:contry>`) is
reported as the typo it is.

One caveat: an editor that does not model foreign extensions drops the whole `<extensions>` block when it exports.
gpx.studio is one, so a route re-exported from there comes back without its city, country and variant, and needs them
added again.

## Calendar subscription

The same events are published as an iCalendar feed,
[`events.ics`](https://joshuaspence.github.io/pogo-utils/events.ics), so they can be subscribed to rather than read
here. It holds what the Events page shows by default: every dated event other than the weekly-cadence ones, so
subscribing does not put a Spotlight Hour and a Raid Hour into every week of your calendar.

In Google Calendar, that is **Other calendars → + → From URL**; iOS and Outlook take the same URL. Google re-fetches a
subscribed URL on its own schedule, typically somewhere between a few hours and a day, so a newly announced event does
not appear there as promptly as it does on the page.

A calendar app fetches a URL and cannot run the page's JavaScript, so the merge the browser does live has to happen
ahead of time. [`scripts/build-ics.mjs`](scripts/build-ics.mjs) does it, and the
[Calendar workflow](.github/workflows/calendar.yml) runs it every six hours and commits the result:

```sh
node scripts/build-ics.mjs
```

The generator reads no clock — the output is a pure function of the feed, [`data/events.json`](data/events.json) and
[`entries-by-event.json`](entries-by-event.json) — so an unchanged file after a run means the event data has not moved.
That is what makes the commit conditional rather than a fresh set of timestamps four times a day:
[`git-auto-commit-action`](https://github.com/stefanzweifel/git-auto-commit-action) commits and pushes the feed only
when it differs, and passes without a commit when it does not. Note that GitHub disables a scheduled workflow after 60
days without a commit to the repository; re-enable it from the Actions tab if the feed ever goes stale.

An event's times are carried the way Leek Duck gives them. Most are _local_ events — 6am wherever you are — which is
exactly an iCalendar floating time: a `DTSTART` carrying neither a `TZID` nor a trailing `Z`. The ones that are a single
worldwide instant (GO Battle League rotations, most regional events) are written as UTC and convert to your zone as you
would expect.

Floating time is where calendar apps differ, and it is worth knowing which one you are using. Apple Calendar and
Thunderbird implement it, and show a local event at the hour it says. Google Calendar does not: with no calendar-level
timezone in the file to anchor them to, it reads those times as UTC, so a 2pm Community Day arrives at 2pm UTC rather
than 2pm where you are. Pinning them with `X-WR-TIMEZONE` would fix that for one timezone and break it for every
subscriber outside that zone, so the feed leaves them floating — correct by the spec, and correct in a reader that
follows it.

## Search strings

The **Search** page ([`search.html`](search.html)) builds a string for the search box on the game's Pokémon storage
screen. Chips are three-state — click once to require a term, again to rule it out, again to drop it — and the string is
written live, with a link that carries the choices so one can be shared or bookmarked.

The terms live in one table, [`src/search/terms.js`](src/search/terms.js), and the page is rendered from it, so adding
or correcting one is a single line. [`src/search/query.js`](src/search/query.js) turns the state into the string and
holds no DOM, which is where to look to check what the builder actually writes.

Three things the composition decides, since none of them is obvious. Groups are AND'd together, and each group says how
the terms picked within it join: most are OR (`fire,water`), because nothing is two types or two generations, so picking
several can only mean either — while **Status** is AND (`shiny&lucky`), because a Pokémon is any number of those at once
and a lucky shiny is the reason to search for two of them. A pair that is one slot therefore gets a group to itself
rather than a place among the statuses: nothing is both Shadow and Purified, so those two OR. Terms ruled out are
negated and AND'd whatever their group does (`!fire&!water`), since `!fire,!water` would match everything: everything is
either not Fire or not Water. And Pokémon GO's search has no brackets, so a string mixing `,` and `&` cannot say which
binds first; the builder writes its clauses in a fixed order and says so on the page when the question can arise, rather
than picking a reading on your behalf.

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

## Prior art

The Events page began as a look at three sites covering the same ground, each worth visiting in its own right:

| Site                                                           | What it is                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [PGO Calendar](https://vivific.github.io/pgocalendar/)         | A calendar of current and upcoming events.                                        |
| [Event Board](https://hydrorx1.github.io/POGO-Event-Timezone/) | The same events read against a world clock, and it publishes iCalendar feeds too. |
| [SWFLJOHN](https://swfljohn.com)                               | Events and GPX routes on one site — the pair of things this repository holds.     |

The last two are built on the same [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) mirror of Leek Duck as the
Events page here, so an event missing from one is usually missing from all three.
