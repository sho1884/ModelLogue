import type { ChatResponse } from '../../services/n8nService';

export interface ScenarioStep {
  /** Appears in the chat log as the user message that drives this step. */
  userMessage: string;
  /**
   * Replies the mock AI will return, in order. Supply more than one to
   * simulate SR-030's auto-reask (first reply is rejected by the parser,
   * the follow-up retry consumes the next reply).
   */
  mockReplies: ChatResponse[];
  /** Delay after the step completes, before starting the next one. */
  pauseMs?: number;
  /** Short explanation rendered in the runner UI. */
  note?: string;
}

export interface Scenario {
  id: string;
  label: string;
  description: string;
  /**
   * v7.5: model type the scenario runs under. Defaults to
   * 'state-machine' so the existing state-machine scenarios keep
   * working without edits. Set to 'requirement' for scenarios that
   * exercise the requirement apply path (mock CSV replies → generator
   * → diagram + auto-markers).
   */
  modelTypeId?: 'state-machine' | 'requirement' | 'process';
  requirementsText?: string;
  steps: ScenarioStep[];
}
