// SR-133 — serializeHistoryForPrompt.
//
// Verifies:
//   - facilitator and AI messages pass through unchanged
//   - Slack-origin messages get a [Slack: <name>] content prefix
//   - the role field stays as-is (Slack participants are role='user')
//   - pre-v7.8 messages (no source field) are still treated correctly
//     via effectiveSource fallback (user → facilitator, assistant → ai)

import { describe, it, expect } from 'vitest';
import { serializeHistoryForPrompt } from '../../src/services/n8nService';
import type { ChatMessage } from '../../src/types/session';

function msg(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm',
    role: 'user',
    content: 'x',
    timestamp: '2026-05-01T00:00:00Z',
    ...partial,
  };
}

describe('serializeHistoryForPrompt', () => {
  it('passes facilitator messages through unchanged', () => {
    const result = serializeHistoryForPrompt([
      msg({ role: 'user', source: 'facilitator', content: 'hello' }),
    ]);
    expect(result).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('passes AI messages through unchanged', () => {
    const result = serializeHistoryForPrompt([
      msg({ role: 'assistant', source: 'ai', content: 'hi back' }),
    ]);
    expect(result).toEqual([{ role: 'assistant', content: 'hi back' }]);
  });

  it('prefixes Slack-origin messages with [Slack: <name>]', () => {
    const result = serializeHistoryForPrompt([
      msg({
        role: 'user',
        source: 'slack:alice',
        content: 'we could combine R1 and R2',
      }),
    ]);
    expect(result).toEqual([
      { role: 'user', content: '[Slack: alice] we could combine R1 and R2' },
    ]);
  });

  it('keeps the role as-is for Slack participants (user role)', () => {
    const result = serializeHistoryForPrompt([
      msg({ role: 'user', source: 'slack:bob', content: 'nope' }),
    ]);
    expect(result[0].role).toBe('user');
  });

  it('handles pre-v7.8 messages without a source field', () => {
    const result = serializeHistoryForPrompt([
      msg({ role: 'user', content: 'old user msg' }),
      msg({ role: 'assistant', content: 'old assistant msg' }),
    ]);
    expect(result).toEqual([
      { role: 'user', content: 'old user msg' },
      { role: 'assistant', content: 'old assistant msg' },
    ]);
  });

  it('mixes all three speaker classes in order', () => {
    const result = serializeHistoryForPrompt([
      msg({ id: '1', role: 'user', source: 'facilitator', content: 'open' }),
      msg({
        id: '2',
        role: 'assistant',
        source: 'ai',
        content: 'reading the spec',
      }),
      msg({
        id: '3',
        role: 'user',
        source: 'slack:alice',
        content: 'try merging R1 R2',
      }),
      msg({
        id: '4',
        role: 'user',
        source: 'slack:bob',
        content: 'agree',
      }),
      msg({
        id: '5',
        role: 'user',
        source: 'facilitator',
        content: 'OK lets do it',
      }),
    ]);
    expect(result).toEqual([
      { role: 'user', content: 'open' },
      { role: 'assistant', content: 'reading the spec' },
      { role: 'user', content: '[Slack: alice] try merging R1 R2' },
      { role: 'user', content: '[Slack: bob] agree' },
      { role: 'user', content: 'OK lets do it' },
    ]);
  });

  it('returns an empty array for an empty input', () => {
    expect(serializeHistoryForPrompt([])).toEqual([]);
  });
});
