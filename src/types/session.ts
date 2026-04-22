// Review session types

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO 8601
  suggestedSource?: string;
  applied?: boolean;
  // SR-033 (v7.2): snapshot of the source that was live the moment this
  // proposal was applied. Frozen so undo/redo elsewhere does not change
  // what THIS proposal's before/after view shows. The before SVG is
  // re-derived from this source on render, not snapshotted, to guarantee
  // (svg, source) consistency for coordinate extraction.
  frozenBeforeSource?: string;
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
  // SR-073 (v7.5): identifies which ModelTypeDefinition backs this session.
  // Fixed at seed time; read at Open saved review to pick parser / tabs.
  // Optional on read for backward compatibility with pre-v7.5 saved files
  // (treated as 'state-machine'); always written on export.
  modelTypeId?: string;
  plantUmlSource: string;
  requirementsText: string; // SR-080 (v7.1): short requirements fragment scoped to this model
  messages: ChatMessage[];
  sourceHistory: SourceSnapshot[];
  markers: import('../types/marker').Marker[];
  outcome: SessionOutcome | null;
}

export interface SeedBundle {
  requirementsText?: string;
  plantUmlSource?: string;
  sessionName?: string;
  // v7.5: external seeds MAY pin a model type. Unknown / missing is
  // treated as the default (currently 'state-machine').
  modelTypeId?: string;
}
