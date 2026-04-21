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

// v7.1: session starts empty. Source is seeded via manual paste, bundle
// import (SR-083), or the Generate Model shortcut (SR-082). Once source
// is non-empty, both the source view and the requirements tab lock.
const INITIAL_SOURCE = '';

interface SessionStore {
  sessionId: string;
  sessionName: string;
  createdAt: string;
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
  closeSession: (status: SessionOutcomeStatus, note: string | null) => void;
  exportSession: () => ReviewSession;
  bootstrapFromBundle: (bundle: SeedBundle) => void;
  markModelEstablished: () => void;
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
  redoStack: [],
  messages: [],
  outcome: null,
  hasEstablishedModel: false,

  setSessionName: (name) => set({ sessionName: name }),

  markModelEstablished: () => {
    if (!get().hasEstablishedModel) {
      set({ hasEstablishedModel: true });
    }
  },

  bootstrapFromBundle: (bundle) => {
    // SR-083: replace the session with an externally composed seed.
    // Any new bootstrap clears the redo stack — new branch, new identity.
    if (bundle.sessionName) set({ sessionName: bundle.sessionName });
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
      plantUmlSource: store.currentSource,
      requirementsText,
      messages: chatMessages,
      sourceHistory: allSnapshots,
      markers,
      outcome: store.outcome,
    } as ReviewSession;
  },
}));
