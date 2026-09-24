#!/usr/bin/env python3

"""
Line up pokemongo.com's news list against the two sources the Events page merges, and report which articles nothing
here accounts for.

The announcement list is server-rendered: `https://pokemongo.com/en/news` embeds a schema.org `ItemList` naming the
latest 30 articles, and a `<pg-date-format timestamp>` per card in the same order, so one fetch yields every slug,
headline and publish date without a browser. The cards themselves are drawn client-side and never appear in the HTML,
which is why this reads the structured data rather than the markup.

Matching is deliberately split in two. An exact slug hit is reported as a match because Leek Duck derives its own
slugs from these same announcements, so a news slug equal to a ScrapedDuck `eventID` is the same event with near
certainty. Everything else is reported as unmatched *with candidates* rather than guessed at: the remaining pairs need
judgement this script has no business making, because one article can announce three events, describe an event that
has already ended, or not be an event at all.
"""

import argparse
import datetime
import json
import pathlib
import re
import sys
import unicodedata
import urllib.request

UTC = datetime.timezone.utc

NEWS_URL = 'https://pokemongo.com/en/news'
FEED_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json'
LOCAL_PATH = pathlib.Path('data/events.json')

# The site answers a default urllib agent with a different, smaller shell of a page. Both carry the structured data,
# but asking as a browser is what the rest of this parsing was checked against.
USER_AGENT = 'Mozilla/5.0'

# Words too common across Pokémon GO event names to carry any matching signal: every second name contains "Pokémon GO"
# or "event", so counting them inflates every score equally and separates nothing.
STOPWORDS = frozenset({'a', 'and', 'during', 'for', 'go', 'in', 'of', 'pokemon', 'the', 'to', 'with'})

# How much of a candidate's name has to appear in the headline before it is worth putting in front of a reader. Set by
# what the real data does: a true pair usually scores 1.0 and the weakest genuine one seen (a Wild Area ticketing
# update against the Wild Area itself) scores 0.86, while unrelated events sharing only "City" or "Safari" sit at 0.6.
CANDIDATE_FLOOR = 0.5


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})

    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode('utf-8')


def slug_of(url):
    """The last path segment of a URL, which is how an article, a feed entry and a local entry are keyed against
    each other. Local links are not uniform — some carry `/en/`, some do not, and a City Safari is filed under
    `/featured-in-person-events/citysafari/<city>` — so the segment is the only part they reliably share."""
    return url.rstrip('/').rsplit('/', 1)[-1]


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


def parse_news(html):
    """Every announcement the news page lists, as `(slug, headline, published)`.

    The `ItemList` gives identity and the `<pg-date-format>` timestamps give dates, and the two are joined by position
    because neither carries the other's key. A count mismatch means the page's shape has moved, so it fails here rather
    than silently pairing a headline with somebody else's date.
    """
    blobs = re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S)
    lists = [d for d in map(json.loads, blobs) if d.get('@type') == 'ItemList']

    if len(lists) != 1:
        sys.exit(f'{NEWS_URL}: expected one schema.org ItemList, found {len(lists)}')

    items = lists[0]['itemListElement']
    stamps = re.findall(r'<pg-date-format[^>]*timestamp="(\d+)"', html)

    if len(items) != len(stamps):
        sys.exit(f'{NEWS_URL}: {len(items)} listed articles but {len(stamps)} dates — the page layout has changed')

    return [
        (slug_of(item['url']), item['name'], datetime.datetime.fromtimestamp(int(stamp) / 1000, UTC).date())
        for item, stamp in zip(sorted(items, key=lambda i: i['position']), stamps)
    ]


def main():
    argparse.ArgumentParser(description=__doc__.strip().split('\n')[0]).parse_args()

    if not LOCAL_PATH.exists():
        sys.exit(f'{LOCAL_PATH}: not found — run this from the root of the pogo-utils checkout')

    local = json.loads(LOCAL_PATH.read_text(encoding='utf-8'))
    feed = json.loads(fetch(FEED_URL))
    news = parse_news(fetch(NEWS_URL))

    # An article is accounted for when its slug is one a source already names. Local entries are keyed both ways
    # because an `eventID` here is hand-written and need not equal the slug of the link it carries.
    known = {entry['eventID']: ('feed', entry['name']) for entry in feed}
    known |= {slug_of(entry['link']): ('local', entry['name']) for entry in local}
    known |= {entry['eventID']: ('local', entry['name']) for entry in local}

    candidates = [('feed', entry['eventID'], entry['name']) for entry in feed]
    candidates += [('local', entry['eventID'], entry['name']) for entry in local]

    matched, unmatched = [], []

    for slug, headline, published in news:
        if slug in known:
            source, name = known[slug]
            matched.append((slug, source, name))
            continue

        scored = sorted(
            ((containment(name, headline), source, event_id, name) for source, event_id, name in candidates),
            reverse=True,
        )
        unmatched.append((slug, headline, published, [c for c in scored[:3] if c[0] >= CANDIDATE_FLOOR]))

    print(f'{len(news)} articles listed at {NEWS_URL}; {len(feed)} feed events, {len(local)} in {LOCAL_PATH}\n')
    print(f'## Accounted for by slug ({len(matched)})\n')

    for slug, source, name in matched:
        print(f'  {slug}\n    -> {source}: {name}')

    print(f'\n## Nothing here names these ({len(unmatched)}) — decide each one\n')

    for slug, headline, published, scored in unmatched:
        print(f'  {slug}  (published {published})\n    {headline}')

        for score, source, event_id, name in scored:
            print(f'    ?  {score:.2f} {source}: {event_id} | {name}')

        if not scored:
            print('    ?  no candidate above the floor')

        print()


if __name__ == '__main__':
    main()
