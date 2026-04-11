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
