/**
 * The event types that come round on a fixed weekly (or seasonal) cadence rather than being planned around: by
 * `heading`, the wording the feed gives a type, which is what both consumers here key on.
 *
 * Two of them: the Events page starts with these types unticked, so a first visit leads with the events a reader is
 * more likely to care about, and the trimmed calendar feed (events.ics) leaves them out, so subscribing does not put a
 * Spotlight Hour and a Raid Hour into every week of your calendar. One list so the page and the feed cannot drift into
 * disagreeing about which types those are.
 *
 * `readonly` because the one list is the whole point. Both consumers copy it rather than hold it — a spread and a `Set`
 * in `events.js`, a `Set` in `build-ics` — so a `push` into the export would be an extra type for whichever of them had
 * not read it yet, which is the drift stated above arriving by the back door.
 *
 * @type {readonly string[]}
 */
export default ['Pokémon Spotlight Hour', 'Raid Hour', 'Max Mondays', 'Season'];
