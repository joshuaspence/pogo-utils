# Pokémon GO Utilities

A collection of small, self-contained browser tools for Pokémon GO, served as static files on GitHub Pages as one Preact
application and reached from a shared top tab bar:

- **Events** (`#/events`) — a calendar of current and upcoming in-game events, also published as a calendar
  subscription.
- **Map** (`#/map`) — an interactive map of GPX walking tracks and teleport waypoints.
- **Search** (`#/search`) — a builder for the strings the game's own Pokémon search box takes.
- **Pokédex** (`#/pokedex`) — every species and its forms: what is in the game, which have a shiny, and which hunts
  still want it.
- **PGSharp** (`#/pgsharp`) — a backup builder that loads those routes into PGSharp as favourites.

**➡️ [Open the site](https://joshuaspence.github.io/pogo-utils/)**

One document, [`index.html`](index.html), and a page per tab under [`src/pages/`](src/pages). The fragment carries both
where the reader is and the state they left that page in — `#/pokedex?q=pika&n=25` is the Pokédex with a filter typed
and a species open — so a filtered view is still a link. The fragment rather than a path because GitHub Pages has no
rewrites: a path would need every deep link served by `404.html`, which answers HTTP 404 while rendering the page.
[`src/router.ts`](src/router.ts) splits the two halves apart, which is what lets each page keep the state module it
already had: [`src/pokedex/state.ts`](src/pokedex/state.ts) and [`src/search/query.ts`](src/search/query.ts) parse a
query string and have no opinion about which page they are on.

Each page is reached through `import()`, so the chunk holding Leaflet and the one holding the Java serialization codec
are fetched only by the tabs that need them rather than by every reader of the events calendar.

Tracks (`<trk>`) and waypoints (`<wpt>`) are stored under [`data/`](data) as one `*.gpx` file per country,
[`data/Australia.gpx`](data/Australia.gpx) and so on — the files themselves are the source of truth. The map page reads
them directly, so to run it locally build the site and serve `dist/` over HTTP (the files are loaded via `fetch`). The
checkout is not servable: `index.html` names `src/main.css` and `src/main.js`, and both are written by the build rather
than kept here, so serving the repository root gets a page with no stylesheet and no module.

```sh
pnpm install
pnpm build
pnpm serve
# then open http://localhost:8000/#/map
```

`pnpm serve` serves what the last build left rather than building first, so an edit under `src/` wants `pnpm build`
again before it shows — and an absent `dist/` stops the server naming that command rather than answering every request
with a 404. The server is [`scripts/serve.mts`](scripts/serve.mts), a `node:http` handler, so nothing is installed for
it and nothing is served that the build does not publish: an extension with no entry in
[`scripts/served-types.mts`](scripts/served-types.mts) is a 404 rather than a guessed type.

That table is the point of serving it this way. Each entry was read off the deployment with `curl -sI` rather than
chosen here, so a header is the same locally as in production — which is what lets the Events page's **Subscribe** link
be followed here at all, `text/calendar` being what a calendar client takes and `text/plain` being what it ignores. It
is also the list [`scripts/assemble.mts`](scripts/assemble.mts) holds `dist/` to, so a new kind of file is one entry
rather than two that can drift apart.

Nothing re-checks those values against the deployment, and the suite cannot: it reads the same table to assert the
server honours it. So a header Pages changes is found by asking it — `curl -sI` against the published file — rather than
by a run going red.

One caveat is local only and stays. The LAN address printed beside the local one is good for viewing the site on a phone
but not for installing it — a plain-HTTP origin is no secure context, and Chrome will read `manifest.json` for
installation only from one — so [Installing as an app](#installing-as-an-app) is a flow only `localhost` or Pages can
exercise.

Static hosting cannot list a directory, so the viewer is handed the paths in
[`data/gpx-paths.json`](data/gpx-paths.json). Nothing but the paths comes from it. Each listed file is read for what it
holds: a `<trk>` becomes a track and a `<wpt>` becomes a waypoint, each grouped under the country its own
`<pgr:country>` names, so what a file is called decides nothing. One file per country is therefore a convention for the
reader rather than something the viewer relies on — a file naming two countries would be drawn under both.

[`data/entries-by-event.json`](data/entries-by-event.json) is generated for the same kind of reason. The Events page
links through to an event's routes, and the only record of which event an entry belongs to is a `<pgr:event>` inside a
GPX file — finding those would cost the page a fetch of every one of them. It maps each `eventID` to how many routes and
waypoints it has.

Neither is in version control. `pnpm build` writes both, out of the very pass that validates the files, so adding or
removing a `.gpx` is the whole of the change — there is no index to regenerate alongside it and no stale copy for a
check to catch.

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

A country's file holds every entry in it, waypoints first and then tracks. That grouping is the format's rather than a
preference: `gpxType` in [the schema](resources/gpx.xsd) is an `xsd:sequence` of `metadata?`, `wpt*`, `rte*`, `trk*`,
`extensions?`, so a validator that has read a `<trk>` is already past the `wpt` particle and a waypoint below one
matches nothing left — `pnpm lint:xml` rejects the file. Within each kind entries are sorted by `<name>`, and
neighbouring entries are separated by a blank line, so a new entry has one place to go and a diff stays small.

GPX 1.1 has no element for a locality, a country, a short/long variant or an event, so those four live in the `pgr`
namespace declared on `<gpx>`. `<pgr:city>` is the locality the place sits in, including its region — it is absent when
the name is itself the place (`Melbourne`, `Boston, MA`). `<pgr:variant>` is `short`/`long`, and only for routes that
come as a pair. `<pgr:event>` names the event the entry was added for, by the `eventID` it has in
[`data/events.json`](data/events.json), and is absent for a place that stands on its own. `<name>` and `<pgr:country>`
are required; the viewer names any file missing either instead of guessing from the file name.

The Routes page's Copy button hands over the one entry it sits beside, written back out as a GPX file of its own rather
than the country file it was read from.

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

Both the page and the subscription read Leek Duck's events from [`data/events-feed.json`](data/events-feed.json), a copy
of the [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) mirror kept here rather than fetched from it on every
visit. That is what holds the two in step — a browser reading the mirror live and a generator that had read it hours
earlier could disagree — and it gives the feed a history, ScrapedDuck's own being a single commit force-pushed on every
scrape, so `git log -p data/events-feed.json` says when an event appeared, was renamed, moved or lost its dates.
[`scripts/vend-feed.mts`](scripts/vend-feed.mts) takes the copy and the [Vend workflow](.github/workflows/vend.yml) runs
it hourly:

```sh
pnpm vend:events
```

Each event is cut down to the eight fields the pages read and the list is sorted by `eventID`, so a reworded `extraData`
blurb, a rehosted image or a reordering upstream is not a diff here. That is what makes the commit conditional:
[`git-auto-commit-action`](https://github.com/stefanzweifel/git-auto-commit-action) pushes the copy only when it
differs, and the run passes without a commit when it does not. An empty list or an event with no `eventID` is refused
rather than written, an empty list being what a broken scrape looks like.

[`data/events.json`](data/events.json), this repository's own list, is not replaced wholesale but pruned: the
[Prune workflow](.github/workflows/prune.yml) runs [`scripts/prune-events.mts`](scripts/prune-events.mts) daily, which
removes every event that has ended everywhere — a naive end once it has passed at UTC−12 — along with any `<pgr:event>`
naming one. An event with no announced end is kept, and so is one the feed also carries: that entry overrides the feed's
rather than being the only copy of it, so removing it would uncover upstream's, which by then is usually the same event
without its dates. The run re-checks the files with `pnpm lint:xml` before it commits, a reference left behind being one
the build would refuse on every deploy after it.

```sh
pnpm prune:events
```

GitHub's 60-day rule applies to both scheduled workflows: a schedule is disabled after 60 days with no commit to the
repository. The Vend workflow's hourly commits are what keep them alive, which holds as long as the events keep moving;
if everything here goes stale at once, re-enable them from the Actions tab.

A calendar app fetches a URL and cannot run the page's JavaScript, so the merge the browser does has to happen ahead of
time. [`scripts/build-ics.mts`](scripts/build-ics.mts) does it, as a step of the build rather than after one:

```sh
pnpm build
```

The feed is not in version control — it is derived from `data/events-feed.json`, [`data/events.json`](data/events.json)
and [`data/entries-by-event.json`](data/entries-by-event.json), all three of which are, so there is no second copy to
keep in step. The generator reads no clock and makes no request, which is why it can sit inside `pnpm build` at all:
`pnpm lint:types` _is_ `pnpm build`, so a generator that fetched would put somebody else's server in front of every
lint. A local run therefore produces exactly the bytes a deploy does.

Nothing is on a timer. The [Pages workflow](.github/workflows/pages.yml) deploys on a push, and since a push made with
the default `GITHUB_TOKEN` raises no workflow run, the Vend workflow asks for the deploy itself once it has committed a
change. So a quiet stretch upstream deploys nothing at all rather than republishing identical bytes, and the page and
the subscription are always siblings of one deploy. Two things follow: data on the page is up to an hour old where it
had been live, and a deploy lost to a failed dispatch waits for the next change to the feed rather than for the next
tick — **Run workflow** on either workflow closes that by hand.

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

The **Search** page ([`src/pages/search.tsx`](src/pages/search.tsx)) builds a string for the search box on the game's
Pokémon storage screen. Chips are three-state — click once to require a term, again to rule it out, again to drop it —
and the string is written live, with a link that carries the choices so one can be shared or bookmarked.

The terms live in one table, [`src/search/terms.ts`](src/search/terms.ts), and the page is rendered from it, so adding
or correcting one is a single line. [`src/search/query.ts`](src/search/query.ts) turns the state into the string and
holds no DOM, which is where to look to check what the builder actually writes.

Three things the composition decides, since none of them is obvious. Groups are AND'd together, and each group says how
the terms picked within it join: most are OR (`fire,water`), because nothing is two types or two generations, so picking
several can only mean either — while **Status** and **Moves** are AND (`shiny&lucky`), because a Pokémon is any number
of those at once and a lucky shiny is the reason to search for two of them. A pair that is one slot therefore gets a
group to itself rather than a place among the statuses: nothing is both Shadow and Purified, so those two OR. Terms
ruled out are negated and AND'd whatever their group does (`!fire&!water`), since `!fire,!water` would match everything:
everything is either not Fire or not Water. And Pokémon GO's search has no brackets, so a string mixing `,` and `&`
cannot say which binds first; the builder writes its clauses in a fixed order and says so on the page when the question
can arise, rather than picking a reading on your behalf.

**Shorten**, beside the character count, says the same thing in fewer characters — worth having because the game's
search box is a small one and a long string is pasted with half of it out of sight. Both reductions are the same
observation: the choices name the species at more length than the game needs. A name can lose its tail, since
`charmander` and `charma` reach the same one species and so does the dex number `4`; and the generation chips, the
dex-number boxes and a name that has become a number all write spans of the same numbers into clauses that are AND'd, so
they collapse into their overlap — Gen 1 with Gen 2 is `1-251`, and `charmander` inside Gen 1 is just `4`. Occasionally
that makes the string plainer as well as shorter: `shiny&1-151,152-251` mixes `,` with `&` and earns the warning above,
where `shiny&1-251` says the same thing and does not.

[`src/search/optimise.ts`](src/search/optimise.ts) rewrites the _state_ rather than the string, handing a second state
to the same composer, so the short string goes through the same clause writer and the same ambiguity check as the long
one — and the chips, the boxes and the link never stop carrying what was actually chosen, so switching the toggle back
off restores the original rather than leaving a rewrite to undo. The substitutions are listed under the string, because
one of them is not an equivalence: a name matches nicknames as well as species, where a dex number matches the species
alone. What it will not do is turn `+charmander` into `4,5,6`, or shorten it to `+charm` by reaching the family through
another of its members; both need to know which species share an evolution family, which is data this repository does
not hold. A `+` keeps its name and gets the name shortening alone.

## Pokédex

The **Pokédex** page ([`src/pages/pokedex.tsx`](src/pages/pokedex.tsx)) is the whole national dex as a grid of cards,
narrowed by name or number, by generation, by whether a species is in the game yet, and by toggles for a shiny, a wild
spawn, a category (Legendary, Mythical, Ultra Beast, Baby, Regional) or a place on one of the hunt lists. Picking a card
opens the species: its normal and shiny sprite, what is true of it, each of its forms and regional variants with the
same answers, and a link into the **Search** page for it or its family. The arrows step through the species the filters
left, and the link carries both the filters and the open species.

Nothing on it is kept by hand. [`src/pokedex/entries.ts`](src/pokedex/entries.ts) reads
[`src/pokemon/pokedex.ts`](src/pokemon/pokedex.ts) for the flags and the hunt lists in [`src/filters/`](src/filters) for
what is still wanted — the same Sets the PGSharp backup is built from — so crossing a species off `xxl.js` takes it off
the page's XXL filter too. A list is a checklist and the backup's feed is that list narrowed to what the wild can turn
up, so the page says when a species is wanted but the feed cannot alert on it: Mewtwo is still wanted as a 100%, and
only a raid will ever produce one. Sprites are hotlinked from [PokeAPI](https://github.com/PokeAPI/sprites); a species
keeps its number and name if one does not load.

## Import into PGSharp

The **PGSharp backup** page ([`src/pages/pgsharp.tsx`](src/pages/pgsharp.tsx), reached from the top tab bar) builds a
_partial_ `PGSData.dat` containing only every route and waypoint here — plus, if ticked, a fixed control layout
(floating control, fast-snipe buttons, cooldown indicator, nearby radar) and the nearby feed's filter list
(`Shiny Hunting` and `100%`). No existing backup is needed: click **Generate & download**, then import the file into
PGSharp to add them as favourites. Because the file holds only those keys, importing it leaves the rest of your PGSharp
profile as it was. Everything runs in the browser. The favourite encoding is a client-side port of
[`pgsedit`](https://github.com/joshuaspence/pgsedit).

Every favourite is named with its country's flag in front — `🇳🇱 Amsterdam, Netherlands`, `🇯🇵 Ueno Park, Tokyo, Japan` —
matching PGSharp's own hot places (`🇺🇸 Pier 39, California, USA`). The favourite format has no icon field, so the flag
is simply part of the name; it is derived from the `<pgr:country>`, and a country the viewer has no code for stops the
build rather than importing unflagged. Both lists still sort by the name itself, so a flag never moves an entry.

Each waypoint also carries the IANA timezone its coordinates fall in (`Europe/Madrid`), read from the boundary data in
[`tz-lookup`](https://github.com/darkskyapp/tz-lookup) — a zone name belongs to a polygon, so no offset calculation can
stand in for it. Routes have no timezone field, matching PGSharp. If that script does not load, the backup is written
without timezones and the page says how many were left out; PGSharp accepts entries either way.

## Installing as an app

[`manifest.json`](manifest.json) lets a phone add the site to its home screen and open it without the browser's toolbar,
starting on the Events page, with a long-press shortcut to each of the five tabs. Its paths are relative, so it works
under the Pages subdirectory as well as from a local server, and [`scripts/assemble.mts`](scripts/assemble.mts) resolves
every one of them inside the build the same way it resolves the markup's: an icon or a shortcut naming a file that moved
fails the build rather than drawing a letter tile on somebody's home screen.

The icons the manifest names are not in the checkout at all: [`scripts/build-icons.mts`](scripts/build-icons.mts)
renders each from [`favicon.svg`](favicon.svg) straight into `dist/icons/`, the way the calendar feed is written rather
than kept, reading the manifest for the sizes to draw and for the plate colour behind a maskable one. The ball is
therefore drawn in exactly one place. They are PNGs at the sizes the manifest declares because Chrome matches an
installable icon by its declared pixel size and wants both a 192 and a 512. A maskable icon is the same ball inset to
two thirds of its canvas — far enough in to keep the rim inside the central 40% radius a launcher promises to keep when
it crops the icon to its own shape — composited onto an opaque plate, because the corners of a cropped icon are never
transparent. At 768 that inset is exactly 128 pixels, so the ball is rendered at 512 rather than resampled from it.
Nothing in the chain honours `prefers-color-scheme`, which is what makes `favicon.svg`'s themed rim come out in the
light theme's dark colour every time, rather than whenever the person rendering it by hand remembered to.

## Pokémon inventory

`pnpm inventory scan` lists every Pokémon in storage in a CSV (species, nickname, form, costume, shiny, lucky, XXL/XXS,
CP, HP, level, IVs and moves) by driving an Android phone over `adb`. Pokémon GO is drawn by Unity, so Android can't
read its text; instead the script takes a screenshot at each step and reads it with Tesseract. Both tools have to be on
`PATH`:

```sh
brew install android-platform-tools tesseract   # or: apt install adb tesseract-ocr
pnpm inventory scan --out inventory.csv
```

The scan needs PGSharp with its IV display switched on, since PGSharp's overlay is where the level and the three IVs are
read from; on the stock client those columns come back empty. Plug the phone in with USB debugging on, set Pokémon GO to
English and choose a storage sort order first; the scan keeps whatever order is set. It opens the first Pokémon and
swipes through the rest, reading the detail screen and then the moves scrolled into view. Form is never shown on screen,
so the script works it out from the HP, IVs and types against the base stats in
[PokeMiners' game master](https://github.com/PokeMiners), which is also how a nicknamed Pokémon gets its species back.
Size comes from the `XXL` or `XXS` badge on the detail screen, and shiny, lucky and costume from the game's own
searches, one quick pass each before the full pass; `--flags` picks which. Expect several seconds per Pokémon. `--limit`
and `--skip` break a long run into pieces, and `--refresh` downloads the game master and form icons again rather than
using the week-old cache. Pokémon GO is launched only where it is not already the app in front, so a run started over an
open storage screen picks up from there rather than waiting out a cold start.

A scroll capture keeps dragging the screen up and taking a screenshot until it stops moving, then stitches the frames
into one tall image, which is how a screen longer than the phone is seen whole. `pnpm inventory snap` takes one of any
screen it can confirm is a detail screen, saved as `NAME-scrolled.png` beside the screen itself, and a scan takes one
where `--scroll` asks for it, reading the moves from it rather than from one screenshot taken part way down. A snap then
drags the panel back to where it found it, measuring rather than assuming it got there, so one snap does not shift the
next. The stitched image is not handed to the other readers: the star corner, the overlay sweep, the tag band and the
artwork are each anchored on a fraction of the image's height, so a frame three times taller moves all of them. The band
of the screen the frames are lined up in is `scrollBand` in `--config`; it has to end above the game's floating buttons,
which are drawn over the panel rather than in it, or their top is stitched in once per frame.

Every tap position, swipe and delay can be overridden from a JSON file passed as `--config`. When something is misread,
`pnpm inventory snap` saves a screenshot of whatever the phone shows and prints what each reader makes of it, and
`pnpm inventory parse FILE.png` does the same for a saved one. `--search` drives the phone to the Pokémon first, typing
a term into storage's own search box and opening the first thing it matches, so that `--search '+burmy & cp196'` names
what the capture wanted where a screen set up by hand records nothing about which Pokémon that was. `--verbose` adds
every line OCR found with its box, which is what separates a field left empty because no text was read there from one
left empty because a reader anchored on the wrong line. On all three commands it also un-silences the preamble narrated
before there is anything to report — the form icons about to be read, with the families no artwork settles — which is
the same two lines on every run of a warm cache, and so is worth reading only when a form comes out wrong. A download
says so either way, a file already in date being read without a word, so `Downloading` names only what a cold or stale
run is actually waiting on. What went wrong is never held back either: a stale copy read because the download failed, or
an icon that could not be had, prints regardless. `snap` exits non-zero unless the screen is a Pokémon detail screen
carrying PGSharp's overlay, those being what every other reader depends on; it still saves the screenshot when it
refuses, and still stitches one whose only fault is a field that did not read — what it will not scroll is a screen
PGSharp's overlay cannot vouch for, the map and a detail screen being indistinguishable there. `pnpm inventory help`
lists the flags each command acts on, and a flag given to a command that does not act on it is refused rather than
quietly ignored. The cache, the snaps and `inventory*.csv` are git-ignored, since they describe a player's own account.

Automated input is against Niantic's terms of service. The scan only reads and moves at about a person's pace, but the
risk to the account is yours to weigh.

## Prior art

The Events page began as a look at three sites covering the same ground, each worth visiting in its own right:

| Site                                                           | What it is                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [PGO Calendar](https://vivific.github.io/pgocalendar/)         | A calendar of current and upcoming events.                                        |
| [Event Board](https://hydrorx1.github.io/POGO-Event-Timezone/) | The same events read against a world clock, and it publishes iCalendar feeds too. |
| [SWFLJOHN](https://swfljohn.com)                               | Events and GPX routes on one site — the pair of things this repository holds.     |

The last two are built on the same [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) mirror of Leek Duck as the
Events page here, so an event missing from one is usually missing from all three.
