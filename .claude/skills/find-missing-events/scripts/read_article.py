#!/usr/bin/env python3

"""
Print one pokemongo.com news article as the fields a `data/events.json` entry needs, plus its prose.

Two things come out of an article. Its `NewsArticle` structured data carries `headline`, `url` and `image` — and that
`image` is the very URL existing entries hold, character for character, so it is read from here rather than retyped.
Its dates are not there: `datePublished` is when the announcement went up, which is not when the event runs, so the
start and end have to be read out of the prose ("Tuesday, October 13, at 10:00 a.m. to Monday, October 19, 2026, at
8:00 p.m. local time"). The body text is printed for exactly that reason.
"""

import argparse
import sys

from newsroom import NEWS_URL, article_html, article_text, fetch, json_ld, latest_date_named


def article_data(html, url):
    """The `NewsArticle` blob, which every news article carries alongside an `Organization`, a `WebSite` and a
    `BreadcrumbList`. Its absence means the URL is not an article — a redirect to the news index, most likely — which is
    worth failing on rather than reporting an event with no image."""
    articles = json_ld(html, 'NewsArticle')

    if not articles:
        sys.exit(f'{url}: no NewsArticle structured data — is this a news article?')

    return articles[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__.strip().split('\n')[0])
    parser.add_argument('slug', help='an article slug, or its full pokemongo.com URL')
    args = parser.parse_args()

    if args.slug.startswith('http'):
        url = args.slug
        html = fetch(url)
    else:
        url = f'{NEWS_URL}/{args.slug}'
        html = article_html(args.slug)

        if html is None:
            sys.exit(f'{url}: 404 — no such article. Check the slug against the archive `compare_sources.py` walks.')

    data = article_data(html, url)
    body = article_text(html, url)

    print(f'headline:      {data["headline"]}')
    print(f'link:          {url}')
    print(f'image:         {data.get("image", "")}')
    print(f'datePublished: {data.get("datePublished", "")}  (the announcement, not the event)')
    print(f'runs until:    {latest_date_named(body)}  (furthest date the prose names; read it, do not trust it)')
    print(f'\n--- body ---\n\n{body}')


if __name__ == '__main__':
    main()
