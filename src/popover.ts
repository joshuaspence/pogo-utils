/**
 * What the top bar's two menus share: a click anywhere outside one, or Escape, closes it, the way any menu closes. One
 * hook rather than a copy in each, so the notifications list and the settings panel cannot come to close differently.
 */

import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';

/** Close the menu under `root` on a pointer down outside it or on Escape, for as long as it is open. */
export function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const away = (event: PointerEvent) => {
      if (!(event.target instanceof Node && root.current?.contains(event.target))) {
        close();
      }
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);

    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
}
