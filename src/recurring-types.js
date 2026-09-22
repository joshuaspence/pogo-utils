/**
 * The event types that come round on a fixed weekly (or seasonal) cadence rather than being planned around: by
 * `heading`, the wording the feed gives a type, which is what both consumers here key on.
 *
 * Two of them: the Events page starts with these types unticked, so a first visit leads with the events a reader is
 * more likely to care about, and the trimmed calendar feed (events.ics) leaves them out, so subscribing does not put a
 * Spotlight Hour and a Raid Hour into every week of your calendar. One list so the page and the feed cannot drift into
 * disagreeing about which types those are.
 */
export default ['Pokémon Spotlight Hour', 'Raid Hour', 'Max Mondays', 'Season'];
