---
name: find-missing-events
description: >-
  Cross-checks the official news list at pokemongo.com/en/news against data/events.json and the ScrapedDuck feed, finds
  announced regional or in-person events that neither source carries, and proposes entries for data/events.json. Use
  this whenever the user asks whether any events are missing, wants the event list checked, audited, refreshed or
  brought up to date, mentions comparing against pokemongo.com or the official news, asks why an announced event is not
  showing on the Events page, or wants a regional event added — even if they never name the news page or the feed.
---

# Finding events the Events page does not carry

The Events page merges two sources, and this skill audits the gap between them and Niantic's own announcements.

- **The ScrapedDuck feed** mirrors Leek Duck and covers the game's scheduled content thoroughly. It is the bulk of the
  page and needs no help.
- **`data/events.json`** is the repository's own list, for events the feed does not carry. Every entry in it is a
  `regional-event` — a type ScrapedDuck never emits, registered locally in `src/events.js` — because what Leek Duck
  systematically omits is the region-locked, in-person kind: City Safari, a campus festival, a mall tour, a national
  partnership.
- **`pokemongo.com/en/news`** is the source of truth for what has been announced, and is what this skill reads.

So the job is narrow: find the **regional or in-person events** that Niantic has announced and neither source names, and
offer to add them. That narrowness is the point — the news list is mostly content the feed already has, and widening the
net past regional events fills the report with noise the maintainer has to re-reject every run.

## Read the two sources before deciding anything

```sh
python3 .claude/skills/find-missing-events/scripts/compare_sources.py
```

Run it from the checkout root. It fetches the news list and the feed, reads `data/events.json`, and splits the 30 listed
articles into ones a source already names by slug and ones nothing accounts for, each with its closest candidates by
name and its publish date.

Trust the matched half and spend your attention on the unmatched half. Slug equality is reliable because Leek Duck
derives its slugs from these same announcements, so roughly a third of the list matches outright.

## Triage the unmatched list

Most unmatched articles are not gaps. Three things put one there, and only the third is worth reporting.

**The event has already ended.** This is the most common and the easiest to get wrong, because the feed drops an event
the moment it is over — when this was checked, the earliest `end` in the whole feed was that same day, and nothing
earlier was in it at all. So every past event on the news page is permanently unmatched by construction, and a report
that does not filter them re-raises the same dozen stale events forever. The publish date in the report is your first
filter; the article's own dates settle it.

**It is not a regional event.** A ticketing update, a "Know Before You GO" venue guide, a "Save the Date", patch notes,
a GO Battle League rotation note, a global event the feed simply names differently — none of these belong in
`data/events.json`. Check the candidate list first: a score near 1.00 usually means the feed or the local file already
has the event under other wording, which is a match the script declined to assert rather than a gap.

**It is an announced regional or in-person event that nothing here names.** Report these. A campus event, a mall tour, a
partnership with a venue or an airline, a city-specific celebration.

Two shapes recur and neither is one-article-one-event, so resolve them by reading rather than by counting:

- **One article, several events.** A City Safari announcement covers three European cities; a "Save the Date" covers
  three GO Tour stops; a mall tour lists a dozen venue windows across five countries. Some of those may already be
  present and some not.
- **Several articles, one event.** An announcement, a venue guide and a ticketing update are three articles about the
  same event.

## Read the articles you are unsure about

```sh
python3 .claude/skills/find-missing-events/scripts/read_article.py <slug>
```

This prints the article's `headline`, `link` and `image` — the last taken from its structured data, which is where
existing entries' image URLs come from character for character, so never retype one — and then the prose.

Read the prose for the dates, because they are only ever there. `datePublished` is when the announcement went up, not
when the event runs, and the two are often weeks apart. What you are looking for reads like
`Monday, September 28, at 10:00 a.m. to Thursday, October 1, 2026, at 8:00 p.m. local time`. Note the trap in that
example: the start line often omits the year, which you take from the end.

## Report before writing

Say what you found and what you are proposing, then wait. Date extraction from prose is the step most likely to be
wrong, and a misread date is much cheaper to catch in a proposal than in a commit. Give, for each proposed event, the
article it came from and the exact JSON entry you would insert, and say plainly which unmatched articles you rejected
and why — that is how the maintainer checks your triage rather than just your parsing.

An entry takes this shape, and only `name`, `start` and `end` are yours to judge:

```json
{
  "eventID": "citysafari-brisbane-2026",
  "name": "Pokémon GO City Safari: Brisbane",
  "eventType": "regional-event",
  "heading": "Regional Event",
  "link": "https://pokemongo.com/en/featured-in-person-events/citysafari/brisbane",
  "image": "https://lh3.googleusercontent.com/pfmQwowEancYRhhAC8W9PnYllGycWzZxU3tvtZOAhe2prk4cu0bKVTbY4NWBgFCnyByzJINEPG7lvPJHsEeGF83m2QJotvZe-pyGZWxl95fO=s0-e365",
  "start": "2026-09-26T00:00:00.000Z",
  "end": "2026-09-27T08:00:00.000Z"
}
```

- **`eventType` and `heading` are always `regional-event` and `Regional Event`.** They are what gives the event its
  colour and its filter chip on the page, and this file holds nothing else.
- **`eventID` is yours to choose and is not the article slug.** It is a short, stable name ending in the event's year:
  `citysafari-brisbane-2026` for an article slugged `brisbane`, `30th-anniversary-kuala-lumpur-2026` for one slugged
  `event-kuala-lumpur-30th-anniversary-2026`. Group siblings under a shared prefix so a family of events sorts and reads
  together, and keep it unique — GPX files reference these IDs in `<pgr:event>`, and `pnpm lint` rejects one that names
  an ID this file does not have.
- **`name` is the event's name, not the headline.** Niantic writes headlines as marketing
  (`PokéXciting! Comes to KLCC Park — Get Ready, Kuala Lumpur!`); the entry gets the name the event goes by
  (`PokéXciting! — Kuala Lumpur`). The article body usually states it plainly as a heading above the dates.
- **Where one article announces several events, each gets its own entry**, with a `link` that may be shared. The four
  `30th-anniversary-*` entries all link to one article.

### Choosing between a floating time and a UTC instant

This distinction is load-bearing: it decides what a subscriber's calendar shows, and the wrong one shifts an event by
hours. The rule follows from what the time actually means.

- **An event in one place is one worldwide instant**, so convert its local wall clock to UTC and write a trailing `Z`.
  Every single-location entry in the file does this: Brisbane, Kuala Lumpur and Korea all start at `10:00` local, and
  all three are stored as the UTC instant that equals.
- **An event that runs "local time" everywhere is a floating time**, so write the wall clock with no zone and no `Z` —
  `2026-10-02T10:00:00.000`. 10am wherever the reader is, which is what the announcement means and what an iCalendar
  floating time expresses.

A single-city event's announcement also says "local time", so the phrase alone does not settle it. Ask instead whether
the event happens in one place or everywhere.

## Writing and landing the change

Once the proposal is approved:

1. **Insert each entry in `start` order.** The file is sorted by `start` ascending and nothing enforces it, so keep it
   that way by hand.
2. **Run `npx prettier --write data/events.json`.** `pnpm lint` checks this file's formatting and will fail on it
   otherwise.
3. **Run `pnpm lint`** to confirm nothing else broke.
4. **Commit `data/events.json` alone, straight to `master`.** This is a data change in the sense `CLAUDE.md` means, so
   it needs no branch and no pull request. Stage that one path.

**Do not run `scripts/build-ics.mjs`.** The calendar feeds are generated from this file, but the Calendar workflow
rebuilds and commits them every six hours, and the generator also pulls the live feed — so running it now sweeps
unrelated feed drift into a commit that should carry one entry.
