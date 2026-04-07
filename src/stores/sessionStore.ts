import { create } from 'zustand';
import type { ChatMessage, SourceSnapshot } from '../types/session';

interface SessionStore {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  currentSource: string;
  sourceHistory: SourceSnapshot[];
  messages: ChatMessage[];

  updateSource: (source: string, triggeredBy: string) => void;
  applyProposal: (messageId: string, source: string) => void;
  undoSource: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessionId: crypto.randomUUID(),
  sessionName: 'Untitled Session',
  createdAt: new Date().toISOString(),
  currentSource: `@startuml
[*] --> Idle
Idle --> Active : start
Active --> Idle : stop
Active --> [*]
@enduml`,
  sourceHistory: [],
  messages: [],

  updateSource: (source, triggeredBy) => {
    const snapshot: SourceSnapshot = {
      id: crypto.randomUUID(),
      source: get().currentSource,
      timestamp: new Date().toISOString(),
      triggeredBy,
    };
    set({
      currentSource: source,
      sourceHistory: [...get().sourceHistory, snapshot],
    });
  },

  applyProposal: (messageId, source) => {
    const store = get();
    const snapshot: SourceSnapshot = {
      id: crypto.randomUUID(),
      source: store.currentSource,
      timestamp: new Date().toISOString(),
      triggeredBy: messageId,
    };
    set({
      currentSource: source,
      sourceHistory: [...store.sourceHistory, snapshot],
      messages: store.messages.map((m) =>
        m.id === messageId ? { ...m, applied: true } : m
      ),
    });
  },

  undoSource: () => {
    const history = get().sourceHistory;
    if (history.length === 0) return;
    const last = history[history.length - 1];
    set({
      currentSource: last.source,
      sourceHistory: history.slice(0, -1),
    });
  },
}));
