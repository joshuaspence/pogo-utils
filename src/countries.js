/**
 * Every country the GPX files use, each with the continent it groups under in the sidebar and the ISO 3166-1 alpha-2
 * code its flag is drawn from. One table so a country is added in a single place and its continent and code cannot
 * drift out of step.
 *
 * The continent only groups the sidebar, so an unlisted country falls back to "Other" (see buildSidebar). The code is
 * required: a route or waypoint whose country has no entry here cannot be flagged, and building a PGSharp backup errors
 * rather than importing it without one (see countryFlag).
 *
 * Codes are alpha-2 so the flag emoji is derived rather than pasted in — "AU" is legible in a diff and two similar
 * flags are not. England is a subdivision rather than a country, and carries the "GB-ENG" tag sequence Unicode gives it
 * instead of a pair of regional indicators.
 */
export default {
  'Antarctica': { code: 'AQ', continent: 'Antarctica' },
  'Argentina': { code: 'AR', continent: 'South America' },
  'Australia': { code: 'AU', continent: 'Oceania' },
  'Austria': { code: 'AT', continent: 'Europe' },
  'Belgium': { code: 'BE', continent: 'Europe' },
  'Brazil': { code: 'BR', continent: 'South America' },
  'Canada': { code: 'CA', continent: 'North America' },
  'Canary Islands': { code: 'IC', continent: 'Africa' },
  'Czechia': { code: 'CZ', continent: 'Europe' },
  'Denmark': { code: 'DK', continent: 'Europe' },
  'Ecuador': { code: 'EC', continent: 'South America' },
  'England': { code: 'GB-ENG', continent: 'Europe' },
  'France': { code: 'FR', continent: 'Europe' },
  'Germany': { code: 'DE', continent: 'Europe' },
  'Hungary': { code: 'HU', continent: 'Europe' },
  'India': { code: 'IN', continent: 'Asia' },
  'Indonesia': { code: 'ID', continent: 'Asia' },
  'Ireland': { code: 'IE', continent: 'Europe' },
  'Italy': { code: 'IT', continent: 'Europe' },
  'Japan': { code: 'JP', continent: 'Asia' },
  'Kiribati': { code: 'KI', continent: 'Oceania' },
  'Malaysia': { code: 'MY', continent: 'Asia' },
  'Mexico': { code: 'MX', continent: 'North America' },
  'Netherlands': { code: 'NL', continent: 'Europe' },
  'New Zealand': { code: 'NZ', continent: 'Oceania' },
  'North Korea': { code: 'KP', continent: 'Asia' },
  'Norway': { code: 'NO', continent: 'Europe' },
  'Peru': { code: 'PE', continent: 'South America' },
  'Philippines': { code: 'PH', continent: 'Asia' },
  'Portugal': { code: 'PT', continent: 'Europe' },
  'Romania': { code: 'RO', continent: 'Europe' },
  'Russia': { code: 'RU', continent: 'Europe' },
  'Singapore': { code: 'SG', continent: 'Asia' },
  'South Korea': { code: 'KR', continent: 'Asia' },
  'Spain': { code: 'ES', continent: 'Europe' },
  'Taiwan': { code: 'TW', continent: 'Asia' },
  'United Arab Emirates': { code: 'AE', continent: 'Asia' },
  'United States': { code: 'US', continent: 'North America' },
};
