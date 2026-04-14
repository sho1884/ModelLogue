// Review session types

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO 8601
  suggestedSource?: string;
  applied?: boolean;
}

export interface SourceSnapshot {
  id: string;
  version: number; // 1, 2, 3, ... (monotonically increasing)
  source: string;
  timestamp: string; // ISO 8601
  triggeredBy: string; // "manual" or ChatMessage ID
}

export type SessionOutcomeStatus =
  | 'consensus'   // 合意形成
  | 'postponed'   // モデル修正保留
  | 'spec_issue'; // 要求仕様の不備発覚

export interface SessionOutcome {
  status: SessionOutcomeStatus;
  closedAt: string; // ISO 8601
  note: string | null;
}

export interface ReviewSession {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  plantUmlSource: string;
  messages: ChatMessage[];
  sourceHistory: SourceSnapshot[];
  markers: import('../types/marker').Marker[];
  outcome: SessionOutcome | null;
}
