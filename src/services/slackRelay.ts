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
