// n8n relay service: send chat messages through an n8n webhook to Gemini.
//
// For phase 1 we only implement a single-turn, non-streaming chat request.
// n8n owns the system prompt, the Gemini API credentials, and the response
// shaping (including PlantUML code-block extraction for future phases).

import { effectiveSource, type ChatMessage } from '../types/session';

const N8N_BASE_URL =
  import.meta.env.VITE_N8N_BASE_URL ?? 'http://localhost:5678';

// The chat webhook path is declared in the n8n workflow. We keep it fixed
// here so the UI doesn't depend on per-deployment configuration.
const CHAT_WEBHOOK_PATH = '/webhook/modellogue-chat';

export interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * SR-133: turn the chatStore's ChatMessage[] into the {role, content}
 * shape n8n / Gemini consume, with Slack-origin messages prefixed by
 * [Slack: <name>] so the AI can mediate across participants. The
 * system prompt in n8n is what instructs the AI to read those
 * prefixes; this function only adds them.
 *
 * Facilitator and AI messages pass through unchanged. The role stays
 * 'user' / 'assistant' regardless of source — Slack participants are
 * inputs the AI responds to, same as the facilitator.
 */
export function serializeHistoryForPrompt(
  messages: ChatMessage[]
): ChatHistoryEntry[] {
  return messages.map((m) => {
    const source = effectiveSource(m);
    const content = source.startsWith('slack:')
      ? `[Slack: ${source.slice('slack:'.length)}] ${m.content}`
      : m.content;
    return { role: m.role, content };
  });
}

export interface ChatRequest {
  /**
   * Session model type (v7.5). Drives prompt branching in n8n: the
   * state-machine path feeds the AI the PlantUML source + EBNF; the
   * requirement path feeds the AI the requirement-list CSV and expects
   * a CSV reply (ADR-012).
   */
  modelTypeId: 'state-machine' | 'requirement' | 'process';
  /** The current PlantUML source (context for the AI). */
  currentSource: string;
  /**
   * v7.5: for requirement-type sessions, the current Requirement list
   * rendered as SR-113 CSV. The AI works in CSV space here — the
   * PlantUML buffer is a mechanically-generated visualization. Absent
   * for state-machine sessions.
   */
  requirementsCsv?: string;
  /** Prior turns of the conversation, oldest first. */
  history: ChatHistoryEntry[];
  /** The new message the user is sending. */
  userMessage: string;
  /** Human-readable marker + coordinate context (SR-022). */
  markerContext: string;
  /** EBNF grammar that the AI must follow when generating PlantUML (SR-022). */
  grammarSpec: string;
  /** Short requirements fragment scoped to this model (SR-030 / SR-080, v7.1). */
  requirementsText?: string;
  /**
   * Language the AI should respond in (SR-030, v7.2). 'ja' or 'en',
   * derived from the requirements text or the user's first message.
   * The n8n system prompt is expected to honor this so replies stay
   * in one language.
   */
  responseLanguage?: 'ja' | 'en';
}

export interface ChatResponse {
  /** The AI's free-form text response. */
  text: string;
  /**
   * If the AI proposed a PlantUML source change, n8n extracts the
   * ```plantuml code block and puts it here. Absent in phase 1.
   */
  suggestedSource?: string;
}

// Status codes that signal a transient upstream issue (Gemini 503,
// gateway timeouts, etc.). One client-side retry catches the typical
// short capacity blip without making the user re-send.
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 1500;

function isTransientError(err: unknown): boolean {
  // fetch() rejects with TypeError on network failure / CORS / DNS.
  return err instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a chat request to the n8n webhook. Returns the AI response.
 * One automatic retry on transient upstream errors (502/503/504 or
 * network failure); after that, throws with a human-readable message.
 *
 * Debug harness: when VITE_USE_MOCK_AI is set, route through the local
 * mock so tests / scenario replay don't burn real API quota. See
 * Doc/test/debug_harness.md.
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_USE_MOCK_AI === 'true'
  ) {
    const { mockChat } = await import('./mockAi');
    return mockChat(request);
  }
  const url = `${N8N_BASE_URL}${CHAT_WEBHOOK_PATH}`;
  const body = JSON.stringify(request);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (TRANSIENT_STATUSES.has(response.status)) {
        lastError = new Error(
          `n8n returned ${response.status} (upstream is busy). The AI service may be temporarily unavailable.`
        );
        if (attempt === 0) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        // Try to read a short snippet of the error body for context.
        let detail = '';
        try {
          detail = (await response.text()).slice(0, 200);
        } catch {
          /* ignore */
        }
        throw new Error(
          `n8n chat webhook returned ${response.status} ${response.statusText}` +
            (detail ? ` — ${detail}` : '')
        );
      }

      // Read as text first so an empty body / non-JSON response doesn't
      // surface as an opaque "Unexpected end of JSON input".
      const raw = await response.text();
      if (raw.trim() === '') {
        throw new Error(
          'n8n returned an empty response. Check the workflow output (the AI service may have failed silently).'
        );
      }
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        // n8n is sometimes configured to return the AI text directly
        // instead of a JSON object — accept that gracefully.
        data = raw;
      }
      return normalizeResponse(data);
    } catch (err) {
      if (isTransientError(err) && attempt === 0) {
        lastError = err as Error;
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error('n8n chat request failed');
}

/**
 * Accept a few response shapes so the UI does not break if the n8n workflow
 * returns slightly different structures during iteration:
 *   - { text: "...", suggestedSource?: "..." }
 *   - { output: "..." }                       // n8n AI Agent default field
 *   - "plain string"
 *   - { message: "..." }
 */
function normalizeResponse(data: unknown): ChatResponse {
  if (typeof data === 'string') {
    const suggestedSource = extractPlantUmlBlock(data);
    return suggestedSource ? { text: data, suggestedSource } : { text: data };
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const text =
      pickString(obj, 'text') ??
      pickString(obj, 'output') ??
      pickString(obj, 'message') ??
      pickString(obj, 'response') ??
      '';
    // First check if n8n already extracted the source (future: SR-032 in n8n)
    const suggestedSource =
      pickString(obj, 'suggestedSource') ?? extractPlantUmlBlock(text);
    return suggestedSource ? { text, suggestedSource } : { text };
  }
  return { text: '' };
}

function pickString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extract a PlantUML source block from the AI response text.
 *
 * Looks for the first ```plantuml ... ``` fenced code block. If found,
 * returns the content of the block (without the fence markers). Returns
 * undefined if no block is found.
 *
 * Note: SR-032 says this extraction should happen in n8n, but for phase 1
 * we do it here on the frontend. It can be moved to n8n later without
 * changing the ChatResponse interface.
 */
export function extractPlantUmlBlock(text: string): string | undefined {
  const pattern = /```plantuml\s*\n([\s\S]*?)```/;
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Lightweight health check: try to reach the n8n base URL.
 * We don't have a dedicated health endpoint, so we just verify the server
 * responds at all. Any successful HTTP response (even 404) counts.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(N8N_BASE_URL, {
      method: 'GET',
      mode: 'no-cors', // n8n root likely won't have CORS headers
    });
    // With no-cors the response is opaque; we just check that it didn't throw.
    return response !== undefined;
  } catch {
    return false;
  }
}
