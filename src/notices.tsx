/**
 * The notifications control at the end of the top bar, on every tab: how many notices are waiting, and the list of
 * them when opened.
 *
 * A notice is anything the reader has not acknowledged yet. The list is not a history — clearing one is acknowledging
 * it, and an acknowledged notice is gone rather than greyed. Two kinds so far, new events and a new PGSharp release;
 * another joins by adding a source to `SOURCES` that answers its own unacknowledged notices and knows how to clear one
 * or all of them.
 */

import { useEffect, useRef, useState } from 'preact/hooks';

import { eventStore, useEventStore } from './event-store.js';
import { releaseStore, useReleaseStore } from './pgsharp/release-store.js';
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

  /**
   * Off this site, so opened in a new tab — and acknowledged by being chosen, since nothing here learns otherwise that
   * the reader followed it. An event needs neither: its link opens the Events page on it, which acknowledges it there.
   */
  external?: boolean;

  /** Acknowledge it, which is what takes it off the list — and off anywhere else the same fact is shown. */
  clear: () => void;
}

const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * One notice per event the Events page would mark New. Choosing one opens that page on the event, through the same
 * `?event=` link the Map page's route cards use; clearing one marks the event seen, which takes the mark off its card.
 */
function eventNotices(): Notice[] {
  const store = eventStore;

  return store.newlyVisible().map((ev) => ({
    key: `event:${ev.eventID}`,
    title: ev.name,
    detail: [ev.heading || ev.eventType, ev.start ? `from ${dayFmt.format(ev.start)}` : 'date unknown'].join(' · '),
    href: toHash('events', `event=${encodeURIComponent(ev.eventID)}`),
    clear: () => store.acknowledge([ev]),
  }));
}

/**
 * The PGSharp release, while it is a version this browser has not acknowledged — never on a first visit, which takes
 * the current one as its baseline. Choosing it downloads that APK, the same link the Integrations page's button names.
 */
function releaseNotices(): Notice[] {
  const release = releaseStore.unacknowledged();

  return release === null
    ? []
    : [
        {
          key: `pgsharp:${release.version}`,
          title: `PGSharp ${release.version}`,
          detail: 'New version · download the APK',
          href: release.url,
          external: true,
          clear: () => releaseStore.acknowledge(),
        },
      ];
}

/**
 * One kind of notice: what of it is waiting, and how to clear all of that at once. The second is its own rather than a
 * loop over each notice's `clear`, which for events would write the seen set and redraw every reader once per event.
 */
interface Source {
  notices: () => Notice[];
  clearAll: () => void;
}

/** Every kind of notice, in the order the list shows them. */
const SOURCES: readonly Source[] = [
  { notices: releaseNotices, clearAll: () => releaseStore.acknowledge() },
  { notices: eventNotices, clearAll: () => eventStore.acknowledge(eventStore.newlyVisible()) },
];

export function Notices() {
  // Each redraws this whenever its store changes; the stores themselves are read through `SOURCES`.
  useEventStore();
  useReleaseStore();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Both files once per document, whichever tab it opens on. The Events and Integrations pages ask for the same loads
  // and are handed them.
  useEffect(() => {
    void eventStore.ensureLoaded();
    void releaseStore.ensureLoaded();
  }, []);

  useDismiss(open, () => setOpen(false), root);

  const notices = SOURCES.flatMap((source) => source.notices());
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
                  source.clearAll();
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
                <a
                  href={notice.href}
                  target={notice.external ? '_blank' : undefined}
                  rel={notice.external ? 'noopener' : undefined}
                  onClick={() => {
                    setOpen(false);

                    if (notice.external) {
                      notice.clear();
                    }
                  }}
                >
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
