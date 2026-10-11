/**
 * The notifications control at the end of the top bar, on every tab: how many notices are waiting, and the list of
 * them when opened.
 *
 * A notice is anything the reader has not acknowledged yet. The list is not a history — clearing one is acknowledging
 * it, and an acknowledged notice is gone rather than greyed. New events are the only kind so far; another kind joins by
 * adding a source to `SOURCES` that answers its own unacknowledged notices and knows how to clear one.
 */

import { useEffect, useRef, useState } from 'preact/hooks';

import { eventStore, useEventStore, type EventStore } from './event-store.js';
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

/** Every kind of notice, in the order the list shows them. */
const SOURCES: readonly ((store: EventStore) => Notice[])[] = [eventNotices];

export function Notices() {
  const store = useEventStore();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // The feed once per document, whichever tab it opens on. The Events page asks for the same load and is handed it.
  useEffect(() => {
    void eventStore.ensureLoaded();
  }, []);

  // A click anywhere outside, or Escape, closes the list, the way any menu closes.
  useEffect(() => {
    if (!open) {
      return;
    }

    const away = (event: PointerEvent) => {
      if (!(event.target instanceof Node && root.current?.contains(event.target))) {
        setOpen(false);
      }
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);

    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const notices = SOURCES.flatMap((source) => source(store));
  const count = notices.length;
  const label = count === 0 ? 'Notifications: none' : `Notifications: ${count} new`;

  return (
    <div class="notices" ref={root}>
      <button
        type="button"
        class="notices-toggle"
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

      <div class="notices-panel" id="notices-list" hidden={!open}>
        <div class="notices-head">
          <span>Notifications</span>
          {count > 0 && (
            <button
              type="button"
              class="notices-clear-all"
              onClick={() => {
                for (const notice of notices) {
                  notice.clear();
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
