#!/usr/bin/env python3

"""
Line up everything pokemongo.com has announced against the two sources the Events page merges, and report what nothing
here accounts for and has not yet finished.

Two announcement surfaces are read. The news archive is paginated by `?nr=<offset>`, thirty articles a page, and walking
it to exhaustion reaches every article back to mid-2025 in nine fetches. The in-person index carries one schema.org
`Event` per listing with its dates stated outright, and is scoped to exactly the kind of event this skill hunts.

Reaching the whole archive rather than the front page is the difference between finding a long-running event and missing
it, because the long ones are announced months ahead and are off the front page while still running: an airline
partnership running to August 2027, a mall tour to March 2027, a nine-stop tour to January 2027 and a national-trust
season extended to December 2026 were all live and all invisible to a front-page-only audit. Beware the near-miss
`?no=<offset>`, which the page accepts and ignores, answering with the newest thirty however large it is — so a walk
that looks like it paginated can silently re-read page one nine times.

Two hundred-odd articles is too many to triage by hand, so each unmatched one is filtered by the furthest-future date
its own prose names: see `latest_date_named`. That cuts roughly two hundred unmatched articles to around twenty worth a
human decision, and it cuts them on what the announcement says rather than on a keyword list that would miss whatever
Niantic partners with next.

That filter has one blind spot, and it is reported separately rather than patched: an article that *changes* an event
gives no new date — "rescheduled to a later date" — so it names no future date by construction. An undated article whose
headline names an event a source already holds is therefore surfaced too, since it cannot be discovered by date and is
worse than a gap when real: a gap omits an event, an update makes one already in the published `events.ics` wrong.

Matching is deliberately split in two. An exact slug hit is reported as a match because Leek Duck derives its own slugs
from these same announcements, so a news slug equal to a ScrapedDuck `eventID` is the same event with near certainty.
Everything else is reported *with candidates* rather than guessed at: the remaining pairs need judgement this script has
no business making, because one article can announce eleven events, describe an event that has already ended, or not be
an event at all.
"""

import argparse
import datetime
import json
import pathlib
import re
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor

from newsroom import (
    IN_PERSON_URL,
    NEWS_URL,
    UTC,
    article_html,
    article_text,
    fetch,
    json_ld,
    latest_date_named,
    slug_of,
)

FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json'
LOCAL_PATH = pathlib.Path('data/events.json')

# Articles per page, fixed by the site: a page answers with thirty however the offset is phrased.
PAGE_SIZE = 30

# A guard on the walk, not a horizon. The archive ran to eight pages when this was written, so tripping this means the
# stop condition has stopped working rather than that the archive is deep.
MAX_PAGES = 20

# Words too common across Pokémon GO event names to carry any matching signal: every second name contains "Pokémon GO"
# or "event", so counting them inflates every score equally and separates nothing.
STOPWORDS = frozenset({'a', 'and', 'during', 'for', 'go', 'in', 'of', 'pokemon', 'the', 'to', 'with'})

# How much of a candidate's name has to appear in the headline before it is worth putting in front of a reader. Set by
# what the real data does: a true pair usually scores 1.0 and the weakest genuine one seen (a Wild Area ticketing
# update against the Wild Area itself) scores 0.86, while unrelated events sharing only "City" or "Safari" sit at 0.6.
CANDIDATE_FLOOR = 0.5


def tokens(text):
    """The comparable words of a name, slug or headline.

    Accents are folded because the feed writes `Pokémon` where a slug writes `pokemon`; `_` and `-` are separators so
    `2026_ana_green` and `city-safari-brisbane` tokenise like prose; and a trailing `s` is dropped from longer words so
    that "City Safaris in Europe" still reaches "City Safari: Marseille", which is the difference between a candidate a
    reader can act on and silence.
    """
    folded = unicodedata.normalize('NFKD', text.lower())
    folded = ''.join(c for c in folded if not unicodedata.combining(c))
    words = re.findall(r'[a-z0-9]+', folded)

    return {word[:-1] if len(word) > 3 and word.endswith('s') else word for word in words} - STOPWORDS


def containment(name, headline):
    """How much of `name` the `headline` already says, from 0 to 1.

    Containment rather than similarity, because the two sides are not trying to say the same thing: Niantic writes
    "Rescue Shadow Zekrom during Harvest Festival: Taken Over!" where Leek Duck writes "Harvest Festival: Taken Over",
    so the feed name sits *inside* the headline surrounded by marketing. A symmetric ratio punishes exactly the
    verbosity that makes the pair obvious, and would rank the wrong Harvest Festival first.
    """
    wanted = tokens(name)

    return len(wanted & tokens(headline)) / len(wanted) if wanted else 0.0


def parse_news_page(html, url):
    """One page of the archive, as `(slug, headline, published)`.

    The `ItemList` gives identity and the `<pg-date-format>` timestamps give dates, and the two are joined by position
    because neither carries the other's key. A count mismatch means the page's shape has moved, so it fails here rather
    than silently pairing a headline with somebody else's date.
    """
    lists = json_ld(html, 'ItemList')

    if len(lists) != 1:
        sys.exit(f'{url}: expected one schema.org ItemList, found {len(lists)}')

    items = lists[0]['itemListElement']
    stamps = re.findall(r'<pg-date-format[^>]*timestamp="(\d+)"', html)

    if len(items) != len(stamps):
        sys.exit(f'{url}: {len(items)} listed articles but {len(stamps)} dates — the page layout has changed')

    return [
        (slug_of(item['url']), item['name'], datetime.datetime.fromtimestamp(int(stamp) / 1000, UTC).date())
        for item, stamp in zip(sorted(items, key=lambda i: i['position']), stamps)
    ]


def walk_news():
    """The whole news archive, newest first, as `(slug, headline, published)`.

    Stops when a page contributes nothing new rather than on a page count or an empty page, because the last page
    overlaps the one before it — the final fetch returned nineteen already-seen articles, not zero.
    """
    articles, seen = [], set()

    for page in range(MAX_PAGES):
        url = f'{NEWS_URL}?nr={page * PAGE_SIZE}'
        fresh = [item for item in parse_news_page(fetch(url), url) if item[0] not in seen]

        if not fresh:
            return articles

        seen.update(slug for slug, _, _ in fresh)
        articles += fresh

    sys.exit(f'{NEWS_URL}: still finding new articles after {MAX_PAGES} pages — the stop condition has stopped working')


def parse_in_person(html):
    """Every listing on the in-person events index, as `(slug, name, start, end)`, `end` falling back to `start`.

    Worth reading despite the news archive covering the same announcements, because it is scoped to exactly what this
    skill hunts — in person, in one place — and states its dates in the markup instead of burying them in prose, which
    is the step most likely to be got wrong. Its weakness is that it is curated and short, carrying City Safari, GO Fest
    and the championships and nothing else, so it confirms coverage rather than replacing the archive. Its `eventStatus`
    is not to be trusted either: it still read `EventScheduled` for a City Safari the news had already postponed.
    """
    events = json_ld(html, 'Event')

    if not events:
        sys.exit(f'{IN_PERSON_URL}: no schema.org Event found — the page shape has changed')

    return [
        (
            slug_of(event['url']),
            event['name'],
            datetime.date.fromisoformat(event['startDate']),
            datetime.date.fromisoformat(event.get('endDate', event['startDate'])),
        )
        for event in events
    ]


def candidates_for(headline, candidates):
    """The few events a headline most plausibly refers to, best first, or nothing if none is close enough."""
    scored = sorted(((containment(name, headline), source, event_id, name) for source, event_id, name in candidates))

    return [candidate for candidate in scored[::-1][:3] if candidate[0] >= CANDIDATE_FLOOR]


def runs_until(slug):
    """The furthest-future date an unmatched article's prose names, or `None` if it names none."""
    html = article_html(slug)

    return latest_date_named(article_text(html, f'{NEWS_URL}/{slug}')) if html else None


def main():
    argparse.ArgumentParser(description=__doc__.strip().split('\n')[0]).parse_args()

    if not LOCAL_PATH.exists():
        sys.exit(f'{LOCAL_PATH}: not found — run this from the root of the pogo-utils checkout')

    today = datetime.datetime.now(UTC).date()
    local = json.loads(LOCAL_PATH.read_text(encoding='utf-8'))
    feed = json.loads(fetch(FEED_URL))
    news = walk_news()
    in_person = parse_in_person(fetch(IN_PERSON_URL))

    # An article is accounted for when its slug is one a source already names. Local entries are keyed both ways
    # because an `eventID` here is hand-written and need not equal the slug of the link it carries.
    known = {entry['eventID']: ('feed', entry['name']) for entry in feed}
    known |= {slug_of(entry['link']): ('local', entry['name']) for entry in local}
    known |= {entry['eventID']: ('local', entry['name']) for entry in local}

    candidates = [('feed', entry['eventID'], entry['name']) for entry in feed]
    candidates += [('local', entry['eventID'], entry['name']) for entry in local]

    unmatched = [(slug, headline, published) for slug, headline, published in news if slug not in known]

    with ThreadPoolExecutor(max_workers=8) as pool:
        until = dict(zip((slug for slug, _, _ in unmatched), pool.map(runs_until, (s for s, _, _ in unmatched))))

    live = [item for item in unmatched if until[item[0]] is not None and until[item[0]] >= today]
    ended = sum(1 for slug, _, _ in unmatched if until[slug] is not None and until[slug] < today)
    undated = [item for item in unmatched if until[item[0]] is None]

    # An undated article naming an event a source already holds is the one thing the date filter cannot see, and the
    # most urgent thing in the archive: an update says "rescheduled to a later date" and gives no date, so it names no
    # future date by construction and would be counted away with the feature notes. That is the wrong way round, because
    # it does not merely omit an event — it makes one we already publish wrong, and the generated `events.ics` has
    # already gone out. City Safari Boston was postponed for a storm two days before the date `data/events.json` still
    # advertised, and its article names no date at all. Matching what we hold is the signal that finds it.
    updates = [(item, found) for item in undated if (found := candidates_for(item[1], candidates))]

    print(
        f'{len(news)} articles archived at {NEWS_URL} ({news[-1][2]} to {news[0][2]}), '
        f'{len(in_person)} on the in-person index; {len(feed)} feed events, {len(local)} in {LOCAL_PATH}'
    )
    print(
        f'{len(news) - len(unmatched)} accounted for by slug. Of the {len(unmatched)} left, {ended} name only past '
        f'dates and {len(undated)} name none at all, leaving {len(live)} to decide.\n'
    )

    print(f'## Announced, unaccounted for, and not yet over ({len(live)}) — decide each one\n')

    for slug, headline, published in sorted(live, key=lambda item: until[item[0]], reverse=True):
        print(f'  {slug}  (published {published}, prose runs to {until[slug]})\n    {headline}')

        for score, source, event_id, name in candidates_for(headline, candidates):
            print(f'    ?  {score:.2f} {source}: {event_id} | {name}')

        print()

    print(f'## Undated, but naming something we hold ({len(updates)}) — has it been changed?\n')

    for (slug, headline, published), found in sorted(updates, key=lambda entry: entry[0][2], reverse=True):
        print(f'  {slug}  (published {published}, names no date)\n    {headline}')

        for score, source, event_id, name in found:
            print(f'    !  {score:.2f} {source}: {event_id} | {name}')

        print()

    if not updates:
        print('  Nothing — no undated article names an event a source carries.\n')

    listings = [listing for listing in in_person if listing[3] >= today and listing[0] not in known]

    print(f'## In-person index, not yet over, unaccounted for ({len(listings)})\n')

    for slug, name, start, end in sorted(listings, key=lambda listing: listing[2]):
        print(f'  {slug}  ({start} to {end})\n    {name}\n')

    if not listings:
        print('  Nothing — every current listing is already named by a source. This section being empty is the\n'
              '  expected state, not a failure.\n')

    print(
        f'Filtered out: {ended} unmatched articles whose prose names only past dates, and '
        f'{len(undated) - len(updates)} naming neither a date nor an event we hold. An event announcement always gives '
        f'its dates, so the second group is features and mechanics — but a date this script failed to parse would also '
        f'land there, so look in it before concluding a suspected event is absent.'
    )


if __name__ == '__main__':
    main()
