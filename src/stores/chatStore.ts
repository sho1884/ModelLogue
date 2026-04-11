import { create } from 'zustand';
import type { ChatMessage } from '../types/session';
import { chat as callChat } from '../services/n8nService';
import { useSessionStore } from './sessionStore';

interface ChatStore {
  messages: ChatMessage[];
  isSending: boolean;
  lastError: string | null;

  sendMessage: (content: string) => Promise<void>;
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
      const history = get()
        .messages.filter((m) => m.id !== userMessage.id)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await callChat({
        currentSource,
        history,
        userMessage: trimmed,
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

  clear: () => set({ messages: [], lastError: null }),
}));
