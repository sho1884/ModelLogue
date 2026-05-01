// SR-132 — Slack relay client (read + write directions).
//
// Verifies:
//   - fetchSlackMessages builds the correct URL (with/without `since`)
//   - fetchSlackMessages parses a well-shaped JSON array
//   - fetchSlackMessages drops malformed entries silently
//   - fetchSlackMessages returns [] when the relay is disabled
//   - fetchSlackMessages throws on non-2xx (caller logs and continues)
//   - postToSlack POSTs JSON {source, text} to the write endpoint
//   - postToSlack is a no-op when the relay is disabled
//   - postToSlack swallows errors (fire-and-forget contract)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchSlackMessages,
  postToSlack,
} from '../../src/services/slackRelay';

const KEY = 'VITE_SLACK_RELAY_BASE_URL';
const BASE = 'http://localhost:5678';

let original: string | undefined;

beforeEach(() => {
  original = process.env[KEY];
  delete process.env[KEY];
  vi.restoreAllMocks();
});

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
  vi.restoreAllMocks();
});

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
}): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    statusText: response.statusText ?? '',
    json: response.json ?? (async () => []),
  } as Response);
}

describe('fetchSlackMessages', () => {
  it('returns [] when the relay is disabled (no env)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchSlackMessages(null);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('GETs the read endpoint without a since param when null', async () => {
    process.env[KEY] = BASE;
    const spy = mockFetchOnce({
      ok: true,
      json: async () => [],
    });
    await fetchSlackMessages(null);
    expect(spy).toHaveBeenCalledTimes(1);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/webhook/slack-relay`);
    expect(spy.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('appends ?since=<ts> when since is provided', async () => {
    process.env[KEY] = BASE;
    const spy = mockFetchOnce({
      ok: true,
      json: async () => [],
    });
    await fetchSlackMessages('1709000000.123');
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/webhook/slack-relay?since=1709000000.123`);
  });

  it('parses a well-shaped JSON array', async () => {
    process.env[KEY] = BASE;
    mockFetchOnce({
      ok: true,
      json: async () => [
        {
          ts: '1709000000.111',
          user: 'U01',
          username: 'alice',
          text: 'hello from slack',
        },
        {
          ts: '1709000001.222',
          user: 'U02',
          username: 'bob',
          text: 'second',
        },
      ],
    });
    const result = await fetchSlackMessages(null);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      ts: '1709000000.111',
      user: 'U01',
      username: 'alice',
      text: 'hello from slack',
    });
  });

  it('drops malformed entries silently', async () => {
    process.env[KEY] = BASE;
    mockFetchOnce({
      ok: true,
      json: async () => [
        // Missing username — must be dropped.
        { ts: '1', user: 'U', text: 'no username' },
        // Wrong type — must be dropped.
        { ts: 1, user: 'U', username: 'alice', text: 'numeric ts' },
        // Valid.
        { ts: '2', user: 'U', username: 'bob', text: 'ok' },
      ],
    });
    const result = await fetchSlackMessages(null);
    expect(result).toEqual([
      { ts: '2', user: 'U', username: 'bob', text: 'ok' },
    ]);
  });

  it('throws on non-2xx so the caller can log + back off', async () => {
    process.env[KEY] = BASE;
    mockFetchOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    await expect(fetchSlackMessages(null)).rejects.toThrow(
      /500/
    );
  });

  it('throws when the response is not an array', async () => {
    process.env[KEY] = BASE;
    mockFetchOnce({
      ok: true,
      json: async () => ({ not: 'an array' }),
    });
    await expect(fetchSlackMessages(null)).rejects.toThrow(
      /non-array/
    );
  });
});

describe('postToSlack', () => {
  it('is a no-op when the relay is disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await postToSlack('facilitator', 'hi');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs JSON {source, text} to the write endpoint', async () => {
    process.env[KEY] = BASE;
    const spy = mockFetchOnce({ ok: true, json: async () => ({}) });
    await postToSlack('facilitator', 'hello');
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`${BASE}/webhook/chat-to-slack`);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const body = (init as RequestInit).body;
    expect(JSON.parse(body as string)).toEqual({
      source: 'facilitator',
      text: 'hello',
    });
  });

  it('passes ai source through unchanged', async () => {
    process.env[KEY] = BASE;
    const spy = mockFetchOnce({ ok: true, json: async () => ({}) });
    await postToSlack('ai', 'sure, here is a suggestion');
    const body = JSON.parse(
      (spy.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body).toEqual({
      source: 'ai',
      text: 'sure, here is a suggestion',
    });
  });

  it('does not throw on a non-2xx response (fire-and-forget)', async () => {
    process.env[KEY] = BASE;
    mockFetchOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    });
    // Suppress the warn to keep test output clean.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(postToSlack('facilitator', 'x')).resolves.toBeUndefined();
  });

  it('does not throw on a fetch reject (fire-and-forget)', async () => {
    process.env[KEY] = BASE;
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('network down')
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(postToSlack('ai', 'x')).resolves.toBeUndefined();
  });
});
