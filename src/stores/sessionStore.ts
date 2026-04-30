import { create } from 'zustand';
import type {
  ChatMessage,
  SourceSnapshot,
  SessionOutcome,
  SessionOutcomeStatus,
  ReviewSession,
  SeedBundle,
} from '../types/session';
import { useMarkerStore } from './markerStore';
import { useChatStore } from './chatStore';
import { useRequirementsStore } from './requirementsStore';
import { useUiStore } from './uiStore';
import {
  DEFAULT_MODEL_TYPE_ID,
  getModelTypeDefinition,
} from '../modelTypes/registry';
import { pickBestType } from '../services/crossTypeDiagnosis';

// v7.1: session starts empty. Source is seeded via manual paste, bundle
// import (SR-083), or the Generate Model shortcut (SR-082). Once source
// is non-empty, both the source view and the requirements tab lock.
const INITIAL_SOURCE = '';

interface SessionStore {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  // SR-073 (v7.5): model type chosen at seed time. Locked to the current
  // value once hasEstablishedModel flips to true.
  modelTypeId: string;
  currentSource: string;
  sourceHistory: SourceSnapshot[];
  redoStack: SourceSnapshot[]; // v7.2: SR-035 — Redo counterpart to Undo
  messages: ChatMessage[];
  outcome: SessionOutcome | null;
  // v7.2: SR-001 — flips to true the first time a parseable model exists
  // in this session (SEED → REVIEW phase). One-way; never goes back.
  hasEstablishedModel: boolean;

  updateSource: (source: string, triggeredBy: string) => void;
  applyProposal: (messageId: string, source: string) => void;
  undoSource: () => void;
  redoSource: () => void;
  setSessionName: (name: string) => void;
  // SR-073: switch to another registered model type during SEED. Ignored
  // after REVIEW (hasEstablishedModel=true) and for unknown ids. Resets
  // in-progress seed inputs so the session never holds mixed-type state.
  setModelTypeId: (id: string) => void;
  // SR-126: switch type WITHOUT resetting the source — used by the
  // cross-type parse-diagnosis suggestion banner. The whole point is
  // to re-parse the user's existing source under the suggested type.
  // Same lock as setModelTypeId (no-op after REVIEW or for unknown ids).
  setModelTypeIdKeepingSource: (id: string) => void;
  closeSession: (status: SessionOutcomeStatus, note: string | null) => void;
  exportSession: () => ReviewSession;
  bootstrapFromBundle: (bundle: SeedBundle) => void;
  markModelEstablished: () => void;
}

// SR-083: map an incoming modelTypeId to something the registry knows.
// Unknown ids (future or typo) quietly fall back to the default so the
// app never gets stuck on an unrenderable session.
function resolveModelTypeId(raw: string | undefined): string {
  if (!raw) return DEFAULT_MODEL_TYPE_ID;
  if (getModelTypeDefinition(raw)) return raw;
  return DEFAULT_MODEL_TYPE_ID;
}

function nextVersion(history: SourceSnapshot[]): number {
  if (history.length === 0) return 1;
  return history[history.length - 1].version + 1;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessionId: crypto.randomUUID(),
  sessionName: 'Untitled Session',
  createdAt: new Date().toISOString(),
  modelTypeId: DEFAULT_MODEL_TYPE_ID,
  currentSource: INITIAL_SOURCE,
  sourceHistory: [],
  redoStack: [],
  messages: [],
  outcome: null,
  hasEstablishedModel: false,

  setSessionName: (name) => set({ sessionName: name }),

  setModelTypeId: (id) => {
    const store = get();
    // Lock after REVIEW starts; also silently ignore no-op changes and
    // unknown ids so the selector UI never stores an invalid state.
    if (store.hasEstablishedModel) return;
    const resolved = resolveModelTypeId(id);
    if (resolved === store.modelTypeId) return;
    // Resetting the session is necessary so seed-phase input that was
    // shaped for the previous type doesn't leak into the new one.
    useChatStore.getState().clear();
    useMarkerStore.setState({ markers: [], autoMarkers: [] });
    useRequirementsStore.setState({ requirementsText: '' });
    // The active analysis tab for the previous type may not exist in
    // the new type's analysisTabs (e.g. 'state-event' → requirement).
    // Fall back to the always-present Requirements tab.
    useUiStore.getState().setActiveAnalysisTab('requirements');
    // Seed the source with the new type's default template (e.g. the
    // requirement-diagram preamble) so the buffer is a valid PlantUML
    // source from the first keystroke.
    const def = getModelTypeDefinition(resolved);
    set({
      modelTypeId: resolved,
      currentSource: def?.defaultSeedSource ?? INITIAL_SOURCE,
      sourceHistory: [],
      redoStack: [],
      outcome: null,
    });
  },

  setModelTypeIdKeepingSource: (id) => {
    // SR-126: source-preserving variant of setModelTypeId, used by
    // the cross-type parse-diagnosis switch button. Same locks
    // (REVIEW phase, unknown id, no-op).
    const store = get();
    if (store.hasEstablishedModel) return;
    const resolved = resolveModelTypeId(id);
    if (resolved === store.modelTypeId) return;
    // Switch the analysis tab to the always-present Requirements tab
    // (the previous type's tabs may not exist in the new type).
    useUiStore.getState().setActiveAnalysisTab('requirements');
    // Keep currentSource, sourceHistory, redoStack, outcome,
    // requirementsText, chat, markers as-is — the user is just
    // re-tagging their existing input under a different parser.
    set({ modelTypeId: resolved });
  },

  markModelEstablished: () => {
    if (!get().hasEstablishedModel) {
      set({ hasEstablishedModel: true });
    }
  },

  bootstrapFromBundle: (bundle) => {
    // SR-083: replace the session with an externally composed seed.
    // Any new bootstrap clears the redo stack — new branch, new identity.
    if (bundle.sessionName) set({ sessionName: bundle.sessionName });
    // SR-073 (v7.5): the incoming bundle / saved session MAY carry a
    // modelTypeId; pre-v7.5 files don't. Resolve defensively so unknown
    // ids fall back to the default rather than leaving the UI stuck.
    let resolvedType = resolveModelTypeId(bundle.modelTypeId);
    // SR-129 (v7.7): when the bundle carries no modelTypeId AND has a
    // plantUmlSource, run every registered parser and adopt the
    // unique 0-error winner. Falls through to the default fallback
    // when ambiguous or all-failed; SR-126's banner is then expected
    // to flag the mismatch at parse time.
    if (bundle.modelTypeId === undefined && bundle.plantUmlSource) {
      const detected = pickBestType(bundle.plantUmlSource);
      if (detected !== null) resolvedType = detected;
    }
    if (resolvedType !== get().modelTypeId) {
      // Changing types invalidates the previously-active analysis tab id.
      useUiStore.getState().setActiveAnalysisTab('requirements');
    }
    set({ modelTypeId: resolvedType });
    if (bundle.requirementsText !== undefined) {
      useRequirementsStore.setState({
        requirementsText: bundle.requirementsText,
      });
    }
    if (bundle.plantUmlSource !== undefined) {
      set({
        currentSource: bundle.plantUmlSource,
        sourceHistory: [],
        redoStack: [],
        // hasEstablishedModel will flip when modelStore.parseSource succeeds
      });
    }
  },

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
      redoStack: [], // forward branch invalidated by a new edit
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
      redoStack: [],
      messages: store.messages.map((m) =>
        m.id === messageId ? { ...m, applied: true } : m
      ),
    });
  },

  undoSource: () => {
    const store = get();
    const history = store.sourceHistory;
    if (history.length === 0) return;
    const last = history[history.length - 1];
    const redoSnapshot: SourceSnapshot = {
      id: crypto.randomUUID(),
      version: nextVersion(store.sourceHistory),
      source: store.currentSource,
      timestamp: new Date().toISOString(),
      triggeredBy: 'undo',
    };
    set({
      currentSource: last.source,
      sourceHistory: history.slice(0, -1),
      redoStack: [...store.redoStack, redoSnapshot],
    });
  },

  redoSource: () => {
    const store = get();
    const stack = store.redoStack;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    const undoSnapshot: SourceSnapshot = {
      id: crypto.randomUUID(),
      version: nextVersion(store.sourceHistory),
      source: store.currentSource,
      timestamp: new Date().toISOString(),
      triggeredBy: 'redo',
    };
    set({
      currentSource: next.source,
      sourceHistory: [...store.sourceHistory, undoSnapshot],
      redoStack: stack.slice(0, -1),
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
    const requirementsText = useRequirementsStore.getState().requirementsText;

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
      modelTypeId: store.modelTypeId,
      plantUmlSource: store.currentSource,
      requirementsText,
      messages: chatMessages,
      sourceHistory: allSnapshots,
      markers,
      outcome: store.outcome,
    } as ReviewSession;
  },
}));
