/**
 * Delivery to a phone through [ntfy](https://ntfy.sh). Published as JSON to the server's root rather than as a body
 * posted to the topic's URL with headers alongside: a header carries ASCII, and a species name does not always fit in
 * it — `Nidoran♀`, `Flabébé`. The JSON form takes the same fields with none of that.
 *
 * The topic is as good as a password on the public server, anyone who knows it being able to read what is sent there,
 * so it is never printed: a failure says the server and why — a status, or the connect error where it never got one —
 * and stops there.
 */

export interface Notification {
  title: string;
  message: string;

  /** ntfy's tags, an emoji shortcode among them drawn ahead of the title. */
  tags: string[];

  /** Where tapping the notification goes. */
  click?: string;

  /** 1 to 5, ntfy's default being 3. */
  priority?: number;
}

export interface Ntfy {
  server: string;
  topic: string;

  /** An access token, for a server or topic that needs one. */
  token?: string;
}

/**
 * Where a JSON publish goes: the server's own root, which is not always the host's. A server behind a reverse proxy
 * under a subpath — `https://example.com/ntfy` — takes it at `https://example.com/ntfy/`, so the path is kept and only
 * given the trailing slash it may have been written without.
 */
export const publishUrl = (server: string): URL => new URL(server.replace(/\/*$/, '/'));

/**
 * The longest one publish may take, connect and answer both. Without it a connect that hangs costs undici's own 10s and
 * a server that accepts and never answers costs minutes, each of them a poll the watcher is not making.
 */
export const PUBLISH_TIMEOUT = 5_000;

/**
 * The connect budget each address family gets when Node races IPv6 against IPv4, raised from its default of 250 ms.
 * `ntfy.sh` is one IPv4 address whose handshake was measured at 312–584 ms, behind a resolver that answers `::` for its
 * AAAA record: the IPv6 leg is refused at once, the IPv4 leg overruns 250 ms, and every publish fails as `fetch failed`
 * over `ETIMEDOUT`. The watcher's script sets it once at start-up, with `net.setDefaultAutoSelectFamilyAttemptTimeout`,
 * so it reaches Live PokeMap's requests too; the narrower undici `Agent` passed as a request's dispatcher would mean
 * depending on undici for the one class the global `fetch` does not expose. It sits well inside
 * {@link PUBLISH_TIMEOUT}, which still bounds the whole publish.
 */
export const CONNECT_ATTEMPT_TIMEOUT = 2_000;

export async function publish(ntfy: Ntfy, notification: Notification, signal?: AbortSignal): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (ntfy.token) {
    headers.Authorization = `Bearer ${ntfy.token}`;
  }

  const response = await fetch(publishUrl(ntfy.server), {
    method: 'POST',
    headers,
    body: JSON.stringify({ topic: ntfy.topic, ...notification }),
    signal: AbortSignal.any([AbortSignal.timeout(PUBLISH_TIMEOUT), ...(signal ? [signal] : [])]),
  });

  // Drained either way, so the connection goes back to the pool rather than waiting on a body nobody reads.
  await response.arrayBuffer();

  if (!response.ok) {
    throw new Error(`ntfy at ${new URL(ntfy.server).host} answered ${response.status} ${response.statusText}`);
  }
}
