import { create } from 'zustand';
import type {
  ChatMessage,
  SourceSnapshot,
  SessionOutcome,
  SessionOutcomeStatus,
  ReviewSession,
} from '../types/session';
import { useMarkerStore } from './markerStore';
import { useChatStore } from './chatStore';

const INITIAL_SOURCE = `@startuml
' Sample: ModelLogue's own review process.
' Uses one-level composite states (per ADR-009) to express the phase structure
' of Antigravity's original diagram.

state "初版生成" as InitialGeneration {
  [*] --> AIGenerate
  state "AIに自動生成を依頼" as AIGenerate
  state "人間が手動で記述" as HumanWrite
  state "初版モデルの完成" as Drafted
  AIGenerate --> Drafted
  HumanWrite --> Drafted
}

state "レビューループ" as ReviewLoop {
  [*] --> Inspecting
  state "モデルの確認・マーカー配置" as Inspecting
  state "AIへの質問・指示" as Asking
  state "AIからの回答・修正提案" as Answering
  state "モデルの修正・更新" as Editing

  Inspecting --> Asking : 気になる点がある
  Asking --> Answering
  Answering --> Editing : 提案を受け入れる
  Editing --> Inspecting
}

state "合意形成" as Agreed
state "モデル修正保留" as Postponed
state "要求仕様の不備発覚" as SpecIssue

[*] --> InitialGeneration : 要求仕様＋文法ルール
InitialGeneration --> ReviewLoop

ReviewLoop --> Agreed : 指摘がすべて解消された
ReviewLoop --> Postponed : 修正案がまとまらない
ReviewLoop --> SpecIssue : 仕様側の矛盾・漏れ等に気づいた

Agreed --> [*]
Postponed --> [*]
SpecIssue --> [*]
@enduml`;

interface SessionStore {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  currentSource: string;
  sourceHistory: SourceSnapshot[];
  messages: ChatMessage[];
  outcome: SessionOutcome | null;

  updateSource: (source: string, triggeredBy: string) => void;
  applyProposal: (messageId: string, source: string) => void;
  undoSource: () => void;
  closeSession: (status: SessionOutcomeStatus, note: string | null) => void;
  exportSession: () => ReviewSession;
}

function nextVersion(history: SourceSnapshot[]): number {
  if (history.length === 0) return 1;
  return history[history.length - 1].version + 1;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessionId: crypto.randomUUID(),
  sessionName: 'Untitled Session',
  createdAt: new Date().toISOString(),
  currentSource: INITIAL_SOURCE,
  sourceHistory: [],
  messages: [],
  outcome: null,

  updateSource: (source, triggeredBy) => {
    const history = get().sourceHistory;
    const snapshot: SourceSnapshot = {
      id: crypto.randomUUID(),
      version: nextVersion(history),
      source: get().currentSource,
      timestamp: new Date().toISOString(),
      triggeredBy,
    };
    set({
      currentSource: source,
      sourceHistory: [...history, snapshot],
    });
  },

  applyProposal: (messageId, source) => {
    const store = get();
    const snapshot: SourceSnapshot = {
      id: crypto.randomUUID(),
      version: nextVersion(store.sourceHistory),
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

  closeSession: (status, note) => {
    set({
      outcome: {
        status,
        closedAt: new Date().toISOString(),
        note,
      },
    });
  },

  exportSession: () => {
    const store = get();
    const chatMessages = useChatStore.getState().messages;
    const markers = useMarkerStore.getState().markers;

    // Build the final source snapshot (the current state = the latest version)
    const finalVersion = nextVersion(store.sourceHistory);
    const allSnapshots: SourceSnapshot[] = [
      ...store.sourceHistory,
      {
        id: crypto.randomUUID(),
        version: finalVersion,
        source: store.currentSource,
        timestamp: new Date().toISOString(),
        triggeredBy: 'export',
      },
    ];

    return {
      id: store.sessionId,
      name: store.sessionName,
      createdAt: store.createdAt,
      updatedAt: new Date().toISOString(),
      plantUmlSource: store.currentSource,
      messages: chatMessages,
      sourceHistory: allSnapshots,
      markers,
      outcome: store.outcome,
    } as ReviewSession;
  },
}));
