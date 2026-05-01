// SR-134 (v7.8 planned) — ChatMessage source field.
//
// effectiveSource() must:
//   1. respect an explicit `source` if present
//   2. fall back to deriving from `role` for pre-v7.8 saved messages
//      (user → facilitator, assistant → ai)
//   3. accept slack:<name> templated literals as a valid source class

import { describe, it, expect } from 'vitest';
import {
  effectiveSource,
  type ChatMessage,
  type ChatMessageSource,
} from '../../src/types/session';

function msg(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'hi',
    timestamp: '2026-05-01T00:00:00Z',
    ...partial,
  };
}

describe('effectiveSource', () => {
  it('respects an explicit facilitator source', () => {
    expect(effectiveSource(msg({ source: 'facilitator' }))).toBe('facilitator');
  });

  it('respects an explicit ai source', () => {
    expect(effectiveSource(msg({ role: 'assistant', source: 'ai' }))).toBe('ai');
  });

  it('respects an explicit slack:<name> source', () => {
    const m = msg({ role: 'user', source: 'slack:alice' });
    expect(effectiveSource(m)).toBe('slack:alice');
  });

  describe('backward compatibility (no source field)', () => {
    it('derives facilitator from role=user', () => {
      const m = msg({ role: 'user', source: undefined });
      expect(effectiveSource(m)).toBe('facilitator');
    });

    it('derives ai from role=assistant', () => {
      const m = msg({ role: 'assistant', source: undefined });
      expect(effectiveSource(m)).toBe('ai');
    });
  });

  it('accepts the slack:<name> template literal type', () => {
    // Compile-time check: this assignment must type-check.
    const s: ChatMessageSource = 'slack:bob';
    expect(s).toBe('slack:bob');
  });
});
