#!/usr/bin/env python3

"""
Reading pokemongo.com's announcements: the parts both scripts here need.

Everything this skill reads is server-rendered structured data rather than markup. The cards on the news list and the
listings on the in-person index are drawn client-side and never appear in the HTML, but every page embeds schema.org
JSON-LD describing what it shows — an `ItemList` of articles, an `Event` per in-person listing, a `NewsArticle` on an
article — so a plain HTTP fetch yields more than a rendered page would, and no browser is needed.
"""

import datetime
import json
import re
import sys
import urllib.error
import urllib.request

UTC = datetime.timezone.utc

NEWS_URL = 'https://pokemongo.com/en/news'
IN_PERSON_URL = 'https://pokemongo.com/en/featured-in-person-events'

# The site answers a default urllib agent with a different, smaller shell of a page. Both carry the structured data,
# but asking as a browser is what the rest of this parsing was checked against.
USER_AGENT = 'Mozilla/5.0'

MONTHS = {
    month: number
    for number, month in enumerate(
        ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november',
         'december'],
        1,
    )
}

# A date as these announcements write one: `September 28, 2026`, `October 3–4, 2026`, `October 31 – November 1, 2026`.
# The middle group swallows a range so that the year is still reached — without it `October 3–4, 2026` matches nothing,
# which is how a nine-stop tour running into January 2027 read as naming no dates at all.
DATE_PATTERN = re.compile(
    r'\b(' + '|'.join(MONTHS) + r')\b\s*(\d{1,2})?(?:\s*[‐-―-]\s*(?:\w+\s+)?\d{1,2})?,?\s*(20\d{2})',
    re.I,
)


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})

    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode('utf-8')


def slug_of(url):
    """The last path segment of a URL, which is how an article, a feed entry and a local entry are keyed against
    each other. Local links are not uniform — some carry `/en/`, some do not, and a City Safari is filed under
    `/featured-in-person-events/citysafari/<city>` — so the segment is the only part they reliably share."""
    return url.rstrip('/').rsplit('/', 1)[-1]


def json_ld(html, of_type):
    """Every JSON-LD blob on the page of the given schema.org `@type`."""
    blobs = re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S)

    return [blob for blob in map(json.loads, blobs) if blob.get('@type') == of_type]


def article_html(slug):
    """An article's HTML, or `None` where there is no such article.

    A missing article answers 404 outright, which is worth knowing: elsewhere on this site an unknown path serves the
    app shell with status 200 — `/sitemap.xml` and `/robots.txt` both do — so a 200 is no evidence a URL is real. Under
    `/en/news/` it is, which makes this the way to check a slug someone has quoted at you.
    """
    try:
        return fetch(f'{NEWS_URL}/{slug}')
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None

        raise


def article_text(html, url):
    """An article's prose, as one line of text.

    Taken from inside `<main>` because the navigation and the fifteen-language selector sit outside it and otherwise
    swamp the body. Tags are stripped rather than parsed: nothing here needs the structure, only the words. `<script>`
    goes first, contents and all, because the `NewsArticle` blob sits inside `<main>` and tag-stripping alone would
    leave its JSON in the prose.
    """
    main = re.search(r'<main\b[^>]*>(.*?)</main>', html, re.S)

    if not main:
        sys.exit(f'{url}: no <main> element — the page shape has changed')

    stripped = re.sub(r'<(script|style)\b.*?</\1>', ' ', main.group(1), flags=re.S)

    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', stripped)).strip()


def latest_date_named(text):
    """The furthest-future date the text names, or `None` if it names none.

    This is what separates an announcement still worth acting on from one that is only history, and it does it from the
    announcement's own words rather than from when it was published. A long-running event has to say how long it runs —
    an airline partnership to August 2027, a stamp rally to September 2029, a mall tour to March 2027 — while a
    Community Day can only ever name its one weekend. So the furthest date in the prose dates the *event*, where
    `datePublished` dates only the press release, and the two are routinely months apart in opposite directions.

    A day is assumed late in the month when the text gives a month and year alone, so that "through March 2027" is not
    read as expiring on the 1st.
    """
    latest = None

    for month, day, year in DATE_PATTERN.findall(text):
        try:
            found = datetime.date(int(year), MONTHS[month.lower()], int(day) if day else 28)
        except ValueError:
            continue

        if latest is None or found > latest:
            latest = found

    return latest
