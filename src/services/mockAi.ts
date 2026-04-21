// Debug-only mock AI. When VITE_USE_MOCK_AI is set, n8nService.chat()
// routes here instead of hitting the real n8n webhook. Documented in
// Doc/test/debug_harness.md.

import type { ChatRequest, ChatResponse } from './n8nService';

const queue: ChatResponse[] = [];

// Small artificial delay so the chat panel's "Waiting for AI response…"
// indicator actually flashes, matching real AI latency perception.
const MOCK_LATENCY_MS = 300;

export function enqueueMockResponses(replies: ChatResponse[]): void {
  queue.push(...replies);
}

export function clearMockQueue(): void {
  queue.length = 0;
}

export function mockQueueLength(): number {
  return queue.length;
}

export async function mockChat(_req: ChatRequest): Promise<ChatResponse> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
  const next = queue.shift();
  if (next) return next;
  return {
    text:
      'Mock AI: no scripted response queued for this call. Start a scenario from the debug panel.',
  };
}

export function isMockMode(): boolean {
  return (
    typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_USE_MOCK_AI === 'true'
  );
}
