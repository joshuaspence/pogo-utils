#!/usr/bin/env python3

"""
Print one pokemongo.com news article as the fields a `data/events.json` entry needs, plus its prose.

Two things come out of an article. Its `NewsArticle` structured data carries `headline`, `url` and `image` — and that
`image` is the very URL existing entries hold, character for character, so it is read from here rather than retyped.
Its dates are not there: `datePublished` is when the announcement went up, which is not when the event runs, so the
start and end have to be read out of the prose ("Tuesday, October 13, at 10:00 a.m. to Monday, October 19, 2026, at
8:00 p.m. local time"). The body text is printed for exactly that reason.

The prose is taken from inside `<main>` because the surrounding navigation and the fifteen-language selector are
outside it, and they otherwise bury the article in four hundred words of chrome.
"""

import argparse
import json
import re
import sys
import urllib.request

USER_AGENT = 'Mozilla/5.0'


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})

    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode('utf-8')


def article_data(html, url):
    """The `NewsArticle` blob, which every news article carries alongside an `Organization`, a `WebSite` and a
    `BreadcrumbList`. Its absence means the URL is not an article — a redirect to the news index, most likely — which is
    worth failing on rather than reporting an event with no image."""
    blobs = re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S)
    articles = [d for d in map(json.loads, blobs) if d.get('@type') == 'NewsArticle']

    if not articles:
        sys.exit(f'{url}: no NewsArticle structured data — is this a news article?')

    return articles[0]


def body_text(html, url):
    main = re.search(r'<main\b[^>]*>(.*?)</main>', html, re.S)

    if not main:
        sys.exit(f'{url}: no <main> element — the page layout has changed')

    stripped = re.sub(r'<(script|style)\b.*?</\1>', ' ', main.group(1), flags=re.S)

    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', stripped)).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__.strip().split('\n')[0])
    parser.add_argument('slug', help='an article slug, or its full pokemongo.com URL')
    args = parser.parse_args()

    url = args.slug if args.slug.startswith('http') else f'https://pokemongo.com/en/news/{args.slug}'
    html = fetch(url)
    data = article_data(html, url)

    print(f'headline:      {data["headline"]}')
    print(f'link:          {url}')
    print(f'image:         {data.get("image", "")}')
    print(f'datePublished: {data.get("datePublished", "")}  (the announcement, not the event)')
    print(f'\n--- body ---\n\n{body_text(html, url)}')


if __name__ == '__main__':
    main()
