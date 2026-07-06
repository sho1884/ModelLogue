// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useChatStore } from '../../src/stores/chatStore';
import { useMarkerStore } from '../../src/stores/markerStore';
import type { ReviewSession } from '../../src/types/session';

const review = {
  id: 'sess-1',
  name: '注文レビュー',
  modelTypeId: 'state-machine',
  plantUmlSource: '@startuml\n[*] --> A\nA --> [*] : done\n@enduml',
  requirementsText: '注文の状態遷移',
  messages: [
    {
      id: 'm1',
      role: 'user',
      source: 'facilitator',
      content: '作って',
      timestamp: '2026-01-01T00:00:00Z',
    },
    {
      id: 'm2',
      role: 'assistant',
      source: 'ai',
      content: 'どうぞ',
      timestamp: '2026-01-01T00:00:01Z',
      suggestedSource: '@startuml\n[*] --> A\n@enduml',
      applied: true,
      frozenBeforeSource: '',
    },
  ],
  sourceHistory: [
    { id: 's1', version: 1, source: '', timestamp: '2026-01-01T00:00:00Z', triggeredBy: 'm2' },
  ],
  markers: [
    { id: 'k1', color: 'red', geometry: { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 } },
  ],
  outcome: { status: 'postponed', closedAt: '2026-01-01T00:00:02Z', note: null },
} as unknown as ReviewSession;

describe('restoreFromReview (SR-083 — continue the discussion)', () => {
  it('rehydrates conversation, history, markers, model, and reopens editable', () => {
    useSessionStore.getState().restoreFromReview(review);

    // Conversation restored into the canonical chat store (AI context + display).
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['m1', 'm2']);

    const s = useSessionStore.getState();
    expect(s.currentSource).toContain('done'); // model restored
    expect(s.sourceHistory).toHaveLength(1); // version history restored
    expect(useMarkerStore.getState().markers).toHaveLength(1); // markers restored
    expect(s.sessionName).toBe('注文レビュー');

    // Reopened for continuation: not closed, editable REVIEW phase.
    expect(s.outcome).toBeNull();
    expect(s.hasEstablishedModel).toBe(true);
  });
});
