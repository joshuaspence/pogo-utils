/**
 * Which phone the page is open on, for offering only the build that will install there. Read off the user agent rather
 * than off a feature, since what differs is which app store's rules the device lives under, not anything a page can
 * probe.
 *
 * iPadOS has asked for desktop pages since 13 and says `Macintosh` like a Mac does. No Mac has a touch screen, so a
 * `Macintosh` that reports touch points is an iPad. A guess either way can be wrong — a browser can be told to claim
 * anything — which is why whatever reads this keeps a way to show everything.
 */

export type Platform = 'ios' | 'android' | 'other';

/** The two fields read, so a test can hand over any device without a browser. */
export interface Device {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
}

export function detectPlatform({ userAgent, maxTouchPoints }: Device): Platform {
  if (/Android/i.test(userAgent)) {
    return 'android';
  }

  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) {
    return 'ios';
  }

  return 'other';
}

/** The document's own platform, or `other` where there is no navigator to ask. */
export function currentPlatform(): Platform {
  return typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator);
}
