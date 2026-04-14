import { create } from 'zustand';
import type { ChatMessage } from '../types/session';
import { chat as callChat } from '../services/n8nService';
import { useSessionStore } from './sessionStore';
import { useModelStore } from './modelStore';
import { useMarkerStore } from './markerStore';
import { buildMarkerContext } from '../services/markerContext';
import grammarSpec from '../grammars/stateDiagram.ebnf?raw';

interface ChatStore {
  messages: ChatMessage[];
  isSending: boolean;
  lastError: string | null;

  sendMessage: (content: string) => Promise<void>;
  markApplied: (messageId: string) => void;
  clear: () => void;
}

function now(): string {
  return new Date().toISOString();
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
      const currentSource = useSessionStore.getState().currentSource;
      const { model, coordinates } = useModelStore.getState();
      const { markers } = useMarkerStore.getState();
      const markerContext = buildMarkerContext(markers, coordinates, model);

      const history = get()
        .messages.filter((m) => m.id !== userMessage.id)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await callChat({
        currentSource,
        history,
        userMessage: trimmed,
        markerContext,
        grammarSpec,
      });

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.text,
        timestamp: now(),
        suggestedSource: response.suggestedSource,
      };

      set({
        messages: [...get().messages, assistantMessage],
        isSending: false,
      });
    } catch (e) {
      set({
        isSending: false,
        lastError:
          e instanceof Error ? e.message : 'Chat request failed',
      });
    }
  },

  markApplied: (messageId) => {
    set({
      messages: get().messages.map((m) =>
        m.id === messageId ? { ...m, applied: true } : m
      ),
    });
  },

  clear: () => set({ messages: [], lastError: null }),
}));
