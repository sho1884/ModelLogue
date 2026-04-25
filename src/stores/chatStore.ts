import { create } from 'zustand';
import type { ChatMessage } from '../types/session';
import { chat as callChat } from '../services/n8nService';
import { useSessionStore } from './sessionStore';
import { useModelStore } from './modelStore';
import { useMarkerStore } from './markerStore';
import { useRequirementsStore } from './requirementsStore';
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

interface ChatStore {
  messages: ChatMessage[];
  isSending: boolean;
  lastError: string | null;

  sendMessage: (content: string) => Promise<void>;
  markApplied: (
    messageId: string,
    snapshot?: { beforeSource: string }
  ) => void;
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

  const history = get()
    .messages.slice(0, -1) // drop the just-inserted user message itself
    .map((m) => ({ role: m.role, content: m.content }));

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
    content: response.text,
    timestamp: now(),
    suggestedSource: typedSuggestedSource ?? response.suggestedSource,
  };

  set({
    messages: [...get().messages, assistantMessage],
    isSending: false,
  });

  // If the AI gave us a block we were able to turn into source, validate
  // that source parses. Only retry when the result failed to produce a
  // model at all; a model with warnings is fine.
  const suggestedForRetry = typedSuggestedSource ?? response.suggestedSource;
  if (suggestedForRetry && remainingRetries > 0) {
    const parseResult = parseForActiveType(suggestedForRetry);
    const parseFailed = !parseResult.model || parseResult.errors.length > 0;
    if (parseFailed) {
      const summary = summariseParseErrors(parseResult.errors);
      // v7.5: the code-block kind differs per model type (```plantuml for
      // state-machine, ```csv for requirement). Ask for the right one so
      // the AI doesn't bounce between the two on the retry.
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

  sendMessage: async (content) => {
    const trimmed = content.trim();
    if (trimmed === '') return;
    if (get().isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: now(),
    };

    set({
      messages: [...get().messages, userMessage],
      isSending: true,
      lastError: null,
    });

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

  clear: () => set({ messages: [], lastError: null }),
}));
