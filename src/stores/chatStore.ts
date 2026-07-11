import { create } from 'zustand';
import type { ChatMessage } from '../types/session';
import type { DroppedRequirement } from '../modelTypes/requirement/applyGuardrail';
import {
  chat as callChat,
  serializeHistoryForPrompt,
} from '../services/n8nService';
import {
  postToSlack,
  type RelayedSlackMessage,
} from '../services/slackRelay';
import { useSessionStore } from './sessionStore';
import { useModelStore } from './modelStore';
import { useMarkerStore } from './markerStore';
import { useRequirementsStore } from './requirementsStore';
import { useUiStore } from './uiStore';
import { buildMarkerContext } from '../services/markerContext';
import stateMachineGrammar from '../grammars/stateDiagram.ebnf?raw';
import processGrammar from '../grammars/processDiagram.ebnf?raw';
import {
  getDefaultModelTypeDefinition,
  getModelTypeDefinition,
} from '../modelTypes/registry';
import type { StateMachineModel } from '../modelTypes/state-machine/model';
import type { RequirementModel } from '../modelTypes/requirement/model';
import { modelToRequirementsCsv } from '../modelTypes/requirement/listSerializer';

function activeTypeDefinition() {
  const id = useSessionStore.getState().modelTypeId;
  return getModelTypeDefinition(id) ?? getDefaultModelTypeDefinition();
}

function parseForActiveType(source: string): {
  model: unknown | null;
  errors: { line: number; message: string }[];
} {
  return activeTypeDefinition().parse(source);
}

// SR-030 (v7.2): cap the auto-reask loop so a misbehaving AI can't spin
// the chat forever. 2 retries ≈ 3 total attempts which comfortably
// covers the common case.
const MAX_AUTO_RETRIES = 2;

// SR-130: pending apply that has been paused on the review-evidence
// guardrail. messageId identifies the proposed AI csv reply; dropped
// is the (id, statement) list the modal renders. The apply pipeline
// reads this state to decide whether to show the modal; "Apply
// anyway" / "Cancel" actions clear it.
export interface PendingApplyGuardrail {
  messageId: string;
  dropped: DroppedRequirement[];
}

interface ChatStore {
  messages: ChatMessage[];
  isSending: boolean;
  lastError: string | null;
  pendingGuardrail: PendingApplyGuardrail | null;

  sendMessage: (content: string) => Promise<void>;
  markApplied: (
    messageId: string,
    snapshot?: { beforeSource: string }
  ) => void;
  setPendingGuardrail: (pending: PendingApplyGuardrail | null) => void;
  // SR-132: append a Slack-origin message into the chat pane. Called
  // by the polling consumer (SR-132c) when the relay returns a new
  // batch. Dedups on `slack:<ts>` so reloads do not duplicate.
  appendRelayedSlackMessage: (msg: RelayedSlackMessage) => void;
  clear: () => void;
}

function now(): string {
  return new Date().toISOString();
}

// SR-030 (v7.2): pick the language the AI should respond in. Honors the
// requirements text first (the model's reason for existing); falls back
// to the user's first message; defaults to English.
function detectResponseLanguage(
  requirementsText: string,
  history: { role: string; content: string }[],
  userMessage: string
): 'ja' | 'en' {
  const isJapanese = (s: string) =>
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(s);

  if (requirementsText.trim() !== '') {
    return isJapanese(requirementsText) ? 'ja' : 'en';
  }
  const firstUser = history.find((m) => m.role === 'user');
  if (firstUser) {
    return isJapanese(firstUser.content) ? 'ja' : 'en';
  }
  return isJapanese(userMessage) ? 'ja' : 'en';
}

// Summarise parse errors for a follow-up prompt. Keeps it terse so the
// AI doesn't confuse the error trace with the model intent.
function summariseParseErrors(
  errors: { line: number; message: string }[]
): string {
  return errors
    .slice(0, 5)
    .map((e) => `line ${e.line}: ${e.message}`)
    .join('; ');
}

// Runs one user→assistant round-trip. If the response's suggestedSource
// is unparseable AND we still have retry budget, injects a follow-up
// user message pointing out the errors and recurses.
async function sendAndAutoReask(
  userContent: string,
  remainingRetries: number,
  set: (partial: Partial<{ messages: ChatMessage[]; isSending: boolean }>) => void,
  get: () => { messages: ChatMessage[] }
): Promise<void> {
  const currentSource = useSessionStore.getState().currentSource;
  const modelTypeId = useSessionStore.getState().modelTypeId as
    | 'state-machine'
    | 'requirement'
    | 'process';
  const { model, coordinates } = useModelStore.getState();
  const { markers } = useMarkerStore.getState();
  // markerContext's position lookup only knows state-machine shape today;
  // requirement sessions pass null so no position context is built.
  const stateMachineModel =
    model && 'states' in (model as object)
      ? (model as StateMachineModel)
      : null;
  const markerContext = buildMarkerContext(
    markers,
    coordinates,
    stateMachineModel
  );
  const requirementsText = useRequirementsStore.getState().requirementsText;

  // v7.5: for requirement-type sessions, also send the CURRENT Requirement
  // list as CSV so n8n can hand that (not the PlantUML buffer) to the AI.
  // The AI works in CSV space per ADR-012 — the diagram is a
  // mechanically-derived visualization.
  const requirementsCsv =
    modelTypeId === 'requirement' && model && 'requirements' in (model as object)
      ? modelToRequirementsCsv(model as RequirementModel)
      : undefined;

  // SR-133: history is fed through serializeHistoryForPrompt so Slack-
  // origin messages arrive at the AI prefixed with [Slack: <name>].
  // The system prompt in n8n teaches the AI what those prefixes mean
  // and how to mediate across participants.
  const history = serializeHistoryForPrompt(
    get().messages.slice(0, -1) // drop the just-inserted user message itself
  );

  const responseLanguage = detectResponseLanguage(
    requirementsText,
    history,
    userContent
  );

  // v7.6: grammar spec switches per session type. state-machine keeps
  // stateDiagram.ebnf, process uses processDiagram.ebnf, requirement
  // sessions don't consult a grammar file (CSV exchange — rules live
  // inline in the system prompt).
  const grammarSpec =
    modelTypeId === 'process'
      ? processGrammar
      : modelTypeId === 'requirement'
        ? ''
        : stateMachineGrammar;

  const response = await callChat({
    modelTypeId,
    currentSource,
    requirementsCsv,
    history,
    userMessage: userContent,
    markerContext,
    grammarSpec,
    requirementsText: requirementsText || undefined,
    responseLanguage,
  });

  // v7.5: let the active model-type definition own extraction. For
  // state-machine this is extractPlantUmlBlock (the same behavior as
  // the transport-layer fallback); for requirement it extracts a
  // ```csv block, parses it, and regenerates PlantUML from the model.
  const def = activeTypeDefinition();
  const typedSuggestedSource =
    def.extractSuggestedSource(response.text, currentSource) ?? undefined;

  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    source: 'ai',
    content: response.text,
    timestamp: now(),
    suggestedSource: typedSuggestedSource ?? response.suggestedSource,
  };

  set({
    messages: [...get().messages, assistantMessage],
    isSending: false,
  });

  // SR-132: relay the AI's reply to Slack so remote participants
  // see it. Fire-and-forget — postToSlack is a no-op when the relay
  // is disabled, and logs without throwing on failure (NFR-081).
  void postToSlack('ai', response.text);

  // Auto-reask is for ONE case only:
  //   - the AI returned a code block AND our parser rejects it.
  //
  // We deliberately do NOT auto-reask when the AI replied with prose
  // only (no code block). Prose responses are a normal part of multi-
  // turn chat — the AI may be asking a clarifying question, suggesting
  // an approach for the user to agree with, or pointing out a trade-
  // off. Forcing a code-block on every reply would turn ModelLogue
  // into a one-shot edit conveyor belt and remove the reviewer's
  // ability to discuss intent before committing changes.
  //
  // When the user is ready for the AI to actually produce / revise
  // the model, they say so in chat (e.g. "OK, apply that" or "Show
  // me the PlantUML now"). The AI's next reply will then carry a
  // code block, which apply / parse / auto-marker pipeline picks up
  // normally.
  const suggestedForRetry = typedSuggestedSource ?? response.suggestedSource;
  if (suggestedForRetry && remainingRetries > 0) {
    const parseResult = parseForActiveType(suggestedForRetry);
    const parseFailed =
      !parseResult.model || parseResult.errors.length > 0;
    if (parseFailed) {
      const summary = summariseParseErrors(parseResult.errors);
      const retryBlockLabel =
        modelTypeId === 'requirement' ? '```csv' : '```plantuml';
      const retryContent =
        (responseLanguage === 'ja'
          ? 'その応答は ModelLogue のサブセット/形式ではパースできませんでした。エラー: '
          : "That reply did not parse under ModelLogue's supported subset/format. Errors: ") +
        summary +
        (responseLanguage === 'ja'
          ? `。定義に従って、もう一度だけ ${retryBlockLabel} コードブロックを出し直してください。`
          : `. Please regenerate — emit only one ${retryBlockLabel} code block that conforms to the spec you were given.`);
      const retryUser: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        source: 'facilitator',
        content: retryContent,
        timestamp: now(),
      };
      set({
        messages: [...get().messages, retryUser],
        isSending: true,
      });
      await sendAndAutoReask(retryContent, remainingRetries - 1, set, get);
    }
  }
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isSending: false,
  lastError: null,
  pendingGuardrail: null,

  sendMessage: async (content) => {
    const trimmed = content.trim();
    if (trimmed === '') return;
    if (get().isSending) return;
    // SR-136 backstop: never send AI/relay traffic for a non-operator, even if
    // a caller (composer, Generate Model) reaches here. The identity gate is
    // insurance; the real boundary is server-side (SR-137).
    if (!useUiStore.getState().aiAvailable) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      source: 'facilitator',
      content: trimmed,
      timestamp: now(),
    };

    set({
      messages: [...get().messages, userMessage],
      isSending: true,
      lastError: null,
    });

    // SR-132: relay the facilitator's turn to Slack so remote
    // participants see it. The auto-reask follow-up message
    // (sendAndAutoReask -> retryUser) is intentionally NOT relayed
    // because it is system-injected, not human-spoken — Slack
    // participants would otherwise see noise that no human typed.
    void postToSlack('facilitator', trimmed);

    try {
      await sendAndAutoReask(trimmed, MAX_AUTO_RETRIES, set, get);
    } catch (e) {
      set({
        isSending: false,
        lastError:
          e instanceof Error ? e.message : 'Chat request failed',
      });
    }
  },

  markApplied: (messageId, snapshot) => {
    set({
      messages: get().messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              applied: true,
              frozenBeforeSource: snapshot?.beforeSource,
            }
          : m
      ),
    });
  },

  setPendingGuardrail: (pending) => set({ pendingGuardrail: pending }),

  // SR-132: ingest a Slack-origin message. Dedup key is `slack:<ts>`
  // so reload / replay does not produce duplicates. Slack ts is in
  // seconds.microseconds form ("1709000000.123456"), converted to
  // ISO 8601 for the message timestamp.
  appendRelayedSlackMessage: (msg) => {
    const id = `slack:${msg.ts}`;
    const existing = get().messages;
    if (existing.some((m) => m.id === id)) return;
    const tsSeconds = parseFloat(msg.ts);
    const timestamp = Number.isFinite(tsSeconds)
      ? new Date(tsSeconds * 1000).toISOString()
      : now();
    const slackMessage: ChatMessage = {
      id,
      role: 'user',
      source: `slack:${msg.username}`,
      content: msg.text,
      timestamp,
    };
    set({ messages: [...existing, slackMessage] });
  },

  clear: () =>
    set({ messages: [], lastError: null, pendingGuardrail: null }),
}));
