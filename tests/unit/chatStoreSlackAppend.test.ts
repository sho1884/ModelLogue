// SR-132 — chatStore.appendRelayedSlackMessage.
//
// Verifies:
//   - appended Slack message gets source='slack:<username>' and the
//     dedup id 'slack:<ts>'
//   - timestamp is derived from the Slack ts (seconds.microseconds
//     → ISO 8601)
//   - appending the same ts twice is a no-op (dedup)

import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../src/stores/chatStore';

beforeEach(() => {
  useChatStore.getState().clear();
});

describe('chatStore.appendRelayedSlackMessage', () => {
  it('appends with source=slack:<username> and id=slack:<ts>', () => {
    useChatStore.getState().appendRelayedSlackMessage({
      ts: '1709000000.111',
      user: 'U01',
      username: 'alice',
      text: 'hello',
    });
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'slack:1709000000.111',
      role: 'user',
      source: 'slack:alice',
      content: 'hello',
    });
  });

  it('derives a sensible ISO 8601 timestamp from the Slack ts', () => {
    useChatStore.getState().appendRelayedSlackMessage({
      ts: '1709000000.123',
      user: 'U01',
      username: 'alice',
      text: 'x',
    });
    const ts = useChatStore.getState().messages[0].timestamp;
    // 1709000000 seconds = 2024-02-26 ish. We just assert it parses
    // back to an epoch close to the input (within 1 second).
    const parsed = Date.parse(ts);
    expect(parsed).toBeGreaterThan(0);
    expect(Math.abs(parsed - 1709000000 * 1000)).toBeLessThan(1000);
  });

  it('dedups on slack:<ts> — appending the same ts twice is a no-op', () => {
    const msg = {
      ts: '1709000000.111',
      user: 'U01',
      username: 'alice',
      text: 'hello',
    };
    useChatStore.getState().appendRelayedSlackMessage(msg);
    useChatStore.getState().appendRelayedSlackMessage(msg);
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it('two different ts values produce two messages', () => {
    useChatStore.getState().appendRelayedSlackMessage({
      ts: '1709000000.111',
      user: 'U01',
      username: 'alice',
      text: 'first',
    });
    useChatStore.getState().appendRelayedSlackMessage({
      ts: '1709000001.222',
      user: 'U02',
      username: 'bob',
      text: 'second',
    });
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].source).toBe('slack:alice');
    expect(messages[1].source).toBe('slack:bob');
  });

  it('falls back to current time when the ts is malformed', () => {
    const before = Date.now();
    useChatStore.getState().appendRelayedSlackMessage({
      ts: 'not-a-number',
      user: 'U01',
      username: 'alice',
      text: 'x',
    });
    const ts = useChatStore.getState().messages[0].timestamp;
    const parsed = Date.parse(ts);
    expect(parsed).toBeGreaterThanOrEqual(before);
  });
});
