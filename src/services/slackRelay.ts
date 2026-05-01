// SR-135 (v7.8 Phase A): Slack relay configuration entry point.
//
// The relay (SR-132, forthcoming) needs the base URL of the n8n
// instance hosting the slack-relay workflows. We read it from
// VITE_SLACK_RELAY_BASE_URL once at module load. When the variable
// is unset (or empty after trim), getSlackRelayConfig() returns null
// and the relay is considered disabled — chatStore / ChatPanel must
// continue to work normally without a relay.
//
// Related env on the n8n side:
//   SLACK_RELAY_CHANNEL_ID — the bridged channel id (Phase A: fixed
//   for the whole MVP). When that is unset, the n8n workflow's
//   Slack Trigger never fires. The two settings disable the relay
//   from opposite ends; either one being absent is sufficient.
//
// Phase B (per-session channel selection, on-demand bot join, see
// the deferred SR captured in system_requirements.yaml) will add a
// session-keyed relay state to the n8n side. The client-side config
// shape can stay as-is — only the producer / consumer logic in
// SR-132 will need adjustment.

export interface SlackRelayConfig {
  /** Base URL of the n8n instance, no trailing slash. */
  baseUrl: string;
}

function readEnv(key: string): string | undefined {
  // import.meta.env (Vite build/dev) is the primary source. process.env
  // is a fallback for Node-side tests where import.meta.env stubbing
  // does not propagate through dynamic re-imports reliably.
  const meta = import.meta as unknown as { env?: Record<string, string> };
  const fromMeta = meta.env?.[key];
  if (fromMeta !== undefined) return fromMeta;
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Returns the Slack-relay configuration when enabled; otherwise null
 * (relay is disabled — chatStore behaves as a facilitator-only +
 * AI chat). A relay endpoint is "enabled" iff the env var resolves
 * to a non-empty trimmed string.
 *
 * Trailing slashes on the URL are stripped so callers can append
 * paths (`${baseUrl}/webhook/slack-relay`) without double slashes.
 */
export function getSlackRelayConfig(): SlackRelayConfig | null {
  const raw = readEnv('VITE_SLACK_RELAY_BASE_URL');
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const baseUrl = trimmed.replace(/\/+$/, '');
  return { baseUrl };
}

/**
 * Convenience predicate so callers can short-circuit polling /
 * postMessage without unpacking the config object first.
 */
export function isSlackRelayEnabled(): boolean {
  return getSlackRelayConfig() !== null;
}

// SR-132 — Relay client.
//
// fetchSlackMessages(): GET /webhook/slack-relay[?since=<ts>] on the
// configured n8n base URL. Returns the buffered Slack messages newer
// than `since`. When the relay is disabled (no config) returns an
// empty list — callers do not need to special-case the disabled
// state.
//
// postToSlack(): POST /webhook/chat-to-slack with the speaker source
// and text. Fire-and-forget from the caller's perspective: when the
// relay is disabled or the request fails, the function logs and
// resolves cleanly so the local chat experience is never blocked
// (NFR-081 failure-mode contract).

/** Shape of one buffered Slack message returned by the read endpoint. */
export interface RelayedSlackMessage {
  /** Slack message ts (e.g. "1709000000.123456"). Used as the dedup key. */
  ts: string;
  /** Slack user id (e.g. "U01ABCDE"). Useful for future avatar lookup. */
  user: string;
  /** Display name resolved by the relay workflow. */
  username: string;
  /** Message body text. */
  text: string;
}

const READ_PATH = '/webhook/slack-relay';
const WRITE_PATH = '/webhook/chat-to-slack';

/**
 * Polls the relay for messages newer than `since`. Pass `null` for the
 * first call to receive the current buffer; pass the latest seen ts on
 * subsequent calls to fetch only the delta. When the relay is disabled
 * (config null), returns [] without making a request.
 *
 * Throws on transport / non-2xx so the caller can decide whether to
 * back off or surface a status. Polling consumers SHOULD log and
 * continue on error — never tear down the chat pane (NFR-081).
 */
export async function fetchSlackMessages(
  since: string | null
): Promise<RelayedSlackMessage[]> {
  const config = getSlackRelayConfig();
  if (config === null) return [];
  const url = new URL(config.baseUrl + READ_PATH);
  if (since !== null && since !== '') {
    url.searchParams.set('since', since);
  }
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    throw new Error(
      `Slack relay read failed: ${res.status} ${res.statusText}`
    );
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Slack relay read returned a non-array payload');
  }
  // Only keep entries that have the four required string fields.
  // Anything malformed is dropped silently — the relay is the source
  // of truth for shape, but we do not want one bad entry to poison
  // the whole batch.
  return data.filter(
    (m): m is RelayedSlackMessage =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as RelayedSlackMessage).ts === 'string' &&
      typeof (m as RelayedSlackMessage).user === 'string' &&
      typeof (m as RelayedSlackMessage).username === 'string' &&
      typeof (m as RelayedSlackMessage).text === 'string'
  );
}

/**
 * Posts a facilitator or AI message to the bridged Slack channel via
 * the relay. Fire-and-forget: when the relay is disabled or the
 * request fails, this function logs and resolves cleanly. The local
 * chat continues to function regardless (NFR-081 failure-mode).
 */
export async function postToSlack(
  source: 'facilitator' | 'ai',
  text: string
): Promise<void> {
  const config = getSlackRelayConfig();
  if (config === null) return;
  const url = config.baseUrl + WRITE_PATH;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, text }),
    });
    if (!res.ok) {
      console.warn(
        `Slack relay post failed: ${res.status} ${res.statusText}`
      );
    }
  } catch (err) {
    console.warn(
      'Slack relay post failed: ' +
        (err instanceof Error ? err.message : String(err))
    );
  }
}
