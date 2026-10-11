/**
 * Delivery to a phone through [ntfy](https://ntfy.sh). Published as JSON to the server's root rather than as a body
 * posted to the topic's URL with headers alongside: a header carries ASCII, and a species name does not always fit in
 * it — `Nidoran♀`, `Flabébé`. The JSON form takes the same fields with none of that.
 *
 * The topic is as good as a password on the public server, anyone who knows it being able to read what is sent there, so
 * it is never printed: a failure says the server and the status and stops there.
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

export async function publish(ntfy: Ntfy, notification: Notification, signal?: AbortSignal): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (ntfy.token) {
    headers.Authorization = `Bearer ${ntfy.token}`;
  }

  const response = await fetch(new URL('/', ntfy.server), {
    method: 'POST',
    headers,
    body: JSON.stringify({ topic: ntfy.topic, ...notification }),
    signal,
  });

  // Drained either way, so the connection goes back to the pool rather than waiting on a body nobody reads.
  await response.arrayBuffer();

  if (!response.ok) {
    throw new Error(`ntfy at ${new URL(ntfy.server).host} answered ${response.status} ${response.statusText}`);
  }
}
