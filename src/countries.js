/**
 * Every country a GPX file names, each with the continent it groups under in the sidebar and the ISO 3166-1 alpha-2
 * code its flag is drawn from. One table so a country is added in a single place and its continent and code cannot
 * drift out of step.
 *
 * Exactly those countries and no others. Every lookup starts from a `<pgr:country>` read out of a file, so a name with
 * nothing behind it is unreachable — validate-gpx.mts checks both directions, and adding a country ahead of its first
 * route fails the lint as surely as forgetting to add it at all.
 *
 * The code is required: a route or waypoint whose country has no entry here cannot be flagged, and building a PGSharp
 * backup errors rather than importing it without one (see countryFlag). The continent only groups the sidebar, which
 * falls back to "Other" without one (see buildSidebar).
 *
 * Codes are alpha-2 so the flag emoji is derived rather than pasted in — "AU" is legible in a diff and two similar
 * flags are not. England is a subdivision rather than a country, and carries the "GB-ENG" tag sequence Unicode gives it
 * instead of a pair of regional indicators.
 */

/**
 * One country's entry: the alpha-2 code its flag is derived from, and the continent it groups under.
 *
 * Both fields are `string` and the table is keyed by `string`, rather than naming the codes, continents and countries
 * this one happens to hold. A country is a data change and lands on `master` on its own, so a type that enumerated the
 * rows would turn every such edit into a type edit as well — and the row set is already checked, better than a type
 * could: validate-gpx.mts reads it against the files in both directions. What the shape does buy is the row itself. A
 * misspelled `continent` is a type error where inference simply gave that country a field of its own and let the
 * sidebar file it under "Other".
 *
 * @typedef {{code: string, continent: string}} Country
 */

/** @type {Record<string, Country>} */
export default {
  'Argentina': { code: 'AR', continent: 'South America' },
  'Australia': { code: 'AU', continent: 'Oceania' },
  'Brazil': { code: 'BR', continent: 'South America' },
  'Canada': { code: 'CA', continent: 'North America' },
  'England': { code: 'GB-ENG', continent: 'Europe' },
  'France': { code: 'FR', continent: 'Europe' },
  'Germany': { code: 'DE', continent: 'Europe' },
  'India': { code: 'IN', continent: 'Asia' },
  'Indonesia': { code: 'ID', continent: 'Asia' },
  'Italy': { code: 'IT', continent: 'Europe' },
  'Japan': { code: 'JP', continent: 'Asia' },
  'Kiribati': { code: 'KI', continent: 'Oceania' },
  'Malaysia': { code: 'MY', continent: 'Asia' },
  'Mexico': { code: 'MX', continent: 'North America' },
  'Netherlands': { code: 'NL', continent: 'Europe' },
  'New Zealand': { code: 'NZ', continent: 'Oceania' },
  'Philippines': { code: 'PH', continent: 'Asia' },
  'Portugal': { code: 'PT', continent: 'Europe' },
  'Russia': { code: 'RU', continent: 'Europe' },
  'Singapore': { code: 'SG', continent: 'Asia' },
  'South Korea': { code: 'KR', continent: 'Asia' },
  'Spain': { code: 'ES', continent: 'Europe' },
  'Taiwan': { code: 'TW', continent: 'Asia' },
  'United Arab Emirates': { code: 'AE', continent: 'Asia' },
  'United States': { code: 'US', continent: 'North America' },
};
