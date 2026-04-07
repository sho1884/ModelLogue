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
  source: string;
  timestamp: string;
  triggeredBy: string; // "manual" or ChatMessage ID
}

export interface ReviewSession {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  plantUmlSource: string;
  messages: ChatMessage[];
  sourceHistory: SourceSnapshot[];
}
