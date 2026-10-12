/**
 * The event types that come round on a fixed weekly or seasonal cadence rather than being planned around, by
 * `eventType` slug, which is what both consumers key on: the stable ID, where the `heading` beside it is display text
 * upstream can reword without notice.
 *
 * Two of them: the Events page starts with these unticked, and the trimmed `events.ics` leaves them out so subscribing
 * does not put a Spotlight Hour into every week of your calendar. One list, so the two cannot drift.
 *
 * `readonly` because both consumers copy it rather than hold it, so a `push` into the export would be an extra type
 * for whichever had not read it yet. Bound to a name because an `export default` takes an expression, where `readonly`
 * would have to be asserted with an `as` rather than checked.
 */
const RECURRING_TYPES: readonly string[] = ['pokemon-spotlight-hour', 'raid-hour', 'max-mondays', 'season'];

export default RECURRING_TYPES;
