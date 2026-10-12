/**
 * The notifications control at the end of the top bar, on every tab: how many notices are waiting, and the list of
 * them when opened.
 *
 * A notice is anything the reader has not acknowledged yet. The list is not a history — clearing one is acknowledging
 * it, and an acknowledged notice is gone rather than greyed. New events are the only kind so far; another kind joins by
 * adding a source to `SOURCES` that answers its own unacknowledged notices and knows how to clear one or all of them.
 */

import { useEffect, useRef, useState } from 'preact/hooks';

import { eventStore, useEventStore, type EventStore } from './event-store.js';
import { useDismiss } from './popover.js';
import { toHash } from './router.js';

/** One entry in the list, whatever kind of thing it reports. */
export interface Notice {
  /** Unique across every kind, so a source prefixes its own IDs. */
  key: string;
  title: string;
  detail: string;

  /** Where choosing it takes the reader. */
  href: string;

  /** Acknowledge it, which is what takes it off the list — and off anywhere else the same fact is shown. */
  clear: () => void;
}

const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * One notice per event the Events page would mark New. Choosing one opens that page on the event, through the same
 * `?event=` link the Map page's route cards use; clearing one marks the event seen, which takes the mark off its card.
 */
function eventNotices(store: EventStore): Notice[] {
  return store.newlyVisible().map((ev) => ({
    key: `event:${ev.eventID}`,
    title: ev.name,
    detail: [ev.heading || ev.eventType, ev.start ? `from ${dayFmt.format(ev.start)}` : 'date unknown'].join(' · '),
    href: toHash('events', `event=${encodeURIComponent(ev.eventID)}`),
    clear: () => store.acknowledge([ev]),
  }));
}

/**
 * One kind of notice: what of it is waiting, and how to clear all of that at once. The second is its own rather than a
 * loop over each notice's `clear`, which for events would write the seen set and redraw every reader once per event.
 */
interface Source {
  notices: (store: EventStore) => Notice[];
  clearAll: (store: EventStore) => void;
}

/** Every kind of notice, in the order the list shows them. */
const SOURCES: readonly Source[] = [
  { notices: eventNotices, clearAll: (store) => store.acknowledge(store.newlyVisible()) },
];

export function Notices() {
  const store = useEventStore();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // The feed once per document, whichever tab it opens on. The Events page asks for the same load and is handed it.
  useEffect(() => {
    void eventStore.ensureLoaded();
  }, []);

  useDismiss(open, () => setOpen(false), root);

  const notices = SOURCES.flatMap((source) => source.notices(store));
  const count = notices.length;
  const label = count === 0 ? 'Notifications: none' : `Notifications: ${count} new`;

  return (
    <div class="menu notices" ref={root}>
      <button
        type="button"
        class="menu-toggle"
        aria-expanded={open}
        aria-controls="notices-list"
        aria-label={label}
        title={label}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">🔔</span>
        {count > 0 && (
          <span class="notices-count" aria-hidden="true">
            {count}
          </span>
        )}
      </button>

      <div class="menu-panel" id="notices-list" hidden={!open}>
        <div class="menu-head">
          <span>Notifications</span>
          {count > 0 && (
            <button
              type="button"
              class="notices-clear-all"
              onClick={() => {
                for (const source of SOURCES) {
                  source.clearAll(store);
                }
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {count === 0 ? (
          <p class="notices-empty">Nothing new.</p>
        ) : (
          <ul>
            {notices.map((notice) => (
              <li key={notice.key}>
                <a href={notice.href} onClick={() => setOpen(false)}>
                  <span class="notices-title">{notice.title}</span>
                  <span class="notices-detail">{notice.detail}</span>
                </a>
                <button
                  type="button"
                  class="notices-clear"
                  title="Clear this notification"
                  aria-label={`Clear “${notice.title}”`}
                  onClick={notice.clear}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
