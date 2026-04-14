// n8n relay service: send chat messages through an n8n webhook to Gemini.
//
// For phase 1 we only implement a single-turn, non-streaming chat request.
// n8n owns the system prompt, the Gemini API credentials, and the response
// shaping (including PlantUML code-block extraction for future phases).

const N8N_BASE_URL =
  import.meta.env.VITE_N8N_BASE_URL ?? 'http://localhost:5678';

// The chat webhook path is declared in the n8n workflow. We keep it fixed
// here so the UI doesn't depend on per-deployment configuration.
const CHAT_WEBHOOK_PATH = '/webhook/modellogue-chat';

export interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  /** The current PlantUML source (context for the AI). */
  currentSource: string;
  /** Prior turns of the conversation, oldest first. */
  history: ChatHistoryEntry[];
  /** The new message the user is sending. */
  userMessage: string;
  /** Human-readable marker + coordinate context (SR-022). */
  markerContext: string;
  /** EBNF grammar that the AI must follow when generating PlantUML (SR-050). */
  grammarSpec: string;
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

/**
 * Send a chat request to the n8n webhook. Returns the AI response.
 * Throws on network errors or non-2xx responses.
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const url = `${N8N_BASE_URL}${CHAT_WEBHOOK_PATH}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      `n8n chat webhook returned ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as unknown;
  return normalizeResponse(data);
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
