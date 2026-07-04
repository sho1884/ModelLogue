import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { useSessionStore } from './sessionStore';

// SR-080 (v7.1): the short requirements text scoped to the current model.
// Editable ONLY while the text is empty AND no source has been loaded yet.
// Once either is non-empty, the requirements text is locked (read-only)
// for the rest of the session.

export const REQUIREMENTS_SOFT_LIMIT = 4000;
export const REQUIREMENTS_HARD_LIMIT = 8000;

interface RequirementsStore {
  requirementsText: string;

  setRequirementsText: (text: string) => void;
  isSeedable: () => boolean;
  characterCount: () => number;
}

// Explicit type annotation breaks the self-referential inference across the
// requirementsStore <-> sessionStore import cycle (see sessionStore.ts).
export const useRequirementsStore: UseBoundStore<StoreApi<RequirementsStore>> = create<RequirementsStore>((set, get) => ({
  requirementsText: '',

  setRequirementsText: (text) => {
    if (!get().isSeedable()) {
      // Locked — silently ignore (UI should prevent this path; this is a guard)
      return;
    }
    set({ requirementsText: text });
  },

  isSeedable: () => {
    // SR-080 (v7.2): editable until the session enters REVIEW phase
    // (the first time a parseable model has been established).
    return !useSessionStore.getState().hasEstablishedModel;
  },

  characterCount: () => get().requirementsText.length,
}));
